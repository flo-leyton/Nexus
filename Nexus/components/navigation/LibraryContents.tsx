import { useState } from 'react';
import { View } from 'react-native';
import { Button, Divider, Searchbar, Text } from 'react-native-paper';
import type { NexusMediaAsset } from '@/types/media';
import { formatBytes } from '@/components/MediaAssetCard';
import { mediaDate, mediaOrigin, mediaStatus, takeNumbers } from '@/components/mediaPresentation';

type Props = { assets: NexusMediaAsset[]; onOpen(asset: NexusMediaAsset): void; onPlay?(asset: NexusMediaAsset): void; onSession?(sessionId: string): void };
export function LibraryContents({ assets, onOpen, onPlay, onSession }: Props) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase();
  const groups = new Map<string, NexusMediaAsset[]>();
  const ids = new Map<string, string[]>();
  for (const asset of [...assets].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (asset.storage === 'local' && asset.takeId) ids.set(asset.sessionId, [...(ids.get(asset.sessionId) ?? []), asset.takeId]);
  }
  const numbers = new Map([...ids].map(([sessionId, takes]) => [sessionId, takeNumbers(takes)]));
  for (const asset of assets) {
    const take = asset.storage === 'local' ? asset.takeId : null;
    if (normalized && ![asset.fileName, asset.sessionId, take, asset.nodeId, asset.source].join(' ').toLocaleLowerCase().includes(normalized)) continue;
    const key = asset.sessionId + ' / ' + (take ?? (asset.source === 'import' ? 'Importados' : 'Manuales y otros medios'));
    groups.set(key, [...(groups.get(key) ?? []), asset]);
  }
  return <View style={{ gap: 20 }}>
    <Searchbar placeholder="Buscar sesión, toma o archivo" accessibilityLabel="Buscar en Biblioteca" value={query} onChangeText={setQuery} />
    {!groups.size && <Text>No hay archivos que coincidan. Los originales de otros Nodes no se almacenan en este teléfono.</Text>}
    {[...groups].map(([key, items]) => {
      const first = items[0];
      const take = first.storage === 'local' ? first.takeId : null;
      return <View key={key} style={{ gap: 8 }}>
      <Text accessibilityRole="header" variant="titleMedium">
        {take ? `Toma ${numbers.get(first.sessionId)?.get(take)}` : first.source === 'import' ? 'Importados' : 'Capturas y otros medios'}
      </Text>
      {onSession && <Button mode="text" icon="video-outline" contentStyle={{ minHeight: 48 }} onPress={() => onSession(first.sessionId)}>Abrir sesión</Button>}
      {items.map(asset => <View key={asset.id} style={{ gap: 4 }}>
        <Text variant="titleSmall">{asset.storage === 'remote' && asset.fileName || (asset.resourceType === 'image' ? 'Foto' : 'Vídeo')}</Text>
        <Text variant="bodySmall">{[mediaDate(asset.createdAt), mediaOrigin(asset), formatBytes(asset.bytes)].filter(Boolean).join(' · ')}</Text>
        <Text variant="bodySmall">{mediaStatus(asset)}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {onPlay && (asset.storage === 'remote' || asset.localAvailable) && <Button mode="outlined"
            icon={asset.resourceType === 'image' ? 'image-outline' : 'play-outline'} contentStyle={{ minHeight: 48 }}
            onPress={() => onPlay(asset)}>{asset.resourceType === 'image' ? 'Ver foto' : 'Reproducir'}</Button>}
          <Button mode="text" contentStyle={{ minHeight: 48 }} onPress={() => onOpen(asset)}>Detalles y acciones</Button>
        </View>
        <Divider />
      </View>)}
    </View>; })}
  </View>;
}
