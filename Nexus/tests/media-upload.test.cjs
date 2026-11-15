/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const protocol = require('../services/sessionProtocol.ts');

function load(file, dependencies, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, Error, setTimeout, clearTimeout, ...globals,
    require(name) { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; } });
  return exports;
}
function uploaderFixture(overrides = {}) {
  const asset = { id: 'catalog-id', localId: 'clip', sessionId: 'session', takeId: 'take', deviceId: 'device',
    nodeId: 'original-node', bytes: 256, localUri: 'file:///original.mp4', upload: { state: 'local' }, uploadRevision: 0 };
  const uploads = [], notifications = [], states = [];
  const module = load('../services/captureUpload.ts', { 'expo-crypto': {}, './deviceIdentity': {}, './mediaCatalog': {}, './cloudinary': adapterFixture().adapter, './session': {}, './sessionProtocol': protocol });
  const deps = {
    getAsset: async () => ({ ...asset }), getAssets: async () => [{ ...asset }], owner: async () => 'device',
    setState: async (id, state) => { assert.equal(id, asset.id); asset.upload = state; asset.uploadRevision++; states.push(state.state); },
    verify: async (clip) => { assert.equal(clip.bytes, 256); return clip.localUri; },
    publicId: async (clip) => `nexus/hash-of-${clip.id}`,
    upload: async (clip, uri, publicId) => { uploads.push({ id: clip.id, uri, publicId }); return {
      resourceType: 'video', publicId, url: 'https://res.cloudinary.com/test/video/upload/clip.mp4' }; },
    notify: async (clip) => { notifications.push({ ...clip }); }, ...overrides,
  };
  return { uploader: module.createCaptureUploader(deps), asset, uploads, notifications, states, deps };
}

test('H3.2: concurrent presses share one upload; confirmed publication failure never downgrades upload', async () => {
  const h = uploaderFixture({ notify: async () => { throw new Error('relay offline'); } });
  const first = h.uploader.upload(h.asset.id);
  assert.equal(first, h.uploader.upload(h.asset.id));
  await assert.rejects(first, /relay offline/);
  assert.equal(h.asset.upload.state, 'uploaded'); assert.equal(h.uploads.length, 1);
  h.deps.notify = async () => {};
  await h.uploader.upload(h.asset.id);
  assert.equal(h.uploads.length, 1); assert.equal(h.asset.nodeId, 'original-node');
});

test('H3.2: failure and uncertain response preserve original and stable identity across retry', async () => {
  const h = uploaderFixture(); const original = h.deps.upload;
  for (const error of [new Error('provider unavailable'), Object.assign(new Error('response lost'), { code: 'UPLOAD_UNCERTAIN' })]) {
    h.deps.upload = async (clip, uri, publicId) => { h.uploads.push({ id: clip.id, uri, publicId }); throw error; };
    await assert.rejects(h.uploader.upload(h.asset.id), error);
    assert.equal(h.asset.upload.state, error.code ? 'uncertain' : 'failed');
    assert.equal(h.asset.localUri, 'file:///original.mp4'); assert.equal(h.asset.takeId, 'take');
    assert.equal('url' in h.asset.upload, false);
  }
  h.deps.upload = original;
  await h.uploader.upload(h.asset.id);
  assert.equal(h.asset.upload.state, 'uploaded');
  assert.equal(new Set(h.uploads.map((u) => JSON.stringify(u))).size, 1);
  assert.equal(h.notifications.at(-1).nodeId, 'original-node');
  assert.equal(h.notifications.at(-1).deviceId, 'device');
});

test('H3.2: reopen marks interrupted transfer uncertain; missing original and another owner cannot upload', async () => {
  const h = uploaderFixture(); h.asset.upload = { state: 'uploading' };
  await h.uploader.recover(); assert.equal(h.asset.upload.state, 'uncertain'); assert.equal(h.uploads.length, 0);
  h.deps.verify = async () => { throw new Error('original absent'); };
  await assert.rejects(h.uploader.upload(h.asset.id), /original absent/);
  assert.equal(h.asset.upload.state, 'failed'); assert.equal(h.uploads.length, 0);
  h.deps.owner = async () => 'stranger';
  await assert.rejects(h.uploader.upload(h.asset.id), /dispositivo/);
  assert.equal(h.uploads.length, 0);
});

test('H3.2: manual H1 clip uploads without fabricating Take membership or notifying relay', async () => {
  const h = uploaderFixture(); h.asset.takeId = null;
  await h.uploader.upload(h.asset.id);
  assert.equal(h.asset.upload.state, 'uploaded'); assert.equal(h.notifications.length, 0);
  assert.equal(h.asset.takeId, null);
});

function adapterFixture() {
  const calls = [];
  const state = { size: 256, exists: true, response: { status: 200, body: JSON.stringify({ public_id: 'nexus/stable',
    secure_url: 'https://res.cloudinary.com/test/video/upload/nexus/stable.mp4', resource_type: 'video', bytes: 256 }) } };
  const adapter = load('../services/cloudinary.ts', {
    'expo-crypto': { randomUUID: () => 'import-id' }, 'expo/fetch': {}, 'react-native': { Platform: { OS: 'android' } },
    './sessionProtocol': protocol, 'expo-file-system/legacy': {
      FileSystemUploadType: { MULTIPART: 1 }, getInfoAsync: async () => ({ exists: state.exists, size: state.size, isDirectory: false }),
      uploadAsync: async (...args) => { calls.push(args); if (state.error) throw state.error; return state.response; },
    },
  }, { __DEV__: false, process: { env: { EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME: 'test', EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET: 'unsigned-test' } } });
  const input = { uri: 'file:///original.mp4', fileName: 'video.mp4', mimeType: 'video/mp4', sessionId: 'session', source: 'capture',
    expectedBytes: 256, assetId: 'same-catalog-id', publicId: 'nexus/stable' };
  return { state, calls, input, adapter, upload: () => adapter.uploadMediaAsset(input) };
}

test('H3 regression: preset folder prefix preserves clip identity through adapter, worker and retry', async () => {
  const h = adapterFixture();
  const payload = JSON.parse(h.state.response.body);
  h.state.response.body = JSON.stringify({ ...payload, public_id: 'team/captures/nexus/stable',
    secure_url: 'https://res.cloudinary.com/test/video/upload/team/captures/nexus/stable.mp4' });
  const result = await h.upload();
  assert.equal(result.publicId, 'team/captures/nexus/stable');
  assert.equal((await h.upload()).publicId, result.publicId);
  assert.equal(h.calls[0][2].parameters.public_id, h.calls[1][2].parameters.public_id);
  const worker = uploaderFixture({ upload: async (clip, uri, id) => ({ resourceType: 'video', publicId: `team/${id}`, url: result.url }) });
  await worker.uploader.upload(worker.asset.id);
  assert.equal(worker.asset.upload.state, 'uploaded');
  assert.equal(worker.asset.upload.publicId, 'team/nexus/hash-of-catalog-id');
  for (const id of ['team/notnexus/stable', 'team/nexus/stable-random', 'rzobn7ekss6c49y8iiqi']) {
    h.state.response.body = JSON.stringify({ ...payload, public_id: id });
    assert.equal((await h.upload()).publicId, id);
  }
});

test('H3 regression: upload diagnostics identify the failing field rather than blaming every error on preset', async () => {
  const h = adapterFixture(); const payload = JSON.parse(h.state.response.body);
  for (const [patch, diagnostic] of [[{ bytes: undefined }, /bytes ausentes/],
    [{ secure_url: 'https://other.invalid/clip' }, /secure_url/], [{ resource_type: 'image' }, /resource_type esperado/]]) {
    h.state.response.body = JSON.stringify({ ...payload, ...patch });
    await assert.rejects(h.upload(), (error) => error.code === 'UPLOAD_UNCERTAIN' && diagnostic.test(error.message) && !/preset/.test(error.message));
  }
});

test('H3.2 adapter: verifies original existence, bytes and 80 MB limit before HTTP', async () => {
  const h = adapterFixture(); h.state.exists = false;
  await assert.rejects(h.upload(), /no existe/);
  h.state.exists = true; h.state.size = 0; await assert.rejects(h.upload(), /vacío/);
  h.state.size = 257; await assert.rejects(h.upload(), /tamaño/);
  h.state.size = 81 * 1024 * 1024; h.input.expectedBytes = h.state.size;
  await assert.rejects(h.upload(), /80 MB/); assert.equal(h.calls.length, 0);
});

test('H3.2 adapter: no success on timeout or invalid response; generated remote ID is authoritative', async () => {
  const h = adapterFixture(); const valid = h.state.response;
  h.state.error = new Error('connection lost');
  await assert.rejects(h.upload(), { code: 'UPLOAD_UNCERTAIN' }); delete h.state.error;
  h.state.error = Object.assign(new Error('request timeout'), { name: 'TimeoutError' });
  await assert.rejects(h.upload(), { code: 'UPLOAD_UNCERTAIN' }); delete h.state.error;
  h.state.response = { status: 200, body: 'not-json' }; await assert.rejects(h.upload(), { code: 'UPLOAD_UNCERTAIN' });
  h.state.response = { status: 200, body: JSON.stringify({ ...JSON.parse(valid.body), public_id: 'rzobn7ekss6c49y8iiqi' }) };
  assert.equal((await h.upload()).publicId, 'rzobn7ekss6c49y8iiqi');
  for (const public_id of ['', ' ', null]) {
    h.state.response = { status: 200, body: JSON.stringify({ ...JSON.parse(valid.body), public_id }) };
    await assert.rejects(h.upload(), { code: 'UPLOAD_UNCERTAIN' });
  }
  h.state.response = { status: 400, body: JSON.stringify({ error: { message: 'unsigned preset rejected' } }) };
  await assert.rejects(h.upload(), /unsigned preset rejected/);
  h.state.response = valid;
  const result = await h.upload(); assert.equal(result.id, h.input.assetId); assert.equal(result.publicId, h.input.publicId);
  assert.equal(result.role, undefined);
  assert.ok(h.calls.every(([, uri, options]) => uri === h.input.uri && options.parameters.public_id === h.input.publicId));
});

test('H3.3: independent persisted angles survive concurrent notifications, duplicates, stale revision and reopen', async () => {
  const data = new Map();
  const storage = { getItem: async (key) => data.get(key) ?? null, setItem: async (key, value) => { await new Promise(setImmediate); data.set(key, value); },
    getAllKeys: async () => [...data.keys()] };
  const reload = () => load('../services/takeMedia.ts', { '@react-native-async-storage/async-storage': { default: storage }, './sessionProtocol': protocol });
  const a = { deviceId: 'device-a', nodeId: 'node-a', clipId: 'clip-a', takeId: 'take', bytes: 256, revision: 3,
    upload: { state: 'uploaded', publicId: 'nexus/a', url: 'https://res.cloudinary.com/test/video/upload/a.mp4' } };
  const b = { ...a, deviceId: 'device-b', nodeId: 'node-b', clipId: 'clip-b', upload: { ...a.upload, publicId: 'nexus/b', url: 'https://res.cloudinary.com/test/video/upload/b.mp4' } };
  const store = reload();
  await Promise.all([store.saveTakeMedia('session', { b }), store.saveTakeMedia('session', { a }), store.saveTakeMedia('session', { a })]);
  await store.saveTakeMedia('session', { a: { ...a, revision: 1, upload: { state: 'uploading' } } });
  const recovered = await reload().getTakeMedia('session');
  assert.equal(recovered.length, 2); assert.equal(data.size, 2);
  assert.ok(recovered.every((r) => r.angle.upload.state === 'uploaded' && r.angle.takeId === 'take'));
  assert.equal(new Set(recovered.map((r) => r.angle.upload.url)).size, 2);
  await assert.rejects(store.saveTakeMedia('session', { a: { ...a, upload: { state: 'uploaded', publicId: 'bad', url: 'http://invalid' } } }), /inválida/);
});

test('H3 real ID regression: timeout, retry, persisted success before publication and reopen keep one playable angle', async () => {
  const original = { id: 'original-clip', sessionId: 'session', takeId: 'take', deviceId: 'device', nodeId: 'original-node',
    bytes: 256, localUri: 'file:///original.mp4', fileName: 'video.mp4', audio: false, createdAt: '2026-11-15T12:00:00.000Z' };
  const data = new Map();
  const storage = { getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => { await new Promise(setImmediate); data.set(key, value); }, getAllKeys: async () => [...data.keys()] };
  const storageDep = { '@react-native-async-storage/async-storage': { default: storage }, './sessionProtocol': protocol };
  const reloadCatalog = () => load('../services/mediaCatalog.ts', { ...storageDep, './localCaptures': {
    scanLocalCaptures: async () => ({ entries: [{ capture: { ...original } }], problems: [] }), verifyLocalCapture: async (clip) => clip,
  } });
  const reloadAngles = () => load('../services/takeMedia.ts', storageDep);
  let catalog = reloadCatalog(), angles = reloadAngles();
  const id = await catalog.incorporateLocalCapture(original);
  const h = adapterFixture();
  const remoteId = 'rzobn7ekss6c49y8iiqi', remoteUrl = `https://res.cloudinary.com/test/video/upload/v1/${remoteId}.mp4`;
  h.state.response.body = JSON.stringify({ public_id: remoteId, secure_url: remoteUrl, resource_type: 'video', bytes: 256 });
  const { createCaptureUploader } = load('../services/captureUpload.ts', {
    'expo-crypto': {}, './deviceIdentity': {}, './mediaCatalog': {}, './cloudinary': h.adapter, './session': {}, './sessionProtocol': protocol,
  });
  const notified = [];
  let published = 0;
  const deps = {
    getAsset: (clipId) => catalog.getMediaAssetById(clipId), getAssets: async () => (await catalog.getMediaCatalog()).assets,
    setState: (clipId, state) => catalog.setCaptureUpload(clipId, state), owner: async () => original.deviceId,
    verify: (clip) => catalog.getMediaPlaybackUri(clip), publicId: async () => 'nexus/requested-local-hash',
    upload: (clip, uri, publicId) => { Object.assign(h.input, { uri, publicId, assetId: clip.id }); return h.upload(); },
    notify: async (clip) => {
      const persisted = await reloadCatalog().getMediaAssetById(clip.id);
      assert.equal(JSON.stringify(persisted.upload), JSON.stringify(clip.upload));
      notified.push(clip.upload.state);
      if (clip.upload.state === 'uploaded') published++;
      await angles.saveTakeMedia(clip.sessionId, { clip: { clipId: clip.localId, takeId: clip.takeId, deviceId: clip.deviceId,
        nodeId: clip.nodeId, bytes: clip.bytes, revision: clip.uploadRevision, upload: clip.upload } });
    },
  };
  let worker = createCaptureUploader(deps);
  h.state.error = Object.assign(new Error('request timeout'), { name: 'TimeoutError' });
  await assert.rejects(worker.upload(id), { code: 'UPLOAD_UNCERTAIN' });
  assert.equal((await catalog.getMediaAssetById(id)).upload.state, 'uncertain');
  assert.equal(published, 0);
  catalog = reloadCatalog(); angles = reloadAngles(); worker = createCaptureUploader(deps);
  await worker.recover(); assert.equal(h.calls.length, 1); // reopening never silently retransmits
  delete h.state.error;
  const task = worker.upload(id); assert.equal(task, worker.upload(id)); await task;
  const saved = await catalog.getMediaAssetById(id);
  assert.equal(saved.upload.state, 'uploaded'); assert.equal(saved.upload.publicId, remoteId); assert.equal(saved.upload.url, remoteUrl);
  assert.equal(saved.id, id); assert.equal(saved.localId, original.id); assert.equal(saved.nodeId, original.nodeId);
  assert.equal(saved.takeId, original.takeId); assert.equal(saved.sessionId, original.sessionId); assert.equal(saved.localUri, original.localUri);
  const { mediaUploadLabel } = load('../types/media.ts', {});
  assert.equal(mediaUploadLabel(saved), 'Subido');
  assert.equal(await catalog.getMediaPlaybackUri(saved), original.localUri);
  assert.equal(await catalog.getMediaPlaybackUri({ storage: 'remote', url: saved.upload.url }), remoteUrl);
  catalog = reloadCatalog(); angles = reloadAngles(); worker = createCaptureUploader(deps);
  await worker.recover(); await worker.upload(id); await worker.publish(id);
  assert.equal(h.calls.length, 2); // one timed-out transfer, one confirmed transfer; no upload after reopen
  assert.equal((await catalog.getMediaCatalog()).assets.length, 1);
  const restoredAngles = await reloadAngles().getTakeMedia(original.sessionId);
  assert.equal(restoredAngles.length, 1); assert.equal(restoredAngles[0].angle.upload.url, remoteUrl);
  assert.equal(restoredAngles[0].angle.nodeId, original.nodeId); assert.ok(notified.includes('uncertain'));
});

test('H3: invalid success response stays uncertain; no uploaded reference is published', async () => {
  const h = adapterFixture(); h.state.response.body = JSON.stringify({ public_id: 'rzobn7ekss6c49y8iiqi', resource_type: 'video', bytes: 256 });
  const worker = uploaderFixture({ upload: () => h.upload() });
  await assert.rejects(worker.uploader.upload(worker.asset.id), { code: 'UPLOAD_UNCERTAIN' });
  assert.equal(worker.asset.upload.state, 'uncertain'); assert.equal(worker.asset.localUri, 'file:///original.mp4');
  assert.ok(!worker.notifications.some((clip) => clip.upload.state === 'uploaded'));
});
