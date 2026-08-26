import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Vibration } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const RELAY_URL = 'ws://10.221.96.82:8080';
const MIN_REMOTE_VIBRATION_MS = 1;
const MAX_REMOTE_VIBRATION_MS = 10000;

type PhoneRole = 'A' | 'B';
type ConnectionStatus = 'Disconnected' | 'Connecting' | 'Connected' | 'Error';

type CapabilityCommand = {
  type: 'CAPABILITY_COMMAND';
  from: PhoneRole;
  target: PhoneRole;
  capability: 'vibration';
  action: 'vibrate';
  duration: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidCapabilityCommand(value: unknown): value is CapabilityCommand {
  return (
    isRecord(value) &&
    value.type === 'CAPABILITY_COMMAND' &&
    (value.from === 'A' || value.from === 'B') &&
    (value.target === 'A' || value.target === 'B') &&
    value.from !== value.target &&
    value.capability === 'vibration' &&
    value.action === 'vibrate' &&
    typeof value.duration === 'number' &&
    Number.isInteger(value.duration) &&
    value.duration >= MIN_REMOTE_VIBRATION_MS &&
    value.duration <= MAX_REMOTE_VIBRATION_MS
  );
}

export default function HomeScreen() {
  const [selectedRole, setSelectedRole] = useState<PhoneRole | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('Disconnected');
  const [lastEvent, setLastEvent] = useState('No events yet');
  const socketRef = useRef<WebSocket | null>(null);
  const selectedRoleRef = useRef<PhoneRole | null>(null);

  useEffect(() => {
    return () => {
      const socket = socketRef.current;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, []);

  const handleSelectRole = (role: PhoneRole) => {
    selectedRoleRef.current = role;
    setSelectedRole(role);
  };

  const executeRemoteVibration = (command: CapabilityCommand) => {
    Vibration.vibrate(command.duration);
    setLastEvent(`Remote vibration received from Phone ${command.from}`);
  };

  const handleReceivedMessage = (data: unknown) => {
    let receivedMessage: unknown;

    try {
      receivedMessage = JSON.parse(String(data));
    } catch {
      console.warn('Rejected WebSocket message: invalid JSON');
      return;
    }

    if (!isValidCapabilityCommand(receivedMessage)) {
      console.warn('Rejected WebSocket message: unrecognized or invalid command', receivedMessage);
      return;
    }

    const currentRole = selectedRoleRef.current;

    if (receivedMessage.target !== currentRole || receivedMessage.from === currentRole) {
      return;
    }

    executeRemoteVibration(receivedMessage);
  };

  const handleConnect = () => {
    const existingSocket = socketRef.current;

    if (existingSocket && existingSocket.readyState !== WebSocket.CLOSED) {
      return;
    }

    setConnectionStatus('Connecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(RELAY_URL);
    } catch {
      setConnectionStatus('Error');
      return;
    }

    socketRef.current = socket;

    socket.onopen = () => {
      if (socketRef.current === socket) {
        setConnectionStatus('Connected');
      }
    };

    socket.onmessage = (event) => {
      handleReceivedMessage(event.data);
    };

    socket.onerror = () => {
      if (socketRef.current === socket) {
        setConnectionStatus('Error');
      }
    };

    socket.onclose = () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
        setConnectionStatus('Disconnected');
      }
    };
  };

  const handleSendVibrationCommand = () => {
    const socket = socketRef.current;

    if (!selectedRole || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const target: PhoneRole = selectedRole === 'A' ? 'B' : 'A';
    const command: CapabilityCommand = {
      type: 'CAPABILITY_COMMAND',
      from: selectedRole,
      target,
      capability: 'vibration',
      action: 'vibrate',
      duration: 5000,
    };

    socket.send(JSON.stringify(command));
    setLastEvent(`Sent vibration command to Phone ${target}`);
  };

  const isConnecting = connectionStatus === 'Connecting';
  const isConnected = connectionStatus === 'Connected';
  const remoteRole: PhoneRole | null = selectedRole === 'A' ? 'B' : selectedRole === 'B' ? 'A' : null;
  const canSendVibrationCommand = selectedRole !== null && isConnected;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.demo}>
          <ThemedView style={styles.header}>
            <ThemedText type="title">NEXUS</ThemedText>
            <ThemedText style={styles.tagline}>Remote Capability Demo</ThemedText>
          </ThemedView>

          <ThemedView style={styles.section}>
            <ThemedText style={styles.label}>DEVICE</ThemedText>
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
                    PHONE {role}
                  </ThemedText>
                </Pressable>
              ))}
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.infoRow}>
            <ThemedView style={styles.infoPanel}>
              <ThemedText style={styles.label}>STATUS</ThemedText>
              <ThemedText style={styles.infoValue}>{connectionStatus}</ThemedText>
            </ThemedView>
            <ThemedView style={styles.infoPanel}>
              <ThemedText style={styles.label}>REMOTE DEVICE</ThemedText>
              <ThemedText style={styles.infoValue}>
                {remoteRole ? `Phone ${remoteRole}` : 'Not selected'}
              </ThemedText>
            </ThemedView>
          </ThemedView>

          <Pressable
            accessibilityRole="button"
            disabled={isConnecting || isConnected}
            onPress={handleConnect}
            style={({ pressed }) => [
              styles.connectButton,
              (isConnecting || isConnected) && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>
              {isConnected ? 'CONNECTED' : isConnecting ? 'CONNECTING...' : 'CONNECT'}
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={!canSendVibrationCommand}
            onPress={handleSendVibrationCommand}
            style={({ pressed }) => [
              styles.vibrateButton,
              !canSendVibrationCommand && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.vibrateButtonText}>
              {remoteRole ? `VIBRATE PHONE ${remoteRole}` : 'SELECT A DEVICE'}
            </ThemedText>
          </Pressable>

          <ThemedView style={styles.lastEvent}>
            <ThemedText style={styles.label}>LAST EVENT</ThemedText>
            <ThemedText style={styles.eventText}>{lastEvent}</ThemedText>
          </ThemedView>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 48,
  },
  demo: {
    alignSelf: 'center',
    gap: 28,
    maxWidth: 440,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    gap: 8,
  },
  tagline: {
    fontSize: 18,
    opacity: 0.7,
  },
  section: {
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    opacity: 0.55,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  roleButton: {
    alignItems: 'center',
    backgroundColor: '#687076',
    borderRadius: 12,
    flex: 1,
    paddingVertical: 14,
  },
  selectedRoleButton: {
    backgroundColor: '#0da13a',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  infoPanel: {
    borderColor: '#687076',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: 6,
    padding: 14,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  connectButton: {
    alignItems: 'center',
    backgroundColor: '#474fe7',
    borderRadius: 12,
    paddingVertical: 14,
  },
  vibrateButton: {
    alignItems: 'center',
    backgroundColor: '#eb3524',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  vibrateButtonText: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  buttonText: {
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  lastEvent: {
    borderColor: '#687076',
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingTop: 20,
  },
  eventText: {
    fontSize: 14,
    opacity: 0.75,
  },
});
