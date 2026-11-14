export interface CaptureIdentity {
  sessionId: string;
  nodeId: string;
  deviceId: string;
}
export interface LocalCaptureDraft extends CaptureIdentity {
  id: string;
  createdAt: string;
  takeId: null; // H1.4 is local; no coordinated Take exists yet.
  audio: false;
}
export interface LocalCapture extends LocalCaptureDraft {
  fileName: 'video.mp4' | 'video.mov';
  localUri: string;
  bytes: number;
}
