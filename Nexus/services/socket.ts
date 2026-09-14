import { SERVER_CONFIG } from '@/config/server';

export type ConnectionStatus = 'Disconnected' | 'Connecting' | 'Connected' | 'Error';

type MessageListener = (data: unknown) => void;
type StatusListener = (status: ConnectionStatus) => void;

let socket: WebSocket | null = null;
let connectionStatus: ConnectionStatus = 'Disconnected';
const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();

function updateStatus(status: ConnectionStatus) {
  connectionStatus = status;
  statusListeners.forEach((listener) => listener(status));
}

export function connectSocket() {
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    return;
  }

  updateStatus('Connecting');

  try {
    socket = new WebSocket(SERVER_CONFIG.SOCKET_URL);
  } catch {
    socket = null;
    updateStatus('Error');
    return;
  }

  const currentSocket = socket;

  currentSocket.onopen = () => {
    if (socket === currentSocket) {
      updateStatus('Connected');
    }
  };

  currentSocket.onmessage = (event) => {
    messageListeners.forEach((listener) => listener(event.data));
  };

  currentSocket.onerror = () => {
    if (socket === currentSocket) {
      updateStatus('Error');
    }
  };

  currentSocket.onclose = () => {
    if (socket === currentSocket) {
      socket = null;
      updateStatus('Disconnected');
    }
  };
}

export function sendSocketMessage(message: unknown) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  socket.send(JSON.stringify(message));
  return true;
}

export function subscribeToSocketMessages(listener: MessageListener) {
  messageListeners.add(listener);
  return () => messageListeners.delete(listener);
}

export function subscribeToSocketStatus(listener: StatusListener) {
  statusListeners.add(listener);
  listener(connectionStatus);
  return () => statusListeners.delete(listener);
}
