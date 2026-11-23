import { useCallback, useEffect, useRef, useState } from 'react';
import { createNodeZoom, ZOOM_INTERVAL_MS } from '@/services/nodeZoom';
import type { getSessionService } from '@/services/session';

type Service = Awaited<ReturnType<typeof getSessionService>>;

export function useNodeZoom(service: Service, sessionId: string, controllerId: string, deviceId: string, nodeId: string,
  available: boolean, canAdjust: () => boolean) {
  const [authority] = useState(createNodeZoom);
  const [percent, setPercent] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const publish = useCallback(() => {
    const { connection, sessions } = service.getSnapshot();
    const session = sessions[sessionId];
    const member = session?.members[deviceId];
    if (connection !== 'Connected' || session?.state === 'closed' || member?.online !== true || member.nodeId !== nodeId) return;
    try { service.reportZoom(sessionId, controllerId, available && canAdjust() ? authority.read() : null); }
    catch { /* The next connection queries the current value. */ }
  }, [authority, available, canAdjust, controllerId, deviceId, nodeId, service, sessionId]);
  useEffect(() => {
    const off = service.registerZoomHandler(sessionId, (update) => {
      if (!available || !canAdjust()) return null;
      const value = authority.accept(update);
      setPercent(value.percent);
      return value;
    });
    publish();
    return () => {
      off();
      clearTimeout(timer.current);
      timer.current = undefined;
    };
  }, [authority, available, canAdjust, publish, service, sessionId]);
  const set = (value: number) => {
    if (!canAdjust()) return;
    setPercent(authority.set(value).percent);
    if (!available || timer.current !== undefined) return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      publish();
    }, ZOOM_INTERVAL_MS);
  };
  return { percent, set, adjust: (delta: number) => set(authority.read().percent + delta) };
}
