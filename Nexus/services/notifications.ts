import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import type { NotificationPermissionsStatus } from 'expo-notifications';

export const NOTIFICATION_CHANNEL_ID = 'default';

export type PushRegistrationResult = {
  status: 'registered' | 'permission-denied' | 'error';
  permission: NotificationPermissionsStatus | null;
  expoPushToken: string | null;
  nativePushToken: string | null;
  error: string | null;
};

function assertAndroidBuild() {
  if (Platform.OS !== 'android') {
    throw new Error('Esta prueba requiere un Development Build Android.');
  }
  if (Constants.executionEnvironment === 'storeClient') {
    throw new Error('Push remoto no está disponible en Expo Go. Instala el Development Build Android.');
  }
}

function assertPhysicalAndroid() {
  assertAndroidBuild();
  if (!Device.isDevice) {
    throw new Error('Para esta práctica, registra un dispositivo Android físico.');
  }
}

export function getEasProjectId(): string | null {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof projectId === 'string' && projectId.trim() ? projectId : null;
}

// Load the native module only in a supported build, keeping web and Expo Go usable.
async function notificationsModule() {
  assertAndroidBuild();
  return import('expo-notifications');
}

export async function setupNotificationHandler() {
  if (Platform.OS !== 'android' || Constants.executionEnvironment === 'storeClient') return;
  const notifications = await notificationsModule();
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function configureNotifications() {
  assertPhysicalAndroid();
  await setupNotificationHandler();
  const notifications = await notificationsModule();
  await notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
    name: 'NEXUS Studio · Prueba Push',
    importance: notifications.AndroidImportance.HIGH,
  });
}

export async function getNotificationPermissionStatus() {
  const notifications = await notificationsModule();
  return notifications.getPermissionsAsync();
}

export async function requestNotificationPermissions() {
  // Android 13 requires a channel before the notification permission prompt.
  await configureNotifications();
  const current = await getNotificationPermissionStatus();
  if (current.granted || !current.canAskAgain) return current;
  const notifications = await notificationsModule();
  return notifications.requestPermissionsAsync();
}

export async function getExpoPushToken(): Promise<string> {
  assertPhysicalAndroid();
  const projectId = getEasProjectId();
  if (!projectId) throw new Error('No se encontró el EAS Project ID en Expo config.');
  const notifications = await notificationsModule();
  return (await notifications.getExpoPushTokenAsync({ projectId })).data;
}

export async function getNativePushToken(): Promise<string> {
  assertPhysicalAndroid();
  const notifications = await notificationsModule();
  const token = await notifications.getDevicePushTokenAsync();
  if (token.type !== 'android' || typeof token.data !== 'string' || !token.data) {
    throw new Error('No se recibió un token FCM nativo Android válido.');
  }
  return token.data;
}

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  const result: PushRegistrationResult = {
    status: 'error', permission: null, expoPushToken: null, nativePushToken: null, error: null,
  };
  try {
    result.permission = await requestNotificationPermissions();
    if (!result.permission.granted) {
      result.status = 'permission-denied';
      result.error = result.permission.canAskAgain
        ? 'Permiso de notificaciones no concedido. Puedes volver a intentarlo.'
        : 'Permiso de notificaciones bloqueado. Habilítalo en Ajustes de Android para NEXUS.';
      return result;
    }
    // Preserve each successful token even if the other provider fails.
    try {
      result.expoPushToken = await getExpoPushToken();
    } catch {
      result.error = getEasProjectId()
        ? 'No se pudo obtener el Expo Push Token. Comprueba la conexión y la configuración EAS.'
        : 'No se encontró el EAS Project ID en Expo config.';
    }
    try {
      result.nativePushToken = await getNativePushToken();
    } catch {
      const detail = 'No se pudo obtener el token FCM nativo. Comprueba Google Play Services y google-services.json en el Development Build.';
      result.error = result.error ? `${result.error} ${detail}` : detail;
    }
    if (!result.error) result.status = 'registered';
  } catch {
    if (Platform.OS !== 'android') result.error = 'Esta prueba requiere un Development Build Android.';
    else if (Constants.executionEnvironment === 'storeClient') result.error = 'Push remoto no está disponible en Expo Go. Instala el Development Build Android.';
    else if (!Device.isDevice) result.error = 'Para esta práctica, registra un dispositivo Android físico.';
    else result.error = 'No se pudieron configurar el canal o los permisos. Comprueba el Development Build y vuelve a intentarlo.';
  }
  return result;
}
