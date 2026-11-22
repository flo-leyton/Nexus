import {
  isSessionEvent, isSessionRequest, JOIN_BY_CODE, SESSION_PROTOCOL_VERSION,
  type JoinRequest, type Session, type SessionEvent, type SessionRequest, type NodeReadiness,
  type RecordingCommand, type RecordingReport, type TakeMediaAngle, readinessReasons,
  activeTakes, activeTakeForDevice, sessionTakes, nodeTakePending, isRecordingDuration, takeFinished, type CoordinatedTake,
} from './sessionProtocol';
import type { LastNodeSession } from './lastNodeSession';

export interface SessionTransport {
  connect(): void;
  send(message: SessionRequest): boolean;
  subscribeMessages(listener: (raw: unknown) => void): () => unknown;
  subscribeStatus(listener: (status: string) => void): () => unknown;
}
export interface SessionSnapshot {
  connection: string;
  sessions: Record<string, Session>;
  pending: Record<string, JoinRequest[]>;
  lastEvent: SessionEvent | null;
  lastNodeSession: LastNodeSession | null;
  joinInFlight: boolean;
  historyError: string | null;
  mediaPersistenceError?: string | null;
}
interface SessionHistory {
  initial: LastNodeSession | null;
  initialError?: string | null;
  save(value: LastNodeSession | null): Promise<void>;
}
type Schedule = { startsAt: number; durationSeconds: number; requestId?: string; takeId?: string; error?: string };

// One client per device, independent of Firebase, UI and transport implementation.
export function createSessionClient(deviceId: string, uuid: () => string, transport: SessionTransport, history?: SessionHistory,
  mediaHistory?: { save(sessionId: string, angles: Record<string, TakeMediaAngle>): Promise<void> }) {
  let state: SessionSnapshot = { connection: 'Disconnected', sessions: {}, pending: {}, lastEvent: null,
    lastNodeSession: history?.initial ?? null, joinInFlight: false, historyError: history?.initialError ?? null };
  let joining: { messageId: string; sessionId: string; code: string } | null = null;
  let disposed = false;
  const listeners = new Set<(snapshot: SessionSnapshot) => void>();
  const roleCommands = new Map<string, Map<string, string>>();
  const captureHandlers = new Map<string, (command: RecordingCommand) => void>();
  const torchHandlers = new Map<string, (enabled: boolean) => boolean>();
  const captureCommands = new Map<string, string>();
  const captureReports = new Map<string, RecordingReport>();
  const schedules = new Map<string, Schedule>();
  const scheduleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const emit = () => listeners.forEach((listener) => listener(state));
  const cancelSchedule = (sessionId: string, error?: string) => {
    const timer = scheduleTimers.get(sessionId);
    if (timer === undefined) return false;
    clearTimeout(timer);
    scheduleTimers.delete(sessionId);
    if (error) schedules.set(sessionId, { ...schedules.get(sessionId)!, error });
    else schedules.delete(sessionId);
    return true;
  };
  const remember = (value: LastNodeSession | null) => {
    if (state.lastNodeSession?.sessionId === value?.sessionId && state.lastNodeSession?.code === value?.code) return;
    state = { ...state, lastNodeSession: value };
    if (history) void history.save(value).catch(() => {
      if (!disposed) { state = { ...state, historyError: 'No se pudo guardar la última sesión. Puedes ingresar con el código.' }; emit(); }
    });
  };
  const unsubscribeMessages = transport.subscribeMessages((raw) => {
    let event: unknown;
    try { event = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
    if (isSessionRequest(event) && event.type === 'TORCH_SET') {
      const session = state.sessions[event.sessionId];
      const member = session?.members[deviceId];
      if (state.connection !== 'Connected' || !session || session.state === 'closed' ||
          event.senderId !== session.controllerId || member?.kind !== 'node' ||
          member.online === false || event.targetId !== member.nodeId) return;
      try {
        const available = torchHandlers.get(event.sessionId)?.(event.payload.enabled) ?? false;
        send({ ...envelope(event.sessionId), type: 'TORCH_ACK', targetId: session.controllerId,
          payload: { requestId: event.messageId, available } });
      } catch { /* The Controller will time out without a receipt. */ }
      return;
    }
    if (isSessionRequest(event) && (event.type === 'START_RECORDING' || event.type === 'STOP_RECORDING') && event.targetId === deviceId) {
      const session = state.sessions[event.sessionId];
      const member = session?.members[deviceId];
      const take = session && sessionTakes(session).find((entry) => entry.takeId === event.payload.takeId);
      if (!session || session.controllerId !== event.senderId || member?.kind !== 'node' || member.online === false ||
          (event.type === 'START_RECORDING' && member.requiresReadyConfirmation) ||
          !member.nodeId || !event.payload.targetNodeIds.includes(member.nodeId) || !take ||
          take.interrupted || take.nodes[deviceId]?.connectionLost || !nodeTakePending(take, deviceId, member.nodeId)) return;
      const key = `${event.sessionId}:${event.messageId}`;
      const signature = JSON.stringify([event.type, event.payload]);
      const previous = captureCommands.get(key);
      if (previous && previous !== signature) return;
      try {
        send({ ...envelope(event.sessionId), type: 'RECORDING_ACK', targetId: session.controllerId,
          payload: { requestId: event.messageId, takeId: event.payload.takeId, command: event.type } });
        if (previous) {
          const report = captureReports.get(`${event.sessionId}:${event.payload.takeId}`);
          if (report) reportCapture(event.sessionId, session.controllerId, { ...report, requestId: event.messageId });
          return;
        }
        captureCommands.set(key, signature); // before invoking camera code, including synchronous failures
        const handler = captureHandlers.get(event.sessionId);
        if (!handler) throw new Error('Abre la Session en el Node y prepara la cámara.');
        handler(event);
      } catch (error) {
        try { reportCapture(event.sessionId, session.controllerId, { requestId: event.messageId, takeId: event.payload.takeId,
          phase: 'error', error: (error instanceof Error ? error.message : String(error)).slice(0, 256), capture: null, busy: false }); } catch { /* No network: preserve the local capture. */ }
      }
      return;
    }
    if (isSessionRequest(event) && event.type === 'ASSIGN_ROLE' && event.targetId === deviceId) {
      const session = state.sessions[event.sessionId];
      if (!session || session.controllerId !== event.senderId || session.members[deviceId]?.kind !== 'node') return;
      const seen = roleCommands.get(event.sessionId) ?? new Map<string, string>();
      // No UI side effects on retransmission; acknowledge again so the Controller can recover its confirmation.
      if (seen.has(event.messageId) && seen.get(event.messageId) !== event.payload.role) return;
      if (!seen.has(event.messageId)) { seen.set(event.messageId, event.payload.role); roleCommands.set(event.sessionId, seen); }
      try {
        send({ ...envelope(event.sessionId), type: 'SESSION_ROLE_ACK', targetId: session.controllerId, payload: { requestId: event.messageId } });
      } catch { /* Lost connection: the Controller receives no confirmation. */ }
      return;
    }
    if (!isSessionEvent(event) || event.targetId !== deviceId) return;
    const sessions = { ...state.sessions };
    const pending = { ...state.pending };
    if (event.type === 'SESSION_LIST_RESULT') {
      for (const [id, session] of Object.entries(sessions)) {
        if (session.controllerId === deviceId && !event.payload.sessionIds.includes(id)) { delete sessions[id]; delete pending[id]; }
      }
      const last = state.lastNodeSession;
      if (last && !event.payload.sessionIds.includes(last.sessionId)) {
        try { send({ ...envelope(last.sessionId), type: 'SESSION_GET', payload: {} }); }
        catch { /* Retry discovery on the next connection. */ }
      }
    }
    let closed: SessionEvent | undefined;
    if (event.type === 'SESSION_SNAPSHOT') {
      sessions[event.sessionId] = event.payload.session;
      if (mediaHistory && event.payload.session.controllerId === deviceId && event.payload.session.mediaAngles) {
        void mediaHistory.save(event.sessionId, event.payload.session.mediaAngles).catch(() => {
          if (!disposed) { state = { ...state, mediaPersistenceError: 'No se pudieron persistir los ángulos remotos. Mantén la Session y vuelve a actualizar.' }; emit(); }
        });
      }
      if (event.payload.pending) pending[event.sessionId] = event.payload.pending;
      if (event.payload.session.state === 'closed') {
        closed = { ...event, type: 'SESSION_CLOSED', payload: { requestId: event.payload.requestId } };
      } else if (event.payload.session.members[deviceId]?.kind === 'node' &&
          (event.payload.session.members[deviceId]?.online !== false || joining?.messageId === event.payload.requestId)) {
        if (state.sessions[event.sessionId]?.members[deviceId]?.kind !== 'node' || joining?.sessionId === event.sessionId ||
            joining?.messageId === event.payload.requestId) {
          remember({ sessionId: event.sessionId, code: event.payload.session.code });
        }
        if (joining?.sessionId === event.sessionId || joining?.messageId === event.payload.requestId) joining = null;
      }
    } else if (event.type === 'SESSION_JOIN_PENDING') {
      pending[event.sessionId] = [...(pending[event.sessionId] || []).filter((r) => r.deviceId !== event.payload.deviceId), event.payload];
      if (joining?.messageId === event.payload.requestId) joining.sessionId = event.sessionId;
    } else if (event.type === 'SESSION_JOIN_REJECTED') {
      pending[event.sessionId] = (pending[event.sessionId] || []).filter((r) => r.requestId !== event.payload.requestId);
      if (joining?.messageId === event.payload.requestId) joining = null;
    } else if (event.type === 'SESSION_ERROR' && joining?.messageId === event.payload.requestId) {
      if (joining.sessionId !== JOIN_BY_CODE && event.payload.code === 'SESSION_NOT_FOUND' &&
          state.lastNodeSession?.sessionId === joining.sessionId) remember(null);
      joining = null;
    }
    if (closed || event.type === 'SESSION_CLOSED') {
      cancelSchedule(event.sessionId);
      schedules.delete(event.sessionId);
      roleCommands.delete(event.sessionId);
      delete sessions[event.sessionId];
      delete pending[event.sessionId];
      if (state.lastNodeSession?.sessionId === event.sessionId) remember(null);
      if (joining?.sessionId === event.sessionId) joining = null;
    } else if (event.type === 'SESSION_SNAPSHOT' && event.payload.session.members[deviceId] && event.payload.session.members[deviceId]?.online !== false) {
      pending[event.sessionId] = (pending[event.sessionId] || []).filter((r) => r.deviceId !== deviceId);
    }
    const schedule = schedules.get(event.sessionId);
    if (event.type === 'SESSION_ERROR' && schedule?.requestId === event.payload.requestId) {
      schedules.set(event.sessionId, { ...schedule, error: event.payload.code });
    }
    state = { ...state, sessions, pending, lastEvent: closed ?? event, joinInFlight: !!joining };
    emit();
  });
  const unsubscribeStatus = transport.subscribeStatus((connection) => {
    if (connection !== 'Connected') roleCommands.clear();
    if (connection !== 'Connected') joining = null;
    if (connection !== 'Connected') {
      for (const id of scheduleTimers.keys()) cancelSchedule(id, 'SOCKET_NOT_CONNECTED');
    }
    state = connection === 'Connected' ? { ...state, connection } :
      { ...state, connection, sessions: {}, pending: {}, lastEvent: null, joinInFlight: false };
    emit();
    if (connection === 'Connected') void Promise.resolve().then(() => {
      if (!disposed && state.connection === 'Connected') discoverSessions();
    }).catch(() => { /* Explicit refresh remains available. */ });
  });
  const send = (request: SessionRequest) => {
    if (!isSessionRequest(request)) throw new Error('INVALID_MESSAGE');
    if (!transport.send(request)) throw new Error('SOCKET_NOT_CONNECTED');
    return request.messageId;
  };
  const envelope = (sessionId: string) => ({
    protocolVersion: SESSION_PROTOCOL_VERSION, messageId: uuid(), sessionId, senderId: deviceId, sentAt: Date.now(),
  });
  const discoverSessions = () => send({ ...envelope('studio-index'), type: 'SESSION_LIST', payload: {} });
  const reportCapture = (sessionId: string, controllerId: string, payload: RecordingReport) => {
    captureReports.set(`${sessionId}:${payload.takeId}`, payload);
    return send({ ...envelope(sessionId), type: 'RECORDING_STATE', targetId: controllerId, payload });
  };
  const controllerSession = (sessionId: string) => {
    const session = state.sessions[sessionId];
    if (!session || session.controllerId !== deviceId) throw new Error('CONTROLLER_REQUIRED');
    return session;
  };
  const stop = (sessionId: string, take: CoordinatedTake, targetNodeIds: string[]) =>
    send({ ...envelope(sessionId), type: 'STOP_RECORDING', payload: { takeId: take.takeId, targetNodeIds } });
  const start = (sessionId: string, targetDeviceIds?: string[], durationSeconds?: number) => {
    const session = controllerSession(sessionId);
    const targetNodeIds = Object.values(session.members).filter((m) => m.kind === 'node' && m.online !== false &&
      (!targetDeviceIds || targetDeviceIds.includes(m.deviceId))).map((m) => m.nodeId!);
    if (!targetNodeIds.length) throw new Error('NODE_NOT_READY');
    const takeId = uuid();
    const messageId = send({ ...envelope(sessionId), type: 'START_RECORDING', payload: { takeId, targetNodeIds,
      ...(durationSeconds === undefined ? {} : { durationSeconds }) } });
    return { takeId, messageId };
  };
  const scheduleTargets = (sessionId: string, targetDeviceId?: string) => {
    const session = controllerSession(sessionId);
    const ready = Object.values(session.members).filter((member) => member.kind === 'node' && member.online !== false &&
      (!targetDeviceId || member.deviceId === targetDeviceId) && !member.requiresReadyConfirmation &&
      !readinessReasons(member.readiness).length && !activeTakeForDevice(session, member.deviceId));
    if (!ready.length) throw new Error('NODE_NOT_READY');
    return ready;
  };
  const requestJoin = (code: string, sessionId = JOIN_BY_CODE) => {
    const normalized = code.trim().toUpperCase();
    const message: SessionRequest = { ...envelope(sessionId), type: 'SESSION_JOIN_REQUEST', payload: { code: normalized } };
    if (!isSessionRequest(message)) throw new Error('INVALID_MESSAGE');
    if (state.connection !== 'Connected') throw new Error('SOCKET_NOT_CONNECTED');
    const existing = state.sessions[sessionId]?.members[deviceId];
    if (existing && existing.online !== false) throw new Error('ALREADY_MEMBER');
    if (joining) {
      if (joining.code === normalized && (joining.sessionId === sessionId || sessionId === JOIN_BY_CODE)) return joining.messageId;
      throw new Error('JOIN_PENDING');
    }
    joining = { messageId: message.messageId, sessionId, code: normalized };
    state = { ...state, joinInFlight: true };
    try { send(message); }
    catch (error) { joining = null; state = { ...state, joinInFlight: false }; emit(); throw error; }
    emit();
    return message.messageId;
  };
  transport.connect();
  return {
    getSnapshot: () => state,
    subscribe(listener: (snapshot: SessionSnapshot) => void) {
      listeners.add(listener);
      listener(state);
      return () => { listeners.delete(listener); };
    },
    createSession() {
      const sessionId = uuid();
      const messageId = send({ ...envelope(sessionId), type: 'SESSION_CREATE', payload: {} });
      return { sessionId, messageId };
    },
    requestJoin(code: string) {
      return requestJoin(code);
    },
    discoverSessions,
    resumeSession(sessionId: string) {
      return send({ ...envelope(sessionId), type: 'SESSION_RESUME', payload: {} });
    },
    requestRejoin() {
      const last = state.lastNodeSession;
      if (!last) throw new Error('NO_REMEMBERED_SESSION');
      return requestJoin(last.code, last.sessionId);
    },
    acceptJoin(sessionId: string, deviceId: string, requestId: string) {
      return send({ ...envelope(sessionId), type: 'SESSION_JOIN_ACCEPT', targetId: deviceId, payload: { requestId } });
    },
    rejectJoin(sessionId: string, deviceId: string, requestId: string) {
      return send({ ...envelope(sessionId), type: 'SESSION_JOIN_REJECT', targetId: deviceId, payload: { requestId } });
    },
    refreshSession(sessionId: string) {
      return send({ ...envelope(sessionId), type: 'SESSION_GET', payload: {} });
    },
    assignRole(sessionId: string, deviceId: string, role: string) {
      return send({ ...envelope(sessionId), type: 'ASSIGN_ROLE', targetId: deviceId, payload: { role: role.trim() } });
    },
    setRemoteTorch(sessionId: string, nodeId: string, enabled: boolean) {
      const session = controllerSession(sessionId);
      if (state.connection !== 'Connected') throw new Error('SOCKET_NOT_CONNECTED');
      if (session.state === 'closed' || !Object.values(session.members).some((member) =>
          member.kind === 'node' && member.nodeId === nodeId && member.online !== false)) throw new Error('INVALID_TARGET');
      return send({ ...envelope(sessionId), type: 'TORCH_SET', targetId: nodeId, payload: { enabled } });
    },
    registerTorchHandler(sessionId: string, handler: (enabled: boolean) => boolean) {
      torchHandlers.set(sessionId, handler);
      return () => { if (torchHandlers.get(sessionId) === handler) torchHandlers.delete(sessionId); };
    },
    reportNodeState(sessionId: string, controllerId: string, readiness: NodeReadiness) {
      const member = state.sessions[sessionId]?.members[deviceId];
      return send({ ...envelope(sessionId), type: 'NODE_STATE', targetId: controllerId, payload: {
        readiness: member?.requiresReadyConfirmation ? { ...readiness, enginePrepared: false } : readiness,
        ...(member?.readyEpoch ? { readyEpoch: member.readyEpoch } : {}),
      } });
    },
    confirmNodeReady(sessionId: string, controllerId: string, readiness: NodeReadiness) {
      const member = state.sessions[sessionId]?.members[deviceId];
      if (member?.kind !== 'node' || member.online === false || readinessReasons(readiness).length) throw new Error('NODE_NOT_READY');
      return send({ ...envelope(sessionId), type: 'NODE_STATE', targetId: controllerId, payload: {
        readiness, confirmReady: true, ...(member.readyEpoch ? { readyEpoch: member.readyEpoch } : {}),
      } });
    },
    startTake: start,
    getScheduledRecording(sessionId: string) { return schedules.get(sessionId); },
    scheduleRecording(sessionId: string, delaySeconds: number, durationSeconds: number, targetDeviceId?: string) {
      if (state.connection !== 'Connected') throw new Error('SOCKET_NOT_CONNECTED');
      if (!isRecordingDuration(delaySeconds) || !isRecordingDuration(durationSeconds)) throw new Error('INVALID_RECORDING_TIMER');
      const previous = schedules.get(sessionId);
      if (previous && !previous.error) {
        const take = previous.takeId && sessionTakes(controllerSession(sessionId)).find((entry) => entry.takeId === previous.takeId);
        if (scheduleTimers.has(sessionId) || (take ? !takeFinished(take) : Date.now() < previous.startsAt + 15000)) {
          throw new Error('RECORDING_SCHEDULE_ACTIVE');
        }
      }
      const targets = scheduleTargets(sessionId, targetDeviceId);
      const schedule: Schedule = { startsAt: Date.now() + delaySeconds * 1000, durationSeconds };
      schedules.set(sessionId, schedule);
      scheduleTimers.set(sessionId, setTimeout(() => {
        scheduleTimers.delete(sessionId);
        try {
          if (Date.now() > schedule.startsAt + 2000) throw new Error('RECORDING_TIMER_EXPIRED');
          const ids = targets.map((target) => {
            const current = scheduleTargets(sessionId, target.deviceId)[0];
            if (current.nodeId !== target.nodeId || current.readyEpoch !== target.readyEpoch) throw new Error('NODE_NOT_READY');
            return current.deviceId;
          });
          const { takeId, messageId } = start(sessionId, ids, durationSeconds);
          schedules.set(sessionId, { ...schedule, takeId, requestId: messageId });
        } catch (error) {
          schedules.set(sessionId, { ...schedule, error: error instanceof Error ? error.message : 'NODE_NOT_READY' });
        }
        emit();
      }, delaySeconds * 1000));
      emit();
    },
    cancelScheduledRecording(sessionId: string) {
      if (cancelSchedule(sessionId)) emit();
    },
    stopTake(sessionId: string) {
      const session = controllerSession(sessionId);
      if (!session.take) throw new Error('TAKE_NOT_FOUND');
      return stop(sessionId, session.take, Object.values(session.take.nodes).map((n) => n.nodeId));
    },
    stopActiveTakes(sessionId: string, targetDeviceId?: string) {
      const session = controllerSession(sessionId);
      if (targetDeviceId) {
        const take = activeTakeForDevice(session, targetDeviceId);
        if (!take || take.interrupted) throw new Error('TAKE_NOT_FOUND');
        return [stop(sessionId, take, [take.nodes[targetDeviceId].nodeId])];
      }
      return activeTakes(session).filter((take) => !take.interrupted).map((take) =>
        stop(sessionId, take, Object.values(take.nodes).map((node) => node.nodeId)));
    },
    closeInterruptedTake(sessionId: string, takeId: string) {
      const session = state.sessions[sessionId];
      if (!session || session.controllerId !== deviceId) throw new Error('CONTROLLER_REQUIRED');
      return send({ ...envelope(sessionId), type: 'CLOSE_INTERRUPTED_TAKE', payload: { takeId, acknowledgeUnknown: true } });
    },
    registerCaptureHandler(sessionId: string, handler: (command: RecordingCommand) => void) {
      if (captureHandlers.has(sessionId)) throw new Error('El Node ya tiene un motor de captura para esta Session.');
      captureHandlers.set(sessionId, handler);
      return () => { if (captureHandlers.get(sessionId) === handler) captureHandlers.delete(sessionId); };
    },
    reportCapture,
    reportMedia(sessionId: string, controllerId: string, payload: TakeMediaAngle) {
      return send({ ...envelope(sessionId), type: 'MEDIA_STATE', targetId: controllerId, payload });
    },
    closeSession(sessionId: string) {
      cancelSchedule(sessionId);
      return send({ ...envelope(sessionId), type: 'SESSION_CLOSE', payload: {} });
    },
    dispose() {
      disposed = true; unsubscribeMessages(); unsubscribeStatus(); listeners.clear(); captureHandlers.clear(); torchHandlers.clear(); captureCommands.clear(); captureReports.clear();
      for (const id of scheduleTimers.keys()) cancelSchedule(id);
      schedules.clear();
    },
  };
}
