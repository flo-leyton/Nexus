import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import type { LocalCapture } from '@/types/capture';
import { SessionBadge, SessionDetails, SessionNotice, sessionStyles } from './SessionUI';

export function LocalCapturesView({ captures, problems, busy, onPlay, renderUpload, player }: {
  captures: LocalCapture[]; problems: string[]; busy: boolean; onPlay(capture: LocalCapture): void;
  renderUpload(capture: LocalCapture): ReactNode; player: ReactNode;
}) {
  const { colors } = useTheme();
  return <View style={sessionStyles.stack}>
    <Text accessibilityRole="header" variant="titleMedium">Originales de este teléfono</Text>
    <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>Capturas silenciadas conservadas en la aplicación. La subida es manual; no certifica ACK del Controller.</Text>
    {!captures.length && <Text variant="bodyMedium">No hay vídeos locales verificados en esta Session.</Text>}
    {problems.map((problem, i) => <SessionNotice key={i} title={problem} tone="error" />)}
    {captures.map((capture) => <View key={capture.id} style={{ gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.outlineVariant }}>
      <View style={sessionStyles.between}><Text variant="titleMedium">{capture.takeId ? `Toma · …${capture.takeId.slice(-6)}` : 'Prueba local · sin Take'}</Text>
        <SessionBadge label="Original local" />
      </View>
      <Text variant="bodyMedium">{new Date(capture.createdAt).toLocaleString()} · {(capture.bytes / 1024 / 1024).toFixed(2)} MB</Text>
      <Button mode="outlined" icon="play-outline" disabled={busy} onPress={() => onPlay(capture)} contentStyle={sessionStyles.touch} style={sessionStyles.control}>Reproducir vídeo local</Button>
      {renderUpload(capture)}
      <SessionDetails title="Identificadores y archivo">
        <Text selectable variant="bodySmall">Clip: {capture.id} · Node: {capture.nodeId}</Text>
        <Text selectable variant="bodySmall">takeId: {capture.takeId ?? 'clip manual H1'}</Text>
        <Text selectable variant="bodySmall">{capture.localUri}</Text>
      </SessionDetails>
    </View>)}
    {player}
  </View>;
}
