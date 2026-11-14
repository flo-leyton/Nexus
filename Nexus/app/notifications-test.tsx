import * as Device from 'expo-device';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  getEasProjectId,
  getNotificationPermissionStatus,
  registerForPushNotifications,
  type PushRegistrationResult,
} from '@/services/notifications';

export default function NotificationsTestScreen() {
  const [permission, setPermission] = useState('Sin comprobar');
  const [result, setResult] = useState<PushRegistrationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const registering = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const refreshPermission = async () => {
      try {
        const current = await getNotificationPermissionStatus();
        if (mounted.current) {
          setPermission(current.status);
          setPermissionError(null);
        }
      } catch {
        if (mounted.current) {
          setPermission('No disponible');
          setPermissionError('Para comprobar permisos, abre esta prueba en un Development Build Android.');
        }
      }
    };
    void refreshPermission();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !registering.current) void refreshPermission();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, []);

  const register = async () => {
    if (registering.current) return;
    registering.current = true;
    setBusy(true);
    setResult(null);
    setPermissionError(null);
    try {
      const registration = await registerForPushNotifications();
      if (mounted.current) {
        setResult(registration);
        if (registration.permission) setPermission(registration.permission.status);
      }
    } finally {
      registering.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Prueba Push / FCM' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title">NEXUS Studio</ThemedText>
        <ThemedText type="subtitle">Prueba Push / FCM</ThemedText>
        <ThemedText>Plataforma: {Platform.OS}</ThemedText>
        <ThemedText>Dispositivo físico: {Device.isDevice ? 'Sí' : 'No'}</ThemedText>
        <ThemedText>Estado de permisos: {permission}</ThemedText>
        <ThemedText>EAS Project ID: {getEasProjectId() ? 'Encontrado' : 'No encontrado'}</ThemedText>
        <ThemedText>Estado de registro: {busy ? 'Registrando…' : result?.status ?? 'Sin registrar'}</ThemedText>
        <Pressable accessibilityRole="button" disabled={busy} onPress={register}
          style={[styles.button, busy && styles.disabled]}>
          <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" type="defaultSemiBold">
            {busy ? 'REGISTRANDO…' : 'REGISTRAR DISPOSITIVO'}
          </ThemedText>
        </Pressable>
        <ThemedText type="subtitle">Expo Push Token</ThemedText>
        <ThemedText selectable style={styles.token}>{result?.expoPushToken ?? 'No obtenido'}</ThemedText>
        <ThemedText type="subtitle">Native FCM Token</ThemedText>
        <ThemedText selectable style={styles.token}>{result?.nativePushToken ?? 'No obtenido'}</ThemedText>
        
        <ThemedText style={result?.error || permissionError ? styles.error : undefined}>
          Error actual: {result?.error ?? permissionError ?? 'Ninguno'}
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignSelf: 'center', gap: 16, maxWidth: 680, padding: 24, paddingBottom: 64, width: '100%' },
  button: { alignItems: 'center', backgroundColor: '#474FE7', borderRadius: 12, padding: 16 },
  disabled: { opacity: 0.5 },
  token: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 },
  error: { color: '#D92D20' },
});
