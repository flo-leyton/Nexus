const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

test('media viewer opens immediately, selects the latest file, and drops the player on dismissal', async () => {
  let selection = null;
  let focused = true;
  let focusEffect;
  const request = { current: 0 };
  const jsx = (type, props, key) => ({ type, props, key });
  const deps = {
    react: { useCallback: (fn) => fn, useRef: () => request, useState: (initial) =>
      initial === null ? [selection, (value) => { selection = value; }] : [initial, () => {}] },
    '@react-navigation/native': { useFocusEffect: (effect) => { focusEffect = effect; }, useIsFocused: () => focused },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Modal: 'Modal', Image: 'Image', useWindowDimensions: () => ({ height: 800 }) },
    'react-native-paper': { ActivityIndicator: 'Spinner', useTheme: () => ({ colors: {} }) },
    'react-native-safe-area-context': {},
    'react-native-gesture-handler': { GestureHandlerRootView: 'GestureRoot' },
    './LocalVideoPlayer': { LocalVideoPlayer: 'Player' },
    './PhotoViewport': { PhotoViewport: 'Photo' },
  };
  const source = fs.readFileSync('components/MediaViewer.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { Error, exports, require: (name) => deps[name] });
  const render = () => exports.useMediaViewer();
  const flush = () => new Promise(setImmediate);
  const modal = () => {
    const { viewer } = render();
    return viewer.type(viewer.props);
  };
  const content = (tree) => tree.props.children.props.children.props.children[1].props.children;
  const initial = render();
  const blur = focusEffect();
  let first;
  initial.open('video', () => new Promise((resolve) => { first = resolve; }));
  assert.equal(modal().type, 'Modal');
  assert.equal(content(modal()).type, 'Spinner');
  await flush();
  render().open('video', async () => 'https://example.test/second.mp4', true);
  await flush();
  first('file:///first.mp4');
  await flush();
  const video = content(modal());
  assert.equal(video.type, 'Player');
  assert.equal(video.props.uri, 'https://example.test/second.mp4');
  assert.equal(video.props.remote, true);
  modal().props.onRequestClose();
  assert.equal(render().viewer, null);
  render().open('video', async () => 'file:///original.mp4');
  await flush();
  assert.equal(content(modal()).props.uri, 'file:///original.mp4');
  assert.equal(content(modal()).props.remote, false);
  render().close();
  render().open('image', async () => 'file:///photo.jpg');
  await flush();
  const photo = content(modal());
  assert.equal(photo.type, 'Photo');
  assert.equal(photo.props.uri, 'file:///photo.jpg');
  const closeButton = modal().props.children.props.children.props.children[0].props.children[1];
  closeButton.props.onPress();
  assert.equal(render().viewer, null);
  render().open('image', async () => 'file:///other.jpg');
  await flush();
  assert.notEqual(content(modal()).key, photo.key);
  render().close();
  render().open('video', async () => { throw new Error('Archivo no disponible'); });
  await flush();
  assert.equal(content(modal()).props.children, 'Archivo no disponible');
  focused = false;
  blur();
  assert.equal(render().viewer, false);
});

test('photo zoom fits the original proportions, zooms around the tap and clamps dragging', () => {
  const source = fs.readFileSync('components/PhotoViewport.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({ StyleSheet: { create: (styles) => styles } }) });
  const { containSize, zoomPhoto, constrainPhoto } = exports;
  const view = { width: 300, height: 400 };
  const photo = containSize(view, { width: 1200, height: 800 });
  assert.equal(photo.width, 300);
  assert.equal(photo.height, 200);
  const start = { scale: 1, x: 0, y: 0 };
  const tap = { x: 75, y: 0 };
  const zoomed = zoomPhoto(start, 2, tap, tap, view, photo);
  assert.equal(zoomed.scale, 2);
  assert.equal(zoomed.x, -75);
  assert.equal(zoomed.y, 0);
  const dragged = constrainPhoto({ scale: 2, x: 999, y: -999 }, view, photo);
  assert.equal(dragged.x, 150);
  assert.equal(dragged.y, 0);
  assert.equal(zoomPhoto(start, 8, tap, tap, view, photo).scale, 4);
  const reset = zoomPhoto(zoomed, 0.5, tap, tap, view, photo);
  assert.equal(reset.scale, 1);
  assert.ok(reset.x === 0 && reset.y === 0);
});
