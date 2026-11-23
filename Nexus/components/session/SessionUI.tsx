import { retainedVisibility } from '@/components/retainedVisibility';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Icon, Portal, Surface, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StudioShape, StudioUI } from '@/constants/studio-ui';
import type { SessionState } from '@/services/sessionProtocol';

export const sessionStateLabel: Record<SessionState, string> = { draft: 'Borrador', joining: 'Ingreso de Nodes', preparing: 'Preparación',
  ready: 'Preparada', recording: 'Grabación', finishing: 'Finalizando', completed: 'Completada', failed: 'Con fallos', closed: 'Cerrada' };

export const sessionStyles = StyleSheet.create({
  stack: { gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  between: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  control: { borderRadius: StudioShape.control },
  touch: { minHeight: StudioShape.touchTarget },
  flex: { flex: 1, minWidth: 120 },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, overflow: 'hidden' },
});
const DockContext = createContext({ height: 0, setHeight: (_height: number) => {} });

/** Only layout state. Children keep stable owners while the dock changes height. */
export function SessionCanvas({ children, topInset = 0, maxWidth = 760, fullPreview = false }: {
  children: ReactNode; topInset?: number; maxWidth?: number; fullPreview?: boolean;
}) {
  const { colors } = useTheme();
  const [height, setHeight] = useState(0);
  const value = useMemo(() => ({ height, setHeight }), [height]);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (fullPreview) scroll.current?.scrollTo({ y: 0, animated: false });
  }, [fullPreview]);
  return <DockContext.Provider value={value}>
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView ref={scroll} removeClippedSubviews={false} scrollEnabled={!fullPreview}
        keyboardShouldPersistTaps="handled" contentContainerStyle={fullPreview
          ? { flexGrow: 1 }
          : { alignSelf: 'center', width: '100%', maxWidth, padding: 20, paddingTop: topInset + 12, paddingBottom: height + 32, gap: 24 }}>
        {children}
      </ScrollView>
    </View>
  </DockContext.Provider>;
}

/** Only controls enter the portal. Never a camera, engine or command owner. */
export function SessionActionDock({ visible, title, children }: { visible: boolean; title: string; children: ReactNode }) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { setHeight } = useContext(DockContext);
  useEffect(() => { if (!visible) setHeight(0); return () => setHeight(0); }, [visible, setHeight]);
  if (!visible) return null;
  return <Portal>
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Surface elevation={1} onLayout={(event) => setHeight(Math.ceil(event.nativeEvent.layout.height))}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.outlineVariant }}>
        <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: bottom + 12, gap: 10 }}>
          <Text variant="labelLarge">{title}</Text>
          {children}
        </View>
      </Surface>
    </View>
  </Portal>;
}

export function SessionSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ gap: 14, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.outlineVariant }}>
    <Text accessibilityRole="header" variant="titleLarge">{title}</Text>
    {!!description && <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>{description}</Text>}
    {children}
  </View>;
}

/** Details stay mounted; only non-operational metadata belongs inside. */
export function SessionDetails({ title = 'Datos técnicos', children }: { title?: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={{ gap: expanded ? 8 : 0 }}>
    <Button mode="text" icon={expanded ? 'chevron-up' : 'chevron-down'} onPress={() => setExpanded((value) => !value)}
      accessibilityState={{ expanded }} contentStyle={sessionStyles.touch} style={{ alignSelf: 'flex-start' }}>{title}</Button>
    <View style={{ ...retainedVisibility(expanded), gap: 8 }} accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}>{children}</View>
  </View>;
}

export type SessionTone = 'neutral' | 'success' | 'warning' | 'error' | 'recording';
export function SessionBadge({ label, tone = 'neutral' }: { label: string; tone?: SessionTone }) {
  const { colors, dark } = useTheme();
  const palette = StudioUI[dark ? 'dark' : 'light'];
  const color = tone === 'success' ? palette.successText : tone === 'warning' ? palette.warningText :
    tone === 'error' || tone === 'recording' ? colors.error : colors.onSurfaceVariant;
  const icon = tone === 'success' ? 'check-circle-outline' : tone === 'recording' ? 'record-circle' :
    tone === 'warning' || tone === 'error' ? 'alert-circle-outline' : 'information-outline';
  return <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', gap: 6, borderWidth: 1, borderColor: color, borderRadius: 8, padding: 8 }}>
    <Icon source={icon} size={16} color={color} /><Text variant="labelLarge" style={{ color, flexShrink: 1 }}>{label}</Text>
  </View>;
}

export function SessionNotice({ title, children, tone = 'neutral' }: { title: string; children?: ReactNode; tone?: SessionTone }) {
  const { colors } = useTheme();
  return <View accessibilityLiveRegion="polite" style={{ gap: 8, padding: 14, borderRadius: 12,
    backgroundColor: tone === 'error' ? colors.errorContainer : colors.surfaceVariant }}>
    <SessionBadge label={title} tone={tone} />
    {children}
  </View>;
}
