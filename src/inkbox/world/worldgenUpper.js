// 水墨沙盒 · 上界（紫霄）程序化山河生成
//
// ───────────────────────────────────────────────────────────────────────
// 为什么另写一份，而不是调 `generateWorld()`（规格 §1.4 的三条理由）
// ───────────────────────────────────────────────────────────────────────
//
// 1. `generateWorld()`（worldgen.js:418-438）里**硬编码**了 `seedLeylines()`
//    与 `scatterInitialLife()`。后者（worldgen.js:441-483）撒的是
//    **凡人 + 灵兽 + 山精**——上界没有凡人，撒了就是错的。
//    这是三条里最关键的一条：它不是一个「风格不同」的问题，是**语义错误**。
// 2. `buildHeightField`（worldgen.js:18-75）的大陆遮罩是「中心隆起、边缘沉海」，
//    配 `WATER_TARGET = 0.42`。照抄会得到一张**看起来和凡间一样的地图**，
//    而用户要的是「上界有自己的地形」——两张图必须一眼能分辨。
// 3. `generateWorld` 会 `world.record('天地初开 · 种子 ...')`（worldgen.js:435）。
//    上界的编年史应该是自己的话术，不能混入凡间的「天地初开」。
//
// ───────────────────────────────────────────────────────────────────────
// 铁律一：随机流（**这一条违反了就是 bug**）
// ───────────────────────────────────────────────────────────────────────
//
// `Life` 的主随机流（`life.js` 的 `this.rng`）是**全世界共用的一条种子流**。
// 每个实体的觅食、求偶、突破、渡劫都在上面抽签——**多抽一次签，整条世界线就漂走**，
// 既有长测的全部标定当场作废（见 `life.js:110-124`、`family.js` 头注释）。
//
// 所以本文件里的每一处随机性都走**独立流**：`mulberry32(seed ^ 常量)` 或
// `createNoise2D(seed ^ 常量)`，与 `worldgen.js:420-423` 的既有做法一致。
// **本文件不 import `Life`，也永远不该 import。**
//
// ───────────────────────────────────────────────────────────────────────
// 上界的种子为什么必须是 `凡间种子 ^ 0x55505052`
// ───────────────────────────────────────────────────────────────────────
//
// 不能与凡间共用同一个 seed。理由不是「怕噪声重复」这种审美问题，而是一条
// **无法从外部覆盖的派生**：
//
//     // sim/life.js:124
//     this.warRng = mulberry32(((world.seed || 0) ^ 0x776172) >>> 0);
//
// `Life` 构造时从 `world.seed` **自动**派生战争随机流。这条派生写死在构造函数里，
// 调用方没有任何参数能改它。于是两界若用同一个 `seed`，**两张图的战争随机流会
// 逐次抽签完全相同**——上界与凡间的大战会以同样的顺序、同样的概率爆发。
// 给上界种子异或一个常量，就把两条流岔开了。
//
// 派生集中在 `planes.js` 的 `deriveUpperSeed()`（`main.js` / `io/save.js` /
// 本文件三处共用同一份，不许各写一遍）。
//
// ───────────────────────────────────────────────────────────────────────
// 方案 B：上界**不跑这七个系统**，但字段照建（规格 §1.1）
// ───────────────────────────────────────────────────────────────────────
//
// `World` 的构造函数不分支（`World.js:16` 没有 `opts`），所以上界实例身上会
// **照建**一批上界根本不跑的系统的字段。这是刻意的选择（方案 B）：空数组的
// 内存代价是几十字节，而「给构造函数加分支」是永久性的复杂度，还要连带
// 让 `deserializeWorld` 也分支。
//
// **上界不跑的七个系统**（括号里是字段名）：
//   1. 卜算子       （`busanzi`）
//   2. 夺舍         （`possessionLog`）
//   3. 逝者名录     （`dead` + `deadLog`）
//   4. 神魂/幽冥    （`souls`）
//   5. 世家         （`clanLog`）—— ⚠️ 只含**账本**：`clans` 与 `nextClanId`
//                      已**移出**这张表。上界开局就有 3 条始祖线（`clans` 非空，
//                      `nextClanId` 从 3 往后走），那是上界自己的真实状态。
//                      详见 `resetUpperSystems` 里第 5 条。
//   6. 大战         （`wars` + `nextWarId` + `warLog`）
//   7. 飞升记录     （`ascended`）
//
// 上表这些字段在上界实例上**必须是空数组 / 零账本**。`resetUpperSystems()` 会
// 显式把它们归零一遍——不是多此一举：World 构造函数将来若给某个字段留了
// 非空初值（比如「默认给一家示例宗门」），上界就会悄悄多出不该有的状态，
// 而那是**不会报错**的。冒烟测试有一条判据断言这些字段恒为空，
// 作用就是把「静默的语义泄漏」变成「响的」。
//
// ⚠️ 开局 12 人落地后，`entities` 与 `clans` **不再**属于「恒空」那一类
// （它们是上界自己的真实状态），冒烟测试里那条「七个不跑的系统全空」会
// 按预期在 `entities` / `clans` 两项上变红——见 `INKBOX.md` 与交接报告。
//
// ───────────────────────────────────────────────────────────────────────
// 铁律二：推导量不进存档
// ───────────────────────────────────────────────────────────────────────
//
// `world.qi` 是**推导量**（凡间由 `terrain.js:82` 的 `qiAt` 算，上界由本文件的
// `qiAtUpper` 算），它依赖 `type` 与 `leylines`，所以不进存档，读档后重算
// （同 `territory.js` 的规矩）。**不要**把它当状态存下来。
//
// ───────────────────────────────────────────────────────────────────────
// 与凡间地形的区别（规格 §1.4 那张表，逐条实现，不是换滤镜）
// ───────────────────────────────────────────────────────────────────────
//
//   高度分布  抬高整条曲线（可居平地更少）；云海占 ~35% 且**更碎**（浮岛感）
//   山脉      `ridged` 权重 0.6（凡间 0.42）、幂次 1.15（凡间 1.7）→ 山脊更密
//   河流      **不刻河**：`riverBase` 恒为 0
//   气温      由「离仙脉距离」驱动（灵脉越近越暖），不是纬度气温
//   灵气      `qiAtUpper` = 地表基数 × 1.8 + 仙脉加成
//   初始生灵  **开局 12 人**（3 条始祖线 × 4 人，06 册 §〇 第 1 条），除此之外不放
//
// ⚠️ 一处实现说明：规格 §1.4 要求气温由「离灵脉距离」驱动，`qiAtUpper` 也要读
// 仙脉（§6.2 的字段清单）。所以**上界在生成期必须布下仙脉**。仙脉既不是人、
// 也不是宗门，也不在「七个不跑的系统」里（`leylines` 是上界自己的真实状态，
// §6.2 明确要进存档）。没有它，气温与灵气都没有驱动源。

import { SEA_LEVEL, SPECIES, SPECIES_INFO, TERRAIN_INFO, WORLD_PRESETS } from '../core/config.js';
import { ELEMENTS } from '../core/cultivation.js';
import { SURNAMES, generateNameParts, pickFrom } from '../core/lore.js';
import { World } from './World.js';
import { classify, qiAt } from './terrain.js';
import {
  createNoise2D, fbm, ridged, domainWarp, clamp, smoothstep, mulberry32,
} from '../core/noise.js';
import { deriveUpperSeed, UPPER_ID_BASE, upperWalkable } from './planes.js';
// 开局人口要用「与凡间同一份」的实体初始化与世家记录形状——
// 自己再拼一遍就是第二份真相（见下面 seedUpperPopulation 的注释）。
import { initEntity } from '../sim/cultivation.js';
import { makeClanRecord } from '../sim/family.js';

// ── 上界专属旋钮 ─────────────────────────────────────────

/**
 * 上界灵气倍率：地表基数 × 这个数。
 *
 * ⚠️ **这是待标定的旋钮，不是标定好的数。** 它对应 `core/lore.js:307` 的
 * `upper.qi = 2.0`（上界位面灵气倍率），但那个 2.0 是叙事表里的数，不是
 * 长测拧出来的。真正的倍率要靠「上界修行速度」的实测去拧（§7 阶段计划）。
 *
 * 另一个要知道的后果：`world.qi` 的契约是 0..1（`World.js:35`），所以这里
 * 会 clamp 到 1——凡是地表基数 > 0.555 的地表（山/峻岭/雪峰/密林/林）都会
 * **饱和到 1**。也就是说这个倍率在「低灵气地表」上是渐变的，在「高灵气地表」
 * 上是平的。要保留整条曲线的梯度，得同时改 `qi` 层的上界契约，
 * 那是另一件事，不该混在这一轮做。
 */
export const UPPER_QI_SCALE = 1.8;

/** 云海（上界的「水」）占比。凡间 WATER_TARGET = 0.42，上界 0.35 */
const CLOUD_TARGET = 0.35;
/** 山脊权重与幂次。凡间是 0.42 / 1.7；权重更高、幂次更低 → 山脊更密集 */
const RIDGE_WEIGHT = 0.6;
const RIDGE_POWER = 1.15;
/** 云海遮罩的噪声频率。越高，陆地越碎（浮岛感） */
const SHELF_FREQ = 4.2;
/**
 * 陆地抬升：陆地的**起点**抬高这么多（占陆地跨度 landSpan 的比例）。
 *
 * 为什么：凡间的分位数重排用 `pow(t, 2.15)`，把大片陆地压在贴近海面的高度上
 * ——于是「低处缓」，到处都是可居的平原水乡。上界要「可居平地更少」，
 * 所以给陆地曲线加一个起点抬升：贴水面的低地几乎没有，海岸线外直接是一道崖。
 */
const LAND_LIFT = 0.16;
/** 陆地曲线的幂次。凡间 2.15；上界略高，山峰更陡 */
const LAND_POWER = 2.45;
/** 气温的「暖意」半径与幅度：离仙脉多远之内还算暖 */
const WARMTH_REACH = 34;
const WARMTH_GAIN = 0.55;
/** 高处的降温系数。没有它就没有「仙山雪顶」——仙脉都落在山上，光靠暖意会全是热的 */
const ALTITUDE_COOLING = 0.95;
/** 上界的「本底气温」：远离仙脉的地方有多冷 */
const TEMP_BASE = 0.34;
/** 湿度：云海（水）越近越润 */
const MOIST_REACH = 14;

// 上界的噪声/随机流子键。与凡间的子键刻意取不同的值，方便读代码时一眼分清
// 「这是上界的流」。注意：即使取值相同，两界的 seed 也不同（见头注释），
// 所以流不会重合；取不同值只是为了可读性。
const K_ROOT = 0x9e3779b9;
const K_WARP = 0x51ed2701;
const K_SHELF = 0x2545f491;
const K_CLIMATE = 0x1b873593;
const K_LEYLINE = 0x7f4a7c15;
/**
 * 开局人口（三条始祖线）的随机流子键。
 *
 * ⚠️ 与 `sim/upperLife.js:34` 的 `UPPER_LIFE_SEED_KEY = 0x55504c49` **刻意不同**。
 * 两边若共用一条流，「开局撒人」多抽一次签就会把「化生 / 立派」的抽签顺序
 * 整体挪走——而那是**跨模块的隐式耦合**，谁也不会报错，只会让上界几百年的
 * 人口曲线悄悄变成另一条。派生形状与 upperLife 一致：
 * `mulberry32(((upper.seed || 0) ^ 键) >>> 0)`。
 */
const K_SEED_POP = 0x55505350;

/** 开局始祖线的条数。06 册 §〇 第 1 条：**3 条始祖线** */
const UPPER_SEED_LINES = 3;
/** 每条始祖线的人数。06 册 §〇 第 1 条：每条 **4 人**，共 **12 人** */
const UPPER_SEED_PER_LINE = 4;

/**
 * 「地表基数」表：`QI_BASE[type]`（凡间在 `terrain.js:52`，**没有导出**）。
 *
 * 为什么不直接抄一份数组过来：抄一份就是两个会各自漂移的副本——
 * 将来 `terrain.js` 调了某个地表的灵气基数，上界这边不会有任何报错，
 * 只会「上界的灵气悄悄跟凡间不一致」，而这种错要靠猜。
 *
 * 所以这里**从唯一的真相源反推**：造一个 1×1 的探针 world，把它的 `type`
 * 依次设成每一种地表，再问一次 `qiAt`。探针没有仙脉、`riverBase` 全 0，
 * 于是 `qiAt` 恰好返回 `QI_BASE[type]`（`terrain.js:83-95` 的三个分支全部跳过，
 * 而 QI_BASE 的最大值 0.92 < 1，不会被 clamp 掉）。
 *
 * 代价是模块加载时 23 次函数调用，可忽略；换来的是**永远不会漂移**。
 */
const UPPER_QI_BASE = (() => {
  const probe = new World(1, 1, 1);
  const table = [];
  for (let t = 0; t < TERRAIN_INFO.length; t += 1) {
    probe.type[0] = t;
    table.push(qiAt(probe, 0, 0, 0));
  }
  return Object.freeze(table);
})();

/** 半径内的仙脉加成之和。与 `terrain.js:85-95` 的算法同形（那是凡间灵脉） */
function leylineBonusAt(world, x, y) {
  const leylines = world.leylines;
  if (!leylines || !leylines.length) return 0;
  let bonus = 0;
  for (let k = 0; k < leylines.length; k += 1) {
    const l = leylines[k];
    const dx = l.x - x;
    const dy = l.y - y;
    const d2 = dx * dx + dy * dy;
    const r = l.radius;
    if (d2 < r * r) bonus += l.strength * (1 - Math.sqrt(d2) / r);
  }
  return bonus;
}

/**
 * 上界的灵气：地表基数 × `UPPER_QI_SCALE`，再叠加仙脉加成。
 *
 * ⚠️ 这是**推导量**（同凡间的 `qiAt`），不进存档；读档后由调用方重算。
 * 之所以要单独一个函数而不是复用 `qiAt`：倍率不同，而且上界不刻河
 * （`riverBase` 恒 0），凡间那句「河道额外加成」在上界永远是空转。
 */
export function qiAtUpper(world, x, y, i) {
  let qi = (UPPER_QI_BASE[world.type[i]] ?? 0.3) * UPPER_QI_SCALE;
  qi += leylineBonusAt(world, x, y);
  return qi > 1 ? 1 : qi;
}

/**
 * 上界的高程场。
 *
 * 与凡间（`worldgen.js:18-75`）的三处结构差别：
 *   1. **没有「中心隆起」的大陆遮罩**。凡间是一块大陆浮在海里；上界要的是
 *      **群岛**——用一层中频噪声当「云海遮罩」，让陆地成片但彼此断开，
 *      云海从低处漫上来，于是图上是许多浮岛而不是一块整陆。
 *   2. 山脊权重更高、幂次更低 → 山脊更密集（凡间 0.42 / 1.7）。
 *   3. 分位数重排时给陆地加起点抬升 → 可居平地更少。
 */
function buildUpperHeightField(world, noise, warpNoise, shelfNoise) {
  const { w, h, height } = world;
  for (let y = 0; y < h; y += 1) {
    const ny = y / h;
    for (let x = 0; x < w; x += 1) {
      const nx = x / w;
      const [wx, wy] = domainWarp(warpNoise, nx * 3.1, ny * 3.1, 0.72, 1.15);
      const base = fbm(noise, wx * 3.0, wy * 3.0, 6, 2.05, 0.54);

      // 云海遮罩：凡间是「中心隆起、边缘沉海」，上界反过来——
      // 用一层中频噪声决定「哪里是岛」，于是云海是**碎的**，
      // 从岛与岛之间漫上来，而不是围成一圈把大陆包住。
      const shelf = fbm(shelfNoise, nx * SHELF_FREQ + 13.1, ny * SHELF_FREQ + 29.3, 4, 2.2, 0.55);
      const mask = smoothstep(0.34, 0.62, shelf);

      let value = (base - 0.5) * 0.95 + mask * 0.66 + 0.05;

      // 褶皱山脉：只在岛上叠加。权重比凡间高、幂次比凡间低，
      // 所以山脊更长更密——上界是「多山少平原」，不是「一块高原」。
      const ridge = ridged(noise, nx * 6.4 + 11.3, ny * 6.4 + 7.7, 5, 2.15, 0.52);
      value += Math.pow(ridge, RIDGE_POWER) * smoothstep(0.12, 0.62, mask) * RIDGE_WEIGHT;

      // 仙台（高原台地）：比凡间更少，只留几处高处的平地
      const plateau = fbm(noise, nx * 2.3 + 41.5, ny * 2.3 + 23.9, 3, 2.0, 0.5);
      value += smoothstep(0.72, 0.97, plateau) * 0.08 * mask;

      height[y * w + x] = value;
    }
  }

  // 分位数重排（同凡间的做法，但曲线不同）。
  // 重排的意义：噪声直接线性拉伸会摊成一大片高原——山不像山，像一块被雪盖住的板。
  const sample = [];
  for (let i = 0; i < world.size; i += 3) sample.push(height[i]);
  sample.sort((a, b) => a - b);
  const last = sample.length - 1;

  const quantileOf = (value) => {
    let lo = 0;
    let hi = last;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sample[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return last > 0 ? lo / last : 0;
  };

  const landSpan = 1 - SEA_LEVEL;
  for (let i = 0; i < world.size; i += 1) {
    const q = quantileOf(height[i]);
    if (q < CLOUD_TARGET) {
      // 云海：浅处（q 接近 CLOUD_TARGET）几乎无水，深处沉下去
      height[i] = SEA_LEVEL * Math.pow(q / CLOUD_TARGET, 0.62);
    } else {
      // 陆地：起点抬高 LAND_LIFT，于是贴水面的低地几乎没有——
      // 「可居平地更少」不是把山画高，是把**低地砍掉**。
      const t = (q - CLOUD_TARGET) / (1 - CLOUD_TARGET);
      height[i] = SEA_LEVEL + landSpan * (LAND_LIFT + (1 - LAND_LIFT) * Math.pow(t, LAND_POWER));
    }
  }
}

/** 云海灌水：水面之下的格子按「水面 - 地面」记水深（同凡间 fillSea） */
function fillCloudSea(world) {
  const { height, water } = world;
  for (let i = 0; i < world.size; i += 1) {
    if (height[i] < SEA_LEVEL) water[i] = SEA_LEVEL - height[i];
  }
}

/** 多源 BFS：每个格子到最近水域的格距（与凡间 worldgen.js:141-170 同形） */
function distanceToWater(world) {
  const { w, h, water } = world;
  const dist = new Int32Array(world.size).fill(-1);
  const queue = new Int32Array(world.size + 1);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < world.size; i += 1) {
    if (world.height[i] < SEA_LEVEL || water[i] > 0.0015) {
      dist[i] = 0;
      queue[tail += 1] = i;
    }
  }
  while (head < tail) {
    head += 1;
    const i = queue[head];
    const x = i % w;
    const y = (i - x) / w;
    const nd = dist[i] + 1;
    for (let d = 0; d < 4; d += 1) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (dist[ni] !== -1) continue;
      dist[ni] = nd;
      queue[tail += 1] = ni;
    }
  }
  return dist;
}

/**
 * 多源 BFS：每个格子到最近**仙脉**的格距。
 *
 * 这是上界气候的驱动量——气温由「离仙脉多远」决定（§1.4）。
 * 没有仙脉时全部返回 -1，调用方按「极远」处理。
 */
function distanceToLeylines(world) {
  const { w, h } = world;
  const dist = new Int32Array(world.size).fill(-1);
  const queue = new Int32Array(world.size + 1);
  let head = 0;
  let tail = 0;
  const leylines = world.leylines;
  for (let k = 0; k < leylines.length; k += 1) {
    const l = leylines[k];
    const x = Math.round(l.x);
    const y = Math.round(l.y);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (dist[i] !== -1) continue;
    dist[i] = 0;
    queue[tail += 1] = i;
  }
  while (head < tail) {
    head += 1;
    const i = queue[head];
    const x = i % w;
    const y = (i - x) / w;
    const nd = dist[i] + 1;
    for (let d = 0; d < 4; d += 1) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (dist[ni] !== -1) continue;
      dist[ni] = nd;
      queue[tail += 1] = ni;
    }
  }
  return dist;
}

/**
 * 上界气候。
 *
 * · **气温由「离仙脉距离」驱动**（规格 §1.4）：上界没有「纬度」这回事——
 *   画幅的南北不是赤道两极，暖意来自灵脉。离仙脉越近越暖，越远越寒。
 *   高处照旧降温（`ALTITUDE_COOLING`）——否则仙脉都落在山上，
 *   山巅反而全成了暖的，「仙山雪顶」就没了。
 * · 湿度仍由**云海距离**驱动（沿用凡间的做法）。`classify()` 要读 `moist`
 *   才能分出林/甸/荒漠（`terrain.js:137-142`），而上界不跑 `stepVegetation`，
 *   所以它只是一个生成期量——上界的生态由灵气驱动，不由植被驱动（§1.5）。
 */
function buildUpperClimate(world, noise, distLeyline, distWater) {
  const { w, h, temp, moist, height } = world;
  for (let y = 0; y < h; y += 1) {
    const ny = y / h;
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const nx = x / w;

      // 气温：灵脉暖意 − 高度降温 + 一点抖动
      const d = distLeyline[i] < 0 ? 9999 : distLeyline[i];
      const warmth = Math.exp(-d / WARMTH_REACH) * WARMTH_GAIN;
      const altitude = Math.max(0, height[i] - SEA_LEVEL) * ALTITUDE_COOLING;
      const jitter = fbm(noise, nx * 4.5 + 61.2, ny * 4.5 + 17.4, 3, 2, 0.5) - 0.5;
      temp[i] = clamp(TEMP_BASE + warmth - altitude + jitter * 0.12, 0, 1);

      // 湿度：离云海越近越润
      const dw = distWater[i] < 0 ? 60 : distWater[i];
      const nearWater = Math.exp(-dw / MOIST_REACH) * 0.72;
      const band = fbm(noise, nx * 4.8 + 91.7, ny * 4.8 + 55.1, 4, 2, 0.5) * 0.42;
      const dry = smoothstep(0.7, 1.0, temp[i]) * 0.34;
      moist[i] = clamp(nearWater + band - dry + 0.08, 0, 1);
    }
  }
}

/**
 * 上界的「灵植」。
 *
 * 与凡间 `seedVegetation`（worldgen.js:196-213）同形，但**只是生成期量**：
 * 上界不跑 `stepVegetation`（§1.5），所以 `veg` 在生成之后就不再变。
 * 它仍然要写——渲染的植被深浅读它（`terrainLayer.js:250`），
 * `World.fertility()` 也读它（`World.js:221`）。
 */
function seedUpperVegetation(world, noise) {
  const { w, h, veg, moist, height, temp } = world;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (height[i] < SEA_LEVEL + 0.005) {
        veg[i] = 0;
        continue;
      }
      const altPenalty = smoothstep(0.62, 0.92, height[i]);
      const coldPenalty = smoothstep(0.42, 0.12, temp[i]);
      const dryPenalty = smoothstep(0.3, 0.06, moist[i]);
      const base = clamp((moist[i] - 0.16) * 1.35, 0, 1);
      const patch = fbm(noise, x / w * 13.5, y / h * 13.5, 3, 2, 0.5) * 0.35 + 0.82;
      veg[i] = clamp(base * patch * (1 - altPenalty) * (1 - coldPenalty * 0.85) * (1 - dryPenalty * 0.9), 0, 1);
    }
  }
}

/**
 * 布下**仙脉**（上界的灵脉）。
 *
 * 为什么生成期就要布：气温由「离仙脉距离」驱动（§1.4），灵气也读它（§6.2），
 * 所以仙脉必须先于气候与 `recomputeUpperQi` 落好。
 *
 * 与凡间 `seedLeylines`（worldgen.js:330-412）的区别：
 *   · 落点规则不同——凡间那条实际是「纯按高度」（它读到 `world.type` 时还是全 0，
 *     详见那段血泪注释）；上界这里**明确**按「高处的山脊」落点，不装样子。
 *   · **没有「山脚必须够得着大块陆地」那条判据**。那条是为凡间的宗门服务的
 *     （否则灵脉永远无主）。上界本轮不跑宗门、不放人，没有任何东西会去认领仙脉，
 *     加一条没有读者的判据只会误导后来的人。等阶段二接上界宗门时再补。
 *   · **不写编年史**（本轮要求：上界不写任何编年史条目）。
 *
 * 随机流：`mulberry32(seed ^ K_LEYLINE)`，独立流，绝不碰 `Life.rng`。
 */
function seedUpperLeylines(world, noise) {
  const random = mulberry32((world.seed ^ K_LEYLINE) >>> 0);
  const candidates = [];
  for (let y = 3; y < world.h - 3; y += 1) {
    for (let x = 3; x < world.w - 3; x += 1) {
      const i = y * world.w + x;
      if (world.water[i] > 0.0015) continue;
      // 仙脉只落在山上，不落在低地——上界的地气是「山」给的
      if (world.height[i] < SEA_LEVEL + 0.12) continue;
      let score = world.height[i];
      score += noise(x * 0.03, y * 0.03) * 0.2;
      if (score > 0.62) candidates.push({ x, y, score });
    }
  }
  if (!candidates.length) return;

  const target = Math.max(3, Math.min(9, Math.round(world.size / 9000)));
  const placed = [];
  const minGap = Math.max(10, Math.round(Math.sqrt(world.size) * 0.13));
  let attempts = 0;
  while (placed.length < target && attempts < 1200) {
    attempts += 1;
    const pick = candidates[Math.floor(random() * candidates.length)];
    let tooClose = false;
    for (let k = 0; k < placed.length; k += 1) {
      if (Math.hypot(placed[k].x - pick.x, placed[k].y - pick.y) < minGap) { tooClose = true; break; }
    }
    if (tooClose) continue;
    const radius = 6 + Math.floor(random() * 5);
    placed.push(pick);
    world.addLeyline({
      x: pick.x,
      y: pick.y,
      radius,
      strength: 0.28 + pick.score * 0.35 + random() * 0.1,
      element: ELEMENTS[Math.floor(random() * ELEMENTS.length)],
    });
  }
}

/**
 * 从 `anchor` 出发**环状外扩**找一处「可通行且还没被占用」的格。
 *
 * 判据一律走 `upperWalkable`（`planes.js:149`）——**绝不另写一套水域阈值**：
 * 阈值一分叉，人就会落进云海里站不住，而且**不报错**（那条注释写得很清楚）。
 *
 * 全程**不抽随机流**：落点只由 `anchor` 与 `occupied` 决定，所以同一个
 * `(preset, seed)` 逐格可复现（探针里那条「重建确定性」判据靠的就是它）。
 * 找不到就返回 null——调用方按「少放一个人」处理，不硬塞。
 */
function findFreeTileNear(world, anchor, occupied) {
  const { w, h } = world;
  for (let r = 0; r < Math.max(w, h); r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        // 只走这一圈的边（同 `planes.js:170` 的螺旋写法）
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = anchor.x + dx;
        const y = anchor.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (occupied.has(i)) continue;
        if (!upperWalkable(world, i)) continue;
        return { x, y, i };
      }
    }
  }
  return null;
}

/**
 * 造一名开局修士（一个**上界土生土长**的始祖线成员）。
 *
 * 字段与 `sim/upperLife.js` 的 `maybeBorn()` 同构（那是上界另一条人口来源），
 * 差异只有「没有双亲 / 没有个人日志」——开局状态不是事件（见本函数末尾注释）。
 *
 * @param {World} world
 * @param {() => number} random 本模块自己的开局人口流（**不是** `Life.rng`）
 * @param {{x:number,y:number}} spot 落点格（已判定过 `upperWalkable`）
 * @param {string} surname 该始祖线的姓（从 `SURNAMES` 词池取，不新造中文词）
 */
function makeSeedEntity(world, random, spot, surname) {
  const info = SPECIES_INFO[SPECIES.CULTIVATOR] || SPECIES_INFO.human;
  // 取名走 `lore.js` 的现成词池与现成函数。**抽三次签的次序与
  // `generateNameParts` 逐位相同**，只是把抽出来的姓丢掉、换成始祖线的姓——
  // 这正是 `sim/family.js:27-29` 记下的做法（「抽签次数不变，结果变了」）。
  // 不新造任何中文词：全部来自 `SURNAMES` / `NAME_A` / `NAME_B`。
  const parts = generateNameParts(random);
  const entity = world.addEntity({
    sp: SPECIES.CULTIVATOR,
    x: spot.x + 0.5,
    y: spot.y + 0.5,
    vx: 0,
    vy: 0,
    hp: info.hp,
    maxHp: info.hp,
    age: 0,
    lifespan: info.lifespan,
    faction: 0,
    // 上界没有村子（规格 §2.4：上界没有凡人，也没有聚落）。
    // 这一栏给 0 而不是缺省：`pickUpperParents` 之类按 `village` 过滤的代码
    // 读到 `undefined` 会静默空转（`family.js` 头注释里的第二处凡间假设）。
    village: 0,
    state: 'wander',
    timer: 0,
    tx: spot.x + 0.5,
    ty: spot.y + 0.5,
    anim: random() * 6.28,
    face: 1,
    name: surname + parts.given,
    kills: 0,
    carried: 0,
    relations: new Map(),
  });
  if (!entity) return null;
  // `initEntity` 补齐全部修炼字段（level 先归 0），`cultivator: true` 再走一次
  // `awaken` → **level = 1（炼气）**，并设 `lifespan = lifespanForEntity(entity, 1)`。
  //
  // ⚠️ 寿元必须由这条路设上。只写 `age: 0` 而不设 `lifespan` 的话，
  //    第一个 tick 的 `age >= lifespan` 判据（`upperLife.step`）会把开局
  //    12 人**当场判死**，而那是「不报错、只是全没了」的那种错。
  // ⚠️ `surname` / `clan` / `gen` 必须写在 `initEntity` **之后**——
  //    它会把这三栏重置成 null / 0 / 0。
  initEntity(entity, random, { cultivator: true });
  entity.surname = surname;
  return entity;
}

/**
 * 上界**开局十二人**：3 条始祖线 × 4 人（06 册 §〇 第 1 条，规格 §2.3.1）。
 *
 * 为什么不是 0 人：0 人开局时「上界繁衍」这条腿要等到第一批飞升者落地才启动，
 * 而那时他们已是陌生人、没有族谱；在那之前玩家划开视界看到的是一张空图
 * （规格 §2.3.1 的三条理由）。
 *
 * 落点：**读 `upper.qi`**，在灵气最高的一批**可通行**格附近落座（§2.3.1
 * 「在灵气最高的几处各放 4 人」）。灵气最高的一批里会有大量并列（`qi` 契约
 * 是 0..1，高灵气地表会 clamp 饱和，见文件头 `UPPER_QI_SCALE` 那段），
 * 所以并列时按「离最近仙脉更近者优先」再排一次——否则三处会全挤在
 * 行优先扫描遇到的头几格里。
 *
 * 随机流：`mulberry32(upper.seed ^ K_SEED_POP)`，**独立流**，绝不碰 `Life.rng`。
 *
 * ⚠️ 记账纪律（这一条比代码本身重要）：
 *   · `popLog.seeded` 记开局人数，`arrived` / `born` **保持 0**（理由见
 *     `resetUpperSystems` 里 popLog 那段）；
 *   · `clanLog.founded` **不**自增——开局 3 条始祖线是**开局状态**，
 *     不是「立族事件」；记进去会让长测的立族判据假绿；
 *   · **不写 `chronicle`，也不写 `entity.log`**：上界的编年史窗口在阶段二
 *     只该记**事件**（陨落 / 立派），开局状态不是事件。「chronicle 恒空」
 *     还是冒烟测试的验收口径之一——保留它才有信号价值（一非空就说明
 *     阶段二真的写了事件）。
 *
 * @param {World} world 已完成地形 / 仙脉 / 气候 / 灵气生成的上界实例
 * @param {Int32Array} distLeyline 每格到最近仙脉的格距（`distanceToLeylines` 的产物）
 */
function seedUpperPopulation(world, distLeyline) {
  const random = mulberry32(((world.seed || 0) ^ K_SEED_POP) >>> 0);
  const { w, qi } = world;

  // 候选落点：全部**可通行**格。判据单源，见 `findFreeTileNear` 的注释。
  const candidates = [];
  for (let i = 0; i < world.size; i += 1) {
    if (upperWalkable(world, i)) candidates.push(i);
  }
  if (!candidates.length) {
    // 一张连一格可通行地都没有的上界地图，是生成器自己的 bug；
    // 不在这里抛，留给别处的判据去红——这里只是**一个都不放**。
    return;
  }
  // 排序键完全确定：灵气降序 → 离仙脉近者优先 → 格号升序。
  // 三级键缺一不可：`qi` 会饱和并列，`distLeyline` 也会并列，最后必须落到
  // 格号上，否则排序结果依赖 `Array.prototype.sort` 的实现细节。
  candidates.sort((a, b) => (qi[b] - qi[a])
    || ((distLeyline[a] < 0 ? 1e9 : distLeyline[a]) - (distLeyline[b] < 0 ? 1e9 : distLeyline[b]))
    || (a - b));

  // 三处落点互相隔开（同 `seedUpperLeylines` 的 `minGap` 取法）：
  // 不隔开的话，灵气最高的那一片会被一条线独吞，另外两条线只能捡剩的。
  const minGap = Math.max(8, Math.round(Math.sqrt(world.size) * 0.13));
  const anchors = [];
  for (let k = 0; k < candidates.length && anchors.length < UPPER_SEED_LINES; k += 1) {
    const i = candidates[k];
    const x = i % w;
    const y = (i - x) / w;
    let tooClose = false;
    for (let a = 0; a < anchors.length; a += 1) {
      if (Math.hypot(anchors[a].x - x, anchors[a].y - y) < minGap) { tooClose = true; break; }
    }
    if (tooClose) continue;
    anchors.push({ x, y });
  }

  const occupied = new Set();
  const usedSurnames = new Set();
  let seeded = 0;

  for (let line = 0; line < anchors.length; line += 1) {
    // 三条始祖线取三个**互不相同**的姓（词池 30 个姓，撞了就重抽）。
    // 重抽次数随 `random` 走，仍然是确定性的——同一 seed 逐位可复现。
    let surname = null;
    for (let t = 0; t < 64 && surname === null; t += 1) {
      const pick = pickFrom(random, SURNAMES);
      if (!usedSurnames.has(pick)) surname = pick;
    }
    // 词池 30 个姓，抽 64 次还全撞上是不可能的；真发生了也**不许留空**
    // （姓氏为空会让 `makeClanRecord` 回退到取名字首字，静默造出一个怪姓）。
    if (surname === null) surname = SURNAMES[line % SURNAMES.length];
    usedSurnames.add(surname);

    // 这一条线的 4 个座位：始祖落在离锚点最近的可通行格，其余三人就近依次落座。
    const spots = [];
    while (spots.length < UPPER_SEED_PER_LINE) {
      const spot = findFreeTileNear(world, anchors[line], occupied);
      if (!spot) break; // 这一片放不下了，少放几个（`seeded` 会如实反映）
      occupied.add(spot.i);
      spots.push(spot);
    }
    if (!spots.length) continue;

    // 始祖 + 家族记录。`makeClanRecord` 与凡间立族**共用同一个形状定义**
    // （`sim/family.js` 导出）——上界这边绝不再拼一遍对象字面量。
    const founder = makeSeedEntity(world, random, spots[0], surname);
    if (!founder) continue;
    const clan = makeClanRecord(world, founder, { generation: 1 });
    world.clans.push(clan);
    founder.clan = clan.id;
    founder.gen = 1;
    seeded += 1;

    for (let k = 1; k < spots.length; k += 1) {
      const member = makeSeedEntity(world, random, spots[k], surname);
      if (!member) continue;
      member.clan = clan.id;
      member.gen = 1;
      seeded += 1;
    }
  }

  world.popLog.seeded = seeded;
}

/**
 * 把「上界不跑的凡间系统」显式归零。
 *
 * World 构造函数本来就把它们建成空数组 / 零账本，这里再写一遍不是冗余：
 * 它把「上界不跑这些系统」这条**语义**钉在代码里，而不是靠「构造函数碰巧
 * 没给初值」这个偶然事实。将来若有人给 `World` 加了一个非空的默认值
 * （比如默认一家示例宗门），凡间会安静地多出这个状态，而上界会在
 * 生成的那一刻被这里抹掉——那正是我们要的：**上界永远是干净的基线**。
 *
 * ⚠️ **一处刻意的例外：`clans` 不再归零**（第 5 条）。它现在是上界自己的
 * 真实状态（开局 3 条始祖线），理由写在第 5 条旁边。同理 `entities` 也不在
 * 本函数的清零范围内——但那是阶段二早就定了的事（飞升者要进来）。
 */
function resetUpperSystems(world) {
  // 1. 卜算子
  world.busanzi.met = false;
  world.busanzi.acts = 0;
  world.busanzi.milestones.length = 0;
  world.busanzi.peakPop = 0;
  world.busanzi.tier = 0;
  // 2. 夺舍
  world.possessionLog.succeeded = 0;
  world.possessionLog.failed = 0;
  world.possessionLog.suspected = 0;
  // 3. 逝者名录
  world.dead.length = 0;
  world.deadLog.total = 0;
  world.deadLog.ascended = 0;
  world.deadLog.evicted = 0;
  // 4. 神魂 / 幽冥
  world.souls.length = 0;
  // 魂路累计账本。上界不跑 `enterNether`，这五键**本来就是 0**，这里显式归零
  // 是**实践中的空操作**——但它把「上界永远是干净的基线」这条语义钉在代码里，
  // 免得将来谁给上界接上魂路时，账本带着凡间的旧值开局。
  world.soulLog.natural = 0;
  world.soulLog.linger = 0;
  world.soulLog.ghost = 0;
  world.soulLog.wraith = 0;
  world.soulLog.gone = 0;
  // 5. 世家 —— ⚠️ **`clans` 已从清零名单里移出**（`clans.length = 0` 那行删掉了）。
  //    理由：它**不再是「上界不跑的系统」**——上界开局就有 3 条始祖线
  //    （`seedUpperPopulation` 会往 `world.clans` 里放 3 条记录，规格 §2.3.3）。
  //    再在这里清零，等于把开局人口的血脉线抹掉：`entity.clan` 会指向不存在的
  //    id，而**不报错**，只是「始祖线」这条设定静悄悄地消失。
  //    下面三项照旧归零，因为它们仍然是**凡间世家系统**的账：
  //    `clanLog.founded` 是「立族事件」计数，开局那 3 条是**开局状态**、
  //    不是立族事件（记进去会让长测的「上界有本土立族」判据假绿）；
  //    `clanLog.ended` / `lastClanFoundDay` 上界阶段二还没跑 `stepFamily`，
  //    保持归零。
  world.clanLog.founded = 0;
  world.clanLog.ended = 0;
  world.lastClanFoundDay = -1e9;
  // 6. 世界大事账本。与上面 `soulLog` 同一个道理：`new World()` 的
  //    `milestones` 本来就是空数组，这里显式清空是**实践中的空操作**，
  //    但它把「上界的大事账本从零开始」钉在代码里，免得将来谁给上界接上
  //    里程碑事件时，账本带着凡间（或读档）的旧值开局。
  world.milestones.length = 0;
  // 6. 大战
  world.wars.length = 0;
  world.warLog.declared = 0;
  world.warLog.resolved = 0;
  world.warLog.destroyed = 0;
  world.warLog.casualties = 0;
  // 7. 飞升记录
  world.ascended.length = 0;
  // 8. 阶段二：上界人口动力学的两本账（`popLog` 累计、`arrivedLog` 名册）。
  //    两键已登记在 `io/save.js` 的 `UPPER_ONLY_KEYS`（存在才写），这里建出来
  //    之后，存读档与键集核算断言会自动接管，save.js 不需要再改。
  //    凡间**不**建这两本账：它们是上界专属状态，挂进 World 构造器
  //    只会多出两本凡间永远不写的死账。
  //
  //    ⚠️ 七个键的语义**互不重叠**，别把开局人口混进前三个：
  //      · `arrived`  —— 从凡间**到达上界**的（`planes.arriveUpper` 记账）；
  //      · `born`     —— 上界**本土化生**出来的（`upperLife.maybeBorn` 记账）；
  //      · `bornMortal` —— **凡人繁衍**出来的（`upperLife.maybeBornMortals` 记账）；
  //      · `died`     —— 陨落的（`upperLife.bury` 记账）；
  //      · `seeded`   —— **开局**就有的（`seedUpperPopulation` 落 12 人）；
  //      · `sucked`   —— `arrived` 的**子集**：被裂缝吸上来的（`rifts.leakToUpper`）；
  //      · `arrivedThunder` —— `arrived` 的**子集**：经天雷飞升上来的
  //                     （`cultivation.stepThunderAscend` → `ascend({via:'thunder'})`）。
  //    ⚠️⚠️ 这一份字面量必须与 `planes.ensureUpperPopLog` 的**同源**：
  //    `scripts/_upperlife2probe.mjs` 的 B 节会逐键比对两者的形状，缺一个键就红。
  //    为什么开局那 12 人**必须**另立一栏、绝不能记进 `arrived` 或 `born`：
  //    长测的两条验收判据正是 `popLog.arrived > 0`（飞升通道通了）与
  //    `popLog.born > 0`（上界真在繁衍）。把开局 12 人记进去，这两条会在
  //    「飞升通道其实断了」「化生其实从没触发」的世界里**照样变绿**——
  //    判据被开局状态污染，从此失去信号价值。零是诚实的：那一刻确实
  //    没有任何人飞升上来、也没有任何人被生出来。
  world.popLog = {
    arrived: 0, born: 0, bornMortal: 0, died: 0, seeded: 0, sucked: 0, arrivedThunder: 0,
  };
  world.arrivedLog = [];
  // 实体 id 从上界段起编（UPPER_ID_BASE）：每个 World 的 nextEntityId 都从 1 起，
  // 两界会撞号（铁律三）。nextEntityId 本身进存档，读档原样恢复，偏移只需设一次。
  world.nextEntityId = UPPER_ID_BASE;
}

/**
 * 全量重算上界的**地表类型**层。
 *
 * 私有：只在生成期用一次。外部没有读者——`type` 是随存档逐格存下来的
 * （`io/save.js` 的 `serializeUpperWorld` 保 `type`），读档后不需要重算它。
 * 不导出是为了让「外部只能重算 qi」这条边界是**语法层面**的，
 * 而不是靠注释约束。
 */
function classifyUpper(world) {
  for (let y = 0; y < world.h; y += 1) {
    for (let x = 0; x < world.w; x += 1) {
      const i = y * world.w + x;
      world.type[i] = classify(world, x, y, i);
    }
  }
}

/**
 * 全量重算上界的**灵气**层。
 *
 * 为什么必须有这个函数、而且名字是 `Qi` 不是 `All`：
 * 调用方（`main.js` 的 `attachUpper`）拿到一个上界 world 之后，唯一需要补算的
 * 就是灵气——`qi` 是推导量（`World.js:35` 的契约），它依赖 `type` 与 `leylines`，
 * 而 `leylines` 在「读档灌入」与「生成」两条路径上的就绪时机不同。
 *
 * ⚠️ **不要用 `terrain.js:220` 的 `recomputeQi`**：那个走凡间那套 `qiAt`
 * （地表基数 + 河道 + 凡间灵脉加成），会把上界的灵气层按凡间公式整个覆盖掉，
 * 而且**不报错**——只是上界地图上一点地气色都不对。上界要的是 `qiAtUpper`
 * （地表基数 × 1.8 + 仙脉）。
 */
export function recomputeUpperQi(world) {
  const { w, h, qi } = world;
  for (let y = 0, i = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1, i += 1) {
      qi[i] = qiAtUpper(world, x, y, i);
    }
  }
  world.touch();
}

/**
 * 生成一个上界世界。
 *
 * @param {{preset?:{w:number,h:number}, seed?:number}} options
 *   · `preset` —— 尺寸预设。**必须与凡间同一张 preset**（三界同尺寸）。
 *   · `seed`   —— **凡间的种子**，不是上界的。函数内部走 `deriveUpperSeed()`
 *                得到真正的上界种子（`凡间种子 ^ 0x55505052`，理由见头注释）。
 *                所以 `world.seed !== seed`，这是**对的**，不是 bug。
 * @returns {World} 上界 world 实例。地形已生成、仙脉已布、灵气已算，
 *                  **开局 12 人（3 条始祖线 × 4 人）与这 3 条始祖线的世家记录已落**，
 *                  没有其他生灵、没有宗门、没有编年史。
 *                  `flow` 与 `owner` 恒为 0（上界不刻河、不用 owner 层）。
 */
export function generateUpperWorld({ preset = WORLD_PRESETS.medium, seed = 1 } = {}) {
  const upperSeed = deriveUpperSeed(seed);
  const world = new World(preset.w, preset.h, upperSeed);

  // 方案 B：字段照建，但显式归零（见 resetUpperSystems 的注释）
  resetUpperSystems(world);
  // 上界实例不该自称凡间——`World.js:149` 的默认值是 'mortal'。
  // 这一行不写的话，存档里上界那块会带着 `plane: 'mortal'`，
  // 将来任何按 `world.plane` 分流的代码都会把它当凡间处理，而且不会报错。
  world.plane = 'upper';

  const rootNoise = createNoise2D(upperSeed ^ K_ROOT);
  const warpNoise = createNoise2D(upperSeed ^ K_WARP);
  const shelfNoise = createNoise2D(upperSeed ^ K_SHELF);
  const climateNoise = createNoise2D(upperSeed ^ K_CLIMATE);

  buildUpperHeightField(world, rootNoise, warpNoise, shelfNoise);
  fillCloudSea(world);
  const distWater = distanceToWater(world);
  // 仙脉必须先于气候落好：气温由「离仙脉距离」驱动（§1.4）
  seedUpperLeylines(world, rootNoise);
  const distLeyline = distanceToLeylines(world);
  buildUpperClimate(world, climateNoise, distLeyline, distWater);
  seedUpperVegetation(world, rootNoise);
  // 顺序不能反：`qiAtUpper` 读 `world.type`，所以先分类再算灵气。
  classifyUpper(world);
  recomputeUpperQi(world);

  // 开局十二人（3 条始祖线 × 4 人，06 册 §〇 第 1 条）。
  // 必须排在 `recomputeUpperQi` **之后**：落点按 `world.qi` 排序（「灵气最高的几处」），
  // 灵气层没算完时那一片还是全 0，12 人会落在一片假高地上。
  // 也必须在 `resetUpperSystems` 之后：那一步把 `nextEntityId` 抬到 `UPPER_ID_BASE`
  // 并把 `clans` 备好，开局人口的 id 与始祖线才不会和凡间撞号。
  seedUpperPopulation(world, distLeyline);

  // ⚠️ 这里**刻意不写编年史**（不调 world.record）。上界的编年史话术是
  // 「紫霄初立」那一类，与凡间的「天地初开」不同；本轮不写任何条目，
  // 是为了让「上界的 chronicle 里没有混进凡间话术」这条判据有一个干净的基线。
  // 开局 12 人**也不写** `chronicle`（它们不是事件，见 `seedUpperPopulation`）——
  // 保留「上界 chronicle 恒空」这条信号：它一旦非空，就说明阶段二真的写了事件。
  //
  // ⚠️ 除了开局那 12 人，这里**不撒任何其他生灵**（不调任何 spawn / scatter）。
  // 上界的人口只有两条腿：飞升输入（`planes.arriveUpper`）+ 上界繁衍
  // （`sim/upperLife.js`），没有第三条（灵气化生被用户否决，规格 §2.3）。

  return world;
}
