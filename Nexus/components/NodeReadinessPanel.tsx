import { useIsFocused } from '@react-navigation/native';
import { Camera, CameraView } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CaptureEngine } from '@/services/captureEngine';
import { persistLocalCapture } from '@/services/localCaptures';
import { coordinateCapture } from '@/services/coordinatedCapture';
import type { getSessionService } from '@/services/session';
import { readinessReasons } from '@/services/sessionProtocol';
import type { CaptureIdentity } from '@/types/capture';

type Service = Awaited<ReturnType<typeof getSessionService>>;
export function NodeReadinessPanel({ service, sessionId, controllerId, nodeId, deviceId, accepted, onBusyChange, onSaved }: CaptureIdentity & {
  service: Service; controllerId: string; accepted: boolean; onBusyChange(busy: boolean): void; onSaved(): void;
}) {
  const focused = useIsFocused();
  const [appState, setAppState] = useState(AppState.currentState);
  const view = useRef<CameraView>(null);
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
    record: () => {
      if (!view.current) throw new Error('La vista de cámara no está montada.');
      return view.current.recordAsync();
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
      if (current.connection !== 'Connected' || current.sessions[sessionId]?.members[deviceId]?.nodeId !== nodeId) return;
      try {
        service.reportNodeState(sessionId, controllerId, engine.getReadiness());
        if (mounted) setReportError('');
      } catch { if (mounted) setReportError('No se pudo informar el estado al Controller.'); }
    };
    const unsubscribe = engine.subscribe((state) => {
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
    if (focused && appState === 'active') { if (!engine.isBusy() && !engine.getSnapshot().pendingSave) void engine.prepare(); }
    else engine.deactivate();
    return () => engine.deactivate();
  }, [engine, focused, appState]);
  useEffect(() => {
    if (focused && appState === 'active' && !engine.isBusy() && !engine.getSnapshot().active && !preparation.pendingSave) void engine.prepare();
  }, [engine, focused, appState, preparation.phase, preparation.pendingSave]);

  const { readiness, generation } = preparation;
  const busy = engine.isBusy();
  const canMount = busy || (focused && appState === 'active' && preparation.active &&
    readiness.cameraPermission === 'granted' && readiness.cameraAvailable !== false && !readiness.error);
  const reasons = readinessReasons(engine.getReadiness(), service.getSnapshot().connection === 'Connected');
  const coordinatedTake = service.getSnapshot().sessions[sessionId]?.take;
  const takeNode = coordinatedTake?.nodes[deviceId];
  const remotePending = takeNode && (takeNode.busy || !['saved', 'error'].includes(takeNode.phase));
  const canRecord = Platform.OS !== 'web' && accepted && focused && appState === 'active' && !remotePending && !busy && !preparation.pendingSave && readinessReasons(engine.getReadiness()).length === 0;
  const phaseLabels = { idle: 'Cámara inactiva', preparing: 'Preparando cámara', ready: 'Cámara lista', starting: 'Iniciando grabación', recording: 'Grabando', saving: 'Guardando archivo', saved: 'Archivo disponible', error: 'Error de captura' };
  const run = (action: () => void | Promise<void>) => {
    setControlError('');
    try { void Promise.resolve(action()).catch((error: unknown) => setControlError(error instanceof Error ? error.message : String(error))); }
    catch (error) { setControlError(error instanceof Error ? error.message : String(error)); }
  };
  return (
    <View style={styles.panel}>
      <ThemedText type="subtitle">Captura local de este Node</ThemedText>
      {takeNode && <ThemedText selectable>Toma del Controller: {coordinatedTake?.takeId}</ThemedText>}
      <ThemedText accessibilityLiveRegion="polite">Estado: {phaseLabels[preparation.phase]}</ThemedText>
      <ThemedText accessibilityLiveRegion="polite">{reasons.length === 0 ? 'READY' : `NO LISTO: ${reasons.join(' · ')}`}</ThemedText>
      <ThemedText>Permiso: {readiness.cameraPermission} · Cámara: {readiness.cameraAvailable === null ? 'sin comprobar' : readiness.cameraAvailable ? 'disponible' : 'no disponible'} · Motor: {busy ? 'ocupado' : readiness.enginePrepared ? 'preparado' : 'sin preparar'}</ThemedText>
      {canMount && <CameraView key={generation} ref={view} facing="back" mode="video" mute style={styles.preview}
        onCameraReady={() => { if (view.current) engine.cameraReady(generation); }}
        onMountError={(event) => engine.cameraFailed(generation, event.message)} />}
      <Pressable accessibilityRole="button" disabled={!canRecord} onPress={() => run(() => engine.start({ sessionId, deviceId, nodeId }))} style={[styles.button, !canRecord && styles.disabled]}>
        <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">GRABAR VÍDEO SIN AUDIO</ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={preparation.phase !== 'recording'} onPress={() => run(() => engine.stop())} style={[styles.stop, preparation.phase !== 'recording' && styles.disabled]}>
        <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">DETENER Y GUARDAR</ThemedText>
      </Pressable>
      {preparation.pendingSave && !busy && <Pressable accessibilityRole="button" onPress={() => run(() => engine.retrySave())} style={styles.button}>
        <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">REINTENTAR GUARDADO</ThemedText>
      </Pressable>}
      {!!(preparation.captureError || controlError) && <ThemedText accessibilityLiveRegion="polite">{preparation.captureError || controlError}</ThemedText>}
      {preparation.pendingSave && <ThemedText>El clip aún no está guardado. Conserva esta pantalla y reintenta el guardado.</ThemedText>}
      {Platform.OS === 'web' && <ThemedText>La captura persistente se prueba en Android o iOS.</ThemedText>}
      {!accepted && <ThemedText>La membresía no está confirmada. Puedes detener y guardar una grabación activa; vuelve a ingresar para iniciar otra.</ThemedText>}
      <Pressable accessibilityRole="button" disabled={busy || !focused || appState !== 'active' || preparation.pendingSave} onPress={() => run(() => engine.prepare(readiness.cameraPermission !== 'granted' && preparation.canAskAgain))} style={styles.button}>
        <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">{readiness.cameraPermission === 'granted' ? 'VOLVER A PREPARAR CÁMARA' : 'COMPROBAR / CONCEDER PERMISO'}</ThemedText>
      </Pressable>
      {!preparation.canAskAgain && readiness.cameraPermission !== 'granted' && <ThemedText>Concede permiso de cámara en los ajustes del teléfono y vuelve a la Session.</ThemedText>}
      {!!reportError && <ThemedText>{reportError}</ThemedText>}
      <ThemedText>Vídeo silenciado. Al salir a segundo plano se intenta detener y guardar; no se graba en segundo plano.</ThemedText>
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 10 }, preview: { height: 180, borderRadius: 12 },
  button: { backgroundColor: '#474FE7', borderRadius: 12, padding: 14, alignItems: 'center' },
  stop: { backgroundColor: '#B42318', borderRadius: 12, padding: 14, alignItems: 'center' },
  disabled: { opacity: 0.45 },
});
