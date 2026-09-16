import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DEVICE_FIELDS, type DeviceInfo } from '@/services/deviceProtocol';

const sections: { title: string; fields: (keyof DeviceInfo)[] }[] = [
  { title: 'Identificación', fields: ['brand', 'manufacturer', 'model', 'name', 'kind'] },
  { title: 'Sistema', fields: ['os', 'version', 'api', 'architecture'] },
  { title: 'Hardware', fields: ['ram', 'storage', 'free', 'screen'] },
  { title: 'Estado', fields: ['battery', 'charging', 'network'] },
  { title: 'Capacidades', fields: ['frontCamera', 'backCamera', 'flash', 'vibration'] },
];

export function DeviceInfoCard({ title, info, status, connected }: {
  title: string; info: DeviceInfo; status: string; connected: boolean;
}) {
  return (
    <ThemedView style={styles.card}>
      <ThemedText type="subtitle">{title}</ThemedText>
      <ThemedText type="defaultSemiBold">{info.model ?? info.name ?? 'Dispositivo'}</ThemedText>
      <ThemedText>Rol: {info.role ?? 'Sin seleccionar'}</ThemedText>
      <ThemedText style={{ color: connected ? '#0da13a' : '#a65b50' }}>WebSocket: {status}</ThemedText>
      {!connected && title === 'Dispositivo remoto' && <ThemedText>Última información recibida</ThemedText>}
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <ThemedText type="defaultSemiBold">{section.title}</ThemedText>
          {section.fields.filter((field) => field !== 'api' || info.api !== null).map((field) => (
            <View key={field} style={styles.row}>
              <ThemedText style={styles.label}>{DEVICE_FIELDS[field]}</ThemedText>
              <ThemedText style={styles.value}>{info[field] ?? 'No disponible'}</ThemedText>
            </View>
          ))}
        </View>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#687076', borderRadius: 16, padding: 20, gap: 8 },
  section: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#687076', marginTop: 8, paddingTop: 12, gap: 8 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  label: { flex: 1, opacity: 0.65 },
  value: { flex: 1, textAlign: 'right' },
});
