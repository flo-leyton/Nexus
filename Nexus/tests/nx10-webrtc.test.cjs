/* global __dirname */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const WebSocket = require('ws');
const protocol = require('../services/sessionProtocol.ts');
const { startTestRelay, authenticate } = require('./helpers/relay.cjs');

const sdp = 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000\r\n';
const request = (senderId, sessionId, type, payload, targetId) => ({
  protocolVersion: 1, senderId, sessionId, type, payload, targetId, messageId: randomUUID(), sentAt: Date.now(),
});
const signal = (sender, session, target, nodeId, connectionId, details) =>
  request(sender, session, 'PREVIEW_SIGNAL', { nodeId, connectionId, ...details }, target);

test('NX-10 lazy preview resolves to a React wrapper that renders the native host view', async () => {
  let loadVideo;
  let rtcImports = 0;
  const nativeView = 'RTCVideoView';
  const dependencies = {
    react: { lazy: (load) => { loadVideo = load; return {}; } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native': {},
    'react-native-paper': {},
    'react-native-webrtc': { RTCView: nativeView },
    '@/services/previewTransport': {},
    './SessionUI': {},
  };
  const source = fs.readFileSync(path.join(__dirname, '../components/session/ExperimentalPreview.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { exports: {}, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    if (name === 'react-native-webrtc') rtcImports++;
    return dependencies[name];
  } });
  assert.equal(rtcImports, 0);
  const { default: PreviewVideo } = await loadVideo();
  assert.equal(typeof PreviewVideo, 'function');
  assert.equal(rtcImports, 1);
  const props = { streamURL: 'remote-stream', objectFit: 'contain', onDimensionsChange() {} };
  const element = PreviewVideo(props);
  assert.equal(element.type, nativeView);
  assert.equal(element.props.streamURL, props.streamURL);
  assert.equal(element.props.objectFit, props.objectFit);
  assert.equal(element.props.onDimensionsChange, props.onDimensionsChange);
});

test('NX-10 signaling schema only accepts bounded targeted video negotiation', () => {
  const offer = signal('controller', 'session', 'node', 'node', 'peer', { kind: 'offer', sdp });
  assert.ok(protocol.isSessionRequest(offer));
  assert.ok(!protocol.isSessionRequest({ ...offer, targetId: undefined }));
  assert.ok(!protocol.isSessionRequest({ ...offer, payload: { ...offer.payload, sdp: sdp + 'm=audio 9 RTP/AVP 0\r\n' } }));
  assert.ok(!protocol.isSessionRequest({ ...offer, payload: { ...offer.payload, sdp: sdp + 'x'.repeat(16384) } }));
  assert.ok(!protocol.isSessionRequest(signal('controller', 'session', 'node', 'node', 'peer',
    { kind: 'ice', candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 1 })));
});

test('NX-10 authenticated relay isolates video, rejects stale signals and preserves an active take after preview close', { timeout: 15000 }, async (t) => {
  const runtime = await startTestRelay(t, { previewEnabled: true });
  async function connect(id) {
    const socket = new WebSocket(`ws://127.0.0.1:${runtime.server.address().port}`);
    t.after(() => socket.terminate());
    await once(socket, 'open');
    await authenticate(socket, id);
    const inbox = [];
    socket.on('message', (data) => inbox.push(JSON.parse(String(data))));
    return { inbox, send: (message) => socket.send(JSON.stringify(message)), async wait(check) {
      while (!inbox.some(check)) await once(socket, 'message');
      return inbox.find(check);
    } };
  }
  const controller = await connect('controller');
  const node = await connect('node');
  const foreign = await connect('foreign');
  const sendRequest = async (socket, message) => {
    socket.send(message);
    return socket.wait((event) => event.payload?.requestId === message.messageId);
  };
  const sid = 'test-session';
  const { payload: { session } } = await sendRequest(controller, request('controller', sid, 'SESSION_CREATE', {}));
  const join = request('node', sid, 'SESSION_JOIN_REQUEST', { code: session.code });
  await sendRequest(node, join);
  const admission = await sendRequest(controller, request('controller', sid, 'SESSION_JOIN_ACCEPT', { requestId: join.messageId }, 'node'));
  const nodeId = admission.payload.session.members.node.nodeId;
  const readiness = { cameraPermission: 'granted', cameraAvailable: true, enginePrepared: true, error: null };
  await sendRequest(node, request('node', sid, 'NODE_STATE', { readiness }, 'controller'));
  const offer = signal('controller', sid, nodeId, nodeId, 'peer1', { kind: 'offer', sdp });
  controller.send(offer);
  await node.wait((event) => event.messageId === offer.messageId);
  controller.send(offer);
  const wrongNode = await sendRequest(controller, signal('controller', sid, 'wrong', 'wrong', 'peer1', { kind: 'close' }));
  assert.equal(wrongNode.payload.code, 'PREVIEW_INVALID_NODE');
  const impersonation = await sendRequest(node, signal('node', sid, 'controller', nodeId, 'peer1', { kind: 'offer', sdp }));
  assert.equal(impersonation.payload.code, 'PREVIEW_CONTROLLER_REQUIRED');
  const crossSession = await sendRequest(foreign, signal('foreign', sid, nodeId, nodeId, 'peer2', { kind: 'offer', sdp }));
  assert.equal(crossSession.payload.code, 'NOT_MEMBER');
  const answer = signal('node', sid, 'controller', nodeId, 'peer1', { kind: 'answer', sdp });
  node.send(answer);
  await controller.wait((event) => event.messageId === answer.messageId);
  const ice = signal('node', sid, 'controller', nodeId, 'peer1',
    { kind: 'ice', candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 });
  node.send(ice);
  await controller.wait((event) => event.messageId === ice.messageId);
  const start = request('controller', sid, 'START_RECORDING', { takeId: 'take', targetNodeIds: [nodeId] });
  controller.send(start);
  await node.wait((event) => event.type === 'START_RECORDING' && event.payload.takeId === 'take');
  const close = signal('controller', sid, nodeId, nodeId, 'peer1', { kind: 'close' });
  controller.send(close);
  await node.wait((event) => event.messageId === close.messageId);
  const late = { ...ice, messageId: randomUUID() };
  node.send(late);
  await sendRequest(node, request('node', sid, 'SESSION_GET', {}));
  const snapshot = await sendRequest(controller, request('controller', sid, 'SESSION_GET', {}));
  assert.equal(snapshot.payload.session.take.takeId, 'take');
  assert.equal(controller.inbox.some((event) => event.messageId === late.messageId), false);
  assert.equal(node.inbox.filter((event) => event.messageId === offer.messageId).length, 1);
  assert.equal(node.inbox.some((event) => event.type === 'STOP_RECORDING'), false);
  assert.equal(foreign.inbox.some((event) => event.type === 'PREVIEW_SIGNAL'), false);
});

test('NX-10 Node registers one video track and releases it on connection loss or late native completion', async () => {
  const states = [], sent = [], peers = [], streams = [], trace = [];
  let receive, finishCreate, sampleStats;
  class Peer {
    constructor() { this.events = {}; peers.push(this); }
    addEventListener(name, callback) { this.events[name] = callback; }
    async setRemoteDescription(description) { this.remoteDescription = description; }
    async createAnswer() { return { type: 'answer', sdp }; }
    addTransceiver() {
      return { setCodecPreferences: (codecs) => { this.preferred = Array.from(codecs, ({ mimeType }) => mimeType); } };
    }
    async createOffer() {
      assert.deepEqual(this.preferred, ['video/VP8']);
      return { type: 'offer', sdp };
    }
    async setLocalDescription(description) { this.localDescription = description; }
    addTrack(track, stream) { this.track = track; this.stream = stream; }
    async getStats() { return new Map([['video', { type: 'outbound-rtp', kind: 'video', framesEncoded: 0, bytesSent: 42 }]]); }
    close() { this.closed = true; }
  }
  class Stream {
    constructor() { streams.push(this); }
    getVideoTracks() { return [{ kind: 'video', enabled: true, readyState: 'live', addEventListener() {} }]; }
    release() { this.releases = (this.releases ?? 0) + 1; }
  }
  const deps = {
    'expo-crypto': { randomUUID },
    'react-native': { NativeModules: { Nx10WebRtc: { createStream: () =>
      new Promise((resolve) => { finishCreate = resolve; }) } } },
    'react-native-webrtc': { MediaStream: Stream, RTCPeerConnection: Peer,
      RTCRtpReceiver: { getCapabilities: () => ({ codecs: [{ mimeType: 'video/H264' }, { mimeType: 'video/VP8' }] }) },
      RTCRtpSender: { getCapabilities: () => ({ codecs: [{ mimeType: 'video/VP8' }] }) } },
    './sessionProtocol': protocol,
    './socket': { sendSocketMessage: (message) => { sent.push(message); return true; },
      subscribeToSocketMessages: (callback) => { receive = callback; return () => { receive = undefined; }; } },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/previewTransport.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, setTimeout, clearTimeout, require: (name) => deps[name],
    __DEV__: true, process: { env: { EXPO_PUBLIC_NEXUS_NX10_TRACE: '1', EXPO_PUBLIC_NEXUS_NX10_VP8: '1' } },
    console: { info: (_tag, json) => trace.push(JSON.parse(json)) },
    setInterval: (callback, delay) => { assert.equal(delay, 2500); sampleStats = callback; return 1; },
    clearInterval: () => { sampleStats = undefined; },
  });
  const preview = exports.createPreviewTransport({
    sessionId: 'session', nodeId: 'node-public', nodeDeviceId: 'node', controllerId: 'controller', deviceId: 'node',
  }, (state) => states.push(state.phase));
  try {
    const offer = signal('controller', 'session', 'node-public', 'node-public', 'peer1', { kind: 'offer', sdp });
    const turn = () => new Promise(setImmediate);
    receive(JSON.stringify(offer));
    receive(JSON.stringify(offer));
    await turn();
    finishCreate({});
    await turn();
    assert.equal(peers.length, 1);
    assert.equal(peers[0].track.kind, 'video');
    assert.equal(sent[0].payload.kind, 'answer');
    assert.ok(trace.some((entry) => entry.event === 'codec-confirmed' && entry.codec === 'VP8'));
    preview.samplerRequested(true);
    await sampleStats();
    const stats = trace.find((entry) => entry.event === 'stats');
    assert.equal(stats.role, 'Node');
    assert.equal(stats.negotiation, 'peer1');
    assert.equal(stats.framesEncoded, 0);
    assert.equal(stats.framesSent, 'no disponible');
    assert.equal(stats.bytesSent, 42);
    assert.ok(trace.some((entry) => entry.event === 'pixelcopy-prop' && entry.enabled));
    peers[0].connectionState = 'connected';
    peers[0].events.connectionstatechange();
    peers[0].connectionState = 'disconnected';
    peers[0].events.connectionstatechange();
    assert.deepEqual(states, ['connecting', 'streaming', 'disconnected']);
    assert.equal(peers[0].closed, true);
    assert.equal(streams[0].releases, 1);
    assert.equal(sampleStats, undefined);
    receive(JSON.stringify({ ...offer, sentAt: offer.sentAt + 1,
      payload: { ...offer.payload, connectionId: 'peer2' } }));
    await turn();
    preview.stop();
    finishCreate({});
    await turn();
    assert.equal(peers[1].track, undefined);
    assert.equal(streams[1].releases, 1);
    assert.ok(sent.every((message) => message.type === 'PREVIEW_SIGNAL'));
    const controller = exports.createPreviewTransport({
      sessionId: 'session', nodeId: 'node-public', nodeDeviceId: 'node', controllerId: 'controller', deviceId: 'controller',
    }, () => {});
    try {
      controller.start();
      await turn();
      const outbound = sent.find((message) => message.payload.kind === 'offer');
      assert.equal(outbound.payload.sdp, sdp);
      const answer = signal('node', 'session', 'controller', 'node-public', outbound.payload.connectionId,
        { kind: 'answer', sdp: sdp.replace('VP8', 'H264') });
      receive(JSON.stringify(answer));
      await turn();
      assert.equal(peers.at(-1).remoteDescription, undefined);
      assert.ok(trace.some((entry) => entry.reason === 'vp8-remote-sdp-unconfirmed'));
    } finally { controller.dispose(); }
  } finally {
    preview.dispose();
  }
});
