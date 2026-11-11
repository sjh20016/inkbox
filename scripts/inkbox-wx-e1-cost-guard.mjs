import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const registry=JSON.parse(await readFile(path.join(root,'docs/development/SIMULATION_COST_REGISTRY.json'),'utf8'));
const FIXTURE_SIZES=[500,1000,1500,2500];
const METRIC_KEYS=new Set([
  'effects.calls','effects.actors','effects.alloc.result','effects.alloc.entryArrays','conditions.calls','conditions.peer.calls',
  'conditions.peer.entitiesVisited','conditions.peer.maxScan','conditions.peer.nearHits','conditions.peer.mentorHits',
  'experience.calls','experience.active.queries','experience.active.sets','experience.active.arrays','experience.active.copied','experience.active.visited',
  'experience.shared.bonds','experience.shared.calls','experience.shared.entitiesVisited','experience.shared.hits',
  'life.step.calls','life.stepEntity.calls','life.dtDays','movement.substeps',
  'entityIndex.passes','entityIndex.builds','entityIndex.buildEntitiesVisited','entityIndex.invalidations','entityIndex.invalidBuilds','entityIndex.mapLookups',
  'shared.lookupCalls','shared.lookupHits','shared.lookupMisses','shared.lookupFallbacks','shared.fallbackEntitiesVisited','shared.candidateEntitiesVisited',
]);
const positive=(n,label)=>{assert(Number.isFinite(n)&&n>=0,`${label} must be a non-negative finite number`);};

/** Validate real opt-in metric snapshots against fixture-derived exact work. */
export function validateCostSnapshot(snapshot,entityCount,{fixture='controlled',profileEntries=0}={}){
  const errors=[];
  for(const [key,value] of Object.entries(snapshot||{})){
    if(!METRIC_KEYS.has(key)&&!key.startsWith('effects.source.'))errors.push(`${fixture}: unregistered metric key ${key}`);
    if(typeof value==='number')positive(value,`${key}`);
    else if(value&&typeof value==='object')for(const [field,amount] of Object.entries(value)){
      if(typeof amount==='number')positive(amount,`${key}.${field}`);
    }
  }
  const get=key=>Number(snapshot?.[key]||0);
  const reads=get('effects.calls');
  const peerCalls=get('conditions.peer.calls');
  const peerVisited=get('conditions.peer.entitiesVisited');
  const peerMax=get('conditions.peer.maxScan');
  const activeQueries=get('experience.active.queries');
  const activeVisited=get('experience.active.visited');
  const sharedCalls=get('experience.shared.calls');
  const sharedVisited=get('experience.shared.entitiesVisited');
  if(get('effects.actors')!==1)errors.push(`${fixture}: expected exactly one measured actor`);
  if(reads!==1||get('conditions.calls')!==1||peerCalls!==1)errors.push(`${fixture}: expected one readEffects and one peer condition scan`);
  if(peerMax!==entityCount||peerVisited!==entityCount)errors.push(`${fixture}: peer condition must scan exactly N array entries`);
  if(get('conditions.peer.nearHits')!==entityCount-1)errors.push(`${fixture}: controlled peers should all be near except the actor itself`);
  if(get('experience.active.arrays')!==0||get('experience.active.copied')!==0)errors.push(`${fixture}: repeated active arrays/copies must remain zero`);
  if(get('experience.calls')!==1||get('experience.active.sets')!==1)errors.push(`${fixture}: expected one experience pass and one invocation-local active set`);
  if(activeQueries<1||activeVisited!==profileEntries)errors.push(`${fixture}: active visits must equal this actor traits.length + states.length`);
  if(get('experience.shared.bonds')!==1||sharedCalls!==1||sharedVisited!==entityCount||get('experience.shared.hits')!==1)
    errors.push(`${fixture}: shared insight fixture must scan through the last peer and find it once`);
  return errors;
}

async function productionFixture(n){
  const [profileModule,effectsModule,metricsModule]=await Promise.all([
    import(pathToFileURL(path.join(root,'src/inkbox/wanxiang/profile.js'))),
    import(pathToFileURL(path.join(root,'src/inkbox/wanxiang/effects.js'))),
    import(pathToFileURL(path.join(root,'src/inkbox/sim/workMetrics.js'))),
  ]);
  const entities=Array.from({length:n},(_,i)=>({id:i+1,x:0,y:0,hp:100,maxHp:100,level:1,state:'rest',faction:1,relations:new Map()}));
  for(const entity of entities)profileModule.initializeProfile(entity);
  const actor=entities[0],p=actor.wanxiang;
  p.hexagram={id:'hex_45'}; // Real conditional `three_allies_near` forces the peer scan.
  p.traits.push({id:'breakthrough_echo'},{id:'risk_fear'});
  p.states.push({id:'meridian_damage'},{id:'site_wound'});
  p.bonds.push({id:'shared_insight',targetKey:`mortal:${n}`,expiresDay:10});
  const world={day:0,plane:'mortal',entities};
  metricsModule.enableWorkMetrics(world,true,{timing:false});
  effectsModule.readEffects(actor,{world,day:0},'wx-e1-fixture');
  return {snapshot:metricsModule.workMetricsSnapshot(world),profileEntries:p.traits.length+p.states.length};
}

const measured=[];
for(const n of FIXTURE_SIZES){const actual=await productionFixture(n);measured.push({n,...actual});assert.deepEqual(validateCostSnapshot(actual.snapshot,n,{fixture:`production fixture N=${n}`,profileEntries:actual.profileEntries}),[],`real modules N=${n} pass exact work checks`);}
const control=measured[0];
const overBudget={...control.snapshot,'experience.active.copied':1};
assert(validateCostSnapshot(overBudget,500,{profileEntries:control.profileEntries}).some(error=>error.includes('arrays/copies')),'controlled mutated measured counter fails');
const unknownKey={...control.snapshot,'conditions.peer.hiddenScan':500};
assert(validateCostSnapshot(unknownKey,500,{profileEntries:control.profileEntries}).some(error=>error.includes('unregistered metric key')),'unregistered scan metric fails');

const required=['effects.calls','conditions.peer.entitiesVisited','experience.active.arrays','experience.shared.entitiesVisited'];
for(const key of required)assert(METRIC_KEYS.has(key),`audited metric ${key} must be recognized`);
assert(registry.protectedFiles.some(item=>item.path==='src/inkbox/wanxiang/effects.js'),'E0 readEffects anchor retained');
for(const file of ['src/inkbox/wanxiang/conditions.js','src/inkbox/wanxiang/experiences.js','src/inkbox/sim/cultivation.js','src/inkbox/wanxiang/practice.js','src/inkbox/sim/daoActivities.js'])
  assert(registry.protectedFiles.some(item=>item.path===file),`${file} must have a transitive cost protection entry`);
console.log(`WX-E1 cost guard: production readEffects N=${FIXTURE_SIZES.join('/')} exact counters pass; controlled mutated-counter and unknown-key red cases pass; no timing assertions`);
