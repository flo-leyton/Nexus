import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import type { getSessionService } from '@/services/session';
import { sessionStyles } from './SessionUI';

export function RemoteTorchControl({ service, sessionId, nodeId, online, disabled, label }: {
  service: Awaited<ReturnType<typeof getSessionService>>;
  sessionId: string;
  nodeId: string;
  online: boolean;
  disabled: boolean;
  label: string;
}) {
  const [request, setRequest] = useState<{ enabled: boolean; status: string } | null>(null);
  const pending = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => {
    const off = service.subscribe((snapshot) => {
      const member = Object.values(snapshot.sessions[sessionId]?.members ?? {}).find((item) => item.nodeId === nodeId);
      const current = pending.current;
      if (snapshot.connection !== 'Connected' || !member || member.online === false) {
        if (current) clearTimeout(current.timer);
        pending.current = null;
        setRequest(null);
        return;
      }
      const event = snapshot.lastEvent;
      if (!current || event?.sessionId !== sessionId || event.payload.requestId !== current.id ||
          (event.type !== 'SESSION_ERROR' && (event.type !== 'TORCH_RESULT' || event.payload.nodeId !== nodeId))) return;
      clearTimeout(current.timer);
      pending.current = null;
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
  return <View style={sessionStyles.stack}>
    <Text variant="bodyMedium" accessibilityLiveRegion="polite">
      {!online ? 'Linterna · cámara desconectada'
        : request ? `Linterna · ${request.enabled ? 'encendido' : 'apagado'} solicitado · ${request.status}` : 'Linterna · sin orden reciente'}
    </Text>
    <View style={sessionStyles.row}>
      <Button mode="outlined" icon="flashlight" accessibilityLabel={`Encender linterna de ${label}`}
        disabled={!online || disabled || !!pending.current} onPress={() => send(true)} style={sessionStyles.flex}
        contentStyle={sessionStyles.touch}>Encender</Button>
      <Button mode="outlined" icon="flashlight-off" accessibilityLabel={`Apagar linterna de ${label}`}
        disabled={!online || disabled || !!pending.current} onPress={() => send(false)} style={sessionStyles.flex}
        contentStyle={sessionStyles.touch}>Apagar</Button>
    </View>
  </View>;
}
