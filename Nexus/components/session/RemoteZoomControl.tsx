import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native-paper';
import { ZOOM_INTERVAL_MS } from '@/services/nodeZoom';
import type { getSessionService } from '@/services/session';
import type { ZoomValue } from '@/services/sessionProtocol';
import { PreviewZoomSlider } from './PreviewZoomSlider';

export function RemoteZoomControl({ service, sessionId, nodeId, deviceId, disabled, label }: {
  service: Awaited<ReturnType<typeof getSessionService>>;
  sessionId: string; nodeId: string; deviceId: string; disabled: boolean; label: string;
}) {
  const [confirmed, setConfirmed] = useState<ZoomValue | null>(null);
  const [status, setStatus] = useState('');
  const queue = useRef<((percent: number) => void) | null>(null);
  useEffect(() => {
    let online = false;
    let current: ZoomValue | null = null;
    let revision = 0;
    let lastEventId: string | undefined;
    let pending: string | undefined;
    let queued: number | undefined;
    let throttle: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const clearRequest = () => {
      clearTimeout(timeout);
      pending = undefined;
    };
    const send = (update?: ZoomValue) => {
      try {
        pending = service.requestZoom(sessionId, nodeId, update);
        setStatus(update ? 'Esperando confirmación del Node' : 'Consultando zoom');
        timeout = setTimeout(() => {
          clearRequest();
          queued = undefined;
          if (update && online) send();
          else setStatus('El Node no respondió');
        }, 5000);
      } catch { setStatus('Zoom remoto no disponible'); }
    };
    const flush = () => {
      if (throttle !== undefined || pending || queued === undefined || !current) return;
      throttle = setTimeout(() => {
        throttle = undefined;
        const percent = queued;
        queued = undefined;
        if (online && current && percent !== undefined && percent !== current.percent) send({ percent, revision: current.revision });
      }, ZOOM_INTERVAL_MS);
    };
    queue.current = (percent) => {
      if (!online || !current) return;
      queued = percent;
      flush();
    };
    setConfirmed(null);
    setStatus('');
    const off = service.subscribe(({ connection, sessions, lastEvent }) => {
      const session = sessions[sessionId];
      const member = session?.members[deviceId];
      if (disabled || connection !== 'Connected' || session?.state === 'closed' || member?.nodeId !== nodeId || member.online === false) {
        online = false;
        revision = 0;
        current = null;
        queued = undefined;
        clearTimeout(throttle);
        throttle = undefined;
        clearRequest();
        setConfirmed(null);
        setStatus(disabled ? '' : 'Node desconectado');
        return;
      }
      if (!online) {
        online = true;
        lastEventId = lastEvent?.messageId;
        send();
        return;
      }
      if (!lastEvent || lastEvent.messageId === lastEventId || lastEvent.sessionId !== sessionId) return;
      lastEventId = lastEvent.messageId;
      if (lastEvent.type === 'SESSION_ERROR' && lastEvent.payload.requestId === pending) {
        clearRequest();
        queued = undefined;
        setStatus('Zoom remoto no disponible');
      }
      if (lastEvent.type !== 'ZOOM_STATE' || lastEvent.payload.nodeId !== nodeId) return;
      const { value, requestId } = lastEvent.payload;
      if (requestId === pending) clearRequest();
      if (value && value.revision < revision) { flush(); return; }
      if (value) revision = value.revision;
      else queued = undefined;
      current = value;
      setConfirmed(value);
      setStatus(value ? (pending ? 'Esperando confirmación del Node' : '') : 'Zoom no disponible en el Node');
      flush();
    });
    return () => { queue.current = null; off(); clearRequest(); clearTimeout(throttle); };
  }, [deviceId, disabled, nodeId, service, sessionId]);

  return <>
    <PreviewZoomSlider overlay={false} label={`Zoom de ${label}`} percent={confirmed?.percent ?? null}
      disabled={disabled || !confirmed} onChange={(value) => queue.current?.(value)} />
    {!!status && <Text variant="labelSmall" accessibilityLiveRegion="polite">{status}</Text>}
  </>;
}
