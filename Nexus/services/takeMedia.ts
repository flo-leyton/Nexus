import AsyncStorage from '@react-native-async-storage/async-storage';
import { isProtocolId, isTakeMediaAngle, type TakeMediaAngle } from './sessionProtocol';

const PREFIX = '@nexus-studio/take-media-v1/';
const writes = new Map<string, Promise<void>>();
export interface StoredTakeAngle { sessionId: string; angle: TakeMediaAngle }
function parse(text: string | null): StoredTakeAngle | null {
  try {
    const item = JSON.parse(text ?? 'null');
    return item && isProtocolId(item.sessionId) && isTakeMediaAngle(item.angle) ? item : null;
  } catch { return null; }
}
export async function saveTakeMedia(sessionId: string, angles: Record<string, TakeMediaAngle>) {
  if (!isProtocolId(sessionId)) throw new Error('Session inválida.');
  await Promise.all(Object.values(angles).map(async (angle) => {
    if (!isTakeMediaAngle(angle)) throw new Error('Referencia de vídeo inválida.');
    const key = `${PREFIX}${sessionId}/${angle.deviceId}/${angle.clipId}`;
    const task = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const text = await AsyncStorage.getItem(key), previous = parse(text);
      if (previous && previous.angle.revision > angle.revision) return;
      const next = JSON.stringify({ sessionId, angle });
      if (text !== next) await AsyncStorage.setItem(key, next);
    });
    writes.set(key, task);
    const clean = () => { if (writes.get(key) === task) writes.delete(key); };
    void task.then(clean, clean);
    await task;
  }));
}
export async function getTakeMedia(sessionId?: string): Promise<StoredTakeAngle[]> {
  await Promise.all([...writes.values()]);
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
  const result: StoredTakeAngle[] = [];
  for (const key of keys) {
    const item = parse(await AsyncStorage.getItem(key));
    if (item && (!sessionId || item.sessionId === sessionId) &&
        key === `${PREFIX}${item.sessionId}/${item.angle.deviceId}/${item.angle.clipId}`) result.push(item);
  }
  return result;
}
