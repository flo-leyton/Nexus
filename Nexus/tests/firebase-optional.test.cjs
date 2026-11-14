/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(file, dependencies, env = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, process: { env }, console: { log() {} }, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}

function firebase(env, options = {}) {
  const calls = [];
  const app = { name: 'test-app' };
  const auth = { currentUser: null };
  const database = {};
  const result = load('../app/firebase.ts', {
    '@react-native-async-storage/async-storage': {},
    'firebase/app': {
      getApps: () => options.existing ? [app] : [],
      getApp: () => { calls.push('existing-app'); return app; },
      initializeApp: () => { calls.push('app'); return app; },
    },
    'firebase/auth': {
      getReactNativePersistence: () => { calls.push('persistence'); return {}; },
      initializeAuth: () => { calls.push('auth'); if (options.existing) throw new Error('already initialized'); return auth; },
      getAuth: () => { calls.push('existing-auth'); return auth; },
    },
    'firebase/database': { getDatabase: () => { calls.push('database'); return database; } },
  }, env);
  return { result, calls, auth, database };
}

test('Firebase absent or partial: import and startup diagnostic do not initialize providers; account actions fail clearly', async () => {
  for (const env of [{}, { EXPO_PUBLIC_FIREBASE_API_KEY: 'partial' }]) {
    const { result, calls } = firebase(env);
    assert.equal(result.isFirebaseConfigured, false);
    assert.equal(result.firebaseApp, null);
    assert.equal(result.auth, null);
    assert.equal(result.database, null);
    load('../services/firebaseTest.ts', { '../app/firebase': result }).testFirebaseInitialization();
    assert.deepEqual(calls, []);
    const account = load('../services/authService.ts', {
      '../app/firebase': result, 'firebase/auth': {}, 'firebase/database': {},
    });
    await assert.rejects(account.loginUser('test@example.com', 'password'), /Firebase no configurado/);
    await assert.rejects(account.registerUser('test@example.com', 'password'), /Firebase no configurado/);
    await assert.rejects(account.logoutUser(), /Firebase no configurado/);
  }
});

test('Firebase configured: persistence, auth and profile writes keep existing behavior, including reload fallback', async () => {
  const env = Object.fromEntries(['API_KEY', 'AUTH_DOMAIN', 'DATABASE_URL', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID']
    .map((key) => [`EXPO_PUBLIC_FIREBASE_${key}`, 'test-value']));
  for (const existing of [false, true]) {
    const { result, calls, auth, database } = firebase(env, { existing });
    assert.equal(result.requireFirebase().auth, auth);
    assert.equal(result.requireFirebase().database, database);
    assert.ok(calls.includes('persistence'));
    assert.ok(calls.includes(existing ? 'existing-auth' : 'auth'));
    const user = { uid: 'user-id', email: 'test@example.com' };
    const actions = [];
    const account = load('../services/authService.ts', {
      '../app/firebase': result,
      'firebase/auth': {
        async signInWithEmailAndPassword(a, email) { assert.equal(a, auth); assert.equal(email, user.email); actions.push('login'); return { user }; },
        async createUserWithEmailAndPassword(a, email) { assert.equal(a, auth); assert.equal(email, user.email); actions.push('register'); return { user }; },
        async signOut(a) { assert.equal(a, auth); actions.push('logout'); },
      },
      'firebase/database': {
        ref(db, location) { assert.equal(db, database); assert.equal(location, 'users/user-id'); return location; },
        serverTimestamp: () => 123,
        async set() { actions.push('profile-create'); },
        async update() { actions.push('profile-update'); },
      },
    });
    await account.registerUser(' TEST@example.com ', 'password');
    await account.loginUser(' TEST@example.com ', 'password');
    await account.logoutUser();
    assert.deepEqual(actions, ['register', 'profile-create', 'login', 'profile-update', 'logout']);
  }
});
