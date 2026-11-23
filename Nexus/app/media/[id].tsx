import { useIsFocused } from '@react-navigation/native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatBytes } from '@/components/MediaAssetCard';
import { LocalVideoPlayer } from '@/components/LocalVideoPlayer';
import { CaptureUploadControls } from '@/components/CaptureUploadControls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getMediaAssetById, getMediaPlaybackUri } from '@/services/mediaCatalog';
import { mediaUploadLabel, type NexusMediaAsset } from '@/types/media';

export default function MediaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mediaId = Array.isArray(id) ? id[0] : id;
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [asset, setAsset] = useState<NexusMediaAsset | null | undefined>(undefined);
  const [playbackUri, setPlaybackUri] = useState<string | null>(null);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    setAsset(undefined); setPlaybackUri(null); setError('');
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
        {asset.resourceType === 'image' && (asset.storage === 'remote' || asset.localAvailable) &&
          <Image source={{ uri: asset.storage === 'remote' ? asset.url : asset.localUri }}
            resizeMode={asset.storage === 'local' ? 'contain' : undefined} style={styles.preview} />}
        <ThemedView style={styles.metadata}>
          <ThemedText type="subtitle">{asset.storage === 'local' ? asset.fileName : asset.fileName ?? asset.publicId}</ThemedText>
          <ThemedText>Tipo: {asset.resourceType}</ThemedText>
          <ThemedText>Tamaño: {formatBytes(asset.bytes)}</ThemedText>
          <ThemedText>Sesión: {asset.sessionId}</ThemedText>
          <ThemedText>Origen: {asset.source}</ThemedText>
          <ThemedText>{mediaUploadLabel(asset)}</ThemedText>
          {asset.storage === 'remote' ? <ThemedText>Public ID: {asset.publicId}</ThemedText> : <>
            <ThemedText selectable>{asset.photoId ? 'photoId' : 'Clip local'}: {asset.localId}</ThemedText>
            {!asset.photoId && <ThemedText selectable>takeId: {asset.takeId ?? 'Manual H1 (sin toma coordinada)'}</ThemedText>}
            <ThemedText selectable>deviceId: {asset.deviceId}</ThemedText>
            <ThemedText selectable>nodeId: {asset.nodeId}</ThemedText>
            <ThemedText>Archivo: {asset.localAvailable ? 'Local verificado' : 'No disponible'}</ThemedText>
            {asset.localError && <ThemedText>{asset.localError}</ThemedText>}
            {(asset.upload.state === 'failed' || asset.upload.state === 'uncertain') && <ThemedText>{asset.upload.error}</ThemedText>}
            {asset.upload.state === 'uploaded' && <ThemedText selectable>Recurso remoto: {asset.upload.url}</ThemedText>}
            {!asset.photoId && <ThemedText>Este catálogo no indica ACK ni confirmación del relay. Consulta la toma en el Controller.</ThemedText>}
          </>}
          {asset.width !== undefined && asset.height !== undefined && <ThemedText>Dimensiones: {asset.width} × {asset.height}</ThemedText>}
          {asset.duration !== undefined && <ThemedText>Duración: {asset.duration} s</ThemedText>}
          <ThemedText>Creado: {new Date(asset.createdAt).toLocaleString()}</ThemedText>
          <ThemedText selectable style={styles.url}>{asset.storage === 'remote' ? asset.url : asset.localUri}</ThemedText>
        </ThemedView>
        {!!error && <ThemedText>{error}</ThemedText>}
        {asset.storage === 'local' && <CaptureUploadControls id={asset.id} />}
        {asset.storage === 'local' && !asset.localAvailable ? <ThemedText>El archivo local no se pudo verificar.</ThemedText> :
          !(asset.storage === 'local' && asset.resourceType === 'image') && <Pressable accessibilityRole="button" onPress={() => {
          setError(''); setPlaybackUri(null);
          void getMediaPlaybackUri(asset).then((uri) => {
            if (asset.storage === 'local') setPlaybackUri(uri);
            else return Linking.openURL(uri);
          }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'No se pudo abrir el medio.'));
        }} style={styles.button}>
          <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>{asset.storage === 'local' ? 'REPRODUCIR VÍDEO LOCAL' : 'ABRIR MEDIO'}</ThemedText>
        </Pressable>}
        {playbackUri && focused && <LocalVideoPlayer key={playbackUri} uri={playbackUri} />}
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
