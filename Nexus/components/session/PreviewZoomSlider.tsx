import { useState } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

export function PreviewZoomSlider({ percent, disabled, onChange }: {
  percent: number; disabled: boolean; onChange(value: number): void;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const setValue = (value: number) => {
    if (!disabled) onChange(Math.min(100, Math.max(0, Math.round(value))));
  };
  const scrub = (event: GestureResponderEvent) => {
    if (width > 0) setValue(event.nativeEvent.locationX / width * 100);
  };
  return <View style={{ borderRadius: 16, paddingHorizontal: 16, paddingTop: 8, backgroundColor: '#000B' }}>
    <Text variant="labelMedium" style={{ color: '#FFF' }}>Zoom · {percent} %</Text>
    <View accessible accessibilityRole="adjustable" accessibilityLabel="Zoom de la cámara"
      accessibilityState={{ disabled }} accessibilityValue={{ min: 0, max: 100, now: percent, text: `${percent} %` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => setValue(percent + (nativeEvent.actionName === 'increment' ? 5 : -5))}
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      onStartShouldSetResponder={() => !disabled} onResponderGrant={scrub} onResponderMove={scrub}
      style={{ height: 44, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: '#FFF7' }}>
        <View style={{ width: `${percent}%`, height: 4, borderRadius: 2, backgroundColor: colors.primaryContainer }} />
        <View style={{ position: 'absolute', left: `${percent}%`, marginLeft: -7, top: -5,
          width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primaryContainer }} />
      </View>
    </View>
  </View>;
}
