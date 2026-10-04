// B1 visual/performance proof harness. It measures the application's own RAF loop;
// it must not call Host.update/render in addition to the product frame loop.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, findEdge } from './cdp.mjs';
import { waitForIdlePresentation } from './inkbox-browser-steady-view.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.INKBOX_URL || `http://127.0.0.1:${process.env.INKBOX_PORT || 4192}`;
const url = new URL(base);
url.pathname = `${url.pathname.replace(/\/$/, '').replace(/\/inkbox\.html$/i, '')}/inkbox.html`;
url.searchParams.set('renderer', '3d');
const output = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(root, 'reports/m2c2b0/b1-proof-final'));
const SAMPLES = 120;
const PROFILES = ['legacy', 'realm-style-v1'];
const page = (body, options) => browser.js(`return (async()=>{${body}})();`, options);
let browser;
const evidence = {
  generatedAt: new Date().toISOString(), world: 'GOLDEN_A', source: url.toString(),
  profiles: PROFILES, samplesPerProductLoopCase: SAMPLES, cases: [],
  provenance: {
    camera: 'VisualScenarios.applyCamera/applyVisibleCamera; camera pose recorded after product RAF adoption',
    performance: 'Host.update/Host.render wrappers record the existing product RAF; rAF intervals are wall-clock frame intervals; CPU only, no GPU time inferred',
    purity: 'SHA-256 over full sandbox world + advanceState before and after capture',
  },
};

const waitFrames = async count => page(`for(let i=0;i<${count};i++)await new Promise(requestAnimationFrame);return true;`);

async function prepare() {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer;
    window.__realmStyleProof=await import('./src/inkbox/render3d/art/VisualScenarios.js');
    const scenario=window.__realmStyleProof.applyScenario(k,'GOLDEN_A');
    let adopted=false;
    for(let i=0;i<180;i++){
      await new Promise(requestAnimationFrame);
      if(r.world===k.world&&r.stages.get('mortal')?.world===k.world){adopted=true;break;}
    }
    if(!adopted)throw new Error('product RAF did not adopt GOLDEN_A world');
    await r.characterLoadPromise;
    if(r.characterLoadError)throw r.characterLoadError;
    r.setLODEnabled(true);r.setArtProfile('legacy');
    for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);
    if(r.world!==k.world||r.stages.get('mortal')?.world!==k.world)throw new Error('GOLDEN_A world adoption drifted');
    return {scenario,digest:await window.__realmStyleProof.snapshotDigest(k),size:[k.world.w,k.world.h],
      houses:k.world.villages.reduce((n,v)=>n+(v.houses?.length||0),0),villages:k.world.villages.length};
  `, { timeoutMs: 180000 });
}

async function selectViews() {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,a=window.__realmStyleProof,w=k.world;
    const overview={name:'overview',poi:{x:(w.w-1)/2,y:(w.h-1)/2,source:'world-bounds'},
      yaw:.15,polar:.52,zoom:1.45,kind:'bounds'};
    const settlement=await a.applyVisibleCamera(r,'SETTLEMENT');
    const entity=await a.applyVisibleCamera(r,'ENTITY_MEDIUM');
    if(!settlement.visibilityProof?.visible||!settlement.visibilityProof?.house?.visible||!settlement.visibilityProof?.tree?.visible)
      throw new Error('settlement camera is missing visible house/cultivator/tree proof');
    if(!entity.visibilityProof?.visible)throw new Error('character camera has no visible real cultivator proof');
    const settlementPoi={x:settlement.poi.x,y:settlement.poi.y,id:settlement.poi.id,settlementId:settlement.poi.id,
      source:settlement.poi.source,entityId:settlement.poi.entityId,house:settlement.poi.house};
    // A fixed .65 zoom puts this real village at 23.83 px on the local canvas,
    // almost exactly at the 24 px HLOD entry band. Derive a far camera with
    // viewport margin; the same real village and member checks still apply.
    const {LOD_BUDGETS,projectedPixels}=await import('./src/inkbox/render3d/lod/PresentationBudget.js');
    a.applyCamera(r,'WORLD_OVERVIEW',{poi:settlementPoi,yaw:settlement.recipe.yaw,polar:settlement.recipe.polar,zoom:.65});
    for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);
    const group=r.stages.get('mortal').settlements._groupById.get(settlementPoi.settlementId);
    if(!group||group.houseCount<=1)throw new Error('selected real settlement cannot form a multi-house HLOD');
    const footprint=projectedPixels(group.maxHeight,r.stages.get('mortal').settlements.artView,Math.max(group.width,group.depth));
    const farZoom=Math.max(r.cameraRig.controls.minZoom,Math.min(.65,.65*LOD_BUDGETS.thresholds.settlement.enterLod2*.8/footprint));
    const settlementViews=[
      {name:'settlement-near',kind:'settlement',poi:settlementPoi,yaw:settlement.recipe.yaw,polar:settlement.recipe.polar,zoom:9,lod:0,visibility:settlement.visibilityProof},
      {name:'settlement-mid',kind:'settlement',poi:settlementPoi,yaw:settlement.recipe.yaw,polar:settlement.recipe.polar,zoom:6,lod:1,visibility:settlement.visibilityProof},
      {name:'settlement-far-hlod',kind:'settlement',poi:settlementPoi,yaw:settlement.recipe.yaw,polar:settlement.recipe.polar,zoom:farZoom,lod:2,visibility:settlement.visibilityProof,
        cameraSelection:{source:'real settlement projected footprint',referenceZoom:.65,referencePixels:footprint,targetPixels:LOD_BUDGETS.thresholds.settlement.enterLod2*.8}},
    ];
    const character={name:'character',kind:'character',poi:{x:entity.poi.x,y:entity.poi.y,id:entity.poi.id,source:entity.poi.source,entityId:entity.poi.id},
      yaw:entity.recipe.yaw,polar:entity.recipe.polar,zoom:entity.recipe.zoom,visibility:entity.visibilityProof};

    const T=await import('three'),mortal=r.stages.get('mortal'),water=w.water,height=w.height;
    const wet=[];
    for(let y=1;y<w.h-1;y++)for(let x=1;x<w.w-1;x++){
      const i=y*w.w+x;if(water[i]<=.0015)continue;
      const neighbors=[i-1,i+1,i-w.w,i+w.w],dry=neighbors.filter(j=>water[j]<=.0015);
      if(dry.length)wet.push({i,x,y,water:water[i],height:height[i],dryNeighbors:dry.length});
    }
    wet.sort((a,b)=>b.water-a.water||a.i-b.i);
    const ray=new T.Raycaster(),ancestorsVisible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
    let wateredge=null;
    for(const candidate of wet.slice(0,60)){
      if(wateredge)break;
      for(const polar of [.65,.45,.28]){
        if(wateredge)break;
        for(const yaw of [.2,1.77,3.34,4.91]){
      const poi={x:candidate.x+.5,y:candidate.y+.5,source:'real wet cell adjoining dry cells',cell:candidate.i};
      a.applyCamera(r,'WORLD_OVERVIEW',{poi,yaw,polar,zoom:5});
      await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
      r.scene.updateMatrixWorld(true);r.cameraRig.camera.updateMatrixWorld(true);
      const z=mortal.elevation.nodeForHeight(candidate.height+candidate.water,candidate.x+.5,candidate.y+.5)+.04;
      const p=r.coordinates.worldToRender(poi.x,poi.y,z),ndc=new T.Vector3(p.x,p.y,p.z).project(r.cameraRig.camera);
      if(Math.abs(ndc.x)>.88||Math.abs(ndc.y)>.88||ndc.z< -1||ndc.z>1)continue;
      ray.setFromCamera(new T.Vector2(ndc.x,ndc.y),r.cameraRig.camera);
      const hit=ray.intersectObjects(r.scene.children,true).find(v=>ancestorsVisible(v.object));
      if(hit?.object===mortal.water?.mesh){wateredge={name:'wateredge',kind:'wateredge',poi,yaw,polar,zoom:5,
        wetCell:candidate.i,wetValue:candidate.water,heightValue:candidate.height,dryNeighborCount:candidate.dryNeighbors,
        surfaceHeight:z,visibility:{visible:true,object:hit.object.name||'water mesh',point:[p.x,p.y,p.z],pixel:[(ndc.x+1)*r.width/2,(1-ndc.y)*r.height/2]}};break;}
        }
      }
    }
    if(!wateredge)throw new Error('GOLDEN_A has no raycast-visible real wet/dry water-edge cell');

    const {deriveVegetation}=await import('./src/inkbox/render3d/vegetation/deriveVegetation.js');
    const trees=deriveVegetation(w),tile=16,cols=Math.ceil(w.w/tile),rows=Math.ceil(w.h/tile),counts=new Uint32Array(cols*rows);
    for(const t of trees)counts[Math.floor(t.y/tile)*cols+Math.floor(t.x/tile)]++;
    const tiles=[...counts.keys()].sort((x,y)=>counts[y]-counts[x]||x-y);
    let forest=null;
    for(const tileIndex of tiles.slice(0,4)){
      const tx=tileIndex%cols,ty=Math.floor(tileIndex/cols),members=trees.filter(t=>Math.floor(t.x/tile)===tx&&Math.floor(t.y/tile)===ty);
      const poi={x:(tx*tile+Math.min(w.w,(tx+1)*tile)-1)/2,y:(ty*tile+Math.min(w.h,(ty+1)*tile)-1)/2,
        source:'deriveVegetation densest real 16x16 tile',tile:[tx,ty]};
      for(const polar of [.65,.45,.28])for(const yaw of [.2,1.77,3.34,4.91]){
        a.applyCamera(r,'WORLD_OVERVIEW',{poi,yaw,polar,zoom:8});
        await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
        r.scene.updateMatrixWorld(true);r.cameraRig.camera.updateMatrixWorld(true);
        const meshes=[];mortal.vegetation.group.traverse(o=>{if(o.isInstancedMesh&&o.userData.lod===0&&o.visible&&ancestorsVisible(o))meshes.push(o);});
        for(const tree of members.slice(0,24)){
          const p=r.coordinates.worldToRender(tree.x,tree.y,mortal.elevation.at(tree.x,tree.y)+tree.size*.72),ndc=new T.Vector3(p.x,p.y,p.z).project(r.cameraRig.camera);
          if(Math.abs(ndc.x)>.88||Math.abs(ndc.y)>.88||ndc.z< -1||ndc.z>1)continue;
          ray.setFromCamera(new T.Vector2(ndc.x,ndc.y),r.cameraRig.camera);
          const hit=ray.intersectObjects(meshes,false).find(v=>v.instanceId!=null&&v.object.userData.renderTrees?.[v.instanceId]?.cell===tree.cell);
          if(hit){forest={name:'forest',kind:'forest',poi,yaw,polar,zoom:8,treeCell:tree.cell,tileTreeCount:members.length,totalTrees:trees.length,
            visibility:{visible:true,instanceId:hit.instanceId,object:hit.object.name||'vegetation mesh',pixel:[(ndc.x+1)*r.width/2,(1-ndc.y)*r.height/2]}};break;}}
        }
        if(forest)break;
      }
    if(!forest)throw new Error('No raycast-visible tree found in GOLDEN_A dense forest tiles');
    return {views:[overview,...settlementViews,wateredge,forest,character],settlement:{poi:settlement.poi,visibility:settlement.visibilityProof},character:{poi:entity.poi,visibility:entity.visibilityProof},wetCandidates:wet.length,forestSource:{trees:trees.length,densestTileCount:counts[tiles[0]],tileSize:tile}};
  `, { timeoutMs: 180000 });
}

async function configureAndWait(profile, view) {
  const result = await page(`
    const r=window.inkbox.render3d.renderer,a=window.__realmStyleProof;
    r.setArtProfile(${JSON.stringify(profile)});r.setLODEnabled(true);
    const recipe=a.applyCamera(r,'WORLD_OVERVIEW',{poi:${JSON.stringify(view.poi)},yaw:${view.yaw},polar:${view.polar},zoom:${view.zoom}});
    const fxSettling=await (${waitForIdlePresentation.toString()})(r);
    let signature=null,stable=0,warmFrames=0;
    for(;warmFrames<120&&stable<6;warmFrames++){
      await new Promise(requestAnimationFrame);
      const next=JSON.stringify([r.cameraRig.pixelsPerUnit,r.gpu.info.render.triangles,r.gpu.info.render.calls,r.getLODStats()]);
      stable=next===signature?stable+1:0;signature=next;
    }
    if(stable<6)throw new Error('camera/LOD did not settle before capture');
    const camera=r.cameraRig.camera,actual={position:camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:camera.zoom,
      matrixWorld:camera.matrixWorld.toArray(),projectionMatrix:camera.projectionMatrix.toArray()};
    const expected={position:recipe.position,target:recipe.target,zoom:recipe.zoom};
    const maxDelta=(x,y)=>Math.max(...x.map((v,i)=>Math.abs(v-y[i])));
    const poseDelta={position:maxDelta(actual.position,expected.position),target:maxDelta(actual.target,expected.target),zoom:Math.abs(actual.zoom-expected.zoom)};
    if(poseDelta.position>1e-4||poseDelta.target>1e-4||poseDelta.zoom>1e-6)throw new Error('product loop changed the selected camera pose: '+JSON.stringify(poseDelta));
    const stage=r.stages.get('mortal'),settlements=stage.settlements,entryList=settlements.hlodCluster.userData.renderSettlements||[];
    let targetHouse=null,targetHouseLod=null;
    if(${JSON.stringify(view.kind)}==='settlement'){
      const h=${JSON.stringify(view.poi.house)};
      targetHouse=settlements._selectedBuildings.find(b=>b.type==='house'&&b.settlementId===${JSON.stringify(view.poi.settlementId)}
        &&Math.abs(b.x-(h.x+.5))<.01&&Math.abs(b.y-(h.y+.5))<.01);
      targetHouseLod=targetHouse?settlements._currentLods[targetHouse._layerIndex]:null;
      if(!targetHouse)throw new Error('selected real settlement house is absent from product layer');
      if(${view.lod}===2&&!entryList.some(e=>e.settlementId===${JSON.stringify(view.poi.settlementId)}&&e.members?.includes(targetHouse.sourceIndex)))
        throw new Error('far HLOD capture lacks selected real house/settlement member identity');
      if(${view.lod}!==2&&targetHouseLod!==${view.lod})throw new Error('selected house LOD differs from view: '+targetHouseLod);
    }
    const gl=r.gpu.getContext(),realmStyles=await import('./src/inkbox/render3d/art/RealmStyleProfile.js');
    const expectedRealmStyle=${JSON.stringify(profile==='realm-style-v1')};
    const styleUniforms=[...r.stages.entries()].map(([plane,s])=>({plane,
      expectedRealmStylePlane:expectedRealmStyle?realmStyles.realmStyleFor(plane).plane:null,
      terrainEnabled:s.terrain?.inkMaterial?.uniforms?.realmStyleEnabled?.value??null,
      vegetation:s.vegetation?{plane:s.vegetation.artProfile?.realmStyle?.plane||null,enabled:s.vegetation.pilotMaterial?.uniforms?.realmStyleEnabled?.value??null}:null,
      entities:s.entities?{plane:s.entities.artProfile?.realmStyle?.plane||null,enabled:s.entities.pilotMaterial?.uniforms?.realmStyleEnabled?.value??s.entities.characterBatch?.realmUniforms?.enabled?.value??null}:null,
      settlements:s.settlements?{plane:s.settlements.artProfile?.realmStyle?.plane||null,enabled:s.settlements.pilotMaterial?.uniforms?.realmStyleEnabled?.value??null}:null}));
    if(r.scene.fog!==null)throw new Error('B1 realm style unexpectedly installs scene fog');
    if(expectedRealmStyle)for(const item of styleUniforms){
      if(item.terrainEnabled!==1)throw new Error(item.plane+' terrain realm-style uniform is not enabled');
      for(const category of ['vegetation','entities','settlements'])if(item[category]&&(item[category].plane!==item.plane||item[category].enabled!==1))
        throw new Error(item.plane+' '+category+' realm-style uniform/profile plane mismatch: '+JSON.stringify(item[category]));
    }
    const programs=r.gpu.info.programs.map(p=>({name:p.name||null,linked:p.program?gl.getProgramParameter(p.program,gl.LINK_STATUS):null,runnable:p.diagnostics?.runnable??p.runnable??null,
      log:p.diagnostics?.programLog||p.diagnostics?.vertexShader?.log||p.diagnostics?.fragmentShader?.log||null}));
    if(!programs.length||programs.some(p=>p.linked!==true))throw new Error('WebGL LINK_STATUS failed or unavailable');
    return {profile:r.art.profile.name,fxSettling,pose:{actual,expected,poseDelta},worldAdopted:r.world===window.inkbox.world&&stage.world===window.inkbox.world,
      cameraRecipe:recipe.recipe,poi:recipe.poi,targetHouseLod,targetHouseSourceIndex:targetHouse?.sourceIndex??null,
      settlementStats:{...settlements.stats,lod:[...settlements.stats.lod]},targetSettlementEntries:entryList.filter(e=>e.settlementId===${JSON.stringify(view.poi.settlementId)}).length,
      visiblePlanes:[...r.stages.values()].filter(s=>s.visible).map(s=>s.plane),glRenderer:gl.getParameter(gl.RENDERER),
      fogIsNull:r.scene.fog===null,styleUniforms,programs,
      timerQueryAvailable:!!(gl.getExtension('EXT_disjoint_timer_query_webgl2')||gl.getExtension('EXT_disjoint_timer_query'))};
  `, { timeoutMs: 120000 });
  assert(result.worldAdopted, `${view.name}: scenario host/stage adoption drift`);
  return result;
}

async function sampleProductLoop(label) {
  return page(`
    const r=window.inkbox.render3d.renderer, state={update:[],render:[],raf:[],active:true,updateCalls:0,renderCalls:0};
    const originalUpdate=r.update,originalRender=r.render;
    r.update=function(dt){const t=performance.now();try{return originalUpdate.call(this,dt);}finally{if(state.active){state.updateCalls++;state.update.push(performance.now()-t);}}};
    r.render=function(){const t=performance.now();try{return originalRender.call(this);}finally{if(state.active){state.renderCalls++;state.render.push(performance.now()-t);}}};
    try{let previous=null;for(let i=0;i<${SAMPLES}+1;i++){const ts=await new Promise(requestAnimationFrame);if(previous!==null)state.raf.push(ts-previous);previous=ts;}}
    finally{state.active=false;r.update=originalUpdate;r.render=originalRender;}
    if(Math.abs(state.updateCalls-(${SAMPLES}+1))>1||Math.abs(state.renderCalls-(${SAMPLES}+1))>1)throw new Error('not one product update/render per RAF');
    const summarize=a=>{const x=a.slice(-${SAMPLES}).sort((p,q)=>p-q);if(x.length<${SAMPLES})throw new Error('too few product loop samples '+x.length);
      return {samples:x.length,meanMs:x.reduce((s,v)=>s+v,0)/x.length,medianMs:x[Math.floor(x.length*.5)],p95Ms:x[Math.floor(x.length*.95)],maxMs:x.at(-1)};};
    const visible=[...r.stages.values()].filter(s=>s.visible),layerStats={};
    for(const s of visible)layerStats[s.plane]={trees:s.vegetation?.stats||null,characters:s.entities?.stats||null,buildings:s.settlements?.stats||null};
    const gpu=r.gpu,gl=gpu.getContext();
    return {case:${JSON.stringify(label)},kind:'product-loop-only; wrapper instrumentation; no probe update/render calls',
      productCalls:{update:state.updateCalls,render:state.renderCalls,rafCallbacks:${SAMPLES}+1},cpuUpdate:summarize(state.update),cpuRender:summarize(state.render),raf:summarize(state.raf),
      drawCalls:gpu.info.render.calls,triangles:gpu.info.render.triangles,layerStats,
      canvasResolution:[gpu.domElement.width,gpu.domElement.height],cssResolution:[gpu.domElement.clientWidth,gpu.domElement.clientHeight],dpr:gpu.getPixelRatio(),
      gpuTimeMs:null,gpuTimingReason:'not measured; CPU/rAF only (extension support reported separately)',
      timerQueryAvailable:!!(gl.getExtension('EXT_disjoint_timer_query_webgl2')||gl.getExtension('EXT_disjoint_timer_query')),
      glError:gl.getError()};
  `, { timeoutMs: 180000 });
}

async function captureCase(view, profile) {
  const configured = await configureAndWait(profile, view);
  assert(configured.pose.poseDelta.position <= 1e-4, `${view.name}/${profile}: camera pose mismatch`);
  const sample = await sampleProductLoop(`${view.name}/${profile}`);
  assert.equal(sample.glError, 0, `${view.name}/${profile}: WebGL error ${sample.glError}`);
  const filename = `${view.name}-${profile}.png`;
  await browser.screenshot(path.join(output, filename));
  return { name:view.name,profile,file:path.relative(root,path.join(output,filename)).replaceAll(path.sep,'/'),
    poi:view.poi,recipe:configured.cameraRecipe,pose:configured.pose,fxSettling:configured.fxSettling,visibility:view.visibility||null,
    cameraSelection:view.cameraSelection||null,
    settlement:{targetHouseLod:configured.targetHouseLod,targetHouseSourceIndex:configured.targetHouseSourceIndex,
      targetEntries:configured.targetSettlementEntries,stats:configured.settlementStats},
    renderer:{...sample,glRenderer:configured.glRenderer,timerQueryAvailable:configured.timerQueryAvailable,
      fogIsNull:configured.fogIsNull,styleUniforms:configured.styleUniforms,programs:configured.programs},sampledAfterConfiguration:true };
}

try {
  fs.mkdirSync(output,{recursive:true});
  const edge=findEdge();assert(edge,'Microsoft Edge is required');
  browser=await launch({url:url.toString(),browser:edge,width:1500,height:940,gpu:true,timeoutMs:30000});
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size',{timeoutMs:60000}),
    `Render3D failed to boot: ${browser.errors().join(' | ')}`);
  const setup=await prepare();evidence.scenario=setup.scenario;evidence.initialWorldDigest=setup.digest;
  evidence.coverage={mapSize:setup.size,villages:setup.villages,houses:setup.houses};
  evidence.selection=await selectViews();
  assert(evidence.selection.views.length===7,'expected overview, settlement near/mid/far, wateredge, forest, character');

  // Pairs are always captured with the exact same named camera recipe and POI.
  for(const view of evidence.selection.views){
    const pair=[];
    for(const profile of PROFILES)pair.push(await captureCase(view,profile));
    assert.deepEqual(pair[0].pose.actual,pair[1].pose.actual,`${view.name}: legacy/v1 camera pose must match exactly`);
    evidence.cases.push({name:view.name,poi:view.poi,recipe:pair[0].recipe,pairedCameraMatrix:pair[0].pose.actual.matrixWorld,
      legacy:pair[0],v1:pair[1],sameCameraPose:true});
  }
  evidence.resize=await page(`const r=window.inkbox.render3d.renderer,canvas=r.gpu.domElement;
    const before=[canvas.width,canvas.height],size=[r.width,r.height];r.resize(900,600);for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);
    const during=[canvas.width,canvas.height];r.resize(...size);for(let i=0;i<6;i++)await new Promise(requestAnimationFrame);
    const restored=[canvas.width,canvas.height];return {before,during,restored,glError:r.gpu.getContext().getError()};`);
  assert.equal(evidence.resize.glError,0,'resize GL error');
  assert.deepEqual(evidence.resize.restored,evidence.resize.before,'resize restore mismatch');
  assert.notDeepEqual(evidence.resize.during,evidence.resize.before,'resize did not change canvas');
  assert(evidence.resize.during[0]>0&&evidence.resize.during[1]>0,'resize lost canvas');
  evidence.finalWorldDigest=await page(`return window.__realmStyleProof.snapshotDigest(window.inkbox);`);
  evidence.worldUnchanged=evidence.initialWorldDigest.value===evidence.finalWorldDigest.value;
  assert(evidence.worldUnchanged,'visual/performance proof changed whole-world digest');
  evidence.consoleErrors=browser.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params?.type==='error')
    .map(e=>e.params.args?.map(a=>a.value||a.description||'').join(' '));
  evidence.runtimeErrors=browser.errors();
  evidence.errors=[...evidence.consoleErrors,...evidence.runtimeErrors];
  assert.deepEqual(evidence.errors,[],'browser console/runtime errors');
  evidence.pass=true;
}catch(error){
  evidence.failure=error.stack||String(error);
  evidence.consoleErrors=browser?.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params?.type==='error')
    .map(e=>e.params.args?.map(a=>a.value||a.description||'').join(' '))||[];
  evidence.runtimeErrors=browser?.errors()||[];evidence.errors=[...evidence.consoleErrors,...evidence.runtimeErrors];
  process.exitCode=1;console.error(error.stack||error);
}finally{
  evidence.finishedAt=new Date().toISOString();fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));
  await browser?.close();
}

if(evidence.pass)console.log(`B1 proof PASS: ${evidence.cases.length} paired views, ${SAMPLES} product-loop samples per profile/view; ${path.relative(root,path.join(output,'evidence.json'))}`);
