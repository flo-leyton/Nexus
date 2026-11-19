import type { CaptureEngine } from './captureEngine';
import type { RecordingCommand, RecordingReport } from './sessionProtocol';
import type { CaptureIdentity } from '../types/capture';

// Bridges the shared service to the existing local engine. No socket or camera duplication.
export function coordinateCapture(engine: CaptureEngine, identity: CaptureIdentity, report: (value: RecordingReport) => void) {
  let active: { takeId: string; requestId: string; stopRequested: boolean } | null = null;
  let last = '';
  let observing = false;
  let terminal: RecordingReport | null = null;
  const publish = (phase: RecordingReport['phase'], error: string | null = null) => {
    if (!active) return;
    const state = engine.getSnapshot();
    const capture = phase === 'saved' && state.lastCapture?.takeId === active.takeId ? {
      id: state.lastCapture.id, localUri: state.lastCapture.localUri, bytes: state.lastCapture.bytes,
    } : null;
    if (phase === 'saved' && !capture) return;
    const value: RecordingReport = { takeId: active.takeId, requestId: active.requestId, phase,
      error: error?.slice(0, 256) ?? null, capture, busy: engine.isBusy() || state.pendingSave };
    const signature = JSON.stringify(value);
    if (last === signature) return;
    last = signature;
    if (phase === 'saved' || (phase === 'error' && !value.busy)) { terminal = value; observing = false; }
    try { report(value); } catch { /* A lost Controller/relay must never stop the original. */ }
  };
  const stop = () => {
    try { engine.stop(); }
    catch (error) { publish('error', error instanceof Error ? error.message : String(error)); }
  };
  const unsubscribe = engine.subscribe((state) => {
    if (!active || !observing) return;
    if (['starting', 'recording', 'saving', 'saved', 'error'].includes(state.phase)) {
      publish(state.captureError ? 'error' : state.phase as RecordingReport['phase'], state.captureError);
    }
    // STOP can arrive while the async permission recheck is still running.
    if (state.phase === 'recording' && active.stopRequested && !state.captureError) { active.stopRequested = false; stop(); }
  });
  return {
    handle(command: RecordingCommand) {
      if (command.type === 'START_RECORDING') {
        // A different message ID must not create another original for the same Take either.
        if (active?.takeId === command.payload.takeId) return;
        if (engine.isBusy() || engine.getSnapshot().pendingSave) throw new Error('El motor está ocupado con otra captura.');
        active = { takeId: command.payload.takeId, requestId: command.messageId, stopRequested: false };
        last = '';
        terminal = null;
        observing = true;
        try { void engine.start({ ...identity, takeId: active.takeId }).catch((error: unknown) => publish('error', String(error))); }
        catch (error) { publish('error', error instanceof Error ? error.message : String(error)); }
      } else {
        if (!active || active.takeId !== command.payload.takeId) throw new Error('No existe esa toma en el motor local.');
        active.requestId = command.messageId;
        last = '';
        if (terminal) { try { report({ ...terminal, requestId: command.messageId }); } catch { /* offline */ } return; }
        const state = engine.getSnapshot();
        if (state.phase === 'starting') { active.stopRequested = true; publish('starting'); }
        else if (state.phase === 'recording') stop();
        else if (state.phase === 'saved') publish('saved');
        else if (state.phase === 'saving') publish('saving');
        else publish('error', state.captureError ?? 'La toma no está grabando. Revisa el Node.');
      }
    },
    dispose() { unsubscribe(); }, // unregistering never aborts an active camera operation
  };
}
