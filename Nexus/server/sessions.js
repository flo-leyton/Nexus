const { randomUUID, randomInt } = require('node:crypto');
const { isSessionRequest, isRecord, isProtocolId, SESSION_PROTOCOL_VERSION, RELAY_ID, INITIAL_READINESS, NODE_STATE_TTL_MS } = require('../services/sessionProtocol.ts');

function attachSessions(relay) {
  const sessions = new Map();
  const codes = new Map();
  const identities = new Map();
  const clients = new Map();
  const stateTimes = new WeakMap();
  const send = (client, type, sessionId, payload) => {
    if (client.readyState === 1) client.send(JSON.stringify({
      protocolVersion: SESSION_PROTOCOL_VERSION, messageId: randomUUID(), type, sessionId,
      senderId: RELAY_ID, targetId: identities.get(client), sentAt: Date.now(), payload,
    }));
  };
  const snapshot = (s, requestId) => {
    for (const id of s.members.keys()) {
      const client = clients.get(id);
      if (client) send(client, 'SESSION_SNAPSHOT', s.sessionId, {
        requestId, session: {
          sessionId: s.sessionId, controllerId: s.controllerId, code: s.code,
          state: 'joining', members: Object.fromEntries(s.members),
        }, ...(id === s.controllerId ? { pending: [...s.pending.values()] } : {}),
      });
    }
  };
  const bind = (client, id) => {
    if (identities.has(client) && identities.get(client) !== id) return false;
    if (clients.has(id) && clients.get(id) !== client) return false;
    identities.set(client, id);
    clients.set(id, client);
    return true;
  };
  const expiry = setInterval(() => {
    for (const s of sessions.values()) {
      for (const [messageId, command] of s.roles) if (!command.acked && !command.expired && Date.now() >= command.expiresAt) {
        command.expired = true;
        const controller = clients.get(s.controllerId);
        if (controller) send(controller, 'SESSION_ERROR', s.sessionId, { requestId: messageId, code: 'ROLE_ACK_TIMEOUT' });
      }
      for (const member of s.members.values()) {
        if (member.kind === 'node' && member.readiness.enginePrepared &&
            Date.now() - (stateTimes.get(member) ?? 0) >= NODE_STATE_TTL_MS) {
          member.readiness = { ...member.readiness, enginePrepared: false, error: 'Estado del Node vencido; sin actualización reciente' };
          snapshot(s, randomUUID());
        }
      }
    }
  }, 1000);
  expiry.unref();
  relay.on('close', () => clearInterval(expiry));
  return {
    handle(client, text) {
      let m;
      // Malformed JSON cannot safely be classified as legacy traffic.
      try { m = JSON.parse(text); } catch { return true; }
      if (!isRecord(m)) return true;
      // Only these existing messages may enter the legacy handlers/broadcast.
      if (['DEVICE_INFO', 'DEVICE_INFO_REQUEST', 'DEVICE_LEFT', 'CAPABILITY_COMMAND'].includes(m.type) &&
          !['protocolVersion', 'sessionId', 'senderId', 'messageId'].some((key) => key in m)) return false;
      const error = (code) => {
        if (client.readyState === 1) client.send(JSON.stringify({
          protocolVersion: SESSION_PROTOCOL_VERSION, messageId: randomUUID(), type: 'SESSION_ERROR',
          sessionId: isProtocolId(m.sessionId) ? m.sessionId : 'invalid', senderId: RELAY_ID,
          targetId: identities.get(client) || (isProtocolId(m.senderId) ? m.senderId : 'unknown'),
          sentAt: Date.now(), payload: { requestId: isProtocolId(m.messageId) ? m.messageId : 'invalid', code },
        }));
        return true;
      };
      if (!isSessionRequest(m)) return error('INVALID_MESSAGE');
      if (m.senderId === RELAY_ID || !bind(client, m.senderId)) return error('IDENTITY_CONFLICT');
      if (m.type === 'SESSION_CREATE') {
        if (sessions.has(m.sessionId)) return error('SESSION_EXISTS');
        let code;
        do { code = randomInt(0, 36 ** 6).toString(36).toUpperCase().padStart(6, '0'); } while (codes.has(code));
        const s = { sessionId: m.sessionId, controllerId: m.senderId, code, members: new Map(), pending: new Map(), roles: new Map() };
        s.members.set(m.senderId, { deviceId: m.senderId, nodeId: null, kind: 'controller', role: 'controller' });
        sessions.set(s.sessionId, s);
        codes.set(code, s.sessionId);
        snapshot(s, m.messageId);
        return true;
      }
      if (m.type === 'SESSION_JOIN_REQUEST') {
        const s = sessions.get(codes.get(m.payload.code));
        if (!s) return error('INVALID_CODE');
        if (s.members.has(m.senderId)) return error('ALREADY_MEMBER');
        if (s.pending.has(m.senderId)) return error('JOIN_PENDING');
        const request = { requestId: m.messageId, deviceId: m.senderId };
        s.pending.set(m.senderId, request);
        send(clients.get(s.controllerId), 'SESSION_JOIN_PENDING', s.sessionId, request);
        send(client, 'SESSION_JOIN_PENDING', s.sessionId, request);
        return true;
      }
      const s = sessions.get(m.sessionId);
      if (!s) return error('SESSION_NOT_FOUND');
      if (!s.members.has(m.senderId)) return error('NOT_MEMBER');
      if (m.type === 'NODE_STATE') {
        const member = s.members.get(m.senderId);
        if (member.kind !== 'node') return error('NODE_REQUIRED');
        if (m.targetId !== s.controllerId) return error('INVALID_TARGET');
        member.readiness = m.payload.readiness;
        stateTimes.set(member, Date.now());
        snapshot(s, m.messageId);
        return true;
      }
      if (m.type === 'SESSION_ROLE_ACK') {
        const command = s.roles.get(m.payload.requestId);
        if (m.targetId !== s.controllerId || !command || command.targetId !== m.senderId) return error('INVALID_TARGET');
        if (command.expired || Date.now() >= command.expiresAt) return error('ROLE_ACK_TIMEOUT');
        if (!command.acked) {
          s.members.get(m.senderId).role = command.role;
          command.acked = true;
        }
        // The snapshot's requestId is the original command ID: confirms this Node's ACK.
        snapshot(s, m.payload.requestId);
        return true;
      }
      if (m.type === 'SESSION_GET') {
        // Snapshot query is delivered only to the requesting member.
        send(client, 'SESSION_SNAPSHOT', s.sessionId, { requestId: m.messageId, session: {
          sessionId: s.sessionId, controllerId: s.controllerId, code: s.code, state: 'joining',
          members: Object.fromEntries(s.members),
        }, ...(m.senderId === s.controllerId ? { pending: [...s.pending.values()] } : {}) });
        return true;
      }
      if (s.controllerId !== m.senderId) return error('CONTROLLER_REQUIRED');
      if (m.type === 'ASSIGN_ROLE') {
        const target = s.members.get(m.targetId);
        if (target?.kind !== 'node' || clients.get(m.targetId)?.readyState !== 1) return error('INVALID_TARGET');
        const previous = s.roles.get(m.messageId);
        if (previous && (previous.targetId !== m.targetId || previous.role !== m.payload.role)) return error('MESSAGE_ID_CONFLICT');
        if (previous?.expired) return error('ROLE_ACK_TIMEOUT');
        if (previous?.acked) { snapshot(s, m.messageId); return true; }
        if ([...s.roles.entries()].some(([id, command]) => id !== m.messageId && command.targetId === m.targetId && !command.acked && !command.expired)) return error('ROLE_PENDING');
        if (!previous) s.roles.set(m.messageId, { targetId: m.targetId, role: m.payload.role, acked: false, expired: false, expiresAt: Date.now() + 10000 });
        clients.get(m.targetId).send(JSON.stringify(m));
        return true;
      }
      const pending = s.pending.get(m.targetId);
      if (!pending || pending.requestId !== m.payload.requestId || !clients.has(m.targetId)) return error('INVALID_TARGET');
      s.pending.delete(m.targetId);
      if (m.type === 'SESSION_JOIN_REJECT') {
        send(clients.get(m.targetId), 'SESSION_JOIN_REJECTED', s.sessionId, { requestId: pending.requestId });
      } else {
        s.members.set(m.targetId, { deviceId: m.targetId, nodeId: randomUUID(), kind: 'node', role: 'unassigned', readiness: { ...INITIAL_READINESS } });
      }
      snapshot(s, m.messageId);
      return true;
    },
    disconnect(client) {
      const id = identities.get(client);
      if (!id) return;
      identities.delete(client);
      clients.delete(id);
      for (const s of sessions.values()) {
        if (s.controllerId === id) {
          for (const deviceId of new Set([...s.members.keys(), ...s.pending.keys()])) {
            const other = clients.get(deviceId);
            if (other) send(other, 'SESSION_CLOSED', s.sessionId, { requestId: randomUUID() });
          }
          sessions.delete(s.sessionId);
          codes.delete(s.code);
        } else if (s.members.delete(id) || s.pending.has(id)) {
          for (const [messageId, command] of s.roles) if (command.targetId === id) s.roles.delete(messageId);
          s.pending.delete(id);
          snapshot(s, randomUUID());
        }
      }
    },
  };
}
module.exports = { attachSessions };
