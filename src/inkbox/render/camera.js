// 水墨沙盒 · 相机
//
// 相机坐标用「世界格」表示。立体视图下，一格 (x, y) 的落笔位置是
// (x, y - 高程 × reliefScale)，所以拾取需要迭代求解——
// 先猜一个高程，再用高程修正 y，两三轮就收敛。
//
// ── D7-C：相机 2.0（一次性镜头动作）──────────────────────────────
// 相机**仍然**保留 `x / y / zoom` 的直接操作（`panBy` / `zoomAt` / `fit`），
// 不改成永久追踪型。新增的只是 `focusOn()`：一段**有始有终**的补间。
//
// 三条纪律（写在这里，免得后来人把它改坏）：
//   1. **补间走真实时间**（`update(dt)` 的 dt 是秒），**不读 `world.day`**。
//      所以把时间倍速拉到「飞」，镜头动画的真实时长一点不变——
//      镜头是给玩家眼睛看的，不是模拟的一部分。
//   2. **必须在固定时长内准确结束**，不能无限趋近：`update` 在 `elapsed ≥ duration`
//      的那一帧**直接把 x/y/zoom 钉到目标值**（不是「已经很接近」）。
//   3. **玩家输入立即接管**：`panBy` / `zoomAt` / `fit` 第一件事就是
//      `cancelTransition()`；而且**任何外部直接写 `camera.x/y/zoom` 也算接管**
//      （见 `update` 里的「外部改写检测」）——否则测试 / 旧代码里那种
//      `camera.x = …` 会被下一帧的补间悄悄覆盖回去。
//
// ⚠️ 相机是**渲染层**：`focusOn` 改的是 `camera.x/y/zoom`，不是世界状态，
//    因此不影响存读档等价（与旧代码里那两处直接赋值同性质）。

import { LIMITS, SEA_LEVEL } from '../core/config.js';

/** `focusOn` 不给 duration 时的默认补间时长（秒）。找人物 0.6~0.9 之间取中。 */
export const DEFAULT_FOCUS_DURATION = 0.75;

/**
 * ease-out cubic：起步快、收尾慢，最后一段几乎贴住目标。
 * 取立方而非二次，是因为收尾更软，落点像「墨滴入纸」而不是「撞上去」。
 * ⚠️ 任何缓动都行，但**必须在 k=1 时精确等于 1**（`update` 另外还会硬钉一次目标值）。
 */
function easeOutCubic(k) {
  const inv = 1 - k;
  return 1 - inv * inv * inv;
}

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 4;
    this.viewW = 1;
    this.viewH = 1;
    this.relief = true;
    this.reliefScale = 10;
    /** 当前一次性镜头动作；`null` 表示相机静止。形状见 `focusOn`。 */
    this.transition = null;
  }

  setViewport(w, h) {
    this.viewW = w;
    this.viewH = h;
  }

  toScreenX(wx) {
    return (wx - this.x) * this.zoom + this.viewW / 2;
  }

  toScreenY(wy) {
    return (wy - this.y) * this.zoom + this.viewH / 2;
  }

  toWorldX(sx) {
    return this.x + (sx - this.viewW / 2) / this.zoom;
  }

  toWorldY(sy) {
    return this.y + (sy - this.viewH / 2) / this.zoom;
  }

  /** 世界格 → 屏幕（含立体抬升） */
  tileScreen(x, y, height) {
    const lift = this.relief ? height * this.reliefScale : 0;
    return [this.toScreenX(x), this.toScreenY(y - lift)];
  }

  /**
   * 取消当前补间。玩家任何一次主动操作都调它——这是「输入立即接管」的落点。
   * 幂等：没有补间时什么也不做。
   */
  cancelTransition() {
    this.transition = null;
  }

  /**
   * 把一点钳进相机允许的范围。**纯函数**（不改 this），供 `clamp` 与
   * `focusOn` 共用——`focusOn` 要在**目标 zoom** 下算出钳制后的落点，
   * 才能保证补间结束时精确停在目标上（中途 zoom 在变，钳制框也在变）。
   *
   * ⚠️ `worldW/worldH` 未 `bind` 时是 `undefined`，此时 `Math.min/max` 会得到 NaN。
   *    调用方保证先 `bind`（真实游戏在 `newWorld` / 读档里都先 bind 再操作相机）。
   */
  clampPoint(x, y, zoom) {
    const margin = 6 / zoom;
    const halfW = this.viewW / (2 * zoom);
    const halfH = this.viewH / (2 * zoom);
    const minX = -halfW * 0.35 - margin;
    const maxX = this.worldW + halfW * 0.35 + margin;
    const minY = -halfH * 0.35 - margin - (this.relief ? this.reliefScale : 0);
    const maxY = this.worldH + halfH * 0.35 + margin;
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }

  panBy(dxPixels, dyPixels) {
    this.cancelTransition();
    this.x -= dxPixels / this.zoom;
    this.y -= dyPixels / this.zoom;
  }

  zoomAt(sx, sy, factor) {
    this.cancelTransition();
    const before = [this.toWorldX(sx), this.toWorldY(sy)];
    this.zoom = Math.max(LIMITS.minZoom, Math.min(LIMITS.maxZoom, this.zoom * factor));
    const after = [this.toWorldX(sx), this.toWorldY(sy)];
    this.x += before[0] - after[0];
    this.y += before[1] - after[1];
    this.clamp();
  }

  fit(world, padding = 1.04) {
    this.cancelTransition();
    const scaleX = this.viewW / (world.w * padding);
    const scaleY = this.viewH / (world.h * padding);
    this.zoom = Math.max(LIMITS.minZoom, Math.min(LIMITS.maxZoom, Math.min(scaleX, scaleY)));
    this.x = world.w / 2;
    this.y = world.h / 2;
    this.clamp();
  }

  /**
   * 一次性镜头动作：在 `duration` 秒内把 `(x, y, zoom)` 平滑移到目标。
   *
   * @param {number} x 目标世界格 x
   * @param {number} y 目标世界格 y
   * @param {object} [options]
   *   · `zoom`     目标缩放；不传则保持当前 zoom（纯平移）。
   *   · `duration` 补间时长（秒）；不传用 `DEFAULT_FOCUS_DURATION`。`≤ 0` ⇒ 立即到位。
   * @returns {object|null} 新建的 transition（`duration ≤ 0` 时为 null，因为已经到位）。
   */
  focusOn(x, y, options = {}) {
    const rawDuration = Number.isFinite(options.duration) ? options.duration : DEFAULT_FOCUS_DURATION;
    const zoom = Number.isFinite(options.zoom)
      ? Math.max(LIMITS.minZoom, Math.min(LIMITS.maxZoom, options.zoom))
      : this.zoom;

    if (!(rawDuration > 0)) {
      // 立即到位：不建补间，但**照样钳制**（否则传一个越界点会把相机顶到图外）。
      const point = this.clampPoint(x, y, zoom);
      this.x = point.x;
      this.y = point.y;
      this.zoom = zoom;
      this.transition = null;
      return null;
    }

    const point = this.clampPoint(x, y, zoom);
    this.transition = {
      fromX: this.x,
      fromY: this.y,
      fromZoom: this.zoom,
      toX: point.x,
      toY: point.y,
      toZoom: zoom,
      elapsed: 0,
      duration: rawDuration,
      // 记录「补间自己最后写下的值」——`update` 靠它判断有没有外部改写。
      lastX: this.x,
      lastY: this.y,
      lastZoom: this.zoom,
    };
    return this.transition;
  }

  /**
   * 每帧推进补间（`dt` 单位：秒）。**暂停世界也照跑**——镜头是显示动画。
   *
   * ⚠️ **外部改写检测**：如果这一帧开始时 `x/y/zoom` 与「补间上一帧写下的值」不一致，
   *    说明有人（玩家代码 / 测试 / 别的模块）**直接改了相机**——那也算接管，
   *    立刻放弃补间。否则那种 `camera.x = …` 会被本函数下一帧覆盖回去，
   *    而且**不报错**（表现为「点了没反应 / 落点偏了」）。
   *
   * @returns {boolean} 这一帧补间是否仍在进行（`false` = 静止或刚结束）。
   */
  update(dt) {
    const t = this.transition;
    if (!t) return false;
    // 外部直接写了相机 ⇒ 让位给外部，取消补间。
    if (this.x !== t.lastX || this.y !== t.lastY || this.zoom !== t.lastZoom) {
      this.transition = null;
      return false;
    }
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    t.elapsed += step;
    const k = t.duration > 0 ? Math.min(1, t.elapsed / t.duration) : 1;
    if (k >= 1) {
      // 精确落点：不依赖缓动函数在 1 处的取值（避免浮点残留差一点点）。
      this.x = t.toX;
      this.y = t.toY;
      this.zoom = t.toZoom;
      this.transition = null;
      return false;
    }
    const e = easeOutCubic(k);
    this.x = t.fromX + (t.toX - t.fromX) * e;
    this.y = t.fromY + (t.toY - t.fromY) * e;
    this.zoom = t.fromZoom + (t.toZoom - t.fromZoom) * e;
    this.clamp();
    t.lastX = this.x;
    t.lastY = this.y;
    t.lastZoom = this.zoom;
    return true;
  }

  clamp() {
    const point = this.clampPoint(this.x, this.y, this.zoom);
    this.x = point.x;
    this.y = point.y;
  }

  bind(world) {
    this.worldW = world.w;
    this.worldH = world.h;
    this.reliefScale = world.reliefScale;
  }

  /** 屏幕坐标 → 世界格坐标（返回 {x, y}，可能越界） */
  pick(sx, sy, world) {
    const wx = this.toWorldX(sx);
    const wy = this.toWorldY(sy);
    if (!this.relief) {
      return { x: Math.round(wx), y: Math.round(wy) };
    }
    const cx = Math.max(0, Math.min(world.w - 1, Math.round(wx)));
    // 拾取用的「落笔高度」与渲染一致：水面用 surface，陆地用 height
    const drawnHeightAt = (cy) => {
      const i = cy * world.w + cx;
      return world.water[i] > 0.0015 ? world.height[i] + world.water[i] : world.height[i];
    };
    let guess = Math.round(wy + SEA_LEVEL * this.reliefScale);
    for (let iter = 0; iter < 5; iter += 1) {
      const cy = Math.max(0, Math.min(world.h - 1, guess));
      guess = Math.round(wy + drawnHeightAt(cy) * this.reliefScale);
    }
    let bestY = Math.max(0, Math.min(world.h - 1, guess));
    // 前遮挡修正：靠后的格子可能被靠前的高地盖住，取最前面那个命中点
    for (let dy = -1; dy <= 4; dy += 1) {
      const cy = bestY + dy;
      if (cy < 0 || cy >= world.h) continue;
      const drawnY = cy - drawnHeightAt(cy) * this.reliefScale;
      const top = drawnY;
      const bottom = drawnY + 1;
      const target = wy;
      if (target >= top && target <= bottom) {
        bestY = cy;
      }
    }
    return { x: cx, y: bestY };
  }

  /** 可见范围（世界格，含立体抬升余量） */
  visibleRect(world) {
    const halfW = this.viewW / (2 * this.zoom);
    const halfH = this.viewH / (2 * this.zoom);
    return {
      x0: Math.max(0, Math.floor(this.x - halfW) - 1),
      x1: Math.min(world.w - 1, Math.ceil(this.x + halfW) + 1),
      y0: Math.max(0, Math.floor(this.y - halfH - this.reliefScale) - 1),
      y1: Math.min(world.h - 1, Math.ceil(this.y + halfH) + 1),
    };
  }
}
