import { Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { ConsoleNavigation } from '@/components/navigation/ConsoleNavigation';

export default function TabLayout() {
  const rail = useWindowDimensions().width >= 840;
  return <Tabs tabBar={props => <ConsoleNavigation {...props} />} screenOptions={{
    headerShown: false, tabBarPosition: rail ? 'left' : 'bottom',
  }}>
    <Tabs.Screen name="index" options={{ title: 'Studio' }} />
    <Tabs.Screen name="medios" options={{ title: 'Biblioteca' }} />
    <Tabs.Screen name="dispositivos" options={{ title: 'Dispositivos' }} />
    <Tabs.Screen name="explore" options={{ title: 'Cuenta' }} />
    <Tabs.Screen name="vibracion" options={{ href: null }} />
    <Tabs.Screen name="linterna" options={{ href: null }} />
  </Tabs>;
}
