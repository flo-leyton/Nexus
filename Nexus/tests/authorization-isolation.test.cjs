const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const WebSocket = require('ws');
const { startTestRelay, authenticate } = require('./helpers/relay.cjs');

async function setup(t) {
  const runtime = await startTestRelay(t);
  const peers = [];
  t.after(() => peers.forEach((p) => p.ws.terminate()));
  return async (id, token = id) => {
    const ws = new WebSocket(`ws://127.0.0.1:${runtime.server.address().port}`);
    await once(ws, 'open');
    const inbox = [];
    ws.on('message', (raw) => inbox.push(JSON.parse(String(raw))));
    await authenticate(ws, id, token);
    const p = { id, ws, inbox,
      async wait(predicate, after = 0) {
        while (!inbox.slice(after).some(predicate)) await once(ws, 'message');
        return inbox.slice(after).find(predicate);
      },
      async call(type, sessionId, payload = {}, targetId) {
        const message = { protocolVersion: 1, messageId: randomUUID(), type, sessionId, senderId: id,
          sentAt: Date.now(), payload, ...(targetId ? { targetId } : {}) };
        ws.send(JSON.stringify(message));
        return p.wait((m) => m.payload?.requestId === message.messageId);
      },
      async rejectRaw(message) {
        const after = inbox.length;
        ws.send(JSON.stringify(message));
        return p.wait((m) => m.type === 'SESSION_ERROR', after);
      },
    };
    peers.push(p); return p;
  };
}
async function create(c) { return (await c.call('SESSION_CREATE', randomUUID())).payload.session; }
async function join(c, n, s) {
  const pending = await n.call('SESSION_JOIN_REQUEST', 'join-by-code', { code: s.code });
  return (await c.call('SESSION_JOIN_ACCEPT', s.sessionId, { requestId: pending.payload.requestId }, n.id)).payload.session;
}
const command = (action = 'vibrate') => ({ type: 'CAPABILITY_COMMAND', from: 'A', target: 'B',
  capability: action === 'vibrate' ? 'vibration' : 'flashlight', action, ...(action === 'vibrate' ? { duration: 5000 } : {}) });
const capabilities = (p) => p.inbox.filter((m) => m.type === 'CAPABILITY_COMMAND');
async function barrier(...peers) { for (const p of peers) await p.call('SESSION_LIST', 'studio-index'); }

test('H4 privacy: discovery never exposes other pending applicants to accepted Nodes or foreign clients', { timeout: 10000 }, async (t) => {
  const connect = await setup(t), c = await connect('controller'), n = await connect('node');
  const p1 = await connect('pending-1'), p2 = await connect('pending-2'), foreign = await connect('foreign');
  const sameAccount = await connect('same-account-other-device', 'controller');
  const s = await create(c); await join(c, n, s);
  for (const p of [p1, p2]) await p.call('SESSION_JOIN_REQUEST', 'join-by-code', { code: s.code });
  const ownList = await c.call('SESSION_LIST', 'studio-index');
  const controllerSnapshot = await c.wait((m) => m.type === 'SESSION_SNAPSHOT' && m.payload.requestId === ownList.payload.requestId);
  assert.deepEqual(controllerSnapshot.payload.pending.map((p) => p.deviceId).sort(), [p1.id, p2.id]);
  const list = await n.call('SESSION_LIST', 'studio-index');
  const nodeSnapshot = await n.wait((m) => m.type === 'SESSION_SNAPSHOT' && m.payload.requestId === list.payload.requestId);
  assert.equal(Object.hasOwn(nodeSnapshot.payload, 'pending'), false);
  for (const type of ['SESSION_GET', 'SESSION_RESUME']) assert.equal(Object.hasOwn((await n.call(type, s.sessionId)).payload, 'pending'), false);
  for (const p of [foreign, sameAccount, p1, p2]) {
    assert.deepEqual((await p.call('SESSION_LIST', 'studio-index')).payload.sessionIds, []);
    assert.equal((await p.call('SESSION_GET', s.sessionId)).payload.code, 'NOT_MEMBER');
    assert.equal(p.inbox.some((m) => m.type === 'SESSION_SNAPSHOT' && m.sessionId === s.sessionId), false);
    assert.equal(p.inbox.some((m) => m.payload?.pending), false);
  }
});

test('H4 capabilities: legacy A to B is targeted within one authorized Session and never crosses Sessions', { timeout: 10000 }, async (t) => {
  const connect = await setup(t), ca = await connect('ca'), a = await connect('a'), cb = await connect('cb'), b = await connect('b');
  const pending = await connect('pending'), stranger = await connect('stranger');
  const sa = await create(ca), sb = await create(cb); await join(ca, a, sa); await join(cb, b, sb);
  await pending.call('SESSION_JOIN_REQUEST', 'join-by-code', { code: sa.code });
  for (const action of ['vibrate', 'flash_on', 'flash_off']) {
    const raw = command(action), before = capabilities(a).length;
    ca.ws.send(JSON.stringify(raw));
    await a.wait((m) => m.type === 'CAPABILITY_COMMAND' && m.action === action);
    await barrier(ca, a, cb, b, pending, stranger);
    assert.deepEqual(capabilities(a).at(-1), raw); assert.equal(capabilities(a).length, before + 1);
    for (const p of [ca, cb, b, pending, stranger]) assert.equal(capabilities(p).length, 0);
  }
  cb.ws.send(JSON.stringify(command())); await b.wait((m) => m.type === 'CAPABILITY_COMMAND');
  await barrier(cb, a); assert.equal(capabilities(a).length, 3);
  for (const p of [a, b, pending, stranger]) {
    assert.equal((await p.rejectRaw(command())).payload.code, 'CAPABILITY_SESSION_REQUIRED');
  }
  const invalid = [{ ...command(), duration: 10001 }, { ...command(), duration: 0 }, { ...command(), duration: 1.5 },
    { ...command(), extra: 'unexpected' }, { ...command(), capability: 'camera' }, { ...command('flash_on'), duration: 1 },
    { ...command(), from: 'B', target: 'A' }];
  for (const m of invalid) assert.equal((await ca.rejectRaw(m)).payload.code, 'INVALID_CAPABILITY_COMMAND');
  assert.equal((await ca.rejectRaw({ ...command(), sessionId: sb.sessionId })).payload.code, 'INVALID_MESSAGE');
  await barrier(a, b); assert.equal(capabilities(a).length, 3); assert.equal(capabilities(b).length, 1);
});

test('H4 capabilities: ambiguous Sessions or multiple accepted Nodes fail closed', { timeout: 10000 }, async (t) => {
  const connect = await setup(t), c = await connect('controller'), a = await connect('a'), b = await connect('b');
  const s = await create(c); await join(c, a, s); await join(c, b, s);
  assert.equal((await c.rejectRaw(command())).payload.code, 'CAPABILITY_TARGET_AMBIGUOUS');
  b.ws.close(); await once(b.ws, 'close');
  assert.equal((await c.rejectRaw(command())).payload.code, 'CAPABILITY_TARGET_AMBIGUOUS'); // offline is not permission to guess another target
  await create(c);
  assert.equal((await c.rejectRaw(command())).payload.code, 'CAPABILITY_SESSION_AMBIGUOUS');
  await barrier(a); assert.equal(capabilities(a).length, 0);
});

test('H4 capabilities: offline participation cannot receive commands until authorized resume; closed Session cannot route', { timeout: 10000 }, async (t) => {
  const connect = await setup(t), c = await connect('controller'), n = await connect('node');
  assert.equal((await c.rejectRaw(command())).payload.code, 'CAPABILITY_SESSION_REQUIRED');
  const s = await create(c); await join(c, n, s);
  n.ws.close(); await once(n.ws, 'close'); await barrier(c);
  assert.equal((await c.rejectRaw(command())).payload.code, 'CAPABILITY_TARGET_UNAVAILABLE');
  const returned = await connect('node');
  assert.equal((await c.rejectRaw(command())).payload.code, 'CAPABILITY_TARGET_UNAVAILABLE');
  await returned.call('SESSION_RESUME', s.sessionId);
  c.ws.send(JSON.stringify(command())); await returned.wait((m) => m.type === 'CAPABILITY_COMMAND');
  await c.call('SESSION_CLOSE', s.sessionId);
  assert.equal((await c.rejectRaw(command())).payload.code, 'CAPABILITY_SESSION_REQUIRED');
  await barrier(returned); assert.equal(capabilities(returned).length, 1);
});