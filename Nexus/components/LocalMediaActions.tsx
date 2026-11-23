import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { captureUploader, removeCaptureFromNexus } from '@/services/captureUpload';
import { sessionStyles } from './session/SessionUI';

export function LocalMediaActions({ id, disabled = false, onDeleted }: {
  id: string; disabled?: boolean; onDeleted(): void;
}) {
  const [busy, setBusy] = useState(() => captureUploader.isBusy(id));
  const [notice, setNotice] = useState('');
  const blocked = useRef(disabled);
  blocked.current = disabled;
  useEffect(() => captureUploader.subscribe(() => setBusy(captureUploader.isBusy(id))), [id]);

  return <View style={sessionStyles.stack}>
    <Button mode="outlined" icon="delete-outline" disabled={disabled || busy}
      contentStyle={sessionStyles.touch} onPress={() => {
        if (blocked.current || captureUploader.isBusy(id)) return;
        Alert.alert('¿Eliminar de Nexus?', 'Se borrará el original de este teléfono. Las copias exportadas o subidas se conservan.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: () => {
            if (blocked.current || captureUploader.isBusy(id)) { setNotice('Espera a que termine la operación en curso.'); return; }
            setNotice('');
            void removeCaptureFromNexus(id).then(onDeleted).catch((error: unknown) => {
              setNotice(error instanceof Error ? error.message : 'No se pudo eliminar el archivo.');
            });
          } },
        ]);
      }}>Eliminar de Nexus</Button>
    {!!notice && <Text variant="bodySmall" accessibilityLiveRegion="polite">{notice}</Text>}
  </View>;
}
