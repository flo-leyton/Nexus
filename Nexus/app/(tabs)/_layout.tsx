import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint, headerShown: false, tabBarButton: HapticTab }}>
      <Tabs.Screen name="index" options={{ title: 'Studio', tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} /> }} />
      <Tabs.Screen name="dispositivos" options={{ title: 'Dispositivos', tabBarIcon: ({ color }) => <IconSymbol size={28} name="iphone" color={color} /> }} />
      <Tabs.Screen name="medios" options={{ title: 'Medios', tabBarIcon: ({ color }) => <IconSymbol size={28} name="chevron.left.forwardslash.chevron.right" color={color} /> }} />
      <Tabs.Screen name="explore" options={{ title: 'Cuenta', tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} /> }} />
      <Tabs.Screen name="vibracion" options={{ href: null }} />
      <Tabs.Screen name="linterna" options={{ href: null }} />
    </Tabs>
  );
}
