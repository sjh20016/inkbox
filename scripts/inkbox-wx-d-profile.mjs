// Formal genesis and native world clocks only. No actors, injuries, relationships,
// resources or successful outcomes are injected by this observer.
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const root = path.resolve(option('source', fileURLToPath(new URL('..', import.meta.url))));
const load = relative => import(pathToFileURL(path.join(root, 'src/inkbox', relative)).href);
const [{ createSandboxWorld }, { WORLD_PRESETS, TIME }, { isHumanPerson, isPracticingHuman }, { rngStream }, { Life },
  { advanceWorld, createAdvanceState }, { captureRuntimeState, restoreRuntimeState }, { serializeWorld, deserializeWorld },
  { enableWanxiang }, sitesModule, geographyModule, metricsModule] = await Promise.all([
  'ui/worldCreation.js', 'core/config.js', 'core/demographics.js', 'core/noise.js', 'sim/life.js', 'sim/advance.js',
  'sim/runtimeState.js', 'io/save.js', 'wanxiang/runtime.js', 'sim/sites.js',
  'world/transitGeography.js',
  // A WX-C --source baseline has no diagnostics module.
].map(load).concat(import(pathToFileURL(path.join(root, 'src/inkbox/sim/workMetrics.js')).href).catch(e => {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  return {};
})));
const seeds = option('seeds', '20260914,73101,61003').split(',').map(Number);
const years = Number(option('years', '100')), follow = Number(option('follow', '30')), long = Number(option('long', '400'));
if (!seeds.every(Number.isSafeInteger) || ![years, follow, long].every(n => Number.isInteger(n) && n >= 0 && n <= 800)) throw Error('invalid-profile-options');
const out = path.resolve(option('out', 'reports/local/wanxiang-d/profile'));
mkdirSync(out, { recursive: true });
const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const provenance = { sourceRoot: root, sha: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}']),
  dirty: !!git(['status', '--porcelain', '--untracked-files=no']), node: process.version,
  cpu: os.cpus()[0]?.model, platform: `${os.platform()} ${os.release()} ${os.arch()}` };
const distribution = values => { const result = {}; for (const v of values) if (v != null) result[v] = (result[v] || 0) + 1; return result; };
const people = w => w.entities.filter(e => e.hp > 0 && isHumanPerson(e));
const content = (s,w) => sitesModule.siteContentState?.(s,w) || { inheritance: !!s.inheritanceManual && !s.inheritanceExhausted,
  dragonBone: s.dragonBoneCharges > 0, phoenixFeather: s.phoenixFeatherCharges > 0, godFragment: s.godFragmentCharges > 0,
  artifact: !!s.artifactId && !s.artifactClaimed };
const hasContent = (s,w) => Object.values(content(s,w)).some(Boolean);
function controller(world) {
  return { world, life: new Life(world, rngStream(world.seed ^ 0xa5a5a5a5)), state: createAdvanceState(),
    playerRng: rngStream(world.seed ^ 0x504c4159) };
}
const checkpoint = c => serializeWorld(c.world, {}, { runtime: captureRuntimeState({ world: c.world, life: c.life, advanceState: c.state, playerRng: c.playerRng }) });
function restore(saved) {
  const world = deserializeWorld(saved);
  if (!saved.runtime.upperLife) { delete world.upper; delete world.nether; }
  const c = controller(world);
  restoreRuntimeState(saved.runtime, { world, life: c.life, advanceState: c.state, playerRng: c.playerRng });
  return c;
}
function snapshot(c) {
  const w = c.world, living = people(w), profiles = living.map(e => e.wanxiang).filter(Boolean), caves = w.sites.filter(s => s.kind === 'cave');
  const start = performance.now(), saved = checkpoint(c), json = JSON.stringify(saved), serializationWallMs = performance.now() - start;
  // Read-only legal land-route sampling. Up to eight nearby actual qualified
  // actors per cave; an unsampled distant actor is not labelled unreachable.
  const access = { checked: 0, landReachable: 0, noLocalRoute: 0, noLocalQualifiedActor: 0 };
  for (const s of caves.filter(s=>hasContent(s,w))) {
    const actors = living.filter(e => e.level >= 3 && e.hp / e.maxHp > .55 && Math.hypot(e.x - s.x, e.y - s.y) <= 32)
      .sort((a, b) => Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y)||a.id-b.id).slice(0,8);
    if (!actors.length) { access.noLocalQualifiedActor++; continue; }
    access.checked++;
    if (actors.some(e => geographyModule.planTransitRoute(w, e, s, { mode: 'land', actor: e }).ok)) access.landReachable++;
    else access.noLocalRoute++;
  }
  return { year: w.day / TIME.daysPerYear, day: w.day, population: living.length,
    mortals: living.filter(e => !isPracticingHuman(e)).length, cultivators: living.filter(isPracticingHuman).length,
    cultivatorOrigins: distribution(living.filter(isPracticingHuman).map(e => e.birthOrigin?.kind || 'legacy')),
    realms: distribution(living.filter(isPracticingHuman).map(e => e.level)), villages: w.villages.filter(v => v.hp > 0).length,
    abandonedVillages: w.villages.filter(v => !(v.hp > 0)).length, sects: w.factions.length,
    sectSupply: w.factions.map(f => ({ id: f.id, resources: structuredClone(f.resources), ...f.economy })),
    sites: { total: w.sites.length, caves: caves.length, active: caves.filter(s=>hasContent(s,w)).length, dormant: caves.filter(s => !hasContent(s,w)).length,
      remaining: Object.fromEntries(Object.keys(content({})).map(k => [k, caves.filter(s => content(s,w)[k]).length])),
      resourceCharges: { dragonBone: caves.reduce((n,s)=>n+(s.dragonBoneCharges||0),0),
        phoenixFeather: caves.reduce((n,s)=>n+(s.phoenixFeatherCharges||0),0), godFragment: caves.reduce((n,s)=>n+(s.godFragmentCharges||0),0) },
      access, accessMethod: 'At checkpoints, up to eight actual qualified actors within 32 cells, native land route planner. No local route is not proof of global inaccessibility.' },
    profiles: profiles.length, histories: profiles.reduce((n,p)=>n+p.history.length,0),
    experienceRecords: profiles.reduce((n,p)=>n+(p.experienceLedger?.records.length||0),0),
    bonds: { total: profiles.reduce((n,p)=>n+p.bonds.length,0),
      active: profiles.reduce((n,p)=>n+p.bonds.filter(b=>!b.dormant&&(b.expiresDay==null||b.expiresDay>w.day)).length,0),
      dormant: profiles.reduce((n,p)=>n+p.bonds.filter(b=>b.dormant).length,0),
      expired: profiles.reduce((n,p)=>n+p.bonds.filter(b=>b.expiresDay!=null&&b.expiresDay<=w.day).length,0) },
    relations: distribution(living.flatMap(e=>Array.from(e.relations?.values?.()||[]).map(r=>r.type))),
    jobs: distribution((w.wanling?.jobs||[]).map(j=>`${j.path}:${j.intent||'native'}:${j.stage}:${j.reason||''}`)),
    physiques: distribution(profiles.map(p=>p.physique?.id)), bloodlines: distribution(profiles.flatMap(p=>p.bloodlines.map(b=>`${b.id}:${b.latent?'latent':'visible'}:${b.stable?'stable':'unstable'}`))),
    hexagrams: distribution(profiles.map(p=>p.hexagram?.id)), personality: distribution(profiles.flatMap(p=>p.personality.map(t=>t.id))),
    traits: distribution(profiles.flatMap(p=>p.traits.map(t=>t.id))), states: distribution(profiles.flatMap(p=>p.states.map(t=>t.id))),
    birthProfiles: profiles.filter(p=>p.dna?.parents?.length===2).length,
    opportunityStats: structuredClone(w.wanxiang?.opportunities||null), artifactLog: structuredClone(w.artifactLog),
    saveBytes: Buffer.byteLength(json), siteSaveBytes: Buffer.byteLength(JSON.stringify(saved.sites||[])),
    profileSaveBytes: Buffer.byteLength(JSON.stringify(saved.wanxiang?.profiles||[])), serializationWallMs,
    work: metricsModule.workMetricsSnapshot?.(w)||{} };
}
function observe(c, span, label) {
  metricsModule.enableWorkMetrics?.(c.world);
  const startDay=c.world.day,endDay=startDay+span*TIME.daysPerYear,initial=snapshot(c),snapshots=[initial];
  const facts={},events={},milestones={},choiceReasons={},birthOrigins={},cultivatorOrigins={},deathsByKind={};
  const seenFacts=new Set(),seenMilestones=new Set(),seenPeople=new Set(),seenCultivators=new Set(),seenSites=new Set(c.world.sites.map(s=>s.id));
  const observedTails=new WeakMap();
  let cultivatorDays=0,naturalCaves=0,deaths=0,deathAgeDays=0,births=0;
  const beforeRecord=c.world.record,beforeDeath=c.life.onDeath;
  function records(e,initial=false) {
    if(!isHumanPerson(e))return;
    if(!seenPeople.has(e.id)) {seenPeople.add(e.id);if(!initial){births++;const key=e.birthOrigin?.kind||'legacy';birthOrigins[key]=(birthOrigins[key]||0)+1;}}
    if(isPracticingHuman(e)&&!seenCultivators.has(e.id)){seenCultivators.add(e.id);if(!initial){const key=e.birthOrigin?.kind||'legacy';cultivatorOrigins[key]=(cultivatorOrigins[key]||0)+1;}}
    const ledger=e.wanxiang?.experienceLedger?.records||[],history=e.wanxiang?.history||[],previous=observedTails.get(e);
    if(!previous||previous.fact!==ledger.at(-1))for(const f of ledger){const key=`${e.id}:${f.id}`;if(seenFacts.has(key))continue;seenFacts.add(key);if(!initial)facts[f.type]=(facts[f.type]||0)+1;}
    if(!previous||previous.history!==history.at(-1))for(const f of history){const key=`${e.id}:${JSON.stringify(f)}`;if(seenMilestones.has(key))continue;seenMilestones.add(key);if(!initial){const type=f.type||f.kind||f.source||'other',name=typeof type==='object'?type.kind||'other':type;milestones[name]=(milestones[name]||0)+1;for(const reason of f.reasons||[])choiceReasons[reason]=(choiceReasons[reason]||0)+1;}}
    observedTails.set(e,{fact:ledger.at(-1),history:history.at(-1)});
  }
  for(const e of c.world.entities)records(e,true);
  c.world.record=function(text,type,...args){events[type]=(events[type]||0)+1;return beforeRecord.call(this,text,type,...args);};
  c.life.onDeath=function(e,...args){if(isHumanPerson(e)){deaths++;deathAgeDays+=Math.max(0,e.age||0);const kind=isPracticingHuman(e)?'cultivator':'mortal';const row=deathsByKind[kind]||={count:0,ageDays:0};row.count++;row.ageDays+=Math.max(0,e.age||0);records(e);}return beforeDeath.call(this,e,...args);};
  const started=performance.now(),cpuStarted=process.cpuUsage();
  while(c.world.day<endDay){
    const step=Math.min(3,endDay-c.world.day),before=people(c.world).filter(isPracticingHuman).length;
    advanceWorld(c.world,step,{life:c.life,state:c.state});
    const after=people(c.world).filter(isPracticingHuman).length;
    cultivatorDays+=(before+after)*.5*step;
    for(const e of c.world.entities)records(e);
    for(const s of c.world.sites)if(!seenSites.has(s.id)){seenSites.add(s.id);if(s.kind==='cave')naturalCaves++;}
    if((c.world.day-startDay)%(10*TIME.daysPerYear)===0||c.world.day===endDay){snapshots.push(snapshot(c));console.log(`${label} seed=${c.world.seed} year=${c.world.day/TIME.daysPerYear} cultivators=${after}`);}
  }
  c.world.record=beforeRecord;c.life.onDeath=beforeDeath;
  const cpu=process.cpuUsage(cpuStarted),cpuMs=(cpu.user+cpu.system)/1000,cultivatorYears=cultivatorDays/TIME.daysPerYear;
  for(const row of Object.values(deathsByKind))row.meanAgeYears=row.count?row.ageDays/row.count/TIME.daysPerYear:null;
  const data={...provenance,label,kind:'natural mortal-world observation',seed:c.world.seed,startDay,endDay,years:span,
    elapsedMs:performance.now()-started,cpuMs,cpuMsPerWorldYear:span?cpuMs/span:null,
    timingMethod:'Process CPU and wall time include observer sampling. Optional phase diagnostics report wall time, not exclusive CPU; life includes site work.',
    cultivatorYears,denominator:'Trapezoidal living-cultivator count every 3 world days.',
    births,birthOrigins,cultivatorOrigins,deaths,deathsByKind,meanObservedDeathAgeYears:deaths?deathAgeDays/deaths/TIME.daysPerYear:null,
    events,facts,milestones,choiceReasons,naturalCaves,uniquePeople:seenPeople.size,
    factsPer100CultivatorYears:Object.fromEntries(Object.entries(facts).map(([k,v])=>[k,cultivatorYears?v/cultivatorYears*100:0])),
    opportunityStatsBefore:initial.opportunityStats,opportunityStatsAfter:snapshots.at(-1).opportunityStats,snapshots};
  writeFileSync(path.join(out,`${c.world.seed}-${label}.json`),JSON.stringify(data,null,2));
  return data;
}
const results=[];
for(const [index,seed] of seeds.entries()){
  const w=createSandboxWorld(WORLD_PRESETS.small,seed,{terrainPreset:'standard'}),c=controller(w);
  c.life.processPendingSpawns();enableWanxiang(w,{fresh:true});
  const natural=observe(c,years,'natural'),saved=checkpoint(c);
  writeFileSync(path.join(out,`${seed}-${years}y-save.json`),JSON.stringify(saved));
  const mature=restore(saved),resumed=observe(mature,follow,'mature-resumed'),extensions=[];
  if(index===0&&long>years+follow){
    for(const target of [...new Set([200,400,long])].sort((a,b)=>a-b).filter(y=>y>years+follow&&y<=long)){
      extensions.push(observe(mature,target-mature.world.day/TIME.daysPerYear,`to-${target}y`));
      writeFileSync(path.join(out,`${seed}-${target}y-save.json`),JSON.stringify(checkpoint(mature)));
    }
  }
  results.push({seed,natural,resumed,extensions});
}
writeFileSync(path.join(out,'summary.json'),JSON.stringify({...provenance,seeds,years,follow,long,
  method:'Formal small-map genesis, native advanceWorld in 3-day steps, no injected actors/resources/outcomes. Mortal only. Real v11 checkpoint restores runtime RNG and clocks at 100 years; first seed extends that resumed world to 200/400 years. Native geography diagnostics are read-only.',results},null,2));
console.log(`WX-D natural profile written to ${out}`);
