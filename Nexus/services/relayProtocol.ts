import { isProtocolId, isRecord } from './sessionProtocol.ts';

export interface SocketAuthentication {
  type: 'SOCKET_AUTH'; protocolVersion: 1; deviceId: string; idToken: string;
}
export function isSocketAuthentication(value: unknown): value is SocketAuthentication {
  return isRecord(value) && Object.keys(value).length === 4 && value.type === 'SOCKET_AUTH' && value.protocolVersion === 1 &&
    isProtocolId(value.deviceId) && typeof value.idToken === 'string' && value.idToken.length > 0 && value.idToken.length <= 16384;
}
export const socketAuthErrors: Record<string, string> = {
  AUTH_REQUIRED: 'El relay exige autenticar el socket antes de enviar mensajes.',
  AUTH_INVALID_TOKEN: 'Firebase rechazó el ID token. Vuelve a conectar para obtener uno nuevo.',
  AUTH_EXPIRED: 'La autorización del relay caducó. Vuelve a conectar para renovar el token.',
  AUTH_DEVICE_CONFLICT: 'Este deviceId ya está vinculado a otra cuenta o conexión en el relay.',
  AUTH_IDENTITY_CHANGE: 'Cambió la cuenta autenticada. Vuelve a conectar con tu identidad actual.',
  AUTH_TIMEOUT: 'El relay no confirmó la autenticación a tiempo. Vuelve a conectar.',
  AUTH_INVALID_MESSAGE: 'La autenticación del socket tiene un formato incompatible.',
};
