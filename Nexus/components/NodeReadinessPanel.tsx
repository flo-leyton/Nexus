import { useIsFocused } from '@react-navigation/native';
import { Camera, CameraView } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CaptureEngine } from '@/services/captureEngine';
import type { getSessionService } from '@/services/session';
import { readinessReasons } from '@/services/sessionProtocol';

type Service = Awaited<ReturnType<typeof getSessionService>>;
export function NodeReadinessPanel({ service, sessionId, controllerId }: { service: Service; sessionId: string; controllerId: string }) {
  const focused = useIsFocused();
  const [appState, setAppState] = useState(AppState.currentState);
  const [engine] = useState(() => new CaptureEngine({
    getPermission: Camera.getCameraPermissionsAsync,
    requestPermission: Camera.requestCameraPermissionsAsync,
    // isAvailableAsync exists only on web in SDK 54. Native availability is
    // confirmed by onCameraReady/onMountError, never assumed from permission.
    isAvailable: () => Platform.OS === 'web' ? CameraView.isAvailableAsync() : Promise.resolve(null),
  }));
  const [preparation, setPreparation] = useState(engine.getSnapshot());
  const [reportError, setReportError] = useState('');
  const view = useRef<CameraView>(null);

  useEffect(() => {
    const listener = AppState.addEventListener('change', setAppState);
    return () => listener.remove();
  }, []);
  useEffect(() => {
    let mounted = true;
    const report = () => {
      if (service.getSnapshot().connection !== 'Connected') return;
      try {
        service.reportNodeState(sessionId, controllerId, engine.getSnapshot().readiness);
        if (mounted) setReportError('');
      } catch { if (mounted) setReportError('No se pudo informar el estado al Controller.'); }
    };
    const unsubscribe = engine.subscribe((state) => { setPreparation(state); report(); });
    const interval = setInterval(report, 5000);
    return () => {
      // Publish NOT READY before releasing this screen's camera.
      mounted = false;
      unsubscribe();
      engine.deactivate();
      report();
      clearInterval(interval);
    };
  }, [engine, service, sessionId, controllerId]);
  useEffect(() => {
    if (focused && appState === 'active') void engine.prepare();
    else engine.deactivate();
    return () => engine.deactivate();
  }, [engine, focused, appState]);

  const { readiness, generation } = preparation;
  const canMount = focused && appState === 'active' && preparation.active &&
    readiness.cameraPermission === 'granted' && readiness.cameraAvailable !== false && !readiness.error;
  const reasons = readinessReasons({ ...readiness, enginePrepared: canMount && readiness.enginePrepared }, service.getSnapshot().connection === 'Connected');
  return (
    <View style={styles.panel}>
      <ThemedText type="subtitle">Preparación de este Node</ThemedText>
      <ThemedText accessibilityLiveRegion="polite">{reasons.length === 0 ? 'READY' : `NO LISTO: ${reasons.join(' · ')}`}</ThemedText>
      <ThemedText>Permiso: {readiness.cameraPermission} · Cámara: {readiness.cameraAvailable === null ? 'sin comprobar' : readiness.cameraAvailable ? 'disponible' : 'no disponible'} · Motor: {readiness.enginePrepared ? 'preparado' : 'sin preparar'}</ThemedText>
      {canMount && <CameraView key={generation} ref={view} facing="back" mode="video" mute style={styles.preview}
        onCameraReady={() => { if (view.current) engine.cameraReady(generation); }}
        onMountError={(event) => engine.cameraFailed(generation, event.message)} />}
      <Pressable accessibilityRole="button" disabled={!preparation.active} onPress={() => { void engine.prepare(readiness.cameraPermission !== 'granted' && preparation.canAskAgain); }} style={styles.button}>
        <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">{readiness.cameraPermission === 'granted' ? 'VOLVER A PREPARAR CÁMARA' : 'COMPROBAR / CONCEDER PERMISO'}</ThemedText>
      </Pressable>
      {!preparation.canAskAgain && readiness.cameraPermission !== 'granted' && <ThemedText>Concede permiso de cámara en los ajustes del teléfono y vuelve a la Session.</ThemedText>}
      {!!reportError && <ThemedText>{reportError}</ThemedText>}
      <ThemedText>La cámara se prepara sin audio. No se inicia ninguna grabación.</ThemedText>
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 10 }, preview: { height: 180, borderRadius: 12 },
  button: { backgroundColor: '#474FE7', borderRadius: 12, padding: 14, alignItems: 'center' },
});
