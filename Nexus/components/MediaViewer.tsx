import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { Modal, ScrollView, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LocalVideoPlayer } from './LocalVideoPlayer';
import { PhotoViewport } from './PhotoViewport';

type Selection = { id: number; kind: 'image' | 'video'; remote: boolean; uri?: string; error?: string };

export function useMediaViewer(enabled = true) {
  const focused = useIsFocused();
  const [selection, setSelection] = useState<Selection | null>(null);
  const request = useRef(0);
  const close = useCallback(() => { request.current++; setSelection(null); }, []);
  useFocusEffect(useCallback(() => {
    close();
    if (!enabled) return;
    return () => { request.current++; };
  }, [close, enabled]));

  return {
    close,
    open(kind: Selection['kind'], resolveUri: () => Promise<string>, remote = false) {
      if (!enabled) return;
      const id = ++request.current;
      setSelection({ id, kind, remote });
      void Promise.resolve().then(resolveUri).then((uri) => {
        if (request.current === id) setSelection({ id, kind, remote, uri });
      }).catch((error: unknown) => {
        if (request.current === id) setSelection({ id, kind, remote,
          error: error instanceof Error ? error.message : 'No se pudo abrir el archivo.' });
      });
    },
    viewer: enabled && focused && selection && <MediaViewer key={selection.id} selection={selection} onClose={close} />,
  };
}

function MediaViewer({ selection, onClose }: { selection: Selection; onClose(): void }) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const [imageError, setImageError] = useState('');
  const photo = selection.kind === 'image';
  const viewport = Math.min(560, Math.max(140, height - 170));
  return <Modal visible animationType="none" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: photo ? '#000' : colors.background }} accessibilityViewIsModal>
      <View style={{ width: '100%', maxWidth: photo ? undefined : 780, flex: 1, alignSelf: 'center', padding: photo ? 0 : 16, gap: photo ? 0 : 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: photo ? 12 : 0 }}>
          <Text accessibilityRole="header" variant="titleLarge" style={photo ? { color: '#FFF' } : undefined}>{photo ? 'Foto' : 'Vídeo'}</Text>
          <Button mode={photo ? 'text' : 'outlined'} textColor={photo ? '#FFF' : undefined} icon="close" onPress={onClose} contentStyle={{ minHeight: 48 }}>Cerrar</Button>
        </View>
        {photo ? <GestureHandlerRootView style={{ flex: 1 }}>
          {selection.error || imageError ? <Text accessibilityLiveRegion="polite" style={{ color: '#FFF', padding: 16 }}>
            {selection.error || imageError}
          </Text> : !selection.uri ? <ActivityIndicator color="#FFF" accessibilityLabel="Abriendo foto" /> :
            <PhotoViewport key={selection.uri} uri={selection.uri} onError={() => setImageError('No se pudo abrir la foto.')} />}
        </GestureHandlerRootView> : <ScrollView contentContainerStyle={{ gap: 8 }}>
          {selection.error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.error }}>{selection.error}</Text>
            : !selection.uri ? <ActivityIndicator accessibilityLabel="Abriendo archivo" /> :
            <LocalVideoPlayer key={selection.uri} uri={selection.uri} remote={selection.remote} height={viewport} />}
        </ScrollView>}
      </View>
    </SafeAreaView>
  </Modal>;
}
