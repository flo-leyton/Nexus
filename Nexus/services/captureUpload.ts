import * as Crypto from 'expo-crypto';
import { getOrCreateDeviceId } from './deviceIdentity';
import { getMediaAssetById, getMediaCatalog, getMediaPlaybackUri, setCaptureUpload } from './mediaCatalog';
import { uploadMediaAsset } from './cloudinary';
import { getSessionService } from './session';
import type { CaptureUpload, LocalCaptureMediaAsset, RemoteMediaAsset } from '../types/media';
import type { TakeMediaAngle } from './sessionProtocol';

export interface UploadDependencies {
  getAsset(id: string): Promise<LocalCaptureMediaAsset | null>;
  getAssets(): Promise<LocalCaptureMediaAsset[]>;
  setState(id: string, state: CaptureUpload): Promise<void>;
  verify(asset: LocalCaptureMediaAsset): Promise<string>;
  owner(): Promise<string>;
  publicId(asset: LocalCaptureMediaAsset): Promise<string>;
  upload(asset: LocalCaptureMediaAsset, uri: string, publicId: string): Promise<RemoteMediaAsset>;
  notify(asset: LocalCaptureMediaAsset): Promise<void>;
}
export function createCaptureUploader(deps: UploadDependencies) {
  const active = new Map<string, Promise<void>>();
  let recovering: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const requireAsset = async (id: string) => {
    const asset = await deps.getAsset(id);
    if (!asset || asset.deviceId !== await deps.owner()) throw new Error('Sólo el dispositivo dueño del original puede subir este clip.');
    return asset;
  };
  const notify = async (id: string) => { const asset = await requireAsset(id); if (asset.takeId) await deps.notify(asset); };
  const set = async (id: string, state: CaptureUpload) => { await deps.setState(id, state); emit(); };
  const run = async (id: string) => {
    const asset = await requireAsset(id);
    if (asset.upload.state === 'uploaded') { await notify(id); return; }
    let confirmed: RemoteMediaAsset | null = null;
    try {
      await set(id, { state: 'queued' });
      const uri = await deps.verify(asset);
      const publicId = await deps.publicId(asset);
      await set(id, { state: 'uploading' });
      try { await notify(id); } catch { /* Offline relay does not prevent uploading an owned original. */ }
      confirmed = await deps.upload(asset, uri, publicId);
      if (confirmed.resourceType !== 'video' || confirmed.publicId !== publicId || !confirmed.url.startsWith('https://')) throw Object.assign(new Error('Respuesta de subida incompleta o ajena al clip.'), { code: 'UPLOAD_UNCERTAIN' });
      await set(id, { state: 'uploaded', publicId: confirmed.publicId, url: confirmed.url });
    } catch (error) {
      const uncertain = !!confirmed || (error && typeof error === 'object' && 'code' in error && error.code === 'UPLOAD_UNCERTAIN');
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 512);
      await set(id, { state: uncertain ? 'uncertain' : 'failed', error: message });
      try { await notify(id); } catch { /* State remains persisted for explicit publication after rejoin. */ }
      throw error;
    }
    // A validated upload is independent of whether the relay accepted its notification.
    await notify(id);
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    upload(id: string) {
      const existing = active.get(id); if (existing) return existing;
      const task = run(id).finally(() => { active.delete(id); emit(); });
      active.set(id, task); emit(); return task;
    },
    publish: notify,
    recover() {
      if (!recovering) recovering = (async () => {
        for (const asset of await deps.getAssets()) if (!active.has(asset.id) && asset.upload.state === 'uploading') {
          await set(asset.id, { state: 'uncertain', error: 'La app se cerró durante la subida. No hay una respuesta confirmada; reintenta el mismo clip.' });
        }
      })().catch((error) => { recovering = null; throw error; });
      return recovering;
    },
  };
}

async function notifyController(asset: LocalCaptureMediaAsset) {
  if (!asset.takeId) return;
  const service = await getSessionService();
  const session = service.getSnapshot().sessions[asset.sessionId];
  if (!session || session.members[asset.deviceId]?.kind !== 'node') throw new Error('Subida local persistida. Conecta al relay, solicita reingreso autorizado y pulsa COMUNICAR RESULTADO.');
  const angle: TakeMediaAngle = { clipId: asset.localId, takeId: asset.takeId, deviceId: asset.deviceId,
    nodeId: asset.nodeId, bytes: asset.bytes, revision: asset.uploadRevision ?? 0, upload: asset.upload };
  await new Promise<void>((resolve, reject) => {
    let requestId: string | null = null, settled = false;
    let off = () => {};
    const timer = setTimeout(() => { off(); reject(new Error('El relay no confirmó la referencia. Pulsa COMUNICAR RESULTADO para reintentar sin subir otra vez.')); }, 8000);
    const finish = (error?: string) => { if (settled) return; settled = true; clearTimeout(timer); off(); if (error) reject(new Error(error)); else resolve(); };
    off = service.subscribe((state) => {
      if (state.connection !== 'Connected') { finish('Sin conexión al relay; el estado de subida se conserva en el Node.'); return; }
      const event = state.lastEvent;
      if (!requestId || event?.sessionId !== asset.sessionId || event.payload.requestId !== requestId) return;
      if (event.type === 'MEDIA_ACCEPTED') finish();
      else if (event.type === 'SESSION_ERROR') finish(`Referencia no aceptada: ${event.payload.code}. No cambia el resultado H2.`);
    });
    if (settled) { off(); return; }
    try { requestId = service.reportMedia(asset.sessionId, session.controllerId, angle); }
    catch (error) { finish(error instanceof Error ? error.message : String(error)); }
  });
}
export const captureUploader = createCaptureUploader({
  async getAsset(id) { const asset = await getMediaAssetById(id); return asset?.storage === 'local' ? asset : null; },
  async getAssets() { return (await getMediaCatalog()).assets.filter((asset): asset is LocalCaptureMediaAsset => asset.storage === 'local'); },
  setState: setCaptureUpload, verify: getMediaPlaybackUri, owner: getOrCreateDeviceId,
  publicId: async (asset) => `nexus/${await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, asset.id)}`,
  upload: (asset, uri, publicId) => uploadMediaAsset({ uri, fileName: asset.fileName, mimeType: asset.fileName.endsWith('.mov') ? 'video/quicktime' : 'video/mp4',
    sessionId: asset.sessionId, source: 'capture', assetId: asset.id, expectedBytes: asset.bytes, publicId }),
  notify: notifyController,
});
