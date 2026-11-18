/* Read-only audit relative to the actual combined H4+UI base, not historical H3. */
const fs=require('node:fs'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const baseline='6379986816154d5e052c96c57041aab01e60520d';
const exact=['services','server','config','types','app/_layout.tsx','app/session','app/media','components/session','components/NodeReadinessPanel.tsx','components/ControllerTakePanel.tsx','components/NodeRoleEditor.tsx','components/LocalCapturesPanel.tsx','components/TakeMediaPanel.tsx','components/CaptureUploadControls.tsx','components/RejoinSessionPanel.tsx','components/StudioIdentityPanel.tsx','app/firebase.ts','app/(tabs)/linterna.tsx','app/(tabs)/vibracion.tsx','app.json','app.config.js','eas.json','package.json','package-lock.json'];
const layout=require('./verify-retained-layout.cjs');
const clean=s=>s.replaceAll('\r\n','\n');
const changed=execFileSync('git',['diff',baseline,'--name-only','--',...exact],{encoding:'utf8'}).trim().split('\n').filter(Boolean).map(p=>p.replace(/^Nexus\//,''));
const firebaseImports=['services/authService.ts','services/firebaseTest.ts','services/deviceRegistry.ts','services/studioIdentity.ts','components/StudioIdentityPanel.tsx'];
const firebaseMove=['app/firebase.ts','config/firebase.ts',...firebaseImports];
assert.deepEqual(changed.filter(p=>!layout.files.includes(p)&&!firebaseMove.includes(p)),[],'Protected runtime/owners/config changed');
assert.equal(fs.existsSync('app/firebase.ts'),false,'Firebase must not remain a route');
assert.equal(clean(fs.readFileSync('config/firebase.ts','utf8')),clean(execFileSync('git',['show',baseline+':Nexus/app/firebase.ts'],{encoding:'utf8'})),'Firebase initialization must remain identical (Git checkout EOL normalization only)');
for(const file of firebaseImports){const old=clean(execFileSync('git',['show',baseline+':Nexus/'+file],{encoding:'utf8'}));const now=clean(fs.readFileSync(file,'utf8')).replaceAll('../config/firebase','../app/firebase');assert.equal(now,old,'Only Firebase import path may change: '+file);}
for(const file of layout.files){const old=clean(execFileSync('git',['show',baseline+':Nexus/'+file],{encoding:'utf8'}));layout.assertPresentationOnly(old,clean(fs.readFileSync(file,'utf8')),file);}
const oldPlayer=execFileSync('git',['show',baseline+':Nexus/components/LocalVideoPlayer.tsx'],{encoding:'utf8'});
assert.deepEqual(layout.playbackSignature(fs.readFileSync('components/LocalVideoPlayer.tsx','utf8')),layout.playbackSignature(oldPlayer),'Native VideoView/player/status subscription changed');
const before=clean(execFileSync('git',['show',baseline+':Nexus/app/(tabs)/explore.tsx'],{encoding:'utf8'}));
const after=clean(fs.readFileSync('app/(tabs)/explore.tsx','utf8'));
const slice=s=>s.slice(s.indexOf('  useEffect(() =>'),s.indexOf('  if (loading)'));
assert.equal(slice(after),slice(before),'Account subscriptions and auth handlers changed');
const result={baseline,scope:'Protected runtime exact; retained-panel exceptions checked for identical non-style AST, native player signature and account handlers unchanged; Firebase relocation byte-identical and consumer imports only. No native certification.',checks:[{check:'Protected runtime/owners/H4 exact; retained-panel changes style-only and native playback signature unchanged',status:'PASS'},{check:'Account effects and auth handlers unchanged',status:'PASS'}]};
fs.writeFileSync('docs/ux/implementation/stage4-logic-audit.json',JSON.stringify(result,null,2));
console.log('PASS: protected paths and account effects/handlers unchanged against combined base.');
