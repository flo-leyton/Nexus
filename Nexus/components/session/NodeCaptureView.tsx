import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Button, Icon, IconButton, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CapturePreparation } from '@/services/captureEngine';
import { SessionBadge, SessionDetails, SessionNotice, sessionStyles } from './SessionUI';
import { PreviewZoomSlider } from './PreviewZoomSlider';

export type NodeCaptureViewProps = {
  preparation: CapturePreparation; phaseLabel: string; reasons: string[]; busy: boolean; accepted: boolean;
  requiresConfirmation: boolean; confirmDisabled: boolean; canRecord: boolean; prepareDisabled: boolean;
  focused: boolean; isWeb: boolean; reportError: string; controlError: string; takeId?: string;
  zoom?: { percent: number; disabled: boolean; adjust(delta: number): void; set?(percent: number): void };
  fullPreview?: boolean; onPreviewChange?(expanded: boolean): void; onPreviewLayout?(event: LayoutChangeEvent): void;
  photoStatus?: string; onPhoto?(): void;
  camera: ReactNode; onConfirmReady(): void; onRecord(): void; onStop(): void; onRetrySave(): void; onPrepare(): void;
};

export function NodeCaptureView(props: NodeCaptureViewProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const p = props.preparation;
  const r = p.readiness;
  const zoom = props.zoom;
  const ready = !props.reasons.length;
  const captureStatus = p.phase === 'recording' ? 'REC' : p.phase === 'saving' ? 'Guardando' : props.phaseLabel;
  const needsSaveRetry = p.pendingSave && !props.busy;
  const captureError = p.captureError || props.controlError;
  const full = props.fullPreview;
  const prepareControl = <Button mode="outlined" icon="camera-outline" disabled={props.prepareDisabled} onPress={props.onPrepare}
    style={sessionStyles.control} contentStyle={sessionStyles.touch}>{r.cameraPermission === 'granted' ? 'Volver a preparar cámara' : 'Comprobar / conceder permiso'}</Button>;
  return <View style={full ? { flex: 1 } : { gap: 8 }}>
    {!full && <View style={sessionStyles.between}>
      <Text accessibilityRole="header" variant="titleMedium">Cámara del Node</Text>
      <View style={sessionStyles.row} accessibilityLiveRegion="polite">
        {p.phase !== 'ready' && <SessionBadge label={captureStatus} tone={p.phase === 'recording' ? 'recording' : p.phase === 'error' ? 'error' : p.phase === 'saved' ? 'success' : 'neutral'} />}
        {!props.busy && <SessionBadge label={ready ? 'READY' : 'NO LISTO'} tone={ready ? 'success' : 'warning'} />}
      </View>
    </View>}
    {!full && (needsSaveRetry || captureError || !props.accepted || props.reportError || r.cameraPermission !== 'granted') &&
      <View key="capture-feedback" style={sessionStyles.stack}>
        {(needsSaveRetry || captureError) && <SessionNotice title={needsSaveRetry ? 'El clip aún no está guardado' : captureError} tone="error">
          {needsSaveRetry && <><Text variant="bodyMedium">Conserva esta pantalla y reintenta el guardado.</Text>
            {!!captureError && <Text variant="bodyMedium">{captureError}</Text>}</>}
        </SessionNotice>}
        {!props.accepted && <SessionNotice title="Membresía no confirmada" tone="warning"><Text variant="bodyMedium">Una captura ya activa puede continuar. Puedes detener y guardar aquí; reanuda tu participación antes de iniciar otra.</Text></SessionNotice>}
        {!!props.reportError && <SessionNotice title={props.reportError} tone="warning" />}
        {r.cameraPermission !== 'granted' && prepareControl}
        {!p.canAskAgain && r.cameraPermission !== 'granted' && <Text variant="bodyMedium">Concede permiso de cámara en los ajustes del teléfono y vuelve a la Session.</Text>}
      </View>}
    <View key="preview" onLayout={props.onPreviewLayout} style={full
      ? { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', overflow: 'hidden' }
      : { backgroundColor: colors.surfaceVariant, borderRadius: 12, overflow: 'hidden' }}>
      {props.camera || <View style={{ minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 }}>
        <Icon source="video-off-outline" size={28} color={colors.onSurfaceVariant} />
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>Cámara no disponible en este estado</Text>
      </View>}
      {!full && !!props.camera && props.onPreviewChange && <Pressable
        style={StyleSheet.absoluteFillObject} accessibilityRole="button" accessibilityLabel="Abrir vista completa de la cámara"
        onPress={() => props.onPreviewChange?.(true)}>
        <View pointerEvents="none" style={{ position: 'absolute', right: 10, bottom: 10, padding: 8, borderRadius: 20, backgroundColor: '#000A' }}>
          <Icon source="fullscreen" size={24} color="#FFF" />
        </View>
      </Pressable>}
      {full && <>
        <View style={[sessionStyles.between, { position: 'absolute', top: insets.top + 8, left: insets.left + 12, right: insets.right + 12 }]}>
          <SessionBadge label={ready && p.phase === 'ready' ? 'READY' : captureStatus}
            tone={p.phase === 'recording' ? 'recording' : p.phase === 'error' ? 'error' : ready ? 'success' : 'neutral'} />
          <IconButton icon="fullscreen-exit" accessibilityLabel="Volver a vista normal" mode="contained"
            onPress={() => props.onPreviewChange?.(false)} />
        </View>
        {zoom?.set && <View style={{ position: 'absolute', left: insets.left + 16, right: insets.right + 16, bottom: insets.bottom + 12 }}>
          <PreviewZoomSlider percent={zoom.percent} disabled={zoom.disabled} onChange={zoom.set} />
        </View>}
      </>}
    </View>
    {!full && zoom && <View style={sessionStyles.between}>
      <Text variant="labelLarge" accessibilityLiveRegion="polite">Zoom · {zoom.percent} %</Text>
      <View style={sessionStyles.row}>
        <Button mode="outlined" accessibilityLabel="Reducir zoom" disabled={zoom.disabled || zoom.percent === 0}
          contentStyle={sessionStyles.touch} onPress={() => zoom.adjust(-5)}>−</Button>
        <Button mode="outlined" accessibilityLabel="Aumentar zoom" disabled={zoom.disabled || zoom.percent === 100}
          contentStyle={sessionStyles.touch} onPress={() => zoom.adjust(5)}>+</Button>
      </View>
    </View>}
    {!full && <View key="actions" style={sessionStyles.stack}>
      {p.phase === 'recording' ? <Button mode="contained" icon="stop" onPress={props.onStop}
        buttonColor={colors.error} textColor={colors.onError} style={sessionStyles.control} contentStyle={sessionStyles.touch}>Detener y guardar</Button> :
        needsSaveRetry ? <Button mode="contained-tonal" icon="refresh" onPress={props.onRetrySave}
          style={sessionStyles.control} contentStyle={sessionStyles.touch}>Reintentar guardado</Button> :
          <Button mode="outlined" icon="record-circle-outline" disabled={!props.canRecord} onPress={props.onRecord}
            style={sessionStyles.control} contentStyle={sessionStyles.touch}>Prueba local · sin audio</Button>}
      {props.requiresConfirmation && <Button mode="contained" icon="check" disabled={props.confirmDisabled} onPress={props.onConfirmReady}
        style={sessionStyles.control} contentStyle={sessionStyles.touch}>Confirmar READY para nueva toma</Button>}
      {props.onPhoto && <Button mode="outlined" icon="camera-outline" disabled={!props.canRecord || !!props.photoStatus}
        onPress={props.onPhoto} contentStyle={sessionStyles.touch}>Tomar foto</Button>}
    </View>}
    {!full && <SessionDetails title="Detalles de cámara y toma">
      {!!props.reasons.length && <Text variant="bodyMedium">{props.reasons.join(' · ')}</Text>}
      <Text variant="bodyMedium">Permiso: {r.cameraPermission} · Cámara: {r.cameraAvailable === null ? 'sin comprobar' : r.cameraAvailable ? 'disponible' : 'no disponible'} · Motor: {props.busy ? 'ocupado' : r.enginePrepared ? 'preparado' : 'sin preparar'}</Text>
      {props.takeId && <Text selectable variant="bodySmall">takeId: {props.takeId}</Text>}
      {r.cameraPermission === 'granted' && prepareControl}
      {props.isWeb && <Text variant="bodyMedium">La captura persistente se prueba en Android o iOS.</Text>}
      <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Al salir a segundo plano se intenta detener y guardar. No se graba en segundo plano.</Text>
    </SessionDetails>}
  </View>;
}
