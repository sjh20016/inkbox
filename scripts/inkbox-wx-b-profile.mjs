import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createSandboxWorld} from '../src/inkbox/ui/worldCreation.js';
import {WORLD_PRESETS, TIME} from '../src/inkbox/core/config.js';
import {isHumanPerson, isPracticingHuman, isAdult} from '../src/inkbox/core/demographics.js';
import {rngStream} from '../src/inkbox/core/noise.js';
import {Life} from '../src/inkbox/sim/life.js';
import {advanceWorld, createAdvanceState} from '../src/inkbox/sim/advance.js';
import {captureRuntimeState, restoreRuntimeState} from '../src/inkbox/sim/runtimeState.js';
import {serializeWorld, deserializeWorld} from '../src/inkbox/io/save.js';
import {enableWanxiang} from '../src/inkbox/wanxiang/runtime.js';

const option=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.split('=')[1]??fallback;
const seeds=option('seeds','20260914,73101').split(',').map(Number);
const years=Number(option('years','100')), followYears=Number(option('follow','30'));
const out=option('out','reports/local/wanxiang-b/profile');mkdirSync(out,{recursive:true});
const results=[];
function controller(world){return {world,life:new Life(world,rngStream(world.seed^0xa5a5a5a5)),state:createAdvanceState(),playerRng:rngStream(world.seed^0x504c4159)};}
function restoreMortal(saved){
 const world=deserializeWorld(saved);
 // deserializeWorld builds optional realms for old standalone mortal saves.
 // This experiment deliberately restores only the simulated mortal plane.
 if(!saved.runtime.upperLife){delete world.upper;delete world.nether;}
 const c=controller(world);
 restoreRuntimeState(saved.runtime,{world,life:c.life,advanceState:c.state,playerRng:c.playerRng});
 return c;
}
function checkpoint(c){return serializeWorld(c.world,{}, {runtime:captureRuntimeState({world:c.world,life:c.life,advanceState:c.state,playerRng:c.playerRng})});}
function distribution(values){const counts={};for(const value of values.filter(Boolean))counts[value]=(counts[value]||0)+1;return counts;}
function sample(c){
 const w=c.world, people=w.entities.filter(e=>e.hp>0&&isHumanPerson(e)), profiles=people.map(e=>e.wanxiang).filter(Boolean);
 const encounters=w.wanxiang?.encounters||[];
 return {year:w.year,day:w.day,population:people.length,mortals:people.filter(e=>!isPracticingHuman(e)).length,cultivators:people.filter(isPracticingHuman).length,adults:people.filter(isAdult).length,
  realms:distribution(people.filter(isPracticingHuman).map(e=>String(e.level))),villages:w.villages.filter(v=>v.hp>0).length,sects:w.factions.length,
  profiles:profiles.length,physiques:distribution(profiles.map(p=>p.physique?.id)),bloodlines:distribution(profiles.flatMap(p=>p.bloodlines.map(b=>`${b.id}:${b.latent?'latent':'visible'}:${b.stable?'stable':'unstable'}`))),hexagrams:distribution(profiles.map(p=>p.hexagram?.id)),traits:distribution(profiles.flatMap(p=>p.traits.map(t=>t.id))),states:distribution(profiles.flatMap(p=>p.states.map(t=>t.id))),birthProfiles:profiles.filter(p=>p.dna?.parents?.length===2).length,
  encounters:distribution(encounters.map(s=>s.stage)),participants:distribution(encounters.flatMap(s=>s.participants.map(p=>p.stage))),remainingInheritance:w.sites.filter(s=>s.inheritanceManual&&!s.inheritanceExhausted).length,
  qiMean:people.reduce((n,e)=>n+(w.qi[w.idx(Math.floor(e.x),Math.floor(e.y))]||0),0)/Math.max(1,people.length),saveBytes:Buffer.byteLength(JSON.stringify(checkpoint(c)))};
}
function observe(c,yearCount,label){
 const started=performance.now(),snapshots=[sample(c)],events={},facts={},seenFacts=new Set(),seenPeople=new Set(),seenCultivators=new Set();
 const original=c.world.record;c.world.record=function(text,type,...args){events[type]=(events[type]||0)+1;return original.call(this,text,type,...args);};
 for(let day=0;day<yearCount*TIME.daysPerYear;day+=3){
  advanceWorld(c.world,3,{life:c.life,state:c.state});
  for(const e of c.world.entities){if(isHumanPerson(e))seenPeople.add(e.id);if(isPracticingHuman(e))seenCultivators.add(e.id);for(const f of e.wanxiang?.experienceLedger?.records||[]){const key=`${e.id}:${f.id}`;if(!seenFacts.has(key)){seenFacts.add(key);facts[f.type]=(facts[f.type]||0)+1;}}}
  if(c.world.day%(10*TIME.daysPerYear)===0){snapshots.push(sample(c));console.log(`${label} seed=${c.world.seed} year=${c.world.year} cultivators=${snapshots.at(-1).cultivators}`);}
 }
 c.world.record=original;
 const data={label,seed:c.world.seed,years:yearCount,elapsedMs:Math.round(performance.now()-started),events,facts,uniquePeople:seenPeople.size,uniqueCultivators:seenCultivators.size,snapshots};
 writeFileSync(`${out}/${c.world.seed}-${label}.json`,JSON.stringify(data,null,2));return data;
}
for(const seed of seeds){
 if(option('resume','false')==='true'){
  const saved=JSON.parse(readFileSync(`${out}/${seed}-mature-save.json`,'utf8'));
  const mature=restoreMortal(saved);
  results.push({seed,natural:JSON.parse(readFileSync(`${out}/${seed}-natural.json`,'utf8')),resumed:observe(mature,followYears,'mature-resumed')});
  continue;
 }
 const world=createSandboxWorld(WORLD_PRESETS.small,seed,{terrainPreset:'standard'}),c=controller(world);
 // This is the exact queued genesis population consumed by Life.step on first advance.
 c.life.processPendingSpawns();enableWanxiang(world,{fresh:true});
 const natural=observe(c,years,'natural'),saved=checkpoint(c);
 writeFileSync(`${out}/${seed}-mature-save.json`,JSON.stringify(saved));
 const mature=restoreMortal(saved);
 const resumed=observe(mature,followYears,'mature-resumed');results.push({seed,natural,resumed});
}
writeFileSync(`${out}/summary.json`,JSON.stringify({method:'Queued formal genesis, fresh Alpha before native advanceWorld at three-day steps. Mature checkpoint generated by the same simulation and restored with G8 runtime state. No injected people, reward, experience facts or success outcomes. Mortal-only simulation, upper/nether not attached.',seeds,years,followYears,results},null,2));
console.log(`WX-B natural and mature-resumed observations written to ${out}`);
