// B4 cross-realm visual proof. All simulation facts come from NETHER_STYLE_A,
// the normal view tools/commitSelection path, and ordinary advanceDays calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { launch, findEdge } from './cdp.mjs';
import { waitForIdlePresentation } from './inkbox-browser-steady-view.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.INKBOX_URL || `http://127.0.0.1:${process.env.INKBOX_PORT || 4192}`;
const url = new URL(base);
url.pathname = `${url.pathname.replace(/\/$/, '').replace(/\/inkbox\.html$/i, '')}/inkbox.html`;
url.searchParams.set('renderer', '3d'); url.searchParams.set('assets','off'); url.searchParams.set('boundary', 'strata');
const output = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(root, 'reports/m2c2b0/b4-cross'));
const profiles = ['legacy', 'realm-style-v1'];
const samples = 120;
let browser;
const page = (body, options) => {
  const expression = `return (async()=>{${body}})();`;
  new vm.Script(`(()=>{${expression}})()`);
  return browser.js(expression, options);
};
const evidence = {
  generatedAt: new Date().toISOString(), scenario: 'NETHER_STYLE_A', source: url.toString(), profiles,
  samplesPerCase: samples, advanceDaysPerRealm: 1080, cases: [], setup: [], diagnostics: {},
  provenance: {
    scenario: 'fresh Sandbox RNG and advanceState; newWorld medium seed 20260923; 7200 x advanceDays(3), yielding every 100',
    window: 'normal selectTool(viewUpper/viewNether) + commitSelection; no synthetic Rift objects',
    riftGrowth: 'normal advanceDays(3) for 360 calls per target; no radius/age/strength/rule edits',
    rendering: 'product requestAnimationFrame only; no manual Host.update/render',
    purity: 'SHA-256 over full Sandbox World and advanceState, after all intentional window/rift setup'
  }
};

async function prepareScenario() {
  await page(`window.__crossProof=await import('./src/inkbox/render3d/art/VisualScenarios.js');return true;`);
  let scenario;
  for (let startStep = 0; startStep < 7200; startStep += 900) {
    scenario = await page(`const k=window.inkbox;return window.__crossProof.applyScenarioAsync(k,'NETHER_STYLE_A',{startStep:${startStep},stepCount:900});`, { timeoutMs: 180000 });
  }
  assert(scenario.complete && scenario.worldDay === 21600, 'natural 60-year scenario incomplete');
  return scenario;
}

async function waitProduct(host, n = 4) {
  return page(`const r=window.inkbox.render3d.renderer;for(let i=0;i<${n};i++)await new Promise(requestAnimationFrame);return true;`);
}

async function openAndGrow(targetPlane) {
  const opened = await page(`
    const k=window.inkbox,r=k.render3d.renderer,w=k.world;
    const before=await window.__crossProof.snapshotDigest(k);
    const existingRiftIds=new Set((k.world.rifts||[]).map(x=>x.id));
    r.setActivePlane('mortal');
    k.selectTool(${JSON.stringify(targetPlane === 'upper' ? 'viewUpper' : 'viewNether')});
    // A real rectangular player selection, sized to retain mortal outside content
    // while including a broad sample of sparse Upper/Nether populations.
    const x0=Math.floor(w.w*.22),x1=Math.ceil(w.w*.78),y0=Math.floor(w.h*.22),y1=Math.ceil(w.h*.78);
    k.commitSelection([[x0,y0],[x1,y0],[x1,y1],[x0,y1]]);
    for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);
    if(!r.realmPrototype.open||r.realmPrototype.targetPlane!==${JSON.stringify(targetPlane)})throw new Error('normal UI selection did not open target window');
    const state=k.getRealmViewState();
    const newRifts=(k.world.rifts||[]).filter(x=>x.targetPlane===${JSON.stringify(targetPlane)}&&!existingRiftIds.has(x.id))
      .map(x=>({id:x.id,x:x.x,y:x.y,age:x.age||0,strength:x.strength}));
    return {before,worldDay:w.day,region:{x0:state.region.x0,y0:state.region.y0,x1:state.region.x1,y1:state.region.y1,area:state.region.area},
      selectionArea:k.selection?.area??null,newAgeZeroRifts:newRifts,riftCount:k.world.rifts.length,state};
  `, { timeoutMs: 180000 });
  assert(opened.newAgeZeroRifts.length > 0, `${targetPlane} normal UI commit did not create an age-zero Rift`);
  evidence.setup.push({targetPlane,phase:'normal-ui-open',worldDay:opened.worldDay,region:opened.region,
    selectionArea:opened.selectionArea,newAgeZeroRifts:opened.newAgeZeroRifts,riftCount:opened.riftCount,
    digestBefore:opened.before.value});
  // Keep the normal active render loop alive between bounded batches.
  const grown = await page(`
    const k=window.inkbox;let checkpoints=[];
    for(let batch=0;batch<12;batch++){
      for(let day=0;day<30;day++)k.advanceDays(3);
      await new Promise(requestAnimationFrame);
      if(batch===0||batch===5||batch===11)checkpoints.push({worldDay:k.world.day,
        targetRifts:k.world.rifts.filter(r=>r.targetPlane===${JSON.stringify(targetPlane)}).map(r=>({id:r.id,age:r.age||0}))});
    }
    const kRifts=k.world.rifts.filter(r=>r.targetPlane===${JSON.stringify(targetPlane)});
    return {worldDay:k.world.day,advancedDays:1080,rifts:kRifts.map(r=>({id:r.id,x:r.x,y:r.y,age:r.age||0,strength:r.strength})),checkpoints};
  `, { timeoutMs: 180000 });
  const grownNew = grown.rifts.filter(r => opened.newAgeZeroRifts.some(n => n.id === r.id));
  assert(grownNew.some(r => r.age >= 1080), `${targetPlane} newly opened Rift did not naturally age to 1080 days`);
  evidence.setup.push({targetPlane,phase:'natural-growth',worldDay:grown.worldDay,advancedDays:grown.advancedDays,
    rifts:grown.rifts,checkpoints:grown.checkpoints,newRiftsAtLeast1080Days:grownNew.filter(r=>r.age>=1080)});
  return { state: opened.state, region: opened.region, grown };
}

async function enterPureWindow(targetPlane, region) {
  const result = await page(`
    const k=window.inkbox,r=k.render3d.renderer;
    r.setActivePlane('mortal');
    // Keep the real Sandbox view tool active. selectTool clears selection on a
    // tool transition, so restore that committed object. No commit is repeated.
    const savedSelection=k.selection;
    if(!savedSelection)throw new Error('pure realm switch has no previously committed selection to restore');
    k.selectTool(${JSON.stringify(targetPlane === 'upper' ? 'viewUpper' : 'viewNether')});
    k.selection=savedSelection;
    const state=k.getRealmViewState();
    if(!state.open||!state.region)throw new Error('restored UI selection did not produce a pure realm state');
    r.setRealmViewState(state);
    if(!r.realmPrototype.open||r.realmPrototype.targetPlane!==${JSON.stringify(targetPlane)})throw new Error('pure Host realm target switch failed');
    for(let i=0;i<6;i++)await new Promise(requestAnimationFrame);
    const target=r.stages.get(${JSON.stringify(targetPlane)});
    if(!target.regionGeometry?.region)throw new Error('product RAF did not retain the committed RegionGeometry');
    return {visiblePlanes:[...r.stages.values()].filter(s=>s.visible).map(s=>s.plane),
      targetRifts:r.world.rifts.filter(x=>x.targetPlane===${JSON.stringify(targetPlane)}),
      region:{x0:target.regionGeometry.region.x0,y0:target.regionGeometry.region.y0,
        x1:target.regionGeometry.region.x1,y1:target.regionGeometry.region.y1}};
  `);
  assert.deepEqual(new Set(result.visiblePlanes), new Set(['mortal',targetPlane]), `${targetPlane} visibility ownership`);
  return result;
}

async function configure(view,targetPlane,profile) {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,a=window.__crossProof,T=await import('three');
    r.setArtProfile(${JSON.stringify(profile)});r.setLODEnabled(true);
    r.setRealmViewState(k.getRealmViewState());
    const camera=a.applyCamera(r,'WORLD_OVERVIEW',{poi:${JSON.stringify(view.poi)},yaw:${view.yaw},polar:${view.polar},zoom:${view.zoom}});
    for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);
    const fxSettling=await (${waitForIdlePresentation.toString()})(r);
    let previous='',stable=0,warmFrames=8+fxSettling.frames;
    for(let i=0;i<120&&stable<6;i++){
      await new Promise(requestAnimationFrame);warmFrames++;
      const signature=JSON.stringify({triangles:r.gpu.info.render.triangles,draws:r.gpu.info.render.calls,lod:r.getLODStats(),
        planes:[...r.stages.values()].filter(s=>s.visible).map(s=>({p:s.plane,ppu:s.terrain.inkMaterial?.uniforms.pixelsPerUnit.value,
          e:s.entities._viewPpu,t:s.vegetation?._viewPpu,b:s.settlements?._viewPpu}))});
      stable=signature===previous?stable+1:0;previous=signature;
    }
    if(stable<6)throw new Error('cross-realm view did not settle on product RAF');
    const target=r.stages.get(${JSON.stringify(targetPlane)}),u=target.terrain.inkMaterial.uniforms;
    if(r.scene.fog!==null)throw new Error('global fog contaminated cross-realm window');
    if(${JSON.stringify(profile==='realm-style-v1')}&&(u.realmStyleEnabled.value!==1||target.entities.artProfile?.realmStyle?.plane!==${JSON.stringify(targetPlane)}))
      throw new Error('stage-local realm style did not bind in cross-realm window');
    const gl=r.gpu.getContext(),programs=r.gpu.info.programs.map(p=>({name:p.name||null,linked:p.program?gl.getProgramParameter(p.program,gl.LINK_STATUS):null,
      log:p.diagnostics?.programLog||p.diagnostics?.vertexShader?.log||p.diagnostics?.fragmentShader?.log||null}));
    if(programs.some(p=>p.linked!==true)||!programs.length)throw new Error('a WebGL shader failed LINK_STATUS or status unavailable');
    const pose={position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom,
      matrixWorld:r.cameraRig.camera.matrixWorld.toArray()};
    if(Math.abs(pose.zoom-camera.zoom)>1e-6)throw new Error('camera zoom drift');
    return {pose,recipe:camera.recipe,warmFrames,fxSettling,visiblePlanes:[...r.stages.values()].filter(s=>s.visible).map(s=>s.plane),
      targetStyle:target.entities.artProfile?.realmStyle?.plane||null,targetTerrainStyle:u.realmStyleEnabled.value,
      fogIsNull:r.scene.fog===null,programs,boundary:{...r.boundary.stats,visible:r.boundary.mesh.visible,mode:r.boundaryMode},
      targetEntities:target.entities?{...target.entities.stats,lod:[...target.entities.stats.lod]}:null,
      targetVegetation:target.vegetation?{...target.vegetation.stats,lod:[...target.vegetation.stats.lod]}:null,
      targetSettlements:target.settlements?{...target.settlements.stats,lod:[...target.settlements.stats.lod]}:null};
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
    const expectedCalls=${samples}+1;
    if(Math.abs(state.updateCalls-expectedCalls)>1||Math.abs(state.renderCalls-expectedCalls)>1)
      throw new Error('product update/render calls drifted from RAF sample window');
    const gl=r.gpu.getContext();return {case:${JSON.stringify(label)},cpuUpdate:summary(state.update),cpuRender:summary(state.render),raf:summary(state.raf),
      productCalls:{update:state.updateCalls,render:state.renderCalls,rafCallbacks:expectedCalls},triangles:r.gpu.info.render.triangles,drawCalls:r.gpu.info.render.calls,
      glError:gl.getError(),visiblePlanes:[...r.stages.values()].filter(s=>s.visible).map(s=>s.plane),lodStats:r.getLODStats(),boundary:{...r.boundary.stats}};
  `, { timeoutMs: 180000 });
}

async function ownershipAndSeam(targetPlane) {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,T=await import('three');
    const target=r.stages.get(${JSON.stringify(targetPlane)}),mortal=r.stages.get('mortal'),g=target.regionGeometry;
    const isInside=(x,y)=>g.isInsideCell(x,y);
    const allEntities=(stage)=>{
      const world=stage.world,rows=[];
      stage.entities?.group.traverse(o=>{if(o.isInstancedMesh&&o.visible&&o.count&&o.userData.renderEntities)
        for(const e of o.userData.renderEntities.slice(0,o.count))if(e)rows.push({id:e.id,x:e.x,y:e.y,lod:o.userData.lod??0,plane:stage.plane});});
      return rows;
    };
    const entityInstances={mortal:allEntities(mortal),target:allEntities(target)};
    const entityOwnership={mortal:{total:entityInstances.mortal.length,inside:entityInstances.mortal.filter(e=>isInside(e.x,e.y)).length,
      outside:entityInstances.mortal.filter(e=>!isInside(e.x,e.y)).length,mismatches:entityInstances.mortal.filter(e=>isInside(e.x,e.y)).length},
      target:{total:entityInstances.target.length,inside:entityInstances.target.filter(e=>isInside(e.x,e.y)).length,
      outside:entityInstances.target.filter(e=>!isInside(e.x,e.y)).length,mismatches:entityInstances.target.filter(e=>!isInside(e.x,e.y)).length}};
    const trees=stage=>stage.vegetation?.trees||[];
    const treeOwnership={mortal:{total:trees(mortal).length,inside:trees(mortal).filter(t=>isInside(t.x,t.y)).length,
      outside:trees(mortal).filter(t=>!isInside(t.x,t.y)).length},target:{total:trees(target).length,
      inside:trees(target).filter(t=>isInside(t.x,t.y)).length,outside:trees(target).filter(t=>!isInside(t.x,t.y)).length}};
    const selected=stage=>stage.settlements?._selectedBuildings||[];
    const bldgOwnership={mortal:{total:selected(mortal).length,inside:selected(mortal).filter(b=>isInside(b.x,b.y)).length,
      outside:selected(mortal).filter(b=>!isInside(b.x,b.y)).length},target:{total:selected(target).length,
      inside:selected(target).filter(b=>isInside(b.x,b.y)).length,outside:selected(target).filter(b=>!isInside(b.x,b.y)).length}};
    // Every submitted tree/entity/building instance must obey the same RegionGeometry.
    const submitted={trees:[],entities:[],buildings:[],hlodMembers:[]};
    for(const stage of [mortal,target]){
      const expectedInside=stage.plane===${JSON.stringify(targetPlane)};
      stage.vegetation?.group.traverse(o=>{if(o.isInstancedMesh&&o.visible&&o.count&&o.userData.renderTrees)
        for(const t of o.userData.renderTrees.slice(0,o.count))if(t)submitted.trees.push({plane:stage.plane,id:t.cell,x:t.x,y:t.y,expectedInside,actual:isInside(t.x,t.y)});});
      stage.entities?.group.traverse(o=>{if(o.isInstancedMesh&&o.visible&&o.count&&o.userData.renderEntities)
        for(const e of o.userData.renderEntities.slice(0,o.count))if(e)submitted.entities.push({plane:stage.plane,id:e.id,x:e.x,y:e.y,expectedInside,actual:isInside(e.x,e.y)});});
      const s=stage.settlements;
      if(s){
        for(const mesh of [s.bodies,s.roofs,s.lod1,s.lod2,s.hlodLegacy,s.hlodCluster]){
          if(!mesh.visible||!mesh.count)continue;
          const data=mesh.userData.renderBuildings;
          if(data)for(const b of data.slice(0,mesh.count))if(b)submitted.buildings.push({plane:stage.plane,id:b.sourceIndex,x:b.x,y:b.y,expectedInside,actual:isInside(b.x,b.y)});
        }
        const liveHlod=s.hlodCluster.visible?(s._hlodPickEntries||[]).slice(0,s.hlodCluster.count):[];
        for(const item of liveHlod)for(const id of [...(item.members||[]),...(item.buildings||[])]){
          const b=s.lastDerived?.buildings?.find(x=>x.sourceIndex===id);
          if(b)submitted.hlodMembers.push({plane:stage.plane,settlementId:item.settlementId,id,x:b.x,y:b.y,expectedInside,actual:isInside(b.x,b.y)});}
      }
    }
    const mismatches=Object.fromEntries(Object.entries(submitted).map(([k,v])=>[k,v.filter(x=>x.expectedInside!==x.actual).length]));
    // Compare every boundary quad endpoint against the exact Float32 terrain vertices
    // from which its top/bottom surfaces were written.
    const bg=r.boundary.geometry.attributes.position,mg=mortal.terrain.geometry.attributes.position,tg=target.terrain.geometry.attributes.position;
    let seamComparisons=0,seamMismatches=0;const seamExamples=[];
    const check=(a,b,label)=>{seamComparisons++;if(!Object.is(a,b)){seamMismatches++;if(seamExamples.length<6)seamExamples.push({label,a,b});}};
    let edge=0;for(const e of g.boundaryEdges()){
      for(const [endpoint,x,y,vi] of [[0,e.ax,e.ay,0],[1,e.bx,e.by,2]]){
        const grid=y*target.world.w+x,bi=(edge*4+vi)*3,ti=grid*3;
        check(bg.getX(edge*4+vi),tg.getX(grid),"target-x-"+x+"-"+y);check(bg.getZ(edge*4+vi),tg.getZ(grid),"target-z-"+x+"-"+y);
        check(bg.getY(edge*4+vi),tg.getY(grid),"target-y-"+x+"-"+y);
        const bottom=vi===0?1:3;check(bg.getX(edge*4+bottom),mg.getX(grid),"mortal-x-"+x+"-"+y);
        check(bg.getZ(edge*4+bottom),mg.getZ(grid),"mortal-z-"+x+"-"+y);check(bg.getY(edge*4+bottom),mg.getY(grid),"mortal-y-"+x+"-"+y);
      }edge++;
    }
    const {visibleRift}=await import('./src/inkbox/render3d/readers/riftViewModel.js');
    const {edgeIntersectsRift}=await import('./src/inkbox/render3d/boundary/RealmBoundaryLayer.js');
    const rifts=k.world.rifts.filter(x=>x.targetPlane===${JSON.stringify(targetPlane)}).map(x=>({id:x.id,x:x.x,y:x.y,age:x.age||0,strength:x.strength,radius:visibleRift(x)?.radius??0}));
    const intersections=[];for(let edge=0;edge<r.boundary.edges;edge++){
      const ax=r.boundary.edgeNodes[edge*4],ay=r.boundary.edgeNodes[edge*4+1],bx=r.boundary.edgeNodes[edge*4+2],by=r.boundary.edgeNodes[edge*4+3];
      for(const rift of rifts)if(rift.age>0&&rift.radius>0&&edgeIntersectsRift(ax,ay,bx,by,rift.x,rift.y,rift.radius))
        intersections.push({edge,riftId:rift.id,rift,poi:{x:(ax+bx)/2,y:(ay+by)/2},edge:{ax,ay,bx,by}});
    }
    const breach={...r.boundary.stats,visible:r.boundary.mesh.visible,riftIds:rifts.map(x=>x.id),
      positiveRadiusRifts:rifts.filter(x=>x.age>0&&x.radius>0),intersections};
    if(breach.breachEdges<=0||!breach.intersections.length)throw new Error('no grown real Rift intersects an actual current boundary edge');
    if(seamMismatches)throw new Error('boundary and terrain Float32 seam mismatch');
    if(Object.values(mismatches).some(Boolean))throw new Error('submitted instance crossed Region ownership');
    if(entityOwnership.mortal.outside===0||entityOwnership.target.inside===0)throw new Error('realm entity ownership did not yield both sides');
    const settlements=mortal.settlements,clusters=settlements?._hlodPickEntries||[];
    const clusterMemberIds=clusters.flatMap(x=>x.buildings||[]);
    return {targetPlane:${JSON.stringify(targetPlane)},region:{x0:g.region.x0,y0:g.region.y0,x1:g.region.x1,y1:g.region.y1},
      entityOwnership,treeOwnership,bldgOwnership,submittedCounts:Object.fromEntries(Object.entries(submitted).map(([k,v])=>[k,v.length])),
      submittedMismatches:mismatches,hlod:{clusters:clusters.length,visibleClusters:settlements?.hlodCluster?.visible?Math.min(clusters.length,settlements.hlodCluster.count):0,
        memberReferences:clusterMemberIds.length,
        membersChecked:submitted.hlodMembers.filter(x=>x.plane==='mortal').length,
        memberMismatches:submitted.hlodMembers.filter(x=>x.expectedInside!==x.actual).length},
      boundary:breach,seam:{comparisons:seamComparisons,mismatches:seamMismatches,examples:seamExamples}};
  `);
}

async function pickDepthDiagnostic(targetPlane) {
  return page(`
    const r=window.inkbox.render3d.renderer,T=await import('three'),ray=new T.Raycaster(),counts={mortal:0,upper:0,nether:0,boundary:0,miss:0};
    let comparisons=0,mismatches=0,entityIdentityChecks=0,identityMismatches=0,settlementHits=0;const examples=[];
    const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
    for(let iy=1;iy<15;iy++)for(let ix=1;ix<21;ix++){
      const x=r.width*ix/22,y=r.height*iy/16;
      ray.setFromCamera(new T.Vector2(x/r.width*2-1,1-y/r.height*2),r.cameraRig.camera);
      const objects=[];
      for(const stage of r.stages.values()){
        if(!stage.visible||!stage.terrain.mesh.visible)continue;
        objects.push({object:stage.terrain.mesh,plane:stage.plane});
        stage.entities?.group.traverse(o=>{
          if(o.isInstancedMesh&&visible(o)&&o.count&&o.userData.renderEntities)objects.push({object:o,plane:stage.plane});});
        stage.settlements?.group.traverse(o=>{
          if(o.isInstancedMesh&&visible(o)&&o.count&&o.userData.renderSettlements?.length)objects.push({object:o,plane:stage.plane});});
      }
      if(r.boundary.mesh.visible&&r.boundary.edges)objects.push({object:r.boundary.mesh,plane:null});
      const candidates=[];
      for(const entry of objects){const hit=ray.intersectObject(entry.object,false)[0];if(hit)candidates.push({entry,hit});}
      candidates.sort((a,b)=>a.hit.distance-b.hit.distance);
      const expected=candidates[0],actual=r.pick(x,y);
      if(expected){comparisons++;const want=expected.entry.plane===null?'boundary':expected.entry.plane;
        const got=actual?.kind==='realm-boundary'?'boundary':actual?.plane||'miss';
        counts[got]=(counts[got]||0)+1;
        if(want!==got){mismatches++;if(examples.length<10)examples.push({x,y,want,got,distance:expected.hit.distance,actual:actual?.kind||actual?.plane||null});}
        if(expected.hit.instanceId!=null&&expected.entry.object.userData.renderEntities){
          entityIdentityChecks++;const record=expected.entry.object.userData.renderEntities[expected.hit.instanceId];
          const stage=r.stages.get(expected.entry.plane),sources=[...(stage?.world?.entities||[]),...(stage?.world?.wraiths||[])];
          const source=sources.find(e=>e.id===record?.id);
          if(actual?.entityId!==record?.id||!source)identityMismatches++;
        }else if(expected.hit.instanceId!=null&&expected.entry.object.userData.renderSettlements?.length){
          entityIdentityChecks++;const record=expected.entry.object.userData.renderSettlements[expected.hit.instanceId];
          const stage=r.stages.get(expected.entry.plane),source=stage?.world?.villages?.some(v=>v.id===record?.settlementId);
          if(actual?.settlementId!==record?.settlementId||!source)identityMismatches++;
          if(actual?.kind==='settlement'&&actual.settlementId!=null)settlementHits++;
        }
      }else counts.miss++;
    }
    return {targetPlane:${JSON.stringify(targetPlane)},counts,depthComparisons:comparisons,depthMismatches:mismatches,entityIdentityChecks,identityMismatches,settlementHits,examples};
  `);
}

async function capture(view,targetPlane,profile) {
  const configured=await configure(view,targetPlane,profile);
  const sample=await sampleProductLoop(`${view.name}/${targetPlane}/${profile}`);
  assert.equal(sample.glError,0,`${view.name}/${targetPlane}/${profile}: GL error`);
  assert.deepEqual(sample.visiblePlanes.sort(),['mortal',targetPlane].sort(),'cross realm visibility mismatch');
  const file=`${view.name}-${targetPlane}-${profile}.png`;
  await browser.screenshot(path.join(output,file));
  return {profile,file,poi:view.poi,camera:configured.pose,recipe:configured.recipe,warmFrames:configured.warmFrames,fxSettling:configured.fxSettling,
    renderer:{...sample,programs:configured.programs,fogIsNull:configured.fogIsNull,boundary:sample.boundary,
      targetStyle:configured.targetStyle,targetTerrainStyle:configured.targetTerrainStyle,
      entityStats:configured.targetEntities,vegetationStats:configured.targetVegetation,settlementStats:configured.targetSettlements}};
}

try {
  fs.mkdirSync(output,{recursive:true});
  const edge=findEdge();assert(edge,'Microsoft Edge is required');
  browser=await launch({url:url.toString(),browser:edge,width:1500,height:940,gpu:true,timeoutMs:30000});
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.stages?.size',{timeoutMs:60000}),
    `Render3D failed to boot: ${browser.errors().join(' | ')}`);
  const scenario=await prepareScenario();evidence.scenarioRecipe=scenario;
  await page(`const k=window.inkbox,r=k.render3d.renderer;for(let i=0;i<180&&r.world!==k.world;i++)await new Promise(requestAnimationFrame);
    if(r.world!==k.world)throw new Error('product RAF failed to adopt natural NETHER_STYLE_A');await r.characterLoadPromise;
    if(r.characterLoadError)throw r.characterLoadError;r.setLODEnabled(true);r.setArtProfile('legacy');r.setActivePlane('mortal');
    for(let i=0;i<6;i++)await new Promise(requestAnimationFrame);return true;`);
  const setupUpper=await openAndGrow('upper');
  const setupNether=await openAndGrow('nether');
  evidence.prePureDigest=await page(`return window.__crossProof.snapshotDigest(window.inkbox);`);
  evidence.setupDigest=evidence.prePureDigest;
  evidence.naturalCoverage=await page(`const k=window.inkbox;return {worldDay:k.world.day,mortalEntities:k.world.entities.length,
    netherEntities:k.world.nether.entities.length,upperEntities:k.world.upper.entities.length,
    upperRifts:k.world.rifts.filter(r=>r.targetPlane==='upper').length,netherRifts:k.world.rifts.filter(r=>r.targetPlane==='nether').length};`);
  const targets=[{plane:'upper',setup:setupUpper},{plane:'nether',setup:setupNether}];
  for(const {plane,setup} of targets){
    const realm=await enterPureWindow(plane,setup.region);evidence.diagnostics[plane]={realmSwitch:realm};
    const initialOwnership=await ownershipAndSeam(plane);
    evidence.diagnostics[plane].ownership=initialOwnership;
    const breach=initialOwnership.boundary.intersections[0],rift=breach.rift;
    const region=setup.region;
    const cases=[
      {name:`cross-${plane}-overview`,kind:'mortal-target',poi:{x:(region.x0+region.x1)/2,y:(region.y0+region.y1)/2,source:'committed Region centre'},yaw:.2,polar:.58,zoom:1.45},
      {name:`cross-${plane}-breach-near`,kind:'real-breach-near',poi:{...breach.poi,source:'midpoint of current boundary edge intersecting a natural grown Rift',riftId:rift.id,age:rift.age,radius:rift.radius},yaw:.35,polar:.62,zoom:5},
      {name:`cross-${plane}-breach-far`,kind:'real-breach-far',poi:{...breach.poi,source:'same real breached boundary edge',riftId:rift.id,age:rift.age,radius:rift.radius},yaw:.35,polar:.62,zoom:.65},
      {name:`cross-${plane}-breach-oblique`,kind:'real-breach-oblique',poi:{...breach.poi,source:'same real breached boundary edge; oblique depth/ownership diagnostic',riftId:rift.id,age:rift.age,radius:rift.radius},yaw:1.13,polar:.88,zoom:3.4}
    ];
    for(const view of cases){
      const paired=[];
      for(const profile of profiles)paired.push(await capture(view,plane,profile));
      assert.deepEqual(paired[0].camera,paired[1].camera,`${view.name}: paired camera pose drift`);
      assert.equal(paired[0].renderer.triangles,paired[1].renderer.triangles,`${view.name}: paired geometry drift`);
      assert.equal(paired[0].renderer.drawCalls,paired[1].renderer.drawCalls,`${view.name}: paired draw count drift`);
      assert.deepEqual(paired[0].renderer.lodStats,paired[1].renderer.lodStats,`${view.name}: paired LOD drift`);
      const ownership=await ownershipAndSeam(plane);
      if(view.name.endsWith('breach-far')){
        assert(ownership.hlod.visibleClusters>0&&ownership.hlod.membersChecked>0,'far view failed to show real HLOD with verified member identity');
        evidence.diagnostics[plane].farOwnership=ownership;
        const pick=await pickDepthDiagnostic(plane);
        assert.equal(pick.depthMismatches,0,'far Host.pick disagreed with nearest submitted surface');
        assert.equal(pick.identityMismatches,0,'far Host.pick returned the wrong real identity');
        assert(pick.settlementHits>0,'far Host.pick did not resolve a real HLOD to its settlement id');
        evidence.diagnostics[plane].farPickDepth=pick;
      }
      if(view.kind==='real-breach-near'){
        const pick=await pickDepthDiagnostic(plane);
        assert.equal(pick.depthMismatches,0,'Host.pick disagreed with nearest submitted surface');
        assert.equal(pick.identityMismatches,0,'Host.pick returned the wrong real entity/settlement identity');
        assert(pick.counts.mortal>0&&pick.counts[plane]>0,'Host.pick did not hit both sides of the window');
        evidence.diagnostics[plane].pickDepth=pick;
      }
      evidence.cases.push({name:view.name,kind:view.kind,targetPlane:plane,poi:view.poi,legacy:paired[0],v1:paired[1],sameCameraPose:true,
        ownership,
        sameTriangles:true,sameDrawCalls:true,sameLOD:true});
    }
  }
  evidence.finalDigest=await page(`return window.__crossProof.snapshotDigest(window.inkbox);`);
  evidence.worldUnchangedThroughoutPurePhase=evidence.finalDigest.value===evidence.prePureDigest.value;
  assert(evidence.worldUnchangedThroughoutPurePhase,'camera/profile/Host-only realm switches mutated World or advanceState');
  evidence.windowSetupChangesWorld=evidence.setup[0].digestBefore!==evidence.setupDigest.value;
  evidence.consoleErrors=browser.cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params?.type==='error')
    .map(e=>e.params.args?.map(a=>a.value||a.description||'').join(' '));
  evidence.runtimeErrors=browser.errors();
  assert.deepEqual([...evidence.consoleErrors,...evidence.runtimeErrors],[],'browser console/runtime errors');
  assert(evidence.cases.length===8,'expected four paired camera cases for each target realm');
  evidence.pass=true;
}catch(error){
  evidence.failure=error.stack||String(error);process.exitCode=1;console.error(error.stack||error);
  evidence.runtimeErrors=browser?.errors()||[];
}finally{
  evidence.finishedAt=new Date().toISOString();fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));
  await browser?.close();
}
if(evidence.pass)console.log(`B4 cross proof PASS: ${evidence.cases.length} paired Mortal+realm views; ${path.relative(root,path.join(output,'evidence.json'))}`);



