import { StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { StudioShape, StudioSpacing } from '@/constants/studio-ui';

/** Persistent feedback, not a timed snackbar: operational errors stay readable. */
export function StudioStatus({ message, error = false }: { message: string; error?: boolean }) {
  const { colors } = useTheme();
  return (
    <View accessibilityLiveRegion="polite" style={[styles.container, {
      backgroundColor: error ? colors.errorContainer : colors.surfaceVariant,
    }]}>
      <Icon source={error ? 'alert-circle-outline' : 'information-outline'} size={20}
        color={error ? colors.onErrorContainer : colors.onSurfaceVariant} />
      <Text variant="bodyMedium" style={[styles.message, { color: error ? colors.onErrorContainer : colors.onSurfaceVariant }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: StudioShape.control, padding: StudioSpacing.md, flexDirection: 'row', gap: StudioSpacing.sm, alignItems: 'flex-start' },
  message: { flex: 1, flexShrink: 1 },
});
