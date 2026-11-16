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
  fs.writeFileSync(path.join(__dirname,name+'.png'),Buffer.from(data,'base64'));
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
    if(listener){pending.delete(data.id);data.error?listener.reject(new Error(data.error.message)):listener.resolve(data.result);}
  });
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  await call('Page.enable');
  await call('Network.enable');
  // This isolated preview must not call real account, media or relay services.
  await call('Network.setBlockedURLs',{urls:['*googleapis.com*','*firebaseio.com*','*firebasedatabase.app*','*cloudinary.com*','wss://*']});
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await call('Page.navigate',{url:'http://localhost:8091'});
  // SSR already contains the title. Wait for hydration/effects and the requested theme,
  // otherwise clicks can be no-ops and screenshots only show the server placeholder.
  await waitFor("document.body.innerText.includes('Tus sesiones.') && !document.body.innerText.includes('Preparando Studio…')",'client hydration');
  await waitFor("[...document.querySelectorAll('div')].some(e=>getComputedStyle(e).backgroundColor==='rgb(19, 16, 24)')",'dark theme');
  await evaluate('document.fonts.ready.then(()=>true)');
  await shot('studio-dark-mobile');
  const click = label => evaluate(`(()=>{const b=[...document.querySelectorAll('[role="button"],button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!b||b.getAttribute('aria-disabled')==='true')throw new Error('Button unavailable');b.click();return true;})()`);
  await click('Ingresar por código');
  await waitFor("[...document.querySelectorAll('input')].some(e=>e.getClientRects().length>0)",'visible code form');
  await shot('studio-dark-code');
  await click('Ingresar por código');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
  await waitFor("![...document.querySelectorAll('div')].some(e=>getComputedStyle(e).backgroundColor==='rgb(19, 16, 24)')",'light theme');
  await shot('studio-light-mobile');
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await waitFor("[...document.querySelectorAll('div')].some(e=>getComputedStyle(e).backgroundColor==='rgb(19, 16, 24)')",'desktop dark theme');
  await shot('studio-dark-desktop');
  console.log('PASS: actual Studio rendered; code form opened/closed; light/dark screenshots saved. External services blocked.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  try {if(socket?.readyState===1)await call('Browser.close');}catch{}
  socket?.close();browser.kill();
});
