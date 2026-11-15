const { SERVER_CONFIG } = require('../config/server.ts');
const { createRelay, resolvePort } = require('./relay');
const { createTokenVerifier } = require('./firebaseAdmin');

try {
  const { server } = createRelay({ port: resolvePort(process.env.PORT, SERVER_CONFIG.PORT), verifyToken: createTokenVerifier() });
  server.on('listening', () => console.log('NEXUS relay ready; HTTP health and authenticated WebSocket enabled.'));
  server.on('error', () => { console.error('No se pudo iniciar el puerto del relay.'); process.exitCode = 1; });
} catch {
  console.error('Relay no iniciado. Configura PORT válido, FIREBASE_PROJECT_ID y credenciales privadas Firebase Admin (ADC o FIREBASE_ADMIN_CREDENTIALS).');
  process.exitCode = 1;
}
