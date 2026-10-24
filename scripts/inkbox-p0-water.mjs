import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { SEA_LEVEL } from '../src/inkbox/core/config.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { recomputeAll } from '../src/inkbox/world/terrain.js';
import { setHeight, setWater } from '../src/inkbox/world/terrainEdit.js';
import { respondLocalWater, localWaterStats } from '../src/inkbox/world/localWater.js';
import { floodCells, settleNature, natureState } from '../src/inkbox/sim/nature.js';
import { History, sculpt, addWater, removeWater, flood, withWaterEditBatch, waterEditStats } from '../src/inkbox/sim/powers.js';
import { accessBounds, createMapProgress } from '../src/inkbox/world/mapProgress.js';
import { TerrainStroke, restoreTerrainStroke } from '../src/inkbox/render3d/terrain/sculpt.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { peekRuntimeEvents } from '../src/inkbox/core/runtimeEvents.js';

function fixture(w = 80, h = 64) {
  const world = generateWorld({ preset: { w, h }, seed: 6060, scatter: false });
  world.height.fill(.65); world.water.fill(0); world.riverBase.fill(0); recomputeAll(world);
  return world;
}
const at = (w, x, y) => y * w.w + x;
const near = (x, y) => ({ x0: x, x1: x, y0: y, y1: y });

const sea = fixture();
for (const x of [19, 20]) { const i = at(sea, x, 20); sea.height[i] = .25; sea.water[i] = SEA_LEVEL - .25; }
const seaPit = at(sea, 21, 20), dryPit = at(sea, 55, 40);
setHeight(sea, seaPit, .22); setHeight(sea, dryPit, .22);
respondLocalWater(sea, near(21, 20), { source: 'test-sculpt' });
assert.ok(sea.water[seaPit] > .04, 'connected sea supplies a newly excavated pit');
assert.ok(Math.abs(sea.water.reduce((a, b) => a + b, 0) - .1) < .00001, 'local sea water remains finite and conserved');
assert.equal(sea.water[dryPit], 0, 'distant dry pit remains dry');

const seaLevelPool = fixture(), si = at(seaLevelPool, 40, 28), spi = at(seaLevelPool, 41, 28);
seaLevelPool.height[si] = .25; seaLevelPool.water[si] = SEA_LEVEL - .25;
setHeight(seaLevelPool, spi, .22);
respondLocalWater(seaLevelPool, near(41, 28));
assert.ok(Math.abs(seaLevelPool.water.reduce((a, b) => a + b, 0) - .05) < .00001, 'isolated sea-level pool never becomes an infinite source');

const finite = fixture();
const source = at(finite, 40, 28), lower = at(finite, 41, 28);
finite.height[source] = .7; finite.height[lower] = .5;
const history = new History(); history.begin();
addWater(finite, 40.5, 28.5, 1, .16, history); history.end('add water');
assert.ok(finite.water[lower] > .02 && finite.water[source] < .16, 'injected water descends instead of remaining a column');
const volume = finite.water.reduce((sum, n) => sum + n, 0);
assert.ok(Math.abs(volume - .16) < .001, `finite pool retains volume (${volume})`);
assert.ok(localWaterStats(finite).candidates <= 8192);
assert.ok(peekRuntimeEvents(finite).some(e => e.type === 'tool-impact' && e.data?.tool === 'water-response'));
assert.equal(history.undo(finite), 'add water');
assert.ok(finite.water[lower] < .00001, 'undo includes response cells outside brush');

const conflicts = fixture(), conflictHistory = new History();
conflictHistory.begin(); addWater(conflicts, 40.5, 28.5, 1, .12, conflictHistory); conflictHistory.end('add');
const changedCell = at(conflicts, 40, 28);
setWater(conflicts, changedCell, .3);
assert.equal(conflictHistory.undo(conflicts), null, 'later edit refuses whole undo');
assert.equal(conflicts.water[changedCell], Math.fround(.3));

const inert = fixture(), inertWet = at(inert, 44, 28);
inert.water[inertWet] = .08;
const inertBefore = inert.water.slice(), inertHistory = new History();
inertHistory.begin(); removeWater(inert, 40.5, 28.5, 1, .1, inertHistory);
assert.equal(inertHistory.end('dry brush'), false, 'dry brush leaves no history mark');
assert.deepEqual(inert.water, inertBefore, 'dry brush cannot move nearby pool');
inert.height[at(inert, 40, 28)] = 1;
inertHistory.begin(); sculpt(inert, 40.5, 28.5, 1, .1, inertHistory);
assert.equal(inertHistory.end('saturated raise'), false, 'saturated height brush leaves no history mark');
assert.deepEqual(inert.water, inertBefore, 'saturated brush cannot move nearby pool');

const river = fixture(), riverCell = at(river, 40, 28), riverHistory = new History();
river.riverBase[riverCell] = .012; river.water[riverCell] = .012;
riverHistory.begin(); sculpt(river, 42.5, 28.5, 1, .03, riverHistory); riverHistory.end('near river');
assert.equal(river.water[riverCell], Math.fround(.012), 'nearby edit preserves existing river base');
assert.equal(river.water[at(river, 39, 28)], 0, 'natural base is not migrated as free water');

const strokeWorld = fixture(), strokeIndex = at(strokeWorld, 40, 28), strokeNeighbor = at(strokeWorld, 41, 28);
strokeWorld.height[strokeIndex] = .7; strokeWorld.height[strokeNeighbor] = .5; strokeWorld.water[strokeIndex] = .18;
const stroke = new TerrainStroke(strokeWorld, { x: 40, y: 28 }, { radius: 1.4, strength: .05, mode: 'raise', natural: false }).finish();
assert.ok(stroke?.records.some(([i]) => i === strokeNeighbor), 'Three transaction includes flowing neighboring water');
assert.ok(restoreTerrainStroke(strokeWorld, stroke, 'before'));
assert.equal(strokeWorld.water[strokeNeighbor], 0);
assert.ok(restoreTerrainStroke(strokeWorld, stroke, 'after'));

const floods = fixture();
const wet = at(floods, 30, 30);
floodCells(floods, [[wet, .1]], 30);
floodCells(floods, [[wet, .07]], 40);
const drainHistory = new History(); drainHistory.begin();
removeWater(floods, 30.5, 30.5, 1, .3, drainHistory); drainHistory.end('drain');
const saved = deserializeWorld(serializeWorld(floods));
assert.equal(saved.water[wet], 0, 'player drainage persists through save/load');
saved.day = 31; settleNature(saved);
assert.equal(saved.water[wet], 0, 'first expiry does not revive extracted flood water');
saved.day = 41; settleNature(saved);
assert.equal(saved.water[wet], 0, 'second expiry does not revive extracted flood water');
assert.equal(natureState(saved).floods.size, 0);

const partial = fixture(), pi = at(partial, 30, 30), partialHistory = new History();
floodCells(partial, [[pi, .1]], 30); floodCells(partial, [[pi, .07]], 40);
partialHistory.begin(); removeWater(partial, 30.5, 30.5, 1, .08, partialHistory); partialHistory.end('partial drain');
assert.ok(partial.water[pi] > .08 && partial.water[pi] < .1, 'partial drainage retains timed flood ownership');
partial.day = 31; settleNature(partial);
assert.ok(Math.abs(partial.water[pi] - .07) < 1e-5, 'older reduced layer expires without reviving extracted water');
partial.day = 41; settleNature(partial); assert.equal(partial.water[pi], 0);

const spreading = fixture(), floodHistory = new History();
spreading.height[at(spreading, 40, 30)] = .5;
floodHistory.begin(); flood(spreading, 40, 30, 3, floodHistory); floodHistory.end('flood');
const floodEvent = natureState(spreading).events.find(e => e.kind === 'flood');
assert.ok(floodEvent?.cells.length > 0);
assert.equal(peekRuntimeEvents(spreading).filter(e => e.data?.tool === 'water-response').length, 1, 'one flood emits one actual rise');
assert.ok(floodEvent.cells.every(i => natureState(spreading).floods.get(i)?.levels.has(floodEvent.id)), 'spread ownership matches event index');
const spreadSaved = deserializeWorld(serializeWorld(spreading));
spreadSaved.day = 31; settleNature(spreadSaved);
assert.equal(natureState(spreadSaved).floods.size, 0);
assert.ok([...spreadSaved.water].every(d => d < .00001), 'spread flood entirely recedes after save/load');

const expiry = fixture(), ei = at(expiry, 30, 30);
floodCells(expiry, [[ei, .09]], 30);
setHeight(expiry, ei, .63);
assert.equal(expiry.water[ei], 0, 'height edit does not promote flood layer into permanent water');
floodCells(expiry, [[ei, .09]], 30);
expiry.day = 29; settleNature(expiry); assert.ok(expiry.water[ei] > .08);
expiry.day = 30; settleNature(expiry); assert.equal(expiry.water[ei], 0);
assert.ok(peekRuntimeEvents(expiry).some(e => e.data?.tool === 'water-response' && e.data.phase === 'recede'));

const enclosed = fixture(), enclosedCell = at(enclosed, 40, 28), enclosedHistory = new History();
enclosed.height[enclosedCell] = .5;
enclosedHistory.begin(); addWater(enclosed, 40.5, 28.5, 1, .02, enclosedHistory); enclosedHistory.end('enclosed water');
enclosedHistory.begin(); removeWater(enclosed, 40.5, 28.5, 1, .2, enclosedHistory); enclosedHistory.end('enclosed drain');
const waterFeedback = peekRuntimeEvents(enclosed).filter(e => e.data?.tool === 'water-response');
assert.equal(waterFeedback.length, 2, 'enclosed injection and complete drainage each have feedback without redistribution');
assert.equal(waterFeedback[1].data.phase, 'recede');

const layered = fixture(), la = at(layered, 40, 28), lb = at(layered, 41, 28);
layered.height.fill(.9); layered.height[la] = layered.height[lb] = .5;
floodCells(layered, [[la, .2]], 30);
const newerFlood = floodCells(layered, [[lb, .1]], 40);
respondLocalWater(layered, near(41, 28), { floodId: newerFlood });
assert.equal(natureState(layered).floods.get(la).levels.has(newerFlood), false, 'new flood cannot flow uphill into an older, deeper flood');
assert.ok(Math.abs(layered.water[la] - .2) < 1e-6 && Math.abs(layered.water[lb] - .1) < 1e-6);
const permanent = fixture(), pa = at(permanent, 40, 28), pb = at(permanent, 41, 28);
permanent.height.fill(.9); permanent.height[pa] = permanent.height[pb] = .5;
floodCells(permanent, [[pa, .2]], 30);
const permanentHistory = new History(); permanentHistory.begin(); addWater(permanent, 41.5, 28.5, 1, .1, permanentHistory); permanentHistory.end('next to flood');
assert.equal(natureState(permanent).floods.get(pa).base, 0, 'permanent water also sees existing flood height and cannot flow uphill');
assert.ok(Math.abs(permanent.water[pb] - .1) < 1e-6);

const locked = fixture(); createMapProgress(locked, true);
const openBounds = accessBounds(locked), edgeX = openBounds.x0, edgeY = Math.floor((openBounds.y0 + openBounds.y1) / 2);
locked.height[at(locked, edgeX - 1, edgeY)] = .1;
const lockedHistory = new History(); lockedHistory.begin(); addWater(locked, edgeX + .5, edgeY + .5, 1, .1, lockedHistory); lockedHistory.end('edge water');
assert.equal(locked.water[at(locked, edgeX - 1, edgeY)], 0, 'formal water never flows into unopened map cells');

const drag = fixture(512, 320), dragHistory = new History(); dragHistory.begin();
withWaterEditBatch(drag, dragHistory, () => { for (let n = 0; n < 128; n++) addWater(drag, 240.5 + Math.floor(n / 4), 160.5, 1, .01, dragHistory); });
dragHistory.end('long water gesture');
const dragStats = waterEditStats(drag);
assert.equal(dragStats.windows, 1, '128 adjacent samples share one local redistribution');
assert.ok(dragStats.relaxations <= 6561 * 32, 'relaxation work is budgeted per gesture');
assert.equal(peekRuntimeEvents(drag).filter(e => e.data?.tool === 'water-response').length, 1, 'one drag has one water echo');
assert.ok(Math.abs(drag.water.reduce((sum, v) => sum + v, 0) - 1.28) < .001, 'batched water retains finite injected volume');
const failed = fixture(), fi = at(failed, 40, 28), failedHistory = new History();
floodCells(failed, [[fi, .12]], 30);
const failedBefore = { height: failed.height.slice(), water: failed.water.slice(), type: failed.type.slice(), nature: JSON.stringify([...natureState(failed).floods]) };
failedHistory.begin();
assert.throws(() => withWaterEditBatch(failed, failedHistory, () => { removeWater(failed, 40.5, 28.5, 1, .05, failedHistory); throw Error('injected edit failure'); }), /injected edit failure/);
assert.deepEqual(failed.height, failedBefore.height); assert.deepEqual(failed.water, failedBefore.water);
assert.equal(JSON.stringify([...natureState(failed).floods]), failedBefore.nature, 'failed gesture restores timed flood ownership');
assert.equal(failedHistory.current, null); assert.equal(failedHistory.stack.length, 0);
const seam = fixture(512, 320), seamHistory = new History(); seam.height[at(seam, 239, 160)] = .7; seam.height[at(seam, 240, 160)] = .5;
seamHistory.begin(); withWaterEditBatch(seam, seamHistory, () => { addWater(seam, 100.5, 160.5, 1, .001, seamHistory); addWater(seam, 239.5, 160.5, 1, .14, seamHistory); addWater(seam, 240.5, 160.5, 1, .001, seamHistory); }); seamHistory.end('cross-window drag');
assert.ok(seam.water[at(seam, 240, 160)] > .05 && seam.water[at(seam, 239, 160)] < .14, 'overlapping edge nodes let a long drag flow across window seams');

const large = fixture(512, 320);
large.height[at(large, 256, 160)] = .72;
large.water[at(large, 256, 160)] = .2;
const before = performance.now();
respondLocalWater(large, near(256, 160), { source: 'benchmark' });
const elapsed = performance.now() - before, measured = localWaterStats(large);
assert.ok(measured.candidates <= 8192 && measured.passes <= 32);
const edge = fixture(); edge.water[at(edge, 70, 30)] = .1;
respondLocalWater(edge, near(30, 30), { source: 'edge-budget' });
assert.equal(localWaterStats(edge).capped, true, 'spread touching the local boundary reports a capped approximation');
console.log(`P0 water PASS: sea, dry pit, finite volume, flood expiry/save, undo/conflict; 512x320 candidates=${measured.candidates}, passes=${measured.passes}, elapsed=${elapsed.toFixed(1)}ms`);
