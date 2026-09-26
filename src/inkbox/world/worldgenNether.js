// 水墨沙盒 · 幽冥界（幽墨冥河）程序化地形生成
//
// ───────────────────────────────────────────────────────────────────────
// 为什么另写一份，而不是调 `generateWorld()`（与上界同形，理由逐条对应）
// ───────────────────────────────────────────────────────────────────────
//
// 1. `generateWorld()`（worldgen.js:418-438）里**硬编码**了 `seedLeylines()`
//    与 `scatterInitialLife()`。后者（worldgen.js:441-483）撒的是
//    **凡人 + 灵兽 + 山精**——幽冥界没有凡人，本轮（8-B）连鬼修实体都还没落地
//    （鬼修是 8-D 的事），撒了就是错的。
// 2. `buildHeightField`（worldgen.js:18-75）的大陆遮罩是「中心隆起、边缘沉海」，
//    配 `WATER_TARGET = 0.42`。照抄会得到一张**看起来和凡间一样的地图**。
//    幽冥要的是「一整块黄泉地脉 + 刻进去的冥河」（§8.1 视觉基准
//    `nether-dark-river`：一条横向冥河），不是海上的大陆，也不是上界的群岛。
// 3. `generateWorld` 会 `world.record('天地初开 · 种子 ...')`（worldgen.js:435）。
//    幽冥的编年史应该是自己的话术，不能混入凡间的「天地初开」。
//
// ───────────────────────────────────────────────────────────────────────
// 铁律一：随机流（**这一条违反了就是 bug**）
// ───────────────────────────────────────────────────────────────────────
//
// `Life` 的主随机流（`life.js` 的 `this.rng`）是**全世界共用的一条种子流**。
// 多抽一次签，整条世界线就漂走，既有长测的全部标定当场作废
// （见 `life.js:110-124`、`family.js` 头注释）。**本文件不 import `Life`，
// 也永远不该 import。**
//
// ⚠️ 与上界的一处不同：**本模块一处随机流都不需要。** 地形全部由噪声与
//    `world.seed` 决定——连支流的位置都是噪声驱动的（见 `carveNetherRivers`），
//    没有一次 `mulberry32` 抽签。这是**结构上**的保证，不是「我们记得别抽」。
// ⚠️ 但 8-C 的幽冥 tick 会需要一条**长活的**独立流。那时必须照
//    `sim/rifts.js` 的 `RIFT_RNG` 做法挂**模块级 `WeakMap`**（不入档）；
//    **不要**挂成 `world.netherRng` 属性——序列化器拾取的是 world 自己的
//    可枚举属性，挂上去就会被它看见（见 `rifts.js:280-294` 那段）。
//
// ───────────────────────────────────────────────────────────────────────
// 幽冥的种子为什么必须是 `凡间种子 ^ 0x4e455452`
// ───────────────────────────────────────────────────────────────────────
//
// 与上界逐字同源的理由（见 `worldgenUpper.js` 头注释）：
//
//     // sim/life.js:124
//     this.warRng = mulberry32(((world.seed || 0) ^ 0x776172) >>> 0);
//
// `Life` 构造时从 `world.seed` **自动**派生战争随机流，调用方没有任何参数能改它。
// 三界若用同一个 `seed`，三张图的战争随机流会**逐次抽签完全相同**。
// 给每位面异或一个常量，就把流岔开了。
//
// 派生集中在 `planes.js` 的 `deriveNetherSeed()`（唯一一处，不许各写一遍）。
//
// ⚠️ **这个常量必须与上界的 `0x55505052` 不同**（幽冥取 ASCII 'NETR' = 0x4e455452）。
//    复用上界那个会让两个位面**同种子**——而两个位面同种子**不报错**，
//    只会让地形「巧合地」一模一样（噪声同源），查起来极难。
//
// ───────────────────────────────────────────────────────────────────────
// 地形：6 层，与上界**同形**，语义换掉（§8.9 裁决 8.1①）
// ───────────────────────────────────────────────────────────────────────
//
// 复用的是上界那条做法：**先照凡间整个存一遍，再把地形裁到 6 层**
// （`io/save.js` 的 `serializeNetherWorld`）。手写一份「幽冥专用字段清单」
// 就是**第二份真相**——凡间每加一个世界级字段，那份清单都不会跟上，
// 漏掉的那个读档后凭空消失，而且不报错。
//
// 6 层的语义（换掉的两层加 ⚠️）：
//   · `height` —— 黄泉地脉高程
//   · `water`  —— ⚠️ **冥河**（不是凡间的「水」：幽冥没有水文循环）
//   · `veg`    —— ⚠️ **阴气 / 荒芜**（不是凡间的「植被」：幽冥没有植物；
//                  0 = 荒芜，1 = 阴气浓厚，离冥河越近越浓）
//   · `type`   —— 地表类型（复用 `terrain.js:99` 的 `classify`；见下）
//   · `over`   —— 覆盖层（本模块用来标「焦土 / 烬」这两类荒芜斑）
//   · `struct` —— 建筑层（**本轮恒 0**：鬼修建筑是 8-D 的事）
//
// ⚠️ `type` 仍走 `classify`（凡间那套），所以幽冥图上会出现「冻原 / 林 / 烬」
//    这类凡间词汇。这是**刻意的**：`type` 是「地形类别」，渲染配色由 8-F 的
//    幽冥渲染层重映射，**不是**在这里另造一套地表类型表（那又是一份第二真相，
//    且会让 `classify` 的读者分叉）。语义靠配色与图层名表达，不靠枚举改名。
//
// ⚠️ **坐标不与凡间 / 上界对位**（§8.9 裁决 8.1④）：魂是**投影**，
//    位置由 `hash(soul.id, day)` 现算，与凡间坐标无关（§8.2）。
//    所以本模块**不读**任何凡间 / 上界的坐标，也不做「对应坐标附近」那套。
//
// ───────────────────────────────────────────────────────────────────────
// 铁律二：推导量不进存档
// ───────────────────────────────────────────────────────────────────────
//
// · `world.qi` 是**推导量**（凡间由 `terrain.js:82` 的 `qiAt` 算），不进存档，
//   读档后由调用方重算（同 `territory.js` 的规矩）。**不要**把它当状态存下来。
// · `temp` / `moist` 是**生成期量**（只被 `classify` 读），与上界一样**不存**：
//   读档时照同一 `(preset, seed)` 重新生成一次补回来（见 `deserializeNetherWorld`）。
// · `riverBase`（冥河基流）同理**不存**：它是本模块从 `seed` 刻出来的，
//   重新生成即得（§8.9 裁决 8.1①把地形钉在 6 层）。
//   ⚠️ 前提与上界一样：`generateNetherWorld` 对同一 `(preset, seed)` 必须
//   **纯确定性**。哪天它引入 `Date.now()` 或全局可变状态，读档会静默拿回一张
//   错的 `temp`/`moist`/`riverBase`——而 6 层是存档里的旧值，看起来一切正常。
//
// ───────────────────────────────────────────────────────────────────────
// 与凡间 / 上界地形的区别（§8.1 + §8.9，逐条实现，不是换滤镜）
// ───────────────────────────────────────────────────────────────────────
//
//   高程分布  **一整块黄泉地脉**（不碎成群岛——与上界的云海遮罩**相反**），
//             低处压得很低（「可居平地」几乎没有），山脊比上界更少更缓
//   水域      **刻河**（与上界相反，上界 `riverBase` 恒 0）：一条**横向主河**
//             + 若干支流（§8.9 裁决 8.1②），河两岸各留一条**窄带**（魂出生处）
//   气温      `NETHER_TEMP_BASE` 很低（幽冥是冷的），冥河附近微暖
//   湿度      冥河附近很润（河岸长「林」），远处干成荒芜（烬 / 焦土斑）
//   初始生灵  **一个都不放**（8-B 只做地形；鬼修是 8-D 的事）
//
// ⚠️ 一处**刻意的「不做」**：本模块**不布灵脉 / 仙脉**。幽冥没有修行体系
//    （§8.3②：鬼修六级是**另一套**，走「积怨」不走「突破」），
//    `leylines` 在幽冥实例上**恒空**——这不是漏接线，是 §8.3 的裁决。

import { SEA_LEVEL, WORLD_PRESETS } from '../core/config.js';
import { World } from './World.js';
import { classify, recomputeQi, OVER } from './terrain.js';
import {
  createNoise2D, fbm, ridged, domainWarp, clamp, smoothstep,
} from '../core/noise.js';
import { deriveNetherSeed, NETHER_ID_BASE } from './planes.js';
// 幽冥人口账本的**唯一形状定义**在 `sim/netherLife.js` 的 `ensureNetherPopLog`
// （与 `planes.ensureUpperPopLog` 同款纪律）。这里 import 它、而不是再抄一份
// 五键字面量——「形状只有一处定义」是结构上的保证，不是靠注释提醒。
// ⚠️ 这条边不会成环：`netherLife.js` 只 import `core/config.js`，
//    不回头 import 本文件（`inkbox-import-check.mjs` 会验）。
import { ensureNetherPopLog } from '../sim/netherLife.js';

// ── 幽冥专属旋钮 ─────────────────────────────────────────

/** 主河的纵向位置（占画幅高度的比例）。06 册 `nether-dark-river` 是一条横向主河，大致居中 */
const MAIN_Y_RATIO = 0.52;
/** 主河的蜿蜒幅度（占画幅高度）与频率 */
const MAIN_MEANDER_GAIN = 0.16;
const MAIN_MEANDER_FREQ = 2.6;

/**
 * 河床半宽（格）：从河心到「河岸起点」的格距。
 *
 * ⚠️ **待标定（2026-09-21）**：这是**刻河的半径**，不是最终的水面宽度——
 * 水面宽度由 `carveNetherRivers` 里的深度剖面决定，实测比 `2 × 本值` 窄
 * （见那个函数里的 `smoothstep(0, 0.85, t)`）。
 * §8.9 裁决 8.1③ 要求「河宽必须实测标定，不许照抄凡间 / 上界的数字」——
 * 这里是**初值**，等 8-F 的幽冥渲染层能出图后按视觉基准回标。
 *
 * 📏 **初值实测**（中堂 288×180 · seed 20260914 · `_netherprobe` 临时探针）：
 *    逐行量连续水段的长度，中位数 = **5 格**（p90 也是 5），即冥河水面宽约 5 格；
 *    水面占全图 **4.88%**。⚠️ 这两个数是**本初值下的读数**，不是标定结论。
 */
const RIVER_HALF_WIDTH = 2.4;
/**
 * 窄带格数：河岸两侧各多少格算「魂出生的窄带」。
 *
 * ⚠️ **待标定（2026-09-21）**（§8.9 裁决 8.1③）：既是**多条**河，
 * 「窄带」就是**每条河各自的窄带**，标定要按条分别量。这里是**初值**。
 * 窄带内的高程被压平到贴近水面（见 `carveNetherRivers` 的河谷那段），
 * 于是「魂出生在河边窄带」这句话在地形上是有几何对应的，不是纯叙事。
 *
 * 📏 **初值实测**：`RIVER_HALF_WIDTH + BANK_BAND_TILES ≈ 5.4` 格内的格子
 *    占全图 **20%**；这些格子的高程全落在 `[0.299, 0.35]`——即「贴着水面的平地」，
 *    与设计意图（魂立在河岸窄带上）相符。
 */
const BANK_BAND_TILES = 3;
/** 河床相对海平面下沉的深度（河心最深） */
const RIVER_DEPTH = 0.05;
/** 冥河基流（`riverBase`）的上限：让 `qiAt` 的河道加成不至于把整条河算成灵脉 */
const RIVER_BASE_MAX = 0.05;
/**
 * ⚠️ **待标定（2026-09-21）**：支流条数（§8.9 裁决 8.1②「一条主河 + 若干支流」）。
 * 取 3 是初值：太少看不出「多条」，太多会把主河两岸切碎、窄带被反复打断。
 */
const TRIBUTARY_COUNT = 3;
/** 窄带外沿相对海平面的抬升（窄带是「贴着水面的平地」，不是水） */
const BANK_LIFT = 0.012;

/** 陆地曲线的起点抬升与幂次。凡间 2.15、上界 2.45；幽冥更低更缓（黄泉是缓坡，不是仙山） */
const LAND_LIFT = 0.08;
const LAND_POWER = 1.8;
/**
 * 陆地的**总高差**（占 0..1 高程轴的比例）。
 *
 * 凡间 / 上界都把陆地铺满 `SEA_LEVEL..1`（高差 `1 - SEA_LEVEL = 0.7`），
 * 于是分位数最高的那三成一定会越过 `classify` 的 `height > 0.7` 门槛，
 * 变成山 / 峻岭 / 雪峰——那是上界要的「多山少平原」。
 * 幽冥要的是**一整块平芜的黄泉地脉**，所以把高差压到 `LAND_SPAN`：
 * 最高处只到 `SEA_LEVEL + LAND_SPAN = 0.72`，「山」只剩零星几处，
 * 「峻岭 / 雪峰」在结构上不可能出现（`classify` 的 0.8 / 0.9 两道门槛够不着）。
 *
 * ⚠️ **待标定（2026-09-21）**：0.42 是初值，等 8-F 的幽冥渲染层出图后，
 * 按「平芜为主、山只是点缀」的视觉基准回标。
 */
const LAND_SPAN = 0.4;
/**
 * 山脊权重与幂次。凡间 0.42/1.7、上界 0.6/1.15。
 *
 * ⚠️ 幽冥比两者都低**得多**（0.2，不是 0.34）：`classify` 有一条
 * `slope > 0.076 → 石`（`terrain.js:130`），而分位数重排会放大局部梯度。
 * 第一版取 0.34 时实测「石」占了 23.7%、「山 + 峻岭 + 雪峰」占 26.3%——
 * 那已经是一张上界风格的图了。压到 0.2 并配 `LAND_SPAN` 之后才是平芜。
 */
const RIDGE_WEIGHT = 0.2;
const RIDGE_POWER = 1.8;

/** 阴气（`veg`）随「离冥河多远」衰减的特征格距。⚠️ 待标定（2026-09-21） */
const YIN_REACH = 10;
/** 湿度随「离冥河多远」衰减的特征格距 */
const MOIST_REACH = 12;
/**
 * 幽冥的本底气温与高度降温系数。
 *
 * 本底取 0.26（**不是** 0.1 那种「极地」值）：`classify` 的分档是
 * `temp < 0.16 → 冻原`、`0.16..0.3 → 草原 / 疏林 / 林`、`> 0.3` 才轮到芳甸 / 泽薮。
 * 本底压到 0.16 以下的话，整张图（实测 65%）会**只剩冻原一种地表**，
 * 阴气 / 荒芜的层次在 `type` 层上就全塌成一片——而 §8.1 要的是能表达
 * 「河两岸 / 荒芜腹地」的差别。所以本底留在 0.16..0.3 之间，
 * 由**高度降温**把高处压进冻原、由**河畔暖意**把河岸抬进林 / 甸。
 */
const TEMP_BASE = 0.26;
const ALTITUDE_COOLING = 0.6;
/** 冥河附近的一点暖意（阴气所聚处）。幅度很小，不改变「幽冥是冷的」这个基调 */
const RIVER_WARMTH = 0.1;
/**
 * 荒芜斑（焦土 / 烬）的起点格距与噪声阈值。
 *
 * ⚠️ **待标定（2026-09-21）**：初值的第一版（18 / 0.80 / 0.68）实测只覆盖
 * 0.47% 的格子——`over` 层几乎全 0，等于「6 层里有一层是死的」，
 * 而幽冥的「荒芜」本该由它承担。压到 14 / 0.70 / 0.58 之后荒芜斑才成片。
 * 出图后按视觉基准回标（目标：荒芜腹地**成片**，但不连成一片死黑）。
 */
const WASTE_REACH = 14;
const WASTE_SCORCH = 0.7;
const WASTE_ASH = 0.58;

// 幽冥的噪声子键。与凡间 / 上界刻意取不同的值，方便读代码时一眼分清
// 「这是幽冥的流」。注意：即使取值相同，三界的 seed 也不同（见头注释）。
const K_ROOT = 0x9e3779b9;
const K_WARP = 0x51ed2701;
const K_CLIMATE = 0x1b873593;
const K_WASTE = 0x2545f491;

/**
 * 幽冥的高程场。
 *
 * 与上界（`worldgenUpper.buildUpperHeightField`）的**关键结构差别**：
 *   1. **没有云海遮罩**。上界用一层中频噪声当「哪里是岛」，让陆地碎成群岛；
 *      幽冥要的正好相反——**一整块黄泉地脉**，从画幅这边连到那边。
 *      所以这里 `mask ≡ 1`（不引入遮罩），大陆是连续的。
 *   2. 山脊权重比上界低、幂次比上界高 → 山更少更缓（黄泉是缓坡，不是仙山）。
 *   3. 分位数重排时给陆地加一个**较小**的起点抬升：上界要「可居平地更少」，
 *      幽冥要「可居平地几乎没有」——但幽冥的「没有」靠的是**荒芜**（`over` 的
 *      焦土 / 烬 + 阴气分布），不是靠把地抬到悬崖上。抬得太狠会变成上界那种
 *      峭壁感，与「幽墨冥河」的平远构图冲突。
 *
 * ⚠️ 这里**不刻河**：河道由 `carveNetherRivers` 在本函数**之后**单独刻
 *    （它要读本函数的成果，才能把河谷压进地形里）。
 */
function buildNetherHeightField(world, noise, warpNoise) {
  const { w, h, height } = world;
  for (let y = 0; y < h; y += 1) {
    const ny = y / h;
    for (let x = 0; x < w; x += 1) {
      const nx = x / w;
      const [wx, wy] = domainWarp(warpNoise, nx * 3.1, ny * 3.1, 0.72, 1.15);
      // 6 个倍频、gain 0.54 是上界的取法（多山）。幽冥取 5 / 0.5：更少的细节
      // 倍频 = 更平缓的地脉（细节倍频正是「石」那条坡度门槛的燃料）。
      const base = fbm(noise, wx * 3.0, wy * 3.0, 5, 2.05, 0.5);

      // 没有云海遮罩：陆地是**一整块**。`mask ≡ 1` 写出来是为了让「这里刻意
      // 不碎成岛」这件事在代码里看得见，而不是让人去猜「为什么没有遮罩」。
      let value = (base - 0.5) * 0.95 + 0.55;

      // 褶皱山脉：权重比上界低、幂次比上界高 → 山脊更少更缓。
      const ridge = ridged(noise, nx * 6.4 + 11.3, ny * 6.4 + 7.7, 4, 2.15, 0.5);
      value += Math.pow(ridge, RIDGE_POWER) * RIDGE_WEIGHT;

      // 黄泉台地（低平的荒原）：比上界的「仙台」多——幽冥是大片平芜，
      // 不是几处高台。这一项把大片区域压向低处。
      const plateau = fbm(noise, nx * 2.3 + 41.5, ny * 2.3 + 23.9, 3, 2.0, 0.5);
      value -= smoothstep(0.62, 0.95, plateau) * 0.06;

      height[y * w + x] = value;
    }
  }

  // 分位数重排（同凡间 / 上界的做法，曲线不同）。
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

  // 幽冥**没有海**：全部陆地都排在 `SEA_LEVEL` 之上，水面只出现在刻出来的冥河里。
  // （上界有云海、凡间有海；幽冥的水只有一条河——这是 §8.1 的语义换层。）
  // 高差用 `LAND_SPAN` 而**不是** `1 - SEA_LEVEL`：见那个常量的注释。
  for (let i = 0; i < world.size; i += 1) {
    const q = quantileOf(height[i]);
    height[i] = SEA_LEVEL + LAND_SPAN * (LAND_LIFT + (1 - LAND_LIFT) * Math.pow(q, LAND_POWER));
  }
}

/**
 * 沿一条折线把「到河心的格距」刷进 `dist`（只刷 `window` 半径内的格）。
 *
 * 这是**几何距离的近似**：折线被采样成一串相距 ≤ 1 格的点，每点刷一个
 * 半径 `window` 的窗口。折线够密时，`min` 出来的场与真实距离场相差不到一格。
 * 不引 `distanceToWater` 那套多源 BFS 的原因：河心是一条**线**，不是「若干水格」，
 * 而且 BFS 要先把水格填好才能跑——可我们正是**用距离场去决定哪里是水**的。
 *
 * 全程**不抽随机流**：折线的控制点全部由噪声给定（见 `carveNetherRivers`），
 * 所以同一个 `(preset, seed)` 逐格可复现。
 */
function stampPolyline(dist, w, h, pts, window) {
  const rad = Math.ceil(window);
  for (let s = 0; s < pts.length - 1; s += 1) {
    const a = pts[s];
    const b = pts[s + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len));
    for (let k = 0; k <= steps; k += 1) {
      const t = k / steps;
      const cx = a.x + (b.x - a.x) * t;
      const cy = a.y + (b.y - a.y) * t;
      const x0 = Math.max(0, Math.floor(cx - rad));
      const x1 = Math.min(w - 1, Math.ceil(cx + rad));
      const y0 = Math.max(0, Math.floor(cy - rad));
      const y1 = Math.min(h - 1, Math.ceil(cy + rad));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const d = Math.hypot(x - cx, y - cy);
          const i = y * w + x;
          if (d < dist[i]) dist[i] = d;
        }
      }
    }
  }
}

/**
 * 刻冥河：一条**横向主河** + 若干支流（§8.9 裁决 8.1②）。
 *
 * 主河对应 06 册视觉基准 `nether-dark-river`（一条横向冥河，魂出生在河边窄带）；
 * 支流是从画幅上下边缘斜插进主河的几条水线——它们让「窄带」在每条河上各有
 * 一段（§8.9 裁决 8.1③ 的标定因此要按条分别量），也给 §8.7 的「冥河倒灌」
 * 留下了地理。
 *
 * 实现分两步，**先算距离场、再落地形**——这个顺序是承重的：
 *   · 距离场 `dist` 是「到最近河心的格距」，它同时驱动三样东西：
 *     河床（`dist <= RIVER_HALF_WIDTH`）、窄带（再往外 `BANK_BAND_TILES` 格）、
 *     以及下游的阴气 / 湿度 / 荒芜斑分布。
 *   · 若先落河床再算距离，就得反着从「哪些格是水」推距离——那正是 BFS 的活，
 *     而 BFS 要先把水填好。循环依赖。所以先有距离场。
 *
 * @returns {Float32Array} 每格到最近河心的格距（无河处为 1e9）。**这是生成期量，
 *   不进存档**；`temp` / `moist` / `veg` / `over` 都要读它，所以返回出去。
 */
function carveNetherRivers(world, noise) {
  const { w, h, height, water, riverBase } = world;
  const dist = new Float32Array(world.size).fill(1e9);
  const window = RIVER_HALF_WIDTH + BANK_BAND_TILES + 2;

  // ── 主河：横向蜿蜒（06 册 nether-dark-river 的视觉基准）──────────────
  const centerY = new Float32Array(w);
  for (let x = 0; x < w; x += 1) {
    const t = x / w;
    const meander = fbm(noise, t * MAIN_MEANDER_FREQ + 7.3, 0.5, 3, 2.0, 0.5) - 0.5;
    centerY[x] = h * MAIN_Y_RATIO + meander * h * MAIN_MEANDER_GAIN;
  }
  const mainPts = [];
  for (let x = 0; x < w; x += 1) mainPts.push({ x, y: centerY[x] });
  stampPolyline(dist, w, h, mainPts, window);

  // ── 支流：从画幅上下边缘斜插进主河 ────────────────────────────────
  // 汇入点沿 x 均分（不抽签），再由噪声决定从上游还是下游来、以及摆动幅度。
  for (let k = 0; k < TRIBUTARY_COUNT; k += 1) {
    const frac = (k + 1) / (TRIBUTARY_COUNT + 1);
    const jitter = (fbm(noise, frac * 5.1 + 21.7, k * 3.3 + 4.9, 2, 2.0, 0.5) - 0.5) * w * 0.1;
    const jx = clamp(Math.round(w * frac + jitter), 2, w - 3);
    const jy = centerY[jx];
    const fromTop = fbm(noise, frac * 7.7 + 3.1, 11.3, 2, 2.0, 0.5) > 0.5;
    const ey = fromTop ? -2 : h + 2;
    const sx = clamp(jx + (fromTop ? -1 : 1) * w * 0.09, 2, w - 3);

    const pts = [];
    const steps = 20;
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      // 摆动：让支流不是一条直线（同样来自噪声，不抽签）
      const wob = (fbm(noise, t * 3.4 + k * 9.1, 5.5, 2, 2.0, 0.5) - 0.5) * w * 0.05;
      pts.push({
        x: sx + (jx - sx) * t + wob,
        y: ey + (jy - ey) * t,
      });
    }
    stampPolyline(dist, w, h, pts, window);
  }

  // ── 落地形：河床 / 窄带 / 其余（距离场 → 高程与水位）────────────────
  for (let i = 0; i < world.size; i += 1) {
    const d = dist[i];
    if (d <= RIVER_HALF_WIDTH) {
      // 河床：河心最深，岸边渐浅。
      // `smoothstep(0, 0.85, t)` 让最外圈几乎不沉——于是河沿会露出「汀」（浅滩），
      // 冥河的**水面宽度因此比 `2 × RIVER_HALF_WIDTH` 窄**（这正是 8.1③ 要标定的量）。
      const t = 1 - d / RIVER_HALF_WIDTH;
      const drop = RIVER_DEPTH * smoothstep(0, 0.85, t);
      height[i] = SEA_LEVEL - drop;
      // 水面恒在 SEA_LEVEL：水深 = 水面 − 河床（同凡间「水面 = height + water」的约定）。
      // 河沿 `drop <= 0.0015` 的格按**陆地**处理（水深 0），于是河岸会露出「汀」——
      // 冥河的**水面宽度因此比 `2 × RIVER_HALF_WIDTH` 窄**（这正是 8.1③ 要标定的量）。
      water[i] = drop > 0.0015 ? drop : 0;
      riverBase[i] = Math.min(RIVER_BASE_MAX, water[i] * 0.6);
    } else if (d <= RIVER_HALF_WIDTH + BANK_BAND_TILES) {
      // 河谷：窄带压平到贴近水面（「魂出生在河边窄带」的几何来源），
      // 越往外越恢复地形——于是河岸是一道缓坡，不是一堵墙。
      // 只**压低**、不抬高：本来就在水面以下的地（理论上不该有）保持原样。
      const bandT = (d - RIVER_HALF_WIDTH) / BANK_BAND_TILES;
      const valley = SEA_LEVEL + BANK_LIFT;
      height[i] = Math.min(height[i], valley + (height[i] - valley) * smoothstep(0, 1, bandT));
    }
  }

  return dist;
}

/**
 * 幽冥气候。
 *
 * · **气温**：本底很冷（`TEMP_BASE = 0.2`），冥河附近有一点点暖意
 *   （`RIVER_WARMTH`：阴气所聚处），高处再降温。**没有纬度**这回事。
 * · **湿度**：由**离冥河的距离**驱动（`MOIST_REACH`）——河岸很润、远处干成荒芜。
 *   `classify()` 要读 `moist` 才能分出林 / 甸 / 荒漠（`terrain.js:137-142`）。
 *   幽冥不跑 `stepVegetation`，所以 `temp` / `moist` 都是**生成期量**，不入档。
 */
function buildNetherClimate(world, noise, riverDist) {
  const { w, h, temp, moist, height } = world;
  const bandOuter = RIVER_HALF_WIDTH + BANK_BAND_TILES;
  for (let y = 0; y < h; y += 1) {
    const ny = y / h;
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const nx = x / w;
      const beyond = Math.max(0, (riverDist[i] < 1e8 ? riverDist[i] : 9999) - bandOuter);

      // 气温：本底 − 高度降温 + 河畔暖意 + 一点抖动
      const warmth = Math.exp(-beyond / YIN_REACH) * RIVER_WARMTH;
      const altitude = Math.max(0, height[i] - SEA_LEVEL) * ALTITUDE_COOLING;
      const jitter = fbm(noise, nx * 4.5 + 61.2, ny * 4.5 + 17.4, 3, 2, 0.5) - 0.5;
      temp[i] = clamp(TEMP_BASE + warmth - altitude + jitter * 0.12, 0, 1);

      // 湿度：离冥河越近越润
      const nearRiver = Math.exp(-beyond / MOIST_REACH) * 0.85;
      const band = fbm(noise, nx * 4.8 + 91.7, ny * 4.8 + 55.1, 4, 2, 0.5) * 0.35;
      moist[i] = clamp(nearRiver + band - 0.05, 0, 1);
    }
  }
}

/**
 * 阴气 / 荒芜（`veg` 层）+ 荒芜斑（`over` 层）。
 *
 * `veg` 在凡间是「植被」、在幽冥是**阴气**：离冥河越近越浓，远处是荒芜。
 * 它仍然要写——渲染的阴气深浅读它（`terrainLayer.js:250`），
 * `World.fertility()` 也读它（`World.js:221`）。
 *
 * `over` 用来标两类荒芜斑：**烬**（ASH）与**焦土**（SCORCHED）——
 * 只在远离冥河的地方出现（河畔阴气重，不长荒芜斑）。两者都是**可通行**地表
 * （`TERRAIN_INFO` 里 walk:true），所以不会把地图切成孤岛。
 *
 * ⚠️ 刻意**不用** `OVER.LAVA`：`classify` 见到 LAVA 直接返回熔岩，
 * 而熔岩 walk:false——大片熔岩会把窄带与荒原切成互不连通的碎块。
 * 幽冥本轮没有「岩浆」这个设定，不要为了视觉硬塞。
 */
function seedNetherYin(world, noise, riverDist) {
  const { w, h, veg, over, water } = world;
  const bandOuter = RIVER_HALF_WIDTH + BANK_BAND_TILES;
  for (let y = 0; y < h; y += 1) {
    const ny = y / h;
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const nx = x / w;
      if (water[i] > 0.0015) {
        // 冥河本身：没有「阴气」可言（它是水线，不是岸）
        veg[i] = 0;
        continue;
      }
      const beyond = Math.max(0, (riverDist[i] < 1e8 ? riverDist[i] : 9999) - bandOuter);
      const yin = Math.exp(-beyond / YIN_REACH);
      const patch = fbm(noise, nx * 13.5, ny * 13.5, 3, 2, 0.5) * 0.25 + 0.85;
      veg[i] = clamp(yin * patch * 1.05 - 0.06, 0, 1);

      // 荒芜斑：离冥河足够远、且噪声够高
      if (beyond > WASTE_REACH) {
        const waste = fbm(noise, nx * 9.1 + 3.3, ny * 9.1 + 77.7, 3, 2.0, 0.5);
        if (waste > WASTE_SCORCH) over[i] = OVER.SCORCHED;
        else if (waste > WASTE_ASH) over[i] = OVER.ASH;
      }
    }
  }
}

/**
 * 把「幽冥不跑的凡间系统」显式归零。
 *
 * World 构造函数本来就把它们建成空数组 / 零账本，这里再写一遍不是冗余：
 * 它把「幽冥不跑这些系统」这条**语义**钉在代码里，而不是靠「构造函数碰巧
 * 没给初值」这个偶然事实（同 `worldgenUpper.resetUpperSystems` 的理由）。
 *
 * ⚠️ 与上界的一处**结构差别**：上界开局就有 3 条始祖线，所以它的
 *    `resetUpperSystems` 刻意**不**清零 `clans`。幽冥**没有**这个例外——
 *    本轮一个实体都不放，所以下面每一项都照零清，包括 `clans`。
 *    8-D 接鬼修时若也要给幽冥挂世家 / 门派，**必须同时**回来改这里，
 *    否则开局状态会被这一刻抹掉（而那是**不报错**的）。
 */
function resetNetherSystems(world) {
  // 1. 卜算子
  world.busanzi.met = false;
  world.busanzi.acts = 0;
  world.busanzi.milestones.length = 0;
  world.busanzi.peakPop = 0;
  world.busanzi.tier = 0;
  // 2. 夺舍（幽冥不跑 `stepPossession`；鬼修「入他人身」是 8-E 越界的事，另开）
  world.possessionLog.succeeded = 0;
  world.possessionLog.failed = 0;
  world.possessionLog.suspected = 0;
  // D6-3 工程包 D 追加的两键：跨位面夺舍的子账（幽冥实例上恒为零——
  // 夺舍由**凡间**那侧的 `stepNetherRift` 记账，这里清是为了把「幽冥不跑它」钉成语义）。
  world.possessionLog.crossPlane = 0;
  world.possessionLog.haunted = 0;
  // 3. 逝者名录（幽冥不跑 `stepNecrology`）
  world.dead.length = 0;
  world.deadLog.total = 0;
  world.deadLog.ascended = 0;
  world.deadLog.evicted = 0;
  // 4. 神魂 / 魂池。
  //    ⚠️ **魂池不搬家**（§8.2）：`world.souls` 是**凡间**的真实状态，
  //    幽冥实例上这一栏**恒空**。`planes.createPlanes` 把
  //    `nether.souls` 开成 `mortal.souls` 的**别名**——那个别名指向凡间数组，
  //    与这里这个空数组**不是**同一个东西，别把它们搞混。
  world.souls.length = 0;
  // 5. 魂路累计账本：它记在**凡间**那侧（`enterNether` 由凡间的 `Life` 调），
  //    幽冥实例上恒为零。同 §8.2「魂池不搬家」的理由。
  world.soulLog.natural = 0;
  world.soulLog.linger = 0;
  world.soulLog.ghost = 0;
  world.soulLog.wraith = 0;
  world.soulLog.gone = 0;
  // 6. 世家（幽冥没有姓氏传承；鬼修是**另一套**体系，§8.3②）
  world.clans.length = 0;
  world.clanLog.founded = 0;
  world.clanLog.ended = 0;
  world.lastClanFoundDay = -1e9;
  world.nextClanId = 1;
  // 7. 大战
  world.wars.length = 0;
  world.warLog.declared = 0;
  world.warLog.resolved = 0;
  world.warLog.destroyed = 0;
  world.warLog.casualties = 0;
  // 8. 飞升记录
  world.ascended.length = 0;
  // 9. 空间裂缝：裂缝开在**凡间**（§4.2），幽冥不跑 `stepRifts`
  world.rifts.length = 0;
  world.riftLog.opened = 0;
  world.riftLog.closed = 0;
  world.riftLog.leaked = 0;
  world.riftLog.crossed = 0;
  world.riftLog.lost = 0;
  // 10. 灵脉 / 仙脉：幽冥**不布**（§8.3②：鬼修六级走「积怨」，不走「突破」）。
  //     这里清空是为了把「幽冥没有灵脉」钉成语义——构造函数给的是空数组，
  //     但将来若有人给 `World` 留了非空初值，这一行会把它抹掉（那正是我们要的）。
  world.leylines.length = 0;
  // 11. 实体 id 从幽冥段起编（`NETHER_ID_BASE`）：每个 World 的 `nextEntityId`
  //     都从 1 起，三界会撞号（铁律三）。`nextEntityId` 本身进存档，
  //     读档原样恢复，偏移只需在**生成期**设一次。
  //     ⚠️ 8-D 的鬼修必须是**独立实体**（§8.2②：不从魂池就地升格），
  //     所以它们要用这一段 id——这正是这一行的用途。
  world.nextEntityId = NETHER_ID_BASE;
  // 12. 幽冥人口账本（契约 `reports/d5/BATCH2-DESIGN.md` §四）。
  //     形状的**唯一**定义在 `sim/netherLife.js` 的 `ensureNetherPopLog`；
  //     这里调用它建初值，再**显式归零**（本函数的名字就是「reset」，语义上
  //     要能在一张用过的 world 上把账本清干净，而不是只在缺键时才建）。
  //     ⚠️ 序列化走 `io/save.js` 的 `NETHER_ONLY_KEYS`（另一 worker 维护，
  //        本文件不碰 save.js）。与上界的 `popLog` 不撞车（不同 World 实例）。
  const popLog = ensureNetherPopLog(world);
  popLog.ghostBorn = 0;
  popLog.cultivatorBorn = 0;
  popLog.ghostDied = 0;
  popLog.cultivatorAdvanced = 0;
  popLog.evicted = 0;
  popLog.fellIn = 0;   // D6-3 工程包 A：裂缝跌入者（`ghostBorn` 的子计数）
  popLog.climbedOut = 0; // D6-3 工程包 B：自幽冥缝爬入凡间的鬼（第三条离开路径）
  // 13. 幽冥物品账四条（D6-3 工程包 C）。形状的唯一真源是
  //     `sim/netherLife.js` 的 `ensureNetherPopLog`；这里照上面各条的做法**显式归零**。
  popLog.itemsSpawned = 0;    // 幽冥自生
  popLog.itemsFellIn = 0;     // 跌入者带下来
  popLog.itemsLeakedOut = 0;  // 经缝漏回凡间
  popLog.itemsDecayed = 0;    // 超上限朽掉
  popLog.possessedOut = 0;    // D6-3 工程包 D：被鬼修夺舍、元神搬进凡间的（第四条离开路径）
  // 幽冥物品池本身（`nether.artifacts`）也是 C 包起的真实状态，与 `clans` /
  // `dead` 等一样照零清（见本函数头注释的「幽冥没有例外」）。
  // ⚠️ `nextArtifactId` 也归 1——它进存档、读档原样恢复，偏移只需在生成期设一次
  //    （与 `nextEntityId = NETHER_ID_BASE` 不同：法宝 id **从不跨界**，
  //     跨世界时由 `rifts.js` 重赋，所以幽冥物品不需要世界限定符）。
  world.artifacts.length = 0;
  world.nextArtifactId = 1;
}

/**
 * 全量重算幽冥的**地表类型**层。
 *
 * 私有：只在生成期用一次。外部没有读者——`type` 是随存档逐格存下来的
 * （`io/save.js` 的 `serializeNetherWorld` 保 `type`），读档后不需要重算它。
 * 不导出是为了让「外部只能重算 qi」这条边界是**语法层面**的。
 */
function classifyNether(world) {
  for (let y = 0; y < world.h; y += 1) {
    for (let x = 0; x < world.w; x += 1) {
      const i = y * world.w + x;
      world.type[i] = classify(world, x, y, i);
    }
  }
}

/**
 * 生成一个幽冥界世界。
 *
 * @param {{preset?:{w:number,h:number}, seed?:number}} options
 *   · `preset` —— 尺寸预设。**必须与凡间 / 上界同一张 preset**（三界同尺寸）。
 *   · `seed`   —— **凡间的种子**，不是幽冥的。函数内部走 `deriveNetherSeed()`
 *                得到真正的幽冥种子（`凡间种子 ^ 0x4e455452`，理由见头注释）。
 *                所以 `world.seed !== seed`，这是**对的**，不是 bug。
 *                ⚠️ 与上界同一条陷阱：调用方**绝不要**先派生一次再传进来
 *                （异或自逆 → 幽冥种子退回凡间种子，且不报错）。
 * @returns {World} 幽冥 world 实例。地形已生成（含冥河）、类型与灵气已算，
 *                  **没有任何生灵**、没有宗门、没有灵脉、没有编年史。
 *                 `flow` 与 `owner` 恒为 0；`struct` 恒为 0（鬼修建筑是 8-D 的事）。
 */
export function generateNetherWorld({ preset = WORLD_PRESETS.medium, seed = 1 } = {}) {
  const netherSeed = deriveNetherSeed(seed);
  const world = new World(preset.w, preset.h, netherSeed);

  // 方案 B：字段照建，但显式归零（见 resetNetherSystems 的注释）
  resetNetherSystems(world);
  // 幽冥实例不该自称凡间——`World.js:206` 的默认值是 'mortal'。
  // 这一行不写的话，存档里幽冥那块会带着 `plane: 'mortal'`，
  // 将来任何按 `world.plane` 分流的代码都会把它当凡间处理，而且不会报错。
  world.plane = 'nether';

  const rootNoise = createNoise2D(netherSeed ^ K_ROOT);
  const warpNoise = createNoise2D(netherSeed ^ K_WARP);
  const climateNoise = createNoise2D(netherSeed ^ K_CLIMATE);
  const wasteNoise = createNoise2D(netherSeed ^ K_WASTE);

  // 顺序是承重的，别随手重排：
  //   1. 先有高程（黄泉地脉）
  //   2. 再刻冥河——它要读高程，才能把河谷压进地形里，并吐出距离场
  //   3. 气候 / 阴气 / 荒芜斑都**读距离场**（离冥河多远），所以必须在刻河之后
  //   4. 最后分类 + 算灵气：`classify` 读 height/water/temp/moist/over，
  //      四样都得先落好。
  buildNetherHeightField(world, rootNoise, warpNoise);
  const riverDist = carveNetherRivers(world, rootNoise);
  buildNetherClimate(world, climateNoise, riverDist);
  seedNetherYin(world, wasteNoise, riverDist);
  classifyNether(world);
  // `qi` 是推导量（铁律二），不进存档。用**凡间那套** `qiAt` 即可——
  // 幽冥没有自己的灵气公式（阴气走 `veg` 层，不是 `qi`），也没有灵脉。
  // 之所以要在这里算一次：读档侧 `restoreWorldState` 会调 `recomputeQi`，
  // 生成期不算的话，两条路径的 `qi` 层会不一致（而 `qi` 不进档，比不出来）。
  recomputeQi(world);

  // ⚠️ 这里**刻意不写编年史**（不调 `world.record`），也**不撒任何生灵**。
  // 幽冥的编年史话术是「幽墨初开」那一类，与凡间的「天地初开」不同；
  // 本轮不写任何条目，是为了让「幽冥的 chronicle 里没有混进凡间话术」
  // 这条判据有一个干净的基线（同 `worldgenUpper` 的做法）。
  // 鬼修是 8-D 的事，届时它的诞生才是第一条**事件**。

  return world;
}
