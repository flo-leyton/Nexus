const assert = require('node:assert/strict');
const PROJECT = 'demo-nexus-h34b';
function assertIsolation(env = process.env) {
  assert.equal(env.FIREBASE_DATABASE_EMULATOR_HOST, '127.0.0.1:19000', 'Use the isolated emulator runner, never a remote host.');
  assert.equal(env.GCLOUD_PROJECT, PROJECT);
  assert.equal(env.GOOGLE_CLOUD_PROJECT, PROJECT);
  for (const key of Object.keys(env)) {
    assert.ok(!key.startsWith('EXPO_PUBLIC_'), 'Public production configuration must not enter emulator tests.');
    if (['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_ADMIN_CREDENTIALS', 'FIREBASE_TOKEN', 'FIREBASE_DATABASE_URL', 'FIREBASE_CONFIG', 'FIREBASE_PROJECT_ID', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY'].includes(key.toUpperCase())) {
      assert.ok(!env[key], 'Private/production credentials or proxy settings must not enter emulator tests.');
    }
  }
}
module.exports = { assertIsolation, PROJECT };
