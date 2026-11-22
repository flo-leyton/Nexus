import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, RadioButton, Text, TextInput } from 'react-native-paper';
import { sessionErrorMessage } from '@/hooks/use-studio-session';
import type { getSessionService } from '@/services/session';
import { isRecordingDuration, sessionTakes, takeFinished, type Session } from '@/services/sessionProtocol';
import { SessionSection, sessionStyles } from './SessionUI';

export function ScheduledRecordingPanel({ service, session, cameras, disabled }: {
  service: Awaited<ReturnType<typeof getSessionService>>;
  session: Session;
  cameras: { deviceId: string; label: string; ready: boolean }[];
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState('all');
  const [delay, setDelay] = useState('5');
  const [duration, setDuration] = useState('10');
  const [error, setError] = useState('');
  const [schedule, setSchedule] = useState(() => service.getScheduledRecording(session.sessionId));
  const [now, setNow] = useState(Date.now);
  useEffect(() => service.subscribe(() => setSchedule(service.getScheduledRecording(session.sessionId))), [service, session.sessionId]);
  const take = schedule && sessionTakes(session).find((entry) => entry.takeId === schedule.takeId);
  const waiting = !!schedule && !schedule.takeId && !schedule.error;
  const launching = !!schedule?.takeId && !take && !schedule.error && now < schedule.startsAt + 15000;
  useEffect(() => {
    if (!waiting && !launching) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [waiting, launching, schedule]);
  const nodes = Object.values(take?.nodes ?? {});
  const ready = cameras.some((camera) => camera.ready && (target === 'all' || camera.deviceId === target));
  const validSeconds = (text: string) => /^\d+$/.test(text) && isRecordingDuration(Number(text));
  const status = schedule?.error ? sessionErrorMessage(schedule.error)
    : waiting ? `Comienza en ${Math.max(0, Math.ceil((schedule.startsAt - now) / 1000))} s`
      : launching ? 'Iniciando grabación programada…'
        : take?.interrupted || nodes.some((node) => node.connectionLost) ? 'Grabación interrumpida. Comprueba los originales en las cámaras.'
          : nodes.some((node) => node.phase === 'recording') ? 'Grabación programada en curso'
            : nodes.some((node) => node.phase === 'saving') ? 'Guardando grabación programada…'
              : nodes.length && nodes.every((node) => node.phase === 'saved') ? 'Grabación programada guardada'
                : take && !takeFinished(take) ? 'Esperando resultado de las cámaras…'
                  : schedule ? 'Resultado de la grabación programada sin confirmar' : '';
  return <SessionSection title="Programar grabación">
    {!!status && <Text accessibilityLiveRegion="polite" variant="bodyMedium">{status}</Text>}
    {waiting && <Button mode="outlined" onPress={() => service.cancelScheduledRecording(session.sessionId)}>Cancelar programación</Button>}
    {!waiting && !launching && (!take || takeFinished(take)) && (editing ? <>
      <RadioButton.Group value={target} onValueChange={setTarget}>
        <RadioButton.Item label="Todas las cámaras preparadas" value="all" />
        {cameras.map((camera) => <RadioButton.Item key={camera.deviceId} value={camera.deviceId} label={camera.label} disabled={!camera.ready} />)}
      </RadioButton.Group>
      <View style={sessionStyles.stack}>
        <TextInput mode="outlined" label="Cuenta regresiva (segundos)" keyboardType="number-pad" value={delay} onChangeText={setDelay} />
        <TextInput mode="outlined" label="Duración (segundos)" keyboardType="number-pad" value={duration} onChangeText={setDuration} />
      </View>
      {!!error && <Text variant="bodyMedium">{error}</Text>}
      <Button mode="contained" disabled={disabled || !ready || !validSeconds(delay) || !validSeconds(duration)} onPress={() => {
        try {
          setNow(Date.now());
          service.scheduleRecording(session.sessionId, Number(delay), Number(duration), target === 'all' ? undefined : target);
          setError('');
          setEditing(false);
        } catch (cause) { setError(sessionErrorMessage(cause)); }
      }}>Programar</Button>
    </> : <Button mode="outlined" disabled={disabled || !cameras.some((camera) => camera.ready)}
      onPress={() => setEditing(true)}>Configurar grabación</Button>)}
  </SessionSection>;
}
