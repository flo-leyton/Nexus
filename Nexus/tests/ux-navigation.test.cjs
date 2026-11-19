const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function loadNavigation(width,events,index=1){
 const jsx=(type,props)=>({type,props});const exports={};
 const code=ts.transpileModule(fs.readFileSync('components/navigation/ConsoleNavigation.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports,require:id=>id==='expo-haptics'?{impactAsync:()=>Promise.resolve(),ImpactFeedbackStyle:{Light:'light'}}:id==='react/jsx-runtime'?{jsx,jsxs:jsx}:id==='react-native'?{View:'View',useWindowDimensions:()=>({width})}:id==='react-native-paper'?{Icon:'Icon',Text:'Text',TouchableRipple:'Touch',useTheme:()=>({colors:{}})}:id==='react-native-safe-area-context'?{useSafeAreaInsets:()=>({top:0,bottom:24,left:0,right:0})}:require(id)});
 const state={index,routes:['index','medios','dispositivos','explore','linterna','vibracion'].map(name=>({key:name,name}))};
 return exports.ConsoleNavigation({state,navigation:{emit:e=>{events.push(e);return {defaultPrevented:events.prevented}},navigate:(...args)=>events.push(args)}});
}
test('UX tabs: four approved destinations, hidden legacy routes, selected state and cancellable navigation',()=>{
 const events=[];const bar=loadNavigation(390,events);const tabs=bar.props.children;
 assert.equal(tabs.length,4);assert.equal(tabs[1].props.accessibilityState.selected,true);
 tabs[1].props.onPress();assert.equal(events.length,1,'selected tab emits but never navigates again');
 tabs[2].props.onPress();assert.equal(events[2][0],'dispositivos');
 events.prevented=true;const count=events.length;tabs[3].props.onPress();assert.equal(events.length,count+1,'preventDefault suppresses navigation');
 tabs[0].props.onLongPress();assert.equal(events.at(-1).type,'tabLongPress');
 for(const t of tabs)assert.ok(t.props.style.minHeight>=48);
 const legacyEvents=[];const legacy=loadNavigation(390,legacyEvents,4);assert.equal(legacy.props.children[2].props.accessibilityState.selected,true);legacy.props.children[2].props.onPress();assert.equal(legacyEvents.at(-1)[0],'dispositivos');
});
test('UX adaptive rail retains the same destination keys and routes at the breakpoint',()=>{
 const mobile=loadNavigation(839,[]),rail=loadNavigation(840,[]);
 assert.equal(mobile.props.style.flexDirection,'row');assert.equal(rail.props.style.flexDirection,'column');
 assert.equal(JSON.stringify(mobile.props.children.map(x=>x.props.accessibilityLabel)),JSON.stringify(rail.props.children.map(x=>x.props.accessibilityLabel)));
});
test('UX route access preserves contextual production, deep links and H4-only legacy controls',()=>{
 const read=p=>fs.readFileSync(p,'utf8');
 assert.ok(read('app/(tabs)/dispositivos.tsx').includes("router.push('/vibracion')"));
 assert.ok(read('app/(tabs)/dispositivos.tsx').includes("router.push('/linterna')"));
 assert.ok(read('app/(tabs)/explore.tsx').includes("router.push('/notifications-test')"));
 assert.ok(read('app/(tabs)/explore.tsx').includes("router.push('/modal')"));
 for(const p of ['app/session/[id].tsx','app/media/[id].tsx','app/(tabs)/linterna.tsx','app/(tabs)/vibracion.tsx'])assert.ok(fs.existsSync(p));
 assert.match(read('app/(tabs)/vibracion.tsx'),/selectedRole === 'A' && isConnected/);
 assert.match(read('app/session/[id].tsx'),/usePreventRemove/);
 assert.doesNotMatch(read('components/navigation/ConsoleNavigation.tsx'),/startTake|stopTake|closeSession|CaptureEngine/);
});
