/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawnSync, spawn } = require('node:child_process');
const PROJECT = 'demo-nexus-h34b';
(async () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase.json')));
  assert.equal(config.emulators.database.host, '127.0.0.1');
  assert.equal(config.emulators.database.port, 19000);
  const cli = path.join(__dirname, 'tools/node_modules/firebase-tools/lib/bin/firebase.js');
  if (!fs.existsSync(cli)) throw new Error('Install the local test tools with npm ci --prefix tests/emulator/tools.');
  const env = {};
  const allowed = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH']);
  for (const [key, value] of Object.entries(process.env)) if (allowed.has(key.toUpperCase())) env[key] = value;
  const javaHome = process.env.NEXUS_EMULATOR_JAVA_HOME || process.env.JAVA_HOME;
  if (javaHome) env.JAVA_HOME = javaHome;
  const java = javaHome ? path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  const version = spawnSync(java, ['-version'], { env, encoding: 'utf8' });
  const major = /version "(\d+)/.exec((version.stderr || '') + (version.stdout || ''));
  if (version.status !== 0 || !major || Number(major[1]) < 21) throw new Error('Java 21+ required; set NEXUS_EMULATOR_JAVA_HOME for this process only.');
  if (javaHome) {
    const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
    env[pathKey] = path.join(javaHome, 'bin') + path.delimiter + (env[pathKey] || '');
  }
  for (const port of [19000, 14400, 14500]) await new Promise((resolve, reject) => {
    const probe = net.createServer(); probe.once('error', () => reject(new Error(`Local test port ${port} is occupied; refusing to attach to an unknown service.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
  Object.assign(env, { CI: 'true', FIREBASE_CLI_DISABLE_USAGE: '1', FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:19000',
    GCLOUD_PROJECT: PROJECT, GOOGLE_CLOUD_PROJECT: PROJECT, EXPO_NO_DOTENV: '1',
    FIREBASE_CONFIG: JSON.stringify({ projectId: PROJECT }), XDG_CONFIG_HOME: path.join(__dirname, '.runtime/config') });
  fs.mkdirSync(env.XDG_CONFIG_HOME, { recursive: true });
  const execute = path.join(__dirname, 'execute.cjs');
  if ([process.execPath, execute].some((p) => /["\r\n]/.test(p))) throw new Error('Unsafe command path.');
  console.log('Isolated RTDB: demo project, loopback only, Java 21+, sanitized environment, no .env loading.');
  const child = spawn(process.execPath, [cli, 'emulators:exec', '--only', 'database', '--project', PROJECT, '--config',
    path.join(__dirname, 'firebase.json'), '--non-interactive', `"${process.execPath}" "${execute}"`], { cwd: __dirname, env, stdio: 'inherit' });
  child.once('error', (error) => { console.error(error.message); process.exitCode = 1; });
  child.once('exit', (code) => { process.exitCode = code ?? 1; });
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
