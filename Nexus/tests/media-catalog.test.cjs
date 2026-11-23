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
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require(name) { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; } });
  return exports;
}
const legacyKey = '@nexus-studio/media-assets';
const oldImport = { id: 'old-import', sessionId: 'session', source: 'import', resourceType: 'image',
  publicId: 'existing/image', url: 'https://res.cloudinary.com/test/image/upload/existing.jpg', createdAt: '2026-11-13T12:00:00.000Z' };

async function harness(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'nexus-catalog-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('nexus-catalog-test-'));
    return fsp.rm(root, { recursive: true, force: true });
  });
  const docs = path.join(root, 'documents'), cache = path.join(root, 'cache');
  await fsp.mkdir(docs); await fsp.mkdir(cache);
  const disk = {
    documentDirectory: `${pathToFileURL(docs).href}/`,
    async getInfoAsync(uri) { try { const s = await fsp.stat(fileURLToPath(uri)); return { exists: true, isDirectory: s.isDirectory(), size: s.size }; } catch (e) { if (e.code === 'ENOENT') return { exists: false }; throw e; } },
    makeDirectoryAsync: (uri) => fsp.mkdir(fileURLToPath(uri), { recursive: true }),
    writeAsStringAsync: (uri, text) => fsp.writeFile(fileURLToPath(uri), text),
    readAsStringAsync: (uri) => fsp.readFile(fileURLToPath(uri), 'utf8'),
    readDirectoryAsync: (uri) => fsp.readdir(fileURLToPath(uri)),
    copyAsync: ({ from, to }) => fsp.copyFile(fileURLToPath(from), fileURLToPath(to)),
    async deleteAsync(uri) {
      const target = fileURLToPath(uri);
      const relative = path.relative(root, target);
      assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
      await fsp.rm(target, { recursive: true, force: true });
    },
  };
  const data = new Map([[legacyKey, JSON.stringify([oldImport])]]);
  const storage = {
    async getItem(key) { await new Promise(setImmediate); return data.get(key) ?? null; },
    async setItem(key, value) { await new Promise(setImmediate); data.set(key, value); },
    async removeItem(key) { data.delete(key); },
    async getAllKeys() { return [...data.keys()]; },
  };
  const local = load('../services/localCaptures.ts', { './sessionProtocol': protocol, 'expo-file-system/legacy': disk });
  const reload = () => load('../services/mediaCatalog.ts', {
    '@react-native-async-storage/async-storage': { default: storage }, './sessionProtocol': protocol, './localCaptures': local,
  });
  let sequence = 0;
  return { local, disk, data, reload,
    async capture(overrides = {}, photo = false) {
      const id = `clip-${++sequence}`;
      const source = pathToFileURL(path.join(cache, `${id}.${photo ? 'jpg' : 'mp4'}`)).href;
      await fsp.writeFile(fileURLToPath(source), Buffer.alloc(256, sequence));
      const draft = { sessionId: 'session', deviceId: 'device', nodeId: 'node', id,
        takeId: photo ? null : 'take', createdAt: new Date().toISOString(), audio: false, ...overrides };
      return photo ? local.persistLocalPhoto(draft, source) : local.persistLocalCapture(draft, source);
    },
  };
}

test('NX-08: delete an owned original and its upload metadata without touching other captures', async (t) => {
  const h = await harness(t), c = h.reload();
  const video = await h.capture();
  const photo = await h.capture({}, true);
  const other = await h.capture({ sessionId: 'other-session', deviceId: 'other-phone' });
  const id = c.captureCatalogId(photo);
  await c.getMediaCatalog();
  await c.setCaptureUpload(id, { state: 'uploaded', publicId: 'photo', url: 'https://res.cloudinary.com/test/image/upload/photo.jpg' });
  await assert.rejects(c.removeOwnedLocalCapture(id, 'other-phone'), /dueño/);
  assert.equal((await h.disk.getInfoAsync(photo.localUri)).exists, true);
  await c.removeOwnedLocalCapture(id, photo.deviceId);
  assert.equal((await h.disk.getInfoAsync(photo.localUri)).exists, false);
  assert.equal(h.data.has(c.CAPTURE_CATALOG_PREFIX + id), false);
  assert.equal(await h.reload().getMediaAssetById(id), null);
  assert.equal((await h.disk.getInfoAsync(other.localUri)).exists, true);
  const videoId = c.captureCatalogId(video);
  await c.removeOwnedLocalCapture(videoId, video.deviceId);
  assert.equal(await h.reload().getMediaAssetById(videoId), null);
  assert.ok((await c.getMediaCatalog()).assets.some((item) => item.id === oldImport.id));
});

test('NX-07: JPEG original and sidecar recover into the catalog alongside legacy videos', async (t) => {
  const h = await harness(t);
  const video = await h.capture();
  const photo = await h.capture({}, true);
  assert.equal(photo.fileName, 'photo.jpg');
  assert.equal(photo.photoId, photo.id);
  const recovered = await h.reload().getMediaCatalog();
  const asset = recovered.assets.find((item) => item.localId === photo.id);
  assert.equal(asset.resourceType, 'image');
  assert.equal(asset.photoId, photo.id);
  assert.equal(asset.sessionId, photo.sessionId);
  assert.equal(asset.nodeId, photo.nodeId);
  assert.equal(await h.reload().getMediaPlaybackUri(asset), photo.localUri);
  assert.equal(recovered.assets.find((item) => item.localId === video.id).resourceType, 'video');
});

test('H3.1: legacy imports and H1 null-take sidecars load without remote placeholders or legacy migration writes', async (t) => {
  const h = await harness(t), catalog = h.reload();
  const before = h.data.get(legacyKey);
  const capture = await h.capture({ takeId: null });
  const result = await catalog.getMediaCatalog();
  assert.equal(result.problems.length, 0);
  assert.equal(result.assets.length, 2);
  const imported = result.assets.find((a) => a.id === oldImport.id);
  assert.equal(imported.storage, 'remote'); assert.equal(imported.url, oldImport.url);
  assert.equal(h.data.get(legacyKey), before);
  const clip = result.assets.find((a) => a.storage === 'local');
  assert.equal(clip.takeId, null); assert.equal(clip.localId, capture.id);
  assert.equal(clip.localAvailable, true); assert.equal(clip.upload.state, 'local');
  assert.equal('publicId' in clip, false); assert.equal('url' in clip, false);
  assert.equal(await catalog.getMediaPlaybackUri(clip), capture.localUri);
  assert.equal((await catalog.getMediaAssetById(oldImport.id)).publicId, oldImport.publicId);
});

test('H3.1: same-take clips from different Nodes and other takes cannot overwrite or duplicate each other', async (t) => {
  const h = await harness(t), catalog = h.reload();
  const [a, b, later] = await Promise.all([
    h.capture({ id: 'same-id', deviceId: 'device-a', nodeId: 'node-a', takeId: 'shared-take' }),
    h.capture({ id: 'same-id', deviceId: 'device-b', nodeId: 'node-b', takeId: 'shared-take' }),
    h.capture({ id: 'later', deviceId: 'device-a', nodeId: 'new-participation', takeId: 'second-take' }),
  ]);
  await Promise.all([catalog.incorporateLocalCapture(a), catalog.incorporateLocalCapture(b), catalog.incorporateLocalCapture(later), catalog.incorporateLocalCapture(a)]);
  const first = await catalog.getMediaAssets();
  const second = await h.reload().getMediaAssets();
  const local = second.filter((asset) => asset.storage === 'local');
  assert.equal(local.length, 3); assert.equal(new Set(local.map((a) => a.id)).size, 3);
  assert.equal(local.filter((a) => a.takeId === 'shared-take').length, 2);
  assert.equal(local.find((a) => a.takeId === 'second-take').nodeId, 'new-participation');
  assert.equal(first.length, second.length);
  assert.equal([...h.data.keys()].filter((key) => key.startsWith(catalog.CAPTURE_CATALOG_PREFIX)).length, 3);
});

test('H3.1: reopen reconstructs catalog from all H2 sidecars without needing remembered membership or an index', async (t) => {
  const h = await harness(t);
  const a = await h.capture(), b = await h.capture({ sessionId: 'older-session', takeId: null });
  let catalog = h.reload();
  assert.equal((await catalog.getMediaAssets()).filter((a) => a.storage === 'local').length, 2);
  for (const key of h.data.keys()) if (key.startsWith(catalog.CAPTURE_CATALOG_PREFIX)) h.data.delete(key);
  catalog = h.reload();
  const restored = await catalog.getMediaAssets();
  assert.ok(restored.some((item) => item.localId === a.id && item.sessionId === a.sessionId));
  assert.ok(restored.some((item) => item.localId === b.id && item.sessionId === b.sessionId));
  assert.equal(restored.find((item) => item.id === oldImport.id).url, oldImport.url);
  // No socket/auth/network dependencies are available to the module loader.
});

test('H3.1: missing or empty files remain identifiable but cannot be offered as playable, including before first indexing', async (t) => {
  const h = await harness(t), catalog = h.reload();
  const a = await h.capture(), b = await h.capture({ takeId: 'offline-result' });
  const id = await catalog.incorporateLocalCapture(a);
  await fsp.unlink(fileURLToPath(a.localUri));
  await fsp.truncate(fileURLToPath(b.localUri), 0);
  const result = await h.reload().getMediaAssets();
  const missing = result.find((asset) => asset.id === id);
  const incomplete = result.find((asset) => asset.localId === b.id);
  assert.equal(missing.localAvailable, false); assert.equal(incomplete.localAvailable, false);
  assert.ok(missing.localError); assert.equal(missing.bytes, a.bytes);
  await assert.rejects(catalog.getMediaPlaybackUri(missing), /falta|vacío|incompleto/);
  await assert.rejects(catalog.incorporateLocalCapture(a), /falta|vacío|incompleto/);
  assert.equal('confirmed' in incomplete, false); assert.equal('ack' in incomplete, false);
});

test('H3.1: availability is rechecked immediately before playback even after a successful catalog read', async (t) => {
  const h = await harness(t), catalog = h.reload(); const capture = await h.capture();
  const asset = (await catalog.getMediaAssets()).find((a) => a.storage === 'local');
  assert.equal(asset.localAvailable, true);
  await fsp.unlink(fileURLToPath(capture.localUri));
  await assert.rejects(catalog.getMediaPlaybackUri(asset), /falta/);
});

test('H3.1: upload states survive reload and concurrent reincorporation; discovery never claims upload or relay confirmation', async (t) => {
  const h = await harness(t), catalog = h.reload(); const capture = await h.capture({ takeId: 'offline-take' });
  const id = await catalog.incorporateLocalCapture(capture);
  const states = [{ state: 'queued' }, { state: 'uploading' }, { state: 'failed', error: 'Provider unavailable (fixture)' },
    { state: 'uploaded', publicId: 'fixture/clip', url: 'https://res.cloudinary.com/test/video/upload/fixture.mp4' }];
  for (const state of states) {
    await Promise.all([catalog.setCaptureUpload(id, state), catalog.incorporateLocalCapture(capture)]);
    const loaded = await h.reload().getMediaAssetById(id);
    assert.deepEqual(JSON.parse(JSON.stringify(loaded.upload)), state);
    assert.equal(loaded.localAvailable, true);
    assert.equal('publicId' in loaded, false); assert.equal('url' in loaded, false);
    assert.equal('confirmed' in loaded, false);
  }
  await assert.rejects(catalog.setCaptureUpload(id, { state: 'uploaded' }), /referencia remota/);
  await assert.rejects(catalog.setCaptureUpload(id, { state: 'local', url: 'fake' }), /inválido/);
});

test('H3.1: concurrent legacy import writes preserve old/unknown data and are separate from capture incorporation', async (t) => {
  const h = await harness(t), catalog = h.reload(); const capture = await h.capture();
  const unknown = { futureRecord: 'keep-me' };
  h.data.set(legacyKey, JSON.stringify([oldImport, unknown]));
  await Promise.all([
    catalog.saveMediaAsset({ ...oldImport, storage: 'remote', id: 'new-one' }),
    catalog.saveMediaAsset({ ...oldImport, storage: 'remote', id: 'new-two' }),
    catalog.incorporateLocalCapture(capture),
  ]);
  const stored = JSON.parse(h.data.get(legacyKey));
  assert.ok(stored.some((item) => item.futureRecord === unknown.futureRecord));
  const all = await catalog.getMediaAssets();
  assert.equal(all.filter((asset) => asset.storage === 'remote').length, 3);
  assert.equal(all.filter((asset) => asset.storage === 'local').length, 1);
});
