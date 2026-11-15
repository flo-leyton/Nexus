/* global __dirname */
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const WebSocket = require('ws');
const ts = require('typescript');
const protocol = require('../services/sessionProtocol.ts');
const relayProtocol = require('../services/relayProtocol.ts');
const { resolvePort } = require('../server/relay');
const { startTestRelay, authenticate } = require('./helpers/relay.cjs');
const { DEVICE_FIELDS } = require('../services/deviceProtocol.ts');

function load(file, dependencies, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, Error, URL, Date, setTimeout, clearTimeout, ...globals,
    require(name) { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; } });
  return exports;
}
const turn = () => new Promise(setImmediate);
const request = (type, senderId, sessionId, payload = {}, targetId) => ({ type, senderId, sessionId, payload, targetId,
  protocolVersion: 1, messageId: randomUUID(), sentAt: Date.now() });
async function rawClient(t, runtime) {
  const ws = new WebSocket(`ws://127.0.0.1:${runtime.server.address().port}`);
  t.after(() => ws.terminate()); await once(ws, 'open'); return ws;
}
const nextJson = async (ws) => JSON.parse(String((await once(ws, 'message'))[0]));

test('H3.4a: LAN fallback, explicit development URL and strict production wss URL', () => {
  const { resolveRelayUrl } = load('../config/relay.ts', { './server': { SERVER_CONFIG: { SOCKET_URL: 'ws://192.168.1.20:8080' } } });
  assert.equal(resolveRelayUrl(undefined, true), 'ws://192.168.1.20:8080/');
  assert.equal(resolveRelayUrl(' wss://relay.example/studio ', true), 'wss://relay.example/studio');
  assert.equal(resolveRelayUrl('wss://relay.example', false), 'wss://relay.example/');
  for (const url of [undefined, '', 'ws://relay.example', 'https://relay.example', 'wss://user:token@relay.example', 'wss://relay.example?token=secret', 'wss://relay.example/#x', 'invalid']) {
    assert.throws(() => resolveRelayUrl(url, false), /wss|WebSocket|inválida/);
  }
});

test('H3.4a: health and WebSocket share the listening port; PORT is independent of app URL', async (t) => {
  assert.equal(resolvePort(undefined, 8080), 8080); assert.equal(resolvePort('12345', 8080), 12345);
  for (const value of ['', '0', '-1', '65536', '8080bad']) assert.throws(() => resolvePort(value, 8080), /PORT/);
  const runtime = await startTestRelay(t, { host: '0.0.0.0' });
  assert.equal(runtime.server.address().address, '0.0.0.0');
  const response = await fetch(`http://127.0.0.1:${runtime.server.address().port}/health`);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ready: true });
  assert.equal((await fetch(`http://127.0.0.1:${runtime.server.address().port}/private`)).status, 404);
  const ws = await rawClient(t, runtime); await authenticate(ws, 'device');
});

test('H3.4a: unauthenticated Studio, presence and legacy traffic cannot send or observe broadcasts', async (t) => {
  const runtime = await startTestRelay(t);
  const authorized = await rawClient(t, runtime); await authenticate(authorized, 'authorized');
  const info = Object.fromEntries(Object.keys(DEVICE_FIELDS).map((key) => [key, null]));
  for (const message of [request('SESSION_CREATE', 'intruder', 'foreign'), { type: 'DEVICE_INFO', info },
    { type: 'DEVICE_INFO_REQUEST' }, { type: 'CAPABILITY_COMMAND', action: 'flash_on' }]) {
    const ws = await rawClient(t, runtime), received = [];
    ws.on('message', (raw) => received.push(JSON.parse(String(raw))));
    const rejected = nextJson(ws);
    ws.send(JSON.stringify(message)); assert.equal((await rejected).code, 'AUTH_REQUIRED');
    await once(ws, 'close');
    assert.equal(received.some((m) => m.type === 'DEVICE_INFO' || m.type === 'SESSION_SNAPSHOT'), false);
  }
  const unauthenticated = await rawClient(t, runtime), observed = [];
  unauthenticated.on('message', (raw) => observed.push(JSON.parse(String(raw))));
  authorized.send(JSON.stringify({ type: 'DEVICE_INFO', info }));
  const barrier = nextJson(authorized);
  authorized.send(JSON.stringify(request('SESSION_CREATE', 'authorized', 'session'))); await barrier;
  assert.equal(observed.length, 0);
});

test('H3.4a: invalid token, expired token, duplicate socket and another uid cannot impersonate device', async (t) => {
  const runtime = await startTestRelay(t, { verifyToken: async (token) => {
    if (token === 'invalid') throw new Error('sensitive provider detail');
    return { uid: token, exp: Math.floor(Date.now() / 1000) + (token === 'expired' ? -10 : 3600) };
  } });
  for (const [idToken, expected] of [['invalid', 'AUTH_INVALID_TOKEN'], ['expired', 'AUTH_EXPIRED']]) {
    const ws = await rawClient(t, runtime), next = nextJson(ws);
    ws.send(JSON.stringify({ type: 'SOCKET_AUTH', protocolVersion: 1, deviceId: 'device', idToken }));
    const error = await next; assert.equal(error.code, expected); assert.equal(JSON.stringify(error).includes('sensitive'), false);
  }
  const owner = await rawClient(t, runtime); await authenticate(owner, 'device', 'uid-owner');
  for (const token of ['uid-owner', 'uid-foreign']) {
    const ws = await rawClient(t, runtime), next = nextJson(ws);
    ws.send(JSON.stringify({ type: 'SOCKET_AUTH', protocolVersion: 1, deviceId: 'device', idToken: token }));
    assert.equal((await next).code, 'AUTH_DEVICE_CONFLICT');
  }
  const forged = nextJson(owner);
  owner.send(JSON.stringify(request('SESSION_CREATE', 'another-device', 'session')));
  assert.equal((await forged).payload.code, 'IDENTITY_CONFLICT');
  owner.close(); await once(owner, 'close');
  const foreign = await rawClient(t, runtime), rejected = nextJson(foreign);
  foreign.send(JSON.stringify({ type: 'SOCKET_AUTH', protocolVersion: 1, deviceId: 'device', idToken: 'uid-foreign' }));
  assert.equal((await rejected).code, 'AUTH_DEVICE_CONFLICT'); // binding remains after disconnect, within this process
});

test('H3.4a: authentication timeout and token expiry close access; renewal retains Session and identity', async (t) => {
  const runtime = await startTestRelay(t, { authTimeoutMs: 100, verifyToken: async (token) => ({ uid: 'owner', exp:
    token === 'short' ? Date.now() / 1000 + 0.25 : Math.floor(Date.now() / 1000) + 3600 }) });
  const idle = await rawClient(t, runtime); assert.equal((await nextJson(idle)).code, 'AUTH_TIMEOUT');
  const expired = await rawClient(t, runtime); await authenticate(expired, 'short-device', 'short');
  assert.equal((await nextJson(expired)).code, 'AUTH_EXPIRED');
  const c = await rawClient(t, runtime); await authenticate(c, 'controller', 'fresh');
  let next = nextJson(c); c.send(JSON.stringify(request('SESSION_CREATE', 'controller', 'session'))); await next;
  await authenticate(c, 'controller', 'renewed');
  next = nextJson(c); c.send(JSON.stringify(request('SESSION_GET', 'controller', 'session')));
  assert.equal((await next).payload.session.sessionId, 'session');
  const bad = nextJson(c); c.send(JSON.stringify({ type: 'SOCKET_AUTH', protocolVersion: 1, deviceId: 'other-device', idToken: 'fresh' }));
  assert.equal((await bad).code, 'AUTH_IDENTITY_CHANGE');
});

function clientFixture(t, extra = {}) {
  const sockets = [], refreshes = [];
  let identityListener;
  const { createSocketClient } = load('../services/socketClient.ts', { './sessionProtocol': protocol, './relayProtocol': relayProtocol }, extra);
  const credentials = { uid: 'uid', deviceId: 'device', idToken: 'token' };
  const client = createSocketClient({ url: () => 'wss://relay.example', credentials: async () => {
    refreshes.push(true); return { ...credentials, idToken: `token-${refreshes.length}` };
  }, identityChanged(fn) { identityListener = fn; return () => {}; }, create(url) {
    const socket = { url, readyState: 0, sent: [], close() { this.readyState = 3; this.onclose?.(); }, send(raw) { this.sent.push(JSON.parse(raw)); } };
    sockets.push(socket); return socket;
  } });
  t.after(() => client.dispose());
  const authorize = (socket) => { socket.readyState = 1; socket.onopen(); socket.onmessage({ data: JSON.stringify({ type: 'SOCKET_AUTH_OK', uid: 'uid', deviceId: 'device', expiresAt: Date.now() + 3600000 }) }); };
  return { client, sockets, refreshes, credentials, authorize, identityChanged: (uid) => identityListener(uid) };
}

test('H3.4a: shared socket gates presence until AUTH_OK; reconnect fetches token and never replays REC/STOP', async (t) => {
  const h = clientFixture(t), statuses = [];
  h.client.subscribeStatus((s) => statuses.push(s));
  h.client.connect(); h.client.connect(); await turn();
  assert.equal(h.sockets.length, 1); assert.equal(h.client.send({ type: 'DEVICE_INFO' }), false);
  h.sockets[0].readyState = 1; h.sockets[0].onopen();
  assert.equal(statuses.at(-1), 'Connecting'); assert.equal(h.client.send({ type: 'START_RECORDING' }), false);
  assert.deepEqual(h.sockets[0].sent[0], { type: 'SOCKET_AUTH', protocolVersion: 1, deviceId: 'device', idToken: 'token-1' });
  h.authorize(h.sockets[0]);
  for (const type of ['DEVICE_INFO', 'START_RECORDING', 'STOP_RECORDING']) assert.equal(h.client.send({ type }), true);
  h.client.connect(); assert.equal(h.sockets.length, 1);
  h.sockets[0].onclose(); h.client.connect(); h.client.connect(); await turn();
  assert.equal(h.sockets.length, 2); h.authorize(h.sockets[1]);
  assert.equal(h.refreshes.length, 2); assert.equal(h.sockets[1].sent[0].idToken, 'token-2');
  assert.equal(h.sockets[1].sent.some((m) => ['START_RECORDING', 'STOP_RECORDING'].includes(m.type)), false);
  h.sockets[0].onerror(); assert.equal(statuses.at(-1), 'Connected');
  h.identityChanged('foreign-uid'); assert.equal(statuses.at(-1), 'Error'); assert.match(h.client.getError(), /cuenta/);
});

test('H3.4a: renew credentials in the same socket without reconnect status or command replay', async (t) => {
  const timers = new Map(); let sequence = 0;
  const h = clientFixture(t, { setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); } });
  h.client.connect(); await turn(); h.authorize(h.sockets[0]);
  const [key, timer] = [...timers].find(([, value]) => value.ms > 15000); timers.delete(key); timer.fn(); await turn();
  assert.equal(h.sockets.length, 1); assert.equal(h.refreshes.length, 2);
  assert.equal(h.sockets[0].sent.at(-1).idToken, 'token-2');
  assert.equal(h.sockets[0].sent.every((m) => m.type === 'SOCKET_AUTH'), true);
});

test('H3.4a: reconnect waits for an asynchronously closing socket before opening another', async (t) => {
  const h = clientFixture(t); h.client.connect(); await turn(); h.authorize(h.sockets[0]);
  const old = h.sockets[0]; old.close = () => { old.readyState = 2; };
  h.client.disconnect(); h.client.connect(); h.client.connect(); await turn();
  assert.equal(h.sockets.length, 1);
  old.readyState = 3; old.onclose(); await turn();
  assert.equal(h.sockets.length, 2); assert.equal(h.refreshes.length, 2);
});

test('H3.4a: missing URL/Auth or invalid authorization shows explicit error and never connects', async (t) => {
  const { createSocketClient } = load('../services/socketClient.ts', { './sessionProtocol': protocol, './relayProtocol': relayProtocol });
  for (const message of ['Falta EXPO_PUBLIC_RELAY_URL', 'Firebase no configurado']) {
    const client = createSocketClient({ url: () => { if (message.startsWith('Falta')) throw new Error(message); return 'wss://relay.example'; },
      credentials: async () => { throw new Error(message); }, create: () => assert.fail() });
    client.connect(); await turn(); assert.equal(client.getError(), message); assert.equal(client.send({ type: 'DEVICE_INFO_REQUEST' }), false); client.dispose();
  }
  const h = clientFixture(t); h.client.connect(); await turn();
  h.sockets[0].onmessage({ data: JSON.stringify({ type: 'SOCKET_AUTH_ERROR', code: 'AUTH_INVALID_TOKEN' }) });
  assert.match(h.client.getError(), /Firebase rechazó/); assert.equal(h.client.send({ type: 'DEVICE_INFO' }), false);
});

test('H3.4a: Firebase restores existing/anonymous identity, signs in once and forces fresh ID tokens', async () => {
  const calls = [], auth = { currentUser: null, authStateReady: async () => { calls.push('restore'); } };
  const user = { uid: 'persistent-anonymous', getIdToken: async (force) => { calls.push(force); return 'id-token'; } };
  const dependencies = { '../app/firebase': { auth }, './deviceIdentity': { getOrCreateDeviceId: async () => 'device' },
    'firebase/auth': { signInAnonymously: async () => { calls.push('anonymous'); await turn(); auth.currentUser = user; }, onAuthStateChanged() {} } };
  const service = load('../services/studioIdentity.ts', dependencies);
  await Promise.all([service.getStudioCredentials(), service.getStudioCredentials()]);
  assert.equal(calls.filter((c) => c === 'anonymous').length, 1); assert.equal(calls.filter((c) => c === true).length, 2);
  const reopened = load('../services/studioIdentity.ts', dependencies); await reopened.getStudioCredentials();
  assert.equal(calls.filter((c) => c === 'anonymous').length, 1);
  auth.currentUser = { ...user, uid: 'signed-in-account' };
  assert.equal((await service.getStudioCredentials()).uid, 'signed-in-account');
});

test('H3.4a: absent Firebase and disabled Anonymous Auth fail explicitly without faking identity', async () => {
  const dependencies = { '../app/firebase': { auth: null }, './deviceIdentity': {}, 'firebase/auth': {} };
  await assert.rejects(load('../services/studioIdentity.ts', dependencies).getStudioCredentials(), /Firebase no configurado/);
  dependencies['../app/firebase'].auth = { currentUser: null, authStateReady: async () => {} };
  dependencies['firebase/auth'] = { signInAnonymously: async () => { throw { code: 'auth/operation-not-allowed' }; } };
  await assert.rejects(load('../services/studioIdentity.ts', dependencies).getStudioCredentials(), /Anonymous Authentication no está habilitado/);
});

test('H3.4a: server entry uses process PORT while Firebase Admin verifies tokens with revocation checks', async () => {
  let selectedPort, initialization, verified;
  const server = { on() {} };
  load('../server/index.js', {
    '../config/server.ts': { SERVER_CONFIG: { PORT: 8080 } },
    './relay': { resolvePort, createRelay(options) { selectedPort = options.port; return { server }; } },
    './firebaseAdmin': { createTokenVerifier: () => async () => {} },
  }, { process: { env: { PORT: '45678' } }, console: { log() {}, error() {} } });
  assert.equal(selectedPort, 45678);
  // Exercise the actual server-only adapter with an injected Admin SDK, no credentials or network.
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server/firebaseAdmin.js'), 'utf8'), { module, process: { env: {} }, Error,
    require(name) {
      if (name === 'firebase-admin/app') return { getApps: () => [], applicationDefault: () => 'ADC',
        initializeApp(options) { initialization = options; return {}; }, cert: () => 'certificate' };
      assert.equal(name, 'firebase-admin/auth');
      return { getAuth: () => ({ verifyIdToken: async (token, revoked) => { verified = { token, revoked }; return { uid: 'verified-user' }; } }) };
    },
  });
  assert.throws(() => module.exports.createTokenVerifier({}), /Firebase Admin no configurado/);
  const verify = module.exports.createTokenVerifier({ FIREBASE_PROJECT_ID: 'server-project' });
  assert.equal((await verify('test-token')).uid, 'verified-user');
  assert.equal(initialization.projectId, 'server-project'); assert.deepEqual(verified, { token: 'test-token', revoked: true });
});
