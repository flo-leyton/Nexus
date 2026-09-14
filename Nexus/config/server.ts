// =======================================================
// CONFIGURACIÓN CENTRAL DEL SERVIDOR
//
// IMPORTANTE:
// Este archivo contiene la IP y el puerto utilizados
// por toda la aplicación y el servidor relay.
//
// NO modificar automáticamente la IP ni el puerto.
// Estos valores serán modificados manualmente por el usuario.
// =======================================================

const IP = '192.168.0.5';
const PORT = 8080;

export const SERVER_CONFIG = {
  IP,
  PORT,
  HTTP_URL: `http://${IP}:${PORT}`,
  SOCKET_URL: `ws://${IP}:${PORT}`,
  // El relay sigue escuchando en todas las interfaces de red.
  LISTEN_HOST: '0.0.0.0',
};
