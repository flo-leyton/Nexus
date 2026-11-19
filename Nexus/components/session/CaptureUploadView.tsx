import { View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { mediaUploadLabel, type LocalCaptureMediaAsset } from '@/types/media';
import { SessionBadge, SessionNotice, sessionStyles } from './SessionUI';

export function CaptureUploadView({ asset, busy, disabled, notice, onUpload, onOpenRemote }: {
  asset: LocalCaptureMediaAsset; busy: boolean; disabled: boolean; notice: string; onUpload(): void; onOpenRemote(): void;
}) {
  const { colors } = useTheme();
  const uploaded = asset.upload.state === 'uploaded';
  return <View style={sessionStyles.stack}>
    <SessionBadge label={mediaUploadLabel(asset)} tone={uploaded ? 'success' : asset.upload.state === 'failed' ? 'error' : 'warning'} />
    <Text variant="bodyMedium">{asset.localAvailable ? 'Original local disponible' : 'Original local no disponible'}</Text>
    {(asset.upload.state === 'failed' || asset.upload.state === 'uncertain') && <Text variant="bodyMedium" style={{ color: colors.error }}>{asset.upload.error}</Text>}
    {asset.upload.state === 'uncertain' && <Text variant="bodyMedium">Cloudinary pudo recibir el archivo. No se anuncia éxito: reintentar conserva la identidad remota solicitada.</Text>}
    <Button mode="contained-tonal" icon={uploaded ? 'send-outline' : 'cloud-upload-outline'} disabled={disabled || busy || (!uploaded && !asset.localAvailable)} onPress={onUpload}
      style={sessionStyles.control} contentStyle={sessionStyles.touch}>
      {busy ? 'Procesando…' : uploaded ? 'Comunicar resultado al Controller' : asset.upload.state === 'failed' || asset.upload.state === 'uncertain' ? 'Reintentar subida' : 'Subir a Cloudinary'}
    </Button>
    {uploaded && <Button mode="text" icon="open-in-new" onPress={onOpenRemote} contentStyle={sessionStyles.touch}>Abrir vídeo remoto</Button>}
    {!asset.takeId && <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Clip manual sin Take: la subida se conserva en este teléfono; no se agrega a una toma del Controller.</Text>}
    {!!notice && !((asset.upload.state === 'failed' || asset.upload.state === 'uncertain') && notice === asset.upload.error) && <SessionNotice title={notice} />}
  </View>;
}
