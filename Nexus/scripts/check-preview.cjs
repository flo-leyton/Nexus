const { validateOnlineBuild } = require('../config/previewBuild');
const { checkNative } = require('./check-native.cjs');
try {
  validateOnlineBuild(process.env);
  checkNative();
  console.log('Preflight preview OK: configuración pública y autolinking. No se compiló ni publicó un APK.');
} catch (error) {
  console.error(error.message); // Validators report variable/module names, never values.
  process.exitCode = 1;
}
