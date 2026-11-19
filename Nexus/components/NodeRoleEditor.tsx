import { useEffect, useRef, useState } from 'react';
import { NodeRoleEditorView } from './session/NodeRoleEditorView';

import { sessionErrorMessage } from '@/hooks/use-studio-session';
import type { getSessionService } from '@/services/session';

type Service = Awaited<ReturnType<typeof getSessionService>>;
export function NodeRoleEditor({ service, sessionId, deviceId, role, compact = false }: { service: Service; sessionId: string; deviceId: string; role: string; compact?: boolean }) {
  const [draft, setDraft] = useState(role);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const request = useRef<string | null>(null);
  useEffect(() => { setDraft(role); }, [role]);
  useEffect(() => service.subscribe((state) => {
    if (!request.current) return;
    const event = state.lastEvent;
    if (state.connection !== 'Connected') {
      request.current = null; setBusy(false); setNotice('Sin conexión; el cambio no está confirmado.');
    } else if (event?.sessionId === sessionId && event.payload.requestId === request.current &&
        (event.type === 'SESSION_SNAPSHOT' || event.type === 'SESSION_ERROR')) {
      request.current = null; setBusy(false);
      setNotice(event.type === 'SESSION_ERROR' ? sessionErrorMessage(event.payload.code) : 'Rol confirmado por el Node (ACK).');
    }
  }), [service, sessionId]);
  return <NodeRoleEditorView deviceId={deviceId} draft={draft} busy={busy} notice={notice} compact={compact}
    onChange={setDraft} onAssign={() => {
      if (request.current) return;
      try { request.current = service.assignRole(sessionId, deviceId, draft); setBusy(true); setNotice('Esperando ACK del Node…'); }
      catch { setNotice('No se pudo enviar el rol. Usa de 1 a 64 caracteres y comprueba la conexión.'); }
    }} />;
}
