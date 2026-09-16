const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const { networkInterfaces } = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const test = require('node:test');
const WebSocket = require('ws');
const ts = require('typescript');
const { SERVER_CONFIG } = require('../config/server.ts');
const { DEVICE_FIELDS, isDeviceInfo } = require('../services/deviceProtocol.ts');

test('relay: fichas, llegada tardía, comandos intactos y desconexión', { timeout: 10000 }, async (t) => {
  let relay;
  class TestServer extends WebSocket.WebSocketServer {
    constructor(options) {
      // Puerto efímero para no interferir con el servidor del usuario.
      super({ ...options, port: 0 });
      relay = this;
    }
  }
  const serverPath = path.resolve(__dirname, '../server/index.js');
  const serverRequire = createRequire(serverPath);
  vm.runInNewContext(fs.readFileSync(serverPath, 'utf8'), {
    require: (name) => name === 'ws' ? { WebSocketServer: TestServer, OPEN: WebSocket.OPEN } : serverRequire(name),
    console: { log() {}, error() {} },
  });
  const clients = [];
  t.after(async () => {
    clients.forEach((client) => client.terminate());
    relay.clients.forEach((client) => client.terminate());
    await new Promise((resolve) => relay.close(resolve));
  });
  await once(relay, 'listening');
  const endpoint = new URL(SERVER_CONFIG.SOCKET_URL);
  endpoint.hostname = Object.values(networkInterfaces()).flat().find((entry) => entry?.internal && entry.family === 'IPv4').address;
  endpoint.port = String(relay.address().port);
  const connect = async () => {
    const client = new WebSocket(endpoint);
    clients.push(client);
    await once(client, 'open');
    return client;
  };
  const a = await connect();
  const aReceived = [];
  a.on('message', (raw) => aReceived.push(JSON.parse(String(raw))));
  const info = Object.fromEntries(Object.keys(DEVICE_FIELDS).map((key) => [key, null]));
  info.role = 'Teléfono A';
  a.send(JSON.stringify({ type: 'DEVICE_INFO', info }));
  const b = await connect();
  let next = once(b, 'message');
  b.send(JSON.stringify({ type: 'DEVICE_INFO_REQUEST' }));
  const replay = JSON.parse(String((await next)[0]));
  assert.equal(replay.type, 'DEVICE_INFO');
  assert.deepEqual(replay.info, info);
  assert.equal(typeof replay.id, 'string');
  next = once(a, 'message');
  b.send(JSON.stringify({ type: 'DEVICE_INFO', info: { ...info, role: 'Teléfono B' } }));
  assert.equal(JSON.parse(String((await next)[0])).info.role, 'Teléfono B');
  for (const action of ['vibrate', 'flash_on', 'flash_off']) {
    const command = JSON.stringify({ type: 'CAPABILITY_COMMAND', from: 'A', target: 'B', capability: action === 'vibrate' ? 'vibration' : 'flashlight', action, ...(action === 'vibrate' ? { duration: 5000 } : {}) });
    next = once(b, 'message');
    a.send(command);
    assert.equal(String((await next)[0]), command);
  }
  assert.equal(aReceived.filter((message) => message.type === 'CAPABILITY_COMMAND').length, 0);
  next = once(b, 'message');
  a.close();
  const departed = JSON.parse(String((await next)[0]));
  assert.deepEqual(departed, { type: 'DEVICE_LEFT', id: replay.id });
  const c = await connect();
  next = once(c, 'message');
  c.send(JSON.stringify({ type: 'DEVICE_INFO_REQUEST' }));
  assert.equal(JSON.parse(String((await next)[0])).info.role, 'Teléfono B');
});

test('rechaza fichas incompletas, valores inesperados y textos excesivos', () => {
  const info = Object.fromEntries(Object.keys(DEVICE_FIELDS).map((key) => [key, null]));
  assert.equal(isDeviceInfo(info), true);
  assert.equal(isDeviceInfo({ role: 'A' }), false);
  assert.equal(isDeviceInfo({ ...info, model: {} }), false);
  assert.equal(isDeviceInfo({ ...info, name: 'x'.repeat(257) }), false);
  assert.equal(isDeviceInfo({ ...info, extra: 'unexpected' }), false);
});

test('cliente compartido: conectar dos veces conserva un único WebSocket', () => {
  const sockets = [];
  class FakeSocket {
    static CLOSED = 3;
    static OPEN = 1;
    readyState = 0;
    sent = [];
    constructor(url) { this.url = url; sockets.push(this); }
    send(data) { this.sent.push(data); }
  }
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../services/socket.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, { exports, require: () => ({ SERVER_CONFIG }), WebSocket: FakeSocket });
  exports.connectSocket();
  exports.connectSocket();
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, SERVER_CONFIG.SOCKET_URL);
  sockets[0].readyState = FakeSocket.OPEN;
  sockets[0].onopen();
  exports.connectSocket();
  assert.equal(sockets.length, 1);
  for (const message of [{ type: 'DEVICE_INFO' }, { type: 'CAPABILITY_COMMAND', action: 'vibrate' }, { type: 'CAPABILITY_COMMAND', action: 'flash_on' }]) {
    assert.equal(exports.sendSocketMessage(message), true);
    assert.deepEqual(JSON.parse(sockets[0].sent.at(-1)), message);
  }
});
