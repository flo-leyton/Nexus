/** Isolated web entry for visual QA. Not an Expo Router route or production fixture. */
import '@expo/metro-runtime';
import { registerRootComponent } from 'expo';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Divider, PaperProvider, Text } from 'react-native-paper';

import { SessionHeader } from '../../../components/session/SessionHeader';
import { SessionMemberRow } from '../../../components/session/SessionMemberRow';
import { NodeRoleEditor } from '../../../components/NodeRoleEditor';
import { NexusPaperTheme } from '../../../constants/paper-theme';
import type { SessionMember } from '../../../services/sessionProtocol';
import type { getSessionService } from '../../../services/session';

type Service = Awaited<ReturnType<typeof getSessionService>>;
// Only the editor's presentation is exercised. No actual service is constructed here.
const inertService = { subscribe: () => () => {}, assignRole: () => 'preview-only' } as unknown as Service;
const ready = { cameraPermission: 'granted' as const, cameraAvailable: true, enginePrepared: true, error: null };
const base = { kind: 'node' as const, online: true, readiness: ready };
const scenarios: Record<string, SessionMember[]> = {
  ready: [
    { ...base, deviceId: 'demo-device-01', nodeId: 'demo-node-01', role: 'Cámara principal' },
    { ...base, deviceId: 'demo-device-02', nodeId: 'demo-node-02', role: 'Cámara lateral' },
  ],
  mixed: [
    { ...base, deviceId: 'demo-device-01', nodeId: 'demo-node-01', role: 'Cámara principal' },
    { ...base, deviceId: 'demo-device-02', nodeId: 'demo-node-02', role: 'Cámara lateral', requiresReadyConfirmation: true,
      readiness: { ...ready, enginePrepared: false } },
  ],
  offline: [
    { ...base, deviceId: 'demo-device-01', nodeId: 'demo-node-01', role: 'Cámara principal' },
    { ...base, deviceId: 'demo-device-02', nodeId: 'demo-node-02', role: 'Cámara lateral', online: false },
  ],
};

function Preview() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('theme') === 'light' ? 'light' : 'dark';
  const scenario = params.get('scenario') || 'ready';
  const members = scenarios[scenario] || scenarios.ready;
  const theme = NexusPaperTheme[mode];
  return <PaperProvider theme={theme}>
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.page}>
      <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>2A · COMPONENTES REALES · DATOS SINTÉTICOS</Text>
      <SessionHeader sessionId="demo-session-2a" deviceId="demo-controller" code="K7M2Q9" role="Controller"
        connected connectionLabel="Conectado" notice="Ejemplo visual aislado. No hay conexión real al relay." error={false}
        onRefresh={() => {}} onConnect={() => {}} />
      <Divider />
      <Text variant="titleLarge">Dispositivos de la sesión</Text>
      <Text variant="bodyMedium">Nodes online: {members.filter(member => member.online !== false).length} / {members.length} aceptados</Text>
      {members.map(member => <View key={member.deviceId} style={styles.member}>
        <SessionMemberRow member={member} connected isSelf={false}>
          {scenario === 'ready' && member === members[0] && <NodeRoleEditor service={inertService} sessionId="demo-session-2a" deviceId={member.deviceId} role={member.role} />}
        </SessionMemberRow>
        <Divider />
      </View>)}
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Esta escena sólo valida encabezado y filas de 2A. REC/STOP, cámara, admisión y guardado conservan su implementación actual y no se ejecutan aquí.</Text>
    </ScrollView>
  </PaperProvider>;
}
const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: 20, paddingBottom: 40 },
  member: { gap: 20 },
});
registerRootComponent(Preview);
