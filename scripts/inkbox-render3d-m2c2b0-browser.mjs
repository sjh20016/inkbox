// Serial real-GPU matrix. Each child owns and closes its browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { sleep } from './cdp.mjs';
import { pngDiagnostics } from './inkbox-png-diagnostics.mjs';
import { REALM_STYLES } from '../src/inkbox/render3d/art/RealmStyleProfile.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.env.INKBOX_REPORT_DIR||path.join(root,'reports/m2c2b0/browser',new Date().toISOString().replaceAll(/[:.]/g,'-')));
const port=Number(process.env.INKBOX_PORT||4214),base=process.env.INKBOX_URL||`http://127.0.0.1:${port}`;
const report={startedAt:new Date().toISOString(),pass:false,suites:[],cases:[],visualReview:'Automated diagnostics only; root reviews representative PNGs before sealing the baseline.'};
let server;
const relative=f=>path.relative(root,f).replaceAll(path.sep,'/');
function run(script,env){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script],{cwd:root,env:{...process.env,...env},stdio:'inherit',windowsHide:true});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`${script}: exit ${code}`)));});}
try {
  fs.mkdirSync(output,{recursive:true});
  if(!process.env.INKBOX_URL){server=spawn(process.execPath,['scripts/inkbox-server.mjs','--port',String(port)],{cwd:root,stdio:'ignore',windowsHide:true});
    let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch(`${base}/inkbox.html`)).ok;}catch{}if(ready)break;await sleep(150);}assert(ready,'server startup failed');}
  const suites=[['mortal','scripts/inkbox-realm-style-proof.mjs',7,{}],['nether','scripts/inkbox-realm-plane-proof.mjs',4,{INKBOX_PLANE:'nether'}],
    ['upper','scripts/inkbox-realm-plane-proof.mjs',5,{INKBOX_PLANE:'upper'}],['cross','scripts/inkbox-realm-cross-proof.mjs',8,{}]];
  for(const [name,script,expected,extra] of suites){const dir=path.join(output,name);assert(!fs.existsSync(dir),'matrix requires fresh child directories');
    await run(script,{INKBOX_URL:base,INKBOX_REPORT_DIR:dir,...extra});const evidenceFile=path.join(dir,'evidence.json'),e=JSON.parse(fs.readFileSync(evidenceFile));
    assert(e.pass,`${name} proof failed`);assert.equal(e.cases.length,expected);assert.deepEqual(e.consoleErrors||[],[]);assert.deepEqual(e.runtimeErrors||[],[]);
    assert(e.worldUnchanged||e.worldUnchangedAfterWindow||e.worldUnchangedThroughoutPurePhase,`${name} purity unavailable`);
    report.suites.push({name,evidence:relative(evidenceFile),pass:true,pairs:e.cases.length,resize:e.resize||null,
      digest:(e.finalWorldDigest||e.finalDigest).value,legitimateWindowSetupMayChangeWorld:name!=='mortal'});
    for(const pair of e.cases){assert(pair.sameCameraPose);assert.equal(pair.legacy.renderer.triangles,pair.v1.renderer.triangles,`${pair.name}: triangle drift`);
      assert.equal(pair.legacy.renderer.drawCalls,pair.v1.renderer.drawCalls,`${pair.name}: draw drift`);
      const item={suite:name,name:pair.name,sameCameraPose:true,sameTriangles:true,sameDrawCalls:true,profiles:[]};
      for(const row of [pair.legacy,pair.v1]){const file=path.isAbsolute(row.file)?row.file:row.file.startsWith('reports/')?path.join(root,row.file):path.join(dir,row.file);
        const stat=fs.statSync(file);assert(stat.mtimeMs>=Date.parse(e.generatedAt)-1000,`${pair.name}: stale screenshot`);
        assert.equal(row.renderer.glError,0);assert(row.renderer.fogIsNull);assert(row.renderer.programs.length&&row.renderer.programs.every(p=>p.linked===true));
        const plane=name==='cross'?pair.targetPlane:name,palette=REALM_STYLES[plane].terrain.palette;
        item.profiles.push({profile:row.profile,file:relative(file),sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
          capturedAt:stat.mtime.toISOString(),triangles:row.renderer.triangles,drawCalls:row.renderer.drawCalls,cpuUpdate:row.renderer.cpuUpdate,
          productCalls:row.renderer.productCalls,image:pngDiagnostics(file,palette)});
      }report.cases.push(item);
    }
  }
  assert.equal(report.cases.length,24);
  report.pass=true;console.log(`C2B0 visual matrix PASS: 24 pairs / 48 fresh PNGs; ${relative(output)}`);
}catch(error){report.failure=error.stack||String(error);process.exitCode=1;console.error(report.failure);}
finally{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'matrix.json'),JSON.stringify(report,null,2));server?.kill();}
