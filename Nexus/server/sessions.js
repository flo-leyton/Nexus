const { randomUUID, randomInt } = require('node:crypto');
const { attachRecording } = require('./recording');
const { createPreviewSignalRouter } = require('./previewSignal');
const { sharedSession, encodeRegistry, decodeRegistry } = require('./sessionSchema');
const { isSessionRequest, isRecord, isProtocolId, activeTakes, sessionTakes, activeTakeForDevice, readinessReasons, SESSION_PROTOCOL_VERSION, RELAY_ID, INITIAL_READINESS, NODE_STATE_TTL_MS, JOIN_BY_CODE } = require('../services/sessionProtocol.ts');

function attachSessions(relay, { storage, previewEnabled = false,
  codeGenerator = () => randomInt(0, 36 ** 6).toString(36).toUpperCase().padStart(6, '0') }) {
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
  const preview = previewEnabled ? createPreviewSignalRouter(clients, emit) : null;
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
  const snapshot = (s, requestId, excludeId) => {
    for (const id of s.members.keys()) {
      if (id === excludeId) continue;
      const client = clients.get(id);
      if (client) send(client, 'SESSION_SNAPSHOT', s.sessionId, {
        requestId, session: wireSession(s, id), ...(id === s.controllerId ? { pending: pendingFor(s) } : {}),
      });
    }
  };
  const recording = attachRecording({ clients, stateTimes, snapshot, emit });
  const photoPending = (request) => request.expiresAt > Date.now() && (!request.result || request.result.status === 'received');
  const resetReady = (member) => {
    member.readiness = { ...INITIAL_READINESS };
    member.readyEpoch = randomUUID(); member.requiresReadyConfirmation = true;
  };
  const markOffline = (s, id) => {
    const member = s.members.get(id);
    if (id === s.controllerId) s.torchRequests?.clear();
    else if (member?.nodeId) s.torchRequests?.delete(member.nodeId);
    if (member) {
      member.online = false; recording.disconnect(s, id);
      if (member.kind === 'node') resetReady(member);
      else for (const node of s.members.values()) if (node.kind === 'node') resetReady(node);
    }
    for (const command of s.roles.values()) if (!command.acked && (id === s.controllerId || command.targetId === id)) command.expired = true;
  };
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
  // Legacy screens have no Session/Node destination. Resolve only a unique,
  // authorized Controller -> single accepted Node pair; never guess from A/B labels.
  const routeLegacyCapability = (client, m, error) => {
    const vibration = m.capability === 'vibration' && m.action === 'vibrate' &&
      Number.isInteger(m.duration) && m.duration >= 1 && m.duration <= 10000;
    const flashlight = m.capability === 'flashlight' && ['flash_on', 'flash_off'].includes(m.action);
    const keys = ['type', 'from', 'target', 'capability', 'action', ...(vibration ? ['duration'] : [])];
    if (m.from !== 'A' || m.target !== 'B' || (!vibration && !flashlight) ||
        Object.keys(m).length !== keys.length || Object.keys(m).some((key) => !keys.includes(key))) return error('INVALID_CAPABILITY_COMMAND');
    const id = client.studioIdentity?.deviceId;
    if (!bind(client, id)) return error('IDENTITY_CONFLICT');
    const candidates = [...sessions.values()].filter((s) => !s.closedAt && s.controllerId === id &&
      s.members.get(id)?.uid === client.studioIdentity.uid && s.members.get(id)?.online);
    if (!candidates.length) return error('CAPABILITY_SESSION_REQUIRED');
    if (candidates.length !== 1) return error('CAPABILITY_SESSION_AMBIGUOUS');
    // Count offline members too: their absence never authorizes selecting someone else.
    const targets = [...candidates[0].members.values()].filter((m) => m.kind === 'node');
    if (targets.length !== 1) return error('CAPABILITY_TARGET_AMBIGUOUS');
    const target = targets[0], recipient = clients.get(target.deviceId);
    if (!target.online || recipient?.readyState !== 1 || recipient.studioIdentity?.uid !== target.uid ||
        owners.get(target.deviceId) !== target.uid || !(recipient.studioIdentity.expiresAt > Date.now())) return error('CAPABILITY_TARGET_UNAVAILABLE');
    emit(recipient, JSON.stringify(m));
    return true;
  };
  const tick = () => enqueue(() => {
    for (const s of sessions.values()) {
      if (s.closedAt) { preview?.forget(s.sessionId); continue; }
      for (const [requestId, request] of s.photoCommands ?? []) {
        if (request.expiresAt <= Date.now() && (!request.result || request.result.status === 'received')) {
          request.result = { requestId, status: 'error', error: 'Guardado sin confirmar. Comprueba el original en el Node.' };
          send(clients.get(s.controllerId), 'PHOTO_RESULT', s.sessionId, { ...request.result, nodeId: request.nodeId });
        }
      }
      for (const [nodeId, request] of s.torchRequests ?? []) {
        if (request.expiresAt <= Date.now()) s.torchRequests.delete(nodeId);
      }
      for (const member of s.members.values()) if (member.online && clients.get(member.deviceId)?.readyState !== 1) {
        markOffline(s, member.deviceId);
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
      // Only presence messages may enter the existing global presence handler.
      if (['DEVICE_INFO', 'DEVICE_INFO_REQUEST', 'DEVICE_LEFT'].includes(m.type) &&
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
      if (m.type === 'CAPABILITY_COMMAND' && !['protocolVersion', 'sessionId', 'senderId', 'messageId'].some((key) => key in m)) {
        return routeLegacyCapability(client, m, error);
      }
      if (!isSessionRequest(m)) return error('INVALID_MESSAGE');
      if (client.readyState !== 1) return true;
      if (m.senderId === RELAY_ID || !bind(client, m.senderId)) return error('IDENTITY_CONFLICT');
      if (m.type === 'SESSION_LIST') {
        const owned = [...sessions.values()].filter((s) => !s.closedAt && s.members.get(m.senderId)?.uid === client.studioIdentity.uid);
        send(client, 'SESSION_LIST_RESULT', m.sessionId, { requestId: m.messageId, sessionIds: owned.map((s) => s.sessionId) });
        for (const s of owned) send(client, 'SESSION_SNAPSHOT', s.sessionId, { requestId: m.messageId, session: wireSession(s, m.senderId), ...(m.senderId === s.controllerId ? { pending: pendingFor(s) } : {}) });
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
        const member = s.members.get(m.senderId);
        if (member?.uid === client.studioIdentity.uid && (member.online || m.sessionId === JOIN_BY_CODE)) {
          // A code can locate an existing membership, but cannot reactivate it.
          send(client, 'SESSION_SNAPSHOT', s.sessionId, { requestId: m.messageId, session: wireSession(s, m.senderId) });
          return true;
        }
        if (member?.online) return error('ALREADY_MEMBER');
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
      if (s.closedAt && !['SESSION_GET', 'SESSION_CLOSE', 'MEDIA_STATE'].includes(m.type)) return error('SESSION_IS_CLOSED');
      if (m.type === 'PREVIEW_SIGNAL') return preview ? preview.route(s, m, client, error) : error('PREVIEW_DISABLED');
      if (m.type === 'SESSION_RESUME') {
        const member = s.members.get(m.senderId);
        if (!member.online) {
          member.online = true;
          if (member.kind === 'node') resetReady(member);
        }
        s.pending.delete(m.senderId);
        snapshot(s, m.messageId);
        return true;
      }
      if (m.type === 'MEDIA_STATE') {
        const angle = m.payload;
        if (s.members.get(m.senderId).kind !== 'node' || angle.deviceId !== m.senderId) return error('NODE_REQUIRED');
        if (m.targetId !== s.controllerId) return error('INVALID_TARGET');
        const take = sessionTakes(s).find((t) => t.takeId === angle.takeId);
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
      if (m.type === 'ZOOM_REPORT') {
        const member = s.members.get(m.senderId);
        if (member.kind !== 'node' || !member.nodeId || m.targetId !== s.controllerId) return error('INVALID_TARGET');
        const controller = clients.get(s.controllerId);
        const identity = controller?.studioIdentity;
        if (identity && identity.uid === s.members.get(s.controllerId)?.uid && identity.expiresAt > Date.now()) {
          send(controller, 'ZOOM_STATE', s.sessionId, { ...m.payload, nodeId: member.nodeId });
        }
        return true;
      }
      if (m.type === 'PHOTO_REPORT') {
        const member = s.members.get(m.senderId);
        const request = s.photoCommands?.get(m.payload.requestId);
        if (m.targetId !== s.controllerId || member.kind !== 'node' || request?.deviceId !== m.senderId || request.nodeId !== member.nodeId) return error('INVALID_TARGET');
        if (m.payload.status === 'saved' && m.payload.photoId !== m.payload.requestId) return error('INVALID_MESSAGE');
        if (!photoPending(request) || (request.result && m.payload.status === 'received')) return true;
        request.result = m.payload;
        send(clients.get(s.controllerId), 'PHOTO_RESULT', s.sessionId, { ...m.payload, nodeId: request.nodeId });
        return true;
      }
      if (m.type === 'START_RECORDING' && m.senderId === s.controllerId && [...(s.photoCommands?.values() ?? [])]
        .some((request) => photoPending(request) && m.payload.targetNodeIds.includes(request.nodeId))) return error('PHOTO_BUSY');
      if (m.type === 'TORCH_ACK') {
        const member = s.members.get(m.senderId);
        const request = s.torchRequests?.get(member.nodeId);
        if (member.kind !== 'node' || m.targetId !== s.controllerId || !request ||
            request.messageId !== m.payload.requestId || request.expiresAt <= Date.now()) return error('INVALID_TARGET');
        s.torchRequests.delete(member.nodeId);
        send(clients.get(s.controllerId), 'TORCH_RESULT', s.sessionId, {
          requestId: request.messageId, nodeId: member.nodeId, enabled: request.enabled, available: m.payload.available,
        });
        return true;
      }
      if (recording.handle(s, m, error)) return true;
      if (m.type === 'NODE_STATE') {
        const member = s.members.get(m.senderId);
        if (member.kind !== 'node') return error('NODE_REQUIRED');
        if (m.targetId !== s.controllerId) return error('INVALID_TARGET');
        if (member.readyEpoch && m.payload.readyEpoch !== member.readyEpoch) return error('READY_CONFIRMATION_REQUIRED');
        if (member.requiresReadyConfirmation && m.payload.readiness.enginePrepared && !m.payload.confirmReady) return error('READY_CONFIRMATION_REQUIRED');
        if (m.payload.confirmReady && (!m.payload.readiness.enginePrepared || m.payload.readiness.cameraPermission !== 'granted' || m.payload.readiness.cameraAvailable !== true || m.payload.readiness.error)) return error('NODE_NOT_READY');
        if (m.payload.confirmReady) member.requiresReadyConfirmation = false;
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
      if (m.type === 'PHOTO_CAPTURE') {
        s.photoCommands ??= new Map();
        const previous = s.photoCommands.get(m.messageId);
        if (previous) {
          if (previous.nodeId !== m.targetId) return error('MESSAGE_ID_CONFLICT');
          if (previous.result) send(client, 'PHOTO_RESULT', s.sessionId, { ...previous.result, nodeId: previous.nodeId });
          return true;
        }
        const target = [...s.members.values()].find((member) => member.kind === 'node' && member.nodeId === m.targetId && member.online);
        const socket = target && clients.get(target.deviceId);
        if (!target || socket?.readyState !== 1 || socket.studioIdentity?.uid !== target.uid ||
            !(socket.studioIdentity.expiresAt > Date.now())) return error('INVALID_TARGET');
        if (target.requiresReadyConfirmation || readinessReasons(target.readiness).length ||
            Date.now() - (stateTimes.get(target) ?? 0) >= NODE_STATE_TTL_MS || activeTakeForDevice(s, target.deviceId)) return error('NODE_NOT_READY');
        if ([...s.photoCommands.values()].some((request) => request.nodeId === target.nodeId && photoPending(request))) return error('PHOTO_BUSY');
        s.photoCommands.set(m.messageId, { nodeId: target.nodeId, deviceId: target.deviceId, expiresAt: Date.now() + 30000 });
        emit(socket, JSON.stringify(m));
        return true;
      }
      if (m.type === 'TORCH_SET' || m.type === 'ZOOM_REQUEST') {
        const target = [...s.members.values()].find((member) =>
          member.kind === 'node' && member.nodeId === m.targetId && member.online);
        const socket = target && clients.get(target.deviceId);
        if (!target || socket?.readyState !== 1 || socket.studioIdentity?.uid !== target.uid ||
            !(socket.studioIdentity.expiresAt > Date.now())) return error('INVALID_TARGET');
        if (m.type === 'TORCH_SET') {
          s.torchRequests ??= new Map();
          s.torchRequests.set(target.nodeId, { messageId: m.messageId, enabled: m.payload.enabled, expiresAt: Date.now() + 5000 });
        }
        emit(socket, JSON.stringify(m));
        return true;
      }
      if (m.type === 'SESSION_CLOSE') {
        if (s.closedAt) {
          send(client, 'SESSION_CLOSED', s.sessionId, { requestId: m.messageId });
          return true;
        }
        if (activeTakes(s).length) return error('TAKE_ACTIVE');
        if ([...(s.photoCommands?.values() ?? [])].some(photoPending)) return error('PHOTO_BUSY');
        const recipients = new Map([...s.pending, ...s.members]);
        s.closedAt = Date.now();
        s.torchRequests?.clear();
        s.pending.clear();
        for (const member of s.members.values()) {
          member.online = false;
          if (member.kind === 'node') resetReady(member);
        }
        snapshot(s, m.messageId);
        for (const [id, recipient] of recipients) {
          const socket = clients.get(id);
          if (socket?.studioIdentity?.uid === recipient.uid) send(socket, 'SESSION_CLOSED', s.sessionId, { requestId: m.messageId });
        }
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
          markOffline(s, id);
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
        if (member.kind === 'controller') {
          if (!sameConnection) markOffline(s, member.deviceId);
          member.online = true;
        }
        else if (!sameConnection) {
          member.online = false; resetReady(member); recording.disconnect(s, member.deviceId);
          for (const role of s.roles.values()) if (role.targetId === member.deviceId && !role.acked) role.expired = true;
        }
      }
    }); },
    announce(client) { return enqueue(() => {
      const id = identities.get(client);
      for (const s of sessions.values()) if (!s.closedAt && (s.members.has(id) || s.pending.has(id))) {
        snapshot(s, randomUUID(), id);
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
