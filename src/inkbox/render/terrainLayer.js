// 水墨沙盒 · 地形渲染层
//
// 把高程/水位/类型三层数据画成一张「一像素一格」的位图，再由相机放大。
// 让它像水墨山水而不是像地图的三个关键：
//   1. 山体阴影（皴法）：光源在左上，坡向决定明暗，山脊自然浮出来；
//   2. 等高线：每 6% 高程画一道淡墨线，山就有了体积；
//   3. 云气留白：高山的背风侧混入纸白，形成绕山的雾带。

import { SEA_LEVEL, TERRAIN } from '../core/config.js';
import { accessBounds } from '../world/mapProgress.js';
import { clamp, createNoise2D, fbm } from '../core/noise.js';
import { TERRAIN_RGB, INK_RGB, mixRgb, BAYER4 } from './palette.js';

const CONTOUR_STEP = 0.085;
/** 全局去色强度与宣纸混入比例：这两个数是「水墨感」的总开关 */
const DESATURATE = 0.3;
const PAPER_MIX = 0.08;
const LIGHT = [-0.62, -0.62, 0.48];

/** 雪线：高程超过这里就戴雪顶。用高度而非地形类型判断，
 *  这样玩家把山抬起来时，雪线会自己跟着上去 */
const SNOWLINE = 0.84;
/** 石骨线：超过这里露出冷灰的岩色 */
const ROCKLINE = 0.66;
/** 云雾带的层数：三层低频噪声交叉淡入，做出「云在走」而不用每帧算噪声 */
const MIST_LAYERS = 3;

const tmpA = [0, 0, 0];
const tmpB = [0, 0, 0];

export class TerrainLayer {
  constructor(world, options = {}) {
    this.world = world;
    this.relief = options.relief !== false;
    this.pad = this.relief ? Math.ceil((world.reliefScale || 10) * 1.06) + 2 : 0;
    this.allocate(world.w, world.h);
    this.lastRender = -1e9;
    this.time = 0;
  }

  invalidate() { this.lastRender = -Infinity; }

  allocate(w, h) {
    this.w = w;
    this.h = h;
    this.bufferH = h + this.pad;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = this.bufferH;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.image = this.ctx.createImageData(w, this.bufferH);
    this.data = this.image.data;
    this.lastRender = -1e9;
    this.buildWash();
  }

  /**
   * 低频「墨韵」场：让同一片山林的浓淡不匀，像一笔一笔染上去的。
   * 这是渲染专用数据，不进存档——它是从世界种子确定性推出来的。
   */
  buildWash() {
    const w = this.w;
    const h = this.h;
    const wash = new Float32Array(w * h);
    const noise = createNoise2D((this.world.seed ^ 0x5eed1e5) >>> 0);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const a = fbm(noise, (x / w) * 3.2, (y / h) * 3.2, 3, 2.1, 0.55);
        const b = fbm(noise, (x / w) * 8.5 + 31.7, (y / h) * 8.5 + 12.3, 2, 2.0, 0.5);
        wash[y * w + x] = a * 0.72 + b * 0.28;
      }
    }
    this.wash = wash;
    this.buildMist();
  }

  /**
   * 云雾带：三层低频噪声，渲染时按时间交叉淡入淡出。
   *
   * 每帧现算噪声太贵（一张 288×180 的图就是五万次 fbm），
   * 所以预生成三层、按时间在它们之间过渡——云看起来在走，
   * 代价却只是一次线性插值。
   */
  buildMist() {
    const w = this.w;
    const h = this.h;
    const noise = createNoise2D((this.world.seed ^ 0x0c10d5) >>> 0);
    const layers = [];
    for (let k = 0; k < MIST_LAYERS; k += 1) {
      const field = new Float32Array(w * h);
      const ox = k * 17.3;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const a = fbm(noise, (x / w) * 2.1 + ox, (y / h) * 2.1 + ox * 0.6, 3, 2.0, 0.55);
          const b = fbm(noise, (x / w) * 5.6 + ox * 2, (y / h) * 5.6 - ox, 2, 2.0, 0.5);
          field[y * w + x] = a * 0.66 + b * 0.34;
        }
      }
      layers.push(field);
    }
    this.mist = layers;
  }

  setWorld(world) {
    this.world = world;
    this.pad = this.relief ? Math.ceil((world.reliefScale || 10) * 1.06) + 2 : 0;
    this.allocate(world.w, world.h);
  }

  setRelief(enabled) {
    if (this.relief === enabled) return;
    this.relief = enabled;
    this.setWorld(this.world);
  }

  /** 世界格坐标 → 位图行号 */
  rowOf(y, height) {
    if (!this.relief) return y;
    return y + this.pad - Math.round(height * (this.world.reliefScale || 10));
  }

  needsRender(now, dirty) {
    return dirty || now - this.lastRender > 0.11;
  }

  render(time, force = false) {
    this.time = time;
    const world = this.world;
    const { w, h, height, water, type, fire, veg, temp, qi } = world;
    const data = this.data;
    const pad = this.pad;
    const relief = this.relief;
    const reliefScale = world.reliefScale || 10;
    const bufferH = this.bufferH;

    // 纸底：留白处露出的就是宣纸色
    const paper = INK_RGB.paper;
    for (let p = 0; p < data.length; p += 4) {
      data[p] = paper[0];
      data[p + 1] = paper[1];
      data[p + 2] = paper[2];
      data[p + 3] = 255;
    }

    const wash = this.wash;
    const shimmer = Math.sin(time * 0.9);
    const seaLevel = SEA_LEVEL;

    // 云雾：三层低频噪声交叉淡入，让云看起来在走
    const mistPhase = (((time * 0.05) % MIST_LAYERS) + MIST_LAYERS) % MIST_LAYERS;
    const mIdx0 = Math.floor(mistPhase);
    const mIdx1 = (mIdx0 + 1) % MIST_LAYERS;
    const mT = mistPhase - mIdx0;
    const mistA = this.mist[mIdx0];
    const mistB = this.mist[mIdx1];

    // 立体视图用：记录每一列上一次落笔的行与颜色，用来补崖面
    if (relief) {
      if (!this._prevRow || this._prevRow.length !== w) {
        this._prevRow = new Int32Array(w);
        this._prevR = new Float32Array(w);
        this._prevG = new Float32Array(w);
        this._prevB = new Float32Array(w);
      }
      this._prevRow.fill(-1);
    }
    const bounds = accessBounds(this.world);
    const prevRow = this._prevRow;
    const prevR = this._prevR;
    const prevG = this._prevG;
    const prevB = this._prevB;

    for (let y = bounds.y0; y <= bounds.y1; y += 1) {
      for (let x = bounds.x0; x <= bounds.x1; x += 1) {
        const i = y * w + x;
        const hv = height[i];
        const depth = water[i];
        // 水面是平的：立体视图里水的落笔高度取「水面」而不是「水底」，
        // 否则海床的高低起伏会在海面上拖出一条条灰色云影。
        const drawH = depth > 0.0015 ? hv + depth : hv;
        const row = relief ? y + pad - Math.round(drawH * reliefScale) : y;
        if (row < 0 || row >= bufferH) continue;
        const p = (row * w + x) * 4;

        const t = type[i];
        const base = TERRAIN_RGB[t] || TERRAIN_RGB[TERRAIN.GRASS];
        let r = base[0];
        let g = base[1];
        let b = base[2];

        const xm = x > 0 ? x - 1 : x;
        const xp = x < w - 1 ? x + 1 : x;
        const ym = y > 0 ? y - 1 : y;
        const yp = y < h - 1 ? y + 1 : y;
        const dzdx = (height[y * w + xp] - height[y * w + xm]) * 22;
        const dzdy = (height[yp * w + x] - height[ym * w + x]) * 22;

        if (depth > 0.0015) {
          // ── 水面 ───────────────────────────────────────
          // 用满水深区间，避免近岸出现一圈突兀的色带
          const deep = Math.min(1, depth / 0.3);
          mixRgb(TERRAIN_RGB[TERRAIN.SHALLOW], TERRAIN_RGB[TERRAIN.DEEP], deep, tmpA);
          // 近岸留一道亮边，像水口勾勒
          const rim = 1 - Math.min(1, depth / 0.02);
          mixRgb(tmpA, INK_RGB.paper, rim * 0.55, tmpA);
          // 浪花：贴着岸的一圈白沫，随时间明灭。
          // 用「相邻格是不是陆地」判断岸线，而不是看水深——
          // 深水区也会因为水深起伏出现亮边，那样满海都是泡沫。
          const nearLand = (x > 0 && water[i - 1] <= 0.0015)
            || (x < w - 1 && water[i + 1] <= 0.0015)
            || (y > 0 && water[i - w] <= 0.0015)
            || (y < h - 1 && water[i + w] <= 0.0015);
          if (nearLand) {
            const wave = 0.5 + 0.5 * Math.sin(time * 1.6 + x * 0.55 + y * 0.42);
            mixRgb(tmpA, INK_RGB.mist, 0.2 + wave * 0.34, tmpA);
          }
          // 水面只留极轻的呼吸，靠水深的浓淡拉开层次——
          // 大面积的低频波纹会让人看成云，不是水。
          const lum = 0.98 + Math.sin(x * 0.9 + y * 0.7 + time * 0.8) * 0.012 + shimmer * 0.008;
          r = tmpA[0] * lum;
          g = tmpA[1] * lum;
          b = tmpA[2] * lum;
        } else {
          // ── 陆地 ───────────────────────────────────────
          const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
          const nx = -dzdx / len;
          const ny = -dzdy / len;
          const nz = 1 / len;
          const dot = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
          const slope = Math.sqrt((dzdx / 22) ** 2 + (dzdy / 22) ** 2);

          // 陡坡露岩：山水画里「石骨」就是这么来的
          if (slope > 0.062 && hv > seaLevel) {
            const rockMix = Math.min(0.8, (slope - 0.062) * 5.4);
            const rock = hv > 0.78 ? TERRAIN_RGB[TERRAIN.PEAK] : TERRAIN_RGB[TERRAIN.ROCK];
            mixRgb([r, g, b], rock, rockMix, tmpA);
            r = tmpA[0];
            g = tmpA[1];
            b = tmpA[2];
          }

          // 墨韵浓淡：让整片地表的墨色不匀，像分几次染的
          const wv = (wash[i] - 0.5) * 0.3;
          if (wv > 0) {
            mixRgb([r, g, b], INK_RGB.paper, wv, tmpA);
          } else {
            mixRgb([r, g, b], INK_RGB.shadow, -wv * 0.55, tmpA);
          }
          r = tmpA[0];
          g = tmpA[1];
          b = tmpA[2];

          // 植被深浅：同一片林子也有浓淡
          const v = veg[i];
          if (v > 0.12 && t !== TERRAIN.DESERT && t !== TERRAIN.SNOW) {
            mixRgb([r, g, b], TERRAIN_RGB[TERRAIN.JUNGLE], Math.min(0.4, v * 0.38), tmpA);
            r = tmpA[0];
            g = tmpA[1];
            b = tmpA[2];
          }

          // ── 雪顶与石骨 ────────────────────────────────
          // 按高度上雪，而不是按地形类型：玩家把山抬起来，雪线会自己跟着上去。
          // 这条线是整幅画最抢眼的一笔，所以给得干脆些。
          if (hv > SNOWLINE) {
            const cap = Math.min(1, (hv - SNOWLINE) / 0.07);
            mixRgb([r, g, b], INK_RGB.mist, 0.52 + cap * 0.4, tmpA);
            // 纯白死板，掺一点石青
            mixRgb(tmpA, INK_RGB.azurite, 0.07, tmpA);
            r = tmpA[0];
            g = tmpA[1];
            b = tmpA[2];
          } else if (hv > ROCKLINE) {
            // 高处露岩：越接近雪线越秃
            const bare = Math.min(1, (hv - ROCKLINE) / (SNOWLINE - ROCKLINE));
            mixRgb([r, g, b], TERRAIN_RGB[TERRAIN.ROCK], bare * 0.5, tmpA);
            r = tmpA[0];
            g = tmpA[1];
            b = tmpA[2];
          }

          // 云气留白：只在山腰的背风侧起一层薄雾。
          // 条件卡得很紧，否则整片山坡都会糊成白的。
          if (hv > seaLevel + 0.2) {
            const northH = height[ym * w + x];
            const drop = northH - hv;
            if (drop > 0.07 && drop < 0.24) {
              const mist = Math.min(0.22, (drop - 0.07) * 1.2);
              mixRgb([r, g, b], INK_RGB.mist, mist, tmpA);
              r = tmpA[0];
              g = tmpA[1];
              b = tmpA[2];
            }
          }

          // 墨色光影：暗处不是「变黑」，而是「掺墨」；亮处不是「变白」，
          // 而是「留白」。这是整张图看起来像水墨而不是像卫星图的关键。
          const shade = (0.5 - dot) * 1.2;
          if (shade > 0.012) {
            mixRgb([r, g, b], INK_RGB.shadow, shade > 0.62 ? 0.62 : shade, tmpA);
            r = tmpA[0];
            g = tmpA[1];
            b = tmpA[2];
          }
          const glow = (dot - 0.62) * 0.85;
          if (glow > 0.012) {
            mixRgb([r, g, b], INK_RGB.mist, glow > 0.32 ? 0.32 : glow, tmpA);
            r = tmpA[0];
            g = tmpA[1];
            b = tmpA[2];
          }

          // ── 山脊留白 ─────────────────────────────────
          // 沿光照方向找局部高点：比上下游都高，就是一道脊线。
          // 山水画里山脊不画深，而是「留白」——一笔亮线，山就立起来了。
          if (hv > seaLevel + 0.26) {
            const hUp = height[ym * w + xm];
            const hDn = height[yp * w + xp];
            if (hv > hUp + 0.010 && hv > hDn + 0.004) {
              mixRgb([r, g, b], INK_RGB.mist, 0.26, tmpA);
              r = tmpA[0];
              g = tmpA[1];
              b = tmpA[2];
            }
          }

          // 等高线：淡墨勾出山形
          if (hv > seaLevel + 0.03) {
            const band = Math.floor(hv / CONTOUR_STEP);
            const bandN = Math.floor(height[ym * w + x] / CONTOUR_STEP);
            const bandW = Math.floor(height[y * w + xm] / CONTOUR_STEP);
            if (band !== bandN || band !== bandW) {
              const ink = 0.9 - wash[i] * 0.12;
              r *= ink;
              g *= ink;
              b *= ink;
            }
          }

          // 岸线勾勒：靠水的一侧压一道重墨
          const nearWater = (x > 0 && water[i - 1] > 0.0015)
            || (x < w - 1 && water[i + 1] > 0.0015)
            || (y > 0 && water[i - w] > 0.0015)
            || (y < h - 1 && water[i + w] > 0.0015);
          if (nearWater) {
            r *= 0.72;
            g *= 0.72;
            b *= 0.72;
          }

          // 雪线：高处带一点冷调，避免纯白死板
          if (t === TERRAIN.SNOW && temp[i] < 0.3) {
            mixRgb([r, g, b], INK_RGB.azurite, 0.1, tmpA);
            r = tmpA[0];
            g = tmpA[1];
            b = tmpA[2];
          }

          // ── 云雾带 ───────────────────────────────────
          // 一层会走的云。只在山腰以上起雾，且要够浓才落笔——
          // 否则整张图会糊成一片白，山就看不见了。
          if (hv > seaLevel + 0.16) {
            const m = mistA[i] * (1 - mT) + mistB[i] * mT;
            const alt = Math.min(1, (hv - seaLevel - 0.16) / 0.5);
            const amount = Math.max(0, m - 0.5) * 1.7 * alt * 0.6;
            if (amount > 0.012) {
              mixRgb([r, g, b], INK_RGB.mist, amount > 0.4 ? 0.4 : amount, tmpA);
              r = tmpA[0];
              g = tmpA[1];
              b = tmpA[2];
            }
          }

          // ── 地气 ─────────────────────────────────────
          // 灵气厚的地方，地表透出一层极淡的青。
          // 这是给玩家的「看风水」线索：抬山改河之后，能直接从颜色
          // 看出灵气往哪儿聚，而不必去翻数字面板。
          const q = qi[i];
          if (q > 0.6) {
            const qg = Math.min(0.16, (q - 0.6) * 0.42);
            mixRgb([r, g, b], [118, 178, 178], qg, tmpA);
            r = tmpA[0];
            g = tmpA[1];
            b = tmpA[2];
          }
        }

        // 火：从橙到白热，在底图上直接压出高亮
        const f = fire[i];
        if (f > 0.02) {
          const heat = Math.min(1, f * 1.15);
          mixRgb([r, g, b], [255, 214 - heat * 70, 120 - heat * 90], heat * 0.86, tmpA);
          r = tmpA[0];
          g = tmpA[1];
          b = tmpA[2];
        }

        // 立体视图的崖面：当前格比上一行低很多时，把落差补成一道阴影，
        // 否则山坡上会漏出纸白，看起来像破了洞。
        if (relief) {
          const pr = prevRow[x];
          if (pr >= 0 && row > pr + 1) {
            const cr = prevR[x] * 0.9;
            const cg = prevG[x] * 0.9;
            const cb = prevB[x] * 0.9;
            const end = row < bufferH ? row : bufferH;
            for (let fy = pr + 1; fy < end; fy += 1) {
              const fp = (fy * w + x) * 4;
              data[fp] = cr;
              data[fp + 1] = cg;
              data[fp + 2] = cb;
              data[fp + 3] = 255;
            }
          }
          prevRow[x] = row;
          prevR[x] = r;
          prevG[x] = g;
          prevB[x] = b;
        }

        // 陆地统一去色：把自然界的鲜艳色压回「墨分五色」。
        // 少了这一步，画出来永远像卫星照片，而不是水墨。
        // 水不去色——否则水面会变成一片看不出是水的灰。
        if (depth <= 0.0015) {
          const lum = r * 0.299 + g * 0.587 + b * 0.114;
          r += (lum - r) * DESATURATE;
          g += (lum - g) * DESATURATE;
          b += (lum - b) * DESATURATE;
        }

        // 宣纸颗粒：有序抖动 + 一点位置噪声
        const grain = (BAYER4[(y & 3) * 4 + (x & 3)] / 15 - 0.5) * 7;
        const noise = (((x * 73856093) ^ (y * 19349663)) & 15) / 15 - 0.5;
        mixRgb([r, g, b], INK_RGB.paper, PAPER_MIX, tmpB);
        const gv = grain + noise * 3.2;
        data[p] = tmpB[0] + gv;
        data[p + 1] = tmpB[1] + gv;
        data[p + 2] = tmpB[2] + gv;
        data[p + 3] = 255;
      }
    }

    this.ctx.putImageData(this.image, 0, 0);
    this.lastRender = time;
  }
}
