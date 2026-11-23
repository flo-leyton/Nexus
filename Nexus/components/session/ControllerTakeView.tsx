import { ScrollView, View } from 'react-native';
import type { ReactNode } from 'react';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import { activeTakes, takeFinished, type Session } from '@/services/sessionProtocol';
import { SessionActionDock, SessionBadge, SessionDetails, SessionNotice, SessionSection, sessionStyles } from './SessionUI';
import { TakeHistoryItem, TakeNodeStatus } from './TakeNodeStatus';

export type ControllerTakeViewProps = {
  session: Session; nodeCount: number; canStart: boolean; canStop: boolean;
  cameras: { deviceId: string; label: string; status: string; recording: boolean; canStart: boolean; canStop: boolean;
    zoomControl?: ReactNode; torchControl?: ReactNode; photoControl?: ReactNode }[];
  closableTakeIds: string[];
  scheduling?: ReactNode;
  notice: string; pending: boolean; confirmingClose: boolean; focused: boolean;
  onStart(): void; onStop(): void; onStartCamera(id: string): void; onStopCamera(id: string): void;
  onRequestClose(takeId: string): void; onClose(): void; onCancelClose(): void;
};

export function ControllerTakeView(props: ControllerTakeViewProps) {
  const { colors } = useTheme();
  const take = props.session.take;
  const previous = props.session.takeHistory ?? [];
  const active = previous.filter((entry) => !takeFinished(entry));
  const history = previous.filter(takeFinished);
  const allActive = activeTakes(props.session);
  const takes = allActive.filter((entry) => !entry.interrupted);
  const { members } = props.session;
  const recording = takes.some((entry) => Object.entries(entry.nodes).some(([id, node]) =>
    members[id] && members[id].online !== false && !node.connectionLost && node.phase === 'recording'));
  const needsRecovery = !recording && takes.some((entry) => Object.values(entry.nodes).some((node) =>
    node.connectionLost ? !entry.stopMessageId : node.busy && !!node.error && node.phase !== 'saving'));
  return <View style={sessionStyles.stack}>
    <Text accessibilityRole="header" variant="titleLarge">Consola de grabación</Text>
    <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>REC solicita captura a los Nodes conectados y listos. Cada resultado se confirma por separado.</Text>
    {props.pending && !props.notice && <SessionBadge label="Comando enviado · esperando relay" />}
    {!!props.notice && <SessionNotice title={props.pending ? 'Comando enviado · esperando relay' : props.notice}>
      {props.pending && <Text variant="bodyMedium">{props.notice}</Text>}
    </SessionNotice>}
    {!props.canStart && !take && <Text variant="bodyMedium">Acepta los Nodes y prepara sus cámaras antes de REC.</Text>}
    {!!props.cameras.length && <SessionSection title="Control por cámara">
      {props.cameras.map((camera) => <View key={camera.deviceId} style={sessionStyles.stack}>
        <View style={sessionStyles.between}><Text variant="titleMedium">{camera.label}</Text>
          <SessionBadge label={camera.status} />
        </View>
        <Button mode="outlined" icon={camera.recording ? 'stop' : 'record-circle'}
          disabled={camera.recording ? !camera.canStop : !camera.canStart}
          accessibilityLabel={`${camera.recording ? 'STOP' : 'REC'} ${camera.label}`}
          onPress={() => camera.recording ? props.onStopCamera(camera.deviceId) : props.onStartCamera(camera.deviceId)}
          contentStyle={sessionStyles.touch}>{camera.recording ? 'STOP' : 'REC'}</Button>
        {camera.zoomControl}
        {camera.torchControl}
        {camera.photoControl}
      </View>)}
    </SessionSection>}
    {props.scheduling}
    {take ? <>
      <View style={sessionStyles.between}><Text variant="titleMedium">Toma · …{take.takeId.slice(-6)}</Text>
        <SessionBadge label={take.closed ? 'Cerrada operativamente' : take.interrupted ? 'Interrumpida' : 'Resultados por Node'} tone={take.interrupted || take.closed ? 'warning' : 'neutral'} />
      </View>
      {take.interrupted && <SessionNotice title="Toma interrumpida" tone="warning"><Text variant="bodyMedium">Detén y comprueba cada original local. Los resultados sin confirmación durable siguen desconocidos. Confirma READY en los Nodes que regresen y cierra esta toma antes de otra.</Text></SessionNotice>}
      {take.closed && <Text variant="bodyMedium">Sin confirmar: {take.closed.unconfirmedNodeIds.join(', ') || 'ninguno'}. Los ACK y resultados originales se conservan.</Text>}
      {Object.entries(take.nodes).map(([id, node]) => <TakeNodeStatus key={node.nodeId} deviceId={id} node={node} />)}
      <SessionDetails title="Identificador de toma"><Text selectable variant="bodySmall">takeId: {take.takeId}</Text></SessionDetails>
    </> : <Text variant="bodyMedium">Sin toma activa. {props.nodeCount} Nodes conectados considerados para la próxima toma.</Text>}
    {!!active.length && <SessionSection title="Otras tomas activas">
      {active.map((entry) => <TakeHistoryItem key={entry.takeId} take={entry} />)}
    </SessionSection>}
    {needsRecovery && <Button mode="outlined" disabled={!props.canStop} onPress={props.onStop}
      contentStyle={sessionStyles.touch}>Solicitar STOP de las tomas pendientes</Button>}
    {props.closableTakeIds.map((id) => <Button key={id} mode="outlined" icon="alert-circle-outline"
      onPress={() => props.onRequestClose(id)} style={sessionStyles.control} contentStyle={sessionStyles.touch}>Cerrar toma interrumpida · …{id.slice(-6)}</Button>)}
    {props.confirmingClose && props.focused && <Portal><Dialog visible onDismiss={props.onCancelClose} style={{ maxWidth: 560, width: '90%', alignSelf: 'center' }}>
      <Dialog.Title>Cerrar no detiene un Node offline</Dialog.Title>
      <Dialog.ScrollArea style={{ maxHeight: 320 }}><ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
        <Text variant="bodyMedium">El relay rechazará el cierre si un participante alcanzable sigue activo o sin resultado final. Un Node desconectado puede seguir grabando: usa STOP local y comprueba su vídeo. Cerrar sólo libera la toma; no confirma ni detiene ese teléfono.</Text>
        <Text variant="bodyMedium" style={{ marginTop: 12 }}>Confirma únicamente después de revisar los originales. Los resultados desconocidos se conservan como desconocidos.</Text>
      </ScrollView></Dialog.ScrollArea>
      <Dialog.Actions style={{ flexWrap: 'wrap' }}>
        <Button onPress={props.onCancelClose} contentStyle={sessionStyles.touch}>Cancelar</Button>
        <Button onPress={props.onClose} contentStyle={sessionStyles.touch}>Confirmar cierre</Button>
      </Dialog.Actions>
    </Dialog></Portal>}
    <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Vídeos sin audio, conservados en cada teléfono. No se certifica sincronización exacta. La subida se consulta en Tomas y medios.</Text>
    {!!history.length && <SessionSection title="Historial de tomas">
      {history.map((old) => <TakeHistoryItem key={old.takeId} take={old} />)}
    </SessionSection>}
    <SessionActionDock visible={props.focused} title={take ? `Toma · …${take.takeId.slice(-6)}` : 'Próxima toma · vídeo sin audio'}>
      <Button mode={recording ? 'contained-tonal' : 'contained'} icon={recording ? 'stop' : 'record-circle'}
        disabled={recording ? !props.canStop : !props.canStart || !!allActive.length}
        onPress={recording ? props.onStop : props.onStart} buttonColor={recording ? undefined : colors.error}
        textColor={recording ? undefined : colors.onError} style={sessionStyles.control} contentStyle={sessionStyles.touch}>
        {recording ? 'STOP todos los Nodes' : 'REC todos los Nodes'}
      </Button>
    </SessionActionDock>
  </View>;
}
