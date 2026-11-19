// Build-time only. Do not import this module into the app's runtime graph.
const PUBLIC_BUILD_VARIABLES = [
  'EXPO_PUBLIC_RELAY_URL',
  ...['API_KEY', 'AUTH_DOMAIN', 'DATABASE_URL', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID'].map((suffix) => `EXPO_PUBLIC_FIREBASE_${suffix}`),
  'EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME', 'EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET',
];
function validateOnlineBuild(env) {
  const forbidden = Object.keys(env).filter((key) => env[key] && (
    ['FIREBASE_ADMIN_CREDENTIALS', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST'].includes(key) ||
    /^EXPO_PUBLIC_.*(ADMIN|PRIVATE_KEY|SERVICE_ACCOUNT)/.test(key)
  ));
  if (forbidden.length) throw new Error(`No compiles la app con variables privadas/Admin o emuladores: ${forbidden.join(', ')}. Usa un entorno EAS separado del relay.`);
  const missing = PUBLIC_BUILD_VARIABLES.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Faltan variables públicas para el APK online: ${missing.join(', ')}. Configura EAS preview con la URL real de Render.`);
  let url;
  try { url = new URL(env.EXPO_PUBLIC_RELAY_URL.trim()); } catch { throw new Error('EXPO_PUBLIC_RELAY_URL debe ser una URL pública wss:// válida.'); }
  if (url.protocol !== 'wss:' || url.username || url.password || url.search || url.hash || url.port ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname) ||
      /(?:^|\.)(localhost|local|internal|test|invalid|example\.com|example\.org|example\.net)$/i.test(url.hostname)) {
    throw new Error('El APK online exige el hostname público wss:// real, sin IP LAN, puerto interno, credenciales ni marcadores.');
  }
  return url.toString();
}
module.exports = { PUBLIC_BUILD_VARIABLES, validateOnlineBuild };
