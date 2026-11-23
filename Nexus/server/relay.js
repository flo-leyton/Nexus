const http = require('node:http');
const { WebSocketServer, OPEN } = require('ws');
const { isSocketAuthentication, isIdentityTransfer } = require('../services/relayProtocol.ts');
const { attachDevicePresence } = require('./devicePresence');
const { attachSessions } = require('./sessions');

function resolvePort(value, fallback) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error('PORT debe ser un entero entre 1 y 65535.');
  return Number(value);
}

// verifyToken is an explicit dependency for tests. Production supplies Firebase Admin;
// there is no environment flag that bypasses authentication, even on LAN.
function createRelay({ port, host = '0.0.0.0', verifyToken, storage, codeGenerator, authTimeoutMs = 15000,
  previewEnabled = process.env.NEXUS_NX10_WEBRTC_RELAY === '1' }) {
  let draining = false;
  if (typeof verifyToken !== 'function') throw new Error('El relay necesita un verificador de Firebase ID tokens.');
  if (!storage) throw new Error('El relay necesita almacenamiento durable RTDB.');
  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      const ready = !draining && sessions.isReady();
      response.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ ready }));
    } else { response.writeHead(404); response.end(); }
  });
  const relay = new WebSocketServer({ server, maxPayload: 65536 });
  relay.on('error', () => {}); // HTTP server startup errors are handled by the entry point.
  const connections = new Map(); // only active sockets; ownership is durable
  const authenticated = (client) => client.readyState === OPEN && client.studioIdentity?.expiresAt > Date.now();
  const presence = attachDevicePresence(relay, authenticated);
  const sessions = attachSessions(relay, { storage, codeGenerator, previewEnabled });
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
      if (message?.type === 'SOCKET_AUTH' || message?.type === 'SOCKET_IDENTITY_TRANSFER') {
        const transfer = message.type === 'SOCKET_IDENTITY_TRANSFER';
        if (!(transfer ? isIdentityTransfer(message) : isSocketAuthentication(message)) || verifying || (transfer && client.studioIdentity)) { reject('AUTH_INVALID_MESSAGE'); return; }
        verifying = true;
        try {
          const decoded = await verifyToken(message.idToken);
          if (client.readyState !== OPEN) return;
          if (!decoded || typeof decoded.uid !== 'string' || !decoded.uid || !Number.isFinite(decoded.exp)) { reject('AUTH_INVALID_TOKEN'); return; }
          const expiresAt = decoded.exp * 1000;
          if (expiresAt <= Date.now()) { reject('AUTH_EXPIRED'); return; }
          const current = client.studioIdentity;
          if (current && (current.uid !== decoded.uid || current.deviceId !== message.deviceId)) { reject('AUTH_IDENTITY_CHANGE'); return; }
          if (connections.has(message.deviceId) && connections.get(message.deviceId) !== client) {
            const active = connections.get(message.deviceId).studioIdentity;
            reject(active?.uid === decoded.uid ? 'AUTH_DEVICE_IN_USE' : 'AUTH_DEVICE_OWNER_MISMATCH'); return;
          }
          try {
            if (transfer) {
              let previous;
              try { previous = await verifyToken(message.previousIdToken); }
              catch { reject('AUTH_TRANSFER_DENIED'); return; }
              if (!previous?.uid || !Number.isFinite(previous.exp) || previous.exp * 1000 <= Date.now() || previous.uid === decoded.uid) { reject('AUTH_TRANSFER_DENIED'); return; }
              if (connections.has(message.deviceId)) { reject('AUTH_DEVICE_IN_USE'); return; }
              await sessions.transferDevice(message.deviceId, previous.uid, decoded.uid);
            } else await sessions.claimDevice(message.deviceId, decoded.uid);
          }
          catch (error) { reject(error.code?.startsWith('AUTH_') ? error.code : 'AUTH_STORE_UNAVAILABLE'); return; }
          if (client.readyState !== OPEN) return;
          if (connections.has(message.deviceId) && connections.get(message.deviceId) !== client) { reject('AUTH_DEVICE_IN_USE'); return; }
          connections.set(message.deviceId, client);
          client.studioIdentity = Object.freeze({ uid: decoded.uid, deviceId: message.deviceId, expiresAt });
          try { await sessions.connect(client); }
          catch (error) { reject(error.code?.startsWith('AUTH_') ? error.code : 'AUTH_STORE_UNAVAILABLE'); return; }
          if (client.readyState !== OPEN) return;
          if (expiresAt <= Date.now()) { reject('AUTH_EXPIRED'); return; }
          if (!current) presence.connect(client);
          clearTimeout(deadline);
          deadline = setTimeout(() => reject('AUTH_EXPIRED'), Math.min(expiresAt - Date.now(), 2147483647)); deadline.unref();
          client.send(JSON.stringify({ type: 'SOCKET_AUTH_OK', uid: decoded.uid, deviceId: message.deviceId, expiresAt }));
          if (!current) void sessions.announce(client);
        } catch { reject('AUTH_INVALID_TOKEN'); } // Never log raw token or provider errors.
        finally { verifying = false; }
        return;
      }
      if (!authenticated(client)) { reject(client.studioIdentity ? 'AUTH_EXPIRED' : 'AUTH_REQUIRED'); return; }
      const text = String(raw);
      if (await sessions.handle(client, text)) return;
      if (!authenticated(client)) return;
      if (presence.handle(client, text)) return;
      // Session capabilities are handled by sessions; never fall back to global control broadcast.
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
  let closing;
  return { server, relay, ready: sessions.ready, idle: sessions.idle, close: () => closing ||= new Promise((resolve, reject) => {
    draining = true;
    for (const client of relay.clients) client.terminate();
    relay.close(() => server.close((error) => sessions.idle().then(() => { storage.close?.(); if (error) reject(error); else resolve(); })));
  }) };
}
module.exports = { createRelay, resolvePort };
