// Test-process defense in depth: even a mistaken SDK URL cannot open an external socket.
const net = require('node:net');
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  const options = first && typeof first === 'object' ? first : null;
  const ipc = options?.path || (typeof first === 'string' ? first : null);
  if (!ipc) {
    const host = options?.host || options?.hostname || (typeof args[1] === 'string' ? args[1] : 'localhost');
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Blocked non-loopback network connection in emulator tests.');
  }
  return original.apply(this, args);
};
