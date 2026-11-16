/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { assertIsolation, PROJECT } = require('./emulator/assert-isolation.cjs');
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const safeRules = fs.readFileSync(path.join(__dirname, 'emulator/database.rules.json'), 'utf8');
function library() { return require('./emulator/tools/node_modules/@firebase/rules-unit-testing'); }

test('RTDB proposed policy: unauthenticated, Controller, Node and foreign clients cannot directly read/write relay state', { skip: !host, timeout: 30000 }, async () => {
  assertIsolation();
  const { initializeTestEnvironment, assertFails } = library();
  const env = await initializeTestEnvironment({ projectId: PROJECT, database: { host: '127.0.0.1', port: 19000, rules: safeRules } });
  try {
    await env.withSecurityRulesDisabled(async (ctx) => { await ctx.database().ref('nexusStudio/relayV1').set({ schemaVersion: 1, synthetic: true }); });
    const contexts = [env.unauthenticatedContext(), ...['controller', 'node', 'foreign'].map((uid) => env.authenticatedContext(uid))];
    for (const ctx of contexts) for (const target of ['nexusStudio/relayV1', 'nexusStudio/relayV1/sessions/test', 'nexusStudio', '/']) {
      await assertFails(ctx.database().ref(target).get());
      await assertFails(ctx.database().ref(target).set({ synthetic: 'must-be-denied' }));
    }
  } finally {
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('nexusStudio/relayV1').remove());
    await env.cleanup();
  }
});

test('RTDB policy negative control: permissive parent overrides a child deny; this is never a deployed rule', { skip: !host, timeout: 30000 }, async () => {
  assertIsolation();
  const { initializeTestEnvironment, assertSucceeds } = library();
  const permissive = JSON.stringify({ rules: { '.read': 'auth != null', '.write': 'auth != null', nexusStudio: { relayV1: { '.read': false, '.write': false } } } });
  const env = await initializeTestEnvironment({ projectId: PROJECT, database: { host: '127.0.0.1', port: 19000, rules: permissive } });
  try {
    const outsider = env.authenticatedContext('foreign').database().ref('nexusStudio/relayV1');
    await assertSucceeds(outsider.set({ synthetic: 'parent-grant-proves-child-deny-is-insufficient' }));
    assert.equal((await assertSucceeds(outsider.get())).exists(), true);
  } finally {
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('nexusStudio/relayV1').remove());
    await env.cleanup();
    const restored = await initializeTestEnvironment({ projectId: PROJECT, database: { host: '127.0.0.1', port: 19000, rules: safeRules } });
    await restored.cleanup();
  }
});
