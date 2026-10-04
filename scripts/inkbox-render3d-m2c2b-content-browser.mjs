// Production content: actual product RAF, decoded shipping meshes and real input.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launch, findEdge, sleep } from './cdp.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.resolve(process.env.INKBOX_REPORT_DIR||'reports/m2c2b/pass1/content/edge');
const port=Number(process.env.INKBOX_PORT||4227),base=process.env.INKBOX_URL||`http://127.0.0.1:${port}`;
const report={suite:'M2-C2B production realm content',pass:false,cases:[],startedAt:new Date().toISOString()};
let server,browser;
const page=(body,options)=>browser.js(`return (async()=>{${body}})();`,options);
const frames=n=>page(`for(let i=0;i<${n};i++)await new Promise(requestAnimationFrame);return true;`);
async function snapshot(){return page(`
 const k=window.inkbox,r=k.render3d.renderer,gl=r.gpu.getContext();
 return {digest:await window.__content.v.snapshotDigest(k),triangles:r.gpu.info.render.triangles,drawCalls:r.gpu.info.render.calls,
 memory:{...r.gpu.info.memory},glError:gl.getError(),links:r.gpu.info.programs.map(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS)),
 camera:{position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom},
 stages:[...r.stages.values()].filter(s=>s.visible).map(s=>({plane:s.plane,entities:s.entities.stats,ghosts:s.entities.ghostBatch?.stats,
 ghostMaterial:s.entities.ghostBatch?{transparent:s.entities.ghostBatch.material.transparent,depthWrite:s.entities.ghostBatch.material.depthWrite}:null}))};`);}
async function findActor(spec){return page(`
 const k=window.inkbox,r=k.render3d.renderer,T=window.__content.T,v=window.__content.v,spec=${JSON.stringify(spec)};
 r.setActivePlane(spec.plane);r.setLODEnabled(true);r.setProductionAssetsEnabled(true);
 const stage=r.stages.get(spec.plane),world=stage.world;
 const candidates=world.entities.filter(e=>spec.kind==='cultivator'?e.level>0:spec.kind==='ghostCultivator'?e.soulKind==='ghostCultivator':e.soulKind==='ghost');
 const zooms=spec.lod===0?[24,18,32]:spec.lod===1?[6,9,4]:[.75,1,1.4];
 for(const actor of candidates)for(const zoom of zooms)for(const yaw of [.2,1.8,3.5]){
  const pose=v.applyCamera(r,'ENTITY_CLOSE',{poi:{x:actor.x,y:actor.y,id:actor.id,source:'real-'+spec.kind},polar:.9,yaw,zoom});
  for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);
  r.scene.updateMatrixWorld(true);r.cameraRig.camera.updateMatrixWorld(true);
  const meshes=[];stage.entities.group.traverse(m=>{if(m.isInstancedMesh&&m.count&&m.visible&&m.userData.lod===spec.lod)meshes.push(m);});
  const blockers=[];r.scene.traverse(m=>{if(!m.isMesh||m.renderOrder>5||m.isInstancedMesh&&!m.count||m.material?.transparent)return;
    for(let p=m;p;p=p.parent)if(!p.visible)return;blockers.push(m);});
  const ray=new T.Raycaster(),rect=k.render3d.canvas.getBoundingClientRect(),matrix=new T.Matrix4(),combined=new T.Matrix4(),point=new T.Vector3();
  for(const mesh of meshes){
   if(spec.variant!=null&&!mesh.userData.environmentAssetIds?.includes('nether.ghost.'+spec.variant))continue;
   const p=mesh.geometry.attributes.position,ix=mesh.geometry.index,records=mesh.userData.renderEntities||[];
   for(let instance=0;instance<mesh.count;instance++){
    const source=records[instance];if(source?.id!==actor.id||source.identityContainer!=='entities')continue;
    mesh.getMatrixAt(instance,matrix);combined.multiplyMatrices(mesh.matrixWorld,matrix);
    for(let face=0;face<(ix?.count||p.count);face+=3){
     point.set(0,0,0);for(let j=0;j<3;j++)point.add(new T.Vector3().fromBufferAttribute(p,ix?ix.getX(face+j):face+j));
     point.multiplyScalar(1/3).applyMatrix4(combined).project(r.cameraRig.camera);
     const x=(point.x+1)*r.width/2,y=(1-point.y)*r.height/2;
     if(point.z< -1||point.z>1||x<12||y<12||x>r.width-12||y>r.height-12)continue;
     const hit=r.pick(x,y);if(hit?.plane!==spec.plane||hit.kind!=='entity'||hit.entityId!==actor.id)continue;
     ray.setFromCamera(new T.Vector2(point.x,point.y),r.cameraRig.camera);const first=ray.intersectObjects(blockers,false)[0];
     if(first?.object!==mesh||first.instanceId!==instance)continue;
     return {spec,id:actor.id,soulKind:actor.soulKind||null,role:source.appearance?.role||null,node:mesh.name,lod:mesh.userData.lod,
       triangleCount:(ix?.count||p.count)/3,pose,pixel:[x,y],client:[rect.left+x*rect.width/r.width,rect.top+y*rect.height/r.height],
       depth:{mesh:mesh.name,instanceId:instance,distance:first.distance},material:{transparent:mesh.material.transparent,depthWrite:mesh.material.depthWrite},
       actorSoulLamp:spec.kind==='ghostCultivator'&&spec.lod===0?stage.entities.characterBatch.meshes.soul_lamp.userData.renderEntities.some(e=>e.id===actor.id):null};
    }
   }
  }
 }
 throw new Error('No genuinely visible submitted actor '+JSON.stringify(spec));
`,{timeoutMs:180000});}
try{
 fs.mkdirSync(OUT,{recursive:true});
 if(!process.env.INKBOX_URL){
  server=spawn(process.execPath,['scripts/inkbox-server.mjs','--port',String(port)],{cwd:ROOT,windowsHide:true,stdio:'ignore'});
  let ready=false;for(let i=0;i<90;i++){if(server.exitCode!==null)throw new Error('owned server exited');try{ready=(await fetch(`${base}/inkbox.html`)).ok;}catch{}if(ready)break;await sleep(150);}assert(ready);
 }
 const edge=findEdge();assert(edge,'Microsoft Edge required');browser=await launch({url:'about:blank',browser:edge,width:1500,height:940,gpu:true});
 report.browser=browser.meta;await browser.cdp.send('Network.enable');await browser.cdp.send('Page.navigate',{url:`${base}/inkbox.html?renderer=3d&assets=on`});
 assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size',{timeoutMs:30000}));
 await page(`window.__content={v:await import('./src/inkbox/render3d/art/VisualScenarios.js'),T:await import('three')};return true;`);
 for(let startStep=0;startStep<7200;startStep+=900){report.scenario=await page(`return window.__content.v.applyScenarioAsync(window.inkbox,'NETHER_STYLE_A',{startStep:${startStep},stepCount:900});`,{timeoutMs:180000});console.log('Natural Nether days '+report.scenario.worldDay);}
 assert(report.scenario.complete&&report.scenario.coverage.ghostCultivators>0);
 report.prepared=await page(`const k=window.inkbox,r=k.render3d.renderer;for(let i=0;i<180&&r.world!==k.world;i++)await new Promise(requestAnimationFrame);
  if(r.world!==k.world)throw new Error('product has not adopted natural world');await r.environmentLoadPromise;await r.characterLoadPromise;
  if(r.environmentLoadError||r.characterLoadError)throw r.environmentLoadError||r.characterLoadError;
  r.setArtProfile('realm-style-v1');r.setProductionAssetsEnabled(true);k.render3d.mode='inspect';k.render3d.panel.querySelector('select').value='inspect';
  window.__content.inspect=k.inspectPlaneSubject;window.__content.at=k.inspectPlaneAt;
  k.inspectPlaneSubject=function(plane,ref){window.__content.hit={plane,ref:{...ref}};return window.__content.inspect.call(this,plane,ref);};
  k.inspectPlaneAt=function(...args){window.__content.fallback=true;return window.__content.at.apply(this,args);};
  return {digest:await window.__content.v.snapshotDigest(k),upper:k.world.upper.entities.length,nether:k.world.nether.entities.length,
  characterBody:r.characterLibrary.roles.basic.body,ghostBody:r.characterLibrary.roles.ghost.body,characterModules:r.characterLibrary.modules.size};`);
 assert.equal(report.prepared.characterBody,report.prepared.ghostBody);
 const specs=[...[0,1].map(lod=>({plane:'upper',kind:'cultivator',lod})),...[0,1].map(lod=>({plane:'nether',kind:'ghostCultivator',lod})),
  ...[0,1,2].map(variant=>({plane:'nether',kind:'ghost',variant,lod:0})),{plane:'nether',kind:'ghost',lod:1},{plane:'nether',kind:'ghost',lod:2}];
 for(const spec of specs){
  const found=await findActor(spec);console.log('Found '+found.node+' id '+found.id);
  await page('window.__content.hit=null;window.__content.fallback=false;return true;');await browser.click(...found.client);await frames(3);
  const inspected=await page(`const p=document.getElementById('inkInspect');return {hit:window.__content.hit,fallback:!!window.__content.fallback,panel:{on:p.classList.contains('on'),kind:p.dataset.subjectKind,id:p.dataset.subjectId,plane:p.dataset.plane}};`);
  assert.equal(inspected.hit?.plane,spec.plane);assert.equal(inspected.hit?.ref.entityId,found.id);assert.equal(inspected.hit?.ref.entityContainer,'entities');assert.equal(inspected.fallback,false);
  assert(inspected.panel.on);assert.equal(inspected.panel.kind,'entity');assert.equal(inspected.panel.id,String(found.id));
  if(spec.kind==='ghost'){assert.equal(found.material.transparent,false);assert(found.material.depthWrite);}
  if(spec.kind==='ghostCultivator'&&spec.lod===0)assert(found.actorSoulLamp);
  const on=await snapshot();const file=path.join(OUT,`${spec.plane}-${spec.kind}-${spec.variant??'any'}-lod${spec.lod}.png`);await browser.screenshot(file);
  await page('document.getElementById("inkInspectClose")?.click();window.inkbox.render3d.renderer.setProductionAssetsEnabled(false);return true;');await frames(6);
  const off=await snapshot();assert.equal(on.digest.value,off.digest.value);assert.equal(on.digest.value,report.prepared.digest.value);
  const cameraError=Math.max(...on.camera.position.map((x,i)=>Math.abs(x-off.camera.position[i])),...on.camera.target.map((x,i)=>Math.abs(x-off.camera.target[i])));
  assert(cameraError<=1e-10,'paired camera moved beyond floating-point roundoff');assert.equal(on.camera.zoom,off.camera.zoom);
  for(const row of [on,off]){assert.equal(row.glError,0);assert(row.links.length&&row.links.every(Boolean));}
  report.cases.push({...found,inspected,on,off,cameraError,image:path.relative(ROOT,file).replaceAll(path.sep,'/'),imageSha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
 }
 const requests=browser.cdp.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request.url);
 report.loads={environment:requests.filter(u=>new URL(u).pathname.endsWith('/environment_library.glb')).length,atlas:requests.filter(u=>new URL(u).pathname.endsWith('/EntityAtlas.png')).length,cultivator:requests.filter(u=>new URL(u).pathname.endsWith('/cultivator_library.glb')).length};
 assert.deepEqual(report.loads,{environment:1,atlas:1,cultivator:1});assert.deepEqual(browser.errors(),[]);
 report.pass=true;console.log('PASS real Upper/ghostCultivator/three opaque Ghost Family variants; all actual LODs, real clicks and unchanged World');
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;}
finally{
 if(browser){report.errors=browser.errors();report.consoleErrors=browser.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type==='error').map(e=>e.params.args.map(a=>a.value||a.description).join(' '));if(report.consoleErrors.length){report.pass=false;process.exitCode=1;}
  try{await page('const k=window.inkbox;if(window.__content?.inspect)k.inspectPlaneSubject=window.__content.inspect;if(window.__content?.at)k.inspectPlaneAt=window.__content.at;return true;');}catch{}await browser.close();}
 server?.kill();report.finishedAt=new Date().toISOString();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(report,null,2)+'\n');
}
