import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { LocalCapturesView } from './session/LocalCapturesView';
import { SessionDetails } from './session/SessionUI';

import { useMediaViewer } from '@/components/MediaViewer';
import { CaptureUploadControls } from '@/components/CaptureUploadControls';
import { LocalMediaActions } from '@/components/LocalMediaActions';
import { captureCatalogId } from '@/services/mediaCatalog';
import { getLocalCaptures, verifyLocalCapture } from '@/services/localCaptures';
import type { LocalCapture } from '@/types/capture';
import type { Session } from '@/services/sessionProtocol';

export function LocalCapturesPanel({ sessionId, deviceId, busy, session }: { sessionId: string; deviceId: string; busy: boolean; session?: Session }) {
  const [captures, setCaptures] = useState<LocalCapture[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const { open, close, viewer } = useMediaViewer(!busy);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (sessionId && deviceId) void getLocalCaptures(sessionId, deviceId).then((result) => {
      if (active) { setCaptures(result.captures); setProblems(result.problems); }
    }).catch((error: unknown) => { if (active) setProblems([error instanceof Error ? error.message : 'No se pudieron leer las capturas.']); });
    return () => { active = false; };
  }, [sessionId, deviceId]));
  return <><LocalCapturesView captures={captures} problems={problems} busy={busy} session={session}
    onPlay={(capture) => {
      open(capture.photoId ? 'image' : 'video', async () => (await verifyLocalCapture(capture)).localUri);
    }}
    renderUpload={(capture) => <>
      <CaptureUploadControls id={captureCatalogId(capture)} disabled={busy} compact />
      <SessionDetails title="Opciones del original"><LocalMediaActions id={captureCatalogId(capture)} disabled={busy} onDeleted={() => {
        close();
        setCaptures((current) => current.filter((item) => item.id !== capture.id));
      }} /></SessionDetails>
    </>} />{viewer}</>;
}
