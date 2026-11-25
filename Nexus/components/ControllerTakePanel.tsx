import { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { ControllerTakeView } from './session/ControllerTakeView';
import { ScheduledRecordingPanel } from './session/ScheduledRecordingPanel';
import { RemoteTorchControl } from './session/RemoteTorchControl';
import { RemotePhotoControl } from './session/RemotePhotoControl';
import { RemoteZoomControl } from './session/RemoteZoomControl';
import { NodePreview } from './session/ExperimentalPreview';

import type { getSessionService } from '@/services/session';
import type { previewTargets as selectPreviewTargets } from '@/services/previewTransport';
import { activeTakeForDevice, activeTakes, readinessReasons, type Session } from '@/services/sessionProtocol';

type Service = Awaited<ReturnType<typeof getSessionService>>;
export function ControllerTakePanel({ service, session, closingSession = false, previewTargets, previewEnabled }: {
  service: Service; session: Session; closingSession?: boolean;
  previewTargets: ReturnType<typeof selectPreviewTargets>; previewEnabled: boolean;
}) {
  const focused = useIsFocused();
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const requests = useRef(new Set<string>());
  const recordingRequestTarget = useRef<string | null | undefined>(undefined);
  const requestedAt = useRef(0);
  useEffect(() => {
    const unsubscribe = service.subscribe((state) => {
      if (!requests.current.size) return;
      if (state.connection !== 'Connected') { requests.current.clear(); setPending(false); setNotice('Sin relay; usa STOP local en cada Node.'); return; }
      const event = state.lastEvent;
      if (event?.sessionId !== session.sessionId || !requests.current.delete(event.payload.requestId)) return;
      setPending(!!requests.current.size);
      if (event.type === 'SESSION_ERROR') setNotice(`Comando rechazado: ${event.payload.code}`);
      else setNotice((current) => current.startsWith('Comando rechazado:') ? current : 'Comando registrado. Comprueba el resultado de cada cámara.');
    });
    const timer = setInterval(() => {
      if (requests.current.size && Date.now() - requestedAt.current >= 15000) { requests.current.clear(); setPending(false); setNotice('Sin respuesta reciente. Actualiza la sesión. STOP local sigue disponible.'); }
    }, 1000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [service, session.sessionId]);
  const captures = activeTakes(session);
  const enabled = !closingSession && session.state !== 'closed' && !pending;
  const cameras = Object.values(session.members).filter((member) => member.kind === 'node').map((member) => {
    const take = activeTakeForDevice(session, member.deviceId);
    const result = take?.nodes[member.deviceId];
    const online = member.online !== false;
    const recording = online && !take?.interrupted && !result?.connectionLost && result?.phase === 'recording';
    const awaiting = pending && (recordingRequestTarget.current === null || recordingRequestTarget.current === member.deviceId);
    const status = !online ? 'DESCONECTADA' : awaiting ? 'ORDEN PENDIENTE' : result?.connectionLost ? 'ESTADO SIN CONFIRMAR'
      : result?.phase === 'recording' ? 'GRABANDO' : result?.phase === 'saving' ? 'GUARDANDO'
        : result?.phase === 'error' ? 'REVISAR CÁMARA' : result ? 'INICIANDO' : 'DETENIDA';
    const role = member.role.toUpperCase();
    const label = role === 'MAIN' || role === 'SIDE' ? role
      : member.role === 'unassigned' ? `Cámara · …${member.deviceId.slice(-6)}` : member.role;
    return { deviceId: member.deviceId, nodeId: member.nodeId, online, label,
      status, recording, ready: online && !take && !member.requiresReadyConfirmation && !readinessReasons(member.readiness).length };
  });
  const readyIds = cameras.filter((camera) => camera.ready).map((camera) => camera.deviceId);
  const canStart = enabled && !captures.length && !!readyIds.length;
  const canStop = enabled && captures.some((take) => !take.interrupted);
  const closableTakes = captures.filter((take) => take.interrupted || (take.stopMessageId &&
    Object.values(take.nodes).some((node) => node.connectionLost)));
  const takeToClose = closableTakes.find((take) => take.takeId === confirmClose);
  const submit = (send: () => string[], target?: string | null) => {
    if (requests.current.size) return;
    try {
      requests.current = new Set(send());
      recordingRequestTarget.current = target;
      requestedAt.current = Date.now(); setPending(!!requests.current.size);
      setNotice(requests.current.size ? 'Esperando respuesta del relay…' : '');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo enviar.'); }
  };
  const close = () => {
    if (!takeToClose) return;
    submit(() => [service.closeInterruptedTake(session.sessionId, takeToClose.takeId)]);
    setConfirmClose(null);
  };
  return <ControllerTakeView session={session} nodeCount={readyIds.length} canStart={canStart} canStop={canStop}
    scheduling={<ScheduledRecordingPanel service={service} session={session} cameras={cameras} disabled={!enabled} />}
    cameras={cameras.map((camera) => ({ ...camera, canStart: enabled && camera.ready, canStop: enabled && camera.recording,
      preview: previewEnabled && camera.nodeId && <NodePreview
        pair={previewTargets.find(({ pair }) => pair.nodeId === camera.nodeId)?.pair} label={camera.label} />,
      zoomControl: camera.nodeId && <RemoteZoomControl key={`${session.sessionId}:${camera.nodeId}`} service={service}
        sessionId={session.sessionId} nodeId={camera.nodeId} deviceId={camera.deviceId} label={camera.label}
        disabled={!focused || closingSession} />,
      photoControl: camera.nodeId && <RemotePhotoControl key={`photo:${camera.nodeId}`} service={service} sessionId={session.sessionId}
        nodeId={camera.nodeId} disabled={!enabled || !camera.ready} label={camera.label} />,
      torchControl: camera.nodeId && <RemoteTorchControl key={`torch:${camera.nodeId}`} service={service} sessionId={session.sessionId}
        nodeId={camera.nodeId} online={camera.online} disabled={closingSession} label={camera.label} />,
    }))}
    closableTakeIds={pending ? [] : closableTakes.map((take) => take.takeId)}
    notice={notice} pending={pending} focused={focused} confirmingClose={!!takeToClose}
    onStart={() => submit(() => [service.startTake(session.sessionId, readyIds).messageId], null)}
    onStop={() => submit(() => service.stopActiveTakes(session.sessionId), null)}
    onStartCamera={(id) => submit(() => [service.startTake(session.sessionId, [id]).messageId], id)}
    onStopCamera={(id) => submit(() => service.stopActiveTakes(session.sessionId, id), id)}
    onRequestClose={setConfirmClose}
    onClose={close} onCancelClose={() => setConfirmClose(null)} />;
}
