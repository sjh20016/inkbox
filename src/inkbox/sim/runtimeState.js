// 水墨沙盒 · 运行期检查点（G8「岁序不断」）
//
// World 持有世界事实；驱动它的「模拟会话」持有控制器（Life / UpperLife）、
// 推进时钟（advanceState）与玩家工具流。二者之间有一小组**不是世界事实、
// 却决定下一拍怎么走**的状态：随机流游标、低频时钟累加量、上一次 30 日
// 势力图边界留下的接壤表。本模块是它们唯一的快照 / 恢复入口：
//
//   · 每个持有者只描述自己（`Life.captureRuntime` / `UpperLife.captureRuntime` /
//     `worldStreams.captureWorldStreams`），这里只做组装与校验；
//   · 快照是版本化纯数据（≈ 数百字节），与世界本体在同一个同步时刻取；
//   · 恢复不抽签，并且必须在构造完控制器之后、第一次推进之前执行——
//     构造期（WorldEvents 无历史时）抽过的签会被游标覆盖；
//   · 旧档没有这一块：按「新建控制器」的确定规则初始化，并如实标记为非精确续跑。
//     绝不根据 `world.day` 推算历史抽签数。
//
// 新玩法接入：若新增跨节拍状态挂在 Life / UpperLife 上，只扩该类的
// capture/restore；若是按 world 惰性的独立流，用 `worldStream()` 取流即自动纳入。
import { isRngState, rngStateOf } from '../core/noise.js';
import { captureWorldStreams, restoreWorldStreams } from './worldStreams.js';
import { createAdvanceState } from './advance.js';

export const RUNTIME_STATE_VERSION = 1;
const ADVANCE_KEYS = Object.keys(createAdvanceState());
const PLANES = ['mortal', 'upper', 'nether'];

function planeOf(world, plane) {
  return plane === 'mortal' ? world : world?.[plane];
}

function captureTerritory(world) {
  if (!(world._terrArea instanceof Map)) return null;
  return {
    area: [...world._terrArea],
    border: [...(world._terrBorder || [])],
    borderAt: [...(world._terrBorderAt || [])],
    contested: [...(world._terrContested || [])],
  };
}

/**
 * 同步读取当前会话的运行期状态。**不抽签、不改世界。**
 * 调用方须在与 `serializeWorld` 同一个同步段里调用（见 `save.js`）。
 */
export function captureRuntimeState({ world, life = null, upperLife = null, advanceState = null, playerRng = null }) {
  const streams = {};
  for (const plane of PLANES) {
    const target = planeOf(world, plane);
    if (!target) continue;
    const states = captureWorldStreams(target);
    if (Object.keys(states).length) streams[plane] = states;
  }
  const lifeState = life ? life.captureRuntime() : null;
  const upperState = upperLife ? upperLife.captureRuntime() : null;
  const player = rngStateOf(playerRng);
  const snapshot = {
    v: RUNTIME_STATE_VERSION,
    day: world.day,
    life: lifeState,
    upperLife: upperState,
    advance: advanceState ? Object.fromEntries(ADVANCE_KEYS.map(key => [key, advanceState[key]])) : null,
    player,
    streams,
    territory: captureTerritory(world),
  };
  snapshot.exact = !!(lifeState && lifeState.rng !== null && lifeState.warRng !== null
    && (!world.upper || upperState) && snapshot.advance && player !== null);
  return snapshot;
}

const fail = (message) => { throw new TypeError(`runtime state: ${message}`); };
const finite = (value, name) => (Number.isFinite(value) ? value : fail(`${name} not finite`));
const rngOrNull = (value, name) => (value === null || isRngState(value) ? value : fail(`${name} invalid`));
const pairs = (list, name, keyOk, valueOk) => {
  if (!Array.isArray(list)) fail(`${name} not array`);
  return list.map((entry) => (Array.isArray(entry) && entry.length === 2 && keyOk(entry[0]) && valueOk(entry[1])
    ? [entry[0], entry[1]] : fail(`${name} entry invalid`)));
};

/** 校验并深拷贝一份快照。任何字段损坏都抛错——宁可拒绝，也不假装精确续跑。 */
export function normalizeRuntimeState(data) {
  if (!data || typeof data !== 'object') fail('not an object');
  if (data.v !== RUNTIME_STATE_VERSION) fail(`unsupported version ${data.v}`);
  const out = { v: RUNTIME_STATE_VERSION, day: finite(data.day, 'day'), exact: data.exact === true };
  if (data.life === null) out.life = null;
  else {
    const l = data.life || fail('life missing');
    out.life = { rng: rngOrNull(l.rng, 'life.rng'), warRng: rngOrNull(l.warRng, 'life.warRng') };
    for (const key of ['foundingCooldown', 'wildCooldown', 'clanCooldown', 'yearTickCooldown']) out.life[key] = finite(l[key], `life.${key}`);
  }
  if (data.upperLife === null) out.upperLife = null;
  else {
    const u = data.upperLife || fail('upperLife missing');
    out.upperLife = { rng: rngOrNull(u.rng, 'upperLife.rng'), spatialRng: rngOrNull(u.spatialRng, 'upperLife.spatialRng'),
      foundAccum: finite(u.foundAccum, 'upperLife.foundAccum') };
    if (out.upperLife.rng === null || out.upperLife.spatialRng === null) fail('upperLife stream missing');
  }
  if (data.advance === null) out.advance = null;
  else {
    const a = data.advance || fail('advance missing');
    out.advance = Object.fromEntries(ADVANCE_KEYS.map(key => [key, finite(a[key], `advance.${key}`)]));
    if (Object.values(out.advance).some(value => value < 0)) fail('advance negative');
  }
  out.player = rngOrNull(data.player ?? null, 'player');
  out.streams = {};
  for (const [plane, states] of Object.entries(data.streams || {})) {
    if (!PLANES.includes(plane) || !states || typeof states !== 'object') fail(`streams.${plane} invalid`);
    out.streams[plane] = {};
    for (const [name, state] of Object.entries(states)) {
      if (!isRngState(state)) fail(`streams.${plane}.${name} invalid`);
      out.streams[plane][name] = state;
    }
  }
  if (data.territory == null) out.territory = null;
  else {
    const t = data.territory;
    const id = Number.isFinite, key = (k) => typeof k === 'string';
    out.territory = { area: pairs(t.area, 'territory.area', id, id), border: pairs(t.border, 'territory.border', key, id),
      borderAt: pairs(t.borderAt, 'territory.borderAt', key, id),
      contested: Array.isArray(t.contested) && t.contested.every(id) ? [...t.contested] : fail('territory.contested invalid') };
  }
  return out;
}

/**
 * 把快照套回一组**刚构造好、尚未推进**的控制器。
 * `snapshot.day` 必须等于 `world.day`：游标与世界本体必须来自同一时刻。
 * 缺席的控制器（如测试不带上界）跳过对应段。
 */
export function restoreRuntimeState(snapshot, { world, life = null, upperLife = null, advanceState = null, playerRng = null }) {
  const s = normalizeRuntimeState(snapshot);
  if (s.day !== world.day) fail(`day ${s.day} does not match world day ${world.day}`);
  if (life && s.life) life.restoreRuntime(s.life);
  if (upperLife && s.upperLife) upperLife.restoreRuntime(s.upperLife);
  if (advanceState && s.advance) Object.assign(advanceState, s.advance);
  if (playerRng && s.player !== null) {
    if (typeof playerRng.setState !== 'function') fail('player stream not restorable');
    playerRng.setState(s.player);
  }
  for (const plane of PLANES) {
    const target = planeOf(world, plane);
    if (target && s.streams[plane]) restoreWorldStreams(target, s.streams[plane]);
  }
  if (s.territory) {
    world._terrArea = new Map(s.territory.area);
    world._terrBorder = new Map(s.territory.border);
    world._terrBorderAt = new Map(s.territory.borderAt);
    world._terrContested = new Set(s.territory.contested);
  }
  return { exact: s.exact };
}
