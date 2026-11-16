import { useEffect, useRef, useState } from 'react';
import { RejoinSessionView } from './session/RejoinSessionView';

import { sessionErrorMessage } from '@/hooks/use-studio-session';
import type { getSessionService } from '@/services/session';
import type { SessionSnapshot } from '@/services/sessionClient';

type Service = Awaited<ReturnType<typeof getSessionService>>;
export function RejoinSessionPanel({ service, snapshot, deviceId, blocked = false }: {
  service: Service; snapshot: SessionSnapshot; deviceId: string; blocked?: boolean; consoleMode?: boolean;
}) {
  const request = useRef<string | null>(null);
  const target = useRef<string | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let connectedBefore = service.getSnapshot().connection === 'Connected';
    return service.subscribe((state) => {
    if (state.connection !== 'Connected') { connectedBefore = false; request.current = null; setNotice('Conecta al relay y vuelve a solicitar reingreso.'); return; }
    if (!connectedBefore) { connectedBefore = true; setNotice('Conexión recuperada. Reanuda tu membresía autorizada o solicita una nueva participación.'); }
    if (!request.current) return;
    const event = state.lastEvent;
    if (!event) return;
    if (event.type === 'SESSION_SNAPSHOT' && event.sessionId === target.current && event.payload.session.members[deviceId]?.kind === 'node' && event.payload.session.members[deviceId]?.online !== false) {
      request.current = null; setNotice('Participación autorizada. Abre la Session, prepara la cámara y confirma READY si se solicita.');
    } else if (event.payload.requestId === request.current) {
      if (event.type === 'SESSION_JOIN_PENDING') setNotice('Solicitud enviada. Espera una nueva aprobación del Controller.');
      if (event.type === 'SESSION_JOIN_REJECTED' || event.type === 'SESSION_ERROR') {
        request.current = null;
        setNotice(event.type === 'SESSION_ERROR' ? sessionErrorMessage(event.payload.code) : 'El Controller rechazó el reingreso. Puedes solicitarlo otra vez o usar otro código.');
      }
    } else if (event.type === 'SESSION_CLOSED' && !state.lastNodeSession) {
      request.current = null; setNotice('La sesión finalizó. Ingresa a otra mediante su código.');
    }
    });
  }, [service, deviceId]);
  const last = snapshot.lastNodeSession;
  const isMember = last && !!snapshot.sessions[last.sessionId]?.members[deviceId] && snapshot.sessions[last.sessionId]?.members[deviceId]?.online !== false;
  const connected = snapshot.connection === 'Connected';
  const disabled = !connected || snapshot.joinInFlight || blocked;
  if ((!last || isMember) && !notice && !snapshot.historyError) return null;
  return <RejoinSessionView last={last} showLast={!!last && !isMember} disabled={!!disabled} connected={connected} blocked={blocked}
    pending={snapshot.joinInFlight} notice={notice} historyError={snapshot.historyError}
    onResume={() => {
      try { target.current = last!.sessionId; request.current = service.resumeSession(last!.sessionId); setNotice('Verificando participación persistida…'); }
      catch (error) { setNotice(sessionErrorMessage(error)); }
    }}
    onRejoin={() => {
      if (request.current || service.getSnapshot().joinInFlight) return;
      try { target.current = last!.sessionId; request.current = service.requestRejoin(); setNotice('Enviando solicitud de reingreso…'); }
      catch (error) { setNotice(sessionErrorMessage(error)); }
    }} />;
}
