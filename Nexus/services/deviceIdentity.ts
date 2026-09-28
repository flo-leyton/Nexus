import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_STORAGE_KEY = '@nexus/device-id';

let deviceIdTask: Promise<string> | null = null;

async function loadOrCreateDeviceId(): Promise<string> {
  const storedDeviceId = await AsyncStorage.getItem(
    DEVICE_ID_STORAGE_KEY,
  );

  if (storedDeviceId) {
    return storedDeviceId;
  }

  const newDeviceId = Crypto.randomUUID();

  await AsyncStorage.setItem(
    DEVICE_ID_STORAGE_KEY,
    newDeviceId,
  );

  return newDeviceId;
}

export function getOrCreateDeviceId(): Promise<string> {
  if (!deviceIdTask) {
    deviceIdTask = loadOrCreateDeviceId();
  }

  return deviceIdTask;
}