import { useIsFocused } from '@react-navigation/native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { LocalVideoPlayer } from '@/components/LocalVideoPlayer';
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
  return <View style={styles.panel}>
    <ThemedText type="subtitle">Vídeos locales de este dispositivo</ThemedText>
    <ThemedText>Originales silenciados conservados en la aplicación. No se suben al Controller ni a Cloudinary.</ThemedText>
    {captures.length === 0 && <ThemedText>No hay vídeos locales verificados en esta Session.</ThemedText>}
    {problems.map((problem, index) => <ThemedText key={index}>{problem}</ThemedText>)}
    {captures.map((capture) => <View key={capture.id} style={styles.panel}>
      <ThemedText>{new Date(capture.createdAt).toLocaleString()} · {(capture.bytes / 1024 / 1024).toFixed(2)} MB</ThemedText>
      <ThemedText selectable>Node: {capture.nodeId}</ThemedText>
      <ThemedText selectable>takeId: {capture.takeId ?? 'clip manual H1'}</ThemedText>
      <ThemedText selectable>{capture.localUri}</ThemedText>
      <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => {
        void verifyLocalCapture(capture).then(setSelected).catch((error: unknown) => setProblems([error instanceof Error ? error.message : 'Archivo no disponible.']));
      }}><ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">REPRODUCIR VÍDEO LOCAL</ThemedText></Pressable>
    </View>)}
    {selected && focused && !busy && <>
      <LocalVideoPlayer key={selected.id} uri={selected.localUri} />
      <Pressable accessibilityRole="button" onPress={() => setSelected(null)}><ThemedText>CERRAR REPRODUCTOR</ThemedText></Pressable>
    </>}
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 10 }, video: { width: '100%', height: 240 }, button: { backgroundColor: '#474FE7', borderRadius: 12, padding: 14, alignItems: 'center' } });
