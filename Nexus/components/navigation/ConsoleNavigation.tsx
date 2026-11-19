import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { View, useWindowDimensions } from 'react-native';
import { Icon, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const consoleDestinations = [
  { name: 'index', label: 'Studio', icon: 'video-outline' },
  { name: 'medios', label: 'Biblioteca', icon: 'folder-play-outline' },
  { name: 'dispositivos', label: 'Dispositivos', icon: 'devices' },
  { name: 'explore', label: 'Cuenta', icon: 'account-circle-outline' },
];
export function ConsoleNavigation({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const rail = useWindowDimensions().width >= 840;
  return <View accessibilityRole="tablist" accessibilityLabel="Navegación principal" style={{
    flexDirection: rail ? 'column' : 'row', backgroundColor: colors.surface,
    borderTopWidth: rail ? 0 : 1, borderRightWidth: rail ? 1 : 0, borderColor: colors.outlineVariant,
    paddingBottom: insets.bottom + 8, paddingTop: rail ? insets.top + 20 : 8,
    paddingLeft: rail ? insets.left + 8 : insets.left, paddingRight: rail ? 8 : insets.right,
    width: rail ? 132 + insets.left : undefined, gap: rail ? 12 : 0,
  }}>
    {consoleDestinations.map(item => {
      const route = state.routes.find(r => r.name === item.name);
      if (!route) return null;
      const focused = state.routes[state.index]?.key === route.key;
      const selected = focused || (item.name === 'dispositivos' && ['linterna', 'vibracion'].includes(state.routes[state.index]?.name));
      const color = selected ? colors.onSecondaryContainer : colors.onSurfaceVariant;
      return <TouchableRipple key={route.key} accessibilityRole="tab" accessibilityLabel={item.label}
        accessibilityState={{ selected }} onPressIn={() => { if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }} onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        style={{ flex: rail ? undefined : 1, minHeight: 64, borderRadius: 16 }}>
        <View style={{ alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6, minHeight: 64 }}>
          <View style={{ borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4,
            backgroundColor: selected ? colors.secondaryContainer : 'transparent' }}><Icon source={item.icon} size={24} color={color} /></View>
          <Text variant="labelMedium" style={{ color, textAlign: 'center' }}>{item.label}</Text>
        </View>
      </TouchableRipple>;
    })}
  </View>;
}
