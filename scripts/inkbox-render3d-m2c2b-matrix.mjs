// Pass1: strict Edge, paired geometry switches and real product-loop timings.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {launch,findEdge,sleep} from './cdp.mjs';
import {sampleBody} from './inkbox-product-frame-timing.mjs';
import {waitForIdlePresentation} from './inkbox-browser-steady-view.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.resolve(process.env.INKBOX_REPORT_DIR||'reports/m2c2b/pass1/matrix');
const port=Number(process.env.INKBOX_PORT||4230),base=process.env.INKBOX_URL||`http://127.0.0.1:${port}`;
const specs=[
 {scenario:'GOLDEN_A',plane:'mortal',kind:'overview',zoom:1.45},
 {scenario:'DENSITY_A',plane:'mortal',kind:'density',zoom:1.45},
 {scenario:'GOLDEN_A',plane:'mortal',kind:'near',zoom:18},
 {scenario:'GOLDEN_A',plane:'mortal',kind:'mid',zoom:6},
 {scenario:'GOLDEN_A',plane:'mortal',kind:'hlod-far',zoom:.5},
 {scenario:'DENSITY_A',plane:'mortal',kind:'forest-mixed',zoom:9},
 {scenario:'GOLDEN_A',plane:'upper',kind:'overview',zoom:1.45},
 {scenario:'GOLDEN_A',plane:'upper',kind:'highland-close',zoom:9},
 {scenario:'GOLDEN_A',plane:'upper',kind:'entity-close',zoom:18},
 {scenario:'GOLDEN_A',plane:'upper',kind:'decoration-stress',zoom:7},
 {scenario:'GOLDEN_A',plane:'upper',kind:'upper-window',zoom:1.45,window:true},
 {scenario:'NETHER_STYLE_A',plane:'nether',kind:'overview',zoom:1.45},
 {scenario:'NETHER_STYLE_A',plane:'nether',kind:'ghost-close',zoom:18},
 {scenario:'NETHER_STYLE_A',plane:'nether',kind:'ghost-stress',zoom:7},
 {scenario:'NETHER_STYLE_A',plane:'nether',kind:'artifact-close',zoom:18},
 {scenario:'NETHER_STYLE_A',plane:'nether',kind:'nether-window',zoom:1.45,window:true},
 {scenario:'NETHER_STYLE_A',plane:'upper',kind:'cross-upper-large',zoom:1.45,window:true},
 {scenario:'NETHER_STYLE_A',plane:'nether',kind:'cross-nether-large',zoom:1.45,window:true},
 {scenario:'NETHER_STYLE_A',plane:'nether',kind:'breach-near',zoom:9,window:true,breach:true},
 {scenario:'NETHER_STYLE_A',plane:'nether',kind:'breach-far',zoom:1.45,window:true,breach:true},
 {scenario:'NETHER_STYLE_A',plane:'upper',kind:'oblique-boundary',zoom:1.45,window:true,polar:1.1,yaw:1.5},
];
const report={suite:'M2-C2B Pass1 performance/ownership matrix',pass:false,startedAt:new Date().toISOString(),
 method:'1500x940 DPR1; production-off/on paired unchanged full World and camera; 120 actual product frames per side; bounded asynchronous GPU timers; no additional update/render calls',cases:[],scenarios:[]};
let browser,server,currentScenario;
const page=(s,options)=>browser.js(`return (async()=>{${s}})();`,options);
async function prepare(name){
 if(currentScenario===name)return;
 let recipe;
 if(name==='NETHER_STYLE_A')for(let startStep=0;startStep<7200;startStep+=900){recipe=await page(`return window.__matrix.v.applyScenarioAsync(window.inkbox,'NETHER_STYLE_A',{startStep:${startStep},stepCount:900});`,{timeoutMs:180000});console.log('Natural Nether day '+recipe.worldDay);}
 else recipe=await page(`return window.__matrix.v.applyScenario(window.inkbox,${JSON.stringify(name)});`,{timeoutMs:180000});
 const setup=await page(`const k=window.inkbox,r=k.render3d.renderer;for(let i=0;i<180&&r.world!==k.world;i++)await new Promise(requestAnimationFrame);
  if(r.world!==k.world)throw new Error('World not adopted');await r.environmentLoadPromise;await r.characterLoadPromise;
  if(r.environmentLoadError||r.characterLoadError)throw r.environmentLoadError||r.characterLoadError;
  r.setArtProfile('realm-style-v1');r.setBoundaryMode('strata');r.setLODEnabled(true);return {digest:await window.__matrix.v.snapshotDigest(k),libraryModules:r.environmentLibrary.modules.size};`);
 report.scenarios.push({name,recipe,setup});currentScenario=name;
}
async function configure(spec){return page(`
 const k=window.inkbox,r=k.render3d.renderer,v=window.__matrix.v,spec=${JSON.stringify(spec)},s=r.stages.get(spec.plane),w=s.world;
 k.selectTool('inspect');k.selection=null;r.setRealmViewState(k.getRealmViewState());r.setActivePlane(spec.plane);
 r.setProductionAssetsEnabled(true);r.setDecorationsEnabled(true);r.setLODEnabled(false);
 let poi={x:(w.w-1)/2,y:(w.h-1)/2,source:'real-world-bounds'};
 if(['near','mid','hlod-far'].includes(spec.kind)){const village=[...w.villages].sort((a,b)=>(b.houses?.length||0)-(a.houses?.length||0))[0];if(!village?.houses?.length)throw new Error('no real village');poi={x:village.x,y:village.y,id:village.id,source:'densest-real-village'};}
 if(spec.kind==='highland-close'){let cell=0;for(let i=1;i<w.height.length;i++)if(w.height[i]>w.height[cell])cell=i;poi={x:cell%w.w,y:Math.floor(cell/w.w),source:'actual-highest-terrain'};}
 if(spec.kind==='entity-close'||spec.kind==='ghost-close'){const e=w.entities.find(e=>spec.kind==='ghost-close'?e.soulKind==='ghost':e.level>0);if(!e)throw new Error('missing real entity');poi={x:e.x,y:e.y,id:e.id,source:'real-'+spec.kind};}
 if(spec.kind==='artifact-close'){const e=w.artifacts[0];if(!e)throw new Error('missing actual artifact');poi={x:e.x,y:e.y,id:e.id,source:'real-ground-artifact'};}
 if(['forest-mixed','ghost-stress','decoration-stress'].includes(spec.kind)){
  const rows=spec.kind==='forest-mixed'?(await import('./src/inkbox/render3d/vegetation/deriveVegetation.js')).deriveVegetation(w):spec.kind==='ghost-stress'?w.entities.filter(e=>e.soulKind==='ghost'):s.decorations.layout;
  const tile=spec.kind==='forest-mixed'?16:24,counts=new Map();for(const e of rows){const key=Math.floor(e.x/tile)+','+Math.floor(e.y/tile);counts.set(key,(counts.get(key)||0)+1);}
  const best=[...counts].sort((a,b)=>b[1]-a[1])[0];if(!best)throw new Error('empty natural stress layout');const [x,y]=best[0].split(',').map(Number);poi={x:x*tile+tile/2,y:y*tile+tile/2,source:'densest-natural-'+spec.kind,count:best[1]};
 }
 const beforeUI=await v.snapshotDigest(k),riftsBefore=k.world.rifts.length;let riftGrowth=null;
 if(spec.breach&&!window.__matrix.breachReady){
  const dayBefore=k.world.day;r.setActivePlane('mortal');k.selectTool('viewNether');
  k.commitSelection([[Math.floor(w.w*.22),Math.floor(w.h*.22)],[Math.ceil(w.w*.78),Math.floor(w.h*.22)],[Math.ceil(w.w*.78),Math.ceil(w.h*.78)],[Math.floor(w.w*.22),Math.ceil(w.h*.78)]]);
  for(let batch=0;batch<12;batch++){for(let i=0;i<30;i++)k.advanceDays(3);await new Promise(requestAnimationFrame);}
  for(let i=0;i<12;i++)await new Promise(requestAnimationFrame);window.__matrix.breachReady=true;
  riftGrowth={method:'normal player window and 360 ordinary advanceDays(3) calls; no synthetic rift or edits to age/strength/radius',dayBefore,dayAfter:k.world.day};
 }
 if(spec.window){
  r.setActivePlane('mortal');k.selectTool(spec.plane==='upper'?'viewUpper':'viewNether');
  let x0=Math.floor(w.w*.2),x1=Math.floor(w.w*.8),y0=Math.floor(w.h*.2),y1=Math.floor(w.h*.8);
  if(spec.breach){const rift=k.world.rifts.find(f=>f.targetPlane===spec.plane&&f.closedDay===-1&&f.age>0&&f.x>2&&f.x<w.w-3&&f.y>2&&f.y<w.h-3);
   if(!rift)throw new Error('no natural active rift');x0=Math.max(1,Math.floor(rift.x));x1=Math.min(w.w-2,x0+60);y0=Math.max(1,Math.floor(rift.y)-20);y1=Math.min(w.h-2,y0+40);poi={x:rift.x,y:rift.y,id:rift.id,source:'natural-active-rift'};}
  k.commitSelection([[x0,y0],[x1,y0],[x1,y1],[x0,y1]]);for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);
  if(!r.realmPrototype.open||r.realmPrototype.targetPlane!==spec.plane)throw new Error('normal window failed');
  if(spec.breach&&!(r.boundary.stats.breachEdges>0))throw new Error('natural rift does not overlap window boundary');
 }
 const camera=v.applyCamera(r,'WORLD_OVERVIEW',{poi,zoom:spec.zoom,polar:spec.polar??(['near','mid','ghost-close','artifact-close'].includes(spec.kind)?.88:.52),yaw:spec.yaw??.15});
 for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);r.setLODEnabled(true);for(let i=0;i<12;i++)await new Promise(requestAnimationFrame);
 const idle=await (${waitForIdlePresentation.toString()})(r);
 return {camera,idle,beforeUI,riftGrowth,riftsBefore,riftsAfter:k.world.rifts.length,digest:await v.snapshotDigest(k)};
`,{timeoutMs:180000});}
async function inspect(){return page(`
 const k=window.inkbox,r=k.render3d.renderer,T=window.__matrix.T,d=window.__matrix.d,visible=[...r.stages.values()].filter(s=>s.visible),gl=r.gpu.getContext();
 const camera={position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom};
 const stages=visible.map(s=>{
  const layers=[s.entities?.group,s.settlements?.group,s.realmArtifacts?.group],owned=(row)=>!s.regionGeometry||s.regionGeometry.isInsideCell(row.x,row.y)===s.regionInside;
  let records=0,wrongOwner=0,hlodMembers=0,identityMismatch=0;
  for(const group of layers)group?.traverse(m=>{if(!m.isInstancedMesh||!m.visible||!m.count)return;
   const rows=m.userData.renderEntities||m.userData.renderBuildings||m.userData.renderArtifacts||m.userData.renderSettlements||[];
   for(let i=0;i<m.count;i++){const row=rows[i];if(!row)continue;records++;if(!owned(row))wrongOwner++;
    if(row.members){for(const index of row.buildings||row.members){const member=s.settlements.lastDerived.buildings[index];hlodMembers++;if(!member||member.settlementId!==row.settlementId||!owned(member))identityMismatch++;}}
   }
  });
  const decorative=[...(s.decorations?.batch?.meshes.values()||[])].flatMap(m=>m.userData.decorativeOnly||[]),decorationOwned=decorative.every(row=>d.decorationFootprintOwned(s.world,s.regionGeometry,s.regionInside,row));
  return {plane:s.plane,tree:s.vegetation?.stats,characters:s.entities?.stats,ghosts:s.entities?.ghostBatch?.stats,building:s.settlements?.stats,environment:s.settlements?.environmentBatch?.stats,decorations:s.decorations?.stats,artifacts:s.realmArtifacts?.stats,
   records,wrongOwner,hlodMembers,identityMismatch,decorationOwned,decorationFakeIdentity:decorative.some(x=>x.id!=null||x.siteId!=null),
   palette:s.environmentMaterial?.uniforms.uEnvironmentPalette.value.map(c=>c.getHexString()),terrainPalette:s.terrain.inkMaterial?.uniforms.palette.value.map(c=>c.getHexString())};
 });
 let seamMax=0,seamValues=0;const target=r.realmPrototype.open?r.stages.get(r.realmPrototype.targetPlane):null,b=r.boundary;
 if(target&&b.mesh.visible){let edge=0;for(const {ax,ay,bx,by} of target.regionGeometry.boundaryEdges()){
  for(const [i,x,y] of [[0,ax,ay],[2,bx,by]]){const top=target.elevation.node(x,y),bottom=r.stages.get('mortal').elevation.node(x,y),p=b.position.array;
   seamMax=Math.max(seamMax,Math.abs(p[(edge*4+i)*3+1]-top),Math.abs(p[(edge*4+i+1)*3+1]-bottom));seamValues+=2;}edge++;}
 }
 let pickSamples=0,pickMismatches=0;for(let iy=0;iy<8;iy++)for(let ix=0;ix<10;ix++){
  const hit=r.pick(r.width*(.08+.84*ix/9),r.height*(.08+.84*iy/7));if(!hit)continue;pickSamples++;
  if(hit.kind==='realm-boundary')continue;const stage=r.stages.get(hit.plane);if(!stage?.visible)pickMismatches++;
  if(hit.entityId!=null&&!stage.world[hit.entityContainer||'entities']?.some(e=>e.id===hit.entityId))pickMismatches++;
  if(hit.artifactId!=null&&!stage.world.artifacts?.some(e=>e.id===hit.artifactId))pickMismatches++;
 }
 return {camera,stages,seamMax,seamValues,boundary:{...b.stats},pickSamples,pickMismatches,fogIsNull:r.scene.fog===null,glError:gl.getError(),links:r.gpu.info.programs.map(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS)),resources:{...r.gpu.info.memory,programs:r.gpu.info.programs.length},
 resolution:{viewport:[innerWidth,innerHeight],renderer:[r.width,r.height],dpr:r.gpu.getPixelRatio()}};
`);}
try{
 fs.mkdirSync(OUT,{recursive:true});if(!process.env.INKBOX_URL){server=spawn(process.execPath,['scripts/inkbox-server.mjs','--port',String(port)],{cwd:ROOT,windowsHide:true,stdio:'ignore'});let ready=false;for(let i=0;i<90;i++){if(server.exitCode!==null)throw new Error('owned server exited');try{ready=(await fetch(`${base}/inkbox.html`)).ok;}catch{}if(ready)break;await sleep(150);}assert(ready);}
 const edge=findEdge();assert(edge,'Microsoft Edge required');browser=await launch({url:'about:blank',browser:edge,width:1500,height:940,gpu:true});report.browser=browser.meta;
 await browser.cdp.send('Network.enable');await browser.cdp.send('Page.navigate',{url:`${base}/inkbox.html?renderer=3d&assets=on&boundary=strata`});
 assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size',{timeoutMs:60000}));
 await page(`window.__matrix={v:await import('./src/inkbox/render3d/art/VisualScenarios.js'),d:await import('./src/inkbox/render3d/environment/RealmDecorationLayer.js'),T:await import('three')};return true;`);
 for(const spec of specs){
  await prepare(spec.scenario);const pose=await configure(spec),sides={};
  for(const production of [false,true]){
   await page(`const r=window.inkbox.render3d.renderer;r.setProductionAssetsEnabled(${production});for(let i=0;i<36;i++)await new Promise(requestAnimationFrame);
    let last='',stable=0;for(let i=0;i<120&&stable<8;i++){await new Promise(requestAnimationFrame);const key=JSON.stringify([r.gpu.info.render.triangles,r.gpu.info.render.calls,r.getLODStats()]);stable=key===last?stable+1:0;last=key;}if(stable<8)throw new Error('draw/LOD did not settle');return true;`);
   const measured=await browser.js('return (async()=>{'+sampleBody(spec.kind+'/'+production)+'})();',{timeoutMs:180000});
   const checks=await inspect();assert.equal(measured.digest,pose.digest.value);assert.equal(measured.glError,0);assert.equal(checks.glError,0);
   assert(checks.links.length&&checks.links.every(Boolean));assert(checks.fogIsNull);assert(checks.seamMax<=1e-5,'boundary seam exceeds float32 precision');
   assert.equal(checks.pickMismatches,0);assert(checks.stages.every(s=>!s.wrongOwner&&!s.identityMismatch&&s.decorationOwned&&!s.decorationFakeIdentity));
   assert.equal(checks.resolution.dpr,1);sides[production?'on':'off']={measured,checks};
  }
  const delta=Math.max(...sides.on.checks.camera.position.map((x,i)=>Math.abs(x-sides.off.checks.camera.position[i])),...sides.on.checks.camera.target.map((x,i)=>Math.abs(x-sides.off.checks.camera.target[i])));
  assert(delta<=1e-10);assert.equal(sides.on.checks.camera.zoom,sides.off.checks.camera.zoom);
  for(let i=0;i<sides.on.checks.stages.length;i++){assert.deepEqual(sides.on.checks.stages[i].palette,sides.off.checks.stages[i].palette);assert.deepEqual(sides.on.checks.stages[i].terrainPalette,sides.off.checks.stages[i].terrainPalette);}
  if(spec.kind==='hlod-far')assert(sides.on.checks.stages[0].environment.hlod>0,'production HLOD far case must submit real aggregates');
  const file=path.join(OUT,`${String(report.cases.length+1).padStart(2,'0')}-${spec.plane}-${spec.kind}.png`);await browser.screenshot(file);
  report.cases.push({spec,pose,...sides,cameraError:delta,image:path.relative(ROOT,file).replaceAll(path.sep,'/'),imageSha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
  fs.writeFileSync(path.join(OUT,'matrix-progress.json'),JSON.stringify(report));console.log(`PASS ${spec.plane}/${spec.kind} triangles ${sides.off.measured.triangles}->${sides.on.measured.triangles} calls ${sides.off.measured.drawCalls}->${sides.on.measured.drawCalls}`);
 }
 assert.equal(report.cases.length,21);const urls=browser.cdp.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request.url);
 report.loads={environment:urls.filter(u=>new URL(u).pathname.endsWith('/environment_library.glb')).length,atlas:urls.filter(u=>new URL(u).pathname.endsWith('/EntityAtlas.png')).length,cultivator:urls.filter(u=>new URL(u).pathname.endsWith('/cultivator_library.glb')).length};assert.deepEqual(report.loads,{environment:1,atlas:1,cultivator:1});assert.deepEqual(browser.errors(),[]);report.pass=true;
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;}
finally{if(browser){report.errors=browser.errors();report.consoleErrors=browser.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type==='error').map(e=>e.params.args.map(a=>a.value||a.description).join(' '));if(report.consoleErrors.length){report.pass=false;process.exitCode=1;}await browser.close();}server?.kill();report.finishedAt=new Date().toISOString();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'matrix.json'),JSON.stringify(report,null,2)+'\n');}
