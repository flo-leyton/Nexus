import { useEffect, useRef, useState } from 'react';
import { RejoinSessionView } from './session/RejoinSessionView';

import { sessionErrorMessage } from '@/hooks/use-studio-session';
import type { getSessionService } from '@/services/session';
import type { SessionSnapshot } from '@/services/sessionClient';

type Service = Awaited<ReturnType<typeof getSessionService>>;
export function RejoinSessionPanel({ service, snapshot, deviceId, blocked = false, pendingInParent = false, scope }: {
  service: Service; snapshot: SessionSnapshot; deviceId: string; blocked?: boolean; pendingInParent?: boolean;
  scope?: { sessionId: string; confirmed: boolean; canResume: boolean };
}) {
  const request = useRef<string | null>(null);
  const target = useRef<string | null>(null);
  const [notice, setNotice] = useState('');
  const scopedSessionId = scope?.sessionId;
  useEffect(() => {
    let connectedBefore = service.getSnapshot().connection === 'Connected';
    return service.subscribe((state) => {
    if (state.connection !== 'Connected') { connectedBefore = false; request.current = null; setNotice('Conecta al relay y vuelve a solicitar reingreso.'); return; }
    if (!connectedBefore) { connectedBefore = true; setNotice('Conexión recuperada. Reanuda tu membresía autorizada o solicita una nueva participación.'); }
    if (!request.current) return;
    const event = state.lastEvent;
    if (!event) return;
    if (event.type === 'SESSION_SNAPSHOT' && event.sessionId === target.current && event.payload.session.members[deviceId]?.kind === 'node' && event.payload.session.members[deviceId]?.online !== false) {
      request.current = null; setNotice(scopedSessionId ? 'Participación confirmada.' : 'Participación autorizada. Abre la Session, prepara la cámara y confirma READY si se solicita.');
    } else if (event.payload.requestId === request.current) {
      if (event.type === 'SESSION_JOIN_PENDING') setNotice('');
      if (event.type === 'SESSION_JOIN_REJECTED' || event.type === 'SESSION_ERROR') {
        request.current = null;
        setNotice(event.type === 'SESSION_ERROR' ? sessionErrorMessage(event.payload.code) : 'El Controller rechazó el reingreso. Puedes solicitarlo otra vez o usar otro código.');
      }
    } else if (event.type === 'SESSION_CLOSED' && !state.lastNodeSession) {
      request.current = null; setNotice('La sesión finalizó. Ingresa a otra mediante su código.');
    }
    });
  }, [service, deviceId, scopedSessionId]);
  const remembered = snapshot.lastNodeSession;
  const last = !scope || remembered?.sessionId === scope.sessionId ? remembered : null;
  const isMember = scope?.confirmed ?? (last && !!snapshot.sessions[last.sessionId]?.members[deviceId] && snapshot.sessions[last.sessionId]?.members[deviceId]?.online !== false);
  const connected = snapshot.connection === 'Connected';
  const disabled = !connected || snapshot.joinInFlight || blocked;
  const pending = !pendingInParent && Object.entries(snapshot.pending).some(([id, requests]) =>
    (!scope || scope.sessionId === id) && requests.some((item) => item.deviceId === deviceId));
  const showRecovery = !isMember && !(scope && pending) && (!!last || scope?.canResume === true);
  if (!showRecovery && !notice && !pending && !snapshot.historyError) return null;
  return <RejoinSessionView last={last} showRecovery={showRecovery} compact={!!scope} disabled={!!disabled} connected={connected} blocked={blocked}
    pending={pending} notice={notice} historyError={snapshot.historyError}
    onResume={() => {
      const id = scope?.sessionId ?? last?.sessionId;
      if (!id) return;
      try { target.current = id; request.current = service.resumeSession(id); setNotice('Verificando participación persistida…'); }
      catch (error) { setNotice(sessionErrorMessage(error)); }
    }}
    onRejoin={() => {
      const current = service.getSnapshot();
      if (!last || current.lastNodeSession?.sessionId !== last.sessionId || request.current || current.joinInFlight) return;
      try { target.current = last.sessionId; request.current = service.requestRejoin(); setNotice('Enviando solicitud de reingreso…'); }
      catch (error) { setNotice(sessionErrorMessage(error)); }
    }} />;
}
