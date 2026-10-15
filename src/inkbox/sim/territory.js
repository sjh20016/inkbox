// 宗门地盘：地形感知的代价洪泛。
//
// 参考 Azgaar/Fantasy-Map-Generator 的 cultures-generator：
// 它生成文化区域时不是画圆，而是从起源点做「代价优先」的向外扩张——
// 进入一格的代价由地形与宜居度决定，于是文化边界自然顺着山川走。
//
// 为什么要换掉原来的圆：原来的领地是 `{x, y, radius}` 一个圆，
// 而灵脉都长在山巅石骨上、宗门却立在山下，实测两者相隔 32~67 格而半径只有 19~26，
// 于是六条灵脉永远无人认领——「灵脉是宗门争夺的对象」这套玩法等于不存在。
// 当时的补丁是「半径外扩 52 格够到就算」+「每门限两条」，
// 两个补丁都在治标：圆本来就不该是宗门的形状。
//
// 换成代价洪泛之后：
//   · 地盘顺着河谷长、被山脊挡住——「蜀道难」第一次在图上看得出来；
//   · 灵脉够不够得着，变成「翻过那道岭要花多少代价」，而不是一个魔法半径；
//   · 山门远在千里之外的门派，不会再莫名其妙地伸手过来抢。
//
// 地盘是**推导量**（由地形 + 宗门资产 + 门力算出），不进存档；
// 读档后重算一次即可，这样玩家改过的地形也能立刻反映到地盘的形状上。
//
// ⚠️ 也正因为是推导量，重算的**时机**必须是 `world.day` 的纯函数，
// 不能靠「上次重算是什么时候」这种计数器——否则「连续跑」与「存档再读档」
// 两条线会在不同的日子重算，而重算会带来收编村子、认领灵脉这些**真实的状态改动**，
// 分叉等价立刻就破了。见 crossedBoundary()。

import { TERRAIN_INFO } from '../core/config.js';
import { slopeAt } from '../world/terrain.js';

/** 地盘重算的周期（游戏日）。
 *
 * 代价洪泛是 O(格子数) 的，而 life.step 每秒要跑几十次——
 * 每 tick 都重算会把帧率吃光。地盘本来就变得慢（立宗是二十年一判），
 * 三十天一次绰绰有余。 */
export const TERRITORY_PERIOD_DAYS = 30;

/**
 * 这一 tick 是否跨过了重算周期的整倍数。
 *
 * 不用 `world.day % PERIOD === 0` 那种写法：dtDays 不固定，
 * 一次推进 3 天时正好踩得上，一次推进 40 天（快进）就整个跳过去了。
 * 也不用「记住上次重算的日子」——那需要进存档，否则读档后立刻多算一次，
 * 两条分叉的收编/认领结果就对不上了。
 *
 * 用「跨过边界」判断：只看 day 落在哪个周期里，纯函数，两侧永远一致。
 */
export function crossedBoundary(day, dtDays) {
  if (!(dtDays > 0)) return false;
  const now = Math.floor(day / TERRITORY_PERIOD_DAYS);
  const before = Math.floor((day - dtDays) / TERRITORY_PERIOD_DAYS);
  return now !== before;
}

/**
 * 进入一格的代价层。**单一公式**，不写表：
 *   不可通行（水域 / 山 / 峻岭 / 雪峰 / 熔岩）→ Infinity
 *   其余 → 1 / max(fertility, 0.05)
 *
 * 于是「芳甸」约 1.2、「草原」约 1.4，而「石」「荒漠」因为肥力只有 0.05，
 * 代价直接到 20——宗门会绕着石骨走，绕不过去才肯花这个钱。
 *
 * 再加两项修正：
 *   · 坡度：陡坡难守，`1 + min(2, slope * 15)`；
 *   · 河道：沿江设宗。`riverBase > 0` 的格子打七五折——
 *     这是这张图上第一次让「河」在政治地理里起作用。
 *
 * 一次重算只建一层（宗门之间共用）。**必须在所有洪泛之前建好**，
 * 别放进洪泛里按需重建：那样每个宗门都会重建一遍，白烧十倍时间。
 */
export function buildCostLayer(world) {
  const size = world.size;
  const costs = world._terrCost || (world._terrCost = new Float32Array(size));
  const slope = world._slopeCache && world._slopeCache.length === size
    ? world._slopeCache
    : (world._slopeCache = new Float32Array(size));
  for (let y = 0; y < world.h; y += 1) {
    for (let x = 0; x < world.w; x += 1) {
      slope[y * world.w + x] = slopeAt(world, x, y);
    }
  }
  for (let i = 0; i < size; i += 1) {
    const info = TERRAIN_INFO[world.type[i]];
    if (!info || !info.walk) { costs[i] = Infinity; continue; }
    let c = 1 / Math.max(info.fertility, 0.05);
    c *= 1 + Math.min(2, slope[i] * 15);
    if (world.riverBase[i] > 0) c *= 0.75;
    costs[i] = c;
  }
  return costs;
}

/**
 * 极简二叉堆。键存在外部数组里，堆里只放格子下标。
 *
 * 不用「每格算完就排序」那种写法：洪泛的推入次数是格子数的几倍，
 * 每次都排序会退化成 O(n² log n)。手写一个二十行的堆就够。
 *
 * ⚠️ 容量做成可增长的，是防一个**静默**隐患，不是为了修某个已见的 bug：
 * 一格被四个邻居各松弛一次，推入次数可以超过格子数，
 * 而 `Int32Array` 的越界写入**不报错、直接丢弃**——
 * `this.items[i] = v` 无效，`this.items[i]` 保持 0；
 * `pop` 里 `this.items[this.n]` 越界读出 `undefined`，写回 TypedArray 又变成 0。
 * 一旦发生，堆会退化成反复吐出格子 0，而**没有任何报错**。
 * 实测当前参数下没有触发（换成可增长堆之后结果逐位不变），
 * 但地形与预算都可能改，不值得赌。
 */
class MinHeap {
  constructor(capacity) {
    this.items = new Int32Array(Math.max(16, capacity));
    this.n = 0;
  }

  push(v, key) {
    if (this.n === this.items.length) {
      const grown = new Int32Array(this.items.length * 2);
      grown.set(this.items);
      this.items = grown;
    }
    let i = this.n;
    this.items[i] = v;
    this.n += 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (key[this.items[parent]] <= key[this.items[i]]) break;
      const tmp = this.items[parent];
      this.items[parent] = this.items[i];
      this.items[i] = tmp;
      i = parent;
    }
  }

  pop(key) {
    const top = this.items[0];
    this.n -= 1;
    if (this.n > 0) {
      this.items[0] = this.items[this.n];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < this.n && key[this.items[l]] < key[this.items[best]]) best = l;
        if (r < this.n && key[this.items[r]] < key[this.items[best]]) best = r;
        if (best === i) break;
        const tmp = this.items[best];
        this.items[best] = this.items[i];
        this.items[i] = tmp;
        i = best;
      }
    }
    return top;
  }
}

/** 洪泛用的临时缓冲：用「世代戳」代替每次清零，省掉 O(格子数) 的填充 */
function scratch(world) {
  if (!world._terrDist || world._terrDist.length !== world.size) {
    world._terrDist = new Float32Array(world.size);
    world._terrLabel = new Int16Array(world.size);
    world._terrStamp = new Int32Array(world.size);
    world._terrGen = 0;
    world._terrHeap = new MinHeap(world.size);
  }
  world._terrGen += 1;
  return world;
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * 多源带标签的代价洪泛——这是 Azgaar 那一套的核心。
 *
 * 所有宗门的种子**一起**投进同一个堆里。一格归谁，由「哪家的代价最小」决定，
 * 而不是「谁先被循环轮到」。这一点很要紧：按门派顺序依次涂抹的话，
 * 排在数组后面的门派天然占便宜，势力图会带上一层与地理无关的偏斜。
 *
 * @param seeds   [{ cell, label }]，label 用宗门 id（0 留给「无主」）
 * @param budgets 按 label 索引的预算表。**每家的预算可以不同**，
 *                所以不能像单源那样「一超标就 break 收摊」——
 *                得逐格问「这一格属于谁、那家的钱够不够」。
 */
export function growLabeled(world, seeds, budgets, costs) {
  scratch(world);
  const { w, h } = world;
  const dist = world._terrDist;
  const label = world._terrLabel;
  const stamp = world._terrStamp;
  const gen = world._terrGen;
  const heap = world._terrHeap;
  heap.n = 0;

  for (let k = 0; k < seeds.length; k += 1) {
    const cell = seeds[k].cell;
    if (cell < 0 || cell >= world.size) continue;
    // 同一格被两家当种子（山门与村子重合之类）：先到先得，保证确定性
    if (stamp[cell] === gen) continue;
    stamp[cell] = gen;
    dist[cell] = 0;
    label[cell] = seeds[k].label;
    heap.push(cell, dist);
  }

  let visited = 0;
  while (heap.n > 0) {
    const i = heap.pop(dist);
    // 惰性删除：堆里可能留着同一格子的旧副本
    if (stamp[i] !== gen) continue;
    const d = dist[i];
    const lb = label[i];
    const budget = Number.isFinite(budgets[lb]) ? budgets[lb] : 0;
    if (d > budget) continue;               // 这一家的钱花完了，不再往外走

    visited += 1;
    const x = i % w;
    const y = (i - x) / w;
    for (let dir = 0; dir < 4; dir += 1) {
      const nx = x + DIRS4[dir][0];
      const ny = y + DIRS4[dir][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      const c = costs[ni];
      if (!Number.isFinite(c)) continue;    // 水域与山脊：过不去
      const nd = d + c;
      if (nd > budget) continue;
      if (stamp[ni] === gen && dist[ni] <= nd) continue;
      stamp[ni] = gen;
      dist[ni] = nd;
      label[ni] = lb;
      heap.push(ni, dist);
    }
  }

  return { dist, label, stamp, gen, visited };
}

/** 单源（或同一预算的多个种子）洪泛。灵脉那一趟用它。 */
export function growTerritory(world, cells, maxBudget, costs) {
  const seeds = new Array(cells.length);
  for (let i = 0; i < cells.length; i += 1) seeds[i] = { cell: cells[i], label: 0 };
  const budgets = [maxBudget];
  return growLabeled(world, seeds, budgets, costs);
}

/** 把 [x, y] 夹到合法格号 */
function cellOf(world, x, y) {
  const cx = Math.max(0, Math.min(world.w - 1, Math.floor(x)));
  const cy = Math.max(0, Math.min(world.h - 1, Math.floor(y)));
  return cy * world.w + cx;
}

/** 山门位置：宗门立派处（capitalX/Y），没有就退而取名下村子的重心 */
export function sectSeat(world, sect) {
  if (Number.isFinite(sect.capitalX) && Number.isFinite(sect.capitalY)) {
    return [sect.capitalX, sect.capitalY];
  }
  let sx = 0; let sy = 0; let n = 0;
  for (let k = 0; k < sect.villages.length; k += 1) {
    const v = world.villageById(sect.villages[k]);
    if (!v) continue;
    sx += v.x; sy += v.y; n += 1;
  }
  return n ? [sx / n, sy / n] : [world.w / 2, world.h / 2];
}

/**
 * 宗门的「资产格」：山门 + 名下村子 + 已镇守的灵脉。
 *
 * 这三样既是地盘洪泛的种子，也是「派人去夺灵脉」的出发点——
 * 用同一份清单，免得两处对「这个门派到底在哪儿」有不同的理解。
 */
export function sectAssets(world, sect) {
  const cells = [];
  const [sx, sy] = sectSeat(world, sect);
  cells.push(cellOf(world, sx, sy));
  for (let k = 0; k < sect.villages.length; k += 1) {
    const v = world.villageById(sect.villages[k]);
    if (v) cells.push(cellOf(world, v.x, v.y));
  }
  for (let k = 0; k < sect.leylines.length; k += 1) {
    const l = world.leylineById(sect.leylines[k]);
    if (l) cells.push(cellOf(world, l.x, l.y));
  }
  return cells;
}

/** 只要山门与已镇守的灵脉——「据点」，不含名下村子 */
export function sectStrongholds(world, sect) {
  const cells = [];
  const [sx, sy] = sectSeat(world, sect);
  cells.push(cellOf(world, sx, sy));
  for (let k = 0; k < sect.leylines.length; k += 1) {
    const l = world.leylineById(sect.leylines[k]);
    if (l) cells.push(cellOf(world, l.x, l.y));
  }
  return cells;
}

/**
 * 势力范围预算。单位是**代价**（好地上约等于一格一价）。
 *
 * 标定：中堂 288×180 实测，可通行格 23305 个（占全图 45%），
 * 代价层 p25 1.47 / p50 1.72 / p75 5.8——中位数约 1.7，
 * 于是「预算 ÷ 1.7」大致就是地盘的**半径格数**。
 *
 * 70 + 门人 × 1.1（封顶 170）对应半径 30~55 格，与原来的圆（16~46）同量级。
 * 实测（200 年、10 家、种子只取山门与灵脉）：全图可通行面积的 59% 有主，
 * 最大一家占 28%——三四家体量相当的势力并立，外加几家小门派，
 * 剩下四成是**真正的无主之地**。全图涂满反而不好看：
 * 水墨画里那片留白就是「谁也不管的野地」，不该被势力色吃掉。
 */
export function coreBudget(sect) {
  return 70 + Math.min(100, Math.max(0, sect.pop || 0) * 1.1);
}

/** 伸手预算：能派人去多远夺灵脉。地盘是「日常管得着」，
 *  灵脉是「值得专门派一支队伍翻山过去」——所以它跟门力走得更陡。
 *
 * 标定：实测「宗门资产 → 灵脉山脚」的代价距离 p50 202 / p75 341 / max 763。
 * 取核心预算的两倍（约 140~340），刚好让大门派够得着三到五条灵脉、
 * 小门派够得着门口那一条——每条灵脉都有人争，又不至于被一家吃干。 */
export function reachBudget(sect) {
  return coreBudget(sect) * 2;
}

/** 一门至多镇守几道灵脉。门大守得多，但有上限，免得一家吃干。
 *
 * 底数 2 而不是 1：实测门派人口普遍很小（十家宗门里七家门人不足二十），
 * 按「每三十人加一条」算下来几乎人人只有一条名额，
 * 于是最近的那家被自己的名额挡住，六条灵脉里总有两条空置。 */
export function leylineAllowance(sect) {
  return Math.min(4, 2 + Math.floor(Math.max(0, sect.pop || 0) / 30));
}

/**
 * 灵脉的「山脚」：这条灵脉周围能站人的那一圈。
 *
 * ⚠️ 为什么需要这个概念——实测挖出来的硬事实：
 * 灵脉优先落在「峻岭 / 雪峰」上（高处的灵气最厚），
 * 而这两种地表 `walk: false`，且**四邻也全是不可通行**。
 * 也就是说：代价洪泛根本走不进灵脉那一格，连它的邻格都进不去。
 *
 * （补一句免得下次又猜错：`seedLeylines` 里那几档按地表打分的分支
 *   —— `PEAK/SNOW → 0.95`、`MOUNTAIN → 0.8`、`ROCK → 0.6`、河道 → 0.7 ——
 *   **至今是死代码**：它排在 `recomputeAll` 之前，那一刻 `world.type` 还是全 0，
 *   于是全部落进 `else score = 0.25 + height * 0.3`，灵脉其实是纯按高度落点的。
 *   现象碰巧一样（高处迟早被分类成峻岭），所以一直没被发现。
 *   修过一次、又**刻意回退**了：改落点会让整个政治层的调参作废
 *   （实测 800 年宗门 7 家 → 4 家、最大占地 60% → 67%）。详见 worldgen.js 的注释。）
 *
 * 所以「够不够得着一条灵脉」不能定义成「能不能走到灵脉格」——
 * 那个答案永远是「不能」。定义成「能不能走到它山脚下」才对：
 * 洪泛走到这一圈里的任意一格，就算把队伍派到了峰下，
 * 剩下的那段攀爬是修仙者的事，不是地图的事。
 *
 * 顺带一个好处：山脚那一圈多半是「石」（肥力 0.05 → 代价约 35），
 * 于是「翻过那道岭要花多少代价」第一次真的由地形说了算。
 */
export function leylineApproach(world, l) {
  const R = Math.ceil((l.radius || 7) + 8);
  const cx = Math.floor(l.x);
  const cy = Math.floor(l.y);
  const out = [];
  const r2 = R * R;
  for (let dy = -R; dy <= R; dy += 1) {
    const y = cy + dy;
    if (y < 0 || y >= world.h) continue;
    for (let dx = -R; dx <= R; dx += 1) {
      const x = cx + dx;
      if (x < 0 || x >= world.w) continue;
      if (dx * dx + dy * dy > r2) continue;
      const i = y * world.w + x;
      const info = TERRAIN_INFO[world.type[i]];
      if (!info || !info.walk) continue;
      out.push(i);
    }
  }
  return out;
}

/** 一次洪泛结果里，到某组格子的最小代价。够不着返回 Infinity。
 *
 * 导出是给**诊断**用的：长测要能分清「这条灵脉没人够得着」到底是
 * 「山脚与所有门派都不连通」还是「够得着但都超出预算」——
 * 分辨手法就是把预算放大到 1e9 再洪泛一次，看结果是不是还是 Infinity。
 * 这两件事的处置完全不同（前者该在生成侧修，后者是设计边界），
 * 长测要是只会写「无人够得着」，读的人分不出是哪一种。
 */
export function minDistTo(r, cells) {
  let best = Infinity;
  for (let k = 0; k < cells.length; k += 1) {
    const c = cells[k];
    if (r.stamp[c] === r.gen && r.dist[c] < best) best = r.dist[c];
  }
  return best;
}

/**
 * 地盘修订号。**必须是整个会话内全局单调的，不能是每个世界各自从零数。**
 *
 * 踩过的坑：渲染层拿 `world.terrRev` 当画布缓存键的一部分
 * （见 `render/unitsLayer.js` 的 `territoryCanvas`），
 * 而 `UnitsLayer` 实例在整个页面生命周期里只建一次——读档**不会**换掉它。
 * 如果修订号写成 `world.terrRev + 1`，那么读档时新 world 对象没有这个字段，
 * 于是从 0 重新数到 **1**；而「新建世界后的第一次重算」也正好是 **1**，
 * 两者的缓存键一模一样（`1|pad|seed|WxH`），渲染层就判成「地盘没变」，
 * **直接复用上一张画布**——而那多半是开天辟地时烘的空白画布。
 * 症状：读档后地盘整片不显示，要等下一次三十日边界重算才补上；
 * 若读档时正处于暂停，就一直空着。
 *
 * 所以用模块级计数：同一会话里任何一次重算都拿到一个没出现过的新号。
 */
let territoryRev = 0;

/**
 * 重算整个势力图。**纯计算，不改任何要进存档的东西**——
 * 只读地形、宗门、聚落、灵脉，返回结果由调用方决定怎么用。
 * 渲染层读档后可以直接调它把地盘画回来，不会因此改变模拟走向。
 *
 * @returns {{
 *   owner: Int16Array,                 按格归属（宗门 id，0 = 无主）
 *   area: Map<number, number>,         各宗门占地格数
 *   border: Map<string, number>,       两家之间的接壤格数（键 `${小}-${大}`）
 *   borderAt: Map<string, number>,     接壤处的一个代表格（用来起地名）
 *   claims: Map<number, number>,       灵脉 → 建议归属（0 = 无人）
 *   contested: Set<number>,            两家以上都够得着的灵脉 id（有得争的）
 *   reach: Map<number, number[]>,      诊断用：宗门 id → 每条灵脉的代价距离（够不着 = Infinity）
 *   costs: Float32Array,
 * }}
 */
export function computeTerritory(world) {
  const size = world.size;
  const sects = world.factions;
  const owner = world.territory && world.territory.length === size
    ? world.territory
    : (world.territory = new Int16Array(size));
  owner.fill(0);

  const area = new Map();
  const border = new Map();
  const borderAt = new Map();
  const claims = new Map();
  // 渲染层靠这个号判断地盘画布要不要重烘（见 render/unitsLayer.js）。
  // 地盘不进存档，所以它也不进——读档后重算一次就会拿到一个新号，画布跟着重画。
  // 注意是**模块级**计数，不是 `world.terrRev + 1`，理由见上面那段注释。
  world.terrRev = (territoryRev += 1);
  const empty = { owner, area, border, borderAt, claims, contested: new Set(), reach: new Map(), costs: null };
  if (!sects.length) return empty;

  const costs = buildCostLayer(world);

  // ── 第一趟：地盘 ──
  //
  // 种子只取「据点」：山门与已镇守的灵脉，**不含名下村子**。
  //
  // ⚠️ 这是个「听起来更自然、实测却更糟」的选择，值得写下来。
  // 把名下村子也当种子（「门派的人散布在各地，从最近的那处往外扩」）听着合理，
  // 但它和「村子被地盘收编」构成正反馈：村子多 → 种子多 → 地盘大 → 收编更多村子。
  // 实测 200 年下来，一家独占 53% 的已占地，其余九家挤在剩下的 47% 里。
  // 只取据点之后，地盘变成「从山门（与灵脉前哨）向外辐射」：
  // 最大一家降到 29%，总占地从 73% 降到 58%——**更均衡，留白也更多**。
  //
  // 这也更贴近 Azgaar 的原意：文化是从几个起源点长出来的，
  // 不是从每一座属下的村镇各长一次。
  const seeds = [];
  const budgets = [];
  for (let k = 0; k < sects.length; k += 1) {
    const s = sects[k];
    budgets[s.id] = coreBudget(s);
    const cells = sectStrongholds(world, s);
    for (let m = 0; m < cells.length; m += 1) seeds.push({ cell: cells[m], label: s.id });
  }
  const flood = growLabeled(world, seeds, budgets, costs);
  for (let i = 0; i < size; i += 1) {
    if (flood.stamp[i] !== flood.gen) continue;
    const lb = flood.label[i];
    owner[i] = lb;
    area.set(lb, (area.get(lb) || 0) + 1);
  }

  // ── 接壤统计 ──
  // 只算右、下两个方向，免得同一对邻居被数两遍。
  // 键用 `${小}-${大}` 排序，这样 (a,b) 与 (b,a) 落到同一个键上。
  for (let y = 0; y < world.h; y += 1) {
    for (let x = 0; x < world.w; x += 1) {
      const i = y * world.w + x;
      const a = owner[i];
      if (!a) continue;
      for (let dir = 0; dir < 2; dir += 1) {
        const nx = x + (dir === 0 ? 1 : 0);
        const ny = y + (dir === 0 ? 0 : 1);
        if (nx >= world.w || ny >= world.h) continue;
        const b = owner[ny * world.w + nx];
        if (!b || b === a) continue;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        border.set(key, (border.get(key) || 0) + 1);
        if (!borderAt.has(key)) borderAt.set(key, i);
      }
    }
  }

  // ── 第二趟：灵脉 ──
  //
  // 从每一家的资产出发单独洪泛一次（预算 = 伸手预算），
  // 再看能走到哪条灵脉的**山脚**（见 leylineApproach）。
  //
  // 为什么不把灵脉也塞进上面那个带标签的洪泛：那个只保留「最便宜的那一家」，
  // 而这里需要**每一家各自的距离**才能排出候选次序。
  const approaches = new Array(world.leylines.length);
  for (let i = 0; i < world.leylines.length; i += 1) {
    approaches[i] = leylineApproach(world, world.leylines[i]);
  }
  const reach = [];
  for (let k = 0; k < sects.length; k += 1) {
    const s = sects[k];
    const cells = sectAssets(world, s);
    const r = growTerritory(world, cells, reachBudget(s), costs);
    const mine = new Array(world.leylines.length);
    for (let i = 0; i < world.leylines.length; i += 1) mine[i] = minDistTo(r, approaches[i]);
    reach.push(mine);
  }

  // 「两家都够得着」的灵脉——也就是真正有得争的那些。
  //
  // ⚠️ 这东西原先根本不存在，而 stepConflicts 里那句
  // `a.leylines.some((id) => b.leylines.includes(id))` 恒为假：
  // 一条灵脉只有一个主人，两家的持有清单不可能有交集。
  // 于是「抢同一道灵脉会显著加剧敌意」这条规则**从来没生效过**——
  // 函数返回得干干净净，断言全绿，只是这半条玩法不存在。
  // 判据要落在「两家都伸得着」上，而不是「两家都持有」。
  const contested = new Set();
  for (let i = 0; i < world.leylines.length; i += 1) {
    let n = 0;
    for (let k = 0; k < sects.length; k += 1) if (Number.isFinite(reach[k][i])) n += 1;
    if (n >= 2) contested.add(world.leylines[i].id);
  }

  // 逐条灵脉挑主。**分两步走，顺序不能反。**
  //
  // 第一步：现主只要还够得着，就继续守着（并占掉自己一格名额）。
  // 第二步：剩下的（无主的 + 现主够不着的）按代价从近到远分给还有名额的门派。
  //
  // ⚠️ 为什么非要先处理现主：名额是从「本 tick 已分配数」算的，
  // 而现主已经持有一条，于是它一上来就被自己的名额挡住——
  // 结果是**每隔三十天丢一次灵脉、下一轮再抢回来**，编年史里反复出现
  // 「某某探得一道灵脉」，像卡带；而且实测让两条灵脉直接空置
  // （最近的那家被自己挡住，别人又太远）。
  const held = new Map();
  for (let k = 0; k < sects.length; k += 1) held.set(sects[k].id, 0);
  const settled = new Set();
  const indexOf = new Map();
  for (let k = 0; k < sects.length; k += 1) indexOf.set(sects[k].id, k);

  for (let i = 0; i < world.leylines.length; i += 1) {
    const l = world.leylines[i];
    if (!l.owner) continue;
    const k = indexOf.get(l.owner);
    if (k === undefined) continue;                 // 主家已散
    if (!Number.isFinite(reach[k][i])) continue;   // 够不着了，放手
    const s = sects[k];
    if ((held.get(s.id) || 0) >= leylineAllowance(s)) continue;
    held.set(s.id, (held.get(s.id) || 0) + 1);
    claims.set(l.id, s.id);
    settled.add(l.id);
  }

  for (let i = 0; i < world.leylines.length; i += 1) {
    const l = world.leylines[i];
    if (settled.has(l.id)) continue;
    const cand = [];
    for (let k = 0; k < sects.length; k += 1) {
      const d = reach[k][i];
      if (Number.isFinite(d)) cand.push({ id: sects[k].id, d });
    }
    cand.sort((a, b) => a.d - b.d);
    let picked = 0;
    for (let m = 0; m < cand.length; m += 1) {
      const s = world.factionById(cand[m].id);
      if (!s) continue;
      if ((held.get(s.id) || 0) >= leylineAllowance(s)) continue;
      picked = s.id;
      held.set(s.id, (held.get(s.id) || 0) + 1);
      break;
    }
    claims.set(l.id, picked);
  }

  // 诊断用：把「每家到每条灵脉的代价距离」也带出去（够不着 = Infinity）。
  //
  // 为什么值得多带一个字段：长测要能**自己说清**一条灵脉为什么空置。
  // 实测三个病因长得一模一样（都是「这条灵脉没主」），处置却完全不同：
  //   · 无人够得着（山脚与所有门派都不连通）→ 该在**生成**那一侧修，已修；
  //   · 够得着但都超出预算 → 地图尺度问题，不是 bug；
  //   · 够得着、但那一家名额满了 → 名额策略的结果。
  // 不把这个矩阵带出来，读长测的人只能看到一个「5/6」，分不出是哪一种。
  const reachById = new Map();
  for (let k = 0; k < sects.length; k += 1) reachById.set(sects[k].id, reach[k]);

  return { owner, area, border, borderAt, claims, contested, reach: reachById, costs };
}

export { cellOf, MinHeap };
