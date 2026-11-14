export interface CaptureIdentity {
  sessionId: string;
  nodeId: string;
  deviceId: string;
  takeId?: string | null;
}
export interface LocalCaptureDraft extends CaptureIdentity {
  id: string;
  createdAt: string;
  takeId: string | null; // null for H1 manual clips; shared Controller ID for H2
  audio: false;
}
export interface LocalCapture extends LocalCaptureDraft {
  fileName: 'video.mp4' | 'video.mov';
  localUri: string;
  bytes: number;
}
