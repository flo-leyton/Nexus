import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { sessionErrorMessage } from '@/hooks/use-studio-session';
import type { getSessionService } from '@/services/session';
import type { SessionSnapshot } from '@/services/sessionClient';

type Service = Awaited<ReturnType<typeof getSessionService>>;
export function RejoinSessionPanel({ service, snapshot, deviceId, blocked = false }: {
  service: Service; snapshot: SessionSnapshot; deviceId: string; blocked?: boolean;
}) {
  const request = useRef<string | null>(null);
  const target = useRef<string | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let connectedBefore = service.getSnapshot().connection === 'Connected';
    return service.subscribe((state) => {
    if (state.connection !== 'Connected') { connectedBefore = false; request.current = null; setNotice('Conecta al relay y vuelve a solicitar reingreso.'); return; }
    if (!connectedBefore) { connectedBefore = true; setNotice('Conexión recuperada. Solicita reingreso con una nueva aprobación.'); }
    if (!request.current) return;
    const event = state.lastEvent;
    if (!event) return;
    if (event.type === 'SESSION_SNAPSHOT' && event.sessionId === target.current && event.payload.session.members[deviceId]?.kind === 'node') {
      request.current = null; setNotice('Reingreso aceptado por el Controller. Abre la sesión para preparar la cámara.');
    } else if (event.payload.requestId === request.current) {
      if (event.type === 'SESSION_JOIN_PENDING') setNotice('Solicitud enviada. Espera una nueva aprobación del Controller.');
      if (event.type === 'SESSION_JOIN_REJECTED' || event.type === 'SESSION_ERROR') {
        request.current = null;
        setNotice(event.type === 'SESSION_ERROR' ? sessionErrorMessage(event.payload.code) : 'El Controller rechazó el reingreso. Puedes solicitarlo otra vez o usar otro código.');
      }
    } else if (event.type === 'SESSION_CLOSED' && !state.lastNodeSession) {
      request.current = null; setNotice('La sesión finalizó. Ingresa a otra mediante su código.');
    }
    });
  }, [service, deviceId]);
  const last = snapshot.lastNodeSession;
  const isMember = last && !!snapshot.sessions[last.sessionId]?.members[deviceId];
  const connected = snapshot.connection === 'Connected';
  const disabled = !connected || snapshot.joinInFlight || blocked;
  if (!last || isMember) return notice || snapshot.historyError ? <View style={styles.panel}>
    {!!notice && <ThemedText accessibilityLiveRegion="polite">{notice}</ThemedText>}
    {!!snapshot.historyError && <ThemedText>{snapshot.historyError}</ThemedText>}
  </View> : null;
  return <View style={styles.panel}>
    <ThemedText type="subtitle">Última sesión como Node</ThemedText>
    <ThemedText selectable>{last.sessionId}</ThemedText>
    <ThemedText>Recordarla no autoriza el ingreso. El Controller debe aceptarte otra vez.</ThemedText>
    {snapshot.joinInFlight && <ThemedText>Solicitud pendiente de aceptación por el Controller.</ThemedText>}
    {!connected && <ThemedText>Conecta al relay para solicitar reingreso sin escribir el código.</ThemedText>}
    {blocked && <ThemedText>Detén y guarda la captura local antes de solicitar una nueva participación.</ThemedText>}
    <Pressable accessibilityRole="button" disabled={disabled} style={[styles.button, disabled && styles.disabled]} onPress={() => {
      if (request.current || service.getSnapshot().joinInFlight) return;
      try { target.current = last.sessionId; request.current = service.requestRejoin(); setNotice('Enviando solicitud de reingreso…'); }
      catch (error) { setNotice(sessionErrorMessage(error)); }
    }}><ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">SOLICITAR REINGRESO</ThemedText></Pressable>
    {!!notice && <ThemedText accessibilityLiveRegion="polite">{notice}</ThemedText>}
    {!!snapshot.historyError && <ThemedText>{snapshot.historyError}</ThemedText>}
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 10 }, button: { padding: 14, borderRadius: 12, backgroundColor: '#474FE7' }, disabled: { opacity: 0.45 } });
