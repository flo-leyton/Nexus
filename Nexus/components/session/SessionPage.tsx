import { retainedVisibility } from '@/components/retainedVisibility';
import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Button } from 'react-native-paper';
import { SessionCanvas, sessionStyles } from './SessionUI';

type Props = {
  topInset: number; onBack(): void; header: ReactNode; capture: ReactNode; members: ReactNode; console: ReactNode;
  admission: ReactNode; rejoin: ReactNode; administration: ReactNode; media: ReactNode; imports: ReactNode;
  fullPreview?: boolean; experimentalPreview?: ReactNode;
};

/** Slots and keys stay constant across loss/recovery of the verified Session. */
export function SessionPage(props: Props) {
  const wide = useWindowDimensions().width >= 1000 && !props.fullPreview;
  const hideExtras = props.fullPreview ? { display: 'none' as const } : undefined;
  return <SessionCanvas topInset={props.topInset} maxWidth={wide ? 1200 : 760} fullPreview={props.fullPreview}>
    <Button mode="text" icon="arrow-left" onPress={props.onBack} contentStyle={sessionStyles.touch}
      style={[{ alignSelf: 'flex-start' }, hideExtras]}>Volver a Studio</Button>
    <View style={hideExtras}>{props.header}</View>
    {props.experimentalPreview && <View style={hideExtras}>{props.experimentalPreview}</View>}
    <View key="session-content" style={{ flex: props.fullPreview ? 1 : undefined, flexDirection: wide ? 'row' : 'column', gap: props.fullPreview ? 0 : 28, alignItems: 'stretch' }}>
      <View style={{ flex: props.fullPreview ? 1 : wide ? 1.7 : undefined, minWidth: 0, gap: props.fullPreview ? 0 : 24 }}>
        <View key="capture-owner" style={{ ...retainedVisibility(Boolean(props.capture)), flex: props.fullPreview ? 1 : undefined }}>{props.capture}</View>
        <View key="members" style={[retainedVisibility(Boolean(props.members)), hideExtras]}>{props.members}</View>
        <View key="console-owner" style={[retainedVisibility(Boolean(props.console)), hideExtras]}>{props.console}</View>
      </View>
      <View style={[{ flex: wide ? 1 : undefined, minWidth: 0, gap: 24 }, hideExtras]}>
        <View key="rejoin" style={{ ...retainedVisibility(Boolean(props.rejoin)) }}>{props.rejoin}</View>
        <View key="admission" style={{ ...retainedVisibility(Boolean(props.admission)) }}>{props.admission}</View>
        <View key="media" style={{ ...retainedVisibility(Boolean(props.media)) }}>{props.media}</View>
        <View key="imports" style={{ ...retainedVisibility(Boolean(props.imports)) }}>{props.imports}</View>
        <View key="administration" style={{ ...retainedVisibility(Boolean(props.administration)) }}>{props.administration}</View>
      </View>
    </View>
  </SessionCanvas>;
}
