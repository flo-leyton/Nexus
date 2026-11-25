import type { Session } from '@/services/sessionProtocol';
import { mediaUploadLabel, type NexusMediaAsset } from '@/types/media';

export function mediaStatus(asset: NexusMediaAsset) {
  if (asset.storage === 'remote') return 'Subido a Cloudinary';
  if (!asset.localAvailable) return asset.upload.state === 'uploaded' ? 'Original no disponible · Subido a Cloudinary' : 'No disponible';
  if (asset.upload.state === 'uploaded') return 'Subido a Cloudinary';
  if (asset.upload.state === 'local') return 'Solo local';
  return mediaUploadLabel(asset);
}

export function mediaOrigin(asset: NexusMediaAsset) {
  return asset.role || (asset.storage === 'local' ? 'Este teléfono' : asset.source === 'import' ? 'Importado' : 'Remoto');
}

export function mediaDate(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

export function takeNumbers(ids: Iterable<string>, session?: Session, prefix = '') {
  const order = new Set([...(session?.takeHistory ?? []).map(({ takeId }) => takeId),
    ...(session?.take ? [session.take.takeId] : [])].map((id) => prefix + id).concat([...ids]));
  return new Map(Array.from(order, (id, index) => [id, index + 1]));
}
