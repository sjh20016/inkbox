import assert from 'node:assert/strict';
import { fixture } from './inkbox-g1-fixtures.mjs';
import { createEnvironmentObservationRuntime, environmentPointVisible, createEnvironmentVisibility } from '../src/inkbox/g2/environmentObservationRuntime.js';
import { createSandboxCharacterRuntime } from '../src/inkbox/g1/sandboxRuntime.js';
import { Render3DAdapter } from '../src/inkbox/render3d/Render3DAdapter.js';
import { getRealmViewState } from '../src/inkbox/ui/realmViewState.js';
import { createEnvironmentObserverView } from '../src/inkbox/ui/g2/environment/environmentObserverView.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { burnForest, History } from '../src/inkbox/sim/powers.js';
import { extinguish } from '../src/inkbox/sim/ecology.js';
import { advanceWorld } from '../src/inkbox/sim/advance.js';

let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }
const f = fixture(20261013);
const i = f.world.veg.findIndex((value, index) => value > .45 && f.world.water[index] < .02
  && index % f.world.w > 8 && index % f.world.w < f.world.w - 9
  && Math.floor(index / f.world.w) > 8 && Math.floor(index / f.world.w) < f.world.h - 9);
assert(i >= 0, 'Official fixture contains authentic vegetated land');
const x = i % f.world.w, y = Math.floor(i / f.world.w);
let world = f.world, visible = true, context = { key: 'mortal-open', plane: 'mortal' }, focus = [];
const runtime = createEnvironmentObservationRuntime({ getWorld: () => world, getContext: () => context,
  isVisible: () => visible, onFocus: effect => focus.push(effect) });
const action = type => ({ type, contextId: runtime.current().contextId, observationId: runtime.current().observationId });
function burn() { const history = new History(); history.begin(); burnForest(world, x + .5, y + .5, 2, history); history.end('焚林'); }

check('Formal burning, frozen baseline, current facts and authoritative focus', () => {
  assert(runtime.select({ x, y }).ok);
  const before = runtime.current().observation;
  assert(runtime.handleAction(action('record-baseline')).ok);
  burn();
  const burning = runtime.refresh();
  assert(burning.observation.environment.activeFireCells > 0);
  assert(burning.observation.environment.scorchedCells > 0);
  assert(burning.comparison.changes.vegetationMean < 0);
  assert.equal(before.environment.activeFireCells, 0);
  assert(Object.isFrozen(burning.observation.environment));
  const forged = { ...action('focus-area'), plane: 'nether', x: -999, y: -999 };
  assert(runtime.handleAction(forged).ok); assert.equal(focus.at(-1).x, x); assert.equal(focus.at(-1).plane, 'mortal');
});
check('Same World official advance keeps the session baseline; read does not alter save/RNG', () => {
  const baselineDay = runtime.current().baselineDay;
  for (let n = 0; n < 6; n++) advanceWorld(world, .8, { life: f.life, upperLife: f.upperLife, rng: f.ecoRng, state: f.state });
  const vm = runtime.refresh(); assert.equal(vm.baselineDay, baselineDay); assert(vm.comparison.deltaDays > 0);
  const saved = JSON.stringify(serializeWorld(world)), draws = [f.draws(), f.ecoDraws()];
  for (let n = 0; n < 20; n++) { runtime.refresh(); runtime.current(); }
  assert.equal(JSON.stringify(serializeWorld(world)), saved); assert.deepEqual([f.draws(), f.ecoDraws()], draws);
});
check('Bounded fire discovery rechecks live fire and rejects UI-provided coordinates', () => {
  burn();
  assert(runtime.handleAction(action('find-fires')).ok);
  const vm = runtime.current(); assert(vm.search.items.length > 0 && vm.search.items.length <= 12);
  const found = vm.search.items.find(item => Math.hypot(item.location.x - x, item.location.y - y) < 4);
  assert(found);
  const observe = { type: 'observe-fire', contextId: vm.contextId, observationId: found.id, x: -99, y: -99 };
  assert(runtime.handleAction(observe).ok); assert.equal(focus.at(-1).x, found.location.x);
  extinguish(world, found.location.x, found.location.y, 1);
  assert.equal(runtime.handleAction(observe).ok, false);
});
check('Read/load/new World/source/buffer replacement and visibility invalidate old actions', () => {
  runtime.select({ x, y }); runtime.handleAction(action('record-baseline'));
  const stale = action('focus-area'); world = deserializeWorld(serializeWorld(world));
  assert.equal(runtime.handleAction(stale).ok, false); assert.equal(runtime.current().baselineDay, null);
  assert(runtime.current().message.includes('未作为长期史料存档'));
  context = { ...context, key: 'loaded-view-closed' };
  assert(runtime.current().message.includes('未作为长期史料存档'), 'closing a loaded view must retain the invalidation explanation');
  runtime.select({ x, y }); const current = action('focus-area'); visible = false;
  assert.equal(runtime.handleAction(current).ok, false); runtime.refresh(); assert.equal(runtime.current().observationId, null);
  visible = true; runtime.select({ x, y }); const bufferAction = action('focus-area');
  world.veg = new Float32Array(world.veg); assert.equal(runtime.handleAction(bufferAction).ok, false);
  runtime.refresh(); assert.equal(runtime.current().baselineDay, null);
  runtime.select({ plane: 'upper', x, y }); const childAction = action('focus-area');
  world.upper = deserializeWorld(serializeWorld(world.upper)); assert.equal(runtime.handleAction(childAction).ok, false);
  world = fixture(20261013).world; assert.equal(runtime.handleAction(childAction).ok, false);
});
check('Plane/map-access/Region changes clear comparisons; same effective renderer context preserves them', () => {
  runtime.select({ x, y }); runtime.handleAction(action('record-baseline'));
  const id = runtime.current().observationId;
  context = { ...context }; runtime.refresh(); assert.equal(runtime.current().observationId, id);
  const stale = action('focus-area'); context = { key: 'upper-window', plane: 'mortal', region: {} };
  assert.equal(runtime.handleAction(stale).ok, false); assert.equal(runtime.current().baselineDay, null);
  context = { key: 'mortal-stage-0', plane: 'mortal' }; runtime.select({ x, y });
  const old = action('record-baseline'); context = { key: 'mortal-stage-1', plane: 'mortal' };
  assert.equal(runtime.handleAction(old).ok, false);
});
check('Terrain cell-center Realm Mask matches mortal/upper/nether and progressive boundary cells', () => {
  const sb = { world, getRealmViewState: () => ({ open: true, targetPlane: 'upper',
    region: { contains: (px, py) => px > x && px < x + 1 && py > y && py < y + 1 } }) };
  assert.equal(environmentPointVisible(sb, 'mortal', x, y), false);
  assert.equal(environmentPointVisible(sb, 'upper', x, y), true);
  assert.equal(environmentPointVisible(sb, 'nether', x, y), false);
  sb.getRealmViewState = () => ({ open: false });
  assert.equal(environmentPointVisible(sb, 'mortal', world.w - 1, world.h - 1), true);
  sb.render3d = { active: true, renderer: { activePlane: 'nether' } };
  assert.equal(environmentPointVisible(sb, 'mortal', x, y), false);
  assert.equal(environmentPointVisible(sb, 'nether', x, y), true);
});
check('Unselected fire search invalidates on buffer replacement; one scan captures visibility once', () => {
  const test = fixture(203), activeWorld = test.world;
  const history = new History(); history.begin(); burnForest(activeWorld, x + .5, y + .5, 2, history); history.end('焚林');
  const orphan = createEnvironmentObservationRuntime({ getWorld: () => activeWorld, isVisible: () => true });
  const contextId = orphan.current().contextId;
  orphan.handleAction({ type: 'find-fires', contextId });
  assert(orphan.current().search.items.length); assert.equal(orphan.current().observationId, null);
  const oldId = orphan.current().search.items[0].id;
  activeWorld.fire = new Float32Array(activeWorld.fire); orphan.refresh();
  assert.equal(orphan.current().search, null);
  assert.equal(orphan.handleAction({ type: 'observe-fire', contextId, observationId: oldId }).ok, false);
  let viewReads = 0;
  const visible = createEnvironmentVisibility({ world: activeWorld, getRealmViewState() { viewReads++; return { open: false }; } });
  for (let k = 0; k < 100; k++) visible('mortal', k % activeWorld.w, 1);
  assert.equal(viewReads, 1); orphan.destroy();
});
check('Canvas character selection observes the same actual entity location as Three inspection', () => {
  const selected = [], entity = world.entities.find(e => e.hp > 0 && e.sp === 'cultivator'); assert(entity);
  entity.x = x + .8; entity.y = y + .8;
  const environment = createEnvironmentObservationRuntime({ getWorld: () => world, isVisible: () => true });
  const sb = { world, environmentObservation: { select(input) { selected.push(input); return environment.select(input); } } };
  const character = createSandboxCharacterRuntime(sb);
  assert(character.choose({ world, key: 'mortal:' + entity.id, entity, plane: 'mortal' }).ok);
  assert.deepEqual(selected.at(-1), { plane: 'mortal', x: Math.floor(entity.x), y: Math.floor(entity.y) });
  assert.deepEqual(environment.current().observation.location, { x, y }, 'Canvas shares the Three entity floor cell');
  const n = selected.length;
  assert.equal(character.choose({ world: {}, key: 'mortal:' + entity.id, entity, plane: 'mortal' }).ok, false);
  assert.equal(selected.length, n); character.destroy(); environment.destroy();
});
check('Three window short click inspects the real child without committing rifts; drag and old World are guarded', () => {
  const selection = { x0: x - 3, y0: y - 3, x1: x + 3, y1: y + 3, area: 36,
    path: [[x - 3, y - 3], [x + 3, y - 3], [x + 3, y + 3], [x - 3, y + 3]] };
  let commits = 0, inspected = [], activeSelection = selection;
  const renderer = { world, stages: new Map([['upper', { world: world.upper }]]), setDraftPath() {}, setSelection() {} };
  const environment = createEnvironmentObservationRuntime({ getWorld: () => world, isVisible: () => true });
  const sb = { world, toolId: 'viewUpper', environmentObservation: environment,
    getRealmViewState: () => getRealmViewState({ selection: activeSelection, toolId: sb.toolId }),
    inspectPlaneAt: (...args) => inspected.push(args), commitSelection: () => commits++ };
  const adapter = Object.create(Render3DAdapter.prototype); adapter.sandbox = sb; adapter.renderer = renderer; adapter.mode = 'viewUpper';
  adapter.hit = () => ({ plane: 'upper', x, y, kind: 'terrain' });
  const draw = () => ({ world, press: { x: 100, y: 100 }, viewRegion: sb.getRealmViewState().region,
    targetPlane: 'upper', mode: adapter.mode, toolId: sb.toolId, path: selection.path, source: world.upper });
  const saved = JSON.stringify(serializeWorld(world)), region = sb.getRealmViewState().region;
  adapter.realmDraw = draw();
  assert.equal(adapter.commitRealmDraw({ clientX: 101, clientY: 101 }).inspected, true);
  assert.equal(commits, 0); assert.deepEqual(inspected.at(-1), ['upper', x, y]);
  assert.equal(environment.current().observation.plane, 'upper'); assert.equal(sb.getRealmViewState().region, region);
  assert.equal(JSON.stringify(serializeWorld(world)), saved, 'child inspection must not mutate World or reopen rifts');
  adapter.realmDraw = draw(); adapter.commitRealmDraw({ clientX: 120, clientY: 120 }); assert.equal(commits, 1);
  adapter.realmDraw = draw(); activeSelection = null;
  assert.equal(adapter.commitRealmDraw({ clientX: 120, clientY: 120 }), null); assert.equal(commits, 1);
  activeSelection = selection; adapter.realmDraw = draw(); sb.toolId = 'viewNether';
  assert.equal(adapter.commitRealmDraw({ clientX: 120, clientY: 120 }), null); assert.equal(commits, 1); sb.toolId = 'viewUpper';
  adapter.realmDraw = draw(); sb.world = {}; assert.equal(adapter.commitRealmDraw({ clientX: 101, clientY: 101 }), null);
  assert.equal(commits, 1); assert.equal(inspected.length, 1); environment.destroy();
});

class Element {
  constructor(doc, tag) { this.ownerDocument = doc; this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null;
    this.dataset = {}; this.listeners = new Map(); this.attributes = {}; this._text = ''; this.scrollTop = 0; }
  set innerHTML(value) { throw Error('Observer must use text, not HTML'); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get textContent() { return this._text + this.children.map(e => e.textContent).join(''); }
  get lastChild() { return this.children.at(-1); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  append(...nodes) { for (const child of nodes) { child.remove(); child.parentNode = this; this.children.push(child); } }
  replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this._text = ''; this.append(...nodes); }
  remove() { if (this.parentNode) { const parent = this.parentNode; parent.children.splice(parent.children.indexOf(this), 1); this.parentNode = null; } }
  contains(node) { for (let p = node; p; p = p.parentNode) if (p === this) return true; return false; }
  closest(selector) { for (let p = this; p; p = p.parentNode) if (selector === '[data-environment-action]' && p.dataset.environmentAction) return p; return null; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  click() { if (this.disabled) return; for (let p = this; p; p = p.parentNode) for (const fn of p.listeners.get('click') || []) fn({ target: this }); }
}
const doc = { createElement: tag => new Element(doc, tag) }, root = doc.createElement('div');
const find = (element, type) => [element, ...element.children.flatMap(e => find(e, type))].filter(e => e.dataset.environmentAction === type);
let active = world, calls = [], webRuntime;
const view = createEnvironmentObserverView(root, { onAction: request => { calls.push(request); webRuntime.handleAction(request); } });
webRuntime = createEnvironmentObservationRuntime({ getWorld: () => active, isVisible: () => true, view });
check('Real observer buttons carry current opaque context/area IDs without rebuilding DOM', () => {
  webRuntime.select({ x, y }); const button = find(root, 'record-baseline')[0];
  doc.activeElement = button; button.click(); assert.equal(calls.length, 1); assert.equal(webRuntime.current().baselineDay, active.day);
  for (let n = 0; n < 10; n++) webRuntime.refresh(); assert.equal(find(root, 'record-baseline')[0], button); assert.equal(doc.activeElement, button);
  assert(root.textContent.includes('会话')); assert(root.textContent.includes('火势'));
});
check('Old DOM before readback cannot record/focus a new World; destroyed view removes listeners', () => {
  const button = find(root, 'record-baseline')[0]; active = deserializeWorld(serializeWorld(active));
  button.click(); assert.equal(webRuntime.current().baselineDay, null);
  const n = calls.length; webRuntime.destroy(); webRuntime.destroy(); button.click(); assert.equal(calls.length, n);
  assert.equal(root.children.length, 0); assert.equal(webRuntime.handleAction({ type: 'focus-area' }).reason, 'destroyed');
});
runtime.destroy();
console.log(`G23 runtime/web: ${checks} groups passed`);
