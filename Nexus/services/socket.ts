import { getRelayUrl } from '../config/relay';
import { getStudioCredentials, subscribeStudioIdentity } from './studioIdentity';
import { createSocketClient } from './socketClient';

export type { ConnectionStatus } from './socketClient';
// The only WebSocket owner in the application.
const client = createSocketClient({ url: getRelayUrl, credentials: getStudioCredentials,
  identityChanged: subscribeStudioIdentity, create: (url) => new WebSocket(url) });
export const connectSocket = client.connect;
export const disconnectSocket = client.disconnect;
export const sendSocketMessage = client.send;
export const subscribeToSocketMessages = client.subscribeMessages;
export const subscribeToSocketStatus = client.subscribeStatus;
export const getSocketError = client.getError;
