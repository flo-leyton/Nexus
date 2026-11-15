import * as Crypto from 'expo-crypto';
import { fetch as expoFetch } from 'expo/fetch';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import type { RemoteMediaAsset, NexusMediaResourceType, NexusMediaSource } from '@/types/media';
import { isCloudinaryVideoUrl } from './sessionProtocol';

export type UploadMediaAssetInput = {
  uri: string;
  fileName: string;
  mimeType: string;
  sessionId: string;
  source: NexusMediaSource;
  file?: Blob;
  assetId?: string;
  publicId?: string;
  expectedBytes?: number;
};

type CloudinaryUploadResponse = {
  public_id?: unknown;
  secure_url?: unknown;
  resource_type?: unknown;
  bytes?: unknown;
  width?: unknown;
  height?: unknown;
  duration?: unknown;
  error?: { message?: unknown };
};

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

function requiredPublicEnv(name: string, value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`CONFIGURATION ERROR: falta configurar ${name} en .env.`);
  return normalized;
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeMimeType(fileName: string, mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized) return normalized;

  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'mp4') return 'video/mp4';
  if (extension === 'mov') return 'video/quicktime';
  throw new Error('LOCAL FILE ERROR: no se pudo determinar el tipo MIME del archivo.');
}

function cloudinaryErrorDetail(payload: CloudinaryUploadResponse | null, body: string, fallback: string) {
  if (typeof payload?.error?.message === 'string') return payload.error.message;
  const trimmedBody = body.trim();
  return trimmedBody ? trimmedBody.slice(0, 300) : fallback;
}

type MediaUploadResponse = {
  status: number;
  statusText: string;
  body: string;
};

async function uploadFromWeb(
  endpoint: string,
  input: UploadMediaAssetInput,
  uploadPreset: string,
): Promise<MediaUploadResponse> {
  if (!input.file) {
    throw new Error('LOCAL FILE ERROR: ImagePicker no proporcionó el archivo web seleccionado.');
  }
  if (input.file.size <= 0) throw new Error('LOCAL FILE ERROR: el archivo seleccionado está vacío.');
  if (input.file.size > MAX_UPLOAD_BYTES) throw new Error('LOCAL FILE ERROR: el archivo supera el máximo de 80 MB.');

  const form = new FormData();
  form.append('file', input.file, input.fileName);
  form.append('upload_preset', uploadPreset);
  if (input.publicId) form.append('public_id', input.publicId);
  form.append('context', `nexus_session_id=${input.sessionId}|nexus_source=${input.source}`);
  const response = await expoFetch(endpoint, { method: 'POST', body: form });
  return { status: response.status, statusText: response.statusText, body: await response.text() };
}

async function uploadFromNative(
  endpoint: string,
  input: UploadMediaAssetInput,
  uploadPreset: string,
  mimeType: string,
): Promise<MediaUploadResponse> {
  let info: FileSystem.FileInfo;
  try {
    info = await FileSystem.getInfoAsync(input.uri);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'URI no compatible';
    throw new Error(`LOCAL FILE ERROR: no se pudo leer el archivo seleccionado (${detail}).`);
  }
  if (!info.exists || info.isDirectory || !Number.isFinite(info.size) || info.size <= 0) throw new Error('LOCAL FILE ERROR: el archivo seleccionado no existe, está vacío o no puede leerse.');
  if (input.expectedBytes !== undefined && info.size !== input.expectedBytes) throw new Error('LOCAL FILE ERROR: el tamaño del original cambió desde su verificación.');
  if (typeof info.size === 'number' && info.size <= 0) throw new Error('LOCAL FILE ERROR: el archivo seleccionado está vacío.');
  if (typeof info.size === 'number' && info.size > MAX_UPLOAD_BYTES) {
    throw new Error('LOCAL FILE ERROR: el archivo supera el máximo de 80 MB.');
  }

  const response = await FileSystem.uploadAsync(endpoint, input.uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType,
    parameters: {
      upload_preset: uploadPreset,
      ...(input.publicId ? { public_id: input.publicId } : {}),
      context: `nexus_session_id=${input.sessionId}|nexus_source=${input.source}`,
    },
  });
  return { status: response.status, statusText: '', body: response.body };
}

export async function uploadMediaAsset(input: UploadMediaAssetInput): Promise<RemoteMediaAsset> {
  if (!input.uri.trim()) throw new Error('LOCAL FILE ERROR: la URI del archivo está vacía.');
  if (!input.fileName.trim()) throw new Error('LOCAL FILE ERROR: el nombre del archivo está vacío.');

  const cloudName = requiredPublicEnv(
    'EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME',
    process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME,
  );
  const uploadPreset = requiredPublicEnv(
    'EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET',
    process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
  );
  const mimeType = normalizeMimeType(input.fileName, input.mimeType);

  if (__DEV__) {
    console.info('Cloudinary config: cloudName=configured, uploadPreset=configured');
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/auto/upload`;
  let response: MediaUploadResponse;
  try {
    response = Platform.OS === 'web'
      ? await uploadFromWeb(endpoint, input, uploadPreset)
      : await uploadFromNative(endpoint, input, uploadPreset, mimeType);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('LOCAL FILE ERROR:')) throw error;
    const detail = error instanceof Error ? error.message : 'sin detalle';
    throw Object.assign(new Error(`NETWORK ERROR: no se confirmó la transferencia con Cloudinary (${detail}). Puede haber recibido el archivo.`), { code: 'UPLOAD_UNCERTAIN' });
  }

  const responseBody = response.body;
  const responseOk = response.status >= 200 && response.status < 300;

  let payload: CloudinaryUploadResponse | null = null;
  try {
    payload = JSON.parse(responseBody) as CloudinaryUploadResponse;
  } catch {
    if (responseOk) {
      throw Object.assign(new Error(`CLOUDINARY RESPONSE ERROR (${response.status}): la respuesta no es JSON válido; subida sin confirmar.`), { code: 'UPLOAD_UNCERTAIN' });
    }
  }

  if (!responseOk) {
    const detail = cloudinaryErrorDetail(payload, responseBody, response.statusText || 'respuesta sin detalle');
    throw new Error(`CLOUDINARY RESPONSE ERROR (${response.status}): ${detail}`);
  }
  if (
    !payload ||
    typeof payload.public_id !== 'string' ||
    typeof payload.secure_url !== 'string' ||
    (payload.resource_type !== 'image' && payload.resource_type !== 'video')
  ) {
    throw Object.assign(new Error(`CLOUDINARY RESPONSE ERROR (${response.status}): faltan public_id, secure_url o resource_type válido.`), { code: 'UPLOAD_UNCERTAIN' });
  }
  if (input.publicId && (payload.public_id !== input.publicId || payload.resource_type !== 'video' ||
      !isCloudinaryVideoUrl(payload.secure_url) || typeof payload.bytes !== 'number' || payload.bytes <= 0)) {
    throw Object.assign(new Error('CLOUDINARY RESPONSE ERROR: no se confirmó el vídeo con la identidad esperada. El preset debe permitir y conservar public_id.'), { code: 'UPLOAD_UNCERTAIN' });
  }

  return {
    storage: 'remote',
    id: input.assetId ?? Crypto.randomUUID(),
    sessionId: input.sessionId,
    source: input.source,
    resourceType: payload.resource_type as NexusMediaResourceType,
    publicId: payload.public_id,
    url: payload.secure_url,
    fileName: input.fileName,
    bytes: optionalNumber(payload.bytes),
    width: optionalNumber(payload.width),
    height: optionalNumber(payload.height),
    duration: optionalNumber(payload.duration),
    ...(input.source === 'import' ? { role: 'controller-import' } : {}),
    createdAt: new Date().toISOString(),
  };
}
