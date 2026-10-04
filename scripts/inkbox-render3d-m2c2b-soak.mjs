// M2-C2B Pass1 shipping assets: product-RAF-only 600-frame lifecycle and 6000-frame realm resource soak.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, findEdge, sleep } from './cdp.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.INKBOX_PORT||4231),base=process.env.INKBOX_URL||`http://127.0.0.1:${port}`;
const url=new URL(base);
url.pathname=`${url.pathname.replace(/\/$/,'').replace(/\/inkbox\.html$/i,'')}/inkbox.html`;
url.searchParams.set('assets','on');url.searchParams.set('renderer','3d');url.searchParams.set('boundary','strata');
const output=path.resolve(process.env.INKBOX_REPORT_DIR||path.join(root,'reports/m2c2b/pass1/soak'));
const profiles=['legacy','realm-style-v1'],views=['mortal','upper','nether','upper-window','nether-window'];
const states=[false,true].flatMap(decorations=>[false,true].flatMap(lod=>views.map(view=>({profile:'realm-style-v1',production:true,decorations,lod,view,key:`production/${decorations?'decor':'no-decor'}/${lod?'lod':'no-lod'}/${view}`}))));
const warmStates=[...states,...views.map(view=>({profile:'legacy',production:false,decorations:false,lod:true,view,key:'legacy/'+view}))];
const report={startedAt:new Date().toISOString(),scenario:'NETHER_STYLE_A',sourceURL:url.toString(),
  gitCommit:(()=>{try{return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{return null;}})(),
  serverMode:process.env.INKBOX_URL?'controlled-existing-URL':'self-hosted',lifecycleFrames:600,soakFrames:6000,
  blockFrames:300,states:states.map(({key})=>key),blocks:[],pass:false};
let server,browser;
const page=(body,options)=>{const expression=`return (async()=>{${body}})();`;new vm.Script(`(()=>{${expression}})()`);return browser.js(expression,options);};
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
  await page(`window.__b6=await import('./src/inkbox/render3d/art/VisualScenarios.js');return true;`);
  let scenario;
  for(let startStep=0;startStep<7200;startStep+=900)
    scenario=await page(`return window.__b6.applyScenarioAsync(window.inkbox,'NETHER_STYLE_A',{startStep:${startStep},stepCount:900});`, { timeoutMs: 180000 });
  assert(scenario.complete&&scenario.worldDay===21600&&scenario.coverage.ghostCultivators>0,'natural Nether fixture incomplete');
  const setup=await page(`
    const k=window.inkbox,r=k.render3d.renderer;
    for(let i=0;i<180&&r.world!==k.world;i++)await new Promise(requestAnimationFrame);
    if(r.world!==k.world||r.stages.get('upper')?.world!==k.world.upper||r.stages.get('nether')?.world!==k.world.nether)
      throw new Error('product RAF did not adopt natural World');
    await r.environmentLoadPromise;await r.characterLoadPromise;if(r.environmentLoadError||r.characterLoadError)throw r.environmentLoadError||r.characterLoadError;
    const ghost=k.world.nether.entities.find(e=>e.soulKind==='ghostCultivator');
    const upper=k.world.upper.entities.find(e=>Number.isFinite(e.x)&&Number.isFinite(e.y));
    if(!ghost||!upper)throw new Error('natural ghostCultivator or Upper entity missing');
    window.__b6GhostId=ghost.id;
    window.__b6Poi={mortal:{x:(k.world.w-1)/2,y:(k.world.h-1)/2},upper:{x:upper.x,y:upper.y},nether:{x:ghost.x,y:ghost.y}};
    window.__b6Selections={};
    const digestBefore=await window.__b6.snapshotDigest(k),actions=[];
    for(const plane of ['upper','nether']){
      const p=window.__b6Poi[plane],w=k.world,radiusX=Math.floor(w.w*.28),radiusY=Math.floor(w.h*.28);
      const x0=Math.max(1,Math.floor(p.x-radiusX)),x1=Math.min(w.w-2,Math.ceil(p.x+radiusX));
      const y0=Math.max(1,Math.floor(p.y-radiusY)),y1=Math.min(w.h-2,Math.ceil(p.y+radiusY));
      r.setActivePlane('mortal');k.selectTool(plane==='upper'?'viewUpper':'viewNether');
      k.commitSelection([[x0,y0],[x1,y0],[x1,y1],[x0,y1]]);
      for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);
      if(!r.realmPrototype.open||r.realmPrototype.targetPlane!==plane||!k.selection)throw new Error('normal UI window did not open '+plane);
      window.__b6Selections[plane]=k.selection;
      actions.push({plane,selection:{area:k.selection.area,bounds:[x0,y0,x1,y1],capped:k.selection.capped},
        rifts:k.world.rifts.filter(x=>x.targetPlane===plane).length,digestAfter:await window.__b6.snapshotDigest(k)});
    }
    k.selectTool('inspect');k.selection=null;r.setRealmViewState(k.getRealmViewState());r.setActivePlane('mortal');
    for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);
    return {digestBefore,actions,digestPure:await window.__b6.snapshotDigest(k),worldDay:k.world.day,
      mortalEntities:k.world.entities.length,upperEntities:k.world.upper.entities.length,netherEntities:k.world.nether.entities.length,
      ghost:{id:ghost.id,x:ghost.x,y:ghost.y,soulKind:ghost.soulKind},upper:{id:upper.id,x:upper.x,y:upper.y}};
  `, { timeoutMs: 180000 });
  assert.equal(setup.upperEntities,12,'natural fixture did not contain 12 Upper entities');
  assert.equal(setup.digestPure.value,setup.actions.at(-1).digestAfter.value,'pure close changed World');
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
    window.__b6SetState=async ({profile,lod,view,production=true,decorations=true},zoom=4)=>{
      const k=window.inkbox,r=k.render3d.renderer,windowView=view.endsWith('-window'),plane=windowView?view.slice(0,-7):view;
      r.setArtProfile(profile);r.setProductionAssetsEnabled(production);r.setDecorationsEnabled(decorations);r.setLODEnabled(lod);
      if(windowView){
        r.setActivePlane('mortal');k.selectTool(plane==='upper'?'viewUpper':'viewNether');
        k.selection=window.__b6Selections[plane];r.setRealmViewState(k.getRealmViewState());
        if(!r.realmPrototype.open||r.realmPrototype.targetPlane!==plane)throw new Error('pure window state failed '+view);
      }else{
        k.selectTool('inspect');k.selection=null;r.setRealmViewState(k.getRealmViewState());r.setActivePlane(plane);
      }
      const poi=window.__b6Poi[plane],recipe=window.__b6.applyCamera(r,'WORLD_OVERVIEW',
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
      return {recipe,warmFrames,visiblePlanes};
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
        productionAssets:r.productionAssetsEnabled,decorations:r.decorationsEnabled,realmContent:[...r.stages.values()].map(s=>({plane:s.plane,ghost:s.entities?.ghostBatch?.stats,decor:s.decorations?.stats,artifact:s.realmArtifacts?.stats})),lod:r.getLODStats(),triangles:r.gpu.info.render.triangles,drawCalls:r.gpu.info.render.calls,
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
      const result=await page(`return window.__b6SetState(${JSON.stringify(state)},${zoom});`, { timeoutMs: 120000 });
      const snapshot=await page(`return window.__b6Snapshot();`);
      assert.equal(snapshot.glError,0,`${state.key} zoom ${zoom}: GL error`);
      let ghostProof=null;
      if(state.production&&zoom===18&&(state.view==='nether'||state.view==='nether-window')&&state.lod){
        ghostProof=await page(`return window.__b6GhostProof();`);
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
  }
  const reference={};
  for(const state of states){
    await page(`return window.__b6SetState(${JSON.stringify(state)},4);`, { timeoutMs: 120000 });
    const snapshot=await page(`return window.__b6Snapshot();`);
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
    const sorted=raf.sort((a,b)=>a-b);
    return {block:${block},key:state.key,state,frames:300,actualCalls,segments,warmFrames:[warm.warmFrames,finalWarm.warmFrames],
      worldDigest:await window.__b6.snapshotDigest(k),snapshot,
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
  const prepared=await prepare();report.scenarioRecipe=prepared.scenario;report.setup=prepared.setup;
  await installHarness();await browser.cdp.send('Performance.enable',{},30000);
  report.warmup=await warmAllStates();
  report.warmup.worldDigest=await page(`return window.__b6.snapshotDigest(window.inkbox);`);
  assert.equal(report.warmup.worldDigest.value,report.setup.digestPure.value,'fully warmed production/decoration states changed full World/advanceState');
  report.cpuMemoryBaseline=await cpuMemorySample();
  const first=report.cpuMemoryBaseline;
  const memoryLimits={heapBytes:first.jsHeapUsedBytes*1.25+8*1024*1024,
    domNodes:first.domNodes*1.10+200,listeners:first.jsEventListeners*1.10+100};
  report.memoryLimits=memoryLimits;
  const checkMemory=(sample,label)=>{
    assert(sample.jsHeapUsedBytes<=memoryLimits.heapBytes,`${label}: post-GC heap exceeded fully warmed pre-lifecycle bound`);
    assert(sample.domNodes<=memoryLimits.domNodes,`${label}: DOM nodes exceeded fully warmed pre-lifecycle bound`);
    assert(sample.jsEventListeners<=memoryLimits.listeners,`${label}: DOM listeners exceeded fully warmed pre-lifecycle bound`);
  };
  report.lifecycle=await lifecycle();
  report.lifecycle.cpuMemory=await cpuMemorySample();checkMemory(report.lifecycle.cpuMemory,'600-frame lifecycle');
  assert(report.lifecycle.worldUnchanged&&report.lifecycle.resizeRestored,'600-frame lifecycle changed World or failed resize restore');
  assert.equal(report.lifecycle.worldDigestAfter.value,report.setup.digestPure.value,'lifecycle changed full World/advanceState');
  for(let block=0;block<20;block++){
    const state=states[block],current=await soakBlock(block,state);
    current.cpuMemory=await cpuMemorySample();
    checkMemory(current.cpuMemory,state.key);
    assert.equal(current.snapshot.glError,0,`${state.key}: GL error`);
    assert.equal(current.worldDigest.value,report.setup.digestPure.value,`${state.key}: World/advanceState changed`);
    assert.deepEqual(current.snapshot.resources,report.warmup.reference[state.key].resources,`${state.key}: GPU resources drifted`);
    assert.deepEqual(current.snapshot.materialRefs,report.warmup.reference[state.key].materialRefs,`${state.key}: instance material references drifted`);
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
  report.pass=true;
}catch(error){report.failure=error.stack||String(error);report.diagnostics=diagnostics();process.exitCode=1;console.error(report.failure);}
finally{
  if(browser){try{report.productCallMonitor=await page(`return window.__b6RestoreCalls?.()||null;`);}catch{/* page may have failed */}}
  report.finishedAt=new Date().toISOString();fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'lifecycle-soak.json'),JSON.stringify(report,null,2));
  try{fs.unlinkSync(path.join(output,'soak-progress.json'));}catch{/* no progress */}
  await browser?.close();if(server&&server.exitCode===null){server.kill();await sleep(250);}
}
