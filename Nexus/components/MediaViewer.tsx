import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { Image, Modal, ScrollView, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LocalVideoPlayer } from './LocalVideoPlayer';

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
  const label = selection.kind === 'image' ? 'Foto' : 'Vídeo';
  const viewport = Math.min(560, Math.max(140, height - 170));
  return <Modal visible animationType="none" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} accessibilityViewIsModal>
      <View style={{ width: '100%', maxWidth: 780, flex: 1, alignSelf: 'center', padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text accessibilityRole="header" variant="titleLarge">{label}</Text>
          <Button mode="outlined" icon="close" onPress={onClose} contentStyle={{ minHeight: 48 }}>Cerrar</Button>
        </View>
        <ScrollView contentContainerStyle={{ gap: 8 }}>
          {selection.error || imageError ? <Text accessibilityLiveRegion="polite" style={{ color: colors.error }}>
            {selection.error || imageError}
          </Text> : !selection.uri ? <ActivityIndicator accessibilityLabel="Abriendo archivo" /> :
            selection.kind === 'image' ? <Image key={selection.uri} source={{ uri: selection.uri }} resizeMode="contain"
              onError={() => setImageError('No se pudo abrir la foto.')}
              style={{ width: '100%', height: viewport, backgroundColor: colors.surfaceVariant }} /> :
            <LocalVideoPlayer key={selection.uri} uri={selection.uri} remote={selection.remote} height={viewport} />}
        </ScrollView>
      </View>
    </SafeAreaView>
  </Modal>;
}
