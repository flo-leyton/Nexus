import * as FileSystem from 'expo-file-system/legacy';
import { isProtocolId, isRecord } from './sessionProtocol';
import type { LocalCapture, LocalCaptureDraft } from '../types/capture';

// One sidecar per clip, separate from the existing imported-media catalog.
function folder(sessionId: string, deviceId: string, id?: string) {
  if (![sessionId, deviceId, ...(id ? [id] : [])].every(isProtocolId)) throw new Error('Identificador de captura inválido.');
  if (!FileSystem.documentDirectory) throw new Error('El almacenamiento persistente de vídeo requiere Android o iOS.');
  return `${FileSystem.documentDirectory}nexus-captures/${sessionId}/${deviceId}/${id ? `${id}/` : ''}`;
}
function hasBytes(info: FileSystem.FileInfo): info is FileSystem.FileInfo & { exists: true; size: number } {
  return info.exists && !info.isDirectory && Number.isFinite(info.size) && info.size > 0;
}
function validCaptureFile(capture: { fileName?: unknown; resourceType?: unknown; id?: unknown; photoId?: unknown; takeId?: unknown }) {
  if (capture.fileName === 'photo.jpg') return capture.resourceType === 'image' && isProtocolId(capture.photoId) &&
    capture.photoId === capture.id && capture.takeId === null;
  return ['video.mp4', 'video.mov'].includes(String(capture.fileName)) &&
    (capture.resourceType === undefined || capture.resourceType === 'video') && capture.photoId === undefined;
}
export async function verifyLocalCapture(capture: LocalCapture) {
  if (!validCaptureFile(capture)) throw new Error('Formato local no válido.');
  const uri = `${folder(capture.sessionId, capture.deviceId, capture.id)}${capture.fileName}`;
  const info = await FileSystem.getInfoAsync(uri);
  if (!hasBytes(info) || info.size !== capture.bytes) throw new Error('El archivo local falta, está vacío o quedó incompleto.');
  // Resolve from the current documentDirectory: iOS can change the container path on reinstall/update.
  return { ...capture, localUri: uri };
}
export async function hasLocalCaptureSidecar(capture: Pick<LocalCapture, 'sessionId' | 'deviceId' | 'id'>) {
  return (await FileSystem.getInfoAsync(`${folder(capture.sessionId, capture.deviceId, capture.id)}capture.json`)).exists;
}
export async function deleteLocalCapture(capture: Pick<LocalCapture, 'sessionId' | 'deviceId' | 'nodeId' | 'id'>) {
  const directory = folder(capture.sessionId, capture.deviceId, capture.id);
  if (!(await FileSystem.getInfoAsync(directory)).exists) return;
  const raw: unknown = JSON.parse(await FileSystem.readAsStringAsync(`${directory}capture.json`));
  if (!isRecord(raw) || raw.id !== capture.id || raw.sessionId !== capture.sessionId ||
      raw.deviceId !== capture.deviceId || raw.nodeId !== capture.nodeId) throw new Error('No se pudo verificar la identidad del archivo.');
  await FileSystem.deleteAsync(directory, { idempotent: true });
}
export async function persistLocalCapture(draft: LocalCaptureDraft, temporaryUri: string): Promise<LocalCapture> {
  const fileName = /\.mov(?:[?#]|$)/i.test(temporaryUri) ? 'video.mov' : 'video.mp4';
  return persistCapture(draft, temporaryUri, fileName);
}
export async function persistLocalPhoto(draft: LocalCaptureDraft, temporaryUri: string): Promise<LocalCapture> {
  if (draft.takeId !== null) throw new Error('Una foto requiere un identificador propio.');
  return persistCapture(draft, temporaryUri, 'photo.jpg');
}
async function persistCapture(draft: LocalCaptureDraft, temporaryUri: string, fileName: LocalCapture['fileName']): Promise<LocalCapture> {
  const directory = folder(draft.sessionId, draft.deviceId, draft.id);
  if (!isProtocolId(draft.nodeId) || !temporaryUri.startsWith('file://')) throw Object.assign(new Error('La cámara no devolvió un archivo local válido.'), { code: 'CAPTURE_SOURCE_INVALID' });
  const source = await FileSystem.getInfoAsync(temporaryUri);
  if (!hasBytes(source)) throw Object.assign(new Error('El archivo temporal no existe o está vacío.'), { code: 'CAPTURE_SOURCE_INVALID' });
  const capture: LocalCapture = { ...draft, fileName, localUri: `${directory}${fileName}`, bytes: source.size,
    ...(fileName === 'photo.jpg' ? { resourceType: 'image', photoId: draft.id } as const : {}) };
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  // Identity and expected length are durable before copying. A restart can discover a
  // completed copy without a shared read/modify/write index or a final metadata write.
  await FileSystem.writeAsStringAsync(`${directory}capture.json`, JSON.stringify(capture));
  const existing = await FileSystem.getInfoAsync(capture.localUri);
  if (!hasBytes(existing) || existing.size !== source.size) {
    if (existing.exists) await FileSystem.deleteAsync(capture.localUri); // only this clip's incomplete destination
    await FileSystem.copyAsync({ from: temporaryUri, to: capture.localUri });
  }
  const verified = await verifyLocalCapture(capture);
  // Never remove the camera original until the durable copy and sidecar are valid.
  if (temporaryUri !== verified.localUri) {
    try { await FileSystem.deleteAsync(temporaryUri, { idempotent: true }); } catch { /* A cache duplicate is harmless. */ }
  }
  return verified;
}
export async function getLocalCaptures(sessionId: string, deviceId: string): Promise<{ captures: LocalCapture[]; problems: string[] }> {
  const directory = folder(sessionId, deviceId);
  if (!(await FileSystem.getInfoAsync(directory)).exists) return { captures: [], problems: [] };
  const captures: LocalCapture[] = [];
  const problems: string[] = [];
  for (const id of await FileSystem.readDirectoryAsync(directory)) {
    if (!isProtocolId(id)) continue;
    try {
      const raw: unknown = JSON.parse(await FileSystem.readAsStringAsync(`${directory}${id}/capture.json`));
      if (!isRecord(raw) || raw.id !== id || raw.sessionId !== sessionId || raw.deviceId !== deviceId ||
          !isProtocolId(raw.nodeId) || !(raw.takeId === null || isProtocolId(raw.takeId)) || raw.audio !== false || typeof raw.createdAt !== 'string' ||
          typeof raw.bytes !== 'number' || raw.bytes <= 0 || !validCaptureFile(raw)) throw new Error('Metadatos incompletos');
      captures.push(await verifyLocalCapture(raw as unknown as LocalCapture));
    } catch (error) { problems.push(`Clip ${id}: ${error instanceof Error ? error.message : 'no se pudo verificar'}`); }
  }
  return { captures: captures.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), problems };
}

export interface PersistedCaptureEntry {
  capture: LocalCapture;
  available: boolean;
  error: string | null;
}

// Scan only this app's persistent files. A sidecar is metadata, not proof that
// copying finished or that the relay received a RECORDING_STATE report.
export async function scanLocalCaptures(): Promise<{ entries: PersistedCaptureEntry[]; problems: string[] }> {
  const entries: PersistedCaptureEntry[] = [];
  const problems: string[] = [];
  if (!FileSystem.documentDirectory) return { entries, problems }; // imported media remain usable on web
  const root = `${FileSystem.documentDirectory}nexus-captures/`;
  try {
    if (!(await FileSystem.getInfoAsync(root)).exists) return { entries, problems };
    for (const sessionId of await FileSystem.readDirectoryAsync(root)) {
      if (!isProtocolId(sessionId)) continue;
      try {
        for (const deviceId of await FileSystem.readDirectoryAsync(`${root}${sessionId}/`)) {
          if (!isProtocolId(deviceId)) continue;
          try {
            const directory = folder(sessionId, deviceId);
            for (const id of await FileSystem.readDirectoryAsync(directory)) {
              if (!isProtocolId(id)) continue;
              try {
                const raw: unknown = JSON.parse(await FileSystem.readAsStringAsync(`${directory}${id}/capture.json`));
                if (!isRecord(raw) || raw.id !== id || raw.sessionId !== sessionId || raw.deviceId !== deviceId ||
                    !isProtocolId(raw.nodeId) || !(raw.takeId === null || isProtocolId(raw.takeId)) || raw.audio !== false ||
                    typeof raw.createdAt !== 'string' || typeof raw.bytes !== 'number' || !Number.isFinite(raw.bytes) || raw.bytes <= 0 ||
                    !validCaptureFile(raw)) throw new Error('Metadatos incompletos');
                const capture = { ...raw, localUri: `${directory}${id}/${raw.fileName}` } as unknown as LocalCapture;
                try { entries.push({ capture: await verifyLocalCapture(capture), available: true, error: null }); }
                catch (error) { entries.push({ capture, available: false, error: error instanceof Error ? error.message : 'Archivo no disponible' }); }
              } catch (error) { problems.push(`Clip ${id}: ${error instanceof Error ? error.message : 'no se pudo leer'}`); }
            }
          } catch { problems.push(`No se pudieron leer las capturas de ${sessionId}/${deviceId}.`); }
        }
      } catch { problems.push(`No se pudieron leer las capturas de la sesión ${sessionId}.`); }
    }
  } catch { problems.push('No se pudo explorar el almacenamiento local de capturas.'); }
  return { entries, problems };
}
