import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import type { LocalCapture } from '@/types/capture';
import type { Session } from '@/services/sessionProtocol';
import { mediaDate, takeNumbers } from '../mediaPresentation';
import { formatBytes } from '../MediaAssetCard';
import { SessionDetails, SessionNotice, sessionStyles } from './SessionUI';

export function LocalCapturesView({ captures, problems, busy, onPlay, renderUpload, session }: {
  captures: LocalCapture[]; problems: string[]; busy: boolean; onPlay(capture: LocalCapture): void;
  renderUpload(capture: LocalCapture): ReactNode; session?: Session;
}) {
  const { colors } = useTheme();
  const numbers = takeNumbers([...captures].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .flatMap(({ takeId }) => takeId ? [takeId] : []), session);
  return <View style={sessionStyles.stack}>
    <Text accessibilityRole="header" variant="titleMedium">Originales de este teléfono</Text>
    {!captures.length && <Text variant="bodyMedium">No hay capturas locales verificadas en esta sesión.</Text>}
    {problems.map((problem, i) => <SessionNotice key={i} title={problem} tone="error" />)}
    {captures.map((capture) => <View key={capture.id} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.outlineVariant }}>
      <Text variant="titleMedium">{capture.photoId ? 'Foto' : capture.takeId ? `Toma ${numbers.get(capture.takeId)}` : 'Grabación local'}</Text>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
        {[mediaDate(capture.createdAt), session?.members[capture.deviceId]?.role || 'Este teléfono', formatBytes(capture.bytes)].filter(Boolean).join(' · ')}
      </Text>
      <Button mode="outlined" icon={capture.photoId ? 'image-outline' : 'play-outline'} disabled={busy} onPress={() => onPlay(capture)}
        contentStyle={sessionStyles.touch} style={sessionStyles.control}>{capture.photoId ? 'Ver foto' : 'Reproducir'}</Button>
      {renderUpload(capture)}
      <SessionDetails title="Identificadores y archivo">
        <Text selectable variant="bodySmall">{capture.photoId ? 'photoId' : 'Clip'}: {capture.id} · Node: {capture.nodeId}</Text>
        {!capture.photoId && <Text selectable variant="bodySmall">takeId: {capture.takeId ?? 'clip manual H1'}</Text>}
        <Text selectable variant="bodySmall">{capture.localUri}</Text>
      </SessionDetails>
    </View>)}
  </View>;
}
