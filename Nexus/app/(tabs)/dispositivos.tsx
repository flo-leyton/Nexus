import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  useFocusEffect(useCallback(() => { void refreshDeviceInfo(); }, []));
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}>
        <ThemedText type="title">Dispositivos</ThemedText>
        <ThemedText>Información local y del otro teléfono conectado.</ThemedText>
        <Pressable accessibilityRole="button" onPress={() => void refreshDeviceInfo()} style={styles.button}>
          <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">Actualizar información</ThemedText>
        </Pressable>
        {connection !== 'Connected' && (
          <Pressable accessibilityRole="button" disabled={connection === 'Connecting'} onPress={connectSocket} style={styles.button}>
            <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF">{connection === 'Connecting' ? 'Conectando...' : 'Conectar'}</ThemedText>
          </Pressable>
        )}
        {local ? <DeviceInfoCard title="Dispositivo local" info={local} status={statuses[connection]} connected={connection === 'Connected'} /> :
          <ThemedText>Obteniendo información...</ThemedText>}
        {remote ? <DeviceInfoCard title="Dispositivo remoto" info={remote} status={remoteState === 'connected' ? 'Conectado' : 'Dispositivo remoto desconectado'} connected={remoteState === 'connected'} /> :
          <ThemedView style={styles.waiting}>
            <ThemedText type="subtitle">Dispositivo remoto</ThemedText>
            <ThemedText>Esperando otro dispositivo...</ThemedText>
          </ThemedView>}
        <ThemedText style={styles.note}>Los roles se seleccionan en Vibración y Linterna. Si son distintos, se muestran por separado. Los datos se actualizan al abrir esta pestaña y cada 30 segundos mientras la aplicación está activa y conectada.</ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 48, gap: 20, maxWidth: 560, width: '100%', alignSelf: 'center' },
  button: { backgroundColor: '#474fe7', borderRadius: 12, alignItems: 'center', padding: 14 },
  waiting: { padding: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: '#687076', borderRadius: 16, gap: 12 },
  note: { fontSize: 13, opacity: 0.65 },
});
