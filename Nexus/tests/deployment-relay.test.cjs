/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { load } = require('js-yaml');
const { attachShutdown } = require('../server/lifecycle');

test('H3.4d: Render describes one Node 24 relay, private credentials, health and no disk dependency', () => {
  const blueprint = load(readFileSync(path.join(__dirname, '../render.yaml'), 'utf8'));
  assert.equal(blueprint.services.length, 1);
  const service = blueprint.services[0];
  assert.equal(service.numInstances, 1); assert.equal(service.scaling, undefined); assert.equal(service.disk, undefined);
  assert.equal(service.autoDeployTrigger, 'off'); assert.equal(service.rootDir, 'Nexus');
  assert.equal(service.buildCommand, 'npm ci'); assert.equal(service.startCommand, 'npm run relay'); assert.equal(service.healthCheckPath, '/health');
  const variables = Object.fromEntries(service.envVars.map((v) => [v.key, v]));
  assert.match(variables.NODE_VERSION.value, /^24\./);
  for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_DATABASE_URL', 'FIREBASE_ADMIN_CREDENTIALS']) {
    assert.equal(variables[key].sync, false); assert.equal(variables[key].value, undefined);
  }
  assert.equal(Object.keys(variables).some((key) => key.startsWith('EXPO_PUBLIC')), false);
});

test('H3.4d: termination drains once before exit; a drain failure does not announce successful shutdown', async () => {
  for (const fail of [false, true]) {
    const host = new EventEmitter(), events = [];
    host.exit = (code) => events.push(`exit-${code}`);
    let release;
    attachShutdown({ close() { events.push('drain'); return new Promise((resolve, reject) => { release = fail ? () => reject(new Error('private detail')) : resolve; }); } }, host);
    host.emit('SIGTERM'); host.emit('SIGINT'); await new Promise(setImmediate);
    assert.deepEqual(events, ['drain']); release(); await new Promise(setImmediate);
    assert.deepEqual(events, ['drain', fail ? 'exit-1' : 'exit-0']);
  }
});
