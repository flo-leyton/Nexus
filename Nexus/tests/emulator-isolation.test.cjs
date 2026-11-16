const assert = require('node:assert/strict');
const test = require('node:test');
const { assertIsolation, PROJECT } = require('./emulator/assert-isolation.cjs');
test('emulator isolation rejects production variables, credentials, proxies, projects and remote endpoints', () => {
  const safe = { FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:19000', GCLOUD_PROJECT: PROJECT, GOOGLE_CLOUD_PROJECT: PROJECT };
  assert.doesNotThrow(() => assertIsolation(safe));
  for (const key of ['EXPO_PUBLIC_FIREBASE_API_KEY', 'FIREBASE_ADMIN_CREDENTIALS', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'FIREBASE_DATABASE_URL', 'FIREBASE_CONFIG', 'FIREBASE_PROJECT_ID', 'HTTPS_PROXY']) {
    assert.throws(() => assertIsolation({ ...safe, [key]: 'synthetic-never-used' }));
  }
  assert.throws(() => assertIsolation({ ...safe, FIREBASE_DATABASE_EMULATOR_HOST: 'example.invalid:443' }));
  assert.throws(() => assertIsolation({ ...safe, GCLOUD_PROJECT: 'not-a-demo-project' }));
});
test('emulator network guard blocks external sockets before any DNS or connection', () => {
  require('./emulator/network-guard.cjs');
  const net = require('node:net');
  const socket = new net.Socket();
  try { assert.throws(() => socket.connect({ host: 'example.invalid', port: 443 }), /Blocked non-loopback/); }
  finally { socket.destroy(); }
});
