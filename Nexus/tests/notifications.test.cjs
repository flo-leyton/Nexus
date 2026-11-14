const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function loadService(options = {}) {
  const calls = [];
  const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' };
  const denied = { ...granted, status: 'denied', granted: false, canAskAgain: options.canAskAgain ?? true };
  const constants = {
    executionEnvironment: options.expoGo ? 'storeClient' : 'bare',
    expoConfig: { extra: { eas: { projectId: options.missingProject ? undefined : 'test-project' } } },
    easConfig: options.fallbackProject ? { projectId: 'fallback-project' } : null,
  };
  let handler;
  const notifications = {
    AndroidImportance: { HIGH: 4 },
    setNotificationHandler(value) { handler = value; },
    async setNotificationChannelAsync() { calls.push('channel'); },
    async getPermissionsAsync() { calls.push('permissions'); return options.denied ? denied : granted; },
    async requestPermissionsAsync() { calls.push('request'); return options.denyRequest ? denied : granted; },
    async getExpoPushTokenAsync({ projectId }) {
      calls.push(`expo:${projectId}`);
      if (options.expoFailure) throw new Error('sensitive provider detail');
      return { data: 'expo-test-token' };
    },
    async getDevicePushTokenAsync() {
      calls.push('native');
      if (options.nativeFailure) throw new Error('sensitive provider detail');
      return { type: 'android', data: 'native-test-token' };
    },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/notifications.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === 'expo-constants') return { __esModule: true, default: constants };
      if (name === 'expo-device') return { isDevice: options.physical ?? true };
      if (name === 'react-native') return { Platform: { OS: options.platform ?? 'android' } };
      if (name === 'expo-notifications') { calls.push('load-native'); return notifications; }
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { service: exports, calls, getHandler: () => handler };
}

test('push: channel precedes permissions; both tokens remain distinct; handler presents alerts', async () => {
  const { service, calls, getHandler } = loadService({ denied: true });
  const result = await service.registerForPushNotifications();
  assert.equal(result.status, 'registered');
  assert.ok(calls.indexOf('channel') < calls.indexOf('permissions'));
  assert.ok(calls.indexOf('request') < calls.indexOf('expo:test-project'));
  assert.equal(result.expoPushToken, 'expo-test-token');
  assert.equal(result.nativePushToken, 'native-test-token');
  const behavior = await getHandler().handleNotification();
  assert.equal(behavior.shouldShowBanner, true);
  assert.equal(behavior.shouldShowList, true);
});

test('push: denied permissions never request tokens and blocked permission is not requested again', async () => {
  for (const canAskAgain of [true, false]) {
    const { service, calls } = loadService({ denied: true, denyRequest: true, canAskAgain });
    const result = await service.registerForPushNotifications();
    assert.equal(result.status, 'permission-denied');
    assert.equal(calls.includes('native'), false);
    assert.equal(calls.some(c => c.startsWith('expo:')), false);
    assert.equal(calls.includes('request'), canAskAgain);
  }
});

test('push: unsupported environments return clear errors without loading native notifications', async () => {
  for (const options of [{ platform: 'web' }, { expoGo: true }, { physical: false }]) {
    const { service, calls } = loadService(options);
    const result = await service.registerForPushNotifications();
    assert.equal(result.status, 'error');
    assert.ok(result.error);
    assert.equal(calls.includes('load-native'), false);
  }
});

test('push: missing project and Expo failure still preserve native token; provider details stay private', async () => {
  for (const options of [{ missingProject: true }, { expoFailure: true }]) {
    const { service } = loadService(options);
    const result = await service.registerForPushNotifications();
    assert.equal(result.status, 'error');
    assert.equal(result.expoPushToken, null);
    assert.equal(result.nativePushToken, 'native-test-token');
    assert.equal(result.error.includes('sensitive provider detail'), false);
  }
});

test('push: EAS fallback works and native failure preserves Expo token', async () => {
  const { service, calls } = loadService({ missingProject: true, fallbackProject: true, nativeFailure: true });
  const result = await service.registerForPushNotifications();
  assert.ok(calls.includes('expo:fallback-project'));
  assert.equal(result.status, 'error');
  assert.equal(result.expoPushToken, 'expo-test-token');
  assert.equal(result.nativePushToken, null);
});
