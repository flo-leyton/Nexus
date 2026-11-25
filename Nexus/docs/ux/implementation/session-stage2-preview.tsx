/** Isolated Expo web entry: real views, synthetic states, no relay/camera/file operations. */
import '@expo/metro-runtime';
import { registerRootComponent } from 'expo';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Icon, PaperProvider, Text } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NexusPaperTheme } from '../../../constants/paper-theme';
import { SessionPage } from '../../../components/session/SessionPage';
import { SessionHeader } from '../../../components/session/SessionHeader';
import { SessionMemberRow } from '../../../components/session/SessionMemberRow';
import { NodeRoleEditorView } from '../../../components/session/NodeRoleEditorView';
import { ControllerTakeView } from '../../../components/session/ControllerTakeView';
import { NodeCaptureView } from '../../../components/session/NodeCaptureView';
import { SessionAdmissionView, SessionCloseView } from '../../../components/session/SessionAdmissionView';
import { SessionImportView } from '../../../components/session/SessionImportView';
import { LocalCapturesView } from '../../../components/session/LocalCapturesView';
import { CaptureUploadView } from '../../../components/session/CaptureUploadView';
import { TakeMediaView } from '../../../components/session/TakeMediaView';
import { SessionImportedMediaRow } from '../../../components/session/SessionImportedMediaRow';
import { RejoinSessionView } from '../../../components/session/RejoinSessionView';
import { SessionSection, sessionStyles } from '../../../components/session/SessionUI';
import type { CapturePreparation } from '../../../services/captureEngine';
import type { CoordinatedTake, Session, TakeNode } from '../../../services/sessionProtocol';
import type { LocalCapture } from '../../../types/capture';
import type { LocalCaptureMediaAsset } from '../../../types/media';

declare global { interface Window { __sessionQA?: { setScenario(value: string): void; ownerMounts: number; ownerUnmounts: number; cameraMounts: number; cameraUnmounts: number; actions: string[] } } }
const readiness = { cameraPermission: 'granted' as const, cameraAvailable: true, enginePrepared: true, error: null };
const result = (id: string, role: string, phase: TakeNode['phase']): TakeNode => ({ nodeId: id, role, phase,
  startReceived: phase !== 'pending', stopReceived: phase === 'saved' || phase === 'saving', busy: phase === 'recording' || phase === 'saving',
  error: phase === 'disconnected' ? 'connectionLost' : null, capture: phase === 'saved' ? { id: 'clip-' + id, bytes: 24000000 } : null });
const clip: LocalCapture = { id: 'demo-clip-01', sessionId: 'demo-session', nodeId: 'demo-node-01', deviceId: 'demo-device-01', takeId: 'demo-take-7F21', audio: false,
  fileName: 'video.mp4', localUri: 'file:///synthetic/video.mp4', bytes: 24000000, createdAt: '2026-11-16T12:00:00Z' };
const asset: LocalCaptureMediaAsset = { ...clip, id: 'demo-local-asset', storage: 'local', source: 'capture', resourceType: 'video', localId: clip.id,
  localAvailable: true, localError: null, upload: { state: 'failed', error: 'Ejemplo de fallo de subida. El original se conserva.' } };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };

function CameraProbe() {
  useEffect(() => { window.__sessionQA!.cameraMounts++; return () => { window.__sessionQA!.cameraUnmounts++; }; }, []);
  return <View style={[sessionStyles.preview, { backgroundColor: '#272131', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }]}>
    <Icon source="video-outline" size={44} color="#B0A8BC" />
    <Text style={{ color: '#B0A8BC', textAlign: 'center' }}>Encuadre ilustrativo de QA · CameraView real sólo en dispositivo</Text>
  </View>;
}
function NodeOwnerProbe({ scenario, onAction }: { scenario: string; onAction(value: string): void }) {
  useEffect(() => { window.__sessionQA!.ownerMounts++; return () => { window.__sessionQA!.ownerUnmounts++; }; }, []);
  const rec = scenario === 'node-recording' || scenario === 'node-offline', failed = scenario === 'node-save-error', denied = scenario === 'node-permission';
  const phase: CapturePreparation['phase'] = rec ? 'recording' : failed || denied ? 'error' : scenario === 'node-saved' ? 'saved' : 'ready';
  const preparation: CapturePreparation = { readiness: denied ? { ...readiness, cameraPermission: 'denied', cameraAvailable: null, enginePrepared: false } : readiness,
    active: true, canAskAgain: !denied, generation: 1, phase, captureError: failed ? 'Ejemplo: no se pudo persistir el archivo.' : denied ? 'Permiso de cámara denegado.' : null,
    lastCapture: scenario === 'node-saved' ? clip : null, pendingSave: failed };
  const reasons = rec ? [scenario === 'node-offline' ? 'Sin conexión al relay' : 'Grabación local en curso'] : denied ? ['Permiso de cámara denegado'] : failed ? ['Guardado pendiente'] : scenario === 'node-ready' ? ['Confirma preparación para una nueva grabación'] : [];
  return <NodeCaptureView preparation={preparation} phaseLabel={rec ? 'Grabando' : failed ? 'Error de guardado' : denied ? 'Permiso necesario' : phase === 'saved' ? 'Archivo disponible' : 'Cámara preparada'}
    reasons={reasons} busy={rec} accepted={scenario !== 'node-offline'} requiresConfirmation={scenario === 'node-ready'} confirmDisabled={false}
    canRecord={!rec && !denied && !failed && scenario !== 'node-ready'} prepareDisabled={rec || failed} focused isWeb={false} reportError="" controlError=""
    takeId={rec || failed || phase === 'saved' ? 'demo-take-7F21' : undefined} camera={!denied && !failed ? <CameraProbe /> : null}
    onConfirmReady={() => onAction('READY')} onRecord={() => onAction('REC-local')} onStop={() => onAction('STOP-local')} onRetrySave={() => onAction('RETRY-save')} onPrepare={() => onAction('PREPARE')} />;
}
function Preview() {
  const query = new URLSearchParams(window.location.search);
  const [scenario, setScenario] = useState(query.get('scenario') || 'controller-ready');
  const [confirmClose, setConfirmClose] = useState(false), [confirmTake, setConfirmTake] = useState(false);
  const [draft, setDraft] = useState('Cámara principal'), [rolePending, setRolePending] = useState(false);
  const theme = NexusPaperTheme[query.get('theme') === 'light' ? 'light' : 'dark'];
  if (!window.__sessionQA) window.__sessionQA = { setScenario, ownerMounts: 0, ownerUnmounts: 0, cameraMounts: 0, cameraUnmounts: 0, actions: [] };
  window.__sessionQA.setScenario = setScenario;
  const action = (value: string) => { window.__sessionQA!.actions.push(value); };
  const node = scenario.startsWith('node-'), offline = scenario === 'node-offline', pending = scenario === 'controller-pending';
  const partial = scenario === 'controller-partial', interrupted = scenario === 'controller-interrupted', saved = scenario === 'controller-saved';
  const showMedia = scenario === 'media' || scenario === 'node-saved' || saved;
  const take: CoordinatedTake | undefined = scenario === 'controller-ready' || scenario === 'media' || node ? undefined : {
    takeId: 'demo-take-7F21', startMessageId: 'demo-rec', stopMessageId: saved ? 'demo-stop' : null,
    nodes: { 'demo-device-01': result('demo-node-01', 'Cámara principal', pending ? 'pending' : saved ? 'saved' : 'recording'),
      'demo-device-02': result('demo-node-02', 'Cámara lateral', pending ? 'pending' : partial || interrupted ? 'disconnected' : saved ? 'saved' : 'recording') },
    ...(interrupted ? { interrupted: { at: 1, reason: 'connection-lost' as const } } : {}) };
  const session: Session = { sessionId: 'demo-session', code: 'K7M2Q9', controllerId: 'demo-controller', state: partial || scenario === 'controller-recording' ? 'recording' : 'ready',
    members: { 'demo-controller': { deviceId: 'demo-controller', nodeId: null, kind: 'controller', role: 'Controller', online: true },
      'demo-device-01': { deviceId: 'demo-device-01', nodeId: 'demo-node-01', kind: 'node', role: 'Cámara principal', online: true, readiness },
      'demo-device-02': { deviceId: 'demo-device-02', nodeId: 'demo-node-02', kind: 'node', role: 'Cámara lateral', online: !partial && !interrupted, readiness } }, take,
    takeHistory: saved ? [{ takeId: 'demo-take-6C90', startMessageId: 'old-rec', stopMessageId: 'old-stop', nodes: { 'demo-device-01': result('demo-node-01', 'Cámara principal', 'saved') } }] : [] };
  const media = <SessionSection title="Tomas y medios" description="QA · datos sintéticos">
    <TakeMediaView error="" groups={new Map([['demo-take', [
      { sessionId: 'demo-session', angle: { clipId: 'demo-clip-01', takeId: 'demo-take-7F21', deviceId: 'demo-device-01', nodeId: 'demo-node-01', role: 'Cámara principal', bytes: 24000000, revision: 1, upload: { state: 'uploaded', publicId: 'demo', url: 'https://res.cloudinary.com/demo/video/upload/demo.mp4' } } },
      { sessionId: 'demo-session', angle: { clipId: 'demo-clip-02', takeId: 'demo-take-7F21', deviceId: 'demo-device-02', nodeId: 'demo-node-02', role: 'Cámara lateral', bytes: 23000000, revision: 1, upload: { state: 'local' } } },
    ]]])} onPlay={() => action('PLAY-remote')} />
    <LocalCapturesView captures={[clip]} problems={[]} busy={false} onPlay={() => action('PLAY-local')}
      renderUpload={() => <CaptureUploadView asset={asset} busy={false} disabled={false} notice="" onUpload={() => action('UPLOAD-retry')} onOpenRemote={() => action('OPEN-remote')} />} />
    <SessionImportedMediaRow asset={{ id: 'demo-import', storage: 'remote', source: 'import', resourceType: 'video', publicId: 'demo-import', url: 'https://res.cloudinary.com/demo/video/upload/import.mp4', sessionId: 'demo-session', createdAt: '2026-11-16T12:00:00Z', fileName: 'referencia.mp4', bytes: 1400000 }} onPress={() => action('OPEN-import')} />
  </SessionSection>;
  return <SafeAreaProvider initialMetrics={metrics}><PaperProvider theme={theme}>
    <SessionPage topInset={0} onBack={() => action('BACK')}
      header={<View style={{ gap: 8 }}><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>QA · DATOS SINTÉTICOS · SIN SESIÓN REAL</Text>
        <SessionHeader compact={node} sessionId="demo-session" deviceId={node ? 'demo-device-01' : 'demo-controller'} code={offline ? undefined : session.code}
          role={offline ? undefined : node ? 'Node' : 'Controller'} connected={!offline} connectionLabel={offline ? 'Sin conexión' : 'Conectado'}
          notice={offline ? 'Sin relay. La captura local puede continuar.' : 'Escena aislada de componentes reales.'} error={offline} onConnect={() => action('CONNECT')} onRefresh={() => action('REFRESH')} />
      </View>}
      capture={node && <NodeOwnerProbe key="demo-node-01" scenario={scenario} onAction={action} />}
      members={!offline && scenario !== 'media' && <SessionSection title={node ? 'Participación' : 'Dispositivos de la sesión'}>
        {node ? <Text variant="bodyMedium">Node · Cámara principal</Text> : <>
          <Text variant="bodyMedium">{partial || interrupted ? 1 : 2} / 2 Nodes online</Text>
          {Object.values(session.members).filter(m => m.kind === 'node').map(member => <SessionMemberRow key={member.deviceId} member={member} connected isSelf={false}>
            {member.online && <NodeRoleEditorView compact deviceId={member.deviceId} draft={draft} busy={rolePending} notice={rolePending ? 'Esperando ACK del Node…' : ''} onChange={setDraft} onAssign={() => { action('ROLE'); setRolePending(true); }} />}
          </SessionMemberRow>)}
        </>}
      </SessionSection>}
      console={!node && scenario !== 'media' && <ControllerTakeView session={session} nodeCount={partial || interrupted ? 1 : 2} canStart={scenario === 'controller-ready' || saved} canStop={!pending && !!take && !interrupted && !saved}
        cameras={[]} closableTakeIds={interrupted && take ? [take.takeId] : []}
        pending={pending} notice={pending ? 'Esperando respuesta del relay…' : ''} confirmingClose={confirmTake} focused
        onStart={() => { action('REC'); setScenario('controller-pending'); }} onStop={() => action('STOP')} onStartCamera={() => action('REC')} onStopCamera={() => action('STOP')} onRequestClose={() => setConfirmTake(true)} onClose={() => action('CLOSE-take')} onCancelClose={() => setConfirmTake(false)} />}
      admission={!node && <SessionAdmissionView requests={[{ deviceId: 'demo-applicant-03', requestId: 'demo-request', online: scenario !== 'admission-offline' }]} deciding={{}} onDecision={(_r, accept) => action(accept ? 'ACCEPT' : 'REJECT')} />}
      rejoin={offline && <RejoinSessionView last={{ code: 'K7M2Q9', sessionId: 'demo-session' }} showLast disabled connected={false} blocked pending={false} notice="" historyError={null} onResume={() => action('RESUME')} onRejoin={() => action('REJOIN')} />}
      media={showMedia ? media : <SessionSection title="Tomas y medios"><Text variant="bodyMedium">No hay referencias o capturas nuevas en esta escena.</Text></SessionSection>}
      imports={<SessionImportView selected={scenario === 'import' ? { uri: 'file:///synthetic/selection.mp4', width: 1920, height: 1080, type: 'video', fileName: 'seleccion.mp4', fileSize: 6000000 } : null}
        status={scenario === 'import' ? 'selected' : 'idle'} message="Imágenes o vídeos de hasta 80 MB." hasLastSaved={false} onSelect={() => action('SELECT')} onUpload={() => action('IMPORT-upload')} onOpenLast={() => action('OPEN-last')} />}
      administration={!node && <SessionCloseView disabled={!!take && !saved} pending={false} confirming={confirmClose} onRequest={() => setConfirmClose(true)} onConfirm={() => action('CLOSE-session')} onCancel={() => setConfirmClose(false)} />}
    />
  </PaperProvider></SafeAreaProvider>;
}
registerRootComponent(Preview);
