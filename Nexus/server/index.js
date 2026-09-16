const WebSocket = require('ws');
const { SERVER_CONFIG } = require('../config/server.ts');
const { attachDevicePresence } = require('./devicePresence');
const { WebSocketServer } = WebSocket;

const relay = new WebSocketServer({ host: SERVER_CONFIG.LISTEN_HOST, port: SERVER_CONFIG.PORT });
const devicePresence = attachDevicePresence(relay);

relay.on('listening', () => {
  console.log(`WebSocket relay listening on ws://${SERVER_CONFIG.LISTEN_HOST}:${SERVER_CONFIG.PORT}`);
});

relay.on('connection', (client) => {
  devicePresence.connect(client);
  console.log('Client connected');

  client.on('message', (message) => {
    const messageText = message.toString();
    if (devicePresence.handle(client, messageText)) return;
    console.log('Message received:', messageText);

    for (const otherClient of relay.clients) {
      if (otherClient !== client && otherClient.readyState === WebSocket.OPEN) {
        otherClient.send(messageText);
      }
    }
  });

  client.on('close', () => {
    devicePresence.disconnect(client);
    console.log('Client disconnected');
  });

  client.on('error', (error) => {
    console.error('Client error:', error.message);
  });
});
