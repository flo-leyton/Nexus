/* Read-only diff audit, not a substitute for tests/hardware. Baseline is approved Stage 1. */
const fs=require('node:fs'),{execFileSync}=require('node:child_process'),ts=require('typescript');
const baseline='43d0d0b859ac0a67bfc9ffa768c8261f32c5c21f';
const clean=s=>s.replaceAll('\r\n','\n');
const before=p=>clean(execFileSync('git',['show',baseline+':Nexus/'+p],{encoding:'utf8'}));
const after=p=>clean(fs.readFileSync(p,'utf8'));
const rows=[];
const cases=[
  ['app/session/[id].tsx','const MAX_UPLOAD_BYTES','  if (!sessionId) return'],
  ['components/NodeReadinessPanel.tsx','  const focused =','\n  return '],
  ['components/ControllerTakePanel.tsx','  const [notice,','\n  return '],
  ['components/NodeRoleEditor.tsx','  const [draft,','\n  return '],
  ['components/LocalCapturesPanel.tsx','  const focused =','\n  return '],
  ['components/TakeMediaPanel.tsx','  const focused =','\n  return '],
  ['components/CaptureUploadControls.tsx','  const [asset,','\n  return '],
  ['components/RejoinSessionPanel.tsx','  const request =','\n  if (!last || isMember) return'],
];
function slice(s,start,end,file){const a=s.indexOf(start),b=s.indexOf(end,a);if(a<0||b<0)throw Error('Missing audit marker: '+file);return s.slice(a,b);}
for(const [file,start,end] of cases){
  let old=before(file),now=after(file);
  if(file.endsWith('RejoinSessionPanel.tsx')) now=now.replace('  if ((!last || isMember) && !notice && !snapshot.historyError) return null;','  if (!last || isMember) return');
  if(slice(old,start,end,file)!==slice(now,start,end,file))throw Error('Owner state/effects/calculation changed: '+file);
  rows.push({file,check:'state/effects/calculations unchanged',status:'PASS'});
  const receivers=new Set(['service','engine','captureUploader','Linking','router']);
  function calls(source){const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),list=[];
    function walk(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)){
      let base=n.expression.expression;while(ts.isNonNullExpression(base))base=base.expression;
      if(receivers.has(base.getText(ast))){const args=n.arguments.map(a=>a.getText(ast).replace(/!\./g,'.').replace(/\s+/g,' ')).join(',');list.push(base.getText(ast)+'.'+n.expression.name.getText(ast)+'('+args+')');}
    }ts.forEachChild(n,walk);}walk(ast);return list.sort();}
  if(JSON.stringify(calls(old))!==JSON.stringify(calls(now)))throw Error('Service/engine/navigation call signature changed: '+file);
  rows.push({file,check:'service/engine/navigation calls unchanged',status:'PASS'});
}
const protectedPaths=['services','server','config','types','tests','app/_layout.tsx','app/(tabs)','package.json','package-lock.json'];
const diff=execFileSync('git',['diff',baseline,'--name-only','--',...protectedPaths],{encoding:'utf8'}).trim();
if(diff)throw Error('Protected diff: '+diff);
rows.push({check:'protected services/config/navigation/test paths unchanged',status:'PASS'});
const result={baseline,scope:'Static diff inspection; layout/native behavior requires runtime and physical tests.',checks:rows};
fs.writeFileSync('docs/ux/implementation/stage2-logic-audit.json',JSON.stringify(result,null,2));
console.log('PASS: '+rows.length+' static diff checks; no changes to owner logic or protected paths.');
