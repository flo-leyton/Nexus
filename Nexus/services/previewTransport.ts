import * as Crypto from 'expo-crypto';
import { NativeModules, Platform } from 'react-native';
import type { MediaStream, RTCPeerConnection } from 'react-native-webrtc';
import {
  isSessionRequest, SESSION_PROTOCOL_VERSION, type PreviewSignal, type Session,
} from './sessionProtocol';
import { sendSocketMessage, subscribeToSocketMessages } from './socket';

type Rtc = typeof import('react-native-webrtc');
type SignalBody = PreviewSignal extends infer T
  ? T extends PreviewSignal ? Omit<T, 'nodeId' | 'connectionId'> : never : never;
type Ice = Extract<SignalBody, { kind: 'ice' }>;
type NativeStream = ConstructorParameters<Rtc['MediaStream']>[0];
// 124.0.6 implements EventTarget, but its declaration imports an untyped entry point.
type PeerEvents = {
  connectionstatechange: unknown;
  track: { track: { kind: string }; streams: MediaStream[] };
  icecandidate: { candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } | null };
};
type PeerWithEvents = RTCPeerConnection & {
  addEventListener<K extends keyof PeerEvents>(name: K, listener: (event: PeerEvents[K]) => void): void;
};
export type PreviewState = { phase: 'disconnected' | 'connecting' | 'streaming'; streamURL?: string };

export function previewAvailable() {
  return Platform.OS === 'android' && process.env.EXPO_PUBLIC_NEXUS_NX10_WEBRTC === '1' &&
    Boolean(NativeModules.Nx10WebRtc && NativeModules.WebRTCModule);
}

export function previewPair(session: Session | undefined, deviceId: string) {
  if (!session || session.state === 'closed') return;
  const nodes = Object.values(session.members).filter((member) => member.kind === 'node');
  const node = nodes.length === 1 ? nodes[0] : undefined;
  if (!node?.nodeId || !node.online || !session.members[session.controllerId]?.online) return;
  if (deviceId !== session.controllerId && deviceId !== node.deviceId) return;
  return { sessionId: session.sessionId, nodeId: node.nodeId, nodeDeviceId: node.deviceId,
    controllerId: session.controllerId, deviceId };
}

type Pair = NonNullable<ReturnType<typeof previewPair>>;
type Negotiation = {
  id: string;
  pc?: RTCPeerConnection;
  local?: MediaStream;
  remoteURL?: string;
  localIce: Ice[];
  remoteIce: Ice[];
  sentDescription: boolean;
  timer: ReturnType<typeof setTimeout>;
};

export function createPreviewTransport(pair: Pair, update: (state: PreviewState) => void) {
  const controller = pair.deviceId === pair.controllerId;
  let current: Negotiation | undefined;
  let tasks = Promise.resolve();
  let newestOffer = 0;
  const targetId = controller ? pair.nodeId : pair.controllerId;
  const expectedPeer = controller ? pair.nodeDeviceId : pair.controllerId;
  const incomingTarget = controller ? pair.controllerId : pair.nodeId;
  const send = (id: string, body: SignalBody) => {
    if (!sendSocketMessage({
      protocolVersion: SESSION_PROTOCOL_VERSION, messageId: Crypto.randomUUID(), type: 'PREVIEW_SIGNAL',
      sessionId: pair.sessionId, senderId: pair.deviceId, targetId, sentAt: Date.now(),
      payload: { ...body, nodeId: pair.nodeId, connectionId: id },
    })) throw new Error('Relay offline');
  };
  const stop = (notify = true) => {
    const previous = current;
    current = undefined;
    if (!previous) return;
    clearTimeout(previous.timer);
    if (notify) {
      try { send(previous.id, { kind: 'close' }); } catch { /* Peer is unreachable. */ }
    }
    try { previous.pc?.close(); } catch { /* Native peer can already be disposed. */ }
    try { previous.local?.release(); } catch { /* Native context can already be gone. */ }
    update({ phase: 'disconnected' });
  };
  const enqueue = (work: () => Promise<void>, negotiation: Negotiation) => {
    tasks = tasks.then(async () => {
      if (current !== negotiation) return;
      try { await work(); } catch {
        if (current === negotiation) stop();
      }
    });
  };
  const begin = (id: string) => {
    stop(false);
    const next: Negotiation = { id, localIce: [], remoteIce: [], sentDescription: false,
      timer: setTimeout(() => { if (current === next) stop(); }, 20000) };
    current = next;
    update({ phase: 'connecting' });
    return next;
  };
  const describe = async (next: Negotiation, kind: 'offer' | 'answer') => {
    const pc = next.pc!;
    const description = kind === 'offer' ? await pc.createOffer({}) : await pc.createAnswer();
    if (current !== next) return;
    await pc.setLocalDescription(description);
    if (current !== next) return;
    send(next.id, { kind, sdp: pc.localDescription?.sdp ?? description.sdp });
    next.sentDescription = true;
    for (const candidate of next.localIce.splice(0)) send(next.id, candidate);
  };
  const setRemote = async (next: Negotiation, kind: 'offer' | 'answer', sdp: string) => {
    const pc = next.pc!;
    await pc.setRemoteDescription({ type: kind, sdp });
    for (const candidate of next.remoteIce.splice(0)) {
      if (current !== next) return;
      await pc.addIceCandidate(candidate);
    }
  };
  async function peer(next: Negotiation) {
    const rtc = await import('react-native-webrtc');
    if (current !== next) return;
    // Host candidates are sufficient for the authorized LAN test.
    const pc = new rtc.RTCPeerConnection({ iceServers: [] }) as PeerWithEvents;
    next.pc = pc;
    const report = () => {
      if (current !== next) return;
      if (controller && next.remoteURL && pc.connectionState === 'connected') {
        update({ phase: 'connecting', streamURL: next.remoteURL });
      } else if (!controller && pc.connectionState === 'connected') {
        clearTimeout(next.timer);
        update({ phase: 'streaming' });
      } else if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) stop();
    };
    pc.addEventListener('connectionstatechange', report);
    pc.addEventListener('track', ({ track, streams }) => {
      if (!controller || track.kind !== 'video' || !streams[0]) return;
      next.remoteURL = streams[0].toURL();
      report();
    });
    pc.addEventListener('icecandidate', ({ candidate }) => {
      if (current !== next || !candidate?.candidate || candidate.sdpMLineIndex !== 0) return;
      const ice: Ice = { kind: 'ice', candidate: candidate.candidate,
        sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex };
      try {
        if (next.sentDescription) send(next.id, ice);
        else if (next.localIce.length < 64) next.localIce.push(ice);
      } catch { stop(); }
    });
    return rtc;
  }
  const unsubscribe = subscribeToSocketMessages((data) => {
    if (typeof data !== 'string' || data.length > 32768) return;
    let message: unknown;
    try { message = JSON.parse(data); } catch { return; }
    if (!isSessionRequest(message) || message.type !== 'PREVIEW_SIGNAL' ||
      message.sessionId !== pair.sessionId || message.targetId !== incomingTarget ||
      message.senderId !== expectedPeer || message.payload.nodeId !== pair.nodeId) return;
    const { payload } = message;
    if (payload.kind === 'offer') {
      if (controller || message.sentAt <= newestOffer) return;
      newestOffer = message.sentAt;
      const next = begin(payload.connectionId);
      enqueue(async () => {
        const rtc = await peer(next);
        if (!rtc || current !== next) return;
        await setRemote(next, 'offer', payload.sdp);
        if (current !== next) return;
        const info: NativeStream = await NativeModules.Nx10WebRtc.createStream();
        const stream = new rtc.MediaStream(info);
        if (current !== next) { stream.release(); return; }
        next.local = stream;
        next.pc!.addTrack(stream.getVideoTracks()[0], stream);
        await describe(next, 'answer');
      }, next);
      return;
    }
    const next = current;
    if (!next || next.id !== payload.connectionId) return;
    if (payload.kind === 'close') { stop(false); return; }
    enqueue(async () => {
      if (payload.kind === 'answer' && controller && !next.pc?.remoteDescription)
        await setRemote(next, 'answer', payload.sdp);
      if (payload.kind === 'ice') {
        if (next.pc?.remoteDescription) await next.pc.addIceCandidate(payload);
        else if (next.remoteIce.length < 64) next.remoteIce.push(payload);
      }
    }, next);
  });
  return {
    start() {
      if (!controller || current) return;
      const next = begin(Crypto.randomUUID());
      enqueue(async () => {
        if (!await peer(next) || current !== next) return;
        next.pc!.addTransceiver('video', { direction: 'recvonly' });
        await describe(next, 'offer');
      }, next);
    },
    stop,
    receivedFrame(streamURL: string) {
      if (!controller || !current || current.remoteURL !== streamURL) return;
      clearTimeout(current.timer);
      update({ phase: 'streaming', streamURL });
    },
    dispose() { unsubscribe(); stop(); },
  };
}
