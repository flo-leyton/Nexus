// Pure shared contract: imported by the app and Node 24 relay (type stripping).
export const SESSION_PROTOCOL_VERSION = 1;
export const JOIN_BY_CODE = 'join-by-code';
export const RELAY_ID = 'nexus-relay';
export const NODE_STATE_TTL_MS = 15000;

export interface NodeReadiness {
  cameraPermission: 'unknown' | 'granted' | 'denied';
  cameraAvailable: boolean | null;
  enginePrepared: boolean;
  error: string | null;
}
export const INITIAL_READINESS: NodeReadiness = {
  cameraPermission: 'unknown', cameraAvailable: null, enginePrepared: false, error: null,
};
export function readinessReasons(state: NodeReadiness | undefined, connected = true): string[] {
  if (!connected) return ['Sin conexión al relay'];
  if (!state) return ['El Node aún no ha informado su estado'];
  const reasons: string[] = [];
  if (state.cameraPermission !== 'granted') reasons.push(state.cameraPermission === 'denied' ? 'Permiso de cámara denegado' : 'Permiso de cámara sin comprobar');
  if (state.cameraAvailable !== true) reasons.push(state.cameraAvailable === false ? 'Cámara no disponible' : 'Disponibilidad de cámara sin comprobar');
  if (!state.enginePrepared) reasons.push('Motor de captura sin preparar');
  if (state.error) reasons.push(state.error);
  return reasons;
}

export type SessionState = 'draft' | 'joining' | 'preparing' | 'ready' | 'recording' | 'finishing' | 'completed' | 'failed';
export interface SessionMember {
  deviceId: string;
  nodeId: string | null; // Controller has no NodeId; Nodes receive a session-scoped ID.
  kind: 'controller' | 'node';
  role: string;
  readiness?: NodeReadiness;
}
export interface Session {
  sessionId: string;
  controllerId: string;
  code: string;
  state: SessionState;
  members: Record<string, SessionMember>;
}
export interface JoinRequest {
  deviceId: string;
  requestId: string;
}
export interface NexusMessage<T = unknown> {
  protocolVersion: number;
  messageId: string;
  type: string;
  sessionId: string;
  senderId: string;
  targetId?: string;
  sentAt: number;
  payload: T;
}
export type SessionRequest =
  | (NexusMessage<Record<string, never>> & { type: 'SESSION_CREATE' | 'SESSION_GET' })
  | (NexusMessage<{ code: string }> & { type: 'SESSION_JOIN_REQUEST' })
  | (NexusMessage<{ requestId: string }> & { type: 'SESSION_JOIN_ACCEPT' | 'SESSION_JOIN_REJECT' | 'SESSION_ROLE_ACK'; targetId: string })
  | (NexusMessage<{ role: string }> & { type: 'ASSIGN_ROLE'; targetId: string })
  | (NexusMessage<{ readiness: NodeReadiness }> & { type: 'NODE_STATE'; targetId: string });
export type SessionEvent =
  | (NexusMessage<{ requestId: string; session: Session; pending?: JoinRequest[] }> & { type: 'SESSION_SNAPSHOT' })
  | (NexusMessage<{ requestId: string; deviceId: string }> & { type: 'SESSION_JOIN_PENDING' })
  | (NexusMessage<{ requestId: string }> & { type: 'SESSION_JOIN_REJECTED' | 'SESSION_CLOSED' })
  | (NexusMessage<{ requestId: string; code: string }> & { type: 'SESSION_ERROR' });

export function isNodeRole(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 64 && !/[\x00-\x1f\x7f]/.test(value);
}
export function isNodeReadiness(value: unknown): value is NodeReadiness {
  if (!isRecord(value) || Object.keys(value).length !== 4) return false;
  return ['unknown', 'granted', 'denied'].includes(String(value.cameraPermission)) &&
    (value.cameraAvailable === null || typeof value.cameraAvailable === 'boolean') &&
    typeof value.enginePrepared === 'boolean' && (value.error === null || (typeof value.error === 'string' && value.error.length <= 256)) &&
    (!value.enginePrepared || (value.cameraPermission === 'granted' && value.cameraAvailable === true && value.error === null));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function isProtocolId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) &&
    !['__proto__', 'constructor', 'prototype'].includes(value);
}
export function isJoinCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9]{6}$/.test(value);
}
export function isSessionEnvelope(value: unknown): value is NexusMessage<Record<string, unknown>> {
  return isRecord(value) && value.protocolVersion === SESSION_PROTOCOL_VERSION &&
    isProtocolId(value.messageId) && isProtocolId(value.sessionId) && isProtocolId(value.senderId) &&
    typeof value.type === 'string' && Number.isSafeInteger(value.sentAt) && (value.sentAt as number) > 0 &&
    (value.targetId === undefined || isProtocolId(value.targetId)) && isRecord(value.payload);
}
export function isSessionRequest(value: unknown): value is SessionRequest {
  if (!isSessionEnvelope(value)) return false;
  const keys = Object.keys(value.payload);
  switch (value.type) {
    case 'SESSION_CREATE':
      return value.sessionId !== JOIN_BY_CODE && !value.targetId && keys.length === 0;
    case 'SESSION_GET':
      return value.sessionId !== JOIN_BY_CODE && !value.targetId && keys.length === 0;
    case 'SESSION_JOIN_REQUEST':
      return value.sessionId === JOIN_BY_CODE && !value.targetId && keys.length === 1 && isJoinCode(value.payload.code);
    case 'SESSION_JOIN_ACCEPT':
    case 'SESSION_JOIN_REJECT':
    case 'SESSION_ROLE_ACK':
      return value.sessionId !== JOIN_BY_CODE && !!value.targetId && keys.length === 1 && isProtocolId(value.payload.requestId);
    case 'ASSIGN_ROLE':
      return value.sessionId !== JOIN_BY_CODE && !!value.targetId && keys.length === 1 && isNodeRole(value.payload.role);
    case 'NODE_STATE':
      return value.sessionId !== JOIN_BY_CODE && !!value.targetId && keys.length === 1 && isNodeReadiness(value.payload.readiness);
    default: return false;
  }
}

export function isSessionEvent(value: unknown): value is SessionEvent {
  if (!isSessionEnvelope(value) || value.senderId !== RELAY_ID || !value.targetId ||
      !isProtocolId(value.payload.requestId)) return false;
  const p = value.payload;
  switch (value.type) {
    case 'SESSION_ERROR': return typeof p.code === 'string';
    case 'SESSION_JOIN_PENDING': return isProtocolId(p.deviceId);
    case 'SESSION_JOIN_REJECTED':
    case 'SESSION_CLOSED': return true;
    case 'SESSION_SNAPSHOT': {
      const s = p.session;
      if (!isRecord(s) || s.sessionId !== value.sessionId || !isProtocolId(s.controllerId) ||
          !isJoinCode(s.code) || !['draft', 'joining', 'preparing', 'ready', 'recording', 'finishing', 'completed', 'failed'].includes(String(s.state)) ||
          !isRecord(s.members)) return false;
      const members = Object.entries(s.members);
      return members.filter(([, m]) => isRecord(m) && m.kind === 'controller').length === 1 &&
        members.every(([id, m]) => isProtocolId(id) && isRecord(m) && m.deviceId === id &&
          isNodeRole(m.role) && (m.readiness === undefined || isNodeReadiness(m.readiness)) && (m.kind === 'controller'
            ? id === s.controllerId && m.nodeId === null : m.kind === 'node' && isProtocolId(m.nodeId))) &&
        (p.pending === undefined || (Array.isArray(p.pending) && p.pending.every((r) =>
          isRecord(r) && isProtocolId(r.deviceId) && isProtocolId(r.requestId))));
    }
    default: return false;
  }
}
