import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import type { RTCVideoViewProps } from 'react-native-webrtc';
import { createPreviewTransport, previewAvailable, previewTargets, type PreviewPair, type PreviewState } from '@/services/previewTransport';
import type { Session } from '@/services/sessionProtocol';
import { sessionStyles } from './SessionUI';

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
    enabled,
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

export function NodePreview({ pair, label, compact = false }: { pair?: PreviewPair; label: string; compact?: boolean }) {
  const { state, start, stop, receivedFrame, dimensionsReported } = usePreviewConnection(pair);
  const streamURL = pair ? state.streamURL : undefined;
  const actionLabel = state.phase === 'disconnected' ? 'Iniciar vista previa' : 'Detener vista previa';
  const status = { disconnected: 'Vista detenida', connecting: 'Conectando', streaming: 'Transmitiendo' }[state.phase];
  return <View style={{ gap: compact ? 4 : 8 }}>
    <Text variant={compact ? 'labelSmall' : undefined} accessibilityLiveRegion="polite">{pair ? status : 'Vista no disponible'}</Text>
    {!!streamURL && <View style={{ width: '100%', maxWidth: compact ? 256 : undefined, alignSelf: 'center',
      aspectRatio: 16 / 9, backgroundColor: '#121212' }}>
      <Suspense fallback={<ActivityIndicator />}>
        <Video streamURL={streamURL} objectFit="contain" style={{ flex: 1 }} onDimensionsChange={({ nativeEvent }) => {
          dimensionsReported(streamURL, nativeEvent.width, nativeEvent.height);
          if (nativeEvent.width > 0 && nativeEvent.height > 0) receivedFrame(streamURL);
        }} />
      </Suspense>
    </View>}
    <Button mode="outlined" accessibilityLabel={`${actionLabel} ${label}`} disabled={!pair}
      style={compact ? { width: '100%' } : undefined}
      contentStyle={compact ? sessionStyles.compactTouch : sessionStyles.touch}
      labelStyle={compact ? sessionStyles.compactLabel : undefined}
      onPress={state.phase === 'disconnected' ? start : stop}>
      {actionLabel}
    </Button>
  </View>;
}
