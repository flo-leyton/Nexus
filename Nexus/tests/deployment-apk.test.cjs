/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ignore = require('ignore');
const { PUBLIC_BUILD_VARIABLES, validateOnlineBuild } = require('../config/previewBuild');
const { checkNative, assertNativeModules } = require('../scripts/check-native.cjs');
const fixture = () => ({ ...Object.fromEntries(PUBLIC_BUILD_VARIABLES.map((key) => [key, 'synthetic-public-value'])), EXPO_PUBLIC_RELAY_URL: 'wss://nexus-fixture.onrender.com' });

test('H3.4d APK: online build cannot silently use LAN, missing Auth or private server credentials', () => {
  const env = fixture(); assert.equal(validateOnlineBuild(env), env.EXPO_PUBLIC_RELAY_URL + '/');
  assert.throws(() => validateOnlineBuild({}), /Faltan variables públicas/);
  for (const url of ['ws://relay.onrender.com', 'wss://192.168.1.20', 'wss://localhost', 'wss://relay.local', 'wss://HOST_REAL_ASIGNADO', 'wss://example.com', 'wss://relay.onrender.com:10000', 'wss://relay.onrender.com?token=private']) {
    assert.throws(() => validateOnlineBuild({ ...env, EXPO_PUBLIC_RELAY_URL: url }), /hostname público|URL pública/);
  }
  for (const key of ['FIREBASE_ADMIN_CREDENTIALS', 'GOOGLE_APPLICATION_CREDENTIALS', 'EXPO_PUBLIC_FIREBASE_ADMIN_KEY', 'FIREBASE_DATABASE_EMULATOR_HOST']) {
    assert.throws(() => validateOnlineBuild({ ...env, [key]: 'never-print-this-value' }), (e) => e.message.includes(key) && !e.message.includes('never-print-this-value'));
  }
});

test('H3.4d APK: app config preserves development LAN and plugins, preview is standalone APK with isolated environment', () => {
  const app = require('../app.json').expo, eas = require('../eas.json');
  const evaluate = (env) => {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.config.js'), 'utf8'), { module, process: { env },
      require: () => ({ validateOnlineBuild }) });
    return module.exports({ config: app });
  };
  assert.equal(evaluate({}), app);
  assert.throws(() => evaluate({ EAS_BUILD_PROFILE: 'preview' }), /Faltan variables/);
  assert.equal(evaluate({ ...fixture(), NEXUS_ONLINE_BUILD: '1' }), app);
  assert.equal(eas.build.preview.android.buildType, 'apk'); assert.equal(eas.build.preview.developmentClient, false);
  assert.equal(eas.build.preview.environment, 'preview'); assert.equal(eas.build.preview.env.EXPO_NO_DOTENV, '1');
  assert.equal(eas.build.development.developmentClient, true); assert.equal(eas.build.development.env?.EXPO_PUBLIC_RELAY_URL, undefined);
});

test('H3.4d APK: actual Android autolinking includes ExpoVideo, capture, files and persistent Auth; missing video fails preflight', () => {
  const { expo, reactNative, app } = checkNative();
  assert.ok(expo.modules.some((m) => m.packageName === 'expo-video' && m.packageVersion === '3.0.16'));
  assert.throws(() => assertNativeModules({ ...expo, modules: expo.modules.filter((m) => m.packageName !== 'expo-video') }, reactNative, app), /falta expo-video/);
});

test('H3.4d APK: app-root No VCS archive rules exclude server, environment, keys, videos and native caches', () => {
  const rules = ignore().add(fs.readFileSync(path.join(__dirname, '../.easignore'), 'utf8'));
  // EAS fs.cp tests directory names WITHOUT trailing slash before traversing them.
  for (const dir of ['app', 'assets', 'components', 'config', 'hooks', 'services', 'types', 'scripts']) assert.equal(rules.ignores(dir), false, dir);
  for (const file of ['server/firebaseAdmin.js', 'server/sessionStorage.js', '.env', '.env.local', '.claude/settings.json',
    'android/app/build/outputs/app.apk', 'app/private/serviceAccount.json', 'config/firebase-adminsdk.json', 'app/local/video.mp4', 'release.jks']) assert.equal(rules.ignores(file), true, file);
  for (const file of ['app/(tabs)/index.tsx', 'services/sessionClient.ts', 'config/relay.ts', 'app.config.js', 'package.json', 'package-lock.json', 'google-services.json', 'scripts/check-native.cjs', 'assets/images/icon.png']) assert.equal(rules.ignores(file), false, file);
});
