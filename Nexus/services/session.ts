import * as Crypto from 'expo-crypto';
import { getOrCreateDeviceId } from './deviceIdentity';
import { createSessionClient } from './sessionClient';
import { connectSocket, sendSocketMessage, subscribeToSocketMessages, subscribeToSocketStatus } from './socket';

let clientTask: Promise<ReturnType<typeof createSessionClient>> | null = null;

// Shared application service. Screens subscribe, then call methods; never build envelopes.
export function getSessionService() {
  if (!clientTask) {
    clientTask = getOrCreateDeviceId().then((deviceId) => createSessionClient(deviceId, Crypto.randomUUID, {
      connect: connectSocket,
      send: sendSocketMessage,
      subscribeMessages: subscribeToSocketMessages,
      subscribeStatus: subscribeToSocketStatus,
    })).catch((error) => { clientTask = null; throw error; });
  }
  return clientTask;
}
