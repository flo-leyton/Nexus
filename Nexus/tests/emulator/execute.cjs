/* global __dirname */
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { assertIsolation, PROJECT } = require('./assert-isolation.cjs');
// The CLI otherwise invents a non-loopback demo database URL. Accept only our project-only fixture.
assert.deepEqual(JSON.parse(process.env.FIREBASE_CONFIG || '{}'), { projectId: PROJECT });
delete process.env.FIREBASE_CONFIG;
assertIsolation();
const root = path.resolve(__dirname, '../..');
const files = fs.readdirSync(path.join(root, 'tests')).filter((name) => name.endsWith('.test.cjs')).sort().map((name) => path.join(root, 'tests', name));
const result = spawnSync(process.execPath, ['--require', path.join(__dirname, 'network-guard.cjs'), '--test', '--test-concurrency=1', ...files],
{ cwd: root, env: process.env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
