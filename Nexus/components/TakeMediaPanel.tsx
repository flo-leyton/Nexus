import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { TakeMediaView } from './session/TakeMediaView';
import { useMediaViewer } from '@/components/MediaViewer';
import { getTakeMedia, type StoredTakeAngle } from '@/services/takeMedia';
import type { Session } from '@/services/sessionProtocol';

export function TakeMediaPanel({ session }: { session?: Session }) {
  const [stored, setStored] = useState<StoredTakeAngle[]>([]);
  const [error, setError] = useState('');
  const { open, viewer } = useMediaViewer();
  useFocusEffect(useCallback(() => {
    let active = true;
    void getTakeMedia(session?.sessionId).then((items) => { if (active) setStored(items); })
      .catch(() => { if (active) setError('No se pudieron leer los ángulos persistidos.'); });
    return () => { active = false; };
  }, [session?.sessionId]));
  const all = new Map(stored.map((item) => [`${item.sessionId}:${item.angle.deviceId}:${item.angle.clipId}`, item]));
  if (session) for (const angle of Object.values(session.mediaAngles ?? {})) {
    const key = `${session.sessionId}:${angle.deviceId}:${angle.clipId}`;
    if ((all.get(key)?.angle.revision ?? -1) <= angle.revision) all.set(key, { sessionId: session.sessionId, angle });
  }
  const groups = new Map<string, StoredTakeAngle[]>();
  for (const item of all.values()) {
    const key = `${item.sessionId}:${item.angle.takeId}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return <><TakeMediaView groups={groups} session={session} error={error}
    onPlay={({ upload }) => { if (upload.state === 'uploaded') open('video', async () => upload.url, true); }} />{viewer}</>;
}
