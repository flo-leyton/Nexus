const { randomUUID } = require('node:crypto');
const { isDeviceInfo } = require('../services/deviceProtocol.ts');

// Metadatos efímeros por conexión; no se guardan identificadores del hardware.
function attachDevicePresence(relay) {
  const devices = new Map();
  const ids = new WeakMap();
  const alive = new WeakMap();
  const send = (client, message) => {
    if (client.readyState === 1) client.send(JSON.stringify(message));
  };
  const broadcast = (source, message) => {
    for (const client of relay.clients) if (client !== source) send(client, message);
  };

  const heartbeat = setInterval(() => {
    for (const client of devices.keys()) {
      if (alive.get(client) === false) client.terminate();
      else { alive.set(client, false); client.ping(); }
    }
  }, 30000);
  heartbeat.unref();
  relay.on('close', () => clearInterval(heartbeat));

  return {
    connect(client) {
      ids.set(client, randomUUID());
      alive.set(client, true);
      client.on('pong', () => alive.set(client, true));
    },
    handle(client, text) {
      let message;
      try { message = JSON.parse(text); } catch { return false; }
      if (!message || typeof message !== 'object') return false;
      if (message.type === 'DEVICE_INFO_REQUEST') {
        for (const [other, info] of devices) {
          if (other !== client && other.readyState === 1) send(client, { type: 'DEVICE_INFO', id: ids.get(other), info });
        }
        return true;
      }
      if (message.type === 'DEVICE_INFO') {
        if (isDeviceInfo(message.info)) {
          devices.set(client, message.info);
          broadcast(client, { type: 'DEVICE_INFO', id: ids.get(client), info: message.info });
        }
        return true;
      }
      // Solo el servidor puede anunciar una desconexión.
      return message.type === 'DEVICE_LEFT';
    },
    disconnect(client) {
      if (devices.delete(client)) broadcast(client, { type: 'DEVICE_LEFT', id: ids.get(client) });
    },
  };
}

module.exports = { attachDevicePresence };
