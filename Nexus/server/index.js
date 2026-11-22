const { SERVER_CONFIG } = require('../config/server.ts');
const { createRelay, resolvePort } = require('./relay');
const { createTokenVerifier } = require('./firebaseAdmin');
const { createFirebaseStore } = require('./sessionStorage');
const { attachShutdown } = require('./lifecycle');

try {
  const runtime = createRelay({ port: resolvePort(process.env.PORT, SERVER_CONFIG.PORT), verifyToken: createTokenVerifier(), storage: createFirebaseStore() });
  const { server, ready } = runtime;
  attachShutdown(runtime);
  ready.then(() => console.log('NEXUS relay ready; RTDB recovered and authenticated WebSocket enabled.'))
    .catch(() => console.error('RTDB inaccesible o recuperación inválida. Revisa FIREBASE_DATABASE_URL, proyecto, credenciales y permisos; /health no está ready.'));
  server.on('error', () => { console.error('No se pudo iniciar el puerto del relay.'); process.exitCode = 1; });
} catch {
  console.error('Relay no iniciado. Revisa PORT, FIREBASE_DATABASE_URL, FIREBASE_PROJECT_ID, las credenciales privadas Firebase Admin y NEXUS_RELAY_DB_PATH si está definida.');
  process.exitCode = 1;
}
