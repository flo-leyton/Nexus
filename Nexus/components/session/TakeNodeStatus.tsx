import { View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import type { CoordinatedTake, TakeNode } from '@/services/sessionProtocol';
import { SessionBadge, SessionDetails, sessionStyles, type SessionTone } from './SessionUI';

export const takePhaseLabels = { pending: 'Esperando recepción', starting: 'Iniciando cámara', recording: 'Grabación activa',
  saving: 'Deteniendo / guardando', saved: 'Archivo guardado en el Node', error: 'Error de captura', disconnected: 'Sin conexión · resultado desconocido' };

export function TakeNodeStatus({ deviceId, node }: { deviceId: string; node: TakeNode }) {
  const { colors } = useTheme();
  const tone: SessionTone = node.phase === 'saved' ? 'success' : node.phase === 'recording' ? 'recording' :
    node.phase === 'error' ? 'error' : node.phase === 'disconnected' ? 'warning' : 'neutral';
  return <View style={{ gap: 10, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.outlineVariant }}>
    <View style={sessionStyles.between}>
      <Text variant="titleMedium">{node.role || 'Cámara'}</Text>
      <SessionBadge label={takePhaseLabels[node.phase]} tone={tone} />
    </View>
    <Text variant="bodyMedium">REC: {node.startReceived ? 'ACK recibido' : 'sin ACK'} · STOP: {node.stopReceived ? 'ACK recibido' : 'sin ACK'}</Text>
    {!!node.error && <Text variant="bodyMedium" style={{ color: colors.error }}>{node.phase === 'disconnected' ? 'Resultado desconocido' : 'Fallo parcial'}: {node.error === 'connectionLost' ? 'se interrumpió la conexión' : node.error}. Revisa este Node; no se da por guardado.</Text>}
    {node.capture && <Text variant="bodyMedium">Original informado · {(node.capture.bytes / 1024 / 1024).toFixed(1)} MB. Reproduce el vídeo en el Node propietario.</Text>}
    <SessionDetails title="Identificadores y referencia">
      <Text selectable variant="bodySmall">deviceId: {deviceId}</Text>
      <Text selectable variant="bodySmall">nodeId: {node.nodeId}</Text>
      {!!node.error && <Text selectable variant="bodySmall">Diagnóstico original: {node.error}</Text>}
      {node.capture && <Text selectable variant="bodySmall">Clip: {node.capture.id} · {node.capture.bytes} bytes{node.capture.localUri ? ` · ${node.capture.localUri}` : ''}</Text>}
    </SessionDetails>
  </View>;
}

export function TakeHistoryItem({ take, number }: { take: CoordinatedTake; number?: number }) {
  const { colors } = useTheme();
  return <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: colors.outlineVariant, paddingVertical: 8 }}>
    <Text variant="titleMedium">{number ? `Toma ${number}` : 'Toma'}</Text>
    <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
      {Object.keys(take.nodes).length} Nodes · {Object.values(take.nodes).filter((node) => node.phase === 'saved').length} archivos informados como guardados
    </Text>
    {take.closed && <SessionBadge label="Cierre con resultados no confirmados" tone="warning" />}
    <SessionDetails title="Ver resultados e identificadores">
      <Text selectable variant="bodySmall">takeId: {take.takeId}</Text>
      {Object.entries(take.nodes).map(([id, node]) => <TakeNodeStatus key={node.nodeId} deviceId={id} node={node} />)}
    </SessionDetails>
  </View>;
}
