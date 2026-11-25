import { nativeApplicationVersion, nativeBuildVersion } from 'expo-application';
import Constants from 'expo-constants';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AboutNexusScreen() {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const version = nativeApplicationVersion ?? Constants.expoConfig?.version;

  return (
    <ScrollView style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: bottom + 24 }]}>
      <View style={styles.header}>
        <Image source={require('../assets/nexus-official/adaptive-icon.png')}
          resizeMode="contain" accessible={false} style={styles.logo} />
        <Text accessibilityRole="header" variant="headlineMedium" style={styles.center}>NEXUS Studio</Text>
        <Text variant="titleMedium" style={styles.center}>Un estudio de grabación para el bolsillo.</Text>
      </View>
      <Text variant="bodyLarge">
        Creemos que crear contenido no debería depender de tener más equipos, sino de aprovechar mejor los que ya tenemos.
      </Text>
      <Text variant="bodyLarge">
        NEXUS transforma varios teléfonos en un sistema de grabación multicámara, coordinado desde una sola pantalla.
      </Text>
      <Text variant="bodyMedium">Desarrollado por Florencia Leytón &amp; Rafael Stoessel.</Text>
      {(version || nativeBuildVersion) && <View style={styles.metadata}>
        {!!version && <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Versión {version}</Text>}
        {!!nativeBuildVersion && <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Compilación {nativeBuildVersion}</Text>}
      </View>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 24, gap: 20 },
  header: { alignItems: 'center', gap: 8 },
  logo: { width: 112, height: 112 },
  center: { textAlign: 'center' },
  metadata: { gap: 4 },
});
