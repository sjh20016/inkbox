// Shared native restore/capture harness. No alternate world generator or clock.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const digest = value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const SOURCE_FILES=['sim/life.js','sim/advance.js','sim/workMetrics.js','sim/sites.js','wanxiang/skills.js','wanxiang/damage.js','wanxiang/effects.js','sim/siteSearch.js'];
export function sourceInfo(root) {
  const hashes=Object.fromEntries(SOURCE_FILES.filter(f=>fs.existsSync(path.join(root,'src/inkbox',f))).map(f=>[f,digest(fs.readFileSync(path.join(root,'src/inkbox',f)))]));
  const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  const manifestPath=path.join(root,'WX_E0_SOURCE.json');
  if(fs.existsSync(manifestPath)){
    const pinned=JSON.parse(fs.readFileSync(manifestPath));
    for(const [file,hash]of Object.entries(hashes))assert.equal(hash,pinned.hashes[file],`exported source modified: ${file}`);
    return {root,head:pinned.head,tree:pinned.tree,dirty:false,hashes,pinnedExport:true};
  }
  return {root,head:git(['rev-parse','HEAD']),dirty:!!git(['status','--porcelain']),hashes};
}
export async function nativeApi(root=path.resolve(fileURLToPath(new URL('..',import.meta.url)))) {
  const load=p=>import(pathToFileURL(path.join(root,'src/inkbox',p)).href);
  const [save,noise,life,upper,advance,runtime,metrics,effects,creation,config,wx,demographics,sites]=await Promise.all([
    'io/save.js','core/noise.js','sim/life.js','sim/upperLife.js','sim/advance.js','sim/runtimeState.js','sim/workMetrics.js','wanxiang/effects.js','ui/worldCreation.js','core/config.js','wanxiang/runtime.js','core/demographics.js','sim/sites.js'].map(load));
  const api={root,load,metrics,effects,demographics,sites,
    restore(saved,{measure=false}={}) {
      // deserializeWorld retains some cold objects by reference: never reuse input.
      const input=structuredClone(saved),world=save.deserializeWorld(input);
      if(!input.runtime?.upperLife){delete world.upper;delete world.nether;}
      const lifeController=new life.Life(world,noise.rngStream(world.seed^0xa5a5a5a5));
      const upperLife=input.runtime?.upperLife?new upper.UpperLife(world.upper):undefined;
      const state=advance.createAdvanceState(),playerRng=noise.rngStream(world.seed^0x504c4159);
      if(input.runtime)runtime.restoreRuntimeState(input.runtime,{world,life:lifeController,upperLife,advanceState:state,playerRng});
      const c={world,life:lifeController,upperLife,state,playerRng};
      if(measure)metrics.enableWorkMetrics(world);
      return c;
    },
    capture(c) {return save.serializeWorld(c.world,{}, {runtime:runtime.captureRuntimeState({world:c.world,life:c.life,upperLife:c.upperLife,advanceState:c.state,playerRng:c.playerRng})});},
    advance(c,days){return advance.advanceWorld(c.world,days,c);},
    fresh(seed=73101) {
      const world=creation.createSandboxWorld(config.WORLD_PRESETS.small,seed,{terrainPreset:'standard'});
      const lifeController=new life.Life(world,noise.rngStream(world.seed^0xa5a5a5a5));lifeController.processPendingSpawns();
      wx.enableWanxiang(world,{fresh:true});
      return {world,life:lifeController,state:advance.createAdvanceState(),playerRng:noise.rngStream(world.seed^0x504c4159)};
    }
  };return api;
}
export function contextSummary(api,world) {
  const d=api.demographics;
  const perPlane=Object.fromEntries(['mortal','upper','nether'].map(plane=>{
    const w=plane==='mortal'?world:world[plane];if(!w)return [plane,null];
    const alive=(w.entities||[]).filter(e=>e.hp>0);
    const resources=(w.factions||[]).map(f=>({id:f.id,provisions:f.resources?.provisions??null,spiritStone:f.resources?.spiritStone??null}));
    return [plane,{entities:alive.length,humans:alive.filter(d.isHumanPerson).length,mortals:alive.filter(d.isMortalHuman).length,
      cultivators:alive.filter(e=>d.isHumanPerson(e)&&e.level>0).length,profiles:alive.filter(e=>e.wanxiang).length,
      combatAllocated:alive.filter(e=>e.wanxiang?.cultivation?.combat).length,villages:w.villages?.length||0,factions:w.factions?.length||0,
      artifacts:(w.artifacts?.length||0)+alive.reduce((n,e)=>n+(e.artifacts?.length||0),0),sites:w.sites?.length||0,
      activeCaves:(w.sites||[]).filter(s=>s.kind==='cave'&&api.sites.siteHasContent(s,w)).length,
      dormantCaves:(w.sites||[]).filter(s=>s.kind==='cave'&&!api.sites.siteHasContent(s,w)).length,
      popLog:structuredClone(w.popLog||{}),resources}];
  }));return {day:world.day,perPlane};
}
export function assertNativeInvariants(api,c) {
  const w=c.world,ids=new Set();
  for(const e of w.entities){assert(!ids.has(e.id),'mortal plane entity IDs remain unique');ids.add(e.id);
    assert(e.hp>0&&!e._ascended,'death/ascension cleanup still runs');
    assert(Number.isFinite(e.age)&&Number.isFinite(e.lifespan)&&e.age<e.lifespan,'living entities retain age/lifespan rules');}
  for(const f of w.factions||[])for(const amount of Object.values(f.resources||{}))assert(Number.isFinite(amount)&&amount>=0,'sect stocks remain finite and nonnegative');
  const artifactIds=new Set();for(const plane of ['mortal','upper','nether']){
    const pw=plane==='mortal'?w:w[plane];if(!pw)continue;
    for(const a of pw.artifacts||[]){assert(!artifactIds.has(a.id),'original artifact identity is unique');artifactIds.add(a.id);assert.equal(a.ownerId,0);}
    for(const e of pw.entities||[])for(const a of e.artifacts||[]){assert(!artifactIds.has(a.id),'carried original is unique');artifactIds.add(a.id);assert.equal(a.ownerId,e.id);}
  }
}
export function advanceDays(api,c,days,dt=3){let elapsed=0;while(elapsed<days-1e-9){const step=Math.min(dt,days-elapsed);api.advance(c,step);elapsed+=step;}}

async function main(){
  const option=(n,f)=>process.argv.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3)??f;
  const actualRoot=path.resolve(option('source',fileURLToPath(new URL('..',import.meta.url))));
  const api=await nativeApi(actualRoot),savePath=option('save','reports/local/wx-e0/checkpoints/20260914-100y-save.json');
  const input=fs.readFileSync(savePath),saved=JSON.parse(input),before=digest(saved),days=Number(option('days','30')),dt=Number(option('dt','3'));
  assert(days>0&&days<=360&&dt>0&&dt<=30);
  const runs=[];for(const measure of [false,true,true,false]){
    const c=api.restore(saved,{measure});advanceDays(api,c,days,dt);assertNativeInvariants(api,c);const full=api.capture(c);
    runs.push({measure,fullSha256:digest(full),runtimeSha256:digest(full.runtime),runtime:full.runtime,context:contextSummary(api,c.world),work:api.metrics.workMetricsSnapshot(c.world)});
  }
  assert.equal(new Set(runs.map(r=>r.fullSha256)).size,1,'metrics on/off preserve complete world and registered RNG');
  let comparison=null;
  if(option('compare-source','')){
    const referenceRoot=path.resolve(option('compare-source','')),reference=await nativeApi(referenceRoot),c=reference.restore(saved);
    advanceDays(reference,c,days,dt);const full=reference.capture(c);
    assert.equal(digest(full),runs[0].fullSha256,'S-class source comparison preserves complete world and registered RNG');
    comparison={source:sourceInfo(referenceRoot),fullSha256:digest(full),runtimeSha256:digest(full.runtime),equal:true};
  }
  assert.equal(digest(saved),before,'replays cannot mutate the reusable checkpoint');
  const out=option('out','reports/local/wx-e0/replay.json');fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
  fs.writeFileSync(out,JSON.stringify({source:sourceInfo(actualRoot),savePath,inputSha256:digest(input),days,dt,runs,comparison,inputPreserved:true},null,2));
  console.log(`WX-E0 native replay: ${days} days at dt=${dt}; all four metrics-on/off world/RNG hashes match`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
