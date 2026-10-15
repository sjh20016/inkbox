// 水墨沙盒 · 神格工具表
//
// 每个工具就是一个「对世界做一件事」的函数，UI 只负责把点击/拖拽翻译成
// apply(ctx) 调用。这样新增一个神力只需要在这里加一条。

import { SPECIES, TERRAIN } from '../core/config.js';
import { OVER } from '../world/terrain.js';
import * as P from '../sim/powers.js';
import * as D from '../sim/divine.js';

const T = (id, name, icon, group, hint, extra) => ({ id, name, icon, group, hint, ...extra });

/** 划选区域的最小多边形面积（格）。手抖划出的针尖大的窗不该开——
 *  它看不见任何东西，却会占满屏幕一层裁剪与一道裂缝边框。 */
export const REGION_MIN_AREA = 6;

/**
 * 把一条自由划选路径（世界坐标的整数格点序列，**闭合但首尾不重复**）
 * 归一成一个合法的视界区域。
 *
 * 返回 `{ path, x0, y0, x1, y1, area, capped }`；不构成「一片山河」时返回 null：
 *   · 去重后不足 3 点（一次点击只有 1 点、一条直线只有 2 点）；
 *   · 多边形面积 < `REGION_MIN_AREA`（一条线**没有面积**，针尖大的窗也看不见）。
 * 这就是旧 `main.js` 里那条「单格点击不构成一片山河」判据的替代——
 * 那条判的是**矩形跨度**，对自由形状已无意义。
 *
 * ⚠️ **为什么放在 UI 层、且做成不碰 DOM 的纯函数**：`main.js` 依赖 DOM，
 *    node 里 `import` 不了（`document is not defined`），于是
 *    `scripts/_riftprobe.mjs` 就断言不到它。主程序与探针**共用同一份实现**
 *    （而不是在探针里抄一份公式——抄的那份迟早与产品漂移）。
 *
 * `x0/y0/x1/y1` 是**包围盒**（顶层保留）：既有读取者（试玩测试 / 裂缝探针）
 * 都在读 `sel.x0..sel.y1`，而且矩形兜底路径也要用它。
 *
 * @param {Array<[number,number]>} points 原始路径（世界坐标，可含浮点/越界值）
 * @param {object} world 凡间 world（需 `clampX`/`clampY`/`size`）
 * @param {number} maxAreaFrac 面积上限占全图比例（`ui/realmView.js` 的 `VIEW_MAX_AREA_FRAC`）
 * @returns {{path:Array<[number,number]>,x0:number,y0:number,x1:number,y1:number,area:number,capped:boolean}|null}
 */
export function normalizeRegion(points, world, maxAreaFrac) {
  if (!world || !Array.isArray(points) || points.length < 3) return null;

  // ── 1. 逐点取整 + 钳界 + 连续去重 ─────────────────────────
  // 连续去重是**采集端之外的第二道**：拖动时已经去过一次，但注入 / 外部调用
  // 未必去过；而「两点重合」会让鞋带公式里多出一段零长边（无害但脏）。
  const path = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (!p) continue;
    const x = world.clampX(Math.round(p[0]));
    const y = world.clampY(Math.round(p[1]));
    const last = path[path.length - 1];
    if (last && last[0] === x && last[1] === y) continue;
    path.push([x, y]);
  }
  // 首尾重合 → 去掉尾点（契约是「闭合但首尾不重复」，闭合边由鞋带公式自动补）
  if (path.length >= 2) {
    const a = path[0];
    const b = path[path.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) path.pop();
  }
  if (path.length < 3) return null;

  let area = shoelaceArea(path);
  if (area < REGION_MIN_AREA) return null;

  // ── 2. 面积上限：绕质心**等比缩小**（不是裁剪包围盒——那会把形状切坏）──
  // 划满全图会让视界退化成「全图渲染两遍」（规格 §3.4）。
  // ⚠️ 不能静默截断：`capped` 要交回去让玩家知道，否则他会以为「我明明划了
  //    全图，怎么只有中间一块」。
  let capped = false;
  const maxArea = Math.max(1, Math.floor(world.size * maxAreaFrac));
  if (area > maxArea) {
    const src = path.map((p) => [p[0], p[1]]);   // 原始形状，供每轮从零重算
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < src.length; i += 1) { cx += src[i][0]; cy += src[i][1]; }
    cx /= src.length;
    cy /= src.length;
    let k = Math.sqrt(maxArea / area);
    let guard = 0;
    // 取整会让面积在理论上「缩到 maxArea」之后再冒出来一点，所以循环微调；
    // **有界**（64 轮），k 每轮 ×0.98，最多缩到 0.27× —— 足够收敛。
    do {
      for (let i = 0; i < src.length; i += 1) {
        path[i][0] = world.clampX(Math.round(cx + (src[i][0] - cx) * k));
        path[i][1] = world.clampY(Math.round(cy + (src[i][1] - cy) * k));
      }
      area = shoelaceArea(path);
      if (area <= maxArea) break;
      k *= 0.98;
      guard += 1;
    } while (guard < 64);
    capped = true;
  }

  // ── 3. 包围盒 ─────────────────────────────────────────────
  let x0 = path[0][0];
  let x1 = x0;
  let y0 = path[0][1];
  let y1 = y0;
  for (let i = 1; i < path.length; i += 1) {
    const p = path[i];
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return { path, x0, y0, x1, y1, area, capped };
}

/** 鞋带公式：闭合多边形（首尾不重复）的面积，单位是格。 */
function shoelaceArea(path) {
  let twice = 0;
  for (let i = 0; i < path.length; i += 1) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) / 2;
}

export const TOOL_GROUPS = Object.freeze([
  { key: 'terrain', label: '山形', color: '#8a6a44' },
  { key: 'water', label: '水土', color: '#3f5f7d' },
  { key: 'nature', label: '生机', color: '#4d6b52' },
  { key: 'disaster', label: '天灾', color: '#a8493c' },
  { key: 'life', label: '生灵', color: '#6b4a6b' },
  { key: 'dao', label: '仙道', color: '#5a4a7a' },
  { key: 'view', label: '观察', color: '#31505f' },
]);

export const TOOLS = Object.freeze([
  // ── 山形 ──────────────────────────────────────────────
  T('raise', '抬山', '⛰', 'terrain', '隆起地脉，反复涂抹可堆出高峰', {
    mode: 'drag', amount: 0.026,
    apply: (c) => P.sculpt(c.world, c.x, c.y, c.radius, c.amount, c.history),
  }),
  T('lower', '沉陆', '🕳', 'terrain', '下陷地层，一直按可以凿出深谷与海盆', {
    mode: 'drag', amount: -0.026,
    apply: (c) => P.sculpt(c.world, c.x, c.y, c.radius, c.amount, c.history),
  }),
  T('flatten', '平整', '▭', 'terrain', '向落点高程看齐，用来修台地、修路、修城基', {
    mode: 'drag', amount: 0.16,
    apply: (c) => P.flatten(c.world, c.x, c.y, c.radius, c.amount, c.history),
  }),
  T('roughen', '皴石', '⋀', 'terrain', '叠加山石噪声，让坡面出现岩石肌理', {
    mode: 'drag', amount: 0.02,
    apply: (c) => P.roughen(c.world, c.x, c.y, c.radius, c.amount, c.history),
  }),

  // ── 水土 ──────────────────────────────────────────────
  T('water', '注水', '💧', 'water', '抬高水面，水会自己流进低洼处汇成湖泽', {
    mode: 'drag', amount: 0.02,
    apply: (c) => P.addWater(c.world, c.x, c.y, c.radius, c.amount, c.history),
  }),
  T('drain', '抽水', '🫗', 'water', '抽走积水，可以把海抽干，露出海床', {
    mode: 'drag', amount: 0.03,
    apply: (c) => P.removeWater(c.world, c.x, c.y, c.radius, c.amount, c.history),
  }),
  T('rain', '甘霖', '🌧', 'water', '降雨灭火、滋润草木，也能救回烧焦的林地', {
    mode: 'drag',
    apply: (c) => P.rain(c.world, c.x, c.y, c.radius, c.history),
  }),

  // ── 生机 ──────────────────────────────────────────────
  T('forest', '植林', '🌲', 'nature', '种出一片林子，鸟兽与人都会来', {
    mode: 'drag', amount: 0.92,
    apply: (c) => P.paintVegetation(c.world, c.x, c.y, c.radius, c.amount, c.history),
  }),
  T('burn', '焚林', '🔥', 'nature', '点着草木，火会自己顺着风势蔓延', {
    mode: 'drag',
    apply: (c) => P.burnForest(c.world, c.x, c.y, c.radius, c.history),
  }),
  T('fertile', '沃野', '🌾', 'nature', '催肥土地，把焦土与荒漠重新养成可耕之地', {
    mode: 'drag',
    apply: (c) => P.fertilize(c.world, c.x, c.y, c.radius, c.history),
  }),
  T('sand', '荒漠', '🏜', 'nature', '沙化地表', {
    mode: 'drag', overlay: OVER.SAND,
    apply: (c) => P.paintOverlay(c.world, c.x, c.y, c.radius, OVER.SAND, c.history),
  }),
  T('snow', '雪原', '❄', 'nature', '覆上积雪', {
    mode: 'drag', overlay: OVER.SNOW,
    apply: (c) => P.paintOverlay(c.world, c.x, c.y, c.radius, OVER.SNOW, c.history),
  }),
  T('lava', '熔岩', '🌋', 'nature', '灌下岩浆，会慢慢冷却成黑石', {
    mode: 'drag',
    apply: (c) => P.pourLava(c.world, c.x, c.y, c.radius, c.history),
  }),
  T('road', '铺径', '═', 'nature', '铺出小路，生灵走得快，聚落更容易连成一片', {
    mode: 'drag',
    apply: (c) => P.paveRoad(c.world, c.x, c.y, c.radius, c.history),
  }),

  // ── 天灾 ──────────────────────────────────────────────
  T('lightning', '雷霆', '⚡', 'disaster', '一击落地：点燃草木，抹掉一圈生灵', {
    mode: 'click',
    apply: (c) => P.lightning(c.world, c.x, c.y, c.history),
  }),
  T('meteor', '陨石', '☄', 'disaster', '砸出环形坑，坑心化为熔岩', {
    mode: 'click',
    apply: (c) => P.meteor(c.world, c.x, c.y, c.radius, c.history),
  }),
  T('quake', '地动', '〰', 'disaster', '地层错动，房屋倒塌成残垣', {
    mode: 'click',
    apply: (c) => P.earthquake(c.world, c.x, c.y, c.radius, c.history),
  }),
  T('flood', '洪水', '🌊', 'disaster', '瞬间淹掉一片低地，城郭尽没', {
    mode: 'click',
    apply: (c) => P.flood(c.world, c.x, c.y, c.radius, c.history),
  }),
  T('plague', '瘟疫', '☠', 'disaster', '无声无息地取走大半生灵', {
    mode: 'click',
    apply: (c) => P.plague(c.world, c.x, c.y, c.radius),
  }),
  // 与上面四个「一下按到底」的即时天灾不同：这一手是**持续过程**——
  // 灾会一天天扣村子的血与粮，几年后才结算「熬过了 / 没能撑过」，
  // 而结局会写进大事记。玩家于是能看见自己那一手**后来**发生了什么。
  // （在此之前 `worldEvents.triggerCrisis` 全库无调用方，玩家没有降灾的手段。）
  T('crisis', '降灾', '🌪', 'disaster', '让一处聚落陷入经年灾祸：撑不撑得住，过几年才见分晓', {
    mode: 'click',
    apply: (c) => P.triggerCrisis(c.world, c.events, c.x, c.y),
  }),

  // ── 生灵 ──────────────────────────────────────────────
  T('human', '凡人', '🧍', 'life', '撒下一群凡人，他们会自己结庐成村', {
    mode: 'click', species: SPECIES.HUMAN, count: 8,
    apply: (c) => P.paintLife(c.life, c.x, c.y, c.radius, SPECIES.HUMAN, 8),
  }),
  T('cultivator', '修士', '🧙', 'life', '引来修士，寿命长、战力高，能立宗建国', {
    mode: 'click', species: SPECIES.CULTIVATOR, count: 5,
    apply: (c) => P.paintLife(c.life, c.x, c.y, c.radius, SPECIES.CULTIVATOR, 5),
  }),
  T('beast', '灵兽', '🐾', 'life', '放出灵兽，它们会猎食凡人', {
    mode: 'click', species: SPECIES.BEAST, count: 6,
    apply: (c) => P.paintLife(c.life, c.x, c.y, c.radius, SPECIES.BEAST, 6),
  }),
  T('spirit', '山精', '🌫', 'life', '点化山精，游荡于林泉之间', {
    mode: 'click', species: SPECIES.SPIRIT, count: 4,
    apply: (c) => P.paintLife(c.life, c.x, c.y, c.radius, SPECIES.SPIRIT, 4),
  }),
  T('erase', '抹除', '⌫', 'life', '范围内生灵消散，村落会因此荒废', {
    mode: 'click',
    apply: (c) => P.eraseLife(c.world, c.x, c.y, c.radius),
  }),

  // ── 仙道 ──────────────────────────────────────────────
  // 这些工具改的不是山水，是修行。世界本来会自己慢慢演化出宗门与飞升，
  // 但那是几百年尺度的事；玩家想当场看点热闹，得有能立刻拨动它的手段。
  T('root', '赐灵根', '❖', 'dao', '点化凡人，当场开灵根、入炼气', {
    mode: 'click',
    apply: (c) => D.grantRoot(c.world, c.x, c.y, c.radius, c.rng),
  }),
  T('leyline', '引灵脉', '≋', 'dao', '凭空引出一道灵脉：灵气厚，宗门会来争', {
    mode: 'click',
    apply: (c) => D.placeLeyline(c.world, c.x, c.y, c.rng),
  }),
  T('secret', '播秘境', '✦', 'dao', '落一处秘境，修士会自己寻来', {
    mode: 'click',
    apply: (c) => D.placeSecret(c.world, c.x, c.y, c.rng),
  }),
  T('cave', '埋洞府', '⌂', 'dao', '埋一处前人遗泽，等后人来取', {
    mode: 'click',
    apply: (c) => D.placeCave(c.world, c.x, c.y, c.rng),
  }),
  T('tribulation', '降天劫', '☈', 'dao', '逼范围内的修士当场冲瓶颈：成则破境，败则倒退', {
    mode: 'click',
    apply: (c) => D.sendTribulation(c.world, c.x, c.y, c.radius, c.rng),
  }),
  T('manual', '传功法', '📜', 'dao', '天授典籍，让此地修士各得一门功法', {
    mode: 'click',
    apply: (c) => D.grantManual(c.world, c.x, c.y, c.radius, c.rng),
  }),
  T('forbidden', '降禁术', '🩸', 'dao', '把禁术塞给此地最强的修士，从此为正道所不容', {
    mode: 'click',
    apply: (c) => D.grantForbidden(c.world, c.x, c.y, c.radius, c.rng),
  }),
  T('ascend', '点化飞升', '☁', 'dao', '把此地境界最高的人送往上界，留洞府于人间', {
    mode: 'click',
    apply: (c) => D.ascendChosen(c.world, c.x, c.y, c.radius, c.rng),
  }),
  T('found', '立宗', '⛩', 'dao', '命附近筑基以上的散修就地开山立派', {
    mode: 'click',
    apply: (c) => D.foundSectAt(c.world, c.x, c.y, c.radius, c.rng),
  }),

  // ── 观察 ──────────────────────────────────────────────
  T('inspect', '检视', '🔍', 'view', '查看一格的山水与人烟，不改动世界', {
    mode: 'click', readonly: true,
    apply: () => 0,
  }),
  // 上界视界：**按住拖出一片自由形状**（套索），从那块地方往里看**另一界**（画中画）。
  //
  // 为什么是第三种 mode（'select'）而不是复用现成的两种：
  //   · 复用 'drag' 会在主循环的限速里被反复调用（每 0.075 秒一次），
  //     而「开一扇视界」是**一次成型的动作**——划完才算，反复调用会不断重开；
  //   · 复用 'click' 只有「一个点 + 半径」，选出来的是圆，不是玩家要的自由区域。
  // 所以 'select' 的三段逻辑（按下 → 拖动 → 抬起）写在 main.js 的指针事件里。
  //
  // ⚠️ readonly 必须是 false。它不改地形，但会留下副作用（划选边缘会裂开细缝）。
  //    标成 true 会让光标变成 help、提示语也变成「不改动世界」，
  //    玩家就会以为它只是看——而裂缝是实打实的。提示语里已经写明「会裂开细缝」。
  T('viewUpper', '上界视界', '☯', 'view',
    '拖动重划视界 · 单击窗内事物查看；划出的边缘会裂开细缝，自缝中窥见上界', {
      mode: 'select',
      readonly: false,
      // 本轮 apply 只做一件事：把划选区域交出去（commitSelection）。
      // ⚠️ 划选区域是 **UI 状态，不进世界存档**——存档是给「世界」的，不是给「屏幕」的
      //    （规格 §6.2）。所以它不挂 world，走 ctx 上的一次性接收器。
      // ⚠️ 开缝已接在 `main.js` 的 `commitSelection`（pointerup 唯一提交点），
      //    本文件**不需要**知道 `openRifts`——那是一次成型、只能由 pointerup 调一次
      //    的动作，接在提交点天然满足这个约束，也免得工具表反过来依赖主程序。
      apply: (c) => { c.commitSelection(c.rect); return 0; },
    }),
  // 幽冥视界：与 `viewUpper` **逐字段对齐**，只有 id / name / icon / hint 不同。
  // 用户原话要的是「可以选择看到同坐标上界（或者幽冥界）的情况」——
  // 所以两界是**并列的两个工具**，而不是一个工具加参数：玩家点哪个就是看哪个，
  // 一眼可辨、也不必再造一套「切换目标界」的状态。
  //
  // ⚠️ 上面 `viewUpper` 那段关于 `mode: 'select'` / `readonly: false` 的理由
  //    **逐条同样适用**，不再复述；改动时两处必须一起动（同一条契约）。
  // ⚠️ 两界共用同一个凡间 `world.rifts`，所以划幽冥视界同样会在边缘裂开细缝——
  //    这正是 `sim/rifts.js:5` 引的用户原话「上界视界和**下界**的边缘……会因此
  //    产生轻微的空间裂缝」。
  // ⚠️ id 必须与 `ui/realmView.js` 的 `VIEW_TOOL_PLANE` / `VIEW_TOOL_IDS` 对得上：
  //    那边是裂缝冻结（C1.1）与开缝门控的唯一判据总表，这里改了名而那边没改，
  //    视界会**静默地**不再开缝。
  T('viewNether', '幽冥视界', '⚰', 'view',
    '拖动重划视界 · 单击窗内事物查看；划出的边缘会裂开细缝，自缝中窥见幽冥', {
      mode: 'select',
      readonly: false,
      apply: (c) => { c.commitSelection(c.rect); return 0; },
    }),
]);

export const TOOL_BY_ID = Object.freeze(
  Object.fromEntries(TOOLS.map((tool) => [tool.id, tool])),
);

/** 工具光标颜色，用来提示这个神力「偏暖还是偏冷」 */
export const TOOL_CURSOR = Object.freeze({
  raise: '#8a6a44',
  lower: '#4a463e',
  flatten: '#b08f3e',
  roughen: '#7d776b',
  water: '#3f5f7d',
  drain: '#31505f',
  rain: '#5d7a72',
  forest: '#4d6b52',
  burn: '#a8493c',
  fertile: '#8a8033',
  sand: '#b8912f',
  snow: '#e9e0cd',
  lava: '#c1573b',
  road: '#a97a52',
  lightning: '#b08f3e',
  meteor: '#a8493c',
  quake: '#8a6a44',
  flood: '#3b5a78',
  plague: '#6b4a6b',
  crisis: '#6b6b7a',
  human: '#3c3830',
  cultivator: '#7a5a3a',
  beast: '#6b6152',
  spirit: '#5d7a72',
  erase: '#9c4a5c',
  root: '#7a5a9a',
  leyline: '#4a8a8a',
  secret: '#8a6ab0',
  cave: '#6a5a7a',
  tribulation: '#8a4a7a',
  manual: '#6a6a9a',
  forbidden: '#9c3a4c',
  ascend: '#7a8ab0',
  found: '#8a7a4a',
  inspect: '#31505f',
  // 比同组的检视稍亮、稍青一点：它同属「看」，但会留下东西（裂缝）
  viewUpper: '#4a7a8a',
  // 与 viewUpper 同属「看另一界」，但更冷、更暗——幽冥不是上界那抹青，
  // 是一层压下来的墨。两个视界工具的光标色必须能一眼分开。
  viewNether: '#3f4a5f',
});

export { TERRAIN, OVER, SPECIES };
