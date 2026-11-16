// Dedicated test process: the real relay + Admin RTDB adapter, never the production entry point.
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { once } = require('node:events');
const { assertIsolation, PROJECT } = require('./assert-isolation.cjs');
const { createRealtimeStore } = require('../../server/sessionStorage');
const { createRelay } = require('../../server/relay');
assertIsolation();
const prefix = process.argv[2];
if (!/^nexusStudioEmulatorTests\/[a-z0-9-]+$/.test(prefix)) throw new Error('Unsafe test data prefix.');
(async () => {
  const app = initializeApp({ projectId: PROJECT, databaseURL: `http://127.0.0.1:19000/?ns=${PROJECT}` }, `worker-${process.pid}`);
  const storage = createRealtimeStore(getDatabase(app).ref(prefix));
  const runtime = createRelay({ port: 0, host: '127.0.0.1', storage,
    verifyToken: async (token) => ({ uid: token, exp: Math.floor(Date.now() / 1000) + 3600 }) });
  await once(runtime.server, 'listening'); await runtime.ready;
  process.send({ port: runtime.server.address().port });
  process.on('message', async (m) => {
    if (m?.type === 'stop') { await runtime.close(); await deleteApp(app); process.exit(0); }
  });
})().catch(() => { console.error('Isolated relay worker failed.'); process.exit(1); });
