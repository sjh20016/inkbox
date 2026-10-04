// B2: real, naturally evolved Nether style proof. Captures only the product RAF.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.INKBOX_URL || `http://127.0.0.1:${process.env.INKBOX_PORT || 4192}`;
const url = new URL(base);
url.pathname = `${url.pathname.replace(/\/$/, '').replace(/\/inkbox\.html$/i, '')}/inkbox.html`;
url.searchParams.set('renderer', '3d');
const output = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(root, 'reports/m2c2b0/b2-proof'));
const profiles = ['legacy', 'realm-style-v1'];
const samples = 60;
let browser;
const page = body => {
  const expression = `return (async()=>{${body}})();`;
  new vm.Script(`(()=>{${expression}})()`); // Compile every inline page script before CDP.
  return browser.js(expression);
};
const evidence = { generatedAt: new Date().toISOString(), scenario: 'NETHER_STYLE_A', source: url.toString(),
  profiles, samplesPerCase: samples, cases: [],
  provenance: { scenario: 'fresh Sandbox RNG and advanceState; newWorld medium seed 20260923; 7200 x advanceDays(3), yielding every 100',
    rendering: 'product requestAnimationFrame only; no manual Host.update/render',
    visibility: 'frontmost visible nether entity raycast and Host.pick identity',
    purity: 'SHA-256 over full Sandbox World and advanceState before/after presentation changes' } };

async function prepare() {
  await page(`window.__planeProof=await import('./src/inkbox/render3d/art/VisualScenarios.js');return true;`);
  let scenario;
  for (let startStep = 0; startStep < 7200; startStep += 900) {
    scenario = await page(`const k=window.inkbox;return window.__planeProof.applyScenarioAsync(k,'NETHER_STYLE_A',
      {startStep:${startStep},stepCount:900});`);
  }
  assert(scenario.complete && scenario.worldDay >= 21600, 'natural 60-year advance incomplete');
  const setup = await page(`
    const k=window.inkbox,r=k.render3d.renderer;
    for(let i=0;i<180&&r.world!==k.world;i++)await new Promise(requestAnimationFrame);
    if(r.world!==k.world||r.stages.get('nether')?.world!==k.world.nether)throw new Error('product RAF did not adopt natural Nether world');
    await r.characterLoadPromise;if(r.characterLoadError)throw r.characterLoadError;
    r.setLODEnabled(true);r.setArtProfile('legacy');r.setActivePlane('nether');
    for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);
    return {digest:await window.__planeProof.snapshotDigest(k),netherRaw:k.world.nether.entities.length,
      soulKinds:k.world.nether.entities.reduce((o,e)=>(o[e.soulKind||'unknown']=(o[e.soulKind||'unknown']||0)+1,o),{}),
      sourceIds:k.world.nether.entities.slice(0,8).map(e=>({id:e.id,sp:e.sp,soulKind:e.soulKind}))};
  `);
  return { scenario, setup };
}

async function chooseViews(start = 0, count = 8) {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,a=window.__planeProof,T=await import('three');
    const stage=r.stages.get('nether'),w=stage.world;
    const overview={name:'nether-overview',kind:'overview',poi:{x:(w.w-1)/2,y:(w.h-1)/2,source:'nether-world-bounds'},yaw:.15,polar:.52,zoom:1.45};
    let high=0;for(let i=1;i<w.height.length;i++)if(w.height[i]>w.height[high])high=i;
    const cliff={name:'nether-terrain-close',kind:'terrain',poi:{x:high%w.w,y:Math.floor(high/w.w),source:'actual Nether highest terrain cell',cell:high,height:w.height[high]},yaw:.32,polar:.72,zoom:5};
    const candidateScore=e=>{const x=Math.max(1,Math.min(w.w-2,Math.floor(e.x))),y=Math.max(1,Math.min(w.h-2,Math.floor(e.y))),i=y*w.w+x;
      const slope=Math.abs(w.height[i-1]-w.height[i+1])+Math.abs(w.height[i-w.w]-w.height[i+w.w]);
      const edge=Math.max(0,25-Math.min(x,y,w.w-1-x,w.h-1-y))*2;
      return slope*3+edge+Math.hypot(x-w.w/2,y-w.h/2)*.025;};
    const allSource=[...w.entities].filter(e=>Number.isFinite(e.x)&&Number.isFinite(e.y))
      .sort((x,y)=>(y.soulKind==='ghostCultivator')-(x.soulKind==='ghostCultivator')||candidateScore(x)-candidateScore(y)||x.id-y.id);
    const preferred=allSource.filter(e=>e.soulKind==='ghostCultivator');
    const source=preferred.length?preferred:allSource;
    const blockers=[];
    const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;},ray=new T.Raycaster();
    let entityView=null;const attempts=[];
    for(const e of source.slice(${start},${start + count})){
      if(entityView)break;
      const poi={x:e.x,y:e.y,source:'natural nether World entity',id:e.id,soulKind:e.soulKind||null,sp:e.sp};
      // CameraRig caps zoom at 18; use the real product limit, not a requested value that is silently clamped.
      for(const zoom of [18]){
        if(entityView)break;
        for(const polar of [.28,.42,.62,.82]){
          if(entityView)break;
          for(const yaw of [.2,1.77,3.34,4.91]){
          a.applyCamera(r,'ENTITY_CLOSE',{poi,polar,yaw,zoom});
          await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
          r.scene.updateMatrixWorld(true);r.cameraRig.camera.updateMatrixWorld(true);
          blockers.length=0;blockers.push(stage.terrain.mesh);
          stage.entities.group.traverse(o=>{if(o.isInstancedMesh&&o.visible&&o.count&&visible(o))blockers.push(o);});
          for(const lift of [.8,1.25,1.7,2.1]){
            const p=r.coordinates.worldToRender(e.x,e.y,stage.elevation.at(e.x,e.y)+lift),n=new T.Vector3(p.x,p.y,p.z).project(r.cameraRig.camera);
            if(Math.abs(n.x)>.87||Math.abs(n.y)>.87||n.z< -1||n.z>1)continue;
            ray.setFromCamera(new T.Vector2(n.x,n.y),r.cameraRig.camera);
            const first=ray.intersectObjects(blockers,false).find(h=>visible(h.object));
            const front=first?.object.userData.renderEntities?.[first.instanceId];
            const pixel={x:(n.x+1)*r.width/2,y:(1-n.y)*r.height/2},picked=r.pick(pixel.x,pixel.y);
            if(attempts.length<30)attempts.push({id:e.id,zoom,polar,yaw,lift,frontId:front?.id??null,pickedId:picked?.entityId??null,
              mesh:first?.object.name||null,lod:first?.object.userData.lod??null});
            if(front?.id!==e.id||picked?.entityId!==e.id||picked?.plane!=='nether'||first.object.userData.lod!==0)continue;
            entityView={name:'nether-entity-close',kind:'entity',poi,yaw,polar,zoom,
              visibility:{frontmostId:front.id,pickedEntityId:picked.entityId,pickedPlane:picked.plane,pixel,lift,
                mesh:first.object.name,lod:first.object.userData.lod,instanceId:first.instanceId,sourceSoulKind:e.soulKind||null}};break;
          }
          if(entityView)break;
          }
        }
      }
    }
    if(!entityView)return {found:false,nextStart:${start + count},candidateEntities:allSource.length,searchEntities:source.length,
      preferredGhostCultivators:preferred.length,attempts};
    const windowView={name:'mortal-nether-large-window',kind:'window',
      poi:{x:(w.w-1)/2,y:(w.h-1)/2,source:'world-bounds-centre; independent of entity camera'},
      yaw:.3,polar:.69,zoom:1.55};
    return {found:true,views:[overview,cliff,entityView,windowView],candidateEntities:allSource.length,searchEntities:source.length,
      ghostCultivators:preferred.length,
      selectedEntity:entityView.poi,visibility:entityView.visibility,highTerrainCell:high};
  `);
}

async function openRealWindow(view) {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,p=${JSON.stringify(view.poi)},w=k.world;
    const before=await window.__planeProof.snapshotDigest(k);
    r.setActivePlane('mortal');k.selectTool('viewNether');
    const hx=Math.floor(w.w*.28),hy=Math.floor(w.h*.28);
    const x0=Math.max(1,Math.floor(p.x-hx)),x1=Math.min(w.w-2,Math.ceil(p.x+hx));
    const y0=Math.max(1,Math.floor(p.y-hy)),y1=Math.min(w.h-2,Math.ceil(p.y+hy));
    k.commitSelection([[x0,y0],[x1,y0],[x1,y1],[x0,y1]]);
    for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);
    if(!r.realmPrototype.open||r.realmPrototype.targetPlane!=='nether'||!r.stages.get('nether').visible)
      throw new Error('real Sandbox.commitSelection did not open Nether window');
    const selection=k.selection,after=await window.__planeProof.snapshotDigest(k);
    const target=r.stages.get('nether'),insideNetherEntities=k.world.nether.entities.filter(e=>target.regionGeometry.isInsideCell(e.x,e.y)).length;
    return {before,after,selection:{area:selection.area,bounds:[selection.x0,selection.y0,selection.x1,selection.y1],capped:selection.capped},
      insideNetherEntities,
      riftCount:k.world.rifts.length,netherRifts:k.world.rifts.filter(v=>v.targetPlane==='nether').length,
      actualTarget:r.realmPrototype.targetPlane};
  `);
}

async function configure(view, profile) {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,a=window.__planeProof;
    r.setArtProfile(${JSON.stringify(profile)});r.setLODEnabled(true);
    const camera=a.applyCamera(r,'WORLD_OVERVIEW',{poi:${JSON.stringify(view.poi)},yaw:${view.yaw},polar:${view.polar},zoom:${view.zoom}});
    for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);
    const actual={position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom,
      matrixWorld:r.cameraRig.camera.matrixWorld.toArray()};
    if(Math.abs(actual.zoom-camera.zoom)>1e-6)throw new Error('camera zoom drift');
    const s=r.stages.get('nether'),u=s.terrain.inkMaterial.uniforms;
    if(r.scene.fog!==null)throw new Error('scene-global fog was installed');
    if(${JSON.stringify(profile==='realm-style-v1')}&&(u.realmStyleEnabled.value!==1||s.entities.artProfile?.realmStyle?.plane!=='nether'))
      throw new Error('Nether stage-local style did not bind');
    const gl=r.gpu.getContext();
    const programs=r.gpu.info.programs.map(p=>({name:p.name||null,
      linked:p.program?gl.getProgramParameter(p.program,gl.LINK_STATUS):null,
      log:p.diagnostics?.programLog||p.diagnostics?.vertexShader?.log||p.diagnostics?.fragmentShader?.log||null}));
    if(programs.some(p=>p.linked===false)||!programs.some(p=>p.linked===true))throw new Error('WebGL program link status failed or unavailable');
    return {camera:actual,recipe:camera.recipe,profile:r.art.profile.name,visiblePlanes:[...r.stages.values()].filter(v=>v.visible).map(v=>v.plane),
      stageStyle:s.entities.artProfile?.realmStyle?.plane||null,terrainStyleEnabled:u.realmStyleEnabled.value,
      fogIsNull:r.scene.fog===null,programs,boundaryColor:r.boundary.material.color.getHexString(),
      entityStats:{...s.entities.stats,lod:[...s.entities.stats.lod]}};
  `);
}

async function sampleProductLoop(label) {
  return page(`
    const r=window.inkbox.render3d.renderer,state={update:[],render:[],raf:[],active:true,updateCalls:0,renderCalls:0};
    const update=r.update,render=r.render;
    r.update=function(dt){const t=performance.now();try{return update.call(this,dt);}finally{if(state.active){state.updateCalls++;state.update.push(performance.now()-t);}}};
    r.render=function(){const t=performance.now();try{return render.call(this);}finally{if(state.active){state.renderCalls++;state.render.push(performance.now()-t);}}};
    try{let previous=null;for(let i=0;i<${samples}+1;i++){const t=await new Promise(requestAnimationFrame);if(previous!==null)state.raf.push(t-previous);previous=t;}}
    finally{state.active=false;r.update=update;r.render=render;}
    const summary=a=>{const x=a.slice(-${samples}).sort((p,q)=>p-q);if(x.length<${samples})throw new Error('missing product RAF samples');
      return {medianMs:x[Math.floor(x.length*.5)],p95Ms:x[Math.floor(x.length*.95)],maxMs:x.at(-1),samples:x.length};};
    const gl=r.gpu.getContext();return {case:${JSON.stringify(label)},cpuUpdate:summary(state.update),cpuRender:summary(state.render),raf:summary(state.raf),
      productCalls:{update:state.updateCalls,render:state.renderCalls},
      triangles:r.gpu.info.render.triangles,drawCalls:r.gpu.info.render.calls,glError:gl.getError(),
      visiblePlanes:[...r.stages.values()].filter(s=>s.visible).map(s=>s.plane),lodStats:r.getLODStats()};
  `);
}

async function capture(view, profile) {
  const configured=await configure(view,profile);
  const sample=await sampleProductLoop(`${view.name}/${profile}`);
  assert.equal(sample.glError,0,`${view.name}/${profile}: GL error`);
  const file=`${view.name}-${profile}.png`;
  await browser.screenshot(path.join(output,file));
  return {profile,file,poi:view.poi,camera:configured.camera,recipe:configured.recipe,visibility:view.visibility||null,
    renderer:{...sample,stageStyle:configured.stageStyle,terrainStyleEnabled:configured.terrainStyleEnabled,
      fogIsNull:configured.fogIsNull,boundaryColor:configured.boundaryColor,entityStats:configured.entityStats,programs:configured.programs}};
}

try {
  fs.mkdirSync(output,{recursive:true});
  browser=await launch({url:url.toString(),browser:findBrowser(),width:1500,height:940,gpu:true,timeoutMs:30000});
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size',{timeoutMs:60000}),
    `Render3D failed to boot: ${browser.errors().join(' | ')}`);
  const setup=await prepare();evidence.scenarioRecipe=setup.scenario;evidence.naturalWorld=setup.setup;
  for(let start=0;start<setup.setup.netherRaw;start+=8){
    evidence.selection=await chooseViews(start,8);
    if(evidence.selection.found)break;
    if(start+8>=evidence.selection.searchEntities)break;
  }
  assert(evidence.selection?.found,'No naturally derived Nether entity proved frontmost and pickable');
  for(const view of evidence.selection.views){
    if(view.kind==='window'){
      evidence.beforeWindowDigest=await page(`return window.__planeProof.snapshotDigest(window.inkbox);`);
      assert.equal(evidence.beforeWindowDigest.value,evidence.naturalWorld.digest.value,'presentation changes before window changed World');
      evidence.window=await openRealWindow(view);
    }
    const legacy=await capture(view,'legacy'),v1=await capture(view,'realm-style-v1');
    assert.deepEqual(legacy.camera,v1.camera,`${view.name}: paired camera drift`);
    evidence.cases.push({name:view.name,kind:view.kind,poi:view.poi,legacy,v1,sameCameraPose:true});
  }
  evidence.finalDigest=await page(`return window.__planeProof.snapshotDigest(window.inkbox);`);
  evidence.worldUnchangedAfterWindow=evidence.finalDigest.value===evidence.window.after.value;
  assert(evidence.worldUnchangedAfterWindow,'style/camera captures changed World after legitimate window action');
  evidence.consoleErrors=browser.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params?.type==='error')
    .map(e=>e.params.args?.map(a=>a.value||a.description||'').join(' '));
  evidence.runtimeErrors=browser.errors();
  assert.deepEqual([...evidence.consoleErrors,...evidence.runtimeErrors],[],'browser console/runtime errors');
  evidence.pass=true;
}catch(error){
  evidence.failure=error.stack||String(error);process.exitCode=1;console.error(error.stack||error);
  evidence.runtimeErrors=browser?.errors()||[];
}finally{
  evidence.finishedAt=new Date().toISOString();fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));
  await browser?.close();
}
if(evidence.pass)console.log(`B2 proof PASS: ${evidence.cases.length} paired real Nether views; ${path.relative(root,path.join(output,'evidence.json'))}`);
