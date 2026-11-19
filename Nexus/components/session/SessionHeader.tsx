import { retainedVisibility } from '@/components/retainedVisibility';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Icon, Text, useTheme } from 'react-native-paper';

import { StudioShape, StudioSpacing, StudioUI } from '@/constants/studio-ui';
import { StudioStatus } from '@/components/studio/StudioStatus';

type Props = {
  sessionId: string;
  deviceId: string;
  code?: string;
  role?: 'Controller' | 'Node';
  compact?: boolean;
  connectionLabel: string;
  connected: boolean;
  notice: string;
  error: boolean;
  onRefresh(): void;
  onConnect(): void;
};

/** Snapshot presentation only; the route retains refresh, identity and verification. */
export function SessionHeader(props: Props) {
  const { colors, dark } = useTheme();
  const palette = StudioUI[dark ? 'dark' : 'light'];
  const [showDetails, setShowDetails] = useState(false);
  return <View style={styles.header}>
    <View style={styles.row}>
      <View style={styles.heading}>
        <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant, letterSpacing: 1.2 }}>SESIÓN</Text>
        <Text accessibilityRole="header" selectable variant={props.compact ? 'titleLarge' : 'headlineMedium'} style={props.code ? styles.code : undefined}>
          {props.code || 'NEXUS Studio'}
        </Text>
      </View>
      {props.role && <View style={[styles.role, { backgroundColor: colors.primaryContainer }]}>
        <Text variant="labelLarge" style={{ color: colors.onPrimaryContainer }}>{props.role}</Text>
      </View>}
    </View>
    <View style={styles.connection}>
      <Icon source={props.connected ? 'check-circle-outline' : 'connection'} size={18}
        color={props.connected ? palette.success : palette.warning} />
      <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>Relay · {props.connectionLabel}</Text>
    </View>
    <View style={props.compact && !showDetails ? styles.hidden : undefined}>
      {props.error ? <StudioStatus message={props.notice} error /> : <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{props.notice}</Text>}
    </View>
    <View style={styles.actions}>
      {(!props.compact || showDetails) && <Button mode="outlined" icon={props.connected ? 'refresh' : 'connection'}
        onPress={props.connected ? props.onRefresh : props.onConnect} contentStyle={styles.touch} style={styles.control}>
        {props.connected ? 'Actualizar sesión' : 'Conectar al relay'}
      </Button>}
      <Button mode="text" icon={showDetails ? 'chevron-up' : 'chevron-down'} onPress={() => setShowDetails((shown) => !shown)}
        accessibilityState={{ expanded: showDetails }} contentStyle={styles.touch}>{props.compact ? 'Conexión y sesión' : 'Identificadores'}</Button>
    </View>
    <View style={[styles.details, !showDetails && styles.hidden]} accessibilityElementsHidden={!showDetails}
      importantForAccessibility={showDetails ? 'auto' : 'no-hide-descendants'}>
      <Text selectable variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Session ID: {props.sessionId}</Text>
      <Text selectable variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Este dispositivo: {props.deviceId || 'Preparando identidad…'}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  header: { gap: StudioSpacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: StudioSpacing.md },
  heading: { gap: StudioSpacing.xs, flexShrink: 1 },
  code: { fontFamily: 'monospace', letterSpacing: 1.5 },
  role: { paddingHorizontal: StudioSpacing.md, paddingVertical: StudioSpacing.sm, borderRadius: 8 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: StudioSpacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: StudioSpacing.sm },
  touch: { minHeight: StudioShape.touchTarget },
  control: { borderRadius: StudioShape.control },
  details: { gap: StudioSpacing.sm },
  hidden: retainedVisibility(false),
});
