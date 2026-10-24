import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { History, withWaterEditBatch } from '../src/inkbox/sim/powers.js';
import { TOOL_BY_ID } from '../src/inkbox/ui/tools.js';
import { observeToolBefore, observeToolAfter } from '../src/inkbox/sim/toolPresentation.js';
import { peekRuntimeEvents } from '../src/inkbox/core/runtimeEvents.js';
import { snapshotNature } from '../src/inkbox/sim/nature.js';
import { readObserveEcho } from '../src/inkbox/sim/observeEcho.js';
import { CAUSAL_TOOL_IDS, createInterventionOutcome, measureChangedCells } from '../src/inkbox/sim/interventionFeedback.js';

const source = fs.readFileSync(new URL('../src/inkbox/main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('    const rememberStrokePoint = (x, y) => {');
const endMarker = "    document.addEventListener('visibilitychange', () => {\n      if (document.hidden) cancelPointer();\n    });";
const end = source.indexOf(endMarker, start);
assert.ok(start >= 0 && end > start, 'extract the production Canvas pointer handlers');
const registration = source.slice(start, end + endMarker.length);
const sampleStart = source.indexOf("    if (this.pointer.down && this.pointer.actionKind === 'drag' && this.pointer.inside) {");
const sampleEnd = source.indexOf('    this.autoSaveAccum += dt;', sampleStart);
assert.ok(sampleStart >= 0 && sampleEnd > sampleStart, 'extract the production RAF stroke collector');
const frameCollector = new Function('dt', source.slice(sampleStart, sampleEnd));

function makeCanvas() {
  const handlers = new Map(); let timeStamp = 0;
  return {
    style: {},
    handlers,
    addEventListener(type, fn) { handlers.set(type, fn); },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    setPointerCapture() {},
    dispatch(type, event = {}) { handlers.get(type)?.({ button: 0, pointerId: 1,
      clientX: 20, clientY: 20, timeStamp: (timeStamp += 100), ...event, preventDefault() {} }); },
  };
}

function setup(toolId, world) {
  const canvas = makeCanvas(), windowHandlers = new Map(), documentHandlers = new Map();
  const history = new History();
  const sandbox = {
    canvas, world, history, brushRadius: 3, toolId, pointer: { x: 0, y: 0, inside: false, down: false,
      painting: false, panning: false, lastX: 0, lastY: 0 }, hoverTile: { x: 0, y: 0 },
    pointerApplyCount: 0, commits: 0, refreshes: 0, notifications: [],
    rngCalls: 0,
    get tool() { return TOOL_BY_ID[this.toolId]; },
    camera: { pick(x, y) { return { x: Math.floor(x), y: Math.floor(y) }; },
      panBy() {}, clamp() {} },
    updateCursor() {},
    notify(text) { this.notifications.push(text); },
    refreshChronicle() {},
    inspectAt() {},
    inspectRealmAt() {},
    isRealmInspectClick() { return false; },
    commitSelection() { this.commits += 1; },
    observeEcho: { refresh() { sandbox.refreshes += 1; } },
    applyTool(isFirst, { point = this.hoverTile, radius = this.brushRadius } = {}) {
      this.pointerApplyCount += 1;
      const tool = this.tool;
      const ctx = { world: this.world, x: point.x + 0.5, y: point.y + 0.5, radius,
        amount: tool.amount, history: this.history, rng: () => { this.rngCalls += 1; return 0.5; } };
      const before = observeToolBefore(ctx, tool);
      ctx.result = tool.apply(ctx);
      observeToolAfter(ctx, before);
    },
  };
  sandbox.canvas = canvas;
  const register = new Function('canvas', 'window', 'document', 'CAUSAL_TOOL_IDS', 'withWaterEditBatch',
    'measureChangedCells', 'createInterventionOutcome', registration);
  register.call(sandbox, canvas,
    { addEventListener(type, fn) { windowHandlers.set(type, fn); } },
    { hidden: false, addEventListener(type, fn) { documentHandlers.set(type, fn); } },
    CAUSAL_TOOL_IDS, withWaterEditBatch, measureChangedCells, createInterventionOutcome);
  return { sandbox, canvas, windowHandlers, documentHandlers };
}

function advanceFrames(sandbox, seconds) {
  const frames = Math.ceil(seconds / (1 / 60));
  for (let i = 0; i < frames; i += 1) frameCollector.call(sandbox, 1 / 60);
}

const fixture = () => generateWorld({ preset: { w: 64, h: 48 }, seed: 71401, scatter: true });
const serializeNature = (world) => JSON.stringify(snapshotNature(world));
const savedState = (world) => JSON.stringify({ height: [...world.height], water: [...world.water],
  type: [...world.type], over: [...world.over], struct: [...world.struct], veg: [...world.veg], fire: [...world.fire],
  nature: JSON.parse(serializeNature(world)), events: peekRuntimeEvents(world), echo: readObserveEcho(world) });
const activateWater = (world) => {
  const village = world.villages[0] || { id: 9001, x: 20, y: 20, faction: 0, name: '回归村',
    pop: 12, food: 80, houses: [], history: [], hp: 100, age: 20 };
  if (!world.villages.includes(village)) world.villages.push(village);
  const x = Math.floor(village.x), y = Math.floor(village.y);
  const i = world.idx(x, y);
  world.water[i] = 0.28;
  return { x, y, i };
};
const pointer = (canvas, type, x, y) => canvas.dispatch(type, { clientX: x, clientY: y });

// A drag is preview-only before release. Cancel discards it without terrain,
// nature, history, observation marks, or transient presentation events.
{
  const world = fixture(), point = activateWater(world), { sandbox, canvas, windowHandlers } = setup('drain', world);
  const before = savedState(world);
  pointer(canvas, 'pointerdown', point.x, point.y);
  pointer(canvas, 'pointermove', point.x + 3, point.y + 1);
  assert.equal(sandbox.pointerApplyCount, 0, 'drag preview does not execute powers before release');
  windowHandlers.get('blur')();
  pointer(canvas, 'pointercancel', point.x + 3, point.y + 1);
  assert.equal(savedState(world), before, 'cancel leaves world, nature, history effects and observe echo unchanged');
  assert.equal(sandbox.history.stack.length, 0, 'cancel creates no history entry');
  assert.equal(peekRuntimeEvents(world).length, 0, 'cancel emits no transient tool FX');
}

// Normal release runs the real water power path once per sampled point inside
// one gesture batch, commits one history entry, and writes one drain mark.
{
  const world = fixture(), point = activateWater(world), { sandbox, canvas } = setup('drain', world);
  pointer(canvas, 'pointerdown', point.x, point.y);
  pointer(canvas, 'pointermove', point.x + 2, point.y);
  pointer(canvas, 'pointerup', point.x + 3, point.y);
  assert.ok(world.water[point.i] < 0.28, 'released drain changes water');
  assert.equal(sandbox.history.stack.length, 1, 'a drag commits one history entry');
  assert.equal(readObserveEcho(world).marks.length, 1, 'a drag records one observe mark');
  const waterFx = peekRuntimeEvents(world).filter(event => event.type === 'tool-impact'
    && event.data?.tool === 'water-response');
  assert.equal(waterFx.length, 1, 'a water gesture aggregates its response into one transient event');
  assert.equal(sandbox.pointerApplyCount, 2, 'mousemove does not add strokes; pointerup adds only its changed endpoint');
  assert.equal(sandbox.rngCalls, 0, 'normal water drag consumes no RNG');
}

// pointerleave keeps its historical completion behavior for a captured drag.
{
  const world = fixture(), point = activateWater(world), { sandbox, canvas } = setup('drain', world);
  pointer(canvas, 'pointerdown', point.x, point.y);
  pointer(canvas, 'pointermove', point.x + 2, point.y);
  pointer(canvas, 'pointerleave', point.x + 2, point.y);
  assert.equal(sandbox.history.stack.length, 1, 'pointerleave commits the active drag once');
  assert.equal(sandbox.pointerApplyCount, 2, 'pointerleave applies the collected path once');
}

// Click powers are committed at pointerdown. A later cancel cannot roll back a
// completed flood or duplicate its history/event/observation completion.
{
  const world = fixture(), point = activateWater(world), { sandbox, canvas } = setup('flood', world);
  pointer(canvas, 'pointerdown', point.x, point.y);
  assert.equal(sandbox.pointerApplyCount, 1, 'click power runs exactly once at pointerdown');
  assert.equal(sandbox.history.stack.length, 1, 'click history is committed at pointerdown');
  const afterClick = savedState(world);
  pointer(canvas, 'pointercancel', point.x, point.y);
  pointer(canvas, 'pointerup', point.x, point.y);
  assert.equal(savedState(world), afterClick, 'cancel and later up preserve the completed click fact');
  assert.equal(sandbox.pointerApplyCount, 1, 'later pointer events do not repeat the click');
  assert.equal(sandbox.history.stack.length, 1, 'click creates one history entry');
  assert.equal(sandbox.refreshes, 1, 'click completion refreshes observation once');
}

// Held same-cell force retains the original 75 ms repetition rate, while a
// canceled long hold still leaves every World fact and event untouched.
{
  const makeRaiseFixture = () => {
    const world = fixture(), x = 20, y = 20, i = world.idx(x, y);
    world.height[i] = 0.1; world.water[i] = 0;
    return { world, x, y, i };
  };
  const single = makeRaiseFixture(), one = setup('raise', single.world);
  pointer(one.canvas, 'pointerdown', single.x, single.y);
  pointer(one.canvas, 'pointerup', single.x, single.y);
  const singleHeight = single.world.height[single.i];

  const held = makeRaiseFixture(), long = setup('raise', held.world);
  pointer(long.canvas, 'pointerdown', held.x, held.y);
  advanceFrames(long.sandbox, 2);
  assert.equal(long.sandbox.pointerApplyCount, 0, 'held stroke does not mutate World before release');
  pointer(long.canvas, 'pointerup', held.x, held.y);
  assert.ok(held.world.height[held.i] > singleHeight + 0.25, 'two-second same-cell hold preserves repeated raise strength');
  assert.ok(long.sandbox.pointerApplyCount > 20, '75 ms collector records repeated same-cell applications');
  assert.equal(long.sandbox.rngCalls, 0, 'replayed held raise consumes no RNG');

  const canceled = makeRaiseFixture(), canceledGesture = setup('raise', canceled.world);
  const canceledBefore = savedState(canceled.world);
  pointer(canceledGesture.canvas, 'pointerdown', canceled.x, canceled.y);
  advanceFrames(canceledGesture.sandbox, 2);
  pointer(canceledGesture.canvas, 'pointercancel', canceled.x, canceled.y);
  assert.equal(savedState(canceled.world), canceledBefore, 'canceling a two-second hold leaves all World facts untouched');
  assert.equal(canceledGesture.sandbox.pointerApplyCount, 0, 'canceling a long hold never executes queued samples');
  assert.equal(peekRuntimeEvents(canceled.world).length, 0, 'canceling a long hold emits no transient events');
}

// A selection gesture canceled before release never opens or commits a view.
{
  const world = fixture(), { sandbox, canvas } = setup('realm', world);
  sandbox.toolId = 'realm';
  // The selector is the one select-mode tool in the production registry.
  const selectId = Object.keys(TOOL_BY_ID).find(id => TOOL_BY_ID[id].mode === 'select');
  assert.ok(selectId, 'production select tool exists');
  sandbox.toolId = selectId;
  pointer(canvas, 'pointerdown', 12, 12);
  pointer(canvas, 'pointermove', 20, 18);
  pointer(canvas, 'pointercancel', 20, 18);
  assert.equal(sandbox.commits, 0, 'canceled selection does not commit');
  assert.equal(sandbox.selectPath, null, 'canceled selection path is discarded');
}

// A queued gesture from a replaced world cannot paint into the new world on up.
{
  const oldWorld = fixture(), point = activateWater(oldWorld), { sandbox, canvas } = setup('drain', oldWorld);
  const oldBefore = savedState(oldWorld), replacement = fixture(), newBefore = savedState(replacement);
  pointer(canvas, 'pointerdown', point.x, point.y);
  pointer(canvas, 'pointermove', point.x + 2, point.y);
  sandbox.world = replacement;
  pointer(canvas, 'pointerup', point.x + 2, point.y);
  assert.equal(savedState(oldWorld), oldBefore, 'replaced world receives no deferred stroke');
  assert.equal(savedState(replacement), newBefore, 'new world receives no stale stroke');
  assert.equal(sandbox.history.stack.length, 0, 'world replacement cancels the open gesture');
}

console.log('G7 Canvas pointer cancellation regression passed');
