const { readinessReasons, NODE_STATE_TTL_MS } = require('../services/sessionProtocol.ts');

function recordingState(s) {
  if (!s.take) return 'joining';
  const nodes = Object.values(s.take.nodes);
  if (nodes.every((n) => n.phase === 'saved')) return 'completed';
  if (nodes.some((n) => n.error)) return 'failed';
  return s.take.stopMessageId ? 'finishing' : nodes.some((n) => n.phase === 'recording') ? 'recording' : 'preparing';
}
// Session-scoped command journal. Only states and file references travel here.
function attachRecording({ clients, stateTimes, snapshot }) {
  const progressTimes = new WeakMap();
  const deliver = (s, m) => {
    for (const [id, node] of Object.entries(s.take.nodes)) {
      if (!m.payload.targetNodeIds.includes(node.nodeId)) continue;
      const client = clients.get(id);
      if (s.members.get(id)?.nodeId === node.nodeId && client?.readyState === 1) client.send(JSON.stringify({ ...m, targetId: id }));
    }
  };
  return {
    handle(s, m, error) {
      if (!['START_RECORDING', 'STOP_RECORDING', 'RECORDING_ACK', 'RECORDING_STATE'].includes(m.type)) return false;
      s.recordingCommands ??= new Map();
      s.usedTakes ??= new Set();
      if (m.type === 'RECORDING_ACK' || m.type === 'RECORDING_STATE') {
        const command = s.recordingCommands.get(m.payload.requestId);
        const node = s.take?.nodes[m.senderId];
        if (m.targetId !== s.controllerId || !command || !node || s.members.get(m.senderId)?.kind !== 'node' ||
            s.members.get(m.senderId)?.nodeId !== node.nodeId || s.take.takeId !== m.payload.takeId ||
            command.takeId !== m.payload.takeId || !command.targetNodeIds.includes(node.nodeId)) return error('INVALID_RECORDING_REPORT');
        if (m.type === 'RECORDING_ACK') {
          if (m.payload.command !== command.type) return error('INVALID_RECORDING_REPORT');
          node[command.type === 'START_RECORDING' ? 'startReceived' : 'stopReceived'] = true;
        } else {
          if (!node.startReceived || (command.type === 'STOP_RECORDING' && !node.stopReceived)) return error('ACK_REQUIRED');
          if (node.phase !== 'saved') {
            const ranks = { pending: 0, starting: 1, recording: 2, saving: 3, saved: 4 };
            if (node.phase in ranks && m.payload.phase in ranks && ranks[m.payload.phase] < ranks[node.phase]) return error('STALE_RECORDING_STATE');
            Object.assign(node, { phase: m.payload.phase, error: m.payload.error, capture: m.payload.capture, busy: m.payload.busy });
            progressTimes.set(node, Date.now());
          }
          if (!['starting'].includes(m.payload.phase)) command.executed.add(m.senderId);
        }
        command.responded.add(m.senderId);
        snapshot(s, m.messageId);
        return true;
      }
      if (s.controllerId !== m.senderId) return error('CONTROLLER_REQUIRED');
      if (m.targetId) return error('INVALID_TARGET');
      const previous = s.recordingCommands.get(m.messageId);
      const signature = JSON.stringify([m.type, m.payload.takeId, [...m.payload.targetNodeIds].sort()]);
      if (previous) {
        if (previous.signature !== signature) return error('MESSAGE_ID_CONFLICT');
        if (s.take?.takeId === m.payload.takeId) deliver(s, m);
        snapshot(s, m.messageId);
        return true;
      }
      if (m.type === 'START_RECORDING') {
        if (s.usedTakes.has(m.payload.takeId)) return error('TAKE_ID_REUSED');
        if (s.take && Object.values(s.take.nodes).some((n) => n.busy || !['saved', 'error'].includes(n.phase))) return error('TAKE_ACTIVE');
        const targets = [...s.members.values()].filter((n) => m.payload.targetNodeIds.includes(n.nodeId));
        if (targets.length !== m.payload.targetNodeIds.length || targets.some((n) => n.kind !== 'node')) return error('INVALID_TARGET');
        if (targets.some((n) => clients.get(n.deviceId)?.readyState !== 1 || readinessReasons(n.readiness).length ||
            Date.now() - (stateTimes.get(n) ?? 0) >= NODE_STATE_TTL_MS)) return error('NODE_NOT_READY');
        s.take = { takeId: m.payload.takeId, startMessageId: m.messageId, stopMessageId: null,
          nodes: Object.fromEntries(targets.map((n) => [n.deviceId, { nodeId: n.nodeId, phase: 'pending', startReceived: false,
            stopReceived: false, busy: true, error: null, capture: null }])) };
        s.usedTakes.add(m.payload.takeId);
        for (const node of Object.values(s.take.nodes)) progressTimes.set(node, Date.now());
      } else {
        if (!s.take || s.take.takeId !== m.payload.takeId) return error('TAKE_NOT_FOUND');
        const ids = Object.values(s.take.nodes).map((n) => n.nodeId);
        if (ids.length !== m.payload.targetNodeIds.length || ids.some((id) => !m.payload.targetNodeIds.includes(id))) return error('INVALID_TARGET');
        s.take.stopMessageId = m.messageId;
        for (const node of Object.values(s.take.nodes)) node.stopReceived = false;
      }
      s.recordingCommands.set(m.messageId, { signature, type: m.type, takeId: m.payload.takeId,
        targetNodeIds: [...m.payload.targetNodeIds], expiresAt: Date.now() + 15000,
        responded: new Set(), executed: new Set(), notified: new Set() });
      snapshot(s, m.messageId);
      deliver(s, m);
      return true;
    },
    tick(s) {
      if (!s.take) return;
      let changed = false;
      for (const command of s.recordingCommands?.values() ?? []) {
        if (command.takeId !== s.take.takeId || Date.now() < command.expiresAt) continue;
        for (const [id, node] of Object.entries(s.take.nodes)) if (!command.executed.has(id) && !command.notified.has(id) && command.targetNodeIds.includes(node.nodeId)) {
          command.notified.add(id);
          if (node.phase !== 'saved') {
            node.error = command.responded.has(id) ? `${command.type}: ACK recibido sin confirmación de ejecución` : `${command.type}: sin ACK; estado de captura desconocido`;
            changed = true;
          }
        }
      }
      for (const node of Object.values(s.take.nodes)) {
        const elapsed = Date.now() - (progressTimes.get(node) ?? Date.now());
        if (!node.error && ((['pending', 'starting'].includes(node.phase) && elapsed >= 15000) ||
            (node.phase === 'saving' && elapsed >= 60000))) {
          node.error = 'Sin confirmación de ejecución/guardado reciente; revisa el Node y usa STOP local si hace falta';
          changed = true;
        }
      }
      if (changed) snapshot(s, s.take.startMessageId);
    },
    disconnect(s, id) {
      const node = s.take?.nodes[id];
      if (node && node.phase !== 'saved') { node.phase = 'disconnected'; node.busy = true; node.error = 'Node desconectado; usa STOP local en el teléfono'; }
    },
  };
}
module.exports = { attachRecording, recordingState };
