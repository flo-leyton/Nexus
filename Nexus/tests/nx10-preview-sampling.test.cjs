/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { addPreviewSampling, assertPreviewSampling } = require('../config/nx10/withPreviewSampling.cjs');

test('NX-10 Android patch is opt-in, reproducible and leaves CameraX binding and recorder untouched', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-nx10-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installed = path.dirname(require.resolve('expo-camera/package.json'));
  const relative = 'android/src/main/java/expo/modules/camera';
  const target = path.join(root, relative);
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(path.join(installed, 'package.json'), path.join(root, 'package.json'));
  const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8').replaceAll('\r\n', '\n');
  const originals = new Map();
  for (const file of ['ExpoCameraView.kt', 'CameraViewModule.kt']) {
    const source = path.join(installed, relative);
    originals.set(file, read(source, file));
    fs.copyFileSync(path.join(source, file), path.join(target, file));
  }
  assert.ok([...originals.values()].every((source) => !source.includes('nx10PreviewSampling')));
  assert.throws(() => assertPreviewSampling(root), /NX-10/);
  addPreviewSampling(root);
  assert.doesNotThrow(() => assertPreviewSampling(root));
  const view = read(target, 'ExpoCameraView.kt');
  const module = read(target, 'CameraViewModule.kt');
  const sampler = read(target, 'Nx10PreviewSampler.kt');
  assert.equal(sampler, read(path.resolve(__dirname, '../config/nx10'), 'Nx10PreviewSampler.kt'));
  assert.equal(view.replace(/\n\n  private var nx10Sampler:[\s\S]*?\n  }/, '')
    .replace('\n    nx10Sampler?.setEnabled(false)', ''), originals.get('ExpoCameraView.kt'));
  assert.equal(module.replace('\n    Constant("nx10PreviewSamplingAvailable") { true }', '')
    .replace(/\n\n      Prop\("nx10PreviewSampling"\) \{[\s\S]*?\n      }/, ''), originals.get('CameraViewModule.kt'));
  addPreviewSampling(root);
  assert.equal(read(target, 'ExpoCameraView.kt'), view);
  assert.equal(read(target, 'CameraViewModule.kt'), module);

  const resolveConfig = require('../app.config.js');
  const originalFlag = process.env.NEXUS_NX10_NATIVE;
  try {
    delete process.env.NEXUS_NX10_NATIVE;
    assert.deepEqual(resolveConfig({ config: {} }), {});
    process.env.NEXUS_NX10_NATIVE = '1';
    assert.equal(typeof resolveConfig({ config: {} }).mods.android.dangerous, 'function');
  } finally {
    if (originalFlag === undefined) delete process.env.NEXUS_NX10_NATIVE;
    else process.env.NEXUS_NX10_NATIVE = originalFlag;
  }
});
