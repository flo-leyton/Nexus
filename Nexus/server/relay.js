const http = require('node:http');
const { WebSocketServer, OPEN } = require('ws');
const { isSocketAuthentication } = require('../services/relayProtocol.ts');
const { attachDevicePresence } = require('./devicePresence');
const { attachSessions } = require('./sessions');

function resolvePort(value, fallback) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error('PORT debe ser un entero entre 1 y 65535.');
  return Number(value);
}

// verifyToken is an explicit dependency for tests. Production supplies Firebase Admin;
// there is no environment flag that bypasses authentication, even on LAN.
function createRelay({ port, host = '0.0.0.0', verifyToken, authTimeoutMs = 15000 }) {
  if (typeof verifyToken !== 'function') throw new Error('El relay necesita un verificador de Firebase ID tokens.');
  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ ready: true }));
    } else { response.writeHead(404); response.end(); }
  });
  const relay = new WebSocketServer({ server, maxPayload: 65536 });
  relay.on('error', () => {}); // HTTP server startup errors are handled by the entry point.
  const owners = new Map(), connections = new Map(); // ephemeral deviceId -> uid / active socket
  const authenticated = (client) => client.readyState === OPEN && client.studioIdentity?.expiresAt > Date.now();
  const presence = attachDevicePresence(relay, authenticated);
  const sessions = attachSessions(relay);
  relay.on('connection', (client) => {
    let verifying = false;
    const reject = (code) => {
      if (client.readyState === OPEN) client.send(JSON.stringify({ type: 'SOCKET_AUTH_ERROR', code }));
      client.close(4001, code);
    };
    let deadline = setTimeout(() => reject('AUTH_TIMEOUT'), authTimeoutMs);
    deadline.unref();
    client.on('message', async (raw, binary) => {
      let message;
      try { if (binary) throw new Error(); message = JSON.parse(String(raw)); } catch {
        if (!binary && authenticated(client)) sessions.handle(client, String(raw));
        else reject('AUTH_INVALID_MESSAGE');
        return;
      }
      if (message?.type === 'SOCKET_AUTH') {
        if (!isSocketAuthentication(message) || verifying) { reject('AUTH_INVALID_MESSAGE'); return; }
        verifying = true;
        try {
          const decoded = await verifyToken(message.idToken);
          if (client.readyState !== OPEN) return;
          if (!decoded || typeof decoded.uid !== 'string' || !decoded.uid || !Number.isFinite(decoded.exp)) { reject('AUTH_INVALID_TOKEN'); return; }
          const expiresAt = decoded.exp * 1000;
          if (expiresAt <= Date.now()) { reject('AUTH_EXPIRED'); return; }
          const current = client.studioIdentity;
          if (current && (current.uid !== decoded.uid || current.deviceId !== message.deviceId)) { reject('AUTH_IDENTITY_CHANGE'); return; }
          if ((owners.has(message.deviceId) && owners.get(message.deviceId) !== decoded.uid) ||
              (connections.has(message.deviceId) && connections.get(message.deviceId) !== client)) { reject('AUTH_DEVICE_CONFLICT'); return; }
          owners.set(message.deviceId, decoded.uid); connections.set(message.deviceId, client);
          client.studioIdentity = Object.freeze({ uid: decoded.uid, deviceId: message.deviceId, expiresAt });
          if (!current) presence.connect(client);
          clearTimeout(deadline);
          deadline = setTimeout(() => reject('AUTH_EXPIRED'), Math.min(expiresAt - Date.now(), 2147483647)); deadline.unref();
          client.send(JSON.stringify({ type: 'SOCKET_AUTH_OK', uid: decoded.uid, deviceId: message.deviceId, expiresAt }));
        } catch { reject('AUTH_INVALID_TOKEN'); } // Never log raw token or provider errors.
        finally { verifying = false; }
        return;
      }
      if (!authenticated(client)) { reject(client.studioIdentity ? 'AUTH_EXPIRED' : 'AUTH_REQUIRED'); return; }
      const text = String(raw);
      if (sessions.handle(client, text) || presence.handle(client, text)) return;
      for (const other of relay.clients) if (other !== client && authenticated(other)) other.send(text);
    });
    client.on('close', () => {
      clearTimeout(deadline);
      const id = client.studioIdentity?.deviceId;
      if (id && connections.get(id) === client) connections.delete(id);
      sessions.disconnect(client); presence.disconnect(client);
    });
    client.on('error', () => {}); // No payloads, credentials or tokens in logs.
  });
  server.listen(port, host);
  return { server, relay, close: () => new Promise((resolve, reject) => {
    for (const client of relay.clients) client.terminate();
    relay.close(() => server.close((error) => error ? reject(error) : resolve()));
  }) };
}
module.exports = { createRelay, resolvePort };
