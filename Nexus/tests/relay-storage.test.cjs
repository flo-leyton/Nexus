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
async function ready(n, s) { await n.call('NODE_STATE', s.sessionId, { readiness }, s.controllerId); }
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
  assert.equal(JSON.parse(String((await rejected)[0])).code, 'AUTH_DEVICE_CONFLICT');
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
  assert.equal(restored.take.interrupted.reason, 'relay-restarted'); assert.equal(restored.take.nodes.node.capture, null);
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

test('H3.4b regression: Auth-first Admin initialization uses the explicit RTDB URL on the same app', async (t) => {
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
  const store = createFirebaseStore(env); // Old getDatabase(app, url) fails here.
  assert.equal(getRelayAdminApp(env), app);
  assert.equal(database.ref('nexusStudio/relayV1').toString(), `${env.FIREBASE_DATABASE_URL}/nexusStudio/relayV1`);
  assert.equal(typeof store.load, 'function'); assert.equal(typeof store.commit, 'function');
  store.close();
});
