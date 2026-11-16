/* Capture actual 2A components through an isolated Metro entry. No production route or live Session. */
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
// Serve a real HTTP document so Expo's asset resolver can load the existing icon font.
// This is a temporary QA host, not an app route. Other asset requests proxy to Metro.
const previewServer=http.createServer(async(req,res)=>{
  try {
    if(new URL(req.url,'http://localhost:8092').pathname==='/session-2a-preview.html') {
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      res.end(fs.readFileSync(path.join(__dirname,'session-2a-preview.html')));
    } else {
      const response=await fetch('http://localhost:8091'+req.url);
      res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/octet-stream'});
      res.end(Buffer.from(await response.arrayBuffer()));
    }
  } catch {res.writeHead(502);res.end('Local Metro unavailable');}
});
const listening=new Promise((resolve,reject)=>{previewServer.once('error',reject);previewServer.listen(8092,'127.0.0.1',resolve);});
const processBrowser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=9238','--remote-debugging-address=127.0.0.1',
  '--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'nexus-session-2a-')),'about:blank',
],{windowsHide:true,stdio:'ignore'});
let socket,id=0;
const pending=new Map();
function call(method,params={}) {
  const key=++id;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(key);reject(new Error('CDP timeout: '+method));},60000);
    pending.set(key,{resolve:r=>{clearTimeout(timer);resolve(r);},reject});
    socket.send(JSON.stringify({id:key,method,params}));
  });
}
async function evaluate(expression) {
  const value=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(value.exceptionDetails)throw new Error(value.exceptionDetails.text);
  return value.result.value;
}
async function until(expression) {
  for(let i=0;i<150;i++){if(await evaluate(expression))return;await wait(500);}
  throw new Error('Preview did not become ready: '+expression);
}
(async()=>{
  await listening;
  let pages;
  for(let i=0;i<50;i++){try{pages=await(await fetch('http://127.0.0.1:9238/json/list')).json();if(pages.length)break;}catch{}await wait(200);}
  if(!pages?.length)throw new Error('Edge unavailable');
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  socket.addEventListener('message',event=>{const d=JSON.parse(event.data),p=pending.get(d.id);if(p){pending.delete(d.id);d.error?p.reject(new Error(d.error.message)):p.resolve(d.result);}});
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  await call('Page.enable');await call('Network.enable');
  await call('Network.setBlockedURLs',{urls:['*googleapis.com*','*firebaseio.com*','*firebasedatabase.app*','*cloudinary.com*','wss://*']});
  for(const [scenario,theme,width,height] of [['ready','dark',390,1200],['mixed','dark',390,1200],['offline','dark',390,1200],['mixed','light',1100,1100]]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});
    const url=new URL('http://127.0.0.1:8092/session-2a-preview.html');
    url.searchParams.set('scenario',scenario);url.searchParams.set('theme',theme);
    await call('Page.navigate',{url:url.href});
    await until("document.body.innerText.includes('demo-device-02')");
    await until("!document.body.innerText.includes('□')");
    // Custom entries do not get Expo Router's font preload. Load the installed
    // font explicitly in this QA document; production continues using Paper's provider.
    await evaluate("(async()=>{const response=await fetch(location.origin+'/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf');if(!response.ok)throw new Error('Local icon font unavailable');const font=new FontFace('material-community',await response.arrayBuffer());await font.load();document.fonts.add(font);await document.fonts.ready;return true;})()");
    await evaluate('document.fonts.ready.then(()=>true)');await wait(350);
    const expected=scenario==='ready'?'READY':scenario==='mixed'?'NO LISTO':'Offline';
    if(!await evaluate('document.body.innerText.includes('+JSON.stringify(expected)+')'))throw new Error('Missing state: '+expected);
    if(scenario==='mixed'&&!await evaluate("document.body.innerText.includes('Preparación anterior caducada')"))throw new Error('Missing expired READY notice');
    const {data}=await call('Page.captureScreenshot',{format:'png'});
    const name=`session-2a-${scenario}-${theme}.png`;
    fs.writeFileSync(path.join(__dirname,name),Buffer.from(data,'base64'));console.log('PNG: '+name);
    if(scenario==='ready') {
      await evaluate("(()=>{const input=document.querySelector('input');if(!input||input.maxLength!==64)throw new Error('Role limit changed');const button=document.querySelector('[aria-label=\"Asignar rol a demo-device-01\"]');if(!button)throw new Error('Role action missing');button.click();return true;})()");
      await until("document.body.innerText.includes('Esperando ACK del Node')");
      if(!await evaluate("document.querySelector('[aria-label=\"Asignar rol a demo-device-01\"]').getAttribute('aria-disabled')==='true'"))throw new Error('Role action did not disable during pending ACK');
      console.log('PASS: role input retains maxLength 64; inert assignment shows pending ACK and disables action.');
    }
  }
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await call('Page.navigate',{url:'http://localhost:8091/session/demo-2a'});
  await until("document.body.innerText.includes('Identificadores') && [...document.querySelectorAll('div')].some(e=>getComputedStyle(e).backgroundColor==='rgb(19, 16, 24)')");
  await evaluate('document.fonts.ready.then(()=>true)');await wait(1500);
  const routeCapture=await call('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(__dirname,'session-2a-route-disconnected.png'),Buffer.from(routeCapture.data,'base64'));
  console.log('PNG: session-2a-route-disconnected (actual route; external services blocked)');
  console.log('PASS: isolated component scenarios ready/mixed/offline and light theme rendered; no live session commands.');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{
  try{if(socket?.readyState===1)await call('Browser.close');}catch{}
  socket?.close();processBrowser.kill();
  previewServer.close();
});
