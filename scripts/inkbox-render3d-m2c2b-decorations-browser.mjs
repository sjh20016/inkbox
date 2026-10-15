import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launch,findEdge,sleep } from './cdp.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),OUT=path.resolve(process.env.INKBOX_REPORT_DIR||'reports/m2c2b/pass1/decorations/edge');
const port=Number(process.env.INKBOX_PORT||4228),base=process.env.INKBOX_URL||`http://127.0.0.1:${port}`;
const report={suite:'M2-C2B terrain-only realm decorations',pass:false,cases:[],startedAt:new Date().toISOString()};
let browser,server;
const page=(body,options)=>browser.js(`return (async()=>{${body}})();`,options),frames=n=>page(`for(let i=0;i<${n};i++)await new Promise(requestAnimationFrame);return true;`);
async function snapshot(){return page(`
 const k=window.inkbox,r=k.render3d.renderer,gl=r.gpu.getContext(),d=window.__decor;
 return {digest:await d.v.snapshotDigest(k),camera:{position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom},
 triangles:r.gpu.info.render.triangles,drawCalls:r.gpu.info.render.calls,memory:{...r.gpu.info.memory},glError:gl.getError(),links:r.gpu.info.programs.map(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS)),fogIsNull:r.scene.fog===null,
 stages:[...r.stages.values()].filter(s=>s.visible).map(s=>({plane:s.plane,decorations:s.decorations?.stats,
 owned:s.decorations?[...s.decorations.batch.meshes.values()].flatMap(m=>m.userData.decorativeOnly).every(row=>d.mapping.decorationFootprintOwned(s.world,s.regionGeometry,s.regionInside,row)):true,
 fakeIdentity:s.decorations?[...s.decorations.batch.meshes.values()].flatMap(m=>m.userData.decorativeOnly).some(row=>row.id!=null||row.siteId!=null||row.entityId!=null):false,
 palette:s.environmentMaterial?.uniforms.uEnvironmentPalette.value.map(c=>c.getHexString()),terrainPalette:s.terrain.inkMaterial?.uniforms.palette.value.map(c=>c.getHexString()),
 terrainWash:s.terrain.inkMaterial?{strength:s.terrain.inkMaterial.uniforms.atmosphereStrength.value,low:s.terrain.inkMaterial.uniforms.atmosphereLow.value,high:s.terrain.inkMaterial.uniforms.atmosphereHigh.value}:null}))};`);}
async function configure(spec){return page(`
 const k=window.inkbox,r=k.render3d.renderer,d=window.__decor,spec=${JSON.stringify(spec)},stage=r.stages.get(spec.plane),rows=stage.decorations.layout;
 const beforeUI=await d.v.snapshotDigest(k),riftsBefore=k.world.rifts.length;
 k.selectTool('inspect');k.selection=null;r.setRealmViewState(k.getRealmViewState());r.setActivePlane(spec.plane);r.setDecorationsEnabled(true);r.setProductionAssetsEnabled(true);r.setLODEnabled(true);
 let poi={x:(k.world.w-1)/2,y:(k.world.h-1)/2,source:'real-terrain-bounds'};
 if(spec.kind==='highland'){let cell=0;for(let i=1;i<stage.world.height.length;i++)if(stage.world.height[i]>stage.world.height[cell])cell=i;poi={x:cell%stage.world.w,y:Math.floor(cell/stage.world.w),source:'actual-highest-terrain'};}
 if(spec.kind==='stress'){const tiles=new Map();for(const row of rows){const key=Math.floor(row.x/24)+','+Math.floor(row.y/24);tiles.set(key,(tiles.get(key)||0)+1);}const tile=[...tiles].sort((a,b)=>b[1]-a[1])[0];if(!tile)throw new Error('no natural decoration layout');const [x,y]=tile[0].split(',').map(Number);poi={x:x*24+12,y:y*24+12,source:'densest natural decoration tile',props:tile[1]};}
 if(spec.kind==='entity'){const e=stage.world.entities.find(e=>e.level>0);if(!e)throw new Error('missing real Upper entity');poi={x:e.x,y:e.y,id:e.id,source:'real-upper-entity'};}
 if(spec.kind==='window'){
  r.setActivePlane('mortal');k.selectTool(spec.plane==='upper'?'viewUpper':'viewNether');k.commitSelection([[25,20],[155,20],[155,100],[25,100]]);
  for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);
  if(!r.realmPrototype.open||r.realmPrototype.targetPlane!==spec.plane)throw new Error('normal UI window failed');
 }
 const pose=d.v.applyCamera(r,'WORLD_OVERVIEW',{poi,zoom:spec.zoom,polar:spec.kind==='highland'?.8:.52,yaw:.22});
 for(let i=0;i<12;i++)await new Promise(requestAnimationFrame);return {pose,layout:rows.length,beforeUI,riftsBefore,riftsAfter:k.world.rifts.length,digest:await d.v.snapshotDigest(k)};
`);}
async function visibleProp(){return page(`
 const k=window.inkbox,r=k.render3d.renderer,d=window.__decor,T=d.T,s=r.stages.get('upper'),ray=new T.Raycaster(),matrix=new T.Matrix4(),combined=new T.Matrix4(),point=new T.Vector3();
 k.selectTool('inspect');k.selection=null;r.setRealmViewState(k.getRealmViewState());r.setActivePlane('upper');r.setDecorationsEnabled(true);
 for(const row of s.decorations.layout){
  d.v.applyCamera(r,'WORLD_OVERVIEW',{poi:{x:row.x,y:row.y,source:'actual-terrain-decoration'},zoom:12,polar:.7,yaw:.22});for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);
  r.scene.updateMatrixWorld(true);const blockers=[];r.scene.traverse(m=>{if(!m.isMesh||m.renderOrder>5||m.isInstancedMesh&&!m.count||m.material?.transparent)return;for(let p=m;p;p=p.parent)if(!p.visible)return;blockers.push(m);});
  for(const mesh of s.decorations.batch.meshes.values())if(mesh.count){const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;
   for(let instance=0;instance<mesh.count;instance++){const source=mesh.userData.decorativeOnly[instance];if(source.cell!==row.cell)continue;mesh.getMatrixAt(instance,matrix);combined.multiplyMatrices(mesh.matrixWorld,matrix);
    for(let face=0;face<ix.count;face+=3){point.set(0,0,0);for(let j=0;j<3;j++)point.add(new T.Vector3().fromBufferAttribute(p,ix.getX(face+j)));point.multiplyScalar(1/3).applyMatrix4(combined).project(r.cameraRig.camera);
     if(Math.abs(point.x)>.9||Math.abs(point.y)>.9||Math.abs(point.z)>1)continue;ray.setFromCamera(new T.Vector2(point.x,point.y),r.cameraRig.camera);const first=ray.intersectObjects(blockers,false)[0];if(first?.object!==mesh||first.instanceId!==instance)continue;
     const hit=r.pick((point.x+1)*r.width/2,(1-point.y)*r.height/2);return {node:mesh.name,cell:source.cell,assetId:source.assetId,source:{x:source.x,y:source.y,height:source.height,slope:source.slope,type:source.type},depth:{distance:first.distance,instanceId:instance},pick:{kind:hit?.kind,entityId:hit?.entityId,houseKey:hit?.houseKey,artifactId:hit?.artifactId},owned:d.mapping.decorationFootprintOwned(s.world,s.regionGeometry,s.regionInside,source)};
    }
   }
  }
 }
 throw new Error('No actually visible natural rock surface');
`,{timeoutMs:180000});}
try{
 fs.mkdirSync(OUT,{recursive:true});if(!process.env.INKBOX_URL){server=spawn(process.execPath,['scripts/inkbox-server.mjs','--port',String(port)],{cwd:ROOT,windowsHide:true,stdio:'ignore'});let ready=false;for(let i=0;i<90;i++){if(server.exitCode!==null)throw new Error('owned server exited');try{ready=(await fetch(`${base}/inkbox.html`)).ok;}catch{}if(ready)break;await sleep(150);}assert(ready);}
 const edge=findEdge();assert(edge,'Microsoft Edge required');browser=await launch({url:'about:blank',browser:edge,width:1500,height:940,gpu:true});report.browser=browser.meta;
 await browser.cdp.send('Network.enable');await browser.cdp.send('Page.navigate',{url:`${base}/inkbox.html?renderer=3d&assets=on`});assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size',{timeoutMs:30000}));
 report.prepared=await page(`const k=window.inkbox,r=k.render3d.renderer;window.__decor={v:await import('./src/inkbox/render3d/art/VisualScenarios.js'),mapping:await import('./src/inkbox/render3d/environment/RealmDecorationLayer.js'),T:await import('three')};const spec=window.__decor.v.applyScenario(k,'GOLDEN_A');for(let i=0;i<180&&r.world!==k.world;i++)await new Promise(requestAnimationFrame);await r.environmentLoadPromise;await r.characterLoadPromise;if(r.environmentLoadError||r.characterLoadError)throw r.environmentLoadError||r.characterLoadError;r.setArtProfile('realm-style-v1');return {spec,digest:await window.__decor.v.snapshotDigest(k)};`);
 const specs=[{plane:'upper',kind:'overview',zoom:1.45},{plane:'upper',kind:'highland',zoom:9},{plane:'upper',kind:'entity',zoom:18},{plane:'upper',kind:'stress',zoom:7},{plane:'upper',kind:'window',zoom:1.45},{plane:'nether',kind:'overview',zoom:1.45},{plane:'nether',kind:'window',zoom:1.45}];
 for(const spec of specs){const pose=await configure(spec),on=await snapshot();assert(on.stages.every(s=>s.owned&&!s.fakeIdentity));assert(on.fogIsNull);assert.equal(on.digest.value,pose.digest.value);
  await browser.screenshot(path.join(OUT,`${spec.plane}-${spec.kind}.png`));await page('window.inkbox.render3d.renderer.setDecorationsEnabled(false);return true;');await frames(8);const off=await snapshot();assert.equal(on.digest.value,off.digest.value);
  const cameraError=Math.max(...on.camera.position.map((x,i)=>Math.abs(x-off.camera.position[i])),...on.camera.target.map((x,i)=>Math.abs(x-off.camera.target[i])));assert(cameraError<=1e-10);assert.equal(on.camera.zoom,off.camera.zoom);
  assert(off.stages.every(s=>!s.decorations?.instances));for(let i=0;i<on.stages.length;i++){assert.deepEqual(on.stages[i].palette,off.stages[i].palette);assert.deepEqual(on.stages[i].terrainPalette,off.stages[i].terrainPalette);}
  for(const row of [on,off]){assert.equal(row.glError,0);assert(row.links.length&&row.links.every(Boolean));}
  report.cases.push({spec,pose,on,off,cameraError});console.log('PASS '+spec.plane+'/'+spec.kind+' props '+on.stages.map(s=>s.decorations?.instances||0).join('+'));
 }
 report.visibleProp=await visibleProp();assert(report.visibleProp.owned);
 assert([undefined,'terrain'].includes(report.visibleProp.pick.kind),'non-interactive rock creates no identity, including over a terrain silhouette');
 for(const field of ['entityId','houseKey','artifactId'])assert.equal(report.visibleProp.pick[field],undefined);
 await browser.screenshot(path.join(OUT,'upper-visible-rock.png'));
 report.images=fs.readdirSync(OUT).filter(p=>p.endsWith('.png')).map(p=>({file:p,sha256:createHash('sha256').update(fs.readFileSync(path.join(OUT,p))).digest('hex')}));
 const urls=browser.cdp.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request.url);report.loads={environment:urls.filter(u=>new URL(u).pathname.endsWith('/environment_library.glb')).length,atlas:urls.filter(u=>new URL(u).pathname.endsWith('/EntityAtlas.png')).length};assert.deepEqual(report.loads,{environment:1,atlas:1});
 assert.deepEqual(browser.errors(),[]);report.pass=true;
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;}
finally{if(browser){report.errors=browser.errors();report.consoleErrors=browser.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type==='error').map(e=>e.params.args.map(a=>a.value||a.description).join(' '));if(report.consoleErrors.length){report.pass=false;process.exitCode=1;}await browser.close();}server?.kill();report.finishedAt=new Date().toISOString();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(report,null,2)+'\n');}
