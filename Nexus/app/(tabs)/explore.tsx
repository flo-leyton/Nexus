import { Button, TextInput, useTheme, type MD3Theme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { onValue, ref } from 'firebase/database';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';

import { auth, database } from '@/config/firebase';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StudioIdentityPanel } from '@/components/StudioIdentityPanel';
import {
  loginUser,
  logoutUser,
  registerUser,
} from '@/services/authService';

type UserProfile = {
  email?: string;
  createdAt?: number | object;
  lastLoginAt?: number | object;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Ocurrió un error inesperado.';
}

export default function AccountScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors);
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(Boolean(auth));
  const [actionLoading, setActionLoading] = useState(false);
  const [collision, setCollision] = useState(false);
  const [message, setMessage] = useState(auth ? 'Firebase listo.' : 'Firebase no configurado. Studio requiere una identidad autenticada.');

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user || !database) {
      setProfile(null);
      return;
    }

    const userRef = ref(database, `users/${user.uid}`);

    const unsubscribe = onValue(
      userRef,
      (snapshot) => {
        setProfile(snapshot.exists() ? snapshot.val() : null);
      },
      (error) => {
        setMessage(`RTDB: ${error.message}`);
      },
    );

    return unsubscribe;
  }, [user]);

  const handleRegister = async () => {
    if (!email.trim() || !password) {
      setMessage('Ingresa email y contraseña.');
      return;
    }

    setActionLoading(true);
    setMessage('Creando cuenta...');

    try {
      await registerUser(email, password);
      setMessage('Cuenta creada y guardada en Realtime Database.');
    } catch (error) {
      setCollision(!!error && typeof error === 'object' && 'code' in error && error.code === 'STUDIO_ACCOUNT_COLLISION');
      setMessage(getErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogin = async (allowAccountChange = false) => {
    if (!email.trim() || !password) {
      setMessage('Ingresa email y contraseña.');
      return;
    }

    setActionLoading(true);
    setMessage('Iniciando sesión...');

    try {
      await loginUser(email, password, allowAccountChange);
      setCollision(false);
      setMessage('Sesión iniciada correctamente.');
    } catch (error) {
      setCollision(!!error && typeof error === 'object' && 'code' in error && error.code === 'STUDIO_ACCOUNT_COLLISION');
      setMessage(getErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = async () => {
    setActionLoading(true);

    try {
      await logoutUser();
      setMessage('Sesión cerrada.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText>Comprobando sesión de Firebase...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">NEXUS</ThemedText>
          <ThemedText style={styles.subtitle}>
            Cuenta e identidad
          </ThemedText>
        </ThemedView>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/notifications-test')}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <ThemedText style={[styles.buttonText, { color: colors.onSecondaryContainer }]}>
            Prueba de notificaciones
          </ThemedText>
        </Pressable>

        <Button mode="text" icon="information-outline" contentStyle={{ minHeight: 48 }} onPress={() => router.push('/modal')}>Diagnostico: modal heredado</Button>
        <StudioIdentityPanel />
        {(!user || user.isAnonymous) ? (
          <ThemedView style={styles.panel}>
            <ThemedText type="subtitle">Autenticación</ThemedText>
            {user?.isAnonymous && <ThemedText>Tu identidad Studio es anónima. Crear/vincular una cuenta nueva conserva el UID. Una cuenta existente requiere cambio y transferencia explícitos; no cierres esta app antes de resolverlo.</ThemedText>}

            <TextInput mode="outlined"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              label="Email" accessibilityLabel="Email"
              style={{ backgroundColor: colors.surface }}
              value={email}
            />

            <TextInput mode="outlined"
              autoCapitalize="none"
              onChangeText={setPassword}
              label="Contraseña" accessibilityLabel="Contraseña"
              secureTextEntry
              style={{ backgroundColor: colors.surface }}
              value={password}
            />

            <Pressable
              disabled={actionLoading}
              onPress={handleRegister}
              style={({ pressed }) => [
                styles.primaryButton,
                actionLoading && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <ThemedText
                style={[styles.buttonText, { color: colors.onPrimary }]}>
                CREAR CUENTA
              </ThemedText>
            </Pressable>

            <Pressable
              disabled={actionLoading}
              onPress={() => void handleLogin()}
              style={({ pressed }) => [
                styles.secondaryButton,
                actionLoading && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <ThemedText
                style={[styles.buttonText, { color: colors.onSecondaryContainer }]}>
                INICIAR SESIÓN
              </ThemedText>
            </Pressable>
            {collision && <Pressable disabled={actionLoading} onPress={() => void handleLogin(true)} style={styles.secondaryButton}>
              <ThemedText>CONFIRMAR CAMBIO A CUENTA EXISTENTE · después autorizar transferencia</ThemedText>
            </Pressable>}
          </ThemedView>
        ) : (
          <ThemedView style={styles.panel}>
            <ThemedText type="subtitle">
              Usuario autenticado
            </ThemedText>

            <ThemedView style={styles.infoBox}>
              <ThemedText style={styles.label}>
                EMAIL
              </ThemedText>

              <ThemedText>
                {user.email ?? 'Sin email'}
              </ThemedText>

              <ThemedText style={styles.label}>
                FIREBASE UID
              </ThemedText>

              <ThemedText selectable style={styles.uid}>
                {user.uid}
              </ThemedText>
            </ThemedView>

            <ThemedView style={styles.infoBox}>
              <ThemedText style={styles.label}>
                REALTIME DATABASE
              </ThemedText>

              <ThemedText>
                {profile
                  ? 'Registro encontrado en users/{uid}'
                  : 'Esperando registro...'}
              </ThemedText>

              {profile?.email && (
                <ThemedText>
                  Email almacenado: {profile.email}
                </ThemedText>
              )}
            </ThemedView>

            <Pressable
              disabled={actionLoading}
              onPress={handleLogout}
              style={({ pressed }) => [
                styles.logoutButton,
                actionLoading && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <ThemedText
                style={[styles.buttonText, { color: colors.onError }]}>
                CERRAR SESIÓN
              </ThemedText>
            </Pressable>
          </ThemedView>
        )}

        <ThemedView style={styles.status}>
          <ThemedText style={styles.label}>
            ESTADO
          </ThemedText>

          <ThemedText>{message}</ThemedText>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const createStyles = (colors: MD3Theme['colors']) => StyleSheet.create({
  container: {
    flex: 1,
  },

  loading: {
    alignItems: 'center',
    flex: 1,
    gap: 16,
    justifyContent: 'center',
  },

  content: {
    alignSelf: 'center',
    gap: 28,
    maxWidth: 480,
    padding: 24,
    paddingBottom: 48,
    paddingTop: 60,
    width: '100%',
  },

  header: {
    alignItems: 'center',
    gap: 8,
  },

  subtitle: {
    fontSize: 16,
    opacity: 0.65,
  },

  panel: {
    gap: 16,
  },

  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#9CA3AF',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    color: '#111827',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
  },

  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.secondaryContainer,
    borderRadius: 12,
    paddingVertical: 15,
  },

  logoutButton: {
    alignItems: 'center',
    backgroundColor: colors.error,
    borderRadius: 12,
    paddingVertical: 15,
  },

  buttonText: {
    fontWeight: '700',
  },

  disabled: {
    opacity: 0.45,
  },

  pressed: {
    opacity: 0.75,
  },

  infoBox: {
    borderColor: colors.outlineVariant,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 16,
  },

  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    opacity: 0.55,
  },

  uid: {
    fontSize: 12,
    opacity: 0.75,
  },

  status: {
    borderColor: '#687076',
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingTop: 20,
  },
});
