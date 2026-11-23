import type { ZoomValue } from './sessionProtocol';

export const ZOOM_INTERVAL_MS = 150;

// Keep revisions monotonic across camera panel remounts on the same connection.
let revision = 0;

export function createNodeZoom() {
  let value: ZoomValue = { percent: 0, revision: ++revision };
  function set(percent: number) {
    if (!Number.isFinite(percent)) return value;
    const bounded = Math.min(100, Math.max(0, Math.round(percent)));
    if (bounded !== value.percent) value = { percent: bounded, revision: ++revision };
    return value;
  }
  return {
    read: () => value,
    set,
    accept(update?: ZoomValue) {
      return update && update.revision === value.revision ? set(update.percent) : value;
    },
  };
}
