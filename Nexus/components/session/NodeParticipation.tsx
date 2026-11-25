import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { useDeviceInfo } from '@/hooks/useDeviceInfo';
import { readinessReasons, type Session, type SessionMember } from '@/services/sessionProtocol';
import { SessionBadge, SessionDetails, sessionStyles } from './SessionUI';

export function NodeParticipation({ session, member, connected, children }: {
  session: Session; member: SessionMember; connected: boolean; children?: ReactNode;
}) {
  const { local } = useDeviceInfo();
  const name = local?.name?.trim() || local?.model?.trim() || member.deviceName || 'Este dispositivo';
  const online = connected && member.online !== false;
  const closed = session.state === 'closed';
  const reason = member.requiresReadyConfirmation ? 'Confirma READY para la próxima toma.' : readinessReasons(member.readiness)[0];
  return <View style={sessionStyles.stack}>
    <Text variant="titleMedium">{name}</Text>
    <Text variant="bodyMedium">{member.role === 'unassigned' ? 'Sin rol asignado' : member.role} · {session.name || session.code}</Text>
    <View style={sessionStyles.row} accessibilityLiveRegion="polite">
      <SessionBadge label={closed ? 'Sesión cerrada' : online ? 'Conectado' : 'Sin conexión'} tone={!closed && online ? 'neutral' : 'warning'} />
      {!closed && online && <SessionBadge label={reason ? 'NO LISTO' : 'READY'} tone={reason ? 'warning' : 'success'} />}
    </View>
    {!closed && online && !!reason && <Text variant="bodySmall">{reason}</Text>}
    {children}
    <SessionDetails title="Datos técnicos de participación">
      <Text selectable variant="bodySmall">deviceId: {member.deviceId}</Text>
      {member.nodeId && <Text selectable variant="bodySmall">nodeId: {member.nodeId}</Text>}
    </SessionDetails>
  </View>;
}
