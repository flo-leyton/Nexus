/* global __dirname */
const { Buffer } = require('node:buffer');
/* Expo visual/integration QA: synthetic props, actual production views, external services blocked. */
const {spawn}=require('node:child_process');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];
const server=http.createServer(async(req,res)=>{try{
  if(new URL(req.url,'http://127.0.0.1:8092').pathname==='/session-stage2-preview.html'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'session-stage2-preview.html')));
  }else{const r=await fetch('http://localhost:8091'+req.url);res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')||'application/octet-stream'});res.end(Buffer.from(await r.arrayBuffer()));}
}catch{res.writeHead(502);res.end('Local Metro unavailable');}});
const listening=new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8092,'127.0.0.1',resolve);});
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=9238','--remote-debugging-address=127.0.0.1','--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'nexus-stage2-')),'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws,id=0;const pending=new Map();
function call(method,params={}){const key=++id;return new Promise((resolve,reject)=>{const t=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method));},60000);pending.set(key,{resolve:r=>{clearTimeout(t);resolve(r);},reject});ws.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function until(expression){for(let n=0;n<160;n++){if(await evaluate(expression))return;await delay(250);}throw Error('Condition not met: '+expression);}
async function check(expression,label){if(!await evaluate(expression))throw Error(label);results.push({check:label,status:'PASS'});console.log('PASS: '+label);}
async function click(label){await evaluate(`(()=>{const b=[...document.querySelectorAll('[role="button"],button')].find(e=>e.textContent.includes(${JSON.stringify(label)})&&e.getClientRects().length&&e.getAttribute('aria-disabled')!=='true');if(!b)throw Error('Unavailable button: '+${JSON.stringify(label)});b.click();return true;})()`);await delay(150);}
async function anchor(label){await evaluate(`(()=>{const e=[...document.querySelectorAll('[role="heading"],div,span')].filter(e=>e.textContent===${JSON.stringify(label)}).sort((a,b)=>a.textContent.length-b.textContent.length)[0];if(!e)throw Error('Missing anchor');e.scrollIntoView({block:'start'});return true;})()`);await delay(200);}
async function fonts(){await evaluate("(async()=>{const r=await fetch(location.origin+'/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf');const f=new FontFace('material-community',await r.arrayBuffer());await f.load();document.fonts.add(f);await document.fonts.ready;return true;})()");}
async function shot(name){await delay(200);const r=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'stage4-session-'+name+'.png'),Buffer.from(r.data,'base64'));console.log('PNG: '+name);}
async function scene(name,{width=390,height=844,theme='dark'}={}){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
  await call('Page.navigate',{url:`http://127.0.0.1:8092/session-stage2-preview.html?scenario=${name}&theme=${theme}`});
  await until("!!window.__sessionQA && document.body.innerText.includes('DATOS SINTÉTICOS')");await fonts();await delay(250);
}
(async()=>{
  await listening;let pages;
  for(let n=0;n<50;n++){try{pages=await(await fetch('http://127.0.0.1:9238/json/list')).json();if(pages.length)break;}catch{}await delay(200);}
  if(!pages?.length)throw Error('Edge unavailable');
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  ws.addEventListener('message',e=>{const d=JSON.parse(e.data),p=pending.get(d.id);if(p){pending.delete(d.id);if(d.error)p.reject(Error(d.error.message));else p.resolve(d.result);}});
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  await call('Page.enable');await call('Network.enable');await call('Network.setBlockedURLs',{urls:['*googleapis.com*','*firebaseio.com*','*firebasedatabase.app*','*cloudinary.com*','ws://*','wss://*']});

  await scene('controller-ready');await until("document.body.innerText.includes('REC · 2 Nodes')");await shot('controller-ready');
  await click('REC ·');await until("document.body.innerText.includes('Comando enviado')");
  await check("window.__sessionQA.actions.filter(a=>a==='REC').length===1",'REC dispatches one UI callback');
  await check("[...document.querySelectorAll('[role=button],button')].some(b=>b.textContent.includes('REC ·')&&b.getAttribute('aria-disabled')==='true')",'REC disabled while command pending');
  await anchor('Consola de grabación');await shot('controller-pending');
  for(const name of ['controller-recording','controller-partial','controller-interrupted','controller-saved']){
    await scene(name);await anchor('Consola de grabación');await shot(name);
    if(name==='controller-interrupted'){
      await click('Cerrar toma interrumpida');await until("document.body.innerText.includes('Cerrar no detiene un Node offline')");
      await anchor('Cerrar no detiene un Node offline');await shot('interrupted-confirmation');
      await check("window.__sessionQA.actions.length===0",'Interrupted close requires explicit confirmation');
    }
  }
  await scene('controller-ready',{width:1280,height:960});await shot('controller-desktop');
  await click('Editar rol');await until("[...document.querySelectorAll('input')].some(e=>e.getClientRects().length)");
  await check("document.querySelector('input').maxLength===64",'Free role keeps 64-character limit');
  await click('Asignar rol');await until("document.body.innerText.includes('Esperando ACK del Node')");
  await check("window.__sessionQA.actions.filter(a=>a==='ROLE').length===1",'Role assignment dispatches once and exposes pending ACK');
  await scene('controller-ready');await anchor('Administrar sesión');await click('Cerrar sesión');await shot('session-close');
  await check("window.__sessionQA.actions.length===0 && document.body.innerText.includes('Confirmar cierre de Session')",'Session close preserves explicit confirmation');
  await scene('admission-offline');await anchor('Solicitudes de ingreso · 1');await shot('admission-offline');
  await check("document.querySelector('[aria-label=\"Aceptar demo-applicant-03\"]').getAttribute('aria-disabled')==='true'",'Offline join request cannot be accepted');

  await scene('node-recording');await until("window.__sessionQA.ownerMounts===1 && window.__sessionQA.cameraMounts===1");await shot('node-recording');
  await evaluate("window.__sessionQA.setScenario('node-offline')");await until("document.body.innerText.includes('Sin conexión al relay')");await shot('node-offline');
  await check("window.__sessionQA.ownerMounts===1 && window.__sessionQA.ownerUnmounts===0 && window.__sessionQA.cameraMounts===1 && window.__sessionQA.cameraUnmounts===0",'Layout retains capture owner and camera slot after snapshot loss');
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});await delay(200);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(200);
  await check("window.__sessionQA.ownerMounts===1 && window.__sessionQA.cameraMounts===1 && window.__sessionQA.cameraUnmounts===0",'Responsive columns do not remount capture slot');
  await click('Detener y guardar');await check("window.__sessionQA.actions.join(',')==='STOP-local'",'Offline local STOP remains available');
  for(const name of ['node-ready','node-permission','node-save-error','node-saved']){
    await scene(name);await shot(name);
    if(name==='node-save-error'){await click('Reintentar guardado');await check("window.__sessionQA.actions.join(',')==='RETRY-save'",'Pending save exposes retry without starting a new capture');}
  }
  await scene('media');await anchor('Tomas y medios');await shot('media-angles');
  await anchor('Originales de este teléfono');await shot('local-original');
  await check("document.body.innerText.includes('Subida confirmada')&&document.body.innerText.includes('Sólo local en Node')&&document.body.innerText.includes('Error de subida')",'Upload, original availability and command ACK use distinct statuses');
  await scene('import',{theme:'light'});await anchor('Importar medio');await shot('import-light');
  await scene('node-ready',{theme:'light'});await shot('node-light');

  await call('Page.navigate',{url:'http://localhost:8091/session/stage2-qa'});
  await until("document.body.innerText.includes('Volver a Studio') && document.body.innerText.includes('Tomas y medios')");
  await evaluate('document.fonts.ready.then(()=>true)');await delay(1200);await shot('actual-route-disconnected');
  fs.writeFileSync(path.join(__dirname,'stage4-session-results.json'),JSON.stringify({scope:'Synthetic UI/layout integration. No physical capture, Auth, RTDB or real ACK verified.',checks:results},null,2));
  console.log('PASS: '+results.length+' UI/layout checks. Native capture remains a physical test.');
})().catch(e=>{console.error(e.message);fs.writeFileSync(path.join(__dirname,'stage4-session-results.json'),JSON.stringify({error:e.message,checks:results},null,2));process.exitCode=1;}).finally(async()=>{
  try{if(ws?.readyState===1)await call('Browser.close');}catch{}ws?.close();browser.kill();server.close();
});
