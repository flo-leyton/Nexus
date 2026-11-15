import { isRecord } from './sessionProtocol';
import { socketAuthErrors } from './relayProtocol';

export type ConnectionStatus = 'Disconnected' | 'Connecting' | 'Connected' | 'Error';
interface Credentials { uid: string; deviceId: string; idToken: string }
interface SocketDependencies {
  url(): string;
  credentials(): Promise<Credentials>;
  create(url: string): WebSocket;
  identityChanged?(listener: (uid: string | null) => void): () => void;
}
// No outbox: reconnecting never retransmits commands, ACKs or capture side effects.
export function createSocketClient(deps: SocketDependencies) {
  let socket: WebSocket | null = null, connecting = false, generation = 0;
  let closing: Promise<void> | null = null;
  let status: ConnectionStatus = 'Disconnected', error: string | null = null, identity: Credentials | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const messages = new Set<(data: unknown) => void>(), statuses = new Set<(status: ConnectionStatus) => void>();
  const update = (next: ConnectionStatus, cause: string | null = null) => { status = next; error = cause; statuses.forEach((fn) => fn(status)); };
  const stop = (cause?: string) => {
    generation++; connecting = false; clearTimeout(timer);
    const current = socket; socket = null; identity = null;
    if (current && current.readyState !== 3) {
      closing = new Promise<void>((resolve) => { current.onclose = () => { closing = null; resolve(); }; });
      current.close();
    }
    update(cause ? 'Error' : 'Disconnected', cause ?? null);
  };
  const offIdentity = deps.identityChanged?.((uid) => { if (identity && uid !== identity.uid) stop(socketAuthErrors.AUTH_IDENTITY_CHANGE); });
  const connect = async () => {
    if (connecting || socket) return;
    connecting = true; const attempt = ++generation;
    update('Connecting');
    try {
      if (closing) await closing;
      if (attempt !== generation) return;
      const url = deps.url();
      const credentials = await deps.credentials();
      if (attempt !== generation) return;
      identity = credentials;
      const current = deps.create(url); socket = current;
      const authTimeout = () => { clearTimeout(timer); timer = setTimeout(() => { if (socket === current) stop(socketAuthErrors.AUTH_TIMEOUT); }, 15000); };
      const authenticate = (value: Credentials) => current.send(JSON.stringify({ type: 'SOCKET_AUTH', protocolVersion: 1, deviceId: value.deviceId, idToken: value.idToken }));
      current.onopen = () => { if (socket === current) { authenticate(credentials); authTimeout(); } };
      current.onmessage = (event) => {
        if (socket !== current) return;
        let message: unknown;
        try { message = JSON.parse(String(event.data)); } catch { return; }
        if (isRecord(message) && message.type === 'SOCKET_AUTH_ERROR') {
          stop(socketAuthErrors[String(message.code)] ?? 'El relay rechazó la autenticación.'); return;
        }
        if (isRecord(message) && message.type === 'SOCKET_AUTH_OK') {
          if (message.uid !== identity?.uid || message.deviceId !== identity?.deviceId || typeof message.expiresAt !== 'number' || !Number.isFinite(message.expiresAt) || message.expiresAt <= Date.now()) {
            stop('Respuesta de autenticación del relay inválida.'); return;
          }
          clearTimeout(timer); connecting = false;
          timer = setTimeout(() => {
            void deps.credentials().then((fresh) => {
              if (socket !== current) return;
              if (fresh.uid !== identity?.uid || fresh.deviceId !== identity.deviceId) { stop(socketAuthErrors.AUTH_IDENTITY_CHANGE); return; }
              authenticate(fresh); authTimeout();
            }).catch(() => { if (socket === current) stop('No se pudo renovar el token de Firebase. Vuelve a conectar.'); });
          }, Math.max(1000, message.expiresAt - Date.now() - 60000));
          if (status !== 'Connected') update('Connected');
          return;
        }
        if (status === 'Connected') messages.forEach((fn) => fn(event.data));
      };
      current.onerror = () => { if (socket === current) stop('No se pudo conectar al relay. Comprueba la URL, la red y el servidor.'); };
      current.onclose = () => { if (socket === current) stop(status === 'Connected' ? undefined : 'El relay cerró la conexión antes de autorizarla.'); };
    } catch (cause) {
      if (attempt === generation) stop(cause instanceof Error ? cause.message : 'No se pudo preparar la conexión al relay.');
    }
  };
  return {
    connect() { void connect(); }, disconnect: () => stop(),
    send(message: unknown) { if (!socket || socket.readyState !== 1 || status !== 'Connected') return false; socket.send(JSON.stringify(message)); return true; },
    subscribeMessages(fn: (data: unknown) => void) { messages.add(fn); return () => { messages.delete(fn); }; },
    subscribeStatus(fn: (status: ConnectionStatus) => void) { statuses.add(fn); fn(status); return () => { statuses.delete(fn); }; },
    getError: () => error,
    dispose() { offIdentity?.(); stop(); messages.clear(); statuses.clear(); },
  };
}
