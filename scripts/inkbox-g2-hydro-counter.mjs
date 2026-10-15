#!/usr/bin/env node
// G2-P0.3 阶段 A · 水文步数计数器（**单一实现**）。
//
// 为什么要有这个文件：上一版 H1 诊断用
//     const delta = post.hydroAccum - pre.hydroAccum;
//     if (!paused && delta > 0) { ...算步数... }
// 判断水文是否执行 —— **判据是错的**。水文真的执行一步时累加器会 `-= 0.16`，
// `delta` 往往是**负数**，于是补水帧被整段漏掉（实测 100% 漏掉）。
//
// 本轮改为两路**互相独立**的证据，必须一致，否则该次运行判 INVALID：
//
//   ① 直接法：在**实例字段**上装存取器拦截 `hydroAccum` 的每一次写入。
//      产品里只会发生两种写入（`main.js:2093/2096`）：
//        · `this.hydroAccum += dt`   → 增量 ≈ +dt
//        · `this.hydroAccum -= 0.16` → 增量 ≈ -0.16，**每一次都是一次 stepHydrology()**
//      不修改任何产品文件、不改控制流、不改参数、不改返回值。
//   ② 推导法：`(accumBefore + dt - accumAfter) / 0.16` 取整并校验残差。
//
// ⚠️ 这个模块被 Node 单测与浏览器注入**共用**：页面侧的源码由
//    `hydroAccessorSource()` 从同一份逻辑生成，避免出现两套实现而静默分叉。

export const HYDRO_PERIOD_S = 0.16;
export const HYDRO_MAX_STEPS = 3;
/** 浮点残差容差：0.16 的加减是精确到 1e-17 量级的二进制运算，1e-9 已极宽松。 */
export const HYDRO_EPS = 1e-9;

/**
 * 推导法：由累加器前后值与**真正传入 update 的 dt**反推水文步数。
 *
 * ⚠️ 必须传**截断后**的 dt。产品 `frame()`（`main.js:1923`）会
 *    `if (dt > 0.12) dt = 0.12;`，`update` 收到的与 `hydroAccum += dt` 用的是同一个值。
 *    拿原始 RAF 间隔当 dt 会算出多余的补跑步数——正式游戏不存在这种三步补跑。
 *
 * @param {{paused: boolean, accumBefore: number, accumAfter: number, dt: number}} input
 * @returns {{steps: number|null, consistent: boolean, reason: string}}
 */
export function inferHydroSteps({ paused, accumBefore, accumAfter, dt }) {
  if (!Number.isFinite(accumBefore) || !Number.isFinite(accumAfter)) {
    return { steps: null, consistent: false, reason: 'non-finite-accumulator' };
  }
  if (paused) {
    // 暂停时产品既不累加也不执行（`main.js:2091` 注释明说「不累积」）
    if (accumAfter !== accumBefore) {
      return { steps: null, consistent: false, reason: 'paused-but-accumulator-changed' };
    }
    return { steps: 0, consistent: true, reason: 'paused' };
  }
  if (!Number.isFinite(dt) || dt < 0) {
    return { steps: null, consistent: false, reason: 'invalid-dt' };
  }
  const consumed = accumBefore + dt - accumAfter;
  const steps = Math.round(consumed / HYDRO_PERIOD_S);
  if (steps < 0 || steps > HYDRO_MAX_STEPS) {
    return { steps: null, consistent: false, reason: `steps-out-of-range:${steps}` };
  }
  const residual = Math.abs(consumed - steps * HYDRO_PERIOD_S);
  if (residual > HYDRO_EPS) {
    return { steps: null, consistent: false, reason: `residual-too-large:${residual}` };
  }
  return { steps, consistent: true, reason: 'ok' };
}

/**
 * 两路对照。直接法给的是「减 0.16 的次数」，推导法给的是算术还原的步数。
 * 任一为 null 或不相等 ⇒ INVALID（不得据此产出性能结论）。
 */
export function crossCheckHydro({ directSteps, inferred }) {
  if (directSteps === null || directSteps === undefined) return { ok: false, reason: 'direct-missing' };
  if (!inferred || !inferred.consistent) return { ok: false, reason: `inferred-invalid:${inferred?.reason ?? 'missing'}` };
  if (directSteps !== inferred.steps) {
    return { ok: false, reason: `direct(${directSteps})!=inferred(${inferred.steps})` };
  }
  return { ok: true, reason: 'ok' };
}

/**
 * 把累加器存取器包装成可注入浏览器的源码。
 *
 * 之所以用**实例属性存取器**而不是改产品源码：`stepHydrology` 是模块内直接调用的
 * 导入绑定，无法安全 monkey-patch；而 `hydroAccum` 是实例字段，产品只在
 * 水文块内写它，因此拦截它的写入等价于直接观测水文执行，且零控制流改动。
 *
 * 目标对象上会挂 `__hydroProbe`，含：
 *   · writes: 每次写入的 { kind, delta, value }（kind: accumulate | step | other）
 *   · stepCalls: 减 0.16 的次数 = stepHydrology() 直接调用次数
 *   · otherWrites: 既不是 +dt 也不是 -0.16 的写入（出现即说明还有别的写入者，必须查）
 * `targetExpr` 默认 `window.inkbox`；单测可传一个本地对象表达式，
 * 从而在 Node 里**真跑注入代码**（否则注入字符串里的笔误只会在浏览器里才暴露）。
 */
export function hydroAccessorSource(targetExpr = 'window.inkbox') {
  return `(function installHydroAccessor(target, periodS, eps){
  const probe = { writes: [], stepCalls: 0, accumulateWrites: 0, otherWrites: [], enabled: true, lastDt: null,
                  stepMs: [], frameStepMs: 0, lastWriteAt: null };
  let value = target.hydroAccum;
  const now = function(){ return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now(); };
  Object.defineProperty(target, 'hydroAccum', {
    configurable: true,
    enumerable: true,
    get() { return value; },
    set(next) {
      const delta = next - value;
      const isStep = Math.abs(delta + periodS) <= eps;
      const isAccumulate = delta > 0 && (probe.lastDt === null || Math.abs(delta - probe.lastDt) <= eps);
      const t = now();
      if (probe.enabled) {
        if (isStep) {
          // 这一次写入紧跟一次 stepHydrology() 返回 ⇒ 与上一次写入的间隔即该步的直接耗时
          // （同一帧内第 2/3 步同理，量的是「上一步 + 中间循环开销」）
          if (probe.lastWriteAt !== null) { const ms = t - probe.lastWriteAt; probe.stepMs.push(ms); probe.frameStepMs += ms; }
          probe.stepCalls += 1; probe.writes.push({ kind: 'step', delta, value: next });
        }
        else if (isAccumulate) { probe.accumulateWrites += 1; probe.writes.push({ kind: 'accumulate', delta, value: next }); }
        else { probe.otherWrites.push({ delta, value: next, lastDt: probe.lastDt }); probe.writes.push({ kind: 'other', delta, value: next }); }
      }
      probe.lastWriteAt = t;
      value = next;
    },
  });
  target.__hydroProbe = probe;
  return probe;
})(${targetExpr}, ${HYDRO_PERIOD_S}, ${HYDRO_EPS});`;
}
