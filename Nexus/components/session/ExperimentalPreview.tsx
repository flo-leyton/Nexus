import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import type { RTCVideoViewProps } from 'react-native-webrtc';
import { createPreviewTransport, previewAvailable, previewTargets, type PreviewPair, type PreviewState } from '@/services/previewTransport';
import type { Session } from '@/services/sessionProtocol';
import { SessionSection, sessionStyles } from './SessionUI';

const Video = lazy(async () => {
  const { RTCView } = await import('react-native-webrtc');
  // React.lazy requires a React component as its resolved default, not a native host type.
  return { default: function PreviewVideo(props: RTCVideoViewProps) { return <RTCView {...props} />; } };
});
const disconnected: PreviewState = { phase: 'disconnected' };

export function useExperimentalPreview(session: Session | undefined, deviceId: string, available: boolean) {
  const enabled = previewAvailable();
  const targets = available && enabled ? previewTargets(session, deviceId) : [];
  const isController = session?.controllerId === deviceId;
  const pair = isController ? undefined : targets[0]?.pair;
  const preview = usePreviewConnection(pair);
  return {
    targets: isController ? targets : [],
    sample: enabled ? Boolean(pair && preview.state.phase !== 'disconnected') : undefined,
    samplerRequested: preview.samplerRequested,
  };
}

function usePreviewConnection(pair: PreviewPair | undefined) {
  const sessionId = pair?.sessionId;
  const nodeId = pair?.nodeId;
  const nodeDeviceId = pair?.nodeDeviceId;
  const controllerId = pair?.controllerId;
  const deviceId = pair?.deviceId;
  const transport = useRef<ReturnType<typeof createPreviewTransport> | null>(null);
  const samplerRequested = useCallback((enabled: boolean) => transport.current?.samplerRequested(enabled), []);
  const [state, setState] = useState(disconnected);
  useEffect(() => {
    if (!sessionId || !nodeId || !nodeDeviceId || !controllerId || !deviceId) return;
    const next = createPreviewTransport({ sessionId, nodeId, nodeDeviceId, controllerId, deviceId }, setState);
    transport.current = next;
    return () => {
      transport.current = null;
      next.dispose();
    };
  }, [sessionId, nodeId, nodeDeviceId, controllerId, deviceId]);
  return {
    samplerRequested,
    state,
    start: () => transport.current?.start(),
    stop: () => transport.current?.stop(),
    receivedFrame: (url: string) => transport.current?.receivedFrame(url),
    dimensionsReported: (url: string, width: number, height: number) => transport.current?.dimensionsReported(url, width, height),
  };
}

export function ExperimentalPreview({ targets }: { targets: ReturnType<typeof previewTargets> }) {
  const { width, height } = useWindowDimensions();
  const sideBySide = Math.min(width, height) >= 600 && targets.length > 1;
  if (!targets.length) return null;

  return <SessionSection title="Vista previa experimental">
    <View style={{ flexDirection: sideBySide ? 'row' : 'column', flexWrap: sideBySide ? 'wrap' : 'nowrap', gap: 12 }}>
      {targets.map(({ pair, label }) => <View key={JSON.stringify([pair.sessionId, pair.nodeId, pair.nodeDeviceId, pair.controllerId])}
        style={sideBySide ? { flexGrow: 1, flexBasis: '46%', minWidth: 0 } : undefined}>
        <NodePreview pair={pair} label={label} />
      </View>)}
    </View>
  </SessionSection>;
}

function NodePreview({ pair, label }: { pair: PreviewPair; label: string }) {
  const { state, start, stop, receivedFrame, dimensionsReported } = usePreviewConnection(pair);
  const streamURL = state.streamURL;
  const actionLabel = state.phase === 'disconnected' ? 'Iniciar vista previa' : 'Detener vista previa';
  const status = { disconnected: 'Desconectada', connecting: 'Conectando', streaming: 'Transmitiendo' }[state.phase];
  return <View style={{ gap: 8 }}>
    <Text variant="titleMedium">{label}</Text>
    <Text accessibilityLiveRegion="polite">{status}</Text>
    {streamURL && <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#121212' }}>
      <Suspense fallback={<ActivityIndicator />}>
        <Video streamURL={streamURL} objectFit="contain" style={{ flex: 1 }} onDimensionsChange={({ nativeEvent }) => {
          dimensionsReported(streamURL, nativeEvent.width, nativeEvent.height);
          if (nativeEvent.width > 0 && nativeEvent.height > 0) receivedFrame(streamURL);
        }} />
      </Suspense>
    </View>}
    <Button mode="outlined" accessibilityLabel={`${actionLabel} ${label}`} contentStyle={sessionStyles.touch}
      onPress={state.phase === 'disconnected' ? start : stop}>
      {actionLabel}
    </Button>
  </View>;
}
