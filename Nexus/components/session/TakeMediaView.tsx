import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import type { StoredTakeAngle } from '@/services/takeMedia';
import type { TakeMediaAngle } from '@/services/sessionProtocol';
import { SessionBadge, SessionDetails, SessionNotice, sessionStyles } from './SessionUI';

const uploadLabels = { local: 'Sólo local en Node', queued: 'Subida pendiente', uploading: 'Subiendo', uploaded: 'Subida confirmada', failed: 'Error de subida', uncertain: 'Subida sin confirmar' };
export function TakeMediaView({ groups, localOnly, error, onPlay, player }: {
  groups: Map<string, StoredTakeAngle[]>; localOnly: boolean; error: string; onPlay(angle: TakeMediaAngle): void; player: ReactNode;
}) {
  const { colors } = useTheme();
  return <View style={sessionStyles.stack}>
    <Text accessibilityRole="header" variant="titleMedium">Ángulos por toma</Text>
    <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>Referencias comunicadas por los Nodes. Una subida confirmada no sustituye ACK ni resultado de grabación.</Text>
    {localOnly && <Text variant="bodyMedium">Datos guardados en este teléfono. Abre la Session activa para consultar el relay.</Text>}
    {!!error && <SessionNotice title={error} tone="error" />}
    {!groups.size && <Text variant="bodyMedium">Aún no hay referencias de subida recibidas.</Text>}
    {[...groups].map(([key, items]) => <View key={key} style={{ gap: 12, borderTopWidth: 1, borderTopColor: colors.outlineVariant, paddingTop: 16 }}>
      <Text variant="titleMedium">Toma · …{items[0].angle.takeId.slice(-6)} · {items.length} ángulos</Text>
      {items.map(({ angle }) => <View key={`${angle.deviceId}:${angle.clipId}`} style={{ gap: 10, paddingVertical: 10 }}>
        <Text variant="titleSmall">{angle.role || 'Rol no registrado'} · Node …{angle.nodeId.slice(-6)}</Text>
        <SessionBadge label={uploadLabels[angle.upload.state]} tone={angle.upload.state === 'uploaded' ? 'success' : angle.upload.state === 'failed' ? 'error' : 'warning'} />
        <Text variant="bodyMedium">{(angle.bytes / 1024 / 1024).toFixed(1)} MB · original en el Node propietario</Text>
        {(angle.upload.state === 'failed' || angle.upload.state === 'uncertain') && <Text variant="bodyMedium" style={{ color: colors.error }}>{angle.upload.error}</Text>}
        {angle.upload.state === 'uploaded' ? <Button mode="outlined" icon="play-outline" onPress={() => onPlay(angle)} style={sessionStyles.control} contentStyle={sessionStyles.touch}>Reproducir ángulo remoto</Button> :
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Sin URL confirmada para reproducir aquí. La subida se gestiona en el Node propietario.</Text>}
        <SessionDetails title="Datos del ángulo">
          <Text selectable variant="bodySmall">Session: {items[0].sessionId} · takeId: {angle.takeId}</Text>
          <Text selectable variant="bodySmall">Node: {angle.nodeId} · deviceId: {angle.deviceId} · Clip: {angle.clipId}</Text>
          {angle.upload.state === 'uploaded' && <Text selectable variant="bodySmall">{angle.upload.url}</Text>}
        </SessionDetails>
      </View>)}
    </View>)}
    {player}
  </View>;
}
