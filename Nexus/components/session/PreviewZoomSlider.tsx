import { useState } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

export function PreviewZoomSlider({ percent, disabled, onChange, label = 'Zoom de la cámara', overlay = true, compact = false }: {
  percent: number | null; disabled: boolean; onChange(value: number): void; label?: string; overlay?: boolean; compact?: boolean;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const valueText = percent === null ? 'Sin confirmar' : `${percent} %`;
  const setValue = (value: number) => {
    if (!disabled) onChange(Math.min(100, Math.max(0, Math.round(value))));
  };
  const scrub = (event: GestureResponderEvent) => {
    if (width > 0) setValue(event.nativeEvent.locationX / width * 100);
  };
  return <View style={{ borderRadius: 16, paddingHorizontal: compact ? 8 : 16, paddingTop: compact ? 4 : 8,
    backgroundColor: overlay ? '#000B' : colors.surfaceVariant }}>
    <Text variant="labelMedium" style={{ color: overlay ? '#FFF' : colors.onSurfaceVariant }}>Zoom · {valueText}</Text>
    <View accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityState={{ disabled }} accessibilityValue={{ min: 0, max: 100, now: percent ?? undefined, text: valueText }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => setValue((percent ?? 0) + (nativeEvent.actionName === 'increment' ? 5 : -5))}
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      onStartShouldSetResponder={() => !disabled} onResponderGrant={scrub} onResponderMove={scrub}
      style={{ height: 44, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: overlay ? '#FFF7' : colors.outlineVariant }}>
        {percent !== null && <>
          <View style={{ width: `${percent}%`, height: 4, borderRadius: 2, backgroundColor: overlay ? colors.primaryContainer : colors.primary }} />
          <View style={{ position: 'absolute', left: `${percent}%`, marginLeft: -7, top: -5,
            width: 14, height: 14, borderRadius: 7, backgroundColor: overlay ? colors.primaryContainer : colors.primary }} />
        </>}
      </View>
    </View>
  </View>;
}
