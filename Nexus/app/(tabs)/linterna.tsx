import { useIsFocused } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { reportDeviceRole } from '@/services/devicePresence';
import {
  connectSocket,
  ConnectionStatus,
  sendSocketMessage,
  subscribeToSocketMessages,
  subscribeToSocketStatus,
} from '@/services/socket';

type PhoneRole = 'A' | 'B';

type FlashlightCommand = {
  type: 'CAPABILITY_COMMAND';
  from: 'A';
  target: 'B';
  capability: 'flashlight';
  action: 'flash_on' | 'flash_off';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFlashlightCommand(value: unknown): value is FlashlightCommand {
  return (
    isRecord(value) &&
    value.type === 'CAPABILITY_COMMAND' &&
    value.from === 'A' &&
    value.target === 'B' &&
    value.capability === 'flashlight' &&
    (value.action === 'flash_on' || value.action === 'flash_off')
  );
}

export default function FlashlightScreen() {
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedRole, setSelectedRole] = useState<PhoneRole | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('Disconnected');
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [message, setMessage] = useState('Selecciona el teléfono que estás usando.');
  const selectedRoleRef = useRef<PhoneRole | null>(null);
  const permissionGrantedRef = useRef(false);

  useEffect(() => {
    permissionGrantedRef.current = permission?.granted ?? false;
  }, [permission?.granted]);

  useEffect(() => {
    const unsubscribeStatus = subscribeToSocketStatus(setConnectionStatus);
    const unsubscribeMessages = subscribeToSocketMessages(handleReceivedMessage);

    return () => {
      unsubscribeStatus();
      unsubscribeMessages();
    };
  }, []);

  useEffect(() => {
    if (!isFocused || selectedRole !== 'B') {
      setTorchEnabled(false);
      setCameraReady(false);
    }
  }, [isFocused, selectedRole]);

  const handleReceivedMessage = (data: unknown) => {
    let receivedMessage: unknown;

    try {
      receivedMessage = JSON.parse(String(data));
    } catch {
      return;
    }

    if (!isFlashlightCommand(receivedMessage) || selectedRoleRef.current !== 'B') {
      return;
    }

    if (!permissionGrantedRef.current) {
      setMessage('Comando recibido, pero debes conceder permiso de cámara primero.');
      return;
    }

    const shouldEnableTorch = receivedMessage.action === 'flash_on';
    setTorchEnabled(shouldEnableTorch);
    setMessage(
      shouldEnableTorch
        ? 'Comando flash_on recibido del Teléfono A.'
        : 'Comando flash_off recibido del Teléfono A.',
    );
  };

  const handleSelectRole = (role: PhoneRole) => {
    reportDeviceRole('flashlight', role);
    selectedRoleRef.current = role;
    setSelectedRole(role);
    setTorchEnabled(false);
    setMessage(
      role === 'A'
        ? 'Listo para controlar la linterna del Teléfono B.'
        : 'Concede el permiso y conecta para recibir comandos.',
    );
  };

  const handleRemoteCommand = (action: FlashlightCommand['action']) => {
    const command: FlashlightCommand = {
      type: 'CAPABILITY_COMMAND',
      from: 'A',
      target: 'B',
      capability: 'flashlight',
      action,
    };

    if (sendSocketMessage(command)) {
      setMessage(`${action} enviado al Teléfono B.`);
    } else {
      setMessage('WebSocket desconectado. Pulsa CONECTAR e inténtalo otra vez.');
    }
  };

  const handleManualTorch = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setMessage('No se concedió el permiso de cámara.');
        return;
      }
    }

    setTorchEnabled((current) => !current);
    setMessage('Prueba manual de linterna actualizada.');
  };

  const isConnected = connectionStatus === 'Connected';
  const isConnecting = connectionStatus === 'Connecting';
  const shouldMountCamera =
    isFocused && selectedRole === 'B' && permission?.granted === true;

  return (
    <ThemedView style={styles.container}>
      {shouldMountCamera && (
        <CameraView
          enableTorch={torchEnabled}
          facing="back"
          onCameraReady={() => {
            setCameraReady(true);
            setMessage('Cámara trasera lista para usar la linterna.');
          }}
          onMountError={(error) => {
            setCameraReady(false);
            setTorchEnabled(false);
            setMessage(`No se pudo iniciar la cámara trasera: ${error.message}`);
          }}
          style={styles.hiddenCamera}
        />
      )}

      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.panel}>
          <ThemedView style={styles.header}>
            <ThemedText type="title">Control de Linterna</ThemedText>
            <ThemedText style={styles.subtitle}>Control remoto mediante WebSocket</ThemedText>
          </ThemedView>

          <ThemedView style={styles.section}>
            <ThemedText style={styles.label}>SELECCIONA TU TELÉFONO</ThemedText>
            <ThemedView style={styles.roleRow}>
              {(['A', 'B'] as const).map((role) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedRole === role }}
                  key={role}
                  onPress={() => handleSelectRole(role)}
                  style={({ pressed }) => [
                    styles.roleButton,
                    selectedRole === role && styles.selectedRoleButton,
                    pressed && styles.buttonPressed,
                  ]}>
                  <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>
                    TELÉFONO {role}
                  </ThemedText>
                </Pressable>
              ))}
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.infoPanel}>
            <ThemedText>Rol actual: {selectedRole ? `Teléfono ${selectedRole}` : 'Sin seleccionar'}</ThemedText>
            <ThemedText>WebSocket: {connectionStatus}</ThemedText>
            <ThemedText>Linterna: {torchEnabled ? 'Encendida' : 'Apagada'}</ThemedText>
          </ThemedView>

          <Pressable
            accessibilityRole="button"
            disabled={isConnecting || isConnected}
            onPress={connectSocket}
            style={({ pressed }) => [
              styles.connectButton,
              (isConnecting || isConnected) && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>
              {isConnected ? 'CONECTADO' : isConnecting ? 'CONECTANDO...' : 'CONECTAR'}
            </ThemedText>
          </Pressable>

          {selectedRole === 'A' && (
            <ThemedView style={styles.section}>
              <ThemedText style={styles.label}>CONTROL REMOTO DEL TELÉFONO B</ThemedText>
              <Pressable
                accessibilityRole="button"
                disabled={!isConnected}
                onPress={() => handleRemoteCommand('flash_on')}
                style={({ pressed }) => [
                  styles.onButton,
                  !isConnected && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}>
                <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.actionText}>
                  ENCENDER
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!isConnected}
                onPress={() => handleRemoteCommand('flash_off')}
                style={({ pressed }) => [
                  styles.offButton,
                  !isConnected && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}>
                <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.actionText}>
                  APAGAR
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}

          {selectedRole === 'B' && (
            <ThemedView style={styles.section}>
              <ThemedText style={styles.label}>TELÉFONO B</ThemedText>
              <ThemedText>
                {isConnected ? 'Esperando comandos del Teléfono A...' : 'Conecta el WebSocket para escuchar comandos.'}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={handleManualTorch}
                style={({ pressed }) => [styles.manualButton, pressed && styles.buttonPressed]}>
                <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>
                  {torchEnabled ? 'APAGAR PRUEBA MANUAL' : 'PROBAR LINTERNA'}
                </ThemedText>
              </Pressable>
              {permission?.granted && !cameraReady && (
                <ThemedText style={styles.warning}>Preparando la cámara trasera...</ThemedText>
              )}
              {permission && !permission.granted && !permission.canAskAgain && (
                <ThemedText style={styles.warning}>
                  Activa el permiso de cámara desde los ajustes del dispositivo.
                </ThemedText>
              )}
            </ThemedView>
          )}

          <ThemedView style={styles.eventPanel}>
            <ThemedText style={styles.label}>ESTADO</ThemedText>
            <ThemedText style={styles.eventText}>{message}</ThemedText>
          </ThemedView>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 48 },
  panel: { alignSelf: 'center', gap: 24, maxWidth: 440, width: '100%' },
  header: { alignItems: 'center', gap: 8 },
  subtitle: { fontSize: 16, opacity: 0.7 },
  section: { gap: 12 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, opacity: 0.55 },
  roleRow: { flexDirection: 'row', gap: 12 },
  roleButton: { alignItems: 'center', backgroundColor: '#687076', borderRadius: 12, flex: 1, paddingVertical: 14 },
  selectedRoleButton: { backgroundColor: '#0da13a' },
  infoPanel: { borderColor: '#687076', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: 8, padding: 14 },
  connectButton: { alignItems: 'center', backgroundColor: '#474fe7', borderRadius: 12, paddingVertical: 14 },
  onButton: { alignItems: 'center', backgroundColor: '#e59b18', borderRadius: 14, paddingVertical: 18 },
  offButton: { alignItems: 'center', backgroundColor: '#48525a', borderRadius: 14, paddingVertical: 18 },
  manualButton: { alignItems: 'center', backgroundColor: '#e59b18', borderRadius: 12, paddingVertical: 15 },
  actionText: { fontSize: 17, fontWeight: '800' },
  buttonText: { fontWeight: '700' },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.4 },
  eventPanel: { borderColor: '#687076', borderTopWidth: StyleSheet.hairlineWidth, gap: 8, paddingTop: 18 },
  eventText: { fontSize: 14, opacity: 0.75 },
  warning: { color: '#d97706', fontSize: 13 },
  hiddenCamera: { height: 1, opacity: 0.01, position: 'absolute', width: 1 },
});
