import { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { ControllerTakeView } from './session/ControllerTakeView';

import type { getSessionService } from '@/services/session';
import { readinessReasons, takeFinished, type Session } from '@/services/sessionProtocol';

type Service = Awaited<ReturnType<typeof getSessionService>>;
export function ControllerTakePanel({ service, session, closingSession = false }: { service: Service; session: Session; closingSession?: boolean }) {
  const focused = useIsFocused();
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const request = useRef<string | null>(null);
  const requestedAt = useRef(0);
  useEffect(() => {
    const unsubscribe = service.subscribe((state) => {
      if (!request.current) return;
      if (state.connection !== 'Connected') { request.current = null; setPending(false); setNotice('Sin relay; usa STOP local en cada Node.'); return; }
      const event = state.lastEvent;
      if (event?.sessionId !== session.sessionId || event.payload.requestId !== request.current) return;
      request.current = null;
      setPending(false);
      setNotice(event.type === 'SESSION_ERROR' ? `Comando rechazado: ${event.payload.code}` : 'Comando registrado; comprueba ACK y resultado de cada Node.');
    });
    const timer = setInterval(() => {
      if (request.current && Date.now() - requestedAt.current >= 15000) { request.current = null; setPending(false); setNotice('Sin respuesta reciente. Actualiza la Session antes de volver a REC; STOP local sigue disponible.'); }
    }, 1000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [service, session.sessionId]);
  const nodes = Object.values(session.members).filter((m) => m.kind === 'node' && m.online !== false);
  const take = session.take;
  const finished = takeFinished(take);
  const canStart = !closingSession && session.state !== 'closed' && !pending && finished && nodes.length > 0 && nodes.every((n) => !readinessReasons(n.readiness).length);
  const canStop = !closingSession && !pending && !!take && !take.closed && !take.interrupted && Object.values(take.nodes).some((n) => n.phase !== 'saved');
  const canClose = !pending && !!take && !finished && (!!take.stopMessageId || !!take.interrupted);
  const close = () => {
    if (!take || request.current) return;
    try {
      request.current = service.closeInterruptedTake(session.sessionId, take.takeId);
      requestedAt.current = Date.now(); setPending(true); setConfirmClose(null);
      setNotice('Verificando participantes en el relay…');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo cerrar.'); }
  };
  const run = (start: boolean) => {
    if (request.current) return;
    try {
      const sent = start ? service.startTake(session.sessionId).messageId : service.stopTake(session.sessionId);
      request.current = sent; requestedAt.current = Date.now(); setPending(true); setNotice('Esperando respuesta del relay…');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo enviar.'); }
  };
  return <ControllerTakeView session={session} nodeCount={nodes.length} canStart={canStart} canStop={canStop} canClose={canClose}
    notice={notice} pending={pending} focused={focused} confirmingClose={confirmClose === take?.takeId}
    onStart={() => run(true)} onStop={() => run(false)} onRequestClose={() => setConfirmClose(take!.takeId)}
    onClose={close} onCancelClose={() => setConfirmClose(null)} />;
}
