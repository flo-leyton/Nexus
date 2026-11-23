import { useEffect, useRef, useState } from 'react';

import { getOrCreateDeviceId } from '@/services/deviceIdentity';
import { getSessionService } from '@/services/session';
import type { SessionSnapshot } from '@/services/sessionClient';
import { getSocketError, subscribeToSocketStatus } from '@/services/socket';

export function sessionErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  const messages: Record<string, string> = {
    PHOTO_BUSY: 'La cámara está tomando o guardando una foto. Espera antes de enviar otra orden.',
    INVALID_RECORDING_TIMER: 'Introduce segundos enteros entre 1 y 3600.',
    RECORDING_TIMER_EXPIRED: 'La cuenta regresiva venció mientras la aplicación estaba suspendida.',
    RECORDING_SCHEDULE_ACTIVE: 'Ya hay una grabación programada en curso.',
    NODE_NOT_READY: 'La cámara debe estar conectada, detenida y preparada.',
    COMMAND_EXPIRED: 'El comando pertenece a una conexión interrumpida y ha caducado. No se repetirá ni confirmará.',
    READY_CONFIRMATION_REQUIRED: 'La preparación anterior caducó. El Node debe confirmar READY para una nueva toma.',
    STORE_UNAVAILABLE: 'El relay no pudo guardar el cambio en RTDB. No se confirmó: vuelve a intentarlo cuando se recupere la base.',
    STORE_RECOVERY_REQUIRED: 'El resultado durable requiere recuperar el relay. No repitas REC; revisa el servidor y el Node.',
    REJOIN_REQUIRED: 'El Node está offline en esta Session. Solicita reingreso y espera aprobación.',
    SESSION_IS_CLOSED: 'La Session está cerrada. Su historial se conserva, pero no admite nuevos comandos.',
    TAKE_INTERRUPTED: 'La toma se interrumpió al reiniciar el relay. Revisa los originales y cierra la toma explícitamente.',
    SOCKET_NOT_CONNECTED: 'El relay no está conectado. Comprueba la LAN y vuelve a conectar.',
    INVALID_MESSAGE: 'Introduce un código de seis letras o números.',
    INVALID_CODE: 'El código no corresponde a una sesión activa. Compruébalo con el Controller.',
    IDENTITY_CONFLICT: 'Este dispositivo ya tiene otra conexión activa. Cierra el otro cliente y vuelve a conectar.',
    NOT_MEMBER: 'Este dispositivo no pertenece a esta sesión. Solicita ingreso desde Studio.',
    SESSION_NOT_FOUND: 'La sesión ya no existe en el relay. Crea una nueva o solicita otro código.',
    CONTROLLER_REQUIRED: 'Sólo el Controller puede resolver solicitudes.',
    INVALID_TARGET: 'La solicitud ya no está disponible. Actualiza la sesión.',
    ALREADY_MEMBER: 'Este dispositivo ya pertenece a esa sesión. Ábrela desde Studio y reanuda tu participación si aparece offline.',
    TAKE_ACTIVE: 'La toma todavía tiene resultados pendientes. Espera el guardado o revisa la captura en la cámara.',
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
  const [socketError, setSocketError] = useState<string | null>(null);
  useEffect(() => subscribeToSocketStatus(() => setSocketError(getSocketError())), []);
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

  return { service, snapshot, deviceId, error: socketError || error };
}
