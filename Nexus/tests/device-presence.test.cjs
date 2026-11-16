const assert = require('node:assert/strict');
const { once } = require('node:events');
const { networkInterfaces } = require('node:os');
const test = require('node:test');
const WebSocket = require('ws');
const { SERVER_CONFIG } = require('../config/server.ts');
const { DEVICE_FIELDS, isDeviceInfo } = require('../services/deviceProtocol.ts');
const { startTestRelay, authenticate } = require('./helpers/relay.cjs');

test('relay: fichas, llegada tardía, comandos intactos y desconexión', { timeout: 10000 }, async (t) => {
  const { relay } = await startTestRelay(t);
  const clients = [];
  t.after(async () => {
    clients.forEach((client) => client.terminate());
  });
  const endpoint = new URL(SERVER_CONFIG.SOCKET_URL);
  endpoint.hostname = Object.values(networkInterfaces()).flat().find((entry) => entry?.internal && entry.family === 'IPv4').address;
  endpoint.port = String(relay.address().port);
  const connect = async () => {
    const client = new WebSocket(endpoint);
    clients.push(client);
    await once(client, 'open');
    await authenticate(client, `device-${clients.length}`);
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
  const call = async (client, type, sessionId, payload = {}, targetId) => {
    const { randomUUID } = require('node:crypto');
    const messageId = randomUUID();
    const response = new Promise((resolve) => {
      const listener = (raw) => { const m = JSON.parse(String(raw)); if (m.payload?.requestId === messageId) { client.off('message', listener); resolve(m); } };
      client.on('message', listener);
    });
    client.send(JSON.stringify({ protocolVersion: 1, messageId, type, sessionId, senderId: client === a ? 'device-1' : 'device-2',
      sentAt: Date.now(), payload, ...(targetId ? { targetId } : {}) }));
    return response;
  };
  const session = (await call(a, 'SESSION_CREATE', 'presence-capability-session')).payload.session;
  const pending = await call(b, 'SESSION_JOIN_REQUEST', 'join-by-code', { code: session.code });
  const accepted = once(b, 'message');
  await call(a, 'SESSION_JOIN_ACCEPT', session.sessionId, { requestId: pending.payload.requestId }, 'device-2');
  await accepted;
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
