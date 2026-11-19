import { Image, View } from 'react-native';
import { Icon, Text, TouchableRipple, useTheme } from 'react-native-paper';
import type { RemoteMediaAsset } from '@/types/media';
import { mediaUploadLabel } from '@/types/media';
import { formatBytes } from '@/components/MediaAssetCard';
import { SessionDetails, sessionStyles } from './SessionUI';

export function SessionImportedMediaRow({ asset, onPress }: { asset: RemoteMediaAsset; onPress(): void }) {
  const { colors } = useTheme();
  return <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: colors.outlineVariant, paddingVertical: 8 }}>
    <TouchableRipple onPress={onPress} accessibilityRole="button" accessibilityLabel={`Abrir ${asset.fileName || asset.publicId}`}>
      <View style={[sessionStyles.row, { paddingVertical: 12 }]}>
        {asset.resourceType === 'image' ? <Image source={{ uri: asset.url }} style={{ width: 56, height: 56, borderRadius: 8 }} /> : <Icon source="file-video-outline" size={32} color={colors.onSurfaceVariant} />}
        <View style={{ flex: 1, gap: 4 }}><Text variant="titleMedium">{asset.fileName || asset.publicId}</Text>
          <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>{asset.resourceType === 'image' ? 'Imagen' : 'Vídeo'} · {formatBytes(asset.bytes)} · {asset.source === 'import' ? 'importado' : asset.source}</Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{mediaUploadLabel(asset)}</Text>
        </View><Icon source="chevron-right" size={20} color={colors.primary} />
      </View>
    </TouchableRipple>
    <SessionDetails title="Metadatos"><Text selectable variant="bodySmall">Session: {asset.sessionId} · Origen: {asset.source}</Text>
      <Text variant="bodySmall">{new Date(asset.createdAt).toLocaleString()}</Text>
      <Text selectable variant="bodySmall">Public ID: {asset.publicId}</Text>
    </SessionDetails>
  </View>;
}
