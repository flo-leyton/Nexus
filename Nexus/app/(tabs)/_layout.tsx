import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { StudioUI } from '@/constants/studio-ui';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  const mode = colorScheme === 'dark' ? 'dark' : 'light';
  const palette = StudioUI[mode];

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarButton: HapticTab,
      tabBarActiveTintColor: Colors[mode].tint,
      tabBarInactiveTintColor: palette.muted,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      tabBarStyle: {
        backgroundColor: palette.surface,
        borderTopColor: palette.border,
        borderTopWidth: 1,
        elevation: 0,
      },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Studio', tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} /> }} />
      <Tabs.Screen name="dispositivos" options={{ title: 'Dispositivos', tabBarIcon: ({ color }) => <IconSymbol size={28} name="iphone" color={color} /> }} />
      <Tabs.Screen name="medios" options={{ title: 'Medios', tabBarIcon: ({ color }) => <IconSymbol size={28} name="chevron.left.forwardslash.chevron.right" color={color} /> }} />
      <Tabs.Screen name="explore" options={{ title: 'Cuenta', tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} /> }} />
      <Tabs.Screen name="vibracion" options={{ href: null }} />
      <Tabs.Screen name="linterna" options={{ href: null }} />
    </Tabs>
  );
}
