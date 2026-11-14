import { useEffect, useRef, useState } from 'react';

import { getOrCreateDeviceId } from '@/services/deviceIdentity';
import { getSessionService } from '@/services/session';
import type { SessionSnapshot } from '@/services/sessionClient';

export function sessionErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  const messages: Record<string, string> = {
    SOCKET_NOT_CONNECTED: 'El relay no está conectado. Comprueba la LAN y vuelve a conectar.',
    INVALID_MESSAGE: 'Introduce un código de seis letras o números.',
    INVALID_CODE: 'El código no corresponde a una sesión activa. Compruébalo con el Controller.',
    IDENTITY_CONFLICT: 'Este dispositivo ya tiene otra conexión activa. Cierra el otro cliente y vuelve a conectar.',
    NOT_MEMBER: 'Este dispositivo no pertenece a esta sesión. Solicita ingreso desde Studio.',
    SESSION_NOT_FOUND: 'La sesión ya no existe en el relay. Crea una nueva o solicita otro código.',
    CONTROLLER_REQUIRED: 'Sólo el Controller puede resolver solicitudes.',
    INVALID_TARGET: 'La solicitud ya no está disponible. Actualiza la sesión.',
    ALREADY_MEMBER: 'Este dispositivo ya pertenece a esa sesión. Ábrela desde Studio.',
    JOIN_PENDING: 'Ya hay una solicitud pendiente de este dispositivo. Espera al Controller.',
    SESSION_EXISTS: 'La sesión ya existe. Ábrela desde Studio.',
    ROLE_ACK_TIMEOUT: 'El Node no confirmó el rol en diez segundos. Comprueba su versión y vuelve a intentarlo.',
    ROLE_PENDING: 'Ese Node aún tiene un cambio de rol pendiente de confirmación.',
    MESSAGE_ID_CONFLICT: 'Se reutilizó un identificador para otro comando. Vuelve a intentarlo.',
    NODE_REQUIRED: 'Sólo un Node aceptado puede informar su preparación.',
    NO_REMEMBERED_SESSION: 'No hay una última sesión disponible. Ingresa con el código del Controller.',
  };
  return messages[code] ?? 'No se pudo completar la operación de sesión. Vuelve a intentarlo.';
}

export function connectionLabel(connection?: string) {
  return connection === 'Connected' ? 'Conectado' : connection === 'Connecting' ? 'Conectando…' : 'Sin conexión';
}

// Keep the shared client alive; only this screen's listener belongs to the hook.
// Deliver every event to onUpdate, even when React batches snapshot renders.
export function useStudioSession(onUpdate?: (snapshot: SessionSnapshot) => void) {
  const [service, setService] = useState<Awaited<ReturnType<typeof getSessionService>> | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [error, setError] = useState('');
  const update = useRef(onUpdate);
  update.current = onUpdate;

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void Promise.all([getSessionService(), getOrCreateDeviceId()]).then(([client, id]) => {
      if (!active) return;
      setDeviceId(id);
      setService(client);
      unsubscribe = client.subscribe((next) => {
        if (!active) return;
        setSnapshot(next);
        update.current?.(next);
      });
    }).catch(() => {
      if (active) setError('No se pudo preparar la identidad local del dispositivo. Vuelve a abrir Studio.');
    });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  return { service, snapshot, deviceId, error };
}
