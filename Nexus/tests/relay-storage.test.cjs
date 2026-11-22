const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const WebSocket = require('ws');
const { createRelay } = require('../server/relay');
const { createMemoryStore } = require('./helpers/storage.cjs');
const { authenticate } = require('./helpers/relay.cjs');
const { createRealtimeStore, createFirebaseStore } = require('../server/sessionStorage');
const { decodeRegistry } = require('../server/sessionSchema');
const readiness = { cameraPermission: 'granted', cameraAvailable: true, enginePrepared: true, error: null };
const tick = () => new Promise(setImmediate);

async function transfer(t, runtime, deviceId, previousIdToken, idToken) {
  const ws = new WebSocket(`ws://127.0.0.1:${runtime.server.address().port}`);
  t.after(() => ws.terminate()); await once(ws, 'open');
  const answer = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'SOCKET_IDENTITY_TRANSFER', protocolVersion: 1, deviceId, previousIdToken, idToken }));
  return { ws, answer: JSON.parse(String((await answer)[0])) };
}

test('identity: durable transfer requires both verified identities, preserves history and survives a lost acknowledgement', { timeout: 10000 }, async (t) => {
  const storage = createMemoryStore(), { runtime, c, s } = await session(t, storage);
  const a = await peer(t, runtime, 'a'), b = await peer(t, runtime, 'b');
  const ma = await admit(c, a, s), mb = await admit(c, b, s);
  await completeTake(c, [a, b], [ma, mb], s, 'historical');
  await Promise.all([a.call('MEDIA_STATE', s.sessionId, angle(a, ma, 'historical'), c.id), b.call('MEDIA_STATE', s.sessionId, angle(b, mb, 'historical'), c.id)]);
  c.ws.close(); await once(c.ws, 'close'); await runtime.idle();
  const denied = await transfer(t, runtime, c.id, 'unrelated', 'google-uid');
  assert.equal(denied.answer.code, 'AUTH_TRANSFER_DENIED');
  assert.equal(storage.backing.document.devices[c.id], c.uid);
  const moved = await transfer(t, runtime, c.id, c.uid, 'google-uid');
  assert.equal(moved.answer.type, 'SOCKET_AUTH_OK');
  assert.equal(storage.backing.document.sessions[s.sessionId].members[c.id].uid, 'google-uid');
  moved.ws.close(); await once(moved.ws, 'close'); await runtime.idle();
  // A lost transfer response is reconciled by a NORMAL fresh connection, not a second migration.
  const owner = await peer(t, runtime, c.id, 'google-uid');
  assert.deepEqual((await owner.call('SESSION_LIST', 'studio-index')).event.payload.sessionIds, [s.sessionId]);
  const restored = (await owner.call('SESSION_GET', s.sessionId)).event.payload.session;
  assert.equal(restored.members.a.nodeId, ma.nodeId); assert.equal(restored.members.b.nodeId, mb.nodeId);
  assert.equal(restored.take.takeId, 'historical'); assert.equal(Object.keys(restored.mediaAngles).length, 2);
  assert.equal(a.inbox.filter((m) => m.type === 'START_RECORDING').length, 1);
  assert.equal(a.inbox.filter((m) => m.type === 'STOP_RECORDING').length, 1);
  await runtime.close();
  const restarted = await start(t, createMemoryStore(storage.backing));
  const reopened = await peer(t, restarted, c.id, 'google-uid');
  assert.deepEqual((await reopened.call('SESSION_LIST', 'studio-index')).event.payload.sessionIds, [s.sessionId]);
  const old = await transfer(t, restarted, c.id, c.uid, 'attacker');
  assert.notEqual(old.answer.type, 'SOCKET_AUTH_OK');
});

test('identity: failed durable transfer does not change owner or announce success', async (t) => {
  const storage = createMemoryStore(), { runtime, c, s } = await session(t, storage);
  c.ws.close(); await once(c.ws, 'close'); await runtime.idle(); storage.backing.fail = true;
  const moved = await transfer(t, runtime, c.id, c.uid, 'new-uid');
  assert.equal(moved.answer.code, 'AUTH_STORE_UNAVAILABLE');
  assert.equal(storage.backing.document.devices[c.id], c.uid);
  assert.equal(storage.backing.document.sessions[s.sessionId].members[c.id].uid, c.uid);
  storage.backing.fail = false;
  const original = await peer(t, runtime, c.id, c.uid);
  assert.equal((await original.call('SESSION_GET', s.sessionId)).event.payload.session.code, s.code);
});

test('identity: expired or invalid previous token cannot transfer a device or consult its Session', async (t) => {
  const storage = createMemoryStore(), { runtime, c } = await session(t, storage, { verifyToken: async (token) => {
    if (token === 'invalid-proof') throw new Error('provider failure');
    return { uid: token === 'expired-proof' ? 'uid-controller' : token, exp: Math.floor(Date.now() / 1000) + (token === 'expired-proof' ? -10 : 3600) };
  } });
  c.ws.close(); await once(c.ws, 'close'); await runtime.idle();
  for (const [proof, code] of [['expired-proof', 'AUTH_TRANSFER_DENIED'], ['invalid-proof', 'AUTH_TRANSFER_DENIED']]) {
    const result = await transfer(t, runtime, c.id, proof, 'foreign-uid');
    assert.equal(result.answer.code, code); assert.equal(storage.backing.document.devices[c.id], c.uid);
  }
});

test('reopening: pending join survives Controller offline and relay restart, then authorized Controller resolves it', async (t) => {
  const storage = createMemoryStore(), { runtime, c, s } = await session(t, storage);
  c.ws.close(); await once(c.ws, 'close'); await runtime.idle();
  const n = await peer(t, runtime, 'waiting-node');
  const pending = await n.call('SESSION_JOIN_REQUEST', s.sessionId, { code: s.code });
  assert.equal(pending.event.payload.controllerOnline, false);
  await runtime.close();
  const restarted = await start(t, createMemoryStore(storage.backing));
  assert.equal(storage.backing.document.sessions[s.sessionId].pending[n.id].requestId, pending.message.messageId);
  const newNode = await peer(t, restarted, n.id);
  const controller = await peer(t, restarted, c.id);
  const snapshot = (await controller.call('SESSION_GET', s.sessionId)).event;
  assert.equal(snapshot.payload.pending[0].online, true);
  await controller.call('SESSION_JOIN_ACCEPT', s.sessionId, { requestId: pending.message.messageId }, n.id);
  assert.equal((await newNode.call('SESSION_GET', s.sessionId)).event.payload.session.members[n.id].kind, 'node');
  assert.equal(newNode.inbox.some((m) => ['START_RECORDING', 'STOP_RECORDING'].includes(m.type)), false);
});

async function start(t, storage, options = {}) {
  const runtime = createRelay({ port: 0, host: '127.0.0.1', storage,
    verifyToken: async (token) => ({ uid: token, exp: Math.floor(Date.now() / 1000) + 3600 }), ...options });
  t.after(() => runtime.close()); await once(runtime.server, 'listening');
  if (options.wait !== false) await runtime.ready;
  return runtime;
}
async function peer(t, runtime, id, uid = `uid-${id}`) {
  const ws = new WebSocket(`ws://127.0.0.1:${runtime.server.address().port}`);
  const inbox = []; ws.on('message', (raw) => inbox.push(JSON.parse(String(raw))));
  t.after(() => ws.terminate()); await once(ws, 'open'); await authenticate(ws, id, uid);
  const wait = async (predicate) => { while (!inbox.some(predicate)) await once(ws, 'message'); return inbox.find(predicate); };
  const send = (type, sessionId, payload = {}, targetId, messageId = randomUUID()) => {
    const m = { type, sessionId, senderId: id, payload, targetId, messageId, protocolVersion: 1, sentAt: Date.now() };
    ws.send(JSON.stringify(m));
    return { message: m, result: wait((event) => event.payload?.requestId === messageId || (type === 'SESSION_ROLE_ACK' && event.payload?.requestId === payload.requestId)) };
  };
  const call = async (...args) => { const op = send(...args); return { message: op.message, event: await op.result }; };
  return { ws, inbox, id, uid, wait, send, call };
}
async function session(t, storage, options) {
  const runtime = await start(t, storage, options), c = await peer(t, runtime, 'controller');
  const created = await c.call('SESSION_CREATE', 'session');
  assert.equal(created.event.type, 'SESSION_SNAPSHOT');
  return { runtime, c, s: created.event.payload.session };
}
async function admit(c, n, s) {
  const join = await n.call('SESSION_JOIN_REQUEST', s.sessionId, { code: s.code });
  const accepted = await c.call('SESSION_JOIN_ACCEPT', s.sessionId, { requestId: join.message.messageId }, n.id);
  return accepted.event.payload.session.members[n.id];
}
async function ready(n, s) {
  const member = n.inbox.findLast((m) => m.type === 'SESSION_SNAPSHOT' && m.sessionId === s.sessionId)?.payload.session.members[n.id];
  await n.call('NODE_STATE', s.sessionId, { readiness, ...(member?.readyEpoch ? { readyEpoch: member.readyEpoch } : {}) }, s.controllerId);
}
async function confirmReady(n, s) {
  const member = (await n.call('SESSION_GET', s.sessionId)).event.payload.session.members[n.id];
  return n.call('NODE_STATE', s.sessionId, { readiness, readyEpoch: member.readyEpoch, confirmReady: true }, s.controllerId);
}
async function ack(n, s, command) {
  return n.call('RECORDING_ACK', s.sessionId, { requestId: command.messageId, takeId: command.payload.takeId, command: command.type }, s.controllerId);
}
async function saved(n, s, command) {
  return n.call('RECORDING_STATE', s.sessionId, { requestId: command.messageId, takeId: command.payload.takeId,
    phase: 'saved', error: null, busy: false, capture: { id: `clip-${command.payload.takeId}-${n.id}`, bytes: 256, localUri: `file:///private/${n.id}/video.mp4` } }, s.controllerId);
}
function angle(n, member, takeId) {
  return { clipId: `clip-${takeId}-${n.id}`, deviceId: n.id, nodeId: member.nodeId, takeId, bytes: 256, revision: 3,
    upload: { state: 'uploaded', publicId: `provider-${n.id}`, url: `https://res.cloudinary.com/test/video/upload/provider-${n.id}.mp4` } };
}
async function completeTake(c, nodes, members, s, takeId = 'take') {
  await Promise.all(nodes.map((n) => ready(n, s)));
  const targets = members.map((m) => m.nodeId);
  const start = await c.call('START_RECORDING', s.sessionId, { takeId, targetNodeIds: targets });
  await Promise.all(nodes.map((n) => ack(n, s, start.message)));
  const stop = await c.call('STOP_RECORDING', s.sessionId, { takeId, targetNodeIds: targets });
  await Promise.all(nodes.map((n) => ack(n, s, stop.message)));
  await Promise.all(nodes.map((n) => saved(n, s, stop.message)));
  return { start, stop };
}

test('H3.4c: Node resumes approved UID/device membership and role, requires fresh READY and expires pending role', { timeout: 10000 }, async (t) => {
  const storage = createMemoryStore(), { runtime, c, s } = await session(t, storage);
  const a = await peer(t, runtime, 'resume-a'), b = await peer(t, runtime, 'resume-b');
  const ma = await admit(c, a, s), mb = await admit(c, b, s);
  const assigned = c.send('ASSIGN_ROLE', s.sessionId, { role: 'MAIN' }, a.id);
  await a.wait((m) => m.messageId === assigned.message.messageId);
  await a.call('SESSION_ROLE_ACK', s.sessionId, { requestId: assigned.message.messageId }, c.id); await assigned.result;
  await completeTake(c, [a, b], [ma, mb], s, 'before-resume');
  await Promise.all([a.call('MEDIA_STATE', s.sessionId, angle(a, ma, 'before-resume'), c.id), b.call('MEDIA_STATE', s.sessionId, angle(b, mb, 'before-resume'), c.id)]);
  await ready(a, s); await ready(b, s);
  const pending = c.send('ASSIGN_ROLE', s.sessionId, { role: 'OTHER' }, a.id);
  await a.wait((m) => m.messageId === pending.message.messageId);
  a.ws.close(); await once(a.ws, 'close'); await runtime.idle();
  const node = await peer(t, runtime, a.id);
  assert.deepEqual((await node.call('SESSION_LIST', 'studio-index')).event.payload.sessionIds, [s.sessionId]);
  const offline = (await node.call('SESSION_GET', s.sessionId)).event.payload.session;
  assert.equal(offline.members[a.id].online, false); assert.equal(offline.members[a.id].nodeId, ma.nodeId);
  storage.backing.fail = true;
  assert.equal((await node.call('SESSION_RESUME', s.sessionId)).event.payload.code, 'STORE_UNAVAILABLE');
  assert.equal(storage.backing.document.sessions[s.sessionId].members[a.id].online, false);
  storage.backing.fail = false;
  const restored = (await node.call('SESSION_RESUME', s.sessionId)).event.payload.session;
  const member = restored.members[a.id];
  assert.equal(member.online, true); assert.equal(member.role, 'MAIN'); assert.equal(member.nodeId, ma.nodeId);
  assert.equal(member.readiness.enginePrepared, false); assert.equal(member.requiresReadyConfirmation, true);
  assert.equal(restored.members[b.id].readiness.enginePrepared, true); // independent Node
  assert.equal((await node.call('SESSION_RESUME', s.sessionId)).event.payload.session.members[a.id].readyEpoch, member.readyEpoch);
  for (const payload of [{ readiness }, { readiness, readyEpoch: 'old-epoch', confirmReady: true }, { readiness, readyEpoch: member.readyEpoch }]) {
    assert.equal((await node.call('NODE_STATE', s.sessionId, payload, c.id)).event.payload.code, 'READY_CONFIRMATION_REQUIRED');
  }
  assert.equal((await node.call('SESSION_ROLE_ACK', s.sessionId, { requestId: pending.message.messageId }, c.id)).event.payload.code, 'ROLE_ACK_TIMEOUT');
  await confirmReady(node, s);
  assert.equal((await c.call('SESSION_GET', s.sessionId)).event.payload.session.members[a.id].readiness.enginePrepared, true);
  assert.equal(Object.keys(restored.mediaAngles).length, 1); // Node receives only its own angle
  assert.equal(Object.keys((await c.call('SESSION_GET', s.sessionId)).event.payload.session.mediaAngles).length, 2);
  assert.equal(restored.take.takeId, 'before-resume');
  assert.equal(node.inbox.some((m) => ['START_RECORDING', 'STOP_RECORDING', 'ASSIGN_ROLE'].includes(m.type)), false);
  const foreign = await peer(t, runtime, 'resume-foreign');
  assert.equal((await foreign.call('SESSION_RESUME', s.sessionId)).event.payload.code, 'NOT_MEMBER');
});

test('H3.4c: Controller reconnect expires old commands, keeps unknown outcomes and starts exactly one new Take after reconciliation', { timeout: 10000 }, async (t) => {
  const storage = createMemoryStore(), { runtime, c, s } = await session(t, storage);
  const a = await peer(t, runtime, 'controller-resume-a'), b = await peer(t, runtime, 'controller-resume-b');
  const members = [await admit(c, a, s), await admit(c, b, s)]; await ready(a, s); await ready(b, s);
  const original = await c.call('START_RECORDING', s.sessionId, { takeId: 'unknown-take', targetNodeIds: members.map((m) => m.nodeId) });
  await ack(a, s, original.message);
  c.ws.close(); await once(c.ws, 'close'); await runtime.idle();
  const owner = await peer(t, runtime, c.id);
  const restored = (await owner.call('SESSION_RESUME', s.sessionId)).event.payload.session;
  assert.equal(restored.take.interrupted.reason, 'connection-lost');
  for (const n of [a, b]) {
    assert.equal(restored.members[n.id].readiness.enginePrepared, false);
    assert.equal(restored.take.nodes[n.id].phase, 'disconnected'); assert.equal(restored.take.nodes[n.id].capture, null);
    assert.equal(restored.take.nodes[n.id].stopReceived, false); assert.equal(restored.take.nodes[n.id].connectionLost, true);
  }
  assert.equal(restored.take.nodes[a.id].startReceived, true); assert.equal(restored.take.nodes[b.id].startReceived, false);
  assert.equal((await ack(b, s, original.message)).event.payload.code, 'TAKE_INTERRUPTED');
  assert.equal((await owner.call('START_RECORDING', s.sessionId, original.message.payload, undefined, original.message.messageId)).event.payload.code, 'TAKE_INTERRUPTED');
  assert.equal((await owner.call('CLOSE_INTERRUPTED_TAKE', s.sessionId, { takeId: 'unknown-take', acknowledgeUnknown: true })).event.payload.code, 'NODE_NOT_READY');
  await confirmReady(a, s); await confirmReady(b, s);
  const closure = (await owner.call('CLOSE_INTERRUPTED_TAKE', s.sessionId, { takeId: 'unknown-take', acknowledgeUnknown: true })).event;
  assert.equal(closure.type, 'SESSION_SNAPSHOT', JSON.stringify(closure.payload));
  const closed = closure.payload.session.take;
  assert.equal(closed.closed.unconfirmedNodeIds.length, 2);
  const next = await completeTake(owner, [a, b], members, s, 'resumed-new-take');
  const cutoff = owner.inbox.length;
  owner.ws.send(JSON.stringify(original.message));
  const duplicate = await owner.wait((m) => owner.inbox.indexOf(m) >= cutoff && m.payload?.requestId === original.message.messageId);
  const final = duplicate.payload.session;
  assert.equal(final.take.takeId, next.start.message.payload.takeId); assert.equal(final.takeHistory.length, 1);
  assert.equal(final.takeHistory[0].nodes[b.id].capture, null); assert.equal(final.takeHistory[0].nodes[b.id].startReceived, false);
  for (const n of [a, b]) assert.equal(n.inbox.filter((m) => m.type === 'START_RECORDING' && m.payload.takeId === 'unknown-take').length, 1);
});

test('H3.4c: Node reconnect during REC cannot acknowledge old commands or receive the old STOP', { timeout: 10000 }, async (t) => {
  const storage = createMemoryStore(), { runtime, c, s } = await session(t, storage);
  const a = await peer(t, runtime, 'cut-a'), b = await peer(t, runtime, 'cut-b');
  const ma = await admit(c, a, s), mb = await admit(c, b, s); await ready(a, s); await ready(b, s);
  const rec = await c.call('START_RECORDING', s.sessionId, { takeId: 'node-cut-take', targetNodeIds: [ma.nodeId, mb.nodeId] });
  await ack(b, s, rec.message);
  a.ws.close(); await once(a.ws, 'close'); await runtime.idle();
  const node = await peer(t, runtime, a.id);
  await node.call('SESSION_RESUME', s.sessionId);
  assert.equal((await ack(node, s, rec.message)).event.payload.code, 'COMMAND_EXPIRED');
  const stop = await c.call('STOP_RECORDING', s.sessionId, { takeId: 'node-cut-take', targetNodeIds: [ma.nodeId, mb.nodeId] });
  await ack(b, s, stop.message); await saved(b, s, stop.message);
  assert.equal(node.inbox.some((m) => ['START_RECORDING', 'STOP_RECORDING'].includes(m.type)), false);
  const restored = (await c.call('SESSION_GET', s.sessionId)).event.payload.session;
  assert.equal(restored.take.nodes[a.id].startReceived, false); assert.equal(restored.take.nodes[a.id].stopReceived, false);
  assert.equal(restored.take.nodes[a.id].capture, null); assert.equal(restored.take.nodes[a.id].phase, 'disconnected');
  await confirmReady(node, s); // local engine must already be idle; no inferred saved report
  const closed = (await c.call('CLOSE_INTERRUPTED_TAKE', s.sessionId, { takeId: 'node-cut-take', acknowledgeUnknown: true })).event;
  assert.equal(closed.type, 'SESSION_SNAPSHOT');
  await completeTake(c, [node, b], [ma, mb], s, 'after-node-cut');
  assert.equal((await c.call('SESSION_GET', s.sessionId)).event.payload.session.takeHistory[0].nodes[a.id].capture, null);
});

test('H3.4c: abrupt restart restores approved participants and durable saved result, never unknown ACKs, and permits a new Take', { timeout: 10000 }, async (t) => {
  const storage = createMemoryStore(), { runtime, c, s } = await session(t, storage);
  const a = await peer(t, runtime, 'crash-a'), b = await peer(t, runtime, 'crash-b');
  const ma = await admit(c, a, s), mb = await admit(c, b, s); await ready(a, s); await ready(b, s);
  const startCommand = await c.call('START_RECORDING', s.sessionId, { takeId: 'crash-take', targetNodeIds: [ma.nodeId, mb.nodeId] });
  await ack(a, s, startCommand.message);
  const stopCommand = await c.call('STOP_RECORDING', s.sessionId, { takeId: 'crash-take', targetNodeIds: [ma.nodeId, mb.nodeId] });
  await ack(a, s, stopCommand.message); await saved(a, s, stopCommand.message);
  const crashBacking = { document: structuredClone(storage.backing.document) }; // exact durable data at sudden power loss
  await runtime.close();
  const second = await start(t, createMemoryStore(crashBacking));
  const owner = await peer(t, second, c.id), na = await peer(t, second, a.id), nb = await peer(t, second, b.id);
  const before = (await owner.call('SESSION_GET', s.sessionId)).event.payload.session;
  assert.equal(before.take.interrupted.reason, 'relay-restarted');
  assert.equal(before.take.nodes[a.id].phase, 'saved'); assert.ok(before.take.nodes[a.id].capture);
  assert.equal(before.take.nodes[b.id].phase, 'disconnected'); assert.equal(before.take.nodes[b.id].capture, null);
  assert.equal(before.take.nodes[b.id].startReceived, false); assert.equal(before.take.nodes[b.id].stopReceived, false);
  for (const [node, member] of [[na, ma], [nb, mb]]) {
    const resumed = (await node.call('SESSION_RESUME', s.sessionId)).event.payload.session.members[node.id];
    assert.equal(resumed.nodeId, member.nodeId); assert.equal(resumed.readiness.enginePrepared, false);
    await confirmReady(node, s);
    assert.equal(node.inbox.some((m) => ['START_RECORDING', 'STOP_RECORDING'].includes(m.type)), false);
  }
  assert.equal((await nb.call('RECORDING_ACK', s.sessionId, { requestId: stopCommand.message.messageId, takeId: 'crash-take', command: 'STOP_RECORDING' }, c.id)).event.payload.code, 'TAKE_INTERRUPTED');
  await owner.call('CLOSE_INTERRUPTED_TAKE', s.sessionId, { takeId: 'crash-take', acknowledgeUnknown: true });
  const newer = await completeTake(owner, [na, nb], [ma, mb], s, 'post-crash');
  assert.equal(newer.start.event.payload.session.takeHistory[0].nodes[b.id].capture, null);
  assert.equal(newer.start.event.payload.session.takeHistory[0].nodes[a.id].phase, 'saved');
});

test('H3.4b: cold restart preserves code, owners, members, roles, Takes and simultaneous angles without phone paths', { timeout: 10000 }, async (t) => {
  const storage = createMemoryStore(), { runtime, c, s } = await session(t, storage);
  const a = await peer(t, runtime, 'a'), b = await peer(t, runtime, 'b');
  const ma = await admit(c, a, s), mb = await admit(c, b, s);
  const role = c.send('ASSIGN_ROLE', s.sessionId, { role: 'main-camera' }, a.id);
  await a.wait((m) => m.type === 'ASSIGN_ROLE');
  await a.call('SESSION_ROLE_ACK', s.sessionId, { requestId: role.message.messageId }, c.id); await role.result;
  await completeTake(c, [a, b], [ma, mb], s, 'first-take');
  await Promise.all([a.call('MEDIA_STATE', s.sessionId, angle(a, ma, 'first-take'), c.id), b.call('MEDIA_STATE', s.sessionId, angle(b, mb, 'first-take'), c.id)]);
  await a.call('MEDIA_STATE', s.sessionId, angle(a, ma, 'first-take'), c.id);
  const secondCommands = await completeTake(c, [a, b], [ma, mb], s, 'second-take');
  const before = (await c.call('SESSION_GET', s.sessionId)).event.payload.session;
  assert.equal(before.takeHistory.length, 1); assert.equal(Object.keys(before.mediaAngles).length, 2);
  assert.equal(JSON.stringify(storage.backing.document).includes('file://'), false);
  assert.equal(JSON.stringify(storage.backing.document).includes('idToken'), false);
  await runtime.close();
  const restarted = await start(t, createMemoryStore(storage.backing)); // new adapter and empty relay maps
  const restoredBeforeAuth = storage.backing.document.sessions[s.sessionId];
  assert.ok(Object.values(restoredBeforeAuth.members).every((m) => !m.online && !m.readiness?.enginePrepared));
  const restoredC = await peer(t, restarted, c.id), restoredA = await peer(t, restarted, a.id);
  const recovered = (await restoredC.call('SESSION_GET', s.sessionId)).event.payload.session;
  const discovered = (await restoredC.call('SESSION_LIST', 'studio-index')).event;
  assert.deepEqual(discovered.payload.sessionIds, [s.sessionId]);
  assert.equal(recovered.sessionId, s.sessionId); assert.equal(recovered.code, s.code);
  assert.equal(recovered.members.a.nodeId, ma.nodeId); assert.equal(recovered.members.a.uid, a.uid);
  assert.equal(recovered.members.a.role, 'main-camera'); assert.equal(recovered.members.a.online, false);
  assert.equal(recovered.take.takeId, 'second-take'); assert.equal(recovered.take.nodes.a.capture.id, 'clip-second-take-a');
  assert.equal(recovered.takeHistory[0].takeId, 'first-take'); assert.equal(Object.keys(recovered.mediaAngles).length, 2);
  assert.equal(recovered.mediaAngles['a:clip-first-take-a'].upload.url, angle(a, ma, 'first-take').upload.url);
  assert.equal(restoredA.inbox.some((m) => ['START_RECORDING', 'STOP_RECORDING', 'RECORDING_ACK'].includes(m.type)), false);
  for (const command of [secondCommands.start.message, secondCommands.stop.message]) {
    await restoredC.call(command.type, s.sessionId, command.payload, undefined, command.messageId);
  }
  assert.equal(restoredA.inbox.some((m) => ['START_RECORDING', 'STOP_RECORDING', 'RECORDING_ACK'].includes(m.type)), false);
  const foreign = await peer(t, restarted, 'foreign');
  assert.deepEqual((await foreign.call('SESSION_LIST', 'studio-index')).event.payload.sessionIds, []);
  assert.equal((await foreign.call('SESSION_CLOSE', s.sessionId)).event.payload.code, 'NOT_MEMBER');
  assert.equal((await foreign.call('SESSION_GET', s.sessionId)).event.payload.code, 'NOT_MEMBER');
  await foreign.call('SESSION_JOIN_REQUEST', s.sessionId, { code: s.code });
  assert.equal((await foreign.call('SESSION_GET', s.sessionId)).event.payload.code, 'NOT_MEMBER');
  const sameAccount = await peer(t, restarted, 'new-installation', c.uid);
  assert.equal((await sameAccount.call('SESSION_GET', s.sessionId)).event.payload.code, 'NOT_MEMBER');
  const forged = foreign.send('SESSION_GET', s.sessionId); forged.message.senderId = c.id; // a separate forged packet
  foreign.ws.send(JSON.stringify({ ...forged.message, messageId: 'forged-owner' }));
  assert.equal((await foreign.wait((m) => m.payload?.requestId === 'forged-owner')).payload.code, 'IDENTITY_CONFLICT');
  const wrong = new WebSocket(`ws://127.0.0.1:${restarted.server.address().port}`); t.after(() => wrong.terminate()); await once(wrong, 'open');
  const rejected = once(wrong, 'message'); wrong.send(JSON.stringify({ type: 'SOCKET_AUTH', protocolVersion: 1, deviceId: b.id, idToken: 'different-uid' }));
  assert.equal(JSON.parse(String((await rejected)[0])).code, 'AUTH_DEVICE_OWNER_MISMATCH');
});

test('H3.4b: Controller disconnect preserves Session; explicit close is durable and closed code cannot join', async (t) => {
  const storage = createMemoryStore(), { runtime, c, s } = await session(t, storage);
  const n = await peer(t, runtime, 'node'); await admit(c, n, s); await ready(n, s);
  c.ws.close(); await once(c.ws, 'close'); await runtime.idle();
  const offline = (await n.call('SESSION_GET', s.sessionId)).event.payload.session;
  assert.equal(offline.members.controller.online, false); assert.equal(offline.members.node.online, true);
  assert.equal(n.inbox.some((m) => m.type === 'SESSION_CLOSED'), false);
  assert.equal((await n.call('SESSION_CLOSE', s.sessionId)).event.payload.code, 'CONTROLLER_REQUIRED');
  const back = await peer(t, runtime, c.id);
  await back.call('SESSION_CLOSE', s.sessionId);
  assert.ok(storage.backing.document.sessions[s.sessionId].closedAt);
  const outsider = await peer(t, runtime, 'outsider');
  assert.equal((await outsider.call('SESSION_JOIN_REQUEST', s.sessionId, { code: s.code })).event.payload.code, 'INVALID_CODE');
  await runtime.close(); const second = await start(t, createMemoryStore(storage.backing)), owner = await peer(t, second, c.id);
  const closed = (await owner.call('SESSION_GET', s.sessionId)).event.payload.session;
  assert.equal(closed.state, 'closed'); assert.equal(closed.code, s.code);
});

test('H3.4b: failed durable writes roll back creation, acceptance, role ACK, START and media with no success snapshot', async (t) => {
  const storage = createMemoryStore(), runtime = await start(t, storage);
  const c = await peer(t, runtime, 'controller'), n = await peer(t, runtime, 'node');
  storage.backing.fail = true;
  const failed = await c.call('SESSION_CREATE', 'session'); assert.equal(failed.event.payload.code, 'STORE_UNAVAILABLE');
  assert.equal(storage.backing.document.sessions?.session, undefined);
  storage.backing.fail = false;
  const s = (await c.call('SESSION_CREATE', 'session')).event.payload.session;
  const join = await n.call('SESSION_JOIN_REQUEST', s.sessionId, { code: s.code });
  storage.backing.fail = true;
  const accept = await c.call('SESSION_JOIN_ACCEPT', s.sessionId, { requestId: join.message.messageId }, n.id);
  assert.equal(accept.event.payload.code, 'STORE_UNAVAILABLE');
  assert.equal(n.inbox.some((m) => m.type === 'SESSION_SNAPSHOT'), false);
  storage.backing.fail = false;
  const ma = (await c.call('SESSION_JOIN_ACCEPT', s.sessionId, { requestId: join.message.messageId }, n.id)).event.payload.session.members.node;
  const role = c.send('ASSIGN_ROLE', s.sessionId, { role: 'detail-camera' }, n.id); await n.wait((m) => m.type === 'ASSIGN_ROLE');
  storage.backing.fail = true;
  assert.equal((await n.call('SESSION_ROLE_ACK', s.sessionId, { requestId: role.message.messageId }, c.id)).event.payload.code, 'STORE_UNAVAILABLE');
  assert.equal(storage.backing.document.sessions.session.members.node.role, 'unassigned');
  storage.backing.fail = false;
  await n.call('SESSION_ROLE_ACK', s.sessionId, { requestId: role.message.messageId }, c.id); await role.result;
  await ready(n, s); storage.backing.fail = true;
  assert.equal((await c.call('START_RECORDING', s.sessionId, { takeId: 'failed-take', targetNodeIds: [ma.nodeId] })).event.payload.code, 'STORE_UNAVAILABLE');
  assert.equal(n.inbox.some((m) => m.type === 'START_RECORDING'), false);
  storage.backing.fail = false;
  const startedTake = await c.call('START_RECORDING', s.sessionId, { takeId: 'take', targetNodeIds: [ma.nodeId] });
  storage.backing.fail = true;
  assert.equal((await ack(n, s, startedTake.message)).event.payload.code, 'STORE_UNAVAILABLE');
  assert.equal(storage.backing.document.sessions.session.take.nodes.node.startReceived, false);
  storage.backing.fail = false; await ack(n, s, startedTake.message);
  const stopped = await c.call('STOP_RECORDING', s.sessionId, { takeId: 'take', targetNodeIds: [ma.nodeId] });
  await ack(n, s, stopped.message); storage.backing.fail = true;
  assert.equal((await saved(n, s, stopped.message)).event.payload.code, 'STORE_UNAVAILABLE');
  assert.equal(storage.backing.document.sessions.session.take.nodes.node.capture, undefined);
  assert.equal(storage.backing.document.sessions.session.take.nodes.node.stopReceived, true);
  storage.backing.fail = false; await saved(n, s, stopped.message);
  storage.backing.fail = true;
  assert.equal((await n.call('MEDIA_STATE', s.sessionId, angle(n, ma, 'take'), c.id)).event.payload.code, 'STORE_UNAVAILABLE');
  assert.equal(storage.backing.document.sessions.session.mediaAngles, undefined);
  storage.backing.fail = false;
  const media = await n.call('MEDIA_STATE', s.sessionId, angle(n, ma, 'take'), c.id);
  assert.equal(media.event.type, 'SESSION_SNAPSHOT'); // snapshot may precede MEDIA_ACCEPTED
  await n.wait((m) => m.type === 'MEDIA_ACCEPTED' && m.payload.requestId === media.message.messageId);
  assert.equal(Object.keys(storage.backing.document.sessions.session.mediaAngles).length, 1);
  storage.backing.fail = true;
  assert.equal((await c.call('SESSION_CLOSE', s.sessionId)).event.payload.code, 'STORE_UNAVAILABLE');
  assert.equal(storage.backing.document.sessions.session.closedAt, undefined);
  assert.equal(n.inbox.some((m) => m.type === 'SESSION_CLOSED'), false);
  storage.backing.fail = false;
  const another = await peer(t, runtime, 'another');
  const pending = await another.call('SESSION_JOIN_REQUEST', s.sessionId, { code: s.code });
  storage.backing.fail = true;
  assert.equal((await c.call('SESSION_JOIN_REJECT', s.sessionId, { requestId: pending.message.messageId }, another.id)).event.payload.code, 'STORE_UNAVAILABLE');
  assert.equal(another.inbox.some((m) => m.type === 'SESSION_JOIN_REJECTED'), false);
  storage.backing.fail = false;
  await c.call('SESSION_JOIN_REJECT', s.sessionId, { requestId: pending.message.messageId }, another.id);
  await another.wait((m) => m.type === 'SESSION_JOIN_REJECTED');
  assert.equal(storage.backing.document.sessions.session.pending, undefined);
});

test('H3.4b: confirmation waits for commit; health stays unready until recovery and inaccessible DB fails closed', async (t) => {
  let release;
  const memory = createMemoryStore();
  const storage = { ...memory, load: async () => { await new Promise((resolve) => { release = resolve; }); return memory.load(); } };
  const runtime = await start(t, storage, { wait: false });
  const health = () => fetch(`http://127.0.0.1:${runtime.server.address().port}/health`);
  assert.equal((await health()).status, 503); release(); await runtime.ready; assert.equal((await health()).status, 200);
  const c = await peer(t, runtime, 'controller');
  let begin, finish;
  const started = new Promise((resolve) => { begin = resolve; });
  memory.backing.beforeCommit = async (next) => { if (next.sessions?.session) { begin(); await new Promise((resolve) => { finish = resolve; }); } };
  const creation = c.send('SESSION_CREATE', 'session'); await started; await tick();
  assert.equal(c.inbox.some((m) => m.type === 'SESSION_SNAPSHOT'), false);
  finish(); await creation.result; memory.backing.beforeCommit = null;
  const broken = await start(t, { load: async () => { throw new Error('DB denied'); } }, { wait: false });
  await assert.rejects(broken.ready, /DB denied/);
  assert.equal((await fetch(`http://127.0.0.1:${broken.server.address().port}/health`)).status, 503);
});

test('H3.4b: interrupted Take survives restart without saved inference or command replay; explicit closure permits new Take', async (t) => {
  const storage = createMemoryStore(), { runtime, c, s } = await session(t, storage);
  const n = await peer(t, runtime, 'node'), member = await admit(c, n, s); await ready(n, s);
  const startCommand = await c.call('START_RECORDING', s.sessionId, { takeId: 'interrupted', targetNodeIds: [member.nodeId] });
  await ack(n, s, startCommand.message);
  await runtime.close();
  const second = await start(t, createMemoryStore(storage.backing)), owner = await peer(t, second, c.id), node = await peer(t, second, n.id);
  const restored = (await owner.call('SESSION_GET', s.sessionId)).event.payload.session;
  assert.ok(['relay-restarted', 'connection-lost'].includes(restored.take.interrupted.reason)); assert.equal(restored.take.nodes.node.capture, null);
  assert.equal(restored.take.nodes.node.startReceived, true); assert.equal(restored.take.nodes.node.stopReceived, false);
  assert.match(restored.take.nodes.node.error, /desconocido/); assert.equal(restored.members.node.online, false);
  assert.equal(node.inbox.some((m) => ['START_RECORDING', 'STOP_RECORDING'].includes(m.type)), false);
  assert.equal((await owner.call('START_RECORDING', s.sessionId, startCommand.message.payload, undefined, startCommand.message.messageId)).event.payload.code, 'TAKE_INTERRUPTED');
  assert.equal(node.inbox.some((m) => ['START_RECORDING', 'STOP_RECORDING'].includes(m.type)), false);
  await owner.call('CLOSE_INTERRUPTED_TAKE', s.sessionId, { takeId: 'interrupted', acknowledgeUnknown: true });
  const approved = await admit(owner, node, s); assert.notEqual(approved.nodeId, member.nodeId);
  await ready(node, s);
  const newer = await owner.call('START_RECORDING', s.sessionId, { takeId: 'new-take', targetNodeIds: [approved.nodeId] });
  assert.equal(newer.event.payload.session.takeHistory[0].nodes.node.capture, null);
  assert.equal(newer.event.payload.session.takeHistory[0].nodes.node.stopReceived, false);
});

test('NX-02: relay restart recovers both outstanding takes without replay', { timeout: 10000 }, async (t) => {
  const storage = createMemoryStore(), { runtime, c, s } = await session(t, storage);
  const a = await peer(t, runtime, 'a'), b = await peer(t, runtime, 'b');
  const ma = await admit(c, a, s), mb = await admit(c, b, s);
  await ready(a, s); await ready(b, s);
  for (const [node, member] of [[a, ma], [b, mb]]) {
    const command = await c.call('START_RECORDING', s.sessionId, { takeId: `take-${node.id}`, targetNodeIds: [member.nodeId] });
    assert.equal(command.event.type, 'SESSION_SNAPSHOT');
    await ack(node, s, command.message);
  }
  await runtime.close();
  const restarted = await start(t, createMemoryStore(storage.backing));
  const owner = await peer(t, restarted, c.id), camera = await peer(t, restarted, a.id);
  const restored = (await owner.call('SESSION_GET', s.sessionId)).event.payload.session;
  assert.equal(restored.take.nodes.b.phase, 'disconnected');
  assert.equal(restored.takeHistory[0].nodes.a.phase, 'disconnected');
  assert.equal(restored.takeHistory[0].nodes.a.capture, null);
  assert.equal(camera.inbox.some((m) => ['START_RECORDING', 'STOP_RECORDING'].includes(m.type)), false);
  await owner.call('CLOSE_INTERRUPTED_TAKE', s.sessionId, { takeId: 'take-b', acknowledgeUnknown: true });
  assert.equal((await owner.call('SESSION_CLOSE', s.sessionId)).event.payload.code, 'TAKE_ACTIVE');
  await owner.call('CLOSE_INTERRUPTED_TAKE', s.sessionId, { takeId: 'take-a', acknowledgeUnknown: true });
  assert.equal((await owner.call('SESSION_CLOSE', s.sessionId)).event.payload.session.state, 'closed');
});

test('H3.4b: duplicate codes and stale revisions cannot overwrite another Session', async (t) => {
  const storage = createMemoryStore(), { c } = await session(t, storage, { codeGenerator: () => 'ABC123' });
  assert.equal((await c.call('SESSION_CREATE', 'second-session')).event.payload.code, 'CODE_UNAVAILABLE');
  assert.equal(Object.keys(storage.backing.document.sessions).length, 1);
  const corrupt = structuredClone(storage.backing.document);
  corrupt.sessions.second = { ...corrupt.sessions.session, sessionId: 'second' };
  assert.throws(() => decodeRegistry(corrupt), /código duplicado/);
  const other = createMemoryStore(storage.backing); const version = (await other.load()).revision;
  storage.backing.document.revision++;
  await assert.rejects(other.commit(version, { schemaVersion: 1, revision: version + 1 }), { code: 'STORE_CONFLICT' });
});

test('H3.4b: RTDB adapter awaits atomic CAS, rejects permission errors, unknown results and missing configuration', async () => {
  assert.throws(() => createFirebaseStore({ FIREBASE_PROJECT_ID: 'project' }), /FIREBASE_DATABASE_URL/);
  let document = { schemaVersion: 1, revision: 4 };
  const reference = { get: async () => ({ val: () => document }), transaction: async (update) => {
    const next = update(document); if (!next) return { committed: false }; document = next; return { committed: true };
  } };
  const store = createRealtimeStore(reference); assert.equal((await store.load()).revision, 4);
  await store.commit(4, { schemaVersion: 1, revision: 5 }); await assert.rejects(store.commit(4, {}), { code: 'STORE_CONFLICT' });
  await assert.rejects(createRealtimeStore({ get: async () => { throw new Error('private denial'); } }).load(), /No se pudo acceder/);
  await assert.rejects(createRealtimeStore({ transaction: () => new Promise(() => {}) }, 10).commit(5, {}), { code: 'STORE_UNCERTAIN' });
  let detached = false;
  const warm = createRealtimeStore({ on(type, handler) { assert.equal(type, 'value'); handler({ val: () => document }); return handler; },
    off() { detached = true; }, transaction: reference.transaction });
  assert.equal((await warm.load()).revision, 5); await warm.commit(5, { schemaVersion: 1, revision: 6 });
  warm.close(); assert.equal(detached, true);
});

test('NX-01 RTDB paths: Auth-first startup preserves the default and isolates a second relay', async (t) => {
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  const { getDatabaseWithUrl } = require('firebase-admin/database');
  const { createTokenVerifier, getRelayAdminApp } = require('../server/firebaseAdmin');
  const env = { FIREBASE_PROJECT_ID: 'demo-nexus-startup',
    FIREBASE_DATABASE_URL: 'https://demo-nexus-startup-default-rtdb.firebaseio.com' };
  // Real Admin SDK, synthetic credentials, no token verification or database IO.
  const app = initializeApp({ projectId: env.FIREBASE_PROJECT_ID, credential: {
    getAccessToken: async () => { throw new Error('This startup regression must not request credentials or access the network.'); },
  } }, 'nexus-relay');
  t.after(() => deleteApp(app));
  assert.equal(typeof createTokenVerifier(env), 'function');
  assert.equal(getAuth(app).app, app);
  assert.equal(app.options.databaseURL, undefined); // Auth startup did not configure a default Database URL.
  const database = getDatabaseWithUrl(env.FIREBASE_DATABASE_URL, app);
  database.goOffline();
  assert.equal(getRelayAdminApp(env), app);
  // Admin intentionally rewrites the reference URL when the emulator is explicitly enabled.
  const expectedBase = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}` : env.FIREBASE_DATABASE_URL;
  assert.equal(database.ref('nexusStudio/relayV1').toString(), `${expectedBase}/nexusStudio/relayV1`);
  const documents = new Map();
  const listeners = new Map();
  const ref = t.mock.method(database, 'ref', (path) => ({
    on(type, callback) {
      assert.equal(type, 'value');
      listeners.set(path, callback);
      callback({ val: () => documents.get(path) });
      return callback;
    },
    off(type, callback) {
      assert.equal(type, 'value');
      assert.equal(listeners.get(path), callback);
      listeners.delete(path);
    },
    async transaction(update) {
      const value = update(documents.get(path));
      if (value === undefined) return { committed: false };
      documents.set(path, value);
      return { committed: true };
    },
  }));
  const original = createFirebaseStore(env);
  const customEnv = { ...env, NEXUS_RELAY_DB_PATH: 'nexusStudio/relayDevB' };
  const devB = createFirebaseStore(customEnv);
  for (const invalid of ['', 'nexusStudio', '/nexusStudio/relayDevB', 'nexusStudio/relayV1/sessions', 'nexusStudio/relay.devB']) {
    assert.throws(() => createFirebaseStore({ ...env, NEXUS_RELAY_DB_PATH: invalid }), /NEXUS_RELAY_DB_PATH/);
  }
  assert.deepEqual(ref.mock.calls.map((call) => call.arguments[0]), ['nexusStudio/relayV1', 'nexusStudio/relayDevB']);
  assert.equal((await original.load()).revision, 0);
  assert.equal((await devB.load()).revision, 0);
  const first = { schemaVersion: 1, revision: 1, devices: {}, sessions: { sameId: { code: 'ORIGIN' } } };
  const second = { ...first, sessions: { sameId: { code: 'DEVB01' } } };
  await original.commit(0, first);
  await devB.commit(0, second);
  devB.close();
  assert.deepEqual([...listeners.keys()], ['nexusStudio/relayV1']);

  const restarted = createFirebaseStore(customEnv);
  assert.deepEqual(await restarted.load(), second);
  await restarted.commit(1, { ...second, revision: 2, sessions: { sameId: { code: 'DEVB01', closedAt: 1 } } });
  assert.deepEqual(documents.get('nexusStudio/relayV1'), first);
  assert.equal(documents.get('nexusStudio/relayDevB').sessions.sameId.closedAt, 1);
  restarted.close();
  original.close();
  assert.equal(listeners.size, 0);
});
