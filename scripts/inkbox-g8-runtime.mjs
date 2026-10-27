#!/usr/bin/env node
// G8-A「岁序不断」：随机流历史兼容、无损检查点续跑、正式存读档运行状态与世界替换隔离。
import assert from 'node:assert/strict';
import { mulberry32, rngStream, rngStateOf } from '../src/inkbox/core/noise.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld, recomputeUpperQi } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
import { WORLD_PRESETS, TIME } from '../src/inkbox/core/config.js';
import { Life, mercyRngFor } from '../src/inkbox/sim/life.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';
import { advanceWorld, createAdvanceState } from '../src/inkbox/sim/advance.js';
import { openRifts, riftRngFor, netherRiftRngFor } from '../src/inkbox/sim/rifts.js';
import { mortalHauntRngFor } from '../src/inkbox/sim/wraiths.js';
import { reactToTool } from '../src/inkbox/sim/busanzi.js';
import { captureRuntimeState, restoreRuntimeState, normalizeRuntimeState } from '../src/inkbox/sim/runtimeState.js';
import { worldStream, captureWorldStreams, restoreWorldStreams } from '../src/inkbox/sim/worldStreams.js';
import { serializeWorld, deserializeWorld, savedRuntimeOf, saveToStorage, loadFromStorage, importFile } from '../src/inkbox/io/save.js';

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks += 1; };

// ── 1. 随机流历史序列 ─────────────────────────────────────────
for (const seed of [0, 1, 12345, 20260914, 0x7fffffff, 0x80000000, 0xffffffff, -1, 2 ** 32, 2 ** 32 + 5, 0xa5a5a5a5 ^ 20260914]) {
  const a = mulberry32(seed), b = rngStream(seed);
  for (let i = 0; i < 2000; i += 1) assert.equal(b(), a(), `seed ${seed} draw ${i}`);
  checks += 1;
}
{
  const s = rngStream(0); ok(s.getState() === 0x9e3779b9, 'seed 0 keeps the historical 0x9e3779b9 start');
  const r = rngStream(77); for (let i = 0; i < 313; i += 1) r();
  const at = r.getState(); ok(r.getState() === at && r.getState() === at, 'getState does not consume');
  const next = [r(), r(), r()];
  const copy = rngStream(1); copy.setState(at); eq([copy(), copy(), copy()], next, 'restored cursor yields identical next draws');
  r.setState(at); eq([r(), r(), r()], next, 'setState rewinds');
  const z = rngStream(5); z.setState(0); const zr = mulberry32(1); ok(Number.isFinite(z()) && Number.isFinite(zr()), 'state 0 is a legal mid-run state');
  for (const bad of [-1, 1.5, 2 ** 32, NaN, '3', null]) assert.throws(() => rngStream(1).setState(bad)); checks += 1;
  const x = rngStream(9), y = rngStream(9); x(); x(); ok(y.getState() === rngStream(9).getState(), 'streams are isolated');
  ok(rngStateOf(mulberry32(3)) === null, 'plain mulberry32 reports non-checkpointable');
  ok(Object.keys(rngStream(4)).length === 0, 'state accessors are non-enumerable');
}
// 按 world 惰性流：取实例不抽签、同 world 同一条、新 world 不继承、恢复只登记
{
  const w1 = { seed: 99 }, w2 = { seed: 99 };
  const a = worldStream(w1, 'x', 0x1234); ok(worldStream(w1, 'x', 0x1234) === a, 'same world → same stream');
  const fresh = mulberry32((99 ^ 0x1234) >>> 0); for (let i = 0; i < 10; i += 1) assert.equal(a(), fresh()); checks += 1;
  ok(worldStream(w2, 'x', 0x1234).getState() === rngStream((99 ^ 0x1234) >>> 0).getState(), 'new world does not inherit cursor');
  eq(Object.keys(captureWorldStreams({ seed: 1 })), [], 'untouched lazy streams are not captured');
  const w3 = { seed: 99 }; restoreWorldStreams(w3, captureWorldStreams(w1));
  eq(captureWorldStreams(w3), captureWorldStreams(w1), 'pending cursors survive capture before first use');
  for (let i = 0; i < 5; i += 1) assert.equal(worldStream(w3, 'x', 0x1234)(), a()); checks += 1;
  assert.throws(() => restoreWorldStreams(w1, {})); checks += 1;
  const w4 = { seed: 99 }; mercyRngFor(w4); riftRngFor(w4); netherRiftRngFor(w4); mortalHauntRngFor(w4);
  eq(Object.keys(captureWorldStreams(w4)).sort(), ['haunt', 'mercy', 'netherRift', 'rift'], 'legacy accessors register in the shared table');
}

// ── 2. 正式推进的长期会话 ───────────────────────────────────────
const PRESET = WORLD_PRESETS.small, SEED = 20260914, STEP = 3;
const viewOpen = (day) => Math.floor(day / 360) % 6 < 2;
function createSession(world) {
  const life = new Life(world, rngStream(world.seed ^ 0xa5a5a5a5));
  const upperLife = world.upper ? new UpperLife(world.upper) : null;
  return { world, life, upperLife, advanceState: createAdvanceState(), playerRng: rngStream(12345), fired: [] };
}
function freshSession() {
  const world = generateWorld({ preset: PRESET, seed: SEED, scatter: true });
  const upper = generateUpperWorld({ preset: PRESET, seed: SEED }); recomputeUpperQi(upper); world.upper = upper;
  world.nether = generateNetherWorld({ preset: PRESET, seed: SEED });
  for (let g = 0; g < 3; g += 1) world.pendingSpawns.push({ x: 40 + g * 50, y: 50 + g * 10, species: 'human', count: 12 });
  return createSession(world);
}
/** 同一输入轨迹：固定步长、按绝对日开视界 / 开缝 / 玩家工具。 */
function run(session, days) {
  const { world } = session;
  for (let left = days; left > 0; left -= STEP) {
    const dt = Math.min(STEP, left);
    const fired = advanceWorld(world, dt, { life: session.life, upperLife: session.upperLife, state: session.advanceState, riftActive: viewOpen(world.day) });
    session.fired.push([world.day, fired.upper, fired.nether, fired.rift, fired.wraith].map(Number).join(''));
    if (Math.floor(world.day / 360) !== Math.floor((world.day - dt) / 360)) {
      const year = Math.floor(world.day / 360);
      if (year % 6 === 0) openRifts(world, { x0: 30, y0: 30, x1: 69, y1: 59 });
      if (viewOpen(world.day)) openRifts(world, { x0: 100, y0: 60, x1: 100, y1: 60 }, 'nether');
      reactToTool(world, session.playerRng, year % 2 ? 'lightning' : 'rain');
    }
  }
}
const capture = (s) => captureRuntimeState({ world: s.world, life: s.life, upperLife: s.upperLife, advanceState: s.advanceState, playerRng: s.playerRng });
function losslessCopy(source, runtime) {
  const copy = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(source, {}, { runtime }))));
  // 仅测试：把正式存档的有损量化层换回原值，隔离「运行状态」与「地形量化」两类误差。
  for (const [src, dst] of [[source, copy], [source.upper, copy.upper], [source.nether, copy.nether]]) {
    for (const key of Object.keys(src)) if (ArrayBuffer.isView(src[key]) && ArrayBuffer.isView(dst[key]) && dst[key].length === src[key].length) dst[key].set(src[key]);
  }
  return copy;
}
const fingerprint = (s) => JSON.stringify(serializeWorld(s.world));
const planesEqual = (a, b) => [['', a.world, b.world], ['upper.', a.world.upper, b.world.upper], ['nether.', a.world.nether, b.world.nether]]
  .every(([, x, y]) => ['height', 'water', 'veg', 'fire', 'type', 'over', 'struct', 'qi'].every(k => !x[k] || Buffer.compare(Buffer.from(x[k].buffer), Buffer.from(y[k].buffer)) === 0));

const A = freshSession();
run(A, 14 * 360 + 7);          // 非整拍：上界 / 幽冥 / 鬼影 / 裂缝累加器均在半途
const cp = capture(A);
ok(cp.exact, 'production-shaped session is fully checkpointable');
ok(Object.values(cp.advance).some(v => v > 0) && cp.upperLife.foundAccum > 0, 'checkpoint taken mid-period');
ok(Object.keys(cp.streams.mortal || {}).length >= 2, 'lazily created world streams are captured');
ok(JSON.stringify(cp).length < 2048, `runtime block stays small (${JSON.stringify(cp).length} chars)`);
const copyWorld = losslessCopy(A.world, cp);
ok(savedRuntimeOf(copyWorld).status === 'ok', 'runtime block round-trips through serialize/deserialize');
const B = createSession(copyWorld);
restoreRuntimeState(savedRuntimeOf(copyWorld).state, B);
eq(capture(B), cp, 'restored session reports the identical runtime state');
// 负对照：同一份无损世界，不恢复运行状态（旧档行为）
const C = createSession(losslessCopy(A.world, null));
ok(savedRuntimeOf(C.world).status === 'absent', 'legacy-shaped payload has no runtime');
A.fired = []; B.fired = []; C.fired = [];
const CONT = 6 * 360 + 11;
run(A, CONT); run(B, CONT); run(C, CONT);
eq(B.fired, A.fired, 'low-frequency clocks fire on the same days after restore');
eq(capture(B), capture(A), 'RNG cursors and clocks stay identical after continuation');
ok(planesEqual(A, B), 'all three planes keep identical terrain/qi layers');
ok(fingerprint(B) === fingerprint(A), 'full world state (entities, villages, sects, ledgers, three planes) identical');
ok(fingerprint(C) !== fingerprint(A) && JSON.stringify(C.fired) !== JSON.stringify(A.fired), 'negative control: without runtime state the world line forks');
ok(A.world.upper.popLog && JSON.stringify(A.world.upper.popLog) === JSON.stringify(B.world.upper.popLog)
  && JSON.stringify(A.world.riftLog) === JSON.stringify(B.world.riftLog), 'cross-plane ledgers identical');

// ── 3. 正式存读档路径 ─────────────────────────────────────────
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), key: i => [...store.keys()][i], get length() { return store.size; } };
{
  const live = capture(A);
  const result = await saveToStorage(A.world, 'g8', { name: 'g8' }, live);
  ok(result.ok, 'saveToStorage with runtime succeeds');
  const loaded = await loadFromStorage('g8');
  const saved = savedRuntimeOf(loaded);
  ok(saved.status === 'ok', 'formal save carries runtime state');
  eq(saved.state, normalizeRuntimeState(live), 'formal save keeps exact cursors and clocks');
  const L = createSession(loaded); restoreRuntimeState(saved.state, L);
  eq(capture(L), live, 'loaded session resumes from the saved cursors (independent of terrain quantization)');
  const plainBytes = JSON.stringify(serializeWorld(A.world)).length, withBytes = JSON.stringify(serializeWorld(A.world, {}, { runtime: live })).length;
  ok(withBytes - plainBytes < 2048, `save grows by ${withBytes - plainBytes} chars only`);
  console.log(`  runtime block: ${withBytes - plainBytes} chars raw JSON`);
  // 导入：明文导出 / 压缩槽位两种文本都走同一读侧
  const exported = JSON.stringify(serializeWorld(A.world, {}, { runtime: live }));
  const imported = await importFile({ text: async () => exported });
  eq(savedRuntimeOf(imported).state, normalizeRuntimeState(live), 'import keeps runtime');
  // 旧档：无运行状态 ⇒ absent，不猜游标
  const legacy = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(A.world))));
  ok(savedRuntimeOf(legacy).status === 'absent', 'old save loads without claiming exact continuation');
  const legacySession = createSession(legacy);
  ok(legacySession.life.captureRuntime().rng === rngStream(SEED ^ 0xa5a5a5a5).getState(),
    'legacy load: saved WorldEvents state ⇒ Life constructor draws nothing; cursor is the documented fresh start');
  // 损坏：拒绝而非静默
  for (const mutate of [p => { p.runtime.life.rng = 'x'; }, p => { p.runtime.v = 99; }, p => { p.runtime.advance.upper = -1; }, p => { p.runtime.streams.mortal.rift = 2 ** 33; }]) {
    const payload = JSON.parse(exported); mutate(payload);
    ok(savedRuntimeOf(deserializeWorld(payload)).status === 'corrupt', 'corrupt runtime block is reported');
  }
  assert.throws(() => restoreRuntimeState({ ...live, day: live.day + 1 }, createSession(loaded)), /does not match/); checks += 1;
}
// 构造期抽签：新世界 WorldEvents.reset() 抽 4 签，恢复必须覆盖它
{
  const w = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(A.world, {}, { runtime: cp }))));
  w.worldEventState = null;                       // 迫使构造期抽签
  const s = createSession(w);
  ok(s.life.captureRuntime().rng !== cp.life.rng, 'constructor consumed draws');
  w.day = cp.day; restoreRuntimeState(savedRuntimeOf(w).state, s);
  ok(s.life.captureRuntime().rng === cp.life.rng, 'restore overrides constructor-time draws');
}

// ── 4. 异常恢复：在任何控制器生效前拒绝，意外控制器异常回滚 ──────
// 正式 main.js 的保存/加载/换世界生命周期由真实浏览器脚本验证；不抽取源码拼测试类。
{
  const checkpoint = capture(A);
  const candidate = () => createSession(losslessCopy(A.world, checkpoint));
  const rejected = (name, mutateSnapshot = () => {}, mutateTarget = () => {}, error = /runtime|stream/) => {
    const snapshot = structuredClone(checkpoint), target = candidate();
    mutateSnapshot(snapshot); mutateTarget(target);
    const before = capture(target);
    const cacheRefs = ['_terrArea', '_terrBorder', '_terrBorderAt', '_terrContested'].map(key => target.world[key]);
    assert.throws(() => restoreRuntimeState(snapshot, target), error, name); checks += 1;
    eq(capture(target), before, `${name}: no partial cursors or clocks`);
    ok(cacheRefs.every((value, index) => value === target.world[['_terrArea', '_terrBorder', '_terrBorderAt', '_terrContested'][index]]),
      `${name}: territory references preserved`);
  };
  rejected('invalid RNG', s => { s.life.warRng = 2 ** 32; });
  rejected('invalid clock', s => { s.advance.wraith = -1; });
  rejected('non-finite clock', s => { s.advance.nether = NaN; });
  rejected('negative upper clock', s => { s.upperLife.foundAccum = -1; });
  rejected('unsupported version', s => { s.v = 99; });
  rejected('day mismatch', s => { s.day += 1; });
  rejected('incomplete checkpoint', s => { s.exact = false; });
  rejected('missing snapshot controller', s => { s.life = null; });
  rejected('missing target controller', undefined, target => { target.life = null; });
  rejected('missing upper controller', undefined, target => { target.upperLife = null; });
  rejected('Life belongs to another World', undefined, target => { target.life.world = {}; });
  rejected('UpperLife belongs to another World', undefined, target => { target.upperLife.upper = {}; });
  rejected('missing restore method', undefined, target => { target.upperLife.restoreRuntime = null; });
  rejected('player stream not restorable', undefined, target => { target.playerRng = mulberry32(12345); });
  rejected('immutable later clock', undefined, target => {
    Object.defineProperty(target.advanceState, 'wraith', { value: 0, writable: false });
  });
  rejected('immutable later cooldown', undefined, target => {
    Object.defineProperty(target.upperLife, 'foundAccum', { value: 0, writable: false });
  });
  rejected('World stream already active', undefined, target => { worldStream(target.world, 'rift', 0x1234); });
  rejected('upper World stream already active', undefined, target => { worldStream(target.world.upper, 'test', 0x1234); });
  rejected('stream plane missing', s => { s.streams.nether = { test: 4 }; }, target => { target.world.nether = null; });
  rejected('territory target immutable', undefined, target => {
    Object.defineProperty(target.world, '_terrArea', { value: new Map(), writable: false });
  });
  rejected('unexpected controller exception', undefined, target => {
    const restore = target.upperLife.restoreRuntime;
    target.upperLife.restoreRuntime = function (state) { restore.call(this, state); throw new Error('injected restore failure'); };
  }, /injected restore failure/);

  const negativeCooldown = structuredClone(checkpoint), target = candidate();
  for (const key of ['foundingCooldown', 'wildCooldown', 'clanCooldown', 'yearTickCooldown']) negativeCooldown.life[key] = -3;
  restoreRuntimeState(negativeCooldown, target);
  eq(capture(target), negativeCooldown, 'legitimate expired Life cooldowns restore unchanged');

  const noTerritory = structuredClone(checkpoint), cleanTarget = candidate();
  noTerritory.territory = null;
  cleanTarget.world._terrArea = new Map([[999, 123]]);
  cleanTarget.world._terrBorder = new Map([['stale', 1]]);
  cleanTarget.world._terrBorderAt = new Map([['stale', 1]]);
  cleanTarget.world._terrContested = new Set([999]);
  restoreRuntimeState(noTerritory, cleanTarget);
  eq(capture(cleanTarget), noTerritory, 'absent territory checkpoint clears previous derived caches');
}
console.log(`G8 runtime: ${checks} checks passed`);
