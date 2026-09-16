import { useSyncExternalStore } from 'react';

import { getDeviceSnapshot, subscribeDeviceInfo } from '@/services/devicePresence';

export function useDeviceInfo() {
  return useSyncExternalStore(subscribeDeviceInfo, getDeviceSnapshot, getDeviceSnapshot);
}
