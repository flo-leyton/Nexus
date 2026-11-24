import * as Crypto from 'expo-crypto';
import { NativeModules, Platform } from 'react-native';
import type { MediaStream, MediaStreamTrack, RTCPeerConnection } from 'react-native-webrtc';
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
  iceconnectionstatechange: unknown;
  track: { track: MediaStreamTrack; streams: MediaStream[] };
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

export type PreviewPair = {
  sessionId: string; nodeId: string; nodeDeviceId: string; controllerId: string; deviceId: string;
};

export function previewTargets(session: Session | undefined, deviceId: string) {
  const targets: { pair: PreviewPair; label: string }[] = [];
  if (!session || session.state === 'closed' || !session.members[session.controllerId]?.online) return targets;
  for (const node of Object.values(session.members)) {
    if (node.kind !== 'node' || !node.online || !node.nodeId) continue;
    if (deviceId !== session.controllerId && deviceId !== node.deviceId) continue;
    targets.push({
      pair: { sessionId: session.sessionId, nodeId: node.nodeId, nodeDeviceId: node.deviceId,
        controllerId: session.controllerId, deviceId },
      label: node.role === 'unassigned' || !node.role ? 'Node' : node.role.toUpperCase(),
    });
  }
  return targets;
}

type Negotiation = {
  id: string;
  pc?: RTCPeerConnection;
  local?: MediaStream;
  remoteURL?: string;
  localIce: Ice[];
  remoteIce: Ice[];
  sentDescription: boolean;
  timer: ReturnType<typeof setTimeout>;
  statsTimer?: ReturnType<typeof setInterval>;
  samplingStats?: boolean;
  track?: MediaStreamTrack;
};

function videoStats(reports: Map<string, Record<string, unknown>>, controller: boolean) {
  const type = controller ? 'inbound-rtp' : 'outbound-rtp';
  const fields = controller ? ['framesReceived', 'framesDecoded', 'bytesReceived'] : ['framesEncoded', 'framesSent', 'bytesSent'];
  const video = [...reports.values()].filter((report) => report.type === type && (report.kind ?? report.mediaType) === 'video');
  const codecs = [...new Set(video.flatMap(({ codecId }) => {
    const mime = typeof codecId === 'string' ? reports.get(codecId)?.mimeType : undefined;
    return typeof mime === 'string' && /^video\/[\w-]{1,20}$/i.test(mime) ? [mime] : [];
  }))];
  return { codec: codecs.length ? codecs.join(', ') : 'no disponible', ...Object.fromEntries(fields.map((field) => {
    const values = video.map((report) => report[field]);
    return [field, values.length && values.every((value) => typeof value === 'number' && Number.isFinite(value))
      ? (values as number[]).reduce((sum, value) => sum + value, 0) : 'no disponible'];
  })) };
}

// Read the effective description without rewriting it. For this diagnostic only VP8 is allowed.
function hasOnlyVp8(sdp: string) {
  const video = sdp.split(/\r?\n(?=m=)/).find((section) => section.startsWith('m=video '));
  if (!video) return false;
  const [header, ...lines] = video.split(/\r?\n/);
  const [, port, , ...payloads] = header.trim().split(/\s+/);
  return Number(port) > 0 && payloads.length > 0 &&
    payloads.every((payload) => /^\d+$/.test(payload) && lines.some((line) =>
      line.toLowerCase() === `a=rtpmap:${payload} vp8/90000`));
}

export function createPreviewTransport(pair: PreviewPair, update: (state: PreviewState) => void) {
  const controller = pair.deviceId === pair.controllerId;
  const diagnostics = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_NEXUS_NX10_TRACE === '1';
  const vp8Test = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_NEXUS_NX10_VP8 === '1';
  const trace = (next: Negotiation, event: string, detail: Record<string, unknown> = {}) => {
    if (diagnostics) console.info('[NX10 WebRTC]', JSON.stringify({
      role: controller ? 'Controller' : 'Node', nodeId: pair.nodeId, negotiation: next.id, event, ...detail,
    }));
  };
  const trackState = (track: MediaStreamTrack) => ({ enabled: track.enabled, readyState: track.readyState, muted: track.muted });
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
  const stop = (notify = true, reason = 'stopped') => {
    const previous = current;
    current = undefined;
    if (!previous) return;
    clearTimeout(previous.timer);
    clearInterval(previous.statsTimer);
    trace(previous, 'closed', { reason, ice: previous.pc?.iceConnectionState, peer: previous.pc?.connectionState });
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
        if (current === negotiation) stop(true, 'operation-failed');
      }
    });
  };
  const begin = (id: string) => {
    stop(false);
    const next: Negotiation = { id, localIce: [], remoteIce: [], sentDescription: false,
      timer: setTimeout(() => { if (current === next) stop(true, 'timeout'); }, 20000) };
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
    const sdp = pc.localDescription?.sdp ?? description.sdp;
    if (vp8Test && !hasOnlyVp8(sdp)) { stop(true, 'vp8-local-sdp-unconfirmed'); return; }
    send(next.id, { kind, sdp });
    trace(next, 'description-sent', { kind });
    if (vp8Test && kind === 'answer') trace(next, 'codec-confirmed', { codec: 'VP8', source: 'local-answer-sdp' });
    next.sentDescription = true;
    for (const candidate of next.localIce.splice(0)) send(next.id, candidate);
  };
  const setRemote = async (next: Negotiation, kind: 'offer' | 'answer', sdp: string) => {
    if (vp8Test && !hasOnlyVp8(sdp)) { stop(true, 'vp8-remote-sdp-unconfirmed'); return; }
    const pc = next.pc!;
    await pc.setRemoteDescription({ type: kind, sdp });
    trace(next, 'description-applied', { kind });
    if (vp8Test && kind === 'answer') trace(next, 'codec-confirmed', { codec: 'VP8', source: 'remote-answer-sdp' });
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
    if (diagnostics) {
      const states = () => trace(next, 'connection', { ice: pc.iceConnectionState, peer: pc.connectionState });
      states();
      pc.addEventListener('iceconnectionstatechange', states);
      pc.addEventListener('connectionstatechange', states);
      let samples = 0;
      next.statsTimer = setInterval(async () => {
        if (++samples >= 8) clearInterval(next.statsTimer);
        if (current !== next || next.samplingStats) return;
        next.samplingStats = true;
        try {
          const reports: Map<string, Record<string, unknown>> = await pc.getStats();
          if (current === next) trace(next, 'stats', {
            ...(next.track && { track: trackState(next.track) }), ...videoStats(reports, controller),
          });
        } catch {
          if (current === next) trace(next, 'stats-unavailable');
        } finally { next.samplingStats = false; }
      }, 2500);
    }
    const report = () => {
      if (current !== next) return;
      if (controller && next.remoteURL && pc.connectionState === 'connected') {
        update({ phase: 'connecting', streamURL: next.remoteURL });
      } else if (!controller && pc.connectionState === 'connected') {
        clearTimeout(next.timer);
        update({ phase: 'streaming' });
      } else if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) stop(true, 'peer-lost');
    };
    pc.addEventListener('connectionstatechange', report);
    pc.addEventListener('track', ({ track, streams }) => {
      if (!controller || track.kind !== 'video' || !streams[0]) return;
      next.track = track;
      trace(next, 'ontrack', trackState(track));
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
        if (vp8Test) {
          const supported = rtc.RTCRtpSender.getCapabilities('video')?.codecs.some((codec) => codec.mimeType.toLowerCase() === 'video/vp8');
          trace(next, 'vp8-capability', { direction: 'send', supported: Boolean(supported) });
          if (!supported) { stop(true, 'vp8-sender-unavailable'); return; }
        }
        await setRemote(next, 'offer', payload.sdp);
        if (current !== next) return;
        trace(next, 'local-track-requested');
        let info: NativeStream;
        try { info = await NativeModules.Nx10WebRtc.createStream(); } catch (error) {
          trace(next, 'local-track-create-failed');
          throw error;
        }
        const stream = new rtc.MediaStream(info);
        if (current !== next) { stream.release(); return; }
        next.local = stream;
        const track = stream.getVideoTracks()[0];
        next.track = track;
        trace(next, 'local-track-created', track ? trackState(track) : { available: false });
        if (diagnostics && track) {
          const events = track as MediaStreamTrack & { addEventListener(name: 'ended', handler: () => void): void };
          events.addEventListener('ended', () => trace(next, 'local-track-ended', trackState(track)));
        }
        next.pc!.addTrack(track, stream);
        trace(next, 'local-track-attached');
        await describe(next, 'answer');
      }, next);
      return;
    }
    const next = current;
    if (!next || next.id !== payload.connectionId) return;
    if (payload.kind === 'close') { stop(false, 'remote-close'); return; }
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
        const rtc = await peer(next);
        if (!rtc || current !== next) return;
        const transceiver = next.pc!.addTransceiver('video', { direction: 'recvonly' });
        if (vp8Test) {
          const codecs = rtc.RTCRtpReceiver.getCapabilities('video')?.codecs.filter((codec) => codec.mimeType.toLowerCase() === 'video/vp8');
          const preferenceApi = typeof transceiver.setCodecPreferences === 'function';
          trace(next, 'vp8-capability', { direction: 'receive', supported: Boolean(codecs?.length), preferenceApi });
          if (!codecs?.length || !preferenceApi) { stop(true, 'vp8-receiver-unavailable'); return; }
          transceiver.setCodecPreferences(codecs);
        }
        await describe(next, 'offer');
      }, next);
    },
    stop,
    samplerRequested(enabled: boolean) {
      if (current && !controller) trace(current, 'pixelcopy-prop', { enabled });
    },
    dimensionsReported(streamURL: string, width: number, height: number) {
      if (current?.remoteURL === streamURL) trace(current, 'rtcview-dimensions', { width, height });
    },
    receivedFrame(streamURL: string) {
      if (!controller || !current || current.remoteURL !== streamURL) return;
      clearTimeout(current.timer);
      update({ phase: 'streaming', streamURL });
    },
    dispose() { unsubscribe(); stop(); },
  };
}
