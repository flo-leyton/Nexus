import { AppState } from 'react-native';

import { collectDeviceInfo } from './deviceInfo';
import { isDeviceInfo, type DeviceInfo } from './deviceProtocol';
import { sendSocketMessage, subscribeToSocketMessages, subscribeToSocketStatus, type ConnectionStatus } from './socket';

type Snapshot = {
  local: DeviceInfo | null;
  remote: DeviceInfo | null;
  remoteState: 'waiting' | 'connected' | 'disconnected';
  connection: ConnectionStatus;
};
let snapshot: Snapshot = { local: null, remote: null, remoteState: 'waiting', connection: 'Disconnected' };
const listeners = new Set<() => void>();
const roles: Partial<Record<'vibration' | 'flashlight', 'A' | 'B'>> = {};
let refreshTask: Promise<void> | null = null;
let remoteId: string | null = null;

function update(change: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...change };
  listeners.forEach((listener) => listener());
}

function roleLabel() {
  if (roles.vibration && roles.flashlight && roles.vibration !== roles.flashlight) {
    return `Vibración: Teléfono ${roles.vibration} · Linterna: Teléfono ${roles.flashlight}`;
  }
  const role = roles.vibration ?? roles.flashlight;
  return role ? `Teléfono ${role}` : 'Sin seleccionar';
}

function publish() {
  if (snapshot.local && snapshot.connection === 'Connected') {
    sendSocketMessage({ type: 'DEVICE_INFO', info: snapshot.local });
  }
}

export function reportDeviceRole(feature: keyof typeof roles, role: 'A' | 'B') {
  roles[feature] = role;
  if (snapshot.local) update({ local: { ...snapshot.local, role: roleLabel() } });
  publish();
}

export function refreshDeviceInfo() {
  if (!refreshTask) {
    refreshTask = collectDeviceInfo().then((info) => {
      update({ local: { ...info, role: roleLabel() } });
      publish();
    }).catch(() => {
      // Conservar la última lectura si el sistema no permite consultar los datos.
    }).finally(() => { refreshTask = null; });
  }
  return refreshTask;
}

export const getDeviceSnapshot = () => snapshot;
export function subscribeDeviceInfo(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Se monta una sola vez en el layout; no crea ni abre ningún WebSocket.
export function startDevicePresence() {
  const unsubscribeMessages = subscribeToSocketMessages((raw) => {
    let message;
    try { message = JSON.parse(String(raw)); } catch { return; }
    if (!message || typeof message !== 'object' || typeof message.id !== 'string') return;
    if (message.type === 'DEVICE_INFO' && isDeviceInfo(message.info)) {
      remoteId = message.id;
      update({ remote: message.info, remoteState: 'connected' });
    } else if (message.type === 'DEVICE_LEFT' && message.id === remoteId) {
      update({ remoteState: 'disconnected' });
    }
  });
  const unsubscribeStatus = subscribeToSocketStatus((connection) => {
    update({ connection, ...(connection !== 'Connected' && snapshot.remote ? { remoteState: 'disconnected' as const } : {}) });
    if (connection === 'Connected') {
      remoteId = null;
      update({ remote: null, remoteState: 'waiting' });
      sendSocketMessage({ type: 'DEVICE_INFO_REQUEST' });
      void refreshDeviceInfo();
    }
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') void refreshDeviceInfo();
  });
  const timer = setInterval(() => {
    if (AppState.currentState === 'active' && snapshot.connection === 'Connected') void refreshDeviceInfo();
  }, 30000);
  void refreshDeviceInfo();
  return () => { unsubscribeMessages(); unsubscribeStatus(); appState.remove(); clearInterval(timer); };
}
