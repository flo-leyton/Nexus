/** Native reproduction candidate, NOT an app route; no media/Auth/network/storage. */
import { useState } from 'react';
import { Button, ScrollView, Text, TextInput, View } from 'react-native';
import { retainedVisibility } from '../../components/retainedVisibility';
export function YogaLayoutProbe({ legacy = false }: { legacy?: boolean }) {
 const [tall,setTall]=useState(false),[highlight,setHighlight]=useState(false);
 return <ScrollView><Text>Isolated Yoga diagnostic: {legacy?'legacy display:none (may abort)':'retained clipping candidate'}</Text>
   <Button title="1. Resize" onPress={()=>setTall(v=>!v)} /><Button title="2. Restyle" onPress={()=>setHighlight(v=>!v)} />
   <View style={{height:tall?400:300,justifyContent:'center'}}><View style={{flexDirection:'row',alignItems:'center',justifyContent:'center'}}>
     <View style={{justifyContent:'center'}}><View style={legacy?{display:'none'}:retainedVisibility(false)} /></View>
     <TextInput accessibilityLabel="Synthetic layout input" style={{borderWidth:1,minWidth:120,borderColor:highlight?'red':'gray'}} />
   </View></View>
 </ScrollView>;
}
