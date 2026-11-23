// Pure shared contract: imported by the app and Node 24 relay (type stripping).
import type { CaptureUpload } from '../types/media';
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

export type SessionState = 'draft' | 'joining' | 'preparing' | 'ready' | 'recording' | 'finishing' | 'completed' | 'failed' | 'closed';
export interface SessionMember {
  readyEpoch?: string;
  requiresReadyConfirmation?: boolean;
  uid?: string;
  online?: boolean;
  deviceId: string;
  nodeId: string | null; // Controller has no NodeId; Nodes receive a session-scoped ID.
  kind: 'controller' | 'node';
  role: string;
  readiness?: NodeReadiness;
}
export interface Session {
  closedAt?: number;
  sessionId: string;
  controllerId: string;
  code: string;
  state: SessionState;
  members: Record<string, SessionMember>;
  take?: CoordinatedTake; // Most recently started take.
  takeHistory?: CoordinatedTake[]; // Older takes in start order, including any still in progress.
  mediaAngles?: Record<string, TakeMediaAngle>;
}
export interface TakeMediaAngle {
  clipId: string;
  takeId: string;
  deviceId: string;
  nodeId: string;
  bytes: number;
  revision: number;
  upload: CaptureUpload;
  role?: string;
}
export function isCloudinaryVideoUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/video\/upload\/[^\s]+$/.test(value);
}
export function isCloudinaryImageUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/[^\s]+$/.test(value);
}
export function isCaptureUpload(value: unknown, resourceType: 'image' | 'video' = 'video'): value is CaptureUpload {
  if (!isRecord(value)) return false;
  if (['local', 'queued', 'uploading'].includes(String(value.state))) return Object.keys(value).length === 1;
  if (value.state === 'failed' || value.state === 'uncertain') return Object.keys(value).length === 2 && typeof value.error === 'string' && value.error.length <= 512;
  return value.state === 'uploaded' && Object.keys(value).length === 3 && typeof value.publicId === 'string' &&
    value.publicId.trim().length > 0 && value.publicId.length <= 512 &&
    (resourceType === 'image' ? isCloudinaryImageUrl(value.url) : isCloudinaryVideoUrl(value.url));
}
export function isTakeMediaAngle(value: unknown): value is TakeMediaAngle {
  return isRecord(value) && Object.keys(value).every((key) => ['clipId', 'takeId', 'deviceId', 'nodeId', 'bytes', 'revision', 'upload', 'role'].includes(key)) &&
    isProtocolId(value.clipId) && isProtocolId(value.takeId) && isProtocolId(value.deviceId) && isProtocolId(value.nodeId) &&
    Number.isSafeInteger(value.bytes) && Number(value.bytes) > 0 && Number.isSafeInteger(value.revision) && Number(value.revision) >= 0 &&
    isCaptureUpload(value.upload) && (value.role === undefined || isNodeRole(value.role));
}
export type RecordingCommand = Extract<SessionRequest, { type: 'START_RECORDING' | 'STOP_RECORDING' }>;
export type RecordingPhase = 'starting' | 'recording' | 'saving' | 'saved' | 'error';
export interface CaptureReference { id: string; localUri?: string; bytes: number }
export interface TakeNode {
  connectionLost?: boolean;
  nodeId: string;
  role?: string;
  phase: 'pending' | RecordingPhase | 'disconnected';
  startReceived: boolean;
  stopReceived: boolean;
  busy: boolean;
  error: string | null;
  capture: CaptureReference | null;
}
export interface CoordinatedTake {
  interrupted?: { at: number; reason: 'relay-restarted' | 'connection-lost' };
  takeId: string;
  startMessageId: string;
  stopMessageId: string | null;
  nodes: Record<string, TakeNode>; // keyed by deviceId; membership is frozen at REC
  closed?: { messageId: string; at: number; unconfirmedNodeIds: string[] };
}
export function takeFinished(take: CoordinatedTake | undefined): boolean {
  return !take || !!take.closed || Object.values(take.nodes).every((n) => !n.busy && ['saved', 'error'].includes(n.phase));
}
export function isRecordingDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 3600;
}
export function sessionTakes(session: Pick<Session, 'take' | 'takeHistory'>): CoordinatedTake[] {
  return [...(session.take ? [session.take] : []), ...(session.takeHistory ?? [])];
}
export function activeTakes(session: Pick<Session, 'take' | 'takeHistory'>): CoordinatedTake[] {
  return sessionTakes(session).filter((take) => !takeFinished(take));
}
export function activeTakeForDevice(session: Pick<Session, 'take' | 'takeHistory'>, deviceId: string) {
  return activeTakes(session).find((take) => nodeTakePending(take, deviceId, take.nodes[deviceId]?.nodeId));
}
export function nodeTakePending(take: CoordinatedTake | undefined, deviceId: string, nodeId: string | undefined): boolean {
  const node = take?.nodes[deviceId];
  return !!node && node.nodeId === nodeId && !take?.closed && (node.busy || !['saved', 'error'].includes(node.phase));
}
export interface RecordingReport {
  requestId: string;
  takeId: string;
  phase: RecordingPhase;
  error: string | null;
  capture: CaptureReference | null;
  busy: boolean;
}
export interface JoinRequest {
  online?: boolean;
  controllerOnline?: boolean;
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
  | (NexusMessage<Record<string, never>> & { type: 'SESSION_CREATE' | 'SESSION_GET' | 'SESSION_CLOSE' | 'SESSION_LIST' | 'SESSION_RESUME' })
  | (NexusMessage<{ code: string }> & { type: 'SESSION_JOIN_REQUEST' })
  | (NexusMessage<{ requestId: string }> & { type: 'SESSION_JOIN_ACCEPT' | 'SESSION_JOIN_REJECT' | 'SESSION_ROLE_ACK'; targetId: string })
  | (NexusMessage<{ role: string }> & { type: 'ASSIGN_ROLE'; targetId: string })
  | (NexusMessage<{ enabled: boolean }> & { type: 'TORCH_SET'; targetId: string })
  | (NexusMessage<{ update?: ZoomValue }> & { type: 'ZOOM_REQUEST'; targetId: string })
  | (NexusMessage<ZoomReport> & { type: 'ZOOM_REPORT'; targetId: string })
  | (NexusMessage<Record<string, never>> & { type: 'PHOTO_CAPTURE'; targetId: string })
  | (NexusMessage<PhotoResult> & { type: 'PHOTO_REPORT'; targetId: string })
  | (NexusMessage<{ requestId: string; available: boolean }> & { type: 'TORCH_ACK'; targetId: string })
  | (NexusMessage<{ readiness: NodeReadiness; readyEpoch?: string; confirmReady?: true }> & { type: 'NODE_STATE'; targetId: string })
  | (NexusMessage<{ takeId: string; targetNodeIds: string[]; durationSeconds?: number }> & { type: 'START_RECORDING' })
  | (NexusMessage<{ takeId: string; targetNodeIds: string[] }> & { type: 'STOP_RECORDING' })
  | (NexusMessage<{ takeId: string; acknowledgeUnknown: true }> & { type: 'CLOSE_INTERRUPTED_TAKE' })
  | (NexusMessage<{ requestId: string; takeId: string; command: 'START_RECORDING' | 'STOP_RECORDING' }> & { type: 'RECORDING_ACK'; targetId: string })
  | (NexusMessage<RecordingReport> & { type: 'RECORDING_STATE'; targetId: string })
  | (NexusMessage<TakeMediaAngle> & { type: 'MEDIA_STATE'; targetId: string });
export type SessionEvent =
  | (NexusMessage<{ requestId: string; session: Session; pending?: JoinRequest[] }> & { type: 'SESSION_SNAPSHOT' })
  | (NexusMessage<JoinRequest> & { type: 'SESSION_JOIN_PENDING' })
  | (NexusMessage<{ requestId: string; sessionIds: string[] }> & { type: 'SESSION_LIST_RESULT' })
  | (NexusMessage<{ requestId: string }> & { type: 'SESSION_JOIN_REJECTED' | 'SESSION_CLOSED' })
  | (NexusMessage<{ requestId: string; angle: TakeMediaAngle }> & { type: 'MEDIA_ACCEPTED' })
  | (NexusMessage<{ requestId: string; nodeId: string; enabled: boolean; available: boolean }> & { type: 'TORCH_RESULT' })
  | (NexusMessage<ZoomReport & { nodeId: string }> & { type: 'ZOOM_STATE' })
  | (NexusMessage<PhotoResult & { nodeId: string }> & { type: 'PHOTO_RESULT' })
  | (NexusMessage<{ requestId: string; code: string }> & { type: 'SESSION_ERROR' });

export type ZoomValue = { percent: number; revision: number };
type ZoomReport = { requestId: string; value: ZoomValue | null };

function isZoomValue(value: unknown): value is ZoomValue {
  return isRecord(value) && Object.keys(value).length === 2 && typeof value.percent === 'number' &&
    Number.isInteger(value.percent) && value.percent >= 0 && value.percent <= 100 &&
    typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision > 0;
}

export type PhotoResult = { requestId: string } & (
  { status: 'received' } | { status: 'saved'; photoId: string } | { status: 'error'; error: string }
);
function isPhotoResult(value: Record<string, unknown>, extraKeys = 0): boolean {
  const keys = Object.keys(value).length - extraKeys;
  return isProtocolId(value.requestId) && ((value.status === 'received' && keys === 2) ||
    (value.status === 'saved' && keys === 3 && isProtocolId(value.photoId)) ||
    (value.status === 'error' && keys === 3 && typeof value.error === 'string' && value.error.length <= 256));
}

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
export function isCaptureReference(value: unknown): value is CaptureReference {
  return isRecord(value) && Object.keys(value).every((key) => ['id', 'bytes', 'localUri'].includes(key)) && isProtocolId(value.id) &&
    (value.localUri === undefined || (typeof value.localUri === 'string' && value.localUri.startsWith('file://') && value.localUri.length <= 4096)) &&
    typeof value.bytes === 'number' && Number.isSafeInteger(value.bytes) && value.bytes > 0;
}
export function isRecordingReport(value: unknown): value is RecordingReport {
  return isRecord(value) && Object.keys(value).length === 6 && isProtocolId(value.requestId) && isProtocolId(value.takeId) && typeof value.busy === 'boolean' &&
    ['starting', 'recording', 'saving', 'saved', 'error'].includes(String(value.phase)) &&
    (value.phase === 'error' ? typeof value.error === 'string' && value.error.length > 0 && value.error.length <= 256 : value.error === null) &&
    (value.phase === 'saved' ? !value.busy && isCaptureReference(value.capture) : value.capture === null);
}
export function isCoordinatedTake(value: unknown): value is CoordinatedTake {
  if (!isRecord(value) || !isProtocolId(value.takeId) || !isProtocolId(value.startMessageId) ||
      !(value.stopMessageId === null || isProtocolId(value.stopMessageId)) || !isRecord(value.nodes) || !Object.keys(value.nodes).length) return false;
  const nodes = value.nodes;
  if (value.interrupted !== undefined && (!isRecord(value.interrupted) || !['relay-restarted', 'connection-lost'].includes(String(value.interrupted.reason)) || !Number.isSafeInteger(value.interrupted.at) || Number(value.interrupted.at) <= 0)) return false;
  if (value.closed !== undefined && (!isRecord(value.closed) || !isProtocolId(value.closed.messageId) ||
      !Number.isSafeInteger(value.closed.at) || Number(value.closed.at) <= 0 || !Array.isArray(value.closed.unconfirmedNodeIds) ||
      !value.closed.unconfirmedNodeIds.every((id) => isProtocolId(id) && Object.values(nodes).some((n) => isRecord(n) && n.nodeId === id)))) return false;
  return Object.entries(value.nodes).every(([id, node]) => isProtocolId(id) && isRecord(node) && isProtocolId(node.nodeId) &&
    ['pending', 'starting', 'recording', 'saving', 'saved', 'error', 'disconnected'].includes(String(node.phase)) &&
    typeof node.startReceived === 'boolean' && typeof node.stopReceived === 'boolean' && typeof node.busy === 'boolean' &&
    (node.connectionLost === undefined || typeof node.connectionLost === 'boolean') &&
    (node.error === null || (typeof node.error === 'string' && node.error.length <= 256)) &&
    (node.phase === 'saved' ? !node.busy && isCaptureReference(node.capture) : node.capture === null));
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
    case 'SESSION_CLOSE':
    case 'SESSION_LIST':
    case 'SESSION_RESUME':
      return value.sessionId !== JOIN_BY_CODE && !value.targetId && keys.length === 0;
    case 'SESSION_JOIN_REQUEST':
      // JOIN_BY_CODE for a new session; a concrete ID pins a remembered rejoin to that exact session.
      return !value.targetId && keys.length === 1 && isJoinCode(value.payload.code);
    case 'SESSION_JOIN_ACCEPT':
    case 'SESSION_JOIN_REJECT':
    case 'SESSION_ROLE_ACK':
      return value.sessionId !== JOIN_BY_CODE && !!value.targetId && keys.length === 1 && isProtocolId(value.payload.requestId);
    case 'ASSIGN_ROLE':
      return value.sessionId !== JOIN_BY_CODE && !!value.targetId && keys.length === 1 && isNodeRole(value.payload.role);
    case 'TORCH_SET':
      return value.sessionId !== JOIN_BY_CODE && !!value.targetId && keys.length === 1 && typeof value.payload.enabled === 'boolean';
    case 'ZOOM_REQUEST':
      return value.sessionId !== JOIN_BY_CODE && !!value.targetId &&
        (keys.length === 0 || (keys.length === 1 && isZoomValue(value.payload.update)));
    case 'ZOOM_REPORT':
      return value.sessionId !== JOIN_BY_CODE && !!value.targetId && keys.length === 2 &&
        isProtocolId(value.payload.requestId) && (value.payload.value === null || isZoomValue(value.payload.value));
    case 'PHOTO_CAPTURE':
      return value.sessionId !== JOIN_BY_CODE && !!value.targetId && keys.length === 0;
    case 'PHOTO_REPORT':
      return value.sessionId !== JOIN_BY_CODE && !!value.targetId && isPhotoResult(value.payload);
    case 'TORCH_ACK':
      return value.sessionId !== JOIN_BY_CODE && !!value.targetId && keys.length === 2 &&
        isProtocolId(value.payload.requestId) && typeof value.payload.available === 'boolean';
    case 'NODE_STATE':
      return value.sessionId !== JOIN_BY_CODE && !!value.targetId && keys.every((k) => ['readiness', 'readyEpoch', 'confirmReady'].includes(k)) && isNodeReadiness(value.payload.readiness) &&
        (value.payload.readyEpoch === undefined || isProtocolId(value.payload.readyEpoch)) && (value.payload.confirmReady === undefined || value.payload.confirmReady === true);
    case 'START_RECORDING':
    case 'STOP_RECORDING':
      return value.sessionId !== JOIN_BY_CODE && keys.every((key) => key === 'takeId' || key === 'targetNodeIds' ||
        (key === 'durationSeconds' && value.type === 'START_RECORDING' && isRecordingDuration(value.payload.durationSeconds))) &&
        isProtocolId(value.payload.takeId) &&
        Array.isArray(value.payload.targetNodeIds) && value.payload.targetNodeIds.length > 0 &&
        value.payload.targetNodeIds.every(isProtocolId) && new Set(value.payload.targetNodeIds).size === value.payload.targetNodeIds.length;
    case 'CLOSE_INTERRUPTED_TAKE':
      return value.sessionId !== JOIN_BY_CODE && !value.targetId && keys.length === 2 &&
        isProtocolId(value.payload.takeId) && value.payload.acknowledgeUnknown === true;
    case 'RECORDING_ACK':
      return !!value.targetId && keys.length === 3 && isProtocolId(value.payload.takeId) && isProtocolId(value.payload.requestId) &&
        ['START_RECORDING', 'STOP_RECORDING'].includes(String(value.payload.command));
    case 'RECORDING_STATE':
      return !!value.targetId && isRecordingReport(value.payload);
    case 'MEDIA_STATE':
      return !!value.targetId && value.sessionId !== JOIN_BY_CODE && value.payload.role === undefined && isTakeMediaAngle(value.payload);
    default: return false;
  }
}

export function isSessionEvent(value: unknown): value is SessionEvent {
  if (!isSessionEnvelope(value) || value.senderId !== RELAY_ID || !value.targetId ||
      !isProtocolId(value.payload.requestId)) return false;
  const p = value.payload;
  switch (value.type) {
    case 'SESSION_ERROR': return typeof p.code === 'string';
    case 'SESSION_LIST_RESULT': return Array.isArray(p.sessionIds) && p.sessionIds.every(isProtocolId);
    case 'MEDIA_ACCEPTED': return isTakeMediaAngle(p.angle);
    case 'TORCH_RESULT': return isProtocolId(p.nodeId) && typeof p.enabled === 'boolean' && typeof p.available === 'boolean';
    case 'ZOOM_STATE': return isProtocolId(p.nodeId) && (p.value === null || isZoomValue(p.value));
    case 'PHOTO_RESULT': return isProtocolId(p.nodeId) && isPhotoResult(p, 1);
    case 'SESSION_JOIN_PENDING': return isProtocolId(p.deviceId) &&
      (p.online === undefined || typeof p.online === 'boolean') && (p.controllerOnline === undefined || typeof p.controllerOnline === 'boolean');
    case 'SESSION_JOIN_REJECTED':
    case 'SESSION_CLOSED': return true;
    case 'SESSION_SNAPSHOT': {
      const s = p.session;
      if (!isRecord(s) || s.sessionId !== value.sessionId || !isProtocolId(s.controllerId) ||
            (s.closedAt !== undefined && (!Number.isSafeInteger(s.closedAt) || Number(s.closedAt) <= 0)) ||
          !isJoinCode(s.code) || !['draft', 'joining', 'preparing', 'ready', 'recording', 'finishing', 'completed', 'failed', 'closed'].includes(String(s.state)) ||
          !isRecord(s.members) || (s.take !== undefined && !isCoordinatedTake(s.take)) ||
          (s.takeHistory !== undefined && (!Array.isArray(s.takeHistory) || !s.takeHistory.every(isCoordinatedTake))) ||
          (s.mediaAngles !== undefined && (!isRecord(s.mediaAngles) || !Object.entries(s.mediaAngles).every(([key, angle]) =>
            isTakeMediaAngle(angle) && key === `${angle.deviceId}:${angle.clipId}`)))) return false;
      const members = Object.entries(s.members);
      return members.filter(([, m]) => isRecord(m) && m.kind === 'controller').length === 1 &&
          members.every(([id, m]) => isProtocolId(id) && isRecord(m) && m.deviceId === id &&
            (m.readyEpoch === undefined || isProtocolId(m.readyEpoch)) && (m.requiresReadyConfirmation === undefined || typeof m.requiresReadyConfirmation === 'boolean') &&
            (m.uid === undefined || (typeof m.uid === 'string' && m.uid.length > 0)) && (m.online === undefined || typeof m.online === 'boolean') &&
          isNodeRole(m.role) && (m.readiness === undefined || isNodeReadiness(m.readiness)) && (m.kind === 'controller'
            ? id === s.controllerId && m.nodeId === null : m.kind === 'node' && isProtocolId(m.nodeId))) &&
        (p.pending === undefined || (Array.isArray(p.pending) && p.pending.every((r) =>
          isRecord(r) && isProtocolId(r.deviceId) && isProtocolId(r.requestId) &&
          (r.online === undefined || typeof r.online === 'boolean') && (r.controllerOnline === undefined || typeof r.controllerOnline === 'boolean'))));
    }
    default: return false;
  }
}
