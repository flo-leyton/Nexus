import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
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
    <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>Originales conservados en la aplicación. La subida es manual.</Text>
    {!captures.length && <Text variant="bodyMedium">No hay capturas locales verificadas en esta sesión.</Text>}
    {problems.map((problem, i) => <SessionNotice key={i} title={problem} tone="error" />)}
    {captures.map((capture) => <View key={capture.id} style={{ gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.outlineVariant }}>
      <View style={sessionStyles.between}><Text variant="titleMedium">{capture.photoId ? 'Foto' : capture.takeId ? `Toma · …${capture.takeId.slice(-6)}` : 'Prueba local · sin Take'}</Text>
        <SessionBadge label="Original local" />
      </View>
      <Text variant="bodyMedium">{new Date(capture.createdAt).toLocaleString()} · {(capture.bytes / 1024 / 1024).toFixed(2)} MB</Text>
      {!!capture.photoId && <Image source={{ uri: capture.localUri }} resizeMode="contain" style={{ width: '100%', height: 120 }} />}
      <Button mode="outlined" icon={capture.photoId ? 'image-outline' : 'play-outline'} disabled={busy} onPress={() => onPlay(capture)}
        contentStyle={sessionStyles.touch} style={sessionStyles.control}>{capture.photoId ? 'Ver foto' : 'Reproducir vídeo local'}</Button>
      {renderUpload(capture)}
      <SessionDetails title="Identificadores y archivo">
        <Text selectable variant="bodySmall">{capture.photoId ? 'photoId' : 'Clip'}: {capture.id} · Node: {capture.nodeId}</Text>
        {!capture.photoId && <Text selectable variant="bodySmall">takeId: {capture.takeId ?? 'clip manual H1'}</Text>}
        <Text selectable variant="bodySmall">{capture.localUri}</Text>
      </SessionDetails>
    </View>)}
    {player}
  </View>;
}
