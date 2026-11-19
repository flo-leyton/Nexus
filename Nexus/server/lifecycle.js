// Render sends SIGTERM before reclaiming the process. Drain the existing relay;
// never issue capture commands or log provider credentials while shutting down.
function attachShutdown(runtime, host = process, timeoutMs = 25000) {
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => host.exit(1), timeoutMs); timer.unref();
    void Promise.resolve().then(() => runtime.close()).then(
      () => { clearTimeout(timer); host.exit(0); },
      () => { clearTimeout(timer); host.exit(1); },
    );
  };
  host.once('SIGTERM', stop); host.once('SIGINT', stop);
}
module.exports = { attachShutdown };
