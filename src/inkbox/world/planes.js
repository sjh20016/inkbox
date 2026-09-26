// 水墨沙盒 · 三界运行时注册表
//
// 这一层解决的是「同一份代码要操作三个世界」时的寻址问题：视界渲染、
// 跨世界转移、长测读数都要先问一句「上界那张图在哪」。

import { SEA_LEVEL, SPECIES, SPECIES_INFO, TERRAIN_INFO } from '../core/config.js';
//
// ⚠️ **这个模块不进存档。** 它只是对三个 `World` 实例的引用（外加一个指向
// 凡间魂池的别名）。存档存的是每个 world 各自的序列化块；读档时先各自
// `deserializeWorld`，再把三个实例喂给 `createPlanes` 重建注册表。
// 把注册表本身存进存档，只会多出一份会过期的引用——而且是一份
// 「指向旧实例」的引用，那种错不会报错，只会让视界渲染到一个已经不动的世界上。
//
// ⚠️ **阶段一（上界地图能被看见）里 `createPlanes` 是 0 调用点。这是有意的，不是漏接线。**
// 理由：阶段一只有一个「第二世界」，`world.upper` 与 `main.js` 的 `this.upper` 缓存
// 已经够用；此时再造一个 `this.planes.upper.world`，只会让「上界那张图在哪」
// 变成**第三个真源**，而不是消除歧义。**加一层抽象不是免费的。**
//
// 所以本模块在阶段一的状态是：**只有测试读它** —— `scripts/inkbox-smoke.mjs` 里那组
// `createPlanes` 契约断言，钉住 `nether.souls === mortal.souls` 这个**引用相等**。
// 那不是「假读者」：契约一旦被破坏（比如有人把别名写成 `[...mortal.souls]` 的拷贝），
// 它会当场变红。这正是本项目要的那种读者。
//
// ⚠️ **接上它的那一刻，有一条必须同时做完的事**：`world.souls` 现在有 8 处读者
// （`reincarnation.js` 的 `enterNether` / `takeDueSoul` / `attachSoul`、
// `life.js:152` 的 spawn、`save.js` 的三处、`World.js:93` 的构造器）。
// 只要还有一处直接摸 `mortal.souls`，`nether.souls` 这个别名就是**装饰**——
// 将来魂真搬进幽冥 world 时，那一处会静默读到旧数组，
// 后果就是 `World.js:90-91` 点名的「读档后排队等转世的神魂凭空消失」。
// **接线与改道必须同一次做完，不能分两次。**

/**
 * 上界种子的派生键：ASCII 'UPPR'。
 *
 * 规格 §1.4 定的是这个常量，但**派生函数只能有一处**——散在 main.js 与
 * save.js 各写一遍 `seed ^ 0x55505052`，将来改键值时漏改一处，两张图会
 * 悄悄退回同一个随机流（后果见下面 `deriveUpperSeed`）。
 */
export const UPPER_SEED_KEY = 0x55505052;

/**
 * 幽冥种子的派生键：ASCII 'NETR'。
 *
 * ⚠️ **必须与 `UPPER_SEED_KEY` 不同**（这里取 0x4e455452，上界是 0x55505052）。
 * 复用上界那个会让两个位面**同种子**——而两个位面同种子**不报错**，
 * 只会让两张地形图「巧合地」一模一样（噪声同源、逐格相同），
 * 而「三界各有各的地形」正是用户点名要的效果。查这种错极难：
 * 图能画、不抛异常、也没有任何判据会红。
 *
 * 规格 §8.5 也点名了这条：幽冥的随机流「需要一个**不同的**派生常量」。
 */
export const NETHER_SEED_KEY = 0x4e455452;

/**
 * 上界实体 id 段的起点。
 *
 * 铁律三：每个 `World` 的 `nextEntityId` 都从 1 起。上界是独立 `World`，
 * 若也从 1 起编号，「两界实体 id 集合的交集为空」这条不变量从第一个
 * 飞升者落地就被打破——关系网、账本里任何拿 id 当键的地方都无法区分
 * 「凡间的 3 号」与「上界的 3 号」。所以上界一律从本常量起编。
 *
 * ⚠️ `nextEntityId` 本身进存档（`serializeWorld` 的凡间形状自带这个键），
 * 所以这个偏移只需要在**生成期**设置一次，读档会原样带回来。
 */
export const UPPER_ID_BASE = 1_000_000;

/**
 * 幽冥实体 id 段的起点。
 *
 * 与 `UPPER_ID_BASE` 同一条铁律三：每个 `World` 的 `nextEntityId` 都从 1 起，
 * 三界若各自从 1 编号，「三界实体 id 集合两两交集为空」这条不变量立刻被打破——
 * 关系网、账本里任何拿 id 当键的地方都无法区分「凡间的 3 号」「上界的 3 号」
 * 与「幽冥的 3 号」。
 *
 * ⚠️ 为什么幽冥**现在就**要一个 id 段（本轮 8-B 一个实体都不放）：
 * §8.9 裁决 8.2② 定了鬼修是**独立实体**、不从魂池就地升格——它们迟早要有 id。
 * 段位在**生成期**设一次（`worldgenNether.resetNetherSystems`）最省事：
 * `nextEntityId` 本身进存档，读档原样恢复，不需要在读档侧再补一次偏移。
 * 取 2e6 而不是「上界 + 1e6 的某个零头」：段与段之间留足空隙，
 * 免得将来哪位面自己的 id 涨到跨界。
 */
export const NETHER_ID_BASE = 2_000_000;

/**
 * 凡间种子 → 上界种子。**这是唯一的派生处。**
 *
 * 为什么两界不能用同一个 seed——这条不是洁癖，是一条实测得出来的坑：
 *
 * `Life` 构造时会 `this.warRng = mulberry32(((world.seed || 0) ^ 0x776172) >>> 0)`
 * （`src/inkbox/sim/life.js:124`）。**这个派生在 `Life` 内部写死，无法从外部覆盖**
 * ——`Life` 的构造函数只收 `(world, rng)`，`warRng` 一律从 `world.seed` 现推。
 * 于是如果上界与凡间共用同一个 seed，两张图的**战争随机流会完全相同**：
 * 两界的战事会在同一时刻、以同样的签数发生。那不是任何设计意图，
 * 只是「同一条流被抽了两次」。
 *
 * 派生成两个不同的 seed，是**唯一**能从外部把这条流掰开的手段。
 *
 * 用 `>>> 0` 把结果规范化成 uint32：`mulberry32` 自己也会 `>>> 0`，
 * 但存档里写进去的种子最好也是规范无符号数，免得读档时出现负数、
 * 再和其它按位运算混起来。
 */
export function deriveUpperSeed(mortalSeed) {
  return ((Number(mortalSeed) >>> 0) ^ UPPER_SEED_KEY) >>> 0;
}

/**
 * 凡间种子 → 幽冥种子。**这是唯一的派生处。**
 *
 * 与 `deriveUpperSeed` 逐字同形，只是异或常量换成 `NETHER_SEED_KEY`
 * （'NETR'，与上界的 'UPPR' **必须不同**——理由见那个常量的注释）。
 *
 * 同一条实测坑：`Life` 构造时
 * `this.warRng = mulberry32(((world.seed || 0) ^ 0x776172) >>> 0)`
 * （`src/inkbox/sim/life.js:124`，派生写死在构造函数里、外部覆盖不了）。
 * 三界若共用同一个 seed，三张图的战争随机流会**逐次抽签完全相同**。
 *
 * ⚠️ **本函数是异或，自逆。** 调用方（`worldgenNether` 的 `seed` 参数契约、
 * `io/save.js` 的两处降级分支）一律传**凡间**种子；先派生一次再传进去会
 * 让幽冥种子**恰好退回凡间种子**，而且不报错。与 `deriveUpperSeed` 那两处
 * 双重派生是同一类事故（`io/save.js` 的 `deserializeWorld` 注释里有完整记录）。
 */
export function deriveNetherSeed(mortalSeed) {
  return ((Number(mortalSeed) >>> 0) ^ NETHER_SEED_KEY) >>> 0;
}

/**
 * 建三界的运行时注册表。
 *
 * 结构照规格 §5.5：每个位面是 `{ key, world, souls }`。
 *
 * ⚠️ `nether.world` **允许是 `null`**。原先的理由是「幽冥地图排在阶段计划最后」，
 * 那条现在**部分**作废了：阶段 8-B 已实装地形生成（`worldgenNether.generateNetherWorld`），
 * 所以传一张**有地形的**幽冥图进来是合法的。但「有一张图」≠「幽冥在跑」——
 * **tick 与判据（8-C）还没有**，一张没有 tick、没有判据的空图正是规格 §5.5
 * 点名的「又一个静默坏死」。所以：传 `null` 合法；传一张图也合法，
 * 但**不许**把它当成「幽冥已实装」的依据。
 *
 * ⚠️ `mortal` 必须非空：下面要取 `mortal.souls`。
 */
export function createPlanes(mortal, upper, nether) {
  return {
    mortal: { key: 'mortal', world: mortal, souls: null },
    upper: { key: 'upper', world: upper, souls: null },
    // 幽冥：用户已定要做地图（规格 §8），但**「魂池」与「幽冥 world」是两样东西**：
    //   · 魂池 = 凡间的 `world.souls`（真实状态、进存档、上限 120，
    //     见 World.js:88-93「这是真实状态，不是推导量」）；
    //   · 幽冥 world = 一张同尺寸地图 + 鬼修实体 + 幽冥生态计数器（尚未落地）。
    // 注册表里两个都留：`world` 是本位面的地图（本轮 null），
    // `souls` 指向凡间那个真实魂池——**它不搬家**，只是在这里开一个别名。
    //
    // 为什么别名要开在这里、而不是让调用方继续摸 `mortal.souls`：
    // 规格 §5.5 第 1460-1466 行那条「不返工的关键」——`world.souls` 现在有 8 处
    // 读者（`reincarnation.js` 的 enterNether / takeDueSoul / attachSoul、
    // `life.js:152` 的 spawn、`save.js` 的三处、`World.js:93` 的构造器）。
    // 将来魂真搬进幽冥 world 时，只要调用方一律读 `planes.nether.souls`，
    // 就只需改注册表这一行；漏改任何一处直接摸 `mortal.souls` 的代码，
    // 后果是 `World.js:90-91` 点名的那条：「读档后排队等转世的神魂凭空消失」。
    nether: { key: 'nether', world: nether, souls: mortal.souls },
  };
}

/**
 * 跨世界转移的**唯一入口**。
 *
 * ⚠️ **本轮只留接口，未实装**——所以这里直接抛错，**不返回 `undefined`**。
 *
 * 为什么宁可抛错：这个项目最怕「函数返回得干干净净但什么也没做」
 * （`INKBOX.md:1517-1520`）。一个静默返回 `undefined` 的 `transfer`，
 * 会让「飞升者没到上界」和「到了但没记上」在长测里长得一模一样，
 * 而调用点看起来一切正常。抛错是响的。
 *
 * 为什么非要收成一个入口（规格 §5.5 第 1460-1466 行）：
 * 跨世界转移要同时维护三样东西——源世界的实体剔除、目标世界的 id 分配、
 * 以及两侧的累计账本（`arrivedLog` / `popLog`）。散成多个调用点写，
 * 漏一处就是「人在两界各有一份」或「人凭空消失」，而两者都不报错。
 * 所以下一阶段实装时，**实体移动、快照复制、账本记账三件事都在这一个函数里做**，
 * 调用方只描述「谁从哪儿到哪儿」（`payload`）。
 *
 * @param {object} planes  `createPlanes()` 的产物
 * @param {string} fromKey 源位面键（'mortal' | 'upper' | 'nether'）
 * @param {string} toKey   目标位面键
 * @param {object} payload 转移载荷。形状由下一阶段定（规格 §6.3 跨世界身份编码），
 *                         至少包含「搬谁」与「为什么搬」（飞升 / 裂缝漏物 / 夺舍）。
 */
export function transfer(planes, fromKey, toKey, payload) {
  throw new Error(
    `planes.transfer 尚未实装（${fromKey} → ${toKey}）。`
    + '本轮只留接口：跨世界转移的实体移动、快照复制、账本记账三件事'
    + '必须在这个函数里一起做，不许在调用点各写一份（规格 §5.5）。'
    + '若看到这个错误，说明有代码提前调用了它——先确认调用方属于哪一阶段。',
  );
}
/**
 * 上界实体 id 的落点判定：这一格能不能站人。
 *
 * 与 `worldgenUpper.js:299` / `:450` 同一套水域判据
 * （`water > 0.0015` 即云海，`height < SEA_LEVEL` 即云下虚空）——
 * **不要另写一套阈值**：落点判定与生成侧的「可通行」一旦分叉，
 * 飞升者会落进云海里站不住，而且不报错。
 */
export function upperWalkable(upper, i) {
  return upper.height[i] >= SEA_LEVEL && upper.water[i] <= 0.0015;
}

/**
 * 幽冥实体 id 的落点判定：这一格能不能站「东西」。
 *
 * 与 `worldgenNether.js` 的刻河（`water[i] > 0.0015` 即冥河水面）以及
 * `terrain.js` 的 `TERRAIN_INFO[type].walk` 是**同一套判据**——
 * **不要另写一套阈值**：落点判定与生成侧一旦分叉，鬼魂会落进冥河里站不住、
 * 漏下来的东西会掉进水面，而且**不报错**（同 `upperWalkable` 的纪律）。
 *
 * ── 为什么要有这个函数（2026-09-24 · D6-2 工程包 B）─────────────────
 * 在它出现之前，「幽冥能不能站人」这件事有**两份手抄的判据**：
 *   · `sim/netherLife.js` 的 `bankCandidates`（鬼魂落点）自己写了一对
 *     「先判水、再判 `TERRAIN_INFO.walk`」；
 *   · 而裂隙的位置过滤（`sim/rifts.js`）只认 `upperWalkable`——
 *     幽冥裂缝**没有**自己的判据可用，只能错用上界那一把尺子。
 * 于是「幽冥裂缝开在哪」这件事根本没有判据。这里把它收敛成**唯一一处**，
 * 两边都调它：形状只有一份定义，是结构上的保证，不是靠注释提醒。
 *
 * ⚠️ 与 `upperWalkable` 的差别：上界判「云海 / 云下虚空」（`height`/`water`），
 * 幽冥判「冥河水面 / 地表可通行」（`water`/`type`）。**两者不可互相顶替**——
 * 幽冥的 `height` 语义是黄泉地脉高程，拿上界那两条阈值判它会得到一张
 * 「哪儿都站不住」的图，而且不报错。
 *
 * @param {object} nether 幽冥 world（需要 `w` / `water` / `type`）
 * @param {number} i 格索引（`y * w + x`）
 * @returns {boolean} 这一格能不能站
 */
export function netherWalkable(nether, i) {
  const info = TERRAIN_INFO[nether.type[i]];
  // `!info` 兜底：`type` 是 Uint8Array，理论上恒是合法值，但手工构造的
  // 测试 world 可能塞进越界值——`undefined.walk` 会抛错，而不是静默判否。
  if (!info || !info.walk) return false;
  return nether.water[i] <= 0.0015;
}

/**
 * 给飞升者找落点：从最近的仙脉出发，螺旋外扩找第一处可通行格。
 *
 * **全程不抽随机流**（与 `rememberDead` 同一条纪律：账本与转移是纯函数，
 * 不扰动任何世界的随机序列）。找不到就退回地图中心——一张连中心都
 * 不可通行的上界地图本身就是生成器的 bug，会在别处先红。
 */
function findLandingTile(upper) {
  const { w, h } = upper;
  const anchors = (upper.leylines || [])
    .map((l) => ({ x: Math.floor(l.x), y: Math.floor(l.y) }))
    .filter((p) => p.x >= 0 && p.y >= 0 && p.x < w && p.y < h);
  const starts = anchors.length ? anchors : [{ x: w >> 1, y: h >> 1 }];
  for (const s of starts) {
    for (let r = 0; r < Math.max(w, h); r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = s.x + dx;
          const y = s.y + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          if (upperWalkable(upper, y * w + x)) return { x, y };
        }
      }
    }
  }
  return { x: w >> 1, y: h >> 1 };
}

/**
 * 上界人口账本（`upper.popLog`）的**唯一**形状定义与兜底。
 *
 * 七键的语义**互不重叠**：
 *   · `arrived`  —— 从凡间到达上界的累计人数（飞升 + 天雷飞升 + 被裂缝吸上来，三条通道都记）；
 *   · `born`     —— 上界**本土**出生的累计人数。⚠️ **只数「修士化生」**——
 *                   凡人繁衍另计 `bornMortal`（2026-09-19 阶段四拆开，理由见下）；
 *   · `bornMortal` —— **凡人繁衍**出生的累计人数。它是 `born` 的**兄弟**、不是子集：
 *                   两条生育路径各有各的触发器（化生看合体期修士，繁衍看凡人），
 *                   合成一个数会让「修士化生整个坏掉」被凡人出生静默顶绿；
 *   · `died`     —— 上界陨落的累计人数；
 *   · `seeded`   —— **开局**就有的（`seedUpperPopulation` 落 12 人）；
 *   · `sucked`   —— `arrived` 的**子集**：其中**被裂缝吸上来**的那部分；
 *   · `arrivedThunder` —— `arrived` 的**子集**：其中**经天雷飞升**上来的那部分。
 *
 * ⚠️ 为什么 `sucked` 是子集而不是「与 arrived 二选一」：长测与存读档等价测试里有一条
 * **人口守恒式** `entities === seeded + arrived + born − died`（`inkbox-longrun.mjs:912`、
 * `inkbox-save-equiv.mjs:1803`）。被裂缝吸上来的人**确实到达了上界**，若只记 `sucked`
 * 而不记 `arrived`，守恒式当场少算一截——而那条等式是全项目唯一能抓住「有人凭空
 * 出现 / 凭空消失」的判据。所以 `arrived` 照记，`sucked` 另开一栏只做**分类**。
 *
 * ⚠️ `arrivedThunder` 与 `sucked` 是**同一条纪律**：子集、只做分类、**不替代** `arrived`。
 * 天雷飞升者**确实到达了上界**，所以 `arrived` 照记。若哪天有人把它改成「与 `arrived`
 * 二选一」，上面那条人口守恒式会当场少算——而它是全项目唯一能抓住「有人凭空出现 /
 * 凭空消失」的判据。
 *
 * ⚠️⚠️ **为什么必须是唯一的一处兜底**：本函数现在管**七个**键，而「兜底建容器」的写法
 * 原先散在三处（本文件 + `upperLife.maybeBorn` + `upperLife.maybeFoundSects`）。
 * 这个项目踩过的坑是：漏改一处，某条路径跑过之后那个键就变 `undefined`，
 * 存读档等价测试会红在离改动很远的地方、极难查。所以本轮把三处内联字面量
 * **收敛成这一个函数**——「形状只有一处定义」是结构上的保证，不是靠注释提醒。
 *
 * ⚠️ 另一处**不是**兜底的创建点：`worldgenUpper.resetUpperSystems` 里另有一份字面量。
 * 那份必须与这里**同源**——`scripts/_upperlife2probe.mjs` 的 B 节逐键比对钉着这件事。
 * 只判 `!upper.popLog` 是不够的：`worldgenUpper` 造出来的 popLog **存在但可能缺键**，
 * 那句兜底不会触发，于是缺的那个键会一直是 `undefined`（`undefined + 1 = NaN`）。
 *
 * @returns {object} `upper.popLog`（保证七键齐全）
 */
export function ensureUpperPopLog(upper) {
  if (!upper.popLog) {
    upper.popLog = {
      arrived: 0, born: 0, bornMortal: 0, died: 0, seeded: 0, sucked: 0, arrivedThunder: 0,
    };
    return upper.popLog;
  }
  // 归一：补上缺的键（`worldgenUpper` 的四键 popLog、或老档里没有 sucked 的账本）。
  if (upper.popLog.sucked === undefined) upper.popLog.sucked = 0;
  if (upper.popLog.seeded === undefined) upper.popLog.seeded = 0;
  // ⚠️ `arrivedThunder` 是**天雷飞升**的独立计数（2026-09-19 阶段四新增）。
  // 为什么必须入档、不能现算：`World.recordAscension` 把 `world.ascended` 在**内存里**
  // 就截到 120 条（`World.js:422`）——名册会缩小，**缩小了的名册不能证明「从未发生」**。
  // 长测要判「天雷这条通道还活着」，只能靠一个只增不减的累计量。
  if (upper.popLog.arrivedThunder === undefined) upper.popLog.arrivedThunder = 0;
  // ⚠️ `bornMortal` 是**凡人生育**的独立计数（2026-09-19 阶段四新增）。
  // 为什么不和 `born` 合成一个数：`born` 的历史含义是「**修士化生**」，
  // 长测有一条判据专门守它（`上界有本土诞生（化生）`）。凡人进上界之后，
  // 若两者共用一个计数器，那条判据会被凡人出生**静默顶绿**——
  // 哪怕修士化生整个坏掉，只要凡人在生，判据照样通过。
  // 「一个字段被两件事共用」正是本项目最怕的静默坏法，所以显式拆开。
  if (upper.popLog.bornMortal === undefined) upper.popLog.bornMortal = 0;
  return upper.popLog;
}

/**
 * 上界**生态账本**的只读汇总（D6-2 工程包 E）：把 `popLog` 的七个计数归成一个
 * 「生 / 亡 / 现存」三元组，供三界面板与测试**共用同一口径**。
 *
 *   生   = `seeded + arrived + born + bornMortal`
 *          （开天播种 + 从凡间到达 + 修士化生 + 凡人生育——四种来源，合并成「生」）
 *   亡   = `died`
 *   现存 = `entities.length`
 *
 * 守恒式（**契约**）：`现存 === 生 − 亡`。smoke 5x 直接断言它——
 * 这条式子的价值在于「账平不平」一眼可见，而不用玩家自己去加七个数。
 *
 * ⚠️ **本函数是这四项相加的唯一处**：面板与测试都调它，别在别处再拼一遍
 *    （那就是第二份真相——`popLog` 将来加一个新来源时，只有一处会被更新）。
 * ⚠️ 纯读：不写世界、不抽 rng。面板每 2.5 秒调一次也不会让世界漂。
 * ⚠️ 与幽冥的 `netherEcoStats` 是**同款口径**，但**减项不同**：上界只有一条
 *    离开路径（`died`），幽冥有两条（消散 + 逐出）——那是两个世界的规则差别，
 *    不是口径不统一。
 */
export function upperEcoStats(upper) {
  if (!upper) return { born: 0, died: 0, alive: 0, conserved: true };
  const pop = ensureUpperPopLog(upper);
  const born = (pop.seeded || 0) + (pop.arrived || 0)
    + (pop.born || 0) + (pop.bornMortal || 0);
  const died = pop.died || 0;
  const alive = Array.isArray(upper.entities) ? upper.entities.length : 0;
  return { born, died, alive, conserved: alive === born - died };
}

/**
 * 阶段二：把一位凡间生灵**按快照**送进上界。
 *
 * ⚠️ **本函数同时服务两条转移通道**（这是本轮扩的）：
 *   ① **飞升**（`cultivation.ascend` → 这里）：来者必是修士（`ascend()` 要求
 *      `level >= 1 && root`），`level` 通常 50-60；
 *   ② **裂缝吸上来**（`rifts.leakToUpper` → 这里）：来者可能是**凡人**
 *      （`sp: 'human'` / `level: 0`）——用户已拍板「凡人也能在上界活着」。
 * 通道用第四参 `opts.via` 区分（见下），**不新增实体列**：上界要区分
 * 「吸上来的凡人」与「飞升上来的修士」，靠的是**现有字段** `sp` 与 `level`
 * （`sp === 'human'` / `level === 0` 就是凡人）。实体行是 62 列的定长数组，
 * 加一列会动存档格式，而 `io/save.js` 不在本轮的文件域里。
 *
 * 规格与铁律：
 * - 06 册 §〇 第 5 条「**跨世界转移只认快照，不认人**」——上界拿到的是
 *   一个独立副本，与凡间再无任何对象引用。凡间原体由调用方按既有的
 *   `_ascended` 流程从凡间剔除。
 * - 铁律三「会失效的实体引用须入册时解析成名字等快照」——`relations`
 *   的键是**凡间实体 id**，到上界全是悬垂引用，一律不带；
 *   `artifacts` 已被 `leaveArtifacts` 留在凡间，副本里清空。
 * - 账本三件事在同一处做（`transfer()` 的同款纪律，规格 §5.5）：
 *   实体落图、`popLog.arrived`、`arrivedLog`（存名字与境界等快照，不存引用）。
 *
 * ⚠️ 本函数是阶段二转移通道的落地，**不是** `transfer()` 的实装——
 * `transfer()` 的统一收敛（所有跨世界转移走一个入口）仍是阶段四的事。
 * 在那之前新开转移通道时，照这里的形状各写一个具名函数，别共用这个。
 *
 * 完全不抽随机流：落点确定性求解（见 `findLandingTile`）。凡人的寿元 / 血量
 * 兜底也**不抽签**（缺了就用 `SPECIES_INFO.human` 的基准值），理由同上。
 *
 * ⚠️ **关系 id 一律切断**（规格 §6.3 第 3 条「绝不把凡间 id 写进上界的任何字段」）：
 * `faction` / `clan` / `gen` / `village` 必须清零。它们不是「没用的残留」——
 * 上界始祖线 id 是 1..3、上界仙门 id 也从 1 起，凡间那套 id 也从 1 起，
 * 两段**同号**：留着 `clan=1` 会被 `clanById` 认成上界「顾氏」（静默错谱），
 * 留着 `faction=1` 会被 `UpperLife.stepSects` 算进别人的仙门，更会让
 * `maybeFoundSects` 的 `!e.faction` 过滤永远为假 → **飞升者永远开不了宗**。
 * `village` 在上界恒空（上界没有凡人聚落），留着就是悬垂引用。
 * 来历改用**名字快照**（`fromSect`），id 一个不留。
 *
 * @param {World} upper  上界 world（`generateUpperWorld` 或读档恢复的实例）
 * @param {object} entity 凡间实体（此刻仍挂在凡间 `world.entities` 上）
 * @param {World|null} [mortalWorld] 凡间 world。用来把 `entity.faction`
 *   解析成**宗门名字符串**（`fromSect`）——名字只能从凡间那侧的
 *   `factionById` 拿。允许 `null` / 缺省（手工构造的测试场景）：此时
 *   `fromSect = null`，**不抛错**。
 * @param {object} [opts] 通道选项。`opts.via`：`'ascend'`（缺省，寻常飞升）、
 *   `'thunder'`（**天雷飞升**，`stepThunderAscend` 通过后走的那条）或
 *   `'rift'`（裂缝吸上来）。缺省时**按来者自动判定**：凡人只可能被裂缝吸上来
 *   （`ascend()` 要求 `level >= 1 && root`），所以凡人缺省即 `'rift'`。
 *   计数（两者都是 `arrived` 的**子集**，不是替代项——理由见 `ensureUpperPopLog`）：
 *   · `'rift'`    → 额外把 `popLog.sucked` 加一；
 *   · `'thunder'` → 额外把 `popLog.arrivedThunder` 加一。
 *   ⚠️ 传 `'thunder'` 必须由 `ascend()` 的调用方**显式**给出：它没有任何可由
 *   `entity` 现算的特征（天雷飞升者的 level 在 40~59，与「玩家点化飞升」的
 *   50~59 完全重叠，且后者去的是福地、根本不进上界）。猜不出来，所以只能传进来。
 * @returns {object} 上界侧的副本实体
 */
export function arriveUpper(upper, entity, mortalWorld, opts = {}) {
  if (!upper || !entity) throw new Error('arriveUpper 需要 upper 与 entity 两个参数');
  if (upper.plane !== 'upper') {
    throw new Error(`arriveUpper 的目标必须是上界（plane=upper），收到 ${upper.plane}`);
  }
  // 账本容器兜底：形状与归一全部收敛在 `ensureUpperPopLog` 一处
  // （原先散在三处的内联字面量是「漏一处就埋雷」的源头，理由见那个函数）。
  const popLog = ensureUpperPopLog(upper);
  if (!Array.isArray(upper.arrivedLog)) upper.arrivedLog = [];

  // 来者是不是凡人：**只用现有字段判**，不加新列。
  // 判据刻意与 `cultivation.stepEntity` 的 level<=0 分支同构（非兽非精即凡人），
  // 两处若各自演化，「裂缝吸上来的凡人」与「stepCultivation 眼里的凡人」会分叉。
  const isMortal = (entity.level || 0) <= 0
    && entity.sp !== SPECIES.BEAST && entity.sp !== SPECIES.SPIRIT;
  const via = opts.via || (isMortal ? 'rift' : 'ascend');

  const copy = structuredClone(entity);
  // id 从上界段起编（UPPER_ID_BASE），与凡间天然不相交。
  if (!upper.nextEntityId || upper.nextEntityId < UPPER_ID_BASE) {
    upper.nextEntityId = UPPER_ID_BASE;
  }
  copy.id = upper.nextEntityId;
  upper.nextEntityId += 1;
  // 引用型字段一律切断（理由见上）：数组与 Map 浅克隆后仍指向凡间对象。
  copy.artifacts = [];
  copy.relations = new Map();
  // 凡间流程的临时剔除标记不是上界的状态。
  delete copy._ascended;
  // ── 关系 id 一律切断（规格 §6.3 第 3 条，理由见上）────────────
  // 凡间宗门 / 世家 id 与上界仙门 / 始祖线 id 同段，留着必撞号（静默错谱 /
  // 被算进别人门下 / 永不立派）。`village` 在上界恒空，留着是悬垂引用。
  copy.faction = 0;
  copy.clan = 0;
  copy.gen = 0;
  copy.village = 0;
  // ── 双亲两条 id 边也要切断（本轮补的，**不是**原先就有的）──────────
  // `parentA` / `parentB` 是**凡间实体 id**（`family.js:167`），到上界全是悬垂引用。
  // 它和 `faction` / `clan` 是同一条铁律三红线，但原先的切断清单里漏了它——
  // 之所以一直没炸：上界的实体 id 从 `UPPER_ID_BASE`(1e6) 起编，而凡间 id 很小，
  // 所以 `biography.js:950` 的 `findEntity(upper, 凡间id)` **查不到人**、只会显示
  // 「已故」，看起来像「父母早亡」而不是「指向了别人」。**不报错，所以一直没人发现。**
  // 新开的凡人通道（裂缝吸人）会把大量凡间人带上来，这条漏切会被放大成
  // 「上界凡人的父母栏全是陌生的已故者」。所以本轮一并补上。
  // ⚠️ 这是**对两条通道一起生效**的（飞升者同样带着凡间 parentA）——
  //    若将来上界真要跑 `stepFamily`（规格 §2.3.3 的世家线），那时要给它
  //    重新设计**上界自己的**世系 id，而不是把凡间这两条边放回来。
  copy.parentA = 0;
  copy.parentB = 0;
  // 来源快照：只存名字这类值，不存任何 id（铁律三）。
  copy.fromMortal = true;
  // 宗门名解析成**字符串**：从凡间那侧的 `factionById` 拿名字。
  // `mortalWorld` 缺省 / 该 id 查不到宗门 → null，**不抛错**。
  copy.fromSect = mortalWorld && typeof mortalWorld.factionById === 'function' && entity.faction
    ? (mortalWorld.factionById(entity.faction) || {}).name || null
    : null;
  // ⚠️ 原来这里存的是凡间 `entity.id`（裸数字，与上界同号）——必须去掉。
  delete copy.mortalId;

  // ── 凡人的字段体检：只补「缺了会让上界**静默坏死**」的三项 ──────────
  // `UpperLife.step()` 的陨落判据是 `hp <= 0 || age >= lifespan`（与凡间
  // `life.js:329` 逐字同源）。若 `lifespan` 是 `undefined`，`age >= undefined`
  // **恒为假**——那个凡人从此**老不死**，而且不报错、不 NaN，只是几百年后
  // 人口曲线与寿元设定悄悄对不上。飞升者身上这三项一定齐（`ascend()` 的前置
  // 就是修士），所以只对凡人做体检，且**不抽签**（用 `SPECIES_INFO.human`
  // 的基准值）。正常路径上凡间 `spawn()` 已经给全了，这里兜的是手工构造的
  // 测试场景与「将来某条新通道忘了带寿命」。
  if (isMortal) {
    const info = SPECIES_INFO[SPECIES.HUMAN];
    if (!(copy.lifespan > 0)) copy.lifespan = info.lifespan;
    if (!(copy.maxHp > 0)) copy.maxHp = info.hp;
    if (!(copy.hp > 0)) copy.hp = copy.maxHp;
  }

  const spot = findLandingTile(upper);
  copy.x = spot.x;
  copy.y = spot.y;

  upper.entities.push(copy);
  popLog.arrived += 1;
  // `sucked` / `arrivedThunder` 都是 `arrived` 的**子集**（理由见 `ensureUpperPopLog`）：
  // 被裂缝吸上来的人、经天雷飞升上来的人，**都确实到达了上界**，所以 `arrived`
  // 照记，这两栏只做**分类**。它们是**互斥**的（一条通道只记一栏），
  // 但都不与 `arrived` 并列——所以人口守恒式里只出现 `arrived`。
  if (via === 'rift') popLog.sucked += 1;
  else if (via === 'thunder') popLog.arrivedThunder += 1;
  // arrivedLog 是「谁来了」的名册：条目全是快照值，跨档可查、永不悬垂。
  // `fromKey` 用世界限定符字符串（§6.3 第 2 条允许），**不是**裸数字的凡间 id。
  //
  // `kind` 是本轮新加的键，**不是**冗余：`level === 0` 也能判出凡人，但
  // `level === 0` 同时涵盖「还没觉醒的凡间人」与「level 0 的灵兽 / 山精」，
  // 名册的读者（视界面板、长测）拿 `level` 反推就得自己再补一次物种判据——
  // 而那份判据与 `stepEntity` 里的分支迟早会分叉。写一个显式的 `kind`，
  // 读的人一眼就知道这一条是什么，不必重新推理。
  // ⚠️ **老档兜底**：本轮之前写下的 `arrivedLog` 条目**没有** `kind` 键。
  //    读侧的统一口径是 `entry.kind || (entry.level === 0 ? 'mortal' : 'cultivator')`
  //    ——本函数只负责写新条目，不改写老条目（改写历史名册是另一回事）。
  // `via` 同理：它记的是**通道**（飞升 / 裂缝），与 `kind`（物种）正交。
  upper.arrivedLog.push({
    day: upper.day,
    id: copy.id,
    fromKey: `mortal:${entity.id}`,
    name: entity.name,
    level: entity.level,
    kind: isMortal ? 'mortal' : 'cultivator',
    via,
    sect: copy.fromSect,
  });
  return copy;
}
