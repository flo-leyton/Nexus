// Server-only module: never import from app/, components/ or services/.
function createTokenVerifier(env = process.env) {
  const { initializeApp, applicationDefault, cert, getApps } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  let options;
  try {
    const account = env.FIREBASE_ADMIN_CREDENTIALS ? JSON.parse(env.FIREBASE_ADMIN_CREDENTIALS) : null;
    const projectId = env.FIREBASE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || account?.project_id;
    if (!projectId) throw new Error('missing project');
    options = { projectId, credential: account ? cert(account) : applicationDefault() };
  } catch {
    throw new Error('Firebase Admin no configurado: define FIREBASE_PROJECT_ID y credenciales privadas ADC o FIREBASE_ADMIN_CREDENTIALS en el servidor.');
  }
  const app = getApps().find((entry) => entry.name === 'nexus-relay') || initializeApp(options, 'nexus-relay');
  const auth = getAuth(app);
  return (idToken) => auth.verifyIdToken(idToken, true);
}
module.exports = { createTokenVerifier };
