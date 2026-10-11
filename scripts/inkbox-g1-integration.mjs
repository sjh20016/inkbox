import assert from 'node:assert/strict';
import { fixture } from './inkbox-g1-fixtures.mjs';
import { buildCharacterViewModel, createCharacterController } from '../src/inkbox/g1/characterRuntime.js';
import { createSandboxCharacterRuntime } from '../src/inkbox/g1/sandboxRuntime.js';
import { showPersonCardPanel, hidePersonCardPanel, showCharacterRelationsPanel, openWatchRowPanel, bindBusanziTogglePanel, refreshBusanziPanel } from '../src/inkbox/ui/railPanels.js';
import { greetOnBoot } from '../src/inkbox/sim/busanzi.js';
import { rememberDead } from '../src/inkbox/sim/necrology.js';
import { spawnNetherGhost } from '../src/inkbox/sim/netherLife.js';
import { createSandboxWorld, syncCreationControls, requestSandboxMapExpansion } from '../src/inkbox/ui/worldCreation.js';
import { buildWorldProgressViewModel, buildWorldCreationInfoViewModel } from '../src/inkbox/g1/worldRuntime.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
class Element {
  constructor(doc, tag) {
    this.ownerDocument = doc; this.tagName = tag.toUpperCase(); this.children = [];
    this.parentNode = null; this.dataset = {}; this.style = {}; this.attributes = {};
    this.listeners = new Map(); this.hidden = false; this.disabled = false;
    this.className = ""; this._text = ""; this.scrollTop = 0;
    this.classList = { add: value => { if (!this.className.split(/\s+/).includes(value)) this.className = [this.className, value].filter(Boolean).join(" "); } };
  }
  set textContent(value) {
    for (const item of this.children) item.parentNode = null;
    this.children = []; this._text = String(value);
  }
  get textContent() { return this._text + this.children.map(x => x.textContent).join(""); }
  get lastChild() { return this.children.at(-1) || null; }
  setAttribute(k,v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  append(...items) {
    for (const item of items) {
      if (item._fragment) { this.append(...item.children.slice()); item.children = []; continue; }
      if (item.parentNode) item.remove(); item.parentNode = this; this.children.push(item);
    }
  }
  replaceChildren(...items) {
    for (const child of this.children) child.parentNode = null;
    this.children = []; this._text = ""; this.append(...items);
  }
  remove() {
    if (!this.parentNode) return;
    const group = this.parentNode.children;
    const index = group.indexOf(this);
    if (index >= 0) group.splice(index,1);
    this.parentNode = null;
  }
  contains(other) { for (let p = other; p; p = p.parentNode) if (p === this) return true; return false; }
  closest(selector) {
    for (let p = this; p; p = p.parentNode)
      if (selector === "button[data-g1-action]" && p.tagName === "BUTTON" && p.dataset.g1Action) return p;
    return null;
  }
  addEventListener(k,listener) {
    if (!this.listeners.has(k)) this.listeners.set(k,new Set());
    this.listeners.get(k).add(listener);
  }
  removeEventListener(k,listener) { this.listeners.get(k)?.delete(listener); }
  focus() { this.ownerDocument.activeElement = this; }
  click() { this.dispatch("click"); }
  dispatch(kind,key) {
    if (this.disabled) return;
    const event = {target:this, key, prevented:false, preventDefault(){ this.prevented = true; }};
    for(let p=this;p;p=p.parentNode) for(const f of p.listeners.get(kind)||[]) f(event);
    return event;
  }
}
class Document { createElement(tag) { return new Element(this,tag); } }
Document.prototype.createElementNS = function(_namespace, tag) { return this.createElement(tag); };
Document.prototype.createDocumentFragment = function() { const fragment = this.createElement("fragment"); fragment._fragment = true; return fragment; };
function match(root,predicate) {
  const result = [];
  function walk(x) { if(predicate(x)) result.push(x); for(const child of x.children) walk(child); }
  walk(root); return result;
}
function actions(root,type) {return match(root,x=>x.dataset?.g1Action===type);}

const doc = new Document(), nodes = new Map();
doc.getElementById = id => nodes.get(id) || null;
for (const id of ['inkPersonDetail', 'inkG1WorldProgress', 'inkG1WorldCreationInfo', 'inkMapProgress', 'inkBtnExpand']) {
  const element = doc.createElement('div');
  const classes = new Set(); element.classList = { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key) };
  nodes.set(id, element);
}
globalThis.document = doc;
const panel = nodes.get('inkPersonDetail');
function snapshot(world) { return JSON.stringify(serializeWorld(world)); }
function host(world) {
  const events = [], snapshots = [];
  const sb = { world, focusPulses: [], camera: { zoom: 7, focusOn: (...args) => events.push(['focus', ...args]) },
    qol: { markDirty: kind => events.push(['dirty', kind]), noteRecent() {} }, notify() {}, refreshRecent() {}, refreshWatch() {},
    refreshChronicle() {}, refreshNotables() {}, downloadText: (...args) => events.push(['export', ...args]) };
  sb.g1 = createSandboxCharacterRuntime(sb, { render(...args) { snapshots.push(args[1]); showPersonCardPanel(...args); }, hide: hidePersonCardPanel, relations: showCharacterRelationsPanel });
  return { sb, events, snapshots };
}
check('actual host uses four-tab pure VM, patches same selection and destroys old listeners on reselect/close', () => {
  const { world, entity } = fixture(861); const { sb } = host(world), key = 'mortal:' + entity.id;
  sb.g1.open(key); assert.equal(panel.dataset.characterKey, key);
  const card = panel.children[0], tabs = actions(panel, 'tab'); assert.equal(tabs.length, 4);
  const portrait = match(card, x => x.className === 'g1-character__portrait')[0];
  const portraitSvg = match(portrait, x => x.className.includes('g2-portrait-v2__svg'))[0];
  assert.ok(portraitSvg); assert.equal(portraitSvg.getAttribute('viewBox'), '0 0 100 100');
  const visibleSlots = portraitSvg.children.map(slot => slot.getAttribute('data-slot'));
  assert.equal(visibleSlots.length, 14); assert.ok(visibleSlots.includes('face') && visibleSlots.includes('eyes'));
  tabs[3].click(); const body = match(panel, x => x.className === 'g1-character__body')[0]; body.scrollTop = 55;
  world.day++; entity.exp++; sb.g1.refresh(); assert.equal(panel.children[0], card); assert.equal(body.scrollTop, 55);
  assert.equal(tabs[3].getAttribute('aria-selected'), 'true'); assert.match(panel.textContent, /残卷.*不能视为完整一生/);
  const oldWatch = actions(panel, 'watch')[0]; sb.g1.open(key); assert.notEqual(panel.children[0], card);
  assert.equal(card.listeners.get('click').size, 0); const before = snapshot(world); oldWatch.click(); assert.equal(snapshot(world), before);
  actions(panel, 'watch')[0].click(); assert.equal(sb.g1.current().watched, true);
  const mounted = panel.children[0]; sb.g1.close(); assert.equal(panel.children.length, 0); assert.equal(mounted.listeners.get('click').size, 0);
  assert.equal(panel.dataset.characterKey, undefined);
});
check('watch cap12 permissions disable add while existing/dead remembered targets can withdraw', () => {
  const { world, entity } = fixture(862), { sb } = host(world), key = 'mortal:' + entity.id;
  world.watch = Array.from({ length: 12 }, (_, i) => ({ key: 'mortal:' + (900000 + i) }));
  sb.g1.open(key); assert.equal(sb.g1.current().permissions.canWatch, false);
  assert.match(sb.g1.current().permissions.watchDisabledReason, /十二/);
  const button = actions(panel, 'watch')[0]; assert.equal(button.disabled, true);
  const before = snapshot(world); button.click(); assert.equal(snapshot(world), before);
  world.watch[0].key = key; sb.g1.refresh(); assert.equal(sb.g1.current().permissions.canWatch, true);
  rememberDead(world, entity); world.entities.splice(world.entities.indexOf(entity), 1); sb.g1.refresh();
  assert.equal(sb.g1.current().identity.status, 'dead'); assert.equal(actions(panel, 'watch')[0].disabled, false);
  actions(panel, 'watch')[0].click(); assert.equal(world.watch.some(w => w.key === key), false);
  assert.equal(actions(panel, 'watch')[0].disabled, true); sb.g1.close();
});
check('upper/nether focus uses runtime permissions including proven migration and fresh lock checks', () => {
  const { world, entity } = fixture(863), { sb, events } = host(world), key = 'mortal:' + entity.id;
  const upper = { ...entity, id: 99001 }; world.upper.entities.push(upper);
  sb.g1.open('upper:' + upper.id); assert.equal(sb.g1.current().permissions.canWatch, false);
  assert.equal(actions(panel, 'watch')[0].disabled, true); assert.equal(actions(panel, 'focus')[0].hidden, false);
  actions(panel, 'focus')[0].click(); assert.equal(events.at(-1)[0], 'focus');
  sb.g1.open(key); world.entities.splice(world.entities.indexOf(entity), 1);
  const ghost = spawnNetherGhost(world.nether, { kind: 'ghost', ghostOf: { ref: key, route: null, deathDay: world.day } });
  ghost.x = 32; ghost.y = 20; sb.g1.refresh();
  assert.equal(sb.g1.current().identity.status, 'nether'); assert.equal(sb.g1.current().permissions.canFocus, true);
  assert.match(panel.textContent, /已落幽冥/); assert.equal(actions(panel, 'focus')[0].hidden, false);
  actions(panel, 'focus')[0].click(); assert.equal(events.at(-1)[0], 'focus');
  world.mapProgress.stage = 0; ghost.x = 0; ghost.y = 0;
  const before = snapshot(world), n = events.length; actions(panel, 'focus')[0].click();
  assert.equal(events.length, n); assert.equal(snapshot(world), before); assert.equal(actions(panel, 'focus')[0].hidden, true);
  sb.g1.close();
});
check('old callbacks reject new World/reused ID, and all command effects sent to presentation contain snapshots only', () => {
  const { world, entity } = fixture(864), key = 'mortal:' + entity.id; let currentWorld = world;
  const controller = createCharacterController({ getWorld: () => currentWorld }); controller.select(key);
  const relations = controller.handleAction({ type: 'show-relations', targetKey: key }).effect;
  assert.ok(Array.isArray(relations.relations)); assert.equal(Object.hasOwn(relations, 'entity'), false);
  const focus = controller.handleAction({ type: 'focus', targetKey: key }).effect; assert.equal(Object.hasOwn(focus, 'entity'), false);
  const vm = buildCharacterViewModel(world, key); const all = new Set();
  function verify(value) { if (!value || typeof value !== 'object' || all.has(value)) return; all.add(value); assert.notEqual(value, world); assert.notEqual(value, entity); assert.ok(Object.isFrozen(value)); for (const item of Object.values(value)) verify(item); }
  verify(vm);
  currentWorld = deserializeWorld(JSON.parse(snapshot(world))); const before = snapshot(currentWorld);
  assert.equal(controller.handleAction({ type: 'watch', targetKey: key }).ok, false); assert.equal(snapshot(currentWorld), before);
});
check('stage0..3 adapt one-way to40/60/80/100 and mounted real seed0/preset/old-world information', () => {
  const world = createSandboxWorld({ w: 32, h: 24 }, 0, { terrainPreset: 'mountains', progressive: true });
  for (let stage = 0; stage < 4; stage++) { world.mapProgress.stage = stage; const vm = buildWorldProgressViewModel(world); assert.equal(vm.stage, [40,60,80,100][stage]); assert.equal(vm.canRequestExpand, stage < 3); }
  world.mapProgress.stage = 0; const info = buildWorldCreationInfoViewModel(world); assert.equal(info.seed, 0); assert.equal(info.terrainName, '群山世界'); assert.deepEqual(info.mapSize, { width:32, height:24 });
  const sb = { world, terrain: { invalidate() {} }, camera: { fit() {} }, qol: { markDirty() {} }, notify() {} };
  syncCreationControls(sb); assert.match(nodes.get('inkG1WorldCreationInfo').textContent, /世界种子0/); assert.match(nodes.get('inkG1WorldCreationInfo').textContent, /群山世界/);
  assert.match(nodes.get('inkG1WorldProgress').textContent, /初开天眼/); assert.match(nodes.get('inkG1WorldProgress').textContent, /360 日/);
  const oldButton = match(nodes.get('inkG1WorldProgress'), x => x.tagName === 'BUTTON')[0];
  const legacy = createSandboxWorld({ w: 32, h: 24 }, 0, { generationVersion: 1, progressive: false }); sb.world = legacy; syncCreationControls(sb);
  const before = snapshot(legacy); oldButton.click(); assert.equal(snapshot(legacy), before);
  assert.match(nodes.get('inkG1WorldCreationInfo').textContent, /旧版地貌/); assert.equal(buildWorldProgressViewModel(legacy).canRequestExpand, false);
});
check('map expansion rechecks World and exact stage then uses existing mutation/dirty/cache guards', () => {
  const world = createSandboxWorld({ w: 32, h:24 }, 0, { progressive:true }), dirty = [], cache = [];
  const sb = { world, render3d: { endStroke: () => cache.push('stroke') }, terrain: { invalidate: () => cache.push('terrain') }, camera: { fit() {} }, qol: { markDirty: key => dirty.push(key) }, notify() {} };
  const request = { type:'request-map-expansion', stage:40 }, before = snapshot(world);
  assert.equal(requestSandboxMapExpansion(sb, world, 60, request), false); assert.equal(snapshot(world), before);
  assert.equal(requestSandboxMapExpansion(sb, { ...world }, 40, request), false); assert.equal(snapshot(world), before);
  syncCreationControls(sb); match(nodes.get('inkG1WorldProgress'), x => x.tagName === 'BUTTON')[0].click();
  assert.equal(world.mapProgress.stage, 1); assert.deepEqual(dirty, ['terrain']); assert.deepEqual(cache, ['stroke','terrain']); assert.equal(sb.dirty, true);
  assert.equal(requestSandboxMapExpansion(sb, world, 40, request), false); assert.deepEqual(dirty, ['terrain']);
});
check('actual retained DOM command rejects replaced identity and World without touching either simulation', () => {
  const { world, entity } = fixture(865), { sb } = host(world), key = 'mortal:' + entity.id;
  sb.g1.open(key); const oldEdict = actions(panel, 'edict')[0];
  const replacement = { ...entity }; world.entities[world.entities.indexOf(entity)] = replacement;
  const before = snapshot(world); oldEdict.click(); assert.equal(snapshot(world), before); assert.equal(panel.children.length, 0);
  sb.g1.open(key); const oldWatch = actions(panel, 'watch')[0];
  const next = deserializeWorld(JSON.parse(snapshot(world))); sb.world = next;
  const nextBefore = snapshot(next); oldWatch.click(); assert.equal(snapshot(next), nextBefore); assert.equal(snapshot(world), before);
  assert.equal(panel.children.length, 0);
});
check('formal Life death followed by watch-row opening displays reliable death news absent from retained biography', () => {
  const { world, entity, life } = fixture(866), { sb, snapshots } = host(world), key = 'mortal:' + entity.id;
  world.watch = [{ key, name: entity.name, addedDay: 0, lastReadDay: 0, lastKnownId: entity.id, lastKnownPlane: 'mortal' }];
  entity.hp = 0; world.day = 20; life.onDeath(entity);
  world.entities.splice(world.entities.indexOf(entity), 1);
  openWatchRowPanel(sb, key);
  const vm = snapshots.at(-1), observation = vm.observation;
  assert.equal(vm.identity.status, 'dead'); assert.equal(vm.history.some(row => row.kind === 'death'), false);
  assert.equal(world.watch[0].lastReadDay, 20);
  assert.ok(observation.events.some(row => row.kind === 'death' && row.day === 20 && row.text === '逝者名录：殁'));
  assert.equal(observation.sinceDay, 0); assert.equal(observation.throughDay, 20); assert.equal(observation.coverage.complete, false);
  assert.ok(Object.isFrozen(vm)); assert.ok(Object.isFrozen(observation)); assert.ok(Object.isFrozen(observation.events));
  function checkSnapshot(value) {
    if (!value || typeof value !== 'object') return;
    assert.notEqual(value, world); assert.notEqual(value, entity);
    assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) checkSnapshot(child);
  }
  checkSnapshot(vm);
  actions(panel, 'tab')[3].click();
  const news = match(panel, x => x.className === 'g1-character__observation')[0];
  assert.equal(news.hidden, false); assert.match(news.textContent, /记挂近况/);
  assert.match(news.textContent, /第 0 日至第 20 日/); assert.match(news.textContent, /第 20 日逝者名录：殁/);
  assert.match(news.textContent, /不是完整生平/);
  const body = match(panel, x => x.className === 'g1-character__body')[0]; body.scrollTop = 45;
  world.day = 21; sb.g1.refresh(); assert.equal(body.scrollTop, 45);
  assert.match(news.textContent, /第 0 日至第 21 日/);
  sb.g1.close(); sb.g1.open(key);
  assert.equal(match(panel, x => x.className === 'g1-character__observation')[0].hidden, true);
  sb.g1.close();
});
check('guide card collapses/reopens with one persistent listener and no World/log/dirty/RNG changes', () => {
  const f = fixture(867), { world, rng } = f;
  greetOnBoot(world, rng);
  const box = doc.createElement('div'), button = doc.createElement('button'), lines = doc.createElement('div');
  const classes = new Set(); box.classList = {
    add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key),
    toggle(key, force) { if (force) classes.add(key); else classes.delete(key); },
  };
  nodes.set('inkBusanzi', box); nodes.set('inkBusanziToggle', button); nodes.set('inkBusanziLines', lines);
  const sb = { world, busanziCollapsed: false, dirty: false };
  bindBusanziTogglePanel(sb); bindBusanziTogglePanel(sb);
  assert.equal(button.listeners.get('click').size, 1); assert.equal(button.textContent, '收起引导');
  const before = snapshot(world), draws = f.draws(), ecoDraws = f.ecoDraws();
  button.click(); assert.equal(sb.busanziCollapsed, true); assert.equal(box.classList.contains('is-collapsed'), true);
  assert.equal(button.textContent, '展开引导'); assert.equal(button.getAttribute('aria-expanded'), 'false');
  refreshBusanziPanel(sb); assert.equal(sb.busanziCollapsed, true); assert.equal(box.classList.contains('is-collapsed'), true);
  assert.equal(snapshot(world), before); assert.equal(f.draws(), draws); assert.equal(f.ecoDraws(), ecoDraws); assert.equal(sb.dirty, false);
  const newFixture = fixture(868); greetOnBoot(newFixture.world, newFixture.rng); sb.world = newFixture.world;
  refreshBusanziPanel(sb); assert.equal(sb.busanziCollapsed, true); assert.equal(button.textContent, '展开引导');
  const newBefore = snapshot(sb.world), newDraws = newFixture.draws();
  button.click(); assert.equal(sb.busanziCollapsed, false); assert.equal(box.classList.contains('is-collapsed'), false);
  assert.equal(button.textContent, '收起引导'); assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(snapshot(sb.world), newBefore); assert.equal(newFixture.draws(), newDraws); assert.equal(sb.dirty, false);
});
delete globalThis.document;
console.log('G1 integration contracts: ' + checks + '/' + checks + ' passed');
