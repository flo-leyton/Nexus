import { View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import type { LocalCaptureMediaAsset } from '@/types/media';
import { mediaStatus } from '../mediaPresentation';
import { SessionBadge, SessionDetails, SessionNotice, sessionStyles } from './SessionUI';

export function CaptureUploadView({ asset, busy, disabled, notice, onUpload, onOpenRemote, compact = false }: {
  asset: LocalCaptureMediaAsset; busy: boolean; disabled: boolean; notice: string; onUpload(): void; onOpenRemote(): void;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const uploaded = asset.upload.state === 'uploaded';
  const actions = <>
    {(asset.upload.state === 'failed' || asset.upload.state === 'uncertain') && <Text variant="bodyMedium" style={{ color: colors.error }}>{asset.upload.error}</Text>}
    {asset.upload.state === 'uncertain' && <Text variant="bodyMedium">Cloudinary pudo recibir el archivo. No se anuncia éxito: reintentar conserva la identidad remota solicitada.</Text>}
    <Button mode="contained-tonal" icon={uploaded ? 'send-outline' : 'cloud-upload-outline'} disabled={disabled || busy || (!uploaded && !asset.localAvailable)} onPress={onUpload}
      style={sessionStyles.control} contentStyle={sessionStyles.touch}>
      {busy ? 'Procesando…' : uploaded ? 'Comunicar resultado al Controller' : asset.upload.state === 'failed' || asset.upload.state === 'uncertain' ? 'Reintentar subida' : 'Subir a Cloudinary'}
    </Button>
    {uploaded && <Button mode="text" disabled={disabled} icon="open-in-new" onPress={onOpenRemote} contentStyle={sessionStyles.touch}>
      {asset.resourceType === 'image' ? 'Ver foto remota' : 'Reproducir copia remota'}
    </Button>}
    {!asset.takeId && <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{asset.resourceType === 'image'
      ? 'La referencia de la foto subida se conserva en este teléfono.'
      : 'Clip manual sin Take: la subida se conserva en este teléfono; no se agrega a una toma del Controller.'}</Text>}
    {!!notice && !((asset.upload.state === 'failed' || asset.upload.state === 'uncertain') && notice === asset.upload.error) && <SessionNotice title={notice} />}
  </>;
  return <View style={compact ? { gap: 4 } : sessionStyles.stack}>
    <SessionBadge label={mediaStatus(asset)} tone={!asset.localAvailable || asset.upload.state === 'failed' ? 'error' : uploaded ? 'success' : 'warning'} />
    {compact ? <SessionDetails title="Cloudinary">{actions}</SessionDetails> : actions}
  </View>;
}
