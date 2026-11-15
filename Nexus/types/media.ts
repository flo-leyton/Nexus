export type NexusMediaSource = 'import' | 'capture' | 'output';

export type NexusMediaResourceType = 'image' | 'video';

type MediaAssetBase = {
  id: string;
  sessionId: string;
  source: NexusMediaSource;
  resourceType: NexusMediaResourceType;
  fileName?: string;
  bytes?: number;
  width?: number;
  height?: number;
  duration?: number;
  nodeId?: string;
  role?: string;
  createdAt: string;
};

export type CaptureUpload =
  | { state: 'local' }
  | { state: 'queued' }
  | { state: 'uploading' }
  | { state: 'uploaded'; publicId: string; url: string }
  | { state: 'uncertain'; error: string }
  | { state: 'failed'; error: string };

export type RemoteMediaAsset = MediaAssetBase & {
  storage: 'remote';
  publicId: string;
  url: string;
};

export type LocalCaptureMediaAsset = MediaAssetBase & {
  storage: 'local';
  source: 'capture';
  resourceType: 'video';
  localId: string;
  takeId: string | null;
  deviceId: string;
  nodeId: string;
  localUri: string;
  fileName: 'video.mp4' | 'video.mov';
  bytes: number;
  audio: false;
  upload: CaptureUpload;
  uploadRevision?: number;
  // Recomputed on read, never accepted as proof of a file or relay confirmation.
  localAvailable: boolean;
  localError: string | null;
};

export type NexusMediaAsset = RemoteMediaAsset | LocalCaptureMediaAsset;

export function mediaUploadLabel(asset: NexusMediaAsset): string {
  if (asset.storage === 'remote') return 'Subida completada';
  return { local: 'Sólo local', queued: 'Subida pendiente', uploading: 'Subiendo', uploaded: 'Subido', failed: 'Error de subida', uncertain: 'Subida sin confirmar' }[asset.upload.state];
}
