import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { observeToolBefore, observeToolAfter } from '../src/inkbox/sim/toolPresentation.js';
import { World } from '../src/inkbox/world/World.js';
import { History } from '../src/inkbox/sim/powers.js';
import { TOOL_BY_ID } from '../src/inkbox/ui/tools.js';
import { Render3DAdapter } from '../src/inkbox/render3d/Render3DAdapter.js';
import { readObserveEcho } from '../src/inkbox/sim/observeEcho.js';
import { LIMITS } from '../src/inkbox/core/config.js';
import { accessBounds, canAccess } from '../src/inkbox/core/mapAccess.js';
import { CAUSAL_TOOL_IDS } from '../src/inkbox/sim/interventionFeedback.js';

function fixture() {
  const world = new World(24, 24, 81001);
  world.height.fill(.4); world.water.fill(.08);
  const history = new History(), messages = [];
  const sandbox = { world, history, notify: message => messages.push(message),
    qol: { syncUndoState() {} }, observeEcho: { refresh() {} },
    selectTool(id) { this.toolId = id; },
    applyTool(first, { point, radius }) { TOOL_BY_ID.drain.apply({ world, history, x: point.x + .5, y: point.y + .5, radius, amount: .03 }); },
    undo() { return !!history.undo(world); } };
  const adapter = Object.assign(Object.create(Render3DAdapter.prototype), {
    sandbox, active: true, mode: 'drain', radius: 3, editOrder: 0,
    undoStack: [], redoStack: [], renderer: { world, activePlane: 'mortal', markTerrainDirty() {} },
    hit: event => ({ plane: 'mortal', x: event.x, y: event.y, world: { x: event.x, y: event.y } }),
    canSculpt: () => true,
  });
  return { world, history, adapter, sandbox, messages };
}

{
  const f = fixture(), before = Array.from(f.world.water);
  f.adapter.drainStroke = { world: f.world, radius: 3, points: [] };
  f.adapter.sampleDrainStroke({ x: 8, y: 8 });
  f.adapter.sampleDrainStroke({ x: 9, y: 8 });
  assert.deepEqual(Array.from(f.world.water), before, 'sampling a pending gesture does not edit World');
  assert.equal(f.adapter.commitDrainStroke({ x: 10, y: 8 }), true);
  assert.equal(f.history.stack.length, 1, 'one mouse gesture creates one history transaction');
  assert.equal(readObserveEcho(f.world).marks.length, 1, 'one gesture creates one mark');
  assert(f.world.water[f.world.idx(8, 8)] < before[f.world.idx(8, 8)]);
  assert.equal(f.adapter.undo(), true, 'Three undo delegates to the water History');
  assert.deepEqual(Array.from(f.world.water), before);
  assert.equal(readObserveEcho(f.world).marks[0].status, 'undone');
  assert.equal(f.adapter.redoStack.length, 0, 'water undo never claims a terrain redo');
  console.log('PASS Three sampled drain gesture, one real transaction/mark and water undo');
}
{
  const f = fixture(), before = Array.from(f.world.water);
  f.adapter.drainStroke = { world: f.world, radius: 3, points: [{ x: 8, y: 8 }] };
  f.adapter.endStroke();
  assert.deepEqual(Array.from(f.world.water), before);
  assert.equal(readObserveEcho(f.world).marks.length, 0);
  assert.equal(f.adapter.drainStroke, null);
  f.adapter.drainStroke = { world: new World(24, 24), radius: 3, points: [{ x: 8, y: 8 }] };
  assert.equal(f.adapter.commitDrainStroke({ x: 8, y: 8 }), false);
  assert.deepEqual(Array.from(f.world.water), before, 'replaced World rejects the pending gesture');
  console.log('PASS interrupted and stale-world drain gestures leave no effect or mark');
}
{
  const f = fixture();
  f.adapter.drainStroke = { world: f.world, radius: 3, points: [{ x: 8, y: 8 }] };
  f.adapter.commitDrainStroke({ x: 8, y: 8 });
  f.world.water[f.world.idx(8, 8)] += .01;
  const changed = f.world.water[f.world.idx(8, 8)];
  assert.equal(f.adapter.undo(), false, 'later changes refuse unsafe whole-water undo');
  assert.equal(f.world.water[f.world.idx(8, 8)], changed);
  assert.equal(readObserveEcho(f.world).marks[0].status, 'undo-refused');
  console.log('PASS Three unsafe undo preserves later water and records refusal');
}
{
  const f = fixture(), index = f.world.idx(8, 8), before = f.world.water[index];
  // This is the same History entry Canvas commits, with no adapter-only tag.
  f.history.begin({ toolId: 'drain', x: 8, y: 8, radius: 3 });
  f.sandbox.applyTool(true, { point: { x: 8, y: 8 }, radius: 3 });
  f.history.end('抽水');
  assert(f.world.water[index] < before);
  assert.equal(f.adapter.undo(), true, 'Canvas water entry stays undoable after entering Three');
  assert.equal(f.world.water[index], before);
  console.log('PASS Canvas-to-Three retains shared water undo identity');
}
{
  // Exercise the actual DOM-free method bodies, including applyTool's callers,
  // rather than replacing the legacy HP mutation with a test implementation.
  const source = readFileSync(new URL('../src/inkbox/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('  applyTool(isFirst,');
  const end = source.indexOf('\n  rebuildVillageCache()', start);
  const method = source.slice(start, end).trim();
  const cache = source.slice(end).match(/^\n  rebuildVillageCache\(\) \{[\s\S]*?\n  }/)[0].trim();
  const methods = new Function('LIMITS', 'accessBounds', 'canAccess', 'CAUSAL_TOOL_IDS', 'observeToolBefore', 'observeToolAfter',
    `return ({${method},${cache}});`)(LIMITS, accessBounds, canAccess, CAUSAL_TOOL_IDS, observeToolBefore, observeToolAfter);
  const f = fixture();
  f.world.villages.push({ id: 7, x: 18, y: 18, name: '湿村', hp: 80, food: 20, pop: 1, houses: [] });
  Object.assign(f.sandbox, methods, { tool: TOOL_BY_ID.drain, life: { events: { nextEventId: 1 } } });
  f.sandbox.qol.markDirty = () => {};
  f.history.begin({ toolId: 'drain', x: 8, y: 8, radius: 3 });
  f.sandbox.applyTool(false, { point: { x: 8, y: 8 }, radius: 3 });
  f.history.end('抽水');
  assert.equal(f.world.villages[0].hp, 80, 'draining elsewhere cannot damage a wet village');
  assert(f.history.undo(f.world));
  assert.equal(f.world.villages[0].hp, 80, 'water undo leaves no hidden HP penalty');
  f.world.water.fill(0); f.world.water[f.world.idx(18, 18)] = .2;
  f.history.begin({ toolId: 'drain', x: 8, y: 8, radius: 3 });
  f.sandbox.applyTool(false, { point: { x: 8, y: 8 }, radius: 3 });
  f.history.end('抽水');
  assert.equal(f.world.villages[0].hp, 80, 'a dry no-op cannot damage a distant wet village');
  assert.equal(readObserveEcho(f.world).marks.length, 1, 'dry no-op creates no extra mark');
  console.log('PASS formal Sandbox drain, undo and dry no-op never apply hidden settlement HP damage');
}
