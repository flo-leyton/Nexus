import { router, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { StudioUI } from '@/constants/studio-ui';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { RejoinSessionPanel } from '@/components/RejoinSessionPanel';
import { StudioIdentityPanel } from '@/components/StudioIdentityPanel';
import { connectionLabel, sessionErrorMessage, useStudioSession } from '@/hooks/use-studio-session';
import { connectSocket } from '@/services/socket';

export default function StudioScreen() {
  const insets = useSafeAreaInsets();
  const palette = StudioUI[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('Crea una sesión o solicita ingreso con el código del Controller.');
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const operation = useRef<{ kind: 'create' | 'join'; messageId: string; sessionId?: string } | null>(null);
  const { service, snapshot, deviceId, error } = useStudioSession((next) => {
    const current = operation.current;
    const event = next.lastEvent;
    if (!current) {
      // Restore an outcome received while this screen was unmounted.
      if (event?.type === 'SESSION_JOIN_REJECTED' || event?.type === 'SESSION_CLOSED') {
        setFailed(true);
        setNotice(event.type === 'SESSION_JOIN_REJECTED'
          ? 'El Controller rechazó tu solicitud. Puedes volver a solicitar ingreso.'
          : 'El Controller cerró la Session. Solicita un código de otra Session.');
      }
      return;
    }
    if (next.connection !== 'Connected') {
      operation.current = null;
      setSending(false);
      setFailed(true);
      setNotice('Se perdió la conexión. El ingreso debe solicitarse de nuevo al reconectar.');
    } else if (event?.type === 'SESSION_JOIN_PENDING' && event.payload.requestId === current.messageId) {
      current.sessionId = event.sessionId;
      setSending(false);
      setNotice(event.payload.controllerOnline === false ? 'Solicitud guardada. El Controller está offline; podrá resolverla cuando reconecte.' : 'Solicitud pendiente. Espera a que el Controller la acepte o rechace.');
    } else if (event?.type === 'SESSION_SNAPSHOT' && (event.payload.requestId === current.messageId ||
        (current.kind === 'join' && current.sessionId === event.sessionId))) {
      operation.current = null;
      setSending(false);
      setNotice(current.kind === 'create' ? 'Sesión creada. Comparte su código y ábrela para aceptar Nodes.' : 'Ingreso aceptado. Ya puedes abrir la sesión.');
    } else if ((event?.type === 'SESSION_ERROR' || event?.type === 'SESSION_JOIN_REJECTED') &&
        event.payload.requestId === current.messageId) {
      operation.current = null;
      setSending(false);
      setFailed(true);
      setNotice(event.type === 'SESSION_ERROR' ? sessionErrorMessage(event.payload.code) : 'El Controller rechazó tu solicitud. Puedes volver a solicitar ingreso.');
    } else if (event?.type === 'SESSION_CLOSED' && event.sessionId === current.sessionId) {
      operation.current = null;
      setSending(false);
      setFailed(true);
      setNotice('El Controller cerró la Session explícitamente. Solicita un código nuevo.');
    }
  });
  const connected = snapshot?.connection === 'Connected';
  const pending = Object.entries(snapshot?.pending ?? {}).filter(([, requests]) => requests.some((r) => r.deviceId === deviceId));
  const busy = sending || pending.length > 0 || !!snapshot?.joinInFlight;

  const start = (kind: 'create' | 'join') => {
    if (operation.current || busy) return;
    setFailed(false);
    try {
      if (!service || !connected) throw new Error('SOCKET_NOT_CONNECTED');
      if (kind === 'create') {
        operation.current = { kind, ...service.createSession() };
      } else {
        operation.current = { kind, messageId: service.requestJoin(code) };
      }
      setSending(true);
      setNotice(kind === 'create' ? 'Creando sesión en el relay…' : 'Enviando solicitud al Controller…');
    } catch (cause) {
      setFailed(true);
      setNotice(sessionErrorMessage(cause));
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 48 }]}>
        <ThemedView style={[styles.hero, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <ThemedText style={[styles.eyebrow, { color: palette.primary }]}>NEXUS / CONTROL CENTER</ThemedText>
          <ThemedText type="title" style={styles.title}>Tu estudio, conectado.</ThemedText>
          <ThemedText style={styles.tagline}>Un estudio de grabación para el bolsillo.</ThemedText>
        </ThemedView>
        <StudioIdentityPanel />
        {connected && <Pressable accessibilityRole="button" onPress={() => {
          try { service?.discoverSessions(); setNotice('Consultando tus Sessions activas persistidas…'); }
          catch (cause) { setNotice(sessionErrorMessage(cause)); }
        }} style={[styles.button, { backgroundColor: palette.primary }]}><ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">ACTUALIZAR MIS SESSIONS</ThemedText></Pressable>}
        <ThemedView style={[styles.model, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <ThemedText type="subtitle">Controller + Nodes + Session</ThemedText>
          <ThemedText>Relay: {connectionLabel(snapshot?.connection)}</ThemedText>
          <ThemedText selectable style={styles.identity}>Este dispositivo: {deviceId || 'Preparando identidad…'}</ThemedText>
          {!connected && <ThemedText style={styles.error}>{error || 'El relay no está conectado. Comprueba la URL, la red y el servidor.'}</ThemedText>}
          {!connected && <Pressable accessibilityRole="button" onPress={connectSocket} style={styles.button}>
            <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">CONECTAR AL RELAY</ThemedText>
          </Pressable>}
        </ThemedView>
        <ThemedText accessibilityLiveRegion="polite" style={failed || error ? styles.error : styles.description}>{error || notice}</ThemedText>
        {pending.length > 0 && <ThemedText accessibilityLiveRegion="polite">{pending.some(([, requests]) => requests.some((r) => r.deviceId === deviceId && r.controllerOnline === false))
          ? 'Solicitud guardada. Controller offline; podrá resolverla al reconectar.' : 'Solicitud pendiente de aceptación por el Controller.'}</ThemedText>}
        {service && snapshot && <ThemedView style={styles.model}>
          <RejoinSessionPanel service={service} snapshot={snapshot} deviceId={deviceId} />
        </ThemedView>}
        <Pressable accessibilityRole="button" disabled={busy || !service} onPress={() => start('create')} style={({ pressed }) => [styles.button, { backgroundColor: palette.primary }, busy && styles.disabled, pressed && styles.pressed]}>
          <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>NUEVA SESIÓN</ThemedText>
        </Pressable>
        <ThemedView style={styles.model}>
          <ThemedText type="subtitle">Ingresar como Node</ThemedText>
          <TextInput accessibilityLabel="Código de sesión" autoCapitalize="characters" autoCorrect={false} maxLength={6}
            editable={!busy} value={code} onChangeText={setCode} placeholder="Código de 6 caracteres" style={[styles.input, { backgroundColor: palette.surfaceRaised, borderColor: palette.border, color: palette.text }]} placeholderTextColor={palette.muted} />
          <Pressable accessibilityRole="button" disabled={busy || !service} onPress={() => start('join')} style={[styles.button, { backgroundColor: palette.primary }, busy && styles.disabled]}>
            <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>SOLICITAR INGRESO</ThemedText>
          </Pressable>
        </ThemedView>
        {Object.values(snapshot?.sessions ?? {}).map((session) => (
          <ThemedView key={session.sessionId} style={styles.model}>
            <ThemedText type="subtitle">{session.controllerId === deviceId ? 'Tu sesión · Controller' : 'Ingreso aceptado · Node'}</ThemedText>
            <ThemedText selectable style={styles.code}>Código: {session.code}</ThemedText>
            <ThemedText selectable style={styles.identity}>{session.sessionId}</ThemedText>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/session/${session.sessionId}` as Href)} style={styles.button}>
              <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>ABRIR SESIÓN</ThemedText>
            </Pressable>
          </ThemedView>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignSelf: 'center', flexGrow: 1, gap: 20, maxWidth: 560, padding: 20, paddingBottom: 64, width: '100%' },
  hero: { gap: 10, padding: 24, borderRadius: 24, borderWidth: 1 },
  eyebrow: { fontSize: 13, fontWeight: '800', letterSpacing: 4, opacity: 0.55 },
  title: { fontSize: 33, lineHeight: 39, fontWeight: '800' },
  tagline: { fontSize: 16, lineHeight: 23, opacity: 0.76 },
  model: { borderRadius: 20, borderWidth: 1, gap: 12, padding: 20 },
  description: { opacity: 0.72 },
  button: { alignItems: 'center', borderRadius: 14, padding: 16, minHeight: 52, justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.5 },
  error: { color: '#D92D20' },
  identity: { fontSize: 12 },
  code: { fontSize: 24, lineHeight: 32, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 18 },
});
