import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatBytes } from '@/components/MediaAssetCard';
import { useMediaViewer } from '@/components/MediaViewer';
import { mediaDate, mediaOrigin, mediaStatus } from '@/components/mediaPresentation';
import { SessionDetails, sessionStyles } from '@/components/session/SessionUI';
import { CaptureUploadControls } from '@/components/CaptureUploadControls';
import { LocalMediaActions } from '@/components/LocalMediaActions';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getMediaAssetById, getMediaPlaybackUri } from '@/services/mediaCatalog';
import type { NexusMediaAsset } from '@/types/media';

export default function MediaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mediaId = Array.isArray(id) ? id[0] : id;
  const insets = useSafeAreaInsets();
  const [asset, setAsset] = useState<NexusMediaAsset | null | undefined>(undefined);
  const { open, close, viewer } = useMediaViewer();
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    setAsset(undefined); setError('');
    if (!mediaId) {
      setAsset(null);
      return;
    }
    void getMediaAssetById(mediaId).then((item) => { if (active) setAsset(item); }).catch(() => {
      if (active) { setAsset(null); setError('No se pudo leer el catálogo.'); }
    });
    return () => { active = false; };
  }, [mediaId]));

  if (asset === undefined) return <ThemedView style={styles.center}><ThemedText>Cargando medio...</ThemedText></ThemedView>;
  if (!asset) return <ThemedView style={styles.center}><ThemedText>{error || 'El medio no existe en el catálogo local.'}</ThemedText></ThemedView>;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
        <Pressable onPress={() => router.back()}><ThemedText type="link">← Volver</ThemedText></Pressable>
        <ThemedText type="title">Detalle del medio</ThemedText>
        <ThemedView style={styles.metadata}>
          <ThemedText type="subtitle">{asset.storage === 'remote' && asset.fileName || (asset.resourceType === 'image' ? 'Foto' : 'Vídeo')}</ThemedText>
          <ThemedText>{[mediaDate(asset.createdAt), mediaOrigin(asset), formatBytes(asset.bytes)].filter(Boolean).join(' · ')}</ThemedText>
          <ThemedText>{mediaStatus(asset)}</ThemedText>
          {asset.storage === 'local' && !!asset.localError && <ThemedText>{asset.localError}</ThemedText>}
          <SessionDetails title="Datos técnicos">
          <ThemedText selectable>Sesión: {asset.sessionId}</ThemedText>
          {asset.storage === 'remote' ? <ThemedText selectable>Public ID: {asset.publicId}</ThemedText> : <>
            <ThemedText selectable>{asset.photoId ? 'photoId' : 'Clip local'}: {asset.localId}</ThemedText>
            {!asset.photoId && <ThemedText selectable>takeId: {asset.takeId ?? 'Manual H1 (sin toma coordinada)'}</ThemedText>}
            <ThemedText selectable>deviceId: {asset.deviceId}</ThemedText>
            <ThemedText selectable>nodeId: {asset.nodeId}</ThemedText>
            {asset.upload.state === 'uploaded' && <ThemedText selectable>Recurso remoto: {asset.upload.url}</ThemedText>}
          </>}
          {asset.width !== undefined && asset.height !== undefined && <ThemedText>Dimensiones: {asset.width} × {asset.height}</ThemedText>}
          {asset.duration !== undefined && <ThemedText>Duración: {asset.duration} s</ThemedText>}
          <ThemedText selectable style={styles.url}>{asset.storage === 'remote' ? asset.url : asset.localUri}</ThemedText>
          {asset.storage === 'remote' && <Button mode="text" onPress={() => {
            void Linking.openURL(asset.url).catch(() => setError('No se pudo abrir el enlace.'));
          }} contentStyle={sessionStyles.touch}>Abrir enlace externo</Button>}
          </SessionDetails>
        </ThemedView>
        {(asset.storage === 'remote' || asset.localAvailable) && <Button mode="contained"
          icon={asset.resourceType === 'image' ? 'image-outline' : 'play-outline'} contentStyle={sessionStyles.touch}
          onPress={() => open(asset.resourceType, () => getMediaPlaybackUri(asset), asset.storage === 'remote')}>
          {asset.resourceType === 'image' ? 'Ver foto' : 'Reproducir'}
        </Button>}
        {!!error && <ThemedText>{error}</ThemedText>}
        {asset.storage === 'local' && <>
          <CaptureUploadControls id={asset.id} />
          <LocalMediaActions id={asset.id} onDeleted={() => {
            close();
            setAsset(null);
            router.back();
          }} />
        </>}
      </ScrollView>
      {viewer}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { alignSelf: 'center', gap: 20, maxWidth: 680, padding: 24, paddingBottom: 64, width: '100%' },
  metadata: { borderColor: '#687076', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 8, padding: 18 },
  url: { fontSize: 12, opacity: 0.7 },
});
