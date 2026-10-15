// C2C: paired presentation-on/off evidence for naturally generated realm geography.
// Full acceptance always requires all 23 cases. Subsets are diagnostic evidence only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launch, findEdge, sleep } from './cdp.mjs';
import { sampleBody } from './inkbox-product-frame-timing.mjs';
import { ensureCanonicalMortalCache, ensureCanonicalRealmsCache } from './inkbox-c2c-browser-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || 'reports/local/m2c2c/browser');
const NATURAL_SAVE = path.resolve(process.env.INKBOX_C2C_NATURAL_SAVE || 'reports/local/m2c2c/pilot/full-sites-natural-save.json');
const NATURAL_GEOGRAPHY = path.resolve(process.env.INKBOX_C2C_NATURAL_META || 'reports/local/m2c2c/pilot/full-natural-geography.json');
const REALMS_SAVE = path.resolve(process.env.INKBOX_C2C_REALMS_SAVE || 'reports/local/m2c2c/pilot/natural-realms-save.json');
const REALMS_META = path.resolve(process.env.INKBOX_C2C_REALMS_META || 'reports/local/m2c2c/pilot/natural-realms-meta.json');
const REALMS_HISTORY = path.resolve(process.env.INKBOX_C2C_REALMS_HISTORY || 'reports/local/m2c2c/pilot/natural-realms-history.json');
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
const diagnosticCases=process.env.INKBOX_C2C_DIAGNOSTIC_CASES?.split(',').map(Number)||null;
if(diagnosticCases){
  assert(diagnosticCases.length&&diagnosticCases.every(index=>Number.isInteger(index)&&index>=1&&index<=23),'invalid diagnostic case indices');
  report.diagnosticOnly=true;report.diagnosticCaseIndices=diagnosticCases;
}
if(process.env.INKBOX_C2C_RIFT_PRESENTATION){
  assert(process.env.INKBOX_C2C_RIFT_PRESENTATION==='standalone'&&diagnosticCases,
    'standalone Rift curation is diagnostic-only and cannot replace the full matrix');
  report.diagnosticPresentation='standalone persistent Mortal Rift, player window closed';
}
let browser, server;
const page = (body, timeoutMs = 180000) => browser.js(`return (async()=>{${body}})();`, { timeoutMs });
function sourceDigest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
async function installRecipe(key) {
  let cacheEvidence=null,cacheInfo=null,cacheHistory=null;
  if(key==='mortal'){
    assert(fs.existsSync(NATURAL_SAVE)&&fs.existsSync(NATURAL_GEOGRAPHY),'canonical natural Mortal preflight did not supply save and metadata');
    const saveText=fs.readFileSync(NATURAL_SAVE,'utf8'),save=JSON.parse(saveText);
    assert.equal(save.seed,226,'natural saved World seed mismatch');assert.equal(save.day,72000,'natural saved World day mismatch');
    assert.deepEqual([...new Set(save.sites.map(site=>site.kind))].sort(),['cave','formation','ruin','secret'],'cached current World lacks simultaneous four-kind Site coverage');
    const meta=JSON.parse(fs.readFileSync(NATURAL_GEOGRAPHY,'utf8'));
    assert.equal(createHash('sha256').update(saveText).digest('hex'),meta.saveSHA256,'natural Mortal save changed after preflight');
    cacheInfo=meta.recipeInfo;
    const productionRecord=meta?.records?.at(-1)||null;
    cacheEvidence={source:'serialized natural World loaded by product importFile UI; no World field edits',path:path.relative(ROOT,NATURAL_SAVE).replaceAll(path.sep,'/'),
      saveSHA256:meta.saveSHA256,worldSHA256:meta.sourceWorldSHA256,
      advanceSHA256:meta.advanceSHA256,recipeStart:meta.recipe,recipeInfo:meta.recipeInfo,day:save.day,seed:save.seed,
      sourceFiles:meta.sourceFiles,sourceHashMethod:meta.sourceHashMethod,engine:meta.engine,serializationLimit:meta.serializationLimit,
      continuation:{fromDay:0,toDay:save.day,ordinaryStepDays:meta.recipe.stepDays},
      productionRecord:productionRecord?{day:productionRecord.day,renderedKinds:productionRecord.renderedKinds,
        renderedSiteCandidates:productionRecord.sites?.filter(site=>site.rendered).map(({id,kind,x,y})=>({id,kind,x,y}))||[]}:null,
      currentSites:save.sites.map(site=>({id:site.id,kind:site.kind,x:site.x,y:site.y}))};
    const {root}=await browser.cdp.send('DOM.getDocument');
    const {nodeId}=await browser.cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#inkImportFile'});
    assert(nodeId,'product import file input unavailable');
    await browser.cdp.send('DOM.setFileInputFiles',{nodeId,files:[NATURAL_SAVE]});
    assert(await browser.waitFor(`return window.inkbox?.world?.seed===226&&window.inkbox?.world?.day===72000`,{timeoutMs:30000}),
      'natural 200-year saved World did not load through product importFile');
    report.naturalCache=cacheEvidence;
  }
  if(key==='realms'&&fs.existsSync(REALMS_SAVE)){
    const saveText=fs.readFileSync(REALMS_SAVE,'utf8'),save=JSON.parse(saveText),meta=JSON.parse(fs.readFileSync(REALMS_META,'utf8')),
      historyText=fs.readFileSync(REALMS_HISTORY,'utf8'),history=JSON.parse(historyText);
    const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
    assert.equal(save.seed,20260923);assert.equal(save.day,21600);assert.equal(hash(saveText),meta.saveSHA256);assert.equal(hash(historyText),meta.historySHA256);
    assert.equal(history.plane,'nether');assert.equal(history.key,'veg');assert.equal(history.toDay-history.fromDay,900);assert(history.trace?.delta>=.03);
    assert.equal(history.beforeBytes.length,history.width*history.height);assert.equal(history.afterBytes.length,history.beforeBytes.length);
    assert.equal(hash(Uint8Array.from(history.beforeBytes)),meta.beforeR8SHA256);assert.equal(hash(Uint8Array.from(history.afterBytes)),meta.afterR8SHA256);
    assert(history.afterBytes[history.trace.index]>history.beforeBytes[history.trace.index]);
    cacheInfo=meta.recipeInfo;cacheHistory=history;
    cacheEvidence={source:meta.source+'; serialized same-source current World loaded through product importFile UI',seed:save.seed,day:save.day,
      path:path.relative(ROOT,REALMS_SAVE).replaceAll(path.sep,'/'),saveSHA256:meta.saveSHA256,sourceWorldSHA256:meta.sourceWorldSHA256,advanceSHA256:meta.advanceSHA256,
      historySHA256:meta.historySHA256,beforeR8SHA256:meta.beforeR8SHA256,afterR8SHA256:meta.afterR8SHA256,sourceFiles:meta.sourceFiles,recipe:meta.recipe,
      serializationLimit:meta.serializationLimit,history:{fromDay:history.fromDay,toDay:history.toDay,trace:history.trace,encoding:history.encoding}};
    const {root}=await browser.cdp.send('DOM.getDocument'),{nodeId}=await browser.cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#inkImportFile'});
    assert(nodeId,'product import file input unavailable');await browser.cdp.send('DOM.setFileInputFiles',{nodeId,files:[REALMS_SAVE]});
    assert(await browser.waitFor('return window.inkbox?.world?.seed===20260923&&window.inkbox?.world?.day===21600',{timeoutMs:30000}),'canonical natural Realms save did not load through product importFile');
    report.realmsNaturalCache=cacheEvidence;
  }
  const result = await page(`
    const f=await import('./scripts/inkbox-c2c-browser-fixtures.mjs');
    const recipe=f.C2C_RECIPES.find(x=>x.key===${JSON.stringify(key)});if(!recipe)throw Error('recipe missing '+${JSON.stringify(key)});
    const k=window.inkbox,r=k.render3d.renderer;
    let sb,info;
    if(${JSON.stringify(!!cacheEvidence)}){
      if(k.world.seed!==${cacheEvidence?.seed??226}||k.world.day!==${cacheEvidence?.day??72000})throw Error('cached natural World identity changed after product import');
      sb={world:k.world};info=${JSON.stringify(cacheInfo)}||{actualDays:k.world.day,worldDay:k.world.day,fullSiteCoverageDay:k.world.day,
        fullCoverageSiteIds:Object.fromEntries(['secret','cave','formation','ruin'].map(kind=>[kind,k.world.sites.filter(site=>site.kind===kind).map(site=>site.id)])),
        visualRecipeSource:'product importFile of the headless ordinary-simulation serialized World'};
      const history=${JSON.stringify(cacheHistory)};
      if(history)sb.decayDeltaFieldHistory={...history,beforeBytes:Uint8Array.from(history.beforeBytes),afterBytes:Uint8Array.from(history.afterBytes)};
    }else{sb=f.createScenarioSandbox();info=await f.applyC2CRecipe(sb,recipe);}
    const summary=f.scenarioSummary(sb,{...recipe,visualRecipe:info});
    window.__c2cDecayFieldHistory=sb.decayDeltaFieldHistory||null;
    window.__c2cTrace=info.decayDeltaEvidence?.trace||null;
    k.world=sb.world;
    if(sb.life)k.life=sb.life;if(sb.upperLife)k.upperLife=sb.upperLife;
    if(sb.advanceState)k.advanceState=sb.advanceState;if(sb.rng)k.rng=sb.rng;
    k.setSpeed(0);
    r.setWorld(sb.world);r.setProductionAssetsEnabled(true);await r.environmentLoadPromise;
    if(r.environmentLoadError)throw r.environmentLoadError;
    await r.characterLoadPromise;if(r.characterLoadError)throw r.characterLoadError;
    r.setGeographyEnabled(true);r.setGeographyFeature('sites',true);r.setActivePlane('mortal');
    r.setGeographyFeature('leylines',true);
    k.selection=null;r.setRealmViewState(k.getRealmViewState());
    for(let i=0;i<30;i++)await new Promise(requestAnimationFrame);
    const layer=r.stages.get('mortal')?.markers?.siteGeography,rendered=layer?.renderedIds||new Set();
    const leylineLayer=r.stages.get('mortal')?.markers?.leylineGeography,renderedLeylines=leylineLayer?.renderedIds||new Set();
    const targets=Object.fromEntries(['secret','cave','formation','ruin'].map(kind=>{
      const candidates=(layer?.derived?.sites?.[kind]||[]).filter(site=>rendered.has(site.id));
      const chosen=candidates.slice().sort((a,b)=>a.id-b.id)[0]||null;
      return [kind,chosen?{id:chosen.id,kind:chosen.kind,x:chosen.x,y:chosen.y,acceptance:'submitted production record in SiteGeographyLayer.renderedIds after asset/full-footprint checks'}:null];
    }));
    const missing=Object.keys(targets).filter(kind=>!targets[kind]);
    const leylineTarget=(k.world.leylines||[]).filter(line=>renderedLeylines.has(line.id)).sort((a,b)=>(b.strength||0)-(a.strength||0))[0]||null;
    window.__c2cFixture=f;window.__c2cTargetSummary=summary.targets;window.__c2cPairPOIs={};window.__c2cRuinSelection=null;
    return {summary,recipeInfo:info,siteProduction:{targets,missing,renderedIds:[...rendered],stats:layer?.stats||null,
      leylineTarget,renderedLeylineIds:[...renderedLeylines],leylineStats:leylineLayer?.stats||null,assets:layer?.batch?.assetIds||[]}};`, 600000);
  report.recipes.push({ key, day: result.summary.day, seed: result.summary.seed, coverage: result.summary.targets.coverage,
    firstSiteDays: result.recipeInfo.firstSiteDays || null, fullSiteCoverageDay: result.recipeInfo.fullSiteCoverageDay || null,
    fullCoverageSiteIds: result.recipeInfo.fullCoverageSiteIds || null,
    siteProduction: result.siteProduction || null, decayDeltaEvidence: result.recipeInfo.decayDeltaEvidence || null,
    decayDeltaHistory:result.recipeInfo.decayDeltaHistory||null,
    source:cacheEvidence||'deterministic fixed-seed ordinary headless simulation fixture'});
  if(key==='mortal'&&result.siteProduction?.missing?.length)
    throw Error(`four-kind natural Site production coverage failed for ${result.siteProduction.missing.join(', ')}; production stats=${JSON.stringify(result.siteProduction.stats)} assets=${JSON.stringify(result.siteProduction.assets)}`);
  if(key==='mortal'&&!result.siteProduction?.leylineTarget)
    throw Error(`no current natural Leyline was accepted into the production batch; stats=${JSON.stringify(result.siteProduction?.leylineStats)}`);
  if(key==='mortal')await page(`window.__c2cRenderableSites=${JSON.stringify(result.siteProduction.targets)};return true;`);
  if(key==='mortal')await page(`window.__c2cLeylineTarget=${JSON.stringify(result.siteProduction.leylineTarget)};return true;`);
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
    k.__c2cSelections=selections;window.__c2cSelections=selections;window.__c2cFrozenFx={};window.__c2cFxProof={};window.__c2cFxTargets={};
    const frozen=(x)=>!!x&&Object.isFrozen(x)&&Object.isFrozen(x.items)&&x.items.every(item=>Object.isFrozen(item)&&Object.isFrozen(item.data));
    const digest=async x=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))].map(v=>v.toString(16).padStart(2,'0')).join('');
    let cycles=0;
    for(;cycles<300;cycles++){
      for(const plane of ['upper','nether'])if(!window.__c2cFrozenFx[plane]){
        k.selectTool(plane==='upper'?'viewUpper':'viewNether');k.selection=selections[plane];r.setRealmViewState(k.getRealmViewState());
        k.advanceDays(30);await new Promise(requestAnimationFrame);
        const snap=k.stage.snapshotPlane(plane),targetWorld=k.world[plane],items=snap.items.filter(item=>item.kind==='riftcross'
          &&item.x>=8&&item.y>=8&&item.x<=targetWorld.w-9&&item.y<=targetWorld.h-9);
        if(items.length){
          if(!frozen(snap))throw Error('PresentationStage snapshotPlane is not deeply frozen for '+plane);
          window.__c2cFrozenFx[plane]=snap;
          window.__c2cFxTargets[plane]={x:items[0].x,y:items[0].y,kind:items[0].kind,fromKey:items[0].data?.fromKey||null};
          window.__c2cFxProof[plane]={kind:'captured actual rift-cross from ordinary simulation after normal UI openRifts',
            worldDay:k.world.day,cycles:cycles+1,riftIds:k.world.rifts.map(x=>x.id),payloadItems:items.map(x=>({kind:x.kind,plane:x.plane,x:x.x,y:x.y,age:x.age,ttl:x.ttl,data:x.data})),
            immutableSHA256:await digest(snap),frozen:true};
        }
      }
      if(window.__c2cFrozenFx.upper&&window.__c2cFrozenFx.nether)break;
    }
    const {decorationFootprintOwned}=await import('./src/inkbox/render3d/environment/RealmDecorationLayer.js'),fxWindows={};
    window.__c2cFxSelections={};
    for(const plane of ['upper','nether']){
      const target=window.__c2cFxTargets[plane];if(!target)continue;
      const x0=Math.floor(target.x-10),x1=Math.ceil(target.x+10),y0=Math.floor(target.y-10),y1=Math.ceil(target.y+10),before=k.world.riftLog.opened;
      k.selectTool(plane==='upper'?'viewUpper':'viewNether');k.commitSelection([[x0,y0],[x1,y0],[x1,y1],[x0,y1]]);
      r.setRealmViewState(k.getRealmViewState());for(let i=0;i<2;i++)await new Promise(requestAnimationFrame);
      const stage=r.stages.get(plane);
      if(!k.selection||k.selection.capped||!r.realmPrototype.open||r.realmPrototype.targetPlane!==plane
        ||!decorationFootprintOwned(stage.world,stage.regionGeometry,true,{x:target.x,y:target.y,width:14,depth:14,rotationY:0}))
        throw Error('normal FX player window does not own the full actual event footprint '+plane);
      window.__c2cFxSelections[plane]=k.selection;
      fxWindows[plane]={source:'normal selectTool/commitSelection around the actual frozen event; existing full-footprint Region contract',
        target,selection:{x0:k.selection.x0,y0:k.selection.y0,x1:k.selection.x1,y1:k.selection.y1,area:k.selection.area,capped:k.selection.capped},
        openedRifts:k.world.riftLog.opened-before};
    }
    const riftState={opened,cycles:cycles+1,worldDay:k.world.day,riftLog:{...k.world.riftLog},
      activeRifts:k.world.rifts.filter(x=>x.closedDay<0).map(x=>({id:x.id,targetPlane:x.targetPlane,age:x.age,x:x.x,y:x.y}))};
    k.setSpeed(0);return {riftState,fxWindows,fxProof:window.__c2cFxProof,hasFrozen:{upper:!!window.__c2cFrozenFx.upper,nether:!!window.__c2cFrozenFx.nether}};`,600000);
  report.riftFixture=result;
  if(!result.hasFrozen.upper||!result.hasFrozen.nether)
    throw Error(`real UI Rift / ordinary-cross FX fixture incomplete; captured=${JSON.stringify(result.hasFrozen)} day=${result.riftState.worldDay} riftLog=${JSON.stringify(result.riftState.riftLog)}`);
  return result;
}
async function capture(spec, geography) {
  return page(`
    document.getElementById('inkInspectClose')?.click();
    const k=window.inkbox,r=k.render3d.renderer,plane=${JSON.stringify(spec.plane)},kind=${JSON.stringify(spec.kind)},domain=${JSON.stringify(spec.domain)};
    const active=plane,crossDomain=['cross','fx','rift'].includes(domain),viewPlane=crossDomain?'mortal':active;
    const w=r.stages.get(viewPlane)?.world,targetWorld=r.stages.get(active)?.world;if(!w||!targetWorld)throw Error('missing stage '+viewPlane+'/'+active);
    const standaloneRift=${process.env.INKBOX_C2C_RIFT_PRESENTATION==='standalone'}&&domain==='rift';
    if(standaloneRift){k.selectTool('inspect');k.selection=null;r.setRealmViewState(k.getRealmViewState());}
    if(!standaloneRift&&['cross','fx','rift'].includes(${JSON.stringify(spec.domain)})&&['upper','nether'].includes(active)){
      const tool=active==='upper'?'viewUpper':'viewNether',saved=domain==='fx'?window.__c2cFxSelections?.[active]:(k.__c2cSelections?.[active]||window.__c2cSelections?.[active]);if(!saved)throw Error('real player selection missing for '+active);
      if(k.toolId!==tool)k.selectTool(tool);k.selection=saved;r.setRealmViewState(k.getRealmViewState());
    }
    const markerDomain=['site','leyline'].includes(${JSON.stringify(spec.domain)}),pairPois=window.__c2cPairPOIs||(window.__c2cPairPOIs={});
    const cachedPoi=pairPois[${spec.index}]||null,needsSubmittedTarget=kind==='site-village'||kind.includes('rift')||kind==='breach-near';
    r.setGeographyEnabled(markerDomain?true:(${geography}||(!cachedPoi&&needsSubmittedTarget)));
    r.setGeographyFeature('riftFx',${geography});
    if(markerDomain){r.setGeographyFeature('sites',true);r.setGeographyFeature('leylines',true);}
    r.setActivePlane(viewPlane);
    let poi=cachedPoi?{...cachedPoi}:{x:(w.w-1)/2,y:(w.h-1)/2,source:'natural-world-center'};
    if(!cachedPoi&&(kind==='secret'||kind==='cave'||kind==='formation'||kind==='ruin')){
      const row=window.__c2cRenderableSites?.[kind];if(!row)throw Error('no production-accepted full-footprint Site target for '+kind);
      poi={x:row.x,y:row.y,id:row.id,kind:row.kind,source:row.acceptance};
    } else if(!cachedPoi&&kind==='leyline'){
      const row=window.__c2cLeylineTarget;if(!row)throw Error('no production-rendered natural leyline target');
      poi={x:row.x,y:row.y,id:row.id,source:'rendered production identity from world.leylines'};
    } else if(!cachedPoi&&(kind==='high'||kind==='low')){
      const fieldName=active==='upper'?'upperQi':'netherYin',matched=window.__c2cTargetSummary?.fields?.[fieldName]?.matchedHeight;
      const row=matched?.[kind];if(!row)throw Error('same-height-band natural field target absent '+fieldName+'/'+kind);
      poi={x:row.x,y:row.y,index:row.index,value:row.value,terrainHeight:row.terrainHeight,
        heightBand:matched.terrainHeightRange,field:row.field,source:row.method||matched.method};
    } else if(!cachedPoi&&kind==='entity'){
      const high=window.__c2cTargetSummary?.fields?.upperQi?.matchedHeight?.high,rows=w.entities||[];
      if(!high||!rows.length)throw Error('no actual upper entity/high-Qi association');
      const row=rows.filter(x=>Number.isFinite(x.x)&&Number.isFinite(x.y)).sort((a,b)=>Math.hypot(a.x-high.x,a.y-high.y)-Math.hypot(b.x-high.x,b.y-high.y))[0];
      if(!row)throw Error('natural Upper entity absent');
      poi={x:row.x,y:row.y,id:row.id,highQi:{x:high.x,y:high.y,value:high.value},distanceToHighQi:Math.hypot(row.x-high.x,row.y-high.y),source:'nearest real Upper entity to same-height-band high qi target'};
    } else if(!cachedPoi&&kind==='cluster'){
      const row=window.__c2cTargetSummary?.ghostCluster;if(!row)throw Error('no actual density-selected Nether ghost cluster');
      poi={...row,associatedHighVegGhostDensity:window.__c2cTargetSummary.highVegGhostDensity,source:'actual local ghost-density maximum'};
    } else if(!cachedPoi&&kind==='old-decay-trace'){
      const trace=window.__c2cTrace;if(!trace||!Number.isFinite(trace.x)||!Number.isFinite(trace.y))throw Error('no natural positive nether.veg trace captured');poi={...trace,source:'observed-natural-nether-veg-delta'};
    } else if(!cachedPoi&&domain==='fx'){
      const row=window.__c2cFxTargets?.[active];if(!row)throw Error('actual captured FX target absent '+active);
      poi={...row,source:'actual rift-cross snapshot coordinates, visible in its normally committed player window'};
    } else if(!cachedPoi&&(kind.includes('rift')||kind==='breach-near')){
      const mortal=r.stages.get('mortal'),rendered=mortal?.markers?.riftWounds?.renderedIds||new Set();
      const row=(k.world.rifts||[]).find(x=>x.closedDay===-1&&(!x.targetPlane||x.targetPlane===active)&&rendered.has(x.id));
      if(!row)throw Error('no active naturally opened Rift was submitted by the mortal RiftWoundLayer for '+active);
      poi={x:row.x,y:row.y,id:row.id,targetPlane:row.targetPlane,source:'active world.rifts id accepted by mortal RiftWoundLayer.renderedIds'};
    } else if(!cachedPoi&&kind==='site-village'){
      const mortal=r.stages.get('mortal'),rendered=mortal?.markers?.siteGeography?.renderedIds||new Set();
      const sites=(mortal?.world?.sites||[]).filter(site=>rendered.has(site.id)),villages=mortal?.world?.villages||[];let best=null;
      for(const a of sites)for(const b of villages){const d=Math.hypot(a.x-b.x,a.y-b.y);if(!best||d<best.d)best={a,b,d};}
      if(!best)throw Error('no production-rendered natural Site/village pair');poi={x:(best.a.x+best.b.x)/2,y:(best.a.y+best.b.y)/2,
        siteId:best.a.id,siteX:best.a.x,siteY:best.a.y,villageId:best.b.id,villageX:best.b.x,villageY:best.b.y,distance:best.d,source:'nearest-production-rendered natural Site/village'};
    }
    if(cachedPoi?.x!==undefined&&cachedPoi?.y!==undefined&&poi.source!==cachedPoi.source)throw Error('paired POI source changed for case '+${spec.index});
    if(!cachedPoi)pairPois[${spec.index}]={...poi};
    if(!markerDomain)r.setGeographyEnabled(${geography});
    if(['secret','cave','formation','ruin'].includes(kind)){
      const current=k.world.sites?.find(item=>item.id===poi.id);if(!current||current.x!==poi.x||current.y!==poi.y)throw Error('paired Site POI is not the current World identity: '+kind);
    } else if(kind==='leyline'){
      const current=k.world.leylines?.find(item=>item.id===poi.id);if(!current||current.x!==poi.x||current.y!==poi.y)throw Error('paired Leyline POI is not the current World identity');
    } else if(kind==='site-village'){
      if(!k.world.sites?.some(item=>item.id===poi.siteId&&item.x===poi.siteX&&item.y===poi.siteY))throw Error('paired village/site POI Site identity changed');
      if(!k.world.villages?.some(item=>item.id===poi.villageId&&item.x===poi.villageX&&item.y===poi.villageY))throw Error('paired village/site POI Village identity changed');
    } else if(domain!=='fx'&&(kind.includes('rift')||kind==='breach-near')&&poi.id!=null){
      const current=k.world.rifts?.find(item=>item.id===poi.id&&item.closedDay===-1&&item.x===poi.x&&item.y===poi.y&&(!item.targetPlane||item.targetPlane===active));
      if(!current)throw Error('paired Rift POI is not the current active World identity for '+active);
    }
    if(kind==='cross-window'||kind==='breach-near'){
      if(!r.realmPrototype.open||r.realmPrototype.targetPlane!==active)throw Error('reused real player window is not open for '+active);
      if(kind==='breach-near'&&!(r.boundary.stats.breachEdges>0))throw Error('no natural rift intersects the existing player window boundary');
    }
    const v=window.__c2cVisuals;v.applyCamera(r,'WORLD_OVERVIEW',{poi,zoom:${spec.zoom},polar:.55,yaw:.15});
    for(let i=0;i<24;i++)await new Promise(requestAnimationFrame);
    let markerProof=null;
    if(markerDomain){
      const T=await import('three'),field=${JSON.stringify(spec.domain==='site'?'renderSites':'renderLeylines')};let targetId=poi.id;
      const locate=()=>{
        r.scene.updateMatrixWorld(true);r.cameraRig.camera.updateMatrixWorld(true);
        const stage=r.stages.get('mortal'),objects=[];stage.markers.group.traverse(o=>{if(o.isInstancedMesh&&o.visible&&o.count&&o.userData[field])objects.push(o);});
        const matches=[];for(const mesh of objects){const rows=mesh.userData[field];mesh.geometry.computeBoundingBox();
          for(let index=0;index<mesh.count;index++)if(rows[index]?.id===targetId)matches.push({mesh,index,row:rows[index]});}
        if(!matches.length)return null;
        const rect=r.canvas.getBoundingClientRect(),camera=r.cameraRig.camera,corners=[];
        for(const {mesh,index} of matches){const box=mesh.geometry.boundingBox,matrix=new T.Matrix4(),worldMatrix=new T.Matrix4();mesh.getMatrixAt(index,matrix);worldMatrix.multiplyMatrices(mesh.matrixWorld,matrix);
          for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new T.Vector3(x,y,z).applyMatrix4(worldMatrix).project(camera));}
        const xs=corners.map(p=>(p.x+1)*r.width/2),ys=corners.map(p=>(1-p.y)*r.height/2);
        const bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
        const px=Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY);let frontmost=null,clickPoint=null,triangleTests=0,frontmostTriangles=0,occluders={};
        const expectedKind=${JSON.stringify(spec.domain==='site'?'site':'leyline')},expectedIdField=${JSON.stringify(spec.domain==='site'?'siteId':'leylineId')};
        for(const {mesh,index,row} of matches){
          const geometry=mesh.geometry,position=geometry.attributes.position,indices=geometry.index,triangleCount=(indices?.count||position.count)/3;
          const instanceMatrix=new T.Matrix4(),worldMatrix=new T.Matrix4();mesh.getMatrixAt(index,instanceMatrix);worldMatrix.multiplyMatrices(mesh.matrixWorld,instanceMatrix);
          const vertex=(vertexIndex)=>new T.Vector3(position.getX(vertexIndex),position.getY(vertexIndex),position.getZ(vertexIndex)).applyMatrix4(worldMatrix);
          for(let triangle=0;triangle<triangleCount;triangle++){
            const offset=triangle*3,a=indices?indices.getX(offset):offset,b=indices?indices.getX(offset+1):offset+1,c=indices?indices.getX(offset+2):offset+2;
            const p=vertex(a).add(vertex(b)).add(vertex(c)).multiplyScalar(1/3).project(camera);
            if(p.z < -1||p.z>1||p.x < -1||p.x>1||p.y < -1||p.y>1)continue;
            triangleTests++;const x=(p.x+1)*r.width/2,y=(1-p.y)*r.height/2,hit=r.pick(x,y),actual=hit?.[expectedIdField]===targetId&&hit.kind===expectedKind;
            if(actual){frontmostTriangles++;if(!frontmost){frontmost={kind:hit.kind,plane:hit.plane,siteId:hit.siteId,leylineId:hit.leylineId,distance:hit.distance,
              point:hit.point?{x:hit.point.x,y:hit.point.y,z:hit.point.z}:null,world:hit.world?{x:hit.world.x,y:hit.world.y}:null,triangle,instanceId:index,mesh:mesh.name};
              clickPoint={x:rect.left+x/r.width*rect.width,y:rect.top+y/r.height*rect.height};}}
            else {const occluder=hit?String(hit.plane||'boundary')+':'+String(hit.kind||'unknown'):'miss';occluders[occluder]=(occluders[occluder]||0)+1;}
          }
        }
        const record=matches[0].row,submittedRecord=Object.fromEntries(['id','kind','x','y','age','visits','strength','radius'].filter(key=>record[key]!==undefined).map(key=>[key,record[key]]));
        return {id:targetId,kind:expectedKind,projectedPixels:px,bounds,frontmost,clickPoint,triangleTests,frontmostTriangles,occluders,submittedInstances:matches.map(({mesh,index,row})=>({mesh:mesh.name,instanceId:index,
            source:{id:row.id,kind:row.kind,x:row.x,y:row.y}})),
          rayProof:frontmost?{method:'submitted instance triangle-centroid rays through PlanePicker actual THREE.Raycaster geometry with front-to-back stage/terrain depth ordering',distance:frontmost.distance,
            point:frontmost.point,stage:frontmost.plane,triangle:frontmost.triangle,instanceId:frontmost.instanceId,opaqueOcclusionChecked:true}:null,submittedRecord};
      };
      const fitMarker=async()=>{
        let proof=null;
        for(let attempt=0;attempt<5;attempt++){
          proof=locate();if(!proof)return null;
          if(proof.projectedPixels>=80&&proof.projectedPixels<=100)break;
          const camera=r.cameraRig.camera,next=Math.max(.5,Math.min(18,camera.zoom*90/Math.max(1,proof.projectedPixels)));
          if(next===camera.zoom)break;camera.zoom=next;camera.updateProjectionMatrix();
          for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);
        }
        return locate();
      };
      let targetSelection=kind==='ruin'?window.__c2cRuinSelection:null;
      if(kind==='ruin'&&!cachedPoi){
        const layer=r.stages.get('mortal').markers.siteGeography,accepted=new Set(layer.renderedIds);
        const candidates=(layer.derived.sites.ruin||[]).filter(site=>accepted.has(site.id));let best=null;const probes=[];
        for(const candidate of candidates){
          poi={id:candidate.id,kind:'ruin',x:candidate.x,y:candidate.y,source:'current production Ruin selected by actual frontmost triangles in a normal 80-100px composition'};targetId=poi.id;
          v.applyCamera(r,'WORLD_OVERVIEW',{poi,zoom:${spec.zoom},polar:.55,yaw:.15});for(let i=0;i<24;i++)await new Promise(requestAnimationFrame);
          const proof=await fitMarker();probes.push({id:candidate.id,projectedPixels:proof?.projectedPixels??null,
            triangles:proof?.triangleTests??0,frontmost:proof?.frontmostTriangles??0});
          if(proof?.frontmost&&proof.projectedPixels>=80&&proof.projectedPixels<=100
            &&(!best||proof.frontmostTriangles>best.frontmost))best={poi:{...poi},frontmost:proof.frontmostTriangles};
        }
        if(!best)throw Error('no natural production Ruin has a frontmost triangle in the required normal composition: '+JSON.stringify(probes));
        poi=best.poi;targetId=poi.id;pairPois[${spec.index}]={...poi};window.__c2cRenderableSites.ruin={...poi};
        targetSelection={method:'finite read-only search of current submitted Ruins; same normal camera and 80-100 projected pixel policy; no World/terrain edits',probes};
        window.__c2cRuinSelection=targetSelection;
        v.applyCamera(r,'WORLD_OVERVIEW',{poi,zoom:${spec.zoom},polar:.55,yaw:.15});for(let i=0;i<24;i++)await new Promise(requestAnimationFrame);
      }
      markerProof=await fitMarker();if(markerProof&&targetSelection)markerProof.targetSelection=targetSelection;
      if(!markerProof?.frontmost||!markerProof.clickPoint)throw Error('submitted marker has no frontmost identity triangle-centroid ray hit: '+kind+' proof='+JSON.stringify(markerProof));
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
    const stats=r.getGeographyStats(),stage=stats.stages[viewPlane],targetStage=stats.stages[active],digest=await v.snapshotDigest(k);
    const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const worldSHA256=await sha(k.world),advanceStateSHA256=await sha(k.advanceState);
    const programs=r.gpu.info.programs.map(program=>({name:program.name||null,
      linked:program.program? r.gpu.getContext().getProgramParameter(program.program,r.gpu.getContext().LINK_STATUS):null}));
    if(!programs.length||programs.some(program=>program.linked!==true)){
      const gl=r.gpu.getContext(),failures=programs.filter(program=>program.linked!==true).map(program=>{
        const info=r.gpu.info.programs.find(item=>(item.name||null)===program.name),handle=info?.program;
        const attached=handle?gl.getAttachedShaders(handle)||[]:[];
        return {name:program.name,programLog:handle?gl.getProgramInfoLog(handle):null,shaders:attached.map(shader=>({type:gl.getShaderParameter(shader,gl.SHADER_TYPE),compiled:gl.getShaderParameter(shader,gl.COMPILE_STATUS),log:gl.getShaderInfoLog(shader),source:gl.getShaderSource(shader)?.slice(0,2400)}))};});
      throw Error('shader program is unlinked or not inspectable; WebGL compile diagnostics='+JSON.stringify(failures));
    }
    const picker=r.pick(r.width/2,r.height/2);
    const pickerProof=picker?{x:picker.x,y:picker.y,plane:picker.plane,kind:picker.kind,siteId:picker.siteId,leylineId:picker.leylineId,
      riftId:picker.riftId,entityId:picker.entityId,distance:picker.distance,point:picker.point?{x:picker.point.x,y:picker.point.y,z:picker.point.z}:null,
      world:picker.world?{x:picker.world.x,y:picker.world.y}:null}:null;
    const subjectCollection=picker?.siteId!=null?'sites':picker?.leylineId!=null?'leylines':picker?.riftId!=null?'rifts':picker?.entityId!=null?'entities':null;
    const subjectId=picker?.siteId??picker?.leylineId??picker?.riftId??picker?.entityId;
    const subjectRecord=subjectCollection?(k.world?.[subjectCollection]||[]).find(item=>item.id===subjectId):null;
    if(${geography}&&['secret','cave','formation','ruin'].includes(kind)){
      const rendered=r.stages.get('mortal')?.markers?.siteGeography?.renderedIds;
      if(!rendered?.has(poi.id))throw Error('natural '+kind+' failed production footprint/render target acceptance');
    }
    if(${geography}&&kind==='site-village'&&!r.stages.get('mortal')?.markers?.siteGeography?.renderedIds?.has(poi.siteId))
      throw Error('paired village composition Site is absent from current production submission');
    if(${geography}&&domain!=='fx'&&(kind.includes('rift')||kind==='breach-near')&&!r.stages.get('mortal')?.markers?.riftWounds?.renderedIds?.has(poi.id))
      throw Error('paired Rift composition is absent from current mortal RiftWoundLayer submission');
    return {poi,camera:{position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom},markerProof,
      stats,viewPlane,targetStage:targetStage||null,gpu:{memory:{...r.gpu.info.memory},programs,drawCalls:r.gpu.info.render.calls,triangles:r.gpu.info.render.triangles},picker:pickerProof,
      subjectSummary:subjectRecord?{id:subjectRecord.id,kind:picker.kind,x:subjectRecord.x,y:subjectRecord.y,currentWorldIdentity:true}:null,
      digest:digest.value,fxProof:frozenFx?window.__c2cFxProof?.[active]||null:null,
      worldSHA256,advanceStateSHA256};`);
}
async function captureNetherHistoryProof(onCapture) {
  const prepared=await page(`
    const k=window.inkbox,r=k.render3d.renderer,h=window.__c2cDecayFieldHistory,trace=window.__c2cTrace;
    if(!h||!trace||h.plane!=='nether'||h.key!=='veg'||h.toDay-h.fromDay!==900||trace.delta<.03)
      throw Error('actual positive 900-day Nether veg history snapshot missing or below threshold');
    const stage=r.stages.get('nether'),field=stage?.scalarField,terrain=stage?.terrain,material=terrain?.inkMaterial;
    if(!field?.enabled||field.world!==k.world.nether||field.key!=='veg'||field.mode!==2||!material||!field.bytes)
      throw Error('current Nether scalar field texture/material is not bound to the current World');
    if(h.width!==k.world.nether.w||h.height!==k.world.nether.h||h.beforeBytes.length!==field.bytes.length||h.afterBytes.length!==field.bytes.length)
      throw Error('historical R8 byte dimensions differ from current Nether field');
    if(h.afterBytes[trace.index]<=h.beforeBytes[trace.index])throw Error('quantized positive trace did not survive as a changed R8 texel');
    const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
    const digest=await window.__c2cVisuals.snapshotDigest(k),uniforms=material.uniforms,originalFxFeature=r.getGeographyStats().features.riftFx;
    r.setGeographyFeature('riftFx',false);
    const makeTexture=bytes=>{const texture=new (window.__c2cThree.DataTexture)(new Uint8Array(bytes),h.width,h.height,
      window.__c2cThree.RedFormat,window.__c2cThree.UnsignedByteType);texture.internalFormat='R8';
      texture.minFilter=texture.magFilter=window.__c2cThree.LinearFilter;texture.generateMipmaps=false;texture.flipY=false;
      texture.unpackAlignment=1;texture.colorSpace=window.__c2cThree.NoColorSpace;texture.needsUpdate=true;return texture;};
    const oldTexture=makeTexture(h.beforeBytes),newTexture=makeTexture(h.afterBytes),originalBind=terrain.bindScalarField;
    window.__c2cHistoryTextures={old:oldTexture,new:newTexture};window.__c2cHistoryActive=null;
    terrain.bindScalarField=function(){originalBind.call(this);const texture=window.__c2cHistoryTextures?.[window.__c2cHistoryActive];
      if(texture){uniforms.fieldTexture.value=texture;uniforms.fieldMode.value=2;}};
    window.__c2cHistoryOriginalFx=originalFxFeature;
    window.__c2cHistoryRestore=()=>{terrain.bindScalarField=originalBind;window.__c2cHistoryActive=null;
      oldTexture.dispose();newTexture.dispose();window.__c2cHistoryTextures=null;terrain.bindScalarField();
      r.setGeographyFeature('riftFx',window.__c2cHistoryOriginalFx);window.__c2cHistoryOriginalFx=null;window.__c2cHistoryRestore=null;};
    window.__c2cHistorySet=async variant=>{if(!['old','new'].includes(variant))throw Error('invalid history texture variant '+variant);
      window.__c2cHistoryActive=variant;terrain.bindScalarField();for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);r.render();
      if(uniforms.fieldTexture.value!==window.__c2cHistoryTextures[variant]||uniforms.fieldMode.value!==2)
        throw Error('historical field texture was not bound to terrain shader');
      const renderPoint=stage.coordinates.worldToRender(trace.x,trace.y,stage.elevation.at(trace.x,trace.y)),projected=new window.__c2cThree.Vector3(renderPoint.x,renderPoint.y,renderPoint.z).project(r.cameraRig.camera);
      const sx=(projected.x+1)*r.width/2,sy=(1-projected.y)*r.height/2,gl=r.gpu.getContext(),terrainPixels=[];
      for(let dy=-20;dy<=20;dy+=2)for(let dx=-20;dx<=20;dx+=2){const x=Math.round(sx+dx),y=Math.round(sy+dy);if(x<0||y<0||x>=r.width||y>=r.height)continue;
        const hit=r.pick(x,y);if(hit?.kind!=='terrain'||hit.plane!=='nether'||!hit.world||Math.hypot(hit.world.x-trace.x,hit.world.y-trace.y)>6)continue;
        const rgba=new Uint8Array(4);gl.readPixels(x,r.height-1-y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
        terrainPixels.push({x,y,cell:{x:hit.world.x,y:hit.world.y},rgba:[...rgba]});}
      if(terrainPixels.length<8)throw Error('insufficient unobscured terrain-only GL pixels near the natural Nether trace: '+terrainPixels.length);
      const current=await window.__c2cVisuals.snapshotDigest(k);
      return {variant,camera:{position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom},
        worldDigest:current.value,day:k.world.day,drawCalls:r.gpu.info.render.calls,triangles:r.gpu.info.render.triangles,
        materialMode:uniforms.fieldMode.value,textureName:window.__c2cHistoryTextures[variant].name,
        visibleTerrainPixels:{source:'WebGL framebuffer RGBA readPixels; terrain-only PlanePicker frontmost within six cells of true trace; excludes DOM/HUD',traceScreen:{x:sx,y:sy},samples:terrainPixels}};};
    return {trace,fromDay:h.fromDay,toDay:h.toDay,source:h.encoding,width:h.width,height:h.height,fieldBytes:h.beforeBytes.byteLength,originalRiftFx:originalFxFeature,
      oldBytesSHA256:await hash(h.beforeBytes),newBytesSHA256:await hash(h.afterBytes),currentFieldBytesSHA256:await hash(field.bytes),
      currentFieldStats:{...field.stats},worldDigest:digest.value,day:k.world.day,
      currentCamera:{position:r.cameraRig.camera.position.toArray(),target:r.cameraRig.controls.target.toArray(),zoom:r.cameraRig.camera.zoom}};`);
  const oldBytesPath=path.join(OUT,'nether-history-old.r8'),newBytesPath=path.join(OUT,'nether-history-new.r8');
  const images={};let oldCapture=null,newCapture=null,restored=null;
  try{
    const rawBytes=await page(`const h=window.__c2cDecayFieldHistory;return {old:[...h.beforeBytes],new:[...h.afterBytes]};`);
    const oldBytes=Buffer.from(rawBytes.old),newBytes=Buffer.from(rawBytes.new);
    assert.equal(createHash('sha256').update(oldBytes).digest('hex'),prepared.oldBytesSHA256,'cached old R8 bytes differ from proof digest');
    assert.equal(createHash('sha256').update(newBytes).digest('hex'),prepared.newBytesSHA256,'cached new R8 bytes differ from proof digest');
    fs.writeFileSync(oldBytesPath,oldBytes);fs.writeFileSync(newBytesPath,newBytes);
    for(const variant of ['old','new']){
      const capture=await page(`return window.__c2cHistorySet(${JSON.stringify(variant)});`);
      if(variant==='old')oldCapture=capture;else newCapture=capture;
      assert.equal(capture.worldDigest,onCapture.digest,`${variant} trace image changed full World/advanceState digest`);
      assert.deepEqual(capture.camera,onCapture.camera,`${variant} trace image camera differs from normal composition`);
      const imagePath=path.join(OUT,`17-nether-old-decay-trace-history-${variant}.png`);await browser.screenshot(imagePath);
      images[variant]={path:path.relative(ROOT,imagePath).replaceAll(path.sep,'/'),sha256:createHash('sha256').update(fs.readFileSync(imagePath)).digest('hex')};
    }
     assert.equal(oldCapture.visibleTerrainPixels.samples.length,newCapture.visibleTerrainPixels.samples.length,'old/new field texture terrain pixel sample count changed');
     assert.deepEqual(oldCapture.visibleTerrainPixels.samples.map(p=>[p.x,p.y,p.cell]),newCapture.visibleTerrainPixels.samples.map(p=>[p.x,p.y,p.cell]),'old/new visible terrain sample locations changed');
     const pixelChanges=oldCapture.visibleTerrainPixels.samples.map((old,index)=>{const next=newCapture.visibleTerrainPixels.samples[index],delta=old.rgba.slice(0,3).reduce((sum,value,channel)=>sum+Math.abs(value-next.rgba[channel]),0);return {x:old.x,y:old.y,delta,old:old.rgba,new:next.rgba};}).filter(item=>item.delta>0);
     const totalChannelDelta=pixelChanges.reduce((sum,item)=>sum+item.delta,0);
     fs.writeFileSync(path.join(OUT,'nether-history-pixel-proof.json'),JSON.stringify({prepared,old:oldCapture,new:newCapture,
       difference:{changedPixels:pixelChanges.length,totalChannelDelta,pixels:pixelChanges}},null,2));
     assert(pixelChanges.length>0&&totalChannelDelta>=3,'historical old/new R8 textures produced no visible terrain-only GL pixel change: '+JSON.stringify({sampleCount:oldCapture.visibleTerrainPixels.samples.length,pixelChanges,totalChannelDelta}));
     oldCapture.visibleTerrainPixelsDifference={changedPixels:pixelChanges.length,totalChannelDelta,pixels:pixelChanges};
     newCapture.visibleTerrainPixelsDifference=oldCapture.visibleTerrainPixelsDifference;
  }finally{
    restored=await page(`const k=window.inkbox,r=k.render3d.renderer,stage=r.stages.get('nether');
      window.__c2cHistoryRestore?.();return {active:window.__c2cHistoryActive||null,riftFx:r.getGeographyStats().features.riftFx,
        fieldTexture:stage.terrain.inkMaterial.uniforms.fieldTexture.value===stage.scalarField.texture,
        fieldMode:stage.terrain.inkMaterial.uniforms.fieldMode.value,
        fieldBytesSHA256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',stage.scalarField.bytes))].map(v=>v.toString(16).padStart(2,'0')).join(''),
        fieldStats:{...stage.scalarField.stats},digest:(await window.__c2cVisuals.snapshotDigest(k)).value,day:k.world.day};`);
  }
  assert.equal(restored.active,null,'temporary history overlay was not restored');
  assert.equal(restored.riftFx,prepared.originalRiftFx,'Rift FX state was not restored after terrain pixel comparison');
  assert.equal(restored.fieldTexture,true,'current scalar texture was not restored after history proof');
  assert.equal(restored.digest,onCapture.digest,'history proof changed full World/advanceState digest');
  assert.equal(restored.fieldBytesSHA256,prepared.currentFieldBytesSHA256,'history proof changed current Nether field bytes');
  for(const key of ['uploads','uploadBytes','changedCells'])assert.equal(restored.fieldStats[key],prepared.currentFieldStats[key],`history proof changed current field ${key}`);
  return {source:'actual ordinary-simulation positive nether.veg delta; temporary R8 uniform overlay only, no World or field writes',
    prepared,old:oldCapture,new:newCapture,visibleTerrainPixelDifference:oldCapture.visibleTerrainPixelsDifference,restored,images,ignoredBytes:{old:path.relative(ROOT,oldBytesPath).replaceAll(path.sep,'/'),new:path.relative(ROOT,newBytesPath).replaceAll(path.sep,'/'),
      sha256:{old:prepared.oldBytesSHA256,new:prepared.newBytesSHA256}}};
}
async function readGpuResources(){
  return page(`const r=window.inkbox.render3d.renderer,g=r.gpu,gl=g.getContext();
    const programs=g.info.programs.map(p=>({name:p.name||null,linked:p.program?gl.getProgramParameter(p.program,gl.LINK_STATUS):null}));
    if(!programs.length||programs.some(p=>p.linked!==true)){const failures=programs.filter(p=>p.linked!==true).map(p=>{const info=g.info.programs.find(x=>(x.name||null)===p.name),handle=info?.program,shaders=handle?gl.getAttachedShaders(handle)||[]:[];
      return {name:p.name,programLog:handle?gl.getProgramInfoLog(handle):null,shaders:shaders.map(shader=>({type:gl.getShaderParameter(shader,gl.SHADER_TYPE),compiled:gl.getShaderParameter(shader,gl.COMPILE_STATUS),log:gl.getShaderInfoLog(shader),source:gl.getShaderSource(shader)?.slice(0,2400)}))};});
      throw Error('post-sample shader program is unlinked; WebGL compile diagnostics='+JSON.stringify(failures));}
    return {memory:{...g.info.memory},programCount:programs.length,programs};`);
}
function browserErrors(){
  if(!browser)return {runtime:[],consoleApi:[]};
  const consoleApi=browser.cdp.events.filter(event=>event.method==='Runtime.consoleAPICalled'&&event.params?.type==='error')
    .map(event=>({type:event.params.type,text:(event.params.args||[]).map(arg=>arg.value??arg.description??'').join(' '),stack:event.params.stackTrace?.callFrames?.slice(0,4)||[]}));
  return {runtime:browser.errors(),consoleApi};
}
try {
  fs.mkdirSync(OUT,{recursive:true});
  fs.rmSync(path.join(OUT,'browser-progress.json'),{force:true});
  report.mortalCachePreflight=await ensureCanonicalMortalCache({savePath:NATURAL_SAVE,metaPath:NATURAL_GEOGRAPHY,
    explicit:!!(process.env.INKBOX_C2C_NATURAL_SAVE||process.env.INKBOX_C2C_NATURAL_META)});
  report.realmsCachePreflight=await ensureCanonicalRealmsCache({savePath:REALMS_SAVE,metaPath:REALMS_META,historyPath:REALMS_HISTORY,
    explicit:!!(process.env.INKBOX_C2C_REALMS_SAVE||process.env.INKBOX_C2C_REALMS_META||process.env.INKBOX_C2C_REALMS_HISTORY)});
  if(!process.env.INKBOX_URL){server=spawn(process.execPath,['scripts/inkbox-server.mjs','--port',String(port)],{cwd:ROOT,windowsHide:true,stdio:'ignore'});
    let ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(`owned server exited ${server.exitCode}`);try{ready=(await fetch(`${base}/inkbox.html`)).ok;}catch{}if(ready)break;await sleep(200);}assert(ready,'Inkbox server did not become ready');}
  const edge=findEdge();assert(edge,'Microsoft Edge unavailable');browser=await launch({url:'about:blank',browser:edge,width:1500,height:940,gpu:true});
  await browser.cdp.send('Page.navigate',{url:`${base}/inkbox.html?renderer=3d&assets=on&boundary=strata&geography=on`});
  assert(await browser.waitFor('return !!window.inkbox?.render3d?.renderer?.getGeographyStats',{timeoutMs:60000}));
  await page(`window.inkbox.setSpeed(0);return true;`);
  await page(`window.__c2cVisuals=await import('./src/inkbox/render3d/art/VisualScenarios.js');window.__c2cThree=await import('three');return true;`);
  let activeRecipe='';
  for(const spec of specs){
    if(diagnosticCases&&!diagnosticCases.includes(spec.index))continue;
    const recipeKey=spec.plane==='mortal'||spec.domain==='site'||spec.domain==='leyline'||spec.domain==='mixed'?'mortal':'realms';
    if(activeRecipe!==recipeKey){await installRecipe(recipeKey);activeRecipe=recipeKey;
      if(recipeKey==='realms'&&!report.riftFixture)await prepareNaturalRiftFx();}
    // Render both real states at the exact target camera before measurement so first
    // texture uploads and legitimate shader variants are excluded from leak checks.
    await capture(spec,true);await capture(spec,false);
    const off=await capture(spec,false);
    const offMeasured=await browser.js(`return (async()=>{${sampleBody(`${spec.index}/${spec.kind}/off`)}})();`,{timeoutMs:180000});
    const offResources=await readGpuResources();
    const stem=`${String(spec.index).padStart(2,'0')}-${spec.plane}-${spec.kind}`;
    const offImage=path.join(OUT,`${stem}-off.png`);await browser.screenshot(offImage);
    const on=await capture(spec,true);
    const onMeasured=await browser.js(`return (async()=>{${sampleBody(`${spec.index}/${spec.kind}/on`)}})();`,{timeoutMs:180000});
    const onResources=await readGpuResources();
    if(spec.domain==='site'){
      const mortalRecipe=report.recipes.find(recipe=>recipe.key==='mortal');
      if(mortalRecipe?.siteProduction?.targets)mortalRecipe.siteProduction.targets[spec.kind]={...on.poi};
    }
    off.gpu.postSample=offResources;on.gpu.postSample=onResources;
    let fxMetrics=null;
    if(spec.domain==='fx'){
      fxMetrics=await page(`const plane=${JSON.stringify(spec.plane)},r=window.inkbox.render3d.renderer,probe=r.stages.get(plane)?.fxProbe;
        if(!probe?.narrative?.mesh||!probe?.stats)throw Error('pooled Narrative FX probe metrics are not wired');
        return {stats:{...probe.stats},legacyMeshCount:probe.mesh?.count||0,pooledMeshCount:probe.narrative.mesh.count};`);
      assert(fxMetrics.stats.active>0&&fxMetrics.pooledMeshCount===fxMetrics.stats.active,`${spec.index}: real Rift snapshot did not populate pooled FX instances: ${JSON.stringify(fxMetrics)}`);
      assert.equal(fxMetrics.stats.capacity,256,`${spec.index}: unexpected pooled FX capacity`);
      assert.equal(fxMetrics.stats.overflow,0,`${spec.index}: pooled FX overflowed on actual Rift snapshot`);
      assert.equal(fxMetrics.stats.drawCalls,1,`${spec.index}: pooled FX draw-call budget changed`);
    }
    const onImage=path.join(OUT,`${stem}-on.png`);await browser.screenshot(onImage);
    let uiClick=null;
    if(['site','leyline'].includes(spec.domain)){
      assert(on.markerProof?.frontmost&&on.markerProof.clickPoint,'frontmost marker ray proof missing');
      await browser.click(on.markerProof.clickPoint.x,on.markerProof.clickPoint.y);
      uiClick=await page(`const p=document.getElementById('inkInspect');return {plane:p?.dataset.plane||null,kind:p?.dataset.subjectKind||null,id:p?.dataset.subjectId||null};`);
      assert.equal(uiClick.id,String(on.poi.id),'CDP click did not open inspector for actual marker identity');
      assert.equal(uiClick.kind,spec.domain,'CDP click inspector kind mismatch');
      await page(`document.getElementById('inkInspectClose')?.click();return true;`);
    }
    let historyProof=null;
    if(spec.kind==='old-decay-trace'){
      historyProof=await captureNetherHistoryProof(on);report.netherHistoryProof=historyProof;
    }
    assert.deepEqual(on.camera,off.camera,`${spec.index} camera changed across pair`);
    assert.equal(on.digest,off.digest,`${spec.index} presentation mutated World digest`);
    assert.equal(on.worldSHA256,off.worldSHA256,`${spec.index} paired World SHA changed`);
    assert.equal(on.advanceStateSHA256,off.advanceStateSHA256,`${spec.index} paired advance-state SHA changed`);
    assert.equal(onMeasured.worldDigest,offMeasured.worldDigest,`${spec.index} measured World SHA changed across pair`);
    assert.equal(onMeasured.advanceStateDigest,offMeasured.advanceStateDigest,`${spec.index} measured advance-state SHA changed across pair`);
    assert.deepEqual(onResources.memory,offResources.memory,`${spec.index} warmed geography states changed resident GPU resource counts after 120 product frames`);
    report.cases.push({spec,off,on,uiClick,historyProof,fxMetrics,measurements:{off:offMeasured,on:onMeasured},images:{off:path.relative(ROOT,offImage).replaceAll(path.sep,'/'),on:path.relative(ROOT,onImage).replaceAll(path.sep,'/')},
      imageSha256:{off:createHash('sha256').update(fs.readFileSync(offImage)).digest('hex'),on:createHash('sha256').update(fs.readFileSync(onImage)).digest('hex')}});
    if(spec.domain==='fx')await page(`window.__c2cFxRestore?.();return true;`);
    fs.writeFileSync(path.join(OUT,'browser-progress.json'),JSON.stringify(report));
  }
  assert.equal(report.cases.length,diagnosticCases?new Set(diagnosticCases).size:23);
    const errors=browserErrors();assert.deepEqual(errors,{runtime:[],consoleApi:[]},'Edge runtime or console API errors during C2C paired matrix');
    if(diagnosticCases)report.diagnosticComplete=true;else report.pass=true;
}catch(error){report.failure=error.stack||String(error);console.error(report.failure);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();if(browser){report.browser=browser.meta;report.runtimeErrors=browserErrors();await browser.close();}
  server?.kill();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'browser.json'),JSON.stringify(report,null,2)+'\n');}
