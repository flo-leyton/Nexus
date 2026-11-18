const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(file,globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,...globals});return exports;}
test('Retained visibility keeps a zero-height clipped panel without display:none and restores natural size',()=>{
 const {retainedVisibility}=load('components/retainedVisibility.ts');const hidden=retainedVisibility(false),visible=retainedVisibility(true);
 assert.equal(hidden.height,0);assert.equal(hidden.overflow,'hidden');assert.equal(hidden.opacity,0);assert.equal('display' in hidden,false);assert.equal('height' in visible,false);
});
test('Playback diagnostics are dev-only and never include URI, token, IDs or raw error content',()=>{
 const messages=[];const {createPlaybackDiagnostics}=load('components/diagnostics/playbackDiagnostics.ts',{__DEV__:true,console:{info:(...args)=>messages.push(args)}});
 const trace=createPlaybackDiagnostics(false);trace('status',{status:'error',error:true,uri:'file:///private.mp4',token:'secret',sessionId:'private-session',message:'private-error'});
 trace('layout',{width:123.4,height:Infinity});trace('private-event',{uri:'private'});assert.equal(messages.length,2);const data=JSON.parse(messages[0][1]);assert.equal(data.error,true);assert.equal(data.status,'error');assert.equal(data.remote,false);assert.ok(!JSON.stringify(messages).includes('private'));assert.ok(!JSON.stringify(messages).includes('secret'));assert.equal(JSON.parse(messages[1][1]).width,123);
 const release=load('components/diagnostics/playbackDiagnostics.ts',{__DEV__:false,console:{info:()=>assert.fail('Release must not log')}});release.createPlaybackDiagnostics(true)('mount');
});
test('Layout audit accepts retained style changes but rejects changed callbacks or capture owner structure',()=>{
 const {assertPresentationOnly}=require('../docs/ux/implementation/verify-retained-layout.cjs');
 const before="const x=<View key='capture' style={{display:'none'}} onPress={stop}><Owner /></View>;";
 const after="const x=<View key='capture' style={{height:0}} onPress={stop}><Owner /></View>;";
 assert.doesNotThrow(()=>assertPresentationOnly(before,after,'test.tsx'));
 assert.throws(()=>assertPresentationOnly(before,after.replace('onPress={stop}','onPress={start}'),'test.tsx'));
 assert.throws(()=>assertPresentationOnly(before,after.replace('<Owner />','<OtherOwner />'),'test.tsx'));
});
