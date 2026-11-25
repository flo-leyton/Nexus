import { Button } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StudioUI } from '@/constants/studio-ui';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { DeviceInfoCard } from '@/components/DeviceInfoCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useDeviceInfo } from '@/hooks/useDeviceInfo';
import { refreshDeviceInfo } from '@/services/devicePresence';
import { connectSocket } from '@/services/socket';

const statuses = { Connected: 'Conectado', Disconnected: 'Desconectado', Connecting: 'Conectando...', Error: 'Error de conexión' };

export default function DevicesScreen() {
  const { local, remote, remoteState, connection } = useDeviceInfo();
  const insets = useSafeAreaInsets();
  const palette = StudioUI[useColorScheme() === 'dark' ? 'dark' : 'light'];
  useFocusEffect(useCallback(() => { void refreshDeviceInfo(); }, []));
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}>
        <ThemedText type="title">Dispositivos</ThemedText>
        <ThemedText>Este telefono y el ultimo remoto observado. No es un inventario de todos los Nodes.</ThemedText>
        <Button mode="contained" icon="refresh" contentStyle={{ minHeight: 48 }} onPress={() => void refreshDeviceInfo()}>Actualizar informacion</Button>
        {connection !== 'Connected' && <Button mode="outlined" icon="connection" contentStyle={{ minHeight: 48 }} disabled={connection === 'Connecting'} onPress={connectSocket}>{connection === 'Connecting' ? 'Conectando...' : 'Conectar'}</Button>}
        {local ? <DeviceInfoCard title="Dispositivo local" info={local} status={statuses[connection]} connected={connection === 'Connected'} /> :
          <ThemedText>Obteniendo información...</ThemedText>}
        {remote ? <DeviceInfoCard title="Dispositivo remoto" info={remote} status={remoteState === 'connected' ? 'Conectado' : 'Dispositivo remoto desconectado'} connected={remoteState === 'connected'} /> :
          <ThemedView style={[styles.waiting, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <ThemedText type="subtitle">Dispositivo remoto</ThemedText>
            <ThemedText>Esperando otro dispositivo...</ThemedText>
          </ThemedView>}
        <ThemedText style={styles.note}>La informacion se actualiza al abrir esta pantalla y cada 30 segundos mientras la app esta activa y conectada.</ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 56, gap: 16, maxWidth: 560, width: '100%', alignSelf: 'center' },
  button: { borderRadius: 14, alignItems: 'center', padding: 16, minHeight: 52 },
  waiting: { padding: 20, borderWidth: 1, borderRadius: 20, gap: 12 },
  note: { fontSize: 13, opacity: 0.65 },
});
