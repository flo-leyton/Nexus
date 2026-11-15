import { SERVER_CONFIG } from './server';

// Pure resolver, also exercised outside Metro. Never throws during app import.
export function resolveRelayUrl(explicit: string | undefined, development: boolean): string {
  const value = explicit?.trim() || (development ? SERVER_CONFIG.SOCKET_URL : '');
  if (!value) throw new Error('Falta EXPO_PUBLIC_RELAY_URL: preview/producción exige una URL wss:// del relay.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('EXPO_PUBLIC_RELAY_URL no es una URL WebSocket válida.'); }
  if (!['ws:', 'wss:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.hash || url.search ||
      (!development && url.protocol !== 'wss:')) {
    throw new Error('URL del relay inválida: usa wss:// en preview/producción, sin credenciales, query ni fragmento.');
  }
  return url.toString();
}
export function getRelayUrl(): string {
  return resolveRelayUrl(process.env.EXPO_PUBLIC_RELAY_URL, __DEV__);
}
