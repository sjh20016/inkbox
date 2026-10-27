// 水墨沙盒 · 按 world 惰性建立的独立随机流（G8）
//
// 原先 mercy / rift / netherRift / netherItem / netherPossess / haunt 六条流各自
// 持有一张模块级 WeakMap。行为（同 world 同一条流、惰性建立、取实例不抽签、
// 序列化器看不见）全部保留，只把六张表收成这一张：于是检查点只需要问一处
// 「这个 world 已经建了哪些流、各自游标在哪」，新增流也不必改存读档代码。
//
// 生命周期：
//   · 流第一次被取用时才按 `world.seed ^ seedKey` 建立（与旧实现逐签相同）；
//   · `restoreWorldStreams` 只登记待恢复游标，流在第一次取用时套用——
//     所以恢复本身既不抽签、也不需要知道各流的派生键；
//   · 新 world 是新对象，WeakMap 天然不继承旧世界游标。
import { rngStream, isRngState } from '../core/noise.js';

const STREAMS = new WeakMap();   // world -> Map<name, rng>
const PENDING = new WeakMap();   // world -> Map<name, state>

export function worldStream(world, name, seedKey) {
  let streams = STREAMS.get(world);
  if (!streams) { streams = new Map(); STREAMS.set(world, streams); }
  let rng = streams.get(name);
  if (!rng) {
    rng = rngStream(((world.seed || 0) ^ seedKey) >>> 0);
    const pending = PENDING.get(world);
    if (pending?.has(name)) { rng.setState(pending.get(name)); pending.delete(name); }
    streams.set(name, rng);
  }
  return rng;
}

/** 已建立（或已登记待恢复）的流游标；从未取用的流不出现。 */
export function captureWorldStreams(world) {
  const out = {};
  for (const [name, state] of PENDING.get(world) || []) out[name] = state;
  for (const [name, rng] of STREAMS.get(world) || []) out[name] = rng.getState();
  return out;
}

/** 登记待恢复游标。必须在该 world 的任何流被取用之前调用。 */
export function restoreWorldStreams(world, states) {
  if (STREAMS.get(world)?.size) throw new Error('world streams already in use; restore before simulation');
  const pending = new Map();
  for (const [name, state] of Object.entries(states || {})) {
    if (!isRngState(state)) throw new TypeError(`invalid world stream state ${name}`);
    pending.set(name, state);
  }
  PENDING.set(world, pending);
}
