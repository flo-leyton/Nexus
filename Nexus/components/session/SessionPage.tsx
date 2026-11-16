import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Button } from 'react-native-paper';
import { SessionCanvas, sessionStyles } from './SessionUI';

type Props = {
  topInset: number; onBack(): void; header: ReactNode; capture: ReactNode; members: ReactNode; console: ReactNode;
  admission: ReactNode; rejoin: ReactNode; administration: ReactNode; media: ReactNode; imports: ReactNode;
};

/** Slots and keys stay constant across loss/recovery of the verified Session. */
export function SessionPage(props: Props) {
  const wide = useWindowDimensions().width >= 1000;
  return <SessionCanvas topInset={props.topInset} maxWidth={wide ? 1200 : 760}>
    <Button mode="text" icon="arrow-left" onPress={props.onBack} contentStyle={sessionStyles.touch} style={{ alignSelf: 'flex-start' }}>Volver a Studio</Button>
    {props.header}
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 28, alignItems: 'stretch' }}>
      <View style={{ flex: wide ? 1.7 : undefined, minWidth: 0, gap: 24 }}>
        <View key="capture-owner" style={{ display: props.capture ? 'flex' : 'none' }}>{props.capture}</View>
        <View key="members" style={{ display: props.members ? 'flex' : 'none' }}>{props.members}</View>
        <View key="console-owner" style={{ display: props.console ? 'flex' : 'none' }}>{props.console}</View>
      </View>
      <View style={{ flex: wide ? 1 : undefined, minWidth: 0, gap: 24 }}>
        <View key="rejoin" style={{ display: props.rejoin ? 'flex' : 'none' }}>{props.rejoin}</View>
        <View key="admission" style={{ display: props.admission ? 'flex' : 'none' }}>{props.admission}</View>
        <View key="media" style={{ display: props.media ? 'flex' : 'none' }}>{props.media}</View>
        <View key="imports" style={{ display: props.imports ? 'flex' : 'none' }}>{props.imports}</View>
        <View key="administration" style={{ display: props.administration ? 'flex' : 'none' }}>{props.administration}</View>
      </View>
    </View>
  </SessionCanvas>;
}
