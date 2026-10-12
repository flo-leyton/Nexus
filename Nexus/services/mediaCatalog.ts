import AsyncStorage from '@react-native-async-storage/async-storage';

import type { NexusMediaAsset } from '@/types/media';

export const MEDIA_CATALOG_STORAGE_KEY = '@nexus-studio/media-assets';

function isMediaAsset(value: unknown): value is NexusMediaAsset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const asset = value as Partial<NexusMediaAsset>;
  return (
    typeof asset.id === 'string' &&
    typeof asset.sessionId === 'string' &&
    (asset.source === 'import' || asset.source === 'capture' || asset.source === 'output') &&
    (asset.resourceType === 'image' || asset.resourceType === 'video') &&
    typeof asset.publicId === 'string' &&
    typeof asset.url === 'string' &&
    typeof asset.createdAt === 'string'
  );
}

export async function getMediaAssets(): Promise<NexusMediaAsset[]> {
  const stored = await AsyncStorage.getItem(MEDIA_CATALOG_STORAGE_KEY);
  if (!stored) return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMediaAsset).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function saveMediaAsset(asset: NexusMediaAsset): Promise<void> {
  const assets = await getMediaAssets();
  await AsyncStorage.setItem(
    MEDIA_CATALOG_STORAGE_KEY,
    JSON.stringify([asset, ...assets.filter((item) => item.id !== asset.id)]),
  );
}

export async function getMediaAssetsBySession(sessionId: string): Promise<NexusMediaAsset[]> {
  return (await getMediaAssets()).filter((asset) => asset.sessionId === sessionId);
}

export async function getMediaAssetById(id: string): Promise<NexusMediaAsset | null> {
  return (await getMediaAssets()).find((asset) => asset.id === id) ?? null;
}
