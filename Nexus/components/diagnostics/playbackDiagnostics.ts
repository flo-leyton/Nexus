type Status = 'idle' | 'loading' | 'readyToPlay' | 'error';
type Event = 'mount' | 'unmount' | 'status' | 'layout';
type Detail = { status?: Status; error?: boolean; width?: number; height?: number };
let sequence = 0;
/** Development-only, memory-only trace. Never log sources, errors, IDs or credentials. */
export function createPlaybackDiagnostics(remote: boolean) {
  const instance = ++sequence;
  return (event: Event, detail: Detail = {}) => {
    if (typeof __DEV__ === 'undefined' || !__DEV__ || !['mount', 'unmount', 'status', 'layout'].includes(event)) return;
    const finite = (n: number | undefined) => typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : undefined;
    const status = ['idle', 'loading', 'readyToPlay', 'error'].includes(detail.status ?? '') ? detail.status : undefined;
    console.info('NEXUS_PLAYBACK', JSON.stringify({ event, instance, remote: remote === true, status,
      error: detail.error === true, width: finite(detail.width), height: finite(detail.height) }));
  };
}
