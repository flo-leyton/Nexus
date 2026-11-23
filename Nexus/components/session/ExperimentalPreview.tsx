import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import type { RTCVideoViewProps } from 'react-native-webrtc';
import { createPreviewTransport, previewAvailable, previewPair, type PreviewState } from '@/services/previewTransport';
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
  const pair = available && enabled ? previewPair(session, deviceId) : undefined;
  const sessionId = pair?.sessionId;
  const nodeId = pair?.nodeId;
  const nodeDeviceId = pair?.nodeDeviceId;
  const controllerId = pair?.controllerId;
  const transport = useRef<ReturnType<typeof createPreviewTransport> | null>(null);
  const [state, setState] = useState(disconnected);
  useEffect(() => {
    if (!sessionId || !nodeId || !nodeDeviceId || !controllerId) return;
    const next = createPreviewTransport({ sessionId, nodeId, nodeDeviceId, controllerId, deviceId }, setState);
    transport.current = next;
    return () => {
      transport.current = null;
      next.dispose();
    };
  }, [sessionId, nodeId, nodeDeviceId, controllerId, deviceId]);
  return {
    visible: Boolean(pair && deviceId === controllerId),
    sample: enabled ? Boolean(pair && deviceId === nodeDeviceId && state.phase !== 'disconnected') : undefined,
    state,
    start: () => transport.current?.start(),
    stop: () => transport.current?.stop(),
    receivedFrame: (url: string) => transport.current?.receivedFrame(url),
  };
}

export function ExperimentalPreview({ state, start, stop, receivedFrame }: ReturnType<typeof useExperimentalPreview>) {
  const label = { disconnected: 'Desconectada', connecting: 'Conectando', streaming: 'Transmitiendo' }[state.phase];
  return <SessionSection title="Vista previa experimental">
    <Text accessibilityLiveRegion="polite">{label}</Text>
    {state.streamURL && <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#121212' }}>
      <Suspense fallback={<ActivityIndicator />}>
        <Video streamURL={state.streamURL} objectFit="contain" style={{ flex: 1 }} onDimensionsChange={({ nativeEvent }) => {
          if (nativeEvent.width > 0 && nativeEvent.height > 0 && state.streamURL) receivedFrame(state.streamURL);
        }} />
      </Suspense>
    </View>}
    <Button mode="outlined" contentStyle={sessionStyles.touch} onPress={state.phase === 'disconnected' ? start : stop}>
      {state.phase === 'disconnected' ? 'Iniciar vista previa' : 'Detener vista previa'}
    </Button>
  </SessionSection>;
}
