#!/usr/bin/env node
// Execute the production gesture handlers and powers without a rendering stub
// claiming browser coverage. The separate browser pass owns visual acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { World } from '../src/inkbox/world/World.js';
import { Life } from '../src/inkbox/sim/life.js';
import { History, withWaterEditBatch } from '../src/inkbox/sim/powers.js';
import { TOOL_BY_ID } from '../src/inkbox/ui/tools.js';
import { LIMITS, TERRAIN } from '../src/inkbox/core/config.js';
import { accessBounds, canAccess } from '../src/inkbox/core/mapAccess.js';
import { rngStream } from '../src/inkbox/core/noise.js';
import { CAUSAL_TOOL_IDS, createInterventionOutcome, measureChangedCells } from '../src/inkbox/sim/interventionFeedback.js';
import { observeToolBefore, observeToolAfter } from '../src/inkbox/sim/toolPresentation.js';
import { reactToTool } from '../src/inkbox/sim/busanzi.js';
import { Render3DAdapter } from '../src/inkbox/render3d/Render3DAdapter.js';
import { readJournal } from '../src/inkbox/sim/journal.js';
import { readObserveEcho } from '../src/inkbox/sim/observeEcho.js';
import { serializeWorld } from '../src/inkbox/io/save.js';

const source = fs.readFileSync(new URL('../src/inkbox/main.js', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const from = source.indexOf('  applyTool(isFirst,'), to = source.indexOf('\n  rebuildVillageCache()', from);
assert(from > 0 && to > from);
const applyTool = new Function('LIMITS', 'accessBounds', 'canAccess', 'CAUSAL_TOOL_IDS',
  'createInterventionOutcome', 'observeToolBefore', 'observeToolAfter', 'reactToTool',
  'return ({' + source.slice(from, to).trim() + '}).applyTool;'
)(LIMITS, accessBounds, canAccess, CAUSAL_TOOL_IDS, createInterventionOutcome, observeToolBefore, observeToolAfter, reactToTool);
const start = source.indexOf('    const rememberStrokePoint = (x, y) => {');
const marker = "    document.addEventListener('visibilitychange', () => {\n      if (document.hidden) cancelPointer();\n    });";
const end = source.indexOf(marker, start);
assert(start > 0 && end > start);
const bind = new Function('canvas', 'window', 'document', 'CAUSAL_TOOL_IDS', 'createInterventionOutcome',
  'measureChangedCells', 'withWaterEditBatch', source.slice(start, end + marker.length));
const frameStart = source.indexOf("    if (this.pointer.down && this.pointer.actionKind === 'drag' && this.pointer.inside) {");
const frameEnd = source.indexOf('    this.autoSaveAccum += dt;', frameStart);
assert(frameStart > 0 && frameEnd > frameStart);
const frame = new Function('dt', source.slice(frameStart, frameEnd));

function setup(toolId = 'burn', observation = true) {
  const world = new World(48, 40, 62027);
  world.height.fill(.5); world.veg.fill(.8); world.type.fill(TERRAIN.GRASS); world.temp.fill(.55);
  const rng = rngStream(62027), life = new Life(world, rng);
  const handlers = new Map(), windowHandlers = new Map();
  const canvas = { style: {}, addEventListener: (name, fn) => handlers.set(name, fn),
    getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture() {} };
  const sb = { world, life, rng, history: new History(), toolId, brushRadius: 3,
    pointer: { inside: true }, hoverTile: { x: 16, y: 16 }, brushTimer: 0,
    get tool() { return TOOL_BY_ID[this.toolId]; },
    canvas, notices: [], notify(message) { this.notices.push(message); }, dirty: false,
    camera: { pick: (x, y) => ({ x: Math.floor(x), y: Math.floor(y) }), panBy() {}, clamp() {} },
    qol: { markDirty() {}, syncUndoState() {} }, observeEcho: { refresh() {} },
    refreshChronicle() {}, refreshMilestones() {}, refreshBusanzi() {}, updateCursor() {}, applyTool };
  if (!observation) sb.history.queueToolReceipt = () => {};
  bind.call(sb, canvas, { addEventListener: (name, fn) => windowHandlers.set(name, fn) },
    { addEventListener() {}, hidden: false }, CAUSAL_TOOL_IDS, createInterventionOutcome, measureChangedCells, withWaterEditBatch);
  return { sb, world, life, rng, handlers, fire(name, x = 16, y = 16) {
    handlers.get(name)?.({ button: 0, pointerId: 1, clientX: x, clientY: y });
  } };
}
let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }

check('Canvas complete held/moving burn commits exactly one receipt; release is idempotent', () => {
  const f = setup();
  f.fire('pointerdown');
  for (let i = 0; i < 8; i++) { f.fire('pointermove', 16 + i, 16); frame.call(f.sb, .08); }
  assert.equal(readJournal(f.world).receipts.length, 0);
  f.fire('pointerup', 23, 16); f.fire('pointerup', 23, 16);
  const [r] = readJournal(f.world).receipts;
  assert.equal(readJournal(f.world).receipts.length, 1);
  assert.equal(r.kind, 'burn'); assert(r.changedCells > 0);
  assert(r.changedCells <= f.sb.history.stack.at(-1).changes.size);
});
check('Canvas cancellation and world replacement preserve the preview and create no receipt', () => {
  for (const mode of ['pointercancel', 'lostpointercapture', 'new-world']) {
    const f = setup(), before = serializeWorld(f.world);
    f.fire('pointerdown'); f.fire('pointermove', 24, 20); frame.call(f.sb, .08);
    if (mode === 'new-world') { f.sb.world = new World(48, 40, 4); f.fire('pointerup', 24, 20); }
    else f.fire(mode, 24, 20);
    assert.deepEqual(serializeWorld(f.world), before);
    assert.equal(readJournal(f.world).receipts.length, 0);
  }
});
check('Three uses the same History boundary for a long burn, cancellation and thrown powers', () => {
  const f = setup();
  const adapter = Object.assign(Object.create(Render3DAdapter.prototype), { sandbox: f.sb,
    active: true, mode: 'burn', radius: 3, renderer: { world: f.world },
    hit: e => ({ plane: 'mortal', world: { x: e.x, y: e.y } }), editReason: () => null });
  adapter.powerStroke = { world: f.world, mode: 'burn', radius: 3, points: [{ x: 12, y: 12 }, { x: 18, y: 12 }] };
  assert(adapter.commitPowerStroke({ x: 23, y: 12 }));
  assert.equal(readJournal(f.world).receipts.length, 1);
  assert.equal(adapter.commitPowerStroke({ x: 23, y: 12 }), false);
  adapter.powerStroke = { world: new World(48, 40), mode: 'burn', radius: 3, points: [{ x: 12, y: 12 }] };
  assert.equal(adapter.commitPowerStroke({ x: 12, y: 12 }), false);
  const g = setup(), bad = Object.assign(Object.create(Render3DAdapter.prototype), adapter, { sandbox: g.sb, renderer: { world: g.world } });
  bad.powerStroke = { world: g.world, mode: 'burn', radius: 3, points: [{ x: 12, y: 12 }] };
  g.sb.applyTool = () => { throw new Error('power failed'); };
  assert.throws(() => bad.commitPowerStroke({ x: 12, y: 12 }), /power failed/);
  assert.equal(readJournal(g.world).receipts.length, 0);
});
check('Root click records only actual people and rejects stale picks without a success receipt', () => {
  const f = setup('root');
  f.life.spawn(16, 16, 'human', 2); f.life.spawn(16, 16, 'beast', 1);
  const target = f.world.entities.find(e => e.sp === 'human');
  f.sb.history.begin(); f.sb.applyTool(true, { point: { x: 16, y: 16 }, radius: 3, targetEntityId: target.id }); f.sb.history.end('赐灵根');
  const r = readJournal(f.world).receipts[0];
  assert.equal(r.changedPeople, 1); assert.equal(r.people.length, 1);
  assert.equal(r.people[0].ref.id, target.id);
  f.sb.history.begin(); f.sb.applyTool(true, { point: { x: 16, y: 16 }, radius: 3, targetEntityId: -9 }); f.sb.history.end('无效赐根');
  assert.equal(readJournal(f.world).receipts.length, 1);
});
check('Crisis receipts require a newly active formal event; cancelled crises do not count', () => {
  const f = setup('crisis');
  f.sb.history.begin(); f.sb.applyTool(true, { point: { x: 16, y: 16 }, radius: 3 }); f.sb.history.end('无村降灾');
  assert.equal(readJournal(f.world).receipts.length, 0);
  f.world.villages.push({ id: 1, name: '原村', x: 16, y: 16, hp: 100, pop: 12, food: 40, houses: [] });
  f.sb.history.begin(); f.sb.applyTool(true, { point: { x: 16, y: 16 }, radius: 3 }); f.sb.history.end('降灾');
  const r = readJournal(f.world).receipts[0];
  assert(r && f.life.events.activeCrises.some(e => e.id === r.eventId && e.villageId === r.villageId));
});
check('Existing drain is stored only in observeEcho and the observer adds no World/RNG effects', () => {
  const f = setup('drain'); f.world.water.fill(.1);
  f.fire('pointerdown'); f.fire('pointerup', 18, 16);
  assert.equal(readObserveEcho(f.world).marks.length, 1);
  assert.equal(readJournal(f.world).receipts.length, 0);
  const a = setup('root'), b = setup('root', false);
  for (const f of [a, b]) {
    f.life.spawn(16, 16, 'human', 2);
    f.sb.history.begin(); f.sb.applyTool(true, { point: { x: 16, y: 16 }, radius: 3 }); f.sb.history.end('赐灵根');
  }
  const left = serializeWorld(a.world), right = serializeWorld(b.world); delete left.journal;
  assert.deepEqual(left, right); assert.deepEqual(a.rng.getState(), b.rng.getState());
});
console.log('E2-Lite production gesture integration: ' + checks + ' groups passed');
