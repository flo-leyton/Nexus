import { useIsFocused } from '@react-navigation/native';
import { Camera, CameraView } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, useWindowDimensions } from 'react-native';

import { NodeCaptureView } from './session/NodeCaptureView';
import { CaptureEngine } from '@/services/captureEngine';
import { persistLocalCapture, persistLocalPhoto } from '@/services/localCaptures';
import { capturePhoto } from '@/services/photoCapture';
import { coordinateCapture } from '@/services/coordinatedCapture';
import type { getSessionService } from '@/services/session';
import { activeTakeForDevice, readinessReasons } from '@/services/sessionProtocol';
import type { CaptureIdentity } from '@/types/capture';

type Service = Awaited<ReturnType<typeof getSessionService>>;
export function NodeReadinessPanel({ service, sessionId, controllerId, nodeId, deviceId, accepted, sessionClosed = false,
  onBusyChange, onSaved, fullPreview, onPreviewChange }: CaptureIdentity & {
  service: Service; controllerId: string; accepted: boolean; sessionClosed?: boolean; onBusyChange(busy: boolean): void; onSaved(): void;
  fullPreview: boolean; onPreviewChange(expanded: boolean): void;
}) {
  const focused = useIsFocused();
  const window = useWindowDimensions();
  const [previewBounds, setPreviewBounds] = useState<{ width: number; height: number } | null>(null);
  const [appState, setAppState] = useState(AppState.currentState);
  const view = useRef<CameraView>(null);
  const resetTimedCamera = useRef(false);
  const savedId = useRef<string | null>(null);
  const [controlError, setControlError] = useState('');
  const [torchGeneration, setTorchGeneration] = useState<number | null>(null);
  const [zoom, setZoom] = useState(0);
  const [photoStatus, setPhotoStatus] = useState('');
  const [photoView, setPhotoView] = useState<{ mode: 'video' | 'picture'; version: number }>({ mode: 'video', version: 0 });
  const photoVersion = useRef(0);
  const photoBusy = useRef(false);
  const photoMounted = useRef(true);
  const transition = useRef<{ version: number; finish(error?: string): void } | null>(null);
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
    const unregister = service.registerCaptureHandler(sessionId, (command) => {
      if (command.type === 'START_RECORDING' && photoBusy.current) throw new Error('La cámara está ocupada tomando o guardando una foto.');
      coordinator.handle(command);
    });
    return () => { unregister(); coordinator.dispose(); };
  }, [engine, service, sessionId, nodeId, deviceId, controllerId]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', setAppState);
    return () => listener.remove();
  }, []);
  useEffect(() => {
    const off = service.registerTorchHandler(sessionId, (enabled) => {
      const current = engine.getSnapshot();
      if (Platform.OS === 'web' || !focused || appState !== 'active' || !accepted || sessionClosed ||
          !view.current || !current.active || !current.readiness.enginePrepared) return false;
      setTorchGeneration(enabled ? current.generation : null);
      return true;
    });
    return off;
  }, [accepted, appState, engine, focused, service, sessionClosed, sessionId]);
  useEffect(() => service.subscribe((snapshot) => {
    const current = snapshot.sessions[sessionId];
    if (snapshot.connection !== 'Connected' || current?.members[deviceId]?.online !== true ||
        current.members[controllerId]?.online === false) setTorchGeneration(null);
  }), [controllerId, deviceId, service, sessionId]);
  useEffect(() => {
    if (!accepted || !focused || appState !== 'active' || sessionClosed) setTorchGeneration(null);
  }, [accepted, appState, focused, sessionClosed]);
  useEffect(() => {
    let mounted = true;
    const report = () => {
      const current = service.getSnapshot();
      if (current.connection !== 'Connected' || current.sessions[sessionId]?.state === 'closed' ||
          current.sessions[sessionId]?.members[deviceId]?.online === false || current.sessions[sessionId]?.members[deviceId]?.nodeId !== nodeId) return;
      try {
        service.reportNodeState(sessionId, controllerId, photoBusy.current
          ? { ...engine.getReadiness(), enginePrepared: false, error: 'Fotografía en curso' } : engine.getReadiness());
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
      onBusyChange(photoBusy.current || engine.isBusy() || state.pendingSave);
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
    if (sessionClosed) { if (!photoBusy.current) engine.deactivate(); return; }
    if (focused && appState === 'active') { if (!photoBusy.current && !engine.isBusy() && !engine.getSnapshot().pendingSave) void engine.prepare(); }
    else engine.deactivate();
    return () => { if (!photoBusy.current) engine.deactivate(); };
  }, [engine, focused, appState, sessionClosed]);
  useEffect(() => {
    if (!sessionClosed && focused && appState === 'active' && !photoBusy.current && !engine.isBusy() && !engine.getSnapshot().active && !preparation.pendingSave) void engine.prepare();
  }, [engine, focused, appState, sessionClosed, preparation.phase, preparation.pendingSave, photoStatus]);

  const takePhoto = useCallback((photoId: string) => {
    const snapshot = service.getSnapshot();
    const current = snapshot.sessions[sessionId];
    const member = current?.members[deviceId];
    if (photoBusy.current || engine.isBusy() || engine.getSnapshot().pendingSave) throw new Error('La cámara está ocupada.');
    if (Platform.OS === 'web' || !focused || AppState.currentState !== 'active' || !accepted || sessionClosed ||
        snapshot.connection !== 'Connected' || !current || current.state === 'closed' || member?.nodeId !== nodeId ||
        member.online === false || member.requiresReadyConfirmation || activeTakeForDevice(current, deviceId) ||
        !view.current || readinessReasons(engine.getReadiness()).length) throw new Error('La cámara debe estar READY para tomar una foto.');
    photoBusy.current = true;
    onBusyChange(true);
    setControlError('');
    setPhotoStatus('Preparando foto…');
    const reportReadiness = () => {
      try {
        if (service.getSnapshot().sessions[sessionId]?.members[deviceId]?.nodeId !== nodeId) return;
        const readiness = engine.getReadiness();
        service.reportNodeState(sessionId, controllerId, photoBusy.current
          ? { ...readiness, enginePrepared: false, error: 'Fotografía en curso' } : readiness);
      } catch { /* The local operation remains protected while offline. */ }
    };
    const switchMode = (mode: 'picture' | 'video') => new Promise<void>((resolve, reject) => {
      if (!photoMounted.current) { reject(new Error('La vista de cámara se cerró.')); return; }
      const version = ++photoVersion.current;
      const finish = (error?: string) => {
        clearTimeout(timer);
        transition.current = null;
        if (error) reject(new Error(error)); else resolve();
      };
      const timer = setTimeout(() => finish('La cámara no confirmó el cambio de modo.'), 6000);
      transition.current = { version, finish };
      setPhotoView({ mode, version });
    });
    reportReadiness();
    return capturePhoto({
      preparePicture: () => switchMode('picture'),
      async takePicture() {
        if (AppState.currentState !== 'active') throw new Error('Vuelve a la cámara para tomar una foto.');
        setPhotoStatus('Tomando foto…');
        const picture = await view.current?.takePictureAsync();
        if (!picture?.uri) throw new Error('La cámara no devolvió una foto.');
        return picture.uri;
      },
      async save(uri) {
        setPhotoStatus('Guardando foto…');
        const saved = await persistLocalPhoto({ id: photoId, sessionId, nodeId, deviceId,
          takeId: null, audio: false, createdAt: new Date().toISOString() }, uri);
        onSaved();
        return saved.id;
      },
      async restoreVideo() {
        setPhotoStatus('Preparando vídeo…');
        try { await switchMode('video'); }
        catch (error) {
          engine.cameraFailed(engine.getSnapshot().generation, 'No se pudo volver al modo vídeo. Vuelve a preparar la cámara.');
          throw error;
        }
      },
    }).catch((error: unknown) => {
      setControlError(error instanceof Error ? error.message : 'No se pudo tomar la foto.');
      throw error;
    }).finally(() => {
      photoBusy.current = false;
      if (!photoMounted.current) return;
      onBusyChange(false);
      setPhotoStatus('');
      reportReadiness();
    });
  }, [accepted, controllerId, deviceId, engine, focused, nodeId, onBusyChange, onSaved, service, sessionClosed, sessionId]);
  useEffect(() => service.registerPhotoHandler(sessionId, takePhoto), [service, sessionId, takePhoto]);
  useEffect(() => {
    photoMounted.current = true;
    return () => {
      photoMounted.current = false;
      transition.current?.finish('La vista de cámara se cerró.');
    };
  }, []);

  const { readiness, generation } = preparation;
  const bounds = previewBounds ?? window;
  const previewWidth = Math.min(bounds.width, bounds.height * 9 / 16);
  const busy = engine.isBusy() || !!photoStatus;
  const canMount = engine.isBusy() || (focused && appState === 'active' && preparation.active &&
    readiness.cameraPermission === 'granted' && readiness.cameraAvailable !== false && !readiness.error);
  const reasons = readinessReasons(engine.getReadiness(), service.getSnapshot().connection === 'Connected');
  if (photoStatus) reasons.push(photoStatus);
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
  return <NodeCaptureView preparation={preparation} phaseLabel={photoStatus || phaseLabels[preparation.phase]} reasons={reasons} busy={busy}
    photoStatus={photoStatus} onPhoto={() => run(async () => { await takePhoto(Crypto.randomUUID()); })}
    fullPreview={fullPreview} onPreviewChange={onPreviewChange}
    onPreviewLayout={({ nativeEvent: { layout: { width, height } } }) => {
      if (fullPreview && width > 0 && height > 0) setPreviewBounds({ width, height });
    }}
    accepted={accepted} requiresConfirmation={!!self?.requiresReadyConfirmation}
    confirmDisabled={!accepted || busy || readinessReasons(engine.getReadiness()).length > 0}
    canRecord={canRecord} prepareDisabled={sessionClosed || busy || !focused || appState !== 'active' || preparation.pendingSave}
    focused={focused} isWeb={Platform.OS === 'web'} reportError={reportError} controlError={controlError}
    takeId={takeNode ? coordinatedTake?.takeId : undefined}
    zoom={canMount && Platform.OS !== 'web' ? {
      percent: zoom, disabled: !focused || appState !== 'active' || !readiness.enginePrepared || preparation.phase === 'saving',
      adjust: (delta) => setZoom((previous) => Math.min(100, Math.max(0, previous + delta))),
      set: setZoom,
    } : undefined}
    camera={canMount && <CameraView key={`${generation}:${photoView.version}`} ref={view} facing="back" mode={photoView.mode} mute
      ratio={Platform.OS === 'android' ? '16:9' : undefined}
      style={{ width: fullPreview ? previewWidth : '100%', aspectRatio: fullPreview ? 9 / 16 : 4 / 3 }}
      zoom={zoom / 100}
      enableTorch={accepted && torchGeneration === generation}
      onCameraReady={() => {
        if (!view.current || generation !== engine.getSnapshot().generation || photoView.version !== photoVersion.current) return;
        if (transition.current?.version === photoView.version) {
          if (photoView.mode === 'video') engine.cameraReady(generation);
          transition.current.finish();
        }
        else if (!photoBusy.current && photoView.mode === 'video') engine.cameraReady(generation);
      }}
      onMountError={(event) => {
        if (generation !== engine.getSnapshot().generation || photoView.version !== photoVersion.current) return;
        if (transition.current?.version === photoView.version) transition.current.finish(event.message);
        else engine.cameraFailed(generation, event.message);
      }} />}
    onConfirmReady={() => run(() => { service.confirmNodeReady(sessionId, controllerId, engine.getReadiness()); })}
    onRecord={() => run(() => {
      if (photoBusy.current) throw new Error('La cámara está ocupada tomando o guardando una foto.');
      return engine.start({ sessionId, deviceId, nodeId });
    })}
    onStop={() => run(() => engine.stop())} onRetrySave={() => run(() => engine.retrySave())}
    onPrepare={() => run(() => engine.prepare(readiness.cameraPermission !== 'granted' && preparation.canAskAgain))} />;
}
