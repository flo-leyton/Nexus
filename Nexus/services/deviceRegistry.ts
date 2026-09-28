import { onAuthStateChanged } from 'firebase/auth';
import {
    get,
    ref,
    serverTimestamp,
    update,
} from 'firebase/database';

import { auth, database } from '../app/firebase';
import { getOrCreateDeviceId } from './deviceIdentity';
import { collectDeviceInfo } from './deviceInfo';

function hardwareSupport(value: string | null) {
  if (value === 'Sí') return 'supported';
  if (value === 'No') return 'unsupported';

  return 'unknown';
}

export async function registerCurrentDevice() {
  const user = auth.currentUser;

  if (!user) {
    return null;
  }

  const [deviceId, info] = await Promise.all([
    getOrCreateDeviceId(),
    collectDeviceInfo(),
  ]);

  const deviceRef = ref(
    database,
    `devices/${user.uid}/${deviceId}`,
  );

  const existingDevice = await get(deviceRef);

  const deviceData = {
    deviceId,
    ownerUid: user.uid,

    identity: {
      name: info.name ?? 'NEXUS Device',
      brand: info.brand ?? 'Unknown',
      manufacturer: info.manufacturer ?? 'Unknown',
      model: info.model ?? 'Unknown',
      kind: info.kind ?? 'Unknown',
      os: info.os ?? 'Unknown',
      osVersion: info.version ?? 'Unknown',
      api: info.api ?? 'Unknown',
    },

    specs: {
      architecture: info.architecture ?? 'Unknown',
      ram: info.ram ?? 'Unknown',
      storage: info.storage ?? 'Unknown',
      screen: info.screen ?? 'Unknown',

      frontCamera: info.frontCamera ?? 'Unknown',
      backCamera: info.backCamera ?? 'Unknown',
      flash: info.flash ?? 'Unknown',
    },

    runtime: {
      freeStorage: info.free ?? 'Unknown',
      battery: info.battery ?? 'Unknown',
      charging: info.charging ?? 'Unknown',
      network: info.network ?? 'Unknown',
    },

    capabilities: {
      vibration: {
        implemented: true,
        shared: true,
        hardwareSupport: 'unknown',
      },

      flashlight: {
        implemented: true,
        shared: true,
        hardwareSupport: hardwareSupport(info.flash),
      },
    },

    updatedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
  };

  await update(deviceRef, {
    ...deviceData,

    ...(!existingDevice.exists()
      ? {
          createdAt: serverTimestamp(),
        }
      : {}),
  });

  return {
    deviceId,
    info,
  };
}

export function startDeviceRegistry() {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      return;
    }

    void registerCurrentDevice().catch((error) => {
      console.warn(
        'NEXUS device registration failed:',
        error,
      );
    });
  });
}