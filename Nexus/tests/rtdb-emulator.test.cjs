const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { createRealtimeStore, emptyDocument } = require('../server/sessionStorage');
const { decodeRegistry } = require('../server/sessionSchema');

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
test('H3.4b emulator: actual Admin RTDB round trip and atomic revision conflict', { skip: !host }, async (t) => {
  assert.match(host, /^(localhost|127\.0\.0\.1):\d+$/);
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getDatabase } = require('firebase-admin/database');
  const app = initializeApp({ projectId: 'demo-nexus-h34b', databaseURL: `http://${host}/?ns=demo-nexus-h34b` }, `test-${randomUUID()}`);
  const reference = getDatabase(app).ref(`nexusStudioEmulatorTests/${randomUUID()}`);
  t.after(async () => { await reference.remove(); await deleteApp(app); });
  const store = createRealtimeStore(reference);
  assert.equal((await store.load()).revision, 0);
  const doc = { ...emptyDocument(), revision: 1, devices: { controller: 'uid-controller' }, sessions: {
    session: { sessionId: 'session', code: 'ABC123', controllerId: 'controller', state: 'joining',
      members: { controller: { uid: 'uid-controller', deviceId: 'controller', nodeId: null, role: 'controller', kind: 'controller', online: true } } },
  } };
  await store.commit(0, doc);
  const fresh = createRealtimeStore(reference);
  const recovered = decodeRegistry(await fresh.load());
  assert.equal(recovered.sessions.get('session').code, 'ABC123');
  assert.equal(recovered.sessions.get('session').members.get('controller').online, false);
  await fresh.commit(1, { ...doc, revision: 2 });
  await assert.rejects(store.commit(1, { ...doc, revision: 2 }), { code: 'STORE_CONFLICT' });
});
