import * as ImagePicker from 'expo-image-picker';
import { router, type Href, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MediaAssetCard, formatBytes } from '@/components/MediaAssetCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { connectionLabel, sessionErrorMessage, useStudioSession } from '@/hooks/use-studio-session';
import { uploadMediaAsset } from '@/services/cloudinary';
import { getMediaAssetsBySession, saveMediaAsset } from '@/services/mediaCatalog';
import { connectSocket } from '@/services/socket';
import type { JoinRequest } from '@/services/sessionProtocol';
import type { NexusMediaAsset } from '@/types/media';

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
type UploadState = 'idle' | 'selected' | 'uploading' | 'success' | 'error';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la importación.';
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Array.isArray(id) ? id[0] : id;
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [status, setStatus] = useState<UploadState>('idle');
  const [message, setMessage] = useState('Selecciona una imagen o video para comenzar.');
  const [media, setMedia] = useState<NexusMediaAsset[]>([]);
  const [lastSaved, setLastSaved] = useState<NexusMediaAsset | null>(null);
  const [sessionNotice, setSessionNotice] = useState('Consultando la sesión en el relay…');
  const [verified, setVerified] = useState(false);
  const [sessionFailed, setSessionFailed] = useState(false);
  const [deciding, setDeciding] = useState<Record<string, string>>({});
  const decisions = useRef<Record<string, string>>({});
  const refreshId = useRef<string | null>(null);
  const { service, snapshot, deviceId, error: serviceError } = useStudioSession((next) => {
    if (next.connection !== 'Connected') {
      refreshId.current = null;
      decisions.current = {};
      setDeciding({});
      setVerified(false);
      setSessionFailed(true);
      setSessionNotice('Sin conexión al relay. La membresía no está confirmada; al reconectar puede ser necesario solicitar ingreso de nuevo.');
      return;
    }
    const event = next.lastEvent;
    if (!event || event.sessionId !== sessionId) return;
    const decisionDevice = Object.keys(decisions.current).find((id) => decisions.current[id] === event.payload.requestId);
    if (decisionDevice) {
      delete decisions.current[decisionDevice];
      setDeciding({ ...decisions.current });
    }
    if (event.type === 'SESSION_CLOSED') {
      setVerified(false);
      setSessionFailed(true);
      setSessionNotice('El Controller se desconectó. Esta sesión se cerró; los medios locales siguen disponibles.');
    } else if (event.type === 'SESSION_ERROR' && (event.payload.requestId === refreshId.current || decisionDevice)) {
      if (event.payload.requestId === refreshId.current) {
        refreshId.current = null;
        setVerified(false);
      }
      setSessionFailed(true);
      setSessionNotice(sessionErrorMessage(event.payload.code));
    } else if (event.type === 'SESSION_SNAPSHOT' && event.payload.requestId === refreshId.current) {
      refreshId.current = null;
      setVerified(true);
      setSessionFailed(false);
      setSessionNotice('Sesión confirmada por el relay.');
    } else if (event.type === 'SESSION_SNAPSHOT' && decisionDevice) {
      setSessionFailed(false);
      setSessionNotice('Decisión confirmada por el relay.');
    }
  });
  const connected = snapshot?.connection === 'Connected';
  const session = verified ? snapshot?.sessions[sessionId] : undefined;
  const isController = session?.controllerId === deviceId;

  const refresh = useCallback(() => {
    setVerified(false);
    setSessionFailed(false);
    setSessionNotice('Consultando la sesión en el relay…');
    try {
      if (!service || !connected) throw new Error('SOCKET_NOT_CONNECTED');
      refreshId.current = service.refreshSession(sessionId);
    } catch (cause) {
      setSessionFailed(true);
      setSessionNotice(sessionErrorMessage(cause));
    }
  }, [service, connected, sessionId]);

  useFocusEffect(useCallback(() => {
    if (service && sessionId) refresh();
    return () => { refreshId.current = null; };
  }, [refresh, service, sessionId]));

  const decide = (request: JoinRequest, accept: boolean) => {
    if (!service || !isController || decisions.current[request.deviceId]) return;
    try {
      const messageId = accept
        ? service.acceptJoin(sessionId, request.deviceId, request.requestId)
        : service.rejectJoin(sessionId, request.deviceId, request.requestId);
      decisions.current[request.deviceId] = messageId;
      setDeciding({ ...decisions.current });
      setSessionFailed(false);
      setSessionNotice('Esperando confirmación de la decisión…');
    } catch (cause) {
      setSessionFailed(true);
      setSessionNotice(sessionErrorMessage(cause));
    }
  };

  useEffect(() => {
    if (sessionId) void getMediaAssetsBySession(sessionId).then(setMedia);
  }, [sessionId]);

  const selectMedia = async () => {
    setLastSaved(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setStatus('error');
      setMessage('Se necesita permiso para acceder a la biblioteca de imágenes y videos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (asset.type !== 'image' && asset.type !== 'video') {
      setStatus('error');
      setMessage('El archivo seleccionado no es una imagen o video compatible.');
      return;
    }
    if (asset.fileSize === undefined) {
      setStatus('error');
      setMessage('No se pudo comprobar el tamaño del archivo. Selecciona otro medio.');
      return;
    }
    if (asset.fileSize > MAX_UPLOAD_BYTES) {
      setStatus('error');
      setMessage(`El archivo pesa ${formatBytes(asset.fileSize)}. El máximo para esta demo es 80 MB.`);
      return;
    }

    setSelected(asset);
    setStatus('selected');
    setMessage('Medio listo. Confirma para subirlo a Cloudinary.');
  };

  const uploadSelected = async () => {
    if (!selected || !sessionId || (selected.type !== 'image' && selected.type !== 'video')) return;
    if (selected.fileSize === undefined || selected.fileSize > MAX_UPLOAD_BYTES) {
      setStatus('error');
      setMessage('El tamaño del archivo ya no puede validarse para esta demo.');
      return;
    }

    setStatus('uploading');
    setMessage('Subiendo el medio a Cloudinary...');
    try {
      const saved = await uploadMediaAsset({
        uri: selected.uri,
        fileName: selected.fileName ?? `nexus-${Date.now()}.${selected.type === 'image' ? 'jpg' : 'mp4'}`,
        mimeType: selected.mimeType ?? '',
        sessionId,
        source: 'import',
        file: selected.file ?? undefined,
      });
      await saveMediaAsset(saved);
      setMedia(await getMediaAssetsBySession(sessionId));
      setLastSaved(saved);
      setSelected(null);
      setStatus('success');
      setMessage('Medio subido y registrado en el catálogo local.');
    } catch (error) {
      setStatus('error');
      setMessage(errorMessage(error));
    }
  };

  if (!sessionId) return <ThemedView style={styles.center}><ThemedText>Sesión no válida.</ThemedText></ThemedView>;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
        <Pressable onPress={() => router.back()}><ThemedText type="link">← Volver a Studio</ThemedText></Pressable>
        <ThemedView style={styles.header}>
          <ThemedText style={styles.eyebrow}>SESIÓN</ThemedText>
          <ThemedText type="title">NEXUS Studio</ThemedText>
          <ThemedText selectable style={styles.sessionId}>{sessionId}</ThemedText>
          <ThemedText selectable style={styles.sessionId}>Este dispositivo: {deviceId || 'Preparando identidad…'}</ThemedText>
          <ThemedText>Relay: {connectionLabel(snapshot?.connection)}</ThemedText>
          <ThemedText accessibilityLiveRegion="polite" style={sessionFailed || serviceError ? styles.error : styles.status}>{serviceError || sessionNotice}</ThemedText>
          {connected ? (
            <Pressable accessibilityRole="button" onPress={refresh} style={styles.secondaryButton}>
              <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">ACTUALIZAR SESIÓN</ThemedText>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={connectSocket} style={styles.secondaryButton}>
              <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">CONECTAR AL RELAY</ThemedText>
            </Pressable>
          )}
        </ThemedView>

        {session && <>
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">{isController ? 'Eres el Controller' : 'Ingreso aceptado · Eres un Node'}</ThemedText>
            <ThemedText selectable style={styles.code}>Código: {session.code}</ThemedText>
            <ThemedText>Estado de la sesión: {session.state === 'joining' ? 'Ingreso de Nodes' : session.state}</ThemedText>
          </ThemedView>
          {isController && <ThemedView style={styles.section}>
            <ThemedText type="subtitle">Solicitudes de ingreso</ThemedText>
            {(snapshot?.pending[sessionId] ?? []).length === 0 && <ThemedText>No hay solicitudes pendientes.</ThemedText>}
            {(snapshot?.pending[sessionId] ?? []).map((request) => (
              <View key={request.deviceId} style={styles.member}>
                <ThemedText>Dispositivo solicitante</ThemedText>
                <ThemedText selectable style={styles.sessionId}>{request.deviceId}</ThemedText>
                <Pressable accessibilityRole="button" accessibilityLabel={`Aceptar ${request.deviceId}`} disabled={!!deciding[request.deviceId]} onPress={() => decide(request, true)} style={[styles.primaryButton, deciding[request.deviceId] && styles.disabled]}>
                  <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">ACEPTAR</ThemedText>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Rechazar ${request.deviceId}`} disabled={!!deciding[request.deviceId]} onPress={() => decide(request, false)} style={[styles.secondaryButton, deciding[request.deviceId] && styles.disabled]}>
                  <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">RECHAZAR</ThemedText>
                </Pressable>
              </View>
            ))}
          </ThemedView>}
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">Miembros aceptados ({Object.keys(session.members).length})</ThemedText>
            {Object.values(session.members).map((member) => (
              <View key={member.deviceId} style={styles.member}>
                <ThemedText type="defaultSemiBold">{member.kind === 'controller' ? 'Controller' : 'Node'}{member.deviceId === deviceId ? ' · Este dispositivo' : ''}</ThemedText>
                <ThemedText selectable style={styles.sessionId}>deviceId: {member.deviceId}</ThemedText>
                {member.nodeId && <ThemedText selectable style={styles.sessionId}>nodeId: {member.nodeId}</ThemedText>}
              </View>
            ))}
          </ThemedView>
        </>}

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Importar medio</ThemedText>
          <ThemedText style={styles.note}>Imágenes o videos de hasta 80 MB.</ThemedText>
          {selected && (
            <View style={styles.selection}>
              {selected.type === 'image' ? (
                <Image source={{ uri: selected.uri }} style={styles.selectedPreview} />
              ) : (
                <View style={styles.video}><ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">VIDEO SELECCIONADO</ThemedText></View>
              )}
              <ThemedText type="defaultSemiBold">{selected.fileName ?? 'Medio sin nombre'}</ThemedText>
              <ThemedText>{formatBytes(selected.fileSize)}</ThemedText>
            </View>
          )}
          <ThemedText style={status === 'error' ? styles.error : styles.status}>Estado: {status} · {message}</ThemedText>
          {status !== 'uploading' && status !== 'selected' && (
            <Pressable onPress={selectMedia} style={styles.secondaryButton}>
              <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>IMPORTAR MEDIO</ThemedText>
            </Pressable>
          )}
          {status === 'selected' && (
            <View style={styles.actions}>
              <Pressable onPress={uploadSelected} style={styles.primaryButton}>
                <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>SUBIR A CLOUDINARY</ThemedText>
              </Pressable>
              <Pressable onPress={selectMedia} style={styles.secondaryButton}>
                <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>CAMBIAR MEDIO</ThemedText>
              </Pressable>
            </View>
          )}
          {status === 'uploading' && <ThemedText type="defaultSemiBold">Subiendo…</ThemedText>}
          {status === 'success' && lastSaved && (
            <View style={styles.actions}>
              <Pressable onPress={() => router.push(`/media/${lastSaved.id}` as Href)} style={styles.primaryButton}>
                <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>ABRIR DETALLE</ThemedText>
              </Pressable>
              <Pressable onPress={selectMedia} style={styles.secondaryButton}>
                <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>IMPORTAR OTRO</ThemedText>
              </Pressable>
            </View>
          )}
        </ThemedView>

        <ThemedView style={styles.mediaSection}>
          <ThemedText type="subtitle">Medios</ThemedText>
          {media.length === 0 ? <ThemedText style={styles.note}>Aún no hay medios en esta sesión.</ThemedText> : media.map((asset) => (
            <MediaAssetCard asset={asset} key={asset.id} onPress={() => router.push(`/media/${asset.id}` as Href)} />
          ))}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { alignSelf: 'center', gap: 20, maxWidth: 680, padding: 24, paddingBottom: 64, width: '100%' },
  header: { gap: 8 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 2, opacity: 0.55 },
  sessionId: { fontFamily: 'monospace', fontSize: 13, opacity: 0.68 },
  section: { borderColor: '#687076', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 12, padding: 18 },
  mediaSection: { gap: 14 },
  note: { fontSize: 13, opacity: 0.65 },
  status: { opacity: 0.78 },
  error: { color: '#D92D20' },
  code: { fontSize: 24, lineHeight: 32, fontWeight: '800' },
  member: { gap: 8, paddingVertical: 10, borderTopColor: '#687076', borderTopWidth: StyleSheet.hairlineWidth },
  disabled: { opacity: 0.5 },
  selection: { gap: 8 },
  selectedPreview: { backgroundColor: '#E4E7EC', borderRadius: 12, height: 220, width: '100%' },
  video: { alignItems: 'center', backgroundColor: '#20242A', borderRadius: 12, height: 140, justifyContent: 'center' },
  actions: { gap: 10 },
  primaryButton: { alignItems: 'center', backgroundColor: '#474FE7', borderRadius: 12, padding: 15 },
  secondaryButton: { alignItems: 'center', backgroundColor: '#48525A', borderRadius: 12, padding: 15 },
  buttonText: { fontWeight: '800' },
});
