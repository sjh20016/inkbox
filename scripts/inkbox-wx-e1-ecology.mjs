import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {nativeApi,digest} from './inkbox-wx-e0-replay.mjs';
import {sourceInfo} from './inkbox-wx-e0-replay.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const configPath=path.join(repo,'docs/development/WX_E1_ECOLOGY_THRESHOLDS.json');
export function parseArgs(argv){
  const parsed={};
  for(let i=0;i<argv.length;i++){
    const token=argv[i];if(!token.startsWith('--'))throw new Error(`unexpected argument ${token}`);
    const eq=token.indexOf('=');if(eq>=0){parsed[token.slice(2,eq)]=token.slice(eq+1);continue;}
    const key=token.slice(2),next=argv[i+1];if(next&&!next.startsWith('--')){parsed[key]=next;i++;}else parsed[key]=true;
  }
  return parsed;
}
const args=parseArgs(process.argv.slice(2));
const config=JSON.parse(await fs.readFile(configPath,'utf8'));

export function validateConfig(c=config){
  assert.deepEqual(parseArgs(['--mode','full','--old-source=/old','--new-source','/new']),{mode:'full','old-source':'/old','new-source':'/new'});
  assert.equal(c.schemaVersion,1);assert.equal(c.frozenBeforeRun,true);
  assert.equal(c.years,200);assert.equal(c.dtDays,3);
  assert.deepEqual(c.seeds,[20260914,73101,61003]);
  assert.equal(Object.keys(c.thresholds||{}).length,11);
  for(const [name,row] of Object.entries(c.thresholds)){
    assert(name.length>0);assert(Object.hasOwn(row,'maxRelativeDelta')||Object.hasOwn(row,'maxTotalVariation'),`${name} needs a frozen bound`);
    for(const value of Object.values(row))if(typeof value==='number')assert(Number.isFinite(value)&&value>=0&&value<=1,`${name} threshold outside [0,1]`);
  }
  assert(c.unavailableMetrics.length>=3,'unavailable retained-history limits must be explicit');
  return {seeds:c.seeds,years:c.years,dtDays:c.dtDays,thresholdCount:Object.keys(c.thresholds).length};
}

function planeList(world){return [['mortal',world],['upper',world.upper],['nether',world.nether]].filter(([,w])=>w);}
function collect(world){
  const planes=planeList(world),entities=planes.flatMap(([,w])=>w.entities||[]),alive=entities.filter(e=>e.hp>0);
  const cohort={village:0,genesis:0,placed:0,fixture:0,unknown:0};
  for(const e of alive)cohort[e.birthOrigin?.kind in cohort?e.birthOrigin.kind:'unknown']++;
  const dead=planes.flatMap(([,w])=>w.dead||[]),deathCauses={};
  for(const d of dead){const key=d.cause||'unknown';deathCauses[key]=(deathCauses[key]||0)+1;}
  const resources=planes.flatMap(([,w])=>w.factions||[]).reduce((out,f)=>{
    for(const [key,value] of Object.entries(f.resources||{}))if(Number.isFinite(value))out[key]=(out[key]||0)+value;
    return out;
  },{});
  const ledgerTypes={'breakthrough-success':0,'breakthrough-failure':0,'site-success':0,'site-failure':0};
  for(const e of alive)for(const row of e.wanxiang?.experienceLedger?.records||[])if(Object.hasOwn(ledgerTypes,row.type))ledgerTypes[row.type]++;
  const artifactOwners=new Map();
  const takeArtifact=(artifact,ownerId,location)=>{
    assert(artifact&&artifact.id!=null,`artifact missing id at ${location}`);
    assert.equal(artifact.ownerId,ownerId,`artifact ownerId mismatch for ${artifact.id} at ${location}`);
    assert(!artifactOwners.has(artifact.id),`duplicate globally unique artifact id ${artifact.id}`);
    artifactOwners.set(artifact.id,{ownerId,location});
  };
  for(const [plane,w] of planes){
    for(const a of w.artifacts||[])takeArtifact(a,0,`${plane}:ground`);
    for(const e of w.entities||[])for(const a of e.artifacts||[])takeArtifact(a,e.id,`${plane}:entity:${e.id}`);
  }
  const soulRoutes={};for(const [,w] of planes)for(const [key,value] of Object.entries(w.soulLog||{}))soulRoutes[key]=(soulRoutes[key]||0)+value;
  const deadLog=planes.reduce((out,[name,w])=>{out[name]=w.deadLog?structuredClone(w.deadLog):null;return out;},{});
  const deadTotalAvailable=planes.every(([,w])=>Number.isFinite(w.deadLog?.total));
  return {livingPopulation:alive.length,livingCultivatorPopulation:alive.filter(e=>e.level>0).length,
    survivingBirthOrigins:cohort,deadTotal:deadTotalAvailable?planes.reduce((n,[,w])=>n+w.deadLog.total,0):null,
    retainedDeathCauseCounts:deathCauses,retainedDeathAgeDays:dead.map(d=>d.age).filter(Number.isFinite),
    sectVillageCounts:{factions:planes.reduce((n,[,w])=>n+(w.factions?.length||0),0),villages:planes.reduce((n,[,w])=>n+(w.villages?.length||0),0)},
    sectResources:resources,breakthroughOutcomes:{success:ledgerTypes['breakthrough-success'],failure:ledgerTypes['breakthrough-failure']},
    siteOutcomes:{success:ledgerTypes['site-success'],failure:ledgerTypes['site-failure']},
    artifactUniqueOwners:{total:artifactOwners.size,ground:[...artifactOwners.values()].filter(row=>row.ownerId===0).length,carried:[...artifactOwners.values()].filter(row=>row.ownerId!==0).length},
    soulRoutes,deadLog,retainedDeadRecords:dead.length,retainedDeathAgeUnits:'days'};
}
async function provenance(root){
  const info=sourceInfo(root),git=(...argv)=>execFileSync('git',['-C',root,...argv],{encoding:'utf8'}).trim();
  const paths=[];
  async function walk(relative){for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})){const child=path.join(relative,entry.name);if(entry.isDirectory())await walk(child);else if(entry.isFile()&&entry.name.endsWith('.js'))paths.push(child.replaceAll('\\','/'));}}
  await walk('src/inkbox');paths.sort();
  const rows=[];for(const relative of paths){const bytes=await fs.readFile(path.join(root,relative));rows.push(`${relative}\0${digest(bytes)}`);}
  return {...info,tree:git('rev-parse','HEAD^{tree}'),dirty:!!git('status','--porcelain'),allTrackedInkboxJsSha256:digest(rows.join('\n'))};
}
function numericPairs(oldValue,newValue,prefix=''){
  if(typeof oldValue==='number'&&typeof newValue==='number')return [[prefix,oldValue,newValue]];
  if(oldValue&&newValue&&typeof oldValue==='object'&&typeof newValue==='object')return [...new Set([...Object.keys(oldValue),...Object.keys(newValue)])].flatMap(key=>numericPairs(oldValue[key]??0,newValue[key]??0,prefix?`${prefix}.${key}`:key));
  return [];
}
function relativeDelta(a,b){return Math.abs(b-a)/Math.max(Math.abs(a),Math.abs(b),1);}
function evaluate(oldStats,newStats,thresholds){
  const checks=[];
  for(const metric of ['livingPopulation','livingCultivatorPopulation','survivingBirthOrigins','deadTotal','retainedDeathCauseCounts','sectVillageCounts','sectResources','breakthroughOutcomes','siteOutcomes','artifactUniqueOwners']){
    const limit=thresholds[metric].maxRelativeDelta;
    if(oldStats[metric]==null||newStats[metric]==null){checks.push({metric,available:false,pass:false,reason:'required endpoint metric absent'});continue;}
    for(const [field,a,b] of numericPairs(oldStats[metric],newStats[metric],metric)){const delta=relativeDelta(a,b);checks.push({metric:field,old:a,new:b,relativeDelta:delta,limit,pass:delta<=limit});}
  }
  const oldSoul=oldStats.soulRoutes,newSoul=newStats.soulRoutes,keys=new Set([...Object.keys(oldSoul),...Object.keys(newSoul)]);
  const oldTotal=[...Object.values(oldSoul)].reduce((a,b)=>a+b,0)||1,newTotal=[...Object.values(newSoul)].reduce((a,b)=>a+b,0)||1;
  const tv=.5*[...keys].reduce((sum,key)=>sum+Math.abs((oldSoul[key]||0)/oldTotal-(newSoul[key]||0)/newTotal),0),limit=thresholds.soulRouteDistribution.maxTotalVariation;
  checks.push({metric:'soulRouteDistribution',totalVariation:tv,limit,pass:tv<=limit});
  return {checks,pass:checks.every(row=>row.pass)};
}
async function runOne(source,seed,days,dtDays){
  const api=await nativeApi(source),context=api.fresh(seed);let elapsed=0;
  while(elapsed<days){const step=Math.min(dtDays,days-elapsed);api.advance(context,step);elapsed+=step;}
  const save=api.capture(context),forkA=api.restore(save),forkB=api.restore(save);let forkElapsed=0;
  while(forkElapsed<30){api.advance(context,3);api.advance(forkA,3);api.advance(forkB,3);forkElapsed+=3;}
  const originalForkSave=api.capture(context),restoredForkSave=api.capture(forkA),secondRestoredForkSave=api.capture(forkB),forkEquivalent=digest(restoredForkSave)===digest(secondRestoredForkSave);
  assert(forkEquivalent,`save/restore continuation diverged for ${source}, seed ${seed}`);
  return {source,seed,measuredDays:days,measuredYears:days/360,finalDayAfterFork:context.world.day,dtDays,stats:collect(api.restore(save).world),runtimeRngSha256:digest(save.runtime),serializedWorldSha256:digest(save),
    saveFork:{continuationDays:30,restoredForkSha256:digest(restoredForkSave),secondRestoredForkSha256:digest(secondRestoredForkSave),equivalent:forkEquivalent,
      uninterruptedVsRestoredEqual:digest(originalForkSave)===digest(restoredForkSave),uninterruptedComparison:'reported only; save serialization may quantize terrain'}};
}

if(args['validate-config']){
  const summary=validateConfig();
  if(args['old-source']||args['new-source']||args.mode)throw new Error('--validate-config is a dry config check; do not pass run options');
  console.log(`WX-E1 W6 config valid: ${summary.seeds.length} seeds, ${summary.years} years, ${summary.dtDays}-day steps, ${summary.thresholdCount} frozen metrics; no simulation run`);
}else{
  validateConfig();
  assert.equal(args.mode,'full','use --mode full or --validate-config');
  for(const name of ['old-source','new-source'])assert(typeof args[name]==='string'&&path.isAbsolute(args[name]),`--${name} must be an absolute source directory`);
  const days=config.years*360,dtDays=config.dtDays,runs=[];
  const oldRoot=path.resolve(args['old-source']),newRoot=path.resolve(args['new-source']);
  const result={schemaVersion:1,kind:'wx-e1-w6-ecology-screen',thresholdConfig:configPath,thresholdConfigSha256:digest(config),seeds:config.seeds,years:config.years,dtDays,
    oldSource:await provenance(oldRoot),newSource:await provenance(newRoot),runs,pass:false,measuredThresholdsPass:false,ecologyAcceptance:'blocked-unavailable-required-metrics',promotionEligible:false,status:'running',limitations:config.unavailableMetrics};
  for(const seed of config.seeds){
    const oldRun=await runOne(oldRoot,seed,days,dtDays);
    const newRun=await runOne(newRoot,seed,days,dtDays);
    runs.push({seed,old:oldRun,new:newRun,comparison:evaluate(oldRun.stats,newRun.stats,config.thresholds)});
    result.measuredThresholdsPass=runs.every(row=>row.comparison.pass);result.pass=false;result.status='running';
    const partialOut=path.resolve(typeof args.out==='string'?args.out:'reports/local/wx-e1/ecology-comparison.json');
    await fs.mkdir(path.dirname(partialOut),{recursive:true});await fs.writeFile(partialOut,JSON.stringify(result,null,2)+'\n');
    console.log(`W6 seed ${seed}: old/new ${days} days complete; threshold ${runs.at(-1).comparison.pass?'pass':'fail'}`);
  }
  result.measuredThresholdsPass=runs.every(row=>row.comparison.pass);result.pass=false;result.status='complete';
  const out=path.resolve(typeof args.out==='string'?args.out:'reports/local/wx-e1/ecology-comparison.json');
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(result,null,2)+'\n');
  console.log(`W6 ecology report: ${out}; overall ${result.pass?'pass':'fail'}`);
}
