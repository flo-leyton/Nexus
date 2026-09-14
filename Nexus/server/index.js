const WebSocket = require('ws');
const { SERVER_CONFIG } = require('../config/server.ts');
const { WebSocketServer } = WebSocket;

const relay = new WebSocketServer({ host: SERVER_CONFIG.LISTEN_HOST, port: SERVER_CONFIG.PORT });

relay.on('listening', () => {
  console.log(`WebSocket relay listening on ws://${SERVER_CONFIG.LISTEN_HOST}:${SERVER_CONFIG.PORT}`);
});

relay.on('connection', (client) => {
  console.log('Client connected');

  client.on('message', (message) => {
    const messageText = message.toString();
    console.log('Message received:', messageText);

    for (const otherClient of relay.clients) {
      if (otherClient !== client && otherClient.readyState === WebSocket.OPEN) {
        otherClient.send(messageText);
      }
    }
  });

  client.on('close', () => {
    console.log('Client disconnected');
  });

  client.on('error', (error) => {
    console.error('Client error:', error.message);
  });
});
