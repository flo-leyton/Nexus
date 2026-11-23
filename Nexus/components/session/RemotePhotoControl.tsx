import { useEffect, useRef, useState } from 'react';
import { Button, Text } from 'react-native-paper';
import { sessionErrorMessage } from '@/hooks/use-studio-session';
import type { getSessionService } from '@/services/session';
import { sessionStyles } from './SessionUI';

export function RemotePhotoControl({ service, sessionId, nodeId, disabled, label }: {
  service: Awaited<ReturnType<typeof getSessionService>>;
  sessionId: string; nodeId: string; disabled: boolean; label: string;
}) {
  const [status, setStatus] = useState('');
  const request = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => {
    const clear = () => {
      if (!request.current) return;
      clearTimeout(request.current.timer);
      request.current = null;
    };
    const off = service.subscribe((snapshot) => {
      const current = request.current;
      if (!current) return;
      if (snapshot.connection !== 'Connected') { clear(); setStatus('Sin conexión. Comprueba la foto en el Node.'); return; }
      const event = snapshot.lastEvent;
      if (event?.sessionId !== sessionId || event.payload.requestId !== current.id) return;
      if (event.type === 'SESSION_ERROR') { clear(); setStatus(sessionErrorMessage(event.payload.code)); }
      if (event.type === 'PHOTO_RESULT' && event.payload.nodeId === nodeId) {
        if (event.payload.status === 'received') setStatus('Disparo recibido · esperando guardado');
        else {
          clear();
          setStatus(event.payload.status === 'saved' ? `Foto guardada en el Node · …${event.payload.photoId.slice(-6)}` : event.payload.error);
        }
      }
    });
    return () => { off(); clear(); };
  }, [service, sessionId, nodeId]);
  return <>
    <Button mode="outlined" icon="camera-outline" accessibilityLabel={`Foto de ${label}`}
      disabled={disabled || !!request.current} contentStyle={sessionStyles.touch} onPress={() => {
        if (disabled || request.current) return;
        try {
          const id = service.requestPhoto(sessionId, nodeId);
          const timer = setTimeout(() => {
            request.current = null;
            setStatus('Guardado sin confirmar. Comprueba el original en el Node.');
          }, 32000);
          request.current = { id, timer };
          setStatus('Enviando disparo…');
        } catch (error) { setStatus(sessionErrorMessage(error)); }
      }}>Foto</Button>
    {!!status && <Text variant="bodySmall" accessibilityLiveRegion="polite">{status}</Text>}
  </>;
}
