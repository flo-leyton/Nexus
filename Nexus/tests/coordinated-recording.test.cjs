/* global __dirname */
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const WebSocket = require('ws');
const ts = require('typescript');
const protocol = require('../services/sessionProtocol.ts');
const { startTestRelay, authenticate } = require('./helpers/relay.cjs');

function load(file, dependencies) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports;
}
const { createSessionClient } = load('../services/sessionClient.ts', { './sessionProtocol': protocol });
const { CaptureEngine } = load('../services/captureEngine.ts', { './sessionProtocol': protocol });
const { coordinateCapture } = load('../services/coordinatedCapture.ts', {});
const ready = { cameraPermission: 'granted', cameraAvailable: true, enginePrepared: true, error: null };
const uploadedFixture = (id) => ({ state: 'uploaded', publicId: `fixture/${id}`, url: `https://res.cloudinary.com/test/video/upload/v1/${id}.mp4` });

test('H3: two remote angles aggregate in reverse arrival order; duplicate/stale reports and foreign identities are isolated', { timeout: 10000 }, async (t) => {
  const persisted = new Map();
  const connect = await harness(t), c = await connect('controller', { async save(sid, angles) {
    for (const angle of Object.values(angles)) persisted.set(`${sid}:${angle.deviceId}:${angle.clipId}`, angle);
  } }), a = await connect('node-a'), b = await connect('node-b'), outsider = await connect('outsider');
  const s = await create(c); await admit(c, a, s); await admit(c, b, s);
  const role = c.service.assignRole(s.sessionId, a.deviceId, 'main-camera'); await c.wait(reply(role));
  await attachCamera(t, a, s); await attachCamera(t, b, s); await waitReady(c, s, [a.deviceId, b.deviceId]);
  const start = c.service.startTake(s.sessionId);
  await c.wait(hasNode(start.takeId, a.deviceId, 'recording')); await c.wait(hasNode(start.takeId, b.deviceId, 'recording'));
  c.service.stopTake(s.sessionId);
  await c.wait(hasNode(start.takeId, a.deviceId, 'saved')); await c.wait(hasNode(start.takeId, b.deviceId, 'saved'));
  const take = c.service.getSnapshot().sessions[s.sessionId].take;
  const frozen = JSON.stringify(take);
  const generatedId = 'rzobn7ekss6c49y8iiqi';
  const angle = (peer) => ({ clipId: take.nodes[peer.deviceId].capture.id, takeId: start.takeId, deviceId: peer.deviceId,
    nodeId: take.nodes[peer.deviceId].nodeId, bytes: take.nodes[peer.deviceId].capture.bytes, revision: 2,
    upload: peer === a ? { state: 'uploaded', publicId: generatedId,
      url: `https://res.cloudinary.com/test/video/upload/v1/${generatedId}.mp4` } : uploadedFixture(peer.deviceId) });
  for (const peer of [b, a]) {
    const id = peer.service.reportMedia(s.sessionId, c.deviceId, angle(peer));
    await peer.wait((m) => m.type === 'MEDIA_ACCEPTED' && m.payload.requestId === id);
  }
  const refresh = c.service.refreshSession(s.sessionId); await c.wait(reply(refresh));
  let media = c.service.getSnapshot().sessions[s.sessionId].mediaAngles;
  assert.equal(Object.keys(media).length, 2);
  assert.equal(persisted.size, 2);
  assert.equal(media[`${a.deviceId}:${angle(a).clipId}`].upload.publicId, generatedId);
  assert.notEqual(media[`${a.deviceId}:${angle(a).clipId}`].upload.url, media[`${b.deviceId}:${angle(b).clipId}`].upload.url);
  assert.equal(media[`${a.deviceId}:${angle(a).clipId}`].role, 'main-camera');
  for (const payload of [angle(a), { ...angle(a), revision: 1, upload: { state: 'uploading' } }]) {
    const id = a.service.reportMedia(s.sessionId, c.deviceId, payload); await a.wait((m) => m.type === 'MEDIA_ACCEPTED' && m.payload.requestId === id);
  }
  const barrier = c.service.refreshSession(s.sessionId); await c.wait(reply(barrier));
  media = c.service.getSnapshot().sessions[s.sessionId].mediaAngles;
  assert.equal(Object.keys(media).length, 2); assert.equal(media[`${a.deviceId}:${angle(a).clipId}`].upload.state, 'uploaded');
  assert.equal(JSON.stringify(c.service.getSnapshot().sessions[s.sessionId].take), frozen);
  const other = await create(outsider);
  const attacks = [
    [outsider, s.sessionId, c.deviceId, angle(a)],
    [a, s.sessionId, b.deviceId, angle(a)],
    [a, s.sessionId, c.deviceId, angle(b)],
    [a, s.sessionId, c.deviceId, { ...angle(a), takeId: 'not-a-take' }],
    [a, s.sessionId, c.deviceId, { ...angle(a), nodeId: 'not-a-node' }],
    [a, s.sessionId, c.deviceId, { ...angle(a), clipId: 'other-clip' }],
    [a, other.sessionId, outsider.deviceId, angle(a)],
  ];
  for (const [peer, sid, target, payload] of attacks) {
    const id = peer.service.reportMedia(sid, target, payload);
    assert.equal((await peer.wait(reply(id))).type, 'SESSION_ERROR');
  }
});

test('H3: approved rejoin may publish an old original without inheriting nodeId or confirming an unknown H2 result', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), n = await connect('node');
  const s = await create(c); await admit(c, n, s); const camera = await attachCamera(t, n, s); await waitReady(c, s, [n.deviceId]);
  const start = c.service.startTake(s.sessionId); await c.wait(hasNode(start.takeId, n.deviceId, 'recording'));
  const oldNodeId = c.service.getSnapshot().sessions[s.sessionId].take.nodes[n.deviceId].nodeId;
  const beforeClose = c.inbox.length;
  n.ws.close(); await once(n.ws, 'close');
  await c.wait((m) => c.inbox.indexOf(m) >= beforeClose && m.type === 'SESSION_SNAPSHOT' && m.payload.session.take?.nodes.node?.phase === 'disconnected');
  camera.engine.stop();
  c.service.stopTake(s.sessionId);
  const close = c.service.closeInterruptedTake(s.sessionId, start.takeId); await c.wait(reply(close));
  const frozen = JSON.stringify(c.service.getSnapshot().sessions[s.sessionId].take);
  const rejoined = await connect(n.deviceId); await admit(c, rejoined, s, { replace: true });
  assert.notEqual(rejoined.service.getSnapshot().sessions[s.sessionId].members.node.nodeId, oldNodeId);
  const id = rejoined.service.reportMedia(s.sessionId, c.deviceId, { clipId: 'offline-original', deviceId: n.deviceId,
    nodeId: oldNodeId, takeId: start.takeId, bytes: 128, revision: 3, upload: uploadedFixture('offline-original') });
  await rejoined.wait((m) => m.type === 'MEDIA_ACCEPTED' && m.payload.requestId === id);
  const refresh = c.service.refreshSession(s.sessionId); await c.wait(reply(refresh));
  assert.equal(JSON.stringify(c.service.getSnapshot().sessions[s.sessionId].take), frozen);
  assert.equal(c.service.getSnapshot().sessions[s.sessionId].take.nodes.node.stopReceived, false);
  assert.equal(Object.values(c.service.getSnapshot().sessions[s.sessionId].mediaAngles)[0].nodeId, oldNodeId);
});
const request = (type, senderId, sessionId, payload, targetId) => ({ protocolVersion: 1, messageId: randomUUID(), type,
  senderId, sessionId, sentAt: Date.now(), payload, ...(targetId ? { targetId } : {}) });
const reply = (id) => (m) => m.payload.requestId === id;
async function harness(t) {
  const { relay } = await startTestRelay(t);
  const peers = [];
  t.after(async () => {
    for (const peer of peers) { peer.service.dispose(); peer.ws.terminate(); }
  });
  return async (deviceId, mediaHistory) => {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.address().port}`);
    await once(ws, 'open');
    await authenticate(ws, deviceId);
    const inbox = [], sent = [];
    ws.on('message', (raw) => inbox.push(JSON.parse(String(raw))));
    const service = createSessionClient(deviceId, randomUUID, {
      connect() {}, send(m) { sent.push(m); ws.send(JSON.stringify(m)); return true; },
      subscribeMessages(fn) { const cb = (raw) => fn(String(raw)); ws.on('message', cb); return () => ws.off('message', cb); },
      subscribeStatus(fn) { fn('Connected'); const cb = () => fn('Disconnected'); ws.on('close', cb); return () => ws.off('close', cb); },
    }, undefined, mediaHistory);
    const peer = { ws, service, inbox, sent, deviceId,
      async wait(predicate) { while (!inbox.some(predicate)) await once(ws, 'message'); return inbox.find(predicate); },
      send(m) { ws.send(JSON.stringify(m)); },
    };
    peers.push(peer);
    return peer;
  };
}
async function create(controller) {
  const first = controller.service.createSession();
  return (await controller.wait(reply(first.messageId))).payload.session;
}
async function admit(c, n, session, { replace = false } = {}) {
  const rejoin = replace ? request('SESSION_JOIN_REQUEST', n.deviceId, session.sessionId, { code: session.code }) : null;
  if (rejoin) n.send(rejoin);
  const join = rejoin?.messageId ?? n.service.requestJoin(session.code);
  await c.wait(reply(join));
  const accept = c.service.acceptJoin(session.sessionId, n.deviceId, join);
  await n.wait(reply(accept)); await c.wait(reply(accept));
}
async function attachCamera(t, peer, session, options = {}) {
  const identity = { sessionId: session.sessionId, deviceId: peer.deviceId,
    nodeId: peer.service.getSnapshot().sessions[session.sessionId].members[peer.deviceId].nodeId };
  let complete, records = 0, stops = 0, draft;
  let failStop = !!options.failStop;
  let failSave = !!options.failSave;
  let releasePermission;
  let delayPermission = false;
  const permission = { granted: true, status: 'granted', canAskAgain: true };
  const engine = new CaptureEngine({
    getPermission: () => delayPermission ? new Promise((resolve) => { releasePermission = () => resolve(permission); }) : Promise.resolve(permission),
    requestPermission: async () => permission, isAvailable: async () => true,
  }, {
    createId: randomUUID,
    record() { records++; if (options.failStart) return Promise.reject(new Error('native camera failed')); return new Promise((resolve) => { complete = resolve; }); },
    stop() { stops++; if (failStop) throw new Error('native STOP failed'); complete({ uri: `file:///cache/${peer.deviceId}.mp4` }); },
    async persist(value) {
      draft = value;
      if (failSave) throw new Error('disk full');
      if (options.persistUntil) await options.persistUntil;
      return { ...value, localUri: `file:///documents/${peer.deviceId}/${value.id}.mp4`, fileName: 'video.mp4', bytes: 512 };
    },
  });
  await engine.prepare(); engine.cameraReady(engine.getSnapshot().generation);
  const runtime = coordinateCapture(engine, identity, (report) => peer.service.reportCapture(session.sessionId, session.controllerId, report));
  const off = peer.service.registerCaptureHandler(session.sessionId, runtime.handle);
  const offState = engine.subscribe(() => { try { peer.service.reportNodeState(session.sessionId, session.controllerId, engine.getReadiness()); } catch { /* disconnected */ } });
  t.after(() => { offState(); off(); runtime.dispose(); });
  return { engine, identity, counts: () => ({ records, stops }), draft: () => draft,
    failStop(v) { failStop = v; }, failSave(v) { failSave = v; },
    delayPermission() { delayPermission = true; }, releasePermission() { releasePermission(); delayPermission = false; },
  };
}
const hasNode = (takeId, id, phase) => (m) => m.type === 'SESSION_SNAPSHOT' &&
  protocol.sessionTakes(m.payload.session).some((take) => take.takeId === takeId && take.nodes[id]?.phase === phase);
async function waitReady(c, session, ids) {
  for (const id of ids) await c.wait((m) => m.type === 'SESSION_SNAPSHOT' && m.payload.session.sessionId === session.sessionId && m.payload.session.members[id]?.readiness?.enginePrepared);
}

test('H2: Controller REC/STOP, shared take, independent originals, ACK != saved, duplicate and stale commands', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), a = await connect('node-a'), b = await connect('node-b');
  const session = await create(c);
  await admit(c, a, session); await admit(c, b, session);
  const saving = Promise.withResolvers();
  const ca = await attachCamera(t, a, session), cb = await attachCamera(t, b, session, { persistUntil: saving.promise });
  await waitReady(c, session, ['node-a', 'node-b']);
  const start = c.service.startTake(session.sessionId);
  await c.wait(hasNode(start.takeId, 'node-a', 'recording')); await c.wait(hasNode(start.takeId, 'node-b', 'recording'));
  assert.equal(c.service.getSnapshot().sessions[session.sessionId].take.nodes['node-a'].startReceived, true);
  assert.equal(c.service.getSnapshot().sessions[session.sessionId].take.nodes['node-a'].capture, null);
  const earlyClose = c.service.closeSession(session.sessionId);
  assert.equal((await c.wait(reply(earlyClose))).payload.code, 'TAKE_ACTIVE');
  const startMessage = c.sent.find((m) => m.messageId === start.messageId);
  c.send(startMessage); c.send(startMessage);
  const barrier = c.service.refreshSession(session.sessionId); await c.wait(reply(barrier));
  assert.equal(ca.counts().records, 1); assert.equal(cb.counts().records, 1);
  const stopId = c.service.stopTake(session.sessionId), stopMessage = c.sent.find((m) => m.messageId === stopId);
  await c.wait(hasNode(start.takeId, 'node-b', 'saving'));
  assert.equal(c.service.getSnapshot().sessions[session.sessionId].take.nodes['node-b'].stopReceived, true);
  const closeWhileSaving = c.service.closeSession(session.sessionId);
  assert.equal((await c.wait(reply(closeWhileSaving))).payload.code, 'TAKE_ACTIVE');
  saving.resolve();
  await c.wait(hasNode(start.takeId, 'node-a', 'saved')); await c.wait(hasNode(start.takeId, 'node-b', 'saved'));
  const take = c.service.getSnapshot().sessions[session.sessionId].take;
  assert.equal(ca.draft().takeId, start.takeId); assert.equal(cb.draft().takeId, start.takeId);
  assert.notEqual(take.nodes['node-a'].capture.id, take.nodes['node-b'].capture.id);
  assert.equal(take.nodes['node-a'].capture.localUri, undefined);
  assert.equal(take.nodes['node-b'].capture.localUri, undefined); // shared references never expose phone paths
  assert.equal(take.nodes['node-b'].stopReceived, true);
  assert.equal(c.service.getSnapshot().sessions[session.sessionId].state, 'completed');
  c.send(stopMessage); c.send(startMessage);
  const after = c.service.refreshSession(session.sessionId); await c.wait(reply(after));
  assert.equal(ca.counts().records, 1); assert.equal(ca.counts().stops, 1);
  assert.equal(cb.counts().records, 1); assert.equal(cb.counts().stops, 1);
  // Readiness restoration is a separate hardware event/report; wait for fresh ready messages.
  const ra = a.service.reportNodeState(session.sessionId, c.deviceId, ready); await c.wait(reply(ra));
  const rb = b.service.reportNodeState(session.sessionId, c.deviceId, ready); await c.wait(reply(rb));
  const second = c.service.startTake(session.sessionId);
  await c.wait(hasNode(second.takeId, 'node-a', 'recording')); await c.wait(hasNode(second.takeId, 'node-b', 'recording'));
  c.send(startMessage); c.send(stopMessage); // cannot affect a newer Take
  const finalStop = c.service.stopTake(session.sessionId); await c.wait(reply(finalStop));
  await c.wait(hasNode(second.takeId, 'node-a', 'saved')); await c.wait(hasNode(second.takeId, 'node-b', 'saved'));
  assert.equal(ca.counts().records, 2); assert.equal(cb.counts().stops, 2);
  const close = c.service.closeSession(session.sessionId);
  await a.wait((m) => m.type === 'SESSION_CLOSED' && reply(close)(m));
  await b.wait((m) => m.type === 'SESSION_CLOSED' && reply(close)(m));
  const closed = await c.wait((m) => m.type === 'SESSION_SNAPSHOT' && reply(close)(m));
  assert.equal(closed.payload.session.take.nodes['node-a'].phase, 'saved');
  assert.equal(closed.payload.session.takeHistory[0].takeId, start.takeId);
});

test('NX-02: independent clips, STOP general across takes, and session close waits for every save', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('nx02-controller'), a = await connect('nx02-a'), b = await connect('nx02-b');
  const s = await create(c); await admit(c, a, s); await admit(c, b, s);
  const hold = Promise.withResolvers();
  const ca = await attachCamera(t, a, s, { persistUntil: hold.promise });
  const cb = await attachCamera(t, b, s);
  await waitReady(c, s, [a.deviceId, b.deviceId]);
  const first = c.service.startTake(s.sessionId, [a.deviceId]);
  await c.wait(hasNode(first.takeId, a.deviceId, 'recording'));
  const clipB = c.service.startTake(s.sessionId, [b.deviceId]);
  await c.wait(hasNode(clipB.takeId, b.deviceId, 'recording'));
  const extra = c.service.startTake(s.sessionId, [a.deviceId]);
  assert.equal((await c.wait(reply(extra.messageId))).payload.code, 'TAKE_ACTIVE');

  const [stopB] = c.service.stopActiveTakes(s.sessionId, b.deviceId);
  await c.wait(reply(stopB));
  await c.wait(hasNode(clipB.takeId, b.deviceId, 'saved'));
  const originalB = cb.engine.getSnapshot().lastCapture;
  assert.equal(originalB.takeId, clipB.takeId);
  assert.equal(ca.counts().stops, 0);
  const refreshed = b.service.reportNodeState(s.sessionId, c.deviceId, ready); await c.wait(reply(refreshed));
  const nextB = c.service.startTake(s.sessionId, [b.deviceId]);
  await c.wait(hasNode(nextB.takeId, b.deviceId, 'recording'));
  assert.equal(ca.counts().records, 1);

  const stops = c.service.stopActiveTakes(s.sessionId);
  assert.equal(stops.length, 2);
  for (const stop of stops) await c.wait(reply(stop));
  await c.wait(hasNode(nextB.takeId, b.deviceId, 'saved'));
  await c.wait(hasNode(first.takeId, a.deviceId, 'saving'));
  const earlyClose = c.service.closeSession(s.sessionId);
  assert.equal((await c.wait(reply(earlyClose))).payload.code, 'TAKE_ACTIVE');
  hold.resolve();
  await c.wait(hasNode(first.takeId, a.deviceId, 'saved'));
  const close = c.service.closeSession(s.sessionId);
  const finished = await c.wait((m) => m.type === 'SESSION_SNAPSHOT' && reply(close)(m));
  assert.equal(finished.payload.session.state, 'closed');
  assert.equal(ca.counts().stops, 1);
  assert.equal(cb.counts().stops, 2);
  assert.notEqual(originalB.id, cb.engine.getSnapshot().lastCapture.id);
  const completed = protocol.sessionTakes(finished.payload.session);
  assert.equal(completed.length, 3);
  assert.equal(completed.find((take) => take.takeId === clipB.takeId).nodes[b.deviceId].capture.id, originalB.id);
});

test('NX-02: one camera can stop inside a shared general take', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), a = await connect('a'), b = await connect('b');
  const s = await create(c); await admit(c, a, s); await admit(c, b, s);
  const ca = await attachCamera(t, a, s), cb = await attachCamera(t, b, s);
  await waitReady(c, s, [a.deviceId, b.deviceId]);
  const take = c.service.startTake(s.sessionId);
  await c.wait(hasNode(take.takeId, a.deviceId, 'recording')); await c.wait(hasNode(take.takeId, b.deviceId, 'recording'));
  c.service.stopActiveTakes(s.sessionId, b.deviceId);
  await c.wait(hasNode(take.takeId, b.deviceId, 'saved'));
  assert.equal(ca.counts().stops, 0);
  assert.equal(c.service.getSnapshot().sessions[s.sessionId].state, 'recording');
  c.service.stopActiveTakes(s.sessionId);
  await c.wait(hasNode(take.takeId, a.deviceId, 'saved'));
  assert.equal(cb.counts().stops, 1);
});

test('H2: a failing Node does not stop another; STOP failure and save retry report real outcomes', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), a = await connect('good'), b = await connect('bad');
  const session = await create(c); await admit(c, a, session); await admit(c, b, session);
  const ca = await attachCamera(t, a, session, { failStop: true, failSave: true });
  const cb = await attachCamera(t, b, session, { failStart: true });
  await waitReady(c, session, ['good', 'bad']);
  const start = c.service.startTake(session.sessionId);
  await c.wait(hasNode(start.takeId, 'good', 'recording')); await c.wait(hasNode(start.takeId, 'bad', 'error'));
  assert.equal(ca.engine.getSnapshot().phase, 'recording');
  let stop = c.service.stopTake(session.sessionId); await c.wait(reply(stop));
  await c.wait((m) => hasNode(start.takeId, 'good', 'error')(m) && m.payload.session.take.nodes.good.error.includes('STOP'));
  assert.equal(ca.engine.getSnapshot().phase, 'recording');
  ca.failStop(false);
  stop = c.service.stopTake(session.sessionId); await c.wait(reply(stop));
  await c.wait((m) => hasNode(start.takeId, 'good', 'error')(m) && m.payload.session.take.nodes.good.error.includes('disk full'));
  assert.equal(ca.engine.getSnapshot().pendingSave, true);
  ca.failSave(false); await ca.engine.retrySave();
  await c.wait(hasNode(start.takeId, 'good', 'saved'));
  assert.equal(ca.counts().records, 1); assert.equal(cb.counts().records, 1);
  assert.equal(c.service.getSnapshot().sessions[session.sessionId].state, 'failed');
});

test('H2: STOP during permission recheck is queued; disconnect preserves local STOP and take identity', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), a = await connect('node');
  const session = await create(c); await admit(c, a, session);
  const ca = await attachCamera(t, a, session); await waitReady(c, session, ['node']); ca.delayPermission();
  const start = c.service.startTake(session.sessionId);
  await c.wait(hasNode(start.takeId, 'node', 'starting'));
  const stop = c.service.stopTake(session.sessionId); await c.wait(reply(stop));
  await c.wait((m) => m.type === 'SESSION_SNAPSHOT' && m.payload.session.take?.stopMessageId === stop && m.payload.session.take.nodes.node.stopReceived);
  ca.releasePermission(); await c.wait(hasNode(start.takeId, 'node', 'saved'));
  assert.deepEqual(ca.counts(), { records: 1, stops: 1 });
  const refresh = a.service.reportNodeState(session.sessionId, c.deviceId, ready); await c.wait(reply(refresh));
  const next = c.service.startTake(session.sessionId); await c.wait(hasNode(next.takeId, 'node', 'recording'));
  a.ws.close(); await once(a.ws, 'close');
  await c.wait(hasNode(next.takeId, 'node', 'disconnected'));
  assert.equal(ca.engine.getSnapshot().phase, 'recording');
  ca.engine.stop();
  while (ca.engine.getSnapshot().phase === 'saving') await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ca.engine.getSnapshot().lastCapture.takeId, next.takeId);
});

test('H2: readiness, authorization, message conflicts, forged reports and cross-session isolation', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), n = await connect('node'), other = await connect('other');
  const s = await create(c), foreign = await create(other); await admit(c, n, s);
  const notReady = c.service.startTake(s.sessionId);
  assert.equal((await c.wait(reply(notReady.messageId))).payload.code, 'NODE_NOT_READY');
  const camera = await attachCamera(t, n, s); await waitReady(c, s, ['node']);
  const targets = [camera.identity.nodeId];
  const foreignAttack = request('START_RECORDING', 'other', s.sessionId, { takeId: randomUUID(), targetNodeIds: targets });
  other.send(foreignAttack); assert.equal((await other.wait(reply(foreignAttack.messageId))).payload.code, 'NOT_MEMBER');
  const nodeAttack = request('START_RECORDING', 'node', s.sessionId, { takeId: randomUUID(), targetNodeIds: targets });
  n.send(nodeAttack); assert.equal((await n.wait(reply(nodeAttack.messageId))).payload.code, 'CONTROLLER_REQUIRED');
  const start = c.service.startTake(s.sessionId); await c.wait(hasNode(start.takeId, 'node', 'recording'));
  const original = c.sent.find((m) => m.messageId === start.messageId);
  c.send({ ...original, payload: { ...original.payload, takeId: randomUUID() } });
  assert.equal((await c.wait((m) => reply(start.messageId)(m) && m.type === 'SESSION_ERROR')).payload.code, 'MESSAGE_ID_CONFLICT');
  const fake = request('RECORDING_STATE', 'controller', s.sessionId, { requestId: start.messageId, takeId: start.takeId,
    phase: 'saved', error: null, busy: false, capture: { id: 'fake', bytes: 1, localUri: 'file:///fake.mp4' } }, c.deviceId);
  c.send(fake); assert.equal((await c.wait(reply(fake.messageId))).payload.code, 'INVALID_RECORDING_REPORT');
  const invalid = { ...fake, messageId: randomUUID(), payload: { ...fake.payload, phase: 'saved', capture: null } };
  c.send(invalid); assert.equal((await c.wait(reply(invalid.messageId))).payload.code, 'INVALID_MESSAGE');
  const stop = c.service.stopTake(s.sessionId); await c.wait(reply(stop)); await c.wait(hasNode(start.takeId, 'node', 'saved'));
  const barrier = other.service.refreshSession(foreign.sessionId); await other.wait(reply(barrier));
  assert.equal(other.inbox.some((m) => m.sessionId === s.sessionId && m.type !== 'SESSION_ERROR'), false);
  assert.equal(camera.counts().records, 1);
});

test('H2: missing ACK and ACK without execution are distinct, never inferred saved', () => {
  let now = Date.now();
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server/recording.js'), 'utf8'), {
    module: mod, require: () => protocol, Date: { now: () => now },
  });
  const clients = new Map(['controller', 'a', 'b'].map((id) => [id, { readyState: 1, send() {} }]));
  const members = new Map(['a', 'b'].map((id) => [id, { deviceId: id, kind: 'node', nodeId: `node-${id}`, readiness: ready }]));
  const times = new WeakMap(); for (const member of members.values()) times.set(member, now);
  const s = { sessionId: 'session', controllerId: 'controller', members };
  const recording = mod.exports.attachRecording({ clients, stateTimes: times, snapshot() {} });
  const error = (value) => assert.fail(value);
  const start = request('START_RECORDING', 'controller', 'session', { takeId: 'take', targetNodeIds: ['node-a', 'node-b'] });
  recording.handle(s, start, error);
  recording.handle(s, request('RECORDING_ACK', 'a', 'session', { requestId: start.messageId, takeId: 'take', command: 'START_RECORDING' }, 'controller'), error);
  now += 15001; recording.tick(s);
  assert.match(s.take.nodes.a.error, /ACK recibido sin confirmación/);
  assert.match(s.take.nodes.b.error, /sin ACK/);
  assert.equal(s.take.nodes.a.capture, null); assert.equal(s.take.nodes.b.capture, null);
  assert.equal(s.take.nodes.a.busy, true);
});

test('H2: a manual clip after a completed Take cannot overwrite its remote state', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), n = await connect('node');
  const s = await create(c); await admit(c, n, s);
  const camera = await attachCamera(t, n, s); await waitReady(c, s, ['node']);
  const take = c.service.startTake(s.sessionId); await c.wait(hasNode(take.takeId, 'node', 'recording'));
  c.service.stopTake(s.sessionId); await c.wait(hasNode(take.takeId, 'node', 'saved'));
  const captureId = c.service.getSnapshot().sessions[s.sessionId].take.nodes.node.capture.id;
  // The same engine remains usable for H1. Its events must not be attributed to the old Take.
  const task = camera.engine.start(camera.identity);
  while (camera.engine.getSnapshot().phase === 'starting') await new Promise((resolve) => setImmediate(resolve));
  camera.engine.stop(); await task;
  const barrier = c.service.refreshSession(s.sessionId); await c.wait(reply(barrier));
  assert.equal(c.service.getSnapshot().sessions[s.sessionId].take.nodes.node.capture.id, captureId);
  assert.equal(camera.engine.getSnapshot().lastCapture.takeId, null);
});

test('H2: a late accepted Node cannot ACK or overwrite another Node in an existing Take', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), n = await connect('first'), late = await connect('late');
  const s = await create(c); await admit(c, n, s);
  const camera = await attachCamera(t, n, s); await waitReady(c, s, ['first']);
  const take = c.service.startTake(s.sessionId); await c.wait(hasNode(take.takeId, 'first', 'recording'));
  await admit(c, late, s);
  const fake = request('RECORDING_ACK', late.deviceId, s.sessionId,
    { requestId: take.messageId, takeId: take.takeId, command: 'START_RECORDING' }, c.deviceId);
  late.send(fake); assert.equal((await late.wait(reply(fake.messageId))).payload.code, 'INVALID_RECORDING_REPORT');
  assert.equal(late.inbox.some((m) => m.type === 'START_RECORDING'), false);
  const stop = c.service.stopTake(s.sessionId); await c.wait(reply(stop)); await c.wait(hasNode(take.takeId, 'first', 'saved'));
  const status = c.service.getSnapshot().sessions[s.sessionId];
  assert.equal(Object.keys(status.members).length, 3);
  assert.deepEqual(Object.keys(status.take.nodes), ['first']);
  assert.equal(late.inbox.some((m) => m.type === 'STOP_RECORDING'), false);
  assert.equal(camera.counts().stops, 1);
});

test('H2 recovery: disconnect, offline save, approved rejoin, explicit close and second take preserve history', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), a = await connect('a'), b = await connect('b');
  const s = await create(c); await admit(c, a, s); await admit(c, b, s);
  const ca = await attachCamera(t, a, s), cb = await attachCamera(t, b, s);
  await waitReady(c, s, ['a', 'b']);
  const first = c.service.startTake(s.sessionId);
  await c.wait(hasNode(first.takeId, 'a', 'recording')); await c.wait(hasNode(first.takeId, 'b', 'recording'));
  const originalStart = c.sent.find((m) => m.messageId === first.messageId);
  b.ws.close(); await once(b.ws, 'close'); await c.wait(hasNode(first.takeId, 'b', 'disconnected'));
  const early = c.service.closeInterruptedTake(s.sessionId, first.takeId);
  assert.equal((await c.wait(reply(early))).payload.code, 'STOP_REQUIRED');
  const stop = c.service.stopTake(s.sessionId); await c.wait(hasNode(first.takeId, 'a', 'saved'));
  const stopMessage = c.sent.find((m) => m.messageId === stop);
  cb.engine.stop();
  while (cb.engine.getSnapshot().phase === 'saving') await new Promise((resolve) => setImmediate(resolve));
  const offline = cb.engine.getSnapshot().lastCapture;
  assert.equal(offline.takeId, first.takeId); assert.equal(offline.nodeId, cb.identity.nodeId);
  const returned = await connect('b'); await admit(c, returned, s, { replace: true });
  const newNodeId = returned.service.getSnapshot().sessions[s.sessionId].members.b.nodeId;
  assert.notEqual(newNodeId, cb.identity.nodeId);
  const notPrepared = c.service.closeInterruptedTake(s.sessionId, first.takeId);
  assert.equal((await c.wait(reply(notPrepared))).payload.code, 'NODE_NOT_READY');
  const newCamera = await attachCamera(t, returned, s); await waitReady(c, s, ['b']);
  const before = JSON.parse(JSON.stringify(c.service.getSnapshot().sessions[s.sessionId].take));
  assert.equal(protocol.takeFinished(before), false);
  assert.equal(protocol.nodeTakePending(before, 'b', newNodeId), false);
  assert.equal(protocol.nodeTakePending(before, 'b', cb.identity.nodeId), true);
  const close = c.service.closeInterruptedTake(s.sessionId, first.takeId); await c.wait(reply(close));
  const closed = c.service.getSnapshot().sessions[s.sessionId].take;
  assert.equal(protocol.takeFinished(closed), true);
  assert.deepEqual(JSON.parse(JSON.stringify(closed.nodes)), before.nodes);
  assert.deepEqual(Array.from(closed.closed.unconfirmedNodeIds), [cb.identity.nodeId]);
  assert.equal(closed.nodes.b.stopReceived, false); assert.equal(closed.nodes.b.capture, null);
  assert.equal(protocol.isCoordinatedTake(closed), true);
  assert.equal(protocol.isCoordinatedTake({ ...closed, closed: { ...closed.closed, unconfirmedNodeIds: ['foreign-node'] } }), false);
  c.send(stopMessage);
  await c.wait((m) => reply(stop)(m) && m.type === 'SESSION_ERROR' && m.payload.code === 'TAKE_CLOSED');
  const lateAck = request('RECORDING_ACK', 'a', s.sessionId,
    { requestId: stop, takeId: first.takeId, command: 'STOP_RECORDING' }, c.deviceId);
  a.send(lateAck); assert.equal((await a.wait(reply(lateAck.messageId))).payload.code, 'TAKE_CLOSED');
  const closeMessage = c.sent.find((m) => m.messageId === close);
  c.send(closeMessage);
  const barrier = c.service.refreshSession(s.sessionId); await c.wait(reply(barrier));
  const ra = a.service.reportNodeState(s.sessionId, c.deviceId, ready); await c.wait(reply(ra));
  const second = c.service.startTake(s.sessionId);
  await c.wait(hasNode(second.takeId, 'a', 'recording')); await c.wait(hasNode(second.takeId, 'b', 'recording'));
  assert.notEqual(first.takeId, second.takeId);
  c.send(originalStart); c.send(stopMessage); c.send(closeMessage);
  const barrier2 = c.service.refreshSession(s.sessionId); await c.wait(reply(barrier2));
  const current = c.service.getSnapshot().sessions[s.sessionId];
  assert.equal(current.take.takeId, second.takeId);
  assert.deepEqual(JSON.parse(JSON.stringify(current.takeHistory[0])), JSON.parse(JSON.stringify(closed)));
  assert.equal(ca.counts().records, 2); assert.equal(newCamera.counts().records, 1); assert.equal(cb.counts().records, 1);
  const lateReport = request('RECORDING_STATE', 'b', s.sessionId, { requestId: first.messageId, takeId: first.takeId,
    phase: 'saved', busy: false, error: null, capture: { id: offline.id, localUri: offline.localUri, bytes: offline.bytes } }, c.deviceId);
  returned.send(lateReport); assert.equal((await returned.wait(reply(lateReport.messageId))).payload.code, 'INVALID_RECORDING_REPORT');
  const end = c.service.stopTake(s.sessionId); await c.wait(reply(end));
  await c.wait(hasNode(second.takeId, 'a', 'saved')); await c.wait(hasNode(second.takeId, 'b', 'saved'));
  assert.equal(cb.engine.getSnapshot().lastCapture.id, offline.id);
});

test('H2 recovery: absent Node never returns, repeated STOP preserves ACK and explicit close permits another take', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), a = await connect('a'), b = await connect('b');
  const s = await create(c); await admit(c, a, s); await admit(c, b, s);
  const ca = await attachCamera(t, a, s); await attachCamera(t, b, s);
  await waitReady(c, s, ['a', 'b']);
  const first = c.service.startTake(s.sessionId);
  await c.wait(hasNode(first.takeId, 'a', 'recording')); await c.wait(hasNode(first.takeId, 'b', 'recording'));
  b.ws.close(); await once(b.ws, 'close'); await c.wait(hasNode(first.takeId, 'b', 'disconnected'));
  const stop = c.service.stopTake(s.sessionId); await c.wait(hasNode(first.takeId, 'a', 'saved'));
  const saved = c.service.getSnapshot().sessions[s.sessionId].take.nodes.a.capture;
  const repeat = c.service.stopTake(s.sessionId);
  const repeated = (await c.wait(reply(repeat))).payload.session.take;
  assert.equal(repeated.nodes.a.stopReceived, true); assert.equal(repeated.stopMessageId, stop);
  assert.equal(repeated.nodes.b.stopReceived, false);
  const close = c.service.closeInterruptedTake(s.sessionId, first.takeId); await c.wait(reply(close));
  const command = c.sent.find((m) => m.messageId === close);
  const conflicting = { ...command, payload: { ...command.payload, takeId: 'different-take' } };
  c.send(conflicting);
  await c.wait((m) => reply(close)(m) && m.type === 'SESSION_ERROR' && m.payload.code === 'MESSAGE_ID_CONFLICT');
  const r = a.service.reportNodeState(s.sessionId, c.deviceId, ready); await c.wait(reply(r));
  const next = c.service.startTake(s.sessionId); await c.wait(hasNode(next.takeId, 'a', 'recording'));
  const state = c.service.getSnapshot().sessions[s.sessionId];
  assert.equal(state.takeHistory[0].nodes.a.capture.id, saved.id);
  assert.equal(state.takeHistory[0].nodes.b.phase, 'disconnected');
  assert.equal(ca.counts().records, 2);
  c.service.stopTake(s.sessionId); await c.wait(hasNode(next.takeId, 'a', 'saved'));
});

test('H2 recovery: close rejects active reachable participants, other Controllers, Nodes and malformed requests', { timeout: 10000 }, async (t) => {
  const connect = await harness(t), c = await connect('controller'), n = await connect('node'), other = await connect('other');
  const s = await create(c); await create(other); await admit(c, n, s);
  await attachCamera(t, n, s, { failStop: true }); await waitReady(c, s, ['node']);
  const take = c.service.startTake(s.sessionId); await c.wait(hasNode(take.takeId, 'node', 'recording'));
  c.service.stopTake(s.sessionId); await c.wait(hasNode(take.takeId, 'node', 'error'));
  const close = c.service.closeInterruptedTake(s.sessionId, take.takeId);
  assert.equal((await c.wait(reply(close))).payload.code, 'TAKE_PARTICIPANT_ACTIVE');
  for (const [peer, expected] of [[other, 'NOT_MEMBER'], [n, 'CONTROLLER_REQUIRED']]) {
    const command = request('CLOSE_INTERRUPTED_TAKE', peer.deviceId, s.sessionId, { takeId: take.takeId, acknowledgeUnknown: true });
    peer.send(command); assert.equal((await peer.wait(reply(command.messageId))).payload.code, expected);
  }
  const invalid = request('CLOSE_INTERRUPTED_TAKE', c.deviceId, s.sessionId, { takeId: take.takeId, acknowledgeUnknown: false });
  c.send(invalid); assert.equal((await c.wait(reply(invalid.messageId))).payload.code, 'INVALID_MESSAGE');
  assert.equal(protocol.takeFinished(c.service.getSnapshot().sessions[s.sessionId].take), false);
});

test('H2 recovery: closed unknown results remain immutable through expiry and further disconnects', () => {
  const { attachRecording } = require('../server/recording');
  const take = { takeId: 'take', startMessageId: 'start', stopMessageId: 'stop', nodes: {
    missing: { nodeId: 'old-node', phase: 'disconnected', busy: true, startReceived: true, stopReceived: false,
      error: 'Disconnected', capture: null },
  } };
  const s = { controllerId: 'controller', members: new Map(), take,
    recordingCommands: new Map([['stop', { takeId: 'take', expiresAt: 0, targetNodeIds: ['old-node'], responded: new Set(), executed: new Set(), notified: new Set() }]]) };
  const recorder = attachRecording({ clients: new Map(), stateTimes: new WeakMap(), snapshot() {} });
  const close = request('CLOSE_INTERRUPTED_TAKE', 'controller', 'session', { takeId: 'take', acknowledgeUnknown: true });
  assert.equal(recorder.handle(s, close, (error) => assert.fail(error)), true);
  const before = JSON.stringify(s.take);
  recorder.tick(s); recorder.disconnect(s, 'missing');
  assert.equal(JSON.stringify(s.take), before);
  assert.equal(s.take.nodes.missing.stopReceived, false);
  assert.equal(s.take.nodes.missing.capture, null);
});
