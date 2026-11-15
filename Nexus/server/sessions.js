const { randomUUID, randomInt } = require('node:crypto');
const { attachRecording } = require('./recording');
const { sharedSession, encodeRegistry, decodeRegistry } = require('./sessionSchema');
const { isSessionRequest, isRecord, isProtocolId, takeFinished, SESSION_PROTOCOL_VERSION, RELAY_ID, INITIAL_READINESS, NODE_STATE_TTL_MS, JOIN_BY_CODE } = require('../services/sessionProtocol.ts');

function attachSessions(relay, { storage, codeGenerator = () => randomInt(0, 36 ** 6).toString(36).toUpperCase().padStart(6, '0') }) {
  const sessions = new Map();
  const codes = new Map();
  const identities = new Map();
  const clients = new Map();
  const owners = new Map();
  const stateTimes = { get: (member) => member.stateAt, set: (member, at) => { member.stateAt = at; } };
  let revision = 0, effects = null, queue = Promise.resolve(), recovered = false, degraded = false, fatal = false;
  const replace = (map, values) => { map.clear(); for (const [key, value] of values) map.set(key, value); };
  const emit = (client, text) => {
    const deliver = () => { try { if (client?.readyState === 1 && client.studioIdentity?.expiresAt > Date.now()) client.send(text); } catch { /* A lost socket cannot undo a durable commit. */ } };
    if (effects) effects.push(deliver); else deliver();
  };
  const ready = (async () => {
    const restored = decodeRegistry(await storage.load());
    replace(sessions, restored.sessions); replace(codes, restored.codes); replace(owners, restored.owners);
    revision = restored.revision;
    await storage.commit(revision, encodeRegistry(sessions, owners, revision + 1));
    revision++; recovered = true;
  })();
  void ready.catch(() => {});
  const enqueue = (operation) => {
    const task = queue.catch(() => {}).then(async () => {
      await ready;
      if (fatal) throw new Error('STORE_UNAVAILABLE');
      const previous = structuredClone({ sessions, codes, owners });
      const before = JSON.stringify(encodeRegistry(sessions, owners, revision));
      effects = [];
      try {
        const result = operation();
        const next = encodeRegistry(sessions, owners, revision);
        if (JSON.stringify(next) !== before) {
          next.revision++;
          await storage.commit(revision, next);
          revision++; degraded = false;
        }
        const committedEffects = effects; effects = null;
        for (const deliver of committedEffects) deliver();
        return result;
      } catch (error) {
        effects = null;
        replace(sessions, previous.sessions); replace(codes, previous.codes); replace(owners, previous.owners);
        if (!error.code?.startsWith('AUTH_')) degraded = true;
        if (['STORE_CONFLICT', 'STORE_UNCERTAIN'].includes(error.code)) fatal = true;
        throw error;
      }
    });
    queue = task; return task;
  };
  const wireSession = (s, id) => {
    const wire = sharedSession(s); wire.mediaAngles = mediaFor(s, id);
    for (const member of Object.values(wire.members)) {
      const client = clients.get(member.deviceId);
      member.online = !!member.online && client?.readyState === 1 && client.studioIdentity?.uid === member.uid && client.studioIdentity.expiresAt > Date.now();
      if (member.kind === 'node' && !member.online) member.readiness = { ...INITIAL_READINESS };
    }
    return wire;
  };
  const mediaFor = (s, id) => Object.fromEntries(Object.entries(s.mediaAngles ?? {}).filter(([, angle]) => id === s.controllerId || angle.deviceId === id));
  const send = (client, type, sessionId, payload) => {
    if (client?.readyState === 1) emit(client, JSON.stringify({
      protocolVersion: SESSION_PROTOCOL_VERSION, messageId: randomUUID(), type, sessionId,
      senderId: RELAY_ID, targetId: identities.get(client), sentAt: Date.now(), payload,
    }));
  };
  const pendingFor = (s) => [...s.pending.values()].map((p) => ({ ...p,
    online: clients.get(p.deviceId)?.readyState === 1 && clients.get(p.deviceId).studioIdentity?.uid === p.uid && clients.get(p.deviceId).studioIdentity.expiresAt > Date.now(),
    controllerOnline: wireSession(s, s.controllerId).members[s.controllerId].online,
  }));
  const snapshot = (s, requestId) => {
    for (const id of s.members.keys()) {
      const client = clients.get(id);
      if (client) send(client, 'SESSION_SNAPSHOT', s.sessionId, {
        requestId, session: wireSession(s, id), ...(id === s.controllerId ? { pending: pendingFor(s) } : {}),
      });
    }
  };
  const recording = attachRecording({ clients, stateTimes, snapshot, emit });
  const bind = (client, id) => {
    if (!(client.studioIdentity?.expiresAt > Date.now())) return false;
    if (client.studioIdentity?.deviceId !== id) return false;
    if (owners.get(id) !== client.studioIdentity.uid) return false;
    if (identities.has(client) && identities.get(client) !== id) return false;
    if (clients.has(id) && clients.get(id) !== client) return false;
    identities.set(client, id);
    clients.set(id, client);
    return true;
  };
  const tick = () => enqueue(() => {
    for (const s of sessions.values()) {
      if (s.closedAt) continue;
      for (const member of s.members.values()) if (member.online && clients.get(member.deviceId)?.readyState !== 1) {
        member.online = false; if (member.kind === 'node') { member.readiness = { ...INITIAL_READINESS }; recording.disconnect(s, member.deviceId); }
        snapshot(s, randomUUID());
      }
      recording.tick(s);
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
  });
  const expiry = setInterval(() => tick().catch(() => {}), 1000);
  expiry.unref();
  relay.on('close', () => clearInterval(expiry));
  const core = {
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
          targetId: identities.get(client) || client.studioIdentity?.deviceId || (isProtocolId(m.senderId) ? m.senderId : 'unknown'),
          sentAt: Date.now(), payload: { requestId: isProtocolId(m.messageId) ? m.messageId : 'invalid', code },
        }));
        return true;
      };
      if (!isSessionRequest(m)) return error('INVALID_MESSAGE');
      if (client.readyState !== 1) return true;
      if (m.senderId === RELAY_ID || !bind(client, m.senderId)) return error('IDENTITY_CONFLICT');
      if (m.type === 'SESSION_LIST') {
        const owned = [...sessions.values()].filter((s) => !s.closedAt && s.controllerId === m.senderId && s.members.get(m.senderId)?.uid === client.studioIdentity.uid);
        send(client, 'SESSION_LIST_RESULT', m.sessionId, { requestId: m.messageId, sessionIds: owned.map((s) => s.sessionId) });
        for (const s of owned) send(client, 'SESSION_SNAPSHOT', s.sessionId, { requestId: m.messageId, session: wireSession(s, m.senderId), pending: pendingFor(s) });
        return true;
      }
      if (m.type === 'SESSION_CREATE') {
        if (sessions.has(m.sessionId)) return error('SESSION_EXISTS');
        let code;
        for (let attempt = 0; attempt < 100; attempt++) { code = codeGenerator(); if (!codes.has(code)) break; code = null; }
        if (!code || !/^[A-Z0-9]{6}$/.test(code)) return error('CODE_UNAVAILABLE');
        const s = { sessionId: m.sessionId, controllerId: m.senderId, code, members: new Map(), pending: new Map(), roles: new Map() };
        s.members.set(m.senderId, { uid: client.studioIdentity.uid, online: true, deviceId: m.senderId, nodeId: null, kind: 'controller', role: 'controller' });
        sessions.set(s.sessionId, s);
        codes.set(code, s.sessionId);
        snapshot(s, m.messageId);
        return true;
      }
      if (m.type === 'SESSION_JOIN_REQUEST') {
        const s = sessions.get(codes.get(m.payload.code));
        if (m.sessionId !== JOIN_BY_CODE && (!s || s.sessionId !== m.sessionId)) return error('SESSION_NOT_FOUND');
        if (!s || s.closedAt) return error('INVALID_CODE');
        if (s.members.get(m.senderId)?.online) return error('ALREADY_MEMBER');
        const request = { requestId: m.messageId, deviceId: m.senderId, uid: client.studioIdentity.uid };
        s.pending.set(m.senderId, request);
        const pending = pendingFor(s).find((p) => p.deviceId === m.senderId);
        send(clients.get(s.controllerId), 'SESSION_JOIN_PENDING', s.sessionId, pending);
        send(client, 'SESSION_JOIN_PENDING', s.sessionId, pending);
        return true;
      }
      const s = sessions.get(m.sessionId);
      if (!s) return error('SESSION_NOT_FOUND');
      if (s.members.get(m.senderId)?.uid !== client.studioIdentity.uid) return error('NOT_MEMBER');
      if (s.closedAt && !['SESSION_GET', 'SESSION_CLOSE'].includes(m.type)) return error('SESSION_IS_CLOSED');
      if (m.type === 'MEDIA_STATE') {
        const angle = m.payload;
        if (s.members.get(m.senderId).kind !== 'node' || angle.deviceId !== m.senderId) return error('NODE_REQUIRED');
        if (m.targetId !== s.controllerId) return error('INVALID_TARGET');
        const take = [s.take, ...(s.takeHistory ?? [])].find((t) => t?.takeId === angle.takeId);
        const participant = take?.nodes[m.senderId];
        // Membership now authorizes transport; frozen participation authorizes this original,
        // even after approved rejoin gave the device a different nodeId.
        if (!participant || participant.nodeId !== angle.nodeId) return error('MEDIA_PARTICIPANT_MISMATCH');
        if (participant.capture && (participant.capture.id !== angle.clipId || participant.capture.bytes !== angle.bytes)) return error('MEDIA_CLIP_MISMATCH');
        s.mediaAngles ??= {};
        const key = `${angle.deviceId}:${angle.clipId}`;
        const previous = s.mediaAngles[key];
        if (previous && (previous.takeId !== angle.takeId || previous.nodeId !== angle.nodeId || previous.bytes !== angle.bytes)) return error('MEDIA_CLIP_MISMATCH');
        const next = { ...angle, ...(participant.role ? { role: participant.role } : {}) };
        const signature = (value) => JSON.stringify([value.upload.state, value.upload.publicId ?? null, value.upload.url ?? null, value.upload.error ?? null]);
        if (previous && angle.revision === previous.revision && signature(previous) !== signature(next)) return error('MEDIA_REVISION_CONFLICT');
        if (!previous || angle.revision > previous.revision) s.mediaAngles[key] = next;
        snapshot(s, m.messageId);
        send(client, 'MEDIA_ACCEPTED', s.sessionId, { requestId: m.messageId, angle: s.mediaAngles[key] });
        return true;
      }
      if (s.members.get(m.senderId).kind === 'node' && !s.members.get(m.senderId).online && !['SESSION_GET'].includes(m.type)) return error('REJOIN_REQUIRED');
      if (recording.handle(s, m, error)) return true;
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
        send(client, 'SESSION_SNAPSHOT', s.sessionId, { requestId: m.messageId, session: wireSession(s, m.senderId), ...(m.senderId === s.controllerId ? { pending: pendingFor(s) } : {}) });
        return true;
      }
      if (s.controllerId !== m.senderId) return error('CONTROLLER_REQUIRED');
      if (m.type === 'SESSION_CLOSE') {
        if (!s.closedAt && !takeFinished(s.take)) return error('TAKE_ACTIVE');
        const recipients = new Set([...s.members.keys(), ...s.pending.keys()]);
        if (!s.closedAt) { s.closedAt = Date.now(); s.pending.clear(); for (const member of s.members.values()) { member.online = false; if (member.kind === 'node') member.readiness = { ...INITIAL_READINESS }; } }
        snapshot(s, m.messageId);
        for (const id of recipients) if (clients.has(id)) send(clients.get(id), 'SESSION_CLOSED', s.sessionId, { requestId: m.messageId });
        return true;
      }
      if (m.type === 'ASSIGN_ROLE') {
        const target = s.members.get(m.targetId);
        if (target?.kind !== 'node' || !target.online || clients.get(m.targetId)?.readyState !== 1) return error('INVALID_TARGET');
        const previous = s.roles.get(m.messageId);
        if (previous && (previous.targetId !== m.targetId || previous.role !== m.payload.role)) return error('MESSAGE_ID_CONFLICT');
        if (previous?.expired) return error('ROLE_ACK_TIMEOUT');
        if (previous?.acked) { snapshot(s, m.messageId); return true; }
        if ([...s.roles.entries()].some(([id, command]) => id !== m.messageId && command.targetId === m.targetId && !command.acked && !command.expired)) return error('ROLE_PENDING');
        if (!previous) s.roles.set(m.messageId, { targetId: m.targetId, role: m.payload.role, acked: false, expired: false, expiresAt: Date.now() + 10000 });
        emit(clients.get(m.targetId), JSON.stringify(m));
        return true;
      }
      const pending = s.pending.get(m.targetId);
      if (!pending || pending.requestId !== m.payload.requestId) return error('INVALID_TARGET');
      if (m.type === 'SESSION_JOIN_ACCEPT' && !pendingFor(s).find((p) => p.deviceId === m.targetId)?.online) return error('INVALID_TARGET');
      s.pending.delete(m.targetId);
      if (m.type === 'SESSION_JOIN_REJECT') {
        send(clients.get(m.targetId), 'SESSION_JOIN_REJECTED', s.sessionId, { requestId: pending.requestId });
      } else {
        s.members.set(m.targetId, { uid: pending.uid, online: true, deviceId: m.targetId, nodeId: randomUUID(), kind: 'node', role: 'unassigned', readiness: { ...INITIAL_READINESS } });
      }
      snapshot(s, m.messageId);
      return true;
    },
    disconnect(id) {
      for (const s of sessions.values()) {
        if (s.members.has(id) || s.pending.has(id)) {
          const member = s.members.get(id);
          if (member) { member.online = false; if (member.kind === 'node') { member.readiness = { ...INITIAL_READINESS }; recording.disconnect(s, id); } }
          for (const [messageId, command] of s.roles) if (command.targetId === id) s.roles.delete(messageId);
          snapshot(s, randomUUID());
          for (const p of pendingFor(s)) send(clients.get(p.deviceId), 'SESSION_JOIN_PENDING', s.sessionId, p);
        }
      }
    },
  };
  const unavailable = (client, text) => {
    let m; try { m = JSON.parse(text); } catch { return true; }
    send(client, 'SESSION_ERROR', isProtocolId(m?.sessionId) ? m.sessionId : 'invalid',
      { requestId: isProtocolId(m?.messageId) ? m.messageId : 'invalid', code: fatal ? 'STORE_RECOVERY_REQUIRED' : 'STORE_UNAVAILABLE' });
    return true;
  };
  return {
    ready, isReady: () => recovered && !degraded && !fatal,
    idle: () => queue.catch(() => {}),
    claimDevice(id, uid) { return enqueue(() => {
      if (owners.has(id) && owners.get(id) !== uid) throw Object.assign(new Error('AUTH_DEVICE_OWNER_MISMATCH'), { code: 'AUTH_DEVICE_OWNER_MISMATCH' });
      owners.set(id, uid);
    }); },
    transferDevice(id, previousUid, nextUid) { return enqueue(() => {
      // Only the handshake supplies these UIDs, after verifying BOTH Firebase tokens.
      if (owners.get(id) !== previousUid || previousUid === nextUid || clients.has(id)) {
        throw Object.assign(new Error('AUTH_TRANSFER_DENIED'), { code: 'AUTH_TRANSFER_DENIED' });
      }
      owners.set(id, nextUid);
      for (const s of sessions.values()) {
        const member = s.members.get(id), pending = s.pending.get(id);
        if (member) { member.uid = nextUid; member.online = false; if (member.kind === 'node') member.readiness = { ...INITIAL_READINESS }; }
        if (pending) pending.uid = nextUid;
      }
    }); },
    connect(client) { return enqueue(() => {
      if (client.readyState !== 1) throw Object.assign(new Error('AUTH_CLOSED'), { code: 'AUTH_CLOSED' });
      const sameConnection = clients.get(client.studioIdentity.deviceId) === client;
      if (!bind(client, client.studioIdentity.deviceId)) throw Object.assign(new Error('AUTH_DEVICE_IN_USE'), { code: 'AUTH_DEVICE_IN_USE' });
      for (const s of sessions.values()) if (!s.closedAt) {
        const member = s.members.get(client.studioIdentity.deviceId);
        if (member?.uid !== client.studioIdentity.uid) continue;
        if (member.kind === 'controller') member.online = true;
        else if (!sameConnection) {
          member.online = false; member.readiness = { ...INITIAL_READINESS }; recording.disconnect(s, member.deviceId);
          for (const role of s.roles.values()) if (role.targetId === member.deviceId && !role.acked) role.expired = true;
        }
      }
    }); },
    announce(client) { return enqueue(() => {
      const id = identities.get(client);
      for (const s of sessions.values()) if (!s.closedAt && s.pending.size && (s.controllerId === id || s.pending.has(id))) {
        snapshot(s, randomUUID());
        for (const p of pendingFor(s)) send(clients.get(p.deviceId), 'SESSION_JOIN_PENDING', s.sessionId, p);
      }
    }).catch(() => {}); },
    handle(client, text) { return enqueue(() => core.handle(client, text)).catch(() => unavailable(client, text)); },
    disconnect(client) {
      const id = identities.get(client); identities.delete(client);
      if (!id || clients.get(id) !== client) return Promise.resolve(); clients.delete(id);
      return enqueue(() => core.disconnect(id)).catch(() => {});
    },
  };
}
module.exports = { attachSessions };
