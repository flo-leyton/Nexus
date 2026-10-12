import { useFocusEffect } from '@react-navigation/native';
import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MediaAssetCard } from '@/components/MediaAssetCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getMediaAssets } from '@/services/mediaCatalog';
import type { NexusMediaAsset } from '@/types/media';

export default function MediaLibraryScreen() {
  const insets = useSafeAreaInsets();
  const [assets, setAssets] = useState<NexusMediaAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    void getMediaAssets().then((items) => {
      if (active) {
        setAssets(items);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []));

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}>
        <ThemedText type="title">Medios</ThemedText>
        <ThemedText style={styles.subtitle}>Catálogo local de assets almacenados en Cloudinary.</ThemedText>
        {loading ? <ThemedText>Cargando catálogo...</ThemedText> : assets.length === 0 ? (
          <ThemedView style={styles.empty}>
            <ThemedText type="subtitle">La biblioteca está vacía</ThemedText>
            <ThemedText>Crea una sesión en Studio e importa una imagen o video.</ThemedText>
          </ThemedView>
        ) : assets.map((asset) => (
          <MediaAssetCard
            asset={asset}
            key={asset.id}
            onPress={() => router.push(`/media/${asset.id}` as Href)}
          />
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignSelf: 'center', gap: 18, maxWidth: 640, padding: 24, paddingBottom: 64, width: '100%' },
  subtitle: { opacity: 0.7 },
  empty: { borderColor: '#687076', borderRadius: 16, borderStyle: 'dashed', borderWidth: StyleSheet.hairlineWidth, gap: 8, padding: 24 },
});
