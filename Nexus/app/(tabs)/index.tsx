import { router, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StudioHome } from '@/components/studio/StudioHome';
import { RejoinSessionPanel } from '@/components/RejoinSessionPanel';
import { connectionLabel, sessionErrorMessage, useStudioSession } from '@/hooks/use-studio-session';
import { connectSocket } from '@/services/socket';

export default function StudioScreen() {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const operation = useRef<{ kind: 'create' | 'join'; messageId: string; sessionId?: string } | null>(null);
  const { service, snapshot, deviceId, error } = useStudioSession((next) => {
    const current = operation.current;
    const event = next.lastEvent;
    if (!current) {
      // Restore an outcome received while this screen was unmounted.
      if (event?.type === 'SESSION_JOIN_REJECTED' || event?.type === 'SESSION_CLOSED') {
        setFailed(true);
        setNotice(event.type === 'SESSION_JOIN_REJECTED'
          ? 'El Controller rechazó tu solicitud. Puedes volver a solicitar ingreso.'
          : 'El Controller cerró la Session. Solicita un código de otra Session.');
      }
      return;
    }
    if (next.connection !== 'Connected') {
      operation.current = null;
      setSending(false);
      setFailed(true);
      setNotice('Se perdió la conexión. El ingreso debe solicitarse de nuevo al reconectar.');
    } else if (event?.type === 'SESSION_JOIN_PENDING' && event.payload.requestId === current.messageId) {
      current.sessionId = event.sessionId;
      setSending(false);
      setNotice('');
    } else if (event?.type === 'SESSION_SNAPSHOT' && (event.payload.requestId === current.messageId ||
        (current.kind === 'join' && current.sessionId === event.sessionId))) {
      operation.current = null;
      setSending(false);
      setNotice(current.kind === 'create' ? 'Sesión creada. Comparte su código y ábrela para aceptar Nodes.'
        : event.payload.session.members[deviceId]?.online === false
          ? 'Ya perteneces a esta sesión. Ábrela y reanuda tu participación.'
          : 'Participación confirmada. Ya puedes abrir la sesión.');
    } else if ((event?.type === 'SESSION_ERROR' || event?.type === 'SESSION_JOIN_REJECTED') &&
        event.payload.requestId === current.messageId) {
      operation.current = null;
      setSending(false);
      setFailed(true);
      setNotice(event.type === 'SESSION_ERROR' ? sessionErrorMessage(event.payload.code) : 'El Controller rechazó tu solicitud. Puedes volver a solicitar ingreso.');
    } else if (event?.type === 'SESSION_CLOSED' && event.sessionId === current.sessionId) {
      operation.current = null;
      setSending(false);
      setFailed(true);
      setNotice('El Controller cerró la Session explícitamente. Solicita un código nuevo.');
    }
  });
  const connected = snapshot?.connection === 'Connected';
  const pending = Object.entries(snapshot?.pending ?? {}).filter(([, requests]) => requests.some((r) => r.deviceId === deviceId));
  const busy = sending || pending.length > 0 || !!snapshot?.joinInFlight;

  const start = (kind: 'create' | 'join') => {
    if (operation.current || busy) return;
    setFailed(false);
    try {
      if (!service || !connected) throw new Error('SOCKET_NOT_CONNECTED');
      if (kind === 'create') {
        operation.current = { kind, ...service.createSession() };
      } else {
        operation.current = { kind, messageId: service.requestJoin(code) };
      }
      setSending(true);
      setNotice(kind === 'create' ? 'Creando sesión en el relay…' : 'Enviando solicitud al Controller…');
    } catch (cause) {
      setFailed(true);
      setNotice(sessionErrorMessage(cause));
    }
  };

  return (
    <StudioHome
      topInset={insets.top}
      connected={connected}
      connecting={snapshot?.connection === 'Connecting'}
      connectionLabel={connectionLabel(snapshot?.connection)}
      serviceReady={!!service}
      busy={busy}
      sending={sending}
      code={code}
      deviceId={deviceId}
      sessions={Object.values(snapshot?.sessions ?? {})}
      error={error}
      failed={failed}
      notice={notice}
      pendingMessage={pending.length > 0 ? pending.some(([, requests]) => requests.some((r) => r.deviceId === deviceId && r.controllerOnline === false))
        ? 'Solicitud enviada · Esperando aprobación. El Controller está desconectado.' : 'Solicitud enviada · Esperando aprobación' : undefined}
      rejoinPanel={service && snapshot ? <RejoinSessionPanel service={service} snapshot={snapshot} deviceId={deviceId} pendingInParent /> : null}
      onCodeChange={setCode}
      onCreate={() => start('create')}
      onJoin={() => start('join')}
      onConnect={connectSocket}
      onRefresh={() => {
        try { service?.discoverSessions(); setNotice('Consultando tus Sessions activas persistidas…'); }
        catch (cause) { setNotice(sessionErrorMessage(cause)); }
      }}
      onOpenSession={(sessionId) => router.push(`/session/${sessionId}` as Href)}
    />
  );
}
