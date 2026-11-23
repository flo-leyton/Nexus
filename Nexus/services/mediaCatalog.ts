import AsyncStorage from '@react-native-async-storage/async-storage';

import { deleteLocalCapture, hasLocalCaptureSidecar, scanLocalCaptures, verifyLocalCapture } from './localCaptures';
import { isProtocolId, isRecord } from './sessionProtocol';
import type { LocalCapture } from '../types/capture';
import type { CaptureUpload, LocalCaptureMediaAsset, NexusMediaAsset, RemoteMediaAsset } from '../types/media';

export const MEDIA_CATALOG_STORAGE_KEY = '@nexus-studio/media-assets'; // existing remote imports, kept in place
export const CAPTURE_CATALOG_PREFIX = '@nexus-studio/local-capture-media-v1/';
const writes = new Map<string, Promise<void>>();

export function captureCatalogId(capture: Pick<LocalCapture, 'sessionId' | 'deviceId' | 'id'>) {
  if (![capture.sessionId, capture.deviceId, capture.id].every(isProtocolId)) throw new Error('Identidad de captura inválida.');
  // ~ cannot occur in protocol IDs. Equal clip IDs on two devices never collide.
  return `local-capture~${capture.sessionId}~${capture.deviceId}~${capture.id}`;
}
function serializeWrite(key: string, operation: () => Promise<void>): Promise<void> {
  const task = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
  writes.set(key, task);
  const clean = () => { if (writes.get(key) === task) writes.delete(key); };
  void task.then(clean, clean);
  return task;
}
function validUpload(value: unknown): value is CaptureUpload {
  if (!isRecord(value)) return false;
  if (value.state === 'local' || value.state === 'queued' || value.state === 'uploading') return Object.keys(value).length === 1;
  if (value.state === 'failed' || value.state === 'uncertain') return Object.keys(value).length === 2 && typeof value.error === 'string';
  return value.state === 'uploaded' && Object.keys(value).length === 3 && typeof value.publicId === 'string' && !!value.publicId.trim() &&
    typeof value.url === 'string' && /^https:\/\//.test(value.url);
}
function readRemote(value: unknown): RemoteMediaAsset | null {
  if (!isRecord(value) || (value.storage !== undefined && value.storage !== 'remote') ||
      typeof value.id !== 'string' || typeof value.sessionId !== 'string' ||
      !['import', 'capture', 'output'].includes(String(value.source)) || !['image', 'video'].includes(String(value.resourceType)) ||
      typeof value.publicId !== 'string' || typeof value.url !== 'string' || typeof value.createdAt !== 'string') return null;
  return { ...value, storage: 'remote' } as RemoteMediaAsset;
}
function readCapture(text: string | null): LocalCaptureMediaAsset | null {
  if (!text) return null;
  try {
    const r: unknown = JSON.parse(text);
    if (!isRecord(r) || r.storage !== 'local' || r.source !== 'capture' ||
        (r.resourceType === 'image' ? r.fileName !== 'photo.jpg' || r.photoId !== r.localId || r.takeId !== null
          : r.resourceType !== 'video' || !['video.mp4', 'video.mov'].includes(String(r.fileName)) || r.photoId !== undefined) ||
        !isProtocolId(r.sessionId) || !isProtocolId(r.deviceId) || !isProtocolId(r.nodeId) || !isProtocolId(r.localId) ||
        !(r.takeId === null || isProtocolId(r.takeId)) ||
        typeof r.localUri !== 'string' || typeof r.bytes !== 'number' || !Number.isFinite(r.bytes) || r.bytes <= 0 ||
        r.audio !== false || typeof r.createdAt !== 'string' || !validUpload(r.upload) || 'publicId' in r || 'url' in r ||
        (r.uploadRevision !== undefined && (!Number.isSafeInteger(r.uploadRevision) || (r.uploadRevision as number) < 0)) ||
        r.id !== captureCatalogId({ sessionId: r.sessionId, deviceId: r.deviceId, id: r.localId })) return null;
    return { ...r, localAvailable: false, localError: 'Archivo sin comprobar' } as LocalCaptureMediaAsset;
  } catch { return null; }
}
function toCapture(asset: LocalCaptureMediaAsset): LocalCapture {
  return { id: asset.localId, sessionId: asset.sessionId, deviceId: asset.deviceId, nodeId: asset.nodeId,
    takeId: asset.takeId, localUri: asset.localUri, fileName: asset.fileName, bytes: asset.bytes, createdAt: asset.createdAt, audio: false,
    resourceType: asset.resourceType, ...(asset.photoId ? { photoId: asset.photoId } : {}) };
}
async function upsertCapture(capture: LocalCapture) {
  const id = captureCatalogId(capture);
  const key = `${CAPTURE_CATALOG_PREFIX}${id}`;
  await serializeWrite(key, async () => {
    // A scan started before deletion may still hold the old sidecar in memory.
    if (!await hasLocalCaptureSidecar(capture)) return;
    const text = await AsyncStorage.getItem(key);
    const current = readCapture(text);
    const record = { id, localId: capture.id, sessionId: capture.sessionId, takeId: capture.takeId,
      deviceId: capture.deviceId, nodeId: capture.nodeId, localUri: capture.localUri, bytes: capture.bytes,
      fileName: capture.fileName, audio: false, createdAt: capture.createdAt, storage: 'local', source: 'capture',
      resourceType: capture.resourceType ?? 'video', ...(capture.photoId ? { photoId: capture.photoId } : {}),
      upload: current?.upload ?? { state: 'local' } };
    const encoded = JSON.stringify({ ...record, uploadRevision: current?.uploadRevision ?? 0 });
    if (text !== encoded) await AsyncStorage.setItem(key, encoded);
  });
  return id;
}
export async function incorporateLocalCapture(capture: LocalCapture) {
  return upsertCapture(await verifyLocalCapture(capture));
}

export async function removeOwnedLocalCapture(id: string, owner: string) {
  const key = `${CAPTURE_CATALOG_PREFIX}${id}`;
  await serializeWrite(key, async () => {
    const text = await AsyncStorage.getItem(key);
    const asset = readCapture(text);
    if (!asset || asset.id !== id || asset.deviceId !== owner) throw new Error('Sólo el dispositivo dueño puede eliminar este original.');
    await AsyncStorage.removeItem(key);
    try { await deleteLocalCapture(toCapture(asset)); }
    catch (error) {
      if (text) await AsyncStorage.setItem(key, text);
      throw error;
    }
  });
}

// Persistence contract for H3.2. Nothing here starts or simulates an upload.
export async function setCaptureUpload(id: string, upload: CaptureUpload) {
  if (!validUpload(upload)) throw new Error('Estado de subida inválido: uploaded exige referencia remota real.');
  const key = `${CAPTURE_CATALOG_PREFIX}${id}`;
  await serializeWrite(key, async () => {
    const current = readCapture(await AsyncStorage.getItem(key));
    if (!current || current.id !== id) throw new Error('La captura no existe en el catálogo.');
    const { localAvailable: _available, localError: _error, ...stored } = current;
    const uploadRevision = (current.uploadRevision ?? 0) + (JSON.stringify(current.upload) === JSON.stringify(upload) ? 0 : 1);
    await AsyncStorage.setItem(key, JSON.stringify({ ...stored, upload, uploadRevision }));
  });
}
export async function getMediaCatalog(): Promise<{ assets: NexusMediaAsset[]; problems: string[] }> {
  const problems: string[] = [];
  const remote: RemoteMediaAsset[] = [];
  const stored = await AsyncStorage.getItem(MEDIA_CATALOG_STORAGE_KEY);
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) throw new Error();
      for (const item of parsed) { const asset = readRemote(item); if (asset) remote.push(asset); }
    } catch { problems.push('No se pudo leer el catálogo anterior; sus datos se conservaron.'); }
  }
  const scan = await scanLocalCaptures();
  problems.push(...scan.problems);
  await Promise.all(scan.entries.map(async ({ capture }) => {
    try { await upsertCapture(capture); } catch { problems.push(`No se pudo incorporar el clip ${capture.id} al catálogo.`); }
  }));
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(CAPTURE_CATALOG_PREFIX));
  const local: LocalCaptureMediaAsset[] = [];
  await Promise.all(keys.map(async (key) => {
    const asset = readCapture(await AsyncStorage.getItem(key));
    if (!asset || key !== `${CAPTURE_CATALOG_PREFIX}${asset.id}`) { problems.push('Un registro local de catálogo no es válido.'); return; }
    try {
      const verified = await verifyLocalCapture(toCapture(asset));
      local.push({ ...asset, localUri: verified.localUri, localAvailable: true, localError: null });
    } catch (error) { local.push({ ...asset, localAvailable: false, localError: error instanceof Error ? error.message : 'Archivo no disponible' }); }
  }));
  return { assets: [...remote, ...local].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), problems };
}
export async function getMediaAssets(): Promise<NexusMediaAsset[]> { return (await getMediaCatalog()).assets; }
export async function saveMediaAsset(asset: RemoteMediaAsset): Promise<void> {
  if (!readRemote(asset)) throw new Error('El medio importado no tiene una referencia remota válida.');
  await serializeWrite(MEDIA_CATALOG_STORAGE_KEY, async () => {
    const text = await AsyncStorage.getItem(MEDIA_CATALOG_STORAGE_KEY);
    const parsed: unknown = text ? JSON.parse(text) : [];
    if (!Array.isArray(parsed)) throw new Error('No se sobrescribió el catálogo anterior porque no se pudo leer.');
    // Preserve unknown older entries instead of rewriting only recognized records.
    await AsyncStorage.setItem(MEDIA_CATALOG_STORAGE_KEY, JSON.stringify([asset, ...parsed.filter((item) => !isRecord(item) || item.id !== asset.id)]));
  });
}
export async function getMediaAssetsBySession(sessionId: string): Promise<NexusMediaAsset[]> {
  return (await getMediaAssets()).filter((asset) => asset.sessionId === sessionId);
}
export async function getMediaAssetById(id: string): Promise<NexusMediaAsset | null> {
  return (await getMediaAssets()).find((asset) => asset.id === id) ?? null;
}
export async function getMediaPlaybackUri(asset: NexusMediaAsset): Promise<string> {
  return asset.storage === 'remote' ? asset.url : (await verifyLocalCapture(toCapture(asset))).localUri;
}
