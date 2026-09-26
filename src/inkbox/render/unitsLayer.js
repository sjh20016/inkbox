// 水墨沙盒 · 生灵与建筑图层
//
// 像素小人：以墨点阵画出的人形，小到不抢山水的戏，大到能一眼分清身份。
//
// 这一版把小人从 4×7 长到了 5×10。多出来的三行不是白给的：
//   第 6 行是束带，第 7~9 行给了「分开的两条腿」，于是走动时两腿真的会交替，
//   而不是整体上下浮——这是从「会动的点」变成「在走路的人」的关键。
//
// 境界越高，衣着越讲究：筑基束带换色、金丹缀金、元婴起灵光、化神御剑、合体金光罩顶。
// 这些不是画在点阵里，而是按境界叠上去的，所以加境界不用重画精灵。
//
// 点阵字符含义：
//   '0' 透明 · '1' 衣/身 · '2' 深色（发、足、轮廓）· '3' 点缀（束带、佩饰）· '4' 亮色（面）

import { SPECIES, SPECIES_INFO } from '../core/config.js';
import { realmIndexFor } from '../core/cultivation.js';
import { INK_RGB, toCss } from './palette.js';
// 空间裂缝（阶段三）。半径**现算**：`rift.radius` 按契约**不存在**，
// 读它永远得到 `undefined`，画出来是空的、而且**不报错**——
// 本项目「字段存在 ≠ 字段生效」的典型坑。公式的唯一真源在 `sim/rifts.js`
// （`riftRadiusAt` / `riftIsActive`），这里**绝不**复制一份曲线，免得两处漂移。
import { riftRadiusAt, riftIsActive } from '../sim/rifts.js';

// ── 人形 ─────────────────────────────────────────────────
// 两帧：A 并腿，B 迈步。其余部分完全相同。
const MORTAL_A = [
  '02220',
  '02440',
  '02440',
  '01110',
  '31113',
  '01110',
  '03330',
  '01010',
  '01010',
  '02020',
];
const MORTAL_B = [
  '02220',
  '02440',
  '02440',
  '01110',
  '31113',
  '01110',
  '03330',
  '01100',
  '00110',
  '02002',
];

// 修士：长袍及地，束带更宽
const CULTIVATOR_A = [
  '02220',
  '02440',
  '02440',
  '01110',
  '31113',
  '01110',
  '03330',
  '11111',
  '01110',
  '00200',
];
const CULTIVATOR_B = [
  '02220',
  '02440',
  '02440',
  '01110',
  '31113',
  '01110',
  '03330',
  '11111',
  '00100',
  '02020',
];

// ── 荒野生灵 ─────────────────────────────────────────────
const BEAST_A = [
  '000110000',
  '001111100',
  '121111210',
  '011111110',
  '011111110',
  '010101010',
  '010001010',
];
const BEAST_B = [
  '000110000',
  '001111100',
  '121111210',
  '011111110',
  '011111110',
  '010101010',
  '001010100',
];

const SPIRIT_A = [
  '0011100',
  '0111110',
  '1111111',
  '1111111',
  '0111110',
  '0011100',
  '0101010',
  '0000000',
];
const SPIRIT_B = [
  '0011100',
  '0111110',
  '1111111',
  '1111111',
  '0111110',
  '0011100',
  '0010100',
  '0000000',
];

/** 每个物种两帧。绘制时按是否在行走取帧 */
const SPRITES = Object.freeze({
  [SPECIES.HUMAN]: [MORTAL_A, MORTAL_B],
  [SPECIES.CULTIVATOR]: [CULTIVATOR_A, CULTIVATOR_B],
  [SPECIES.BEAST]: [BEAST_A, BEAST_B],
  [SPECIES.SPIRIT]: [SPIRIT_A, SPIRIT_B],
  // 鬼魂（契约 reports/d5/BATCH2-DESIGN.md §七）。**刻意复用凡人的剪影位图**，
  // 不新画像素美术：考古文案（06册:186）的基调是「吓人的是在冥河边**看见熟脸**」——
  // 复用凡人剪影正是要的效果。颜色由 `SPECIES_INFO.ghost.color`（幽墨冷灰蓝）提供，
  // 视觉上仍与活人分得开。
  // ⚠️ 必须显式登记：`framesFor` 的 `SPRITES[species] || SPRITES[SPECIES.HUMAN]`
  //    兜底会让**未注册的 sp 静默长成凡人**——不报错，只是认不出这是鬼。
  [SPECIES.GHOST]: [MORTAL_A, MORTAL_B],
});

// ── 建筑 ─────────────────────────────────────────────────
// '0' 透明 · '1' 墙 · '2' 屋顶 · '3' 门
const HOUSE_SMALL = ['0002200', '0022220', '0222222', '1111111', '1110111', '1110111'];
const HOUSE_LARGE = ['00022200', '00222220', '02222222', '22222222', '11111111', '11110111', '11110111'];
const HOUSE_RUIN = ['0000000', '0100010', '0110110', '0111110', '0010100'];

// 宗门大殿：三重檐的殿宇，'4' 为匾额
const SECT_HALL = [
  '00002220000',
  '00022222000',
  '00222222200',
  '00002220000',
  '00222222200',
  '00002220000',
  '02222222220',
  '11111111111',
  '11114441111',
  '11110111111',
  '11110111111',
];

function framesFor(species) {
  return SPRITES[species] || SPRITES[SPECIES.HUMAN];
}

/** 按颜色批量绘制点阵，减少 fillStyle 切换 */
function drawSprite(ctx, rows, left, top, cell, colors, flip) {
  const rowCount = rows.length;
  const colCount = rows[0].length;
  const width = colCount * cell;
  const order = ['1', '2', '3', '4'];
  for (let k = 0; k < order.length; k += 1) {
    const key = order[k];
    const color = colors[key];
    if (!color) continue;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let r = 0; r < rowCount; r += 1) {
      const line = rows[r];
      for (let c = 0; c < colCount; c += 1) {
        if (line[c] !== key) continue;
        const px = flip ? left + width - (c + 1) * cell : left + c * cell;
        ctx.rect(px, top + r * cell, cell + 0.35, cell + 0.35);
      }
    }
    ctx.fill();
  }
}

/**
 * 境界外观。
 *
 * 这些不是画在点阵里的——按境界叠上去，所以以后加境界不必重画精灵。
 * 返回 null 表示这个境界还看不出与凡人的分别。
 */
const REALM_STYLE = Object.freeze([
  null,                                                        // 炼气
  { sash: '#8fa7b8', glow: null, fly: false },                  // 筑基：素色束带
  { sash: '#c8a44e', glow: 'rgba(200,164,78,0.30)', fly: false }, // 金丹：金线
  { sash: '#8fb0d8', glow: 'rgba(143,176,216,0.42)', fly: true }, // 元婴：灵光，御剑
  { sash: '#c98fd8', glow: 'rgba(201,143,216,0.5)', fly: true },  // 化神
  { sash: '#e8c860', glow: 'rgba(232,200,96,0.62)', fly: true },  // 合体
  // 大乘（上界境界）。风格与合体同级或更强：束带更亮的紫金，灵光 alpha 0.72
  // 压过合体的 0.62，御剑。配色与 REALMS 里大乘的 `#7d4fb8` 呼应。
  // ⚠️ 缺这一项时 `REALM_STYLE[6]` 是 undefined，大乘修士会静默地没有束带 /
  // 没有灵光 / 不御剑（下面 `style && style.sash` 全被短路），不报错。
  { sash: '#b98cff', glow: 'rgba(185,140,255,0.72)', fly: true }, // 大乘
]);

/**
 * 裂缝形状的**确定性**伪随机（0..1）。同一条裂缝每帧拿到同一串数。
 *
 * 为什么不用 `Math.random()`：那样裂缝每帧都会重新抖一次形状，看起来像一团
 * 躁动的噪声，而不是「地上的一道裂口」。为什么不用 `rifts.js` 的 `riftRngFor`：
 * 那是**模拟侧**的随机流，渲染每帧去抽签会把模拟的随机序列推着走——
 * 画面掉帧都会改变世界线（铁律一：渲染绝不碰模拟随机流）。这里只要一个
 * 「由 id 决定的、稳定的」散列就够了。
 */
function riftNoise(id, k) {
  let x = (Math.imul((id | 0) + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k | 0, 0xc2b2ae35)) | 0;
  x = Math.imul(x ^ (x >>> 13), 0x27d4eb2f);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

export class UnitsLayer {
  constructor() {
    this.showLabels = true;
    this.showTerritory = true;
    this.showSites = true;
    /** 地盘离屏画布（一格一像素）与它的缓存键 */
    this.terrCanvas = null;
    this.terrCtx = null;
    this.terrKey = '';
  }

  /** 世界格 + 高程 → 屏幕点（立体视图下随高程上移） */
  static project(camera, x, y, height) {
    const lift = camera.relief ? height * (camera.reliefScale || 10) : 0;
    return [camera.toScreenX(x), camera.toScreenY(y - lift)];
  }

  /**
   * 把地盘烘进离屏画布：一格一像素，之后每帧只 drawImage。
   *
   * 为什么不每帧直接画矩形：中堂 288×180 = 51840 格，全图可见时
   * 就是五万次 fillRect，一帧都撑不住。而地盘每三十游戏日才变一次
   * （见 sim/territory.js），烘一次能用很久。
   *
   * 高程错行与地形层**逐字一致**（`row = y + pad - 高度 × reliefScale`），
   * 否则立体视图下地盘会陷进山里、或者浮在山头上。
   * pad 由调用方从地形层取，不在这里重算——重算就等于把同一个公式
   * 抄两遍，改一处忘一处。
   */
  territoryCanvas(camera, world, pad) {
    const key = `${world.terrRev || 0}|${pad}|${world.seed}|${world.w}x${world.h}`;
    if (this.terrCanvas && this.terrKey === key) return this.terrCanvas;

    const w = world.w;
    const h = world.h + pad;
    if (!this.terrCanvas) {
      this.terrCanvas = document.createElement('canvas');
      this.terrCtx = this.terrCanvas.getContext('2d');
    }
    if (this.terrCanvas.width !== w || this.terrCanvas.height !== h) {
      this.terrCanvas.width = w;
      this.terrCanvas.height = h;
    }
    const g = this.terrCtx;
    g.clearRect(0, 0, w, h);

    const owner = world.territory;
    if (!owner || owner.length !== world.size) {
      this.terrKey = key;
      return this.terrCanvas;
    }

    // 按 id 索引配色，别在 5 万次循环里查 factionById（那是线性搜索）。
    // 四档浓度预先拼好：边缘淡、腹地浓——不用模糊也能有「晕开」的感觉。
    const shades = [];
    for (let k = 0; k < world.factions.length; k += 1) {
      const f = world.factions[k];
      shades[f.id] = [`${f.color}07`, `${f.color}0d`, `${f.color}14`, `${f.color}1f`];
    }

    const relief = camera.relief;
    const rs = camera.reliefScale || 10;
    for (let y = 0; y < world.h; y += 1) {
      const base = y * w;
      for (let x = 0; x < w; x += 1) {
        const i = base + x;
        const id = owner[i];
        if (!id) continue;
        const shade = shades[id];
        if (!shade) continue;
        const r = relief ? y + pad - Math.round(world.height[i] * rs) : y;
        if (r < 0 || r >= h) continue;
        // 同门邻居越多，颜色越实
        const n = (x > 0 && owner[i - 1] === id ? 1 : 0)
          + (x < w - 1 && owner[i + 1] === id ? 1 : 0)
          + (y > 0 && owner[i - w] === id ? 1 : 0)
          + (y < world.h - 1 && owner[i + w] === id ? 1 : 0);
        g.fillStyle = shade[n];
        g.fillRect(x, r, 1, 1);
      }
    }
    this.terrKey = key;
    return this.terrCanvas;
  }

  /**
   * 画宗门地盘。
   *
   * 地盘不再是「每个村子一圈光晕」——那只是个提示，看不出形状。
   * 现在是代价洪泛出来的整片势力图：顺河谷长、被山脊挡，
   * 一眼能看出「蜀道难」。
   *
   * pad 必须与地形层同值，否则错行对不上（见 territoryCanvas）。
   */
  drawTerritory(ctx, camera, world, pad = 0) {
    if (!this.showTerritory) return;
    const canvas = this.territoryCanvas(camera, world, pad);
    if (!canvas || !canvas.width) return;
    const zoom = camera.zoom;
    ctx.save();
    ctx.drawImage(
      canvas,
      0, 0, canvas.width, canvas.height,
      camera.toScreenX(0), camera.toScreenY(-pad),
      canvas.width * zoom, canvas.height * zoom,
    );
    ctx.restore();
  }

  /** 灵脉：地气上涌之处，画一圈会呼吸的青色晕 */
  drawLeylines(ctx, camera, world, time) {
    if (camera.zoom < 1.2 || !world.leylines || !world.leylines.length) return;
    const rect = camera.visibleRect(world);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < world.leylines.length; i += 1) {
      const l = world.leylines[i];
      if (l.x < rect.x0 - 20 || l.x > rect.x1 + 20 || l.y < rect.y0 - 20 || l.y > rect.y1 + 20) continue;
      const idx = world.idx(Math.floor(l.x), Math.floor(l.y));
      const [sx, sy] = UnitsLayer.project(camera, l.x, l.y, world.height[idx]);
      const pulse = 0.55 + Math.sin(time * 1.1 + i) * 0.45;
      const radius = (l.radius || 7) * camera.zoom * (0.85 + pulse * 0.25);
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
      const a = 0.1 * pulse * (l.strength || 0.35) * 2.6;
      grad.addColorStop(0, `rgba(120,196,196,${a})`);
      grad.addColorStop(0.6, `rgba(90,150,170,${a * 0.4})`);
      grad.addColorStop(1, 'rgba(90,150,170,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * 空间裂缝：凡间地图上**真实存在**的裂缝实体（阶段三，见 sim/rifts.js）。
   *
   * **谁调它**：主代理把它接到 `main.js` 的渲染链上，建议插在
   * `this.units.drawLeylines(ctx, this.camera, world, now);`（`main.js:1159`）之后、
   * `drawStructures` 之前——裂缝是「地上的裂口」，画在地形层之上、人造物之下。
   * 调用：`this.units.drawRifts(ctx, this.camera, world, now);`
   * （`now` 是渲染用的秒数，与其它 draw 函数的第四个参数同义）。
   *
   * ⚠️ **与 `main.js` 的 `drawRiftBorder` 是两回事**：那个画的是**视界窗口**
   *    的四条边（一圈整齐的断续矩形描边，是 UI 提示）；这里画的是地图上
   *    真实存在的裂缝——**不规则的墨色裂纹**，像地面被撕开的口子。
   *    两者视觉上必须一眼可分：这里刻意**不画矩形**，只画从裂口向外撕开的折线。
   *
   * ⚠️ 半径来自 `riftRadiusAt(rift)`**现算**，**绝不**读
   *    `rift.radius`（按契约那个字段不存在，读它永远是 `undefined`）。
   *    ⚠️ 签名**只有一个参数**：函数内部读的是 `rift.age`（**视界开启期间**累积的
   *       天数），**不是** `world.day`。从前这里写 `riftRadiusAt(rift, world.day)`，
   *       第二个参数被**静默忽略** —— 结果碰巧是对的，但读代码的人会以为半径按
   *       绝对天数算（那是 2026-09-19 之前的旧语义）；而谁要是「照着注释」把签名
   *       改回 `(rift, day)`，行为会**静默**退回旧语义，且不报错。
   *
   * 性能：活跃裂缝有上限（`RIFT_MAX_ACTIVE = 64`），所以每帧直接画；
   * 每条的代价是 `riftRadiusAt` 里的一次 `Math.exp` 加常数条折线，
   * **没有任何 O(size) 的遍历**（不像 drawFireGlow 要扫可见矩形里的每一格）。
   *
   * 浅色主题：底色浅、线条深——裂纹用墨色（`INK_RGB.ink` 一族），
   * 配一层很淡的冷色微光点出「这是空间的口子」。**不用白字/白线**画在浅底上。
   */
  drawRifts(ctx, camera, world, time) {
    const list = world && world.rifts;
    if (!list || !list.length) return;
    const rect = camera.visibleRect(world);
    const zoom = camera.zoom;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < list.length; i += 1) {
      const rift = list[i];
      // 已闭合的（closedDay >= 0）不画——它们在活跃列表里可能还留着一帧。
      if (!riftIsActive(rift)) continue;
      if (rift.x < rect.x0 - 12 || rift.x > rect.x1 + 12
        || rift.y < rect.y0 - 12 || rift.y > rect.y1 + 12) continue;

      // ── 半径**现算**（铁律二）────────────────────────────
      const r = riftRadiusAt(rift);
      if (r <= 0) continue;
      const R = r * zoom;                       // 屏幕半径（像素）
      if (R < 0.6) continue;                    // 太小看不见，跳过省开销

      const idx = world.idx(Math.floor(rift.x), Math.floor(rift.y));
      const [sx, sy] = UnitsLayer.project(camera, rift.x + 0.5, rift.y + 0.5, world.height[idx]);

      // `strength` 就是**峰值半径**（见 rifts.js 的 riftRadiusAt：峰值处 r ≈ strength），
      // 用它做「最粗时的上限」：`wide` 在扩张期从 0 涨到 1，裂纹随之由细变粗。
      const strength = Math.max(1e-3, rift.strength || 1);
      const wide = Math.min(1, r / strength);

      // ── 1. 裂口：一层墨色径向晕，像地面塌陷了一小块 ──────────
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
      const a0 = 0.30 * (0.45 + 0.55 * wide);
      grad.addColorStop(0, `rgba(34,32,28,${a0.toFixed(3)})`);
      grad.addColorStop(0.55, `rgba(34,32,28,${(a0 * 0.45).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(34,32,28,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      // 椭圆（略压扁）比正圆更像「地面上的裂口」而不是一个墨点。
      ctx.ellipse(sx, sy, R, R * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── 2. 裂纹：3~5 条不规则折线从裂口向外撕开 ──────────────
      // 形状由 `riftNoise(id, …)` 决定 → 同一条裂缝每帧一样，不会抖。
      const branches = 3 + Math.floor(riftNoise(rift.id, 0) * 3);
      const lw = Math.max(0.6, zoom * (0.14 + 0.42 * wide));
      ctx.strokeStyle = `rgba(26,24,20,${(0.5 + 0.4 * wide).toFixed(3)})`;
      ctx.lineWidth = lw;
      const segs = 3;
      for (let b = 0; b < branches; b += 1) {
        let ang = riftNoise(rift.id, b * 7 + 1) * Math.PI * 2;
        const len = R * (0.75 + riftNoise(rift.id, b * 7 + 2) * 0.65);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        let px = sx;
        let py = sy;
        for (let s = 1; s <= segs; s += 1) {
          // 每段拐一下 → 折线（不是直线，也不是矩形）
          ang += (riftNoise(rift.id, b * 23 + s) - 0.5) * 0.9;
          const step = (len / segs) * (0.7 + riftNoise(rift.id, b * 23 + s + 11) * 0.6);
          px += Math.cos(ang) * step;
          py += Math.sin(ang) * step * 0.72;     // 透视压扁，与裂口椭圆同口径
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // ── 3. 冷色微光：点出「这是空间的口子」，而不是普通的地裂 ──
      // 只在放得够大时画，省开销；呼吸很慢，不与 drawRiftBorder 的快流动混淆。
      if (zoom >= 1.6) {
        const glow = 0.10 + 0.07 * Math.sin(time * 2.1 + rift.id);
        ctx.strokeStyle = `rgba(96,150,168,${glow.toFixed(3)})`;
        ctx.lineWidth = Math.max(1, zoom * 0.28);
        ctx.beginPath();
        ctx.ellipse(sx, sy, R * 0.92, R * 0.66, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawStructures(ctx, camera, world) {
    const rect = camera.visibleRect(world);
    const cell = Math.max(0.24, Math.min(3, camera.zoom * 0.22));
    for (let i = 0; i < world.villages.length; i += 1) {
      const v = world.villages[i];
      if (v.x < rect.x0 - 14 || v.x > rect.x1 + 14 || v.y < rect.y0 - 14 || v.y > rect.y1 + 14) continue;
      const faction = world.factionById(v.faction);
      const roof = faction ? faction.color : '#6b6152';
      const wall = faction ? faction.accent : '#c9c0ac';
      const colors = { 1: wall, 2: roof, 3: toCss(INK_RGB.ink) };
      for (let hIdx = 0; hIdx < v.houses.length; hIdx += 1) {
        const h = v.houses[hIdx];
        const idx = world.idx(h.x, h.y);
        const [sx, sy] = UnitsLayer.project(camera, h.x + 0.5, h.y + 1, world.height[idx]);
        const rows = h.type === 2 ? HOUSE_LARGE : HOUSE_SMALL;
        const hc = cell * 1.35;
        drawSprite(ctx, rows, sx - rows[0].length * hc / 2, sy - rows.length * hc, hc, colors, false);
      }
    }
  }

  /**
   * 宗门大殿：立在山门处，是这张图上少有的「人造物」，
   * 让玩家一眼看出哪里有门派，而不是只看到一堆小人。
   */
  drawSects(ctx, camera, world) {
    const rect = camera.visibleRect(world);
    const cell = Math.max(0.3, Math.min(3.4, camera.zoom * 0.26));
    for (let i = 0; i < world.factions.length; i += 1) {
      const f = world.factions[i];
      if (!f.capitalX) continue;
      if (f.capitalX < rect.x0 - 20 || f.capitalX > rect.x1 + 20
        || f.capitalY < rect.y0 - 20 || f.capitalY > rect.y1 + 20) continue;
      const idx = world.idx(
        Math.max(0, Math.min(world.w - 1, Math.floor(f.capitalX))),
        Math.max(0, Math.min(world.h - 1, Math.floor(f.capitalY))),
      );
      const [sx, sy] = UnitsLayer.project(camera, f.capitalX, f.capitalY + 1, world.height[idx]);
      const colors = {
        1: f.accent || '#c9c0ac',
        2: f.color || '#6b6152',
        3: toCss(INK_RGB.ink),
        4: toCss(INK_RGB.gold),
      };
      drawSprite(ctx, SECT_HALL, sx - SECT_HALL[0].length * cell / 2, sy - SECT_HALL.length * cell, cell, colors, false);
    }
  }

  /**
   * 地图地点：秘境、洞府、古阵、遗蜕。
   * 这些是修士会专程赶去的「机缘」，所以给它们各自的记号。
   */
  drawSites(ctx, camera, world, time) {
    if (!this.showSites || camera.zoom < 1.6 || !world.sites || !world.sites.length) return;
    const rect = camera.visibleRect(world);
    const s = Math.max(3.5, camera.zoom * 1.5);
    ctx.save();
    ctx.lineWidth = Math.max(1, camera.zoom * 0.18);
    for (let i = 0; i < world.sites.length; i += 1) {
      const site = world.sites[i];
      if (site.x < rect.x0 - 6 || site.x > rect.x1 + 6 || site.y < rect.y0 - 6 || site.y > rect.y1 + 6) continue;
      const idx = world.idx(Math.floor(site.x), Math.floor(site.y));
      const [sx, sy] = UnitsLayer.project(camera, site.x + 0.5, site.y + 0.5, world.height[idx]);
      const pulse = 0.75 + Math.sin(time * 1.6 + i * 1.7) * 0.25;

      if (site.kind === 'secret') {
        // 秘境：一道青色的裂隙
        ctx.strokeStyle = `rgba(126,186,190,${0.85 * pulse})`;
        ctx.beginPath();
        ctx.moveTo(sx, sy - s);
        ctx.lineTo(sx + s * 0.5, sy);
        ctx.lineTo(sx, sy + s);
        ctx.lineTo(sx - s * 0.5, sy);
        ctx.closePath();
        ctx.stroke();
      } else if (site.kind === 'cave') {
        // 洞府：一个墨色的拱门
        ctx.strokeStyle = `rgba(74,71,66,${0.9 * pulse})`;
        ctx.beginPath();
        ctx.arc(sx, sy + s * 0.4, s * 0.75, Math.PI, 0);
        ctx.stroke();
      } else if (site.kind === 'formation') {
        // 古阵：同心方环
        ctx.strokeStyle = `rgba(200,164,78,${0.8 * pulse})`;
        ctx.strokeRect(sx - s * 0.7, sy - s * 0.7, s * 1.4, s * 1.4);
        ctx.beginPath();
        ctx.arc(sx, sy, s * 0.32, 0, Math.PI * 2);
        ctx.stroke();
      } else if (site.kind === 'ruin') {
        ctx.strokeStyle = `rgba(142,135,120,${0.85})`;
        ctx.beginPath();
        ctx.moveTo(sx - s * 0.6, sy + s * 0.5);
        ctx.lineTo(sx - s * 0.2, sy - s * 0.5);
        ctx.lineTo(sx + s * 0.3, sy + s * 0.5);
        ctx.moveTo(sx + s * 0.3, sy + s * 0.5);
        ctx.lineTo(sx + s * 0.7, sy - s * 0.2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawEntities(ctx, camera, world, time) {
    const rect = camera.visibleRect(world);
    const list = world.entities;
    const baseCell = Math.max(0.22, Math.min(3.1, camera.zoom * 0.215));
    const showDetail = camera.zoom >= 2.2;
    const drawAura = camera.zoom >= 1.8;

    for (let i = 0; i < list.length; i += 1) {
      const e = list[i];
      if (e.x < rect.x0 || e.x > rect.x1 || e.y < rect.y0 || e.y > rect.y1) continue;
      const idx = world.idx(Math.floor(e.x), Math.floor(e.y));
      const height = world.height[idx];
      const [sx, sy] = UnitsLayer.project(camera, e.x, e.y, height);

      const info = SPECIES_INFO[e.sp] || SPECIES_INFO.human;
      let bodyColor = info.color;
      let accentColor = '#d9d2bf';
      if (e.faction) {
        const faction = world.factionById(e.faction);
        if (faction) {
          bodyColor = faction.color;
          accentColor = faction.accent;
        }
      }

      // 境界外观：束带换色、灵光、御剑
      const level = e.level || 0;
      const realm = level > 0 ? realmIndexFor(level) : -1;
      const style = realm >= 1 ? REALM_STYLE[realm] : null;
      if (style && style.sash) accentColor = style.sash;
      const flying = !!(style && style.fly);

      const frames = framesFor(e.sp);
      // 两帧行走：只有真的在赶路时才换帧，站着不动就回到并腿那一帧
      const moving = Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y) > 0.4;
      const frame = moving ? ((Math.floor(time * 5 + (e.id || 0) * 0.37) % 2) + 2) % 2 : 0;
      const rows = frames[frame];

      const cell = baseCell;
      const width = rows[0].length * cell;
      const heightPx = rows.length * cell;
      // 御剑者离地三尺
      const hover = flying ? cell * 2.4 + (showDetail ? Math.sin(time * 2 + (e.id || 0)) * cell * 0.3 : 0) : 0;
      const bob = showDetail && !flying ? Math.sin(time * 4 + (e.id || 0)) * cell * 0.18 : 0;
      const colors = {
        1: bodyColor,
        2: e.sp === SPECIES.BEAST ? bodyColor : '#2f2b24',
        3: accentColor,
        4: e.sp === SPECIES.BEAST ? bodyColor : '#e6d9c0',
      };

      // 灵光：境界够高的人身上罩一层气
      if (drawAura && style && style.glow) {
        const r = width * (flying ? 1.5 : 1.15);
        const grad = ctx.createRadialGradient(sx, sy - heightPx * 0.5 - hover, 0, sx, sy - heightPx * 0.5 - hover, r);
        grad.addColorStop(0, style.glow);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy - heightPx * 0.5 - hover, r, 0, Math.PI * 2);
        ctx.fill();
      }

      drawSprite(ctx, rows, sx - width / 2, sy - heightPx + bob - hover, cell, colors, e.face < 0);

      // 御剑：脚下一道细剑
      if (flying && showDetail) {
        ctx.fillStyle = 'rgba(210,205,190,0.9)';
        ctx.fillRect(sx - width * 0.85, sy - hover + bob + cell * 0.2, width * 1.7, Math.max(0.8, cell * 0.34));
      }

      if (showDetail && e.hp < e.maxHp * 0.5) {
        ctx.fillStyle = 'rgba(168,73,60,0.85)';
        ctx.fillRect(sx - width / 2, sy - heightPx - hover - 2.4, width * (e.hp / e.maxHp), 1.1);
      }
    }
  }

  /**
   * 凡间鬼影（D6-3 工程包 B）。
   *
   * ⚠️ 这批实体**不在 `world.entities` 里**（理由见 `sim/wraiths.js` 头注释），
   *    所以 `drawEntities` 一行都画不到它们——必须在主渲染链里**单独调一次**。
   *    这就是「独立容器」在**渲染侧**的代价：多一次调用，换来的是「鬼不会被
   *    凡间那套修炼 / 觉醒 / 飞升链吃掉」这条结构性保证。
   *
   * 外观：冷灰蓝（`SPECIES_INFO.ghost.color`）、**半透明**（0.55）、离地浮一点、
   * 上下轻轻飘。半透明是关键——不然它和普通凡人像素小人长得一模一样，
   * 玩家会以为那是个人（`SPECIES.GHOST` 的精灵本来就是借 `MORTAL_A/B` 画的）。
   *
   * ⚠️ 只画**可见矩形内**的（同 `drawEntities` 的裁剪）：`world.wraiths` 上限
   *    120 只，全画也不会慢，但保持同款裁剪省得后来人以为这里可以偷懒。
   */
  drawWraiths(ctx, camera, world, time) {
    const list = world.wraiths;
    if (!list || !list.length) return;
    const rect = camera.visibleRect(world);
    const baseCell = Math.max(0.22, Math.min(3.1, camera.zoom * 0.215));
    const showDetail = camera.zoom >= 2.2;
    const info = SPECIES_INFO[SPECIES.GHOST] || SPECIES_INFO.human;

    ctx.save();
    ctx.globalAlpha = 0.55;                 // 半透明：一眼看出「不是人」
    for (let i = 0; i < list.length; i += 1) {
      const e = list[i];
      if (e.x < rect.x0 || e.x > rect.x1 || e.y < rect.y0 || e.y > rect.y1) continue;
      const idx = world.idx(Math.floor(e.x), Math.floor(e.y));
      const height = world.height[idx];
      const [sx, sy] = UnitsLayer.project(camera, e.x, e.y, height);

      const frames = framesFor(e.sp);
      const moving = Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y) > 0.4;
      const frame = moving ? ((Math.floor(time * 5 + (e.id || 0) * 0.37) % 2) + 2) % 2 : 0;
      const rows = frames[frame];

      const cell = baseCell;
      const width = rows[0].length * cell;
      const heightPx = rows.length * cell;
      // 离地浮一点 + 上下飘（鬼不沾地）
      const hover = cell * 1.6 + (showDetail ? Math.sin(time * 1.6 + (e.id || 0)) * cell * 0.5 : 0);

      const colors = {
        1: info.color,
        2: '#2b2e36',
        3: '#7d8698',
        4: '#aab2c0',
      };
      drawSprite(ctx, rows, sx - width / 2, sy - heightPx - hover, cell, colors, e.face < 0);
    }
    ctx.restore();
  }

  drawFireGlow(ctx, camera, world, time) {
    if (camera.zoom < 2) return;
    const rect = camera.visibleRect(world);
    let budget = 500;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let y = rect.y0; y <= rect.y1 && budget > 0; y += 1) {
      for (let x = rect.x0; x <= rect.x1 && budget > 0; x += 1) {
        const i = y * world.w + x;
        const f = world.fire[i];
        if (f < 0.18) continue;
        budget -= 1;
        const [sx, sy] = UnitsLayer.project(camera, x + 0.5, y + 0.5, world.height[i]);
        const flicker = 0.7 + Math.sin(time * 9 + x * 1.7 + y * 2.3) * 0.3;
        const radius = camera.zoom * (0.9 + f) * flicker;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
        grad.addColorStop(0, `rgba(255,196,110,${0.42 * f})`);
        grad.addColorStop(0.5, `rgba(214,110,52,${0.2 * f})`);
        grad.addColorStop(1, 'rgba(214,110,52,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * 地图文字标签：聚落名、宗门名。
   *
   * 为什么要分级（2026-09-23 · D3-B1）
   * --------------------------------
   * 221 年的成熟世界里，六十多个聚落的名签在同一屏里一次全画，
   * 白底小牌子互相压叠，山河被盖得看不见——玩家第一眼看到的不是画，是一层浮层。
   * 所以标签先按「值不值得占这块地方」排好序，再**按缩放分级放出**：
   * 远景只留大聚落（人多的先占位），放大才逐级展开；
   * 已落下的标签记下包围盒，后来的撞上就让路。
   *
   * 样式一并水墨化：原来那块「白底 + 1px 描边」的矩形牌是网页控件的语言，
   * 贴在宣纸上是两套东西。改成无硬框的淡纸晕底 + 墨字，
   * 归属只用一枚宗门色小点表示（颜色只做点，不染字）。
   *
   * ⚠️ 排序键只用 `pop` / `id`，**不用任何随机**：渲染路径里出现 `Math.random()`
   *   会让同种子两次运行分叉（MEMORY「模拟期确定性 ≠ 生成期确定性」）。
   */
  drawLabels(ctx, camera, world) {
    if (!this.showLabels || camera.zoom < 3.4) return;
    const rect = camera.visibleRect(world);
    const zoom = camera.zoom;
    const size = Math.max(9, Math.min(14, zoom * 2.2));
    ctx.save();
    ctx.font = `${size}px "Noto Serif SC", KaiTi, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const placed = [];

    // ① 聚落：人口多的先落笔，同人口按 id —— 排序稳定，与随机无关
    const vis = [];
    for (let i = 0; i < world.villages.length; i += 1) {
      const v = world.villages[i];
      if (v.x < rect.x0 - 10 || v.x > rect.x1 + 10 || v.y < rect.y0 - 10 || v.y > rect.y1 + 10) continue;
      vis.push(v);
    }
    vis.sort((a, b) => (b.pop - a.pop) || (a.id - b.id));
    // 远景 8 枚，逐级放宽，放到足够大就不再限量
    const budget = zoom < 4.2 ? 8 : zoom < 5.5 ? 16 : zoom < 7 ? 30 : zoom < 9 ? 60 : vis.length;

    for (let i = 0; i < vis.length && placed.length < budget; i += 1) {
      const v = vis[i];
      const idx = world.idx(Math.floor(v.x), Math.floor(v.y));
      const [sx, sy] = UnitsLayer.project(camera, v.x, v.y, world.height[idx]);
      const text = `${v.name}${v.level > 1 ? ` ·${v.pop}` : ''}`;
      const wpx = ctx.measureText(text).width;
      const cy = sy - zoom * 1.6 - 9;
      const box = [sx - wpx / 2 - 7, cy - 8, wpx + 14, 16];
      if (overlapsPlaced(placed, box)) continue;
      const faction = v.faction ? world.factionById(v.faction) : null;
      drawInkLabel(ctx, box, text, faction ? faction.color : null);
      placed.push(box);
    }

    // ② 宗门：放大到看得清大殿时才写名字，远景靠大殿精灵认门派。
    //    名字一律墨色，只用左侧那一点色块带出门派（与大殿屋顶同色）。
    if (zoom >= 6) {
      ctx.font = `${Math.min(15, size + 1.5)}px "Noto Serif SC", KaiTi, serif`;
      for (let i = 0; i < world.factions.length; i += 1) {
        const f = world.factions[i];
        if (!f.capitalX) continue;
        if (f.capitalX < rect.x0 - 6 || f.capitalX > rect.x1 + 6
          || f.capitalY < rect.y0 - 6 || f.capitalY > rect.y1 + 6) continue;
        const idx = world.idx(
          Math.max(0, Math.min(world.w - 1, Math.floor(f.capitalX))),
          Math.max(0, Math.min(world.h - 1, Math.floor(f.capitalY))),
        );
        const [sx, sy] = UnitsLayer.project(camera, f.capitalX, f.capitalY + 1, world.height[idx]);
        const wpx = ctx.measureText(f.name).width;
        const cy = sy - zoom * 2.6 - 12;
        const box = [sx - wpx / 2 - 8, cy - 9, wpx + 16, 18];
        if (overlapsPlaced(placed, box)) continue;
        drawInkLabel(ctx, box, f.name, f.color || null, true);
        placed.push(box);
      }
    }
    ctx.restore();
  }

  /** 笔刷光标 */
  drawBrush(ctx, camera, world, x, y, radius, color) {
    const idx = world.idx(Math.max(0, Math.min(world.w - 1, Math.round(x))), Math.max(0, Math.min(world.h - 1, Math.round(y))));
    const [sx, sy] = UnitsLayer.project(camera, x + 0.5, y + 0.5, world.height[idx]);
    const r = Math.max(3, radius * camera.zoom);
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(34,32,28,0.75)';
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color || 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, r - 1.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** 选中格高亮 */
  drawSelection(ctx, camera, world, x, y) {
    if (!world.inside(x, y)) return;
    const idx = world.idx(x, y);
    const [sx, sy] = UnitsLayer.project(camera, x, y, world.height[idx]);
    const size = camera.zoom;
    ctx.save();
    ctx.strokeStyle = 'rgba(168,73,60,0.95)';
    ctx.lineWidth = 1.5;
    const pad = 2;
    ctx.strokeRect(sx - pad, sy - pad, size + pad * 2, size + pad * 2);
    ctx.strokeStyle = 'rgba(233,224,205,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - pad - 1.5, sy - pad - 1.5, size + pad * 2 + 3, size + pad * 2 + 3);
    ctx.restore();
  }

  /** 网格：只在放得足够大时出现，帮助玩家精确改地形 */
  drawGrid(ctx, camera, world) {
    if (camera.zoom < 7) return;
    const rect = camera.visibleRect(world);
    ctx.save();
    ctx.strokeStyle = 'rgba(34,32,28,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = rect.x0; x <= rect.x1 + 1; x += 1) {
      const sx = Math.round(camera.toScreenX(x)) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, camera.viewH);
    }
    for (let y = rect.y0; y <= rect.y1 + 1; y += 1) {
      const sy = Math.round(camera.toScreenY(y)) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(camera.viewW, sy);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * 新标签撞上已落下的就不画。
 * 只跟最近若干枚比：同屏标签最多几十枚，全量两两比没必要，
 * 而「撞上一枚很远的」在视觉上本来就无所谓。
 */
function overlapsPlaced(placed, box, limit = 48) {
  const start = Math.max(0, placed.length - limit);
  for (let i = start; i < placed.length; i += 1) {
    const b = placed[i];
    if (box[0] < b[0] + b[2] && box[0] + box[2] > b[0]
      && box[1] < b[1] + b[3] && box[1] + box[3] > b[1]) return true;
  }
  return false;
}

/** 圆角路径：自己画，不依赖 `ctx.roundRect`（稍旧的内核里没有）。 */
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/**
 * 一枚水墨标签：淡纸底托着墨字；有宗门时左侧点一枚宗门色。
 * 不加硬描边——描边是网页控件的语言，宣纸上只该有墨与纸。
 */
function drawInkLabel(ctx, box, text, dotColor, strong = false) {
  const [x, y, w, h] = box;
  ctx.fillStyle = strong ? 'rgba(240,234,220,0.88)' : 'rgba(240,234,220,0.72)';
  roundRectPath(ctx, x, y, w, h, 3);
  ctx.fill();
  // 一道极淡的墨边：只为把底从深色地形（密林、山阴）里托起来
  ctx.strokeStyle = 'rgba(34,32,28,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (dotColor) {
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(x + 5.5, y + h / 2, strong ? 2.4 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#26241f';
  ctx.fillText(text, x + w / 2 + (dotColor ? 2 : 0), y + h / 2 + 0.5);
}

export { drawSprite, SPRITES, REALM_STYLE };
