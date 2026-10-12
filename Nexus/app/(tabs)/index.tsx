import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function StudioScreen() {
  const insets = useSafeAreaInsets();

  const createDemoSession = () => {
    router.push(`/session/studio-${Date.now()}` as Href);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 48 }]}>
        <ThemedView style={styles.hero}>
          <ThemedText style={styles.eyebrow}>NEXUS</ThemedText>
          <ThemedText type="title" style={styles.title}>NEXUS STUDIO</ThemedText>
          <ThemedText style={styles.tagline}>Un estudio de grabación para el bolsillo.</ThemedText>
        </ThemedView>
        <ThemedView style={styles.model}>
          <ThemedText type="subtitle">Controller + Nodes + Session</ThemedText>
          <ThemedText style={styles.description}>Esta demostración crea una sesión local y permite importar medios al catálogo de Studio.</ThemedText>
        </ThemedView>
        <Pressable onPress={createDemoSession} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <ThemedText lightColor="#FFFFFF" darkColor="#FFFFFF" style={styles.buttonText}>NUEVA SESIÓN</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignSelf: 'center', flexGrow: 1, gap: 32, justifyContent: 'center', maxWidth: 560, padding: 24, paddingBottom: 64, width: '100%' },
  hero: { gap: 12 },
  eyebrow: { fontSize: 13, fontWeight: '800', letterSpacing: 4, opacity: 0.55 },
  title: { fontSize: 40, lineHeight: 44 },
  tagline: { fontSize: 22, lineHeight: 30, opacity: 0.76 },
  model: { borderColor: '#687076', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 20 },
  description: { opacity: 0.72 },
  button: { alignItems: 'center', backgroundColor: '#474FE7', borderRadius: 16, padding: 18 },
  buttonText: { fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  pressed: { opacity: 0.78 },
});
