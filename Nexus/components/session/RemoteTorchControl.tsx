import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import type { getSessionService } from '@/services/session';
import { sessionStyles } from './SessionUI';

export function RemoteTorchControl({ service, sessionId, nodeId, online, disabled, label, compact = false }: {
  service: Awaited<ReturnType<typeof getSessionService>>;
  sessionId: string;
  nodeId: string;
  online: boolean;
  disabled: boolean;
  label: string;
  compact?: boolean;
}) {
  const [request, setRequest] = useState<{ enabled: boolean; status: string } | null>(null);
  const [requestedOn, setRequestedOn] = useState(false);
  const pending = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => {
    const off = service.subscribe((snapshot) => {
      const member = Object.values(snapshot.sessions[sessionId]?.members ?? {}).find((item) => item.nodeId === nodeId);
      const current = pending.current;
      if (snapshot.connection !== 'Connected' || !member || member.online === false) {
        if (current) clearTimeout(current.timer);
        pending.current = null;
        setRequest(null);
        setRequestedOn(false);
        return;
      }
      const event = snapshot.lastEvent;
      if (!current || event?.sessionId !== sessionId || event.payload.requestId !== current.id ||
          (event.type !== 'SESSION_ERROR' && (event.type !== 'TORCH_RESULT' || event.payload.nodeId !== nodeId))) return;
      clearTimeout(current.timer);
      pending.current = null;
      if (event.type === 'TORCH_RESULT' && event.payload.available) setRequestedOn(event.payload.enabled);
      const status = event.type === 'SESSION_ERROR' ? 'Orden rechazada'
        : event.payload.available ? 'Orden recibida' : 'Orden recibida · cámara no disponible';
      setRequest((value) => value && { ...value, status });
    });
    return () => {
      off();
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = null;
    };
  }, [nodeId, service, sessionId]);
  const send = (enabled: boolean) => {
    if (!online || disabled || pending.current) return;
    try {
      const id = service.setRemoteTorch(sessionId, nodeId, enabled);
      const timer = setTimeout(() => {
        pending.current = null;
        setRequest({ enabled, status: 'Sin respuesta de la cámara' });
      }, 5500);
      pending.current = { id, timer };
      setRequest({ enabled, status: 'Esperando recepción' });
    } catch {
      setRequest({ enabled, status: 'Orden no enviada' });
    }
  };
  const action = online && requestedOn ? 'Apagar linterna' : 'Encender linterna';
  const status = (!compact || request || !online) && <Text variant={compact ? 'bodySmall' : 'bodyMedium'} accessibilityLiveRegion="polite">
      {!online ? 'Linterna · cámara desconectada'
        : request ? `Última orden · ${request.enabled ? 'encender' : 'apagar'} · ${request.status}` : 'Linterna · sin orden reciente'}
    </Text>;
  return <View style={compact ? { gap: 4 } : sessionStyles.stack}>
    {!compact && status}
    <Button mode="outlined" icon={online && requestedOn ? 'flashlight-off' : 'flashlight'}
      accessibilityLabel={`${action} de ${label}`} disabled={!online || disabled || !!pending.current}
      onPress={() => send(!requestedOn)} contentStyle={compact ? sessionStyles.compactTouch : sessionStyles.touch}
      labelStyle={compact ? sessionStyles.compactLabel : undefined}>{compact ? 'Linterna' : action}</Button>
    {compact && status}
  </View>;
}
