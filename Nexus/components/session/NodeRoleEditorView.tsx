import { useState } from 'react';
import { View } from 'react-native';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';
import { sessionStyles } from './SessionUI';

export function NodeRoleEditorView({ deviceId, draft, busy, notice, compact, onChange, onAssign }: {
  deviceId: string; draft: string; busy: boolean; notice: string; compact: boolean;
  onChange(value: string): void; onAssign(): void;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(!compact);
  const visible = expanded || busy;
  return <View style={sessionStyles.stack}>
    {compact && <Button mode="text" icon={visible ? 'chevron-up' : 'pencil-outline'} disabled={busy}
      onPress={() => setExpanded((value) => !value)} accessibilityState={{ expanded: visible }}
      style={{ alignSelf: 'flex-start' }} contentStyle={sessionStyles.touch}>{visible ? 'Cerrar editor de rol' : 'Editar rol'}</Button>}
    <View style={{ display: visible ? 'flex' : 'none', gap: 10 }} accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
      <TextInput mode="outlined" label="Rol del Node" accessibilityLabel={`Rol de ${deviceId}`} value={draft} onChangeText={onChange}
        maxLength={64} editable={!busy} outlineStyle={sessionStyles.control} style={{ backgroundColor: colors.background }} />
      <Button mode="outlined" accessibilityLabel={`Asignar rol a ${deviceId}`} disabled={busy} onPress={onAssign}
        style={sessionStyles.control} contentStyle={sessionStyles.touch}>Asignar rol</Button>
    </View>
    {!!notice && <Text variant="bodyMedium" accessibilityLiveRegion="polite" style={{ color: colors.onSurfaceVariant }}>{notice}</Text>}
  </View>;
}
