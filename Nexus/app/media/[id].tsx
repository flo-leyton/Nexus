import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatBytes } from '@/components/MediaAssetCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getMediaAssetById } from '@/services/mediaCatalog';
import type { NexusMediaAsset } from '@/types/media';

export default function MediaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mediaId = Array.isArray(id) ? id[0] : id;
  const insets = useSafeAreaInsets();
  const [asset, setAsset] = useState<NexusMediaAsset | null | undefined>(undefined);

  useEffect(() => {
    if (!mediaId) {
      setAsset(null);
      return;
    }
    void getMediaAssetById(mediaId).then(setAsset);
  }, [mediaId]);

  if (asset === undefined) return <ThemedView style={styles.center}><ThemedText>Cargando medio...</ThemedText></ThemedView>;
  if (!asset) return <ThemedView style={styles.center}><ThemedText>El medio no existe en el catálogo local.</ThemedText></ThemedView>;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
        <Pressable onPress={() => router.back()}><ThemedText type="link">← Volver</ThemedText></Pressable>
        <ThemedText type="title">Detalle del medio</ThemedText>
        {asset.resourceType === 'image' && <Image source={{ uri: asset.url }} style={styles.preview} />}
        <ThemedView style={styles.metadata}>
          <ThemedText type="subtitle">{asset.fileName ?? asset.publicId}</ThemedText>
          <ThemedText>Tipo: {asset.resourceType}</ThemedText>
          <ThemedText>Tamaño: {formatBytes(asset.bytes)}</ThemedText>
          <ThemedText>Sesión: {asset.sessionId}</ThemedText>
          <ThemedText>Origen: {asset.source}</ThemedText>
          <ThemedText>Public ID: {asset.publicId}</ThemedText>
          {asset.width !== undefined && asset.height !== undefined && <ThemedText>Dimensiones: {asset.width} × {asset.height}</ThemedText>}
          {asset.duration !== undefined && <ThemedText>Duración: {asset.duration} s</ThemedText>}
          <ThemedText>Creado: {new Date(asset.createdAt).toLocaleString()}</ThemedText>
          <ThemedText selectable style={styles.url}>{asset.url}</ThemedText>
        </ThemedView>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(asset.url)} style={styles.button}>
          <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>ABRIR MEDIO</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { alignSelf: 'center', gap: 20, maxWidth: 680, padding: 24, paddingBottom: 64, width: '100%' },
  preview: { backgroundColor: '#E4E7EC', borderRadius: 16, height: 320, width: '100%' },
  metadata: { borderColor: '#687076', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 8, padding: 18 },
  url: { fontSize: 12, opacity: 0.7 },
  button: { alignItems: 'center', backgroundColor: '#474FE7', borderRadius: 12, padding: 16 },
  buttonText: { fontWeight: '800' },
});
