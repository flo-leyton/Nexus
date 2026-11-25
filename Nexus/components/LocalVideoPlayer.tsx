import { useEffect, useState } from 'react';
import { createPlaybackDiagnostics } from './diagnostics/playbackDiagnostics';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet, View } from 'react-native';

import { Text } from 'react-native-paper';

export function LocalVideoPlayer({ uri, remote = false, height = 240 }: { uri: string; remote?: boolean; height?: number }) {
  const player = useVideoPlayer(uri);
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  const [trace] = useState(() => createPlaybackDiagnostics(remote));
  useEffect(() => { trace('mount'); return () => trace('unmount'); }, [trace]);
  useEffect(() => { trace('status', { status, error: !!error }); }, [trace, status, error]);
  return <View style={styles.panel} onLayout={__DEV__ ? event => {
    trace('layout', { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height });
  } : undefined}>
    <VideoView player={player} nativeControls contentFit="contain" surfaceType="textureView" style={[styles.video, { height }]} />
    {status === 'loading' && <Text variant="bodyMedium">Cargando vídeo…</Text>}
    {!!error && <Text accessibilityLiveRegion="polite" variant="bodyMedium">No se pudo reproducir el vídeo.</Text>}
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 8 }, video: { width: '100%', borderRadius: 12, overflow: 'hidden' } });
