import assert from 'node:assert/strict';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { OVER, recomputeRect } from '../src/inkbox/world/terrain.js';
import { setHeight, setWater } from '../src/inkbox/world/terrainEdit.js';
import { natureState, igniteCell, floodCells, settleNature, snapshotNature, setRecoveringOverlay, fireExposure } from '../src/inkbox/sim/nature.js';
import { History, flood } from '../src/inkbox/sim/powers.js';
import { TerrainStroke, restoreTerrainStroke } from '../src/inkbox/render3d/terrain/sculpt.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { STRUCT } from '../src/inkbox/core/config.js';
import { Life } from '../src/inkbox/sim/life.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';

const fixture = () => generateWorld({ preset: { w: 64, h: 48 }, seed: 6060, scatter: false });
const untouched = fixture();
snapshotNature(untouched);
assert.equal(untouched.nature, undefined, 'serializing an untouched world leaves runtime state untouched');
const w = fixture(), i = w.idx(30, 24);
w.height[i] = .4; w.water[i] = .2;
setHeight(w, i, .5); assert.ok(Math.abs(w.surface(i) - .6) < 1e-6, 'raised lake preserves surface');
setHeight(w, i, .7); assert.equal(w.water[i], 0, 'land emerges above water');
setHeight(w, i, .3); assert.equal(w.water[i], 0, 'lowering dry land does not summon water');
setWater(w, i, .15); setHeight(w, i, .25);
assert.ok(w.water[i] > .19, 'deliberate lake remains after excavation');
setWater(w, i, 0); recomputeRect(w, 30, 24, 30, 24);
assert.equal(w.water[i], 0, 'deliberate drainage remains dry');

const base = w.water[i];
const first = floodCells(w, [[i, .1]], 10), second = floodCells(w, [[i, .05]], 20);
assert.ok(first && second && w.water[i] > .14);
w.day = 11; settleNature(w);
assert.ok(Math.abs(w.water[i] - .05) < 1e-5, 'first flood recedes without deleting second');
w.day = 21; settleNature(w);
assert.equal(w.water[i], base, 'last flood restores original water');

const edited = floodCells(w, [[i, .1]], 10);
setWater(w, i, .33); w.day = 32; settleNature(w);
assert.ok(edited && Math.abs(w.water[i] - .33) < 1e-5, 'local player edit survives flood expiry');

w.day = 40; w.water[i] = 0; w.veg[i] = .8;
igniteCell(w, i); assert.ok(w.fire[i] > .4);
w.day = 46; settleNature(w); assert.ok(w.fire[i] > .4, 'fire lasts until dueDay');
w.day = 47; settleNature(w);
assert.equal(w.fire[i], 0); assert.equal(w.over[i], OVER.SCORCHED);
w.day = 1127; settleNature(w); assert.equal(w.over[i], OVER.NONE, 'scar recovers on absolute day');

const leap = fixture(), li = leap.idx(30, 24);
leap.water[li] = 0;
setRecoveringOverlay(leap, li, OVER.LAVA);
leap.day = 1000; settleNature(leap);
assert.equal(leap.over[li], OVER.NONE, 'one large time step settles lava then ash from their original due days');
igniteCell(leap, li);
assert.equal(fireExposure(leap, li, 999, 1010), 7, 'fire damage is limited to the overlap before expiry');

const ruined = fixture(), ri = ruined.idx(30, 24);
ruined.water[ri] = 0;
igniteCell(ruined, ri);
ruined.over[ri] = OVER.RUINS; // life can ruin a flooded house in the same advance
ruined.day = 8; settleNature(ruined);
assert.equal(ruined.over[ri], OVER.RUINS, 'fire expiry preserves newer settlement ruins');

const shortFloodWorld = fixture(), houseIndex = shortFloodWorld.idx(31, 24);
shortFloodWorld.water[houseIndex] = 0;
shortFloodWorld.struct[houseIndex] = STRUCT.HOUSE;
const house = { x: 31, y: 24, type: STRUCT.HOUSE };
shortFloodWorld.villages.push({ id: 1, x: 30, y: 24, faction: 0, name: '试村', pop: 0, food: 0,
  houses: [house], fields: 0, level: 1, hp: 100, buildCooldown: 1000, age: 0 });
floodCells(shortFloodWorld, [[houseIndex, .09]], 1);
const villageLife = new Life(shortFloodWorld, () => .99);
advanceWorld(shortFloodWorld, 12, { life: { step: (days) => villageLife.stepVillages(days) }, state: createAdvanceState(), riftActive: false });
assert.equal(shortFloodWorld.struct[houseIndex], STRUCT.HOUSE, '12-day advance cannot ruin a house flooded for only one day');
assert.equal(house.floodDays, undefined, 'expired wet period does not remain consecutive damage');

const undoWorld = fixture(), history = new History();
history.begin(); flood(undoWorld, 30, 24, 4, history); history.end('flood');
assert.ok(natureState(undoWorld).floods.size > 0);
history.undo(undoWorld);
assert.equal(natureState(undoWorld).floods.size, 0, 'Canvas undo removes flood event cells');

const conflictWorld = fixture(), ci = conflictWorld.idx(30, 24), conflictHistory = new History();
conflictWorld.water[ci] = 0;
conflictHistory.begin(); conflictHistory.record(conflictWorld, ci);
conflictWorld.over[ci] = OVER.ROAD; conflictHistory.end('road');
igniteCell(conflictWorld, ci);
assert.equal(conflictHistory.undo(conflictWorld), null, 'Canvas undo refuses to erase a later fire on the same cell');
assert.ok(conflictWorld.fire[ci] > .4 && natureState(conflictWorld).fires.has(ci));

const strokeWorld = fixture(), si = strokeWorld.idx(30, 24);
strokeWorld.height[si] = .4; strokeWorld.water[si] = 0;
floodCells(strokeWorld, [[si, .1]], 12);
const stroke = new TerrainStroke(strokeWorld, { x: 30, y: 24 }, { radius: 2, strength: .1, mode: 'raise' });
const record = stroke.finish();
assert.ok(record);
assert.ok(!natureState(strokeWorld).floods.has(si), '3D player edit detaches its flooded cell');
assert.ok(restoreTerrainStroke(strokeWorld, record, 'before'));
assert.ok(natureState(strokeWorld).floods.has(si), '3D undo restores its prior flood membership');
assert.ok(restoreTerrainStroke(strokeWorld, record, 'after'));
assert.ok(!natureState(strokeWorld).floods.has(si), '3D redo detaches it again');

const lateStrokeWorld = fixture(), lsi = lateStrokeWorld.idx(30, 24);
lateStrokeWorld.height[lsi] = .4; lateStrokeWorld.water[lsi] = 0;
floodCells(lateStrokeWorld, [[lsi, .1]], 5);
const lateStroke = new TerrainStroke(lateStrokeWorld, { x: 30, y: 24 }, { radius: 2, strength: .1, mode: 'raise' }).finish();
assert.ok(lateStroke);
lateStrokeWorld.day = 6; settleNature(lateStrokeWorld);
assert.ok(restoreTerrainStroke(lateStrokeWorld, lateStroke, 'before'));
assert.equal(lateStrokeWorld.water[lsi], 0, 'undo after flood expiry does not resurrect flood water');
assert.ok(restoreTerrainStroke(lateStrokeWorld, lateStroke, 'after'), 'redo still works after expired flood was omitted on undo');

const saveWorld = fixture(), fi = saveWorld.idx(30, 24);
saveWorld.water[fi] = 0;
igniteCell(saveWorld, fi); floodCells(saveWorld, [[fi + 1, .08]], 19);
const before = snapshotNature(saveWorld), restored = deserializeWorld(serializeWorld(saveWorld));
assert.deepEqual(snapshotNature(restored), before, 'event dueDay and flood baselines survive save/load');
restored.day += 20; settleNature(restored);
assert.equal(restored.fire[fi], 0);
assert.equal(natureState(restored).floods.size, 0);

const overdue = fixture(), oi = overdue.idx(30, 24);
overdue.water[oi] = 0;
igniteCell(overdue, oi); floodCells(overdue, [[oi + 1, .09]], 3);
overdue.day = 20;
const overdueRestored = deserializeWorld(serializeWorld(overdue));
assert.equal(overdueRestored.fire[oi], 0, 'load settles fire that was overdue in the saved state');
assert.equal(natureState(overdueRestored).floods.size, 0, 'load settles overdue flood');

console.log('S0 static water, finite fire/flood events, undo/redo and save roundtrip passed');
