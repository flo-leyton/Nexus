/* global __dirname */
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const WebSocket = require('ws');
const ts = require('typescript');
const protocol = require('../services/sessionProtocol.ts');

function loadTs(file, dependencies) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const { createSessionClient } = loadTs('../services/sessionClient.ts', { './sessionProtocol': protocol });
const { createLastNodeSessionStore } = loadTs('../services/lastNodeSession.ts', { './sessionProtocol': protocol });

async function harness(t) {
  let relay;
  class TestServer extends WebSocket.WebSocketServer {
    constructor(options) { super({ ...options, host: '127.0.0.1', port: 0 }); relay = this; }
  }
  const serverPath = path.resolve(__dirname, '../server/index.js');
  const serverRequire = createRequire(serverPath);
  vm.runInNewContext(fs.readFileSync(serverPath, 'utf8'), {
    require: (name) => name === 'ws' ? { WebSocketServer: TestServer, OPEN: WebSocket.OPEN } : serverRequire(name),
    console: { log() {}, error() {} },
  });
  await once(relay, 'listening');
  const sockets = [];
  t.after(async () => {
    sockets.forEach((s) => s.terminate());
    relay.clients.forEach((s) => s.terminate());
    await new Promise((resolve) => relay.close(resolve));
  });
  return async (deviceId, history) => {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.address().port}`);
    sockets.push(ws);
    await once(ws, 'open');
    const inbox = [], sent = [];
    ws.on('message', (raw) => inbox.push(JSON.parse(String(raw))));
    const service = createSessionClient(deviceId, randomUUID, {
      connect() {},
      send(message) { sent.push(message); ws.send(JSON.stringify(message)); return true; },
      subscribeMessages(listener) {
        const callback = (raw) => listener(String(raw));
        ws.on('message', callback);
        return () => ws.off('message', callback);
      },
      subscribeStatus(listener) {
        listener('Connected');
        const callback = () => listener('Disconnected');
        ws.on('close', callback);
        return () => ws.off('close', callback);
      },
    }, history);
    t.after(() => service.dispose());
    const wait = async (predicate) => {
      // Subscribe before sending; also handles a response already in the inbox.
      while (!inbox.some(predicate)) await once(ws, 'message');
      return inbox.find(predicate);
    };
    return { ws, inbox, sent, service, wait, deviceId };
  };
}
const request = (type, senderId, sessionId, payload = {}, targetId) => ({
  protocolVersion: 1, messageId: randomUUID(), type, senderId, sessionId, sentAt: Date.now(), payload,
  ...(targetId ? { targetId } : {}),
});
const replyTo = (id) => (m) => m.payload.requestId === id;

test('H1.1: service + relay create, admit 3 Nodes, reject, isolate sessions and disconnect', { timeout: 10000 }, async (t) => {
  const connect = await harness(t);
  const controller = await connect('controller');
  const other = await connect('other-controller');
  const outsider = await connect('outsider');
  const first = controller.service.createSession();
  const created = await controller.wait(replyTo(first.messageId));
  assert.equal(protocol.isSessionEvent(created), true);
  const sessionId = first.sessionId;
  const code = created.payload.session.code;
  const second = other.service.createSession();
  await other.wait(replyTo(second.messageId));
  const otherCount = other.inbox.length;
  const outsiderCount = outsider.inbox.length;
  const nodes = [];
  for (const id of ['node-1', 'node-2', 'node-3']) {
    const node = await connect(id);
    nodes.push(node);
    const joinId = node.service.requestJoin(` ${code.toLowerCase()} `);
    const pending = await controller.wait(replyTo(joinId));
    await node.wait(replyTo(joinId));
    assert.equal(pending.type, 'SESSION_JOIN_PENDING');
    assert.equal(controller.service.getSnapshot().sessions[sessionId].members[id], undefined);
    const decision = controller.service.acceptJoin(sessionId, id, joinId);
    await node.wait(replyTo(decision));
    await controller.wait(replyTo(decision));
    assert.equal(node.service.getSnapshot().sessions[sessionId].members[id].role, 'unassigned');
  }
  const members = controller.service.getSnapshot().sessions[sessionId].members;
  assert.equal(Object.keys(members).length, 4);
  assert.equal(new Set(nodes.map((n) => members[n.deviceId].nodeId)).size, 3);
  assert.equal(members.controller.kind, 'controller');
  assert.equal(other.inbox.length, otherCount);
  assert.equal(outsider.inbox.length, outsiderCount);
  assert.equal(controller.service.getSnapshot().pending[sessionId].length, 0);

  const rejected = await connect('rejected');
  const joinId = rejected.service.requestJoin(code);
  await controller.wait(replyTo(joinId));
  const rejectId = controller.service.rejectJoin(sessionId, rejected.deviceId, joinId);
  assert.equal((await rejected.wait((m) => m.type === 'SESSION_JOIN_REJECTED')).payload.requestId, joinId);
  await controller.wait(replyTo(rejectId));
  assert.equal(rejected.service.getSnapshot().sessions[sessionId], undefined);
  assert.throws(() => outsider.service.requestJoin('!!!!!!'), /INVALID_MESSAGE/);
  const crossSession = other.service.refreshSession(sessionId);
  assert.equal((await other.wait(replyTo(crossSession))).payload.code, 'NOT_MEMBER');
  // Query the second session after the attack as an ordering barrier.
  const refresh = other.service.refreshSession(second.sessionId);
  const ownSnapshot = await other.wait(replyTo(refresh));
  assert.deepEqual(Object.keys(ownSnapshot.payload.session.members), ['other-controller']);
});

test('H1.1: authorization, schema, code and target validation never leak to broadcast', { timeout: 10000 }, async (t) => {
  const connect = await harness(t);
  const c = await connect('controller');
  const n = await connect('node');
  const stranger = await connect('stranger');
  const spectator = await connect('spectator');
  const created = c.service.createSession();
  const { session } = (await c.wait(replyTo(created.messageId))).payload;
  const badCode = stranger.service.requestJoin('ZZZZZZ' === session.code ? 'YYYYYY' : 'ZZZZZZ');
  assert.equal((await stranger.wait(replyTo(badCode))).payload.code, 'INVALID_CODE');
  assert.throws(() => stranger.service.requestJoin('!!!!!!'), /INVALID_MESSAGE/);
  const join = n.service.requestJoin(session.code);
  await c.wait(replyTo(join));
  const accept = c.service.acceptJoin(session.sessionId, 'node', join);
  await c.wait(replyTo(accept));
  await n.wait(replyTo(accept));
  const before = [c, n, spectator].map((peer) => peer.inbox.length);
  stranger.ws.send('{invalid json');
  stranger.ws.send(JSON.stringify({ type: 'SESSION_CREATE' }));
  const attacks = [
    request('SESSION_GET', 'stranger', session.sessionId),
    request('SESSION_JOIN_ACCEPT', 'stranger', session.sessionId, { requestId: join }, 'node'),
    request('SESSION_GET', 'controller', session.sessionId), // spoof bound identity
    { ...request('SESSION_GET', 'stranger', session.sessionId), protocolVersion: 2 },
    { ...request('SESSION_GET', 'stranger', session.sessionId), senderId: '' },
    { ...request('SESSION_GET', 'stranger', session.sessionId), sessionId: '' },
    { ...request('SESSION_GET', 'stranger', session.sessionId), sentAt: 'now' },
    request('SESSION_JOIN_REQUEST', 'stranger', protocol.JOIN_BY_CODE, { code: 'bad' }),
    request('START_RECORDING', 'stranger', session.sessionId),
    { ...request('DEVICE_INFO_REQUEST', 'stranger', session.sessionId) },
    { ...request('SESSION_GET', 'stranger', session.sessionId), payload: [] },
  ];
  for (const attack of attacks) {
    stranger.ws.send(JSON.stringify(attack));
    assert.equal((await stranger.wait(replyTo(attack.messageId))).type, 'SESSION_ERROR');
  }
  assert.deepEqual([c, n, spectator].map((peer) => peer.inbox.length), before);
  const invalidTarget = c.service.acceptJoin(session.sessionId, 'stranger', join);
  assert.equal((await c.wait(replyTo(invalidTarget))).payload.code, 'INVALID_TARGET');
  const wrongRole = n.service.rejectJoin(session.sessionId, 'stranger', join);
  assert.equal((await n.wait(replyTo(wrongRole))).payload.code, 'CONTROLLER_REQUIRED');
  const duplicate = c.service.acceptJoin(session.sessionId, 'node', join);
  assert.equal((await c.wait(replyTo(duplicate))).payload.code, 'INVALID_TARGET');
  assert.equal(Object.keys(c.service.getSnapshot().sessions[session.sessionId].members).length, 2);
  const duplicateCreate = request('SESSION_CREATE', 'controller', session.sessionId);
  c.ws.send(JSON.stringify(duplicateCreate));
  assert.equal((await c.wait(replyTo(duplicateCreate.messageId))).payload.code, 'SESSION_EXISTS');
  const collision = await connect('controller');
  const collisionId = collision.service.refreshSession(session.sessionId);
  assert.equal((await collision.wait(replyTo(collisionId))).payload.code, 'IDENTITY_CONFLICT');
  const nClosed = once(n.ws, 'close');
  n.ws.close();
  await nClosed;
  await c.wait((m) => m.type === 'SESSION_SNAPSHOT' && !m.payload.session.members.node);
  assert.equal(n.service.getSnapshot().connection, 'Disconnected');
  c.ws.close();
  // Pending requests are explicitly notified when their Controller disappears.
  const owner = await connect('owner');
  const ownerCreated = owner.service.createSession();
  const ownerSession = (await owner.wait(replyTo(ownerCreated.messageId))).payload.session;
  const pendingId = stranger.service.requestJoin(ownerSession.code);
  await owner.wait(replyTo(pendingId));
  owner.ws.close();
  await stranger.wait((m) => m.type === 'SESSION_CLOSED');
});

test('session client ignores invalid or differently addressed events and reports disconnected sends', () => {
  let receive;
  let status;
  let disposed = 0;
  const service = createSessionClient('device', randomUUID, {
    connect() {}, send: () => false,
    subscribeMessages(listener) { receive = listener; return () => disposed++; },
    subscribeStatus(listener) { status = listener; listener('Disconnected'); return () => disposed++; },
  });
  assert.throws(() => service.createSession(), /SOCKET_NOT_CONNECTED/);
  for (const raw of ['{bad', JSON.stringify({ type: 'SESSION_SNAPSHOT' }), JSON.stringify({
    ...request('SESSION_ERROR', protocol.RELAY_ID, 'session', { requestId: randomUUID(), code: 'ERROR' }, 'other'),
  })]) receive(raw);
  assert.equal(service.getSnapshot().lastEvent, null);
  status('Connected');
  assert.equal(service.getSnapshot().connection, 'Connected');
  service.dispose();
  assert.equal(disposed, 2);
});

test('H1.3: 3 Nodes keep independent roles/readiness, authorization and role retransmission are isolated', { timeout: 10000 }, async (t) => {
  const connect = await harness(t);
  const c = await connect('controller');
  const foreign = await connect('foreign');
  const created = c.service.createSession();
  const session = (await c.wait(replyTo(created.messageId))).payload.session;
  const sid = session.sessionId;
  const members = () => c.service.getSnapshot().sessions[sid].members;
  const nodes = [];
  for (const id of ['node-1', 'node-2', 'node-3']) {
    const n = await connect(id);
    nodes.push(n);
    const join = n.service.requestJoin(session.code);
    await c.wait(replyTo(join));
    const accept = c.service.acceptJoin(sid, id, join);
    await n.wait(replyTo(accept));
    await c.wait(replyTo(accept));
  }
  const [a, b, third] = nodes;
  const original = c.service.assignRole(sid, a.deviceId, 'main-camera');
  await c.wait(replyTo(original));
  for (const [n, role] of [[b, 'side-camera'], [third, 'custom-angle']]) {
    const command = c.service.assignRole(sid, n.deviceId, role);
    await c.wait(replyTo(command));
    assert.equal(members()[n.deviceId].role, role);
  }
  const change = c.service.assignRole(sid, a.deviceId, 'detail-camera');
  await c.wait(replyTo(change));
  assert.equal(members()[a.deviceId].role, 'detail-camera');
  assert.equal(members()[b.deviceId].role, 'side-camera');
  assert.equal(members()[third.deviceId].role, 'custom-angle');
  // Retransmitting an old command cannot roll back a later confirmed role.
  c.ws.send(JSON.stringify({ ...request('ASSIGN_ROLE', c.deviceId, sid, { role: 'main-camera' }, a.deviceId), messageId: original }));
  const barrier = c.service.refreshSession(sid);
  await c.wait(replyTo(barrier));
  assert.equal(members()[a.deviceId].role, 'detail-camera');
  assert.equal(a.inbox.filter((m) => m.type === 'ASSIGN_ROLE' && m.messageId === original).length, 1);
  const conflict = { ...request('ASSIGN_ROLE', c.deviceId, sid, { role: 'other-role' }, a.deviceId), messageId: original };
  const errorEvent = once(c.ws, 'message');
  c.ws.send(JSON.stringify(conflict));
  assert.equal(JSON.parse(String((await errorEvent)[0])).payload.code, 'MESSAGE_ID_CONFLICT');

  const ready = { cameraPermission: 'granted', cameraAvailable: true, enginePrepared: true, error: null };
  const denied = { ...ready, cameraPermission: 'denied', enginePrepared: false };
  const unavailable = { ...ready, cameraAvailable: false, enginePrepared: false };
  for (const [n, state] of [[a, ready], [b, denied], [third, unavailable]]) {
    const report = n.service.reportNodeState(sid, c.deviceId, state);
    await c.wait(replyTo(report));
  }
  assert.equal(protocol.readinessReasons(members()[a.deviceId].readiness).length, 0);
  assert.ok(protocol.readinessReasons(members()[b.deviceId].readiness).includes('Permiso de cámara denegado'));
  assert.ok(protocol.readinessReasons(members()[third.deviceId].readiness).includes('Cámara no disponible'));
  const thirdReady = third.service.reportNodeState(sid, c.deviceId, ready);
  await c.wait(replyTo(thirdReady));
  assert.equal(protocol.readinessReasons(members()[third.deviceId].readiness).length, 0);
  assert.equal(members()[b.deviceId].readiness.cameraPermission, 'denied');

  const other = foreign.service.createSession();
  await foreign.wait(replyTo(other.messageId));
  const foreignCount = foreign.inbox.length;
  const attacks = [
    [foreign, () => foreign.service.assignRole(sid, a.deviceId, 'attacker'), 'NOT_MEMBER'],
    [a, () => a.service.assignRole(sid, b.deviceId, 'attacker'), 'CONTROLLER_REQUIRED'],
    [c, () => c.service.assignRole(sid, foreign.deviceId, 'attacker'), 'INVALID_TARGET'],
    [a, () => a.service.reportNodeState(sid, b.deviceId, ready), 'INVALID_TARGET'],
    [foreign, () => foreign.service.reportNodeState(sid, c.deviceId, ready), 'NOT_MEMBER'],
    [c, () => c.service.reportNodeState(sid, c.deviceId, ready), 'NODE_REQUIRED'],
  ];
  for (const [peer, send, code] of attacks) {
    const id = send();
    assert.equal((await peer.wait(replyTo(id))).payload.code, code);
  }
  assert.equal(foreign.inbox.length, foreignCount + 2); // only its own rejected attacks
  assert.equal(members()[a.deviceId].role, 'detail-camera');
  assert.equal(members()[b.deviceId].readiness.cameraPermission, 'denied');
  assert.throws(() => a.service.reportNodeState(sid, c.deviceId, { ...ready, cameraPermission: 'denied' }), /INVALID_MESSAGE/);
  const beforeInvalidState = c.inbox.length;
  const invalidState = request('NODE_STATE', a.deviceId, sid, { readiness: { ...ready, cameraPermission: 'denied' } }, c.deviceId);
  a.ws.send(JSON.stringify(invalidState));
  assert.equal((await a.wait(replyTo(invalidState.messageId))).payload.code, 'INVALID_MESSAGE');
  assert.equal(c.inbox.length, beforeInvalidState);
  const wrongAck = request('SESSION_ROLE_ACK', b.deviceId, sid, { requestId: original }, c.deviceId);
  b.ws.send(JSON.stringify(wrongAck));
  assert.equal((await b.wait(replyTo(wrongAck.messageId))).payload.code, 'INVALID_TARGET');
  // Disconnect a READY Node: the Controller's actual snapshot must no longer include it.
  const beforeDisconnect = c.inbox.length;
  third.ws.close();
  await c.wait((m) => c.inbox.indexOf(m) >= beforeDisconnect && m.type === 'SESSION_SNAPSHOT' && m.payload.session.sessionId === sid && !m.payload.session.members[third.deviceId]);
  assert.equal(members()[third.deviceId], undefined);
  assert.ok(protocol.readinessReasons(undefined).length > 0);
  assert.equal(members()[a.deviceId].readiness.enginePrepared, true);
});

test('H1.3: readiness requires every condition; stale camera callbacks cannot restore READY', async () => {
  const { CaptureEngine } = loadTs('../services/captureEngine.ts', { './sessionProtocol': protocol });
  let permission = { granted: true, canAskAgain: true, status: 'granted' };
  let available = true;
  const engine = new CaptureEngine({
    getPermission: async () => permission, requestPermission: async () => permission, isAvailable: async () => available,
  });
  await engine.prepare();
  assert.ok(protocol.readinessReasons(engine.getSnapshot().readiness).length > 0);
  const generation = engine.getSnapshot().generation;
  engine.cameraReady(generation);
  assert.equal(protocol.readinessReasons(engine.getSnapshot().readiness).length, 0);
  engine.deactivate();
  engine.cameraReady(generation);
  assert.equal(engine.getSnapshot().readiness.enginePrepared, false);
  permission = { granted: false, canAskAgain: false, status: 'denied' };
  await engine.prepare();
  engine.cameraReady(engine.getSnapshot().generation);
  assert.equal(engine.getSnapshot().readiness.enginePrepared, false);
  permission = { granted: true, canAskAgain: true, status: 'granted' };
  available = false;
  await engine.prepare();
  engine.cameraReady(engine.getSnapshot().generation);
  assert.equal(engine.getSnapshot().readiness.enginePrepared, false);
  available = true;
  await engine.prepare();
  engine.cameraFailed(engine.getSnapshot().generation, 'Camera busy');
  engine.cameraReady(engine.getSnapshot().generation);
  assert.equal(engine.getSnapshot().readiness.enginePrepared, false);
  assert.match(engine.getSnapshot().readiness.error, /Camera busy/);
  assert.ok(protocol.readinessReasons({ cameraPermission: 'granted', cameraAvailable: true, enginePrepared: true, error: null }, false).length > 0);
  let finishPermission;
  const delayed = new CaptureEngine({ getPermission: () => new Promise((resolve) => { finishPermission = resolve; }), requestPermission: async () => permission, isAvailable: async () => true });
  const pending = delayed.prepare();
  delayed.deactivate();
  finishPermission(permission);
  await pending;
  assert.equal(delayed.getSnapshot().active, false);
  assert.equal(delayed.getSnapshot().readiness.enginePrepared, false);
  // SDK 54 native has no availability preflight: only the native ready callback confirms it.
  const native = new CaptureEngine({ getPermission: async () => permission, requestPermission: async () => permission, isAvailable: async () => null });
  await native.prepare();
  assert.equal(native.getSnapshot().readiness.cameraAvailable, null);
  assert.ok(protocol.readinessReasons(native.getSnapshot().readiness).length > 0);
  native.cameraReady(native.getSnapshot().generation);
  assert.equal(native.getSnapshot().readiness.cameraAvailable, true);
  assert.equal(protocol.readinessReasons(native.getSnapshot().readiness).length, 0);
});

test('H1.3: relay expires silent READY and missing role ACK without trusting client timestamps', () => {
  let now = Date.now();
  let tick;
  const module = { exports: {} };
  const serverPath = path.resolve(__dirname, '../server/sessions.js');
  const serverRequire = createRequire(serverPath);
  vm.runInNewContext(fs.readFileSync(serverPath, 'utf8'), {
    module, require: serverRequire, Date: { now: () => now },
    setInterval(callback) { tick = callback; return { unref() {} }; }, clearInterval() {},
  });
  const relay = module.exports.attachSessions({ on() {} });
  const c = { readyState: 1, inbox: [], send(raw) { this.inbox.push(JSON.parse(raw)); } };
  const n = { readyState: 1, inbox: [], send(raw) { this.inbox.push(JSON.parse(raw)); } };
  const handle = (peer, message) => relay.handle(peer, JSON.stringify(message));
  handle(c, request('SESSION_CREATE', 'controller', 'session'));
  const code = c.inbox.at(-1).payload.session.code;
  const join = request('SESSION_JOIN_REQUEST', 'node', protocol.JOIN_BY_CODE, { code });
  handle(n, join);
  handle(c, request('SESSION_JOIN_ACCEPT', 'controller', 'session', { requestId: join.messageId }, 'node'));
  const ready = { cameraPermission: 'granted', cameraAvailable: true, enginePrepared: true, error: null };
  handle(n, { ...request('NODE_STATE', 'node', 'session', { readiness: ready }, 'controller'), sentAt: now + 999999 });
  assert.equal(c.inbox.at(-1).payload.session.members.node.readiness.enginePrepared, true);
  now += protocol.NODE_STATE_TTL_MS + 1;
  tick();
  assert.equal(c.inbox.at(-1).payload.session.members.node.readiness.enginePrepared, false);
  assert.match(c.inbox.at(-1).payload.session.members.node.readiness.error, /vencido/);
  const command = request('ASSIGN_ROLE', 'controller', 'session', { role: 'side-camera' }, 'node');
  handle(c, command);
  assert.equal(n.inbox.at(-1).type, 'ASSIGN_ROLE');
  handle(c, request('SESSION_GET', 'controller', 'session'));
  assert.equal(c.inbox.at(-1).payload.session.members.node.role, 'unassigned');
  handle(c, request('SESSION_ROLE_ACK', 'controller', 'session', { requestId: command.messageId }, 'controller'));
  assert.equal(c.inbox.at(-1).payload.code, 'INVALID_TARGET');
  now += 10001;
  tick();
  assert.equal(c.inbox.at(-1).payload.code, 'ROLE_ACK_TIMEOUT');
  handle(n, request('SESSION_ROLE_ACK', 'node', 'session', { requestId: command.messageId }, 'controller'));
  assert.equal(n.inbox.at(-1).payload.code, 'ROLE_ACK_TIMEOUT');
  handle(c, request('SESSION_GET', 'controller', 'session'));
  assert.equal(c.inbox.at(-1).payload.session.members.node.role, 'unassigned');
});

function memoryHistory() {
  const data = new Map();
  const storage = { async getItem(key) { return data.get(key) ?? null; }, async setItem(key, value) { data.set(key, value); }, async removeItem(key) { data.delete(key); } };
  const store = createLastNodeSessionStore(storage);
  return { data, storage, store, async options() { return { initial: await store.load(), save: store.save }; } };
}
async function createForRejoin(controller) {
  const request = controller.service.createSession();
  return (await controller.wait(replyTo(request.messageId))).payload.session;
}
async function approveForRejoin(c, n, session, joinId) {
  const id = joinId ?? n.service.requestJoin(session.code);
  await c.wait(replyTo(id));
  const accept = c.service.acceptJoin(session.sessionId, n.deviceId, id);
  await n.wait(replyTo(accept)); await c.wait(replyTo(accept));
  return n.service.getSnapshot().sessions[session.sessionId].members[n.deviceId];
}

test('rejoin: remembered session survives disconnect/reload but needs new approval, identity and READY', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), other = await connect('other-node');
  const memory = memoryHistory(), first = await connect('returning-node', await memory.options());
  const s = await createForRejoin(c);
  const original = await approveForRejoin(c, first, s);
  await approveForRejoin(c, other, s);
  const role = c.service.assignRole(s.sessionId, first.deviceId, 'main-camera'); await c.wait(replyTo(role));
  const ready = { cameraPermission: 'granted', cameraAvailable: true, enginePrepared: true, error: null };
  const update = first.service.reportNodeState(s.sessionId, c.deviceId, ready); await c.wait(replyTo(update));
  assert.equal((await memory.store.load()).sessionId, s.sessionId);
  assert.equal(c.service.getSnapshot().lastNodeSession, null); // Controllers do not save a Node hint
  const cutoff = c.inbox.length;
  first.ws.close(); await once(first.ws, 'close');
  await c.wait((m) => c.inbox.indexOf(m) >= cutoff && m.type === 'SESSION_SNAPSHOT' && !m.payload.session.members[first.deviceId]);
  assert.equal(first.service.getSnapshot().lastNodeSession.sessionId, s.sessionId);
  const n = await connect(first.deviceId, await memory.options());
  assert.equal(n.service.getSnapshot().connection, 'Connected');
  assert.equal(n.service.getSnapshot().sessions[s.sessionId], undefined);
  assert.equal(n.sent.length, 0); // recovery never auto-sends or restores authorization
  const join = n.service.requestRejoin();
  assert.equal(n.service.requestRejoin(), join); // two presses, one request on the wire
  await c.wait(replyTo(join)); await n.wait(replyTo(join));
  assert.equal(n.service.requestRejoin(), join); // also deduplicated while waiting for human approval
  assert.equal(n.sent.filter((m) => m.type === 'SESSION_JOIN_REQUEST').length, 1);
  assert.equal(c.service.getSnapshot().pending[s.sessionId].filter((r) => r.deviceId === n.deviceId).length, 1);
  const unauthorized = n.service.refreshSession(s.sessionId);
  assert.equal((await n.wait(replyTo(unauthorized))).payload.code, 'NOT_MEMBER');
  const rejoined = await approveForRejoin(c, n, s, join);
  assert.notEqual(rejoined.nodeId, original.nodeId);
  assert.equal(rejoined.deviceId, original.deviceId);
  assert.equal(rejoined.role, 'unassigned');
  assert.equal(rejoined.readiness.enginePrepared, false);
  assert.equal(rejoined.readiness.cameraPermission, 'unknown');
  assert.equal(n.service.getSnapshot().joinInFlight, false);
  assert.equal(Object.keys(c.service.getSnapshot().sessions[s.sessionId].members).length, 3);
  assert.ok(c.service.getSnapshot().sessions[s.sessionId].members[other.deviceId]);
  assert.throws(() => n.service.requestRejoin(), /ALREADY_MEMBER/);
});

test('rejoin: rejection allows a new explicit request; closing the session clears its remembered hint', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), memory = memoryHistory();
  const s = await createForRejoin(c);
  await memory.store.save({ sessionId: s.sessionId, code: s.code });
  const n = await connect('node', await memory.options());
  const first = n.service.requestRejoin(); await c.wait(replyTo(first));
  c.service.rejectJoin(s.sessionId, n.deviceId, first);
  await n.wait((m) => m.type === 'SESSION_JOIN_REJECTED');
  assert.equal(n.service.getSnapshot().joinInFlight, false);
  assert.equal(n.service.getSnapshot().sessions[s.sessionId], undefined);
  const second = n.service.requestRejoin(); assert.notEqual(first, second); await c.wait(replyTo(second));
  c.ws.close(); await once(c.ws, 'close');
  await n.wait((m) => m.type === 'SESSION_CLOSED');
  assert.equal(n.service.getSnapshot().lastNodeSession, null);
  assert.equal(await memory.store.load(), null);
  assert.equal(n.service.getSnapshot().joinInFlight, false);
  assert.throws(() => n.service.requestRejoin(), /NO_REMEMBERED_SESSION/);
});

test('rejoin: ended/mismatched session cannot reuse another session code; manual joining remains available', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), memory = memoryHistory();
  const live = await createForRejoin(c);
  // Simulates a cached code reused after a relay restart, or locally edited metadata.
  await memory.store.save({ sessionId: 'old-session-id', code: live.code });
  const n = await connect('node', await memory.options());
  const rejoin = n.service.requestRejoin();
  assert.equal((await n.wait(replyTo(rejoin))).payload.code, 'SESSION_NOT_FOUND');
  assert.equal(n.service.getSnapshot().lastNodeSession, null);
  assert.equal(await memory.store.load(), null);
  const barrier = c.service.refreshSession(live.sessionId); await c.wait(replyTo(barrier));
  assert.equal(c.service.getSnapshot().pending[live.sessionId].length, 0);
  assert.equal(c.service.getSnapshot().sessions[live.sessionId].members[n.deviceId], undefined);
  await approveForRejoin(c, n, live);
  assert.equal(n.service.getSnapshot().lastNodeSession.sessionId, live.sessionId);
});

test('rejoin: local storage validates hints, serializes writes and never persists membership or READY', async () => {
  const h = memoryHistory();
  await h.store.save({ sessionId: 'session', code: 'ABC123' });
  const loaded = await createLastNodeSessionStore(h.storage).load();
  assert.deepEqual(Object.keys(loaded).sort(), ['code', 'sessionId']);
  const save = h.store.save({ sessionId: 'new-session', code: 'DEF456' });
  const clear = h.store.save(null);
  await Promise.all([save, clear]); assert.equal(await h.store.load(), null);
  const key = '@nexus/last-node-session-v1';
  for (const raw of ['{broken', '{"sessionId":"__proto__","code":"ABC123"}', '{"sessionId":"x","code":"ABC123","authorized":true}']) {
    h.data.set(key, raw); assert.equal(await h.store.load(), null);
  }
});

test('rejoin: a storage write failure does not revoke a real approval or disable manual joining', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller');
  const n = await connect('node', { initial: null, async save() { throw new Error('storage unavailable'); } });
  const s = await createForRejoin(c); await approveForRejoin(c, n, s);
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(n.service.getSnapshot().historyError, /No se pudo guardar/);
  assert.ok(n.service.getSnapshot().sessions[s.sessionId].members[n.deviceId]);
  assert.equal(n.service.getSnapshot().lastNodeSession.sessionId, s.sessionId);
});

test('rejoin: updates from an older membership do not overwrite the latest accepted session', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), memory = memoryHistory();
  const n = await connect('node', await memory.options());
  const old = await createForRejoin(c), latest = await createForRejoin(c);
  await approveForRejoin(c, n, old); await approveForRejoin(c, n, latest);
  const update = n.service.reportNodeState(old.sessionId, c.deviceId,
    { cameraPermission: 'granted', cameraAvailable: true, enginePrepared: true, error: null });
  await n.wait(replyTo(update));
  assert.equal(n.service.getSnapshot().lastNodeSession.sessionId, latest.sessionId);
  assert.equal((await memory.store.load()).sessionId, latest.sessionId);
});
