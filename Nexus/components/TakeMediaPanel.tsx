import { useIsFocused } from '@react-navigation/native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { LocalVideoPlayer } from '@/components/LocalVideoPlayer';
import { getTakeMedia, type StoredTakeAngle } from '@/services/takeMedia';
import type { Session } from '@/services/sessionProtocol';

export function TakeMediaPanel({ session }: { session?: Session }) {
  const focused = useIsFocused();
  const [stored, setStored] = useState<StoredTakeAngle[]>([]);
  const [error, setError] = useState('');
  const [url, setUrl] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    setUrl(null);
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
  return <View style={styles.panel}>
    <ThemedText type="subtitle">Ángulos remotos por Take</ThemedText>
    <ThemedText>Referencias de subida comunicadas por los Nodes. No sustituyen REC ACK, STOP ACK ni el resultado histórico H2.</ThemedText>
    {!session && <ThemedText>Datos guardados en este teléfono. Abre la Session activa para consultar el relay.</ThemedText>}
    {!!error && <ThemedText>{error}</ThemedText>}
    {!groups.size && <ThemedText>Aún no hay referencias de subida recibidas.</ThemedText>}
    {[...groups].map(([key, items]) => <View key={key} style={styles.group}>
      <ThemedText selectable>Session: {items[0].sessionId}</ThemedText>
      <ThemedText selectable>takeId: {items[0].angle.takeId} · Ángulos: {items.length}</ThemedText>
      {items.map(({ angle }) => <View key={`${angle.deviceId}:${angle.clipId}`} style={styles.panel}>
        <ThemedText selectable>Node original: {angle.nodeId} · dispositivo: {angle.deviceId}</ThemedText>
        <ThemedText>Rol en la toma: {angle.role ?? 'no registrado'} · Clip: {angle.clipId}</ThemedText>
        <ThemedText>Subida: {{ local: 'sólo local', queued: 'pendiente', uploading: 'subiendo', uploaded: 'confirmada', failed: 'error', uncertain: 'sin confirmar' }[angle.upload.state]}</ThemedText>
        {(angle.upload.state === 'failed' || angle.upload.state === 'uncertain') && <ThemedText>{angle.upload.error}</ThemedText>}
        {angle.upload.state === 'uploaded' && <>
          <ThemedText selectable>{angle.upload.url}</ThemedText>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => { if (angle.upload.state === 'uploaded') setUrl(angle.upload.url); }}>
            <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">REPRODUCIR ÁNGULO REMOTO</ThemedText>
          </Pressable>
        </>}
      </View>)}
    </View>)}
    {url && focused && <LocalVideoPlayer key={url} uri={url} remote />}
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 10 }, group: { gap: 14, padding: 14, borderWidth: 1, borderRadius: 12, borderColor: '#687076' }, button: { backgroundColor: '#474FE7', borderRadius: 12, padding: 14, alignItems: 'center' } });
