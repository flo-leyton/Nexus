import { INITIAL_READINESS, type NodeReadiness } from './sessionProtocol';
import { readinessReasons, isProtocolId } from './sessionProtocol';
import type { CaptureIdentity, LocalCapture, LocalCaptureDraft } from '../types/capture';

interface CameraPermission { granted: boolean; canAskAgain: boolean; status: string }
export interface CapturePreparationAdapter {
  getPermission(): Promise<CameraPermission>;
  requestPermission(): Promise<CameraPermission>;
  isAvailable(): Promise<boolean | null>;
}
export interface CapturePreparation {
  readiness: NodeReadiness;
  active: boolean;
  canAskAgain: boolean;
  generation: number;
  phase: 'idle' | 'preparing' | 'ready' | 'starting' | 'recording' | 'saving' | 'saved' | 'error';
  captureError: string | null;
  lastCapture: LocalCapture | null;
  pendingSave: boolean;
}
export interface CaptureRecordingAdapter {
  createId(): string;
  record(): Promise<{ uri: string } | undefined>;
  stop(): void;
  persist(draft: LocalCaptureDraft, temporaryUri: string): Promise<LocalCapture>;
}
const cause = (error: unknown) => error instanceof Error ? error.message : String(error);

// Preparation and local capture; no socket, remote command or media-provider dependency.
export class CaptureEngine {
  private state: CapturePreparation = { readiness: { ...INITIAL_READINESS }, active: false, canAskAgain: true, generation: 0,
    phase: 'idle', captureError: null, lastCapture: null, pendingSave: false };
  private listeners = new Set<(state: CapturePreparation) => void>();
  private task: Promise<void> | null = null;
  private recording = false;
  private stopRequested = false;
  private pending: { draft: LocalCaptureDraft; uri: string } | null = null;
  constructor(private adapter: CapturePreparationAdapter, private recorder?: CaptureRecordingAdapter) {}
  getSnapshot() { return this.state; }
  isBusy() { return ['starting', 'recording', 'saving'].includes(this.state.phase); }
  getReadiness(): NodeReadiness {
    if (this.isBusy() || this.state.phase === 'error' || this.state.pendingSave) return { ...this.state.readiness, enginePrepared: false,
      error: (this.state.captureError ?? (this.state.phase === 'recording' ? 'Grabación local en curso' : 'Motor ocupado con la captura local')).slice(0, 256) };
    return this.state.readiness;
  }
  subscribe(listener: (state: CapturePreparation) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }
  private update(next: Partial<CapturePreparation>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener(this.state));
  }
  async prepare(requestPermission = false) {
    if (this.isBusy()) throw new Error('Espera a que termine la captura antes de preparar la cámara.');
    const generation = this.state.generation + 1;
    this.update({ active: true, generation, phase: 'preparing', captureError: null, readiness: { ...INITIAL_READINESS } });
    try {
      const [permission, available] = await Promise.all([
        requestPermission ? this.adapter.requestPermission() : this.adapter.getPermission(), this.adapter.isAvailable(),
      ]);
      if (generation !== this.state.generation || !this.state.active) return;
      this.update({ canAskAgain: permission.canAskAgain, readiness: {
        cameraPermission: permission.granted ? 'granted' : permission.status === 'denied' ? 'denied' : 'unknown',
        cameraAvailable: available, enginePrepared: false, error: null,
      } });
    } catch {
      if (generation === this.state.generation && this.state.active) this.update({ phase: 'error', captureError: 'No se pudo comprobar la cámara o sus permisos', readiness: {
        ...INITIAL_READINESS, error: 'No se pudo comprobar la cámara o sus permisos',
      } });
    }
  }
  cameraReady(generation: number) {
    if (!this.state.active || generation !== this.state.generation ||
        this.state.phase === 'error' || this.state.readiness.cameraPermission !== 'granted' || this.state.readiness.cameraAvailable === false || this.state.readiness.error) return;
    this.update({ phase: this.isBusy() ? this.state.phase : 'ready', readiness: { ...this.state.readiness, cameraAvailable: true, enginePrepared: true } });
  }
  cameraFailed(generation: number, message: string) {
    if (!this.state.active || generation !== this.state.generation) return;
    this.update({ phase: this.isBusy() ? this.state.phase : 'error', captureError: `Fallo de cámara: ${message}`,
      readiness: { ...this.state.readiness, cameraAvailable: false, enginePrepared: false, error: `Fallo de cámara: ${message}`.slice(0, 256) } });
    if (this.recording && !this.stopRequested) { try { this.stop(); } catch { /* The active STOP control remains available for retry. */ } }
  }
  deactivate() {
    this.update({ active: false, generation: this.isBusy() ? this.state.generation : this.state.generation + 1, readiness: {
      ...this.state.readiness, enginePrepared: false, error: 'La cámara está inactiva: abre la Session y mantén la app en primer plano',
    } });
    if (this.recording && !this.stopRequested) { try { this.stop(); } catch { /* Keep the recording state and allow STOP retry. */ } }
  }

  start(identity: CaptureIdentity): Promise<void> {
    if (this.task || this.isBusy()) throw new Error('Ya hay una captura en curso.');
    if (this.pending) throw new Error('Reintenta guardar el clip pendiente antes de iniciar otro.');
    if (!this.recorder || !this.state.active || readinessReasons(this.getReadiness()).length) throw new Error('La cámara no está lista. Comprueba permisos y vuelve a prepararla.');
    if (![identity.sessionId, identity.nodeId, identity.deviceId].every(isProtocolId)) throw new Error('La identidad del Node o la Session no es válida.');
    const draft: LocalCaptureDraft = { ...identity, id: this.recorder.createId(), createdAt: new Date().toISOString(), takeId: null, audio: false };
    const generation = this.state.generation;
    this.stopRequested = false;
    this.update({ phase: 'starting', captureError: null });
    this.task = this.capture(draft, generation).finally(() => { this.task = null; });
    return this.task;
  }
  private async capture(draft: LocalCaptureDraft, generation: number) {
    try {
      // Recheck permission at START; a previous READY is not permission to record forever.
      const permission = await this.adapter.getPermission();
      if (!permission.granted) {
        this.update({ canAskAgain: permission.canAskAgain, readiness: { ...this.state.readiness, cameraPermission: 'denied', enginePrepared: false } });
        throw new Error('El permiso de cámara fue revocado. Concédelo y prepara la cámara de nuevo.');
      }
      if (!this.state.active || generation !== this.state.generation) throw new Error('La cámara se desactivó antes de iniciar la grabación.');
      if (readinessReasons(this.state.readiness).length) throw new Error('La cámara dejó de estar lista antes de iniciar la grabación.');
      const result = this.recorder!.record();
      this.recording = true;
      this.update({ phase: 'recording' });
      const video = await result;
      this.recording = false;
      if (typeof video?.uri !== 'string' || !video.uri.startsWith('file://')) throw new Error('La cámara terminó sin devolver un archivo de vídeo local válido.');
      this.pending = { draft, uri: video.uri };
      this.update({ pendingSave: true });
      await this.savePending();
    } catch (error) {
      this.recording = false;
      this.discardUnusableSource(error);
      this.update({ phase: 'error', captureError: `No se completó la captura: ${cause(error)}` });
    }
  }
  stop() {
    if (!this.recording || this.stopRequested || this.state.phase !== 'recording') throw new Error('No hay una grabación activa que detener.');
    this.stopRequested = true;
    this.update({ phase: 'saving', captureError: null });
    try { this.recorder!.stop(); }
    catch (error) {
      this.stopRequested = false;
      this.update({ phase: 'recording', captureError: `No se pudo detener: ${cause(error)}. Vuelve a pulsar DETENER.` });
      throw error;
    }
  }
  private async savePending() {
    if (!this.pending) throw new Error('No hay un archivo pendiente de guardar.');
    this.update({ phase: 'saving', captureError: null });
    const saved = await this.recorder!.persist(this.pending.draft, this.pending.uri);
    if (!saved.localUri.startsWith('file://') || !Number.isFinite(saved.bytes) || saved.bytes <= 0) throw new Error('El archivo persistente no tiene contenido válido.');
    this.pending = null;
    this.update({ phase: 'saved', lastCapture: saved, pendingSave: false });
  }
  retrySave(): Promise<void> {
    if (this.task || this.isBusy()) throw new Error('Espera a que termine la captura.');
    if (!this.pending || !this.recorder) throw new Error('No hay un archivo pendiente de guardar.');
    this.task = this.savePending().catch((error) => {
      this.discardUnusableSource(error);
      this.update({ phase: 'error', captureError: `No se pudo guardar el archivo: ${cause(error)}` });
    }).finally(() => { this.task = null; });
    return this.task;
  }
  private discardUnusableSource(error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'CAPTURE_SOURCE_INVALID') {
      // There is no usable source to retry; leave any files untouched and allow a fresh clip.
      this.pending = null;
      this.update({ pendingSave: false });
    }
  }
}
