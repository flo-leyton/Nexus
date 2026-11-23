import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Icon, Text, useTheme } from 'react-native-paper';
import type { CapturePreparation } from '@/services/captureEngine';
import { SessionBadge, SessionDetails, SessionNotice, sessionStyles } from './SessionUI';

export type NodeCaptureViewProps = {
  preparation: CapturePreparation; phaseLabel: string; reasons: string[]; busy: boolean; accepted: boolean;
  requiresConfirmation: boolean; confirmDisabled: boolean; canRecord: boolean; prepareDisabled: boolean;
  focused: boolean; isWeb: boolean; reportError: string; controlError: string; takeId?: string;
  zoom?: { percent: number; disabled: boolean; adjust(delta: number): void };
  camera: ReactNode; onConfirmReady(): void; onRecord(): void; onStop(): void; onRetrySave(): void; onPrepare(): void;
};

export function NodeCaptureView(props: NodeCaptureViewProps) {
  const { colors } = useTheme();
  const p = props.preparation;
  const r = p.readiness;
  const zoom = props.zoom;
  const ready = !props.reasons.length;
  const captureStatus = p.phase === 'recording' ? 'REC' : p.phase === 'saving' ? 'Guardando' : props.phaseLabel;
  const needsSaveRetry = p.pendingSave && !props.busy;
  const captureError = p.captureError || props.controlError;
  const prepareControl = <Button mode="outlined" icon="camera-outline" disabled={props.prepareDisabled} onPress={props.onPrepare}
    style={sessionStyles.control} contentStyle={sessionStyles.touch}>{r.cameraPermission === 'granted' ? 'Volver a preparar cámara' : 'Comprobar / conceder permiso'}</Button>;
  return <View style={{ gap: 8 }}>
    <View style={sessionStyles.between}>
      <Text accessibilityRole="header" variant="titleMedium">Cámara del Node</Text>
      <View style={sessionStyles.row} accessibilityLiveRegion="polite">
        {p.phase !== 'ready' && <SessionBadge label={captureStatus} tone={p.phase === 'recording' ? 'recording' : p.phase === 'error' ? 'error' : p.phase === 'saved' ? 'success' : 'neutral'} />}
        {!props.busy && <SessionBadge label={ready ? 'READY' : 'NO LISTO'} tone={ready ? 'success' : 'warning'} />}
      </View>
    </View>
    {(needsSaveRetry || captureError || !props.accepted || props.reportError || r.cameraPermission !== 'granted') &&
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
    <View key="preview" style={{ backgroundColor: colors.surfaceVariant, borderRadius: 12, overflow: 'hidden' }}>
      {props.camera || <View style={{ minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 }}>
        <Icon source="video-off-outline" size={28} color={colors.onSurfaceVariant} />
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>Cámara no disponible en este estado</Text>
      </View>}
    </View>
    {zoom && <View style={sessionStyles.between}>
      <Text variant="labelLarge" accessibilityLiveRegion="polite">Zoom · {zoom.percent} %</Text>
      <View style={sessionStyles.row}>
        <Button mode="outlined" accessibilityLabel="Reducir zoom" disabled={zoom.disabled || zoom.percent === 0}
          contentStyle={sessionStyles.touch} onPress={() => zoom.adjust(-5)}>−</Button>
        <Button mode="outlined" accessibilityLabel="Aumentar zoom" disabled={zoom.disabled || zoom.percent === 100}
          contentStyle={sessionStyles.touch} onPress={() => zoom.adjust(5)}>+</Button>
      </View>
    </View>}
    <View key="actions" style={sessionStyles.stack}>
      {p.phase === 'recording' ? <Button mode="contained" icon="stop" onPress={props.onStop}
        buttonColor={colors.error} textColor={colors.onError} style={sessionStyles.control} contentStyle={sessionStyles.touch}>Detener y guardar</Button> :
        needsSaveRetry ? <Button mode="contained-tonal" icon="refresh" onPress={props.onRetrySave}
          style={sessionStyles.control} contentStyle={sessionStyles.touch}>Reintentar guardado</Button> :
          <Button mode="outlined" icon="record-circle-outline" disabled={!props.canRecord} onPress={props.onRecord}
            style={sessionStyles.control} contentStyle={sessionStyles.touch}>Prueba local · sin audio</Button>}
      {props.requiresConfirmation && <Button mode="contained" icon="check" disabled={props.confirmDisabled} onPress={props.onConfirmReady}
        style={sessionStyles.control} contentStyle={sessionStyles.touch}>Confirmar READY para nueva toma</Button>}
    </View>
    <SessionDetails title="Detalles de cámara y toma">
      {!!props.reasons.length && <Text variant="bodyMedium">{props.reasons.join(' · ')}</Text>}
      <Text variant="bodyMedium">Permiso: {r.cameraPermission} · Cámara: {r.cameraAvailable === null ? 'sin comprobar' : r.cameraAvailable ? 'disponible' : 'no disponible'} · Motor: {props.busy ? 'ocupado' : r.enginePrepared ? 'preparado' : 'sin preparar'}</Text>
      {props.takeId && <Text selectable variant="bodySmall">takeId: {props.takeId}</Text>}
      {r.cameraPermission === 'granted' && prepareControl}
      {props.isWeb && <Text variant="bodyMedium">La captura persistente se prueba en Android o iOS.</Text>}
      <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Al salir a segundo plano se intenta detener y guardar. No se graba en segundo plano.</Text>
    </SessionDetails>
  </View>;
}
