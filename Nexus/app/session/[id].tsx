import * as ImagePicker from 'expo-image-picker';
import { useIsFocused, usePreventRemove } from '@react-navigation/native';
import { router, type Href, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from 'react-native-paper';

import { formatBytes } from '@/components/MediaAssetCard';
import { SessionPage } from '@/components/session/SessionPage';
import { SessionSection, SessionDetails, sessionStyles, sessionStateLabel } from '@/components/session/SessionUI';
import { SessionAdmissionView, SessionCloseView } from '@/components/session/SessionAdmissionView';
import { SessionImportView } from '@/components/session/SessionImportView';
import { SessionImportedMediaRow } from '@/components/session/SessionImportedMediaRow';
import { NodeReadinessPanel } from '@/components/NodeReadinessPanel';
import { NodeRoleEditor } from '@/components/NodeRoleEditor';
import { SessionHeader } from '@/components/session/SessionHeader';
import { SessionMemberRow } from '@/components/session/SessionMemberRow';
import { LocalCapturesPanel } from '@/components/LocalCapturesPanel';
import { ControllerTakePanel } from '@/components/ControllerTakePanel';
import { TakeMediaPanel } from '@/components/TakeMediaPanel';
import { RejoinSessionPanel } from '@/components/RejoinSessionPanel';
import { connectionLabel, sessionErrorMessage, useStudioSession } from '@/hooks/use-studio-session';
import { uploadMediaAsset } from '@/services/cloudinary';
import { getMediaAssetsBySession, saveMediaAsset } from '@/services/mediaCatalog';
import { connectSocket } from '@/services/socket';
import { activeTakes, type JoinRequest } from '@/services/sessionProtocol';
import type { RemoteMediaAsset } from '@/types/media';
import type { CaptureIdentity } from '@/types/capture';

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
  const [media, setMedia] = useState<RemoteMediaAsset[]>([]);
  const [lastSaved, setLastSaved] = useState<RemoteMediaAsset | null>(null);
  const [sessionNotice, setSessionNotice] = useState('Consultando la sesión en el relay…');
  const [verified, setVerified] = useState(false);
  const [sessionFailed, setSessionFailed] = useState(false);
  const [confirmSessionClose, setConfirmSessionClose] = useState(false);
  const [closingSession, setClosingSession] = useState(false);
  const closeRequest = useRef<{ stopIds: string[]; closeId?: string } | null>(null);
  const [closedSessionId, setClosedSessionId] = useState<string | null>(null);
  const focused = useIsFocused();
  const [deciding, setDeciding] = useState<Record<string, string>>({});
  const decisions = useRef<Record<string, string>>({});
  const refreshId = useRef<string | null>(null);
  const [localNode, setLocalNode] = useState<(CaptureIdentity & { controllerId: string }) | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureRevision, setCaptureRevision] = useState(0);
  const captureSaved = useCallback(() => setCaptureRevision((revision) => revision + 1), []);
  usePreventRemove(captureBusy, () => Alert.alert('Captura local en curso', 'Detén la grabación y espera al guardado. Si falló, pulsa REINTENTAR GUARDADO.'));
  const { service, snapshot, deviceId, error: serviceError } = useStudioSession((next) => {
    if (next.connection !== 'Connected') {
      closeRequest.current = null;
      setClosingSession(false);
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
    if (event.type === 'SESSION_CLOSED' || (event.type === 'SESSION_ERROR' && event.payload.code === 'SESSION_IS_CLOSED')) {
      closeRequest.current = null;
      setClosingSession(false);
      setClosedSessionId(sessionId);
      setVerified(false);
      setSessionFailed(true);
      setSessionNotice('El Controller cerró explícitamente la Session. Su historial y los originales se conservan.');
    } else if (event.type === 'SESSION_ERROR' && (event.payload.requestId === refreshId.current || decisionDevice ||
        closeRequest.current?.stopIds.includes(event.payload.requestId) || event.payload.requestId === closeRequest.current?.closeId)) {
      if (closeRequest.current?.stopIds.includes(event.payload.requestId) || event.payload.requestId === closeRequest.current?.closeId) {
        closeRequest.current = null;
        setClosingSession(false);
      }
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
    } else if (event.type === 'SESSION_SNAPSHOT' && event.payload.session.members[deviceId]?.kind === 'node' && event.payload.session.members[deviceId]?.online !== false && !verified && !refreshId.current) {
      // A new Controller approval is authoritative even if this screen survived the disconnect.
      setVerified(true);
      setSessionFailed(false);
      setSessionNotice('Reingreso aceptado por el Controller. Prepara la nueva participación.');
    }
  });
  const connected = snapshot?.connection === 'Connected';
  const session = verified ? snapshot?.sessions[sessionId] : undefined;
  const isController = session?.controllerId === deviceId;
  const sessionClosed = closedSessionId === sessionId;
  useEffect(() => {
    if (sessionClosed && focused && !captureBusy) router.dismissTo('/(tabs)');
  }, [sessionClosed, focused, captureBusy]);

  useEffect(() => {
    if (!closingSession) return;
    const timer = setTimeout(() => {
      closeRequest.current = null;
      setClosingSession(false);
      setSessionNotice('Cierre sin confirmar. Actualiza la sesión. Revisa los guardados pendientes y usa STOP local si hace falta.');
    }, 60_000);
    return () => clearTimeout(timer);
  }, [closingSession]);

  useEffect(() => {
    const request = closeRequest.current;
    if (!closingSession || !request || request.closeId || !service || !connected || !session || activeTakes(session).length) return;
    try {
      request.closeId = service.closeSession(sessionId);
      setSessionNotice('Guardando cierre de sesión en el relay…');
    } catch (cause) {
      closeRequest.current = null;
      setClosingSession(false);
      setSessionNotice(sessionErrorMessage(cause));
    }
  }, [closingSession, connected, service, session, sessionId]);
  useEffect(() => {
    const member = session?.members[deviceId];
    if (!captureBusy && member?.kind === 'node' && member.nodeId &&
        (localNode?.sessionId !== sessionId || localNode?.nodeId !== member.nodeId)) {
      setLocalNode({ sessionId, deviceId, nodeId: member.nodeId, controllerId: session!.controllerId });
    }
  }, [session, sessionId, deviceId, localNode, captureBusy]);

  const refresh = useCallback(() => {
    if (sessionClosed) return;
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
  }, [service, connected, sessionId, sessionClosed]);

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
    if (sessionId) void getMediaAssetsBySession(sessionId).then((items) => setMedia(items.filter((asset) => asset.storage === 'remote')));
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
      setMedia((await getMediaAssetsBySession(sessionId)).filter((asset) => asset.storage === 'remote'));
      setLastSaved(saved);
      setSelected(null);
      setStatus('success');
      setMessage('Medio subido y registrado en el catálogo local.');
    } catch (error) {
      setStatus('error');
      setMessage(errorMessage(error));
    }
  };

  if (!sessionId) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Sesión no válida.</Text></View>;

  return <SessionPage topInset={insets.top} onBack={() => router.back()}
    header={<SessionHeader sessionId={sessionId} deviceId={deviceId} code={session?.code}
      role={session ? isController ? 'Controller' : 'Node' : undefined} compact={!!localNode && localNode.sessionId === sessionId}
      connected={connected} connectionLabel={connectionLabel(snapshot?.connection)}
      notice={serviceError || sessionNotice} error={sessionFailed || !!serviceError} onRefresh={refresh} onConnect={connectSocket} />}
    capture={localNode && localNode.sessionId === sessionId && service && <NodeReadinessPanel key={localNode.nodeId} service={service} {...localNode}
      accepted={session?.members[deviceId]?.nodeId === localNode.nodeId && session?.members[deviceId]?.online !== false && session?.state !== 'closed'}
      sessionClosed={sessionClosed} onBusyChange={setCaptureBusy} onSaved={captureSaved} />}
    members={session && <SessionSection title={isController ? 'Dispositivos de la sesión' : 'Participación'}>
      <Text variant="bodyMedium">Estado de la sesión: {sessionStateLabel[session.state]}</Text>
      {isController ? <>
        <Text variant="bodyMedium">Nodes online: {Object.values(session.members).filter((member) => member.kind === 'node' && member.online !== false).length} / {Object.values(session.members).filter((member) => member.kind === 'node').length} aceptados</Text>
        {!Object.values(session.members).some((member) => member.kind === 'node') && <Text variant="bodyMedium">Comparte el código de sesión y acepta las solicitudes para incorporar Nodes.</Text>}
        {Object.values(session.members).filter((member) => member.kind === 'node').map((member) => <View key={member.deviceId} style={{ paddingVertical: 12 }}>
          <SessionMemberRow member={member} connected={connected} isSelf={member.deviceId === deviceId}>
            {member.kind === 'node' && service && member.online !== false && session.state !== 'closed' && <NodeRoleEditor compact service={service} sessionId={sessionId} deviceId={member.deviceId} role={member.role} />}
          </SessionMemberRow>
        </View>)}
        <SessionDetails title="Controller de la sesión">
          {Object.values(session.members).filter((member) => member.kind === 'controller').map((member) =>
            <SessionMemberRow key={member.deviceId} member={member} connected={connected} isSelf={member.deviceId === deviceId} />)}
        </SessionDetails>
      </> : <>
        <Text variant="bodyMedium">Ingreso aceptado · Node · rol: {session.members[deviceId]?.role}</Text>
        {session.members[deviceId]?.online === false && <Button mode="contained-tonal" disabled={captureBusy} onPress={() => {
          try { refreshId.current = service!.resumeSession(sessionId); setSessionNotice('Verificando y reanudando participación…'); }
          catch (cause) { setSessionNotice(sessionErrorMessage(cause)); }
        }} contentStyle={sessionStyles.touch}>Reanudar participación · conservar rol</Button>}
        <SessionDetails title="Miembros aceptados">
          {Object.values(session.members).map((member) => <SessionMemberRow key={member.deviceId} member={member} connected={connected} isSelf={member.deviceId === deviceId} />)}
        </SessionDetails>
      </>}
    </SessionSection>}
    console={isController && service && session && <ControllerTakePanel service={service} session={session} closingSession={closingSession} />}
    rejoin={(!session || session.members[deviceId]?.online === false) && service && snapshot &&
      <RejoinSessionPanel consoleMode service={service} snapshot={snapshot} deviceId={deviceId} blocked={captureBusy} />}
    admission={isController && session && <SessionAdmissionView requests={snapshot?.pending[sessionId] ?? []} deciding={deciding} onDecision={decide} />}
    media={<SessionSection title="Tomas y medios" description="Resultados de toma, originales locales y referencias remotas tienen fuentes diferentes.">
      {isController && session && <>
        {snapshot?.mediaPersistenceError && <Text variant="bodyMedium">{snapshot.mediaPersistenceError}</Text>}
        <TakeMediaPanel session={session} />
      </>}
      {!!deviceId && <LocalCapturesPanel key={`${sessionId}-${captureRevision}`} sessionId={sessionId} deviceId={deviceId} busy={captureBusy} />}
      <Text variant="titleMedium">Medios importados y disponibles</Text>
      {!media.length ? <Text variant="bodyMedium">Aún no hay medios en esta sesión.</Text> : media.map((asset) =>
        <SessionImportedMediaRow key={asset.id} asset={asset} onPress={() => router.push(`/media/${asset.id}` as Href)} />)}
    </SessionSection>}
    imports={<SessionImportView selected={selected} status={status} message={message} hasLastSaved={!!lastSaved}
      onSelect={selectMedia} onUpload={uploadSelected} onOpenLast={() => { if (lastSaved) router.push(`/media/${lastSaved.id}` as Href); }} />}
    administration={isController && service && session && session.state !== 'closed' && <SessionCloseView
      disabled={!connected || closingSession} pending={closingSession} confirming={confirmSessionClose}
      onRequest={() => setConfirmSessionClose(true)} onCancel={() => setConfirmSessionClose(false)} onConfirm={() => {
        if (!connected || closeRequest.current) return;
        const current = service.getSnapshot().sessions[sessionId];
        if (!current || current.controllerId !== deviceId) return;
        try {
          closeRequest.current = { stopIds: service.stopActiveTakes(sessionId) };
          setConfirmSessionClose(false);
          setClosingSession(true);
          setSessionFailed(false);
          if (activeTakes(current).length) setSessionNotice(
            'Cierre pendiente. Espera el guardado de los videos. Si una cámara quedó desconectada, revisa su original y cierra la toma interrumpida.');
        } catch (cause) { setSessionNotice(sessionErrorMessage(cause)); }
      }} />}
  />;
}
