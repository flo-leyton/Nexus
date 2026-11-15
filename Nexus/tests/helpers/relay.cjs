const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createRelay } = require('../../server/relay');

async function startTestRelay(t, options = {}) {
  const runtime = createRelay({ port: 0, host: '127.0.0.1',
    verifyToken: async (token) => ({ uid: `user-${token}`, exp: Math.floor(Date.now() / 1000) + 3600 }), ...options });
  t.after(() => runtime.close());
  await once(runtime.server, 'listening');
  return runtime;
}
async function authenticate(ws, deviceId, idToken = deviceId) {
  const next = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'SOCKET_AUTH', protocolVersion: 1, deviceId, idToken }));
  const result = JSON.parse(String((await next)[0]));
  assert.equal(result.type, 'SOCKET_AUTH_OK');
  return result;
}
module.exports = { startTestRelay, authenticate };
