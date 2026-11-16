import { Image, View } from 'react-native';
import { Button, Icon, Text, useTheme } from 'react-native-paper';
import type { ImagePickerAsset } from 'expo-image-picker';
import { formatBytes } from '@/components/MediaAssetCard';
import { SessionNotice, SessionSection, sessionStyles } from './SessionUI';

export function SessionImportView({ selected, status, message, hasLastSaved, onSelect, onUpload, onOpenLast }: {
  selected: ImagePickerAsset | null; status: 'idle' | 'selected' | 'uploading' | 'success' | 'error'; message: string;
  hasLastSaved: boolean; onSelect(): void; onUpload(): void; onOpenLast(): void;
}) {
  const { colors } = useTheme();
  return <SessionSection title="Importar medio" description="Imágenes o vídeos de hasta 80 MB. Se vinculan a esta Session, sin convertirse en una captura coordinada.">
    {selected && <View style={[sessionStyles.row, { backgroundColor: colors.surfaceVariant, padding: 12, borderRadius: 12 }]}>
      {selected.type === 'image' ? <Image source={{ uri: selected.uri }} style={{ height: 64, width: 64, borderRadius: 8 }} /> :
        <Icon source="file-video-outline" size={32} color={colors.onSurfaceVariant} />}
      <View style={{ flex: 1, gap: 6 }}><Text variant="titleMedium">{selected.fileName || 'Medio sin nombre'}</Text><Text variant="bodyMedium">{formatBytes(selected.fileSize)}</Text></View>
    </View>}
    <SessionNotice title={message} tone={status === 'error' ? 'error' : 'neutral'} />
    {status !== 'uploading' && status !== 'selected' && <Button mode="outlined" icon="plus" onPress={onSelect} style={sessionStyles.control} contentStyle={sessionStyles.touch}>Importar medio</Button>}
    {status === 'selected' && <View style={sessionStyles.stack}>
      <Button mode="contained-tonal" icon="cloud-upload-outline" onPress={onUpload} style={sessionStyles.control} contentStyle={sessionStyles.touch}>Subir a Cloudinary</Button>
      <Button mode="text" onPress={onSelect} contentStyle={sessionStyles.touch}>Cambiar medio</Button>
    </View>}
    {status === 'uploading' && <Text accessibilityLiveRegion="polite" variant="bodyMedium">Subiendo…</Text>}
    {status === 'success' && hasLastSaved && <View style={sessionStyles.row}>
      <Button mode="contained-tonal" onPress={onOpenLast} style={sessionStyles.control} contentStyle={sessionStyles.touch}>Abrir detalle</Button>
      <Button mode="text" onPress={onSelect} contentStyle={sessionStyles.touch}>Importar otro</Button>
    </View>}
  </SessionSection>;
}
