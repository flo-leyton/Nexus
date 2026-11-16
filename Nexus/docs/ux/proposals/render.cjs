/* Renderiza sólo HTML de propuesta con Edge ya instalado. No abre una ventana. */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const allNames = ['01-direcciones','02-operacion','03-estados','04-adaptable','05-soporte','06-permiso-ingreso'];
const names = process.argv.length > 2 ? process.argv.slice(2) : allNames;
if (names.some(name => !allNames.includes(name))) throw new Error('Lámina desconocida.');
for (const name of names) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'nexus-ux-preview-'));
  const target = path.join(__dirname,name+'.png');
  const result = spawnSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
    '--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--hide-scrollbars',
    '--user-data-dir='+profile,'--window-size=1380,1110','--screenshot='+target,
    'file:///'+path.join(__dirname,name+'.html').replaceAll('\\','/'),
  ],{ timeout:45000,encoding:'utf8',windowsHide:true });
  if (result.error || result.status !== 0 || !fs.existsSync(target)) {
    console.error(name+': FAIL',result.error?.message || result.stderr?.slice(-1000));
    process.exitCode = 1;
    break;
  }
  const png = fs.readFileSync(target);
  console.log(name+': PNG '+png.readUInt32BE(16)+' × '+png.readUInt32BE(20)+' · '+png.length+' bytes');
}
