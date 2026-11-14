import { INITIAL_READINESS, type NodeReadiness } from './sessionProtocol';

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
}

// H1.3 preparation only. No recording or file operations yet.
export class CaptureEngine {
  private state: CapturePreparation = { readiness: { ...INITIAL_READINESS }, active: false, canAskAgain: true, generation: 0 };
  private listeners = new Set<(state: CapturePreparation) => void>();
  constructor(private adapter: CapturePreparationAdapter) {}
  getSnapshot() { return this.state; }
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
    const generation = this.state.generation + 1;
    this.update({ active: true, generation, readiness: { ...INITIAL_READINESS } });
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
      if (generation === this.state.generation && this.state.active) this.update({ readiness: {
        ...INITIAL_READINESS, error: 'No se pudo comprobar la cámara o sus permisos',
      } });
    }
  }
  cameraReady(generation: number) {
    if (!this.state.active || generation !== this.state.generation ||
        this.state.readiness.cameraPermission !== 'granted' || this.state.readiness.cameraAvailable === false || this.state.readiness.error) return;
    this.update({ readiness: { ...this.state.readiness, cameraAvailable: true, enginePrepared: true } });
  }
  cameraFailed(generation: number, message: string) {
    if (!this.state.active || generation !== this.state.generation) return;
    this.update({ readiness: { ...this.state.readiness, cameraAvailable: false, enginePrepared: false, error: `Fallo de cámara: ${message}`.slice(0, 256) } });
  }
  deactivate() {
    this.update({ active: false, generation: this.state.generation + 1, readiness: {
      ...this.state.readiness, enginePrepared: false, error: 'La cámara está inactiva: abre la Session y mantén la app en primer plano',
    } });
  }
}
