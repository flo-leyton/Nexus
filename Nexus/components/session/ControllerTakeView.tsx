import { ScrollView, View } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import { takeFinished, type Session } from '@/services/sessionProtocol';
import { SessionActionDock, SessionBadge, SessionDetails, SessionNotice, SessionSection, sessionStyles } from './SessionUI';
import { TakeHistoryItem, TakeNodeStatus } from './TakeNodeStatus';

export type ControllerTakeViewProps = {
  session: Session; nodeCount: number; canStart: boolean; canStop: boolean;
  cameras: { deviceId: string; label: string; status: string; canStart: boolean; canStop: boolean }[];
  closableTakeIds: string[];
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
        <View style={sessionStyles.row}>
          <Button mode="outlined" disabled={!camera.canStart} accessibilityLabel={`REC ${camera.label}`}
            onPress={() => props.onStartCamera(camera.deviceId)} style={sessionStyles.flex} contentStyle={sessionStyles.touch}>REC</Button>
          <Button mode="outlined" disabled={!camera.canStop} accessibilityLabel={`STOP ${camera.label}`}
            onPress={() => props.onStopCamera(camera.deviceId)} style={sessionStyles.flex} contentStyle={sessionStyles.touch}>STOP</Button>
        </View>
      </View>)}
    </SessionSection>}
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
      <View style={sessionStyles.row}>
        <Button mode="contained" icon="record-circle" disabled={!props.canStart} onPress={props.onStart}
          buttonColor={colors.error} textColor={colors.onError} style={[sessionStyles.control, sessionStyles.flex]} contentStyle={sessionStyles.touch}>REC · {props.nodeCount} {props.nodeCount === 1 ? 'Node' : 'Nodes'}</Button>
        <Button mode="contained-tonal" icon="stop" disabled={!props.canStop} onPress={props.onStop}
          style={[sessionStyles.control, sessionStyles.flex]} contentStyle={sessionStyles.touch}>STOP · Finalizar</Button>
      </View>
    </SessionActionDock>
  </View>;
}
