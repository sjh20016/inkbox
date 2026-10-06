// Read-only natural recipes and target discovery shared by the C2C browser and soak gates.
// No world coordinates or simulation facts are edited here; target POIs are selected
// from the seeded World produced by the existing VisualScenarios recipes.
import { VISUAL_SCENARIOS, applyScenario, applyScenarioAsync } from '../src/inkbox/render3d/art/VisualScenarios.js';
import { WORLD_PRESETS } from '../src/inkbox/core/config.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { createAdvanceState } from '../src/inkbox/sim/advance.js';
import { Life } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { greetOnBoot } from '../src/inkbox/sim/busanzi.js';
import { advanceWorld } from '../src/inkbox/sim/advance.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld, recomputeUpperQi } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';

export const C2C_RECIPES = Object.freeze([
  Object.freeze({ key: 'mortal', scenario: null, preset: 'small', seed: 226, totalDays: 72000, stepDays: 3,
    siteCoverageStartDay: 72000, coverageCheckDays: 30,
    intent: 'natural four Site kinds, leyline and mixed settlement search; fixed RNG and ordinary advanceDays' }),
  Object.freeze({ key: 'realms', scenario: 'NETHER_STYLE_A', extraDays: 0,
    intent: 'natural Upper/Nether field, ghosts, decay deltas and rifts' }),
]);
const require = (condition, message) => { if (!condition) throw new Error(message); };

export function createScenarioSandbox() {
  return {
    rng: mulberry32(12345), advanceState: createAdvanceState(), selection: null, toolId: 'raise', speedIndex: 0,
    newWorld(presetKey, seed) {
      const preset = WORLD_PRESETS[presetKey] || WORLD_PRESETS.medium;
      this.world = generateWorld({ preset, seed: seed >>> 0, scatter: true });
      this.life = new Life(this.world, mulberry32(this.world.seed ^ 0xa5a5a5a5));
      this.world.upper = generateUpperWorld({ preset, seed: this.world.seed });
      recomputeUpperQi(this.world.upper);
      this.upperLife = new UpperLife(this.world.upper);
      this.world.nether = generateNetherWorld({ preset, seed: this.world.seed });
      greetOnBoot(this.world, this.rng);
    },
    advanceDays(days) {
      return advanceWorld(this.world, days, {
        life: this.life, upperLife: this.upperLife, rng: this.rng,
        state: this.advanceState, riftActive: false,
      });
    },
  };
}

export async function applyNaturalScenario(sandbox, name, { netherChunkSteps = 300, extraDays = 0, extraStepDays = 1, onChunk = null } = {}) {
  require(VISUAL_SCENARIOS[name], `unknown VisualScenarios recipe ${name}`);
  if (name !== 'NETHER_STYLE_A') {
    const recipe = applyScenario(sandbox, name);
    for (let day = 0; day < extraDays; day += extraStepDays) {
      sandbox.advanceDays(Math.min(extraStepDays, extraDays - day));
      const completed = day + Math.min(extraStepDays, extraDays - day);
      if (completed % 120 === 0 || completed === extraDays) {
        if (onChunk) await onChunk({ completedDays: completed, totalDays: extraDays, worldDay: sandbox.world.day });
        else if (typeof requestAnimationFrame === 'function') await new Promise(requestAnimationFrame);
      }
    }
    return { ...recipe, extraDays, worldDay: sandbox.world.day };
  }
  const totalSteps = VISUAL_SCENARIOS.NETHER_STYLE_A.days / VISUAL_SCENARIOS.NETHER_STYLE_A.stepDays;
  // First establish the actual day-zero recipe, then each chunk follows the
  // same deterministic recipe from step zero and ordinary advanceDays calls.
  await applyScenarioAsync(sandbox, name, { startStep: 0, stepCount: 0 });
  let previous = sandbox.world.nether.veg.slice(), previousDay = sandbox.world.day, recipeInfo = null, bestHistory = null;
  const deltas = [];
  for (let startStep = 0; startStep < totalSteps; startStep += netherChunkSteps) {
    recipeInfo = await applyScenarioAsync(sandbox, name, {
      startStep, stepCount: Math.min(netherChunkSteps, totalSteps - startStep),
    });
    const current = sandbox.world.nether.veg.slice();
    const diff = diffNetherVeg({ nether: { ...sandbox.world.nether, veg: previous } }, sandbox.world);
    deltas.push(diff);
    if (diff.trace && diff.trace.delta > (bestHistory?.trace?.delta || 0)) {
      const toBytes = values => Uint8Array.from(values, value => Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 255));
      bestHistory = { plane: 'nether', key: 'veg', width: sandbox.world.nether.w, height: sandbox.world.nether.h,
        fromDay: previousDay, toDay: sandbox.world.day, trace: diff.trace,
        beforeBytes: toBytes(previous), afterBytes: toBytes(current),
        encoding: 'R8 quantization matching ScalarFieldTexture; read-only copies of real pre/post 900-day chunk fields' };
    }
    previous = sandbox.world.nether.veg.slice();
    previousDay = sandbox.world.day;
    if (onChunk) await onChunk({ completedSteps: Math.min(totalSteps, startStep + netherChunkSteps), totalSteps, worldDay: sandbox.world.day });
  }
  deltas.sort((a, b) => (b.trace?.delta || 0) - (a.trace?.delta || 0));
  sandbox.decayDeltaFieldHistory = bestHistory;
  return { ...recipeInfo, decayDeltaEvidence: deltas[0] || null,
    decayDeltaHistory: bestHistory ? { plane: bestHistory.plane, key: bestHistory.key, width: bestHistory.width, height: bestHistory.height,
      fromDay: bestHistory.fromDay, toDay: bestHistory.toDay, trace: bestHistory.trace,
      encoding: bestHistory.encoding, byteLength: bestHistory.beforeBytes.byteLength } : null,
    decayDeltaCheckpoints: deltas.length, decayDeltaSource: 'read-only nether.veg snapshots at 900-day ordinary-simulation chunks' };
}

export async function applyC2CRecipe(sandbox, recipe, { onChunk = null } = {}) {
  if (recipe.scenario) return applyNaturalScenario(sandbox, recipe.scenario, { ...recipe, onChunk });
  require(recipe.preset && Number.isInteger(recipe.seed) && Number.isInteger(recipe.totalDays)
    && Number.isInteger(recipe.stepDays) && recipe.stepDays > 0, `invalid fixed natural recipe ${recipe.key}`);
  sandbox.rng = mulberry32(12345);
  sandbox.advanceState = createAdvanceState();
  sandbox.newWorld(recipe.preset, recipe.seed);
  sandbox.speedIndex = 0;
  const firstSiteDays = {}, firstKinds = new Set();
  let fullSiteCoverageDay = null;
  for (let day = 0; day < recipe.totalDays; day += recipe.stepDays) {
    const days = Math.min(recipe.stepDays, recipe.totalDays - day);
    sandbox.advanceDays(days);
    const completedDays = day + days;
    if (completedDays % recipe.coverageCheckDays === 0) {
      for (const site of sandbox.world.sites || []) if (!firstKinds.has(site.kind)) {
        firstKinds.add(site.kind);
        firstSiteDays[site.kind] = { day: sandbox.world.day, id: site.id, x: site.x, y: site.y };
      }
      const currentKinds = new Set((sandbox.world.sites || []).map(site => site.kind));
      if (sandbox.world.day >= recipe.siteCoverageStartDay
        && ['secret', 'cave', 'formation', 'ruin'].every(kind => currentKinds.has(kind))) {
        fullSiteCoverageDay = sandbox.world.day;
        break;
      }
    }
    if (onChunk && (completedDays % 900 === 0 || completedDays === recipe.totalDays))
      await onChunk({ completedDays, totalDays: recipe.totalDays, worldDay: sandbox.world.day });
    else if (!onChunk && (completedDays % 900 === 0 || completedDays === recipe.totalDays)
      && typeof requestAnimationFrame === 'function') await new Promise(requestAnimationFrame);
  }
  return { scenario: 'fixed-natural-seed', key: recipe.key, preset: recipe.preset, seed: recipe.seed,
    requestedDays: recipe.totalDays, actualDays: sandbox.world.day, stepDays: recipe.stepDays, worldDay: sandbox.world.day,
    firstSiteDays, firstKindsSeen: [...firstKinds], fullSiteCoverageDay,
    simultaneousSiteKinds: [...new Set((sandbox.world.sites || []).map(site => site.kind))],
    fullCoverageSiteIds: fullSiteCoverageDay == null ? null : Object.fromEntries(
      ['secret', 'cave', 'formation', 'ruin'].map(kind => [kind, (sandbox.world.sites || []).filter(site => site.kind === kind).map(site => site.id)])),
    rngRecipe: { sandbox: 'mulberry32(12345) before newWorld', life: 'world seed ^ 0xa5a5a5a5', advanceState: 'fresh' } };
}

function numericField(world, key) {
  const value = world?.[key];
  if (ArrayBuffer.isView(value) && value.length === world.size) return value;
  return null;
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return null;
  return sortedValues[Math.min(sortedValues.length - 1, Math.floor(q * (sortedValues.length - 1)))];
}

function fieldTargets(world, plane, key) {
  const field = numericField(world, key);
  if (!field?.length) return null;
  const sorted = Array.from(field).filter(Number.isFinite).sort((a, b) => a - b);
  const selected = q => {
    const value = quantile(sorted, q);
    let index = -1, best = Infinity;
    for (let i = 0; i < field.length; i++) {
      const score = Math.abs(field[i] - value);
      if (score < best) { best = score; index = i; }
    }
    return { x: index % world.w, y: Math.floor(index / world.w), index, value, quantile: q, plane, field: key };
  };
  const terrain = numericField(world, 'height');
  let matchedHeight = null;
  if (terrain?.length === field.length) {
    const heights = Array.from(terrain).filter(Number.isFinite).sort((a, b) => a - b);
    const lo = quantile(heights, .4), hi = quantile(heights, .6);
    const candidates = [];
    for (let i = 0; i < field.length; i++) if (Number.isFinite(field[i]) && terrain[i] >= lo && terrain[i] <= hi)
      candidates.push({ i, value: field[i], height: terrain[i] });
    if (candidates.length) {
      const choose = direction => {
        const row = candidates.reduce((best, item) => !best || (direction === 'low' ? item.value < best.value : item.value > best.value) ? item : best, null);
        return { x: row.i % world.w, y: Math.floor(row.i / world.w), index: row.i, value: row.value,
          terrainHeight: row.height, plane, field: key, terrainHeightQuantileBand: [.4, .6] };
      };
      matchedHeight = { low: choose('low'), high: choose('high'), candidateCells: candidates.length,
        terrainHeightRange: [lo, hi], method: 'field extrema within the same actual terrain-height quantile band' };
    }
  }
  return { min: selected(0), low: selected(.15), median: selected(.5), high: selected(.85), max: selected(1),
    matchedHeight, range: [sorted[0], sorted.at(-1)], unique: new Set(field).size };
}

function densityNear(entities, poi, radius = 12) {
  let count = 0;
  for (const entity of entities || []) if (Number.isFinite(entity.x) && Number.isFinite(entity.y)
    && Math.hypot(entity.x - poi.x, entity.y - poi.y) <= radius) count++;
  return count;
}

function siteTargets(world) {
  const sites = Array.isArray(world?.sites) ? world.sites : [];
  const result = Object.fromEntries(['secret', 'cave', 'formation', 'ruin'].map(kind => {
    const site = sites.find(row => row.kind === kind);
    return [kind, site ? { id: site.id, kind: site.kind, x: site.x, y: site.y, source: 'world.sites' } : null];
  }));
  const villages = world?.villages || [];
  let mixed = null;
  for (const site of sites) for (const village of villages) {
    const distance = Math.hypot(site.x - village.x, site.y - village.y);
    if (!mixed || distance < mixed.distance) mixed = { siteId: site.id, siteKind: site.kind, siteX: site.x, siteY: site.y,
      villageId: village.id, villageX: village.x, villageY: village.y, houses: village.houses?.length || 0, distance };
  }
  return { counts: Object.fromEntries(['secret', 'cave', 'formation', 'ruin'].map(kind => [kind, sites.filter(site => site.kind === kind).length])),
    byKind: result, mixedVillageSite: mixed };
}

export function deriveC2CTargets(world) {
  const sites = siteTargets(world);
  const leylines = Array.isArray(world?.leylines) ? world.leylines : [];
  const leyline = leylines.slice().sort((a, b) => (b.strength || 0) - (a.strength || 0))[0] || null;
  const upperQi = fieldTargets(world?.upper, 'upper', 'qi');
  const netherYin = fieldTargets(world?.nether, 'nether', 'veg');
  const ghosts = (world?.nether?.entities || []).filter(row => row.soulKind === 'ghost' || row.soulKind === 'ghostCultivator');
  const highVeg = netherYin?.high || null;
  return {
    sites,
    leyline: leyline ? { id: leyline.id, x: leyline.x, y: leyline.y, strength: leyline.strength, source: 'world.leylines' } : null,
    fields: { upperQi, netherYin },
    ghostCluster: ghosts.length ? ghosts.slice().sort((a, b) => densityNear(ghosts, b) - densityNear(ghosts, a))[0] : null,
    highVegGhostDensity: highVeg ? densityNear(ghosts, highVeg) : null,
    rifts: (world?.rifts || []).filter(rift => rift.closedDay === -1).map(rift => ({ id: rift.id, x: rift.x, y: rift.y,
      targetPlane: rift.targetPlane, age: rift.age, radius: rift.radius, strength: rift.strength })),
    coverage: { sites: sites.counts, leylines: leylines.length, upperQi: !!upperQi, netherYin: !!netherYin,
      ghostCount: ghosts.length, activeRifts: (world?.rifts || []).filter(rift => rift.closedDay === -1).length },
  };
}

export function diffNetherVeg(before, after) {
  const left = numericField(before?.nether, 'veg'), right = numericField(after?.nether, 'veg');
  if (!left || !right || left.length !== right.length) return { available: false, reason: 'matching nether.veg typed arrays unavailable' };
  const candidates = [];
  let maxDelta = 0, changedCells = 0, totalPositiveDelta = 0;
  for (let i = 0; i < left.length; i++) {
    const delta = right[i] - left[i];
    if (Math.abs(delta) > 1e-7) changedCells++;
    if (delta > 0) {
      totalPositiveDelta += delta;
      if (delta > maxDelta) maxDelta = delta;
      if (delta >= .03) candidates.push({ index: i, x: i % after.nether.w, y: Math.floor(i / after.nether.w), before: left[i], after: right[i], delta });
    }
  }
  candidates.sort((a, b) => b.delta - a.delta);
  const trace = candidates[0] || null;
  const ghosts = (after.nether.entities || []).filter(row => row.soulKind === 'ghost' || row.soulKind === 'ghostCultivator');
  return { available: true, threshold: .03, changedCells, maxDelta, totalPositiveDelta, trace,
    traceCurrentGhostsWithin12: trace ? densityNear(ghosts, trace) : null,
    source: 'read-only diff of actual nether.veg across ordinary simulation steps; no field writes' };
}

export function scenarioSummary(sandbox, recipe) {
  const world = sandbox.world, targets = deriveC2CTargets(world);
  return { recipe, seed: world.seed, day: world.day, mapSize: [world.w, world.h], targets,
    siteFacts: (world.sites || []).map(site => ({ id: site.id, kind: site.kind, x: site.x, y: site.y })),
    activeRifts: targets.rifts };
}

// Generate both acceptance and soak inputs in the same Node process family.
// Long simulations can diverge between Node and a browser's V8 build; loading
// the ordinary product save keeps their presentation comparisons comparable.
async function canonicalCacheSources() {
  const fs=await import('node:fs'),path=await import('node:path'),{createHash}=await import('node:crypto'),{fileURLToPath}=await import('node:url');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const files=['scripts/inkbox-c2c-browser-fixtures.mjs','src/inkbox/render3d/art/VisualScenarios.js'];
  for(const directory of ['core','world','sim','io']) {
    const base='src/inkbox/'+directory;
    for(const relative of fs.readdirSync(path.join(root,base),{recursive:true}))
      if(relative.endsWith('.js'))files.push(base+'/'+relative.replaceAll(path.sep,'/'));
  }
  return Object.fromEntries(files.sort().map(file=>[file,createHash('sha256')
    .update(fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n')).digest('hex')]));
}

/** Node-only preflight; absent/stale defaults regenerate, invalid explicit inputs fail. */
export async function ensureCanonicalMortalCache({savePath,metaPath,explicit=false}) {
  const fs=await import('node:fs'),path=await import('node:path'),{createHash}=await import('node:crypto'),{spawn}=await import('node:child_process'),{fileURLToPath}=await import('node:url');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const sourceFiles=await canonicalCacheSources();
  const validate=()=>{
    for(const file of [savePath,metaPath])require(fs.existsSync(file),'natural Mortal cache missing '+file);
    const saveText=fs.readFileSync(savePath,'utf8'),save=JSON.parse(saveText),meta=JSON.parse(fs.readFileSync(metaPath,'utf8'));
    require(save.seed===226&&save.day===72000,'natural Mortal cache recipe identity mismatch');
    require(hash(saveText)===meta.saveSHA256,'natural Mortal cache save SHA mismatch');
    require(meta.recipe?.key==='mortal'&&meta.recipe.preset==='small'&&meta.recipe.seed===226
      &&meta.recipe.totalDays===72000&&meta.recipe.stepDays===3,'natural Mortal cache generation recipe mismatch');
    require(['secret','cave','formation','ruin'].every(kind=>save.sites?.some(site=>site.kind===kind)),
      'natural Mortal cache lacks current four-kind Site coverage');
    require(/^[a-f0-9]{64}$/.test(meta.sourceWorldSHA256)&&/^[a-f0-9]{64}$/.test(meta.advanceSHA256),
      'natural Mortal source provenance absent');
    require(meta.engine?.node===process.versions.node&&meta.engine?.v8===process.versions.v8,'natural Mortal cache Node/V8 engine changed');
    require(JSON.stringify(meta.sourceFiles)===JSON.stringify(sourceFiles),'natural Mortal simulation source changed');
    return {seed:save.seed,day:save.day,saveSHA256:meta.saveSHA256,sourceWorldSHA256:meta.sourceWorldSHA256,
      advanceSHA256:meta.advanceSHA256,sourceFiles:meta.sourceFiles,engine:meta.engine};
  };
  let reason=null;try{return {generated:false,...validate()};}catch(error){if(explicit)throw error;reason=error.message;}
  console.log('Generating canonical natural Mortal cache before GPU measurement: '+reason);
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(root,'scripts/inkbox-c2c-browser-fixtures.mjs'),'--mortal-only','--write-mortal-cache'],
      {cwd:root,windowsHide:true,env:{...process.env,INKBOX_MORTAL_CACHE_SAVE:savePath,INKBOX_MORTAL_CACHE_META:metaPath},stdio:['ignore','pipe','pipe']});
    let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output=(output+data.toString()).slice(-12000);});
    child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('canonical natural Mortal generation failed '+code+': '+output)));
  });
  return {generated:true,reason,...validate()};
}

/** Node-only preflight for an independently repeatable natural browser recipe. */
export async function ensureCanonicalRealmsCache({savePath,metaPath,historyPath,explicit=false}) {
  const fs=await import('node:fs'),path=await import('node:path'),{createHash}=await import('node:crypto'),{spawn}=await import('node:child_process'),{fileURLToPath}=await import('node:url');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const sourceFiles=await canonicalCacheSources();
  const validate=()=>{
    for(const file of [savePath,metaPath,historyPath])require(fs.existsSync(file),'natural Realms cache missing '+file);
    const saveText=fs.readFileSync(savePath,'utf8'),save=JSON.parse(saveText),meta=JSON.parse(fs.readFileSync(metaPath,'utf8')),
      historyText=fs.readFileSync(historyPath,'utf8'),history=JSON.parse(historyText);
    require(save.seed===20260923&&save.day===21600,'natural Realms cache recipe identity mismatch');
    require(hash(saveText)===meta.saveSHA256&&hash(historyText)===meta.historySHA256,'natural Realms cache save/history SHA mismatch');
    require(history.toDay-history.fromDay===900&&history.trace?.delta>=.03&&history.plane==='nether'&&history.key==='veg','natural Realms cache lacks true 900-day positive history');
    require(history.beforeBytes?.length===history.width*history.height&&history.afterBytes?.length===history.beforeBytes.length,'natural Realms cache R8 dimensions mismatch');
    for(const bytes of [history.beforeBytes,history.afterBytes])require(bytes.every(byte=>Number.isInteger(byte)&&byte>=0&&byte<=255),'natural history contains non-R8 bytes');
    require(hash(Uint8Array.from(history.beforeBytes))===meta.beforeR8SHA256&&hash(Uint8Array.from(history.afterBytes))===meta.afterR8SHA256,'natural Realms cache raw R8 SHA mismatch');
    require(history.afterBytes[history.trace.index]>history.beforeBytes[history.trace.index],'natural Realms positive delta did not survive R8 quantization');
    require(meta.sourceWorldSHA256&&meta.advanceSHA256&&meta.sourceFiles,'natural Realms source provenance absent');
    require(meta.engine?.node===process.versions.node&&meta.engine?.v8===process.versions.v8,'natural Realms cache Node/V8 engine changed');
    require(JSON.stringify(meta.sourceFiles)===JSON.stringify(sourceFiles),'natural Realms simulation source changed');
    return {seed:save.seed,day:save.day,saveSHA256:meta.saveSHA256,historySHA256:meta.historySHA256,sourceWorldSHA256:meta.sourceWorldSHA256};
  };
  let reason=null;try{return {generated:false,...validate()};}catch(error){if(explicit)throw error;reason=error.message;}
  console.log('Generating canonical natural Realms cache before GPU measurement: '+reason);
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(root,'scripts/inkbox-c2c-browser-fixtures.mjs'),'--realms-only','--write-realms-cache'],
      {cwd:root,windowsHide:true,env:{...process.env,INKBOX_REALMS_CACHE_DIR:path.dirname(savePath)},stdio:['ignore','pipe','pipe']});
    let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output=(output+data.toString()).slice(-12000);});
    child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('canonical natural Realms generation failed '+code+': '+output)));
  });
  return {generated:true,reason,...validate()};
}

async function main() {
  if (typeof globalThis.requestAnimationFrame !== 'function')
    globalThis.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 0);
  const reports = [];
  const selected = process.argv.includes('--mortal-only') ? C2C_RECIPES.filter(recipe => recipe.key === 'mortal')
    : process.argv.includes('--realms-only') ? C2C_RECIPES.filter(recipe => recipe.key === 'realms') : C2C_RECIPES;
  for (const recipe of selected) {
    const sandbox = createScenarioSandbox();
    const recipeInfo = await applyC2CRecipe(sandbox, recipe);
    const row = scenarioSummary(sandbox, { ...recipe, visualRecipe: recipeInfo });
    if(recipe.key==='mortal'&&process.argv.includes('--write-mortal-cache')){
      const fs=await import('node:fs'),path=await import('node:path'),{createHash}=await import('node:crypto');
      const {serializeWorld}=await import('../src/inkbox/io/save.js');
      const savePath=path.resolve(process.env.INKBOX_MORTAL_CACHE_SAVE||'reports/local/m2c2c/pilot/full-sites-natural-save.json');
      const metaPath=path.resolve(process.env.INKBOX_MORTAL_CACHE_META||'reports/local/m2c2c/pilot/full-natural-geography.json');
      const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
      require(sandbox.world.day===72000&&Object.values(row.targets.sites.byKind).every(Boolean),
        'canonical natural Mortal recipe must reach day72000 with all four Site kinds');
      const saveText=JSON.stringify(serializeWorld(sandbox.world));
      const meta={recipe,recipeInfo,summary:row,generatedAt:new Date().toISOString(),seed:sandbox.world.seed,day:sandbox.world.day,
        source:'canonical Node createScenarioSandbox + applyC2CRecipe; seed226 small, ordinary 3-day advance to day72000; no World/coordinate/terrain edits',
        sourceWorldSHA256:hash(JSON.stringify(sandbox.world)),advanceSHA256:hash(JSON.stringify(sandbox.advanceState)),saveSHA256:hash(saveText),
        sourceFiles:await canonicalCacheSources(),sourceHashMethod:'SHA-256 of LF-normalized fixture and all core/world/sim/io JavaScript',
        engine:{node:process.versions.node,v8:process.versions.v8},
        serializationLimit:'Product import uses existing save.js serialization, including 16-bit quantized fields. Browser and soak both import this save through the product file input.'};
      fs.mkdirSync(path.dirname(savePath),{recursive:true});fs.mkdirSync(path.dirname(metaPath),{recursive:true});
      fs.writeFileSync(savePath,saveText);fs.writeFileSync(metaPath,JSON.stringify(meta,null,2));
      row.canonicalCache={savePath,metaPath,sourceWorldSHA256:meta.sourceWorldSHA256,saveSHA256:meta.saveSHA256};
      console.log(JSON.stringify({canonicalMortalCache:row.canonicalCache}));
    }
    if (recipe.key === 'realms') {
      row.decayDeltaEvidence = recipeInfo.decayDeltaEvidence;
      row.decayDeltaCheckpoints = recipeInfo.decayDeltaCheckpoints;
      if(process.argv.includes('--write-realms-cache')){
        const fs=await import('node:fs'),path=await import('node:path'),{createHash}=await import('node:crypto');
        const {serializeWorld}=await import('../src/inkbox/io/save.js');
        const out=path.resolve(process.env.INKBOX_REALMS_CACHE_DIR||'reports/local/m2c2c/pilot');fs.mkdirSync(out,{recursive:true});
        const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),history=sandbox.decayDeltaFieldHistory;
        require(history&&history.trace?.delta>=.03,'canonical natural Realms cache requires a real positive trace');
        require(history.toDay-history.fromDay===900,'canonical natural history must cover an ordinary 900-day chunk');
        const saveText=JSON.stringify(serializeWorld(sandbox.world)),historyText=JSON.stringify({...history,beforeBytes:Array.from(history.beforeBytes),afterBytes:Array.from(history.afterBytes)});
        fs.writeFileSync(path.join(out,'natural-realms-save.json'),saveText);
        fs.writeFileSync(path.join(out,'natural-realms-history.json'),historyText);
        const meta={recipe,recipeInfo,summary:row,generatedAt:new Date().toISOString(),seed:sandbox.world.seed,day:sandbox.world.day,
          source:'canonical headless createScenarioSandbox + applyC2CRecipe; ordinary 3-day advance only, no World/ghost/field edits',
          sourceWorldSHA256:hash(JSON.stringify(sandbox.world)),advanceSHA256:hash(JSON.stringify(sandbox.advanceState)),
          saveSHA256:hash(saveText),historySHA256:hash(historyText),beforeR8SHA256:hash(history.beforeBytes),afterR8SHA256:hash(history.afterBytes),
          sourceFiles:await canonicalCacheSources(),sourceHashMethod:'SHA-256 of LF-normalized fixture and all core/world/sim/io JavaScript',
          engine:{node:process.versions.node,v8:process.versions.v8},
          serializationLimit:'Product import uses existing save.js 16-bit quantized fields; raw historical before/after fields were independently quantized to R8 before saving and are read-only historical presentation evidence, never written back into the imported World'};
        fs.writeFileSync(path.join(out,'natural-realms-meta.json'),JSON.stringify(meta,null,2));
        row.canonicalCache={directory:out,sourceWorldSHA256:meta.sourceWorldSHA256,saveSHA256:meta.saveSHA256,historySHA256:meta.historySHA256};
        console.log(JSON.stringify({canonicalRealmsCache:row.canonicalCache}));
      }
    }
    reports.push(row);
    console.log(JSON.stringify({ recipe: recipe.key, seed: row.seed, day: row.day, coverage: row.targets.coverage,
    kinds: Object.keys(row.targets.sites.byKind).filter(kind => row.targets.sites.byKind[kind]), leyline: !!row.targets.leyline,
      firstSiteDays: recipeInfo.firstSiteDays || null, fullSiteCoverageDay: recipeInfo.fullSiteCoverageDay || null,
      fullCoverageSiteIds: recipeInfo.fullCoverageSiteIds || null,
      simultaneousSiteKinds: recipeInfo.simultaneousSiteKinds || null,
      decayDeltaHistory: recipeInfo.decayDeltaHistory || null,
      upperQiRange: row.targets.fields.upperQi?.range, netherYinRange: row.targets.fields.netherYin?.range,
      activeRifts: row.targets.rifts.length, traceDelta: row.decayDeltaEvidence?.trace?.delta ?? null }, null, 2));
  }
  if (selected.length === C2C_RECIPES.length) {
    require(reports.some(row => Object.values(row.targets.sites.byKind).every(Boolean)), 'no natural recipe contains all four Site kinds');
    require(reports.some(row => row.targets.leyline), 'no natural recipe contains a leyline');
    require(reports.some(row => row.targets.fields.upperQi && row.targets.fields.netherYin), 'no natural recipe contains both realm fields');
  }
}

if (typeof process !== 'undefined' && process.argv?.[1]?.replaceAll('\\', '/').endsWith('/scripts/inkbox-c2c-browser-fixtures.mjs')) {
  main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
}
