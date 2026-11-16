/* global __dirname */
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const { fork } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const WebSocket = require('ws');
const { assertIsolation, PROJECT } = require('./emulator/assert-isolation.cjs');
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;

test('RTDB emulator: actual process restart preserves Sessions/Takes/media and cannot replay old commands', { skip: !host, timeout: 60000 }, async (t) => {
  assertIsolation();
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getDatabase } = require('firebase-admin/database');
  const prefix = `nexusStudioEmulatorTests/${randomUUID()}`;
  const app = initializeApp({ projectId: PROJECT, databaseURL: `http://${host}/?ns=${PROJECT}` }, `observer-${randomUUID()}`);
  const ref = getDatabase(app).ref(prefix), workers = [], sockets = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    for (const child of workers) if (child.exitCode === null && child.signalCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
    await ref.remove(); await deleteApp(app); // only this synthetic emulator prefix
  });
  async function launch() {
    const child = fork(path.join(__dirname, 'emulator/relay-worker.cjs'), [prefix], {
      execArgv: ['--require', path.join(__dirname, 'emulator/network-guard.cjs')], env: process.env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    workers.push(child);
    const ready = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error('Relay worker exited before recovery.'); })]);
    return { child, port: ready[0].port };
  }
  async function peer(port, id) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`), inbox = []; sockets.push(ws);
    ws.on('message', (raw) => inbox.push(JSON.parse(String(raw)))); await once(ws, 'open');
    const wait = async (fn) => { while (!inbox.some(fn)) await once(ws, 'message'); return inbox.find(fn); };
    ws.send(JSON.stringify({ type: 'SOCKET_AUTH', protocolVersion: 1, deviceId: id, idToken: `uid-${id}` }));
    await wait((m) => m.type === 'SOCKET_AUTH_OK');
    return { id, ws, inbox, wait, async call(type, sessionId, payload = {}, targetId, messageId = randomUUID()) {
      const m = { protocolVersion: 1, messageId, type, sessionId, senderId: id, sentAt: Date.now(), payload, ...(targetId ? { targetId } : {}) };
      ws.send(JSON.stringify(m)); return { message: m, event: await wait((e) => e.payload?.requestId === m.messageId || (type === 'SESSION_ROLE_ACK' && e.payload?.requestId === payload.requestId)) };
    } };
  }
  const first = await launch(), c = await peer(first.port, 'controller'), a = await peer(first.port, 'a'), b = await peer(first.port, 'b');
  const s = (await c.call('SESSION_CREATE', 'persisted-session')).event.payload.session;
  for (const n of [a, b]) {
    const pending = await n.call('SESSION_JOIN_REQUEST', 'join-by-code', { code: s.code });
    await c.call('SESSION_JOIN_ACCEPT', s.sessionId, { requestId: pending.message.messageId }, n.id);
    const roleResult = c.call('ASSIGN_ROLE', s.sessionId, { role: n.id === 'a' ? 'MAIN' : 'SIDE' }, n.id);
    const roleCommand = await n.wait((m) => m.type === 'ASSIGN_ROLE');
    await n.call('SESSION_ROLE_ACK', s.sessionId, { requestId: roleCommand.messageId }, c.id);
    await roleResult;
  }
  const members = (await c.call('SESSION_GET', s.sessionId)).event.payload.session.members;
  const readiness = { cameraPermission: 'granted', cameraAvailable: true, enginePrepared: true, error: null };
  async function prepare(node) {
    const current = (await node.call('SESSION_GET', s.sessionId)).event.payload.session.members[node.id];
    return node.call('NODE_STATE', s.sessionId, { readiness, ...(current.readyEpoch ? { readyEpoch: current.readyEpoch } : {}), confirmReady: true }, c.id);
  }
  async function ack(node, command) {
    return node.call('RECORDING_ACK', s.sessionId, { requestId: command.messageId, takeId: command.payload.takeId, command: command.type }, c.id);
  }
  async function saved(node, command) {
    return node.call('RECORDING_STATE', s.sessionId, { requestId: command.messageId, takeId: command.payload.takeId,
      phase: 'saved', busy: false, error: null, capture: { id: `clip-${command.payload.takeId}-${node.id}`, bytes: 256, localUri: `file:///synthetic/${node.id}.mp4` } }, c.id);
  }
  const targetNodeIds = [members.a.nodeId, members.b.nodeId];
  await prepare(a); await prepare(b);
  const rec = await c.call('START_RECORDING', s.sessionId, { takeId: 'complete-take', targetNodeIds });
  await ack(a, rec.message); await ack(b, rec.message);
  const stop = await c.call('STOP_RECORDING', s.sessionId, { takeId: 'complete-take', targetNodeIds });
  await ack(a, stop.message); await ack(b, stop.message);
  await saved(a, stop.message); await saved(b, stop.message);
  await Promise.all([a, b].map((node) => node.call('MEDIA_STATE', s.sessionId, {
    clipId: `clip-complete-take-${node.id}`, deviceId: node.id, nodeId: members[node.id].nodeId, takeId: 'complete-take', bytes: 256, revision: 1,
    upload: { state: 'uploaded', publicId: `synthetic-${node.id}`, url: `https://res.cloudinary.com/fixture/video/upload/synthetic-${node.id}.mp4` },
  }, c.id)));
  await prepare(a); await prepare(b);
  const interrupted = await c.call('START_RECORDING', s.sessionId, { takeId: 'interrupted-take', targetNodeIds });
  await ack(a, interrupted.message);
  const interruptedStop = await c.call('STOP_RECORDING', s.sessionId, { takeId: 'interrupted-take', targetNodeIds });
  await ack(a, interruptedStop.message); await saved(a, interruptedStop.message);
  const durable = (await ref.get()).val();
  assert.equal(durable.sessions[s.sessionId].take.nodes.a.phase, 'saved');
  assert.equal(durable.sessions[s.sessionId].take.nodes.b.startReceived, false);
  assert.equal(JSON.stringify(durable).includes('file://'), false);
  // No shutdown handler: terminate only our dedicated child after confirmed RTDB commits.
  const exited = once(first.child, 'exit'); first.child.kill(); await exited;
  const second = await launch(), owner = await peer(second.port, 'controller');
  const recovered = (await owner.call('SESSION_GET', s.sessionId)).event.payload.session;
  assert.equal(recovered.code, s.code);
  assert.equal(recovered.take.interrupted.reason, 'relay-restarted');
  assert.equal(recovered.take.nodes.a.phase, 'saved');
  assert.equal(recovered.take.nodes.b.phase, 'disconnected');
  assert.equal(recovered.take.nodes.b.startReceived, false); assert.equal(recovered.take.nodes.b.stopReceived, false);
  assert.equal(recovered.take.nodes.b.capture, null);
  assert.equal(recovered.takeHistory[0].takeId, 'complete-take');
  assert.equal(Object.keys(recovered.mediaAngles).length, 2);
  const na = await peer(second.port, 'a'), nb = await peer(second.port, 'b');
  for (const n of [na, nb]) {
    const member = (await n.call('SESSION_RESUME', s.sessionId)).event.payload.session.members[n.id];
    assert.equal(member.nodeId, members[n.id].nodeId); assert.equal(member.role, n.id === 'a' ? 'MAIN' : 'SIDE');
    assert.equal(member.readiness.enginePrepared, false); assert.equal(member.requiresReadyConfirmation, true);
    const stale = await n.call('NODE_STATE', s.sessionId, { readiness, readyEpoch: member.readyEpoch }, owner.id);
    assert.equal(stale.event.payload.code, 'READY_CONFIRMATION_REQUIRED');
    await prepare(n);
    assert.equal(n.inbox.some((m) => ['START_RECORDING', 'STOP_RECORDING'].includes(m.type)), false);
  }
  const late = await nb.call('RECORDING_ACK', s.sessionId, { requestId: interruptedStop.message.messageId, takeId: 'interrupted-take', command: 'STOP_RECORDING' }, owner.id);
  assert.equal(late.event.payload.code, 'TAKE_INTERRUPTED');
  await owner.call('CLOSE_INTERRUPTED_TAKE', s.sessionId, { takeId: 'interrupted-take', acknowledgeUnknown: true });
  const next = await owner.call('START_RECORDING', s.sessionId, { takeId: 'post-restart-take', targetNodeIds });
  assert.equal(next.event.type, 'SESSION_SNAPSHOT');
  await ack(na, next.message); await ack(nb, next.message);
  const nextStop = await owner.call('STOP_RECORDING', s.sessionId, { takeId: 'post-restart-take', targetNodeIds });
  await ack(na, nextStop.message); await ack(nb, nextStop.message); await saved(na, nextStop.message); await saved(nb, nextStop.message);
  const final = (await owner.call('SESSION_GET', s.sessionId)).event.payload.session;
  assert.equal(final.takeHistory.length, 2); assert.equal(final.take.nodes.a.phase, 'saved'); assert.equal(final.take.nodes.b.phase, 'saved');
  assert.equal(final.takeHistory[1].nodes.b.stopReceived, false); assert.equal(final.takeHistory[1].nodes.b.capture, null);
  const foreign = await peer(second.port, 'outsider');
  assert.equal((await foreign.call('SESSION_GET', s.sessionId)).event.payload.code, 'NOT_MEMBER');
  assert.ok((await ref.get()).val().revision > durable.revision);
});
