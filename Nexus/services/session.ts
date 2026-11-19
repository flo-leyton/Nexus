import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLastNodeSessionStore } from './lastNodeSession';
import { getOrCreateDeviceId } from './deviceIdentity';
import { saveTakeMedia } from './takeMedia';
import { createSessionClient } from './sessionClient';
import { connectSocket, sendSocketMessage, subscribeToSocketMessages, subscribeToSocketStatus } from './socket';

let clientTask: Promise<ReturnType<typeof createSessionClient>> | null = null;

// Shared application service. Screens subscribe, then call methods; never build envelopes.
export function getSessionService() {
  if (!clientTask) {
    const history = createLastNodeSessionStore(AsyncStorage);
    clientTask = getOrCreateDeviceId().then(async (deviceId) => {
      let initialError: string | null = null;
      const initial = await history.load().catch(() => { initialError = 'No se pudo leer la última sesión. Ingresa con el código.'; return null; });
      return createSessionClient(deviceId, Crypto.randomUUID, {
      connect: connectSocket,
      send: sendSocketMessage,
      subscribeMessages: subscribeToSocketMessages,
      subscribeStatus: subscribeToSocketStatus,
      }, { initial, initialError, save: history.save }, { save: saveTakeMedia });
    }).catch((error) => { clientTask = null; throw error; });
  }
  return clientTask;
}
