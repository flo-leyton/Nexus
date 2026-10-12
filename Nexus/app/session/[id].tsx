import * as ImagePicker from 'expo-image-picker';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MediaAssetCard, formatBytes } from '@/components/MediaAssetCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { uploadMediaAsset } from '@/services/cloudinary';
import { getMediaAssetsBySession, saveMediaAsset } from '@/services/mediaCatalog';
import type { NexusMediaAsset } from '@/types/media';

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
type UploadState = 'idle' | 'selected' | 'uploading' | 'success' | 'error';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la importación.';
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Array.isArray(id) ? id[0] : id;
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [status, setStatus] = useState<UploadState>('idle');
  const [message, setMessage] = useState('Selecciona una imagen o video para comenzar.');
  const [media, setMedia] = useState<NexusMediaAsset[]>([]);
  const [lastSaved, setLastSaved] = useState<NexusMediaAsset | null>(null);

  useEffect(() => {
    if (sessionId) void getMediaAssetsBySession(sessionId).then(setMedia);
  }, [sessionId]);

  const selectMedia = async () => {
    setLastSaved(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setStatus('error');
      setMessage('Se necesita permiso para acceder a la biblioteca de imágenes y videos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (asset.type !== 'image' && asset.type !== 'video') {
      setStatus('error');
      setMessage('El archivo seleccionado no es una imagen o video compatible.');
      return;
    }
    if (asset.fileSize === undefined) {
      setStatus('error');
      setMessage('No se pudo comprobar el tamaño del archivo. Selecciona otro medio.');
      return;
    }
    if (asset.fileSize > MAX_UPLOAD_BYTES) {
      setStatus('error');
      setMessage(`El archivo pesa ${formatBytes(asset.fileSize)}. El máximo para esta demo es 80 MB.`);
      return;
    }

    setSelected(asset);
    setStatus('selected');
    setMessage('Medio listo. Confirma para subirlo a Cloudinary.');
  };

  const uploadSelected = async () => {
    if (!selected || !sessionId || (selected.type !== 'image' && selected.type !== 'video')) return;
    if (selected.fileSize === undefined || selected.fileSize > MAX_UPLOAD_BYTES) {
      setStatus('error');
      setMessage('El tamaño del archivo ya no puede validarse para esta demo.');
      return;
    }

    setStatus('uploading');
    setMessage('Subiendo el medio a Cloudinary...');
    try {
      const saved = await uploadMediaAsset({
        uri: selected.uri,
        fileName: selected.fileName ?? `nexus-${Date.now()}.${selected.type === 'image' ? 'jpg' : 'mp4'}`,
        mimeType: selected.mimeType ?? '',
        sessionId,
        source: 'import',
        file: selected.file ?? undefined,
      });
      await saveMediaAsset(saved);
      setMedia(await getMediaAssetsBySession(sessionId));
      setLastSaved(saved);
      setSelected(null);
      setStatus('success');
      setMessage('Medio subido y registrado en el catálogo local.');
    } catch (error) {
      setStatus('error');
      setMessage(errorMessage(error));
    }
  };

  if (!sessionId) return <ThemedView style={styles.center}><ThemedText>Sesión no válida.</ThemedText></ThemedView>;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
        <Pressable onPress={() => router.back()}><ThemedText type="link">← Volver a Studio</ThemedText></Pressable>
        <ThemedView style={styles.header}>
          <ThemedText style={styles.eyebrow}>SESIÓN DE DEMOSTRACIÓN</ThemedText>
          <ThemedText type="title">NEXUS Studio</ThemedText>
          <ThemedText selectable style={styles.sessionId}>{sessionId}</ThemedText>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Controller</ThemedText>
          <ThemedText>Este dispositivo · Controller actual</ThemedText>
          <ThemedText style={styles.note}>Rol local presentacional; no existe una sesión de red en esta iteración.</ThemedText>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Nodes</ThemedText>
          <ThemedText>Sin Nodes conectados</ThemedText>
          <ThemedText style={styles.note}>Placeholder conceptual. No se simula discovery, pairing ni comunicación.</ThemedText>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Importar medio</ThemedText>
          <ThemedText style={styles.note}>Imágenes o videos de hasta 80 MB.</ThemedText>
          {selected && (
            <View style={styles.selection}>
              {selected.type === 'image' ? (
                <Image source={{ uri: selected.uri }} style={styles.selectedPreview} />
              ) : (
                <View style={styles.video}><ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">VIDEO SELECCIONADO</ThemedText></View>
              )}
              <ThemedText type="defaultSemiBold">{selected.fileName ?? 'Medio sin nombre'}</ThemedText>
              <ThemedText>{formatBytes(selected.fileSize)}</ThemedText>
            </View>
          )}
          <ThemedText style={status === 'error' ? styles.error : styles.status}>Estado: {status} · {message}</ThemedText>
          {status !== 'uploading' && status !== 'selected' && (
            <Pressable onPress={selectMedia} style={styles.secondaryButton}>
              <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>IMPORTAR MEDIO</ThemedText>
            </Pressable>
          )}
          {status === 'selected' && (
            <View style={styles.actions}>
              <Pressable onPress={uploadSelected} style={styles.primaryButton}>
                <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>SUBIR A CLOUDINARY</ThemedText>
              </Pressable>
              <Pressable onPress={selectMedia} style={styles.secondaryButton}>
                <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>CAMBIAR MEDIO</ThemedText>
              </Pressable>
            </View>
          )}
          {status === 'uploading' && <ThemedText type="defaultSemiBold">Subiendo…</ThemedText>}
          {status === 'success' && lastSaved && (
            <View style={styles.actions}>
              <Pressable onPress={() => router.push(`/media/${lastSaved.id}` as Href)} style={styles.primaryButton}>
                <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>ABRIR DETALLE</ThemedText>
              </Pressable>
              <Pressable onPress={selectMedia} style={styles.secondaryButton}>
                <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>IMPORTAR OTRO</ThemedText>
              </Pressable>
            </View>
          )}
        </ThemedView>

        <ThemedView style={styles.mediaSection}>
          <ThemedText type="subtitle">Medios</ThemedText>
          {media.length === 0 ? <ThemedText style={styles.note}>Aún no hay medios en esta sesión.</ThemedText> : media.map((asset) => (
            <MediaAssetCard asset={asset} key={asset.id} onPress={() => router.push(`/media/${asset.id}` as Href)} />
          ))}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { alignSelf: 'center', gap: 20, maxWidth: 680, padding: 24, paddingBottom: 64, width: '100%' },
  header: { gap: 8 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 2, opacity: 0.55 },
  sessionId: { fontFamily: 'monospace', fontSize: 13, opacity: 0.68 },
  section: { borderColor: '#687076', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 12, padding: 18 },
  mediaSection: { gap: 14 },
  note: { fontSize: 13, opacity: 0.65 },
  status: { opacity: 0.78 },
  error: { color: '#D92D20' },
  selection: { gap: 8 },
  selectedPreview: { backgroundColor: '#E4E7EC', borderRadius: 12, height: 220, width: '100%' },
  video: { alignItems: 'center', backgroundColor: '#20242A', borderRadius: 12, height: 140, justifyContent: 'center' },
  actions: { gap: 10 },
  primaryButton: { alignItems: 'center', backgroundColor: '#474FE7', borderRadius: 12, padding: 15 },
  secondaryButton: { alignItems: 'center', backgroundColor: '#48525A', borderRadius: 12, padding: 15 },
  buttonText: { fontWeight: '800' },
});
