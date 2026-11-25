import { Image, View } from 'react-native';
import { Icon, Text, TouchableRipple, useTheme } from 'react-native-paper';
import type { RemoteMediaAsset } from '@/types/media';
import { mediaDate, mediaOrigin, mediaStatus } from '../mediaPresentation';
import { formatBytes } from '@/components/MediaAssetCard';
import { SessionDetails, sessionStyles } from './SessionUI';

export function SessionImportedMediaRow({ asset, onPress }: { asset: RemoteMediaAsset; onPress(): void }) {
  const { colors } = useTheme();
  return <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: colors.outlineVariant, paddingVertical: 8 }}>
    <TouchableRipple onPress={onPress} accessibilityRole="button" accessibilityLabel={asset.resourceType === 'image' ? 'Ver foto' : 'Reproducir vídeo'}>
      <View style={[sessionStyles.row, { paddingVertical: 6 }]}>
        {asset.resourceType === 'image' ? <Image source={{ uri: asset.url }} resizeMode="contain" style={{ width: 56, height: 56, borderRadius: 8 }} /> : <Icon source="file-video-outline" size={32} color={colors.onSurfaceVariant} />}
        <View style={{ flex: 1, gap: 4 }}><Text variant="titleMedium">{asset.fileName || (asset.resourceType === 'image' ? 'Foto' : 'Vídeo')}</Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{[mediaDate(asset.createdAt), mediaOrigin(asset), formatBytes(asset.bytes)].filter(Boolean).join(' · ')}</Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{mediaStatus(asset)}</Text>
        </View><Icon source="chevron-right" size={20} color={colors.primary} />
      </View>
    </TouchableRipple>
    <SessionDetails title="Metadatos"><Text selectable variant="bodySmall">Session: {asset.sessionId} · Origen: {asset.source}</Text>
      <Text selectable variant="bodySmall">Public ID: {asset.publicId}</Text>
      <Text selectable variant="bodySmall">{asset.url}</Text>
    </SessionDetails>
  </View>;
}
