// One observation harness for both the unmodified WX-B tree and WX-C.
// Mortal-only, queued formal genesis; no injected actors, resources or outcomes.
import {mkdirSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const option=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const root=path.resolve(option('source',fileURLToPath(new URL('..',import.meta.url))));
const load=relative=>import(pathToFileURL(path.join(root,'src/inkbox',relative)).href);
const [{createSandboxWorld},{WORLD_PRESETS,TIME},{isHumanPerson,isPracticingHuman},{rngStream},{Life},
 {advanceWorld,createAdvanceState},{captureRuntimeState,restoreRuntimeState},{serializeWorld,deserializeWorld},{enableWanxiang}]
 = await Promise.all(['ui/worldCreation.js','core/config.js','core/demographics.js','core/noise.js','sim/life.js',
 'sim/advance.js','sim/runtimeState.js','io/save.js','wanxiang/runtime.js'].map(load));
const seeds=option('seeds','20260914,73101,61003').split(',').map(Number);
const years=Number(option('years','100')),follow=Number(option('follow','30'));
if(!seeds.every(Number.isSafeInteger)||![years,follow].every(n=>Number.isInteger(n)&&n>=0&&n<=500))throw Error('invalid-profile-options');
const out=path.resolve(option('out','reports/local/wanxiang-c/profile'));
mkdirSync(out,{recursive:true});
const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
const provenance={sourceRoot:root,sha:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),dirty:!!git(['status','--porcelain','--untracked-files=no']),node:process.version};
const distribution=values=>{const d={};for(const v of values)if(v!=null)d[v]=(d[v]||0)+1;return d;};
function controller(world){return {world,life:new Life(world,rngStream(world.seed^0xa5a5a5a5)),state:createAdvanceState(),playerRng:rngStream(world.seed^0x504c4159)};}
const checkpoint=c=>serializeWorld(c.world,{}, {runtime:captureRuntimeState({world:c.world,life:c.life,advanceState:c.state,playerRng:c.playerRng})});
function restore(saved){
 const world=deserializeWorld(saved);
 if(!saved.runtime.upperLife){delete world.upper;delete world.nether;}
 const c=controller(world);
 restoreRuntimeState(saved.runtime,{world,life:c.life,advanceState:c.state,playerRng:c.playerRng});
 return c;
}
function population(w){return w.entities.filter(e=>e.hp>0&&isHumanPerson(e));}
function snapshot(c){
 const w=c.world,people=population(w),profiles=people.map(e=>e.wanxiang).filter(Boolean);
 return {year:w.day/TIME.daysPerYear,day:w.day,population:people.length,mortals:people.filter(e=>!isPracticingHuman(e)).length,
 cultivators:people.filter(isPracticingHuman).length,realms:distribution(people.filter(isPracticingHuman).map(e=>e.level)),
 villages:w.villages.filter(v=>v.hp>0).length,sects:w.factions.length,
 sectSupply:w.factions.map(f=>({id:f.id,...f.economy})),
 physiques:distribution(profiles.map(p=>p.physique?.id)),bloodlines:distribution(profiles.flatMap(p=>p.bloodlines.map(b=>`${b.id}:${b.latent?'latent':'visible'}:${b.stable?'stable':'unstable'}`))),
 hexagrams:distribution(profiles.map(p=>p.hexagram?.id)),personality:distribution(profiles.flatMap(p=>p.personality.map(v=>v.id))),
 traits:distribution(profiles.flatMap(p=>p.traits.map(t=>t.id))),states:distribution(profiles.flatMap(p=>p.states.map(t=>t.id))),
 birthProfiles:profiles.filter(p=>p.dna?.parents?.length===2).length,
 remainingInheritance:w.sites.filter(s=>s.inheritanceManual&&!s.inheritanceExhausted).length,
 resourceSites:w.sites.filter(s=>!s.inheritanceExhausted&&s.inheritanceManual||s.dragonBoneCharges>0||s.divineShardCharges>0).length,
 encounterStages:distribution((w.wanxiang?.encounters||[]).map(s=>s.stage)),
 opportunityStats:structuredClone(w.wanxiang?.opportunities||w.wanxiang?.opportunityStats||null),
 artifactLog:structuredClone(w.artifactLog),saveBytes:Buffer.byteLength(JSON.stringify(checkpoint(c)))};
}
function observe(c,span,label){
 const started=performance.now(),cpuStarted=process.cpuUsage(),startDay=c.world.day,endDay=startDay+span*TIME.daysPerYear;
 const snapshots=[snapshot(c)],facts={},events={},milestones={},choiceReasons={},seenFacts=new Set(),seenMilestones=new Set(),seenPeople=new Set(),seenSites=new Set(c.world.sites.map(s=>s.id));
 let cultivatorDays=0,naturalCaves=0,deaths=0,deathAgeDays=0;
 const beforeRecord=c.world.record,beforeDeath=c.life.onDeath;
 c.world.record=function(text,type,...args){events[type]=(events[type]||0)+1;return beforeRecord.call(this,text,type,...args);};
 function records(e,initial=false){
  if(!isHumanPerson(e))return;
  seenPeople.add(e.id);
  for(const f of e.wanxiang?.experienceLedger?.records||[]){const k=`${e.id}:${f.id}`;if(seenFacts.has(k))continue;seenFacts.add(k);if(!initial)facts[f.type]=(facts[f.type]||0)+1;}
  for(const f of e.wanxiang?.history||[]){const k=`${e.id}:${JSON.stringify(f)}`;if(seenMilestones.has(k))continue;seenMilestones.add(k);if(!initial){const type=f.type||f.kind||f.source||'other';const key=typeof type==='object'?type.kind||'other':type;milestones[key]=(milestones[key]||0)+1;for(const reason of f.reasons||[])choiceReasons[reason]=(choiceReasons[reason]||0)+1;}}
 }
 for(const e of c.world.entities)records(e,true);
 c.life.onDeath=function(e,...args){if(isHumanPerson(e)){deaths++;deathAgeDays+=Math.max(0,e.age||0);records(e);}return beforeDeath.call(this,e,...args);};
 const initialStats=snapshots[0].opportunityStats;
 while(c.world.day<endDay){
  const step=Math.min(3,endDay-c.world.day),before=population(c.world).filter(isPracticingHuman).length;
  advanceWorld(c.world,step,{life:c.life,state:c.state});
  const after=population(c.world).filter(isPracticingHuman).length;
  // Trapezoidal 3-day sampling of living cultivators; never final N * years.
  cultivatorDays+=(before+after)*.5*step;
  for(const e of c.world.entities)records(e);
  for(const s of c.world.sites)if(!seenSites.has(s.id)){seenSites.add(s.id);if(s.kind==='cave')naturalCaves++;}
  if((c.world.day-startDay)%(10*TIME.daysPerYear)===0||c.world.day===endDay){snapshots.push(snapshot(c));console.log(`${label} seed=${c.world.seed} year=${c.world.day/TIME.daysPerYear} cultivators=${after}`);}
 }
 c.world.record=beforeRecord;c.life.onDeath=beforeDeath;
 const cultivatorYears=cultivatorDays/TIME.daysPerYear,elapsedMs=performance.now()-started,cpu=process.cpuUsage(cpuStarted),cpuMs=(cpu.user+cpu.system)/1000;
 const data={label,kind:'natural mortal-world observation',seed:c.world.seed,startDay,endDay,years:span,...provenance,
 elapsedMs,cpuMs,cpuMsPerWorldYear:span?cpuMs/span:null,cultivatorYears,denominator:'Trapezoidal living-cultivator count every 3 world days, accumulated across the observation interval.',
 deaths,meanObservedDeathAgeYears:deaths?deathAgeDays/deaths/TIME.daysPerYear:null,events,facts,milestones,choiceReasons,naturalCaves,
 factsPer100CultivatorYears:Object.fromEntries(Object.entries(facts).map(([k,v])=>[k,cultivatorYears?v/cultivatorYears*100:0])),
 opportunityStatsBefore:initialStats,opportunityStatsAfter:snapshots.at(-1).opportunityStats,uniquePeople:seenPeople.size,snapshots};
 writeFileSync(path.join(out,`${c.world.seed}-${label}.json`),JSON.stringify(data,null,2));return data;
}
const results=[];
for(const seed of seeds){
 const w=createSandboxWorld(WORLD_PRESETS.small,seed,{terrainPreset:'standard'}),c=controller(w);
 c.life.processPendingSpawns();enableWanxiang(w,{fresh:true});
 const natural=observe(c,years,'natural'),saved=checkpoint(c);
 writeFileSync(path.join(out,`${seed}-mature-save.json`),JSON.stringify(saved));
 const mature=restore(saved),resumed=observe(mature,follow,'mature-resumed');
 results.push({seed,natural,resumed});
}
writeFileSync(path.join(out,'summary.json'),JSON.stringify({method:'Formal small-map genesis and native advanceWorld, same source-independent observer, no injected characters/rewards/successes. Only mortal plane. Actual 3-day person-time denominator. A real mature checkpoint is restored with G8 clocks and RNG. Before/after source provenance retained.',...provenance,seeds,years,follow,results},null,2));
console.log(`WX-C natural profile written to ${out}`);
