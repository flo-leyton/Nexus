/* global __dirname */
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const protocol = require('../services/sessionProtocol.ts');

function load(file, dependencies) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports;
}
const { CaptureEngine } = load('../services/captureEngine.ts', { './sessionProtocol': protocol });
const identity = { sessionId: 'session', deviceId: 'device', nodeId: 'node' };
const granted = { granted: true, status: 'granted', canAskAgain: true };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let n = 0; n < 6; n++) await Promise.resolve(); };
function captureHarness() {
  let permission = granted;
  let stopFailure = false;
  let recordFailure = false;
  let saveFailure = false;
  let recording = deferred();
  let save = deferred();
  let records = 0, stops = 0, saves = 0;
  let lastDraft;
  const engine = new CaptureEngine({ getPermission: async () => permission, requestPermission: async () => permission, isAvailable: async () => true }, {
    createId: () => `clip-${records + 1}`,
    record() { records++; if (recordFailure) throw new Error('camera refused'); return recording.promise; },
    stop() { stops++; if (stopFailure) throw new Error('native stop failed'); recording.resolve({ uri: 'file:///cache/video.mp4' }); },
    persist(draft) { saves++; lastDraft = draft; if (saveFailure) throw saveFailure === 'invalid' ? Object.assign(new Error('source empty'), { code: 'CAPTURE_SOURCE_INVALID' }) : new Error('disk full'); return save.promise; },
  });
  return { engine,
    async ready() { await engine.prepare(); engine.cameraReady(engine.getSnapshot().generation); },
    setPermission(p) { permission = p; },
    failStop(value) { stopFailure = value; }, failRecord(value) { recordFailure = value; }, failSave(value) { saveFailure = value; },
    nextRecording() { recording = deferred(); save = deferred(); },
    completeSave(bytes = 128) { save.resolve({ ...lastDraft, localUri: 'file:///documents/video.mp4', fileName: 'video.mp4', bytes }); },
    rejectRecord() { recording.reject(new Error('camera disconnected')); },
    finishWithoutFile() { recording.resolve(undefined); },
    counts: () => ({ records, stops, saves }),
  };
}

test('H1.4: capture transitions, duplicate START/STOP and saved only after persistent validation', async () => {
  const h = captureHarness();
  const e = h.engine;
  assert.throws(() => e.start(identity), /no está lista/);
  assert.throws(() => e.stop(), /No hay una grabación/);
  await h.ready();
  const phases = [];
  e.subscribe((s) => phases.push(s.phase));
  const task = e.start(identity);
  assert.equal(e.getSnapshot().phase, 'starting');
  assert.throws(() => e.start(identity), /en curso/);
  await flush();
  assert.equal(e.getSnapshot().phase, 'recording');
  assert.throws(() => e.start({ ...identity, takeId: 'remote-take' }), /en curso/);
  assert.equal(e.getReadiness().enginePrepared, false);
  await assert.rejects(e.prepare(), /termine la captura/);
  e.stop();
  assert.equal(e.getSnapshot().phase, 'saving');
  assert.throws(() => e.stop(), /No hay una grabación/);
  await flush();
  assert.equal(e.getSnapshot().lastCapture, null);
  h.completeSave();
  await task;
  assert.equal(e.getSnapshot().phase, 'saved');
  assert.equal(e.getSnapshot().lastCapture.bytes, 128);
  assert.equal(e.getSnapshot().lastCapture.nodeId, identity.nodeId);
  assert.equal(e.getSnapshot().lastCapture.takeId, null);
  assert.equal(e.getSnapshot().lastCapture.audio, false);
  assert.equal(e.getReadiness().enginePrepared, true);
  assert.ok(phases.includes('starting') && phases.includes('recording') && phases.includes('saving') && phases.includes('saved'));
  assert.deepEqual(h.counts(), { records: 1, stops: 1, saves: 1 });
});

test('H1.4: stop failure keeps STOP usable; failed save preserves pending clip and retry creates no new recording', async () => {
  const h = captureHarness(); await h.ready();
  const e = h.engine;
  const task = e.start(identity); await flush();
  h.failStop(true);
  assert.throws(() => e.stop(), /native stop failed/);
  assert.equal(e.getSnapshot().phase, 'recording');
  assert.match(e.getSnapshot().captureError, /native stop failed/);
  h.failStop(false); h.failSave(true);
  e.stop(); await task;
  assert.equal(e.getSnapshot().phase, 'error');
  assert.equal(e.getSnapshot().pendingSave, true);
  assert.match(e.getSnapshot().captureError, /disk full/);
  assert.throws(() => e.start(identity), /clip pendiente/);
  h.failSave(false);
  const retry = e.retrySave(); await flush(); h.completeSave(); await retry;
  assert.equal(e.getSnapshot().phase, 'saved');
  assert.equal(e.getSnapshot().pendingSave, false);
  assert.deepEqual(h.counts(), { records: 1, stops: 2, saves: 2 });
});

test('H1.4: revoked permission, native rejection and missing/empty output never become saved; capture can retry', async () => {
  const h = captureHarness(); await h.ready();
  const e = h.engine;
  h.setPermission({ granted: false, canAskAgain: false, status: 'denied' });
  await e.start(identity);
  assert.equal(h.counts().records, 0);
  assert.equal(e.getReadiness().cameraPermission, 'denied');
  assert.match(e.getSnapshot().captureError, /revocado/);
  h.setPermission(granted); await h.ready();
  h.failRecord(true); await e.start(identity);
  assert.match(e.getSnapshot().captureError, /camera refused/);
  h.failRecord(false); await h.ready();
  let task = e.start(identity); await flush(); h.finishWithoutFile(); await task;
  assert.match(e.getSnapshot().captureError, /sin devolver/);
  assert.equal(e.getSnapshot().lastCapture, null);
  h.nextRecording(); await h.ready();
  task = e.start(identity); await flush(); h.rejectRecord(); await task;
  assert.match(e.getSnapshot().captureError, /camera disconnected/);
  h.nextRecording(); await h.ready();
  task = e.start(identity); await flush(); e.stop(); await flush(); h.completeSave(0); await task;
  assert.equal(e.getSnapshot().phase, 'error');
  assert.equal(e.getSnapshot().lastCapture, null);
  assert.equal(e.getSnapshot().pendingSave, true);
});

test('H1.4: background deactivation stops once, keeps the camera generation until finalized, and saves', async () => {
  const h = captureHarness(); await h.ready();
  const e = h.engine;
  const task = e.start(identity); await flush();
  const generation = e.getSnapshot().generation;
  e.deactivate(); e.deactivate();
  assert.equal(e.getSnapshot().generation, generation);
  assert.equal(e.getReadiness().enginePrepared, false);
  await flush(); h.completeSave(); await task;
  assert.equal(h.counts().stops, 1);
  assert.equal(e.getSnapshot().phase, 'saved');
  assert.equal(e.getSnapshot().active, false);
});

async function diskStore(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'nexus-capture-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('nexus-capture-test-'));
    return fsp.rm(root, { recursive: true, force: true });
  });
  const docs = path.join(root, 'documents'); const cache = path.join(root, 'cache');
  await fsp.mkdir(cache); await fsp.mkdir(docs);
  let copyFailure = false, metadataFailure = false, truncate = false;
  const adapter = {
    documentDirectory: `${pathToFileURL(docs).href}/`,
    async getInfoAsync(uri) { try { const s = await fsp.stat(fileURLToPath(uri)); return { exists: true, isDirectory: s.isDirectory(), size: s.size }; } catch (e) { if (e.code === 'ENOENT') return { exists: false }; throw e; } },
    makeDirectoryAsync: (uri) => fsp.mkdir(fileURLToPath(uri), { recursive: true }),
    async writeAsStringAsync(uri, text) { if (metadataFailure) throw new Error('metadata write failed'); await fsp.writeFile(fileURLToPath(uri), text); },
    readAsStringAsync: (uri) => fsp.readFile(fileURLToPath(uri), 'utf8'),
    readDirectoryAsync: (uri) => fsp.readdir(fileURLToPath(uri)),
    async copyAsync({ from, to }) { if (copyFailure) throw new Error('copy failed'); await fsp.copyFile(fileURLToPath(from), fileURLToPath(to)); if (truncate) await fsp.truncate(fileURLToPath(to), 0); },
    deleteAsync: (uri) => fsp.unlink(fileURLToPath(uri)),
  };
  const reload = () => load('../services/localCaptures.ts', { './sessionProtocol': protocol, 'expo-file-system/legacy': adapter });
  const source = async (name, size = 128) => { const uri = pathToFileURL(path.join(cache, name)).href; await fsp.writeFile(fileURLToPath(uri), Buffer.alloc(size, 1)); return uri; };
  const draft = (id) => ({ ...identity, id, createdAt: new Date().toISOString(), takeId: null, audio: false });
  return { adapter, reload, source, draft, fault(type, value) { if (type === 'copy') copyFailure = value; if (type === 'metadata') metadataFailure = value; if (type === 'truncate') truncate = value; } };
}

test('H1.4: persistent files survive service reload; independent clips are discovered and rechecked before playback', async (t) => {
  const h = await diskStore(t); const store = h.reload();
  const one = await h.source('one.mp4'); const two = await h.source('two.mov');
  const [a, b] = await Promise.all([store.persistLocalCapture(h.draft('one'), one), store.persistLocalCapture(h.draft('two'), two)]);
  assert.equal(a.fileName, 'video.mp4'); assert.equal(b.fileName, 'video.mov');
  assert.equal((await h.adapter.getInfoAsync(one)).exists, false);
  const reloaded = h.reload();
  const history = await reloaded.getLocalCaptures(identity.sessionId, identity.deviceId);
  assert.equal(history.captures.length, 2); assert.equal(history.problems.length, 0);
  assert.equal((await reloaded.getLocalCaptures(identity.sessionId, 'another-device')).captures.length, 0);
  await fsp.truncate(fileURLToPath(a.localUri), 0);
  await assert.rejects(reloaded.verifyLocalCapture(a), /vacío/);
  const checked = await reloaded.getLocalCaptures(identity.sessionId, identity.deviceId);
  assert.equal(checked.captures.length, 1); assert.equal(checked.problems.length, 1);
});

test('H1.4: metadata/copy/empty file errors retain the camera source and allow safe save retry', async (t) => {
  const h = await diskStore(t); const store = h.reload(); const source = await h.source('one.mp4'); const draft = h.draft('one');
  h.fault('metadata', true);
  await assert.rejects(store.persistLocalCapture(draft, source), /metadata write failed/);
  assert.equal((await h.adapter.getInfoAsync(source)).exists, true);
  h.fault('metadata', false); h.fault('copy', true);
  await assert.rejects(store.persistLocalCapture(draft, source), /copy failed/);
  assert.equal((await h.adapter.getInfoAsync(source)).exists, true);
  assert.equal((await store.getLocalCaptures(identity.sessionId, identity.deviceId)).captures.length, 0);
  h.fault('copy', false); h.fault('truncate', true);
  await assert.rejects(store.persistLocalCapture(draft, source), /vacío/);
  assert.equal((await h.adapter.getInfoAsync(source)).exists, true);
  h.fault('truncate', false);
  const saved = await store.persistLocalCapture(draft, source);
  assert.equal(saved.bytes, 128);
  assert.equal((await h.reload().getLocalCaptures(identity.sessionId, identity.deviceId)).captures.length, 1);
  const empty = await h.source('empty.mp4', 0);
  await assert.rejects(store.persistLocalCapture(h.draft('empty'), empty), /vacío/);
  const missing = await h.source('missing.mp4');
  await h.adapter.deleteAsync(missing);
  await assert.rejects(store.persistLocalCapture(h.draft('missing'), missing), /no existe/);
});

test('H2: shared takeId survives persistent sidecars alongside H1 manual clips', async (t) => {
  const h = await diskStore(t), store = h.reload();
  const sourceA = await h.source('angle-a.mp4'), sourceB = await h.source('angle-b.mp4'), manual = await h.source('manual.mp4');
  await Promise.all([
    store.persistLocalCapture({ ...h.draft('angle-a'), takeId: 'shared-take' }, sourceA),
    store.persistLocalCapture({ ...h.draft('angle-b'), takeId: 'shared-take' }, sourceB),
    store.persistLocalCapture(h.draft('manual'), manual),
  ]);
  const result = await h.reload().getLocalCaptures(identity.sessionId, identity.deviceId);
  assert.equal(result.problems.length, 0);
  assert.equal(result.captures.length, 3);
  assert.equal(result.captures.filter((c) => c.takeId === 'shared-take').length, 2);
  assert.equal(result.captures.find((c) => c.id === 'manual').takeId, null);
  assert.equal(new Set(result.captures.map((c) => c.localUri)).size, 3);
});

test('H1.4: unusable temporary source releases the retry lock so another clip can be attempted', async () => {
  const h = captureHarness(); await h.ready(); h.failSave('invalid');
  const task = h.engine.start(identity); await flush(); h.engine.stop(); await task;
  assert.equal(h.engine.getSnapshot().phase, 'error');
  assert.equal(h.engine.getSnapshot().pendingSave, false);
  await h.ready(); h.failSave(false); h.nextRecording();
  const next = h.engine.start(identity); await flush(); h.engine.stop(); await flush(); h.completeSave(); await next;
  assert.equal(h.engine.getSnapshot().phase, 'saved');
});

test('H1.4: a camera error during the permission recheck prevents a native recording from starting', async () => {
  const permission = deferred(); let deferPermission = false; let records = 0;
  const engine = new CaptureEngine({
    getPermission: () => deferPermission ? permission.promise : Promise.resolve(granted),
    requestPermission: async () => granted, isAvailable: async () => true,
  }, { createId: () => 'clip', record() { records++; return Promise.resolve(undefined); }, stop() {}, persist() { throw new Error('not reached'); } });
  await engine.prepare(); engine.cameraReady(engine.getSnapshot().generation);
  deferPermission = true;
  const task = engine.start(identity);
  engine.cameraFailed(engine.getSnapshot().generation, 'Camera disconnected before start');
  permission.resolve(granted);
  await task;
  assert.equal(records, 0);
  assert.equal(engine.getSnapshot().phase, 'error');
  assert.equal(engine.getReadiness().enginePrepared, false);
});
