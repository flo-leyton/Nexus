import { useIsFocused } from '@react-navigation/native';
import { Camera, CameraView } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { NodeCaptureView } from './session/NodeCaptureView';
import { sessionStyles } from './session/SessionUI';
import { CaptureEngine } from '@/services/captureEngine';
import { persistLocalCapture } from '@/services/localCaptures';
import { coordinateCapture } from '@/services/coordinatedCapture';
import type { getSessionService } from '@/services/session';
import { activeTakeForDevice, readinessReasons } from '@/services/sessionProtocol';
import type { CaptureIdentity } from '@/types/capture';

type Service = Awaited<ReturnType<typeof getSessionService>>;
export function NodeReadinessPanel({ service, sessionId, controllerId, nodeId, deviceId, accepted, sessionClosed = false, onBusyChange, onSaved }: CaptureIdentity & {
  service: Service; controllerId: string; accepted: boolean; sessionClosed?: boolean; onBusyChange(busy: boolean): void; onSaved(): void;
}) {
  const focused = useIsFocused();
  const [appState, setAppState] = useState(AppState.currentState);
  const view = useRef<CameraView>(null);
  const resetTimedCamera = useRef(false);
  const savedId = useRef<string | null>(null);
  const [controlError, setControlError] = useState('');
  const [engine] = useState(() => new CaptureEngine({
    getPermission: Camera.getCameraPermissionsAsync,
    requestPermission: Camera.requestCameraPermissionsAsync,
    // isAvailableAsync exists only on web in SDK 54. Native availability is
    // confirmed by onCameraReady/onMountError, never assumed from permission.
    isAvailable: () => Platform.OS === 'web' ? CameraView.isAvailableAsync() : Promise.resolve(null),
  }, {
    createId: Crypto.randomUUID,
    record: (durationSeconds) => {
      if (!view.current) throw new Error('La vista de cámara no está montada.');
      // Expo Camera SDK 54 retains the duration limit on the iOS output.
      resetTimedCamera.current = Platform.OS === 'ios' && durationSeconds !== undefined;
      return view.current.recordAsync(durationSeconds === undefined ? undefined : { maxDuration: durationSeconds });
    },
    stop: () => {
      if (!view.current) throw new Error('La vista de cámara no está disponible para detener.');
      view.current.stopRecording();
    },
    persist: persistLocalCapture,
  }));
  const [preparation, setPreparation] = useState(engine.getSnapshot());
  const [reportError, setReportError] = useState('');

  useEffect(() => {
    const coordinator = coordinateCapture(engine, { sessionId, nodeId, deviceId }, (report) => {
      service.reportCapture(sessionId, controllerId, report);
    });
    const unregister = service.registerCaptureHandler(sessionId, coordinator.handle);
    return () => { unregister(); coordinator.dispose(); };
  }, [engine, service, sessionId, nodeId, deviceId, controllerId]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', setAppState);
    return () => listener.remove();
  }, []);
  useEffect(() => {
    let mounted = true;
    const report = () => {
      const current = service.getSnapshot();
      if (current.connection !== 'Connected' || current.sessions[sessionId]?.state === 'closed' ||
          current.sessions[sessionId]?.members[deviceId]?.online === false || current.sessions[sessionId]?.members[deviceId]?.nodeId !== nodeId) return;
      try {
        service.reportNodeState(sessionId, controllerId, engine.getReadiness());
        if (mounted) setReportError('');
      } catch { if (mounted) setReportError('No se pudo informar el estado al Controller.'); }
    };
    const unsubscribe = engine.subscribe((state) => {
      if (resetTimedCamera.current && !engine.isBusy() && !state.pendingSave) {
        resetTimedCamera.current = false;
        engine.deactivate();
        return;
      }
      setPreparation(state);
      onBusyChange(engine.isBusy() || state.pendingSave);
      if (state.lastCapture && state.lastCapture.id !== savedId.current) {
        savedId.current = state.lastCapture.id;
        onSaved();
      }
      report();
    });
    const interval = setInterval(report, 5000);
    return () => {
      // Publish NOT READY before releasing this screen's camera.
      mounted = false;
      unsubscribe();
      engine.deactivate();
      report();
      clearInterval(interval);
    };
  }, [engine, service, sessionId, controllerId, deviceId, nodeId, onBusyChange, onSaved]);
  useEffect(() => {
    if (sessionClosed) { engine.deactivate(); return; }
    if (focused && appState === 'active') { if (!engine.isBusy() && !engine.getSnapshot().pendingSave) void engine.prepare(); }
    else engine.deactivate();
    return () => engine.deactivate();
  }, [engine, focused, appState, sessionClosed]);
  useEffect(() => {
    if (!sessionClosed && focused && appState === 'active' && !engine.isBusy() && !engine.getSnapshot().active && !preparation.pendingSave) void engine.prepare();
  }, [engine, focused, appState, sessionClosed, preparation.phase, preparation.pendingSave]);

  const { readiness, generation } = preparation;
  const busy = engine.isBusy();
  const canMount = busy || (focused && appState === 'active' && preparation.active &&
    readiness.cameraPermission === 'granted' && readiness.cameraAvailable !== false && !readiness.error);
  const reasons = readinessReasons(engine.getReadiness(), service.getSnapshot().connection === 'Connected');
  const self = service.getSnapshot().sessions[sessionId]?.members[deviceId];
  if (!accepted || self?.online === false) reasons.push('Reanuda tu participación autorizada');
  if (self?.requiresReadyConfirmation) reasons.push('Confirma preparación para una nueva grabación');
  const session = service.getSnapshot().sessions[sessionId];
  const activeTake = session && activeTakeForDevice(session, deviceId);
  const coordinatedTake = activeTake ?? session?.take;
  const takeNode = coordinatedTake?.nodes[deviceId]?.nodeId === nodeId ? coordinatedTake.nodes[deviceId] : undefined;
  const remotePending = !!activeTake;
  const canRecord = Platform.OS !== 'web' && accepted && !self?.requiresReadyConfirmation && focused && appState === 'active' && !remotePending && !busy && !preparation.pendingSave && readinessReasons(engine.getReadiness()).length === 0;
  const phaseLabels = { idle: 'Cámara inactiva', preparing: 'Preparando cámara', ready: 'Cámara lista', starting: 'Iniciando grabación', recording: 'Grabando', saving: 'Guardando archivo', saved: 'Archivo disponible', error: 'Error de captura' };
  const run = (action: () => void | Promise<void>) => {
    setControlError('');
    try { void Promise.resolve(action()).catch((error: unknown) => setControlError(error instanceof Error ? error.message : String(error))); }
    catch (error) { setControlError(error instanceof Error ? error.message : String(error)); }
  };
  return <NodeCaptureView preparation={preparation} phaseLabel={phaseLabels[preparation.phase]} reasons={reasons} busy={busy}
    accepted={accepted} requiresConfirmation={!!self?.requiresReadyConfirmation}
    confirmDisabled={!accepted || busy || readinessReasons(engine.getReadiness()).length > 0}
    canRecord={canRecord} prepareDisabled={sessionClosed || busy || !focused || appState !== 'active' || preparation.pendingSave}
    focused={focused} isWeb={Platform.OS === 'web'} reportError={reportError} controlError={controlError}
    takeId={takeNode ? coordinatedTake?.takeId : undefined}
    camera={canMount && <CameraView key={generation} ref={view} facing="back" mode="video" mute style={sessionStyles.preview}
      onCameraReady={() => { if (view.current) engine.cameraReady(generation); }}
      onMountError={(event) => engine.cameraFailed(generation, event.message)} />}
    onConfirmReady={() => run(() => { service.confirmNodeReady(sessionId, controllerId, engine.getReadiness()); })}
    onRecord={() => run(() => engine.start({ sessionId, deviceId, nodeId }))}
    onStop={() => run(() => engine.stop())} onRetrySave={() => run(() => engine.retrySave())}
    onPrepare={() => run(() => engine.prepare(readiness.cameraPermission !== 'granted' && preparation.canAskAgain))} />;
}
