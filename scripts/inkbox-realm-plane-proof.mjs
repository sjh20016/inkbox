// B2/B3: real Nether/Upper style proofs. Captures only the product RAF.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { launch, findEdge } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.INKBOX_URL || `http://127.0.0.1:${process.env.INKBOX_PORT || 4192}`;
const url = new URL(base);
url.pathname = `${url.pathname.replace(/\/$/, '').replace(/\/inkbox\.html$/i, '')}/inkbox.html`;
url.searchParams.set('renderer', '3d');
const plane = process.env.INKBOX_PLANE || 'nether';
assert(['nether', 'upper'].includes(plane), `Unsupported INKBOX_PLANE: ${plane}`);
const output = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(root, `reports/m2c2b0/${plane === 'upper' ? 'b3' : 'b2'}-proof`));
const profiles = ['legacy', 'realm-style-v1'];
const samples = 60;
let browser;
const page = (body, options) => {
  const expression = `return (async()=>{${body}})();`;
  new vm.Script(`(()=>{${expression}})()`); // Compile every inline page script before CDP.
  return browser.js(expression, options);
};
const evidence = { generatedAt: new Date().toISOString(), scenario: plane === 'upper' ? 'GOLDEN_A' : 'NETHER_STYLE_A', plane, source: url.toString(),
  profiles, samplesPerCase: samples, cases: [],
  provenance: { scenario: plane === 'upper'
      ? 'fresh Sandbox RNG and advanceState; newWorld small seed 20260930; 1440 x advanceDays(1)'
      : 'fresh Sandbox RNG and advanceState; newWorld medium seed 20260923; 7200 x advanceDays(3), yielding every 100',
    rendering: 'product requestAnimationFrame only; no manual Host.update/render',
    visibility: `frontmost visible ${plane} entity raycast and Host.pick identity`,
    purity: 'SHA-256 over full Sandbox World and advanceState before/after presentation changes' } };

async function prepare() {
  await page(`window.__planeProof=await import('./src/inkbox/render3d/art/VisualScenarios.js');return true;`);
  let scenario;
  for (let startStep = 0; startStep < 7200; startStep += 900) {
    scenario = await page(`const k=window.inkbox;return window.__planeProof.applyScenarioAsync(k,'NETHER_STYLE_A',
      {startStep:${startStep},stepCount:900});`, { timeoutMs: 180000 });
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
  `, { timeoutMs: 180000 });
  return { scenario, setup };
}

async function prepareUpper() {
  await page(`window.__planeProof=await import('./src/inkbox/render3d/art/VisualScenarios.js');return true;`);
  const scenario = await page(`return window.__planeProof.applyScenario(window.inkbox,'GOLDEN_A');`, { timeoutMs: 180000 });
  assert.equal(scenario.worldDay, 1440, 'GOLDEN_A natural advance incomplete');
  const setup = await page(`
    const k=window.inkbox,r=k.render3d.renderer;
    for(let i=0;i<180&&r.world!==k.world;i++)await new Promise(requestAnimationFrame);
    if(r.world!==k.world||r.stages.get('upper')?.world!==k.world.upper)throw new Error('product RAF did not adopt GOLDEN_A Upper world');
    await r.characterLoadPromise;if(r.characterLoadError)throw r.characterLoadError;
    r.setLODEnabled(true);r.setArtProfile('legacy');r.setActivePlane('upper');
    for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);
    const {deriveUpperEntities}=await import('./src/inkbox/render3d/entities/deriveEntities.js');
    const derived=deriveUpperEntities(k.world.upper);
    return {digest:await window.__planeProof.snapshotDigest(k),upperRaw:k.world.upper.entities.length,
      upperDerived:derived.total,upperClasses:Object.fromEntries(['human','cultivator','beast','spirit','wraith'].map(c=>[c,derived[c].length])),
      sourceIds:k.world.upper.entities.map(e=>({id:e.id,sp:e.sp,level:e.level,x:e.x,y:e.y}))};
  `, { timeoutMs: 180000 });
  assert(setup.upperRaw > 0 && setup.upperDerived > 0, 'GOLDEN_A has no real Upper entities');
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
  `, { timeoutMs: 180000 });
}

async function chooseUpperViews() {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,a=window.__planeProof,T=await import('three');
    const {deriveUpperEntities}=await import('./src/inkbox/render3d/entities/deriveEntities.js');
    const stage=r.stages.get('upper'),w=stage.world,derived=deriveUpperEntities(w);
    const center={x:(w.w-1)/2,y:(w.h-1)/2,source:'upper-world-bounds'};
    const overview={name:'upper-overview',kind:'overview',poi:center,yaw:.15,polar:.52,zoom:1.45};
    let high=0,low=0,cliff=0,cliffSlope=-1;
    for(let i=1;i<w.height.length;i++){if(w.height[i]>w.height[high])high=i;if(w.height[i]<w.height[low])low=i;}
    for(let y=2;y<w.h-2;y++)for(let x=2;x<w.w-2;x++){
      const i=y*w.w+x,s=Math.max(Math.abs(w.height[i-1]-w.height[i+1]),Math.abs(w.height[i-w.w]-w.height[i+w.w]));
      if(s>cliffSlope){cliffSlope=s;cliff=i;}
    }
    const cliffView={name:'upper-highland-cliff',kind:'terrain',poi:{x:cliff%w.w,y:Math.floor(cliff/w.w),source:'actual Upper maximum interior terrain gradient',cell:cliff,
      height:w.height[cliff],gradient:cliffSlope,highestCell:high,highestHeight:w.height[high]},yaw:.38,polar:.78,zoom:5};
    const cloud={name:'upper-cloud-negative-space',kind:'atmosphere',
      poi:{x:low%w.w,y:Math.floor(low/w.w),source:'actual Upper lowest terrain cell; terrain-attached wash and paper background',cell:low,
        height:w.height[low],highestCell:high,highestHeight:w.height[high]},yaw:.68,polar:.68,zoom:2.5,
      interpretation:'terrain-attached lowland atmosphere and paper negative space; no floating island or independently walkable cloud'};
    const candidates=[...derived.cultivator.map(e=>({...e,cls:'cultivator'})),
      ...['human','spirit','beast','wraith'].flatMap(cls=>derived[cls].map(e=>({...e,cls})))];
    const blockers=[],visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;},ray=new T.Raycaster();
    let entityView=null;const attempts=[];
    for(const e of candidates){
      if(entityView)break;
      const poi={x:e.x,y:e.y,source:'GOLDEN_A derived Upper entity',id:e.id,cls:e.cls,level:e.level,appearanceRole:e.appearance?.role||null};
      for(const polar of [.62,.82,.42,.28]){
        if(entityView)break;
        for(const yaw of [.2,1.77,3.34,4.91]){
          a.applyCamera(r,'ENTITY_CLOSE',{poi,polar,yaw,zoom:18});
          await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
          r.scene.updateMatrixWorld(true);r.cameraRig.camera.updateMatrixWorld(true);
          // LOD0 meshes become visible only after this camera's product RAF update.
          blockers.length=0;blockers.push(stage.terrain.mesh);
          stage.entities.group.traverse(o=>{if(o.isInstancedMesh&&o.visible&&o.count&&visible(o))blockers.push(o);});
          for(const lift of [.8,1.25,1.7,2.1]){
            const p=r.coordinates.worldToRender(e.x,e.y,stage.elevation.at(e.x,e.y)+lift),n=new T.Vector3(p.x,p.y,p.z).project(r.cameraRig.camera);
            if(Math.abs(n.x)>.87||Math.abs(n.y)>.87||n.z< -1||n.z>1)continue;
            ray.setFromCamera(new T.Vector2(n.x,n.y),r.cameraRig.camera);
            const first=ray.intersectObjects(blockers,false).find(h=>visible(h.object));
            const front=first?.object.userData.renderEntities?.[first.instanceId];
            const pixel={x:(n.x+1)*r.width/2,y:(1-n.y)*r.height/2},picked=r.pick(pixel.x,pixel.y);
            if(attempts.length<40)attempts.push({id:e.id,cls:e.cls,polar,yaw,lift,frontId:front?.id??null,pickedId:picked?.entityId??null,
              mesh:first?.object.name||null,lod:first?.object.userData.lod??null});
            if(front?.id!==e.id||picked?.entityId!==e.id||picked?.plane!=='upper'||first.object.userData.lod!==0)continue;
            const glb=first.object.name.startsWith('Cultivator:');
            if(e.cls==='cultivator'&&!glb)continue;
            entityView={name:'upper-entity-close',kind:'entity',poi,yaw,polar,zoom:18,
              visibility:{frontmostId:front.id,pickedEntityId:picked.entityId,pickedPlane:picked.plane,pixel,lift,
                mesh:first.object.name,lod:first.object.userData.lod,instanceId:first.instanceId,sourceClass:e.cls,glb}};break;
          }
          if(entityView)break;
        }
      }
    }
    if(!entityView)return {found:false,candidateEntities:candidates.length,cultivators:derived.cultivator.length,attempts};
    const windowView={name:'mortal-upper-large-window',kind:'window',poi:{x:(k.world.w-1)/2,y:(k.world.h-1)/2,
      source:'mortal world-bounds centre; independent of entity camera'},yaw:.3,polar:.69,zoom:1.55};
    return {found:true,views:[overview,cliffView,entityView,cloud,windowView],candidateEntities:candidates.length,
      cultivators:derived.cultivator.length,selectedEntity:entityView.poi,visibility:entityView.visibility,
      terrain:{highestCell:high,highestHeight:w.height[high],cliffCell:cliff,cliffGradient:cliffSlope,lowestCell:low,lowestHeight:w.height[low]}};
  `, { timeoutMs: 180000 });
}

async function openRealWindow(view, targetPlane = 'nether') {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,p=${JSON.stringify(view.poi)},w=k.world;
    const before=await window.__planeProof.snapshotDigest(k);
    r.setActivePlane('mortal');k.selectTool(${JSON.stringify(targetPlane === 'upper' ? 'viewUpper' : 'viewNether')});
    const hx=Math.floor(w.w*.28),hy=Math.floor(w.h*.28);
    const x0=Math.max(1,Math.floor(p.x-hx)),x1=Math.min(w.w-2,Math.ceil(p.x+hx));
    const y0=Math.max(1,Math.floor(p.y-hy)),y1=Math.min(w.h-2,Math.ceil(p.y+hy));
    k.commitSelection([[x0,y0],[x1,y0],[x1,y1],[x0,y1]]);
    for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);
    if(!r.realmPrototype.open||r.realmPrototype.targetPlane!==${JSON.stringify(targetPlane)}||!r.stages.get(${JSON.stringify(targetPlane)}).visible)
      throw new Error('real Sandbox.commitSelection did not open ${targetPlane} window');
    const selection=k.selection,after=await window.__planeProof.snapshotDigest(k);
    const target=r.stages.get(${JSON.stringify(targetPlane)}),insideTargetEntities=k.world[${JSON.stringify(targetPlane)}].entities.filter(e=>target.regionGeometry.isInsideCell(e.x,e.y)).length;
    const targetRifts=k.world.rifts.filter(v=>v.targetPlane===${JSON.stringify(targetPlane)}).length;
    return {before,after,selection:{area:selection.area,bounds:[selection.x0,selection.y0,selection.x1,selection.y1],capped:selection.capped},
      insideTargetEntities,insideNetherEntities:${JSON.stringify(targetPlane === 'nether')}?insideTargetEntities:undefined,
      riftCount:k.world.rifts.length,targetRifts,netherRifts:${JSON.stringify(targetPlane === 'nether')}?targetRifts:undefined,
      actualTarget:r.realmPrototype.targetPlane};
  `);
}

async function configure(view, profile, targetPlane = 'nether') {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,a=window.__planeProof;
    r.setArtProfile(${JSON.stringify(profile)});r.setLODEnabled(true);
    const camera=a.applyCamera(r,'WORLD_OVERVIEW',{poi:${JSON.stringify(view.poi)},yaw:${view.yaw},polar:${view.polar},zoom:${view.zoom}});
    for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);
    let warmFrames=5;
    if(${JSON.stringify(targetPlane === 'upper')}){
      let last='',stable=0;
      for(let i=0;i<120&&stable<6;i++){
        await new Promise(requestAnimationFrame);warmFrames++;
        const signature=JSON.stringify({triangles:r.gpu.info.render.triangles,drawCalls:r.gpu.info.render.calls,
          lod:r.getLODStats(),stagePpu:[...r.stages.values()].filter(s=>s.visible).map(s=>({plane:s.plane,
            terrain:s.terrain.inkMaterial.uniforms.pixelsPerUnit.value,
            entity:s.entities._viewPpu,tree:s.vegetation?._viewPpu,building:s.settlements?._viewPpu}))});
        stable=signature===last?stable+1:0;last=signature;
      }
      if(stable<6)throw new Error('Upper camera PPU/LOD/draws failed to settle on product RAF');
    }
    const actual={position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom,
      matrixWorld:r.cameraRig.camera.matrixWorld.toArray()};
    if(Math.abs(actual.zoom-camera.zoom)>1e-6)throw new Error('camera zoom drift');
    const s=r.stages.get(${JSON.stringify(targetPlane)}),u=s.terrain.inkMaterial.uniforms;
    if(r.scene.fog!==null)throw new Error('scene-global fog was installed');
    if(${JSON.stringify(profile==='realm-style-v1')}&&(u.realmStyleEnabled.value!==1||s.entities.artProfile?.realmStyle?.plane!==${JSON.stringify(targetPlane)}))
      throw new Error('${targetPlane} stage-local style did not bind');
    const gl=r.gpu.getContext();
    const programs=r.gpu.info.programs.map(p=>({name:p.name||null,
      linked:p.program?gl.getProgramParameter(p.program,gl.LINK_STATUS):null,
      log:p.diagnostics?.programLog||p.diagnostics?.vertexShader?.log||p.diagnostics?.fragmentShader?.log||null}));
    if(programs.some(p=>p.linked===false)||!programs.some(p=>p.linked===true))throw new Error('WebGL program link status failed or unavailable');
    return {camera:actual,recipe:camera.recipe,warmFrames,profile:r.art.profile.name,visiblePlanes:[...r.stages.values()].filter(v=>v.visible).map(v=>v.plane),
      stageStyle:s.entities.artProfile?.realmStyle?.plane||null,terrainStyleEnabled:u.realmStyleEnabled.value,
      fogIsNull:r.scene.fog===null,programs,boundaryColor:r.boundary.material.color.getHexString(),
      entityStats:{...s.entities.stats,lod:[...s.entities.stats.lod]}};
  `, { timeoutMs: 120000 });
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
  `, { timeoutMs: 180000 });
}

async function capture(view, profile, targetPlane = 'nether') {
  const configured=await configure(view,profile,targetPlane);
  const sample=await sampleProductLoop(`${view.name}/${profile}`);
  assert.equal(sample.glError,0,`${view.name}/${profile}: GL error`);
  const file=`${view.name}-${profile}.png`;
  await browser.screenshot(path.join(output,file));
  return {profile,file,poi:view.poi,camera:configured.camera,recipe:configured.recipe,warmFrames:configured.warmFrames,visibility:view.visibility||null,
    renderer:{...sample,stageStyle:configured.stageStyle,terrainStyleEnabled:configured.terrainStyleEnabled,
      fogIsNull:configured.fogIsNull,boundaryColor:configured.boundaryColor,entityStats:configured.entityStats,programs:configured.programs}};
}

try {
  fs.mkdirSync(output,{recursive:true});
  const edge=findEdge();assert(edge,'Microsoft Edge is required');
  browser=await launch({url:url.toString(),browser:edge,width:1500,height:940,gpu:true,timeoutMs:30000});
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size',{timeoutMs:60000}),
    `Render3D failed to boot: ${browser.errors().join(' | ')}`);
  const setup=plane==='upper'?await prepareUpper():await prepare();
  evidence.scenarioRecipe=setup.scenario;evidence.naturalWorld=setup.setup;
  if(plane==='upper')evidence.selection=await chooseUpperViews();
  else for(let start=0;start<setup.setup.netherRaw;start+=8){
    evidence.selection=await chooseViews(start,8);
    if(evidence.selection.found)break;
    if(start+8>=evidence.selection.searchEntities)break;
  }
  assert(evidence.selection?.found,`No naturally derived ${plane} entity proved frontmost and pickable`);
  for(const view of evidence.selection.views){
    if(view.kind==='window'){
      evidence.beforeWindowDigest=await page(`return window.__planeProof.snapshotDigest(window.inkbox);`);
      assert.equal(evidence.beforeWindowDigest.value,evidence.naturalWorld.digest.value,'presentation changes before window changed World');
      evidence.window=await openRealWindow(view,plane);
    }
    const legacy=await capture(view,'legacy',plane),v1=await capture(view,'realm-style-v1',plane);
    assert.deepEqual(legacy.camera,v1.camera,`${view.name}: paired camera drift`);
    if(plane==='upper'){
      assert.equal(legacy.renderer.triangles,v1.renderer.triangles,`${view.name}: paired triangle count drift`);
      assert.equal(legacy.renderer.drawCalls,v1.renderer.drawCalls,`${view.name}: paired draw count drift`);
      assert.deepEqual(legacy.renderer.lodStats,v1.renderer.lodStats,`${view.name}: paired LOD drift`);
    }
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
if(evidence.pass)console.log(`${plane==='upper'?'B3':'B2'} proof PASS: ${evidence.cases.length} paired real ${plane} views; ${path.relative(root,path.join(output,'evidence.json'))}`);
