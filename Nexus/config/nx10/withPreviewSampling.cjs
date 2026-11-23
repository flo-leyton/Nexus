/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { withAppBuildGradle, withDangerousMod, withMainApplication, withPlugins } = require('expo/config-plugins');

function insert(source, anchor, addition) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const patch = addition.replaceAll('\n', newline);
  const position = source.indexOf(anchor);
  if (position === -1 || source.indexOf(anchor, position + anchor.length) !== -1) {
    throw new Error(`NX-10: expected one Expo Camera anchor: ${anchor}`);
  }
  if (source.startsWith(anchor + newline + patch, position)) return source;
  return source.slice(0, position) + anchor + newline + patch + source.slice(position + anchor.length);
}

function addPreviewSampling(cameraRoot) {
  const { version } = JSON.parse(fs.readFileSync(path.join(cameraRoot, 'package.json'), 'utf8'));
  if (version !== '17.0.10') throw new Error(`NX-10: review the Android adapter for expo-camera ${version}`);
  const kotlin = path.join(cameraRoot, 'android/src/main/java/expo/modules/camera');
  const viewFile = path.join(kotlin, 'ExpoCameraView.kt');
  const moduleFile = path.join(kotlin, 'CameraViewModule.kt');
  const originalView = fs.readFileSync(viewFile, 'utf8');
  const originalModule = fs.readFileSync(moduleFile, 'utf8');
  const view = insert(insert(originalView, '  private var previewPaused = false', `
  private var nx10Sampler: Nx10PreviewSampler? = null

  fun setNx10PreviewSampling(enabled: Boolean) {
    if (enabled && nx10Sampler == null) nx10Sampler = Nx10PreviewSampler(previewView)
    nx10Sampler?.setEnabled(enabled)
  }`), '  fun cleanupCamera() {', '    nx10Sampler?.setEnabled(false)');
  const cameraModule = insert(insert(originalModule, '    Name("ExpoCamera")',
    '    Constant("nx10PreviewSamplingAvailable") { true }'), '    View(ExpoCameraView::class) {', `
      Prop("nx10PreviewSampling") { view, enabled: Boolean? ->
        view.setNx10PreviewSampling(enabled == true)
      }`);
  fs.copyFileSync(path.join(__dirname, 'Nx10PreviewSampler.kt'), path.join(kotlin, 'Nx10PreviewSampler.kt'));
  if (view !== originalView) fs.writeFileSync(viewFile, view);
  if (cameraModule !== originalModule) fs.writeFileSync(moduleFile, cameraModule);
}

module.exports = (config, { webRtc = false } = {}) => {
  if (webRtc) {
    config = withPlugins(config, ['@config-plugins/react-native-webrtc']);
    config = withMainApplication(config, (mod) => {
      mod.modResults.contents = insert(mod.modResults.contents, '            PackageList(this).packages.apply {',
        '              add(com.oney.WebRTCModule.Nx10WebRtcPackage())');
      return mod;
    });
    config = withAppBuildGradle(config, (mod) => {
      mod.modResults.contents = insert(mod.modResults.contents, '\ndependencies {',
        "    implementation project(':expo-camera')\n    implementation project(':react-native-webrtc')");
      return mod;
    });
  }
  return withDangerousMod(config, ['android', (mod) => {
    const cameraPackage = require.resolve('expo-camera/package.json', { paths: [mod.modRequest.projectRoot] });
    addPreviewSampling(path.dirname(cameraPackage));
    if (webRtc) {
      const bridge = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java/com/oney/WebRTCModule');
      fs.mkdirSync(bridge, { recursive: true });
      fs.copyFileSync(path.join(__dirname, 'Nx10WebRtcPackage.kt'), path.join(bridge, 'Nx10WebRtcPackage.kt'));
    }
    return mod;
  }]);
};
module.exports.addPreviewSampling = addPreviewSampling;
module.exports.assertPreviewSampling = (cameraRoot) => {
  const kotlin = path.join(cameraRoot, 'android/src/main/java/expo/modules/camera');
  const read = (file) => fs.readFileSync(path.join(kotlin, file), 'utf8');
  if (!read('ExpoCameraView.kt').includes('Nx10PreviewSampler(previewView)') ||
      !read('CameraViewModule.kt').includes('Prop("nx10PreviewSampling")') ||
      read('Nx10PreviewSampler.kt') !== fs.readFileSync(path.join(__dirname, 'Nx10PreviewSampler.kt'), 'utf8')) {
    throw new Error('NX-10: Android prebuild did not install the preview sampler.');
  }
};
