import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import type { LastNodeSession } from '@/services/lastNodeSession';
import { SessionDetails, SessionNotice, sessionStyles } from './SessionUI';

export function RejoinSessionView({ last, showLast, disabled, connected, blocked, pending, notice, historyError, onResume, onRejoin }: {
  last: LastNodeSession | null; showLast: boolean; disabled: boolean; connected: boolean; blocked: boolean; pending: boolean;
  notice: string; historyError: string | null; onResume(): void; onRejoin(): void;
}) {
  return <View style={sessionStyles.stack}>
    {showLast && last && <>
      <Text variant="titleMedium">Última participación como Node · {last.code}</Text>
      <Text variant="bodyMedium">Reanudar verifica tu cuenta y membresía persistida; conserva nodeId y rol. Si no perteneces a esta Session, solicita aprobación.</Text>
      <Button mode="outlined" disabled={disabled} onPress={onResume} style={sessionStyles.control} contentStyle={sessionStyles.touch}>Reanudar participación</Button>
      {!connected && <Text variant="bodyMedium">Conecta al relay para solicitar reingreso sin escribir el código.</Text>}
      {blocked && <SessionNotice title="Conserva la captura activa" tone="warning"><Text variant="bodyMedium">Detén y guarda la captura local antes de solicitar una nueva participación.</Text></SessionNotice>}
      <Button mode="text" disabled={disabled} onPress={onRejoin} contentStyle={sessionStyles.touch}>Solicitar reingreso</Button>
      <SessionDetails title="Identificador de última Session"><Text selectable variant="bodySmall">{last.sessionId}</Text></SessionDetails>
    </>}
    {(pending || !!notice) && <Text accessibilityLiveRegion="polite" variant="bodyMedium">
      {pending ? 'Solicitud enviada · Esperando aprobación' : notice}
    </Text>}
    {!!historyError && <SessionNotice title={historyError} tone="error" />}
  </View>;
}
