import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { sessionErrorMessage } from '@/hooks/use-studio-session';
import type { getSessionService } from '@/services/session';

type Service = Awaited<ReturnType<typeof getSessionService>>;
export function NodeRoleEditor({ service, sessionId, deviceId, role }: { service: Service; sessionId: string; deviceId: string; role: string }) {
  const [draft, setDraft] = useState(role);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const request = useRef<string | null>(null);
  useEffect(() => { setDraft(role); }, [role]);
  useEffect(() => service.subscribe((state) => {
    if (!request.current) return;
    const event = state.lastEvent;
    if (state.connection !== 'Connected') {
      request.current = null; setBusy(false); setNotice('Sin conexión; el cambio no está confirmado.');
    } else if (event?.sessionId === sessionId && event.payload.requestId === request.current &&
        (event.type === 'SESSION_SNAPSHOT' || event.type === 'SESSION_ERROR')) {
      request.current = null; setBusy(false);
      setNotice(event.type === 'SESSION_ERROR' ? sessionErrorMessage(event.payload.code) : 'Rol confirmado por el Node (ACK).');
    }
  }), [service, sessionId]);
  return <View style={styles.panel}>
    <TextInput accessibilityLabel={`Rol de ${deviceId}`} value={draft} onChangeText={setDraft} maxLength={64} editable={!busy} style={styles.input} />
    <Pressable accessibilityRole="button" accessibilityLabel={`Asignar rol a ${deviceId}`} disabled={busy} onPress={() => {
      if (request.current) return;
      try { request.current = service.assignRole(sessionId, deviceId, draft); setBusy(true); setNotice('Esperando ACK del Node…'); }
      catch { setNotice('No se pudo enviar el rol. Usa de 1 a 64 caracteres y comprueba la conexión.'); }
    }} style={styles.button}><ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">ASIGNAR ROL</ThemedText></Pressable>
    {!!notice && <ThemedText accessibilityLiveRegion="polite">{notice}</ThemedText>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: 8 }, input: { backgroundColor: '#FFFFFF', color: '#111827', padding: 12, borderRadius: 10 },
  button: { backgroundColor: '#474FE7', borderRadius: 12, padding: 14, alignItems: 'center' },
});
