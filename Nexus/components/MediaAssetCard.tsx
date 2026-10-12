import { Image, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { NexusMediaAsset } from '@/types/media';

export function formatBytes(bytes?: number) {
  if (bytes === undefined) return 'Tamaño no disponible';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaAssetCard({ asset, onPress }: { asset: NexusMediaAsset; onPress?: () => void }) {
  const content = (
    <ThemedView style={styles.card}>
      {asset.resourceType === 'image' ? (
        <Image source={{ uri: asset.url }} style={styles.preview} />
      ) : (
        <View style={styles.videoPreview}>
          <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.videoLabel}>VIDEO</ThemedText>
        </View>
      )}
      <View style={styles.body}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>{asset.fileName ?? asset.publicId}</ThemedText>
        <ThemedText>{asset.resourceType === 'image' ? 'Imagen' : 'Video'} · {formatBytes(asset.bytes)}</ThemedText>
        <ThemedText style={styles.meta}>Sesión: {asset.sessionId}</ThemedText>
        <ThemedText style={styles.meta}>Origen: {asset.source} · Cloudinary disponible</ThemedText>
        <ThemedText style={styles.meta}>{new Date(asset.createdAt).toLocaleString()}</ThemedText>
      </View>
    </ThemedView>
  );

  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

const styles = StyleSheet.create({
  card: { borderColor: '#687076', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  preview: { backgroundColor: '#E4E7EC', height: 180, width: '100%' },
  videoPreview: { alignItems: 'center', backgroundColor: '#20242A', height: 120, justifyContent: 'center' },
  videoLabel: { fontSize: 18, fontWeight: '800', letterSpacing: 2 },
  body: { gap: 4, padding: 16 },
  meta: { fontSize: 13, opacity: 0.68 },
});
