const WebSocket = require('ws');
const { WebSocketServer } = WebSocket;

const relay = new WebSocketServer({ host: '0.0.0.0', port: 8080 });

relay.on('listening', () => {
  console.log('WebSocket relay listening on ws://0.0.0.0:8080');
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
