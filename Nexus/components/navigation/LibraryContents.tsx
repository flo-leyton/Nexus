import { useState } from 'react';
import { View } from 'react-native';
import { Button, Divider, Searchbar, Text } from 'react-native-paper';
import type { NexusMediaAsset } from '@/types/media';
import { mediaUploadLabel } from '@/types/media';

type Props = { assets: NexusMediaAsset[]; onOpen(asset: NexusMediaAsset): void; onSession?(sessionId: string): void };
export function LibraryContents({ assets, onOpen, onSession }: Props) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase();
  const groups = new Map<string, NexusMediaAsset[]>();
  for (const asset of assets) {
    const take = asset.storage === 'local' ? asset.takeId : null;
    if (normalized && ![asset.fileName, asset.sessionId, take, asset.nodeId, asset.source].join(' ').toLocaleLowerCase().includes(normalized)) continue;
    const key = asset.sessionId + ' / ' + (take ?? (asset.source === 'import' ? 'Importados' : 'Manuales y otros medios'));
    groups.set(key, [...(groups.get(key) ?? []), asset]);
  }
  return <View style={{ gap: 20 }}>
    <Searchbar placeholder="Buscar sesión, toma o archivo" accessibilityLabel="Buscar en Biblioteca" value={query} onChangeText={setQuery} />
    {!groups.size && <Text>No hay archivos que coincidan. Los originales de otros Nodes no se almacenan en este teléfono.</Text>}
    {[...groups].map(([key, items]) => <View key={key} style={{ gap: 12 }}>
      <Text accessibilityRole="header" variant="titleMedium" selectable>{key}</Text>
      {onSession && <Button mode="text" icon="video-outline" contentStyle={{ minHeight: 48 }} onPress={() => onSession(items[0].sessionId)}>Abrir Session / importar</Button>}
      {items.map(asset => <View key={asset.id} style={{ gap: 6 }}>
        <Text variant="titleSmall">{asset.fileName ?? ('publicId' in asset ? asset.publicId : 'Original')}</Text>
        <Text>{asset.storage === 'local' ? (asset.localAvailable ? 'Original local verificado' : 'Original local no disponible') : 'Referencia remota'} · {mediaUploadLabel(asset)}</Text>
        {asset.nodeId && <Text selectable>Node: {asset.nodeId}</Text>}
        <Button mode="text" icon="open-in-new" contentStyle={{ minHeight: 48 }} onPress={() => onOpen(asset)}>Ver detalle y acciones</Button>
        <Divider />
      </View>)}
    </View>)}
  </View>;
}
