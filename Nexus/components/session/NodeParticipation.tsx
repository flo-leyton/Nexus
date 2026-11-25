import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useDeviceInfo } from '@/hooks/useDeviceInfo';
import { readinessReasons, type Session, type SessionMember } from '@/services/sessionProtocol';
import { SessionBadge, SessionDetails, SessionNotice, sessionStyles } from './SessionUI';

export function NodeParticipation({ session, member, sessionId, deviceId, nodeId, code, connected, connectionLabel,
  confirmed, closed, notice, error, onConnect, onRefresh, children }: {
  session?: Session; member?: SessionMember; sessionId: string; deviceId: string; nodeId?: string; code?: string;
  connected: boolean; connectionLabel: string; confirmed: boolean; closed: boolean; notice: string; error: boolean;
  onConnect(): void; onRefresh(): void; children?: ReactNode;
}) {
  const { local } = useDeviceInfo();
  const name = local?.name?.trim() || local?.model?.trim() || member?.deviceName || 'Este dispositivo';
  const readyKnown = confirmed && !!member && !closed;
  const reason = member?.requiresReadyConfirmation ? 'Confirma READY para la próxima toma.' : member && readinessReasons(member.readiness)[0];
  return <View style={sessionStyles.stack}>
    <Text variant="titleMedium">{name}</Text>
    <Text variant="bodyMedium">{[member?.role && member.role !== 'unassigned' ? member.role : 'Sin rol asignado',
      session?.name || session?.code || code].filter(Boolean).join(' · ')}</Text>
    <View style={sessionStyles.row} accessibilityLiveRegion="polite">
      <SessionBadge label={`Relay · ${connectionLabel}`} tone={connected ? 'neutral' : 'warning'} />
      {closed ? <SessionBadge label="Sesión cerrada" tone="warning" /> :
        !confirmed && <SessionBadge label="Participación sin confirmar" tone="warning" />}
      {readyKnown && <SessionBadge label={reason ? 'NO LISTO' : 'READY'} tone={reason ? 'warning' : 'success'} />}
    </View>
    {readyKnown && !!reason && <Text variant="bodySmall">{reason}</Text>}
    {error && !!notice && <SessionNotice title={notice} tone="error" />}
    {!connected && !closed && <Button mode="outlined" icon="connection" onPress={onConnect}
      contentStyle={sessionStyles.touch}>Conectar al relay</Button>}
    {children}
    <SessionDetails title="Datos técnicos de participación">
      {(session?.code || code) && <Text selectable variant="bodySmall">Código: {session?.code || code}</Text>}
      <Text selectable variant="bodySmall">sessionId: {sessionId}</Text>
      {!!deviceId && <Text selectable variant="bodySmall">deviceId: {deviceId}</Text>}
      {!!nodeId && <Text selectable variant="bodySmall">nodeId: {nodeId}</Text>}
      {session?.createdAt !== undefined && <Text variant="bodySmall">Creada el {new Date(session.createdAt).toLocaleDateString('es')}</Text>}
      {!!session?.description && <Text variant="bodySmall">{session.description}</Text>}
      {!error && !!notice && <Text variant="bodySmall">{notice}</Text>}
      {connected && !closed && <Button mode="text" icon="refresh" onPress={onRefresh}
        contentStyle={sessionStyles.touch}>Actualizar sesión</Button>}
    </SessionDetails>
  </View>;
}
