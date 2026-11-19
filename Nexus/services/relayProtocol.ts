import { isProtocolId, isRecord } from './sessionProtocol.ts';

export interface SocketAuthentication {
  type: 'SOCKET_AUTH'; protocolVersion: 1; deviceId: string; idToken: string;
}
export function isSocketAuthentication(value: unknown): value is SocketAuthentication {
  return isRecord(value) && Object.keys(value).length === 4 && value.type === 'SOCKET_AUTH' && value.protocolVersion === 1 &&
    isProtocolId(value.deviceId) && typeof value.idToken === 'string' && value.idToken.length > 0 && value.idToken.length <= 16384;
}
export function isIdentityTransfer(value: unknown): value is Omit<SocketAuthentication, 'type'> & { type: 'SOCKET_IDENTITY_TRANSFER'; previousIdToken: string } {
  if (!isRecord(value) || value.type !== 'SOCKET_IDENTITY_TRANSFER' || Object.keys(value).length !== 5) return false;
  const { previousIdToken, ...rest } = value;
  return typeof previousIdToken === 'string' && previousIdToken.length > 0 && previousIdToken.length <= 16384 &&
    isSocketAuthentication({ ...rest, type: 'SOCKET_AUTH' });
}
export const socketAuthErrors: Record<string, string> = {
  AUTH_STORE_UNAVAILABLE: 'El relay no pudo recuperar o guardar su estado en RTDB. Revisa el servidor antes de reconectar.',
  AUTH_REQUIRED: 'El relay exige autenticar el socket antes de enviar mensajes.',
  AUTH_INVALID_TOKEN: 'Firebase rechazó el ID token. Vuelve a conectar para obtener uno nuevo.',
  AUTH_EXPIRED: 'La autorización del relay caducó. Vuelve a conectar para renovar el token.',
  AUTH_DEVICE_CONFLICT: 'Este deviceId ya está vinculado a otra cuenta o conexión en el relay.',
  AUTH_DEVICE_IN_USE: 'Otra conexión de esta instalación sigue abierta. Ciérrala y vuelve a conectar; no cambió la propiedad.',
  AUTH_DEVICE_OWNER_MISMATCH: 'Esta instalación pertenece a otro UID de Firebase. En Cuenta recupera la identidad anterior o autoriza una transferencia con prueba de ambas cuentas. Un nuevo anónimo no recupera sus Sessions.',
  AUTH_TRANSFER_DENIED: 'No se pudo demostrar control de ambas identidades. No se transfirió la instalación ni sus Sessions.',
  AUTH_IDENTITY_CHANGE: 'Cambió la cuenta autenticada. Vuelve a conectar con tu identidad actual.',
  AUTH_TIMEOUT: 'El relay no confirmó la autenticación a tiempo. Vuelve a conectar.',
  AUTH_INVALID_MESSAGE: 'La autenticación del socket tiene un formato incompatible.',
};
