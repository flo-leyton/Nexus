import { useFocusEffect } from '@react-navigation/native';
import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StudioUI } from '@/constants/studio-ui';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { LibraryContents } from '@/components/navigation/LibraryContents';
import { TakeMediaPanel } from '@/components/TakeMediaPanel';
import { useMediaViewer } from '@/components/MediaViewer';
import { captureUploader } from '@/services/captureUpload';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getMediaCatalog, getMediaPlaybackUri } from '@/services/mediaCatalog';
import type { NexusMediaAsset } from '@/types/media';

export default function MediaLibraryScreen() {
  const insets = useSafeAreaInsets();
  const palette = StudioUI[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const [assets, setAssets] = useState<NexusMediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [problems, setProblems] = useState<string[]>([]);
  const { open, viewer } = useMediaViewer();

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    void captureUploader.recover().then(() => getMediaCatalog()).then((result) => {
      if (active) {
        setAssets(result.assets);
        setProblems(result.problems);
        setLoading(false);
      }
    }).catch(() => { if (active) { setLoading(false); setProblems(['No se pudo leer el catálogo. Vuelve a abrir Medios.']); } });
    return () => { active = false; };
  }, []));

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}>
        <ThemedText type="title">Biblioteca</ThemedText>
        <ThemedText style={styles.subtitle}>Capturas de este teléfono e importaciones anteriores. Esta lista no confirma resultados de tomas en el Controller.</ThemedText>
        {problems.map((problem, index) => <ThemedText key={index}>{problem}</ThemedText>)}
        {loading ? <ThemedText>Cargando catálogo...</ThemedText> : assets.length === 0 ? (
          <ThemedView style={[styles.empty, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <ThemedText type="subtitle">La biblioteca está vacía</ThemedText>
            <ThemedText>Graba un clip en un Node o importa una imagen o vídeo desde Studio.</ThemedText>
          </ThemedView>
        ) : <LibraryContents assets={assets} onSession={id => router.push(`/session/${encodeURIComponent(id)}` as Href)}
          onPlay={(asset) => open(asset.resourceType, () => getMediaPlaybackUri(asset), asset.storage === 'remote')}
          onOpen={asset => router.push(`/media/${encodeURIComponent(asset.id)}` as Href)} />}
        <TakeMediaPanel />
      </ScrollView>
      {viewer}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignSelf: 'center', gap: 16, maxWidth: 640, padding: 20, paddingBottom: 64, width: '100%' },
  subtitle: { opacity: 0.7 },
  empty: { borderRadius: 20, borderStyle: 'dashed', borderWidth: 1, gap: 8, padding: 24 },
});
