import { isJoinCode, isProtocolId, isRecord } from './sessionProtocol';

export interface LastNodeSession { sessionId: string; code: string }
interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
const KEY = '@nexus/last-node-session-v1';
export function isLastNodeSession(value: unknown): value is LastNodeSession {
  return isRecord(value) && Object.keys(value).length === 2 && isProtocolId(value.sessionId) && isJoinCode(value.code);
}
// A convenience hint, never an authorization credential or a cached membership.
export function createLastNodeSessionStore(storage: Storage) {
  let writes = Promise.resolve();
  return {
    async load(): Promise<LastNodeSession | null> {
      await writes;
      const raw = await storage.getItem(KEY);
      if (!raw) return null;
      try { const value: unknown = JSON.parse(raw); return isLastNodeSession(value) ? value : null; }
      catch { return null; }
    },
    save(value: LastNodeSession | null): Promise<void> {
      if (value !== null && !isLastNodeSession(value)) return Promise.reject(new Error('Última sesión no válida.'));
      const task = writes.then(() => value ? storage.setItem(KEY, JSON.stringify(value)) : storage.removeItem(KEY));
      writes = task.catch(() => {}); // keep later saves usable after a storage error
      return task;
    },
  };
}
