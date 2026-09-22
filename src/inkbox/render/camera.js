// 水墨沙盒 · 相机
//
// 相机坐标用「世界格」表示。立体视图下，一格 (x, y) 的落笔位置是
// (x, y - 高程 × reliefScale)，所以拾取需要迭代求解——
// 先猜一个高程，再用高程修正 y，两三轮就收敛。

import { LIMITS, SEA_LEVEL } from '../core/config.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 4;
    this.viewW = 1;
    this.viewH = 1;
    this.relief = true;
    this.reliefScale = 10;
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

  panBy(dxPixels, dyPixels) {
    this.x -= dxPixels / this.zoom;
    this.y -= dyPixels / this.zoom;
  }

  zoomAt(sx, sy, factor) {
    const before = [this.toWorldX(sx), this.toWorldY(sy)];
    this.zoom = Math.max(LIMITS.minZoom, Math.min(LIMITS.maxZoom, this.zoom * factor));
    const after = [this.toWorldX(sx), this.toWorldY(sy)];
    this.x += before[0] - after[0];
    this.y += before[1] - after[1];
    this.clamp();
  }

  fit(world, padding = 1.04) {
    const scaleX = this.viewW / (world.w * padding);
    const scaleY = this.viewH / (world.h * padding);
    this.zoom = Math.max(LIMITS.minZoom, Math.min(LIMITS.maxZoom, Math.min(scaleX, scaleY)));
    this.x = world.w / 2;
    this.y = world.h / 2;
    this.clamp();
  }

  clamp() {
    const margin = 6 / this.zoom;
    const halfW = this.viewW / (2 * this.zoom);
    const halfH = this.viewH / (2 * this.zoom);
    const minX = -halfW * 0.35 - margin;
    const maxX = this.worldW + halfW * 0.35 + margin;
    const minY = -halfH * 0.35 - margin - (this.relief ? this.reliefScale : 0);
    const maxY = this.worldH + halfH * 0.35 + margin;
    this.x = Math.max(minX, Math.min(maxX, this.x));
    this.y = Math.max(minY, Math.min(maxY, this.y));
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
