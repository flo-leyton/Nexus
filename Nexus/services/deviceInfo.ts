import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import { Paths } from 'expo-file-system';
import * as Network from 'expo-network';
import { Dimensions, Platform } from 'react-native';

import type { DeviceInfo } from './deviceProtocol';

async function available<T>(read: () => T | Promise<T>): Promise<T | null> {
  try { return await read(); } catch { return null; }
}

function gigabytes(bytes: number | null) {
  return bytes !== null && bytes >= 0 ? `${(bytes / 1e9).toFixed(1)} GB` : null;
}

export async function collectDeviceInfo(): Promise<DeviceInfo> {
  const [level, charging, network, kind, storage, free, features, batteryAvailable] = await Promise.all([
    available(() => Battery.getBatteryLevelAsync()),
    available(() => Battery.getBatteryStateAsync()),
    available(() => Network.getNetworkStateAsync()),
    available(() => Device.getDeviceTypeAsync()),
    available(() => Paths.totalDiskSpace),
    available(() => Paths.availableDiskSpace),
    Platform.OS === 'android' ? available(() => Device.getPlatformFeaturesAsync()) : null,
    available(() => Battery.isAvailableAsync()),
  ]);
  const screen = Dimensions.get('screen');
  const capability = (feature: string) => features === null ? null : features.includes(feature) ? 'Sí' : 'No';
  return {
    brand: Device.brand, manufacturer: Device.manufacturer, model: Device.modelName, name: Device.deviceName,
    kind: kind === Device.DeviceType.PHONE ? 'Teléfono' : kind === Device.DeviceType.TABLET ? 'Tablet' : null,
    os: Device.osName, version: Device.osVersion,
    api: Platform.OS === 'android' && Device.platformApiLevel !== null ? String(Device.platformApiLevel) : null,
    architecture: Device.supportedCpuArchitectures?.join(', ') ?? null,
    ram: gigabytes(Device.totalMemory), storage: gigabytes(storage), free: gigabytes(free),
    screen: `${Math.round(screen.width * screen.scale)} × ${Math.round(screen.height * screen.scale)} px`,
    battery: batteryAvailable && level !== null && level >= 0 ? `${Math.round(level * 100)} %` : null,
    charging: !batteryAvailable ? null : charging === Battery.BatteryState.CHARGING ? 'Cargando' :
      charging === Battery.BatteryState.FULL ? 'No cargando (completa)' :
      charging === Battery.BatteryState.UNPLUGGED ? 'No cargando' : null,
    network: network?.type === Network.NetworkStateType.WIFI ? 'Wi-Fi' :
      network?.type === Network.NetworkStateType.CELLULAR ? 'Datos móviles' :
      network?.type === Network.NetworkStateType.NONE ? 'Sin conexión' : null,
    frontCamera: capability('android.hardware.camera.front'),
    backCamera: capability('android.hardware.camera'),
    flash: capability('android.hardware.camera.flash'),
    // Expo no expone una comprobación fiable de la presencia de un vibrador.
    vibration: null,
    role: null,
  };
}
