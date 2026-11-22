// The relay is the only writer. A revision transaction rejects a stale second process.
const ROOT = 'nexusStudio/relayV1';
function emptyDocument() { return { schemaVersion: 1, revision: 0, devices: {}, sessions: {} }; }
function bounded(operation, timeoutMs) {
  let timer;
  return Promise.race([operation, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('RTDB no respondió a tiempo; reinicia para recuperar el estado durable.'), { code: 'STORE_UNCERTAIN' })), timeoutMs);
  })]).finally(() => clearTimeout(timer));
}
function createRealtimeStore(reference, timeoutMs = 15000) {
  let listener;
  return {
    async load() {
      try {
        // Keep the root query active: RTDB transactions otherwise may initially
        // see an empty local cache and abort a valid expectedRevision > 0.
        const initial = reference.on ? new Promise((resolve, reject) => {
          listener = reference.on('value', resolve, reject);
        }) : reference.get();
        return (await bounded(initial, timeoutMs)).val() || emptyDocument();
      }
      catch { throw new Error('No se pudo acceder a Realtime Database. Revisa FIREBASE_DATABASE_URL, proyecto y permisos privados del relay.'); }
    },
    close() { if (listener) reference.off('value', listener); },
    async commit(expectedRevision, next) {
      const result = await bounded(reference.transaction((current) => {
        const existing = current || emptyDocument();
        if (existing.schemaVersion !== 1 || existing.revision !== expectedRevision) return;
        return next;
      }, undefined, false), timeoutMs);
      if (!result.committed) throw Object.assign(new Error('La revisión durable cambió; reinicia el relay para recuperar.'), { code: 'STORE_CONFLICT' });
    },
  };
}
function createFirebaseStore(env = process.env) {
  if (!env.FIREBASE_DATABASE_URL || !env.FIREBASE_PROJECT_ID) throw new Error('El relay requiere FIREBASE_DATABASE_URL y FIREBASE_PROJECT_ID para persistir Sessions.');
  let url;
  try { url = new URL(env.FIREBASE_DATABASE_URL); } catch { throw new Error('FIREBASE_DATABASE_URL inválida.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !env.FIREBASE_DATABASE_EMULATOR_HOST)) throw new Error('FIREBASE_DATABASE_URL debe ser HTTPS (HTTP sólo con emulador explícito).');
  const path = env.NEXUS_RELAY_DB_PATH ?? ROOT;
  // Allow sibling registries only, so a relay cannot overwrite their common parent.
  if (!/^nexusStudio\/[A-Za-z0-9_-]{1,128}$/u.test(path) || path.trim() !== path) {
    throw new Error('NEXUS_RELAY_DB_PATH debe tener el formato nexusStudio/<registro>.');
  }
  const { getRelayAdminApp } = require('./firebaseAdmin');
  const { getDatabaseWithUrl } = require('firebase-admin/database');
  return createRealtimeStore(getDatabaseWithUrl(env.FIREBASE_DATABASE_URL, getRelayAdminApp(env)).ref(path));
}
module.exports = { createFirebaseStore, createRealtimeStore, emptyDocument, ROOT };
