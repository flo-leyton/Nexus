/* global __dirname */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const REQUIRED_EXPO = ['expo-video', 'expo-camera', 'expo-file-system', 'expo-crypto', 'expo-image-picker',
  'expo-notifications', 'expo-device', 'expo-network', 'expo-battery', 'expo-constants', 'expo-linking',
  'expo-image', 'expo-font', 'expo-haptics', 'expo-splash-screen', 'expo-system-ui', 'expo-web-browser'];
const REQUIRED_RN = ['@react-native-async-storage/async-storage', 'react-native-gesture-handler',
  'react-native-reanimated', 'react-native-safe-area-context', 'react-native-screens', 'react-native-worklets'];
function assertNativeModules(expo, reactNative, app) {
  for (const name of REQUIRED_EXPO) assert.ok(expo.modules.some((m) => m.packageName === name), `Autolinking Android: falta ${name}. Reinstala dependencias antes de construir el APK.`);
  for (const name of REQUIRED_RN) assert.ok(reactNative.dependencies[name]?.platforms?.android, `Autolinking Android: falta ${name}.`);
  const video = expo.modules.find((m) => m.packageName === 'expo-video');
  assert.ok(video.projects.some((p) => p.modules?.includes('expo.modules.video.VideoModule')), 'No se enlazó ExpoVideo. Hace falta reconstruir el APK nativo.');
  const plugins = app.expo.plugins.map((p) => Array.isArray(p) ? p[0] : p);
  for (const name of ['expo-video', 'expo-camera', 'expo-image-picker', 'expo-notifications']) assert.ok(plugins.includes(name), `Falta plugin ${name} en app.json.`);
}
function checkNative(root = path.resolve(__dirname, '..')) {
  const cli = path.join(root, 'node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js');
  const run = (command) => JSON.parse(execFileSync(process.execPath, [cli, command, '--platform', 'android', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
  const expo = run('resolve'), reactNative = run('react-native-config');
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assertNativeModules(expo, reactNative, app);
  return { expo, reactNative, app };
}
if (require.main === module && (!process.env.EAS_BUILD_PLATFORM || process.env.EAS_BUILD_PLATFORM === 'android')) {
  try {
    const { expo, reactNative } = checkNative();
    if (['development-nx10', 'presentation-nx10'].includes(process.env.EAS_BUILD_PROFILE)) {
      const camera = expo.modules.find((module) => module.packageName === 'expo-camera');
      const sourceProjects = expo.configuration?.buildFromSource ?? [];
      if (!camera.projects.some((project) => sourceProjects.some((pattern) =>
        new RegExp(`^(?:${pattern})$`).test(project.name)))) {
        throw new Error('NX-10: Expo Autolinking debe compilar expo-camera desde fuentes en Android.');
      }
      const cameraRoot = path.dirname(require.resolve('expo-camera/package.json'));
      try { require('../config/nx10/withPreviewSampling.cjs').assertPreviewSampling(cameraRoot); }
      catch { throw new Error('NX-10: falta el adaptador Android después de Prebuild.'); }
      if (process.env.NEXUS_NX10_WEBRTC_NATIVE === '1') {
        const root = path.resolve(__dirname, '..');
        const bridge = 'Nx10WebRtcPackage.kt';
        const generated = path.join(root, 'android/app/src/main/java/com/oney/WebRTCModule', bridge);
        if (!reactNative.dependencies['react-native-webrtc']?.platforms?.android || !fs.existsSync(generated) ||
            !fs.readFileSync(generated).equals(fs.readFileSync(path.join(root, 'config/nx10', bridge)))) {
          throw new Error('NX-10: falta WebRTC Android o el puente de PixelCopy generado por Prebuild.');
        }
      }
      console.log('NX-10: adaptador Android verificado después de Prebuild.');
    }
    console.log('Android autolinking OK: ExpoVideo, cámara, archivos, persistencia Auth y módulos de la app. Falta comprobar el APK construido.');
  }
  catch (error) {
    console.error(error.message.startsWith('NX-10:') ? error.message :
      'Falló la verificación nativa Android. Ejecuta npm ci y node scripts/check-native.cjs; no instales un APK incompleto.');
    process.exitCode = 1;
  }
}
module.exports = { checkNative, assertNativeModules };
