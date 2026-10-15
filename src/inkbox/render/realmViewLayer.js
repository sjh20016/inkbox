// 水墨沙盒 · 视界的绘制层 —— D8-B 从 `main.js` 拔出来
//
// ───────────────────────────────────────────────────────────────────────
// 这个模块负责什么
// ───────────────────────────────────────────────────────────────────────
//
// 「把另一界裁一块出来贴上去」的全部 Canvas 操作都在这里：
//   · 按选区自由多边形 `ctx.clip()`；
//   · 贴目标界的地形位图（低频重绘）；
//   · 画凡间的裂缝（缝是两界的接缝，本来就长在凡间）；
//   · 画目标界的人与宗门；
//   · 画目标界的短命特效（D8-C：`presentationStage` 按位面分发过来）；
//   · 视界边缘的「裂缝」虚线框；拖拽中的虚线预览。
//
// ⚠️ **本模块不许 import `sim/*`**（`npm run test:view` 钉它）。
//    它只被喂「已经算好的数据」：相机、单位图层、凡间世界、选区、位面描述。
//    这条不是洁癖——「视界不许改世界」是契约（`VIEW_CONTRACT.md` V6），
//    而**够不到 sim 就不可能调它**，比任何注释都硬。
// ⚠️ 本模块**不抽 RNG**：抖动 / 呼吸全走确定性三角函数（吃真实秒 `now`）。
//
// 纯状态与几何（选区命中、窗内鬼魂计数）在 `ui/realmView.js`。

/**
 * 另一界（上界 / 幽冥）地形位图的最短重绘间隔（秒）。
 *
 * 视界的贴图走「全量渲染到离屏 canvas，再裁剪贴出」（规格 §3.4 的 C2 方案，
 * 不改 terrainLayer.js）。`TerrainLayer.render()` 是**全量**的——它遍历整张
 * `w×h` 并逐像素写 ImageData。若每帧都重绘另一界，地形成本直接翻倍。
 *
 * 但另一界地形**变化极慢**（不跑水文/生态，只有玩家工具会改），所以把它的重绘
 * 摊薄到 0.2 秒一档：视界里的云/浪会略顿，但这是 C2 方案下唯一能控成本的地方。
 * ⚠️ 这个数是**实测标定**的（见交付报告里的 FPS 读数），不要凭感觉改小。
 * ⚠️ 旧名 `UPPER_RENDER_PERIOD`（名字里的 `UPPER` 是历史遗留：视界起初只能看上界）。
 *    现在上界与幽冥两个图层**各自**按它节流，互不影响（各自的 `TerrainLayer.lastRender`）。
 */
export const REALM_RENDER_PERIOD = 0.2;

/**
 * 视界「位面画像」：**这一界在窗里该被画成什么样**（D8-D）。
 *
 * 视界窗原先把「另一界」当成**一种东西**画（地形 + 缝 + 人 + 宗门）。但上界与幽冥
 * 存在的东西并不一样：上界有宗门大殿、有法宝、没有鬼；幽冥有鬼魂 / 鬼修 / 幽冥法宝 /
 * 阴气，**没有宗门**（`worldgenNether` 不填 `factions`）。同一套「全画一遍」要么在
 * 幽冥印出空转的宗门层，要么让 D6-3 C 包落地的**幽冥物品**彻底不可见。
 *
 * 于是把「画什么」抽成一张**按位面查的表**——`drawRealmView` 只读它决定调哪几个
 * `draw*`。加第三界时在这里补一行即可，不必再去 `drawRealmView` 里塞分支。
 *
 * ⚠️ 这张表**只决定「画不画」**，不决定「怎么画」，也**不携带任何生态数值**
 *    （D8-D 硬约束：本包只读，不改幽冥生态）。数值一律走 `sim/*`，不走这里。
 * ⚠️ `territory` / `villages` 在表里**根本没有**——它们从来就不在窗里画
 *    （`drawTerritory` 的离屏画布是单槽缓存、键含 `world.seed`，会被凡间主图每帧
 *    覆盖 ⇒ 窗里再调一次就是每帧重烘两遍，见 `drawRealmView` 的注释）。
 *    所以「幽冥 territory ❌ / villages ❌」是**结构性成立**的，不靠一个开关。
 */
export const REALM_VIEW_PROFILE = Object.freeze({
  upper: Object.freeze({
    rifts: true,            // 缝开在凡间，两界都看得见（窗内补全被裁掉的那半圈）
    sects: true,            // 上界有宗门大殿（`upper.factions` 非空）
    entities: true,         // 上界的人
    groundArtifacts: true,  // 上界也躺得住法宝（缝漏上去的）
    yinWash: false,         // 上界的 `veg` 是**植被**，不是阴气
  }),
  nether: Object.freeze({
    rifts: true,
    sects: false,           // 幽冥没有宗门（`factions` 恒空）——不是「空转」，是**不画**
    entities: true,         // 鬼魂 + 鬼修（`nether.entities` 非空）
    groundArtifacts: true,  // 幽冥物品（D6-3 C 包起是真实系统）
    yinWash: true,          // 幽冥的 `veg` 是**阴气**（离冥河越近越浓）
  }),
});

/**
 * 地面法宝的记号在**放大到这个倍率以上**才出现（D8-D）。
 *
 * 「别画成 RPG 掉落宝箱」——它是一个极小的墨点 + 一圈冷光，远景本就不该看见。
 * 与 `drawSites`（`zoom < 1.6` 不画）同档，视觉语言一致。
 */
export const ARTIFACT_MARK_MIN_ZOOM = 1.6;

/** 阴气雾墨的采样步长（格）。越大越省，越小越连续。 */
const YIN_STEP = 6;
/** 单团雾墨的半径（格）。 */
const YIN_RADIUS = 7;
/** 阴气低于此值不铺雾（荒芜处留白，免得把整片地都涂暗）。 */
const YIN_THRESHOLD = 0.32;
/** 雾墨浓淡增益：`alpha = min(YIN_MAX_ALPHA, (veg − 阈值) × 增益)`。 */
const YIN_GAIN = 0.18;
const YIN_MAX_ALPHA = 0.12;
/**
 * 每帧最多铺多少团雾（性能闸）。
 * 只统计**真的铺出去**的那些（`veg` 过阈值的），所以冥河窄带之外的荒芜不占额度。
 * 窗最大占全图 40%，最坏情况（一条横贯全图的窄带窗）也在闸内。
 */
const YIN_BUDGET = 1400;

/**
 * 画中画：在划选区域里贴出**另一界**（上界 / 幽冥）的对应区域（规格 §3.4 的 C2 方案）。
 *
 * 做法是「全量渲染到那一界自己的离屏 canvas，再裁剪贴出」——**不改 terrainLayer.js**。
 * 两个 canvas 同尺寸、同 pad、同 reliefScale，所以凡间 (x,y) 与那一界 (x,y)
 * 是同一个坐标；视界里贴的必须正是**同一块坐标区域**，这是「裂缝漏物落在同一个位置」
 * 的依据（规格 §3.4 第 3 条）。
 *
 * `plane` 由 `main.js` 的 `viewPlane()` 给出（`{ plane, world, terrain, label, clearDirty }`）
 * ——上界与幽冥共用**同一段**裁剪 / 贴图 / 边框逻辑，唯一的分流就是「贴哪张地形、
 * 画哪一界的人与宗门」。
 *
 * ⚠️ **口径更新（2026-09-23）**：这里原先写着「幽冥没有实体（`nether.entities` 为空），
 *    那两行 draw* 自然是空转」。**那句话现在过期了**——8-C/8-D 已落地，
 *    `enterNether` 会在幽冥生成鬼魂与鬼修（`sim/netherLife.js`），
 *    所以 `drawSects` / `drawEntities` 在幽冥这一支是**真的在画东西**。
 *    ⇒ 别再把它当「空转的占位行」删掉或跳过。
 *
 * ⚠️ 裁剪用的是**屏幕多边形路径 + `ctx.clip()`**（自由形状划选），**不是**
 *    `drawImage` 的 `sourceRect`。原因：立体视图下每一格的落笔行是
 *    `y + pad - round(高程 × reliefScale)`，**行号随各自的高程变**，所以
 *    「一块坐标区域」在 canvas 里并不是一块规整的矩形——sourceRect 在立体
 *    视图下会取错一块。clip 则总是裁出屏幕上那片形状。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} cam          相机（`toScreenX/Y`）
 * @param {object} units        单位图层（`drawRifts` / `drawSects` / `drawEntities`）
 * @param {object} mortalWorld  **凡间**世界（裂缝长在凡间）
 * @param {object} sel          选区（`path` / `x0..y1`）
 * @param {object} plane        `viewPlane()` 的产物
 * @param {number} now          真实秒（驱动边框呼吸）
 * @param {object} [stage]      多位面表现舞台（D8-C）。只要求有 `drawPlane` 方法
 *                              （鸭子类型 ⇒ 本模块**不必** import 它，保持零 import）。
 *                              缺失时跳过窗内特效——纯防御，不抛。
 */
export function drawRealmView(ctx, cam, units, mortalWorld, sel, plane, now, stage) {
  const terrain = plane && plane.terrain;
  const viewWorld = plane && plane.world;
  if (!sel || !terrain || !viewWorld) return;

  // 另一界地形低频重绘：全量 render 很贵，而它变化极慢（不跑水文/生态）。
  // ⚠️ `upperDirty` / `netherDirty` 这一轮**刻意不作为重绘的触发条件**
  //    （它们只被置位、不被读）：高倍速下每 0.167 秒就跨一次「10 游戏日」边界
  //    （baseDaysPerSecond 3 × 最高 20 倍 = 60 日/秒），若让脏标记绕过节流，
  //    就等于每帧全量重绘那一界，成本直接翻倍——而那正是这条节流要防的事。
  // ⚠️ 两个图层**各自**有 `lastRender`，所以上界与幽冥各按各的节拍重绘，
  //    互相不会把对方的节流打乱。
  if (now - terrain.lastRender > REALM_RENDER_PERIOD) {
    terrain.render(now, true);
    plane.clearDirty();
  }

  const zoom = cam.zoom;
  const originX = cam.toScreenX(0);
  const originY = cam.toScreenY(-terrain.pad);
  // 选区的屏幕**包围盒**：用「零抬升」的映射（canvas 行 = y + pad）。
  // 平面视图下这**严格**对位；立体视图下窗口边界落在零抬升基线上，
  // 窗内仍是那一界的地形（只是边界与那一界自身的抬升不完全贴合，见方法注释）。
  // ⚠️ 路径顶点也走**同一个** `toScreenX/Y` 映射（见下面的 clip），
  //    绝不另引入高程偏移——否则形状会相对那一界地形整体错位。
  const sx0 = cam.toScreenX(sel.x0);
  const sy0 = cam.toScreenY(sel.y0);
  const sw = cam.toScreenX(sel.x1 + 1) - sx0;
  const sh = cam.toScreenY(sel.y1 + 1) - sy0;
  if (sw <= 0 || sh <= 0) return;

  ctx.save();
  ctx.beginPath();
  // 自由形状：按 `path` 走线裁窗。`path` 不存在时退回矩形（防御性——
  // 老形状 / 注入的旧对象不该把这一帧炸掉）。
  if (sel.path && sel.path.length >= 3) {
    ctx.moveTo(cam.toScreenX(sel.path[0][0]), cam.toScreenY(sel.path[0][1]));
    for (let i = 1; i < sel.path.length; i += 1) {
      ctx.lineTo(cam.toScreenX(sel.path[i][0]), cam.toScreenY(sel.path[i][1]));
    }
    ctx.closePath();
  } else {
    ctx.rect(sx0, sy0, sw, sh);
  }
  ctx.clip();
  ctx.drawImage(
    terrain.canvas,
    0, 0, terrain.canvas.width, terrain.canvas.height,
    originX, originY,
    terrain.canvas.width * zoom, terrain.canvas.height * zoom,
  );

  // ── 那一界的人与宗门（2026-09-23 接线）──────────────────────────────
  // 在这之前窗里**只有地形**：上界明明在跑（`upperLife.step`）、有实体、有宗门
  // （`upper.entities` / `upper.factions`），玩家却一个都看不见
  // ——「系统在跑、但没人看得见」正是 D4 要治的病，只是这次犯在上界。
  //
  // 复用**同一个** `UnitsLayer`：它的 draw* 全部以 `world` 为参数
  // （`render/unitsLayer.js` 的 `drawSects` / `drawEntities`），
  // 构造函数里没有任何绑定凡间的实例状态，所以把 `world` 换成 `plane.world`
  // 即可，**不需要新渲染器、不需要新图层类**。
  // ⚠️ **口径更新（2026-09-23，8-C/8-D 已落地）**：这条注释原先写着「幽冥这一侧
  //    `entities` / `factions` 都是空数组，所以这两行对幽冥是**空转**」——**已过期**。
  //    现在 `nether.entities` 里**真的有鬼魂与鬼修**（`enterNether` 生成），
  //    所以 `drawEntities` 在幽冥这一支**真的在画东西**。
  //    `factions` 仍恒空（`worldgenNether` 不填）⇒ `drawSects` 对幽冥仍是空转，
  //    但它与 `drawEntities` 共用同一次调用，留着无害。
  //
  // ⚠️ 这里**刻意不调** `drawTerritory`：它的离屏画布是**单槽缓存**、
  //    缓存键含 `world.seed`。凡间主图每帧调一次、窗里再按另一界调一次
  //    ⇒ 两边的键每帧互相覆盖 ⇒ **每帧重烘 5 万格两遍**（已记 BACKLOG）。
  //
  // ⚠️ 实体是**直接画到主 ctx** 的，不受 `REALM_RENDER_PERIOD` 节流影响
  //    （那个节流只管上面那张地形位图）。所以那一界的人一动，窗里当帧就动。
  //
  // ── 凡间的裂缝（2026-09-23 补）────────────────────────────────
  // 裂缝**开在划选区域的边界格上**，而本窗口把整个选区裁住 ⇒ 主渲染链里那次
  // `drawRifts` 画的缝，**落在窗内那一半被窗口盖掉**，玩家只看得见框外半圈。
  // 修法是**加法**：在窗内再画一次凡间的缝。窗外那半仍由主链那次负责，
  // **两次合起来才是一道完整的缝** ⇒ **不要删掉主链那次调用、也不要移动它**
  // （移了会连带动到标签/光晕的叠层次序）。
  //
  // 传 **凡间世界**而不是 `viewWorld`：缝是凡间与另一界的接缝，本来就长在凡间。
  // 放在地形之上、人之下，视觉上像「缝从地底裂出来」。
  // ── 位面画像：这一界在窗里该画什么（D8-D）──────────────────────────
  // `plane.plane` 是 `'upper'` / `'nether'`（由 `main.js` 的 `viewPlane()` 给出）。
  // 查表决定「画不画宗门 / 地面法宝 / 阴气」——加第三界只需补一行表，不必改这里。
  const profile = REALM_VIEW_PROFILE[plane.plane] || REALM_VIEW_PROFILE.upper;

  // 幽冥阴气：把已有的 `veg`（阴气 / 荒芜）在窗里**轻轻加深一点**（只读）。
  // 画在地形之上、一切「立在地上」的东西之下——它是**环境**，不是物件。
  if (profile.yinWash) drawRealmYin(ctx, cam, viewWorld, sel);

  // 层次由下到上：地面（缝 / 法宝）→ 立在地上的（宗门 / 人）。
  // 缝**开在凡间**，所以永远传 `mortalWorld`（见上方注释）；窗内补的那半圈
  // 与主链那半圈合起来才是一道完整的缝。
  if (profile.rifts) units.drawRifts(ctx, cam, mortalWorld, now);
  // 地面法宝躺在地上 ⇒ 画在宗门 / 人之下（人踩在东西上才自然）。
  if (profile.groundArtifacts) drawGroundArtifacts(ctx, cam, viewWorld);
  if (profile.sects) units.drawSects(ctx, cam, viewWorld);
  if (profile.entities) units.drawEntities(ctx, cam, viewWorld, now);
  // ── 目标界的短命特效（D8-C）──────────────────────────────────
  // 视界是「活着的窗」：那一界此刻正在发生的事（渡劫雷 / 开缝 / 夺舍…）要在
  // 窗里演出来。**只画目标界那一份**——舞台按 `plane` 过滤（三界不串），
  // 而且已经被上面的 `ctx.clip()` 裁住（窗外的特效不会漏出来）。
  // ⚠️ 传 `plane.plane`（`'upper'` / `'nether'`）与 `viewWorld`（投影要用**目标界**
  //    的地形高度）。凡间那一份由主渲染链在窗外画（见 `main.js`）。
  // ⚠️ 画在**实体之上、`ctx.restore()` 之前**：特效属于「此刻的舞台效果」，
  //    压在人与宗门上才读得出来；`restore()` 之后裁剪就没了。
  if (stage && typeof stage.drawPlane === 'function' && plane && plane.plane) {
    stage.drawPlane(plane.plane, ctx, cam, viewWorld);
  }
  ctx.restore();

  drawRiftBorder(ctx, cam, sel, now);
}

/**
 * 确定性散列（0..1）：同一个 id 每帧拿到同一个数（D8-D）。
 *
 * 用途**只是**「同 tier 的两件法宝别长得一模一样」的微差，**不是随机源**。
 * ⚠️ 与 `render/unitsLayer.js` 的 `riftNoise` 同款手法：本项目「拿哈希当均匀数
 *    必须先过 finalizer」的纪律——直接用 FNV-1a 的高位有偏置（见 BACKLOG P3）。
 */
function markNoise(id, k) {
  let x = (Math.imul((id | 0) + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k | 0, 0xc2b2ae35)) | 0;
  x = Math.imul(x ^ (x >>> 13), 0x27d4eb2f);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/**
 * 地面法宝：一件**极小**的墨点 + 一圈冷光（D8-D）。
 *
 * 为什么需要它：D6-3 C 包之后，幽冥物品（`nether.artifacts`）已经是**真实系统**
 * ——它会自生、会随缝漏进凡间、会被凡人捡走。但地图上**一个都看不见**：
 * `drawEntities` 只画 `entities`，而法宝不在里面。于是玩家读到「幽冥有物品」这句
 * 话，却永远看不到一件。这一包把它画出来（上界的法宝同理）。
 *
 * ⚠️ **不是 RPG 掉落宝箱**：没有箱子图标、没有高亮光柱、没有彩色描边。只有一个
 *    墨点 + 一圈很淡的冷光——放大（`ARTIFACT_MARK_MIN_ZOOM` 以上）才认得出。
 *    tier 越高，冷光越亮、核心多一枚金点。
 * ⚠️ **零 RNG**：形状 / 半径的微差由 `markNoise(id)` 派生（同 id 每帧一样）。
 *    绝不 `Math.random()`——那会让同种子两次运行画得不一样（本项目铁律一）。
 * ⚠️ **只读**：只读 `world.artifacts` / `world.height` / `world.idx` / `w` / `h`，
 *    一个字都不写回世界（视界不许改世界，契约 V6）。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} cam   相机（`zoom` / `visibleRect` / `tileScreen`）
 * @param {object} world 目标界世界（上界或幽冥）——**只读**
 */
export function drawGroundArtifacts(ctx, cam, world) {
  const list = world && world.artifacts;
  if (!list || !list.length) return;
  if (cam.zoom < ARTIFACT_MARK_MIN_ZOOM) return;   // 放大后才显
  const rect = cam.visibleRect(world);
  const zoom = cam.zoom;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;
    const tx = Math.floor(a.x);
    const ty = Math.floor(a.y);
    if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) continue;
    if (tx < rect.x0 - 1 || tx > rect.x1 + 1 || ty < rect.y0 - 1 || ty > rect.y1 + 1) continue;
    // 投影走相机的 `tileScreen`（= 高程抬升版），与人与宗门同口径，法宝才贴地。
    const [sx, sy] = cam.tileScreen(a.x, a.y, world.height[world.idx(tx, ty)]);
    drawArtifactMark(ctx, sx, sy, a, zoom);
  }
  ctx.restore();
}

/** 一枚法宝记号：冷光晕 + 墨点核心（tier ≥ 4 再点一枚金心）。 */
function drawArtifactMark(ctx, sx, sy, a, zoom) {
  const tier = Math.max(1, Math.min(6, a.tier || 1));
  const jitter = markNoise(a.id || 0, 7);
  const r = Math.max(1, zoom * (0.42 + tier * 0.045));
  // 冷光晕：上界法宝与幽冥物品都偏冷（青灰），与水墨底色相容
  ctx.strokeStyle = `rgba(96,150,168,${(0.14 + tier * 0.05).toFixed(3)})`;
  ctx.lineWidth = Math.max(0.7, zoom * 0.13);
  ctx.beginPath();
  ctx.arc(sx, sy, r * (1.5 + jitter * 0.6), 0, Math.PI * 2);
  ctx.stroke();
  // 墨点核心：这是「地上有件东西」的主体
  ctx.fillStyle = 'rgba(34,32,28,0.6)';
  ctx.beginPath();
  ctx.arc(sx, sy, Math.max(0.55, r * 0.5), 0, Math.PI * 2);
  ctx.fill();
  // 高阶：一点金心（与宗门匾额同色系，读作「好东西」）
  if (tier >= 4) {
    ctx.fillStyle = 'rgba(200,164,78,0.8)';
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(0.45, r * 0.22), 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 幽冥阴气：把已有的 `veg`（阴气 / 荒芜）在窗里**轻轻加深一点**（D8-D）。
 *
 * ⚠️ **不加彩色 heatmap**——那会把水墨画毁掉。做法是「局部雾墨」：只在 `veg`
 *    已经很高的地方叠一团**很低 alpha 的冷墨**。`veg` 在幽冥本就是「离冥河越近
 *    越浓」（`worldgenNether.js` 的 `seedNetherYin`），所以雾自然聚在冥河两岸
 *    ——正是规格 §D8-D 要的「靠近冥河更浓」。
 * ⚠️ **只读**：只读 `world.veg` / `world.height`；**不改任何生态数值**（本包硬约束）。
 *    「增强」指的是**画面上多一层墨**，不是改 `veg` 本身。
 * ⚠️ 逐帧铺雾有成本，所以：① 只扫「选区包围盒 ∩ 可见矩形」；② 按 `YIN_STEP` 跳格
 *    采样；③ `YIN_BUDGET` 封顶。窗最大占全图 40%，最坏情况也在闸内。
 * ⚠️ 零 RNG：每团雾落在**格坐标**上，半径是常数，浓淡由 `veg` 决定。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} cam   相机（`zoom` / `visibleRect` / `tileScreen`）
 * @param {object} world 幽冥世界（只读）
 * @param {object} sel   选区（用它的包围盒界定扫描范围）
 */
export function drawRealmYin(ctx, cam, world, sel) {
  const veg = world && world.veg;
  if (!veg || !sel) return;
  const rect = cam.visibleRect(world);
  const x0 = Math.max(rect.x0, Math.floor(sel.x0));
  const x1 = Math.min(rect.x1, Math.ceil(sel.x1));
  const y0 = Math.max(rect.y0, Math.floor(sel.y0));
  const y1 = Math.min(rect.y1, Math.ceil(sel.y1));
  if (x1 < x0 || y1 < y0) return;
  const zoom = cam.zoom;
  const radius = Math.max(2, zoom * YIN_RADIUS);
  let budget = YIN_BUDGET;
  ctx.save();
  for (let y = y0; y <= y1; y += YIN_STEP) {
    for (let x = x0; x <= x1; x += YIN_STEP) {
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
      const idx = world.idx(x, y);
      const v = veg[idx];
      if (!(v > YIN_THRESHOLD)) continue;
      const a = Math.min(YIN_MAX_ALPHA, (v - YIN_THRESHOLD) * YIN_GAIN);
      if (a <= 0.004) continue;
      const [sx, sy] = cam.tileScreen(x + 0.5, y + 0.5, world.height[idx]);
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
      grad.addColorStop(0, `rgba(18,20,28,${a.toFixed(3)})`);
      grad.addColorStop(1, 'rgba(18,20,28,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
      budget -= 1;
      if (budget <= 0) { ctx.restore(); return; }   // 性能闸：到顶就收
    }
  }
  ctx.restore();
}

/**
 * 视界边缘的「裂缝」：沿划选形状一圈**断续的墨线 + 微光**，不是实线。
 *
 * 它既是 UI 提示（这里开着一扇窗），也是裂缝的空间位置提示——
 * 裂缝就开在这条边缘的**连线**上（规格 §4.1；矩形时代是「四条边」，
 * 现在是自由形状的闭合折线）。刻意不画实线：实线看着像选择框，断续才像缝。
 *
 * 取屏幕坐标走的是与 `drawRealmView` **同一个**零抬升映射，否则边框会与
 * 窗口边界错位。`sel.path` 缺失时退回矩形四角（防御性）。
 */
export function drawRiftBorder(ctx, cam, sel, now) {
  if (!sel) return;
  let pts;
  if (sel.path && sel.path.length >= 3) {
    pts = sel.path.map((p) => [cam.toScreenX(p[0]), cam.toScreenY(p[1])]);
  } else {
    const x0 = cam.toScreenX(sel.x0);
    const y0 = cam.toScreenY(sel.y0);
    const x1 = cam.toScreenX(sel.x1 + 1);
    const y1 = cam.toScreenY(sel.y1 + 1);
    pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }
  // 太小的窗不画边框（与旧版 `w <= 2 || h <= 2` 等价，按包围盒量）
  let minX = pts[0][0];
  let maxX = minX;
  let minY = pts[0][1];
  let maxY = minY;
  for (let i = 1; i < pts.length; i += 1) {
    if (pts[i][0] < minX) minX = pts[i][0];
    if (pts[i][0] > maxX) maxX = pts[i][0];
    if (pts[i][1] < minY) minY = pts[i][1];
    if (pts[i][1] > maxY) maxY = pts[i][1];
  }
  if (maxX - minX <= 2 || maxY - minY <= 2) return;
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };
  ctx.save();
  // 微光：一条略粗的冷色描边垫在底下。**刻意不用 shadowBlur**——
  // 那个在每帧都画的路径上出了名的贵，而这里只画一圈折线，粗线就够。
  const glow = 0.30 + 0.22 * Math.sin(now * 1.7);
  ctx.lineWidth = 4;
  ctx.strokeStyle = `rgba(122, 186, 196, ${glow.toFixed(3)})`;
  trace();
  ctx.stroke();
  // 断续墨线：断口缓慢流动，看着像「缝在动」，而不是像选择框
  ctx.lineWidth = 1.2;
  ctx.setLineDash([7, 5]);
  ctx.lineDashOffset = -now * 9;
  ctx.strokeStyle = 'rgba(34, 32, 28, 0.86)';
  trace();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * 拖拽中的划选路径：一条闭合的虚线预览（**还没成型**，所以没有微光/裂缝，
 * 免得与已开的视界混淆）。首尾自动连上，让玩家边划边看到形状。
 */
export function drawSelectHint(ctx, cam, path) {
  if (!Array.isArray(path) || path.length < 2) return;
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(74, 122, 138, 0.9)';
  ctx.beginPath();
  ctx.moveTo(cam.toScreenX(path[0][0]), cam.toScreenY(path[0][1]));
  for (let i = 1; i < path.length; i += 1) {
    ctx.lineTo(cam.toScreenX(path[i][0]), cam.toScreenY(path[i][1]));
  }
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
