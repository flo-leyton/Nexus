const { isSessionEvent, isProtocolId, isNodeRole, isDisplayText, DEVICE_NAME_LIMIT, INITIAL_READINESS, sessionTakes, activeTakes, nodeTakePending } = require('../services/sessionProtocol.ts');
const { recordingState } = require('./recording');
const { randomUUID } = require('node:crypto');

const entries = (value) => Object.entries(value || {});
function sharedMember(member) {
  return { uid: member.uid, deviceId: member.deviceId, nodeId: member.nodeId, kind: member.kind,
    role: member.role, online: member.online, ...(member.deviceName ? { deviceName: member.deviceName } : {}),
    ...(member.readiness ? { readiness: member.readiness } : {}),
    ...(member.readyEpoch ? { readyEpoch: member.readyEpoch, requiresReadyConfirmation: member.requiresReadyConfirmation } : {}) };
}
function sharedTake(take) {
  if (!take) return undefined;
  return { takeId: take.takeId, startMessageId: take.startMessageId, stopMessageId: take.stopMessageId,
    nodes: Object.fromEntries(entries(take.nodes).map(([id, n]) => [id, { nodeId: n.nodeId, ...(n.role ? { role: n.role } : {}),
      phase: n.phase, startReceived: n.startReceived, stopReceived: n.stopReceived, busy: n.busy, error: n.error,
      capture: n.capture ? { id: n.capture.id, bytes: n.capture.bytes } : null, ...(n.connectionLost ? { connectionLost: true } : {}) }])),
    ...(take.closed ? { closed: { messageId: take.closed.messageId, at: take.closed.at, unconfirmedNodeIds: take.closed.unconfirmedNodeIds } } : {}),
    ...(take.interrupted ? { interrupted: { at: take.interrupted.at, reason: take.interrupted.reason } } : {}) };
}
function sharedSession(s) {
  return { sessionId: s.sessionId, controllerId: s.controllerId, code: s.code, state: recordingState(s),
    ...(s.name ? { name: s.name } : {}), ...(s.description ? { description: s.description } : {}),
    ...(s.createdAt ? { createdAt: s.createdAt } : {}),
    members: Object.fromEntries([...s.members].map(([id, m]) => [id, sharedMember(m)])),
    ...(s.closedAt ? { closedAt: s.closedAt } : {}), ...(s.take ? { take: sharedTake(s.take) } : {}),
    takeHistory: (s.takeHistory || []).map(sharedTake), mediaAngles: s.mediaAngles || {} };
}
function scrub(value) {
  if (typeof value === 'string') return value.replace(/file:\/\/[^\s"'<>]*/g, '[ruta local omitida]');
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, scrub(v)]));
  return value;
}
function encodeRegistry(sessions, owners, revision) {
  return scrub({ schemaVersion: 1, revision, devices: Object.fromEntries(owners), sessions: Object.fromEntries([...sessions].map(([id, s]) => [id, {
    ...sharedSession(s), pending: Object.fromEntries([...s.pending].map(([key, p]) => [key, { requestId: p.requestId, deviceId: p.deviceId, uid: p.uid,
      ...(p.deviceName ? { deviceName: p.deviceName } : {}) }])),
    roles: Object.fromEntries([...s.roles].map(([key, r]) => [key, { targetId: r.targetId, role: r.role, acked: r.acked, expired: r.expired, expiresAt: r.expiresAt }])),
    usedTakes: [...(s.usedTakes || [])], closeCommands: Object.fromEntries(s.closeCommands || []),
    ...(s.photoCommands?.size ? { photoCommands: Object.fromEntries(s.photoCommands) } : {}),
    recordingCommands: Object.fromEntries([...(s.recordingCommands || [])].map(([key, cmd]) => [key, {
      signature: cmd.signature, type: cmd.type, takeId: cmd.takeId, targetNodeIds: cmd.targetNodeIds, expiresAt: cmd.expiresAt,
      responded: [...cmd.responded], executed: [...cmd.executed], notified: [...cmd.notified], expiredTargets: [...(cmd.expiredTargets || [])] }])),
  }])) });
}
function validUid(value) { return typeof value === 'string' && value.length > 0 && value.length <= 128; }
function decodeRegistry(doc) {
  if (doc.schemaVersion !== 1 || !Number.isSafeInteger(doc.revision) || doc.revision < 0) throw new Error('Esquema RTDB no compatible. No se migraron datos automáticamente.');
  const owners = new Map(entries(doc.devices)), sessions = new Map(), codes = new Map();
  for (const [id, uid] of owners) if (!isProtocolId(id) || !validUid(uid)) throw new Error('Identidad durable inválida.');
  for (const [id, raw] of entries(doc.sessions)) {
    // RTDB omits empty objects/arrays and null fields: normalize them explicitly.
    const members = Object.fromEntries(entries(raw.members).map(([key, m]) => [key, { ...m, nodeId: m.nodeId ?? null,
      ...(m.readiness ? { readiness: { ...m.readiness, cameraAvailable: m.readiness.cameraAvailable ?? null, error: m.readiness.error ?? null } } : {}) }]));
    const normalizeTake = (t) => t ? { ...t, stopMessageId: t.stopMessageId ?? null,
      nodes: Object.fromEntries(entries(t.nodes).map(([key, n]) => [key, { ...n, error: n.error ?? null, capture: n.capture ?? null }])),
      ...(t.closed ? { closed: { ...t.closed, unconfirmedNodeIds: t.closed.unconfirmedNodeIds || [] } } : {}) } : undefined;
    const s = { ...raw, members, take: normalizeTake(raw.take), takeHistory: (raw.takeHistory || []).map(normalizeTake), mediaAngles: raw.mediaAngles || {} };
    if (id !== s.sessionId || !isSessionEvent({ protocolVersion: 1, messageId: 'storage', type: 'SESSION_SNAPSHOT', sessionId: id,
      senderId: 'nexus-relay', targetId: s.controllerId, sentAt: 1, payload: { requestId: 'storage', session: s } }) ||
      codes.has(s.code)) throw new Error('Session o código duplicado/inválido en RTDB; no se sobrescribió.');
    for (const [deviceId, m] of entries(members)) if (!validUid(m.uid) || owners.get(deviceId) !== m.uid) throw new Error('Propietario durable de Session inválido.');
    s.members = new Map(entries(members)); s.pending = new Map(entries(raw.pending)); s.roles = new Map(entries(raw.roles));
    for (const [key, role] of s.roles) if (!isProtocolId(key) || !isProtocolId(role?.targetId) || !isNodeRole(role.role) ||
      typeof role.acked !== 'boolean' || typeof role.expired !== 'boolean' || !Number.isFinite(role.expiresAt)) throw new Error('Diario de roles durable inválido.');
    for (const [key, p] of s.pending) if (!isProtocolId(key) || p?.deviceId !== key || !validUid(p.uid) || !isProtocolId(p.requestId) || owners.get(key) !== p.uid ||
        (p.deviceName !== undefined && !isDisplayText(p.deviceName, DEVICE_NAME_LIMIT))) throw new Error('Solicitud durable inválida.');
    for (const [key, cmd] of entries(raw.recordingCommands)) if (!isProtocolId(key) || !['START_RECORDING', 'STOP_RECORDING'].includes(cmd?.type) ||
      !isProtocolId(cmd.takeId) || typeof cmd.signature !== 'string' || !Number.isFinite(cmd.expiresAt) ||
      !Array.isArray(cmd.targetNodeIds) || !cmd.targetNodeIds.every(isProtocolId) ||
      !['responded', 'executed', 'notified', 'expiredTargets'].every((field) => cmd[field] == null || (Array.isArray(cmd[field]) && cmd[field].every(isProtocolId)))) throw new Error('Diario de captura durable inválido.');
    if (raw.usedTakes && (!Array.isArray(raw.usedTakes) || !raw.usedTakes.every(isProtocolId))) throw new Error('Identidades de Take durables inválidas.');
    if (!entries(raw.closeCommands).every(([id, takeId]) => isProtocolId(id) && isProtocolId(takeId))) throw new Error('Cierres durables inválidos.');
    const takeIds = sessionTakes(s).map((take) => take.takeId);
    if (new Set(takeIds).size !== takeIds.length) throw new Error('Take duplicada en RTDB.');
    s.usedTakes = new Set([...(raw.usedTakes || []), ...takeIds]); s.closeCommands = new Map(entries(raw.closeCommands));
    s.photoCommands = new Map(entries(raw.photoCommands).map(([requestId, command]) => {
      if (!isProtocolId(requestId) || !isProtocolId(command?.nodeId) || !isProtocolId(command?.deviceId) ||
          !Number.isSafeInteger(command.expiresAt) || (command.result && (command.result.requestId !== requestId ||
          !isSessionEvent({ protocolVersion: 1, messageId: 'storage', type: 'PHOTO_RESULT', sessionId: id,
            senderId: 'nexus-relay', targetId: s.controllerId, sentAt: 1, payload: { ...command.result, nodeId: command.nodeId } })))) {
        throw new Error('Diario de fotos durable inválido.');
      }
      if (!command.result || command.result.status === 'received') {
        return [requestId, { ...command, result: { requestId, status: 'error', error: 'Relay reiniciado. Comprueba el original en el Node.' } }];
      }
      return [requestId, command];
    }));
    s.recordingCommands = new Map(entries(raw.recordingCommands).map(([key, cmd]) => [key, { ...cmd,
      responded: new Set(cmd.responded || []), executed: new Set(cmd.executed || []), notified: new Set(cmd.notified || []), expiredTargets: new Set(cmd.targetNodeIds), recovered: true }]));
    for (const m of s.members.values()) { m.online = false; if (m.kind === 'node') { m.readiness = { ...INITIAL_READINESS }; m.readyEpoch = randomUUID(); m.requiresReadyConfirmation = true; } }
    // Pending approvals and unacknowledged roles cannot be replayed after restart.
    for (const role of s.roles.values()) if (!role.acked) role.expired = true;
    const activeDevices = new Set();
    for (const take of activeTakes(s)) {
      take.interrupted ||= { at: Date.now(), reason: 'relay-restarted' };
      for (const [deviceId, node] of entries(take.nodes)) {
        if (!nodeTakePending(take, deviceId, node.nodeId)) continue;
        if (activeDevices.has(deviceId)) throw new Error('El dispositivo tiene varias tomas activas en RTDB.');
        activeDevices.add(deviceId);
        node.phase = 'disconnected'; node.busy = true; node.connectionLost = true; node.capture = null; node.error = 'Relay reiniciado; resultado local no confirmado/desconocido';
      }
    }
    sessions.set(id, s); codes.set(s.code, id);
  }
  return { sessions, codes, owners, revision: doc.revision };
}
module.exports = { sharedSession, sharedMember, sharedTake, encodeRegistry, decodeRegistry };
