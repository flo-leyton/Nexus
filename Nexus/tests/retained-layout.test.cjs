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

test('Studio shows the official mark and keeps session identity in technical details', () => {
  const jsx = (type, props) => ({ type, props });
  const deps = {
    react: { useState: (value) => [value, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Image: 'Image', StyleSheet: { create: (styles) => styles } },
    '../../assets/nexus-official/adaptive-icon.png': 'official-mark',
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
  const mark = tree.find((item) => item?.type === 'Image');
  assert.equal(mark.props.source, 'official-mark');
  assert.equal(mark.props.resizeMode, 'contain');
  assert.deepEqual(tree.filter((item) => item?.type === 'Status').map((item) => item.props.message), ['Esperando aprobación']);
  assert.ok(tree.includes('ABC123'));
  assert.ok(nodes(tree.find((item) => item?.type === 'Details')).includes('private-session'));
  const failed = nodes(exports.StudioHome({ ...props, failed: true, notice: 'Error de ingreso' }));
  assert.deepEqual(failed.filter((item) => item?.type === 'Status').map((item) => item.props.message), ['Error de ingreso']);
});

test('Session puts participation before the same camera slot across updates', () => {
  const jsx = (type, props, key) => ({ type, props, key });
  const deps = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', useWindowDimensions: () => ({ width: 420 }) },
    'react-native-paper': { Button: 'Button' },
    '@/components/retainedVisibility': load('components/retainedVisibility.ts'),
    './SessionUI': { SessionCanvas: 'Canvas', sessionStyles: {} },
  };
  const source = fs.readFileSync('components/session/SessionPage.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => deps[name] });
  const capture = { type: 'CameraOwner' };
  const slots = (members, fullPreview = false) => exports.SessionPage({ capture, members, fullPreview })
    .props.children[2].props.children[0].props.children;
  for (const views of [slots('READY'), slots('NO LISTO'), slots(null), slots('READY', true)]) {
    assert.equal(views[0].key, 'members');
    assert.equal(views[1].key, 'capture-owner');
    assert.equal(views[1].props.children, capture);
  }
  assert.equal(slots('READY', true)[0].props.style[1].display, 'none');
});

test('Node keeps local REC and STOP visible with the original camera and recovery callbacks', () => {
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
  const tools = normal.find((item) => item?.props?.title === 'Herramientas de cámara');
  assert.equal(tools.props.children.props.onPress, props.onPrepare);
  const [confirm, row] = actions(normal);
  const [rec, photo] = row.props.children;
  assert.equal(confirm.props.onPress, props.onConfirmReady);
  assert.equal(photo.props.onPress, props.onPhoto);
  assert.equal(rec.props.children, 'REC local');
  assert.equal(rec.props.onPress, props.onRecord);
  assert.equal(actions(render({ canRecord: false }))[1].props.children[0].props.disabled, true);
  const [stop] = actions(render({ accepted: false, preparation: { ...props.preparation, phase: 'recording' } }));
  assert.equal(stop.props.children, 'STOP local');
  assert.equal(stop.props.onPress, props.onStop);
  assert.equal(actions(render({ preparation: { ...props.preparation, pendingSave: true } }))[0].props.onPress, props.onRetrySave);
});

test('Node recovery stays above the keyed camera and never requests reentry to another session', () => {
  const jsx = (type, props) => ({ type, props });
  const deps = {
    'react/jsx-runtime': { jsx },
    react: { useEffect() {}, useRef: (current) => ({ current }), useState: (value) => [value, () => {}] },
    './session/RejoinSessionView': { RejoinSessionView: 'Recovery' },
    '@/hooks/use-studio-session': {},
  };
  const source = fs.readFileSync('components/RejoinSessionPanel.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => deps[name] });
  const calls = [];
  const snapshot = { connection: 'Connected', sessions: {}, pending: {},
    lastNodeSession: { sessionId: 'other', code: 'ABC123' } };
  const service = { getSnapshot: () => snapshot, resumeSession: (id) => calls.push(id), requestRejoin: () => calls.push('rejoin') };
  const scope = { sessionId: 'open', confirmed: false, canResume: true };
  const render = (overrides = {}) => exports.RejoinSessionPanel({ service, snapshot, deviceId: 'node', scope, ...overrides });
  const active = render().props;
  assert.equal(active.last, null);
  assert.equal(active.showRecovery, true);
  active.onRejoin();
  active.onResume();
  assert.deepEqual(calls, ['open']);
  assert.equal(render({ blocked: true }).props.disabled, true);
  assert.equal(render({ scope: { ...scope, confirmed: true } }), null);
  snapshot.lastNodeSession = { sessionId: 'open', code: 'DEF456' };
  render().props.onRejoin();
  assert.deepEqual(calls, ['open', 'rejoin']);
  snapshot.pending.open = [{ deviceId: 'node' }];
  assert.equal(render().props.showRecovery, false);
  assert.equal(render().props.pending, true);
  const route = fs.readFileSync('app/session/[id].tsx', 'utf8');
  assert.match(route, /members=\{showParticipation[\s\S]*?<NodeParticipation[\s\S]*?<RejoinSessionPanel/);
  assert.match(route, /<NodeReadinessPanel key=\{localNode\.nodeId\}/);
  assert.doesNotMatch(route, /rejoin=\{|conservar rol<\/Button>/);
});
