import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { sessionErrorMessage } from '@/hooks/use-studio-session';
import type { getSessionService } from '@/services/session';
import { SESSION_DESCRIPTION_LIMIT, SESSION_NAME_LIMIT, isDisplayText, type Session } from '@/services/sessionProtocol';
import { sessionStyles } from './SessionUI';

export function SessionDescriptionEditor({ service, session, disabled }: {
  service: Awaited<ReturnType<typeof getSessionService>>; session: Session; disabled: boolean;
}) {
  const { sessionId } = session;
  const [draft, setDraft] = useState<{ name: string; description: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => {
    const off = service.subscribe((state) => {
      const pending = request.current;
      if (!pending) return;
      const event = state.lastEvent;
      const disconnected = state.connection !== 'Connected';
      if (!disconnected && (event?.sessionId !== sessionId || event.payload.requestId !== pending.id)) return;
      if (!disconnected && event?.type !== 'SESSION_SNAPSHOT' && event?.type !== 'SESSION_ERROR') return;
      clearTimeout(pending.timer);
      request.current = null;
      setSaving(false);
      if (disconnected) setError('Se perdió la conexión. Comprueba los datos al reconectar.');
      else if (event?.type === 'SESSION_ERROR') setError(sessionErrorMessage(event.payload.code));
      else { setError(''); setDraft(null); }
    });
    return () => { off(); if (request.current) clearTimeout(request.current.timer); request.current = null; };
  }, [service, sessionId]);

  const save = () => {
    if (!draft || disabled || request.current) return;
    const name = draft.name.trim();
    const description = draft.description.trim();
    if (!isDisplayText(name, SESSION_NAME_LIMIT) || !isDisplayText(description, SESSION_DESCRIPTION_LIMIT, true)) {
      setError('Revisa el texto del nombre y la descripción.');
      return;
    }
    const changes = {
      ...(name !== (session.name ?? '') ? { name } : {}),
      ...(description !== (session.description ?? '') ? { description } : {}),
    };
    if (!Object.keys(changes).length) { setDraft(null); return; }
    try {
      const id = service.updateSessionDetails(sessionId, changes);
      const timer = setTimeout(() => {
        request.current = null;
        setSaving(false);
        setError('Guardado sin confirmar. Actualiza la sesión para comprobar los datos.');
      }, 10000);
      request.current = { id, timer };
      setSaving(true);
      setError('');
    } catch (cause) { setError(sessionErrorMessage(cause)); }
  };

  return <View style={sessionStyles.stack}>
    {draft ? <>
      <TextInput mode="outlined" label="Nombre" value={draft.name} maxLength={SESSION_NAME_LIMIT}
        disabled={saving} onChangeText={(name) => setDraft({ ...draft, name })} />
      <TextInput mode="outlined" label="Descripción (opcional)" value={draft.description} multiline maxLength={SESSION_DESCRIPTION_LIMIT}
        disabled={saving} onChangeText={(description) => setDraft({ ...draft, description })} />
      <Button mode="contained" loading={saving} disabled={disabled || saving} onPress={save} contentStyle={sessionStyles.touch}>Guardar</Button>
      <Button disabled={saving} onPress={() => { setDraft(null); setError(''); }} contentStyle={sessionStyles.touch}>Cancelar</Button>
    </> : <Button mode="text" icon="pencil-outline" disabled={disabled} contentStyle={sessionStyles.touch} style={{ alignSelf: 'flex-start' }}
      onPress={() => { setError(''); setDraft({ name: session.name ?? '', description: session.description ?? '' }); }}>Editar nombre y descripción</Button>}
    {!!error && <Text accessibilityLiveRegion="polite" variant="bodySmall">{error}</Text>}
  </View>;
}
