import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { captureUploader } from '@/services/captureUpload';
import { getMediaAssetById } from '@/services/mediaCatalog';
import { mediaUploadLabel, type LocalCaptureMediaAsset } from '@/types/media';

export function CaptureUploadControls({ id, disabled = false }: { id: string; disabled?: boolean }) {
  const [asset, setAsset] = useState<LocalCaptureMediaAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true, revision = 0;
    const refresh = () => {
      const requested = ++revision;
      void getMediaAssetById(id).then((item) => {
        if (active && requested === revision) setAsset(item?.storage === 'local' ? item : null);
      }).catch(() => { if (active) setNotice('No se pudo leer el estado persistente del clip.'); });
    };
    const off = captureUploader.subscribe(refresh);
    void captureUploader.recover().then(refresh).catch(() => { if (active) setNotice('No se pudo revisar una subida interrumpida.'); });
    refresh();
    return () => { active = false; off(); };
  }, [id]);
  const run = (publish: boolean) => {
    setBusy(true); setNotice('');
    void (publish ? captureUploader.publish(id) : captureUploader.upload(id)).then(() => {
      setNotice('Operación finalizada. Comprueba el estado de subida del clip y los ángulos en el Controller.');
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'No se pudo completar la operación.'))
      .finally(() => setBusy(false));
  };
  if (!asset) return null;
  const uploaded = asset.upload.state === 'uploaded';
  return <View style={styles.panel}>
    <ThemedText accessibilityLiveRegion="polite">{mediaUploadLabel(asset)} · {asset.localAvailable ? 'Original local disponible' : 'Original local no disponible'}</ThemedText>
    {(asset.upload.state === 'failed' || asset.upload.state === 'uncertain') && <ThemedText>{asset.upload.error}</ThemedText>}
    {asset.upload.state === 'uncertain' && <ThemedText>No se anuncia éxito: Cloudinary pudo recibir el archivo. El reintento conserva la identidad remota solicitada.</ThemedText>}
    <Pressable accessibilityRole="button" disabled={disabled || busy || (!uploaded && !asset.localAvailable)} onPress={() => run(uploaded)} style={styles.button}>
      <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">{busy ? 'PROCESANDO…' : uploaded ? 'COMUNICAR RESULTADO AL CONTROLLER' : asset.upload.state === 'failed' || asset.upload.state === 'uncertain' ? 'REINTENTAR SUBIDA' : 'SUBIR A CLOUDINARY'}</ThemedText>
    </Pressable>
    {uploaded && <Pressable accessibilityRole="button" onPress={() => { if (asset.upload.state === 'uploaded') void Linking.openURL(asset.upload.url).catch(() => setNotice('No se pudo abrir el vídeo remoto.')); }}>
      <ThemedText type="link">ABRIR VÍDEO REMOTO</ThemedText>
    </Pressable>}
    {!asset.takeId && <ThemedText>Clip manual sin Take: la subida se conserva en este teléfono; no se agrega a una toma del Controller.</ThemedText>}
    {!!notice && <ThemedText accessibilityLiveRegion="polite">{notice}</ThemedText>}
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 8 }, button: { backgroundColor: '#474FE7', borderRadius: 12, padding: 14, alignItems: 'center' } });
