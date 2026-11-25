import { View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import type { StoredTakeAngle } from '@/services/takeMedia';
import type { Session, TakeMediaAngle } from '@/services/sessionProtocol';
import { takeNumbers } from '../mediaPresentation';
import { formatBytes } from '../MediaAssetCard';
import { SessionBadge, SessionDetails, SessionNotice, sessionStyles } from './SessionUI';

const uploadLabels = { local: 'Solo local en Node', queued: 'Subida pendiente', uploading: 'Subiendo', uploaded: 'Subido a Cloudinary', failed: 'Error de subida', uncertain: 'Subida sin confirmar' };
export function TakeMediaView({ groups, session, error, onPlay }: {
  groups: Map<string, StoredTakeAngle[]>; session?: Session; error: string; onPlay(angle: TakeMediaAngle): void;
}) {
  const { colors } = useTheme();
  const numbers = takeNumbers(groups.keys(), session, session ? `${session.sessionId}:` : '');
  return <View style={sessionStyles.stack}>
    <Text accessibilityRole="header" variant="titleMedium">Ángulos por toma</Text>
    {!!error && <SessionNotice title={error} tone="error" />}
    {!groups.size && <Text variant="bodyMedium">Aún no hay referencias de subida recibidas.</Text>}
    {[...groups].map(([key, items]) => <View key={key} style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.outlineVariant, paddingTop: 8 }}>
      <Text variant="titleMedium">Toma {numbers.get(key)}</Text>
      {items.map(({ angle }) => <View key={`${angle.deviceId}:${angle.clipId}`} style={{ gap: 4, paddingVertical: 6 }}>
        <Text variant="titleSmall">{angle.role || session?.members[angle.deviceId]?.deviceName || 'Cámara'} · {formatBytes(angle.bytes)}</Text>
        <SessionBadge label={uploadLabels[angle.upload.state]} tone={angle.upload.state === 'uploaded' ? 'success' : angle.upload.state === 'failed' ? 'error' : 'warning'} />
        {(angle.upload.state === 'failed' || angle.upload.state === 'uncertain') && <Text variant="bodyMedium" style={{ color: colors.error }}>{angle.upload.error}</Text>}
        {angle.upload.state === 'uploaded' && <Button mode="outlined" icon="play-outline" onPress={() => onPlay(angle)} style={sessionStyles.control} contentStyle={sessionStyles.touch}>Reproducir</Button>}
        <SessionDetails title="Datos del ángulo">
          <Text selectable variant="bodySmall">Session: {items[0].sessionId} · takeId: {angle.takeId}</Text>
          <Text selectable variant="bodySmall">Node: {angle.nodeId} · deviceId: {angle.deviceId} · Clip: {angle.clipId}</Text>
          {angle.upload.state === 'uploaded' && <Text selectable variant="bodySmall">{angle.upload.url}</Text>}
        </SessionDetails>
      </View>)}
    </View>)}
  </View>;
}
