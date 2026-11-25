import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { StudioSpacing, StudioUI } from '@/constants/studio-ui';
import { readinessReasons, type SessionMember } from '@/services/sessionProtocol';
import { SessionDetails } from './SessionUI';

type Props = { member: SessionMember; connected: boolean; isSelf: boolean; children?: ReactNode };

/** Session membership is the source; legacy device presence never determines READY. */
export function SessionMemberRow({ member, connected, isSelf, children }: Props) {
  const { colors, dark } = useTheme();
  const palette = StudioUI[dark ? 'dark' : 'light'];
  const node = member.kind === 'node';
  const online = connected && member.online !== false;
  const reasons = readinessReasons(member.readiness, online);
  if (node && online && member.requiresReadyConfirmation) reasons.unshift('Confirma READY en el Node');
  const ready = reasons.length === 0;
  return <View style={styles.row}>
    <View style={styles.top}>
      <Icon source={node ? 'video-outline' : 'view-dashboard-outline'} size={24} color={colors.onSurfaceVariant} />
      <View style={styles.name}>
        <Text variant="titleMedium">{member.deviceName || (isSelf ? 'Este dispositivo' : node ? `Cámara · …${member.deviceId.slice(-6)}` : 'Controller')}</Text>
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
          {node ? (member.role === 'unassigned' ? 'Sin rol asignado' : member.role) : online ? 'Conectado' : 'Desconectado'}
        </Text>
      </View>
      {node && <View style={[styles.readiness, { borderColor: ready ? palette.successText : palette.warningText }]}>
        <Icon source={ready ? 'check-circle-outline' : 'alert-circle-outline'} size={16} color={ready ? palette.successText : palette.warningText} />
        <Text accessibilityLiveRegion="polite" variant="labelLarge" style={{ color: ready ? palette.successText : palette.warningText }}>
          {ready ? 'READY' : 'NO LISTO'}
        </Text>
      </View>}
    </View>
    {node && !ready && <Text accessibilityLiveRegion="polite" variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>{reasons[0]}</Text>}
    {children}
    <SessionDetails title="Datos técnicos">
      <Text selectable variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>deviceId: {member.deviceId}</Text>
      {member.nodeId && <Text selectable variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>nodeId: {member.nodeId}</Text>}
      {node && <>
        <Text variant="bodySmall">Permiso: {member.readiness?.cameraPermission === 'granted' ? 'concedido' : member.readiness?.cameraPermission === 'denied' ? 'denegado' : 'sin comprobar'} · Cámara: {member.readiness?.cameraAvailable === true ? 'disponible' : member.readiness?.cameraAvailable === false ? 'no disponible' : 'sin comprobar'} · Motor: {member.readiness?.enginePrepared ? 'preparado' : 'sin preparar'}</Text>
        {!!reasons.length && <Text variant="bodySmall">{reasons.join(' · ')}</Text>}
      </>}
    </SessionDetails>
  </View>;
}

const styles = StyleSheet.create({
  row: { gap: StudioSpacing.xs },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: StudioSpacing.md },
  name: { flexGrow: 1, flexShrink: 1, gap: StudioSpacing.xs },
  readiness: { flexDirection: 'row', alignItems: 'center', gap: StudioSpacing.xs, borderWidth: 1, borderRadius: 8, padding: StudioSpacing.sm },
});
