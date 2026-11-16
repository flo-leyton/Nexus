/* Read-only audit relative to the actual combined H4+UI base, not historical H3. */
const fs=require('node:fs'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const baseline='6379986816154d5e052c96c57041aab01e60520d';
const exact=['services','server','config','types','app/_layout.tsx','app/session','app/media','components/session','components/NodeReadinessPanel.tsx','components/ControllerTakePanel.tsx','components/NodeRoleEditor.tsx','components/LocalCapturesPanel.tsx','components/TakeMediaPanel.tsx','components/CaptureUploadControls.tsx','components/RejoinSessionPanel.tsx','components/StudioIdentityPanel.tsx','app/firebase.ts','app/(tabs)/linterna.tsx','app/(tabs)/vibracion.tsx','app.json','app.config.js','eas.json','package.json','package-lock.json'];
const clean=s=>s.replaceAll('\r\n','\n');
assert.equal(execFileSync('git',['diff',baseline,'--name-only','--',...exact],{encoding:'utf8'}).trim(),'','Protected runtime/owners/config changed');
const before=clean(execFileSync('git',['show',baseline+':Nexus/app/(tabs)/explore.tsx'],{encoding:'utf8'}));
const after=clean(fs.readFileSync('app/(tabs)/explore.tsx','utf8'));
const slice=s=>s.slice(s.indexOf('  useEffect(() =>'),s.indexOf('  if (loading)'));
assert.equal(slice(after),slice(before),'Account subscriptions and auth handlers changed');
const result={baseline,scope:'Exact protected diff and account handlers; no native or production certification.',checks:[{check:'Protected runtime, camera owners, Session tree, H4 legacy controls and configuration unchanged',status:'PASS'},{check:'Account effects and auth handlers unchanged',status:'PASS'}]};
fs.writeFileSync('docs/ux/implementation/stage4-logic-audit.json',JSON.stringify(result,null,2));
console.log('PASS: protected paths and account effects/handlers unchanged against combined base.');
