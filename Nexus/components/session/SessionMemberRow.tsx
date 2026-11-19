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
  const reasons = readinessReasons(member.readiness, connected && member.online !== false);
  const ready = reasons.length === 0;
  return <View style={styles.row}>
    <View style={styles.top}>
      <Icon source={node ? 'video-outline' : 'view-dashboard-outline'} size={24} color={colors.onSurfaceVariant} />
      <View style={styles.name}>
        <Text variant="titleMedium">{node ? 'Node' : 'Controller'} · …{(member.nodeId || member.deviceId).slice(-6)}{isSelf ? ' · Este dispositivo' : ''}</Text>
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
          {member.online === false ? 'Offline · estado conservado' : 'Online en Session'}
        </Text>
      </View>
      {node && <View style={[styles.readiness, { borderColor: ready ? palette.successText : palette.warningText }]}>
        <Icon source={ready ? 'check-circle-outline' : 'alert-circle-outline'} size={16} color={ready ? palette.successText : palette.warningText} />
        <Text accessibilityLiveRegion="polite" variant="labelLarge" style={{ color: ready ? palette.successText : palette.warningText }}>
          {ready ? 'READY' : 'NO LISTO'}
        </Text>
      </View>}
    </View>
    {node && <>
      <Text variant="bodyLarge">Rol: {member.role}</Text>
      {member.requiresReadyConfirmation && <Text variant="bodyMedium" style={{ color: palette.warningText }}>
        Preparación anterior caducada. Este Node debe confirmar READY para una nueva toma.
      </Text>}
      {!ready && <Text accessibilityLiveRegion="polite" variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>{reasons.join(' · ')}</Text>}
      <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
        {member.online === false ? 'Último informe · ' : ''}
        Permiso: {member.readiness?.cameraPermission === 'granted' ? 'concedido' : member.readiness?.cameraPermission === 'denied' ? 'denegado' : 'sin comprobar'} · Cámara: {member.readiness?.cameraAvailable === true ? 'disponible' : member.readiness?.cameraAvailable === false ? 'no disponible' : 'sin comprobar'} · Motor: {member.readiness?.enginePrepared ? 'preparado' : 'sin preparar'}
      </Text>
    </>}
    <SessionDetails title="Identificadores del dispositivo">
      <Text selectable variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>deviceId: {member.deviceId}</Text>
      {member.nodeId && <Text selectable variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>nodeId: {member.nodeId}</Text>}
      {node && <Text selectable variant="bodySmall">Permiso original: {member.readiness?.cameraPermission ?? 'unknown'}</Text>}
    </SessionDetails>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  row: { gap: StudioSpacing.md },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: StudioSpacing.md },
  name: { flexGrow: 1, flexShrink: 1, gap: StudioSpacing.xs },
  readiness: { flexDirection: 'row', alignItems: 'center', gap: StudioSpacing.xs, borderWidth: 1, borderRadius: 8, padding: StudioSpacing.sm },
  identifiers: { gap: StudioSpacing.xs },
});
