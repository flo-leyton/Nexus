import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { PaperProvider } from 'react-native-paper';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { NexusNavigationTheme, NexusPaperTheme } from '@/constants/paper-theme';
import { startDevicePresence } from '@/services/devicePresence';
import { testFirebaseInitialization } from '@/services/firebaseTest';
import { setupNotificationHandler } from '@/services/notifications';
export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const mode = colorScheme === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    // Registration errors are displayed by the diagnostic screen, without logging tokens.
    void setupNotificationHandler().catch(() => {});
  }, []);
  
  useEffect(() => {
  const stopDevicePresence = startDevicePresence();

  testFirebaseInitialization();

  return stopDevicePresence;
}, []);

  return (
    <PaperProvider theme={NexusPaperTheme[mode]}>
      <ThemeProvider value={NexusNavigationTheme[mode]}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="session/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="media/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="acerca-de-nexus" options={{ title: 'Acerca de Nexus' }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    </PaperProvider>
  );
}
