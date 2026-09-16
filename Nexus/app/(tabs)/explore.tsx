import { onAuthStateChanged, type User } from 'firebase/auth';
import { onValue, ref } from 'firebase/database';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  loginUser,
  logoutUser,
  registerUser,
} from '@/services/authService';
import { auth, database } from '@/services/firebase';

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
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState('Firebase listo.');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
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
      setMessage(getErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setMessage('Ingresa email y contraseña.');
      return;
    }

    setActionLoading(true);
    setMessage('Iniciando sesión...');

    try {
      await loginUser(email, password);
      setMessage('Sesión iniciada correctamente.');
    } catch (error) {
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
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">NEXUS</ThemedText>
          <ThemedText style={styles.subtitle}>
            Firebase Account
          </ThemedText>
        </ThemedView>

        {!user ? (
          <ThemedView style={styles.panel}>
            <ThemedText type="subtitle">Autenticación</ThemedText>

            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              style={styles.input}
              value={email}
            />

            <TextInput
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder="Contraseña"
              secureTextEntry
              style={styles.input}
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
                lightColor="#FFFFFF"
                darkColor="#FFFFFF"
                style={styles.buttonText}>
                CREAR CUENTA
              </ThemedText>
            </Pressable>

            <Pressable
              disabled={actionLoading}
              onPress={handleLogin}
              style={({ pressed }) => [
                styles.secondaryButton,
                actionLoading && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <ThemedText
                lightColor="#FFFFFF"
                darkColor="#FFFFFF"
                style={styles.buttonText}>
                INICIAR SESIÓN
              </ThemedText>
            </Pressable>
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
                lightColor="#FFFFFF"
                darkColor="#FFFFFF"
                style={styles.buttonText}>
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

const styles = StyleSheet.create({
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
    backgroundColor: '#474fe7',
    borderRadius: 12,
    paddingVertical: 15,
  },

  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#48525a',
    borderRadius: 12,
    paddingVertical: 15,
  },

  logoutButton: {
    alignItems: 'center',
    backgroundColor: '#b42318',
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
    borderColor: '#687076',
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