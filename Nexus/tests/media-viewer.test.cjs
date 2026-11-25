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
    './LocalVideoPlayer': { LocalVideoPlayer: 'Player' },
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
  assert.equal(photo.props.source.uri, 'file:///photo.jpg');
  assert.equal(photo.props.resizeMode, 'contain');
  const closeButton = modal().props.children.props.children.props.children[0].props.children[1];
  closeButton.props.onPress();
  assert.equal(render().viewer, null);
  render().open('video', async () => { throw new Error('Archivo no disponible'); });
  await flush();
  assert.equal(content(modal()).props.children, 'Archivo no disponible');
  focused = false;
  blur();
  assert.equal(render().viewer, false);
});
