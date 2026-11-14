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
export async function verifyLocalCapture(capture: LocalCapture) {
  if (!['video.mp4', 'video.mov'].includes(capture.fileName)) throw new Error('Formato local no válido.');
  const uri = `${folder(capture.sessionId, capture.deviceId, capture.id)}${capture.fileName}`;
  const info = await FileSystem.getInfoAsync(uri);
  if (!hasBytes(info) || info.size !== capture.bytes) throw new Error('El vídeo local falta, está vacío o quedó incompleto.');
  // Resolve from the current documentDirectory: iOS can change the container path on reinstall/update.
  return { ...capture, localUri: uri };
}
export async function persistLocalCapture(draft: LocalCaptureDraft, temporaryUri: string): Promise<LocalCapture> {
  const directory = folder(draft.sessionId, draft.deviceId, draft.id);
  if (!isProtocolId(draft.nodeId) || !temporaryUri.startsWith('file://')) throw Object.assign(new Error('La cámara no devolvió un vídeo local válido.'), { code: 'CAPTURE_SOURCE_INVALID' });
  const source = await FileSystem.getInfoAsync(temporaryUri);
  if (!hasBytes(source)) throw Object.assign(new Error('El vídeo temporal no existe o está vacío. Graba otro clip.'), { code: 'CAPTURE_SOURCE_INVALID' });
  const fileName = /\.mov(?:[?#]|$)/i.test(temporaryUri) ? 'video.mov' : 'video.mp4';
  const capture: LocalCapture = { ...draft, fileName, localUri: `${directory}${fileName}`, bytes: source.size };
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
          !isProtocolId(raw.nodeId) || raw.takeId !== null || raw.audio !== false || typeof raw.createdAt !== 'string' ||
          typeof raw.bytes !== 'number' || raw.bytes <= 0 || !['video.mp4', 'video.mov'].includes(String(raw.fileName))) throw new Error('Metadatos incompletos');
      captures.push(await verifyLocalCapture(raw as unknown as LocalCapture));
    } catch (error) { problems.push(`Clip ${id}: ${error instanceof Error ? error.message : 'no se pudo verificar'}`); }
  }
  return { captures: captures.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), problems };
}
