import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Icon, Text, useTheme } from 'react-native-paper';
import type { CapturePreparation } from '@/services/captureEngine';
import { SessionActionDock, SessionBadge, SessionDetails, SessionNotice, sessionStyles } from './SessionUI';

export type NodeCaptureViewProps = {
  preparation: CapturePreparation; phaseLabel: string; reasons: string[]; busy: boolean; accepted: boolean;
  requiresConfirmation: boolean; confirmDisabled: boolean; canRecord: boolean; prepareDisabled: boolean;
  focused: boolean; isWeb: boolean; reportError: string; controlError: string; takeId?: string;
  camera: ReactNode; onConfirmReady(): void; onRecord(): void; onStop(): void; onRetrySave(): void; onPrepare(): void;
};

export function NodeCaptureView(props: NodeCaptureViewProps) {
  const { colors } = useTheme();
  const p = props.preparation;
  const r = p.readiness;
  const prepareControl = <Button mode="outlined" icon="camera-outline" disabled={props.prepareDisabled} onPress={props.onPrepare}
    style={sessionStyles.control} contentStyle={sessionStyles.touch}>{r.cameraPermission === 'granted' ? 'Volver a preparar cámara' : 'Comprobar / conceder permiso'}</Button>;
  return <View style={sessionStyles.stack}>
    <View style={sessionStyles.between}>
      <Text accessibilityRole="header" variant="headlineSmall">Cámara de este Node</Text>
      <SessionBadge label={props.phaseLabel} tone={p.phase === 'recording' ? 'recording' : p.phase === 'error' ? 'error' : p.phase === 'saved' ? 'success' : 'neutral'} />
    </View>
    <View key="capture-feedback" style={sessionStyles.stack}>
      {(p.pendingSave || p.captureError || props.controlError) && <SessionNotice title={p.pendingSave ? 'El clip aún no está guardado' : p.captureError || props.controlError} tone="error">
        {p.pendingSave && <><Text variant="bodyMedium">Conserva esta pantalla y reintenta el guardado.</Text>
          {!!(p.captureError || props.controlError) && <Text variant="bodyMedium">{p.captureError || props.controlError}</Text>}</>}
      </SessionNotice>}
      {!props.accepted && <SessionNotice title="Membresía no confirmada" tone="warning"><Text variant="bodyMedium">Una captura ya activa puede continuar. Puedes detener y guardar aquí; reanuda tu participación antes de iniciar otra.</Text></SessionNotice>}
      {r.cameraPermission !== 'granted' && prepareControl}
      {!p.canAskAgain && r.cameraPermission !== 'granted' && <Text variant="bodyMedium">Concede permiso de cámara en los ajustes del teléfono y vuelve a la Session.</Text>}
    </View>
    <View style={{ backgroundColor: colors.surfaceVariant, borderRadius: 12, overflow: 'hidden' }}>
      {props.camera || <View style={{ minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 }}>
        <Icon source="video-off-outline" size={28} color={colors.onSurfaceVariant} />
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>Cámara no disponible en este estado</Text>
      </View>}
    </View>
    <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Encuadre local · vídeo silenciado</Text>
    <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>PREPARACIÓN PARA NUEVA TOMA</Text>
    <SessionBadge label={props.reasons.length ? 'NO LISTO' : 'READY'} tone={props.reasons.length ? 'warning' : 'success'} />
    {!!props.reasons.length && <Text accessibilityLiveRegion="polite" variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>{props.reasons.join(' · ')}</Text>}
    {props.takeId && <Text variant="bodyMedium">Toma del Controller · …{props.takeId.slice(-6)}</Text>}
    {props.requiresConfirmation && <Button mode="contained" icon="check" disabled={props.confirmDisabled} onPress={props.onConfirmReady}
      style={sessionStyles.control} contentStyle={sessionStyles.touch}>Confirmar READY para nueva toma</Button>}
    {r.cameraPermission === 'granted' && prepareControl}
    {!!props.reportError && <SessionNotice title={props.reportError} tone="warning" />}
    {props.isWeb && <Text variant="bodyMedium">La captura persistente se prueba en Android o iOS.</Text>}
    <SessionDetails title="Preparación e identificador de toma">
      <Text variant="bodyMedium">Permiso: {r.cameraPermission} · Cámara: {r.cameraAvailable === null ? 'sin comprobar' : r.cameraAvailable ? 'disponible' : 'no disponible'} · Motor: {props.busy ? 'ocupado' : r.enginePrepared ? 'preparado' : 'sin preparar'}</Text>
      {props.takeId && <Text selectable variant="bodySmall">takeId: {props.takeId}</Text>}
    </SessionDetails>
    <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Al salir a segundo plano se intenta detener y guardar. No se graba en segundo plano.</Text>
    <SessionActionDock visible={props.focused} title={props.phaseLabel}>
      <Button mode="contained" icon="stop" disabled={p.phase !== 'recording'} onPress={props.onStop}
        buttonColor={colors.error} textColor={colors.onError} style={sessionStyles.control} contentStyle={sessionStyles.touch}>Detener y guardar</Button>
      {p.pendingSave && !props.busy ? <Button mode="contained-tonal" icon="refresh" onPress={props.onRetrySave}
        style={sessionStyles.control} contentStyle={sessionStyles.touch}>Reintentar guardado</Button> :
        <Button mode="outlined" icon="record-circle-outline" disabled={!props.canRecord} onPress={props.onRecord}
          style={sessionStyles.control} contentStyle={sessionStyles.touch}>Prueba local · sin audio</Button>}
    </SessionActionDock>
  </View>;
}
