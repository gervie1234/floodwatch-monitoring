import {copyFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const frontend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(frontend,'..');
await mkdir(path.join(frontend,'public/assets/parts'),{recursive:true});
await mkdir(path.join(frontend,'public/downloads'),{recursive:true});
for(const part of ['esp32','sensor','gps','buzzer','powerbank','solar','enclosure','jumpers']){
 await copyFile(path.join(root,'docs/assets',part+'.png'),path.join(frontend,'public/assets/parts',part+'.png'));
}
await copyFile(path.join(root,'output/pdf/FloodWatch_Device_Build_Tutorial.pdf'),path.join(frontend,'public/downloads/FloodWatch-Device-Tutorial.pdf'));
console.log('Prepared only FloodWatch component images and device tutorial.');
