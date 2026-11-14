import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { getSessionService } from '@/services/session';
import { readinessReasons, type Session } from '@/services/sessionProtocol';

type Service = Awaited<ReturnType<typeof getSessionService>>;
const phases = { pending: 'Esperando recepción', starting: 'Iniciando cámara', recording: 'Grabación en curso',
  saving: 'Deteniendo / guardando', saved: 'Archivo guardado en el Node', error: 'Error', disconnected: 'Desconectado; estado local desconocido' };
export function ControllerTakePanel({ service, session }: { service: Service; session: Session }) {
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const request = useRef<string | null>(null);
  const requestedAt = useRef(0);
  useEffect(() => {
    const unsubscribe = service.subscribe((state) => {
      if (!request.current) return;
      if (state.connection !== 'Connected') { request.current = null; setPending(false); setNotice('Sin relay; usa STOP local en cada Node.'); return; }
      const event = state.lastEvent;
      if (event?.sessionId !== session.sessionId || event.payload.requestId !== request.current) return;
      request.current = null;
      setPending(false);
      setNotice(event.type === 'SESSION_ERROR' ? `Comando rechazado: ${event.payload.code}` : 'Comando registrado; comprueba ACK y resultado de cada Node.');
    });
    const timer = setInterval(() => {
      if (request.current && Date.now() - requestedAt.current >= 15000) { request.current = null; setPending(false); setNotice('Sin respuesta reciente. Actualiza la Session antes de volver a REC; STOP local sigue disponible.'); }
    }, 1000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [service, session.sessionId]);
  const nodes = Object.values(session.members).filter((m) => m.kind === 'node');
  const take = session.take;
  const finished = !take || Object.values(take.nodes).every((n) => !n.busy && ['saved', 'error'].includes(n.phase));
  const canStart = !pending && finished && nodes.length > 0 && nodes.every((n) => !readinessReasons(n.readiness).length);
  const canStop = !pending && !!take && Object.values(take.nodes).some((n) => n.phase !== 'saved');
  const run = (start: boolean) => {
    if (request.current) return;
    try {
      const sent = start ? service.startTake(session.sessionId).messageId : service.stopTake(session.sessionId);
      request.current = sent; requestedAt.current = Date.now(); setPending(true); setNotice('Esperando respuesta del relay…');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo enviar.'); }
  };
  return <View style={styles.panel}>
    <ThemedText type="subtitle">Toma coordinada</ThemedText>
    <ThemedText>REC solicita grabación a todos los Nodes aceptados y READY. La recepción no confirma un archivo válido.</ThemedText>
    <Pressable accessibilityRole="button" disabled={!canStart} onPress={() => run(true)} style={[styles.button, !canStart && styles.disabled]}>
      <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">REC · TODOS LOS NODES ({nodes.length})</ThemedText>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={!canStop} onPress={() => run(false)} style={[styles.stop, !canStop && styles.disabled]}>
      <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">STOP · FINALIZAR TOMA</ThemedText>
    </Pressable>
    {!canStart && !take && <ThemedText>Acepta los Nodes y prepara sus cámaras antes de REC.</ThemedText>}
    {!!notice && <ThemedText accessibilityLiveRegion="polite">{notice}</ThemedText>}
    {take && <>
      <ThemedText selectable>takeId: {take.takeId}</ThemedText>
      <ThemedText>No se certifica sincronización exacta. Los vídeos son silenciados y permanecen en cada teléfono.</ThemedText>
      {Object.entries(take.nodes).map(([id, node]) => <View key={node.nodeId} style={styles.panel}>
        <ThemedText selectable>Node: {node.nodeId} · dispositivo: {id}</ThemedText>
        <ThemedText>Recepción REC: {node.startReceived ? 'ACK' : 'sin ACK'} · STOP: {node.stopReceived ? 'ACK' : 'sin ACK'}</ThemedText>
        <ThemedText accessibilityLiveRegion="polite">{phases[node.phase]}</ThemedText>
        {node.error && <ThemedText>Fallo parcial: {node.error}. Revisa este Node; no se da por guardado.</ThemedText>}
        {node.capture && <ThemedText selectable>Original {node.capture.id} · {node.capture.bytes} bytes. Reproduce el vídeo en ese Node.</ThemedText>}
      </View>)}
    </>}
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 10 }, button: { padding: 14, borderRadius: 12, backgroundColor: '#B42318' },
  stop: { padding: 14, borderRadius: 12, backgroundColor: '#344054' }, disabled: { opacity: 0.45 } });
