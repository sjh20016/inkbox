// Serial production Edge suites; one controlled local server, fresh browser per suite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sleep} from './cdp.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.resolve(process.env.INKBOX_REPORT_DIR||'reports/m2c2b/pass1/browser');
const port=Number(process.env.INKBOX_PORT||4232),base=`http://127.0.0.1:${port}`;
const suites=[['houses','sample-browser',{INKBOX_FAMILY_MATRIX:'1'}],['hall','sample-browser',{INKBOX_HALL_MATRIX:'1'}],
 ['content','content-browser',{}],['artifacts','content-browser',{INKBOX_ARTIFACT_MATRIX:'1'}],['decorations','decorations-browser',{}],['matrix','matrix',{}]];
const report={suite:'M2-C2B Pass1 serial production Edge',pass:false,startedAt:new Date().toISOString(),suites:[]};
let server;
try{
 fs.mkdirSync(OUT,{recursive:true});server=spawn(process.execPath,['scripts/inkbox-server.mjs','--port',String(port)],{cwd:ROOT,stdio:'ignore',windowsHide:true});
 let ready=false;for(let i=0;i<90;i++){if(server.exitCode!==null)throw new Error('owned server exited');try{ready=(await fetch(`${base}/inkbox.html`)).ok;}catch{}if(ready)break;await sleep(150);}assert(ready);
 for(const [name,suffix,extra] of suites){
  const dir=path.join(OUT,name);assert(!fs.existsSync(dir),'fresh evidence directory required: '+dir);
  const log=fs.createWriteStream(path.join(OUT,name+'.log')),script=`scripts/inkbox-render3d-m2c2b-${suffix}.mjs`;
  const child=spawn(process.execPath,[script],{cwd:ROOT,windowsHide:true,env:{...process.env,INKBOX_URL:base,INKBOX_REPORT_DIR:dir,INKBOX_FAMILY_MATRIX:'0',INKBOX_HALL_MATRIX:'0',INKBOX_ARTIFACT_MATRIX:'0',...extra},stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{log.write(data);process.stdout.write(data);});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});await new Promise(resolve=>log.end(resolve));
  report.suites.push({name,script,exitCode:code});assert.equal(code,0,name+' Edge gate failed');
 }report.pass=true;
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;}
finally{server?.kill();report.finishedAt=new Date().toISOString();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'browser-summary.json'),JSON.stringify(report,null,2)+'\n');}
