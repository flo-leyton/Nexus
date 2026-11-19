/* global __dirname */
const { Buffer } = require('node:buffer');
const http = require('node:http');
/* Visual QA of the actual Expo web page. No relay, Auth or capture actions are invoked. */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9237', '--remote-debugging-address=127.0.0.1',
  '--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'nexus-studio-qa-')), 'about:blank',
], { windowsHide:true, stdio:'ignore' });
const fixtureServer=http.createServer(async(req,res)=>{if(req.url.startsWith('/assets/')){try{const r=await fetch('http://localhost:8091'+req.url);res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')||'application/octet-stream'});res.end(Buffer.from(await r.arrayBuffer()));}catch{res.writeHead(502);res.end();}return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}#root{display:flex}</style><div id="root"></div><script src="http://localhost:8091/docs/ux/implementation/navigation-preview.bundle?platform=web&dev=true&hot=false&lazy=false"></script>');});
fixtureServer.listen(8093,'127.0.0.1');
let socket, nextId = 0;
const pending = new Map();
async function call(method,params={}) {
  const id = ++nextId;
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => {pending.delete(id);reject(new Error('CDP timeout: '+method));},60000);
    pending.set(id,{resolve: data => {clearTimeout(timer);resolve(data);},reject});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function shot(name) {
  const {data} = await call('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(__dirname,'stage4-'+name+'.png'),Buffer.from(data,'base64'));
  console.log('PNG: '+name);
}
async function waitFor(expression, label) {
  for(let i=0;i<160;i++) {
    if(await evaluate(expression))return;
    await delay(500);
  }
  throw new Error('Timed out waiting for '+label);
}
(async()=>{
  let tabs;
  for(let i=0;i<40;i++) {
    try {tabs=await(await fetch('http://127.0.0.1:9237/json/list')).json();if(tabs.length)break;}catch{}
    await delay(250);
  }
  if(!tabs?.length) throw new Error('Edge did not expose local debugging.');
  socket = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  socket.addEventListener('message',event=>{
    const data=JSON.parse(event.data), listener=pending.get(data.id);
    if(listener){pending.delete(data.id);if(data.error)listener.reject(new Error(data.error.message));else listener.resolve(data.result);}
  });
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  await call('Page.enable');
  await call('Network.enable');
  // This isolated preview must not call real account, media or relay services.
  await call('Network.setBlockedURLs',{urls:['*googleapis.com*','*firebaseio.com*','*firebasedatabase.app*','*cloudinary.com*','wss://*']});

  const checks=[];
  async function until(expression){await waitFor(expression,'stage4 route');}
  async function check(expression,label){if(!await evaluate(expression))throw Error(label);checks.push({check:label,status:'PASS'});}
  async function open(route){await call('Page.navigate',{url:'http://localhost:8091'+route});if(!route.startsWith('/session/')&&!route.startsWith('/media/'))await until("document.querySelectorAll('[role=tab]').length===4");await evaluate('document.fonts.ready.then(()=>true)');await delay(600);}
  async function tab(label){await evaluate(`(()=>{const b=[...document.querySelectorAll('[role=tab]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)});if(!b)throw Error('Missing tab');b.click();return true;})()`);await delay(400);}
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await open('/');await until("document.body.innerText.includes('Tus sesiones.')");await shot('studio-mobile');
  await tab('Biblioteca');await until("location.pathname==='/medios'");await shot('library-mobile');
  await check("document.body.innerText.includes('La biblioteca est')",'Biblioteca empty state does not claim remote originals');
  await tab('Dispositivos');await until("location.pathname==='/dispositivos'");
  await evaluate("[...document.querySelectorAll('div')].filter(e=>e.textContent==='Herramientas heredadas A/B')[0]?.scrollIntoView()");await shot('devices-tools');
  await check("document.body.innerText.includes('Vibracion A/B')&&document.body.innerText.includes('Linterna A/B')",'Legacy tools are explicitly reachable');
  await tab('Cuenta');await until("location.pathname==='/explore'");await shot('account-dark');
  await check("document.body.innerText.includes('Prueba de notificaciones')&&document.body.innerText.includes('modal heredado')",'Account keeps secondary diagnostics reachable');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});await delay(400);await shot('account-light');
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});await tab('Studio');await shot('studio-rail');
  await check("(()=>{const t=document.querySelectorAll('[role=tab]');return Math.abs(t[0].getBoundingClientRect().x-t[3].getBoundingClientRect().x)<5 && t[3].getBoundingClientRect().y>t[0].getBoundingClientRect().y})()",'Wide layout uses a vertical rail');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(300);
  await check("document.querySelectorAll('[role=tab]').length===4",'Resize keeps four destinations');
  await open('/session/stage4-qa');await until("document.body.innerText.includes('Volver a Studio')");await shot('session-deep-link');
  await check("location.pathname==='/session/stage4-qa' && document.body.innerText.includes('Volver a Studio')",'Session deep link preserves its contextual route and return header');
  await open('/media/stage4-missing');await until("document.body.innerText.includes('El medio no existe en el cat')");await shot('media-missing');
  await check("document.body.innerText.includes('El medio no existe en el cat')",'Missing media deep link retains explicit unavailable state');
  await evaluate('history.back()');await until("location.pathname==='/session/stage4-qa'");
  await check("document.body.innerText.includes('Volver a Studio')",'Back from media returns to the contextual Session route');
  await call('Page.navigate',{url:'http://127.0.0.1:8093'});await until("document.body.innerText.includes('DATOS SINTETICOS')");await evaluate("(async()=>{const r=await fetch(location.origin+'/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf');const f=new FontFace('material-community',await r.arrayBuffer());await f.load();document.fonts.add(f);return true;})()");await delay(600);await shot('library-fixtures');
  await check("document.body.innerText.includes('Subida sin confirmar')&&document.body.innerText.includes('Subido')&&document.body.innerText.includes('Referencia remota')",'Library distinguishes original, confirmed upload and uncertain upload');
  await evaluate("(()=>{const input=document.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'MAIN');input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()");await delay(400);
  await check("document.body.innerText.includes('Node: MAIN')&&!document.body.innerText.includes('Node: SIDE')",'Library search filters existing Node data without changing the catalog');await shot('library-search');
  fs.writeFileSync(path.join(__dirname,'stage4-navigation-results.json'),JSON.stringify({scope:'Actual Expo web routes, blocked external services; not physical/native evidence.',checks},null,2));
  console.log('PASS: '+checks.length+' navigation/browser checks.');

})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  try {if(socket?.readyState===1)await call('Browser.close');}catch{}
  socket?.close();browser.kill();fixtureServer.close();
});
