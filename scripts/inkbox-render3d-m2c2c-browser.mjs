// C2C: paired presentation-on/off evidence for naturally generated realm geography.
// Browser execution is intentionally opt-in; this file is only authored/checked until Package 9.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launch, findEdge, sleep } from './cdp.mjs';
import { sampleBody } from './inkbox-product-frame-timing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || 'reports/local/m2c2c/browser');
const NATURAL_SAVE = path.resolve(process.env.INKBOX_C2C_NATURAL_SAVE || 'reports/local/m2c2c/pilot/full-sites-natural-save.json');
const NATURAL_GEOGRAPHY = path.resolve(process.env.INKBOX_C2C_NATURAL_META || 'reports/local/m2c2c/pilot/full-natural-geography.json');
const port = Number(process.env.INKBOX_PORT || 4240);
const base = process.env.INKBOX_URL || `http://127.0.0.1:${port}`;
const report = { suite: 'M2-C2C natural geography paired browser matrix', pass: false,
  startedAt: new Date().toISOString(), cases: [], recipes: [], method: 'same natural World and camera, geography disabled/enabled; 23 prescribed views' };
const specs = [
  ['mortal','overview','overview',1.45], ['mortal','site','secret',18], ['mortal','site','cave',18],
  ['mortal','site','formation',18], ['mortal','site','ruin',18], ['mortal','leyline','leyline',6], ['mortal','mixed','site-village',8],
  ['upper','overview','overview',1.45], ['upper','field','high',9], ['upper','field','low',9],
  ['upper','entity','entity',18], ['upper','cross','cross-window',1.45],
  ['nether','overview','overview',1.45], ['nether','field','high',9], ['nether','field','low',9],
  ['nether','ghost','cluster',18], ['nether','trace','old-decay-trace',18], ['nether','cross','cross-window',1.45],
  ['upper','rift','rift',18], ['nether','rift','rift',18], ['upper','fx','cross-rift-fx',10],
  ['nether','fx','cross-rift-fx',8], ['nether','rift','breach-near',10],
].map(([plane,domain,kind,zoom], index) => ({ index: index + 1, plane, domain, kind, zoom }));
let browser, server;
const page = (body, timeoutMs = 180000) => browser.js(`return (async()=>{${body}})();`, { timeoutMs });
function sourceDigest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
async function installRecipe(key) {
  let cacheEvidence=null;
  if(key==='mortal'&&fs.existsSync(NATURAL_SAVE)){
    const saveText=fs.readFileSync(NATURAL_SAVE,'utf8'),save=JSON.parse(saveText);
    assert.equal(save.seed,226,'natural saved World seed mismatch');assert.equal(save.day,72000,'natural saved World day mismatch');
    assert.deepEqual([...new Set(save.sites.map(site=>site.kind))].sort(),['cave','formation','ruin','secret'],'cached current World lacks simultaneous four-kind Site coverage');
    const meta=fs.existsSync(NATURAL_GEOGRAPHY)?JSON.parse(fs.readFileSync(NATURAL_GEOGRAPHY,'utf8')):null;
    cacheEvidence={source:'serialized natural World loaded by product importFile UI; no World field edits',path:path.relative(ROOT,NATURAL_SAVE).replaceAll(path.sep,'/'),
      saveSHA256:createHash('sha256').update(saveText).digest('hex'),worldSHA256:meta?.records?.at(-1)?.WorldSHA||null,
      advanceSHA256:meta?.records?.at(-1)?.advanceSHA||null,recipe:meta?.recipe||null,day:save.day,seed:save.seed,
      currentSites:save.sites.map(site=>({id:site.id,kind:site.kind,x:site.x,y:site.y}))};
    const {root}=await browser.cdp.send('DOM.getDocument');
    const {nodeId}=await browser.cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#inkImportFile'});
    assert(nodeId,'product import file input unavailable');
    await browser.cdp.send('DOM.setFileInputFiles',{nodeId,files:[NATURAL_SAVE]});
    assert(await browser.waitFor(`return window.inkbox?.world?.seed===226&&window.inkbox?.world?.day===72000`,{timeoutMs:30000}),
      'natural 200-year saved World did not load through product importFile');
    report.naturalCache=cacheEvidence;
  }
  const result = await page(`
    const f=await import('./scripts/inkbox-c2c-browser-fixtures.mjs');
    const recipe=f.C2C_RECIPES.find(x=>x.key===${JSON.stringify(key)});if(!recipe)throw Error('recipe missing '+${JSON.stringify(key)});
    const k=window.inkbox,r=k.render3d.renderer;
    let sb,info;
    if(${JSON.stringify(!!cacheEvidence)}){
      if(k.world.seed!==226||k.world.day!==72000)throw Error('cached natural World identity changed after product import');
      sb={world:k.world};info={actualDays:k.world.day,worldDay:k.world.day,fullSiteCoverageDay:k.world.day,
        fullCoverageSiteIds:Object.fromEntries(['secret','cave','formation','ruin'].map(kind=>[kind,k.world.sites.filter(site=>site.kind===kind).map(site=>site.id)])),
        visualRecipeSource:'product importFile of the headless ordinary-simulation serialized World'};
    }else{sb=f.createScenarioSandbox();info=await f.applyC2CRecipe(sb,recipe);}
    const summary=f.scenarioSummary(sb,{...recipe,visualRecipe:info});
    k.world=sb.world;
    if(sb.life)k.life=sb.life;if(sb.upperLife)k.upperLife=sb.upperLife;
    if(sb.advanceState)k.advanceState=sb.advanceState;if(sb.rng)k.rng=sb.rng;
    k.setSpeed(0);
    r.setWorld(sb.world);r.setProductionAssetsEnabled(true);await r.environmentLoadPromise;
    if(r.environmentLoadError)throw r.environmentLoadError;
    r.setGeographyEnabled(true);r.setGeographyFeature('sites',true);r.setActivePlane('mortal');
    k.selection=null;r.setRealmViewState(k.getRealmViewState());
    for(let i=0;i<30;i++)await new Promise(requestAnimationFrame);
    const layer=r.stages.get('mortal')?.markers?.siteGeography,rendered=layer?.renderedIds||new Set();
    const targets=Object.fromEntries(['secret','cave','formation','ruin'].map(kind=>{
      const candidates=(layer?.derived?.sites?.[kind]||[]).filter(site=>rendered.has(site.id));
      const chosen=candidates.slice().sort((a,b)=>a.id-b.id)[0]||null;
      return [kind,chosen?{id:chosen.id,kind:chosen.kind,x:chosen.x,y:chosen.y,acceptance:'submitted production record in SiteGeographyLayer.renderedIds after asset/full-footprint checks'}:null];
    }));
    const missing=Object.keys(targets).filter(kind=>!targets[kind]);
    window.__c2cFixture=f;window.__c2cTargetSummary=summary.targets;
    window.__c2cTrace=info.decayDeltaEvidence?.trace||null;
    return {summary,recipeInfo:info,siteProduction:{targets,missing,renderedIds:[...rendered],stats:layer?.stats||null,
      assets:layer?.batch?.assetIds||[]}};`, 600000);
  report.recipes.push({ key, day: result.summary.day, seed: result.summary.seed, coverage: result.summary.targets.coverage,
    firstSiteDays: result.recipeInfo.firstSiteDays || null, fullSiteCoverageDay: result.recipeInfo.fullSiteCoverageDay || null,
    fullCoverageSiteIds: result.recipeInfo.fullCoverageSiteIds || null,
    siteProduction: result.siteProduction || null, decayDeltaEvidence: result.recipeInfo.decayDeltaEvidence || null,
    source:cacheEvidence||'deterministic fixed-seed ordinary headless simulation fixture'});
  if(key==='mortal'&&result.siteProduction?.missing?.length)
    throw Error(`four-kind natural Site production coverage failed for ${result.siteProduction.missing.join(', ')}; production stats=${JSON.stringify(result.siteProduction.stats)} assets=${JSON.stringify(result.siteProduction.assets)}`);
  if(key==='mortal')await page(`window.__c2cRenderableSites=${JSON.stringify(result.siteProduction.targets)};return true;`);
  return result;
}
async function prepareNaturalRiftFx() {
  const result=await page(`
    const k=window.inkbox,r=k.render3d.renderer,opened={},selections={};k.setSpeed(0);
    const points=[[Math.floor(k.world.w*.25),Math.floor(k.world.h*.25)],[Math.floor(k.world.w*.75),Math.floor(k.world.h*.25)],
      [Math.floor(k.world.w*.75),Math.floor(k.world.h*.75)],[Math.floor(k.world.w*.25),Math.floor(k.world.h*.75)]];
    for(const plane of ['upper','nether']){
      const before=k.world.riftLog.opened,tool=plane==='upper'?'viewUpper':'viewNether';
      k.selectTool(tool);k.commitSelection(points);r.setRealmViewState(k.getRealmViewState());
      if(!k.selection||k.getRealmViewState().targetPlane!==plane)throw Error('normal UI selection failed to open '+plane+' view');
      selections[plane]=k.selection;
      const count=k.world.riftLog.opened-before;if(count<1)throw Error('normal UI openRifts producer created no '+plane+' rift');
      opened[plane]={newRifts:count,ids:k.world.rifts.filter(x=>x.targetPlane===plane&&x.closedDay<0).map(x=>x.id)};
      for(let i=0;i<2;i++)await new Promise(requestAnimationFrame);
    }
    window.__c2cSelections=selections;window.__c2cFrozenFx={};window.__c2cFxProof={};
    const frozen=(x)=>!!x&&Object.isFrozen(x)&&Object.isFrozen(x.items)&&x.items.every(item=>Object.isFrozen(item)&&Object.isFrozen(item.data));
    const digest=async x=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))].map(v=>v.toString(16).padStart(2,'0')).join('');
    let cycles=0;
    for(;cycles<300;cycles++){
      for(const plane of ['upper','nether'])if(!window.__c2cFrozenFx[plane]){
        k.selectTool(plane==='upper'?'viewUpper':'viewNether');k.selection=selections[plane];r.setRealmViewState(k.getRealmViewState());
        k.advanceDays(30);await new Promise(requestAnimationFrame);
        const snap=k.stage.snapshotPlane(plane),items=snap.items.filter(item=>item.kind==='riftcross');
        if(items.length){
          if(!frozen(snap))throw Error('PresentationStage snapshotPlane is not deeply frozen for '+plane);
          window.__c2cFrozenFx[plane]=snap;
          window.__c2cFxProof[plane]={kind:'captured actual rift-cross from ordinary simulation after normal UI openRifts',
            worldDay:k.world.day,cycles:cycles+1,riftIds:k.world.rifts.map(x=>x.id),payloadItems:items.map(x=>({kind:x.kind,plane:x.plane,x:x.x,y:x.y,age:x.age,ttl:x.ttl,data:x.data})),
            immutableSHA256:await digest(snap),frozen:true};
        }
      }
      if(window.__c2cFrozenFx.upper&&window.__c2cFrozenFx.nether)break;
    }
    const riftState={opened,cycles:cycles+1,worldDay:k.world.day,riftLog:{...k.world.riftLog},
      activeRifts:k.world.rifts.filter(x=>x.closedDay<0).map(x=>({id:x.id,targetPlane:x.targetPlane,age:x.age,x:x.x,y:x.y}))};
    k.setSpeed(0);return {riftState,fxProof:window.__c2cFxProof,hasFrozen:{upper:!!window.__c2cFrozenFx.upper,nether:!!window.__c2cFrozenFx.nether}};`,600000);
  report.riftFixture=result;
  if(!result.hasFrozen.upper||!result.hasFrozen.nether)
    throw Error(`real UI Rift / ordinary-cross FX fixture incomplete; captured=${JSON.stringify(result.hasFrozen)} day=${result.riftState.worldDay} riftLog=${JSON.stringify(result.riftState.riftLog)}`);
  return result;
}
async function capture(spec, geography) {
  return page(`
    const k=window.inkbox,r=k.render3d.renderer,plane=${JSON.stringify(spec.plane)},kind=${JSON.stringify(spec.kind)};
    const active=plane,w=r.stages.get(active)?.world;if(!w)throw Error('missing stage '+active);
    if(['cross','fx','rift'].includes(${JSON.stringify(spec.domain)})&&['upper','nether'].includes(active)){
      const tool=active==='upper'?'viewUpper':'viewNether',saved=k.__c2cSelections?.[active];if(!saved)throw Error('real player selection missing for '+active);
      if(k.toolId!==tool)k.selectTool(tool);k.selection=saved;r.setRealmViewState(k.getRealmViewState());
    }
    const markerDomain=['site','leyline'].includes(${JSON.stringify(spec.domain)});
    r.setGeographyEnabled(markerDomain?true:${geography});r.setGeographyFeature('riftFx',${geography});
    if(markerDomain){r.setGeographyFeature('sites',true);r.setGeographyFeature('leylines',true);}
    r.setActivePlane(active);
    let poi={x:(w.w-1)/2,y:(w.h-1)/2,source:'natural-world-center'};
    if(kind==='secret'||kind==='cave'||kind==='formation'||kind==='ruin'){
      const row=window.__c2cRenderableSites?.[kind];if(!row)throw Error('no production-accepted full-footprint Site target for '+kind);
      poi={x:row.x,y:row.y,id:row.id,kind:row.kind,source:row.acceptance};
    } else if(kind==='leyline'){
      const row=(w.leylines||[]).slice().sort((a,b)=>(b.strength||0)-(a.strength||0))[0];if(!row)throw Error('natural leyline absent');
      poi={x:row.x,y:row.y,id:row.id,source:'world.leylines'};
    } else if(kind==='high'||kind==='low'){
      const fieldName=active==='upper'?'upperQi':'netherYin',matched=window.__c2cTargetSummary?.fields?.[fieldName]?.matchedHeight;
      const row=matched?.[kind];if(!row)throw Error('same-height-band natural field target absent '+fieldName+'/'+kind);
      poi={x:row.x,y:row.y,index:row.index,value:row.value,terrainHeight:row.terrainHeight,
        heightBand:matched.terrainHeightRange,field:row.field,source:row.method||matched.method};
    } else if(kind==='entity'){
      const high=window.__c2cTargetSummary?.fields?.upperQi?.matchedHeight?.high,rows=w.entities||[];
      if(!high||!rows.length)throw Error('no actual upper entity/high-Qi association');
      const row=rows.filter(x=>Number.isFinite(x.x)&&Number.isFinite(x.y)).sort((a,b)=>Math.hypot(a.x-high.x,a.y-high.y)-Math.hypot(b.x-high.x,b.y-high.y))[0];
      if(!row)throw Error('natural Upper entity absent');
      poi={x:row.x,y:row.y,id:row.id,highQi:{x:high.x,y:high.y,value:high.value},distanceToHighQi:Math.hypot(row.x-high.x,row.y-high.y),source:'nearest real Upper entity to same-height-band high qi target'};
    } else if(kind==='cluster'){
      const row=window.__c2cTargetSummary?.ghostCluster;if(!row)throw Error('no actual density-selected Nether ghost cluster');
      poi={...row,associatedHighVegGhostDensity:window.__c2cTargetSummary.highVegGhostDensity,source:'actual local ghost-density maximum'};
    } else if(kind==='old-decay-trace'){
      const trace=window.__c2cTrace;if(!trace?.x)throw Error('no natural positive nether.veg trace captured');poi={...trace,source:'observed-natural-nether-veg-delta'};
    } else if(kind.includes('rift')){
      const row=(k.world.rifts||[]).find(x=>x.closedDay===-1&&(!x.targetPlane||x.targetPlane===active));
      if(!row)throw Error('no naturally active rift for '+kind);poi={x:row.x,y:row.y,id:row.id,source:'world.rifts'};
    } else if(kind==='site-village'){
      const sites=w.sites||[],villages=w.villages||[];let best=null;
      for(const a of sites)for(const b of villages){const d=Math.hypot(a.x-b.x,a.y-b.y);if(!best||d<best.distance)best={a,b,d};}
      if(!best)throw Error('no natural site/village pair');poi={x:(best.a.x+best.b.x)/2,y:(best.a.y+best.b.y)/2,siteId:best.a.id,villageId:best.b.id,distance:best.d,source:'nearest-natural-site-village'};
    }
    if(kind==='cross-window'||kind==='breach-near'){
      if(!r.realmPrototype.open||r.realmPrototype.targetPlane!==active)throw Error('reused real player window is not open for '+active);
      if(kind==='breach-near'&&!(r.boundary.stats.breachEdges>0))throw Error('no natural rift intersects the existing player window boundary');
    }
    const v=window.__c2cVisuals;v.applyCamera(r,'WORLD_OVERVIEW',{poi,zoom:${spec.zoom},polar:.55,yaw:.15});
    for(let i=0;i<24;i++)await new Promise(requestAnimationFrame);
    let markerProof=null;
    if(markerDomain){
      const T=await import('three'),targetId=poi.id,field=${JSON.stringify(spec.domain==='site'?'renderSites':'renderLeylines')};
      const locate=()=>{
        r.scene.updateMatrixWorld(true);r.cameraRig.camera.updateMatrixWorld(true);
        const stage=r.stages.get('mortal'),objects=[];stage.markers.group.traverse(o=>{if(o.isInstancedMesh&&o.visible&&o.count&&o.userData[field])objects.push(o);});
        let match=null;
        for(const mesh of objects){const rows=mesh.userData[field];for(let index=0;index<mesh.count;index++)if(rows[index]?.id===targetId){match={mesh,index,row:rows[index]};break;}if(match)break;}
        if(!match)return null;const {mesh,index}=match;mesh.geometry.computeBoundingBox();
        const box=mesh.geometry.boundingBox,matrix=new T.Matrix4(),worldMatrix=new T.Matrix4();mesh.getMatrixAt(index,matrix);worldMatrix.multiplyMatrices(mesh.matrixWorld,matrix);
        const corners=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])
          corners.push(new T.Vector3(x,y,z).applyMatrix4(worldMatrix).project(r.cameraRig.camera));
        const xs=corners.map(p=>(p.x+1)*r.width/2),ys=corners.map(p=>(1-p.y)*r.height/2);
        const bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
        const px=Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY),rect=r.canvas.getBoundingClientRect();
        let frontmost=null,clickPoint=null;
        for(const fy of [.2,.35,.5,.65,.8])for(const fx of [.2,.35,.5,.65,.8]){
          const x=bounds.minX+(bounds.maxX-bounds.minX)*fx,y=bounds.minY+(bounds.maxY-bounds.minY)*fy;
          const hit=r.pick(x,y);if(hit?.kind===${JSON.stringify(spec.domain==='site'?'site':'leyline')}&&hit.${spec.domain==='site'?'siteId':'leylineId'}===targetId){frontmost=hit;
            clickPoint={x:rect.left+x/r.width*rect.width,y:rect.top+y/r.height*rect.height};break;}
        }
        return {id:targetId,kind:${JSON.stringify(spec.domain==='site'?'site':'leyline')},projectedPixels:px,bounds,frontmost,clickPoint,
          mesh:mesh.name,instanceId:index,submittedRecord:match.row};
      };
      for(let attempt=0;attempt<5;attempt++){
        markerProof=locate();if(!markerProof)throw Error('target instance absent from actual GPU submission: '+kind);
        if(markerProof.projectedPixels>=80&&markerProof.projectedPixels<=100&&markerProof.frontmost)break;
        const camera=r.cameraRig.camera,next=Math.max(.5,Math.min(18,camera.zoom*90/Math.max(1,markerProof.projectedPixels)));
        if(next===camera.zoom)break;camera.zoom=next;camera.updateProjectionMatrix();
        for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);
      }
      markerProof=locate();if(!markerProof?.frontmost||!markerProof.clickPoint)throw Error('submitted marker has no frontmost identity ray hit: '+kind);
      if(markerProof.projectedPixels<80||markerProof.projectedPixels>100)throw Error(kind+' normal composition is outside 80-100 projected pixel target: '+markerProof.projectedPixels);
    }
    if(markerDomain&&!${geography}){r.setGeographyEnabled(false);for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);}
    let frozenFx=null;
    if(${JSON.stringify(spec.domain)}==='fx'){
      frozenFx=window.__c2cFrozenFx?.[active];if(!frozenFx)throw Error('no captured deeply-frozen actual '+active+' rift-cross snapshot');
      if(!window.__c2cFxRestore){const original=k.stage.snapshotPlane;
        k.stage.snapshotPlane=function(name){return window.__c2cFxReplayPlane===name?window.__c2cFxReplaySnapshot:original.call(this,name);};
        window.__c2cFxRestore=()=>{k.stage.snapshotPlane=original;window.__c2cFxRestore=null;window.__c2cFxReplaySnapshot=null;window.__c2cFxReplayPlane=null;};}
      window.__c2cFxReplayPlane=active;window.__c2cFxReplaySnapshot=frozenFx;
    }
    const stats=r.getGeographyStats(),stage=stats.stages[active],digest=await v.snapshotDigest(k);
    const picker=r.pick(r.width/2,r.height/2),subject=picker?k.inspectPlaneSubject?.(picker.plane,{x:picker.x,y:picker.y}):null;
    if(${geography}&&['secret','cave','formation','ruin'].includes(kind)){
      const rendered=r.stages.get('mortal')?.markers?.siteGeography?.renderedIds;
      if(!rendered?.has(poi.id))throw Error('natural '+kind+' failed production footprint/render target acceptance');
    }
    return {poi,camera:{position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom},markerProof,
      stats,picker,subject,digest:digest.value,fxProof:frozenFx?window.__c2cFxProof?.[active]||null:null,
      worldDigest:JSON.stringify([k.world.day,k.world.sites?.length,k.world.rifts?.length])};`);
}
try {
  fs.mkdirSync(OUT,{recursive:true});
  if(!process.env.INKBOX_URL){server=spawn(process.execPath,['scripts/inkbox-server.mjs','--port',String(port)],{cwd:ROOT,windowsHide:true,stdio:'ignore'});
    let ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(`owned server exited ${server.exitCode}`);try{ready=(await fetch(`${base}/inkbox.html`)).ok;}catch{}if(ready)break;await sleep(200);}assert(ready,'Inkbox server did not become ready');}
  const edge=findEdge();assert(edge,'Microsoft Edge unavailable');browser=await launch({url:'about:blank',browser:edge,width:1500,height:940,gpu:true});
  await browser.cdp.send('Page.navigate',{url:`${base}/inkbox.html?renderer=3d&assets=on&boundary=strata&geography=on`});
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.getGeographyStats',{timeoutMs:60000}));
  await page(`window.inkbox.setSpeed(0);return true;`);
  await page(`window.__c2cVisuals=await import('./src/inkbox/render3d/art/VisualScenarios.js');return true;`);
  let activeRecipe='';
  for(const spec of specs){
    const recipeKey=spec.plane==='mortal'||spec.domain==='site'||spec.domain==='leyline'||spec.domain==='mixed'?'mortal':'realms';
    if(activeRecipe!==recipeKey){await installRecipe(recipeKey);activeRecipe=recipeKey;
      if(recipeKey==='realms'&&!report.riftFixture)await prepareNaturalRiftFx();}
    const off=await capture(spec,false);
    const offMeasured=await browser.js(`return (async()=>{${sampleBody(`${spec.index}/${spec.kind}/off`)}})();`,{timeoutMs:180000});
    const stem=`${String(spec.index).padStart(2,'0')}-${spec.plane}-${spec.kind}`;
    const offImage=path.join(OUT,`${stem}-off.png`);await browser.screenshot(offImage);
    const on=await capture(spec,true);
    const onMeasured=await browser.js(`return (async()=>{${sampleBody(`${spec.index}/${spec.kind}/on`)}})();`,{timeoutMs:180000});
    const onImage=path.join(OUT,`${stem}-on.png`);await browser.screenshot(onImage);
    let uiClick=null;
    if(['site','leyline'].includes(spec.domain)){
      assert(on.markerProof?.frontmost&&on.markerProof.clickPoint,'frontmost marker ray proof missing');
      await browser.click(on.markerProof.clickPoint.x,on.markerProof.clickPoint.y);
      uiClick=await page(`const p=document.getElementById('inkInspect');return {plane:p?.dataset.plane||null,kind:p?.dataset.subjectKind||null,id:p?.dataset.subjectId||null};`);
      assert.equal(uiClick.id,String(on.poi.id),'CDP click did not open inspector for actual marker identity');
      assert.equal(uiClick.kind,spec.domain,'CDP click inspector kind mismatch');
    }
    assert.deepEqual(on.camera,off.camera,`${spec.index} camera changed across pair`);
    assert.equal(on.digest,off.digest,`${spec.index} presentation mutated World digest`);
    assert.equal(on.worldDigest,off.worldDigest,`${spec.index} simulation identity changed`);
    report.cases.push({spec,off,on,uiClick,measurements:{off:offMeasured,on:onMeasured},images:{off:path.relative(ROOT,offImage).replaceAll(path.sep,'/'),on:path.relative(ROOT,onImage).replaceAll(path.sep,'/')},
      imageSha256:{off:createHash('sha256').update(fs.readFileSync(offImage)).digest('hex'),on:createHash('sha256').update(fs.readFileSync(onImage)).digest('hex')}});
    if(spec.domain==='fx')await page(`window.__c2cFxRestore?.();return true;`);
    fs.writeFileSync(path.join(OUT,'browser-progress.json'),JSON.stringify(report));
  }
  assert.equal(report.cases.length,23);report.pass=true;
}catch(error){report.failure=error.stack||String(error);console.error(report.failure);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();if(browser){report.browser=browser.meta;report.runtimeErrors=browser.errors();await browser.close();}
  server?.kill();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'browser.json'),JSON.stringify(report,null,2)+'\n');}
