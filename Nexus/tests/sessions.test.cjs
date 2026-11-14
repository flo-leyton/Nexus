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
  return async (deviceId) => {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.address().port}`);
    sockets.push(ws);
    await once(ws, 'open');
    const inbox = [];
    ws.on('message', (raw) => inbox.push(JSON.parse(String(raw))));
    const service = createSessionClient(deviceId, randomUUID, {
      connect() {},
      send(message) { ws.send(JSON.stringify(message)); return true; },
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
    });
    t.after(() => service.dispose());
    const wait = async (predicate) => {
      // Subscribe before sending; also handles a response already in the inbox.
      while (!inbox.some(predicate)) await once(ws, 'message');
      return inbox.find(predicate);
    };
    return { ws, inbox, service, wait, deviceId };
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
