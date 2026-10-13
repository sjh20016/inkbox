import assert from 'node:assert/strict';
import { createSandboxWorld } from '../src/inkbox/ui/worldCreation.js';
import { World } from '../src/inkbox/world/World.js';
import { OVER, decayOverlay } from '../src/inkbox/world/terrain.js';
import { burnForest } from '../src/inkbox/sim/powers.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import {
  DEFAULT_OBSERVATION_RADIUS, MAX_OBSERVATION_RADIUS, MAX_FIRE_RESULTS,
  observeEnvironment, findCurrentFires, compareEnvironment,
} from '../src/inkbox/g2/environmentObservation.js';

let checks = 0;
function check(label, fn) { fn(); checks += 1; console.log(`✓ ${label}`); }
function world(seed = 2301, progressive = false) { return createSandboxWorld({ w: 200, h: 128 }, seed, { progressive }); }

check('真实火势、覆盖层和地表统计准确；返回值冻结且无历史或因果推断', () => {
  const root = world();
  const x = Math.floor(root.w / 2), y = Math.floor(root.h / 2), i = y * root.w + x;
  root.fire[i] = 0.0101; root.over[i] = OVER.SCORCHED; root.over[i + 1] = OVER.ASH;
  const result = observeEnvironment(root, { x, y, radius: 1 });
  assert.equal(result.ok, true); assert.equal(result.day, root.day); assert.deepEqual(result.location, { x, y });
  assert.equal(result.environment.activeFireCells, 1); assert.equal(result.environment.scorchedCells, 1);
  assert.equal(result.environment.ashCells, 1); assert(result.environment.vegetationMean >= 0);
  assert.equal(result.evidence.cause, 'unknown'); assert.equal(result.evidence.historyComplete, false);
  assert(result.states.includes('has-fire')); assert(result.states.includes('scorched')); assert(result.states.includes('ash'));
  assert(!result.states.includes('clear'), 'positive disaster facts never coexist with clear');
  assert(Object.isFrozen(result) && Object.isFrozen(result.environment) && Object.isFrozen(result.states));
  assert.throws(() => { result.location.x = 1; }, TypeError);
});

check('非法身份、坐标、半径、缺字段和不可访问中心返回安全结果', () => {
  const root = world();
  assert.equal(observeEnvironment(root, { plane: 'moon', x: 2, y: 2 }).reason, 'invalid-plane');
  assert.equal(observeEnvironment(root, { plane: 'upper', x: 2, y: 2 }).reason, 'missing-world');
  assert.equal(observeEnvironment(root, { x: NaN, y: 2 }).reason, 'invalid-location');
  assert.equal(observeEnvironment(root, { x: root.w, y: 2 }).reason, 'outside-world');
  assert.equal(observeEnvironment(root, { x: -0.4, y: 2 }).reason, 'outside-world');
  assert.equal(observeEnvironment(root, { x: 2, y: 2, radius: MAX_OBSERVATION_RADIUS + 1 }).reason, 'invalid-radius');
  const broken = { ...root, veg: new Float32Array(2) };
  assert.equal(observeEnvironment(broken, { x: 2, y: 2 }).reason, 'invalid-world');
  root.mapProgress = { version: 1, stage: 0 };
  assert.equal(observeEnvironment(root, { x: 0, y: 0 }).reason, 'center-inaccessible');
});

check('遮罩与渐进访问在读字段前过滤；边界采样和常规成本有界', () => {
  const root = world(2302, true), x = Math.floor(root.w / 2), y = Math.floor(root.h / 2);
  root.veg[y * root.w + x + 1] = NaN;
  let blockedChecked = false;
  const result = observeEnvironment(root, { x, y, radius: 2, isVisible: (_plane, px) => {
    if (px === x + 1) { blockedChecked = true; return false; }
    return true;
  } });
  assert(blockedChecked); assert.equal(result.coverage.restrictedCells, 5);
  assert.notEqual(result.environment.vegetationMean, null, 'hidden invalid field is not read');
  assert.equal(result.metrics.cellsVisited, 25);
  const edge = observeEnvironment(world(2308), { x: 1, y: 1, radius: 3 });
  assert.equal(edge.coverage.outOfBoundsCells, 24);
  assert(edge.metrics.cellsVisited <= (DEFAULT_OBSERVATION_RADIUS * 2 + 1) ** 2);
});

check('三界只读本位面：上界灵植可读，幽冥阴性层不冒充常规植被或凡间火情', () => {
  const root = world(2303), upper = new World(root.w, root.h, 2304), nether = new World(root.w, root.h, 2305);
  root.upper = upper; root.nether = nether;
  root.day = 50; upper.day = 10; nether.day = 12;
  const i = 70 * root.w + 100;
  root.fire[i] = 0.8; upper.veg[i] = 0.6; nether.veg[i] = 0.9;
  const up = observeEnvironment(root, { plane: 'upper', x: 100, y: 70, radius: 0 });
  const down = observeEnvironment(root, { plane: 'nether', x: 100, y: 70, radius: 0 });
  assert.equal(up.environment.vegetationKind, 'spiritual-vegetation');
  assert(Math.abs(up.environment.vegetationMean - 0.6) < 1e-6); assert.equal(up.environment.activeFireCells, null);
  assert.equal(up.day, root.day, 'all realms share the root World game date');
  assert.equal(down.environment.vegetationKind, 'yin'); assert.equal(down.environment.vegetationMean, null);
  assert(Math.abs(down.environment.yinMean - 0.9) < 1e-6);
  assert.equal(down.environment.fireSupported, false); assert(down.states.includes('unknown'));
});

check('按需查找有界且服从访问权限；只回报当前火势并明确结果截断', () => {
  const root = world(2304), count = MAX_FIRE_RESULTS + 2;
  for (let n = 0; n < count; n += 1) root.fire[1000 + n] = 0.2 + n / 100;
  const found = findCurrentFires(root);
  assert.equal(found.items.length, MAX_FIRE_RESULTS); assert.equal(found.truncated, true);
  assert.equal(found.metrics.cellsVisited, root.size); assert(found.metrics.cellsVisited <= 512 * 320);
  const hidden = findCurrentFires(root, { isVisible: () => false });
  assert.equal(hidden.items.length, 0); assert.equal(hidden.metrics.cellsVisited, root.size);
  root.fire[64 * root.w + 100] = 0.7;
  root.mapProgress = { version: 1, stage: 0 };
  const locked = findCurrentFires(root);
  assert(locked.items.some(item => item.location.x === 100 && item.location.y === 64));
  assert(locked.items.every(item => item.location.x >= 60 && item.location.x < 140));
  root.upper = new World(root.w, root.h, 2310);
  assert.equal(findCurrentFires(root, { plane: 'upper' }).fireSupported, false);
});

check('对照拒绝不同坐标、位面、采样覆盖或倒退日期；变化只报告数值事实', () => {
  const root = world(2305), a = observeEnvironment(root, { x: 80, y: 60, radius: 2 });
  root.day = 10; root.veg[60 * root.w + 80] = 0.8; root.over[60 * root.w + 80] = OVER.SCORCHED;
  const b = observeEnvironment(root, { x: 80, y: 60, radius: 2 });
  const comparison = compareEnvironment(a, b);
  assert.equal(comparison.ok, true); assert.equal(comparison.deltaDays, 10);
  assert.equal(comparison.changes.scorchedCells, 1); assert.equal(comparison.recovering, false,
    'ordinary growth or newly added scorch cannot prove recovery from an earlier disaster');
  assert.equal(compareEnvironment({ ...a, environment: { ...a.environment, scorchedCells: 1 } }, b).recovering, true);
  assert.equal(comparison.evidence.cause, 'unknown'); assert(Object.isFrozen(comparison.changes));
  assert.equal(compareEnvironment(a, observeEnvironment(root, { x: 81, y: 60, radius: 2 })).reason, 'context-mismatch');
  const masked = observeEnvironment(root, { x: 80, y: 60, radius: 2, isVisible: (_p, x) => x < 82 });
  assert.equal(compareEnvironment(b, masked).reason, 'coverage-mismatch');
  assert.equal(compareEnvironment(b, { ...b, day: 1 }).reason, 'invalid-day-order');
});

check('正式焚林与世界推进形成真实火情、植被及焦土变化，存读档后仍可观察', () => {
  const root = world(2306), x = 100, y = 64, i = y * root.w + x;
  for (let py = y - 2; py <= y + 2; py += 1) for (let px = x - 2; px <= x + 2; px += 1) {
    const at = py * root.w + px;
    root.water[at] = 0; root.height[at] = 0.7; root.moist[at] = 0.7; root.temp[at] = 0.65; root.veg[at] = 0.8;
  }
  const history = { record() {} };
  burnForest(root, x, y, 2, history);
  const before = observeEnvironment(root, { x, y, radius: 2 });
  const burntVegetation = root.veg[i];
  assert(before.environment.activeFireCells > 0); assert(before.environment.scorchedCells > 0);
  const state = createAdvanceState();
  for (let n = 0; n < 100; n += 1) advanceWorld(root, 1, { state, rng: () => 1, riftActive: false, nether: false, wraith: false });
  const after = observeEnvironment(root, { x, y, radius: 2 });
  assert(root.day > before.day); assert(after.environment.activeFireCells < before.environment.activeFireCells);
  assert.equal(after.environment.activeFireCells, 0, 'official fire steps extinguish this bounded setup');
  assert.notEqual(root.veg[i], burntVegetation, 'official ecology ticks change the burned cell vegetation');
  decayOverlay(root, 3600, () => 0);
  const decayed = observeEnvironment(root, { x, y, radius: 2 });
  assert(decayed.environment.ashCells > 0, 'official overlay decay turns low-vegetation scorch into ash');
  const loaded = deserializeWorld(serializeWorld(root));
  const roundTrip = observeEnvironment(loaded, { x, y, radius: 2 });
  assert.equal(roundTrip.environment.scorchedCells, decayed.environment.scorchedCells);
  assert.equal(roundTrip.environment.ashCells, decayed.environment.ashCells);
  assert(Math.abs(roundTrip.environment.vegetationMean - decayed.environment.vegetationMean) < 0.002);
});

check('反复纯观察不改变正式存档或随机流', () => {
  const root = world(2307), before = JSON.stringify(serializeWorld(root));
  const rngA = mulberry32(77), rngB = mulberry32(77);
  assert.equal(rngA(), rngB());
  for (let n = 0; n < 10; n += 1) {
    observeEnvironment(root, { x: 100, y: 64 });
    findCurrentFires(root);
  }
  assert.equal(JSON.stringify(serializeWorld(root)), before); assert.equal(rngA(), rngB());
});

console.log(`G23 environment observation: ${checks} groups passed`);
