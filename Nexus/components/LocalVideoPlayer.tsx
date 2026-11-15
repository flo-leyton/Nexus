import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export function LocalVideoPlayer({ uri, remote = false }: { uri: string; remote?: boolean }) {
  const player = useVideoPlayer(uri);
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  return <View style={styles.panel}>
    <VideoView player={player} nativeControls contentFit="contain" surfaceType="textureView" style={styles.video} />
    <ThemedText>Reproductor {remote ? 'remoto (Internet)' : 'local'}: {status === 'readyToPlay' ? 'Listo para reproducir; pulsa ▶' : status === 'loading' ? 'Cargando vídeo…' : status}</ThemedText>
    {error && <ThemedText>No se pudo reproducir: {error.message}</ThemedText>}
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 10 }, video: { width: '100%', height: 240 } });
