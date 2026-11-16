/** Synthetic local-only library fixtures; production presentation, no services. */
import '@expo/metro-runtime';
import { registerRootComponent } from 'expo';
import { ScrollView } from 'react-native';
import { PaperProvider, Text } from 'react-native-paper';
import { NexusPaperTheme } from '../../../constants/paper-theme';
import { LibraryContents } from '../../../components/navigation/LibraryContents';
import type { NexusMediaAsset, LocalCaptureMediaAsset } from '../../../types/media';
const local: LocalCaptureMediaAsset = { id:'fixture-main',sessionId:'session-demo',source:'capture',resourceType:'video',storage:'local',localId:'clip-main',takeId:'take-demo',deviceId:'fixture-device',nodeId:'MAIN',localUri:'file:///synthetic.mp4',fileName:'video.mp4',bytes:12345,audio:false,upload:{state:'uncertain',error:'Respuesta no confirmada (fixture)'},localAvailable:true,localError:null,createdAt:'2026-11-16T12:00:00Z' };
const assets: NexusMediaAsset[]=[local,{...local,id:'fixture-side',localId:'clip-side',nodeId:'SIDE',upload:{state:'uploaded' as const,publicId:'synthetic',url:'https://example.invalid/synthetic.mp4'}},{id:'import-demo',sessionId:'session-demo',source:'import',resourceType:'image',storage:'remote',fileName:'Referencia importada',publicId:'synthetic-import',url:'https://example.invalid/image.png',createdAt:local.createdAt}];
function Preview(){return <PaperProvider theme={NexusPaperTheme[new URLSearchParams(location.search).get('theme')==='light'?'light':'dark']}><ScrollView style={{ backgroundColor: '#131018', flex: 1 }} contentContainerStyle={{padding:24,gap:24}}><Text>DATOS SINTETICOS - No hay archivos ni subida real</Text><LibraryContents assets={assets} onOpen={()=>{}} onSession={()=>{}} /></ScrollView></PaperProvider>;}
registerRootComponent(Preview);
