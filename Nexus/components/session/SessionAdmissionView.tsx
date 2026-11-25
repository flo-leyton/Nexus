import { ScrollView, View } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import type { JoinRequest } from '@/services/sessionProtocol';
import { SessionBadge, SessionDetails, SessionSection, sessionStyles } from './SessionUI';

export function SessionAdmissionView({ requests, deciding, onDecision }: {
  requests: JoinRequest[]; deciding: Record<string, string>; onDecision(request: JoinRequest, accept: boolean): void;
}) {
  const { colors } = useTheme();
  return <SessionSection title="Solicitudes de ingreso">
    {!requests.length && <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>No hay solicitudes pendientes.</Text>}
    {requests.map((request) => <View key={request.deviceId} style={{ gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.outlineVariant }}>
      <View style={sessionStyles.between}><Text variant="titleMedium">{request.deviceName || `Dispositivo · …${request.deviceId.slice(-6)}`}</Text>
        <SessionBadge label={request.online === false ? 'Desconectado' : 'Pendiente'} tone="warning" />
      </View>
      {request.online === false && <Text variant="bodyMedium">Debe reconectar antes de aceptarlo. La solicitud se conserva.</Text>}
      <View style={sessionStyles.row}>
        <Button mode="contained" accessibilityLabel={`Aceptar ${request.deviceId}`} disabled={request.online === false || !!deciding[request.deviceId]}
          onPress={() => onDecision(request, true)} style={[sessionStyles.control, sessionStyles.flex]} contentStyle={sessionStyles.touch}>Aceptar</Button>
        <Button mode="outlined" accessibilityLabel={`Rechazar ${request.deviceId}`} disabled={!!deciding[request.deviceId]}
          onPress={() => onDecision(request, false)} style={[sessionStyles.control, sessionStyles.flex]} contentStyle={sessionStyles.touch}>Rechazar</Button>
      </View>
      {!!deciding[request.deviceId] && <Text variant="bodyMedium">Esperando confirmación de la decisión…</Text>}
      <SessionDetails title="Identificar solicitante"><Text selectable variant="bodySmall">deviceId: {request.deviceId}</Text></SessionDetails>
    </View>)}
  </SessionSection>;
}

export function SessionCloseView({ disabled, pending, confirming, onRequest, onConfirm, onCancel }: {
  disabled: boolean; pending: boolean; confirming: boolean; onRequest(): void; onConfirm(): void; onCancel(): void;
}) {
  const { colors } = useTheme();
  return <SessionSection title="Administrar sesión" description="Cerrar la Session impide nuevos ingresos y comandos; conserva historial y originales.">
    <Button mode="outlined" icon="close-circle-outline" textColor={colors.error} disabled={disabled} onPress={onRequest}
      style={sessionStyles.control} contentStyle={sessionStyles.touch}>Cerrar sesión</Button>
    {pending && <Text variant="bodyMedium">Finalizando sesión. El estado del guardado se muestra en la toma.</Text>}
    {confirming && <Portal><Dialog visible onDismiss={onCancel} style={{ maxWidth: 560, width: '90%', alignSelf: 'center' }}>
      <Dialog.Title>Confirmar cierre de Session</Dialog.Title>
      <Dialog.ScrollArea style={{ maxHeight: 320 }}><ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
        <Text variant="bodyMedium">Finalizarás la sesión para todos. Si hay una grabación coordinada en curso, se enviará STOP y se esperará el resultado de cada cámara. Se conservan el historial y los originales.</Text>
      </ScrollView></Dialog.ScrollArea>
      <Dialog.Actions style={{ flexWrap: 'wrap' }}>
        <Button onPress={onCancel} contentStyle={sessionStyles.touch}>Cancelar</Button>
        <Button disabled={pending} onPress={onConfirm} contentStyle={sessionStyles.touch}>Confirmar cierre</Button>
      </Dialog.Actions>
    </Dialog></Portal>}
  </SessionSection>;
}
