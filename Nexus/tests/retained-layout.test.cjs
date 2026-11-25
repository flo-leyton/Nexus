const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(file,globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,...globals});return exports;}
test('Retained visibility keeps a zero-height clipped panel without display:none and restores natural size',()=>{
 const {retainedVisibility}=load('components/retainedVisibility.ts');const hidden=retainedVisibility(false),visible=retainedVisibility(true);
 assert.equal(hidden.height,0);assert.equal(hidden.overflow,'hidden');assert.equal(hidden.opacity,0);assert.equal('display' in hidden,false);assert.equal('height' in visible,false);
});
test('Playback diagnostics are dev-only and never include URI, token, IDs or raw error content',()=>{
 const messages=[];const {createPlaybackDiagnostics}=load('components/diagnostics/playbackDiagnostics.ts',{__DEV__:true,console:{info:(...args)=>messages.push(args)}});
 const trace=createPlaybackDiagnostics(false);trace('status',{status:'error',error:true,uri:'file:///private.mp4',token:'secret',sessionId:'private-session',message:'private-error'});
 trace('layout',{width:123.4,height:Infinity});trace('private-event',{uri:'private'});assert.equal(messages.length,2);const data=JSON.parse(messages[0][1]);assert.equal(data.error,true);assert.equal(data.status,'error');assert.equal(data.remote,false);assert.ok(!JSON.stringify(messages).includes('private'));assert.ok(!JSON.stringify(messages).includes('secret'));assert.equal(JSON.parse(messages[1][1]).width,123);
 const release=load('components/diagnostics/playbackDiagnostics.ts',{__DEV__:false,console:{info:()=>assert.fail('Release must not log')}});release.createPlaybackDiagnostics(true)('mount');
});
test('Layout audit accepts retained style changes but rejects changed callbacks or capture owner structure',()=>{
 const {assertPresentationOnly}=require('../docs/ux/implementation/verify-retained-layout.cjs');
 const before="const x=<View key='capture' style={{display:'none'}} onPress={stop}><Owner /></View>;";
 const after="const x=<View key='capture' style={{height:0}} onPress={stop}><Owner /></View>;";
 assert.doesNotThrow(()=>assertPresentationOnly(before,after,'test.tsx'));
 assert.throws(()=>assertPresentationOnly(before,after.replace('onPress={stop}','onPress={start}'),'test.tsx'));
 assert.throws(()=>assertPresentationOnly(before,after.replace('<Owner />','<OtherOwner />'),'test.tsx'));
});

test('Studio presents one pending notice and keeps session identity in technical details', () => {
  const jsx = (type, props) => ({ type, props });
  const deps = {
    react: { useState: (value) => [value, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { StyleSheet: { create: (styles) => styles } },
    'react-native-paper': { useTheme: () => ({ colors: {} }) },
    '@/components/retainedVisibility': { retainedVisibility: () => ({}) },
    '@/constants/studio-ui': { StudioShape: {}, StudioSpacing: {}, StudioUI: { light: {} } },
    '@/components/session/SessionUI': { SessionDetails: 'Details', sessionStateLabel: { ready: 'Preparada' } },
    './StudioStatus': { StudioStatus: 'Status' },
  };
  const source = fs.readFileSync('components/studio/StudioHome.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => deps[name] });
  const nodes = (element) => Array.isArray(element) ? element.flatMap(nodes)
    : element && typeof element === 'object' ? [element, ...nodes(element.props.children)] : [element];
  const props = { connected: true, serviceReady: true, deviceId: 'controller', pendingMessage: 'Esperando aprobación',
    notice: 'Enviando solicitud', sessions: [{ sessionId: 'private-session', code: 'ABC123', controllerId: 'controller', state: 'ready' }] };
  const tree = nodes(exports.StudioHome(props));
  assert.deepEqual(tree.filter((item) => item?.type === 'Status').map((item) => item.props.message), ['Esperando aprobación']);
  assert.ok(tree.includes('ABC123'));
  assert.ok(nodes(tree.find((item) => item?.type === 'Details')).includes('private-session'));
  const failed = nodes(exports.StudioHome({ ...props, failed: true, notice: 'Error de ingreso' }));
  assert.deepEqual(failed.filter((item) => item?.type === 'Status').map((item) => item.props.message), ['Error de ingreso']);
});

test('Node keeps camera and recovery callbacks available while putting local recording in diagnostics', () => {
  const jsx = (type, props, key) => ({ type, props, key });
  const deps = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', StyleSheet: {} },
    'react-native-paper': { Button: 'Button', Text: 'Text', useTheme: () => ({ colors: {} }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    './SessionUI': { SessionDetails: 'Details', SessionBadge: 'Badge', SessionNotice: 'Notice', sessionStyles: {} },
    './PreviewZoomSlider': {},
  };
  const source = fs.readFileSync('components/session/NodeCaptureView.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => deps[name] });
  const camera = { type: 'CameraView' };
  const props = { camera, accepted: true, reasons: [], requiresConfirmation: true, canRecord: true,
    preparation: { phase: 'ready', readiness: { cameraPermission: 'granted' } },
    onStop() {}, onRecord() {}, onPrepare() {}, onPhoto() {}, onConfirmReady() {}, onRetrySave() {} };
  const render = (overrides) => exports.NodeCaptureView({ ...props, ...overrides }).props.children;
  const normal = render();
  const preview = (tree) => tree.find((item) => item?.key === 'preview');
  const actions = (tree) => tree.find((item) => item?.key === 'actions').props.children.filter(Boolean);
  assert.equal(preview(normal).props.children[0], camera);
  assert.equal(preview(render({ fullPreview: true })).props.children[0], camera);
  assert.equal(actions(normal).some((item) => item.props.onPress === props.onRecord), false);
  const tools = normal.find((item) => item?.props?.title === 'Herramientas de cámara');
  assert.deepEqual(Array.from(tools.props.children, (item) => item.props.onPress), [props.onPrepare, props.onRecord]);
  assert.deepEqual(Array.from(actions(normal), (item) => item.props.onPress), [props.onConfirmReady, props.onPhoto]);
  assert.equal(actions(render({ accepted: false, preparation: { ...props.preparation, phase: 'recording' } }))[0].props.onPress, props.onStop);
  assert.equal(actions(render({ preparation: { ...props.preparation, pendingSave: true } }))[0].props.onPress, props.onRetrySave);
});
