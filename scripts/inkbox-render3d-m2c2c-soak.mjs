// M2-C2B Pass1 shipping assets: product-RAF-only 600-frame lifecycle and 6000-frame realm resource soak.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launch, findEdge, sleep } from './cdp.mjs';
import { C2C_RECIPES } from './inkbox-c2c-browser-fixtures.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.INKBOX_PORT||4241),base=process.env.INKBOX_URL||`http://127.0.0.1:${port}`;
const url=new URL(base);
url.pathname=`${url.pathname.replace(/\/$/,'').replace(/\/inkbox\.html$/i,'')}/inkbox.html`;
url.searchParams.set('assets','on');url.searchParams.set('renderer','3d');url.searchParams.set('boundary','strata');
const output=path.resolve(process.env.INKBOX_REPORT_DIR||path.join(root,'reports/local/m2c2c/soak'));
const naturalSave=path.resolve(process.env.INKBOX_C2C_NATURAL_SAVE||path.join(root,'reports/local/m2c2c/pilot/full-sites-natural-save.json'));
const naturalMeta=path.resolve(process.env.INKBOX_C2C_NATURAL_META||path.join(root,'reports/local/m2c2c/pilot/full-natural-geography.json'));
const profiles=['legacy','realm-style-v1'],views=['mortal','upper','nether','upper-window','nether-window'];
const states=[false,true].flatMap(decorations=>[false,true].flatMap(lod=>views.map((view,index)=>{
  const featureSet=()=>({sites:view==='mortal',leylines:view==='mortal',upperQi:view.startsWith('upper'),netherYin:view.startsWith('nether'),rifts:true,riftFx:true});
  const focus=view==='mortal'?(decorations&&lod?'siteDense':'overview'):view.startsWith('upper')?(lod?'highQi':'entity'):
    view.startsWith('nether')?(lod?'highVeg':'ghostCluster'):'overview';
  return {profile:'realm-style-v1',production:true,decorations,lod,view,focus,features:featureSet(),fx:view==='nether-window'&&decorations&&lod,
    key:`production/${decorations?'decor':'no-decor'}/${lod?'lod':'no-lod'}/${view}/${focus}`};
})));
const warmStates=[...states,...views.map(view=>({profile:'legacy',production:false,decorations:false,lod:true,view,key:'legacy/'+view}))];
const report={startedAt:new Date().toISOString(),scenario:'C2C natural seed226 small day72000 + ordinary UI Rift/cross progression',sourceURL:url.toString(),
  gitCommit:(()=>{try{return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{return null;}})(),
  serverMode:process.env.INKBOX_URL?'controlled-existing-URL':'self-hosted',lifecycleFrames:600,soakFrames:6000,
  blockFrames:300,states:states.map(({key})=>key),blocks:[],pass:false};
let server,browser;
// Warm resource operations use one finite transport deadline, including queries
// that previously inherited Session's 30s default; all acceptance assertions stay.
const page=async (body,{label='page evaluation',timeoutMs=120000}={})=>{
  const expression=`return (async()=>{${body}})();`;new vm.Script(`(()=>{${expression}})()`);
  report.activeOperation={phase:report.phase,label,timeoutMs,startedAt:new Date().toISOString()};
  try{return await browser.js(expression,{timeoutMs});}
  catch(error){throw new Error(`${report.phase||'setup'} / ${label}: ${error.message}`,{cause:error});}
};
function diagnostics(){return {consoleErrors:browser?.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params?.type==='error')
  .map(e=>e.params.args?.map(a=>a.value||a.description||'').join(' '))||[],runtimeErrors:browser?.errors()||[]};}
async function startServer(){
  if(process.env.INKBOX_URL)return null;
  const child=spawn(process.execPath,['scripts/inkbox-server.mjs','--port',String(port)],{cwd:root,stdio:'ignore',windowsHide:true});
  for(let i=0;i<80;i++){
    if(child.exitCode!==null)throw new Error(`Inkbox server exited with code ${child.exitCode}; refusing another process on port ${port}`);
    try{if((await fetch(url)).ok){await sleep(100);
      if(child.exitCode!==null)throw new Error(`Inkbox server exited with code ${child.exitCode}; response may belong to another process`);
      return child;}}catch(error){if(child.exitCode!==null)throw error;}
    await sleep(150);
  }
  child.kill();throw new Error(`Inkbox server did not start at ${base}`);
}
async function cpuMemorySample(){
  await browser.cdp.send('HeapProfiler.collectGarbage',{},30000);
  const [performance,dom]=await Promise.all([browser.cdp.send('Performance.getMetrics',{},30000),browser.cdp.send('Memory.getDOMCounters',{},30000)]);
  const metrics=Object.fromEntries((performance.metrics||[]).map(m=>[m.name,m.value]));
  assert(Number.isFinite(metrics.JSHeapUsedSize)&&Number.isFinite(dom.nodes)&&Number.isFinite(dom.jsEventListeners),'CDP heap/DOM/listener metrics unavailable');
  const connectedDomNodes=await browser.js(`let count=1;const walker=document.createTreeWalker(document,NodeFilter.SHOW_ALL);
    while(walker.nextNode())count++;return count;`);
  return {available:true,afterForcedGC:true,jsHeapUsedBytes:metrics.JSHeapUsedSize,jsHeapTotalBytes:metrics.JSHeapTotalSize,
    domNodes:dom.nodes,connectedDomNodes,jsEventListeners:dom.jsEventListeners};
}
async function prepare(){
  await page(`window.inkbox.setSpeed(0);window.__b6=await import('./src/inkbox/render3d/art/VisualScenarios.js');window.__c2cFixture=await import('./scripts/inkbox-c2c-browser-fixtures.mjs');return true;`);
  let scenario=null;
  if(fs.existsSync(naturalSave)){
    const bytes=fs.readFileSync(naturalSave),save=JSON.parse(bytes.toString('utf8'));
    assert.equal(save.seed,226);assert.equal(save.day,72000);
    assert.deepEqual([...new Set(save.sites.map(x=>x.kind))].sort(),['cave','formation','ruin','secret']);
    const meta=fs.existsSync(naturalMeta)?JSON.parse(fs.readFileSync(naturalMeta,'utf8')):null;
    report.naturalCache={source:'natural fixed-seed sim serialized World imported via product file-input/importFile path; no World edits',
      saveSHA256:createHash('sha256').update(bytes).digest('hex'),worldSHA256:meta?.records?.at(-1)?.WorldSHA||null,
      advanceSHA256:meta?.records?.at(-1)?.advanceSHA||null,day:save.day,seed:save.seed,recipe:meta?.recipe||null};
    await page(`window.inkbox.setSpeed(0);return true;`);
    const {root:doc}=await browser.cdp.send('DOM.getDocument');
    const {nodeId}=await browser.cdp.send('DOM.querySelector',{nodeId:doc.nodeId,selector:'#inkImportFile'});
    assert(nodeId,'product import file input unavailable');await browser.cdp.send('DOM.setFileInputFiles',{nodeId,files:[naturalSave]});
    assert(await browser.waitFor('return window.inkbox?.world?.seed===226&&window.inkbox?.world?.day===72000',{timeoutMs:30000}),
      'C2C natural save did not load through product importFile');
    scenario={scenario:'cached serialized natural World',seed:226,worldDay:72000,source:report.naturalCache.source};
  }else{
    scenario=await page(`const f=window.__c2cFixture,k=window.inkbox,recipe=f.C2C_RECIPES.find(x=>x.key==='mortal');
      k.setSpeed(0);const sb=f.createScenarioSandbox(),info=await f.applyC2CRecipe(sb,recipe,{onChunk:async()=>new Promise(requestAnimationFrame)});
      k.world=sb.world;k.life=sb.life;k.upperLife=sb.upperLife;k.advanceState=sb.advanceState;k.rng=sb.rng;
      return {scenario:'fixed natural seed226 ordinary simulation',seed:k.world.seed,worldDay:k.world.day,info};`,{label:'natural C2C recipe fallback',timeoutMs:600000});
  }
  const setup=await page(`
    const k=window.inkbox,r=k.render3d.renderer,f=window.__c2cFixture;
    k.setSpeed(0);for(let i=0;i<180&&r.world!==k.world;i++)await new Promise(requestAnimationFrame);
    if(r.world!==k.world||r.stages.get('upper')?.world!==k.world.upper||r.stages.get('nether')?.world!==k.world.nether)throw Error('product RAF failed to adopt C2C World');
    await r.environmentLoadPromise;await r.characterLoadPromise;if(r.environmentLoadError||r.characterLoadError)throw r.environmentLoadError||r.characterLoadError;
    r.setProductionAssetsEnabled(true);r.setGeographyEnabled(true);r.setActivePlane('mortal');
    for(let i=0;i<30;i++)await new Promise(requestAnimationFrame);
    const summary=f.scenarioSummary({world:k.world},{key:'mortal',preset:'small',seed:226});window.__c2cTargets=summary.targets;
    const layer=r.stages.get('mortal').markers.siteGeography,ids=layer.renderedIds;
    const renderTargets=Object.fromEntries(['secret','cave','formation','ruin'].map(kind=>[kind,
      (layer.derived.sites[kind]||[]).filter(s=>ids.has(s.id)).map(s=>({id:s.id,x:s.x,y:s.y,kind:s.kind}))]));
    const missing=Object.keys(renderTargets).filter(kind=>!renderTargets[kind].length);
    if(missing.length)throw Error('natural current World has no submitted full-footprint production Site targets for '+missing.join(', '));
    const ghost=summary.targets.ghostCluster,highQi=summary.targets.fields.upperQi?.matchedHeight?.high,
      highVeg=summary.targets.fields.netherYin?.matchedHeight?.high,trace=null;
    if(!ghost||!highQi||!highVeg)throw Error('natural ghost/high-Qi/high-NetherYin targets absent');
    window.__b6GhostId=ghost.id;window.__b6Poi={mortal:{x:(k.world.w-1)/2,y:(k.world.h-1)/2},
      upper:{x:highQi.x,y:highQi.y,source:'same-height-band high qi'},nether:{x:highVeg.x,y:highVeg.y,source:'same-height-band high yin'}};
    window.__b6Focus={siteDense:{x:(renderTargets.cave[0].x+renderTargets.ruin[0].x)/2,y:(renderTargets.cave[0].y+renderTargets.ruin[0].y)/2},
      ghostCluster:{x:ghost.x,y:ghost.y,id:ghost.id},highQi:{x:highQi.x,y:highQi.y,value:highQi.value},highVeg:{x:highVeg.x,y:highVeg.y,value:highVeg.value},trace:summary.targets.fields.netherYin?.high};
    window.__b6Selections={};const actions=[],digestBefore=await window.__b6.snapshotDigest(k);
    const bounds=[[Math.floor(k.world.w*.25),Math.floor(k.world.h*.25)],[Math.floor(k.world.w*.75),Math.floor(k.world.h*.25)],
      [Math.floor(k.world.w*.75),Math.floor(k.world.h*.75)],[Math.floor(k.world.w*.25),Math.floor(k.world.h*.75)]];
    for(const plane of ['upper','nether']){
      const before=k.world.riftLog.opened;k.selectTool(plane==='upper'?'viewUpper':'viewNether');k.commitSelection(bounds);
      r.setRealmViewState(k.getRealmViewState());for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);
      if(!k.selection||r.realmPrototype.targetPlane!==plane)throw Error('normal product UI window failed '+plane);
      window.__b6Selections[plane]=k.selection;const count=k.world.riftLog.opened-before;
      if(count<1)throw Error('normal UI openRifts created no '+plane+' rift');actions.push({plane,selection:{area:k.selection.area,capped:k.selection.capped},openedRifts:count});
    }
    window.__b6FrozenFx={};window.__b6FxProof={};const isFrozen=(value,seen=new Set())=>{if(!value||typeof value!=='object'||seen.has(value))return true;seen.add(value);
      return Object.isFrozen(value)&&Reflect.ownKeys(value).every(key=>isFrozen(value[key],seen));};
    const sha=async x=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))].map(v=>v.toString(16).padStart(2,'0')).join('');
    let cycles=0;for(;cycles<300;cycles++){
      for(const plane of ['upper','nether'])if(!window.__b6FrozenFx[plane]){
        k.selectTool(plane==='upper'?'viewUpper':'viewNether');k.selection=window.__b6Selections[plane];r.setRealmViewState(k.getRealmViewState());
        k.advanceDays(30);await new Promise(requestAnimationFrame);
        const snapshot=k.stage.snapshotPlane(plane),items=snapshot.items.filter(x=>x.kind==='riftcross');if(items.length){
          if(!isFrozen(snapshot))throw Error('PresentationStage snapshot not deeply frozen '+plane);window.__b6FrozenFx[plane]=snapshot;
          window.__b6FxProof[plane]={source:'actual rift-cross events following ordinary 30-day app.advanceDays while product realm view open',
            day:k.world.day,items:items.map(x=>({kind:x.kind,plane:x.plane,x:x.x,y:x.y,age:x.age,ttl:x.ttl,data:x.data})),sha256:await sha(snapshot)};
        }
      }
      if(window.__b6FrozenFx.upper&&window.__b6FrozenFx.nether)break;
    }
    if(!window.__b6FrozenFx.upper||!window.__b6FrozenFx.nether)throw Error('actual ordinary progression did not provide frozen rift-cross on both planes; '+JSON.stringify({cycles,riftLog:k.world.riftLog}));
    const activeRifts=k.world.rifts.filter(x=>x.closedDay<0).map(x=>({id:x.id,targetPlane:x.targetPlane,age:x.age,x:x.x,y:x.y}));
    k.setSpeed(0);k.selectTool('inspect');k.selection=null;r.setRealmViewState(k.getRealmViewState());r.setActivePlane('mortal');
    for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);
    const digestPure=await window.__b6.snapshotDigest(k);
    return {digestBefore,digestPure,worldDay:k.world.day,siteProduction:{renderTargets,missing,stats:layer.stats},
      actions,riftLog:{...k.world.riftLog},activeRifts,fxProof:window.__b6FxProof,ordinaryCrossCycles:cycles+1,
      mortalEntities:k.world.entities.length,upperEntities:k.world.upper.entities.length,netherEntities:k.world.nether.entities.length,
      targets:{ghost,highQi,highVeg,trace}};
  `,{label:'C2C natural sites plus real UI Rift and actual-cross snapshot fixture',timeoutMs:600000});
  report.setup=setup;assert(setup.siteProduction.missing.length===0,'four-kind production targets missing');
  assert(setup.digestPure.value,'full World/advanceState baseline digest unavailable');
  return {scenario,setup};
}
async function installHarness(){
  return page(`
    const host=window.inkbox.render3d.renderer;
    if(window.__b6ProductCalls)throw new Error('B6 product call monitor installed twice');
    window.__b6ProductCalls={update:0,render:0};
    const originalUpdate=host.update,originalRender=host.render;
    host.update=function(dt){window.__b6ProductCalls.update++;return originalUpdate.call(this,dt);};
    host.render=function(){window.__b6ProductCalls.render++;return originalRender.call(this);};
    window.__b6RestoreCalls=()=>{host.update=originalUpdate;host.render=originalRender;return {...window.__b6ProductCalls};};
    if(!window.__b6FxRestore){const stage=window.inkbox.stage,original=stage.snapshotPlane;
      stage.snapshotPlane=function(plane){if(window.__b6FxReplayPlane===plane&&window.__b6FxReplaySnapshot){window.__b6FxReplayReads=(window.__b6FxReplayReads||0)+1;return window.__b6FxReplaySnapshot;}return original.call(this,plane);};
      window.__b6FxRestore=()=>{stage.snapshotPlane=original;window.__b6FxRestore=null;window.__b6FxReplayPlane=null;window.__b6FxReplaySnapshot=null;};}
    window.__b6SetState=async ({profile,lod,view,production=true,decorations=true,features={},focus='overview',fx=false},zoom=4)=>{
      const k=window.inkbox,r=k.render3d.renderer,windowView=view.endsWith('-window'),plane=windowView?view.slice(0,-7):view;
      r.setArtProfile(profile);r.setProductionAssetsEnabled(production);r.setDecorationsEnabled(decorations);r.setLODEnabled(lod);
      r.setGeographyEnabled(true);
      for(const feature of ['sites','leylines','upperQi','netherYin','rifts','riftFx'])r.setGeographyFeature(feature,!!features[feature]);
      window.__b6FxReplayPlane=fx?plane:null;window.__b6FxReplaySnapshot=fx?window.__b6FrozenFx?.[plane]||null:null;
      if(fx)window.__b6FxReplayReads=0;
      if(fx&&!window.__b6FxReplaySnapshot)throw new Error('real frozen Rift cross snapshot absent for FX soak '+plane);
      if(windowView){
        r.setActivePlane('mortal');k.selectTool(plane==='upper'?'viewUpper':'viewNether');
        k.selection=window.__b6Selections[plane];r.setRealmViewState(k.getRealmViewState());
        if(!r.realmPrototype.open||r.realmPrototype.targetPlane!==plane)throw new Error('pure window state failed '+view);
      }else{
        k.selectTool('inspect');k.selection=null;r.setRealmViewState(k.getRealmViewState());r.setActivePlane(plane);
      }
      const poi=window.__b6Focus?.[focus]||window.__b6Poi[plane],recipe=window.__b6.applyCamera(r,'WORLD_OVERVIEW',
        {poi:{...poi,source:'natural B6 '+view},yaw:.22,polar:.64,zoom});
      let stable=0,last='',warmFrames=0;
      for(let i=0;i<120&&stable<6;i++){
        await new Promise(requestAnimationFrame);warmFrames++;
        const signature=JSON.stringify({triangles:r.gpu.info.render.triangles,drawCalls:r.gpu.info.render.calls,lod:r.getLODStats(),
          visible:[...r.stages.values()].filter(s=>s.visible).map(s=>({plane:s.plane,ppu:s.terrain.inkMaterial.uniforms.pixelsPerUnit.value,
            entity:s.entities._viewPpu,tree:s.vegetation?._viewPpu,building:s.settlements?._viewPpu}))});
        stable=signature===last?stable+1:0;last=signature;
      }
      if(stable<6)throw new Error('product RAF state did not settle '+view+'/'+zoom);
      const visiblePlanes=[...r.stages.values()].filter(s=>s.visible).map(s=>s.plane);
      if(windowView?!(visiblePlanes.includes('mortal')&&visiblePlanes.includes(plane)):visiblePlanes.length!==1||visiblePlanes[0]!==plane)
        throw new Error('state plane visibility failed '+view+': '+visiblePlanes);
      if(r.scene.fog!==null)throw new Error('global fog contamination');
      return {recipe,warmFrames,visiblePlanes,geographyFeatures:r.getGeographyStats().features};
    };
    window.__b6Snapshot=()=>{
      const r=window.inkbox.render3d.renderer,gl=r.gpu.getContext();
      const programs=r.gpu.info.programs.map(p=>({name:p.name||null,linked:p.program?gl.getProgramParameter(p.program,gl.LINK_STATUS):null}));
      if(!programs.length||programs.some(p=>p.linked!==true))throw new Error('shader LINK_STATUS false or unavailable');
      const materialRefs=[...r.stages.values()].map(s=>({plane:s.plane,environment:s.environmentMaterial?.uuid,atlas:s.environmentMaterial?.uniforms.uEnvironmentAtlas.value?.uuid,ghost:s.entities?.ghostBatch?.material?.uuid,artifact:s.realmArtifacts?.batch?.material?.uuid,decoration:s.decorations?.batch?.material?.uuid,
        library:s.entities?.characterBatch?.library?.material?.uuid||null,
        realm:s.entities?.characterBatch?.realmMaterial?.uuid||null,
        active:[...new Set(Object.values(s.entities?.characterBatch?.meshes||{}).map(m=>m.material?.uuid||null))].sort()}));
      const sceneMaterials=new Set();r.scene.traverse(m=>{if(m.material)for(const material of Array.isArray(m.material)?m.material:[m.material])sceneMaterials.add(material.uuid);});
      return {resources:{...r.gpu.info.memory,programs:programs.length},sceneMaterialCount:sceneMaterials.size,environmentMaterialCount:new Set([...r.stages.values()].map(s=>s.environmentMaterial?.uuid).filter(Boolean)).size,materialRefs,programs,
        productionAssets:r.productionAssetsEnabled,decorations:r.decorationsEnabled,realmContent:[...r.stages.values()].map(s=>({plane:s.plane,ghost:s.entities?.ghostBatch?.stats,decor:s.decorations?.stats,artifact:s.realmArtifacts?.stats})),lod:r.getLODStats(),geography:r.getGeographyStats(),triangles:r.gpu.info.render.triangles,drawCalls:r.gpu.info.render.calls,
        visiblePlanes:[...r.stages.values()].filter(s=>s.visible).map(s=>s.plane),glError:gl.getError()};
    };
    window.__b6GhostProof=()=>{
      const r=window.inkbox.render3d.renderer,stage=r.stages.get('nether'),id=window.__b6GhostId;
      const matches=[];stage.entities.group.traverse(o=>{
        if(o.isInstancedMesh&&o.visible&&o.count&&o.userData.lod===0&&o.name.startsWith('Cultivator:'))
          for(let i=0;i<o.count;i++)if(o.userData.renderEntities?.[i]?.id===id)
            matches.push({mesh:o.name,instanceId:i,lod:o.userData.lod,id,
              activeMaterial:o.material?.uuid||null,
              libraryMaterial:stage.entities.characterBatch?.library?.material?.uuid||null,
              realmMaterial:stage.entities.characterBatch?.realmMaterial?.uuid||null});
      });
      return {id,matches};
    };
    return true;
  `);
}
async function warmAllStates(){
  const warm=[];
  for(const state of warmStates){
    const zooms=[];
    for(const zoom of [18,4,.5]){
      report.warmupProgress={completedStates:warm.length,totalStates:warmStates.length,key:state.key,zoom};
      const result=await page(`return window.__b6SetState(${JSON.stringify(state)},${zoom});`, { label:`warm settle ${state.key} zoom ${zoom}` });
      assert.deepEqual(result.geographyFeatures,state.features||{},`${state.key}: geography feature mask not applied`);
      const snapshot=await page(`return window.__b6Snapshot();`,{label:`warm GPU snapshot ${state.key} zoom ${zoom}`});
      assert.equal(snapshot.glError,0,`${state.key} zoom ${zoom}: GL error`);
      let ghostProof=null;
      if(state.production&&zoom===18&&(state.view==='nether'||state.view==='nether-window')&&state.lod){
        ghostProof=await page(`return window.__b6GhostProof();`,{label:`warm ghost proof ${state.key}`});
        assert(ghostProof.matches.length>0,`${state.key}: real ghostCultivator did not enter a visible LOD0 GLB batch`);
        for(const match of ghostProof.matches){
          assert(match.libraryMaterial,`${state.key}: source library GLB material missing`);
          if(state.profile==='realm-style-v1')assert(match.realmMaterial,`${state.key}: realm GLB material missing`);
          assert.equal(match.activeMaterial,state.profile==='realm-style-v1'?match.realmMaterial:match.libraryMaterial,
            `${state.key}: ghost GLB active material did not follow profile`);
        }
      }
      zooms.push({zoom,warmFrames:result.warmFrames,resources:snapshot.resources,programs:snapshot.programs.length,ghostProof});
    }
    warm.push({key:state.key,zooms});
    console.log(`warm ${warm.length}/${warmStates.length} ${state.key} ${zooms.map(z=>`${z.zoom}:${z.warmFrames}frames`).join(' ')}`);
  }
  const reference={};
  for(const state of states){
    report.warmupProgress={completedStates:warm.length,totalStates:warmStates.length,key:state.key,zoom:4,recordingReference:true};
    await page(`return window.__b6SetState(${JSON.stringify(state)},4);`, { label:`reference settle ${state.key}` });
    const snapshot=await page(`return window.__b6Snapshot();`,{label:`reference GPU snapshot ${state.key}`});
    assert.equal(snapshot.glError,0,`${state.key}: baseline GL error`);
    reference[state.key]={resources:snapshot.resources,materialRefs:snapshot.materialRefs};
  }
  return {warm,reference,explanation:'All 20 production decoration/LOD/view states plus five legacy views fully warmed at legal zoom 18/4/0.5; then per-state resource/material references recorded after all shader variants exist.'};
}
async function lifecycle(){
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,gl=r.gpu.getContext(),states=${JSON.stringify(states)},before=await window.__b6.snapshotDigest(k);
    const originalSize=[r.width,r.height],checkpoints=[];let previous=null,raf=[],measuredCalls={update:0,render:0};
    for(let frame=0;frame<600;frame++){
      if(frame%30===0){const base=states[Math.floor(frame/30)],production=Math.floor(frame/30)%2===0;await window.__b6SetState({...base,production,profile:production?'realm-style-v1':'legacy'},frame%90===0?18:4);}
      if(frame===80||frame===300)r.resize(originalSize[0]-17,originalSize[1]-11);
      if(frame===100||frame===320)r.resize(...originalSize);
      r.cameraRig.rotate(.004);
      const pan=.015*Math.sin(frame/20);r.cameraRig.camera.position.x+=pan;r.cameraRig.controls.target.x+=pan;r.cameraRig.controls.update();
      r.cameraRig.camera.zoom=[18,4,.5][Math.floor(frame/10)%3];r.cameraRig.camera.updateProjectionMatrix();
      const beforeCalls={...window.__b6ProductCalls};
      const t=await new Promise(requestAnimationFrame);if(previous!==null)raf.push(t-previous);previous=t;
      measuredCalls.update+=window.__b6ProductCalls.update-beforeCalls.update;
      measuredCalls.render+=window.__b6ProductCalls.render-beforeCalls.render;
      const error=gl.getError();if(error)throw new Error('lifecycle GL error '+error+' frame '+frame);
      if(frame%100===99)checkpoints.push({frame,view:states[Math.floor(frame/30)].view,resources:window.__b6Snapshot().resources});
    }
    r.resize(...originalSize);
    const after=await window.__b6.snapshotDigest(k),sorted=raf.sort((a,b)=>a-b);
    const actualCalls=measuredCalls;
    if(Math.abs(actualCalls.update-600)>1||Math.abs(actualCalls.render-600)>1)
      throw new Error('product update/render call count diverged from 600 measured lifecycle RAF callbacks');
    return {frames:600,worldDigestBefore:before,worldDigestAfter:after,worldUnchanged:before.value===after.value,
      resizeRestored:r.width===originalSize[0]&&r.height===originalSize[1],checkpoints,actualCalls,
      raf:{samples:raf.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)]}};
  `, { timeoutMs: 300000 });
}
async function soakBlock(block,state){
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,gl=r.gpu.getContext(),state=${JSON.stringify(state)};
    const warm=await window.__b6SetState(state,4),raf=[],segments=[];let previous=null;
    const startCalls={...window.__b6ProductCalls};
    for(let i=0;i<300;i++){
      r.cameraRig.rotate(.003);
      r.cameraRig.camera.zoom=[18,4,.5][Math.floor(i/30)%3];r.cameraRig.camera.updateProjectionMatrix();
      const t=await new Promise(requestAnimationFrame);if(previous!==null)raf.push(t-previous);previous=t;
      const error=gl.getError();if(error)throw new Error('soak GL error '+error+' block ${block} frame '+i);
      if(i%30===29){const snap=window.__b6Snapshot();if(snap.glError)throw new Error('segment GL error block ${block} frame '+i);
        segments.push({frame:i+1,zoom:[18,4,.5][Math.floor(i/30)%3],resources:snap.resources,materialRefs:snap.materialRefs});}
    }
    const actualCalls={update:window.__b6ProductCalls.update-startCalls.update,render:window.__b6ProductCalls.render-startCalls.render};
    if(Math.abs(actualCalls.update-300)>1||Math.abs(actualCalls.render-300)>1)
      throw new Error('product update/render call count diverged from 300 measured RAF callbacks in block ${block}');
    const finalWarm=await window.__b6SetState(state,4),snapshot=window.__b6Snapshot();
    const fxBurst=state.fx?{snapshotReads:window.__b6FxReplayReads||0,probeInstances:r.stages.get(state.view.endsWith('-window')?state.view.slice(0,-7):state.view)?.fxProbe?.mesh?.count||0,
      proof:window.__b6FxProof?.[state.view.startsWith('upper')?'upper':'nether']||null}:null;
    if(state.fx&&(!fxBurst.snapshotReads||!fxBurst.probeInstances))throw new Error('true frozen Rift snapshot burst produced no consumed FX instances: '+JSON.stringify(fxBurst));
    const sorted=raf.sort((a,b)=>a-b);
    return {block:${block},key:state.key,state,frames:300,actualCalls,segments,warmFrames:[warm.warmFrames,finalWarm.warmFrames],
      worldDigest:await window.__b6.snapshotDigest(k),snapshot,fxBurst,
      raf:{samples:raf.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)]}};
  `, { timeoutMs: 180000 });
}

try{
  fs.mkdirSync(output,{recursive:true});
  const executable=findEdge();assert(executable,'Microsoft Edge is required');
  server=await startServer();
  browser=await launch({url:'about:blank',browser:executable,width:1500,height:940,gpu:true,timeoutMs:30000});report.browser=browser.meta;
  await browser.cdp.send('Network.enable');await browser.cdp.send('Page.navigate',{url:url.toString()});
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size',{timeoutMs:60000}),
    `Render3D did not boot: ${browser.errors().join(' | ')}`);
  report.phase='natural scenario';
  const prepared=await prepare();report.scenarioRecipe=prepared.scenario;report.setup=prepared.setup;
  report.phase='install product call monitor';
  await installHarness();await browser.cdp.send('Performance.enable',{},30000);
  report.phase='warm resources';
  report.warmup=await warmAllStates();
  report.warmup.worldDigest=await page(`return window.__b6.snapshotDigest(window.inkbox);`);
  assert.equal(report.warmup.worldDigest.value,report.setup.digestPure.value,'fully warmed production/decoration states changed full World/advanceState');
  report.phase='post-GC memory baseline';report.cpuMemoryBaseline=await cpuMemorySample();
  const first=report.cpuMemoryBaseline;
  const memoryLimits={heapBytes:first.jsHeapUsedBytes*1.25+8*1024*1024,
    domNodes:first.domNodes*1.10+200,listeners:first.jsEventListeners*1.10+100};
  report.memoryLimits=memoryLimits;
  const checkMemory=(sample,label)=>{
    assert(sample.jsHeapUsedBytes<=memoryLimits.heapBytes,`${label}: post-GC heap exceeded fully warmed pre-lifecycle bound`);
    assert(sample.domNodes<=memoryLimits.domNodes,`${label}: DOM nodes exceeded fully warmed pre-lifecycle bound`);
    assert(sample.jsEventListeners<=memoryLimits.listeners,`${label}: DOM listeners exceeded fully warmed pre-lifecycle bound`);
  };
  report.phase='600-frame lifecycle';report.lifecycle=await lifecycle();
  report.lifecycle.cpuMemory=await cpuMemorySample();checkMemory(report.lifecycle.cpuMemory,'600-frame lifecycle');
  assert(report.lifecycle.worldUnchanged&&report.lifecycle.resizeRestored,'600-frame lifecycle changed World or failed resize restore');
  assert.equal(report.lifecycle.worldDigestAfter.value,report.setup.digestPure.value,'lifecycle changed full World/advanceState');
  for(let block=0;block<20;block++){
    report.phase=`6000-frame soak block ${block+1}/20`;
    const state=states[block],current=await soakBlock(block,state);
    current.cpuMemory=await cpuMemorySample();
    checkMemory(current.cpuMemory,state.key);
    assert.equal(current.snapshot.glError,0,`${state.key}: GL error`);
    assert.equal(current.worldDigest.value,report.setup.digestPure.value,`${state.key}: World/advanceState changed`);
    assert.deepEqual(current.snapshot.resources,report.warmup.reference[state.key].resources,`${state.key}: GPU resources drifted`);
    assert.deepEqual(current.snapshot.materialRefs,report.warmup.reference[state.key].materialRefs,`${state.key}: instance material references drifted`);
    assert.deepEqual(current.snapshot.geography.features,state.features,`${state.key}: geography features changed during soak`);
    if(state.fx)assert(current.fxBurst?.proof?.frozen&&current.fxBurst?.proof?.immutableSHA256&&current.fxBurst.snapshotReads>=1,
      `${state.key}: actual deeply frozen snapshot was not burst-consumed`);
    for(const segment of current.segments){
      assert.deepEqual(segment.resources,report.warmup.reference[state.key].resources,`${state.key}: GPU resources drifted at zoom ${segment.zoom} frame ${segment.frame}`);
      assert.deepEqual(segment.materialRefs,report.warmup.reference[state.key].materialRefs,`${state.key}: material refs drifted at zoom ${segment.zoom} frame ${segment.frame}`);
    }
    report.blocks.push(current);
    console.log(`soak ${(block+1)*300}/6000 ${state.key} geometry=${current.snapshot.resources.geometries} textures=${current.snapshot.resources.textures} programs=${current.snapshot.resources.programs}`);
    fs.writeFileSync(path.join(output,'soak-progress.json'),JSON.stringify(report,null,2));
  }
  const last=report.blocks.at(-1).cpuMemory,observed=[report.lifecycle.cpuMemory,...report.blocks.map(b=>b.cpuMemory)];
  report.cpuMemoryStability={samplesChecked:observed.length,first,last,limits:memoryLimits,
    peakHeapBytes:Math.max(...observed.map(s=>s.jsHeapUsedBytes)),
    peakDomNodes:Math.max(...observed.map(s=>s.domNodes)),
    peakListeners:Math.max(...observed.map(s=>s.jsEventListeners)),
    heapGrowthBytes:last.jsHeapUsedBytes-first.jsHeapUsedBytes,
    domNodeDelta:last.domNodes-first.domNodes,listenerDelta:last.jsEventListeners-first.jsEventListeners};
  const urls=browser.cdp.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request.url);
  report.loads={environment:urls.filter(u=>new URL(u).pathname.endsWith('/environment_library.glb')).length,atlas:urls.filter(u=>new URL(u).pathname.endsWith('/EntityAtlas.png')).length,cultivator:urls.filter(u=>new URL(u).pathname.endsWith('/cultivator_library.glb')).length};
  assert.deepEqual(report.loads,{environment:1,atlas:1,cultivator:1});
  report.diagnostics=diagnostics();assert.deepEqual([...report.diagnostics.consoleErrors,...report.diagnostics.runtimeErrors],[],'browser errors');
  report.phase='complete';report.pass=true;
}catch(error){report.failure=error.stack||String(error);report.failureOperation={...report.activeOperation};report.diagnostics=diagnostics();process.exitCode=1;console.error(report.failure);}
finally{
  if(browser){try{report.productCallMonitor=await page(`window.__b6FxRestore?.();return window.__b6RestoreCalls?.()||null;`);}catch{/* page may have failed */}}
  report.finishedAt=new Date().toISOString();fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'lifecycle-soak.json'),JSON.stringify(report,null,2));
  try{fs.unlinkSync(path.join(output,'soak-progress.json'));}catch{/* no progress */}
  await browser?.close();if(server&&server.exitCode===null){server.kill();await sleep(250);}
}
