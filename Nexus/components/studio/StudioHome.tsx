import { retainedVisibility } from '@/components/retainedVisibility';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Divider, Icon, Text, TextInput, TouchableRipple, useTheme } from 'react-native-paper';

import { StudioShape, StudioSpacing, StudioUI } from '@/constants/studio-ui';
import type { Session } from '@/services/sessionProtocol';
import { StudioStatus } from './StudioStatus';

type Props = {
  topInset: number;
  connected: boolean;
  connecting: boolean;
  connectionLabel: string;
  serviceReady: boolean;
  busy: boolean;
  sending: boolean;
  code: string;
  deviceId: string;
  sessions: Session[];
  error: string;
  failed: boolean;
  notice: string;
  pendingMessage?: string;
  rejoinPanel: ReactNode;
  identityPanel: ReactNode;
  onCodeChange(code: string): void;
  onCreate(): void;
  onJoin(): void;
  onConnect(): void;
  onRefresh(): void;
  onOpenSession(sessionId: string): void;
};

/** Presentation only. Membership, identity and command state remain in the existing screen hook. */
export function StudioHome(props: Props) {
  const theme = useTheme();
  const { colors } = theme;
  const palette = StudioUI[theme.dark ? 'dark' : 'light'];
  const [showJoin, setShowJoin] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const disabled = props.busy || !props.serviceReady;
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.appbar, { paddingTop: props.topInset + StudioSpacing.md, borderBottomColor: colors.outlineVariant }]}>
        <View style={styles.appbarContent}>
          <Text variant="titleLarge" style={styles.brand}>NEXUS</Text>
          <View style={styles.connection}>
            {props.connecting ? <ActivityIndicator size={14} /> : <View style={[styles.dot, { backgroundColor: props.connected ? palette.success : palette.warning }]} />}
            <Text variant="labelMedium" style={{ color: props.connected ? palette.success : colors.onSurfaceVariant }}>
              Relay · {props.connectionLabel}
            </Text>
          </View>
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text variant="labelMedium" style={[styles.eyebrow, { color: colors.onSurfaceVariant }]}>STUDIO</Text>
          <Text accessibilityRole="header" variant="headlineMedium" style={styles.title}>Tus sesiones.</Text>
          <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>Coordina como Controller o captura como Node.</Text>
        </View>

        <View style={styles.primaryActions}>
          <Button mode="contained" icon="plus" onPress={props.onCreate} disabled={disabled} loading={props.sending}
            contentStyle={styles.buttonContent} style={styles.createButton}>Nueva sesión</Button>
          <Button mode="outlined" onPress={() => setShowJoin((visible) => !visible)} disabled={disabled}
            accessibilityState={{ expanded: showJoin, disabled }} contentStyle={styles.buttonContent}
            style={styles.joinButton}>Ingresar por código</Button>
        </View>

        {/* Keep the controlled input mounted: hiding the presentation never clears the draft. */}
        <View style={[styles.joinForm, !showJoin && styles.hidden]} accessibilityElementsHidden={!showJoin}
          importantForAccessibility={showJoin ? 'auto' : 'no-hide-descendants'}>
          <Text accessibilityRole="header" variant="titleMedium">Ingresar como Node</Text>
          <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>El Controller debe aceptar este teléfono antes de que participe.</Text>
          <TextInput mode="outlined" label="Código de sesión" accessibilityLabel="Código de sesión" autoCapitalize="characters"
            autoCorrect={false} maxLength={6} editable={!props.busy} value={props.code} onChangeText={props.onCodeChange}
            placeholder="6 caracteres" outlineStyle={styles.control} style={{ backgroundColor: colors.background }} />
          <Button mode="contained" onPress={props.onJoin} disabled={disabled} loading={props.sending}
            style={styles.control} contentStyle={styles.buttonContent}>Solicitar ingreso</Button>
        </View>

        {!props.connected && <View style={styles.block}>
          <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
            {props.connecting ? 'Esperando confirmación del relay…' : 'Conecta al relay para crear, solicitar ingreso o consultar tus sesiones.'}
          </Text>
          <Button mode="contained-tonal" icon="connection" onPress={props.onConnect} style={styles.control} contentStyle={styles.buttonContent}>
            Conectar al relay
          </Button>
        </View>}

        <StudioStatus error={props.failed || !!props.error} message={props.error || props.notice} />
        {!!props.pendingMessage && <StudioStatus message={props.pendingMessage} />}

        <View style={styles.sectionHeading}>
          <Text accessibilityRole="header" variant="titleMedium">Tus sesiones</Text>
          {props.connected && <Button mode="text" icon="refresh" onPress={props.onRefresh}
            accessibilityLabel="Actualizar mis sesiones" contentStyle={styles.buttonContent}>Actualizar</Button>}
        </View>
        {!props.serviceReady ? <View style={styles.loading}><ActivityIndicator size="small" /><Text variant="bodyMedium">Preparando Studio…</Text></View> :
          props.sessions.length === 0 ? <View style={[styles.empty, { borderColor: colors.outlineVariant }]}>
            <Icon source="view-dashboard-outline" size={24} color={colors.onSurfaceVariant} />
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, flex: 1 }}>
              {props.connected ? 'No hay sesiones en esta consulta. Crea una o solicita ingreso con un código.' : 'Conecta para consultar las sesiones autorizadas para esta instalación.'}
            </Text>
          </View> : props.sessions.map((session) => {
            const controller = session.controllerId === props.deviceId;
            const nodes = Object.values(session.members).filter((member) => member.kind === 'node').length;
            return <View key={session.sessionId}>
              <Divider />
              <TouchableRipple onPress={() => props.onOpenSession(session.sessionId)} accessibilityRole="button"
                accessibilityLabel={`Abrir sesión ${session.code}, ${controller ? 'Controller' : 'Node'}`}>
                <View style={styles.session}>
                  <View style={styles.sessionTop}>
                    <Text variant="labelMedium" style={[styles.eyebrow, { color: colors.onSurfaceVariant }]}>
                      {controller ? 'CONTROLLER' : 'INGRESO ACEPTADO · NODE'}
                    </Text>
                    <Icon source="arrow-right" size={22} color={colors.primary} />
                  </View>
                  <Text selectable variant="headlineSmall" style={styles.code}>{session.code}</Text>
                  <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
                    {nodes} {nodes === 1 ? 'Node aceptado' : 'Nodes aceptados'} · abrir sesión
                  </Text>
                  <Text selectable variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{session.sessionId}</Text>
                </View>
              </TouchableRipple>
            </View>;
          })}

        {props.rejoinPanel}

        <Divider />
        <Button mode="text" icon={showDetails ? 'chevron-up' : 'chevron-down'} onPress={() => setShowDetails((visible) => !visible)}
          accessibilityState={{ expanded: showDetails }} contentStyle={styles.buttonContent}>Identidad y soporte</Button>
        {/* Preserve identity subscriptions, pending operations and messages while collapsed. */}
        <View style={[styles.block, !showDetails && styles.hidden]} accessibilityElementsHidden={!showDetails}
          importantForAccessibility={showDetails ? 'auto' : 'no-hide-descendants'}>
          <Text selectable variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Este dispositivo: {props.deviceId || 'Preparando identidad…'}</Text>
          {props.identityPanel}
        </View>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>La identidad de esta instalación autoriza el acceso. El código de sesión no demuestra propiedad.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  appbar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingBottom: StudioSpacing.lg },
  appbarContent: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: StudioSpacing.xs },
  brand: { fontWeight: '700', letterSpacing: 1 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: StudioSpacing.sm, minHeight: 20 },
  dot: { height: 6, width: 6, borderRadius: 3 },
  content: { alignSelf: 'center', width: '100%', maxWidth: 720, padding: 20, paddingBottom: 48, gap: StudioSpacing.lg },
  heading: { gap: StudioSpacing.sm },
  eyebrow: { letterSpacing: 1.2 },
  title: { fontWeight: '600' },
  primaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: StudioSpacing.sm },
  createButton: { flexGrow: 1, flexBasis: 140, borderRadius: StudioShape.control },
  joinButton: { flexGrow: 1, flexBasis: 168, borderRadius: StudioShape.control },
  buttonContent: { minHeight: StudioShape.touchTarget },
  control: { borderRadius: StudioShape.control },
  block: { gap: StudioSpacing.md },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: StudioSpacing.sm },
  loading: { flexDirection: 'row', gap: StudioSpacing.md, alignItems: 'center', paddingVertical: StudioSpacing.lg },
  empty: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: StudioSpacing.lg, flexDirection: 'row', gap: StudioSpacing.md, alignItems: 'center', flexShrink: 1 },
  session: { paddingVertical: StudioSpacing.lg, gap: StudioSpacing.sm, minHeight: StudioShape.touchTarget },
  sessionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: StudioSpacing.sm },
  code: { fontFamily: 'monospace', letterSpacing: 1.5 },
  joinForm: { gap: StudioSpacing.md },
  hidden: retainedVisibility(false),
});
