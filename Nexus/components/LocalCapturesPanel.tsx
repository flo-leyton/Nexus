import { useIsFocused } from '@react-navigation/native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image } from 'react-native';
import { Button } from 'react-native-paper';
import { LocalCapturesView } from './session/LocalCapturesView';
import { sessionStyles } from './session/SessionUI';

import { LocalVideoPlayer } from '@/components/LocalVideoPlayer';
import { CaptureUploadControls } from '@/components/CaptureUploadControls';
import { LocalMediaActions } from '@/components/LocalMediaActions';
import { captureCatalogId } from '@/services/mediaCatalog';
import { getLocalCaptures, verifyLocalCapture } from '@/services/localCaptures';
import type { LocalCapture } from '@/types/capture';

export function LocalCapturesPanel({ sessionId, deviceId, busy }: { sessionId: string; deviceId: string; busy: boolean }) {
  const focused = useIsFocused();
  const [captures, setCaptures] = useState<LocalCapture[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [selected, setSelected] = useState<LocalCapture | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    setSelected(null);
    if (sessionId && deviceId) void getLocalCaptures(sessionId, deviceId).then((result) => {
      if (active) { setCaptures(result.captures); setProblems(result.problems); }
    }).catch((error: unknown) => { if (active) setProblems([error instanceof Error ? error.message : 'No se pudieron leer las capturas.']); });
    return () => { active = false; };
  }, [sessionId, deviceId]));
  return <LocalCapturesView captures={captures} problems={problems} busy={busy}
    onPlay={(capture) => {
      void verifyLocalCapture(capture).then(setSelected).catch((error: unknown) => setProblems([error instanceof Error ? error.message : 'Archivo no disponible.']));
    }}
    renderUpload={(capture) => <>
      <CaptureUploadControls id={captureCatalogId(capture)} disabled={busy} />
      <LocalMediaActions id={captureCatalogId(capture)} disabled={busy} onDeleted={() => {
        setSelected((current) => current?.id === capture.id ? null : current);
        setCaptures((current) => current.filter((item) => item.id !== capture.id));
      }} />
    </>}
    player={selected && focused && !busy && <>
      {selected.photoId ? <Image source={{ uri: selected.localUri }} resizeMode="contain" style={{ width: '100%', height: 320 }} />
        : <LocalVideoPlayer key={selected.id} uri={selected.localUri} />}
      <Button mode="text" onPress={() => setSelected(null)} contentStyle={sessionStyles.touch}>{selected.photoId ? 'Cerrar foto' : 'Cerrar reproductor'}</Button>
    </>} />;
}
