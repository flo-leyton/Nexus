const { readinessReasons, NODE_STATE_TTL_MS, takeFinished, activeTakes, activeTakeForDevice, sessionTakes, nodeTakePending } = require('../services/sessionProtocol.ts');

function recordingState(s) {
  if (s.closedAt) return 'closed';
  if (!s.take) return 'joining';
  const active = activeTakes(s);
  if (!active.length && (s.take.closed || s.take.interrupted)) return 'failed';
  const nodes = (active.length ? active : [s.take]).flatMap((take) => Object.values(take.nodes));
  if (nodes.some((node) => node.phase === 'recording')) return 'recording';
  if (active.some((take) => take.interrupted)) return 'failed';
  if (nodes.every((n) => n.phase === 'saved')) return 'completed';
  if (nodes.some((n) => n.error)) return 'failed';
  return nodes.some((node) => node.phase === 'saving') || active.some((take) => take.stopMessageId) ? 'finishing' : 'preparing';
}
// Session-scoped command journal. Only states and file references travel here.
function attachRecording({ clients, stateTimes, snapshot, emit = (client, text) => client.send(text) }) {
  const deliver = (s, take, m) => {
    for (const [id, node] of Object.entries(take.nodes)) {
      if (!m.payload.targetNodeIds.includes(node.nodeId)) continue;
      if (!nodeTakePending(take, id, node.nodeId) || (m.type === 'STOP_RECORDING' && node.phase === 'saving')) continue;
      if (node.connectionLost || s.recordingCommands?.get(m.messageId)?.expiredTargets?.has(node.nodeId)) continue;
      const client = clients.get(id);
      if (s.members.get(id)?.nodeId === node.nodeId && s.members.get(id)?.online !== false && client?.readyState === 1) emit(client, JSON.stringify({ ...m, targetId: id }));
    }
  };
  return {
    handle(s, m, error) {
      if (!['START_RECORDING', 'STOP_RECORDING', 'RECORDING_ACK', 'RECORDING_STATE', 'CLOSE_INTERRUPTED_TAKE'].includes(m.type)) return false;
      s.recordingCommands ??= new Map();
      s.usedTakes ??= new Set();
      s.closeCommands ??= new Map();
      const take = sessionTakes(s).find((entry) => entry.takeId === m.payload.takeId);
      if (m.type === 'CLOSE_INTERRUPTED_TAKE') {
        if (s.controllerId !== m.senderId) return error('CONTROLLER_REQUIRED');
        if (m.targetId) return error('INVALID_TARGET');
        if (s.recordingCommands.has(m.messageId) || (s.closeCommands.has(m.messageId) && s.closeCommands.get(m.messageId) !== m.payload.takeId)) return error('MESSAGE_ID_CONFLICT');
        if (!take) return error('TAKE_NOT_FOUND');
        if (take.closed) { s.closeCommands.set(m.messageId, take.takeId); snapshot(s, m.messageId); return true; }
        if (!take.stopMessageId && !take.interrupted) return error('STOP_REQUIRED');
        const unknown = [];
        for (const [id, node] of Object.entries(take.nodes)) {
          if (!node.busy && ['saved', 'error'].includes(node.phase)) continue;
          const member = s.members.get(id);
          if (!node.connectionLost && member?.nodeId === node.nodeId && member.online !== false && clients.get(id)?.readyState === 1) return error('TAKE_PARTICIPANT_ACTIVE');
          // A re-approved participation must also prove it is idle before abandoning the old one.
          if (member?.online !== false && member && (clients.get(id)?.readyState !== 1 || readinessReasons(member.readiness).length ||
              Date.now() - (stateTimes.get(member) ?? 0) >= NODE_STATE_TTL_MS)) return error('NODE_NOT_READY');
          unknown.push(node.nodeId);
        }
        if (!unknown.length) return error('TAKE_NOT_INTERRUPTED');
        take.closed = { messageId: m.messageId, at: Date.now(), unconfirmedNodeIds: unknown };
        s.closeCommands.set(m.messageId, take.takeId);
        snapshot(s, m.messageId);
        return true;
      }
      if (m.type === 'RECORDING_ACK' || m.type === 'RECORDING_STATE') {
        const node = take?.nodes[m.senderId];
        if (node && s.members.get(m.senderId)?.nodeId !== node.nodeId) return error('INVALID_RECORDING_REPORT');
        if (take?.interrupted) return error('TAKE_INTERRUPTED');
        if (take?.closed) return error('TAKE_CLOSED');
        const command = s.recordingCommands.get(m.payload.requestId);
        if (command?.recovered || command?.expiredTargets?.has(node?.nodeId) || node?.connectionLost) return error('COMMAND_EXPIRED');
        if (m.targetId !== s.controllerId || !command || !node || s.members.get(m.senderId)?.kind !== 'node' ||
            s.members.get(m.senderId)?.nodeId !== node.nodeId ||
            command.takeId !== m.payload.takeId || !command.targetNodeIds.includes(node.nodeId)) return error('INVALID_RECORDING_REPORT');
        if (m.type === 'RECORDING_ACK') {
          if (m.payload.command !== command.type) return error('INVALID_RECORDING_REPORT');
          node[command.type === 'START_RECORDING' ? 'startReceived' : 'stopReceived'] = true;
        } else {
          if (!node.startReceived || (command.type === 'STOP_RECORDING' && !command.responded.has(m.senderId))) return error('ACK_REQUIRED');
          if (node.phase !== 'saved' && nodeTakePending(take, m.senderId, node.nodeId)) {
            const ranks = { pending: 0, starting: 1, recording: 2, saving: 3, saved: 4 };
            if (node.phase in ranks && m.payload.phase in ranks && ranks[m.payload.phase] < ranks[node.phase]) return error('STALE_RECORDING_STATE');
            Object.assign(node, { phase: m.payload.phase, error: m.payload.error,
              capture: m.payload.capture ? { id: m.payload.capture.id, bytes: m.payload.capture.bytes } : null, busy: m.payload.busy });
            node.progressAt = Date.now();
          }
          if (!['starting'].includes(m.payload.phase)) command.executed.add(m.senderId);
        }
        command.responded.add(m.senderId);
        snapshot(s, m.messageId);
        return true;
      }
      if (s.controllerId !== m.senderId) return error('CONTROLLER_REQUIRED');
      if (m.targetId) return error('INVALID_TARGET');
      if (take?.interrupted && !take.closed) return error('TAKE_INTERRUPTED');
      if (s.closeCommands.has(m.messageId)) return error('MESSAGE_ID_CONFLICT');
      if (m.type === 'STOP_RECORDING' && (!take || take.closed || (take.takeId !== s.take?.takeId && takeFinished(take)))) return error('TAKE_CLOSED');
      const previous = s.recordingCommands.get(m.messageId);
      const signature = JSON.stringify([m.type, m.payload.takeId, [...m.payload.targetNodeIds].sort()]);
      if (previous) {
        if (previous.signature !== signature) return error('MESSAGE_ID_CONFLICT');
        if (!previous.recovered && take && !takeFinished(take)) deliver(s, take, m);
        snapshot(s, m.messageId);
        return true;
      }
      const expiredTargets = new Set();
      if (m.type === 'START_RECORDING') {
        if (s.usedTakes.has(m.payload.takeId)) return error('TAKE_ID_REUSED');
        const targets = [...s.members.values()].filter((n) => m.payload.targetNodeIds.includes(n.nodeId));
        if (targets.length !== m.payload.targetNodeIds.length || targets.some((n) => n.kind !== 'node')) return error('INVALID_TARGET');
        if (targets.some((node) => activeTakeForDevice(s, node.deviceId))) return error('TAKE_ACTIVE');
        if (targets.some((n) => n.online === false || n.requiresReadyConfirmation || clients.get(n.deviceId)?.readyState !== 1 || readinessReasons(n.readiness).length ||
            Date.now() - (stateTimes.get(n) ?? 0) >= NODE_STATE_TTL_MS)) return error('NODE_NOT_READY');
        if (s.take) (s.takeHistory ??= []).push(s.take);
        s.take = { takeId: m.payload.takeId, startMessageId: m.messageId, stopMessageId: null,
          nodes: Object.fromEntries(targets.map((n) => [n.deviceId, { nodeId: n.nodeId, role: n.role, phase: 'pending', startReceived: false,
            stopReceived: false, busy: true, error: null, capture: null }])) };
        s.usedTakes.add(m.payload.takeId);
        for (const node of Object.values(s.take.nodes)) node.progressAt = Date.now();
      } else {
        const ids = Object.values(take.nodes).map((n) => n.nodeId);
        if (m.payload.targetNodeIds.some((id) => !ids.includes(id))) return error('INVALID_TARGET');
        // Keep the first STOP and all receipt flags; a new ID can retry a real engine failure.
        take.stopMessageId ??= m.messageId;
        for (const [id, node] of Object.entries(take.nodes)) {
          if (!m.payload.targetNodeIds.includes(node.nodeId)) continue;
          const stopping = !node.error && [...s.recordingCommands.values()].some((command) =>
            command.type === 'STOP_RECORDING' && command.takeId === take.takeId &&
            command.targetNodeIds.includes(node.nodeId) && !command.expiredTargets?.has(node.nodeId) &&
            command.expiresAt > Date.now() && !command.recovered);
          if (stopping || node.phase === 'saving' || !nodeTakePending(take, id, node.nodeId)) expiredTargets.add(node.nodeId);
        }
      }
      s.recordingCommands.set(m.messageId, { signature, type: m.type, takeId: m.payload.takeId,
        targetNodeIds: [...m.payload.targetNodeIds], expiresAt: Date.now() + 15000,
        responded: new Set(), executed: new Set(), notified: new Set(), expiredTargets });
      snapshot(s, m.messageId);
      deliver(s, m.type === 'START_RECORDING' ? s.take : take, m);
      return true;
    },
    tick(s) {
      for (const take of activeTakes(s)) {
        if (take.interrupted) continue;
        let changed = false;
        for (const command of s.recordingCommands?.values() ?? []) {
          if (command.takeId !== take.takeId || Date.now() < command.expiresAt) continue;
          for (const [id, node] of Object.entries(take.nodes)) if (!command.executed.has(id) && !command.notified.has(id) && command.targetNodeIds.includes(node.nodeId) && !command.expiredTargets?.has(node.nodeId)) {
            command.notified.add(id);
            if (node.phase !== 'saved') {
              node.error = command.responded.has(id) ? `${command.type}: ACK recibido sin confirmación de ejecución` : `${command.type}: sin ACK; estado de captura desconocido`;
              changed = true;
            }
          }
        }
        for (const node of Object.values(take.nodes)) {
          const elapsed = Date.now() - (node.progressAt ?? Date.now());
          if (!node.error && ((['pending', 'starting'].includes(node.phase) && elapsed >= 15000) ||
              (node.phase === 'saving' && elapsed >= 60000))) {
            node.error = 'Sin confirmación de ejecución/guardado reciente; revisa el Node y usa STOP local si hace falta';
            changed = true;
          }
        }
        if (changed) snapshot(s, take.startMessageId);
      }
    },
    disconnect(s, id) {
      for (const command of s.recordingCommands?.values() ?? []) {
        command.expiredTargets ??= new Set();
        const nodeId = sessionTakes(s).find((take) => take.takeId === command.takeId)?.nodes[id]?.nodeId;
        for (const target of command.targetNodeIds) if (id === s.controllerId || target === nodeId) command.expiredTargets.add(target);
      }
      for (const take of activeTakes(s)) {
        if (id === s.controllerId) {
          take.interrupted ||= { at: Date.now(), reason: 'connection-lost' };
          for (const node of Object.values(take.nodes)) if (node.phase !== 'saved' && !(node.phase === 'error' && !node.busy)) {
            node.phase = 'disconnected'; node.busy = true; node.connectionLost = true; node.capture = null;
            node.error = 'Conexión del Controller interrumpida; resultado local desconocido';
          }
        }
        if (take.interrupted) continue;
        const node = take.nodes[id];
        if (node && node.phase !== 'saved' && !(node.phase === 'error' && !node.busy)) { node.phase = 'disconnected'; node.busy = true; node.connectionLost = true; node.error = 'Node desconectado; resultado local desconocido; usa STOP local en el teléfono'; }
      }
    },
  };
}
module.exports = { attachRecording, recordingState };
