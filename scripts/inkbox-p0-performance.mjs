#!/usr/bin/env node
// Finite paired player-experience capture. It observes product RAFs and wraps real calls;
// it never calls Sandbox.update, Render3DHost.update, or render from the probe.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { launch, findEdge } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.INKBOX_REPORT_DIR || path.join(ROOT, 'reports/local/p0-three/performance'));
const mode = process.argv.includes('--baseline') ? 'baseline' : (process.argv.includes('--candidate') ? 'candidate' : null);
const DEFAULT_URL = mode === 'candidate' ? 'http://127.0.0.1:4223/inkbox.html?renderer=3d' : 'http://127.0.0.1:4224/inkbox.html?renderer=3d';
const URL = process.env.INKBOX_URL || DEFAULT_URL;
const WIDTH = 1366, HEIGHT = 768, DPR = 1, RUNS = 2;
function boundedEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return value;
}
const FRAMES = boundedEnv('INKBOX_FRAMES', 180, 1, 1800);
const WARMUP = boundedEnv('INKBOX_WARMUP_FRAMES', 30, 0, 600);
const checking = process.argv.includes('--check');
const resume = process.argv.includes('--resume');
if (resume && mode !== 'baseline' && !checking) throw new Error('--resume is available only with --baseline.');
if (!mode && !checking) throw new Error('Specify --baseline or --candidate.');
const cases = [
  { id: 'forest-288x180', preset: 'medium', seed: 20261021, days: 180 },
  { id: 'expanse-512x320', preset: 'expanse', seed: 20261022, days: 30 },
  { id: 'dense-village-sect-people', scenario: 'DENSITY_A' },
  { id: 'realm-window-open', scenario: 'DENSITY_A', realm: true },
  { id: 'terrain-flood-edit', preset: 'medium', seed: 20261021, days: 180, edit: true },
];
const positiveSummary = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return { samples: sorted.length, p50: at(.5), p95: at(.95), max: sorted.at(-1) };
};

function setupBody(c, fixtureDoc = null) {
  const candidate = !!fixtureDoc;
  const expectedFixture = candidate ? fixtureDoc.fixture : null;
  return `
  const k=window.inkbox,r=k.render3d.renderer;
  k.setSpeed(0);
  const {mulberry32}=await import('./src/inkbox/core/noise.js');
  const save=await import('./src/inkbox/io/save.js');
  const recipe=${JSON.stringify(c)};
  const expected=${JSON.stringify(expectedFixture)};
  let editResponse=null;
  const makeRecipeWorld=async()=>{
    if(recipe.scenario){const v=await import('./src/inkbox/render3d/art/VisualScenarios.js');v.applyScenario(k,recipe.scenario);}
    else {const {createAdvanceState}=await import('./src/inkbox/sim/advance.js');k.rng=mulberry32(12345);k.advanceState=createAdvanceState();k.newWorld(recipe.preset,recipe.seed);k.speedIndex=0;for(let i=0;i<recipe.days;i++)k.advanceDays(1);}
  };
  const applyEdit=async()=>{
    let localWaterStatsFn=null,localWaterStatsImportError=null,waterEditStatsFn=null,waterEditStatsImportError=null;
    if(${candidate ? 'true' : 'false'}){
      try{const waterModule=await import('./src/inkbox/world/localWater.js');if(typeof waterModule.localWaterStats==='function')localWaterStatsFn=waterModule.localWaterStats;else localWaterStatsImportError='localWaterStats export unavailable';}catch(error){localWaterStatsImportError=String(error?.message||error);}
      try{const powers=await import('./src/inkbox/sim/powers.js');if(typeof powers.waterEditStats==='function')waterEditStatsFn=powers.waterEditStats;else waterEditStatsImportError='waterEditStats export unavailable';}catch(error){waterEditStatsImportError=String(error?.message||error);}
    }else{localWaterStatsImportError='unsupported on baseline build';waterEditStatsImportError='unsupported on baseline build';}
    const w=k.world,point={x:Math.floor(w.w*.52),y:Math.floor(w.h*.51)},ops=[];
    for(const tool of ['raise','flood']){
      k.selectTool(tool);const waterGestureBefore=waterEditStatsFn?waterEditStatsFn(w):null,started=performance.now();let result;
      try{result=k.applyTool(true,{point,radius:32});}
      finally{
        const elapsed=performance.now()-started,water=localWaterStatsFn?localWaterStatsFn(w):null,gesture=waterEditStatsFn?waterEditStatsFn(w):null;
        const gestureRecorded=!!gesture&&Object.keys(gesture).length>0;
        ops.push({tool,applyToolMs:elapsed,localWater:localWaterStatsFn?{status:'available',candidates:water.candidates??null,passes:water.passes??null,changed:water.changed??null,capped:water.capped??null,milliseconds:water.milliseconds??null,bounds:water.bounds??null}:{status:'unsupported',reason:localWaterStatsImportError||'localWaterStats export unavailable',candidates:null,passes:null,changed:null,capped:null,milliseconds:null,bounds:null},localWaterObserved:!!water&&(water.candidates>0||water.passes>0||water.changed>0),waterGesture:waterEditStatsFn?{status:gestureRecorded?'available':'no-record',windows:gesture.windows??null,candidates:gesture.candidates??null,relaxations:gesture.relaxations??null,affectedCells:gesture.affectedCells??null,capped:gesture.capped??null,milliseconds:gesture.milliseconds??null,changedSinceBefore:JSON.stringify(gesture)!==JSON.stringify(waterGestureBefore)}:{status:'unsupported',reason:waterEditStatsImportError||'waterEditStats export unavailable',windows:null,candidates:null,relaxations:null,affectedCells:null,capped:null,milliseconds:null}});
      }
    }
    k.selectTool('inspect');return ops;
  };  if(${candidate ? 'true' : 'false'} && recipe.edit){
    // Recreate the editable state through product simulation and apply the actual tools once.
    await makeRecipeWorld();const editOperations=await applyEdit();
    const editedPayload=save.serializeWorld(k.world);
    const editedHashBytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(editedPayload)));
    const editedHash=[...new Uint8Array(editedHashBytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
    editResponse={operations:editOperations,editedHash,baselineFixtureHash:expected.fixtureHash,sameAsBaselineFixture:editedHash===expected.fixtureHash,comparisonReason:editedHash===expected.fixtureHash?'The candidate edit payload matches the baseline fixture.':'The candidate terrain/water edit path may produce different physical state after the implementation change; this comparison is informational. Timed sampling reloads and strictly hash-checks the exact baseline fixture.'};
  }
  if(${candidate ? 'true' : 'false'}){
    const restored=save.deserializeWorld(${candidate ? JSON.stringify(fixtureDoc.payload) : 'null'});
    if(!restored||restored.w!==expected.mapSize[0]||restored.h!==expected.mapSize[1]||restored.seed!==expected.seed||restored.day!==expected.day)throw new Error('Baseline fixture dimensions/seed/day do not match its metadata');
    const stored=await save.saveToStorage(restored,'p0-performance-fixture');if(!stored.ok)throw new Error('Could not stage saved fixture: '+stored.error);
    const select=document.getElementById('inkSlotSelect');if(select&&!Array.from(select.options).some(o=>o.value==='p0-performance-fixture'))select.add(new Option('P0 performance fixture','p0-performance-fixture'));
    if(select){select.value='p0-performance-fixture';select.dispatchEvent(new Event('change',{bubbles:true}));}
    const previousWorld=k.world;document.getElementById('inkBtnLoad')?.click();
    // Loading a new-world fixture correctly goes through the product's discard
    // guard. Confirm that existing dialog; never replace Sandbox.world here.
    const confirmation=document.getElementById('inkConfirm');
    if(confirmation&&!confirmation.hidden)document.getElementById('inkConfirmOk')?.click();
    for(let i=0;i<180;i++){await new Promise(requestAnimationFrame);if(k.world!==previousWorld&&k.world.seed===restored.seed&&k.world.day===restored.day&&k.world.w===restored.w&&k.world.h===restored.h)break;}
    if(k.world===previousWorld||k.world.seed!==restored.seed||k.world.day!==restored.day||k.world.w!==restored.w||k.world.h!==restored.h)throw new Error('Product saved-world load did not restore baseline fixture: '+JSON.stringify({sameWorld:k.world===previousWorld,actual:[k.world.seed,k.world.day,k.world.w,k.world.h],expected:[restored.seed,restored.day,restored.w,restored.h],slot:select?.value,disabled:document.getElementById('inkBtnLoad')?.disabled,toast:k.toast,confirmOpen:!document.getElementById('inkConfirm')?.hidden}));
  }else{
    await makeRecipeWorld();
    if(recipe.edit)editResponse=await applyEdit();
  }
  if(recipe.realm){k.selectTool('viewUpper');const w=k.world;k.selection={path:[[w.w*.25,w.h*.25],[w.w*.75,w.h*.25],[w.w*.75,w.h*.75],[w.w*.25,w.h*.75]],x0:w.w*.25,y0:w.h*.25,x1:w.w*.75,y1:w.h*.75,area:w.w*w.h*.25};r.setRealmViewState(k.getRealmViewState());}
  k.setSpeed(0);k.dirty=true;
  const payload=save.serializeWorld(k.world),serialized=JSON.stringify(payload),hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized));
  const fixtureHash=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(expected&&fixtureHash!==expected.fixtureHash)throw new Error('Candidate did not restore the exact baseline fixture payload hash');
  const roundTrip=save.deserializeWorld(JSON.parse(serialized));
  if(JSON.stringify(save.serializeWorld(roundTrip))!==JSON.stringify(save.serializeWorld(k.world)))throw new Error('product save roundtrip mismatch');
  window.__p0Fixture={payload,fixtureHash,recipe};
  let adopted=false;for(let i=0;i<180;i++){await new Promise(requestAnimationFrame);if(r.world===k.world&&r.stages.get('mortal')?.world===k.world){adopted=true;break;}}
  if(!adopted)throw new Error('Render3D did not adopt scenario world');
  await r.characterLoadPromise;if(r.characterLoadError)throw r.characterLoadError;
  const visual=await import('./src/inkbox/render3d/art/VisualScenarios.js');
  const camera=visual.applyCamera(r,'WORLD_OVERVIEW');for(let i=0;i<5;i++)await new Promise(requestAnimationFrame);
  return {payload,fixtureHash,mapSize:[k.world.w,k.world.h],seed:k.world.seed,day:k.world.day,camera,counts:{entities:k.world.entities.length,villages:k.world.villages.length,factions:k.world.factions.length,houses:k.world.villages.reduce((n,v)=>n+(v.houses?.length||0),0)},roundTrip:true,editResponse};
`;
}

function sampleBody(label, frames) { return `
  const k=window.inkbox,r=k.render3d.renderer,gl=r.gpu.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const positiveSummary=values=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),at=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];return {samples:sorted.length,p50:at(.5),p95:at(.95),max:sorted.at(-1)}};
  const state={raf:[],update:[],render:[],simUpdate:[],simAdvance:[],lifeStep:[],territoryRevChanges:0,pending:[],gpu:[],gpuInvalid:0,gpuSkipped:0,armed:false,longTasks:[],longTaskSupported:false,profile:{bridgeScanMs:[],terrainUpdateMs:[],waterUpdateMs:[],vegetationUpdateMs:[],entityUpdateMs:[],settlementUpdateMs:[],markerUpdateMs:[]},lineBuildMs:[],vegetationUpdateMs:[],calls:[]};
  let longTaskObserver=null;try{longTaskObserver=new PerformanceObserver(list=>{if(state.armed)for(const e of list.getEntries())state.longTasks.push(e.duration)});longTaskObserver.observe({type:'longtask',buffered:true});state.longTaskSupported=true}catch{longTaskObserver?.disconnect();longTaskObserver=null}
  const undo=[];const wrap=(obj,key,bucket)=>{if(typeof obj?.[key]!=='function')return;const original=obj[key];obj[key]=function(...args){const started=performance.now();try{return original.apply(this,args)}finally{if(state.armed)state[bucket].push(performance.now()-started)}};undo.push(()=>obj[key]=original);};
  const originalRender=r.render;wrap(r,'update','update');wrap(r,'render','render');wrap(k,'update','simUpdate');wrap(k,'advanceDays','simAdvance');
  if(k.life&&typeof k.life.step==='function'){const original=k.life.step;k.life.step=function(...args){const before=k.world?.terrRev,started=performance.now();try{return original.apply(this,args)}finally{if(state.armed){state.lifeStep.push(performance.now()-started);if(k.world?.terrRev!==before)state.territoryRevChanges++;}}};undo.push(()=>k.life.step=original);}
  for(const stage of r.stages.values()){wrap(stage.terrainLines,'advanceBuild','lineBuildMs');wrap(stage.vegetation,'update','vegetationUpdateMs');}
  let previous=null;
  const poll=()=>{if(!timer)return;const disjoint=gl.getParameter(timer.GPU_DISJOINT_EXT);for(let i=state.pending.length-1;i>=0;i--){const q=state.pending[i];if(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))continue;const ns=gl.getQueryParameter(q,gl.QUERY_RESULT);if(disjoint)state.gpuInvalid++;else state.gpu.push(ns/1e6);gl.deleteQuery(q);state.pending.splice(i,1);}};
  const measuredRender=r.render;r.render=function(...args){poll();let q=null,active=false;if(state.armed&&timer){if(state.pending.length<8){q=gl.createQuery();try{gl.beginQuery(timer.TIME_ELAPSED_EXT,q);active=true}catch{if(q)gl.deleteQuery(q);q=null;}}else state.gpuSkipped++;}try{const out=measuredRender.apply(this,args);if(active){gl.endQuery(timer.TIME_ELAPSED_EXT);state.pending.push(q);q=null;}return out;}catch(e){if(active)try{gl.endQuery(timer.TIME_ELAPSED_EXT)}catch{}if(q)try{gl.deleteQuery(q)}catch{}throw e;}};
  try{
    for(let i=0;i<${WARMUP};i++)await new Promise(requestAnimationFrame);
    state.armed=true;previous=null;
    await new Promise(resolve=>{let n=0;const tick=t=>{if(!state.armed)return;if(previous!==null)state.raf.push(t-previous);previous=t;for(const key of Object.keys(state.profile)){const value=Number(r.profile?.[key]);if(Number.isFinite(value))state.profile[key].push(value);}if(n++>=${frames})resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);});
    state.armed=false;for(let i=0;i<120&&state.pending.length;i++){await new Promise(requestAnimationFrame);poll();}
    const memory={...r.gpu.info.memory},render={...r.gpu.info.render};
    return {label:${JSON.stringify(label)},rafIntervalMs:positiveSummary(state.raf),rafOver50msCount:state.raf.filter(ms=>ms>50).length,loopUpdateMs:positiveSummary(state.update),loopRenderMs:positiveSummary(state.render),simMainLoopUpdateMs:positiveSummary(state.simUpdate),simAdvanceDaysMs:positiveSummary(state.simAdvance),lifeStepMs:positiveSummary(state.lifeStep),territoryRevChangedCalls:state.territoryRevChanges,longTasks:{supported:state.longTaskSupported,count:state.longTasks.length,durationMs:positiveSummary(state.longTasks)},drawCalls:render.calls,triangles:render.triangles,geometries:memory.geometries,textures:memory.textures,gpuTimer:{available:!!timer,validSamples:state.gpu.length,invalidSamples:state.gpuInvalid,skippedSamples:state.gpuSkipped,renderMs:positiveSummary(state.gpu)},detailed:{territoryMs:null,bridgeScanMs:positiveSummary(state.profile.bridgeScanMs),terrainUpdateMs:positiveSummary(state.profile.terrainUpdateMs),waterUpdateMs:positiveSummary(state.profile.waterUpdateMs),vegetationUpdateMs:positiveSummary(state.profile.vegetationUpdateMs),entityUpdateMs:positiveSummary(state.profile.entityUpdateMs),settlementUpdateMs:positiveSummary(state.profile.settlementUpdateMs),markerUpdateMs:positiveSummary(state.profile.markerUpdateMs),lineBuildSliceMs:positiveSummary(state.lineBuildMs),vegetationUpdateCallMs:positiveSummary(state.vegetationUpdateMs),territoryTimingNote:'Life.step is measured as a whole, and terrRev changes are counted as evidence the territory revision advanced. stepTerritory is private and has no independent timing hook, so territoryMs is null.'}};
  }finally{state.armed=false;for(const q of state.pending)try{gl.deleteQuery(q)}catch{};r.render=measuredRender;for(const fn of undo)fn();longTaskObserver?.disconnect();}
`; }

if (checking) {
  for (const c of cases) {
    new vm.Script(`(()=>{return (async()=>{${setupBody(c)}})()})()`);
    const sample = sampleBody(c.id, FRAMES);
    new vm.Script(`(()=>{return (async()=>{${sample}})()})()`);
    if (!sample.includes('territoryMs:null') || !sample.includes('stepTerritory is private and has no independent timing hook')) throw new Error('Check mode requires explicit territory timing limitation.');
  }
  console.log(`P0 benchmark scripts compile only (frames=${FRAMES}, warmup=${WARMUP}); territoryMs=null because stepTerritory has no isolated timing hook.`);
  process.exit(0);
}
if (mode === 'candidate' && !process.env.INKBOX_CANDIDATE_AUTHORIZED) throw new Error('Candidate mode is authorized for this task; set INKBOX_CANDIDATE_AUTHORIZED=1 to acknowledge before running.');
const report = { schema: 'inkbox-p0-real-gpu-paired-v2', mode, url: URL, startedAt: new Date().toISOString(), method: { viewport: [WIDTH, HEIGHT], dpr: DPR, framesPerPhase: FRAMES, repeats: RUNS, warmupFrames: WARMUP, maxFrames: 1800, maxWarmupFrames: 600, phases: ['paused', 'normal-speed'], sample: 'Product-owned RAF runs normally; instrumentation observes RAF intervals and wraps existing calls, forwarding each once.', fixtures: 'Candidate reads baseline fixture payloads and verifies payload hash, map size, seed, and day before timing.', immediateEdit: 'Candidate terrain/flood response records operation costs and whether the edited payload hash matches baseline; mismatch is informational because edited physics may differ. Steady-state sampling reloads and strictly hash-checks the exact baseline fixture.', rngEquivalence: 'The serialized starting fixture/hash is strictly identical between baseline and candidate. The runtime RNG cursor is not persisted in old saves, so normal-speed x2 random advancement and per-frame work are not guaranteed equivalent.', territory: 'Life.step duration and terrRev changes are reported; territoryMs remains null because stepTerritory is private and has no isolated timing hook.' }, cases: [] };
let resumeStart = 0, resumeEnvironment = null;
if (resume) {
  const partialPath = path.join(OUT, 'baseline.partial.json');
  if (!fs.existsSync(partialPath)) throw new Error(`Cannot resume: missing partial report ${partialPath}`);
  const partial = JSON.parse(fs.readFileSync(partialPath, 'utf8'));
  const sameMethod = partial.method?.viewport?.join('x') === `${WIDTH}x${HEIGHT}` && partial.method?.dpr === DPR && partial.method?.framesPerPhase === FRAMES && partial.method?.warmupFrames === WARMUP && partial.method?.repeats === RUNS;
  if (partial.schema !== 'inkbox-p0-real-gpu-paired-v2' || partial.mode !== 'baseline' || partial.url !== URL || !sameMethod) throw new Error('Cannot resume: partial report mode, URL, viewport, DPR, frame count, warmup, or repeat count differs from this run');
  if (!partial.environment || !Array.isArray(partial.cases)) throw new Error('Cannot resume: partial report lacks environment or completed case data');
  const hasPhaseSample = phase => !!phase && Object.hasOwn(phase, 'rafIntervalMs');
  const isComplete = (entry, index) => entry?.id === cases[index]?.id && Array.isArray(entry.repeats) && entry.repeats.length === RUNS && entry.repeats.every((repeat, run) => repeat.repeat === run + 1 && hasPhaseSample(repeat.phases?.paused) && hasPhaseSample(repeat.phases?.['normal-speed']));
  let firstIncomplete = partial.cases.findIndex((entry, index) => !isComplete(entry, index));
  if (firstIncomplete < 0) firstIncomplete = partial.cases.length;
  if (partial.cases.length > cases.length || (firstIncomplete < partial.cases.length - 1)) throw new Error('Cannot resume: completed cases must be an ordered prefix; a failed or incomplete case may only be last');
  resumeStart = firstIncomplete;
  report.startedAt = partial.startedAt || report.startedAt;
  report.environment = partial.environment;
  report.cases = partial.cases.slice(0, resumeStart);
  report.resumedAt = new Date().toISOString();
  report.resume = { preservedCompletedCases: resumeStart, nextCase: cases[resumeStart]?.id || null, partialPath: path.relative(OUT, partialPath).replaceAll('\\', '/') };
  resumeEnvironment = partial.environment;
}
let browser;
const page = body => { new vm.Script(`(()=>{return (async()=>{${body}})()})()`, { filename: 'inkbox-p0-performance-inline.js' }); return browser.js(`return (async()=>{${body}})()`); };
const waitFrames = count => page(`for(let i=0;i<${count};i++)await new Promise(requestAnimationFrame);return true;`);
try {
  browser = await launch({ url: URL, browser: findEdge(), width: WIDTH, height: HEIGHT, gpu: true, headless: true, timeoutMs: 30000 });
  await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: DPR, mobile: false });
  if (!await browser.waitFor('return !!window.inkbox?.render3d?.renderer', { timeoutMs: 60000 })) throw new Error('Render3D did not boot: ' + browser.errors().join(' | '));
  const menuClosed = await page(`const root=document.getElementById('inkCreationMenu');root?.querySelector('[data-action="continue"]')?.click();return !!root?.hidden;`);
  if (!menuClosed) throw new Error('Product creation menu did not close through its Continue action');
  await waitFrames(3);
  report.environment = await page(`const r=window.inkbox.render3d.renderer,g=r.gpu.getContext(),d=g.getExtension('WEBGL_debug_renderer_info');return {browser:navigator.userAgent,gpu:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),vendor:d?g.getParameter(d.UNMASKED_VENDOR_WEBGL):null,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,rendererSize:[r.width,r.height],canvas:[r.canvas.width,r.canvas.height],gpuTimerAvailable:!!g.getExtension('EXT_disjoint_timer_query_webgl2')};`);
  report.environment.menuClosed = menuClosed;
  if (report.environment.viewport.join('x') !== `${WIDTH}x${HEIGHT}`) throw new Error('Viewport mismatch');
  if (resumeEnvironment) {
    const hardwareKeys=['browser','gpu','vendor','viewport','dpr','rendererSize','canvas','gpuTimerAvailable'];
    const fingerprint=env=>JSON.stringify(Object.fromEntries(hardwareKeys.map(key=>[key,env?.[key]])));
    if(fingerprint(report.environment)!==fingerprint(resumeEnvironment))throw new Error('Cannot resume: browser/GPU environment differs from partial report');
  }  let baselineReport = null;
  if (mode === 'candidate') {
    const baselinePath = path.join(OUT, 'baseline.json');
    if (!fs.existsSync(baselinePath)) throw new Error(`Missing baseline report: ${baselinePath}`);
    baselineReport = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    report.baseline = { path: path.relative(ROOT, baselinePath).replaceAll('\\', '/'), schema: baselineReport.schema, url: baselineReport.url, config: baselineReport.method, measurementConfigMatches: baselineReport.method?.viewport?.join('x') === `${WIDTH}x${HEIGHT}` && baselineReport.method?.dpr === DPR && baselineReport.method?.framesPerPhase === FRAMES && baselineReport.method?.warmupFrames === WARMUP && baselineReport.method?.repeats === RUNS };
  }
  for (const c of cases.slice(resumeStart)) {
    const entry = { id: c.id, repeats: [] };
    let expectedFixtureHash = null;
    for (let repeat = 0; repeat < RUNS; repeat++) {
      let fixtureDoc = null;
      if (mode === 'candidate') {
        const fixturePath = path.join(OUT, 'fixtures', `${c.id}.json`);
        if (!fs.existsSync(fixturePath)) throw new Error(`Missing baseline fixture: ${fixturePath}`);
        fixtureDoc = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        if (fixtureDoc.schema !== 'inkbox-p0-fixture-v1' || fixtureDoc.id !== c.id || !fixtureDoc.payload || !fixtureDoc.fixture?.fixtureHash) throw new Error(`Invalid baseline fixture document: ${fixturePath}`);
      }
      const fixture = await page(setupBody(c, fixtureDoc));
      const { payload, ...fixtureInfo } = fixture;
      entry.fixture = fixtureInfo;
      if (fixtureDoc) {
        if (fixture.fixtureHash !== fixtureDoc.fixture.fixtureHash) throw new Error(`${c.id} sameFixture hash mismatch`);
        if (fixture.mapSize.join('x') !== fixtureDoc.fixture.mapSize.join('x') || fixture.seed !== fixtureDoc.fixture.seed || fixture.day !== fixtureDoc.fixture.day) throw new Error(`${c.id} sameFixture metadata mismatch`);
        if (expectedFixtureHash && fixture.fixtureHash !== expectedFixtureHash) throw new Error(`${c.id} repeat fixture hash mismatch`);
        expectedFixtureHash = fixture.fixtureHash;
      } else if (expectedFixtureHash && fixture.fixtureHash !== expectedFixtureHash) throw new Error(`${c.id} repeat fixture hash mismatch`);
      if (mode === 'baseline') {
        const fixturePath = path.join(OUT, 'fixtures', `${c.id}.json`);
        fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
        fs.writeFileSync(fixturePath, JSON.stringify({ schema: 'inkbox-p0-fixture-v1', id: c.id, fixture: fixtureInfo, payload }, null, 2));
      }
      const screenshot = path.join(OUT, mode, c.id, `run-${repeat + 1}.png`); await browser.screenshot(screenshot);
      const phases = {};
      for (const [phase, speed] of [['paused', 0], ['normal-speed', 2]]) {
        await page(`window.inkbox.setSpeed(${speed});return true;`); await waitFrames(WARMUP);
        phases[phase] = await page(sampleBody(`${c.id}/${repeat + 1}/${phase}`, FRAMES));
      }
      entry.repeats.push({ repeat: repeat + 1, phases, screenshot: path.relative(OUT, screenshot).replaceAll('\\', '/') });
    }
    report.cases.push(entry); fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, mode === 'baseline' ? 'baseline.partial.json' : 'candidate.partial.json'), JSON.stringify(report, null, 2));
  }
  report.pass = true;
} catch (error) { report.failure = error.stack || String(error); process.exitCode = 1; console.error(report.failure); }
finally {
  report.finishedAt = new Date().toISOString(); fs.mkdirSync(OUT, { recursive: true });
  if (mode) fs.writeFileSync(path.join(OUT, mode === 'baseline' ? 'baseline.json' : 'candidate.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  console.log(`P0 ${mode || 'check'} ${report.pass ? 'complete' : report.failure ? 'failed' : 'incomplete'}${mode ? `: ${path.join(OUT, mode === 'baseline' ? 'baseline.json' : 'candidate.json')}` : ''}`);
}
















