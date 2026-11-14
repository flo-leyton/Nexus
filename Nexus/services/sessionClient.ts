import {
  isSessionEvent, isSessionRequest, JOIN_BY_CODE, SESSION_PROTOCOL_VERSION,
  type JoinRequest, type Session, type SessionEvent, type SessionRequest,
} from './sessionProtocol';

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
}

// One client per device, independent of Firebase, UI and transport implementation.
export function createSessionClient(deviceId: string, uuid: () => string, transport: SessionTransport) {
  let state: SessionSnapshot = { connection: 'Disconnected', sessions: {}, pending: {}, lastEvent: null };
  const listeners = new Set<(snapshot: SessionSnapshot) => void>();
  const emit = () => listeners.forEach((listener) => listener(state));
  const unsubscribeMessages = transport.subscribeMessages((raw) => {
    let event: unknown;
    try { event = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
    if (!isSessionEvent(event) || event.targetId !== deviceId) return;
    const sessions = { ...state.sessions };
    const pending = { ...state.pending };
    if (event.type === 'SESSION_SNAPSHOT') {
      sessions[event.sessionId] = event.payload.session;
      if (event.payload.pending) pending[event.sessionId] = event.payload.pending;
    } else if (event.type === 'SESSION_JOIN_PENDING') {
      pending[event.sessionId] = [...(pending[event.sessionId] || []).filter((r) => r.deviceId !== event.payload.deviceId), event.payload];
    } else if (event.type === 'SESSION_CLOSED') {
      delete sessions[event.sessionId];
      delete pending[event.sessionId];
    } else if (event.type === 'SESSION_JOIN_REJECTED') {
      pending[event.sessionId] = (pending[event.sessionId] || []).filter((r) => r.requestId !== event.payload.requestId);
    }
    if (event.type === 'SESSION_SNAPSHOT' && event.payload.session.members[deviceId]) {
      pending[event.sessionId] = (pending[event.sessionId] || []).filter((r) => r.deviceId !== deviceId);
    }
    state = { ...state, sessions, pending, lastEvent: event };
    emit();
  });
  const unsubscribeStatus = transport.subscribeStatus((connection) => {
    state = connection === 'Connected' ? { ...state, connection } :
      { connection, sessions: {}, pending: {}, lastEvent: null };
    emit();
  });
  const send = (request: SessionRequest) => {
    if (!isSessionRequest(request)) throw new Error('INVALID_MESSAGE');
    if (!transport.send(request)) throw new Error('SOCKET_NOT_CONNECTED');
    return request.messageId;
  };
  const envelope = (sessionId: string) => ({
    protocolVersion: SESSION_PROTOCOL_VERSION, messageId: uuid(), sessionId, senderId: deviceId, sentAt: Date.now(),
  });
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
      return send({ ...envelope(JOIN_BY_CODE), type: 'SESSION_JOIN_REQUEST', payload: { code: code.trim().toUpperCase() } });
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
    dispose() { unsubscribeMessages(); unsubscribeStatus(); listeners.clear(); },
  };
}
