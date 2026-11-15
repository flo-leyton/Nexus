import { getRelayUrl } from '../config/relay';
import { getStudioCredentials, subscribeStudioIdentity, getPreviousStudioUser, forgetPreviousStudioIdentity } from './studioIdentity';
import { createSocketClient } from './socketClient';

export type { ConnectionStatus } from './socketClient';
// The only WebSocket owner in the application.
const client = createSocketClient({ url: getRelayUrl, credentials: getStudioCredentials,
  identityChanged: subscribeStudioIdentity, create: (url) => new WebSocket(url) });
// Also reconciles a transfer whose AUTH_OK was lost: normal authorization of the
// current UID proves that durable device ownership now belongs to that UID.
client.subscribeStatus((status) => {
  if (status === 'Connected' && getPreviousStudioUser()) forgetPreviousStudioIdentity();
});
export const connectSocket = client.connect;
export const disconnectSocket = client.disconnect;
export const sendSocketMessage = client.send;
export const subscribeToSocketMessages = client.subscribeMessages;
export const subscribeToSocketStatus = client.subscribeStatus;
export const getSocketError = client.getError;
export const transferSocketIdentity = client.transferIdentity;
