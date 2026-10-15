#!/usr/bin/env node
// 水墨沙盒 · 无头冒烟测试
// 不依赖浏览器，验证：世界生成 → 自然模拟推进 → 生灵繁衍 → 神格工具 → 存读档一致。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_PRESETS, TERRAIN_INFO, SPECIES, TIME } from '../src/inkbox/core/config.js';
import { generateWorld } from '../src/inkbox/world/worldgen.js';
import { generateUpperWorld } from '../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../src/inkbox/world/worldgenNether.js';
// 世界推进的**唯一入口**（5u 组守卫它，见那里的说明 / BACKLOG #13）。
import { advanceWorld, createAdvanceState, ADVANCE_PERIODS } from '../src/inkbox/sim/advance.js';
// ⚠️ 5u 组**故意不 import `stepNether`**：那一节要验的正是「幽冥由
//    `advanceWorld` 驱动」，直接调它等于绕过被测对象，把接线问题盖掉。
//    （5w 组同样不直接调它，一律走 `advanceWorld`——同一条纪律。）
import {
  spawnNetherGhost, netherGhostStats, netherEcoStats, NETHER_SOUL_CAP, ghostTierOf,
  netherBankTiles, pickNetherSpatialTarget, NETHER_BANK_RADIUS, NETHER_TIER_REACH,
  // D6-3 工程包 C：幽冥物品（自生的法宝 + 携带的功法）。5q⑯ 直接调它的时钟与读数。
  // ⚠️ **这里可以 import `stepNetherItems`，但不能 import `stepNether`**——5u / 5w
  //    两节**故意不 import `stepNether`**（它们要验的正是「幽冥由 `advanceWorld`
  //    驱动」，直接调等于绕过被测对象）。⑯ 的自生段因此走 `advanceWorld`（唯一入口）。
  netherItemStats, ensureNetherPopLog, trimNetherItems, stepNetherItems,
  NETHER_ITEM_CAP, NETHER_ITEM_PERIOD_DAYS, NETHER_ITEM_CHANCE,
  NETHER_ITEM_TIER, NETHER_ITEM_QUALITY,
} from '../src/inkbox/sim/netherLife.js';
import { deriveUpperSeed, createPlanes, upperWalkable, netherWalkable, arriveUpper, upperEcoStats, UPPER_ID_BASE } from '../src/inkbox/world/planes.js';
// 境界外观表（渲染侧）。`REALM_STYLE` 与 `REALMS` 必须等长——见 5o 组。
// 这个模块**不碰 DOM**（只 import config / cultivation / palette 三个纯模块，
// canvas 只在实例方法里用），所以能在 node 下直接 import，实测 len=7 可读。
import { REALM_STYLE } from '../src/inkbox/render/unitsLayer.js';
import { recomputeAll, OVER } from '../src/inkbox/world/terrain.js';
import { Life } from '../src/inkbox/sim/life.js';
import { stepHydrology } from '../src/inkbox/sim/hydrology.js';
import { stepVegetation, stepFire, decayOverlay } from '../src/inkbox/sim/ecology.js';
// 空间裂缝（阶段三 · 块四）。局部数据层断言在下面 5q 组。
import {
  RIFT_PERIOD_DAYS, TAU_GROW, TAU_CLOSE, RIFT_BASE_RADIUS, RIFT_MAX_RADIUS,
  RIFT_SEED_KEY,
  openRifts, stepRifts, riftStats, riftRadiusAt, riftRngFor,
  // D6-3 工程包 A：幽冥缝的**独立**流（`netherRiftRngFor` / `NETHRIFT_SEED_KEY`）
  // 与「凡人跌入幽冥」的跨界效果（`fallIntoNether`，直接调用于确定性用例）。
  // ⚠️ `RIFT_SEED_KEY` 也要进来：⑫ 的两条流判据要**逐对**比较派生键，
  //    并把「裂隙流被抽了几次」与参照流对齐（漏 import 会在运行到那一行时
  //    抛 `ReferenceError`——`node --check` 抓不到未定义标识符）。
  netherRiftRngFor, NETHRIFT_SEED_KEY, fallIntoNether,
  // D6-3 工程包 B：幽 → 凡（鬼爬入凡间）的跨界效果，直接调用于确定性用例。
  climbOutToMortal, WRAITH_CLIMB_CHANCE_PER_PERIOD,
  // D6-3 工程包 C：幽 → 凡（**物品**漏回地上）的跨界效果 + 第七条独立流。
  // ⚠️ 漏 import 会在跑到那一行时抛 `ReferenceError`——那是**直接中断整个 smoke**
  //    （不是红一条），`node --check` 抓不到未定义标识符。
  leakNetherItem, netherItemRngFor, NETHERITEM_SEED_KEY, NETHER_ITEM_LEAK_CHANCE_PER_PERIOD,
  // D6-3 工程包 D：跨位面夺舍 / 附身的**第四条独立流**（`NPSX`）与它的每拍概率。
  // ⚠️ 漏 import 会抛 `ReferenceError` ⇒ **直接中断整个 smoke**（同上面警告）。
  netherPossessRngFor, NETHER_POSSESS_SEED_KEY, POSSESS_CHANCE_PER_PERIOD,
} from '../src/inkbox/sim/rifts.js';
// 凡间鬼影（D6-3 工程包 B）。5q⑮ 直接调它的效果函数与独立 tick。
// ⚠️ 与上面 `RIFT_SEED_KEY` 同款警告：漏 import 会在跑到那一行时抛
//    `ReferenceError`，而那是**直接中断整个 smoke**（不是红一条），`node --check` 抓不到。
import {
  spawnWraith, stepMortalWraiths, wraithStats, ensureWraithLog,
  MORTALHAUNT_SEED_KEY, WRAITH_DISSOLVE_DAYS, WRAITH_CAP,
} from '../src/inkbox/sim/wraiths.js';
import { TOOL_BY_ID } from '../src/inkbox/ui/tools.js';
// 裂缝跨界的门槛常量（D6-3 工程包 A 的对照用例要用它，**不写死 40**——
// 写死会让「门槛被改坏」时那条对照静默失效）。
import { RIFT_CROSS_MAX_LEVEL } from '../src/inkbox/core/cultivation.js';
import { History, sculpt, addWater, burnForest, meteor, lightning, flood, plague, eraseLife, earthquake, triggerCrisis as powerCrisis } from '../src/inkbox/sim/powers.js';
import { WorldEvents } from '../src/inkbox/sim/worldEvents.js';
import { mulberry32 } from '../src/inkbox/core/noise.js';
import { serializeWorld, deserializeWorld } from '../src/inkbox/io/save.js';
// 世界大事账本的容量（5r 节用它断言封顶行为，**不写死 600**——
// 写死的阈值会跟着实现漂，而这条断言的语义是「长度等于那个常量」）。
import { MILESTONE_CAP } from '../src/inkbox/world/World.js';
import {
  greetOnBoot, reactToTool, busanziAffinity, busanziTierName, busanziRecent, ACT_AFFINITY_CAP,
} from '../src/inkbox/sim/busanzi.js';
import { BUSANZI } from '../src/inkbox/core/lore.js';
import { foundSect } from '../src/inkbox/sim/sects.js';
import { computeTerritory, cellOf, coreBudget, reachBudget, leylineAllowance, growTerritory, buildCostLayer } from '../src/inkbox/sim/territory.js';
import {
  initEntity, combatPower, cultivationRate, stepEntity,
} from '../src/inkbox/sim/cultivation.js';
import {
  breakthroughChance, REALMS, REALM_CAP, MORTAL_CEILING, BOTTLENECKS,
  ceilingFor, realmLabel, expToNext,
} from '../src/inkbox/core/cultivation.js';
import {
  artifactName, artifactAxis, artifactStats, ownerLine, hasProperName,
  forgeArtifact, giveTo, wearArtifacts, leaveArtifacts, claimGroundArtifact,
  stepArtifacts, SPIRIT_MAX_SCARS,
  // D6-3 工程包 C：幽冥法宝携带的功法栏上限（⑯ 判「栏满不推功法但法宝照收」）。
  TECHNIQUE_CAP,
} from '../src/inkbox/sim/artifacts.js';
import { ARTIFACT_NAMES, EQUIP_SLOTS, NETHER_ARTIFACT_NAMES, NETHER_TECHNIQUES } from '../src/inkbox/core/lore.js';
import {
  BLOODLINES, MANUALS, bloodlineProfile, bloodlineByName, generateNameParts, generateName,
} from '../src/inkbox/core/lore.js';
import {
  pickParents, registerBirth, applyHeritage, learnHeirloom, stepFamily,
  clanStats, describeClan, lineageOf, HERITAGE_ROOT_CAP, HERITAGE_ROOT_FLOOR,
  CLAN_MIN_LEVEL, CLAN_MIN_CHILDREN, CLAN_END_YEARS, MAX_CLANS,
} from '../src/inkbox/sim/family.js';
import { lifespanForEntity } from '../src/inkbox/sim/cultivation.js';
import {
  SOUL_ROUTES, ROUTE_LABEL, SOUL_CAP, deathRoute, soulTier, diedOfOldAge,
  enterNether, takeDueSoul, attachSoul, stepReincarnation,
  ensureSoulLog, SOUL_ROUTE_POSSESS,
} from '../src/inkbox/sim/reincarnation.js';
import {
  recordLifeEvent, compileBiography, biographyRows, exportChronicle,
  biographyStats, LOG_CAP, LOST_TEXT, KIND_TAG, WORLD_KINDS,
} from '../src/inkbox/sim/biography.js';
import {
  ensureWarState, stepWar, warStats, warPower, canDeclareWar,
  warInternals, GREAT_BATTLE_MIN_POWER,
} from '../src/inkbox/sim/war.js';
import * as warModule from '../src/inkbox/sim/war.js';
import {
  tryPossession, possessionChance, possessionStats, possessionInternals,
  POSSESSION_LEVEL_MIN,
  // D6-3 工程包 D：跨位面夺舍 / 附身（5q⑰ 直接调效果函数与词条 / 判据）。
  // ⚠️ 与下面 rifts 那段同款警告：漏 import 会在跑到那一行时抛 `ReferenceError`
  //    ——那是**直接中断整个 smoke**（不是红一条），`node --check` 抓不到。
  crossPlanePossession, isControlled, isObsessed, isHollowSoul, crossPossessedCount,
  crossPlanePossessionChance, normalizeRancor,
  POSSESS_TIER_MAX_LEVEL, CROSS_POSSESS_CAP, HAUNT_DAYS, RANCOR_FULL,
  OBSESSION_RATE, HOLLOW_SOUL_RATE, OBSESSION_BOOST, HOLLOW_SOUL_BOOST,
  CROSS_POSSESS_KIND, HAUNT_KIND,
} from '../src/inkbox/sim/possession.js';
// 三界最小闭环（Batch 3，5t 组）：
//   · `markSoulRoute` / `rememberDead` —— 魂路落到「具体某个人」身上的那两笔写入；
//   · `ensureSoulLog` —— 读账本要走它，**不能直接读 `world.soulLog`**（老档可能缺键）；
//   · `SOUL_ROUTE_POSSESS` —— 名册专有的第六种去向，必须**不在** `SOUL_ROUTES` 里；
//   · `UpperLife` —— 上界陨落者**不带**魂路，那是一条反向对照（见 5t 组末）。
import { rememberDead, markSoulRoute } from '../src/inkbox/sim/necrology.js';
import { UpperLife } from '../src/inkbox/sim/upperLife.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

// ══ 存档体积：两个**独立**的旋钮，不要把它们揉在一处算 ══════════
//
// **① STORAGE_QUOTA —— localStorage 的真实配额，单位是 UTF-16 码元，不是字节。**
// 这个数由另一个智能体在 Edge headless + CDP 上二分实测得到，不是查文档抄的：
//   · `'a'.repeat(5_242_877)` 能存下，「半 ASCII 半中文」只能存 5_242_876 ——
//     也就是说**中文与 ASCII 同价**：中文按 1 个码元算，而不是 UTF-8 的 3 字节；
//   · 配额是 **per-origin 共享**的，8 个存档槽一起算，不是每槽一份。
// ⚠️ 所以本项目文档里一直写的「5 MB 上限」是**错的**。`JSON.stringify(...).length`
// 数出来的正是码元，拿去比 5×1024×1024 = 5,242,880 只差 3，看着「差不多」；
// 但一旦有人把口径换成字节（`TextEncoder` / `Blob.size`），中文档会瞬间差 3 倍，
// 「超没超」的判断整个反掉。这里统一按**码元**，并且只在这一个地方定义。
//
// **② SAVE_COMPRESSED —— 存档是否 gzip 压缩后落盘。**
// 实测压缩比 3.9×（长卷 3,788,047 → 约 1,287,148 码元）。这一轮**还没落地**，
// 所以是 false。压缩上线时**只改这一个开关**，下面的阈值一个字都不用动。
const STORAGE_QUOTA = 5_242_877;
const SAVE_COMPRESSED = false;
/** 实测压缩比，仅用于把「序列化长度」折算成「实际落盘长度」。 */
const SAVE_COMPRESS_RATIO = 3.9;
/** 落盘长度的预算 = 配额的 70%。留 30% 给另外几个存档槽与面板的临时数据。 */
const SAVE_BUDGET = Math.floor(STORAGE_QUOTA * 0.7);
/**
 * 把 `JSON.stringify(serializeWorld(w)).length`（压缩前，码元）折算成**实际落盘**长度。
 * 压缩上线后只改 `SAVE_COMPRESSED`，所有调用点自动跟着走——
 * 断言写成上界判据（不超过预算）而不是窄区间，就是为了压缩落地时不会变成假失败。
 */
const storedChars = (chars) => (SAVE_COMPRESSED ? Math.ceil(chars / SAVE_COMPRESS_RATIO) : chars);
/** 体积断言的统一 detail：数字与占比都打出来，**漂移才看得见**。 */
const sizeDetail = (label, chars) => {
  const stored = storedChars(chars);
  return `${label} ${chars.toLocaleString('en-US')} 码元`
    + `${SAVE_COMPRESSED ? ` → 压缩后 ${stored.toLocaleString('en-US')}` : ''}`
    + ` / 配额 ${STORAGE_QUOTA.toLocaleString('en-US')} = ${(stored / STORAGE_QUOTA * 100).toFixed(1)}%`
    + `（预算 ${(SAVE_BUDGET / STORAGE_QUOTA * 100).toFixed(0)}%）`;
};

console.log('水墨沙盒 · 冒烟测试');
console.log('='.repeat(56));

// ── 1. 世界生成 ──────────────────────────────────────────
section('1. 世界生成');
const preset = WORLD_PRESETS.small;
const t0 = Date.now();
const world = generateWorld({ preset, seed: 20260914, scatter: true });
const genMs = Date.now() - t0;
const stats = world.stats();
check('生成耗时可接受', genMs < 4000, `${genMs} ms · ${preset.w}×${preset.h}`);
check('陆地占比合理', stats.land / world.size > 0.45 && stats.land / world.size < 0.82,
  `陆地 ${((stats.land / world.size) * 100).toFixed(1)}%`);
check('存在海洋', stats.water > world.size * 0.1, `水域 ${stats.water} 格`);
check('存在高峰', stats.peak > 0.72, `最高 ${stats.peak.toFixed(3)}`);

let typeKinds = new Set();
for (let i = 0; i < world.size; i += 1) typeKinds.add(world.type[i]);
check('地貌种类丰富', typeKinds.size >= 8, `${typeKinds.size} 种`);

let hasRiver = false;
for (let i = 0; i < world.size; i += 1) {
  if (world.water[i] > 0.001 && world.height[i] >= 0.3) { hasRiver = true; break; }
}
check('河流/湖泊被刻出来', hasRiver);

// ── 2. 自然模拟 ──────────────────────────────────────────
section('2. 自然模拟（水文 / 侵蚀 / 植被 / 火）');
const rng = mulberry32(999);
const hBefore = Float32Array.from(world.height);
const t1 = Date.now();
for (let i = 0; i < 60; i += 1) {
  stepHydrology(world, 6, null);
  stepVegetation(world, 30, rng);
}
const simMs = Date.now() - t1;
let delta = 0;
for (let i = 0; i < world.size; i += 1) delta += Math.abs(world.height[i] - hBefore[i]);
check('水文+侵蚀推进无异常', Number.isFinite(delta), `60 步耗时 ${simMs} ms`);
check('地形确实被侵蚀改动', delta > 0, `累计高程变化 ${delta.toFixed(2)}`);

let waterMass = 0;
for (let i = 0; i < world.size; i += 1) waterMass += world.water[i];
check('水体总量守恒（未爆掉）', waterMass > 0 && waterMass < world.size * 3, `水量 ${waterMass.toFixed(0)}`);

// 火
const lit = burnForest(world, Math.floor(preset.w / 2), Math.floor(preset.h / 2), 5, new History());
let burning = 0;
for (let k = 0; k < 30; k += 1) {
  stepFire(world, 8, rng);
  for (let i = 0; i < world.size; i += 1) if (world.fire[i] > 0.05) burning += 1;
}
let stillBurning = 0;
for (let i = 0; i < world.size; i += 1) if (world.fire[i] > 0.05) stillBurning += 1;
check('可以放火', lit > 0, `点燃 ${lit} 格`);
// 原来这条写的是 `burning >= 0`——`burning` 是累加计数，恒 ≥ 0，**永远不会红**。
// 换成两个能红的判据：
//   · 火真的烧起来过：`stepFire` 若没生效（或点了就灭），这里恒为 0；
//   · 火最终烧完：「永燃的火场」是一种真实的坏法——不报错，只是火图层
//     慢慢把整张图吃掉。
check('火确实烧起来过（不是点了就灭）', burning > 0, `30 步累计在烧 ${burning} 格`);
check('火在 30 步内烧完（不留下永燃的火场）', stillBurning === 0,
  `终局仍在烧 ${stillBurning} 格 / 共 ${world.size} 格`);

// ── 3. 生灵 ──────────────────────────────────────────────
section('3. 生灵与聚落');
const life = new Life(world, mulberry32(4242));
life.processPendingSpawns();
const spawned = world.entities.length;
check('初始生灵已降生', spawned > 0, `${spawned} 人`);

const t2 = Date.now();
for (let year = 0; year < 40; year += 1) {
  for (let k = 0; k < 12; k += 1) {
    world.day += 30;
    life.step(30);
  }
}
const lifeMs = Date.now() - t2;
const s2 = world.stats();
check('生灵系统跑得动', Number.isFinite(lifeMs), `40 年 / ${lifeMs} ms`);
check('生灵存活', s2.entities > 0, `${s2.entities} 个`);
check('形成了聚落', s2.villages > 0, `${s2.villages} 村`);
check('形成了势力', s2.factions > 0, `${s2.factions} 方`);
check('编年史有记录', world.chronicle.length > 0, `${world.chronicle.length} 条`);

let hasHouse = 0;
for (let i = 0; i < world.size; i += 1) if (world.struct[i]) hasHouse += 1;
check('聚落建起了房屋', hasHouse > 0, `${hasHouse} 座`);
check('坐标全部合法', world.entities.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y)
  && e.x >= 0 && e.y >= 0 && e.x < world.w && e.y < world.h));

// ── 4. 神格工具 ──────────────────────────────────────────
section('4. 神格工具（自由改变地形）');
const history = new History();
const px = Math.floor(world.w * 0.3);
const py = Math.floor(world.h * 0.3);
const h0 = world.height[world.idx(px, py)];

history.begin();
for (let k = 0; k < 12; k += 1) sculpt(world, px, py, 6, 0.03, history);
history.end('抬山');
const h1 = world.height[world.idx(px, py)];
check('抬山生效', h1 > h0 + 0.15, `${h0.toFixed(3)} → ${h1.toFixed(3)}`);

history.begin();
const restored = history.undo(world);
const h2 = world.height[world.idx(px, py)];
check('撤销恢复原状', Math.abs(h2 - h0) < 1e-4, `撤销「${restored}」后 ${h2.toFixed(3)}`);

const w0 = world.water[world.idx(px, py)];
history.begin();
addWater(world, px, py, 8, 0.5, history);
history.end('注水');
check('注水生效', world.water[world.idx(px, py)] > w0);

history.begin();
const meteorX = px + 20;
const meteorY = py + 20;
const meteorR = 7;
// ⚠️ 旧断言 `world.height[world.idx(px + 20, py + 20)] < 1` 是**恒真**的：
//    `world.height` 全程被 `clamp(..., 0, 1)`，只有该格**恰好 = 1** 才会红。
//    把 `meteor` 里那行高程改动整行删掉、该格保持 0.5 → `0.5 < 1` → **照样绿**。
//    改成正面样板（同 `smoke:358` 洪水那条）：**施法前对 height / over 各做一次快照**，
//    施法后**数「高程真的下降了的格数」**，断言 `> 0`；并断言坑心覆盖层真的变了。
//    什么故障会让它变红：`meteor` 不再改动 `world.height`（坑不再被砸出来），
//    或不再把坑心设成 `OVER.LAVA`（覆盖层原地不动）。
const meteorCx = Math.round(meteorX);
const meteorCy = Math.round(meteorY);
const meteorCenterIdx = world.idx(meteorCx, meteorCy);
const heightBeforeMeteor = world.height.slice();
const overBeforeMeteor = world.over.slice();
const mres = meteor(world, meteorX, meteorY, meteorR, history);
history.end('陨石');
let craterCells = 0;
for (let i = 0; i < world.size; i += 1) {
  if (world.height[i] < heightBeforeMeteor[i] - 1e-6) craterCells += 1;
}
check('陨石砸出坑（高程真的下降的格数 > 0 —— 不是「< 1」那种恒真判据）',
  craterCells > 0, `高程下降 ${craterCells} 格 · 坑心 `
  + `${heightBeforeMeteor[meteorCenterIdx].toFixed(4)} → ${world.height[meteorCenterIdx].toFixed(4)}`);
check('陨石坑心覆盖层真的变了（坑心被设成熔岩，over 不是原样）',
  world.over[meteorCenterIdx] !== overBeforeMeteor[meteorCenterIdx]
  && world.over[meteorCenterIdx] === OVER.LAVA,
  `坑心 over ${overBeforeMeteor[meteorCenterIdx]} → ${world.over[meteorCenterIdx]}（LAVA=${OVER.LAVA}）`);
// ⚠️ 这条断言**以前写的正是那个 bug 本身**：
//     `entBeforeMeteor - world.entities.length === mres.killed`
//   即「施法后实体**立刻**少掉 killed 个」。之所以成立，是因为 powers.js 当时
//   直接 `world.entities.splice(...)` 把人剪掉——绕开 `onDeath`，于是这些死
//   对 necrology（`world.dead` / `deadLog`）、神魂、关系清理、死亡叙事**全部隐身**。
//   那正是本轮修掉的缺陷，所以判据必须改守**新契约**（移除延迟到下一次 `step()`）：
//     (a) 施法后**立刻**：落点影响范围内恰好「文案里报的」个生灵 `hp <= 0`（被标记，尚未移除）；
//     (b) 走一次 `life.step()` 后：这些**具体的人**全部离开 `world.entities`，
//         且**全部**出现在 `world.dead` 里——这一半才是原来缺的东西。
//   什么会变红：又有人绕开 `onDeath` 直接把人剪掉（(b) 的入册数掉下来，
//   而 (a) 照样绿——这正是旧断言查不出来的那种坏）；或杀伤数与实际标记数对不上。
const deadTotalBeforeMeteor = world.deadLog.total;
const mr2 = (meteorR + 2) * (meteorR + 2);
const markedMeteor = world.entities
  .filter((e) => (e.x - meteorX) ** 2 + (e.y - meteorY) ** 2 <= mr2 && e.hp <= 0)
  .map((e) => e.id);
// ⚠️ **契约变更（D2 Batch 2）**：`meteor` 的返回值从 `{ killed }` 改成**一句给玩家看的人话**。
//    原因：`main.js:applyTool` 只把**字符串**结果透给通知栏，返回对象会被丢掉、
//    退回「陨石 · 落于 (x, y)」——玩家看不到自己砸死了几个人。
//    **不变量没变**，所以这里不删断言、只换读法：从文案里把那个数**解析出来**，
//    仍旧守「报出来的数 = 真的被标记的人数」。解析不到数字就当场变红，
//    这条不会因为改契约而失去牙齿。
const claimedMeteor = (String(mres).match(/(\d+) 人罹难/) || [null, '0'])[1];
check('陨石：施法后立刻有恰好「文案里报的」个生灵被标记（hp <= 0，尚未移除）',
  typeof mres === 'string' && mres.length > 0
  && markedMeteor.length > 0
  && Number(claimedMeteor) === markedMeteor.length,
  `文案报 ${claimedMeteor} 人 · 当场被标记 ${markedMeteor.length} 人`);
life.step(1);
const deadIdsMeteor = new Set((world.dead || []).map((r) => r.id));
const recordedMeteor = markedMeteor.filter((id) => deadIdsMeteor.has(id)).length;
const goneMeteor = markedMeteor.filter((id) => !world.entities.some((e) => e.id === id)).length;
check('陨石：这些人在下一次 step() 后全部经 onDeath 入册（necrology / deadLog）',
  markedMeteor.length > 0
  && recordedMeteor === Number(claimedMeteor) && goneMeteor === Number(claimedMeteor)
  && world.deadLog.total - deadTotalBeforeMeteor >= Number(claimedMeteor),
  `被标记 ${markedMeteor.length} · 已移除 ${goneMeteor} · 已入名录 ${recordedMeteor}`
  + ` · deadLog.total +${world.deadLog.total - deadTotalBeforeMeteor}`);

history.begin();
const boltX = px + 10;
const boltY = py + 10;
const boltR = 4;                       // 与 powers.js 里 `const r2 = 4 * 4` 同源
const boltIdx = world.idx(px + 10, py + 10);
const hBeforeBolt = world.height[boltIdx];
const bolt = lightning(world, boltX, boltY, history);
history.end('雷霆');
// ⚠️ 同陨石那条：旧写法 `entBeforeBolt - world.entities.length === bolt.killed`
//   守的是「施法即同步移除」——而那正是绕开 `onDeath`、让死讯隐身的那个 bug。
//   新契约下移除延迟到下一次 `step()`，故拆成 (a) 当场标记数、(b) 入册数两段。
const deadTotalBeforeBolt = world.deadLog.total;
const br2 = boltR * boltR;
const markedBolt = world.entities
  .filter((e) => (e.x - boltX) ** 2 + (e.y - boltY) ** 2 <= br2 && e.hp <= 0)
  .map((e) => e.id);
// ⚠️ 同陨石那条：`lightning` 的返回值也从 `{ lit, killed }` 改成了一句人话。
//    `lit` 不再是字段，所以这里改成守「文案格式自洽」——要么不提雷火，
//    要么带一个**正整数**（写死 0 或写成负数都会变红）。
const claimedBolt = (String(bolt).match(/(\d+) 人罹难/) || [null, '0'])[1];
// ⚠️ 「抬高落点地形」那一半**必须写成带豁免的形式**：`lightning` 里是
//    `clamp(height + 0.01, 0, 1)`，高度**永不下降** ⇒ 原来的 `>=` 恒真
//    （相等也过，「抬高」不可证伪）。但**直接写 `>` 会在该格已被 clamp 在 1 时假红**——
//    所以判据是「**要么真的抬高了，要么本来就已经在上限**」。
check('雷霆落点生效（抬高落点地形，且施法后立刻有恰好「文案里报的」个生灵被标记）',
  (world.height[boltIdx] > hBeforeBolt || hBeforeBolt >= 1)
  && typeof bolt === 'string' && bolt.length > 0
  && markedBolt.length > 0
  && Number(claimedBolt) === markedBolt.length,
  `killed=${claimedBolt} · 当场被标记 ${markedBolt.length} 人`
  + ` · 高度 ${hBeforeBolt.toFixed(4)} → ${world.height[boltIdx].toFixed(4)}`);
check('雷霆文案格式自洽：要么不提雷火，要么带一个正整数',
  !/雷火点燃/.test(bolt) || /雷火点燃 [1-9]\d* 处草木/.test(bolt),
  String(bolt));
life.step(1);
const deadIdsBolt = new Set((world.dead || []).map((r) => r.id));
const recordedBolt = markedBolt.filter((id) => deadIdsBolt.has(id)).length;
const goneBolt = markedBolt.filter((id) => !world.entities.some((e) => e.id === id)).length;
check('雷霆：这些人在下一次 step() 后全部经 onDeath 入册（necrology / deadLog）',
  markedBolt.length > 0
  && recordedBolt === Number(claimedBolt) && goneBolt === Number(claimedBolt)
  && world.deadLog.total - deadTotalBeforeBolt >= Number(claimedBolt),
  `被标记 ${markedBolt.length} · 已移除 ${goneBolt} · 已入名录 ${recordedBolt}`
  + ` · deadLog.total +${world.deadLog.total - deadTotalBeforeBolt}`);

history.begin();
const floodX = px - 20;
const floodY = py - 20;
const waterBeforeFlood = world.water[world.idx(floodX, floodY)];
// ⚠️ `flood` 的返回值也从「覆盖格数」改成了一句人话。旧断言的 `flooded > 0`
//    守的是「返回的格数非零」——那**可能是个谎**（返回值与地形是否真的变了无关）。
//    改成守**世界状态本身**：水位真的上升了的格数 > 0。这比旧断言强。
const waterSnapshotFlood = Float32Array.from(world.water);
const flooded = flood(world, floodX, floodY, 9, history);
history.end('洪水');
let wetDelta = 0;
for (let i = 0; i < world.size; i += 1) {
  if (world.water[i] > waterSnapshotFlood[i] + 1e-6) wetDelta += 1;
}
check('洪水真的注了水（水位上升的格数 > 0，且返回一句人话）',
  typeof flooded === 'string' && flooded.length > 0 && wetDelta > 0,
  `文案「${flooded}」· 水位上升 ${wetDelta} 格`
  + ` · 中心 ${waterBeforeFlood.toFixed(4)} → ${world.water[world.idx(floodX, floodY)].toFixed(4)}`);

// 改地形之后类型层仍然自洽
let inconsistent = 0;
for (let i = 0; i < world.size; i += 1) {
  const isWaterTile = world.water[i] > 0.0015;
  const typeIsWater = [0, 1, 2, 3].includes(world.type[i]);
  if (isWaterTile !== typeIsWater) inconsistent += 1;
}
check('地表类型与水位自洽', inconsistent === 0, `不一致 ${inconsistent} 格`);

// ── 5. 存读档 ────────────────────────────────────────────
section('5. 存读档一致性');
const payload = serializeWorld(world);
const json = JSON.stringify(payload);
const clone = deserializeWorld(JSON.parse(json));

let maxHeightDiff = 0;
for (let i = 0; i < world.size; i += 1) {
  maxHeightDiff = Math.max(maxHeightDiff, Math.abs(world.height[i] - clone.height[i]));
}
let typeDiff = 0;
for (let i = 0; i < world.size; i += 1) if (world.type[i] !== clone.type[i]) typeDiff += 1;

// ⚠️ 这条旧断言的阈值曾是 `12_000_000`——**比真配额宽 2.3 倍**，
// 也就是说存档膨胀到能撑爆 localStorage 的 1.14 倍时它照样是绿的。
// 它守的是「随模拟增长的那部分」（实体 / 关系网 / 个人日志 / 编年史），
// 所以幅面用 small 是合适的；幅面本身（地形层）由下面 5m 的长卷守。
check('存档体积在配额内（小世界·跑了 40 年）',
  storedChars(json.length) <= SAVE_BUDGET, sizeDetail('小世界', json.length));
check('高程还原误差可忽略', maxHeightDiff < 1e-4, `最大误差 ${maxHeightDiff.toExponential(2)}`);
check('地表类型完全一致', typeDiff === 0, `差异 ${typeDiff} 格`);
check('生灵数量一致', clone.entities.length === world.entities.length,
  `${world.entities.length} → ${clone.entities.length}`);
check('聚落数量一致', clone.villages.length === world.villages.length);
check('势力数量一致', clone.factions.length === world.factions.length);

// 迁移修仙系统时最容易漏的一环：新状态没写进存档，一存一读修士就退化成凡人。
section('5b. 修仙层存读档对等');
const countCultivators = (w) => w.entities.filter((e) => (e.level || 0) > 0).length;
const countRelations = (w) => {
  let n = 0;
  for (const e of w.entities) if (e.relations) n += e.relations.size;
  return n;
};
const sumLevels = (w) => w.entities.reduce((s, e) => s + (e.level || 0), 0);

const srcCult = countCultivators(world);
check('读档前世界里确实有修士', srcCult > 0, `${srcCult} 位`);
check('修士数量一致', countCultivators(clone) === srcCult,
  `${srcCult} → ${countCultivators(clone)}`);
check('境界总和一致', sumLevels(clone) === sumLevels(world),
  `${sumLevels(world)} → ${sumLevels(clone)}`);

// 灵根：挑一位真人，逐字段比对，避免「整体数量对了但内容丢了」
const srcRooted = world.entities.find((e) => e.root && e.root.rootName);
const dstRooted = srcRooted ? clone.entities.find((e) => e.id === srcRooted.id) : null;
check('灵根被完整还原', Boolean(srcRooted) && Boolean(dstRooted)
  && dstRooted.root.rootName === srcRooted.root.rootName
  && dstRooted.root.quality === srcRooted.root.quality
  && dstRooted.root.bonus === srcRooted.root.bonus,
  srcRooted ? `${srcRooted.name} · ${srcRooted.root.rootName}` : '无灵根修士可验');

// 道途：存的是 key，读档要还原成完整对象（含 name/stages）
const srcDao = world.entities.find((e) => e.dao && e.dao.path);
const dstDao = srcDao ? clone.entities.find((e) => e.id === srcDao.id) : null;
check('道途被完整还原', !srcDao || (dstDao && dstDao.dao
  && dstDao.dao.path.key === srcDao.dao.path.key
  && dstDao.dao.path.name === srcDao.dao.path.name
  && dstDao.dao.stage === srcDao.dao.stage),
  srcDao ? `${srcDao.name} · ${srcDao.dao.path.name}` : '尚无人开辟道途');

// 功法：存名字、用 MANUALS 还原成带 kind/note 的完整条目
const srcTech = world.entities.find((e) => e.techniques && e.techniques.length);
const dstTech = srcTech ? clone.entities.find((e) => e.id === srcTech.id) : null;
check('功法被完整还原', !srcTech || (dstTech && dstTech.techniques.length === srcTech.techniques.length
  && dstTech.techniques.every((t, i) => t.name === srcTech.techniques[i].name && t.kind)),
  srcTech ? `${srcTech.name} · ${srcTech.techniques.map((t) => t.name).join('/')}` : '尚无人习得功法');

check('关系网条目一致', countRelations(clone) === countRelations(world),
  `${countRelations(world)} → ${countRelations(clone)}`);
// 逐条深度比对，而不是只看总数——数量对得上但张冠李戴是最难发现的。
// 注意：指向已故之人的「旧师/旧徒」是刻意保留的纪念性关系，不算悬空。
check('关系网逐条还原一致', (() => {
  if (world.entities.length !== clone.entities.length) return false;
  for (let i = 0; i < world.entities.length; i += 1) {
    const a = world.entities[i].relations;
    const b = clone.entities[i].relations;
    const sa = a ? a.size : 0;
    const sb = b ? b.size : 0;
    if (sa !== sb) return false;
    if (!sa) continue;
    for (const [id, rel] of a) {
      const got = b.get(id);
      if (!got || got.type !== rel.type || Math.round(got.score) !== Math.round(rel.score)) return false;
    }
  }
  return true;
})());

check('灵脉数量一致', clone.leylines.length === world.leylines.length,
  `${world.leylines.length} 条`);
check('地点数量一致', clone.sites.length === world.sites.length, `${world.sites.length} 处`);
check('飞升名录一致', clone.ascended.length === world.ascended.length);

// 灵气层：它依赖灵脉，读档时必须「先灌灵脉再重算」，否则整层偏小
let maxQiDiff = 0;
for (let i = 0; i < world.size; i += 1) maxQiDiff = Math.max(maxQiDiff, Math.abs(world.qi[i] - clone.qi[i]));
check('灵气层与灵脉自洽', maxQiDiff < 1e-5, `最大误差 ${maxQiDiff.toExponential(2)}`);

// 宗门：资源账本与长老名单不存的话，读档后第一帧就会崩
const srcSect = world.factions[0];
const dstSect = srcSect ? clone.factions.find((f) => f.id === srcSect.id) : null;
check('宗门资源账本被保留', Boolean(srcSect) && Boolean(dstSect) && Boolean(dstSect.resources)
  && dstSect.resources.spiritStone === srcSect.resources.spiritStone,
  srcSect ? `${srcSect.name} · 灵石 ${srcSect.resources.spiritStone}` : '尚无宗门');
// 地盘**不该**进存档——它是推导量（由地形 + 宗门资产每三十天重算，见 sim/territory.js）。
// 存下来反而危险：玩家把山挖断之后，旧地盘会跟着存档一起活过来，跟脚下地形对不上。
// 这里反过来钉住：读档后的宗门身上不该有 territory 字段。
check('宗门地盘没有被塞进存档（它是推导量）',
  Boolean(srcSect) && Boolean(dstSect)
  && srcSect.territory === undefined && dstSect.territory === undefined,
  srcSect ? `${srcSect.name} · 山门 (${srcSect.capitalX},${srcSect.capitalY})` : '尚无宗门');
check('宗门山门坐标被保留', Boolean(srcSect) && Boolean(dstSect)
  && dstSect.capitalX === srcSect.capitalX && dstSect.capitalY === srcSect.capitalY,
  srcSect ? `(${srcSect.capitalX},${srcSect.capitalY})` : '尚无宗门');
check('宗门长老名单被保留', clone.factions.every((f, i) => {
  const src = world.factions[i];
  if (!src) return true;
  const a = src.elders || [];
  const b = f.elders || [];
  return a.length === b.length && a.every((id, k) => id === b[k]);
}));
check('宗门关系是数值映射而非对象', clone.factions.every((f) => f.relations instanceof Map));

// 放在最后：这一段会推进 clone，前面所有比对都必须在它之前完成。
check('读档后继续模拟不崩', (() => {
  const life2 = new Life(clone, mulberry32(7));
  for (let k = 0; k < 30; k += 1) { clone.day += 30; life2.step(30); stepHydrology(clone, 4, null); }
  return clone.entities.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y));
})());

// ── 5c. 卜算子（天道引路人）──────────────────────────────
// 他是「剧情细节」最主要的载体：台词照搬原作，一句没改。
// 但光把台词塞进编年史不够——编年史是 400 条的滚动窗口，
// 一场两百年的局会把他的来路整个顶出去。所以这里要单独验一遍。
section('5c. 卜算子：登场、亲缘、台词');
const bzWorld = generateWorld({ preset: WORLD_PRESETS.medium, seed: 5150, scatter: true });
const bzLife = new Life(bzWorld, mulberry32(5150 ^ 0xa5a5a5a5));
const bzRng = mulberry32(99);

const boot = greetOnBoot(bzWorld, bzRng);
// 条数**绑定数据源**而不是写死：`lines.boot` 是照搬原作的原文（本文件承诺一字未改），
// 而自我介绍是**另加**的一句（见 busanzi.js 里那段注释）。
// 写死 `=== 3` 会在两种正当改动下假红：原作词池增删、自我介绍被摘掉。
check('初登场说登场词 + 一句自我介绍',
  boot.length === BUSANZI.lines.boot.length + 1,
  `共 ${boot.length} 句（登场词 ${BUSANZI.lines.boot.length} + 自我介绍 1）`);
// 下面这条才是承重的：`selfIntro` 在 2026-09-22 之前**全仓零读者**（故障类 1），
// 新玩家因此不知道左下角那个自称「小爷我」的人是谁。
check('自我介绍那句确实说了', boot.includes(BUSANZI.selfIntro),
  boot[boot.length - 1] || '');
check('重复登场不再说话', greetOnBoot(bzWorld, bzRng).length === 0);
check('登场台词进了他自己的 log',
  busanziRecent(bzWorld, 5).length === BUSANZI.lines.boot.length + 1,
  `${busanziRecent(bzWorld, 5).length} 句`);
check('亲缘初始为 0 且是「井外生客」',
  busanziAffinity(bzWorld) === 0 && busanziTierName(bzWorld) === '井外生客',
  `${busanziAffinity(bzWorld)} · ${busanziTierName(bzWorld)}`);

// 落笔：创造类小概率、灾祸类大概率，但亲缘只计前 30 次
const actsBefore = bzWorld.busanzi.acts;
for (let i = 0; i < 40; i += 1) reactToTool(bzWorld, bzRng, 'raise');
check('亲缘只记前 30 次亲手拨动（防止狂点刷满）',
  actsBefore === 0 && bzWorld.busanzi.acts === ACT_AFFINITY_CAP,
  `${actsBefore} → ${bzWorld.busanzi.acts}（上限 ${ACT_AFFINITY_CAP}）`);
// 这条防的是「词池被去重说完之后他彻底闭嘴」——
// 玩家连按两百次只听见头两声，跟没有这个人是一样的。
let harshSpoke = 0;
let immediateRepeat = 0;
let prevLine = null;
for (let i = 0; i < 200; i += 1) {
  const said = reactToTool(bzWorld, bzRng, 'meteor');
  if (!said) continue;
  harshSpoke += 1;
  if (said === prevLine) immediateRepeat += 1;
  prevLine = said;
}
check('玩家反复落笔时他一直在应声', harshSpoke >= 20, `200 次里开口 ${harshSpoke} 次`);
check('他不会把同一句连着说两遍', immediateRepeat === 0,
  `${harshSpoke} 次开口里连着重复 ${immediateRepeat} 次`);

// 跑一段，看里程碑与升阶
for (let y = 1; y <= 200; y += 1) {
  for (let d = 0; d < 360; d += 3) { bzWorld.day += 3; bzLife.step(3); }
}
const milestones = bzWorld.busanzi.milestones;
check('里程碑被逐个结算', milestones.length >= 3, milestones.join(' '));
check('亲缘随时间与见证增长',
  busanziAffinity(bzWorld) > 40, `${busanziAffinity(bzWorld)} · ${busanziTierName(bzWorld)}`);
check('亲缘升过阶', bzWorld.busanzi.tier >= 1,
  `${BUSANZI.affinityTiers[bzWorld.busanzi.tier]}`);

const bzLog = bzWorld.busanzi.log;
const uniq = new Set(bzLog.map((l) => l.text)).size;
check('卜算子的 log 有上限、不无限增长', bzLog.length <= 40, `${bzLog.length} 条`);
// 复读是这个模块最容易出的毛病：tribulation 词池只有一句，
// 而突破后期每几秒一次，不去重的话他会变成坏掉的唱片
// （修之前实测：编年史里 8 条卜算子台词全是同一句）。
//
// 判据用「占比」而不是「绝对次数」：上面那 200 次连点是测试造出来的极端情形，
// 真实玩家不会那样点。该守的不变量是「没有哪句话刷屏」，
// 而不是「某句最多出现 N 次」——后者会随着测试的连点次数一起漂。
const counts = {};
for (const l of bzLog) counts[l.text] = (counts[l.text] || 0) + 1;
const worst = Math.max(0, ...Object.values(counts));
const worstShare = bzLog.length ? worst / bzLog.length : 0;
check('卜算子没有哪句话刷屏', worstShare <= 1 / 3,
  `最多一句占 ${(worstShare * 100).toFixed(0)}%（${worst}/${bzLog.length} 条，去重 ${uniq} 条）`);
check('对话条读得到他最近的话', busanziRecent(bzWorld, 3).length === 3,
  busanziRecent(bzWorld, 1).map((l) => l.text).join(''));

// 存读档：他自己的 log 必须单独存，否则读档后对话条是空的
const bzSave = deserializeWorld(serializeWorld(bzWorld));
check('卜算子状态能存能读',
  JSON.stringify(bzSave.busanzi) === JSON.stringify(bzWorld.busanzi),
  `met=${bzSave.busanzi.met} acts=${bzSave.busanzi.acts} log=${bzSave.busanzi.log.length} 条`);

// ── 5d. 数值 0 必须原样回来 ──────────────────────────────
// 这一条是补一个真踩过的坑：序列化里写成 `e.mind || 60`，
// 而道心会被 clamp 到 0——`0 || 60` 等于 60，道心尽失的修士存档再读回来就道心 60。
// 当时是等价测试撞上的，513 位生灵里只有 2 位是 0，纯属运气。
// 所以这里直接造一个「所有数值字段都是 0」的极端生灵，钉死这件事。
section('5d. 数值 0 必须原样存回来');
const zeroWorld = generateWorld({ preset: WORLD_PRESETS.medium, seed: 31, scatter: true });
zeroWorld.pendingSpawns.push({ x: 40, y: 40, species: 'human', count: 4 });
const zeroLife = new Life(zeroWorld, mulberry32(31));
zeroLife.processPendingSpawns();
const zTarget = zeroWorld.entities[0];
zTarget.level = 0;
zTarget.exp = 0;
zTarget.karma = 0;
zTarget.fortune = 0;
zTarget.heartDemon = 0;
zTarget.mind = 0;
zTarget.pollution = 0;
// 这一格原来是 `equipTier`——那一列已经换成法宝数组了（v4 存档），
// 换 `incarnation` 接着守同一件事：`row[46] ?? 1` 这种写法遇到 0 不能把它顶成 1。
zTarget.incarnation = 0;
zTarget.trialCount = 0;
zTarget.lastAwakenTry = 0;
zTarget.foundedSect = 0;
zTarget.carried = 0;
zTarget.kills = 0;
const zBack = deserializeWorld(serializeWorld(zeroWorld)).entities
  .find((e) => e.id === zTarget.id);
const zeroFields = ['level', 'exp', 'karma', 'fortune', 'heartDemon', 'mind',
  'pollution', 'incarnation', 'trialCount', 'lastAwakenTry', 'foundedSect', 'carried', 'kills'];
const lostZero = zeroFields.filter((k) => zBack[k] !== 0);
check('数值字段的 0 没有被兜底默认值顶掉', lostZero.length === 0,
  lostZero.length ? `被顶掉：${lostZero.map((k) => `${k}=${zBack[k]}`).join(' ')}` : `${zeroFields.length} 个字段全部保持 0`);

// ── 5e. 势力图：代价洪泛 ─────────────────────────────────
//
// 地盘由地形洪泛出来，不画圆。这一节把几条**结构不变量**钉死——
// 它们和平衡数值无关，是「算法有没有做对」的问题：
//   · 归属层与世界上限一致；
//   · 地盘里不能出现不可通行的格子（水域、山脊、雪峰）；
//   · 山门那一格必须归自己；
//   · 面积表要和归属层对得上；
//   · 两家挨着时接壤表里得有记录（否则 stepConflicts 永远打不起来）。
section('5e. 势力图：代价洪泛');
const tw = generateWorld({ preset: WORLD_PRESETS.medium, seed: 909, scatter: true });
const trng = mulberry32(909);
// 手动立三家：找三块能立山门的地，隔得远一点，好让它们各自长成一片
const seats = [];
for (let y = 20; y < tw.h - 20 && seats.length < 3; y += 17) {
  for (let x = 20; x < tw.w - 20 && seats.length < 3; x += 23) {
    if (!tw.isBuildable(tw.idx(x, y))) continue;
    if (seats.some((s) => Math.hypot(s[0] - x, s[1] - y) < 40)) continue;
    seats.push([x, y]);
  }
}
const madeSects = seats.map(([x, y]) => foundSect(tw, x, y, null, trng)).filter(Boolean);
const terr = computeTerritory(tw);

let ownedCells = 0;
let blockedOwned = 0;
for (let i = 0; i < tw.size; i += 1) {
  if (!terr.owner[i]) continue;
  ownedCells += 1;
  const info = TERRAIN_INFO[tw.type[i]];
  if (!info || !info.walk) blockedOwned += 1;
}
const areaSum = [...terr.area.values()].reduce((s, v) => s + v, 0);

check('归属层与世界上限一致', terr.owner.length === tw.size && terr.owner.length === tw.territory.length,
  `${terr.owner.length} 格`);
check('宗门立得起来', madeSects.length === 3, `${madeSects.length} 家`);
check('地盘铺开了', ownedCells > 0, `${ownedCells} 格有主（${(ownedCells / tw.size * 100).toFixed(0)}%）`);
check('地盘里没有不可通行的格子', blockedOwned === 0,
  blockedOwned ? `${blockedOwned} 格落在水域或山脊上` : `${ownedCells} 格全部可通行`);
check('面积表与归属层对得上', areaSum === ownedCells, `${areaSum} vs ${ownedCells}`);
check('山门那一格归自己', madeSects.every((s) => terr.owner[cellOf(tw, s.capitalX, s.capitalY)] === s.id),
  madeSects.map((s) => `${s.name}:${terr.owner[cellOf(tw, s.capitalX, s.capitalY)] === s.id ? 'ok' : '×'}`).join(' '));
check('没有归属给不存在的宗门', [...terr.area.keys()].every((id) => Boolean(tw.factionById(id))),
  `[${[...terr.area.keys()].join(' ')}]`);

// 放一条灵脉在山门边上，它必须被认领；再放一条在图上另一头，认领不了就空着。
const nearLey = tw.addLeyline({ x: seats[0][0] + 3, y: seats[0][1] + 3, radius: 6, strength: 0.4 });
const terr2 = computeTerritory(tw);
//
// ⚠️ 断言**不能写成「认领者就是 seats[0] 那一家」**——实测踩过：
// seed 909 里坤元山（山门 @(89,20)）到这条灵脉的代价距离是 **0**、名额也有空，
// 而灵脉归了 100 代价之外的镇岳宗。原因不是认领逻辑坏了，而是**名额是硬上限**：
// 坤元山在按索引顺序分配前六条灵脉时已经把 2 个名额用满了
// （`leylineAllowance({ pop: 0 }) === 2`）。
// 「山门边上就该归我」这条直觉把名额规则当成了不存在，是一条会假失败的断言。
// 真正该守的性质有两条：**它得有人要**（不能变成谁都不碰的死内容）、
// 以及**要它的那家得真的够得着**。
const nearIdx = tw.leylines.indexOf(nearLey);
const nearClaimer = terr2.claims.get(nearLey.id);
const nearDists = tw.factions
  .map((s) => ({ name: s.name, d: terr2.reach.get(s.id)?.[nearIdx] }))
  .filter((o) => Number.isFinite(o.d))
  .sort((a, b) => a.d - b.d);
check('山门边上的灵脉被认领（哪怕最近那家名额已满，也不能没人要）',
  Boolean(nearClaimer) && Number.isFinite(terr2.reach.get(nearClaimer)?.[nearIdx]),
  `认领者 ${(tw.factionById(nearClaimer) || {}).name || '无人'}`
  + (nearDists.length ? ` · 最近的是 ${nearDists[0].name}@${Math.round(nearDists[0].d)}` : ''));
check('认领表覆盖全部灵脉', tw.leylines.every((l) => terr2.claims.has(l.id)),
  `${terr2.claims.size} / ${tw.leylines.length}`);
check('预算随门力增长',
  coreBudget({ pop: 80 }) > coreBudget({ pop: 4 }) && reachBudget({ pop: 80 }) > reachBudget({ pop: 4 }),
  `核心 ${coreBudget({ pop: 4 }).toFixed(0)}→${coreBudget({ pop: 80 }).toFixed(0)} · 伸手 ${reachBudget({ pop: 4 }).toFixed(0)}→${reachBudget({ pop: 80 }).toFixed(0)}`);
check('限脉数有上限且随门力增长',
  leylineAllowance({ pop: 4 }) < leylineAllowance({ pop: 80 }) && leylineAllowance({ pop: 9999 }) <= 4,
  `4 人 ${leylineAllowance({ pop: 4 })} 条 · 80 人 ${leylineAllowance({ pop: 80 })} 条 · 封顶 ${leylineAllowance({ pop: 9999 })} 条`);

// 「预算真的是上限」。
//
// 这一条是「读代码没能确认、只好实测才敢下结论」的性质，所以它必须变成断言：
// 代价洪泛限的是**路径累积代价**，不是「走几步」。
// 踩过的坑：把两者搞混，看到「预算 158 却铺了 4200 格」就以为预算没生效，
// 花了不少时间去翻堆的实现——其实预算精确地卡在 157.97。
// 一格代价最低 1.178，但一条蜿蜒穿过河谷的便宜路径能在预算内覆盖很多格，
// **格子数本来就与预算不是线性关系**。
const floodCosts = buildCostLayer(tw);
const seedCell = cellOf(tw, seats[0][0], seats[0][1]);
const measureFlood = (budget) => {
  const r = growTerritory(tw, [seedCell], budget, floodCosts);
  let maxDist = 0;
  let cells = 0;
  for (let i = 0; i < tw.size; i += 1) {
    if (r.stamp[i] !== r.gen) continue;
    cells += 1;
    if (r.dist[i] > maxDist) maxDist = r.dist[i];
  }
  return { maxDist, cells };
};
const floodSmall = measureFlood(40);
const floodBig = measureFlood(160);
check('洪泛不会越过预算（限的是累积代价，不是步数）',
  floodSmall.maxDist <= 40.001 && floodBig.maxDist <= 160.001,
  `预算 40 → 最大累积代价 ${floodSmall.maxDist.toFixed(2)}`
  + ` · 预算 160 → ${floodBig.maxDist.toFixed(2)}`);
check('预算变大，地盘确实变大', floodBig.cells > floodSmall.cells,
  `${floodSmall.cells} 格 → ${floodBig.cells} 格`);

// ── 5f. 转世 ─────────────────────────────────────────────
//
// 转世是「世界接得下去」的那一环：修士死了不是消失，而是排着队等回来。
// 这一节钉死的是**机制还在不在**，不是数值好不好看：
//   · 五条死路分得清（自然转世/滞留/鬼修/怨魂化/魂火散尽）；
//   · 神魂池有上限、id 不重复、到期的才取得到、取走了就不再回来；
//   · 附魂之后是第二世，带着前世姓名与记忆碎片；
//   · 记忆觉醒要写编年史、要按**原类型**把宿缘接回关系网、且不接已故者。
section('5f. 转世');
const rw = generateWorld({ preset: WORLD_PRESETS.medium, seed: 515, scatter: true });
const rrng = mulberry32(5150);

// 死路分流：先用纯对象把五条路的判据钉死（不依赖世界）
//
// ⚠️ 2026-09-21 契约变更（用户拍板）：**寿终优先**。
//    非寿终的死亡只可能来自 `hp <= 0`，所以「横死」段不再看境界，
//    `linger` 的 `level >= 30` 那一半被删（本就恒被 `hp <= 0` 短路，逐字等价）。
//    ⇒ `NATURAL` 现在**专给寿终**（寿终 + 牵挂 >= 2）；横死按**宿缘**分流（见下面 8-C 那一段）。
//
// ⚠️ 2026-09-21 第二次契约变更（8-C 落地）：`linger` 的兜底判据从
//    「横死即滞留」改成 06 册 §5.2 的「**有宿缘**」——
//    `collectBonds(entity).length > 0 ? LINGER : NATURAL`。
//    所以「横死 ⇒ 落哪条路」**不再由死亡方式决定**，只由宿缘决定。
//    ⇒ 本节凡是要守 `LINGER` 的样本，都**必须显式给出 `relations`**；
//      没有 `relations` 的手搓实体一律落 `NATURAL`（这也是真实世界的行为）。
//    更要紧的是：**「落哪条路」不该是这些断言的意图**。它们的意图是
//    「不能被判成 `WRAITH`/`GHOST`/`GONE`（那三条不进池）」，
//    所以落点改用**契约稳定的不变量** `[LINGER, NATURAL].includes(route)`（＝「必须进池」）。
//    这样将来再改兜底判据，这些断言不会跟着红一遍。
//
// ⚠️ 这一条原先**名不副实**：输入没有 `age`/`lifespan`，`diedOfOldAge` 恒假，
//    它测的是「低境界 + hp>0 且无寿元」这个**真实世界不存在**的输入，
//    只因旧代码兜底 `return NATURAL` 才变绿。现在改成**真正的寿终**：
//    活满寿元、且**恰好 2 条牵挂**（> 1 → 自然转世）。
check('死路：寿终正寝（有牵挂）→ 自然转世',
  deathRoute({
    level: 5, pollution: 0, karma: 0, hp: 50, age: 110 * 360, lifespan: 110 * 360,
    relations: new Map([[1, { type: 'kin', score: 60 }], [2, { type: 'kin', score: 60 }]]),
  }) === SOUL_ROUTES.NATURAL);
check('死路：横死 + 有宿缘 → 滞留幽冥',
  deathRoute({
    level: 5, pollution: 0, karma: 0, hp: 0,
    relations: new Map([[1, { type: 'kin', score: 60 }]]),
  }) === SOUL_ROUTES.LINGER);
// 下侧边界（8-C 新增）：横死 + **无宿缘** → 自然转世。
// 把兜底判据改回无条件 `return LINGER`，这条立刻红；只钉上面那条等于只钉了一侧。
check('死路：横死 + 无宿缘 → 自然转世',
  deathRoute({ level: 5, pollution: 0, karma: 0, hp: 0 }) === SOUL_ROUTES.NATURAL);
// ⚠️ 旧标题「元婴以上一律滞留」现在是**假的**，且有两层原因：
//    ① `linger` 的 `level >= 30` 那一半已删，元婴**寿终**会走 `GONE`/`NATURAL`；
//    ② 8-C 之后落点只由**宿缘**决定，与境界无关（无 `relations` 的元婴也落 `NATURAL`）。
//    这条改守它真正想守的东西：**横死的元婴**（`hp <= 0`）**有宿缘时**落 `LINGER`。
check('死路：横死的元婴 + 有宿缘 → 滞留',
  deathRoute({
    level: 35, pollution: 0, karma: 0, hp: 0,
    relations: new Map([[1, { type: 'kin', score: 60 }]]),
  }) === SOUL_ROUTES.LINGER);
check('死路：污染重 → 成鬼修',
  deathRoute({ level: 5, pollution: 45, karma: 0, hp: 0 }) === SOUL_ROUTES.GHOST);
check('死路：污染极重 → 怨魂化',
  deathRoute({ level: 5, pollution: 70, karma: 0, hp: 0 }) === SOUL_ROUTES.WRAITH);
check('死路：业障重 → 成鬼修',
  deathRoute({ level: 5, pollution: 0, karma: 75, hp: 50, age: 100 * 360 }) === SOUL_ROUTES.GHOST);
check('死路：业障滔天 → 怨魂化',
  deathRoute({ level: 5, pollution: 0, karma: 96, hp: 50, age: 100 * 360 }) === SOUL_ROUTES.WRAITH);

// ⚠️⚠️ 回归断言：**因果和污染都是「会顶到上限的累加器」，阈值必须贴着上限取。**
//
// 这一条对应的真实事故是「转世只在低境界里发生」：
//   实测金丹以上死者 422 人，临死因果 p50/p90 = 42/100。
//   而阈值曾经是 `karma >= 4`——那是从 `breakthroughChance` 抄来的
//   **突破惩罚**量纲（karma*0.025 封顶 0.2，所以在那边 4 就算重）。
//   照抄过来，422 人里 **422 人**被判成魂飞魄散，一个神魂都造不出来。
//   「强魂归来」这件事从来没出现过，而上面几条断言当时**全绿**——
//   因为它们手工构造实体时把 karma / pollution 写成了 0/5/45/70，
//   测的是一个真实世界永远不会出现的输入域。
const veteranKiller = { level: 25, pollution: 15, karma: 42, hp: 50, age: 28 * 360 };
// ⚠️ 落点**换过两次**（`NATURAL` → `LINGER` → 8-C 之后又回 `NATURAL`，因为它没有宿缘）。
//    两次变动都证明同一件事：**「落哪条路」不该是本条的判据**。
//    本条的意图（上面那个故事）是「karma 42 这个中位水平绝不能被判成 `WRAITH`/`GHOST`」
//    ——那两条路**不进池**，正是「422 人里 422 人被判魂飞魄散、整条转世链路变成死代码」
//    那场事故的入口。所以判据改成**契约稳定的不变量**：必须落在**会进池**的那两条路上。
check('杀过十几个人的金丹（因果 42，中位水平）不该被判魂飞魄散/怨魂化',
  [SOUL_ROUTES.LINGER, SOUL_ROUTES.NATURAL].includes(deathRoute(veteranKiller)),
  `判成了 ${ROUTE_LABEL[deathRoute(veteranKiller)]}（应落在会进池的 linger / natural）`);

// ⚠️⚠️ 回归断言：污染是**单调累加器**，所以必须按年龄折算，绝不能拿绝对值卡。
//
// 这一条对应的真实事故是「转世一次都没发生过」：
//   污染 = 0.0004/天，金丹寿元 620 年 = 223200 天 → 寿终时 ≈ 89，
//   再减去突破的 -1（约 29 次）≈ 60。而当时的阈值正是 `>= 60 → 怨魂化`，
//   于是**所有金丹以上的死者一律被判成魂飞魄散**，
//   实测「死了 246 个金丹以上、造出 0 个神魂」，整条转世链路变成死代码。
//
// 上面那几条断言当时**全绿**——因为它们的 pollution 是手写的 45/70，
// 而真实世界的输入域里，pollution 与 age 是绑死的。
// 教训：手工构造的输入域必须覆盖「真实世界会出现的取值组合」，否则等于没测。
const jindanAtDeath = { level: 25, pollution: 60, karma: 0, hp: 50, age: 620 * 360 };
// 同上：落点同样换过两次（这一位没有宿缘 ⇒ 8-C 之后落 `NATURAL`），但「污染 60 不该被判
// 怨魂化/鬼修」这个意图与上面那段事故注释仍然成立，别删。判据同样用契约稳定的不变量。
check('活了六百年的金丹（污染 60）不会因为污染被判魂飞魄散/怨魂化',
  [SOUL_ROUTES.LINGER, SOUL_ROUTES.NATURAL].includes(deathRoute(jindanAtDeath)),
  `判成了 ${ROUTE_LABEL[deathRoute(jindanAtDeath)]}（应落在会进池的 linger / natural）`);
// ⚠️ 这个对象必须**显式**给出 `lifespan` 与**至少 2 条**宿缘，否则测的不是它声称的东西：
//   · 没有 `lifespan` → 「寿终」那半（`diedOfOldAge`）恒假，测不到边界；
//   · 牵挂 **≤ 1 条** → 判 `gone`（新契约的阈值是 `<= 1`），而 `gone` **不进池**。
//     这一条的意图是「污染顶到上限**不等于**怨魂化，魂该**留得下**」，
//     所以必须给到 **2 条**牵挂，才会落到 `NATURAL`（进池等转世）。
const yuanyingAtDeath = {
  level: 35, pollution: 100, karma: 0, hp: 50, age: 1500 * 360,
  lifespan: 1500 * 360,
  relations: new Map([
    [7, { type: 'lover', score: 80 }],
    [8, { type: 'mentor', score: 70 }],
  ]),
};
check('元婴寿终（污染顶到上限）有牵挂 → 自然转世，留得下神魂',
  deathRoute(yuanyingAtDeath) === SOUL_ROUTES.NATURAL,
  `判成了 ${ROUTE_LABEL[deathRoute(yuanyingAtDeath)]}`);
const dirtyAtDeath = { level: 25, pollution: 100, karma: 0, hp: 50, age: 100 * 360 };
check('真正脏的人仍然入不了轮回（同龄人中脏出一大截）',
  deathRoute(dirtyAtDeath) === SOUL_ROUTES.WRAITH,
  `判成了 ${ROUTE_LABEL[deathRoute(dirtyAtDeath)]}`);

// ── 魂火散尽（第五路，2026-09-21 补齐）─────────────────────────
// 依据 G13-10：「走到河心，自己散了，像一盏油尽的灯……**能走到自己散的，
// 多半已经不累了**」。两半判据缺一不可：
//   · 「油尽」→ 寿终：`diedOfOldAge`（`hp > 0 && age >= lifespan`）；
//   · 「不累了」→ 牵挂少：`collectBonds(entity).length <= 1`。
// ⚠️ 阈值是 `<= 1` 而**不是** `=== 0`（2026-09-21，用户拍板）：在有家族、有宗门的
//    世界里「无牵挂」结构上不可能（实测候选池 0/0/0），`=== 0` 会让 `gone` 也成死路。
const goneSoul = {
  level: 35, hp: 50, age: 1500 * 360, lifespan: 1500 * 360,
  pollution: 100, karma: 0,
};
// 漏掉「寿终」那半（把 `diedOfOldAge` 的 `age >= lifespan` 写反）→ 这条会红。
check('死路：寿终 + 0 条牵挂 → 魂火散尽',
  deathRoute(goneSoul) === SOUL_ROUTES.GONE,
  `判成了 ${ROUTE_LABEL[deathRoute(goneSoul)]}`);
// 边界（下侧）：寿终 + **恰好 1 条**牵挂仍判 `gone`。把阈值改回 `=== 0` 这条会红。
check('死路：寿终 + 恰好 1 条牵挂 → 仍判魂火散尽（<=1 的边界）',
  deathRoute({ ...goneSoul, relations: new Map([[9, { type: 'lover', score: 80 }]]) })
    === SOUL_ROUTES.GONE,
  '牵挂 ≤ 1 → 魂火散尽');
// 边界（上侧）：寿终 + 2 条牵挂 → 自然转世。两条合起来把 `<= 1` 两侧钉住。
check('死路：寿终 + 2 条牵挂 → 自然转世',
  deathRoute({
    ...goneSoul,
    relations: new Map([
      [9, { type: 'lover', score: 80 }],
      [10, { type: 'kin', score: 60 }],
    ]),
  }) === SOUL_ROUTES.NATURAL);
// 横死（hp 已 0）**绝不**判散尽——`diedOfOldAge` 里的 `hp > 0` 就是防这一手。
// 若有人删掉那个 clause，被打死的魂会被**静默地**判成「寿终」→ `gone`，这条会红。
// ⚠️ 判据只钉 `!== GONE`，**不钉具体落哪条路**：8-C 之后横死按宿缘分流，
//    这一位没有宿缘 ⇒ 落 `NATURAL`。钉死落点会让这条在每次契约变更时无理由变红，
//    而它真正要守的只有「不散尽」这一件事。
const deadByBlade = { level: 5, pollution: 0, karma: 0, hp: 0, age: 999 * 360, lifespan: 100 * 360 };
check('死路：横死绝不判散尽（守住 hp>0 那半）',
  deathRoute(deadByBlade) !== SOUL_ROUTES.GONE,
  `判成了 ${ROUTE_LABEL[deathRoute(deadByBlade)]}（hp 已 0 的魂不该散尽）`);
// 未满寿元不是寿终 → 落到「横死」那一段 → 按宿缘分流。
// 若把 `diedOfOldAge` 的 `age >= lifespan` 写反（把它判成寿终），这条会红（会落 `GONE`）。
// ⚠️ 两侧都给：有宿缘 ⇒ `LINGER`，无宿缘 ⇒ `NATURAL`；合起来钉的就是「绝不落 `GONE`」。
//    旧版本只写「落 `LINGER`」，8-C 之后那句断言的是旧契约，不是它想守的东西。
const notYetOld = { level: 5, pollution: 0, karma: 0, hp: 50, age: 50 * 360, lifespan: 100 * 360 };
check('死路：未满寿元 + 有宿缘 → 滞留幽冥（不判散尽）',
  deathRoute({ ...notYetOld, relations: new Map([[1, { type: 'kin', score: 60 }]]) })
    === SOUL_ROUTES.LINGER);
check('死路：未满寿元 + 无宿缘 → 自然转世（仍不判散尽）',
  deathRoute(notYetOld) !== SOUL_ROUTES.GONE,
  `判成了 ${ROUTE_LABEL[deathRoute(notYetOld)]}（未满寿元不该散尽）`);

// ⚠️⚠️ 回归断言：**寿终优先**。删掉 `deathRoute` 开头那个 `if (diedOfOldAge(entity))`
//    分支，这条立刻变红（会落到 `karma >= 95 → WRAITH`）。
//    为什么必须钉死：寿终要求活到 110–200 岁，而活得久就必然把 karma 顶到
//    `KARMA_MAX = 100`，于是所有寿终者一律被判怨魂化、`natural` **结构上不可达**。
//    老死必须压过业障。
//    ⚠️ 注意本条的**样本是手搓的**，不是实测分布：`_natprobe.mjs` 在改动落地后
//    实测「寿终 0 例」（旧读数「4/4 判怨魂化」属于改动前的世界线，已不可复现）。
//    也就是说这条断言钉的是**分支顺序**，不是某个统计量——这是对的，
//    因为当前世界里根本没有寿终样本可供统计。
check('死路：寿终 + 业障滔天 → 自然转世（寿终优先）',
  deathRoute({
    level: 35, pollution: 0, karma: 96, hp: 50, age: 1500 * 360, lifespan: 1500 * 360,
    relations: new Map([[1, { type: 'kin', score: 60 }], [2, { type: 'kin', score: 60 }]]),
  }) === SOUL_ROUTES.NATURAL,
  '老死压过业障');

// ⚠️⚠️ 回归断言：**寿元被砸到 age 以下 ≠ 寿终**（2026-09-21 修）。
//    场景：筑基(240 年) 在 224 岁突破失败 → `applyBreakthroughFailure`
//    （`sim/cultivation.js`，三个后果档里**两个**会这么做，合计 80%）
//    把境界退回炼气并**重算 `lifespan` = 110**，于是 `age >= lifespan`
//    在**同一个 tick** 里变成真，随后死亡清扫就把它判成「寿终」。
//    但那是「寿元折损而死」，不是寿终正寝——判成寿终会让它**静默地**
//    流进 `gone` / `natural`，把魂路账本变成假读数。
//    判据靠 `life.js` 的 `stepEntity` 在每个 tick 开头写的 `_lifespan0`
//    （临时字段，**不进存档**）：若本 tick 开始时 `age` 还没到那时的寿元，
//    就说明寿元是**本 tick 被改小的**。
//    ⚠️ 删掉 `diedOfOldAge` 里那个 `_lifespan0` 判断，这条立刻变红
//    （会判成寿终 → 牵挂 0 ≤ 1 ⇒ `GONE`）。**这就是它要钉死的东西。**
check('死路：寿元折损（突破失败砸寿元）不算寿终 → 落横死那一支',
  diedOfOldAge({ hp: 50, age: 224.3, lifespan: 110, _lifespan0: 240 }) === false
  && deathRoute({
    level: 9, pollution: 0, karma: 100, hp: 50, age: 224.3, lifespan: 110, _lifespan0: 240,
  }) === SOUL_ROUTES.WRAITH,
  'age 224.3 · lifespan 110 · 本 tick 开始时的寿元 240 ⇒ 不得判寿终');

// 反向钉死（防「修过头」）：**真**寿终不能被误伤。
// 本 tick 开始时就已越线（`age >= _lifespan0`）⇒ 仍判寿终。
check('寿元折损的修复没误伤真寿终：tick 开始就已越线 → 仍判寿终',
  diedOfOldAge({ hp: 50, age: 110.4, lifespan: 110, _lifespan0: 110 }) === true,
  'age 110.4 · lifespan0 110（未被改小）');

// ⚠️ **生产者侧**——上面那两条断言是**手搓实体**的（直接把 `_lifespan0` 写进字面量），
//    所以把 `life.js` 里那句 `e._lifespan0 = e.lifespan;` 删掉，它们**照样绿**。
//    生产者必须单独钉一次，否则「修好了」只证明了一半。
//    用一个**全新小世界**，不碰上面那个共享 `world`（避免挪动它的世界线）。
{
  const lw = generateWorld({ preset: WORLD_PRESETS.small, seed: 909, scatter: true });
  const ll = new Life(lw, mulberry32(909));
  ll.processPendingSpawns();
  // 先跑几年让世界稳定，再取一份「本 tick **之前**就存在」的名单。
  // ⚠️ 必须这样取名单：本 tick 内**新生**的实体还没被 `stepEntity` 走过，
  //    没有快照是**正常的**（实测 155 个在世生灵里有 2 个是这种）。
  //    直接断言「所有在世生灵都有快照」会**无理由撞红**——那正是
  //    「假红工厂」的定义（一条会无理由撞红的断言和一条永远绿的一样有害）。
  for (let d = 0; d < 360 * 5; d += 3) { lw.day += 3; ll.step(3); }
  const before = lw.entities.slice();
  lw.day += 3; ll.step(3);
  const stepped = before.filter((e) => lw.entities.includes(e));
  check('寿元快照真的被写下（`stepEntity` 的生产者侧）',
    stepped.length > 0 && stepped.every((e) => typeof e._lifespan0 === 'number'),
    `${stepped.length} 个「本 tick 之前就存在」的生灵全部有 _lifespan0`
    + '（删掉 life.js 里那句赋值，本条立刻变红）');
}

// 五路的中文标签是**考古定名**（`00_文案使用说明:229-239` / `06册 §5.2`），
// 「考古定名，不得擅改或另造同义词」——一字都不能漂移。
// 尤其 `ghost` 必须读作「鬼修」（魂**留下**成鬼修），不是旧代码那个反义的「魂飞魄散」。
// 键名沿用是历史原因、值存进存档（`soul.route`），所以这里**只校验值不校验键序**。
check('ROUTE_LABEL 五路齐全且 ghost === 鬼修',
  ['natural', 'linger', 'ghost', 'wraith', 'gone'].every((k) => typeof ROUTE_LABEL[k] === 'string')
  && Object.keys(ROUTE_LABEL).length === 5
  && ROUTE_LABEL.ghost === '鬼修',
  Object.entries(ROUTE_LABEL).map(([k, v]) => `${k}:${v}`).join(' '));

// 留魂门槛：境界越高越留得住，而且必须是**严格递减**的一串概率。
// 原先这里写的是「炼气 = 0」，那个门槛把分母砍掉了 98%，是上面那场事故的另一半原因。
check('境界越高越留得住神魂（炼气千中取二 → 元婴必留）',
  soulTier({ level: 1 }) > 0
  && soulTier({ level: 1 }) < soulTier({ level: 15 })
  && soulTier({ level: 15 }) < soulTier({ level: 25 })
  && soulTier({ level: 25 }) < soulTier({ level: 35 })
  && soulTier({ level: 35 }) === 1,
  `炼气 ${soulTier({ level: 1 })} · 筑基 ${soulTier({ level: 15 })}`
  + ` · 金丹 ${soulTier({ level: 25 })} · 元婴 ${soulTier({ level: 35 })}`);
check('凡人（未觉醒）不留神魂', soulTier({ level: 0 }) === 0);

// 造三个人：一个还在世的旧人、一个已故旧人、一个将死的前世
const mkPersonIn = (world, rng, x, y, name) => {
  const e = world.addEntity({
    sp: 'cultivator', x, y, vx: 0, vy: 0, hp: 100, maxHp: 100, age: 100,
    lifespan: 1e9, faction: 0, village: 0, state: 'wander', timer: 0,
    tx: x, ty: y, anim: 0, face: 1, name, kills: 0, carried: 0, relations: new Map(),
  });
  initEntity(e, rng, { cultivator: true });
  return e;
};
const mkPerson = (x, y, name) => mkPersonIn(rw, rrng, x, y, name);
const partner = mkPerson(32, 32, '旧人');
const gone = mkPerson(33, 33, '已故旧人');
gone.hp = 0;
const dead = mkPerson(34, 34, '前世');
dead.level = 35;
dead.pollution = 0;
dead.karma = 0;
dead.relations.set(partner.id, { type: 'lover', score: 80, since: 0 });
dead.relations.set(gone.id, { type: 'mentor', score: 70, since: 0 });

enterNether(rw, dead, rrng);
// 账本真的接上了：`soulLog` 在 `enterNether` 里**记在抽签之前**（2026-09-21 前移），
// 所以它是「五路普查」——**入池的魂只是 `natural`/`linger` 两路的子集**
// （`ghost`/`wraith`/`gone` 三路记一笔就 `return null`，落选的 `natural`/`linger` 也留在池外）；
// 而 `nextSoulId` **只在真正 push 那一次自增**。
// ⇒ 恒等式由 `===` 放宽为 `>=`：记过账的两路之和**不小于**累计入池数。
// 会红的情形：魂**入了池却没记账**（和 < nextSoulId-1，账本漏计一路）。
// ⚠️ 此处 `dead` 是 `tier === 1` 的元婴、无抽签落选，所以和**恰好相等**；
//    但断言按新契约用 `>=`，不依赖这个巧合。
check('魂路账本不漏计（natural+linger >= nextSoulId-1）',
  rw.soulLog.natural + rw.soulLog.linger >= rw.nextSoulId - 1,
  `natural ${rw.soulLog.natural} + linger ${rw.soulLog.linger}`
  + ` · nextSoulId ${rw.nextSoulId}`);
// ⚠️ `dead` 的 `lifespan` 是 1e9、`age` 只有 100，**并非寿终**（旧标题「元婴寿终」
//    名不副实）。这里核的是「元婴死后确实有一个魂进了池」。
check('元婴死后留下神魂', rw.souls.length === 1, `${rw.souls.length} 个`);
const soul = rw.souls[0];
check('神魂记着前世姓名与境界',
  soul && soul.ofName === '前世' && soul.ofLevel === 35,
  soul ? `${soul.ofName}·${soul.ofLevel} 重·${ROUTE_LABEL[soul.route]}` : '无');
check('宿缘被抽成清单（只留分量够重的）', soul && soul.bonds.length === 2,
  soul ? `${soul.bonds.length} 段` : '无');
check('未到期的神魂取不走', takeDueSoul(rw) === null);

rw.day = soul.dueDay + 1;
const taken = takeDueSoul(rw);
check('到期后能取到神魂', Boolean(taken) && taken.ofName === '前世');
check('取走后池里不再有它（同一个神魂不会转世两次）',
  !rw.souls.some((s) => s.id === taken.id));

const newborn = mkPerson(35, 35, '今生');
newborn.level = 1;
attachSoul(rw, newborn, taken, rrng);
check('附魂之后是第二世', newborn.incarnation === 2, `第 ${newborn.incarnation} 世`);
check('附魂后带上前世档案',
  Boolean(newborn.pastLife) && newborn.pastLife.name === '前世' && newborn.pastLife.fragments >= 1,
  newborn.pastLife ? `前世 ${newborn.pastLife.name} · 记忆碎片 ${newborn.pastLife.fragments}` : '无');
check('附魂后记下来源神魂（用于断言不重复）', newborn.soulId === taken.id);
check('元婴的前世灵根被带了过来', Boolean(newborn.root));

// 「第几世」的**链式**累加：一次转世得到 2 是对的，问题出在第二次。
//
// `soul.incarnation` 原来**全仓只有读、没有写**（`attachSoul` 读它、
// 而 `enterNether` 从不写它），于是每个神魂这一列都是 `undefined`、
// 兜底成 1，**每一世回来都得到 2**——传了七世的魂和刚死一次的魂长得一模一样，
// 而检视面板上就静静地写着一个错的数字。
//
// ⚠️ 上面那条 `附魂之后是第二世` 的断言**抓不住它**（第一世本来就该得到 2）。
// 必须再走一世才显形。这就是「单点断言测不出链路」的典型样子——
// 和长测那条「转世真的在发生」要抓的是同一类问题，只是一个在时间轴上、
// 一个在次数轴上。
check('再死一次是第三世（这一条才抓得住「第几世」恒为 2）', (() => {
  const again = mkPerson(36, 36, '二世');
  again.level = 35;
  again.incarnation = newborn.incarnation;   // 他已经是第二世了
  again.pollution = 0;
  again.karma = 0;
  enterNether(rw, again, rrng);
  const s2 = rw.souls[rw.souls.length - 1];
  if (!s2 || s2.ofName !== '二世') return false;
  rw.day = s2.dueDay + 1;
  const t2 = takeDueSoul(rw);
  if (!t2) return false;
  const third = mkPerson(37, 37, '三世');
  third.level = 1;
  attachSoul(rw, third, t2, rrng);
  return third.incarnation === 3;
})(), `第 ${newborn.incarnation} 世 → 再一世应为第 3 世`);

// 觉醒：修到筑基，前世碎片该被冲开
newborn.level = 10;
newborn.mind = 80;
const chronBefore = rw.chronicle.length;
const msBefore = rw.milestones.length;
stepReincarnation(rw, 1, rrng);
check('修到筑基时想起前世', newborn.pastLife.remembered === true,
  `抉择：${newborn.pastLife.choice}`);
check('觉醒写进了编年史', rw.chronicle.length > chronBefore,
  `+${rw.chronicle.length - chronBefore} 条`);
// 用户框架 §6.1 把「重要转世」列进大事账本要记的八类之一。这一支原先只写
// `record`，于是「有人想起了前世」快进几十年后就查不到了（夺舍那半早就进了）。
// 变红的故障：有人把 `reincarnation.js` 那四处 `milestone` 改回 `record`
// （编年史那条断言**照样是绿的**，因为 `milestone` 内部也写编年史——
//  所以必须单独盯 `milestones` 这本账，不能只看编年史有没有涨）。
const msAdded = rw.milestones.slice(msBefore);
check('想起前世也进了大事账本（kind = reincarn）',
  msAdded.some((m) => m.kind === 'reincarn'),
  `+${msAdded.length} 条 · ${msAdded.map((m) => m.kind).join('、') || '(一条都没有)'}`);
check('宿缘按**原类型**接回今生',
  (newborn.relations.get(partner.id) || {}).type === 'lover',
  `接回 ${newborn.relations.size} 段`);
check('两边都记了这一笔（只写单向等于没接上）',
  (partner.relations.get(newborn.id) || {}).type === 'lover');
check('指向已故者的宿缘不会被接回', !newborn.relations.has(gone.id));
check('宿缘的分值按两世抉择打了折',
  (newborn.relations.get(partner.id) || {}).score < 80,
  `${(newborn.relations.get(partner.id) || {}).score} < 80`);

// 神魂池的上限
const cw = generateWorld({ preset: WORLD_PRESETS.small, seed: 516, scatter: true });
const crng = mulberry32(5160);
for (let i = 0; i < SOUL_CAP + 20; i += 1) {
  const e = mkPersonIn(cw, crng, 30, 30, `排队${i}`);
  e.level = 35;
  enterNether(cw, e, crng);
}
check('神魂池有上限', cw.souls.length === SOUL_CAP,
  `${cw.souls.length} / ${SOUL_CAP}`);
check('神魂 id 不重复',
  new Set(cw.souls.map((s) => s.id)).size === cw.souls.length);
check('nextSoulId 比池里最大的 id 还大',
  cw.nextSoulId > Math.max(...cw.souls.map((s) => s.id)),
  `next ${cw.nextSoulId} · max ${Math.max(...cw.souls.map((s) => s.id))}`);

// ⚠️⚠️ 回归断言：**池子满了之后不能把队列饿死。**
//
// 溢出策略原本丢的是 `dueDay` 最小的那个——也就是**马上要到期、该被取走的那个**。
// 于是池里的最小 `dueDay` 被每一次新死亡不断往后推，`takeDueSoul` 再也找不到到期的魂。
// 症状**完全静默**：池子稳定在 120、`nextSoulId` 一直涨、每个函数都正常返回，
// 只是 800 年跑下来「活着的转世者 = 0」（实测：造出 366 个魂，到第 800 年一个都没有）。
//
// 上面那几条断言抓不住它——它们只看池子大小和 id，而这两样在饿死状态下**全都正常**。
// 必须把「时间往前走 + 新魂不断进来」这个动态过程演一遍才测得出。
const sw = generateWorld({ preset: WORLD_PRESETS.small, seed: 517, scatter: true });
const srng = mulberry32(5170);
const soulSource = (i) => {
  const e = mkPersonIn(sw, srng, 30, 30, `魂源${i}`);
  e.level = 35;
  return e;
};
for (let i = 0; i < SOUL_CAP + 40; i += 1) enterNether(sw, soulSource(i), srng);
let tookOverTime = 0;
for (let y = 1; y <= 400; y += 1) {
  sw.day += 360;                                  // 又过了一年
  if (takeDueSoul(sw)) tookOverTime += 1;         // 到期就该取得到
  enterNether(sw, soulSource(10000 + y), srng);   // 同时还有新魂挤进来
}
check('池满之后不会把队列饿死（时间往前走，到期的魂仍然取得到）',
  tookOverTime > 0,
  `400 年里取到 ${tookOverTime} 个（溢出策略写反时这里是 0）`);

// 存读档：转世相关字段一个都不能丢
const rw2 = deserializeWorld(serializeWorld(rw));
const nb2 = rw2.entities.find((e) => e.name === '今生');
check('转世者字段能存能读',
  Boolean(nb2) && nb2.incarnation === newborn.incarnation
  && nb2.soulId === newborn.soulId
  && Boolean(nb2.pastLife) && nb2.pastLife.remembered === true
  && nb2.pastLife.name === '前世',
  nb2 ? `第 ${nb2.incarnation} 世 · 前世 ${nb2.pastLife && nb2.pastLife.name}` : '找不到人');
const cw2 = deserializeWorld(serializeWorld(cw));
check('神魂池能存能读',
  cw2.souls.length === cw.souls.length && cw2.nextSoulId === cw.nextSoulId,
  `${cw2.souls.length} 个 · next ${cw2.nextSoulId}`);
check('神魂里的宿缘清单原样存回来',
  cw2.souls.every((s, i) => JSON.stringify(s.bonds) === JSON.stringify(cw.souls[i].bonds)));

// ── 5g. 法宝 ─────────────────────────────────────────────
//
// 这一块守两件事：
//   一、**加成真的接上了**。`combatPower` 里原来那一项写的是 `entity.equipTier`，
//       而那个字段**全世界没有任何一处写过它**——装备加成整整缺席了一整个版本，
//       所有断言全绿，因为没人测「装备到底加不加战力」。
//   二、**法宝不会凭空消失**。法宝是挂在实体上的，而实体有好几条被直接移除的路径
//       （飞升、神力抹除、雷击、陨石、瘟疫）。少接一条，那条路径上的东西就静默没了。
section('5g. 法宝：命名 / 加成 / 履历 / 器灵 / 碎裂 / 守恒');

// ── 命名：拼装名 vs 铭名 ──
check('凡品用拼装名（原作的取名方式）',
  artifactName(() => 0.99, '武器', 0, 0) === '粗制凡品武器',
  artifactName(() => 0.99, '武器', 0, 0));
check('铭名的槽位表没有废槽位',
  ARTIFACT_NAMES.every((n) => n.slots.length > 0 && n.slots.every((s) => EQUIP_SLOTS.includes(s))),
  `${ARTIFACT_NAMES.length} 个铭名`);
// 铭名不能挂到说不通的槽位上（「星坠剑胎」不能被穿在脚上）
{
  const nr = mulberry32(20260916);
  let bad = 0;
  for (const slot of EQUIP_SLOTS) {
    for (let i = 0; i < 80; i += 1) {
      const n = artifactName(nr, slot, 3, 4);
      const hit = ARTIFACT_NAMES.find((x) => x.name === n);
      if (hit && !hit.slots.includes(slot)) bad += 1;
    }
  }
  check('铭名不会挂到说不通的槽位上', bad === 0, bad ? `${bad} 次` : '400 次抽签');
}

// ── 加成真的接上了 ──
const testSword = {
  id: 1, slot: '武器', tier: 3, quality: 4, name: '星坠剑胎',
  durability: 100, maxDurability: 100, scars: 0, spirit: null, history: [],
};
// ⚠️ 这些字段一个都不能少：`cultivationRate` 读 mind / pollution / madUntil，
// 少一个就是 NaN——而 NaN 在比较里既不大于也不小于，断言会以最难看的方式失败。
const baseAttrs = {
  x: 20, y: 20, root: null, dao: null, mind: 70, pollution: 0, madUntil: -1,
};
const bareLv16 = { ...baseAttrs, level: 16, artifacts: [] };
const armedLv16 = { ...baseAttrs, level: 16, artifacts: [testSword] };
check('法宝真的进了战力（原来那一项恒为 1）',
  combatPower(armedLv16) > combatPower(bareLv16),
  `+${((combatPower(armedLv16) / combatPower(bareLv16) - 1) * 100).toFixed(1)}%`);
check('法宝加成是零头，盖不过境界',
  combatPower(armedLv16) / combatPower(bareLv16) < 1.35,
  `+${((combatPower(armedLv16) / combatPower(bareLv16) - 1) * 100).toFixed(1)}%`
  + `（金丹 level16 的境界项本身是 ${combatPower(bareLv16).toFixed(1)} 倍）`);
check('法宝也进了修炼速率',
  cultivationRate(world, armedLv16) > cultivationRate(world, bareLv16),
  `+${((cultivationRate(world, armedLv16) / cultivationRate(world, bareLv16) - 1) * 100).toFixed(1)}%`);
check('法宝进了渡劫成功率',
  breakthroughChance({ level: 20, equipBonus: 0.2 }) > breakthroughChance({ level: 20, equipBonus: 0 }),
  `${breakthroughChance({ level: 20, equipBonus: 0 }).toFixed(3)} → ${breakthroughChance({ level: 20, equipBonus: 0.2 }).toFixed(3)}`);
check('渡劫那一项有上限（一件绝品不能把渡劫变成必过）',
  breakthroughChance({ level: 20, equipBonus: 5 }) === breakthroughChance({ level: 20, equipBonus: 0.06 }));

// ── 履历：这块的全部意义 ──
{
  const rel = {
    ...testSword,
    history: [[0, 'forged', '陆青玄'], [360, 'found', '沈云'], [720, 'inherited', '顾白']],
  };
  const line = ownerLine(rel);
  check('履历能数出历任主人',
    line.count === 3 && line.text.includes('陆青玄') && line.text.includes('顾白'), line.text);
  check('同一主人连续记两次只算一任',
    ownerLine({ ...rel, history: [[0, 'forged', '甲'], [360, 'found', '甲']] }).count === 1);
  check('只有一任主人时不吹「已历一主」', ownerLine({ ...rel, history: [[0, 'forged', '甲']] }).text === '');
}

// ── 器灵：三个条件 ──
const aw = generateWorld({ preset: WORLD_PRESETS.small, seed: 3131, scatter: false });
const arng = mulberry32(777);
aw.day = 0;
const owner = {
  id: 9001, name: '试验甲', level: 20, hp: 100, maxHp: 100, x: 10, y: 10, artifacts: [],
};
aw.entities.push(owner);
const blade = {
  id: 1, slot: '武器', tier: 2, quality: 3, name: '绝品宝品武器',
  durability: 100, maxDurability: 100, scars: 0,
  forgedDay: 0, forgedByName: '试验甲', ownerId: 9001, ownerName: '试验甲',
  heldSince: 0, spirit: null, history: [[0, 'forged', '试验甲']], lostDay: -1, x: 10, y: 10,
};
owner.artifacts.push(blade);
aw.day = 49 * 360;
stepArtifacts(aw, 3, arng);
check('相伴不足五十年不出器灵', blade.spirit === null, `第 ${Math.floor(aw.day / 360)} 年`);
aw.day = 50 * 360;
stepArtifacts(aw, 3, arng);
check('相伴五十年，器灵初生（原作台词）',
  Boolean(blade.spirit) && blade.spirit.name.length > 0,
  blade.spirit ? `${blade.spirit.name}·${blade.spirit.personality}` : '没出');
check('器灵一醒，这东西必定有名有姓',
  hasProperName(blade), blade.name);

// 凡品相伴再久也不出器灵
const junk = {
  ...blade, id: 2, tier: 0, quality: 0, name: '粗制凡品武器', spirit: null,
  heldSince: 0, history: [[0, 'forged', '试验甲']],
};
owner.artifacts.push(junk);
aw.day = 400 * 360;
stepArtifacts(aw, 3, arng);
check('凡品相伴四百年也不出器灵', junk.spirit === null, junk.name);
// 精良以下的宝品也不出（quality 这一条单独守一次）
const dull = {
  ...blade, id: 3, tier: 3, quality: 1, name: '普通仙品武器', spirit: null,
  heldSince: 0, history: [[0, 'forged', '试验甲']],
};
owner.artifacts.push(dull);
aw.day = 500 * 360;
stepArtifacts(aw, 3, arng);
check('粗制的东西相伴再久也不出器灵', dull.spirit === null, dull.name);

// ── 器灵能挡碎裂，但不是无限 ──
{
  const wr = mulberry32(5);
  owner.artifacts = [blade];
  let broken = false;
  let rounds = 0;
  for (let i = 0; i < 80 && !broken; i += 1) {
    wearArtifacts(aw, owner, 20, wr);
    rounds += 1;
    if (!owner.artifacts.includes(blade)) broken = true;
  }
  check('器灵能挡碎裂，但第四次就挡不住了',
    broken && blade.scars === SPIRIT_MAX_SCARS,
    `${rounds} 轮磨断 · 留下 ${blade.scars} 道痕（上限 ${SPIRIT_MAX_SCARS}）`);
  // 裂痕曾经也写进履历，结果同一任主人的五道痕把履历的格子占满，
  // `ownerLine` 就再也说不出「它换过几个主人」了——而那正是这块的全部意义。
  // 所以这里守的是「履历里**没有 scar**」，不是「履历只有一条」：
  // 器灵初生那一笔（kind='spirit'）是应该占格子的。
  const scarEntries = blade.history.filter((h) => h[1] === 'scar').length;
  check('裂痕不占履历（否则履历再也说不出「换过几个主人」）',
    blade.scars > 0 && scarEntries === 0,
    `${blade.scars} 道痕 · 履历 ${blade.history.length} 条（${blade.history.map((h) => h[1]).join('/')}）`);
  check('每道痕都让强度掉一截',
    artifactAxis({ tier: 3, quality: 4, scars: 3 }) < artifactAxis({ tier: 3, quality: 4, scars: 0 }),
    `${artifactAxis({ tier: 3, quality: 4, scars: 0 }).toFixed(3)} → ${artifactAxis({ tier: 3, quality: 4, scars: 3 }).toFixed(3)}`);
}
// 没器灵的，一磨就碎
{
  const wr = mulberry32(6);
  const plain = { ...testSword, id: 7, name: '精良灵品武器', tier: 1, quality: 2, spirit: null };
  owner.artifacts = [plain];
  for (let i = 0; i < 40 && owner.artifacts.includes(plain); i += 1) wearArtifacts(aw, owner, 20, wr);
  check('没器灵的磨到零就碎', !owner.artifacts.includes(plain));
}

// ── 体修不修法宝（原作 DAO_PATHS 里体修的注：『不修法宝，只炼肉身』）──
{
  const body = {
    id: 9002, name: '体修乙', level: 20, hp: 100, maxHp: 100, x: 10, y: 10, artifacts: [],
    dao: { path: { key: 'body' }, stage: 0, progress: 0 },
  };
  aw.entities.push(body);
  check('体修不收法宝',
    giveTo(aw, body, { ...testSword, id: 91, history: [] }, arng, 'found') === false);
  check('体修也炼不出法宝', forgeArtifact(aw, body, arng) === null);
}

// ── 飞升与遗蜕：两条最容易漏的路径 ──
{
  const dw = generateWorld({ preset: WORLD_PRESETS.small, seed: 4141, scatter: false });
  const drng = mulberry32(414);
  const asc = {
    id: 9101, name: '飞升丙', level: 50, hp: 100, maxHp: 100, x: 20, y: 20,
    artifacts: [{ ...testSword, id: 500, history: [[0, 'forged', '飞升丙']] }],
  };
  dw.entities.push(asc);
  const n = leaveArtifacts(dw, asc, drng);
  check('飞升者的法宝留在原地（不随人凭空消失）',
    n === 1 && asc.artifacts.length === 0 && dw.artifacts.some((a) => a.id === 500),
    `留下 ${n} 件`);

  const taker = { id: 9201, name: '取宝丁', level: 10, hp: 100, maxHp: 100, x: 20, y: 20, artifacts: [] };
  dw.entities.push(taker);
  const got = claimGroundArtifact(dw, taker, 500, drng, 'found');
  check('遗蜕里的法宝能被取走',
    Boolean(got) && taker.artifacts.length === 1 && !dw.artifacts.some((a) => a.id === 500));
  check('取不到时不报错，只是扑空（东西可能先被人捡走了）',
    claimGroundArtifact(dw, taker, 999, drng, 'found') === null);
}

// ── 真实世界：不变量 + 守恒律 ──
{
  const fw = generateWorld({ preset: WORLD_PRESETS.small, seed: 6161, scatter: true });
  const fl = new Life(fw, mulberry32(616));
  fl.processPendingSpawns();
  for (let y = 0; y < 150; y += 1) {
    for (let d = 0; d < 360; d += 3) { fw.day += 3; fl.step(3); }
  }
  const seen = new Map();
  let dup = 0;
  for (const a of fw.artifacts) {
    if (seen.has(a.id)) dup += 1;
    seen.set(a.id, 'ground');
  }
  for (const e of fw.entities) {
    for (const a of (e.artifacts || [])) {
      if (seen.has(a.id)) dup += 1;
      seen.set(a.id, e.name);
    }
  }
  check('没有法宝同时出现在两处（在手的 vs 地上的）', dup === 0, `${seen.size} 件 · 重复 ${dup}`);
  check('法宝真的被炼出来了', fw.artifactLog.forged > 0, JSON.stringify(fw.artifactLog));
  const fs = artifactStats(fw);
  check('法宝在换手', fs.travelled > 0, `${fs.travelled} 件换过三手以上 · 在世 ${fs.live}`);
  // 守恒律：**这一条是整块里最值钱的断言**。
  // 法宝挂在实体上，而实体有好几条被直接移除的路径；漏接任何一条，
  // 那批法宝就静默消失，而所有别的断言照样全绿。
  // 实测就是这么抓到「飞升者的法宝随人一起没了」（600 年 41 件）。
  //
  // ⚠️ 本块**不跑裂缝**（只 `fl.step`），所以四条跨位面流水恒为 0——
  //    但**仍写进等式**：D6-3 C 包起「法宝会离开凡间」（跌入者带进幽冥），
  //    漏写会让这条判据在「哪天本块开始跑裂缝」时静默失去意义（等式右端少了流出项）。
  //    等式口径：`造出 + 流入 === 在世 + 碎 + 朽 + 流出`
  //    （流入 = 上界漏入 `riftIn` + 幽冥漏入 `netherIn`；
  //      流出 = 漏去上界 `riftOut` + 带去幽冥 `netherOut`）。
  check('法宝不会凭空消失（守恒律）',
    fs.live + fw.artifactLog.broken + fw.artifactLog.decayed
      + (fw.artifactLog.riftOut || 0) + (fw.artifactLog.netherOut || 0)
    === fw.artifactLog.forged
      + (fw.artifactLog.riftIn || 0) + (fw.artifactLog.netherIn || 0),
    `造出 ${fw.artifactLog.forged} + 流入 ${(fw.artifactLog.riftIn || 0) + (fw.artifactLog.netherIn || 0)}`
    + ` = 在世 ${fs.live} + 碎 ${fw.artifactLog.broken} + 朽 ${fw.artifactLog.decayed}`
    + ` + 流出 ${(fw.artifactLog.riftOut || 0) + (fw.artifactLog.netherOut || 0)}`);

  const fw2 = deserializeWorld(serializeWorld(fw));
  check('地上的法宝能存能读',
    JSON.stringify(fw2.artifacts) === JSON.stringify(fw.artifacts), `${fw.artifacts.length} 件`);
  let sameOn = true;
  for (let i = 0; i < fw.entities.length; i += 1) {
    if (JSON.stringify(fw.entities[i].artifacts || []) !== JSON.stringify(fw2.entities[i].artifacts || [])) {
      sameOn = false;
      break;
    }
  }
  check('在手的法宝逐字段存回来（含历任主人）', sameOn);
  check('法宝账本与 id 计数器存回来了',
    fw2.nextArtifactId === fw.nextArtifactId
    && JSON.stringify(fw2.artifactLog) === JSON.stringify(fw.artifactLog),
    `next ${fw2.nextArtifactId}`);
  check('读档后 nextArtifactId 比世上最大的 id 还大',
    (() => {
      let max = 0;
      for (const a of fw2.artifacts) max = Math.max(max, a.id);
      for (const e of fw2.entities) for (const a of (e.artifacts || [])) max = Math.max(max, a.id);
      return fw2.nextArtifactId > max;
    })());
}

// ── 5h. 血脉与家世 ────────────────────────────────────────
//
// 转世让一个人活得比一世长，法宝让一件东西活得比人长，
// 世家让一个姓氏活得比所有人都长。这一节钉的是**三件事真的接上了**，
// 不是数值好不好看：
//   · 血脉不再是只写不读的字段（寿元 / 气运 / 战力 / 修行四条轴）；
//   · 天资与家传血脉真的从双亲传到子嗣，而且不消耗主随机流；
//   · 世家立得出来、传得下去、也**会断绝**。
section('5h. 血脉与家世：遗传 / 世家 / 四轴加成');

// ── 一、血脉的四条轴 ──────────────────────────────────────
// 这一列在改动之前是「只写不读」的：名字写进实体、存进存档、面板上显示，
// 但没有任何公式读过它。下面四条断言就是钉住它现在真的接上了。
{
  const attrs = {
    x: 20, y: 20, root: null, dao: null, mind: 70, pollution: 0, madUntil: -1,
    techniques: [], artifacts: [], fortune: 40,
  };
  const mk = (id, bloodline) => ({ ...attrs, id, level: 16, bloodline });
  const plain = mk(1, null);
  const sword = mk(2, '剑心血脉');
  const tiger = mk(3, '白虎血脉');
  const star = mk(4, '星辰血脉');
  const kylin = mk(5, '麒麟血脉');
  const xuan = mk(6, '玄武血脉');
  const atk = (a, b) => ((a / b - 1) * 100).toFixed(1);
  check('血脉真的进了战力（原来这一列只写不读）',
    combatPower(sword) > combatPower(plain),
    `剑心血脉 +${atk(combatPower(sword), combatPower(plain))}%`);
  check('血脉加成是零头，盖不过境界',
    combatPower(tiger) / combatPower(plain) < 1.15,
    `白虎血脉 +${atk(combatPower(tiger), combatPower(plain))}%`);
  check('血脉也进了修行速率',
    cultivationRate(world, star) > cultivationRate(world, plain),
    `星辰血脉 +${atk(cultivationRate(world, star), cultivationRate(world, plain))}%`);
  check('血脉进了寿元',
    lifespanForEntity(xuan, 16) > lifespanForEntity(plain, 16),
    `玄武血脉 ${lifespanForEntity(xuan, 16)} 天 > 无血脉 ${lifespanForEntity(plain, 16)} 天`);
  check('血脉进了气运（麒麟）',
    bloodlineProfile('麒麟血脉', 'fortune') > 0 && bloodlineProfile(null, 'fortune') === 0,
    `+${bloodlineProfile('麒麟血脉', 'fortune')}`);
  check('十六种血脉每一条都至少接上一条轴',
    BLOODLINES.every((b) => Object.values(b.profile || {}).some((v) => v > 0)),
    `${BLOODLINES.length} 条`);
  check('血脉名字能查回表（存档只存名字）',
    bloodlineByName('剑心血脉') && bloodlineByName('剑心血脉').name === '剑心血脉'
    && bloodlineByName('这条不存在') === null);
}

// ── 二、遗传：灵根品质 / 家传血脉 / 家学 ──────────────────
{
  const base = {
    level: 0, bloodline: null, techniques: [], fortune: 40, mind: 70,
    heritageB: null, heritageM: null,
  };
  const freshRoot = (quality, mutated = null) => ({
    elements: ['火'], quality, rootName: '火灵根', mutated, bonus: quality * 0.02,
  });

  const kid = { ...base, id: 9001, heritageQ: 3, root: freshRoot(1) };
  applyHeritage(kid);
  check('灵根品质会从双亲那里抬起来', kid.root.quality === 3, `劣(1) → ${kid.root.quality}`);
  check('抬品质时加成跟着走', Math.abs(kid.root.bonus - 0.06) < 1e-9, `bonus ${kid.root.bonus}`);

  const top = { ...base, id: 9002, heritageQ: 4, root: freshRoot(1) };
  applyHeritage(top);
  check('天灵根不会靠继承拿到（上限卡在「优」）',
    top.root.quality === HERITAGE_ROOT_CAP,
    `双亲天灵根 → 子嗣只到 ${top.root.quality}（自己掷才有 4）`);

  const mut = { ...base, id: 9003, heritageQ: 4, root: freshRoot(3, { name: '雷灵根' }) };
  applyHeritage(mut);
  check('变异灵根不吃继承（那是机缘给的，不是继承来的）', mut.root.quality === 3);
  check('双亲天资不够时不抬（不白送）', (() => {
    const e = { ...base, id: 9004, heritageQ: HERITAGE_ROOT_FLOOR - 1, root: freshRoot(0) };
    applyHeritage(e);
    return e.root.quality === 0;
  })());

  // 家传血脉：按人掷一次，走 id 哈希——**一次都不消耗主随机流**
  let inherited = 0;
  const N = 600;
  for (let i = 0; i < N; i += 1) {
    const e = { ...base, id: 10000 + i, heritageQ: -1, heritageB: '剑心血脉', root: freshRoot(1) };
    applyHeritage(e);
    if (e.bloodline === '剑心血脉') inherited += 1;
  }
  check('家传血脉会往下传（约一半）',
    inherited > N * 0.35 && inherited < N * 0.65, `${inherited}/${N}`);
  check('同一个人重算一次，结果不变（哈希不是随机流）', (() => {
    const e = { ...base, id: 4242, heritageQ: -1, heritageB: '剑心血脉', root: freshRoot(1) };
    applyHeritage(e);
    const first = e.bloodline;
    e.bloodline = null;
    applyHeritage(e);
    return e.bloodline === first && first === '剑心血脉';
  })());

  const heir = { ...base, id: 5001, level: 5, heritageQ: -1, heritageM: MANUALS[0].name, root: freshRoot(1) };
  applyHeritage(heir);
  check('家学（世家功法）会发给子弟',
    heir.techniques.some((t) => t.name === MANUALS[0].name), MANUALS[0].name);
  check('同一个人不会重复拿两本家学', learnHeirloom(heir) === false);
}

// ── 三、挑双亲：不能挑到死人、飞升的人、兽类 ────────────────
{
  const pw = generateWorld({ preset: WORLD_PRESETS.small, seed: 5150, scatter: false });
  pw.entities = [];
  const village = { id: 1, x: 60, y: 60 };
  pw.villages = [village];
  const mkMan = (id, age, extra) => {
    const e = {
      id, sp: 'human', x: 60, y: 60, vx: 0, vy: 0, hp: 100, maxHp: 100,
      age, lifespan: 4200, faction: 0, village: 1, state: 'wander', timer: 0,
      tx: 60, ty: 60, anim: 0, face: 1, name: `某${id}`, kills: 0, carried: 0,
      relations: new Map(), surname: '陆', clan: 0, gen: 0,
      ...extra,
    };
    pw.entities.push(e);
    return e;
  };
  const alive1 = mkMan(1, 2000);
  const alive2 = mkMan(2, 1800);
  mkMan(3, 2000, { hp: 0 });                 // 这一 tick 刚被打死
  mkMan(4, 2000, { _ascended: true });       // 这一 tick 刚飞升（hp 还是满的！）
  mkMan(5, 4200);                            // 老死（age 到顶，hp 也还是满的）
  mkMan(6, 100);                             // 未成年
  mkMan(7, 2000, { sp: 'beast' });           // 灵兽
  const pl = new Life(pw, mulberry32(9));
  pl.rebuildGrid();
  const picked = pickParents(pl, village);
  check('挑双亲只挑活着的成年人',
    picked[0] !== picked[1] && picked.includes(alive1) && picked.includes(alive2),
    `${picked[0] && picked[0].name} · ${picked[1] && picked[1].name}`);
  check('没有成年人的村子返回空（而不是乱挑一个）', (() => {
    pw.entities = pw.entities.filter((e) => e.age === 100);
    pl.rebuildGrid();
    const p = pickParents(pl, village);
    return p[0] === null && p[1] === null;
  })());

  // 轮换：池子里有六个人，不同的日子该取到不同的对。
  // 这一条守的是「排序键退化成常数」——`pickParents` 原来写的是
  // 「有世家者优先 → 年长优先」然后取前两名，同一对夫妻包办全村好几年，
  // 族谱退化成一个星形，世家还会因此吃掉整个村子（实测 97.5%）。
  // 改回那种写法，这里会立刻变红，而世界照样能跑、别的断言照样全绿。
  check('双亲是按日轮换的，不是永远同一对', (() => {
    const rw = generateWorld({ preset: WORLD_PRESETS.small, seed: 5151, scatter: false });
    rw.entities = [];
    const rv = { id: 1, x: 60, y: 60 };
    rw.villages = [rv];
    for (let i = 0; i < 6; i += 1) {
      rw.entities.push({
        id: 100 + i, sp: 'human', x: 60, y: 60, vx: 0, vy: 0, hp: 100, maxHp: 100,
        age: 1400 + i * 120, lifespan: 4200, faction: 0, village: 1, state: 'wander',
        timer: 0, tx: 60, ty: 60, anim: 0, face: 1, name: `某${100 + i}`, kills: 0,
        carried: 0, relations: new Map(), surname: '陆', clan: 0, gen: 0,
      });
    }
    const rl = new Life(rw, mulberry32(10));
    rl.rebuildGrid();
    const pairs = new Set();
    for (let d = 0; d < 24; d += 1) {
      rw.day = d * 37;
      const p = pickParents(rl, rv);
      pairs.add(p.map((x) => (x ? x.id : 0)).sort().join('-'));
    }
    return pairs.size >= 4;
  })(), '24 天里取到 ≥ 4 种配对');
}

// ── 四、世家：立族 / 世代 / 家学 / 断绝 ────────────────────
{
  const cw = generateWorld({ preset: WORLD_PRESETS.small, seed: 777, scatter: false });
  cw.entities = [];
  cw.villages = [{ id: 1, x: 60, y: 60 }];
  cw.clans = [];
  cw.clanLog = { founded: 0, ended: 0 };
  cw.nextClanId = 1;
  cw.lastClanFoundDay = -1e9;
  cw.day = 360 * 50;
  const cl = new Life(cw, mulberry32(11));

  const put = (id, opts) => {
    const e = {
      id, sp: 'human', x: 60, y: 60, vx: 0, vy: 0, hp: 100, maxHp: 100,
      age: 2000, lifespan: 4200, faction: 0, village: 1, state: 'wander', timer: 0,
      tx: 60, ty: 60, anim: 0, face: 1, name: `某${id}`, kills: 0, carried: 0,
      relations: new Map(), surname: '陆', parentA: 0, parentB: 0, clan: 0, gen: 0,
      heritageQ: -1, heritageB: null, heritageM: null,
      level: 0, exp: 0, root: null, dao: null, karma: 0, fortune: 40, heartDemon: 0,
      mind: 70, pollution: 0, daoTitle: null, bloodline: null, techniques: [],
      beast: null, artifacts: [], madUntil: -1, trialCount: 0,
      lastTrialDay: -1e9, lastDemonDay: -1e9, lastKarmaDay: -1e9,
      lastAwakenTry: 0, lastBeastDay: -1e9, foundedSect: 0,
      ...opts,
    };
    cw.entities.push(e);
    return e;
  };

  // 始祖：筑基、有灵根、有一门功法
  const founder = put(1, {
    level: 12,
    root: { elements: ['火'], quality: 3, rootName: '火灵根', mutated: null, bonus: 0.06 },
    techniques: [MANUALS[0]],
  });
  // 三个子女（双亲都是始祖）
  const kids = [put(2, { parentA: 1 }), put(3, { parentA: 1 }), put(4, { parentA: 1 })];
  // 一个孙辈
  const grandkid = put(5, { parentA: 2, gen: 0 });

  cl.clanCooldown = 360;
  stepFamily(cw, cl, 0);
  const c1 = cw.clans[0];
  check('子女够多就会立族', !!c1 && cw.clans.length === 1,
    c1 ? `${c1.name}·${c1.hall} 始祖【${c1.founderName}】` : '没立起来');
  check('始祖进谱且是第一代', !!c1 && founder.clan === c1.id && founder.gen === 1);
  check('子女与孙辈一次性归谱，世代逐层加',
    !!c1 && kids.every((k) => k.clan === c1.id && k.gen === 2)
    && grandkid.clan === c1.id && grandkid.gen === 3,
    `子女第 ${kids[0] && kids[0].gen} 代 · 孙辈第 ${grandkid.gen} 代`);
  check('世代最大值跟着涨', !!c1 && c1.generation === 3, String(c1 && c1.generation));
  check('家学随立族记在全族头上（凡人子弟也记，只是先不发）',
    !!c1 && c1.heirloom === MANUALS[0].name
    && [founder, ...kids, grandkid].every((e) => e.heritageM === MANUALS[0].name),
    c1 ? c1.heirloom : '—');
  check('族里的修士当场拿到家学',
    !!c1 && founder.techniques.some((t) => t.name === MANUALS[0].name),
    `始祖 level ${founder.level}`);
  check('凡人子弟当场不发（拿了也用不上，还会在面板上多一行功法）',
    kids.every((k) => k.level === 0 && !k.techniques.some((t) => t.name === MANUALS[0].name)));
  check('凡人子弟觉醒时补发家学（家学不是只在立族那一刻发一次）', (() => {
    const kid = kids[0];
    if (kid.level > 0) return false;                 // 前提：他当时是凡人
    kid.level = 1;
    kid.root = { elements: ['火'], quality: 1, rootName: '火灵根', mutated: null, bonus: 0.02 };
    applyHeritage(kid);                              // awaken() 里就是这一步
    return kid.techniques.some((t) => t.name === MANUALS[0].name);
  })());
  check('世家有堂号，两个同姓世家分得开', !!c1 && !!c1.hall, c1 ? c1.hall : '—');
  check('立族写进了编年史',
    cw.chronicle.some((x) => x.kind === 'clan' && x.text.includes('立族')));
  check('没有子女的筑基修士开不出世家', (() => {
    const loner = put(90, {
      level: 14, root: { elements: ['金'], quality: 2, rootName: '金灵根', mutated: null, bonus: 0.04 },
    });
    cw.lastClanFoundDay = -1e9;
    cl.clanCooldown = 360;
    stepFamily(cw, cl, 0);
    return loner.clan === 0;
  })());

  // 断绝：全族不在世，时间走过 CLAN_END_YEARS
  const clanId = c1.id;
  cw.entities = cw.entities.filter((e) => e.clan !== clanId);
  cw.day = c1.lastSeenDay + CLAN_END_YEARS * 360 + 360;
  cl.clanCooldown = 360;
  stepFamily(cw, cl, 0);
  check('一族无人之后会断绝（不是只增不减）',
    cw.clans.every((c) => c.id !== clanId) && cw.clanLog.ended === 1,
    `累计立族 ${cw.clanLog.founded} · 断绝 ${cw.clanLog.ended}`);
  check('断绝写进了编年史',
    cw.chronicle.some((x) => x.kind === 'clan' && x.text.includes('断绝')));
  check('断绝前不会误判（时间没到就不算断）', (() => {
    const dw = generateWorld({ preset: WORLD_PRESETS.small, seed: 778, scatter: false });
    dw.entities = [];
    dw.clans = [{ id: 1, name: '陆氏', hall: '听涛', surname: '陆', generation: 3, reputation: 30,
      peakMembers: 5, heirloom: null, history: [], endedDay: -1, endReason: null, lastSeenDay: 0 }];
    dw.clanLog = { founded: 1, ended: 0 };
    dw.nextClanId = 2;
    dw.day = CLAN_END_YEARS * 360 - 360;
    const dl = new Life(dw, mulberry32(12));
    dl.clanCooldown = 360;
    stepFamily(dw, dl, 0);
    return dw.clans.length === 1 && dw.clanLog.ended === 0;
  })());

  // 世家不能超过上限
  check('世家数量有上限', (() => {
    const mw = generateWorld({ preset: WORLD_PRESETS.small, seed: 779, scatter: false });
    mw.entities = [];
    mw.clans = [];
    for (let i = 0; i < MAX_CLANS; i += 1) {
      mw.clans.push({ id: i + 1, name: `某${i}氏`, hall: '听涛', surname: '某', generation: 1,
        reputation: 10, peakMembers: 1, heirloom: null, history: [], endedDay: -1,
        endReason: null, lastSeenDay: mw.day });
    }
    mw.nextClanId = MAX_CLANS + 1;
    mw.clanLog = { founded: MAX_CLANS, ended: 0 };
    mw.lastClanFoundDay = -1e9;
    const man = {
      id: 1, sp: 'human', x: 60, y: 60, hp: 100, maxHp: 100, age: 2000, lifespan: 4200,
      faction: 0, village: 0, state: 'wander', timer: 0, tx: 60, ty: 60, anim: 0, face: 1,
      name: '某甲', kills: 0, carried: 0, relations: new Map(), surname: '某',
      parentA: 0, parentB: 0, clan: 0, gen: 0, heritageQ: -1, heritageB: null, heritageM: null,
      level: 12, root: { elements: ['火'], quality: 3, rootName: '火灵根', mutated: null, bonus: 0.06 },
      techniques: [], artifacts: [],
    };
    mw.entities.push(man);
    for (let i = 0; i < 3; i += 1) {
      mw.entities.push({ ...man, id: 10 + i, parentA: 1, level: 0, root: null });
    }
    const ml = new Life(mw, mulberry32(13));
    ml.clanCooldown = 360;
    stepFamily(mw, ml, 0);
    return mw.clans.length === MAX_CLANS && mw.clanLog.founded === MAX_CLANS;
  })(), `上限 ${MAX_CLANS} 家`);
}

// ── 五、真跑一段世界：血缘边与存读档 ──────────────────────
//
// 跑多久：100 年。这一节要的只是「世界真的会生出带家世的人」，
// 100 年已经足够（实测第 100 年就有 8 家世家、1350 人带双亲）。
// **几百年那一档归 longrun 管**——冒烟测试跑一次要人等着，
// 从 160 年压到 100 年省下两分钟，换来的判据强度没有变化。
{
  const fw = generateWorld({ preset: WORLD_PRESETS.small, seed: 20260914, scatter: true });
  const fl = new Life(fw, mulberry32(20260914 ^ 0xa5a5a5a5));
  fl.processPendingSpawns();
  const erng = mulberry32(12345);
  let ecoAccum = 0;
  let fireAccum = 0;
  for (let y = 0; y < 100; y += 1) {
    for (let d = 0; d < 360; d += 3) {
      fw.day += 3;
      fl.step(3);
      ecoAccum += 3;
      if (ecoAccum >= 5) { stepVegetation(fw, ecoAccum, erng); ecoAccum = 0; }
      fireAccum += 3;
      if (fireAccum >= 0.8) { stepFire(fw, fireAccum, erng); fireAccum = 0; }
    }
  }
  const byId = new Map(fw.entities.map((e) => [e.id, e]));
  const withParents = fw.entities.filter((e) => e.parentA || e.parentB);
  check('血缘边真的记下来了', withParents.length > 20,
    `${withParents.length}/${fw.entities.length} 位有双亲`);
  check('没有人的双亲指向自己',
    fw.entities.every((e) => e.parentA !== e.id && e.parentB !== e.id));
  check('姓氏从双亲继承', (() => {
    for (const c of withParents) {
      const p = c.parentA ? byId.get(c.parentA) : null;
      if (!p || !p.surname) continue;
      if (c.surname !== p.surname) return false;
    }
    return true;
  })(), '（只比对双亲仍在世的那些）');
  check('名字里用的就是继承来的姓',
    withParents.every((e) => !e.surname || e.name.startsWith(e.surname)));
  check('拆姓取名与原来逐位同流（同一个种子得到同一个名字）', (() => {
    for (const seed of [1, 4242, 99991]) {
      if (generateNameParts(mulberry32(seed)).full !== generateName(mulberry32(seed))) return false;
    }
    return true;
  })(), '三个种子比对');
  check('家世能摊成面板行', (() => {
    const sample = withParents.find((e) => e.clan) || withParents[0];
    const rows = sample ? lineageOf(fw, sample) : [];
    return rows.length > 0 && rows.every((r) => r.length === 2);
  })(), (() => {
    const sample = withParents.find((e) => e.clan) || withParents[0];
    return sample ? lineageOf(fw, sample).map((r) => `${r[0]}：${r[1]}`).join(' · ') : '（无样本）';
  })());

  const ks = clanStats(fw);
  check('世界真的养出了世家', ks.founded >= 1,
    `在世 ${ks.clans} 家 · 累计立族 ${ks.founded} · 断绝 ${ks.ended} · 最大第 ${ks.maxGen} 代`);
  check('世家有一句话介绍', !ks.top || !!describeClan(ks.top), describeClan(ks.top));
  check('没有人的世家指向不存在的世家',
    fw.entities.every((e) => !e.clan || !!fw.clanById(e.clan)));
  check('世家成员一定有世代编号（≥1）',
    fw.entities.every((e) => !e.clan || e.gen >= 1));

  // 存读档：八列家世 + 世界级三样
  const fw2 = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(fw))));
  check('世家逐字段存回来了',
    JSON.stringify(fw2.clans) === JSON.stringify(fw.clans), `${fw.clans.length} 家`);
  check('世家账本与 id 计数器存回来了',
    fw2.nextClanId === fw.nextClanId
    && JSON.stringify(fw2.clanLog) === JSON.stringify(fw.clanLog)
    && fw2.lastClanFoundDay === fw.lastClanFoundDay,
    `next ${fw2.nextClanId}`);
  check('读档后 nextClanId 比世上最大的 id 还大', (() => {
    let max = 0;
    for (const c of fw2.clans) max = Math.max(max, c.id || 0);
    return fw2.nextClanId > max;
  })());
  check('家世八列逐字段存回来', (() => {
    const m = new Map(fw2.entities.map((e) => [e.id, e]));
    for (const e of fw.entities) {
      const o = m.get(e.id);
      if (!o) continue;
      if (e.surname !== o.surname || e.parentA !== o.parentA || e.parentB !== o.parentB
        || e.clan !== o.clan || e.gen !== o.gen || e.heritageQ !== o.heritageQ
        || e.heritageB !== o.heritageB || e.heritageM !== o.heritageM) return false;
    }
    return true;
  })(), `${fw.entities.length} 位 × 8 列`);
  check('旧档（没有家世列）读回来是「没有家世」而不是乱认亲', (() => {
    const raw = JSON.parse(JSON.stringify(serializeWorld(fw)));
    raw.v = 4;
    for (const row of raw.entities) row.length = 49;   // 砍掉 v5 追加的八列
    delete raw.clans;
    delete raw.nextClanId;
    const old = deserializeWorld(raw);
    return old.entities.every((e) => e.clan === 0 && e.gen === 0 && e.parentA === 0
      && e.heritageQ === -1 && e.heritageB === null && e.heritageM === null)
      && old.clans.length === 0 && old.nextClanId === 1;
  })());

  // ── 5i / 5j / 5k 的「真世界」那一半 ──────────────────────
  //
  // 这三节的纯函数断言写在下面各自的 section 里；需要**真跑过一段世界**才成立的
  // 判据全部塞进这个块，复用上面那个 100 年的 fw / fw2。
  // 理由：冒烟测试跑一次要人等着，绝不能再多跑一个长世界；
  // 而「日志真的被写入」这件事本来就只能在真世界里验（假世界里的 log 是自己 push 的）。
  {
    const bstat = biographyStats(fw);
    check('真世界里个人日志真的被写入（logged > 0）', bstat.logged > 0,
      `${bstat.logged}/${bstat.entities} 人有生平 · 共 ${bstat.events} 条`);

    // 比「覆盖率」锐利得多的不变量：**凡是修士，传记里就必须有东西**。
    // 覆盖率是个百分比，挡不住「修士这条线整个没接上」——世上九成是凡人，
    // 分母里绝大多数永远不会觉醒，覆盖率天然就是低个位数，看着「低」也说明不了什么。
    // 而「修士必有生平」是可证伪的：漏接一处当事人，立刻红。
    const cultivators = fw.entities.filter((e) => (e.level || 0) > 0);
    const cultivatorsWithLog = cultivators.filter((e) => Array.isArray(e.log) && e.log.length);
    check('★ 每个修士都有个人日志（出身/觉醒/突破这条线真的接上了）',
      cultivators.length > 0 && cultivatorsWithLog.length === cultivators.length,
      `${cultivatorsWithLog.length}/${cultivators.length} 有日志`
      + ` · 缺 ${cultivators.length - cultivatorsWithLog.length} 人`
      + `（全球覆盖率 ${(bstat.coverage * 100).toFixed(1)}%，分母含大量凡人）`);

    // 「来历」有三种，不能只认「觉醒」：
    //   ① 在模拟里从凡人觉醒（stepEntity 那一处调用点写的）；
    //   ② 生而有灵根（life.js 村庄繁衍 `innate = rng() < 0.1`，降生即修士）；
    //   ③ 带着前世的影子降生（转世者，life.js 的 soul 分支）。
    // 只认 ① 会把这批先天修士误判成漏接——实测 115 位修士里有 41 位从未觉醒过。
    //
    // 判据写成「查不到来历的人必须都是日志已满员的」：满员意味着那条来历是被
    // LOG_CAP 的**重要性淘汰**挤出去的（设计如此，见 5i 那一节），不是漏接。
    // 若有人日志没满却查不到来历，那才是真的漏接。
    const ORIGIN_RE = /觉醒|生而有灵根|带着前世的影子降生/;
    const noOrigin = cultivators.filter((e) => !(e.log || []).some((r) => ORIGIN_RE.test(r.text || '')));
    const noOriginFull = noOrigin.filter((e) => (e.log || []).length >= LOG_CAP);
    check('★ 查不到来历的修士，必须都是日志已满员（被重要性淘汰，不是漏接）',
      noOrigin.length === noOriginFull.length,
      `修士 ${cultivators.length} 位 · 查不到来历 ${noOrigin.length} 位 · 其中满员 ${noOriginFull.length} 位`);

    // 静默觉醒**不进编年史**，这是设计上的预算（批量出生逐条写会冲掉 400 条滚动窗口）。
    // 守它是因为：将来若有人把 `silent: true` 去掉，早期历史会静默消失，不会报任何错。
    // 阈值故意写得宽松——只要求「远小于修士数」，不写死具体数字。
    const awakenInChronicle = fw.chronicle.filter((c) => /觉醒/.test(c.text || '')).length;
    check('静默觉醒没有把编年史窗口冲掉（含「觉醒」的条数远小于修士数）',
      awakenInChronicle < cultivators.length / 2,
      `编年史含「觉醒」${awakenInChronicle} 条 · 修士 ${cultivators.length} 位`);

    check('突破 / 飞升 / 天劫这条线也接到了个人日志上',
      fw.entities.some((e) => (e.log || []).some((r) => /突破至|飞升|天现/.test(r.text || ''))));

    // 存读档：逐条比对整条数组，而不是只看条数。
    // 只看条数的话「张冠李戴」（把甲的某一条换成了乙的）会被漏掉。
    const fw2ById = new Map(fw2.entities.map((e) => [e.id, e]));
    let logLost = 0;
    let logTotal = 0;
    for (const e of fw.entities) {
      const mine = Array.isArray(e.log) ? e.log : [];
      logTotal += mine.length;
      const back = fw2ById.get(e.id);
      const theirs = back && Array.isArray(back.log) ? back.log : [];
      if (mine.length !== theirs.length || JSON.stringify(mine) !== JSON.stringify(theirs)) logLost += 1;
    }
    check('个人日志逐条存回来（含 importance / key，不只是条数一致）', logLost === 0,
      `${fw.entities.length} 位 · ${logTotal} 条 · 对不上 ${logLost} 人`);

    // 大战：真世界那一半只顺手看一眼容器形状。
    // 「几百年里真的打过大战、真的灭过门」归 longrun 管，这里不跑长世界。
    check('真世界里大战容器形状正确',
      Array.isArray(fw.wars) && !!fw.warLog && typeof fw.warLog.declared === 'number',
      `wars=${fw.wars.length} declared=${fw.warLog.declared}`);

    // 夺舍：只验账本存读档一致，**不断言「100 年里发生过夺舍」**——
    // 夺舍要几百年才够（金丹以上的死亡占比只有百分之几），那是 longrun 的判据。
    check('夺舍账本三个字段都存回来了（逐字段比对）',
      !!fw2.possessionLog && !!fw.possessionLog
      && ['succeeded', 'failed', 'suspected'].every((k) => typeof fw2.possessionLog[k] === 'number'
        && fw2.possessionLog[k] === fw.possessionLog[k]),
      `succeeded ${fw.possessionLog.succeeded} · failed ${fw.possessionLog.failed}`
      + ` · suspected ${fw.possessionLog.suspected}`);
  }
}

// ── 5i. 传记：写入路径与编译 ──────────────────────────────
//
// 传记是「一个人被记下来」的那一环（转世让一个人活过一世，法宝让一件东西活过人，
// 世家让一个姓活过所有人，传记让**经历**留下来）。这一节钉的是**写入路径通不通**、
// 以及编译出来的正文是不是一份结构完整、确定、且不改世界的文档。
//
// 为什么写入路径要单独测：`recordLifeEvent` 有四种拒收（空文本 / 兜底文本 / 去重 /
// 挤不进上限），拒收本身是对的，但它让「一条都没记上」和「记上了但被拒了」
// 长得一模一样——不测就分不清。真世界那一半写在上面 5h 的 100 年块里（复用 fw / fw2）。
section('5i. 传记：写入路径与编译');

// ── 一、World.record 的三参分流：同一条事既进编年史，也记到当事人身上 ──
// 这一条防的是「记录写了、但没记到人身上」：编年史里有字，个人日志永远是空的，
// 传记于是整篇都是「尚无足够重要且可归属于本人的经历」，而且不会报任何错。
{
  const pA = { id: 990001, name: '记录甲', level: 0, age: 0, log: [] };
  const pB = { id: 990002, name: '记录乙', level: 0, age: 0, log: [] };
  const pC = { id: 990003, name: '记录丙', level: 0, age: 0, log: [] };

  // kind 用 'awaken'（觉醒那一刻现在归这一类，见 5l 的映射表）。
  // 这条断言守的是「record 把 kind **原样**带进个人日志」这条写入路径，
  // 不是「kind 一定叫 awaken」——所以它只比对传进去的那个字符串本身。
  world.record('【探针】记录甲觉醒。', 'awaken', pA);
  check('record 传单个当事人 → 他的 log 增长', pA.log.length === 1, `${pA.log.length} 条`);
  check('record 同时把这一句写进世界编年史',
    world.chronicle.some((c) => c.text === '【探针】记录甲觉醒。'));
  check('该条带上了 kind（面板要按 kind 分组）', pA.log[0] && pA.log[0].kind === 'awaken',
    pA.log[0] ? pA.log[0].kind : '（无）');

  world.record('【探针】两人交手。', 'war', [pA, pB]);
  check('record 传数组 → 两个当事人都记上', pA.log.length === 2 && pB.log.length === 1,
    `甲 ${pA.log.length} 条 · 乙 ${pB.log.length} 条`);

  const cBefore = pC.log.length;
  world.record('【探针】与谁都没关系的一句。', 'world');
  check('record 不传第三参 → 谁都不记（默认不猜当事人）', pC.log.length === cBefore,
    `丙仍为 ${pC.log.length} 条`);
}

// ── 二、去重与拒收 ────────────────────────────────────────
// 去重防的是「每年普查一次」的接线把同一件事记几十遍，把「每年 top3」塞满。
// ⚠️ 这里必须用一条**够重**的话（含「突破」→ 59 分）来测。
// 用一句 35 分的琐事测会假失败：满员的日志会按重要性把轻事当场挤出去
// （那是设计，不是 bug），于是「首次记录返回 true」看起来像坏了。
{
  const probe = { id: 990010, name: '去重探针', level: 0, age: 0, log: [] };
  const HEAVY = '【去重探针】又一次突破，这句话只该出现一次。';
  check('首次记录返回 true', recordLifeEvent(world, probe, 'probe', HEAVY) === true);
  check('同一条语义键连记两次，第二次被拒（返回 false）',
    recordLifeEvent(world, probe, 'probe', HEAVY) === false);
  check('空文本被拒', recordLifeEvent(world, probe, 'probe', '') === false);
  check('纯空白被拒', recordLifeEvent(world, probe, 'probe', '   ') === false);
  check(`兜底文本「${LOST_TEXT}」被拒（它本身等于丢弃）`,
    recordLifeEvent(world, probe, 'probe', LOST_TEXT) === false);
}

// ── 三、LOG_CAP 的上限语义是「最重要的 32 件」，不是「最后 32 件」 ──
// 这一条是个人日志存在的**全部意义**：规格书 §8.3 已指出 400 条的编年史窗口
// 在千年尺度下必然把早期经历顶掉，若个人日志也 FIFO，一个人的「觉醒」「开宗」
// 会被晚年几十条琐事挤出去——而传记里看起来只是「早年一片空白」，不报任何错。
{
  const heavy = { id: 990020, name: '满员探针', level: 0, age: 0, log: [] };
  for (let i = 0; i < 40; i += 1) recordLifeEvent(world, heavy, 'birth', `【满员探针】第 ${i} 次降生。`);
  const birthsBefore = heavy.log.filter((r) => r.kind === 'birth').length;
  const kept = recordLifeEvent(world, heavy, 'breakthrough', '【满员探针】突破至金丹。');
  const birthsAfter = heavy.log.filter((r) => r.kind === 'birth').length;
  check('满员之后重事仍然进得来（含「突破」的那条还在）',
    kept === true && heavy.log.some((r) => /突破/.test(r.text)),
    `返回 ${kept} · 共 ${heavy.log.length} 条`);
  check('日志长度压在 LOG_CAP 上，不会无限增长', heavy.log.length === LOG_CAP,
    `${heavy.log.length} / ${LOG_CAP}`);
  check('轻事被重事挤掉（birth 条数真的减少了）', birthsAfter < birthsBefore,
    `birth ${birthsBefore} → ${birthsAfter}`);
}

// ── 四、编译正文：必选章节 / 可选章节 / 兜底 / 确定性 ──
{
  const subject = {
    id: 990030, name: '传记探针', level: 12, age: 3600, exp: 40, kills: 0,
    faction: 0, clan: 0, gen: 0, incarnation: 1, pastLife: null, dao: null,
    daoTitle: null, relations: new Map(), artifacts: [], log: [],
  };
  recordLifeEvent(world, subject, 'awaken', '【传记探针】于某地觉醒火灵根。', { level: 1 });
  recordLifeEvent(world, subject, 'breakthrough', '【传记探针】突破至筑基。', { level: 10 });

  const bio = compileBiography(world, subject);
  // 五个必选二级标题。注意「法宝与遗物」是「修行轨迹」里的**条目**、不是独立章节；
  // 「前世与命系」是**可选**章节（见下面单独那两条）。
  const REQUIRED_HEADS = ['## 一眼看懂', '## 修行轨迹', '## 重要关系', '## 生涯阶段', '## 遗产与未竟之事'];
  const missingHeads = REQUIRED_HEADS.filter((h) => !bio.includes(h));
  check('正文含 5 个必选二级标题', missingHeads.length === 0,
    missingHeads.length ? `缺 ${missingHeads.join(' ')}` : REQUIRED_HEADS.join(' '));
  check('正文以「# …传」开头（不是空串）', /^# .+传$/m.test(bio));

  const withArt = compileBiography(world, { ...subject, id: 990031, artifacts: [{ name: 'X' }] });
  check('带法宝时正文出现「- 法宝与遗物：X」', withArt.includes('- 法宝与遗物：X'));

  const withPast = compileBiography(world, {
    ...subject,
    id: 990032,
    incarnation: 2,
    pastLife: { name: '陆青玄', level: 24, realm: '金丹', fragments: 3, remembered: true },
  });
  check('带 pastLife 且 incarnation=2 时出现「## 前世与命系」',
    withPast.includes('## 前世与命系') && withPast.includes('- 当前为命系第 2 世。'));

  // 空壳实体：面板上点到一个「什么都还没发生」的人，导出的必须仍是一份合法文档。
  // 返回空串会让导出按钮写出一个 0 字节的文件，而玩家只会以为「坏了」。
  const emptyBio = compileBiography(world, { id: 990033, name: '无名', level: 0, age: 0 });
  check('空壳实体也返回合法文档（不返回空串）',
    emptyBio.startsWith('# ') && emptyBio.includes('## 生涯阶段')
    && emptyBio.includes('- 尚无足够重要且可归属于本人的经历。'),
    `${emptyBio.length} 字`);

  // 编译是**只读派生**：面板每帧调一万次，世界也必须一位不变。
  const chronBefore = world.chronicle.length;
  const logBefore = JSON.stringify(subject.log);
  const bio1 = compileBiography(world, subject);
  const bio2 = compileBiography(world, subject);
  check('compileBiography 两次结果逐字相同（确定性）', bio1 === bio2);
  check('compileBiography 不改世界：编年史长度与本人日志都不动',
    world.chronicle.length === chronBefore && JSON.stringify(subject.log) === logBefore,
    `编年史 ${chronBefore} 条`);

  const rows = biographyRows(world, subject);
  check('biographyRows 返回 [[标签, 值], ...] 且值都是字符串',
    Array.isArray(rows) && rows.length > 0
    && rows.every((r) => Array.isArray(r) && r.length === 2
      && typeof r[0] === 'string' && typeof r[1] === 'string'),
    rows.map((r) => `${r[0]}：${r[1]}`).join(' · '));

  const chron = exportChronicle(world, { tag: 'all', limit: 20 });
  check('exportChronicle 以「# 坐天观井 · 世界编年史」开头',
    chron.startsWith('# 坐天观井 · 世界编年史'), chron.split('\n')[0]);
}

// ── 五、觉醒 → 个人日志这条接线本身（直接驱动，不靠统计） ──
// 上面「真世界」那两条是**统计不变量**，它们会被「降生即修士」的路径影响
// （先天灵根 / 转世者走的是 `awaken(..., {silent:true})`，不经过任何写日志的调用点）。
// 这里补一条直接驱动的判据，把「凡人觉醒 → 日志里出现这一笔」这条接线本身钉死：
// rng 恒返回 0，觉醒概率判定必过，于是这一次 stepEntity 一定会走觉醒分支。
{
  const aw = generateWorld({ preset: WORLD_PRESETS.small, seed: 5402, scatter: false });
  aw.entities = [];
  aw.pendingSpawns.push({ x: 40, y: 40, species: 'human', count: 1 });
  const al = new Life(aw, mulberry32(5402));
  al.processPendingSpawns();
  const man = aw.entities[0];
  man.level = 0;
  man.fortune = 100;
  man.madUntil = -1;
  const logBefore = (man.log || []).length;
  stepEntity(aw, man, 3, () => 0);
  check('凡人走完觉醒分支 → 觉醒那一刻进了个人日志（接线本身）',
    man.level > 0 && (man.log || []).length > logBefore
    && man.log.some((r) => /觉醒/.test(r.text || '')),
    `level=${man.level} · log ${logBefore} → ${(man.log || []).length} 条`);
}

// ── 5j. 大战：战力与宣战门槛 ──────────────────────────────
//
// 大战是**宗门级**的事（个人级的战报由 war.js 的 warActors 映射到双方宗主）。
// 这一节只钉三件结构性的东西，不碰数值好不好看：
//   · `warPower` 是**纯函数**——它是准热路径（一次年度结算里要调上百次），
//     若它顺手改了宗门，面板每读一次就把世界读坏了；
//   · `canDeclareWar` 的规模门槛真的挡得住小门派——门槛形同虚设就是一开局满世界混战；
//   · 大战**不碰主随机流**，一切随机只走外部传进来的 `rng` 形参。
// 真世界里打没打起来、灭没灭门，归 longrun 管，这里不跑长世界。
section('5j. 大战：战力与宣战门槛');

// ── 一、容器在 World 构造后就有，且形状正确 ──
// 形状不对的话，`stepWar` 会在第一次年度结算时静默什么都不做（而不是报错），
// 表现成「几百年一场大战都没有」——正是那种最难查的坏法。
check('World 构造后大战三件容器就位且形状正确',
  Array.isArray(world.wars) && typeof world.nextWarId === 'number'
  && !!world.warLog && ['declared', 'resolved', 'destroyed', 'casualties']
    .every((k) => typeof world.warLog[k] === 'number'),
  `wars=${world.wars.length} · nextWarId=${world.nextWarId} · warLog=${JSON.stringify(world.warLog)}`);

// 老世界 / 从旧档读回来的世界身上可能没有这三样，模块要能自己补出来。
// 不补的话 `stepWar` 会在第一次年度结算时静默什么都不做——表现成「几百年一场大战都没有」。
{
  const bare = {};
  ensureWarState(bare);
  check('ensureWarState 能给缺容器的世界补出三件套（缺容器不会静默不干活）',
    Array.isArray(bare.wars) && typeof bare.nextWarId === 'number'
    && !!bare.warLog && typeof bare.warLog.declared === 'number',
    `wars=${bare.wars.length} · nextWarId=${bare.nextWarId}`);
}

// ── 二、warPower 是纯函数 ──
{
  const sect = tw.factions[0];
  const snapshot = JSON.stringify(sect);
  const p1 = warPower(tw, sect);
  const p2 = warPower(tw, sect);
  check('warPower 是纯函数：同样的输入调两次结果相同', p1 === p2, `${p1.toFixed(2)}`);
  check('warPower 不改宗门对象（前后 JSON 逐字相同）', JSON.stringify(sect) === snapshot);
  check('warPower 返回有限非负数', Number.isFinite(p1) && p1 >= 0, `${p1.toFixed(2)}`);
}

// ── 三、规模门槛：两个刚立、没人的宗门不许宣战 ──
// 用一个最小世界把「规模门槛」这一道单独隔离出来：两家山门只隔 8 格（地理前置通过），
// 战力却只有 10 分。若门槛被写漏，这里会立刻变绿成 true。
{
  const mkSect = (id, x, y, extra) => ({
    id, name: `假宗${id}`, capitalX: x, capitalY: y, destroyedDay: -1,
    war: new Set(), relations: new Map(), leylines: [], villages: [],
    reputation: 0, stability: 0, pop: 0, leaderId: 0, elders: [],
    element: null, doctrine: null,
    ...extra,
  });
  const mkWorld = (factions, opts = {}) => ({
    w: 100, h: 100, day: 0,
    entities: [], wars: [], nextWarId: 1,
    warLog: { declared: 0, resolved: 0, destroyed: 0, casualties: 0 },
    type: new Uint8Array(100 * 100), veg: new Float32Array(100 * 100),
    isWater: () => false,
    factions,
    factionById: (id) => factions.find((s) => s.id === id) || null,
    villageById: () => null, leylineById: () => null,
    record: () => {},
    ...opts,
  });

  const t1 = mkSect(1, 50, 50);
  const t2 = mkSect(2, 58, 50);
  const small = mkWorld([t1, t2]);
  const smallPower = warPower(small, t1);
  check('刚立的小宗门战力够不着门槛', smallPower < GREAT_BATTLE_MIN_POWER,
    `warPower=${smallPower.toFixed(1)} < 门槛 ${GREAT_BATTLE_MIN_POWER}`);
  check('两个不够格的宗门不会被允许宣战', canDeclareWar(small, t1, t2) === false,
    `双方门力 ${warPower(small, t1).toFixed(1)} / ${warPower(small, t2).toFixed(1)}`);

  // ── 四、够格的一对：宣战判据为真，且一次宣战判定只抽一次签 ──
  // 这一条同时钉住两件事：门槛是「可过的」（不是恒假），以及抽签次数与
  // 「够格对子数」精确相等（没有隐藏的随机源、没有每个对子抽好几次）。
  // 用「接壤 30 格 + 抢同一道灵脉 + 关系 −20」把紧张度顶到 92（阈值 48），
  // 用 pop=40 把门力顶到 74（门槛 60）——所有前提都是显式的，不靠运气。
  const b1 = mkSect(1, 50, 50, { pop: 40, leylines: [777], relations: new Map([[2, -20]]) });
  const b2 = mkSect(2, 58, 50, { pop: 40, leylines: [777], relations: new Map([[1, -20]]) });
  const big = mkWorld([b1, b2], {
    _terrBorder: new Map([['1-2', 30]]),
    _terrContested: new Set([777]),
  });
  check('够格的一对：宣战判据为真（门槛是可过的，不是恒假）',
    canDeclareWar(big, b1, b2) === true,
    `门力 ${warPower(big, b1).toFixed(1)} / ${warPower(big, b2).toFixed(1)}`
    + ` · 够格对子 ${warInternals.eligiblePairs(big).length} 个`);

  const pairs = warInternals.eligiblePairs(big).length;
  let draws = 0;
  // 0.999 恒定大于触发概率（8% × 好战度，最高约 0.116）→ 每个够格对子都判「不宣战」。
  // 于是本 tick 的抽签次数应当**恰好等于够格对子数**（每对一次，不多不少）。
  const countingRng = () => { draws += 1; return 0.999; };
  stepWar(big, countingRng, 3);
  check('大战只用外部传入的 rng：一个够格对子恰好抽一次签，不爆炸',
    pairs === 1 && draws === pairs, `够格对子 ${pairs} 个 · 本 tick 抽签 ${draws} 次`);
  check('war.js 没有自己再导出随机源（不 new 随机流）',
    warModule.mulberry32 === undefined && warModule.default === undefined);
}

// ── 五、读数与内部量 ──
{
  const ws = warStats(world);
  check('warStats 的 total / ongoing / ended / destroyed / declared 都是数字',
    ['total', 'ongoing', 'ended', 'destroyed', 'declared'].every((k) => typeof ws[k] === 'number'),
    JSON.stringify(ws));
  check('warInternals 是冻结的（读得到、改不了）', Object.isFrozen(warInternals));
}

// ── 5k. 夺舍：门槛、不抽签、快照 ───────────────────────────
//
// 夺舍是转世的另一半：转世是「自己的魂回炉重造」，夺舍是「自己的魂住进别人的身体」。
// 这一节最重要的一条不是功能，而是**不扰动主随机流**（见下面那条星标断言）。
// 其余四条是「写入得对不对」：名字后缀不叠加、快照不是 id、不动气血寿元、账本记数。
section('5k. 夺舍：门槛、不抽签、快照');

// ── 一、★ 够不着门槛的死亡，一次签都不许抽 ──
// 这是整个模块最重要的不变量。全世界共用 `Life.rng` 一条随机流，
// 而死亡绝大多数是低境界的（reincarnation.js 实测 300 年 10165 次死亡里
// 9919 次在筑基以下，占 97.6%）。若在这里抽了签，全世界的主随机流就被搅动了——
// 几百年后的世界整个漂到别处，而且**不会有任何报错**。
// 所以这条断言写的不是「性能优化」，是「世界线不许漂」。
{
  let draws = 0;
  const countingRng = () => { draws += 1; return 0.5; };
  const weak = {
    id: 990101, name: '炼气探针', level: POSSESSION_LEVEL_MIN - 1,
    sp: SPECIES.CULTIVATOR, hp: 0,
  };
  const r1 = tryPossession(world, weak, countingRng);
  check('★ 境界不到门槛（level < POSSESSION_LEVEL_MIN）→ 拒绝，且一次 rng 都不抽',
    r1 === false && draws === 0, `返回 ${r1} · 抽签 ${draws} 次`);

  draws = 0;
  const beast = { id: 990102, name: '灵兽探针', level: 40, sp: SPECIES.BEAST, hp: 0 };
  const spirit = { id: 990103, name: '山精探针', level: 40, sp: SPECIES.SPIRIT, hp: 0 };
  const r2 = tryPossession(world, beast, countingRng);
  const r3 = tryPossession(world, spirit, countingRng);
  check('灵兽 / 山精没有元神，谈不上夺舍，也不抽签',
    r2 === false && r3 === false && draws === 0, `抽签 ${draws} 次`);
}

// ── 二、成功率：恒在 [0,1]、随境界单调不降、不返回 NaN ──
{
  let inRange = true;
  for (let lv = 0; lv <= 60; lv += 5) {
    const c = possessionChance(lv, 70, 1, 70);
    if (!(c >= 0 && c <= 1)) inRange = false;
  }
  check('possessionChance 恒在 [0, 1]', inRange);

  const pts = [20, 25, 30, 35, 40, 60].map((lv) => possessionChance(lv, 70, 1, 70));
  let mono = true;
  for (let i = 1; i < pts.length; i += 1) if (pts[i] < pts[i - 1]) mono = false;
  check('夺舍者境界越高，成功率单调不降', mono, pts.map((v) => v.toFixed(3)).join(' ≤ '));

  // 两项都为 0 时主线会算出 0/0 = NaN，而 NaN 参与比较恒为 false，
  // 于是「rand() > NaN」为 false → 判成**成功**：一个道心归零的鬼修 100% 夺舍成功。
  const zero = possessionChance(0, 0, 0, 0);
  check('两项都为 0 时落回下限而不是 NaN（NaN 会静默翻成必成）',
    Number.isFinite(zero) && zero === 0.1, `${zero}`);
}

// ── 三、构造一次必然成功的夺舍，逐条验写入 ──
{
  // 用真 World 而不是假对象：这里要验的正是「经 world.record 写进编年史与个人日志」
  // 这条真实路径。容器用一个境界 1 的修士，夺舍者境界 30（必然够格）。
  const posWorld = generateWorld({ preset: WORLD_PRESETS.small, seed: 5301, scatter: false });
  posWorld.entities = [];
  posWorld.day = 360 * 100;
  posWorld.possessionLog = { succeeded: 0, failed: 0, suspected: 0 };

  const victim = {
    id: 1, name: '容器甲', sp: SPECIES.CULTIVATOR, level: 1, hp: 100, maxHp: 100,
    lifespan: 4200, age: 100, faction: 0, mind: 70, x: 10, y: 10,
    relations: new Map(), log: [],
  };
  posWorld.entities.push(victim);
  const mkDead = (id, name, level, mind) => ({
    id, name, sp: SPECIES.CULTIVATOR, level, hp: 0, mind, faction: 0, relations: new Map(),
  });

  // rng 恒返回 0：元神不散（0 ≤ 0.15）→ 成功率判定必过（0 ≤ rate）→ 继承比例取下限。
  const alwaysZero = () => 0;
  const hpBefore = victim.maxHp;
  const lifeBefore = victim.lifespan;
  const lvBefore = victim.level;

  const ok1 = tryPossession(posWorld, mkDead(2, '夺舍者甲', 30, 75), alwaysZero);
  check('必然成功的夺舍返回 true', ok1 === true);
  check('目标名字加上了「·异」后缀', victim.name === '容器甲·异', victim.name);
  check('possessedBy 是快照对象，含 name / level / faction / day / suspected',
    !!victim.possessedBy && typeof victim.possessedBy === 'object'
    && typeof victim.possessedBy.name === 'string'
    && typeof victim.possessedBy.level === 'number'
    && typeof victim.possessedBy.faction === 'number'
    && typeof victim.possessedBy.day === 'number'
    && typeof victim.possessedBy.suspected === 'number',
    JSON.stringify(victim.possessedBy));
  // 存 id 必然悬垂：死者下一 tick 就被移出 world.entities（主线就是这么坏的）。
  check('快照里没有任何 id（存 id 一定会指向一个不存在的人）',
    !('id' in victim.possessedBy) && !('entityId' in victim.possessedBy),
    Object.keys(victim.possessedBy).join('/'));
  // 值为 undefined 的键会被 JSON.stringify 整个丢掉 → 读档后键没了 → 逐字段比对炸。
  check('快照里没有 undefined 值（JSON.stringify 会丢键）',
    Object.values(victim.possessedBy).every((v) => v !== undefined),
    JSON.stringify(victim.possessedBy));
  check('夺舍抬高了境界', victim.level > lvBefore, `${lvBefore} → ${victim.level}`);
  // 夺舍借的是肉身：气血与寿元随肉身，不随元神。改错就是凭空造命——
  // 一个凡人被夺舍后当场得到金丹的寿元与气血。
  check('夺舍不动 maxHp 与 lifespan（借肉身，不凭空造命）',
    victim.maxHp === hpBefore && victim.lifespan === lifeBefore,
    `maxHp ${hpBefore} → ${victim.maxHp} · lifespan ${lifeBefore} → ${victim.lifespan}`);
  check('账本记了一次成功', posWorld.possessionLog.succeeded === 1,
    `succeeded=${posWorld.possessionLog.succeeded}`);

  // 同一具肉身可以再被夺舍（主线如此），但名字不许叠成「容器甲·异·异」。
  const ok2 = tryPossession(posWorld, mkDead(3, '夺舍者乙', 30, 75), alwaysZero);
  check('对同一具肉身再夺舍一次，名字不会叠成「·异·异」',
    ok2 === true && victim.name === '容器甲·异', victim.name);
  check('账本记了两次成功', posWorld.possessionLog.succeeded === 2,
    `succeeded=${posWorld.possessionLog.succeeded}`);

  // 失败：第一次抽签过「元神不散」，第二次抽签故意大过成功率 → 判失败。
  const failSeq = [0, 0.999, 0.5];
  let fi = 0;
  const seqRng = () => { const v = fi < failSeq.length ? failSeq[fi] : 0; fi += 1; return v; };
  const failedBefore = posWorld.possessionLog.failed;
  const rFail = tryPossession(posWorld, mkDead(4, '夺舍者丙', 30, 0), seqRng);
  check('夺舍失败时返回 false（容器毫发无伤，夺舍者元神消散）', rFail === false);
  // 失败也要记账。防的是「只写成功那一半」：`succeeded` 在涨、`failed` 永远是 0，
  // 于是 `possessionStats().failed` 变成只读不写的死字段，
  // `succeeded + failed` 永远对不上「累计触发过几次夺舍」——
  // 而长测正是靠这对数分开「从来没触发过」与「触发过、但那些人都没了」。
  check('失败也记账（failed +1）', posWorld.possessionLog.failed === failedBefore + 1,
    `failed ${failedBefore} → ${posWorld.possessionLog.failed}`);

  const pstat = possessionStats(posWorld);
  check('possessionStats 的 succeeded / failed / suspectEvents 都是数字',
    typeof pstat.succeeded === 'number' && typeof pstat.failed === 'number'
    && typeof pstat.suspectEvents === 'number', JSON.stringify(pstat));
  check('succeeded + failed = 累计触发的夺舍次数（本例 3 次）',
    pstat.succeeded + pstat.failed === 3,
    `${pstat.succeeded} + ${pstat.failed} = ${pstat.succeeded + pstat.failed}（应为 3）`);
  check('possessionInternals 是冻结的（读得到、改不了）', Object.isFrozen(possessionInternals));
}

// ── 5l. 编年史 kind：白名单、映射表与写入方 ────────────────
//
// `kindTag()` 的兜底规则是「认不出一律落到 world」。于是「**故意**归 world」与
// 「新增一种 kind **忘了配**」在代码里走的是**同一条分支**——漏配因此是静默的：
// 那条记录只会从面板的专属筛选里消失，不报错、不崩溃、断言全绿。
// `WORLD_KINDS` 白名单就是为分清这两者而造的。
//
// 这一节是白名单**唯一的读者**——没有它，白名单自己也是一段死代码
// （「为了修这个坑而造出来的那个字段，本身也没人读」）。
section('5l. 编年史 kind：白名单、映射表与写入方');

{
  // ── A. 白名单与映射表不许漂移 ──
  // WORLD_KINDS 必须**逐字等于** KIND_TAG 里值为 'world' 的键集合。
  // 两边一旦漂移，测试就再也分不清「故意归 world」与「漏配」——
  // 而这恰恰是白名单存在的**唯一**理由，所以它自己必须被守住。
  const worldMapped = Object.keys(KIND_TAG).filter((k) => KIND_TAG[k] === 'world');
  const whitelist = [...WORLD_KINDS];
  const drift = [
    ...worldMapped.filter((k) => !WORLD_KINDS.has(k)),
    ...whitelist.filter((k) => KIND_TAG[k] !== 'world'),
  ];
  check('WORLD_KINDS 与 KIND_TAG 里值为 world 的键逐字一致', drift.length === 0,
    `白名单 ${whitelist.length} 个 · KIND_TAG 归 world 的 ${worldMapped.length} 个`
    + ` · 漂移 ${drift.length} 个${drift.length ? `：${drift.join(', ')}` : ''}`);
  check('天道干预 kind 归入现有 world 分类',
    KIND_TAG.intervention === 'world' && WORLD_KINDS.has('intervention'),
    `KIND_TAG=${KIND_TAG.intervention || '缺失'} · 白名单=${WORLD_KINDS.has('intervention')}`);

  // ── B/C. 扫源码，做双向缺口审计 ──
  //
  // 为什么非要扫源码而不是「手工维护一张表」：`beast` / `contest` / `envoy` / `death`
  // 这四个漏配就是这么漏了很久的——它们全都在真实调用点上，只是没人配映射。
  // 手工表只能记录「我以为用到了哪些」，扫源码才能回答「**实际**用到了哪些」。
  const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/inkbox');
  const jsFiles = [];
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.js')) jsFiles.push(p);
    }
  })(srcRoot);

  /**
   * 剥掉注释，但**原样保留字符串字面量**。
   *
   * 为什么必须剥：`extractKinds` 的正则会把**注释里**的 `record(` 当成写入方。
   * 实测 `possession.js:49` 那句注释「改为写 `world.record(..., 'possess')`」
   * 就让 `possess` 看起来「有写入方」——把真正的写入方 `RECORD_KIND` 删掉，
   * 断言 C（死映射）照样是绿的。**一条注释撑起一条断言**，这就是假绿通道。
   *
   * 为什么不能连字符串一起剥：kind 本身就是字符串字面量，剥了就没法抽了。
   * 所以这一趟是**字符级**扫描：字符串之外遇到「双斜杠」跳到行尾、
   * 遇到「斜杠星号」跳到它的结束符；字符串之内一个字符都不动（含反斜杠转义）。
   * 行注释只吃到换行之前、块注释替换成一个空格——两者都保留词法边界，
   * 免得注释两边的标识符被粘成一个词之后误配。
   *
   * ⚠️ 已知边界：正则字面量（斜杠开头斜杠结尾）没被识别。若有人写出
   * 以星号开头的正则字面量，会被误当成块注释的起点。本仓库目前没有这种写法；
   * 真出现时的症状是「少扫到几处调用」，而断言 D 会把新增的非字面量逼红。
   */
  function stripComments(src) {
    let out = '';
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === "'" || c === '"' || c === '`') {
        out += c;
        i += 1;
        while (i < src.length) {
          if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
          out += src[i];
          const closed = src[i] === c;
          i += 1;
          if (closed) break;
        }
        continue;
      }
      if (c === '/' && src[i + 1] === '/') {
        while (i < src.length && src[i] !== '\n') i += 1;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
        i += 2;
        out += ' ';
        continue;
      }
      out += c;
      i += 1;
    }
    return out;
  }

  /**
   * 从 `record(` 的第二个实参里取字符串字面量。
   * 按**括号深度**找第二参（`record(\n  `...`,\n  'kind',\n  actor,\n)` 这种跨行写法很常见），
   * 遇到引号就整段跳过，所以字符串里的逗号不会把实参切歪。
   *
   * 还要挡住一类假阳性：**函数 / 方法定义**被当成了调用。
   *   · `powers.js:27` 的 `record(world, i) {` —— 那是 `History` 类的记录方法，
   *     `i` 是**格号**（`world.height[i]`），根本不是 kind；
   *   · `World.js` 的 `record(text, kind = 'world', actors = null) {` —— 那正是
   *     `world.record` 的**定义**本身，形参当然不是实参。
   * 判据：配对的右括号之后（跳过空白）紧跟 `{` 的，是定义不是调用——
   * 合法的调用后面不可能直接跟 `{`（`record(x) { }` 不是合法语句）。
   */
  function extractKinds(src) {
    const out = [];
    // ⚠️ `milestone(` 与 `record(` **都是写入方**（`World.milestone()` 是
    // `World.record()` 之上多记一本大事账本的那一层，见 world/World.js）。
    // 2026-09-22 之前这里只认 `record(`，于是把 9 处 `record` 改成 `milestone`
    // 之后，`ascend` 当场被误判成「没有任何写入方的死映射」——**假红**。
    // 修法是把扫描面补全（契约变了：写入方从一种变成两种），
    // **不是**把 `ascend` 从 KIND_TAG 里删掉（那才是真的删断言）。
    const re = /(?:world\.(?:record|milestone)|(?<![.\w$])(?:record|milestone))\s*\(/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      let i = m.index + m[0].length;
      let depth = 1;
      const args = [];
      let cur = '';
      while (i < src.length && depth > 0) {
        const c = src[i];
        if (c === "'" || c === '"' || c === '`') {
          const q = c;
          cur += c;
          i += 1;
          while (i < src.length && src[i] !== q) {
            if (src[i] === '\\') { cur += src[i]; i += 1; }
            if (i < src.length) { cur += src[i]; i += 1; }
          }
          if (i < src.length) { cur += src[i]; i += 1; }
          continue;
        }
        if (c === '(') depth += 1;
        else if (c === ')') { depth -= 1; if (depth === 0) break; }
        else if (c === ',' && depth === 1) { args.push(cur); cur = ''; i += 1; continue; }
        cur += c;
        i += 1;
      }
      // 定义 vs 调用：右括号后紧跟 `{` 的是定义，跳过（见函数头注释）。
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j += 1;
      if (src[j] === '{') continue;

      args.push(cur);
      if (args.length < 2) continue;
      // ⚠️ 字符集必须**接受连字符**。这里曾经只写 `[a-zA-Z_][a-zA-Z0-9_]*`，
      // 于是 `world.record(text, 'rift-lost')`（阶段三的「被裂缝吞掉」）
      // 被判成「**非字面量**的第二参调用」——它的 kind 因此既不进 `usedKinds`
      // （检查 B 的「漏配」看不见它），又在检查 D 里报成一个假阳性，
      // 报错文案还把人往「补进豁免名单」的方向带（那才是真的掩盖问题：
      // 豁免名单是给**静态取不出名字**的调用用的，不是给正则太窄用的）。
      // 根因修掉之后，`'rift-lost'` 会正常走「字面量 → usedKinds → 检查 B」，
      // 忘配 KIND_TAG 时会以**正确的那条判据**变红。
      const lit = args[1].match(/^\s*'([a-zA-Z_][a-zA-Z0-9_-]*)'\s*$/);
      out.push({ kind: lit ? lit[1] : null, raw: args[1].trim().replace(/\s+/g, ' ') });
    }
    return out;
  }

  // 第二参**不是**字符串字面量的**真实调用**：静态取不出名字，但人工复核过它确实在传 kind。
  // 所以这里登记的不只是一句说明，还有**解析出来的 kind**——它要一并计入 usedKinds，
  // 否则 `possess` 会被误判成「没有任何写入方」的死映射（一个与代码无关的假红）。
  // 写成显式名单（而不是「扫不到就算了」）是为了让**新增**的非字面量调用立刻撞红：
  // 那种调用要么改成字面量，要么补进这张名单、写下 kind 与理由。
  //
  // 注：`powers.js` 的 `i` 与 `World.js` 的 `kind = 'world'` **曾经在这张名单上**，
  // 但它们是上面那个「定义被当成调用」的假阳性，不是真的非字面量调用——
  // 根因修掉之后它们自己就消失了，不需要豁免（豁免它们反而会掩盖真问题）。
  const NON_LITERAL = new Map([
    ['RECORD_KIND', {
      kind: 'possess',
      note: 'possession.js:159 `const RECORD_KIND = \'possess\';`，三个写入方都用它',
    }],
    // D6-3 工程包 D：跨位面夺舍 / 附身两个 kind 也走模块级常量（同 `RECORD_KIND` 的写法）。
    // 不加进这张表的话，`possess-cross` / `haunt` 会被检查 C 判成「没有任何写入方的死映射」
    // （它们确实在 KIND_TAG 里），而检查 D 又会报「未豁免」——两条都是**假红**。
    ['CROSS_POSSESS_KIND', {
      kind: 'possess-cross',
      note: 'possession.js `const CROSS_POSSESS_KIND = \'possess-cross\';`，真夺舍写入方（milestone）用它',
    }],
    ['HAUNT_KIND', {
      kind: 'haunt',
      note: 'possession.js `const HAUNT_KIND = \'haunt\';`，附身写入方（record）用它',
    }],
  ]);

  const usedKinds = new Set();
  const usedWhere = new Map();
  const nonLiteral = new Set();
  const markUsed = (kind, rel) => {
    usedKinds.add(kind);
    if (!usedWhere.has(kind)) usedWhere.set(kind, new Set());
    usedWhere.get(kind).add(rel);
  };
  let callCount = 0;
  for (const f of jsFiles) {
    const rel = path.relative(srcRoot, f).replace(/\\/g, '/');
    for (const k of extractKinds(stripComments(fs.readFileSync(f, 'utf8')))) {
      callCount += 1;
      if (k.kind === null) {
        nonLiteral.add(k.raw);
        const ex = NON_LITERAL.get(k.raw);
        if (ex && ex.kind) markUsed(ex.kind, rel);
        continue;
      }
      markUsed(k.kind, rel);
    }
  }

  // B. 用了、但 KIND_TAG 里没有 → 会静默落到 world，也就是**漏配**
  const unmapped = [...usedKinds].filter((k) => !(k in KIND_TAG)).sort();
  check('源码里用到的 kind 全都在 KIND_TAG 里（漏配会静默落到 world）',
    unmapped.length === 0,
    `扫 ${jsFiles.length} 个文件 · ${callCount} 处 record(/milestone( · 字面量 kind ${usedKinds.size} 种`
    + ` · KIND_TAG ${Object.keys(KIND_TAG).length} 个键`
    + (unmapped.length ? ` · 漏配 ${unmapped.length} 个：`
      + unmapped.map((k) => `${k}(${[...usedWhere.get(k)].join(',')})`).join(' / ') : ''));

  // C. 反方向：KIND_TAG 里存在、但源码里没有任何写入方的 kind（死映射）。
  // 死映射比漏配更阴：它让人以为「这条线已经归类好了」，其实永远不会命中。
  // `cave` / `secret` 就是这么被揪出来的——它们是 `sites.js` 里**站点自己的**
  // kind（另一个命名空间），编年史里写的其实是 `site`。
  const deadTags = Object.keys(KIND_TAG).filter((k) => !usedKinds.has(k)).sort();
  check('KIND_TAG 里没有「没有任何写入方」的死映射',
    deadTags.length === 0,
    deadTags.length ? `死映射 ${deadTags.length} 个：${deadTags.join(', ')}` : '死映射 0 个');

  // D. 非字面量调用必须与豁免名单逐字一致：新增一处就撞红，逼人复核。
  const unknownNonLiteral = [...nonLiteral].filter((r) => !NON_LITERAL.has(r));
  const staleExempt = [...NON_LITERAL.keys()].filter((r) => !nonLiteral.has(r));
  check('非字面量的第二参调用与豁免名单逐字一致（新增的必须人工复核）',
    unknownNonLiteral.length === 0 && staleExempt.length === 0,
    `实测 ${nonLiteral.size} 处`
    + (unknownNonLiteral.length ? ` · 未豁免：${unknownNonLiteral.join(' / ')}` : '')
    + (staleExempt.length ? ` · 名单里已消失：${staleExempt.join(' / ')}` : ''));
}

// ── 5m. 存档体积 vs localStorage 配额（三个幅面） ──────────
//
// 为什么必须覆盖长卷：`small` 是三个预设里**最小**的，只测它等于没测体积。
// 实测（跑了 150 年、种子 20260914）：中堂 288×180 = 2,797,948 码元（53.4%）、
// 长卷 384×240 = 3,788,047 码元（**72.3%**）——危险的是长卷，不是小世界。
// 而长卷存**两份**就已经越过配额（2×72.3%），今天就会抛 `QuotaExceededError`。
//
// 成本上的切法（冒烟测试必须保持在分钟级）：
//   · 地形层**生成即存在**，占整档 58.4%（长卷 2,211,962 码元），所以
//     「只生成、不推进模拟」就能守住体积的大头，而且很便宜；
//   · 「随模拟增长的那部分」（实体 / 关系网 / 个人日志 / 编年史）
//     由上面第 5 节那个跑了 40 年的小世界守；
//   · 中间补一个中堂跑 30 年，作为「实体长起来之后」的读数；
//   · **不跑** 150 年——「跑完之后仍在配额内」应该归 inkbox-longrun，那里本来就跑 800 年。
section('5m. 存档体积 vs localStorage 配额');

{
  const largeWorld = generateWorld({ preset: WORLD_PRESETS.large, seed: 20260914, scatter: true });
  const largeChars = JSON.stringify(serializeWorld(largeWorld)).length;
  check('长卷 384×240（只生成、未推进）存档在配额内',
    storedChars(largeChars) <= SAVE_BUDGET, sizeDetail('长卷', largeChars));

  const mediumWorld = generateWorld({ preset: WORLD_PRESETS.medium, seed: 20260914, scatter: true });
  const mediumChars = JSON.stringify(serializeWorld(mediumWorld)).length;
  check('中堂 288×180（只生成、未推进）存档在配额内',
    storedChars(mediumChars) <= SAVE_BUDGET, sizeDetail('中堂', mediumChars));

  // 中堂跑 30 年：实体、关系网、个人日志、编年史都长起来之后的读数。
  // 不挂生态与野火——它们影响的是植被/火图层，属地形那一档，已经由上面两条守住。
  const ml = new Life(mediumWorld, mulberry32(20260914 ^ 0xa5a5a5a5));
  ml.processPendingSpawns();
  for (let year = 0; year < 30; year += 1) {
    for (let k = 0; k < 12; k += 1) { mediumWorld.day += 30; ml.step(30); }
  }
  const grownChars = JSON.stringify(serializeWorld(mediumWorld)).length;
  check('中堂 288×180（跑了 30 年）存档仍在配额内',
    storedChars(grownChars) <= SAVE_BUDGET,
    `${sizeDetail('中堂·30年', grownChars)} · 生灵 ${mediumWorld.entities.length}`);
}

// ── 5n. 上界：三界并存（阶段一）────────────────────────────
//
// 这些判据原本只活在设计书 `reports/design/upperworld.md` §7 与 `INKBOX.md`
// §九.5 里，全仓**没有任何测试读它们**——这就是「字段存在 ≠ 字段生效」在测试层的
// 版本：代码今天是对的，但没有任何东西阻止它明天坏掉。
//
// 为什么两界必须用**同一个 preset**：三界同尺寸是阶段一的地基（视界渲染与
// 跨世界寻址都按同一个格号索引）。预设接错不会抛错，只会让两张图叠不到一起。
section('5n. 上界：尺寸 / 种子 / 地形指纹 / 时间轴 / 空系统 / 注册表');

{
  const mortalM = generateWorld({ preset: WORLD_PRESETS.medium, seed: 20260914, scatter: true });
  const upperM = generateUpperWorld({ preset: WORLD_PRESETS.medium, seed: mortalM.seed });

  // ── ① 尺寸一致 ──
  // ⚠️ 这条**不是**「生成器跑通了」的证据：两界都调同一个 worldgen 也能尺寸相等。
  // 它只防一件事——预设接错了。`generateUpperWorld` 的 preset 默认值是 medium，
  // 忘了传 preset 就会拿 medium 去配一个 large 的凡间，而且不会报错。
  check('上界与凡间同尺寸（预设接错不报错，只会让两界叠不到一起）',
    upperM.w === mortalM.w && upperM.h === mortalM.h,
    `凡间 ${mortalM.w}×${mortalM.h} · 上界 ${upperM.w}×${upperM.h}`);

  // ── ② 种子派生 ──
  // 两条都要，缺一不可：`deriveUpperSeed(x) = x ^ 0x55505052` 是**异或自逆**的，
  // 「多派生一次」不会让种子变远，而是让它**精确回到原值**。
  // 所以「两界种子不同」单独看**不够**：它俩确实不同，可能只是不同在了错的地方。
  const derivedSeed = deriveUpperSeed(mortalM.seed);
  check('上界种子 = deriveUpperSeed(凡间种子)（派生函数只许有一处）',
    upperM.seed === derivedSeed,
    `凡间 ${mortalM.seed} → 派生 ${derivedSeed} · 上界实际 ${upperM.seed}`);
  check('上界种子 ≠ 凡间种子（否则两界的战争随机流会完全重合）',
    upperM.seed !== mortalM.seed,
    `凡间 ${mortalM.seed} · 上界 ${upperM.seed}`);

  // ── ③ 地形指纹确实不同（三条判据 + 一条对照）──
  // ⚠️ **不要用方差 / 标准差**：实测标准差 0.2395 → 0.2392，只差 0.0003，
  //    按方差写这条会**无理由撞红**。两界地形的差异是整条分布**抬高**，
  //    不是变陡或变平——所以看均值。
  let mSum = 0; let uSum = 0;
  for (let i = 0; i < mortalM.size; i += 1) mSum += mortalM.height[i];
  for (let i = 0; i < upperM.size; i += 1) uSum += upperM.height[i];
  const mMean = mSum / mortalM.size; const uMean = uSum / upperM.size;
  check('两界平均高程拉开了（差异是整条分布抬高，不是变陡 / 变平）',
    Math.abs(uMean - mMean) > 0.03,
    `凡间 ${mMean.toFixed(4)} · 上界 ${uMean.toFixed(4)}`
    + ` · 差 ${Math.abs(uMean - mMean).toFixed(4)}（阈值 0.03）`);

  const hist = (w) => {
    const a = new Array(TERRAIN_INFO.length).fill(0);
    for (let i = 0; i < w.size; i += 1) a[w.type[i]] += 1;
    for (let k = 0; k < a.length; k += 1) a[k] /= w.size;
    return a;
  };
  const hm = hist(mortalM); const hu = hist(upperM);
  let tv = 0;
  for (let k = 0; k < hm.length; k += 1) tv += Math.abs(hm[k] - hu[k]);
  tv /= 2;
  check('两界地表类型直方图的总变差距离够大（不是同一张图换了个种子）',
    tv > 0.15, `总变差距离 ${tv.toFixed(4)}（阈值 0.15）`);

  // 「云海」就是上界的水层（`fillCloudSea` 把水面之下的格子灌成 water）。
  // ⚠️ 为什么必须看云海、不能看陆地：陆地占 58% / 65%，方格图上这么高的占比
  //    **拓扑上只能是一整块**——两界都读出 98%+，那是一条与被测对象无关、
  //    永远通过的断言。判据必须落在云海上。
  const largestWaterShare = (w) => {
    const isWater = (i) => w.water[i] > 0.0015;
    let total = 0;
    for (let i = 0; i < w.size; i += 1) if (isWater(i)) total += 1;
    if (total === 0) return 0;
    const seen = new Uint8Array(w.size);
    const q = new Int32Array(w.size);
    let best = 0;
    for (let s = 0; s < w.size; s += 1) {
      if (seen[s] || !isWater(s)) continue;
      let head = 0; let tail = 0; let n = 0;
      q[tail] = s; tail += 1; seen[s] = 1;
      while (head < tail) {
        const i = q[head]; head += 1; n += 1;
        const x = i % w.w; const y = (i - x) / w.w;
        const nb = [
          x + 1 < w.w ? i + 1 : -1, x > 0 ? i - 1 : -1,
          y + 1 < w.h ? i + w.w : -1, y > 0 ? i - w.w : -1,
        ];
        for (const ni of nb) {
          if (ni < 0 || seen[ni] || !isWater(ni)) continue;
          seen[ni] = 1; q[tail] = ni; tail += 1;
        }
      }
      if (n > best) best = n;
    }
    return best / total;
  };
  const upperSea = largestWaterShare(upperM);
  const mortalSea = largestWaterShare(mortalM);
  check('上界的云海是碎的（最大连通块占水域 < 90%，是浮岛不是一块整陆）',
    upperSea < 0.90, `上界最大云海块占水域 ${(upperSea * 100).toFixed(2)}%（阈值 90%）`);
  check('对照：凡间的海是连成一片的（> 90%）——这条才证明上面的度量能区分两界',
    mortalSea > 0.90, `凡间最大海域块占水域 ${(mortalSea * 100).toFixed(2)}%`);

  // ── ④ 时间轴不漂 ──
  // `world.day` 是**唯一**的时间源，上界的 day 只是被赋值（main.js:999），
  // 它自己**不推进**。这条抓的就是「上界自己走表」——那会让上界的时间越跑越超前，
  // 而面板上只表现为「上界的天数不对」，不报错。
  const upperDay0 = upperM.day;
  const lifeM = new Life(mortalM, mulberry32(20260914));
  lifeM.processPendingSpawns();
  for (let k = 0; k < 10; k += 1) { mortalM.day += 30; lifeM.step(30); }
  check('上界不自己推进时间轴（凡间跑了 300 天，上界的 day 原地不动）',
    upperM.day === upperDay0,
    `上界 day ${upperDay0} → ${upperM.day} · 凡间已到 ${mortalM.day} 天`);

  // ── ⑤ 上界不跑凡间专属系统（阶段二口径）──
  // ⚠️ 这条断言在阶段一时是「七个不跑的系统全空」。阶段二（上界开局十二人 +
  //    自然飞升者落地）之后**按预期改写**，不是删掉：
  //      · `entities` / `clans` 从「恒空」名单**移出**——它们现在**应该**非空，
  //        正向断言在下面的 5o 组（只删不补 = 拆了闸门没装新的）；
  //      · `dead` / `deadLog.total` 也从名单**移出**，理由见下面的 ⑤b
  //        （上界**跑**逝者名录，只是开局为空；写进「恒空」= 断言「上界的人不会死」）；
  //      · 其余凡间专属账本**一条都不许删**：上界永远不该跑卜算子 / 神魂 /
  //        大战 / 飞升记录，也不该有夺舍与战账。这几项是「阶段二静默接错」的闸门。
  //
  // 什么故障会让它变红：上界误跑了凡间专属系统——例如错接夺舍
  //   （`possessionLog.*` 变正）、错开战（`wars` / `warLog.declared` 变正）、
  //   或飞升者被错记成「又飞升了一次」（`ascended` 变正）。这些都不抛错，
  //   只会静默污染上界状态。
  const upperForbiddenNonEmpty = [
    ['busanzi.milestones', upperM.busanzi.milestones.length],
    ['souls', upperM.souls.length],
    ['wars', upperM.wars.length],
    ['ascended', upperM.ascended.length],
    // `villages`：上界没有凡人聚落（06 册 §〇 第 2 条「上界没有凡人」）。
    // 全项目 `world.villages.push` 只在凡间 `sim/life.js` 出现；开局十二人与化生
    // 都写 `village: 0`，仙门记录也 `villages: []`。
    // 什么故障会让它变红：有人把凡间的村庄生成 / 收编逻辑接到上界
    //   （不报错，只会让上界凭空长出凡人聚落，把「上界只有修士」这条设定吃掉）。
    ['villages', upperM.villages.length],
  ].filter(([, n]) => n !== 0);
  const upperForbiddenNonZero = [
    ['possessionLog.succeeded', upperM.possessionLog.succeeded],
    ['possessionLog.failed', upperM.possessionLog.failed],
    ['possessionLog.suspected', upperM.possessionLog.suspected],
    ['warLog.declared', upperM.warLog.declared],
  ].filter(([, n]) => n !== 0);
  check('上界不跑凡间专属系统：卜算子/神魂/大战/飞升记录 恒空，夺舍/战账 恒零',
    upperForbiddenNonEmpty.length === 0 && upperForbiddenNonZero.length === 0,
    `非空 ${upperForbiddenNonEmpty.length} 项`
    + `${upperForbiddenNonEmpty.length ? `：${upperForbiddenNonEmpty.map(([k, n]) => `${k}=${n}`).join(' / ')}` : ''}`
    + ` · 非零 ${upperForbiddenNonZero.length} 项`
    + `${upperForbiddenNonZero.length ? `：${upperForbiddenNonZero.map(([k, n]) => `${k}=${n}`).join(' / ')}` : ''}`);
  // ── ⑤b 逝者名录的**开局基线**（不是「恒空」）──
  // ⚠️ 口径修正（原来 `dead` / `deadLog.total` 被混进上面那份「上界永远不跑」的
  //   名单里，那是**错的**）：上界**跑**逝者名录——`sim/upperLife.js:140` 的
  //   `bury()` 调 `rememberDead(upper, e)` 把陨落者入册（注释原话「未来幽冥 /
  //   名录面板读上界时不需要第二套解析」）。写成「恒空」等于断言「上界的人不会死」：
  //   本测试此刻还没接 `UpperLife`，所以它今天照样是 0；一旦接上就是**假红**。
  //   正确的语义只是「**开局**还没人死」，所以单独一条，与「不跑」分开。
  // 什么故障会让它变红：`generateUpperWorld` 在开局就往名录里塞人（例如把开局
  //   十二人预登记成「已陨落」）；或 `resetUpperSystems` 漏清 `dead` /
  //   `deadLog.total`，而将来 `World` 构造函数给了非空初值。
  check('上界逝者名录的**开局基线**为 0（开局还没人死；不是「恒空」——UpperLife.bury 会写它）',
    upperM.dead.length === 0 && upperM.deadLog.total === 0,
    `dead ${upperM.dead.length} 条 · deadLog.total ${upperM.deadLog.total}`);
  // chronicle **单独一条**：上界的编年史只记「事件」，开局十二人不是事件。
  // 什么故障会让它变红：`generateUpperWorld` 里有人调了 `world.record(...)`
  //   （例如给开局十二人补一条「紫霄初立，十二仙裔降世」）。那会污染
  //   「上界不写凡间话术」的干净基线，而且不报错。
  check('上界的编年史开局恒空（开局不是事件，只有事件才写）',
    upperM.chronicle.length === 0,
    `chronicle ${upperM.chronicle.length} 条`);

  // ── ⑥ createPlanes 的契约 ──
  // 注册表现在**一个调用点都没有**（main.js 还没接），靠这条把它钉住——
  // 否则它是一段没人读的代码，坏了也不会有人知道。
  const planes = createPlanes(mortalM, upperM, null);
  check('planes.nether.souls 是凡间魂池的**同一个数组引用**（不是拷贝）',
    planes.nether.souls === mortalM.souls,
    planes.nether.souls === mortalM.souls
      ? `同一引用 · 池里 ${planes.nether.souls.length} 个神魂`
      : '引用不同——将来魂真搬进幽冥 world 时，读档后排队等转世的神魂会凭空消失');
  check('planes.upper.world / planes.mortal.world 各自指回那张图（没有互相串）',
    planes.upper.world === upperM && planes.mortal.world === mortalM,
    `upper ${planes.upper.world === upperM ? 'ok' : '错'}`
    + ` · mortal ${planes.mortal.world === mortalM ? 'ok' : '错'}`);
}

// ── 5o. 境界表（凡间六阶 + 上界大乘）与上界开局十二人 ──────────
//
// 这一组把两条**并行落地**的源码改动钉在测试里：
//   契约 A：境界表扩成「凡间六阶 + 上界大乘」，天花板按世界取（ceilingFor）。
//   契约 B：上界开局生成 12 名修士（3 条始祖线 × 4 人）。
// 每条断言都在注释里写明「什么故障会让它变红」——不能验证会红的断言不算断言。
section('5o. 境界表（凡间六阶 + 上界大乘）与上界开局十二人');

{
  // ── ① 并集表：7 档，末档大乘 ──
  // 故障：删掉大乘档 / 改错区间（min / max）/ 漏掉寿元 16000 → 红。
  //   漏掉大乘档的后果是上界修士 level>60 时 realmFor 退回合体，
  //   显示 / 寿元 / 序号全按合体算，且不报错。
  const lastRealm = REALMS[REALMS.length - 1];
  check('REALMS 是 7 档并集表，末档「大乘」min=61 / max=69 / lifespan=16000',
    REALMS.length === 7 && lastRealm.name === '大乘'
    && lastRealm.min === 61 && lastRealm.max === 69 && lastRealm.lifespan === 16000,
    `${REALMS.length} 档 · 末档 ${lastRealm.name} ${lastRealm.min}~${lastRealm.max}`
    + ` · 寿元 ${lastRealm.lifespan}`);

  // ── ② 合体上限钉死字面量 60 ──
  // 故障：有人把 heti.max 绑回 REALM_CAP（加了上界大乘后它 = 69）。
  //   那会让合体区间涨到 69、realmLabel 的「大圆满」判据跟着上移，
  //   **凡间所有人的境界显示整体漂掉**，且不报错。（故障注入点 ①）
  const heti = REALMS.find((r) => r.key === 'heti');
  check('合体档 max === 60（钉死字面量，不许绑回 REALM_CAP）',
    !!heti && heti.max === 60, `合体 max ${heti && heti.max}`);

  // ── ③ REALM_CAP 派生 = 69 ──
  // 故障：REALM_CAP 仍写死 60（没跟着并集表走）→ 红。它是「表里最高一级」。
  check('REALM_CAP === 69（= 表里最高一级的 max，派生而非写死）',
    REALM_CAP === 69, `REALM_CAP ${REALM_CAP}`);

  // ── ④ 跨入大乘要渡劫 ──
  // 故障：BOTTLENECKS 忘了追加 60 → 上界 60→61 不再触发天劫，
  //   大乘变成「免费跨入」，静默改变上界修行难度。
  check('BOTTLENECKS 含 60（跨入大乘要渡劫）',
    BOTTLENECKS.includes(60), `BOTTLENECKS [${BOTTLENECKS.join(',')}]`);

  // ── ⑤ 天花板按世界取 ──
  // 故障：ceilingFor 把两界接反（mortal→69 / upper→60），或恒返回一个数。
  //   接反的后果：凡间修士被允许升过 60（飞升线失效），上界修士永远卡在 60。
  check('ceilingFor：凡间 60 / 上界 69（两界天花板不同源）',
    ceilingFor('mortal') === 60 && ceilingFor('upper') === 69 && MORTAL_CEILING === 60,
    `mortal ${ceilingFor('mortal')} · upper ${ceilingFor('upper')}`
    + ` · MORTAL_CEILING ${MORTAL_CEILING}`);

  // ── ⑥ realmLabel 的回归与新增 ──
  // 回归（合体段不许因加了大乘而变）：55 仍「合体 55 重」、60 仍「合体大圆满」。
  // 故障：把合体 max 绑回 REALM_CAP 后，合体跨度变 11→20，55 会掉出
  //   「X 重」分支，或 60 不再是「大圆满」→ 红。
  check('realmLabel(55) 回归：仍是「合体 55 重」（加了大乘也不许变）',
    realmLabel(55) === '合体 55 重', realmLabel(55));
  check('realmLabel(60) 回归：仍是「合体大圆满」',
    realmLabel(60) === '合体大圆满', realmLabel(60));
  // 新增（大乘段）。故障：大乘档 min / max 写错 → 下面三条对不上 → 红。
  check('realmLabel(61) 新增：「大乘」（跨入该境界不印重数）',
    realmLabel(61) === '大乘', realmLabel(61));
  check('realmLabel(62) 新增：「大乘二层」',
    realmLabel(62) === '大乘二层', realmLabel(62));
  check('realmLabel(69) 新增：「大乘大圆满」',
    realmLabel(69) === '大乘大圆满', realmLabel(69));

  // ── ⑦ 三张硬编码表与并集表等长 ──
  // 故障：某张表只补到 6 项 → 上界大乘（realm 下标 6）在渲染 / HUD 上取到 undefined：
  //   · REALM_STYLE[6] 缺失 → 大乘修士静默地没有束带 / 灵光 / 不御剑；
  //   · REALM_BAR[6] 缺失 → 境界条宽度用到的颜色是 undefined，静默不显色；
  //   · byRealm 写死 6 → `byRealm[6] += 1` 落到数组外，大乘人数永远不计入。
  //   三者都不抛错，所以只能由长度断言兜住。
  check('REALM_STYLE（unitsLayer）与 REALMS 等长',
    REALM_STYLE.length === REALMS.length,
    `REALM_STYLE ${REALM_STYLE.length} / REALMS ${REALMS.length}`);
  // ⚠️ 退而求其次：`REALM_BAR` 定义在 `main.js`，**既没有 export，import 又会
  //   拉起整份带 DOM 的主程序**（rAF 主循环 / canvas），在 node 下跑不起来。
  //   所以这里读 `main.js` 的源码文本做**静态断言**——只数数组字面量里的项数，
  //   不做任何求值。代价是「注释里写一个同名数组」也可能命中，故正则锚定
  //   `const REALM_BAR =`（该条已做故障注入验证会红，见报告）。
  const mainSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/inkbox/main.js'), 'utf8');
  const barMatch = mainSrc.match(/const\s+REALM_BAR\s*=\s*\[([\s\S]*?)\]/);
  const realmBarLen = barMatch ? barMatch[1].split(',').filter((s) => s.trim().length).length : -1;
  check('REALM_BAR（main.js，静态读源码）与 REALMS 等长',
    realmBarLen === REALMS.length,
    `REALM_BAR ${realmBarLen} / REALMS ${REALMS.length}`);
  // byRealm 是运行期构造（`new Array(REALMS.length)`），取一张真图来读长度。
  const probeWorld = generateWorld({ preset: WORLD_PRESETS.small, seed: 424242 });
  check('cultivationStats().byRealm 与 REALMS 等长（写死 6 会让大乘人数漏计）',
    probeWorld.cultivationStats().byRealm.length === REALMS.length,
    `byRealm ${probeWorld.cultivationStats().byRealm.length} / REALMS ${REALMS.length}`);

  // ── ⑧ 上界能突破过 60（本组最承重）──
  // 契约 A 的核心：突破天花板读 `ceilingFor(world.plane)`，不是写死的 `ASCEND_LEVEL`。
  // 构造同一份 level=60 / exp 已满的修士，分别放进上界与凡间 world 跑 `stepEntity`：
  //   · 上界 → 应突破到 61（大乘）；
  //   · 凡间 → 不许突破（天花板 60），而应走 `ascend()` 离开凡间。
  // 故障：① 上界仍用 ASCEND_LEVEL(60) 当上限 → 上界不突破 → 红；
  //   ② 凡间也用 69 当上限 → 凡间在 60 突破而不是飞升 → 红；
  //   ③ ASCEND_LEVEL 被改成从 REALM_CAP 派生（69）→ 凡间 60 既不突破也不飞升 → 红。
  // rng 用 `() => 0` 固定：让渡劫必成（chance≈0.21 > 0），使断言不依赖运气。
  const makeCeilingProbe = (world) => {
    const e = initEntity({ name: '天花板探针', sp: 'cultivator', x: 0, y: 0 }, mulberry32(7));
    e.id = 424242;
    e.level = 60;
    e.exp = expToNext(60) + 1;
    e.age = 0;
    e.lifespan = 1e9;            // 排除「寿元先判死」这条无关路径
    e.x = Math.floor(world.w / 2);
    e.y = Math.floor(world.h / 2);
    e.lastKarmaDay = world.day;  // 跳过善果分支（与本组无关）
    e.lastTrialDay = world.day;  // 跳过道心试炼
    return e;
  };
  const upperProbeWorld = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: 424242 });
  const upperProbe = makeCeilingProbe(upperProbeWorld);
  stepEntity(upperProbeWorld, upperProbe, 30, () => 0);
  check('上界修士在 60 级能突破到 61（大乘）——天花板按 world.plane 取 69',
    upperProbe.level === 61,
    `上界 level 60 → ${upperProbe.level}（期望 61）`);

  const mortalProbe = makeCeilingProbe(probeWorld);
  const mortalStatus = stepEntity(probeWorld, mortalProbe, 30, () => 0);
  check('凡间修士在 60 级不突破、而是飞升（天花板 60，走 ascend）',
    mortalProbe.level === 60 && mortalStatus === 'ascended',
    `凡间 level 60 → ${mortalProbe.level} · stepEntity 返回 ${mortalStatus}（期望 ascended）`);

  // ── ⑨ 上界开局十二人（3 条始祖线 × 4 人）──
  // 同一 preset + 同一凡间种子生成两次，第二次用于重建确定性。
  const FOUNDER_SEED = 20260914;
  const u1 = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: FOUNDER_SEED });
  const u2 = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: FOUNDER_SEED });

  // 故障：开局没撒人（阶段一的状态）/ 撒错数量 → 红。（故障注入点 ②）
  check('上界开局生成 12 名修士',
    u1.entities.length === 12, `entities ${u1.entities.length}`);

  // 故障：始祖线数量不对（1 条 / 12 条）→ 红。
  check('上界开局 3 条始祖线',
    u1.clans.length === 3, `clans ${u1.clans.length}`);

  // 反向断言：只写「有 3 条线」区分不了「3 条线」与「12 人乱分」——
  // 所以按 entity.clan 归组，要求**每条线恰好 4 人**。
  // 故障：任何非 4/4/4 的分法（6/3/3、或某人 clan=0）→ 归组数不对 → 红。
  const clanSize = new Map();
  for (const e of u1.entities) clanSize.set(e.clan, (clanSize.get(e.clan) || 0) + 1);
  const sizes = [...clanSize.values()].sort((a, b) => a - b);
  check('每条始祖线恰好 4 人（区分「3 条线」与「12 人乱分」）',
    u1.clans.length === 3 && sizes.length === 3 && sizes.every((n) => n === 4),
    `每条线人数 ${sizes.join(' / ')}`);

  // 故障：开局不是从 1 起（例如 level 从 0 或某个高位起）→ 红。
  const minLevel = u1.entities.length ? Math.min(...u1.entities.map((e) => e.level)) : -1;
  check('12 人全部 level>=1（开局即炼气）',
    u1.entities.length === 12 && u1.entities.every((e) => e.level >= 1),
    `${u1.entities.length} 人 · 最低 level ${minLevel}`);

  // 故障：落点只判「坐标在界内」而没判「站得住」→ 有人落进云海 / 虚空。
  //   所以这里**必须**用 `upperWalkable`（与生成侧同一套水域判据），
  //   不能用 `0 <= x < w` 那种只证明没越界的写法。
  const offTile = u1.entities.filter(
    (e) => !upperWalkable(u1, Math.floor(e.y) * u1.w + Math.floor(e.x)),
  );
  check('12 人全部落在 upperWalkable 为真的格上（不是只判坐标在界内）',
    offTile.length === 0,
    offTile.length ? `${offTile.length} 人站在云海 / 虚空里` : '12/12 站得住');

  // 故障：clan 悬垂（指向不存在的 id）或 gen 不是 1 → 红。
  const clanIds = new Set(u1.clans.map((c) => c.id));
  const badClan = u1.entities.filter((e) => !e.clan || !clanIds.has(e.clan) || e.gen !== 1);
  check('12 人的 clan 非空、指向真实 clan id、且 gen===1',
    badClan.length === 0,
    badClan.length
      ? `${badClan.length} 人 clan / gen 不对`
      : `clanId ∈ {${[...clanIds].join(',')}}`);

  // 故障：开局 12 人被记进 arrived 或 born → 长测的 `born > 0` / `arrived > 0`
  //   会被开局状态污染成假绿。开局人口**只许**记 seeded。
  check('上界开局人口只记 seeded=12，arrived=0 / born=0（不许冒充人口来源）',
    u1.popLog.seeded === 12 && u1.popLog.arrived === 0 && u1.popLog.born === 0,
    `seeded=${u1.popLog.seeded} arrived=${u1.popLog.arrived} born=${u1.popLog.born}`);

  // ── ⑩ 开局十二人的**来源快照默认值**（`World.addEntity` 这个唯一漏斗给的）──
  // `fromMortal` / `fromSect` 是「飞升者来历」的两个键（`planes.arriveUpper` 显式落）。
  // 实体创建路径有好几条（`life.spawn` / `initEntity` / `upperLife.maybeBorn` /
  // `worldgenUpper.makeSeedEntity`），一条条去补必然漏一处——本项目已栽过好几次，
  // 所以统一在 `World.addEntity` 归一（`World.js:247-248`）。开局十二人走的正是
  // 这条路（`makeSeedEntity` → `addEntity`），因此它们**天生**该是「不是飞升者」
  // 的默认值：`fromMortal=false` / `fromSect=null`。
  // 什么故障会让它变红：① 有人把这两个键从 `addEntity` 的漏斗里删掉，或改成
  //   「只在 fromMortal 为真时才设」——于是**非飞升者**身上根本没有这个键，
  //   而读档侧 `restoreEntity` 照样会建出来，形成「只在一侧存在的字段」，
  //   存读档等价测试会红在离改动很远的地方；② 开局十二人被误标成
  //   `fromMortal: true`（本地人冒充飞升者），面板会给他们编一段不存在的凡间来历。
  // ⚠️ 判据用 `!== false` / `!== null` 而不是 `!e.fromMortal` / `!e.fromSect`：
  //   后者对「键根本不存在」（undefined）与「值就是 false/null」给出同一个结果，
  //   挡不住故障①那种**缺键**。
  const founderFrom = u1.entities.filter(
    (e) => e.fromMortal !== false || e.fromSect !== null,
  );
  check('开局十二人 fromMortal===false 且 fromSect===null（addEntity 漏斗给的默认值）',
    u1.entities.length === 12 && founderFrom.length === 0,
    founderFrom.length
      ? `${founderFrom.length} 人来源快照不对：`
        + founderFrom.slice(0, 3).map((e) => `${e.name}(fromMortal=${e.fromMortal},fromSect=${e.fromSect})`).join(' / ')
      : '12/12 fromMortal=false · fromSect=null');

  // 故障：始祖线被当成「立族事件」记进 clanLog.founded → 红。
  check('始祖线不计入 clanLog.founded（始祖不是「立族」事件）',
    u1.clanLog.founded === 0, `founded ${u1.clanLog.founded}`);

  // 故障：生成期抽了主随机流 / 用了非确定性来源 → 两次签名不同 → 红。
  //   签名取「姓名 @ 坐标」逐字比对（不是只比人数）。
  const founderSig = (w) => w.entities.map((e) => `${e.name}@${e.x},${e.y}`).join('|');
  check('同一 preset + 同一凡间种子两次生成：12 人姓名与坐标逐字一致',
    u1.entities.length === u2.entities.length && founderSig(u1) === founderSig(u2),
    founderSig(u1) === founderSig(u2)
      ? '两次签名一致'
      : `签名不同：${founderSig(u1)} ≠ ${founderSig(u2)}`);
}

// ── 5p. 飞升快照：跨世界身份编码（规格 §6.3）──────────────────
//
// 背景：`world/planes.js` 的 `arriveUpper(upper, entity, mortalWorld)` 是**飞升通道**
// ——把凡间修士**按快照**复制进上界。它原来 `structuredClone(entity)` 之后
// **没有切断凡间的关系 id**，实测后果（本组就是钉这个的）：
//   凡间修士 { id:7, faction:1, clan:1, gen:3, village:1 } 飞升后
//   → 上界副本 `clan=1` 被 `clanById(1)` 认成上界始祖线 #1「顾氏」——**静默过继给陌生人**；
//   → `faction=1` 被 `UpperLife.stepSects` 算进别人的仙门，且因 `maybeFoundSects`
//     过滤 `!e.faction` 而**永不立派**；`village` 在上界恒空 → 悬垂引用。
// 契约（规格 §6.3 第 3 条「**绝不**把凡间 id 写进上界的任何字段」+ 06 册第 32 行
// 「飞升者只带『来自凡间』的来历……不带任何关系 id」）：
//   关系 id 一律清零；来历只留**名字快照**；世界限定符字符串 `'mortal:<id>'` 允许。
// 本组构造一次**真实的飞升**（真凡间宗门「测试宗」+ 真上界始祖线），逐条钉住。
section('5p. 飞升快照：凡间关系 id 一律切断（跨世界身份编码 §6.3）');
{
  // 凡间那侧：一张小图 + 一家**真的**叫「测试宗」的宗门（id=1）。
  // 用 `factionById` 查得到的真实记录，而不是手搓一个假对象——
  // `arriveUpper` 解析 `fromSect` 走的正是 `mortalWorld.factionById`。
  const mortalP = generateWorld({ preset: WORLD_PRESETS.small, seed: 20260915 });
  mortalP.factions.push({ id: 1, name: '测试宗' });
  mortalP.nextFactionId = 2;
  // 上界那侧：真图，自带 3 条始祖线（#1 = 顾氏，4 名成员）。
  const upperP = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: 20260915 });
  // 凡间修士：id / faction / clan / gen / village 全带**与上界同号**的值——
  // 这正是当年撞号的那个形状（凡间世家 id=1 vs 上界始祖线 id=1）。
  const mortal = initEntity({ name: '飞升探针', sp: 'cultivator', x: 10, y: 10 }, mulberry32(99));
  mortal.id = 7;
  mortal.faction = 1;
  mortal.clan = 1;
  mortal.gen = 3;
  mortal.village = 1;
  mortal.level = 60;

  // ⚠️ **对照/反向断言的基准**：飞升**前**上界里 `clan===1` 的人数。
  // 上界始祖线 #1 自己就有 4 名成员，所以判据是「**前后相等**」，
  // 不是「等于 0」——写成后者会当场假红。
  const clan1Before = upperP.entities.filter((e) => e.clan === 1).length;
  const arrivedBefore = upperP.arrivedLog.length;
  const copy = arriveUpper(upperP, mortal, mortalP);
  const clan1After = upperP.entities.filter((e) => e.clan === 1).length;

  // ── ① 关系 id 一律切断 ──
  // 故障：`planes.js` 里任一行 `copy.faction = 0;` / `clan` / `gen` / `village`
  //   被删掉或注释掉（或 `structuredClone` 之后又补回去）→ 凡间 id 原样落到上界。
  //   后果**不抛错**：clan=1 会被 `clanById(1)` 认成「顾氏」（静默错谱）、
  //   faction=1 会被算进别人仙门且永不立派、village 是悬垂引用。
  check('飞升副本的 faction/clan/gen/village 全为 0（凡间关系 id 一律切断）',
    copy.faction === 0 && copy.clan === 0 && copy.gen === 0 && copy.village === 0,
    `faction=${copy.faction} clan=${copy.clan} gen=${copy.gen} village=${copy.village}`
    + '（凡间原值 1/1/3/1）');

  // ── ② fromMortal 是**布尔** true ──
  // 故障：`copy.fromMortal` 被写成对象（例如 `{ id: entity.id }`）或字符串、
  //   或干脆没设（undefined）→ 按布尔判断的代码（面板「来自凡间」标记 /
  //   读档重建）走错分支；写成对象更会把凡间 id 藏回上界实体里。
  check('飞升副本 fromMortal === true 且是布尔（不是对象、不含任何 id）',
    copy.fromMortal === true && typeof copy.fromMortal === 'boolean',
    `fromMortal=${JSON.stringify(copy.fromMortal)} · typeof ${typeof copy.fromMortal}`);

  // ── ③ 反向断言：**没有** `mortalId` ──
  // ⚠️ 这条是**反向**的：只写「有 fromMortal」挡不住有人把凡间 id 加回来。
  // 故障：有人在 `arriveUpper` 里加回 `copy.mortalId = entity.id`（原来存的正是
  //   这个**裸数字**，与上界实体 id 同号）→ 跨世界反查会拿错人，且违反 §6.3 第 3 条。
  //   用 `in` 而不是 `!== undefined`：后者对「键存在但值是 undefined」放行。
  check("飞升副本**没有** 'mortalId' 键（反向断言：只写 fromMortal 挡不住 id 加回来）",
    !('mortalId' in copy),
    'mortalId' in copy ? `mortalId=${copy.mortalId}（凡间 id 又漏进上界了）` : "无 'mortalId' 键");

  // ── ④ fromSect 是**名字快照**，且与上界宗门名不混 ──
  // 故障：`fromSect` 存了 id（数字 1）而不是名字；或从**上界**那侧的
  //   `factionById` 解析——上界 faction id=1 是上界自己的仙门，名字会串成别人的。
  //   两种都不报错，只是飞升者的来历变成错的 / 空的。
  check('飞升副本 fromSect 是凡间宗门**名字**字符串「测试宗」（不是 id、不取上界同号宗门）',
    copy.fromSect === '测试宗' && typeof copy.fromSect === 'string',
    `fromSect=${JSON.stringify(copy.fromSect)}`);

  // ── ⑤ arrivedLog 末条：世界限定符字符串，不是裸数字 ──
  // 规格 §6.3 第 2 条允许 `'mortal:<id>'` 这种**世界限定符字符串**；第 3 条禁止裸数字。
  // 故障：有人把 `fromKey` 改回 `mortalId: entity.id` → 上界名册与凡间 id 混号
  //   （裸数字丢了世界维度，读档 / 面板反查时「7」到底是凡间的还是上界的无从分辨）。
  const lastArrival = upperP.arrivedLog[upperP.arrivedLog.length - 1];
  check("arrivedLog 末条 fromKey === 'mortal:7' 且**没有**裸数字 mortalId 键",
    upperP.arrivedLog.length === arrivedBefore + 1
    && !!lastArrival
    && lastArrival.fromKey === `mortal:${mortal.id}`
    && !('mortalId' in lastArrival),
    lastArrival
      ? `fromKey=${JSON.stringify(lastArrival.fromKey)}`
        + ` · ${'mortalId' in lastArrival ? `mortalId=${lastArrival.mortalId}（裸数字又回来了）` : "无 'mortalId' 键"}`
      : 'arrivedLog 是空的——飞升没记账');

  // ── ⑥ fromSect 在**缺省 mortalWorld** 时是 null（不抛错、也不留 undefined）──
  // 故障：`arriveUpper` 第三参缺省时抛错（把「手工构造的测试场景」这条路堵死），
  //   或落成 `undefined`——`undefined` 与 `null` 在 JSON 里一个消失一个保留，
  //   会让「只在一侧存在的字段」重现。
  const upperP2 = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: 20260915 });
  const mortal2 = initEntity({ name: '无宗探针', sp: 'cultivator', x: 10, y: 10 }, mulberry32(98));
  mortal2.id = 8;
  mortal2.faction = 1;                        // 有宗门 id，但**不传**凡间 world → 解析不到名字
  const copy2 = arriveUpper(upperP2, mortal2); // 第三参缺省
  check('缺省 mortalWorld 时 fromSect === null（不抛错、也不留 undefined）',
    copy2.fromSect === null,
    `fromSect=${JSON.stringify(copy2.fromSect)}`);

  // ── ⑦ 对照/反向断言（本组最承重）：**不会错谱** ──
  // 判据：飞升前后，上界里 `clan === 1` 的实体数**相等**。
  //   ⚠️ 不是「等于 0」——上界始祖线 #1 自己就有 4 名成员，写 0 会当场假红。
  // 故障：`planes.js` 把 `copy.clan = 0;` 注释掉 → 飞升者带着凡间 clan=1 落地，
  //   于是 `clanById(1)`（上界「顾氏」）凭空多出一个人——**静默过继给陌生人**，
  //   不报任何错，族谱 / 世家面板从此错谱。
  check('对照/反向：飞升前后上界 clan===1 的人数相等（飞升者不会错谱进始祖线 #1）',
    clan1After === clan1Before,
    `clan===1 人数 ${clan1Before} → ${clan1After}`
    + `${clan1After === clan1Before ? '' : '（飞升者被算进了上界始祖线 #1「顾氏」）'}`);

  // ── ⑧ popLog **五键**齐全（含**兜底路径**）──
  // `popLog` 是五键账本 `{ arrived, born, died, seeded, sucked }`。三处兜底
  // （`planes.js:228` / `upperLife.maybeBorn` / `upperLife.maybeFoundSects`）曾只造三键、
  // 丢掉 `seeded`——某处跑过之后 `popLog.seeded` 变 undefined，
  // 存读档等价测试会红在离改动很远的地方。
  //
  // ⚠️ **五键是从四键长出来的**（2026-09-19 阶段四）：`sucked` 数「被裂缝吸上来的人」，
  //   它是 `arrived` 的**子集**而不是并列项 —— 被吸上来的人**确实到达了上界**，
  //   若只记 `sucked` 不记 `arrived`，存读档等价那条「人口不凭空出现 / 凭空消失」的判据就会红。
  //
  // ⚠️ **七键是从五键长出来的**（2026-09-19 阶段四后期），两个新键各有各的**非加不可**的理由，
  //   都不是「顺手加个统计」：
  //   · `bornMortal` = **凡人生育**。`born` 的历史含义是「**修士化生**」，长测有一条判据
  //     专门守它（`上界有本土诞生（化生）`）。凡人进上界之后若两者共用一个计数器，
  //     那条判据会被凡人出生**静默顶绿**——哪怕修士化生整个坏掉，只要凡人在生照样通过。
  //     「一个字段被两件事共用」正是本项目最怕的静默坏法，所以显式拆开。
  //   · `arrivedThunder` = **经天雷飞升**进上界的人数。它是 `arrived` 的子集，
  //     但不能靠数飞升名录代替：`World.recordAscension` 把 `world.ascended` 在**内存里**
  //     就截到 120 条——**缩小了的名册不能证明「从未发生」**。长测要判「天雷这条通道
  //     还活着」，只能靠一个只增不减的累计量。
  //
  // ⚠️ 本条**刻意写死 7 个键名**：键集契约一变它就必须红。
  //   **不许**改成 `length >= 4` 那种软判据 —— 那就成了「被测量长大了就红」的假红工厂
  //   （同类教训见 `INKBOX.md` §九.17：写死被测数据长度，测的就不再是那个不变量）。
  //   正确的做法是：契约变了就**同时**改这里和 `planes.js` 的 `ensureUpperPopLog`。
  // 故障：有人把 `planes.js` 的兜底写回三 / 四键 → 删掉 popLog 后再飞升，
  //   `'seeded'` / `'sucked' in popLog` 变 false → 红。
  const upperP3 = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: 20260915 });
  delete upperP3.popLog;                        // 逼出兜底路径
  const mortal3 = initEntity({ name: '兜底探针', sp: 'cultivator', x: 10, y: 10 }, mulberry32(97));
  mortal3.id = 9;
  arriveUpper(upperP3, mortal3);                // 第三参缺省，也不碰 popLog
  const popKeys = upperP3.popLog ? Object.keys(upperP3.popLog).sort() : [];
  check("popLog 七键齐全（兜底路径：'seeded' / 'sucked' / 'bornMortal' / 'arrivedThunder' 不许丢）",
    popKeys.join(',') === 'arrived,arrivedThunder,born,bornMortal,died,seeded,sucked',
    `兜底后 popLog 键 [${popKeys.join(', ')}]`);

  // ── ⑨ 两界实体 id **空间**不相交（规格 §6.3 判据）──
  // 撞号 bug 的另一半：关系 id 切断了，**实体 id** 本身也必须分家。
  // `UPPER_ID_BASE = 1_000_000`，上界一律从该段起编（`arriveUpper` 与
  // `resetUpperSystems` 各设一次）；凡间 `nextEntityId` 从 1 起单调递增。
  // 判据写成「上界所有 id ≥ UPPER_ID_BASE」——凡间 id 全落在 [1, UPPER_ID_BASE)
  // 内（凡间实体数永远够不到 1e6），所以这条**等价于**「两界 id 段不相交」，
  // 且不依赖凡间此刻有几个实体（`mortalP` 默认不撒初始生灵，entities 可能是空的）。
  // 故障：`arriveUpper` 忘了把 `copy.id` 抬到上界段，或 `upper.nextEntityId`
  //   被凡间那套计数器覆盖 / `resetUpperSystems` 漏设偏移 → 飞升者拿到一个与
  //   凡间某人**同号**的上界 id。后果不抛错：任何拿 id 当键的跨世界账本
  //   （`arrivedLog.id` / 关系网 / 面板反查）都会指错人。
  const upperIds = upperP.entities.map((e) => e.id);
  const upperMinId = upperIds.length ? Math.min(...upperIds) : Infinity;
  check('两界实体 id 空间完全不相交（上界所有 id ≥ UPPER_ID_BASE=1_000_000）',
    upperIds.length > 0 && upperMinId >= UPPER_ID_BASE && copy.id >= UPPER_ID_BASE,
    `上界最小 id ${upperMinId} · 副本 id ${copy.id} · 凡间段 [1, ${UPPER_ID_BASE})`);
}

// ── 5q. 空间裂缝（阶段三 · 块四 · 局部数据层）────────────────
//
// 规格：`reports/design/upperworld.md` §4（1172-1313）。守的是这一层最容易
// 静默坏掉的几处：开缝条数、只在四边、可站人、记录键集、曲线有峰、
// **闭合不早退**（本阶段最容易犯的错）、账本守恒、工具 readonly。
// 每条都注明「什么故障会让它变红」。
section('5q. 空间裂缝：开缝 / 只在四边 / 可站人 / 键集 / 曲线 / 闭合 / 账本');

{
  // 造一对同尺寸的凡间 + 上界（`openRifts` 的位置过滤要判上界对应格可站人）。
  const makeRiftWorld = (seed) => {
    const m = generateWorld({ preset: WORLD_PRESETS.small, seed, scatter: true });
    const u = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: m.seed });
    m.upper = u;
    return m;
  };
  const wantOf = (rect) => {
    const cols = Math.abs(rect.x1 - rect.x0) + 1;
    const rows = Math.abs(rect.y1 - rect.y0) + 1;
    return Math.max(1, Math.min(4, Math.round(2 * (cols + rows) / 120)));
  };

  // ── ① 开缝条数 === clamp(1,4,round(周长/120)) ──
  // 故障：周长算成面积、钳位写反、clamp 上下界写错 → 条数不对。
  // 取两个矩形：小矩形 want=1（下钳位），大矩形 want=4（上钳位）。
  const wA = makeRiftWorld(20260914);
  const rectSmall = { x0: 30, y0: 20, x1: 34, y1: 24 };
  const rectBig = { x0: 0, y0: 0, x1: 199, y1: 70 };
  const rSmall = openRifts(wA, rectSmall);
  const rBig = openRifts(wA, rectBig);
  check('开缝条数 === clamp(1,4,round(周长/120))（小矩形 want=1）',
    rSmall.opened === wantOf(rectSmall) && wantOf(rectSmall) === 1,
    `opened=${rSmall.opened} · want=${wantOf(rectSmall)}`);
  check('开缝条数（大矩形 want=4，上钳位生效）',
    rBig.opened === wantOf(rectBig) && wantOf(rectBig) === 4,
    `opened=${rBig.opened} · want=${wantOf(rectBig)} · 当前活跃 ${wA.rifts.length}`);

  // ── ② 没有一条裂缝落在矩形内部（只在四边）──
  // 故障：候选格生成时把内部也算进去（`for y in y0..y1` 而不是 y0+1..y1-1）。
  // 用一个干净 world 只开一个矩形，逐条判。
  const wE = makeRiftWorld(777);
  const rectE = { x0: 30, y0: 20, x1: 74, y1: 64 };
  const rE = openRifts(wE, rectE);
  const onEdge = (rf) => rf.y === rectE.y0 || rf.y === rectE.y1
    || rf.x === rectE.x0 || rf.x === rectE.x1;
  const inside = wE.rifts.filter((rf) => !onEdge(rf));
  check('没有一条裂缝落在矩形内部（只在四边）',
    rE.opened > 0 && inside.length === 0,
    `开 ${rE.opened} 道 · 落在内部的 ${inside.length} 条`
    + (inside.length ? `：${inside.map((r) => `(${r.x},${r.y})`).join(' ')}` : ''));

  // ── ③ 每条裂缝的凡间格与上界对应格都能站人 ──
  // 故障：位置过滤只判了凡间、漏判上界 → 开出「雪山之巅谁都够不着」的纯装饰缝。
  const badWalk = wE.rifts.filter((rf) => {
    const i = rf.y * wE.w + rf.x;
    return !wE.isWalkable(i) || !upperWalkable(wE.upper, i);
  });
  check('每条裂缝的凡间格与上界对应格都能站人',
    wE.rifts.length > 0 && badWalk.length === 0,
    badWalk.length ? `${badWalk.length} 条站不住人` : `${wE.rifts.length} 条全部可站人`);

  // ── ④ 记录键集恰好是契约的 10 个键 ──
  // 故障：有人把 `radius`/`peakDay` 存进来（铁律二），或塞进任何 id 引用（铁律三）。
  //
  // ⚠️ **`age` 是第 9 个键，它不违反铁律二**（2026-09-19 阶段四新增）。
  //   铁律二是「能现算的派生量不入档」，而 `age` **现算不出来**：它记的是这条缝
  //   「在视界**开启期间**累积的天数」，取决于玩家历次开关视界的历史——那是存档之外的事实。
  //   （改前曲线读的是绝对时间，于是玩家关掉视界那阵子缝照样在长，重开时它已经老了；
  //    改读 `age` 才是规格「视界开着才扩张」的本意。理由见 `rifts.js` 的 `riftRadiusAt` 注释。）
  //   同理 `radius` / `peakDay` 仍**不许**进档：那两个能从 `age` + `strength` 现算出来。
  // ⚠️ **`targetPlane` 是第 10 个键**（2026-09-24 · D6-2 工程包 B2）：它记「这条缝
  //   连的是上界还是幽冥」，**推不出来**（一条缝能活 30–40 年，玩家关掉视界以后
  //   它仍然必须知道自己原本连接哪里）。它同样是纯数据、无 id 引用，不违反铁律三。
  const RIFT_KEYS = ['age', 'id', 'x', 'y', 'strength', 'openedDay', 'closedDay', 'leaked', 'crossed', 'targetPlane']
    .sort().join(',');
  const badKeys = wE.rifts.filter((rf) => Object.keys(rf).sort().join(',') !== RIFT_KEYS);
  check('裂缝记录的键集恰好是契约的 10 个键（没有 id 引用混入）',
    wE.rifts.length > 0 && badKeys.length === 0,
    badKeys.length
      ? `${badKeys.length} 条键集不符：${Object.keys(badKeys[0]).sort().join(',')}`
      : `键集 ${RIFT_KEYS}`);

  // ── ⑤ riftRadiusAt 曲线**有内部极大**（先涨后缩，不是单调）──
  // ⚠️ 规格 §4.4 写的是「峰值日 = openedDay + TAU_GROW」，但按规格自己给的公式
  //    r(t) = strength·(1-e^{-t/TAU_GROW})·e^{-max(0,t-TAU_GROW)/TAU_CLOSE}
  //    **它并不成立**：真正的极大值在
  //        t* = TAU_GROW · ln(1 + TAU_CLOSE/TAU_GROW) ≈ 2.40·TAU_GROW
  //    （本模块 TAU_CLOSE/TAU_GROW = 10 → ln(11)≈2.398），即峰在 τ 之后。
  //    所以判据写成「内部有极大」而不是「在 TAU_GROW 处最大」：
  //    后者按公式是**假红**判据，写它只会误导下一个人。
  //
  // ⚠️ **探针强度从常量现算，不写死数字**：曲线形状与强度无关（全部断言都是
  //    比值 / 位置判据），所以探针强度取 `RIFT_MAX_RADIUS`（§4.4 的峰值尺度上限）。
  //    从前这里写死 `strength: 5`、并把「r(τ)=3.16 / r(3τ)=3.89」抄进注释——
  //    那些读数只对当时那个魔数成立，常量一动就变成假证据。现在打印出来的
  //    每个数都由 `riftRadiusAt` + 常量当场算出。
  // 故障：`decay` 的 `Math.max(0, ...)` 被删（且 TAU_CLOSE 相对 TAU_GROW 很小时，
  // 峰会被推到 t→0，变成「一开就最大然后一直缩」），或公式退化成单调曲线。
  const probe = { strength: RIFT_MAX_RADIUS, openedDay: 0, closedDay: -1 };
  // ⚠️ 签名是 `riftRadiusAt(rift)` —— 它**只读 `rift.age`**，没有第二个参数。
  //    （2026-09-19 阶段四：曲线的自变量从「绝对天数」改成「视界开启期间累积的天数」，
  //     所以时间不再从外部传进去，而是缝自己带着。改前这里写的是 `riftRadiusAt(probe, t)`，
  //     多传的那个 `t` 被**静默忽略**，于是 `probe.age` 恒为 `undefined` → `|| 0` → 恒 0，
  //     每个采样点都读出 0.000、峰值落在 t=100 —— **看起来像「曲线没有极大」，
  //     其实是探针压根没把自变量喂进去**。⚠️ 这类假象最容易被当成产品 bug 去改公式，
  //     而公式本来是对的。）
  //    想让一条缝「长到某个年纪」，就把 `age` 换掉，**不要**给它加第二个参数。
  //    补一条反向保险：若哪天签名真的改回 `(rift, t)`，下面这些采样点会全部读出 0 而撞红。
  const rAt = (t) => riftRadiusAt({ ...probe, age: t });
  const theoPeakT = TAU_GROW * Math.log(1 + TAU_CLOSE / TAU_GROW);
  let bestT = 0;
  let bestR = -1;
  for (let k = 1; k <= 400; k += 1) {           // 100 日一采样，扫到 40000 日
    const t = k * 100;
    const rr = rAt(t);
    if (rr > bestR) { bestR = rr; bestT = t; }
  }
  // 位置判据由 TAU_GROW 现算：真峰在 ≈2.4τ，取 [0.5τ, 10τ] 这个宽松但非空的区间。
  const hasPeak = bestT > TAU_GROW * 0.5 && bestT < TAU_GROW * 10
    && bestR > rAt(100) && bestR > rAt(40000) && rAt(TAU_GROW) > rAt(100);
  check('riftRadiusAt 曲线有内部极大（先涨后缩，不是单调）',
    hasPeak,
    `峰值 ${bestR.toFixed(3)} 在 t=${bestT}（≈${(bestT / TAU_GROW).toFixed(2)}τ，解析 ${(theoPeakT / TAU_GROW).toFixed(2)}τ）`
    + ` · r(0.1τ)=${rAt(TAU_GROW * 0.1).toFixed(3)} r(τ)=${rAt(TAU_GROW).toFixed(3)}`
    + ` r(3τ)=${rAt(TAU_GROW * 3).toFixed(3)} r(37τ)=${rAt(TAU_GROW * 37).toFixed(3)}`);

  // ── ⑤bis 标定：中堂 + 40×30 划选下的**峰值半径**必须落在 [3.5, 4.5] 格 ──
  // 依据（见 `rifts.js` 的 `RIFT_BASE_RADIUS` 注释）：裂缝至少要**看得见**
  // （≥ 玩家笔刷量级）且**够得着**（半径内格数不至于恒为 0）。改前实测 ≈1.62 格
  // （半径 1.62 的圆只覆盖约 8 格 = 全图 0.015%），是「不存在」而非「轻微」。
  // 故障：有人把 `RIFT_BASE_RADIUS` / `RIFT_MAX_RADIUS` 调回小值，
  //       或把 §4.1 的面积占比那一项删掉 → 峰值半径掉出区间 → 变红。
  {
    const med = WORLD_PRESETS.medium;
    const areaFrac = (40 * 30) / (med.w * med.h);
    const strength = Math.min(RIFT_MAX_RADIUS, RIFT_BASE_RADIUS * (1 + areaFrac));
    const peakFactor = (1 - Math.exp(-theoPeakT / TAU_GROW))
      * Math.exp(-Math.max(0, theoPeakT - TAU_GROW) / TAU_CLOSE);
    const peakRadius = strength * peakFactor;
    check('标定：中堂 + 40×30 划选的峰值半径 ∈ [3.5, 4.5] 格',
      peakRadius >= 3.5 && peakRadius <= 4.5,
      `峰值 ${peakRadius.toFixed(3)} 格（strength ${strength.toFixed(3)} × 峰值系数 ${peakFactor.toFixed(4)}）`);
  }

  // ── ⑥ 闭合不早退：开缝后只推进 30 日，缝仍然活着 ──
  // ⚠️ **本阶段最容易犯的错**：`grow = 1 - exp(-t/TAU_GROW)` 在 t 小时接近 0，
  // 若闭合判据漏了 `t >= TAU_GROW` 前置条件，每条缝都会在开启后第一次判定时
  // 立刻闭合 → `opened`/`closed` 同步涨、`leaked`/`crossed` 恒 0，系统
  // 「跑过了但什么都没发生」。故障：`stepRifts` 的闭合前置条件被删 → 变红。
  const wC = makeRiftWorld(555);
  const rC = openRifts(wC, rectE);
  const activeBefore = wC.rifts.length;
  wC.day += RIFT_PERIOD_DAYS;      // 只推进一个判定周期（30 日）
  stepRifts(wC);
  check('开缝后只推进 30 日，缝仍然活着（闭合必须加 t>=TAU_GROW 前置）',
    rC.opened > 0 && activeBefore > 0 && wC.rifts.length === activeBefore
      && wC.riftLog.closed === 0,
    `开 ${rC.opened} 道 · 30 日后仍活跃 ${wC.rifts.length}/${activeBefore}`
    + ` · closed=${wC.riftLog.closed}`);

  // ── ⑦ 账本守恒：opened === closed + world.rifts.length ──
  // 故障：闭合时忘了从数组剔除（或忘了记 closed）→ 恒等式两边不等。
  check('riftLog 守恒：opened === closed + world.rifts.length',
    wC.riftLog.opened === wC.riftLog.closed + wC.rifts.length,
    `opened=${wC.riftLog.opened} closed=${wC.riftLog.closed} 活跃=${wC.rifts.length}`
    + ` · stats=${JSON.stringify(riftStats(wC))}`);

  // ── ⑧ 上界视界工具仍 readonly:false ──
  // 故障：有人觉得它「只是看」，顺手把 readonly 改成 true → 光标变 help、
  // 提示语变成「不改动世界」，而开缝是实打实的副作用。
  const viewTool = TOOL_BY_ID['viewUpper'];
  check('上界视界工具仍 readonly:false（开缝是实打实的副作用）',
    Boolean(viewTool) && viewTool.readonly === false,
    `readonly=${viewTool && viewTool.readonly}`);

  // ══════════════════════════════════════════════════════════════════
  // ⑨–⑬ 裂隙的**目标位面**（2026-09-24 · D6-2 工程包 B）
  // ══════════════════════════════════════════════════════════════════
  // 这一组守的是本阶段最重要的一条硬不变量：
  //   **打开幽冥视界绝不会偷偷执行上界转移。**
  // 在它落地之前，`viewNether` 与 `viewUpper` 共用同一条 `openRifts`，
  // 而 `rifts.js` 内部**只有上界逻辑**——玩家打开幽冥视界、划出裂缝，
  // 那条缝会去执行凡间 ↔ **上界**的漏物 / 吸人。语义完全错位，**且不报错**。
  //
  // ⚠️ 判据设计（为什么不是「跑一跑看有没有漏物」）：漏物概率是每周期 0.5%，
  //    「跑 200 拍没漏」在**结构正确**与**运气好**两种情况下长得一模一样——
  //    那是一台假绿工厂。所以主判据用**随机流位置**：
  //    `stepRifts` 里唯一抽签的地方就是漏物分支，而它排在
  //    `if (rift.targetPlane === 'nether') continue;` **之后**。
  //    ⇒ 「流没前进」= 那条分支**在结构上不可达**，与概率无关。
  //    ⑫b 是**对照**：同参数的上界缝必须让流前进——否则 ⑫ 恒真、什么都没测。
  const makeRiftWorld3 = (seed) => {
    const m = generateWorld({ preset: WORLD_PRESETS.small, seed, scatter: true });
    m.upper = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: m.seed });
    m.nether = generateNetherWorld({ preset: WORLD_PRESETS.small, seed: m.seed });
    return m;
  };
  const RECT3 = { x0: 30, y0: 20, x1: 74, y1: 64 };

  // ── ⑨ 缺省目标位面 = 'upper'（契约之前的历史行为，必须逐字保留）──
  // 故障：有人把缺省改成 'nether' 或去掉归一 → 老调用点（测试 / 旧档回放）
  //   开出来的缝全变成幽冥缝，从此不再漏物，而且**不报错**。
  {
    const wP = makeRiftWorld3(20260914);
    const rP = openRifts(wP, RECT3);
    check("缺省 openRifts 的 targetPlane 全是 'upper'（历史行为逐字保留）",
      rP.opened > 0 && wP.rifts.every((rf) => rf.targetPlane === 'upper'),
      `opened=${rP.opened} · 值 ${[...new Set(wP.rifts.map((r) => r.targetPlane))].join('/')}`);
  }

  // ── ⑩ 幽冥缝：开得出来，且落点按**幽冥**判据（不是上界那把尺子）──
  // 故障：位置过滤继续统一调 `upperWalkable` → 幽冥缝的落点集合被换成上界的
  //   那套阈值。实测该图上两判据分叉 **9438/25600 格（36.9%）**，所以这不是
  //   纸面问题：落点会真的变，而且**不报错**（缝照开，只是开在别处）。
  {
    const wN = makeRiftWorld3(20260914);
    const rN = openRifts(wN, RECT3, 'nether');
    const badWalk3 = wN.rifts.filter((rf) => {
      const i = rf.y * wN.w + rf.x;
      return !wN.isWalkable(i) || !netherWalkable(wN.nether, i);
    });
    check("nether 缝开得出来且 targetPlane='nether'",
      rN.opened > 0 && wN.rifts.every((rf) => rf.targetPlane === 'nether'),
      `opened=${rN.opened}`);
    check('nether 缝落点：凡间可站 **且** 幽冥可站（判据单源 netherWalkable）',
      wN.rifts.length > 0 && badWalk3.length === 0,
      badWalk3.length ? `${badWalk3.length} 条站不住` : `${wN.rifts.length} 条全部可站`);
  }

  // ── ⑪ 目标位面不存在 → **如实报拒**，不造一条连不通的缝 ──
  // 故障：幽冥图没挂上时仍然开缝（或静默返回 opened:0 而不给 reason）→
  //   世界状态里多出一条「连幽冥」的缝，而幽冥根本不存在；玩家看到「开成了」。
  {
    const wNo = generateWorld({ preset: WORLD_PRESETS.small, seed: 7, scatter: true });
    const rNo = openRifts(wNo, RECT3, 'nether');
    check("world.nether 缺失 → refused 且 reason='no-plane'（不许静默）",
      rNo.opened === 0 && rNo.refused === true && rNo.reason === 'no-plane',
      JSON.stringify(rNo));
  }

  // ── ⑫ 硬不变量：nether 缝推进 200 拍，**裂缝随机流一个签都没抽** ──
  // 两界同种子 ⇒ 同一条裂缝随机流。一个推了 200 拍、一个不推：
  // 下一个签若相同，说明 `stepRifts` 对 nether 缝**一次 `rng` 都没调**——
  // 而上界漏物（`rng` 的唯一消费者）就在那之后 ⇒ `arriveUpper` /
  // `leakFromUpper` / `leakToUpper` 在结构上够不到它。
  //
  // ⚠️ **D6-3 工程包 A 之后这条仍然成立，但含义变了**：幽冥缝不再被「冻结」，
  //   而是走**自己的通道 + 自己的流**（`stepNetherRift` / `netherRiftRngFor`）。
  //   所以「裂隙流 0 次」不再等于「什么都没发生」——必须**同时**断言
  //   「幽冥流 ≥ 1 次」，否则「独立流」只是一句注释（建了流却没人抽，
  //   与「共用裂隙流」在行为上无法区分）。
  {
    // 「这条流被抽了几次」的计数器（D6-3 工程包 A 抽成助手，两处都用它）。
    // 手法：`riftRngFor(world)` 返回的是**该 world 专属**的 mulberry32 实例
    // （存在模块级 WeakMap 里），所以「它被抽了几次」是**数**得出来的——
    // 拿一个同样种子、从零开始的参照流，往前推 k 次，看哪一次与它当前的
    // 下一签相同。
    const drawsConsumed = (w) => {
      const next = riftRngFor(w)();       // 取实例并读下一签（抽掉，用完即弃）
      const ref = mulberry32(((w.seed || 0) ^ RIFT_SEED_KEY) >>> 0);
      for (let k = 0; k <= 40; k += 1) {
        if (ref() === next) return k;     // 参照流推 k 次后同签 ⇒ 它被抽了 k 次
      }
      return -1;                          // 对不上：用的不是这条流（结构变了）
    };
    // ⚠️ 「幽冥流真的在被消费」**不能**用绝对位置计数（`openRifts` 自己会
    //    消费裂隙流，绝对位置里混着那一笔）——它用的是下面的同种子双世界比对。

    const rA = makeRiftWorld3(20260914);
    const rB = makeRiftWorld3(20260914);
    const opened3 = openRifts(rA, RECT3, 'nether');
    openRifts(rB, RECT3, 'nether');
    for (let i = 0; i < 200; i += 1) { rA.day += RIFT_PERIOD_DAYS; stepRifts(rA); }
    const nextA = riftRngFor(rA)();
    const nextB = riftRngFor(rB)();
    check('nether 缝推进 200 拍：裂缝随机流未前进（上界链路结构上不可达）',
      opened3.opened > 0 && nextA === nextB,
      `opened=${opened3.opened} · 下一签 ${nextA} vs ${nextB}`);
    check('nether 缝：riftLog.leaked / crossed 恒 0（上界口径的账一个字都没动）',
      rA.riftLog.leaked === 0 && rA.riftLog.crossed === 0,
      `leaked=${rA.riftLog.leaked} crossed=${rA.riftLog.crossed}`);
    check('nether 缝的生命周期照跑（age 在涨，不是被冻死）',
      rA.rifts.length > 0 && rA.rifts[0].age > 0,
      `活跃 ${rA.rifts.length} · age=${rA.rifts.length ? rA.rifts[0].age : '—'}`);

    // ★ D6-3 A：幽冥缝**确实在消费自己的流**（独立流不是摆设）。
    //   ⚠️ 用**同种子双世界比对**，不能用「绝对位置」计数：`openRifts` **自己**
    //   会消费裂隙流（它用 `rng` 洗牌候选站点），绝对位置里混着那一笔，
    //   于是「0 次」永远读不到 0。rA 跑了 200 拍、rB 没跑，两条流该不同。
    //   故障：`stepNetherRift` 忘了抽签（比如直接 return）⇒ 两签相同，红。
    const netNextA = netherRiftRngFor(rA)();
    const netNextB = netherRiftRngFor(rB)();
    check('★ nether 缝推进 200 拍：**消费自己的流**（独立流真的在用）',
      netNextA !== netNextB, `rA ${netNextA} vs rB ${netNextB}`);
    check('★ 两条流用**不同的**派生键（相同 = 共用一条流，独立流白建）',
      NETHRIFT_SEED_KEY !== RIFT_SEED_KEY,
      `rift=0x${RIFT_SEED_KEY.toString(16)} · nether=0x${NETHRIFT_SEED_KEY.toString(16)}`);

    // ★ D6-3 A：**两条流互不干扰**——同一世界里多一条幽冥缝，上界缝的
    //   抽签次数必须**一个字都不变**。
    //   故障：把 nether 缝接回 `rng`（共用裂隙流）⇒ 两个数不再相等。
    //   这是本包最承重的一条：它保证「玩家多开一条幽冥视界」不会移动
    //   上界缝的随机序列（否则既有标定与长测读数全部作废，且不报错）。
    const mkUpper = (withNether) => {
      const w = makeRiftWorld3(20260914);
      w.rifts = [{
        id: 1, x: 12, y: 12, strength: RIFT_BASE_RADIUS, openedDay: 0,
        age: 0, closedDay: -1, leaked: 0, crossed: 0, targetPlane: 'upper',
      }];
      if (withNether) {
        w.rifts.push({
          id: 2, x: 20, y: 20, strength: RIFT_BASE_RADIUS, openedDay: 0,
          age: 0, closedDay: -1, leaked: 0, crossed: 0, targetPlane: 'nether',
        });
      }
      w.nextRiftId = 3;
      return w;
    };
    const wOnly = mkUpper(false);
    const wBoth = mkUpper(true);
    stepRifts(wOnly);
    stepRifts(wBoth);
    const cOnly = drawsConsumed(wOnly);
    const cBoth = drawsConsumed(wBoth);
    check('★ 上界缝的抽签次数**不受**「同世界还有没有幽冥缝」影响（两条流互不干扰）',
      cOnly === cBoth && cOnly >= 1, `只有上界缝 ${cOnly} 次 · 再加一条幽冥缝 ${cBoth} 次`);
  }

  // ── ⑫b **对照**：同参数的上界缝必须让随机流前进 ──
  // 没有这一条，⑫ 是一台**假绿工厂**：万一「流比较」的写法本身失效
  // （比如 `riftRngFor` 每次返回新流），⑫ 会在什么都没测的情况下恒绿。
  // 什么故障会让它变红：上界缝也被跳过（比如判据写成 `!== 'upper'`，
  //   把老档 / 手工构造的无 `targetPlane` 记录一并冻结）。
  {
    const rC3 = makeRiftWorld3(20260914);
    const rD3 = makeRiftWorld3(20260914);
    const opC = openRifts(rC3, RECT3, 'upper');
    const opD = openRifts(rD3, RECT3, 'upper');
    for (let i = 0; i < 200; i += 1) { rC3.day += RIFT_PERIOD_DAYS; stepRifts(rC3); }
    check('对照：upper 缝推进 200 拍后随机流**已前进**（证明 ⑫ 有区分力）',
      opC.opened > 0 && opD.opened > 0 && riftRngFor(rC3)() !== riftRngFor(rD3)(),
      `opened=${opC.opened}/${opD.opened}`);
  }

  // ── ⑬ 有人站在 nether 缝上跑 600 拍（越过闭合点）：人**要么在凡间、要么在幽冥** ──
  // ⑫ 判的是「流没动」，这一条判的是**行为后果**。两条硬不变量必须同时成立：
  //   ① **上界一个数都没变**（nether 缝绝不走 `arriveUpper` 那条链路）；
  //   ② **人不会凭空蒸发**（凡间剩下的 + 幽冥多出来的 === 1）。
  // 什么故障会让它变红：nether 缝走上界漏物逻辑（人被卷进上界，
  //   `upper.entities` / `popLog.arrived` 涨）；或转移半途而废
  //   （先把人 `splice` 出凡间、再发现落不成 ⇒ 人从世界上消失）。
  // ⚠️ **D6-3 工程包 A 起「人仍在凡间」不再是契约**：他会跌进幽冥。这条判据
  //    因此改写成**守恒式**，而不是「人没动」——后者在「跌进去了」与
  //    「压根没判」两种情况下长得一模一样（假绿工厂）。
  {
    const wG = makeRiftWorld3(20260914);
    openRifts(wG, RECT3, 'nether');
    const rfG = wG.rifts[0];
    wG.entities.push({
      id: 999999, sp: SPECIES.CULTIVATOR, x: rfG.x + 0.5, y: rfG.y + 0.5,
      level: 10, hp: 10, maxHp: 10, age: 0, lifespan: 100000,
      artifacts: [], relations: new Map(), name: '守缝修士',
    });
    const nBefore = wG.nether.entities.length;
    const uEnt = wG.upper.entities.length;
    const uArt = wG.upper.artifacts.length;
    const uArr = (wG.upper.popLog && wG.upper.popLog.arrived) || 0;
    for (let i = 0; i < 600; i += 1) { wG.day += RIFT_PERIOD_DAYS; stepRifts(wG); }
    const fell = wG.nether.entities.length - nBefore;
    check('★ nether 缝跑满一生：**人要么在凡间、要么在幽冥**（守恒，绝不凭空蒸发）',
      wG.entities.length + fell === 1,
      `凡间 ${wG.entities.length} · 幽冥新增 ${fell} · 合计 ${wG.entities.length + fell}`);
    check('nether 缝跑满一生：上界 entities / artifacts / popLog.arrived 一个都没动',
      wG.upper.entities.length === uEnt && wG.upper.artifacts.length === uArt
      && ((wG.upper.popLog && wG.upper.popLog.arrived) || 0) === uArr,
      `entities ${uEnt}→${wG.upper.entities.length} · artifacts ${uArt}→${wG.upper.artifacts.length}`
      + ` · arrived ${uArr}→${(wG.upper.popLog && wG.upper.popLog.arrived) || 0}`);
    check('nether 缝仍会闭合（生命周期完整走完）',
      wG.riftLog.closed > 0,
      `opened=${wG.riftLog.opened} closed=${wG.riftLog.closed} 活跃=${wG.rifts.length}`);
  }

  // ── ⑭ 凡人跌入幽冥：**直接调 `fallIntoNether`** 的确定性用例（D6-3 工程包 A）──
  // ⑬ 是端到端（600 拍里抽不中就不能断言「一定跌进去」）。这一条把效果函数
  // 单独拿出来判，覆盖 ⑬ 结构上覆盖不到的分支：半径外的人、高修为、
  // 没有幽冥位面、以及「法宝不随人蒸发」。
  {
    const mkFallWorld = () => {
      const w = makeRiftWorld3(4242);
      // 一条**手工**的 nether 缝：不走 `openRifts`，免得依赖地形（本组判的是
      // 效果函数本身，不是开缝）。
      w.rifts = [{
        id: 1, x: 30, y: 30, strength: 5, openedDay: 0,
        age: 0, closedDay: -1, leaked: 0, crossed: 0, targetPlane: 'nether',
      }];
      w.nextRiftId = 2;
      return w;
    };
    const putPerson = (w, spec) => {
      w.entities.push(Object.assign({
        id: 999999, sp: SPECIES.CULTIVATOR, x: 30.5, y: 30.5,
        level: 10, hp: 10, maxHp: 10, age: 0, lifespan: 100000,
        artifacts: [], relations: new Map(), name: '试缝人',
      }, spec));
    };

    // ① 正面：把人送进幽冥
    const w1 = mkFallWorld();
    putPerson(w1, {});
    const n0 = w1.nether.entities.length;
    const ok1 = fallIntoNether(w1, w1.rifts[0], 5);
    check('★ `fallIntoNether` 送走一个人：凡间少一个、幽冥多一个',
      ok1 === true && w1.entities.length === 0 && w1.nether.entities.length === n0 + 1,
      `ok=${ok1} · 凡间 ${w1.entities.length} · 幽冥 ${n0}→${w1.nether.entities.length}`);
    const g1 = w1.nether.entities[w1.nether.entities.length - 1];
    check('落成的幽冥实体是**鬼修**（level ≥ 1 ⇒ ghostCultivator），且带身份快照',
      g1.sp === SPECIES.GHOST && g1.soulKind === 'ghostCultivator'
      && Boolean(g1.ghostOf) && g1.ghostOf.ref === 'mortal:999999',
      `sp=${g1.sp} soulKind=${g1.soulKind} ref=${g1.ghostOf && g1.ghostOf.ref}`);
    check('幽冥账本：`fellIn` 记 1，且它是 `ghostBorn` 的**子计数**（守恒式不受影响）',
      w1.nether.popLog.fellIn === 1 && w1.nether.popLog.ghostBorn === 1
      && w1.nether.popLog.fellIn <= w1.nether.popLog.ghostBorn,
      `fellIn=${w1.nether.popLog.fellIn} ghostBorn=${w1.nether.popLog.ghostBorn}`);
    check('上界口径的账**一个字都没动**（`riftLog.leaked` / `crossed` 恒 0）',
      w1.riftLog.leaked === 0 && w1.riftLog.crossed === 0,
      `leaked=${w1.riftLog.leaked} crossed=${w1.riftLog.crossed}`);

    // ② 对照：半径外的人不动（判据是「半径内」，不是「全世界」）
    const w2 = mkFallWorld();
    putPerson(w2, { x: 300.5, y: 300.5 });
    const ok2 = fallIntoNether(w2, w2.rifts[0], 5);
    check('对照：半径外的人**不动**（判的是半径，不是全世界）',
      ok2 === false && w2.entities.length === 1 && w2.nether.entities.length === 0,
      `ok=${ok2} · 凡间 ${w2.entities.length} · 幽冥 ${w2.nether.entities.length}`);

    // ③ 对照：高修为不进候选（他们只能走飞升）——判据是 `>=` 而不是 `>`
    const w3 = mkFallWorld();
    putPerson(w3, { level: RIFT_CROSS_MAX_LEVEL });
    const ok3 = fallIntoNether(w3, w3.rifts[0], 5);
    check('★ 对照：化神期（level === 门槛）**不进候选**（高修为只能走飞升）',
      ok3 === false && w3.entities.length === 1,
      `ok=${ok3} · level=${w3.entities[0] && w3.entities[0].level} · 门槛 ${RIFT_CROSS_MAX_LEVEL}`);

    // ④ 对照：没有幽冥位面 ⇒ 整条跳过，凡间毫发无伤
    const w4 = mkFallWorld();
    w4.nether = null;
    putPerson(w4, {});
    const ok4 = fallIntoNether(w4, w4.rifts[0], 5);
    check('对照：`world.nether` 不存在 ⇒ 返回 false 且**凡间毫发无伤**',
      ok4 === false && w4.entities.length === 1,
      `ok=${ok4} · 凡间 ${w4.entities.length}`);

    // ⑤ 法宝不随人蒸发（**D6-3 工程包 C 改了去向**：跟着人进幽冥，
    //    不再像 A 包那样 `scatterArtifacts` 留在凡间地上）
    const w5 = mkFallWorld();
    putPerson(w5, { artifacts: [{ id: 1, name: '随身的剑' }] });
    const nArtBefore = (w5.nether.artifacts || []).length;
    fallIntoNether(w5, w5.rifts[0], 5);
    check('★ 跌入者身上的法宝**跟着人进幽冥**（不随人蒸发）',
      w5.entities.length === 0 && (w5.nether.artifacts || []).length === nArtBefore + 1,
      `幽冥物品 ${nArtBefore}→${(w5.nether.artifacts || []).length}`);
    check('凡间账 `artifactLog.netherOut` 记了 1（跨位面流出）',
      (w5.artifactLog.netherOut || 0) === 1, `netherOut=${w5.artifactLog.netherOut}`);
  }

  // ── ⑮ 鬼进入凡间：**直接调 `climbOutToMortal`** 的确定性用例（D6-3 工程包 B）──
  // ⑭ 判的是「凡 → 幽」；这一条判同一条缝的**反方向**（幽 → 凡）。
  // 端到端（缝抽签）概率低、不可断言，所以把效果函数单独拿出来判。
  // 覆盖 ⑭ 结构上覆盖不到的分支：半径外的鬼、没有幽冥、凡间鬼影上限、
  // 以及**最承重的那条**——鬼落进 `world.wraiths` 而**不是** `world.entities`。
  {
    const mkClimbWorld = () => {
      const w = makeRiftWorld3(4242);
      w.rifts = [{
        id: 1, x: 30, y: 30, strength: 5, openedDay: 0,
        age: 0, closedDay: -1, leaked: 0, crossed: 0, targetPlane: 'nether',
      }];
      w.nextRiftId = 2;
      return w;
    };
    const putGhost = (w, spec) => {
      spawnNetherGhost(w.nether, Object.assign({ kind: 'ghost', decayYears: 100000 }, spec || {}));
      const g = w.nether.entities[w.nether.entities.length - 1];
      g.x = 30.5; g.y = 30.5;
      return g;
    };

    // ① 正面：把鬼送进凡间
    const c1 = mkClimbWorld();
    const gsrc = putGhost(c1);
    const n0 = c1.nether.entities.length;
    const m0 = c1.entities.length;
    const okC1 = climbOutToMortal(c1, c1.rifts[0], 5);
    check('★ `climbOutToMortal` 送出一只鬼：幽冥少一只、凡间鬼影多一只',
      okC1 === true && c1.nether.entities.length === n0 - 1 && c1.wraiths.length === 1,
      `ok=${okC1} · 幽冥 ${n0}→${c1.nether.entities.length} · 鬼影 ${c1.wraiths.length}`);
    check('★★ **鬼落进 `world.wraiths`，绝不进 `world.entities`**（本包最承重的那条）',
      c1.entities.length === m0 && c1.wraiths[0].sp === SPECIES.GHOST,
      `凡间实体 ${m0}→${c1.entities.length}（不变）· 鬼影 sp=${c1.wraiths[0].sp}`);
    check('★ 爬出来的鬼**保留幽冥 id**（铁律三：来处写在 id 段里）',
      c1.wraiths[0].id === gsrc.id,
      `id=${c1.wraiths[0].id}（原 ${gsrc.id}）`);
    check('幽冥账本：`climbedOut` 记 1（第三条离开路径，独立于 ghostDied / evicted）',
      c1.nether.popLog.climbedOut === 1,
      `climbedOut=${c1.nether.popLog.climbedOut}`);
    check('★ 两端记账恒等：`wraithStats.total === nether.popLog.climbedOut`',
      wraithStats(c1).total === c1.nether.popLog.climbedOut,
      `${wraithStats(c1).total} vs ${c1.nether.popLog.climbedOut}`);
    check('编年史写一笔 `rift-out`（与 `rift-lost` 同一组对照事件的两半）',
      c1.chronicle.some((c) => c.kind === 'rift-out'),
      JSON.stringify(c1.chronicle.filter((c) => c.kind === 'rift-out').slice(-1)));
    check('上界口径的账**一个字都没动**（`riftLog.leaked` / `crossed` 恒 0）',
      c1.riftLog.leaked === 0 && c1.riftLog.crossed === 0,
      `leaked=${c1.riftLog.leaked} crossed=${c1.riftLog.crossed}`);

    // ② 对照：半径外的鬼不动（判据是「离缝口最近且半径内」，不是「全世界」）
    const c2 = mkClimbWorld();
    spawnNetherGhost(c2.nether, { kind: 'ghost', decayYears: 100000 });
    const far = c2.nether.entities[c2.nether.entities.length - 1];
    far.x = 300.5; far.y = 300.5;
    const okC2 = climbOutToMortal(c2, c2.rifts[0], 5);
    check('对照：半径外的鬼**不动**（判的是半径，不是全世界）',
      okC2 === false && c2.wraiths.length === 0 && c2.nether.entities.length === 1,
      `ok=${okC2} · 鬼影 ${c2.wraiths.length} · 幽冥 ${c2.nether.entities.length}`);

    // ③ 对照：没有幽冥位面 ⇒ 整条跳过，凡间毫发无伤
    const c3 = mkClimbWorld();
    c3.nether = null;
    const okC3 = climbOutToMortal(c3, c3.rifts[0], 5);
    check('对照：`world.nether` 不存在 ⇒ 返回 false 且**凡间毫发无伤**',
      okC3 === false && c3.wraiths.length === 0,
      `ok=${okC3} · 鬼影 ${c3.wraiths.length}`);

    // ④ 对照：**取离缝口最近的那只**（不是境界最高）
    const c4 = mkClimbWorld();
    const nearLow = putGhost(c4, { kind: 'ghost' });                 // 普通鬼魂，贴缝口
    const farHigh = putGhost(c4, { kind: 'ghostCultivator' });       // 鬼修，挪远一点
    farHigh.x = 34.5; farHigh.y = 34.5;
    climbOutToMortal(c4, c4.rifts[0], 8);
    check('★ 对照：取**离缝口最近**的那只（不是境界最高——鬼是自己爬出来的）',
      c4.wraiths.length === 1 && c4.wraiths[0].id === nearLow.id
      && c4.wraiths[0].soulKind === 'ghost',
      `爬出 id=${c4.wraiths[0] && c4.wraiths[0].id}（近=${nearLow.id} / 远高=${farHigh.id}）`);

    // ⑤ 对照：凡间鬼影**撞上限** ⇒ 不落成，且**幽冥那一份必须留着**（绝不凭空蒸发）
    const c5 = mkClimbWorld();
    for (let i = 0; i < WRAITH_CAP; i += 1) spawnWraith(c5, { id: 2000000 + i, x: 1.5, y: 1.5 });
    const g5 = putGhost(c5);
    const n5 = c5.nether.entities.length;
    const okC5 = climbOutToMortal(c5, c5.rifts[0], 5);
    check('★ 对照：撞凡间鬼影上限 ⇒ 不落成，**幽冥那一份留着**（先落成再移除的守卫）',
      okC5 === false && c5.wraiths.length === WRAITH_CAP && c5.nether.entities.length === n5,
      `ok=${okC5} · 鬼影 ${c5.wraiths.length}/${WRAITH_CAP} · 幽冥 ${n5}→${c5.nether.entities.length}`);

    // ⑥ `stepMortalWraiths`：到期消散（判据是 `day >= dissolveDay`，不是 `age >= lifespan`）
    const c6 = mkClimbWorld();
    putGhost(c6);
    climbOutToMortal(c6, c6.rifts[0], 5);
    const dDay = c6.wraiths[0].dissolveDay;
    c6.day = dDay + 1;
    const st6 = stepMortalWraiths(c6, 10);
    check('★ `stepMortalWraiths` 到期消散：鬼消失并计入 `wraithLog.dissolved`（不是永生）',
      c6.wraiths.length === 0 && st6.dissolved === 1 && c6.wraithLog.dissolved === 1,
      `alive ${c6.wraiths.length} · 本拍 ${st6.dissolved} · 累计 ${c6.wraithLog.dissolved}`);
    check('★ 消散后守恒式仍成立（`0 + dissolved === climbedOut`）',
      wraithStats(c6).total === c6.nether.popLog.climbedOut,
      `${wraithStats(c6).total} vs ${c6.nether.popLog.climbedOut}`);

    // ⑦ `ensureWraithLog` 兜底：老档 / 单世界缺键 ⇒ 就地建 `{dissolved:0}`（幂等）
    const c7 = {};
    ensureWraithLog(c7);
    const idem = ensureWraithLog(c7);
    check('`ensureWraithLog` 兜底且幂等（老档缺 `wraithLog` ⇒ 就地建 `{dissolved:0}`）',
      idem === c7.wraithLog && idem.dissolved === 0,
      JSON.stringify(c7.wraithLog));

    // ⑧ 触发概率常量落在 (0,1)（写 0 会让 B 包静默死掉，> 1 会瞬间塞满凡间）
    check('触发概率常量在 (0,1) 内（写 0 静默死掉 / > 1 瞬间塞满，都不报错）',
      WRAITH_CLIMB_CHANCE_PER_PERIOD > 0 && WRAITH_CLIMB_CHANCE_PER_PERIOD < 1,
      `${WRAITH_CLIMB_CHANCE_PER_PERIOD}`);
    check('凡间鬼影流派生键 = 0x4841554e（`HAUN`，与其余五条两两不同）',
      MORTALHAUNT_SEED_KEY === 0x4841554e,
      `0x${MORTALHAUNT_SEED_KEY.toString(16)}`);
    check('鬼影寿数常量 = 1080 日（3 年）且 > 0',
      WRAITH_DISSOLVE_DAYS === 1080,
      `${WRAITH_DISSOLVE_DAYS}`);
  }

  // ── ⑯ 幽冥物品泄漏：自生 / 跌入带物 / 缝漏出 / 习得功法（D6-3 工程包 C）──
  // ⑭⑮ 判的是「人 / 鬼」跨界；这一条判**东西**跨界，而东西**两个方向**都走：
  //   凡 → 幽（跌入者随身带下去，`rifts.js` 的 `moveArtifactsToNether`）
  //   幽 → 凡（幽冥缝漏回地上，`rifts.js` 的 `leakNetherItem`）
  // 再加第三条来源：幽冥**自生**（`netherLife.js` 的 `stepNetherItems`，零 rng）。
  // 每条都注明「什么故障会让它变红」。
  //
  // ⚠️ 自生段走 `advanceWorld`（**世界推进的唯一入口**）而不是直接调
  //    `stepNetherItems`：直接调会绕开「自生挂在 `stepNether` 第 6 步」这条接线，
  //    而接线断掉时读数照样是对的（自生照样凝、池子照样长）——正是 5u 组守的
  //    那类坏法。同时这也让本节与 5u / 5w「不 import `stepNether`」的纪律一致。
  {
    // 造一对同尺寸凡间 + 幽冥（三界坐标对位——`leakNetherItem` 的候选判据读绝对坐标）。
    const mkNetherItemWorld = (seed) => {
      const w = generateWorld({ preset: WORLD_PRESETS.small, seed, scatter: true });
      w.nether = generateNetherWorld({ preset: WORLD_PRESETS.small, seed: w.seed });
      // 缝必须开在**凡间可通行格**上：`findMortalSpot` 要从缝口往外找可站格，
      // 缝摆在冥河 / 水面上会让「漏物」在第一步就整次放弃（那会红得莫名其妙）。
      let rx = 30; let ry = 30;
      outer: for (let y = 5; y < w.h - 5; y += 1) {
        for (let x = 5; x < w.w - 5; x += 1) {
          if (w.isWalkable(y * w.w + x)) { rx = x; ry = y; break outer; }
        }
      }
      w.rifts = [{
        id: 1, x: rx, y: ry, strength: 5, openedDay: 0,
        age: 0, closedDay: -1, leaked: 0, crossed: 0, targetPlane: 'nether',
      }];
      w.nextRiftId = 2;
      return w;
    };
    // 手工造一件幽冥物品（形状照抄 `spawnNetherItem`）。
    // ⚠️ 手工注入**必须同时记账**（`itemsSpawned` / `itemsFellIn`），否则守恒式会
    //    被这一节自己搞红——那是**探针的错，不是代码的错**（已踩过一次）。
    const mkNetherItem = (id, name, x, y, techName, techNote) => ({
      id, slot: '法宝', tier: NETHER_ITEM_TIER, quality: NETHER_ITEM_QUALITY, name,
      durability: 100, maxDurability: 100, scars: 0,
      forgedDay: 0, forgedByName: null, ownerId: 0, ownerName: null,
      heldSince: 0, spirit: null, history: [[0, 'forged', null]], lostDay: 0,
      x, y, technique: techName ? { name: techName, note: techNote || '' } : null,
    });

    // ① 自生：跑 3000 天（100 个判定点）
    {
      const wS = mkNetherItemWorld(12345);
      const st0 = createAdvanceState();
      const savedRifts = wS.rifts;
      wS.rifts = [];                       // 关掉裂缝时钟：本节只判幽冥物品
      for (let d = 0; d < 3000; d += 10) advanceWorld(wS, 10, { state: st0 });
      wS.rifts = savedRifts;
      const st = netherItemStats(wS.nether);
      check('★ 幽冥自生：跑 3000 天凝出若干件且**守恒**（alive === spawned + fellIn − leakedOut − decayed）',
        st.alive > 0 && st.conserved,
        `alive=${st.alive} spawned=${st.spawned} conserved=${st.conserved}`);
      // ★ 区分力：`NETHER_ITEM_CHANCE = 0.55` ⇒ 100 个判定点该出 ~55 件。
      //   故障（**真实踩过**）：`hash32`（FNV-1a）对「前缀相同、只差末尾数字」的
      //   短串有极强的高位偏置，没先过 `hashStep` 的话判定恒不通过 ⇒ 实测只出
      //   0–1 件，而 `NETHER_ITEM_CHANCE` 形同不存在、**不报错**。
      //   所以下界取 20（远高于 1、远低于 100），上界取 100（证明它也不是恒真）。
      check('★ 自生概率真的在起作用（100 个判定点出 20–100 件——钉 `hash32` 高位偏置那个坑）',
        st.spawned >= 20 && st.spawned <= 100,
        `spawned=${st.spawned}（期望 ~55）`);
      // 形状：与 `forgeArtifact` 的产物**逐键同形**（只多一个 `technique`）。
      //   故障：自生少写 / 多写字段 ⇒ 这件东西漏进凡间后「缺胳膊少腿」，而
      //   `save-equiv` 的键集并集比对会红（那时已经离这里很远了）。
      //   判据用**真炼一件**来取键集，而不是硬编码一份字段表——硬编码那份会跟着
      //   `forgeArtifact` 一起腐烂，正是它要防的事。
      const wf = generateWorld({ preset: WORLD_PRESETS.small, seed: 909, scatter: true });
      wf.artifactLog = {};
      wf.nextArtifactId = 1;
      const smith = {
        id: 1, name: '炼器师', sp: SPECIES.CULTIVATOR, level: 30, hp: 10,
        x: 1.5, y: 1.5, artifacts: [], relations: new Map(),
      };
      wf.entities.push(smith);
      const forged = forgeArtifact(wf, smith, mulberry32(7));
      const fk = Object.keys(forged).sort().join(',');
      const nk = Object.keys(wS.nether.artifacts[0]).sort().join(',');
      check('★ 自生法宝与 `forgeArtifact` 产物**逐键同形**（只多 `technique`）',
        Boolean(forged) && nk === fk.split(',').concat(['technique']).sort().join(','),
        `forge=[${fk}] nether=[${nk}]`);
      const a0 = wS.nether.artifacts[0];
      check('自生法宝：无主（ownerId=0）· 落在幽冥可站格 · `technique` 取自幽冥名池',
        a0.ownerId === 0
        && netherWalkable(wS.nether, Math.floor(a0.y) * wS.nether.w + Math.floor(a0.x))
        && Boolean(a0.technique) && NETHER_TECHNIQUES.some((t) => t.name === a0.technique.name),
        `ownerId=${a0.ownerId} tech=${a0.technique && a0.technique.name} @${a0.x},${a0.y}`);
      // 同种子两遍逐字一致：自生的「随机」是**纯哈希**（幽冥没有第二条流可挂），
      // 所以读档后两条世界线必须同步。故障：有人往 `stepNetherItems` 里塞了
      // 模块级累加器 / `Math.random` / 真抽签 ⇒ 同种子两遍分叉。
      const wS2 = mkNetherItemWorld(12345);
      const st1 = createAdvanceState();
      const savedRifts2 = wS2.rifts;
      wS2.rifts = [];
      for (let d = 0; d < 3000; d += 10) advanceWorld(wS2, 10, { state: st1 });
      wS2.rifts = savedRifts2;
      check('★ 同种子两遍：幽冥物品轨迹**逐字一致**（自生的随机 = 纯哈希，不是流）',
        JSON.stringify(wS.nether.artifacts) === JSON.stringify(wS2.nether.artifacts),
        `len ${wS.nether.artifacts.length} vs ${wS2.nether.artifacts.length}`);
    }

    // ② 跌入者带法宝下去（C 包**改了 A 包的行为**：不再 `scatterArtifacts` 留在地上）
    {
      const w = mkNetherItemWorld(777);
      w.entities.push({
        id: 999999, sp: SPECIES.CULTIVATOR, x: w.rifts[0].x + 0.5, y: w.rifts[0].y + 0.5,
        level: 10, hp: 10, maxHp: 10, age: 0, lifespan: 100000,
        artifacts: [], relations: new Map(), name: '试缝人', techniques: [],
      });
      const p = w.entities[0];
      p.artifacts = [mkNetherItem(11, '凡剑甲', 30.5, 30.5, null), mkNetherItem(12, '凡剑乙', 30.5, 30.5, null)];
      w.nextArtifactId = 20;
      const beforeOut = w.artifactLog.netherOut || 0;
      const ok = fallIntoNether(w, w.rifts[0], 5);
      // 故障：这一步退回 A 包的 `scatterArtifacts`（法宝留在凡间地上）⇒ 幽冥池不长、
      //   凡间地上多两件，而 `fellIn` 照样涨——「东西跟人走了」这条契约静默失效。
      check('★ 跌入者身上的法宝**跟着人进幽冥**（凡间那一份清空、幽冥池 +2、`itemsFellIn=2`）',
        ok === true && p.artifacts.length === 0 && w.nether.artifacts.length === 2
        && w.nether.popLog.itemsFellIn === 2,
        `ok=${ok} 随身 ${p.artifacts.length} 幽冥 ${w.nether.artifacts.length} fellIn=${w.nether.popLog.itemsFellIn}`);
      // 故障（铁律三）：不重赋 id ⇒ 「凡间第 11 件」与「幽冥第 11 件」同号，
      //   日后漏回凡间时 `claimGroundArtifact` 按 id 线性查找会命中**先出现的那一件**。
      check('★ 跨世界 id **已重赋**到幽冥空间（不再撞凡间的 11 / 12）',
        w.nether.artifacts.every((a) => a.id !== 11 && a.id !== 12),
        `幽冥 id=${w.nether.artifacts.map((a) => a.id).join(',')}`);
      check('凡间账 `artifactLog.netherOut` += 2（跨位面流出，与上界的 `riftOut` 分列两键）',
        (w.artifactLog.netherOut || 0) === beforeOut + 2,
        `netherOut=${w.artifactLog.netherOut}`);
      const g = w.nether.entities[w.nether.entities.length - 1];
      check('法宝落点 = **人的落点**（东西是跟人一起下去的，不是掉在缝口）',
        w.nether.artifacts.every((a) => Math.hypot(a.x - g.x, a.y - g.y) < 1e-9),
        `art=${w.nether.artifacts.map((a) => a.x + ',' + a.y).join('|')} ghost=${g.x},${g.y}`);
      check('跌入后幽冥物品守恒式成立',
        netherItemStats(w.nether).conserved, JSON.stringify(netherItemStats(w.nether)));
    }

    // ③ 缝漏物（幽 → 凡，**落地等捡**）：直接调 `leakNetherItem`
    {
      const w = mkNetherItemWorld(4242);
      const rf = w.rifts[0];
      w.nextArtifactId = 5;                 // 凡间 id 空间从 5 起，便于观察重赋
      w.nether.artifacts = [mkNetherItem(77, '河官笔', rf.x + 0.5, rf.y + 0.5, '玄阴诀', '引阴气入体，寒而不僵')];
      ensureNetherPopLog(w.nether).itemsSpawned = 1;   // 手工注入**必须记账**
      w.nether.nextArtifactId = 2;
      const beforeIn = w.artifactLog.netherIn || 0;
      const groundBefore = w.artifacts.length;
      const ok = leakNetherItem(w, w.rifts[0], 5);
      // 故障：不走 `toGround`（自己 push / 只改坐标）⇒ 落地的物品**不进拾取循环**，
      //   凡人永远捡不到——「落地等捡」这条契约整个失效，而且不报错。
      check('★ `leakNetherItem` 把幽冥物品漏到凡间地上（落地等捡：走 `toGround`）',
        ok === true && w.artifacts.length === groundBefore + 1 && w.nether.artifacts.length === 0,
        `ok=${ok} 地上 ${groundBefore}→${w.artifacts.length} 幽冥 ${w.nether.artifacts.length}`);
      check('两端记账：幽冥 `itemsLeakedOut=1` + 凡间 `artifactLog.netherIn += 1`',
        w.nether.popLog.itemsLeakedOut === 1 && (w.artifactLog.netherIn || 0) === beforeIn + 1,
        `leakedOut=${w.nether.popLog.itemsLeakedOut} netherIn=${w.artifactLog.netherIn}`);
      const landed = w.artifacts[w.artifacts.length - 1];
      check('★ 跨世界 id 重赋到**凡间**空间（77 → 5，`nextArtifactId` → 6）',
        landed.id === 5 && w.nextArtifactId === 6,
        `id=${landed.id} nextArtifactId=${w.nextArtifactId}`);
      check('落地的物品**保留 `technique`**（功法跟着东西走，凡人捡到才有得学）',
        Boolean(landed.technique) && landed.technique.name === '玄阴诀',
        `tech=${landed.technique && landed.technique.name}`);
      // 故障：把 kind 写成 `rift-lost` / `rift-out`（那两个归 `person`）⇒ 编年史里
      //   「一件东西跨界」被记成「某个人消失」，而 `KIND_TAG` 照样有值、不报错。
      check('编年史写一笔 `rift-in`（**一件东西**跨界，归 `cultivation` 不归 `person`）',
        w.chronicle.some((c) => c.kind === 'rift-in'),
        `rift-in 共 ${w.chronicle.filter((c) => c.kind === 'rift-in').length} 笔`);
      check('漏出后幽冥物品守恒式成立',
        netherItemStats(w.nether).conserved, JSON.stringify(netherItemStats(w.nether)));

      // 对照：三种早退都返回 false 且**两侧都不动**（判据是半径 / 非空 / 有幽冥，
      //   不是「全世界」）——少了任何一条，函数会在不该动手的时候动手。
      const wFar = mkNetherItemWorld(4242);
      wFar.nether.artifacts = [mkNetherItem(1, '远物', wFar.rifts[0].x + 400, wFar.rifts[0].y + 400, null)];
      ensureNetherPopLog(wFar.nether).itemsSpawned = 1;
      check('对照：半径内没有幽冥物品 ⇒ false（判的是半径，不是全世界）',
        leakNetherItem(wFar, wFar.rifts[0], 5) === false
        && wFar.nether.artifacts.length === 1 && wFar.artifacts.length === 0,
        `幽冥 ${wFar.nether.artifacts.length} 地上 ${wFar.artifacts.length}`);

      const wEmpty = mkNetherItemWorld(4242);
      wEmpty.nether.artifacts = [];
      check('对照：幽冥池为空 ⇒ false（不动世界）',
        leakNetherItem(wEmpty, wEmpty.rifts[0], 5) === false && wEmpty.artifacts.length === 0,
        `地上 ${wEmpty.artifacts.length}`);

      const wNoNether = mkNetherItemWorld(4242);
      const rfC = wNoNether.rifts[0];
      wNoNether.nether = null;
      check('对照：`world.nether` 不存在 ⇒ false 且凡间毫发无伤',
        leakNetherItem(wNoNether, rfC, 5) === false && wNoNether.artifacts.length === 0,
        `地上 ${wNoNether.artifacts.length}`);
    }

    // ④ 凡人捡到幽冥法宝 ⇒ 当场习得功法（`artifacts.js` 的 `giveTo` / `grantTechnique`）
    {
      const w = mkNetherItemWorld(99);
      const e = {
        id: 5, name: '拾荒修士', sp: SPECIES.CULTIVATOR, level: 5, hp: 10,
        x: 1, y: 1, artifacts: [], techniques: [], relations: new Map(),
      };
      const ok = giveTo(w, e, mkNetherItem(1, '阴司秤', 30.5, 30.5, '冥河炼体诀', '借冥河寒水炼形'), mulberry32(3), 'found');
      check('★ 拾到幽冥法宝**即习得**它携带的功法（进 `techniques`）',
        ok === true && e.techniques.length === 1 && e.techniques[0].name === '冥河炼体诀',
        `ok=${ok} techniques=${e.techniques.map((t) => t.name).join(',')}`);
      // ★ 推的必须是**名池里的对象**（键集 {name,note}）。故障：现场拼一个
      //   `{ name, note }` 或只推 `{ name }` ⇒ `save.js` 的 `MANUAL_BY_NAME` 还原出的
      //   是池子里的对象、键集与它不同 ⇒ `save-equiv` 的键集并集比对红（很远才发作）。
      check('★ 推的是**名池里的对象**（键集 = {name,note}，与读档还原的一致）',
        Object.keys(e.techniques[0]).sort().join(',') === 'name,note',
        `keys=[${Object.keys(e.techniques[0]).join(',')}]`);
      const e2 = {
        id: 6, name: '拾荒修士', sp: SPECIES.CULTIVATOR, level: 5, hp: 10,
        x: 1, y: 1, artifacts: [], techniques: e.techniques.slice(), relations: new Map(),
      };
      giveTo(w, e2, mkNetherItem(2, '阴司秤', 30.5, 30.5, '冥河炼体诀', ''), mulberry32(4), 'found');
      check('已会的功法不重复推（去重）', e2.techniques.length === 1, `len=${e2.techniques.length}`);
      // 栏满：不推功法，但**法宝照收**——「不白送」不等于「拒收」。
      //   故障：把 `grantTechnique` 的失败当成拾取失败（`return false`）⇒ 凡人
      //   明明捡起来了却被判「没捡到」，法宝留在地上、池子里却已经没了。
      const e3 = {
        id: 7, name: '满栏修士', sp: SPECIES.CULTIVATOR, level: 5, hp: 10,
        x: 1, y: 1, artifacts: [], relations: new Map(),
        techniques: NETHER_TECHNIQUES.slice(0, TECHNIQUE_CAP).map((t) => ({ ...t })),
      };
      const ok3 = giveTo(w, e3, mkNetherItem(3, '阴司秤', 30.5, 30.5, '阴窟藏形术', ''), mulberry32(5), 'found');
      check('功法栏满（`TECHNIQUE_CAP`）⇒ 不推功法，但**法宝照收**（不白送也不拒收）',
        ok3 === true && e3.techniques.length === TECHNIQUE_CAP && e3.artifacts.length === 1,
        `ok=${ok3} techniques=${e3.techniques.length} artifacts=${e3.artifacts.length}`);
      // 对照：**凡间**法宝（无 `technique`）拾取恒为 no-op——否则每次拾取都会
      //   触发一次 `grantTechnique(undefined)`，而它返回 false 时若被当失败就坏大事。
      const e4 = {
        id: 8, name: '对照修士', sp: SPECIES.CULTIVATOR, level: 5, hp: 10,
        x: 1, y: 1, artifacts: [], techniques: [], relations: new Map(),
      };
      giveTo(w, e4, mkNetherItem(4, '凡剑', 30.5, 30.5, null), mulberry32(6), 'found');
      check('对照：没有 `technique` 的法宝（凡间件）拾取**不产生**功法（恒 no-op）',
        e4.techniques.length === 0, `len=${e4.techniques.length}`);
    }

    // ⑤ 存读档往返（`nether.artifacts` 走 `serializeWorld` 通用路径；四条账走 `popLog` 整对象）
    {
      const w = mkNetherItemWorld(555);
      w.nether.artifacts = [mkNetherItem(7, '引路幡', 12.5, 8.5, '幽明录', '阴阳两界之事，皆可入录')];
      w.nether.nextArtifactId = 8;
      const log = ensureNetherPopLog(w.nether);
      log.itemsSpawned = 1; log.itemsFellIn = 0; log.itemsLeakedOut = 0; log.itemsDecayed = 0;
      // 凡间账的两个新键：与既有 `riftIn` / `riftOut` **同款**——构造器不带它们，
      // 跨位面事件发生时才惰性添加（`save.js` 的默认值只在 `artifactLog` **整个缺失**
      // 时生效）。所以判据是「设了值 ⇒ 原样往返」，不是「构造器里就该有」。
      w.artifactLog.netherIn = 3;
      w.artifactLog.netherOut = 4;
      const back = deserializeWorld(serializeWorld(w));
      // 故障：`serializeNetherWorld` 漏写 `artifacts`（或读了另一个键）⇒ 读档后池子空。
      check('幽冥物品池往返（逐字一致）',
        JSON.stringify(back.nether.artifacts) === JSON.stringify(w.nether.artifacts),
        `len ${back.nether.artifacts.length}`);
      check('`popLog.items*` 四条账往返（`popLog` 属 `NETHER_ONLY_KEYS` 整对象序列化）',
        back.nether.popLog.itemsSpawned === 1 && back.nether.popLog.itemsFellIn === 0
        && back.nether.popLog.itemsLeakedOut === 0 && back.nether.popLog.itemsDecayed === 0,
        JSON.stringify(back.nether.popLog));
      // 故障：`nextArtifactId` 漏存 ⇒ 读档后新凝的物品从 1 起，与池子里已有的撞号。
      check('`nether.nextArtifactId` 往返（漏了会让读档后新旧物品撞号）',
        back.nether.nextArtifactId === 8, `=${back.nether.nextArtifactId}`);
      check('往返后守恒式仍成立', netherItemStats(back.nether).conserved,
        JSON.stringify(netherItemStats(back.nether)));
      check('凡间账 `netherIn` / `netherOut` 往返（设了值 ⇒ 原样回来）',
        back.artifactLog.netherIn === 3 && back.artifactLog.netherOut === 4,
        `in=${back.artifactLog.netherIn} out=${back.artifactLog.netherOut}`);
    }

    // ⑥ 第七条独立流（`NITM`）与结构判据
    {
      const keys = [
        ['rift', RIFT_SEED_KEY], ['nrift', NETHRIFT_SEED_KEY],
        ['haun', MORTALHAUNT_SEED_KEY], ['nitm', NETHERITEM_SEED_KEY],
      ];
      const set = new Set(keys.map((k) => k[1]));
      // 故障：新流复用了既有键 ⇒ 两条流的抽签序列互相移动（「玩家多开一条幽冥缝
      //   会改变上界缝漏了几次」），既有标定当场作废，且不报错。
      check('★ 四条跨界流键两两不同（rift / nrift / haun / nitm）',
        set.size === keys.length,
        keys.map((k) => `${k[0]}=0x${k[1].toString(16)}`).join(' '));
      check('幽冥物品流派生键 = 0x4e49544d（`NITM`）',
        NETHERITEM_SEED_KEY === 0x4e49544d, `0x${NETHERITEM_SEED_KEY.toString(16)}`);
      const wR = mkNetherItemWorld(1);
      check('`netherItemRngFor` 同一 world 返回同一实例（惰性建立，不每次新建）',
        netherItemRngFor(wR) === netherItemRngFor(wR));
      check('泄漏概率常量在 (0,1) 内（写 0 静默死掉 / > 1 瞬间漏空）',
        NETHER_ITEM_LEAK_CHANCE_PER_PERIOD > 0 && NETHER_ITEM_LEAK_CHANCE_PER_PERIOD < 1,
        `${NETHER_ITEM_LEAK_CHANCE_PER_PERIOD}`);
      check('自生概率常量在 (0,1) 内',
        NETHER_ITEM_CHANCE > 0 && NETHER_ITEM_CHANCE < 1, `${NETHER_ITEM_CHANCE}`);
      check('自生周期 = 30 日（与 `stepNether` 的 10 日节拍错开）',
        NETHER_ITEM_PERIOD_DAYS === 30, `${NETHER_ITEM_PERIOD_DAYS}`);
    }

    // ⑦ 上限：池满时自生被抑制，`trimNetherItems` 朽掉**躺得最久**的一件
    {
      const w = mkNetherItemWorld(31337);
      w.nether.artifacts = [];
      for (let i = 0; i < NETHER_ITEM_CAP + 50; i += 1) {
        w.nether.artifacts.push(mkNetherItem(i + 1, `旧物${i}`, 30.5, 30.5, null));
        w.nether.artifacts[i].lostDay = i;    // 越早的躺得越久
      }
      const log = ensureNetherPopLog(w.nether);
      log.itemsSpawned = NETHER_ITEM_CAP + 50;   // 与池子自洽
      const n0 = w.nether.artifacts.length;
      trimNetherItems(w.nether, log);
      // 故障：裁掉 `lostDay` 最大的那件（「躺得最久」判反）⇒ 池子里留下的是最旧的、
      //   新凝的一进来就被朽掉——世界看起来「再也不出新东西」，且不报错。
      check('★ 池满 ⇒ `trimNetherItems` 压回上限、朽掉**躺得最久**的那件、`itemsDecayed` 记账',
        w.nether.artifacts.length === NETHER_ITEM_CAP && log.itemsDecayed === n0 - NETHER_ITEM_CAP
        && w.nether.artifacts.every((a) => a.lostDay >= n0 - NETHER_ITEM_CAP),
        `len ${n0}→${w.nether.artifacts.length} decayed=${log.itemsDecayed}`);
      check('裁剪后守恒式仍成立（`decayed` 是独立一项，必须减掉）',
        netherItemStats(w.nether).conserved, JSON.stringify(netherItemStats(w.nether)));
      const before = w.nether.artifacts.length;
      stepNetherItems(w.nether, { day: NETHER_ITEM_PERIOD_DAYS, seed: w.nether.seed }, 10);
      // 故障：先抽哈希再判上限 ⇒ 「池满」这件事会静默改变哈希序列，让别的读数漂移。
      check('对照：池满时自生**被抑制**（不再凝新件，且在消耗哈希之前返回）',
        w.nether.artifacts.length === before, `${before}→${w.nether.artifacts.length}`);
    }

    // ⑧ 名池合规（`剧情文案素材/00_文案使用说明` §5.6 命名纪律）
    {
      const banned = ['鬼', '魂', '莲', '符'];
      const allNames = [...NETHER_ARTIFACT_NAMES.map((n) => n.name), ...NETHER_TECHNIQUES.map((t) => t.name)];
      // 故障：新名池顺手用了「鬼 / 魂 / 莲 / 符」⇒ 与考古定名表（幽冥三物、
      //   鬼修六级、魂分五路）撞词，读起来像「另一套叫法」，而文案纪律明令不得另造同义词。
      check('★ 幽冥名池**不含**考古定名字（鬼 / 魂 / 莲 / 符——定名不得另造同义词）',
        allNames.every((n) => banned.every((b) => !n.includes(b))),
        allNames.filter((n) => banned.some((b) => n.includes(b))).join(',') || `${allNames.length} 个名全部合规`);
      const mortalNames = new Set([...ARTIFACT_NAMES.map((n) => n.name), ...MANUALS.map((m) => m.name)]);
      const clash = allNames.filter((n) => mortalNames.has(n));
      // 故障：名池直接复用凡间名 ⇒ 「幽冥自己长出来的东西」读起来像「上面掉下来的」，
      //   而这正是 C 包要避免的观感（用户裁决：另造新名池）。
      check('★ 幽冥名池与**凡间**名池零重名（「另造新名池」的兑现）',
        clash.length === 0,
        clash.join(',') || `无重名（幽冥 ${allNames.length} / 凡间 ${mortalNames.size}）`);
      check('幽冥法宝名都声明了合法槽位（`slots` 非空且属于 `EQUIP_SLOTS`）',
        NETHER_ARTIFACT_NAMES.every((n) => Array.isArray(n.slots) && n.slots.length > 0
          && n.slots.every((s) => EQUIP_SLOTS.includes(s))),
        NETHER_ARTIFACT_NAMES.filter((n) => !n.slots || !n.slots.length).map((n) => n.name).join(',') || 'ok');
    }
  }

  // ── ⑰ 跨位面夺舍：真夺舍 / 附身 / 词条 / 阶位分界 / cap / 存读档（D6-3 工程包 D）──
  // ⑭⑮⑯ 判的是「人 / 鬼 / 东西」跨界；这一条判**元神跨界**（幽冥的鬼修 → 凡间活人）。
  // 用户裁决（2026-09-26）：
  //   · 只有**低阶鬼修**（怨灵及以下，`level ≤ POSSESS_TIER_MAX_LEVEL`）**真夺舍**
  //     ——「继续修仙的执念」；夺舍后**从幽冥消失**（第四条离开路径）；
  //   · **高阶鬼修**（厉鬼及以上）已「自成一派」，只**暂时附身**，**留在幽冥**；
  //   · 目标可以是凡人（与凡间内部的 `pickTarget` 不同 ⇒ 必须先 `awaken`）；
  //   · 成功率用 `ghostRancor`（积怨）顶替 `mind`；
  //   · 「极少数实体倾向夺舍」= 两侧各一个**派生**稀有词条（不入档，铁律二）。
  // 每条都注明「什么故障会让它变红」。
  {
    // 造一对凡间 + 幽冥，缝开在凡间可通行格上（同 ⑯ 的 `mkNetherItemWorld`）。
    const mkPossessWorld = (seed) => {
      const w = generateWorld({ preset: WORLD_PRESETS.small, seed, scatter: true });
      w.nether = generateNetherWorld({ preset: WORLD_PRESETS.small, seed: w.seed });
      let rx = 30; let ry = 30;
      outer: for (let y = 5; y < w.h - 5; y += 1) {
        for (let x = 5; x < w.w - 5; x += 1) {
          if (w.isWalkable(y * w.w + x)) { rx = x; ry = y; break outer; }
        }
      }
      w.rifts = [{
        id: 1, x: rx, y: ry, strength: 5, openedDay: 0,
        age: 0, closedDay: -1, leaked: 0, crossed: 0, targetPlane: 'nether',
      }];
      w.nextRiftId = 2;
      // 幽冥那一侧只留我们手工放的鬼修——免得 `generateNetherWorld` 自带的本土
      // 鬼修抢了「缝口最近的那只」这个位置，让判据测到别人身上。
      w.nether.entities = [];
      ensureNetherPopLog(w.nether);
      return w;
    };
    // 造一只鬼修。形状照抄 `netherLife.js` 的 `GHOST_TEMPLATE`（只列 ⑰ 会读到的键）。
    const mkGhost = (id, level, x, y, rancor) => ({
      id, sp: SPECIES.HUMAN, x, y, tx: x, ty: y, vx: 0, vy: 0,
      hp: 10, maxHp: 10, age: 0, lifespan: 1e9,
      level, name: `鬼修${id}`, soulKind: 'ghostCultivator',
      ghostRancor: rancor, ghostDecayDay: -1e9, soulBind: null,
      state: 'wander', timer: 0, anim: 0, face: 1, relations: new Map(),
    });
    // 手工放鬼修**必须同时记账**（`ghostBorn` 含鬼修、`cultivatorBorn` 是它的子集），
    // 否则守恒式会被这一节自己搞红——那是**探针的错，不是代码的错**（⑯ 已踩过一次）。
    const pushGhost = (w, ghost) => {
      w.nether.entities.push(ghost);
      const log = ensureNetherPopLog(w.nether);
      log.ghostBorn += 1;
      log.cultivatorBorn += 1;
    };
    // 造一个**凡人**（`level 0`）。走 `initEntity` 而不是手抄字段表——
    // 手抄那份会跟着 `initEntity` 一起腐烂（缺 `fortune` 会让 `awaken` 算出 NaN，
    // 而 NaN 参与比较恒假 ⇒ 后面「点化了没有」的判据全部假绿）。
    const mkMortal = (id, x, y) => {
      const e = {
        id, sp: SPECIES.HUMAN, x, y, tx: x, ty: y, vx: 0, vy: 0,
        hp: 10, maxHp: 10, age: 20, lifespan: 80, name: `凡人${id}`,
        kills: 0, relations: new Map(), techniques: [], artifacts: [],
        village: 0, faction: 0, clan: 0, gen: 0, state: 'wander', timer: 0,
        anim: 0, face: 1,
      };
      initEntity(e, mulberry32(id * 7919 + 13));
      return e;
    };
    // 成败走**确定性哈希**（`possess-try:<鬼修 id>:<天>`），所以单次调用结果是**定死的**。
    // 为了不依赖运气，换鬼修 id 试到第一次成功为止——这不是「重试掩盖失败」，
    // 本节判的是**成功之后**的落成与记账（成败本身由 ⑥ 的口径判据守着）。
    const tryUntilOk = (w, ghost, r, from, span = 300) => {
      for (let gid = from; gid < from + span; gid += 1) {
        ghost.id = gid;
        if (crossPlanePossession(w, r, 5)) return gid;
      }
      return -1;
    };

    // ① 真夺舍：低阶鬼修（level 20）→ 凡人容器
    {
      const w = mkPossessWorld(2024);
      const r = w.rifts[0];
      const ghost = mkGhost(2000001, 20, r.x + 0.5, r.y + 0.5, 200);
      const mortal = mkMortal(7, r.x + 1.5, r.y + 0.5);
      pushGhost(w, ghost);
      w.entities.push(mortal);
      const hit = tryUntilOk(w, ghost, r, 2000001);
      check('★ 真夺舍：低阶鬼修夺舍凡人**成功**（300 个 id 内必有一次）', hit > 0, `命中 id=${hit}`);
      check('★ 真夺舍：容器身上落了 `possessionScar`（mode=possess · until=-1 永久）',
        Boolean(mortal.possessionScar) && mortal.possessionScar.mode === 'possess'
        && mortal.possessionScar.until === -1,
        JSON.stringify(mortal.possessionScar));
      check('★ 真夺舍：印记是**快照**（有 ghostName / ghostLevel，无任何 id 引用）',
        Boolean(mortal.possessionScar && mortal.possessionScar.ghostName)
        && !('id' in (mortal.possessionScar || {}))
        && !('ghostId' in (mortal.possessionScar || {})),
        JSON.stringify(mortal.possessionScar));
      check('真夺舍：名字加了 ·异 后缀（同凡间内部夺舍）',
        mortal.name === '凡人7·异', mortal.name);
      check('★ 真夺舍：凡人容器被**点化**成修士（`sp` 改掉、`level` 抬到 ≥ 1）',
        mortal.sp === SPECIES.CULTIVATOR && mortal.level >= 1,
        `sp=${mortal.sp} level=${mortal.level}`);
      check('★ 真夺舍：鬼修**从幽冥消失**（先落成、再移除 ⇒ 同一拍里两件事都发生）',
        w.nether.entities.indexOf(ghost) < 0 && w.nether.entities.length === 0,
        `幽冥剩 ${w.nether.entities.length}`);
      check('★ 真夺舍：两条账都记了（幽冥 `possessedOut` +1 · 凡间 `crossPlane` +1）',
        w.nether.popLog.possessedOut === 1 && w.possessionLog.crossPlane === 1,
        `possessedOut=${w.nether.popLog.possessedOut} crossPlane=${w.possessionLog.crossPlane}`);
      check('真夺舍：进世界大事账本（kind=`possess-cross`，玩家快进几十年还看得见）',
        w.milestones.some((m) => m.kind === CROSS_POSSESS_KIND),
        `${w.milestones.length} 条大事`);
      check('真夺舍：受害者**个人日志**也有一笔（`milestone` 的 actors 分流）',
        Array.isArray(mortal.log) && mortal.log.some((row) => row.kind === CROSS_POSSESS_KIND),
        `${(mortal.log || []).length} 条日志`);
      check('★ 真夺舍**不锁**行动（`isControlled` 只认 haunt：`until=-1` 恒假）',
        isControlled(mortal, w.day) === false,
        `isControlled=${isControlled(mortal, w.day)}`);
      check('★ 真夺舍：守恒式含 `possessedOut`（第四条离开路径，必须减掉）',
        netherEcoStats(w.nether).conserved === true,
        JSON.stringify(netherEcoStats(w.nether)));
    }

    // ② 暂时附身：高阶鬼修（level 30）→ 凡人（鬼**留在幽冥**）
    {
      const w = mkPossessWorld(3031);
      const r = w.rifts[0];
      const ghost = mkGhost(2000100, 30, r.x + 0.5, r.y + 0.5, 250);
      const mortal = mkMortal(8, r.x + 1.5, r.y + 0.5);
      pushGhost(w, ghost);
      w.entities.push(mortal);
      const hit = tryUntilOk(w, ghost, r, 2000100, 300);
      check('★ 附身：高阶鬼修附身凡人**成功**（300 个 id 内必有一次）', hit > 0, `命中 id=${hit}`);
      check('★ 附身：`possessionScar.mode=haunt` · `until = day + HAUNT_DAYS`',
        Boolean(mortal.possessionScar) && mortal.possessionScar.mode === 'haunt'
        && mortal.possessionScar.until === w.day + HAUNT_DAYS,
        JSON.stringify(mortal.possessionScar));
      check('★ 附身：鬼修**留在幽冥**（不 splice——它本就能在凡间行走）',
        w.nether.entities.indexOf(ghost) >= 0 && w.nether.popLog.possessedOut === 0,
        `幽冥剩 ${w.nether.entities.length} possessedOut=${w.nether.popLog.possessedOut}`);
      check('★ 附身：账记在 `haunted`（不是 `crossPlane`——那是真夺舍的账）',
        w.possessionLog.haunted === 1 && w.possessionLog.crossPlane === 0,
        `haunted=${w.possessionLog.haunted} crossPlane=${w.possessionLog.crossPlane}`);
      check('★ 附身：行为锁**生效**（`isControlled` 在附身期内为真）',
        isControlled(mortal, w.day) === true
        && isControlled(mortal, w.day + HAUNT_DAYS - 1) === true,
        `当日=${isControlled(mortal, w.day)} 末日前一日=${isControlled(mortal, w.day + HAUNT_DAYS - 1)}`);
      check('★ 附身：到期**自动解除**（`isControlled` 在 `until` 当天为假 ⇒ 闸门自然失效）',
        isControlled(mortal, w.day + HAUNT_DAYS) === false,
        `到期日=${isControlled(mortal, w.day + HAUNT_DAYS)}`);
      // ★ 区分力：上面那条「300 次内必有一次成功」证明这条通道是通的；现在接着
      //   再试 200 次，**一次都不该成**——正被附身者不再被选为容器。
      //   故障：`pickCrossTarget` 漏了 `isControlled` 过滤 ⇒ 会反复刷新印记、`haunted` 虚高。
      let anyTrue = false;
      for (let gid = 2000500; gid < 2000700; gid += 1) {
        ghost.id = gid;
        if (crossPlanePossession(w, r, 5)) anyTrue = true;
      }
      check('★ 附身：正被附身者**不再被选为容器**（`pickCrossTarget` 的 `isControlled` 过滤）',
        anyTrue === false && w.possessionLog.haunted === 1,
        `又成了=${anyTrue} haunted=${w.possessionLog.haunted}`);
    }

    // ③ 阶位分界：level ≤ 20 ⇒ 真夺舍；level ≥ 21 ⇒ 只附身（同一条缝、同一只鬼）
    {
      check('★ 阶位分界常量：`POSSESS_TIER_MAX_LEVEL === 20`（怨灵及以下真夺舍）',
        POSSESS_TIER_MAX_LEVEL === 20, String(POSSESS_TIER_MAX_LEVEL));
      const runAt = (level) => {
        const w = mkPossessWorld(5050 + level);
        const r = w.rifts[0];
        const ghost = mkGhost(2000300, level, r.x + 0.5, r.y + 0.5, 250);
        const mortal = mkMortal(9, r.x + 1.5, r.y + 0.5);
        pushGhost(w, ghost);
        w.entities.push(mortal);
        const hit = tryUntilOk(w, ghost, r, 2000300, 300);
        return {
          hit,
          mode: mortal.possessionScar && mortal.possessionScar.mode,
          gone: w.nether.entities.length === 0,
        };
      };
      const lo = runAt(20);
      const hi = runAt(21);
      check('★ 阶位分界：level 20（怨灵）⇒ 真夺舍（mode=possess、鬼从幽冥消失）',
        lo.hit > 0 && lo.mode === 'possess' && lo.gone === true, JSON.stringify(lo));
      check('★ 阶位分界：level 21（厉鬼）⇒ 只附身（mode=haunt、鬼留在幽冥）',
        hi.hit > 0 && hi.mode === 'haunt' && hi.gone === false, JSON.stringify(hi));
    }

    // ④ cap：在世「被跨位面夺舍者」到 `CROSS_POSSESS_CAP` 就收手
    {
      const w = mkPossessWorld(6060);
      const r = w.rifts[0];
      const ghost = mkGhost(2000700, 20, r.x + 0.5, r.y + 0.5, 200);
      pushGhost(w, ghost);
      // 先手工塞满 cap 个「被真夺舍者」（`possessedBy` + `mode=possess` 两样都写，
      // 形状与真夺舍的产物一致——否则 `pickCrossTarget` 不会跳过它们）。
      for (let k = 0; k < CROSS_POSSESS_CAP; k += 1) {
        const e = mkMortal(100 + k, r.x + 1.5, r.y + 0.5);
        e.possessedBy = { name: '占位', level: 20, faction: 0, day: 0, suspected: 0 };
        e.possessionScar = { ghostName: '占位', ghostLevel: 20, day: 0, until: -1, mode: 'possess' };
        w.entities.push(e);
      }
      check('cap 前置：`crossPossessedCount` 只数 `mode=possess`（附身不算）',
        crossPossessedCount(w) === CROSS_POSSESS_CAP, String(crossPossessedCount(w)));
      const fresh = mkMortal(500, r.x + 2.5, r.y + 0.5);
      w.entities.push(fresh);
      let anyTrue = false;
      for (let gid = 2000700; gid < 2000900; gid += 1) {
        ghost.id = gid;
        if (crossPlanePossession(w, r, 5)) anyTrue = true;
      }
      check('★ cap：到顶后**不再真夺舍**（200 次尝试一次都不成、鬼还在幽冥、计数不变）',
        anyTrue === false && w.nether.entities.length === 1
        && crossPossessedCount(w) === CROSS_POSSESS_CAP && !fresh.possessedBy,
        `又成了=${anyTrue} 幽冥 ${w.nether.entities.length} count=${crossPossessedCount(w)}`);
    }

    // ⑤ 词条（两侧各一个，**派生**、不入档）
    {
      check('词条常量落在 (0,1) 且加成 > 1（写 0 会让「倾向夺舍」静默消失）',
        OBSESSION_RATE > 0 && OBSESSION_RATE < 1
        && HOLLOW_SOUL_RATE > 0 && HOLLOW_SOUL_RATE < 1
        && OBSESSION_BOOST > 1 && HOLLOW_SOUL_BOOST > 1,
        `执念 ${OBSESSION_RATE}×${OBSESSION_BOOST} · 魂虚 ${HOLLOW_SOUL_RATE}×${HOLLOW_SOUL_BOOST}`);
      check('词条：缺 id / null ⇒ false（不抛错、不误判）',
        isObsessed(null) === false && isObsessed({}) === false
        && isHollowSoul(null) === false && isHollowSoul({}) === false);
      const probe = { id: 4242 };
      const keysBefore = Object.keys(probe).join(',');
      isObsessed(probe);
      isHollowSoul(probe);
      check('词条是**派生**（不入档）：判定过程不往实体上写任何键（铁律二）',
        Object.keys(probe).join(',') === keysBefore, Object.keys(probe).join(',') || '无新键');
      // ★ 区分力：频率必须落在率附近。若有人把 `hashRoll` 换成裸 `hashString / 2^32`
      //   （FNV-1a 高位偏置——D6-3 工程包 C 真实踩过的坑），频率会飙到 ~1.0 或 ~0 ⇒ 当场红。
      const N = 2000;
      let nObs = 0; let nHol = 0;
      for (let i = 1; i <= N; i += 1) {
        if (isObsessed({ id: i })) nObs += 1;
        if (isHollowSoul({ id: i })) nHol += 1;
      }
      const fObs = nObs / N; const fHol = nHol / N;
      check('★ 词条频率落在率附近（钉「哈希当均匀数必须先过 finalizer」那个坑）',
        fObs > OBSESSION_RATE * 0.5 && fObs < OBSESSION_RATE * 1.6
        && fHol > HOLLOW_SOUL_RATE * 0.5 && fHol < HOLLOW_SOUL_RATE * 1.6,
        `执念 ${fObs.toFixed(3)}（期望 ${OBSESSION_RATE}）· 魂虚 ${fHol.toFixed(3)}（期望 ${HOLLOW_SOUL_RATE}）`);
    }

    // ⑥ 成功率口径：鬼修用 `ghostRancor` 顶替 `mind`（归一化后逐字沿用 `possessionChance`）
    {
      check('★ 归一化：`normalizeRancor(0)=0` / `(RANCOR_FULL)=100` / 超界夹住 / 负数夹到 0',
        normalizeRancor(0) === 0 && normalizeRancor(RANCOR_FULL) === 100
        && normalizeRancor(RANCOR_FULL * 10) === 100 && normalizeRancor(-5) === 0,
        `0→${normalizeRancor(0)} · full→${normalizeRancor(RANCOR_FULL)}`
        + ` · 10×→${normalizeRancor(RANCOR_FULL * 10)} · -5→${normalizeRancor(-5)}`);
      const a = crossPlanePossessionChance(30, 150, 5, 40);
      const b = possessionChance(30, normalizeRancor(150), 5, 40);
      check('★ 跨位面成功率 === `possessionChance(鬼修阶, normalizeRancor(积怨), 容器阶, 道心)`',
        a === b, `${a} vs ${b}`);
    }

    // ⑦ 存读档：`possessionScar` 走实体行 row[68] · `haunted` 走凡间 `possessionLog` 逐键显式写
    {
      const w = mkPossessWorld(7070);
      const r = w.rifts[0];
      const ghost = mkGhost(2001000, 30, r.x + 0.5, r.y + 0.5, 250);
      const mortal = mkMortal(11, r.x + 1.5, r.y + 0.5);
      pushGhost(w, ghost);
      w.entities.push(mortal);
      const hit = tryUntilOk(w, ghost, r, 2001000, 300);
      const before = JSON.stringify(mortal.possessionScar);
      const round = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
      const back = round.entities.find((e) => e.id === mortal.id);
      check('★ 存读档：`possessionScar` 逐字段往返（实体行 row[68]）',
        hit > 0 && Boolean(back) && JSON.stringify(back.possessionScar) === before,
        back ? JSON.stringify(back.possessionScar) : '（找不到实体）');
      check('存读档：`haunted` 子账往返（凡间 `possessionLog` 逐键显式写）',
        round.possessionLog.haunted === 1, JSON.stringify(round.possessionLog));
    }
  }
}

// ── 6. 大世界压力 ────────────────────────────────────────
// ── 5r. 世界大事账本（World.milestone）──────────────────────
// 这一节盯的是「大事记面板上的东西是从哪来的」。三类故障都能让它变红：
//   · `milestone()` 忘了同时写 chronicle（玩家点「世界」筛选就看不到）；
//   · 账本里存了**实体引用**而不是快照（铁律 3：人会死，引用会悬垂）；
//   · **门槛失守**——炼气→筑基这种一年好几起的小事灌满账本，把「开宗」「飞升」
//     挤出去。这正是 2026-09-22 第一版实测踩到的：60 年 548/572 条都是它。
//     （门槛后来定在「突破 ≥ 元婴、陨落 ≥ 金丹」，见 sim/cultivation.js。）
section('5r. 世界大事账本（milestone / 门槛 / 封顶 / 存档）');

{
  // ① 语义：一次调用写两本账，且存进去的是**快照**
  const mw = generateWorld({ preset: WORLD_PRESETS.small, seed: 4242, scatter: false });
  const chronicleBefore = mw.chronicle.length;
  mw.day = 720;
  mw.milestone('测试大事一件。', 'sect', null);
  check('milestone() 同时写 chronicle 与 milestones（两本账都要有）',
    mw.chronicle.length === chronicleBefore + 1 && mw.milestones.length === 1,
    `chronicle ${chronicleBefore}→${mw.chronicle.length} · milestones ${mw.milestones.length}`);
  const entry = mw.milestones[0];
  check('大事条目是快照（day/year/text/kind 四键，没有实体引用）',
    JSON.stringify(Object.keys(entry).sort()) === JSON.stringify(['day', 'kind', 'text', 'year'])
    && entry.day === 720 && entry.year === 2 && entry.kind === 'sect',
    JSON.stringify(entry));

  // ② 封顶：超量后长度收敛到 MILESTONE_CAP，且**留下的是最新的**
  //    （留最旧的那一批就成了「世界大事记停在开局」——不报错，只是永远不更新）
  const over = MILESTONE_CAP + 50;
  for (let i = 0; i < over; i += 1) mw.milestone(`第 ${i} 件事。`, 'world');
  check(`大事账本封顶在 ${MILESTONE_CAP} 条`,
    mw.milestones.length === MILESTONE_CAP,
    `${over + 1} 次 push → ${mw.milestones.length} 条`);
  check('封顶时淘汰的是**最旧**的（留下最新）',
    mw.milestones[mw.milestones.length - 1].text === `第 ${over - 1} 件事。`
    && mw.milestones[0].text === `第 ${over - MILESTONE_CAP} 件事。`,
    `首条「${mw.milestones[0].text}」· 末条「${mw.milestones[mw.milestones.length - 1].text}」`);

  // ③ 存档往返：账本必须逐字回来（save-equiv 查的是 payload 层，这里查语义层）
  const clone = deserializeWorld(serializeWorld(mw));
  check('大事账本存读档逐字一致',
    JSON.stringify(clone.milestones) === JSON.stringify(mw.milestones),
    `${mw.milestones.length} 条`);
  // 老档（v10 及以前）没有 milestones 键 → 补空数组，不是 undefined
  const noKey = serializeWorld(mw);
  delete noKey.milestones;
  const oldWorld = deserializeWorld(noKey);
  check('老档缺 milestones 时补成空数组（不是 undefined）',
    Array.isArray(oldWorld.milestones) && oldWorld.milestones.length === 0,
    JSON.stringify(oldWorld.milestones));
}

{
  // ④ 真实世界跑 60 年：账本要有内容、要**不止一类**、且门槛要真的挡住筑基
  const mw2 = generateWorld({ preset: WORLD_PRESETS.medium, seed: 20260914, scatter: true });
  const mlife = new Life(mw2, mulberry32(20260914));
  const mrng = mulberry32(7);
  for (let d = 0; d < 60 * 360; d += 3) {
    mw2.day += 3;
    mlife.step(3);
    stepHydrology(mw2, 3, null);
    if (d % 360 === 0) stepVegetation(mw2, 360, mrng);
  }
  const kinds = new Map();
  let lowRealmLeak = 0;
  for (const m of mw2.milestones) {
    kinds.set(m.kind, (kinds.get(m.kind) || 0) + 1);
    if (m.kind === 'breakthrough' && /炼气|筑基/.test(m.text)) lowRealmLeak += 1;
  }
  check('跑满 60 年，大事账本非空（面板不会永远空着）',
    mw2.milestones.length > 0, `${mw2.milestones.length} 条`);
  check('大事账本不止一类事件（单一类型灌满 = 门槛失守）',
    kinds.size >= 3,
    [...kinds].map(([k, n]) => `${k}:${n}`).join(' '));
  // 门槛守卫：突破条目里出现「炼气/筑基」= NOTABLE_BREAKTHROUGH_LEVEL 被人调低了
  check('门槛守得住：突破类大事里没有炼气/筑基（调低门槛会当场变红）',
    lowRealmLeak === 0, `越界 ${lowRealmLeak} 条`);
}

// ── 5s. 玩家干预 → 世界反馈 ────────────────────────────────
//
// 这一节守的是「我动了一下世界，历史改变了」这句话的**硬判据**：
// 操作之后，「大事记」里出现对应的一笔。
//
// 每条断言各自能抓到的故障：
//   · 天灾只写 record 不写 milestone → 玩家造的灾在世界史里等于没发生（B2 前的原状）；
//   · 文案退回光秃秃的「天降陨石」   → 没地名、没后果，玩家看不出自己做了什么；
//   · 报出的「N 所聚落受损」不扣血   → 故障类 1「字段存在 ≠ 生效」；
//   · 空落一笔也进大事记             → 600 条滚动窗口被噪声灌满（突破那边的老坑）；
//   · 降灾抽了 rng                   → WorldEvents 与 Life 共用同一条流，
//                                      点一下鼠标就把整个世界线往后挪（铁律 1）。
section('5s. 玩家干预 → 世界反馈（天灾进大事记 / 不抽 rng / 降灾闭环）');

{
  const w = generateWorld({ preset: WORLD_PRESETS.small, seed: 5150, scatter: false });
  const cx = Math.floor(w.w / 2);
  const cy = Math.floor(w.h / 2);
  // 手工立一个村 + 三个生灵：不跑几十年也能确定性地拿到「受灾聚落」与「罹难人数」
  const v = {
    id: 1, x: cx + 0.5, y: cy + 0.5, faction: 0, name: '测试村', pop: 0,
    food: 12, houses: [], fields: 0, level: 1, hp: 100, buildCooldown: 20, age: 0,
  };
  w.villages.push(v);
  w.nextVillageId = 2;
  for (let i = 0; i < 3; i += 1) w.entities.push({ x: cx + 0.5, y: cy + 0.5, hp: 10 });

  // ① 陨石落在人烟处 → 人话 + 大事记 + 真的扣了村子的血
  const mBefore = w.milestones.length;
  const cBefore = w.chronicle.length;
  const said = meteor(w, cx, cy, 6, new History());
  check('玩家天灾返回一句人话（不是数字、也不是 {killed} 对象）',
    typeof said === 'string' && said.length > 0, JSON.stringify(said));
  check('玩家天灾进大事记（kind=disaster）',
    w.milestones.length === mBefore + 1 && w.milestones[mBefore].kind === 'disaster',
    `${mBefore} → ${w.milestones.length} 条`);
  check('天灾文案带地名与后果（不是光秃秃的「天降陨石」）',
    !/^天降陨石/.test(said) && /罹难/.test(said) && /聚落受损/.test(said), said);
  check('「受灾聚落」由真的扣血撑着（22 点）',
    v.hp === 100 - 22, `村 hp ${v.hp}`);
  check('天灾同时进编年史（大事记是 chronicle 的子集，不是另一本账）',
    w.chronicle.length === cBefore + 1, `${cBefore} → ${w.chronicle.length}`);

  // ② 反例：空落一笔雷霆 → 有即时反馈、进编年史，但**不进大事记**
  const mBefore2 = w.milestones.length;
  const cBefore2 = w.chronicle.length;
  const said2 = lightning(w, 2, 2, new History());
  check('空落一笔雷霆不进大事记（不给 600 条滚动窗口添噪）',
    w.milestones.length === mBefore2, `${mBefore2} → ${w.milestones.length} 条`);
  check('但编年史照旧留痕（「不进大事记」≠「静默」）',
    w.chronicle.length === cBefore2 + 1, `${cBefore2} → ${w.chronicle.length}`);
  check('空落也有即时人话（玩家仍然知道刚才发生了什么）',
    typeof said2 === 'string' && /所幸四下无人烟/.test(said2), said2);

  // ③ 抹除：曾经完全静默（通知栏只有「抹除 · 落于 (x, y)」）
  const mBefore3 = w.milestones.length;
  const said3 = eraseLife(w, cx + 0.5, cy + 0.5, 3);
  check('抹除返回人话，且带地名与人数',
    typeof said3 === 'string' && /罹难/.test(said3), JSON.stringify(said3));
  check('抹除进大事记',
    w.milestones.length === mBefore3 + 1, `${mBefore3} → ${w.milestones.length} 条`);

  // ④ 瘟疫：报出的「N 人罹难」必须等于**真的被标死的**人数（故障类 1）
  //
  // ⚠️ 先把三个假人「复活」（前两笔天灾已经把它们的 hp 标到 0）。
  //    不复活的话，`plague` 会把**本来就躺着的人**也计进 `killed`，
  //    而「真的被标死」只数 hp 从正变零的那些，两边对不上——
  //    那是测试脚手架的假红，不是产品缺陷（真世界里 hp<=0 的人下一个 step 就被清走了）。
  for (let i = 0; i < w.entities.length; i += 1) w.entities[i].hp = 10;
  const mBefore4 = w.milestones.length;
  const hpBefore = w.entities.map((e) => e.hp);
  const said4 = plague(w, cx + 0.5, cy + 0.5, 4);
  const reallyKilled = w.entities.filter((e, i) => hpBefore[i] > 0 && e.hp <= 0).length;
  const claimed = (String(said4).match(/(\d+) 人罹难/) || [null, '0'])[1];
check('瘟疫报出的罹难人数 = 真的被标死的人数（数字不实就是故障类 1）',
  typeof said4 === 'string' && reallyKilled > 0 && Number(claimed) === reallyKilled,
  `文案说 ${claimed} 人 · 实际标死 ${reallyKilled} 人`);
  check('瘟疫进大事记',
    w.milestones.length === mBefore4 + 1, `${mBefore4} → ${w.milestones.length} 条`);

  // ⑤ 「降灾」工具在表里，且接的是**持续**灾祸（不是又一个即时天灾）
  check('工具表里有「降灾」且可执行',
    !!TOOL_BY_ID.crisis && typeof TOOL_BY_ID.crisis.apply === 'function'
    && TOOL_BY_ID.crisis.group === 'disaster',
    TOOL_BY_ID.crisis ? `${TOOL_BY_ID.crisis.name} / ${TOOL_BY_ID.crisis.group}` : 'missing');
}

{
  // ⑥ 降灾：一次 rng 都不抽（WorldEvents 与 Life 共用同一条流）
  const w = generateWorld({ preset: WORLD_PRESETS.small, seed: 5151, scatter: false });
  const cx = Math.floor(w.w / 2);
  const cy = Math.floor(w.h / 2);
  const v = {
    id: 1, x: cx + 0.5, y: cy + 0.5, faction: 0, name: '测试村', pop: 0,
    food: 12, houses: [], fields: 0, level: 1, hp: 100, buildCooldown: 20, age: 0,
  };
  w.villages.push(v);
  w.nextVillageId = 2;

  let draws = 0;
  const counting = () => { draws += 1; return 0.5; };
  const ev = new WorldEvents(w, counting);
  const afterCtor = draws;      // 构造时会抽 6 次（reset 里的六个倒计时）
  check('对照：WorldEvents 构造时确实会抽签（说明计数器是活的）',
    afterCtor > 0, `${afterCtor} 次`);

  const mBefore = w.milestones.length;
  const text = powerCrisis(w, ev, cx + 1, cy + 1);
  check('降灾一次 rng 都不抽（点一下鼠标不该移动世界线）',
    draws === afterCtor, `抽了 ${draws - afterCtor} 次`);
  check('降灾返回人话（含村名与灾名）',
    typeof text === 'string' && text.includes('测试村'), text);
  check('玩家降灾进大事记（kind=crisis）',
    w.milestones.length === mBefore + 1 && w.milestones[mBefore].kind === 'crisis',
    `${mBefore} → ${w.milestones.length} 条`);

  // 对照：不传 roll 时走抽签 → 证明上面那条不是「整条路径都不抽」
  const before2 = draws;
  ev.triggerCrisis(cx + 2, cy + 2);
  check('对照：不传 roll 时走抽签（上面那条不是因为整条路径都不抽）',
    draws === before2 + 2, `抽了 ${draws - before2} 次`);

  // 并存上限：不让玩家把世界同时压上几十场经年灾祸
  check('并存上限 2：第三场降灾被拒（返回 null，不是静默堆积）',
    ev.triggerCrisis(cx + 3, cy + 3, { crisis: 0.1, duration: 0.1 }) === null,
    `${ev.activeCrises.length} 场在跑`);

  // 结局：玩家亲手降下的灾，结算也进大事记（看不到结局 = 没有反馈）
  w.day = 360 * 40;
  const mBefore3 = w.milestones.length;
  ev.stepCrises(1);
  check('玩家降下的灾，结局也进大事记（熬过了 / 没能撑过）',
    w.milestones.length > mBefore3
    && w.milestones.some((m) => m.kind === 'crisis' && /熬过了|没能撑过/.test(m.text)),
    `${mBefore3} → ${w.milestones.length} 条`);

  // 对照：世界自发的灾年（byPlayer=false）结局只进编年史
  const ev2 = new WorldEvents(w, counting);
  ev2.activeCrises.push({
    key: 'drought', name: '赤地旱岁', note: '河床见底', villageId: 1,
    x: cx, y: cy, startedDay: 0, durationDays: 360, resolved: false, byPlayer: false,
  });
  const mBefore4 = w.milestones.length;
  ev2.stepCrises(1);
  check('对照：世界自发的灾年结局不进大事记（每 2~5 年一场会把窗口灌满）',
    w.milestones.length === mBefore4, `${mBefore4} → ${w.milestones.length} 条`);
}

// ── 5s+. §七 补强：标死 ⇒ 真死 / 地动 / 「N 所聚落受损」对账 ─────────────
//
// 这一节补的是 §七 审计（`reports/d5/SEVEN-AUDIT.md`）点名的三处**断言缺口**：
//   · 缺陷 F：所有「N 人罹难」读数都押在 `sim/life.js:627` 的
//     `if (e.hp <= 0) return false;` 上，却没有任何断言钉住它——
//     `smoke` 的瘟疫那条只证「文案数 = 被标死的数」（两边同一个循环产生），
//     **完全不证「被标死的真的死了」**；
//   · `earthquake` 在天灾组 5 个即时工具里**零断言**；
//   · 缺陷 H：报出的「N 所聚落受损」没有和**真的被扣血的村数**绑在一起。
section('5s+. §七 补强：标死⇒真死 / 地动 / 「N 所聚落受损」对账');

{
  // ── ①【本次最关键】标死 ⇒ 真死：钉住 `life.js:627` ─────────────────────
  //
  // 病根（`life.js:607-626` 自述）：`step()` 先跑 `stepEntity`（后半段有**进食回血**），
  // **再**跑死亡清扫。于是 `hp = 0` 的生灵会在**同一 tick 里先被治疗、再被清扫**——
  // 清扫看到的是个健康人，**这条命被无声救回**。`life.js:627` 就是那道闸。
  // 实测（`_diag_powerdeath.mjs`）：标死 738 个、**436 个被救活**；
  // `eraseLife` 与 `plague` 是 **100% 被救活**。
  //
  // 两侧都要，缺一侧就是恒真：
  //   A 侧 —— 被标死（`hp = 0`）的必须**真的离开 entities、真的进 dead 名录**；
  //   B 侧 —— **回血通路必须是活的**（同一肥力格上放一个 `hp > 0` 的实体，跑一步后 hp 上升）。
  //          没有 B 侧，A 侧的绿可能只是「回血代码整个没触发」造成的假绿。
  //
  // 什么故障会让这条变红：
  //   · 删掉 `life.js:627`（标死者被进食回血救活 → A 侧 `gone`/`inDead` 变假）；
  //   · 调换 `step()` 里 `stepEntity` 与死亡清扫的先后顺序（同上）；
  //   · 进食回血被拿掉 / 阈值被改到触发不了（B 侧 hp 不再上升）。
  const w4 = generateWorld({ preset: WORLD_PRESETS.small, seed: 424242, scatter: false });
  const l4 = new Life(w4, mulberry32(424242));
  // 找一个**有肥力（`fertility > 0.2`）且可走**的格子——进食回血的触发条件是
  // `fert > 0.2 && fire < 0.2`（`life.js:657`）。绕开它，这条测试就防不住那个洞。
  let fertIdx = -1;
  let fertBest = 0;
  for (let i = 0; i < w4.size; i += 1) {
    if (!w4.isWalkable(i)) continue;
    const f = w4.fertility(i);
    if (f > fertBest) { fertBest = f; fertIdx = i; }
  }
  const ftx = fertIdx % w4.w;
  const fty = (fertIdx - ftx) / w4.w;
  check('标死⇒真死 前置：找到有肥力且可走的格子（否则回血条件不成立，测试绕过了它要防的洞）',
    fertIdx >= 0 && fertBest > 0.2,
    `(${ftx},${fty}) fertility=${fertBest.toFixed(3)}`);
  // 用 `life.spawn` 造**字段完整**的实体（它会把 hp/maxHp/lifespan/relations… 一次配齐），
  // 再把它挪到那个肥力格上——手搓 `{x,y,hp}` 会在 `stepEntity` 里读到 undefined。
  const spawnAt = (x, y) => {
    const n0 = w4.entities.length;
    l4.spawn(x + 0.5, y + 0.5, SPECIES.HUMAN, 1);
    if (w4.entities.length !== n0 + 1) return null;
    const e = w4.entities[w4.entities.length - 1];
    e.x = x + 0.5;
    e.y = y + 0.5;
    return e;
  };
  const eA = spawnAt(ftx, fty);
  const eB = spawnAt(ftx, fty);
  const spawnOk = Boolean(eA) && Boolean(eB) && eA !== eB;
  check('标死⇒真死 前置：两个测试实体都成功生成（否则后面的断言是空跑）',
    spawnOk, spawnOk ? `两个凡人生成于 (${ftx},${fty})` : '生成失败');
  if (spawnOk) {
    eA.hp = 0;                                   // 「被标死」= hp 归零、尚未移除
    eB.hp = eB.maxHp * 0.5;                      // > 0，用于证明回血通路是活的
    const deadBefore4 = w4.deadLog.total;
    const deadLenBefore4 = w4.dead.length;
    const idA = eA.id;
    const hpB0 = eB.hp;
    l4.step(1);
    const goneA = !w4.entities.some((e) => e.id === idA);
    const inDeadA = w4.dead.some((r) => r.id === idA);
    check('【标死⇒真死】hp = 0 的生灵跑一步后真的离开 entities、真的进 dead 名录',
      goneA && inDeadA
      && w4.dead.length === deadLenBefore4 + 1
      && w4.deadLog.total === deadBefore4 + 1,
      `离开 entities=${goneA} · 入 dead 名录=${inDeadA}`
      + ` · deadLog ${deadBefore4}→${w4.deadLog.total} · dead ${deadLenBefore4}→${w4.dead.length}`);
    check('【标死⇒真死·对照】同一肥力格上 hp>0 的实体回了血（证明回血代码确实在跑）',
      eB.hp > hpB0,
      `hp ${hpB0.toFixed(2)} → ${eB.hp.toFixed(2)}（肥力 ${fertBest.toFixed(3)}）`);
  }
}

{
  // ── ② 地动 `earthquake`：天灾组 5 个即时工具里唯一**零断言**的那个 ──────
  //
  // `earthquake` 会：改高程（噪声错动）· 把「有建筑且 `falloff > 0.15`」的格
  // 以 55% 概率设成 `struct = 5` + `over = OVER.RUINS` · 把 LAVA 变 ASH ·
  // 并走 `disasterMilestone(..., damage = 18)` 扣村 hp。
  //
  // 判据分两半：
  //   · 世界真的变了 —— 施法前后对 `struct` / `over` 快照，数「真的变了的格数 > 0」；
  //   · 确定性的一半 —— 注入一个村，断言它的 hp 真的减少 **18**（`powers.js:423` 的 damage）。
  // 什么故障会让它变红：`earthquake` 变成空操作（建筑不塌、覆盖层不动）；
  // 或 `damage = 18` 被改掉 / 被漏传（村 hp 不再是 100 - 18）。
  const wE = generateWorld({ preset: WORLD_PRESETS.small, seed: 991991, scatter: false });
  const ecx = Math.floor(wE.w / 2);
  const ecy = Math.floor(wE.h / 2);
  // 先在落点附近铺一片「有建筑」的格，给「结构 → 废墟」那条路创造条件
  const eR = 6;
  let structSeeded = 0;
  for (let y = ecy - eR; y <= ecy + eR; y += 1) {
    for (let x = ecx - eR; x <= ecx + eR; x += 1) {
      if (!wE.inside(x, y)) continue;
      const i = wE.idx(x, y);
      if (!wE.isWalkable(i)) continue;
      wE.struct[i] = 1;
      structSeeded += 1;
    }
  }
  const ev = {
    id: 1, x: ecx + 0.5, y: ecy + 0.5, faction: 0, name: '测试村', pop: 0,
    food: 12, houses: [], fields: 0, level: 1, hp: 100, buildCooldown: 20, age: 0,
  };
  wE.villages.push(ev);
  wE.nextVillageId = 2;
  const structBefore = wE.struct.slice();
  const overBefore = wE.over.slice();
  const ehpBefore = ev.hp;
  const esaid = earthquake(wE, ecx, ecy, eR, new History());
  let structChanged = 0;
  let overChanged = 0;
  for (let i = 0; i < wE.size; i += 1) {
    if (wE.struct[i] !== structBefore[i]) structChanged += 1;
    if (wE.over[i] !== overBefore[i]) overChanged += 1;
  }
  check('地动真的改动了世界（struct / over 至少有一格真的变了）',
    structChanged + overChanged > 0,
    `建筑层变了 ${structChanged} 格 · 覆盖层变了 ${overChanged} 格（铺设 ${structSeeded} 格建筑）`);
  check('地动真的扣了聚落的血（damage = 18 是确定性的一半）',
    ev.hp === ehpBefore - 18 && /聚落受损/.test(String(esaid)),
    `村 hp ${ehpBefore} → ${ev.hp} · 文案「${esaid}」`);
}

{
  // ── ③ 「N 所聚落受损」必须等于**真的被扣血的村数** ─────────────────────
  //
  // 旧断言（`smoke:3443`）只查文案里有「聚落受损」四个字、`smoke:3445` 只查注入的
  // **那一个村** `hp === 78` ⇒ 报「5 所聚落受损」而实际只伤了 1 个村，两条都绿（缺陷 H）。
  //
  // 布置 3 个村：一个在杀伤半径内、一个刚好在边界外、一个很远。
  // ⚠️ `disasterMilestone` 的村半径是 `radius + DISASTER_VILLAGE_RADIUS(8)`，
  //    对 `meteor(..., radius = 6)` 是 `(6+2) + 8 = 16`。边界外那个放在 17 格外。
  // ⚠️ 「真的被扣血的村数」由测试**自己扫前后 hp 算**，**不调**产品的 `damageVillages`、
  //    也不复刻它的半径公式——否则等于用被测对象的实现来验它自己。
  const wV = generateWorld({ preset: WORLD_PRESETS.small, seed: 717171, scatter: false });
  const vcx = Math.floor(wV.w / 2);
  const vcy = Math.floor(wV.h / 2);
  const mkVillage = (id, x, y) => ({
    id, x, y, faction: 0, name: `测试村${id}`, pop: 0,
    food: 12, houses: [], fields: 0, level: 1, hp: 100, buildCooldown: 20, age: 0,
  });
  wV.villages.push(mkVillage(1, vcx + 0.5, vcy + 0.5));        // 命中（距离 0.5）
  wV.villages.push(mkVillage(2, vcx + 17.5, vcy + 0.5));       // 边界外（距离 17.5 > 16）
  wV.villages.push(mkVillage(3, vcx + 60.5, vcy + 60.5));      // 很远
  wV.nextVillageId = 4;
  const vHpBefore = wV.villages.map((v) => v.hp);
  const vsaid = meteor(wV, vcx, vcy, 6, new History());
  const vN = (String(vsaid).match(/(\d+) 所聚落受损/) || [null, '0'])[1];
  let reallyHurt = 0;
  for (let i = 0; i < wV.villages.length; i += 1) {
    if (wV.villages[i].hp < vHpBefore[i]) reallyHurt += 1;
  }
  check('「N 所聚落受损」== 真的被扣血的村数（报的数必须由真实改动撑着）',
    Number(vN) === reallyHurt && reallyHurt === 1,
    `文案报 ${vN} 所 · 真的被扣血 ${reallyHurt} 所`
    + ` · hp ${vHpBefore.join('/')} → ${wV.villages.map((v) => v.hp).join('/')}`);
}

// ── 5t. 三界最小闭环：魂路落到「具体某个人」身上（Batch 3）──────────
//
// Batch 3 之前，玩家能看到的只有**总数**：`soulLog` 里五路各多少、魂池里排着几个。
// 而「**这个**人死了之后去哪了」在界面上查不到——不是没人算，是算出来的那一刻
// 名册已经写完了：`rememberDead` 跑在 `onDeath()` 最开头（那时关系网/法宝/日志
// 都还没被后续步骤动过），而魂路要等 `enterNether` 才判得出来，中间还隔着夺舍。
// 修法是入册时留 `null`、判路之后回填（`necrology.markSoulRoute`）。
//
// 这一节钉死那条接线。判据全部取**契约稳定的不变量**，不写死「某人该落哪一路」
// ——落点判据已经改过三次（见 5f 的长注释），写死它就等于给自己埋一条会漂的断言。
section('5t. 三界：魂路落到具体的人身上（Batch 3）');

{
  const w = generateWorld({ preset: WORLD_PRESETS.small, seed: 4242, scatter: false });
  w.entities = [];
  w.dead = [];
  w.deadLog = { total: 0, ascended: 0, evicted: 0 };
  const mk = (name, level) => {
    const e = initEntity({ name, sp: SPECIES.CULTIVATOR, x: 10, y: 10 }, mulberry32(4242 + level));
    e.level = level;
    e.hp = 0;
    e.pollution = 0;
    e.karma = 0;
    e.age = 30 * 360;
    return e;
  };

  // ① 入册那一刻**还没有**魂路：`null` 是契约，不是漏写。
  //    它同时是 ② 的对照——证明 ② 里那个非 null 的值不是「无条件填的」。
  const a = mk('甲', 35);
  const recA = rememberDead(w, a, 'dead');
  check('入册时 soulRoute 是 null（魂路要等 enterNether 才判得出来）',
    !!recA && recA.soulRoute === null && 'soulRoute' in recA,
    `soulRoute=${JSON.stringify(recA && recA.soulRoute)}`);

  // ② 端到端：判路之后回填，且回填的那一路**与 soulLog 增量同路**。
  //    这是本节的承重断言——它把「账本涨了一路」与「名册上写着同一路」绑在一起。
  //    用**差值**判，不写死落点。
  const logBefore = { ...ensureSoulLog(w) };
  enterNether(w, a, mulberry32(11));
  const logAfter = { ...ensureSoulLog(w) };
  const bumped = Object.keys(logAfter).filter((k) => logAfter[k] !== logBefore[k]);
  check('判路之后：名册回填的那一路 == soulLog 涨的那一路',
    bumped.length === 1 && recA.soulRoute === bumped[0],
    `soulLog 涨了 [${bumped.join(',')}] · 名册写着 ${JSON.stringify(recA.soulRoute)}`);

  // ③ 凡人：到不了判路那一步（`soulTier === 0`，`enterNether` 第一行就返回），
  //    名册**必须**留在 null。没有这条，② 可以靠「无条件填一个默认值」变绿。
  const m = mk('凡', 0);
  const recM = rememberDead(w, m, 'dead');
  const logB2 = { ...ensureSoulLog(w) };
  enterNether(w, m, mulberry32(12));
  const logA2 = { ...ensureSoulLog(w) };
  check('对照：凡人 soulRoute 保持 null，且 soulLog 一笔都不记',
    recM.soulRoute === null
    && Object.keys(logA2).every((k) => logA2[k] === logB2[k]),
    `soulRoute=${JSON.stringify(recM.soulRoute)} · soulLog ${JSON.stringify(logB2)} → ${JSON.stringify(logA2)}`);

  // ④ `markSoulRoute` 找不到人时返回 false，且**名录一字不改**。
  //    「静默吞掉」是本项目最忌讳的坏法（一个返回 void 的函数没人看得出它没干活），
  //    所以返回值必须可判、且失败时不许留下半成品。
  const before = JSON.stringify(w.dead);
  check('markSoulRoute 找不到那个 id → 返回 false 且名录一字未改',
    markSoulRoute(w, 999999, SOUL_ROUTES.NATURAL) === false
    && JSON.stringify(w.dead) === before);

  // ⑤ `possess` 是**名册专有**的第六种去向，绝不能混进魂路账本：
  //    五路是考古定名（06 册 §5.2，`SOUL_ROUTES` 注释里写着「不得擅改」），
  //    多一个键就是擅改定名，而且 `inkbox-longrun.mjs:737-745` 有键集断言盯着。
  check('soulLog 的键集恰好是五路（possess 没混进去）',
    Object.keys(ensureSoulLog(w)).sort().join(',')
      === ['natural', 'linger', 'ghost', 'wraith', 'gone'].sort().join(','),
    Object.keys(ensureSoulLog(w)).sort().join(','));
  check('possess 不在 SOUL_ROUTES 的取值里（它不是魂路，是「没走魂路」）',
    !Object.values(SOUL_ROUTES).includes(SOUL_ROUTE_POSSESS),
    SOUL_ROUTE_POSSESS);
}

// ⑥ 真跑一段世界，钉一条**与淘汰无关**的结构不变量：
//    凡间名录里每一条「level >= 1 且 fate === 'dead'」都必须带魂路
//    （五路之一，或夺舍的 `possess`），而每一条 `level === 0` 必须是 `null`。
//
//    为什么它与「名录还剩几条」无关（所以不会随世界漂）：它是**逐条记录的因果**——
//      · level >= 1 → `onDeath` 里那道 `> 0` 的门进得去 → 要么 `enterNether`
//        回填一路，要么夺舍成功写 `possess`。两条互斥且穷尽；
//      · level === 0 → 那道门进不去，`enterNether` **根本不会被调用**。
//    ⚠️ 只对**凡间** world 成立：上界陨落者走 `upperLife.bury`，上界没有魂路。
{
  const w = generateWorld({ preset: WORLD_PRESETS.small, seed: 909, scatter: true });
  const life = new Life(w, mulberry32(909));
  life.processPendingSpawns();
  for (let d = 0; d < 360 * 20; d += 3) {
    w.day += 3;
    life.step(3);
  }
  const bad = [];
  let routed = 0;
  let mortals = 0;
  for (const r of w.dead) {
    const has = typeof r.soulRoute === 'string' && r.soulRoute.length > 0;
    if ((r.level || 0) > 0) {
      if (!has) bad.push(`${r.name}(lv${r.level}) 无魂路`);
      else routed += 1;
    } else {
      mortals += 1;
      if (r.soulRoute !== null) bad.push(`${r.name}(凡人) 却有魂路 ${r.soulRoute}`);
    }
  }
  // ⚠️ `routed > 0` 是**非空性守卫**：20 年一个修士都没死的话这条要红，
  //    那是**对的**（说明这段跑起来的不是这个世界），别把它放宽成 `>= 0`。
  check('凡间名录：修士必有魂路、凡人必无（20 年实跑）',
    bad.length === 0 && routed > 0 && mortals > 0,
    bad.length ? bad.slice(0, 4).join(' | ')
      : `${routed} 位修士 + ${mortals} 位凡人 / 名录 ${w.dead.length} 位`);
}

// ⑦ 反向对照：上界陨落者**不带**魂路。
//    `upperLife.bury()` 的注释写着「魂不进池……上界陨落者的魂路是 06 册与规格
//    §8.4 里尚未拍板的事」——也就是说这个 `null` 是**刻意的留白**。
//    这一条是为了让「哪天有人顺手在上界也写一个去向」当场变红。
{
  const up = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: 909 });
  const ul = new UpperLife(up);
  const victim = up.entities[0];
  const n0 = up.dead.length;
  if (victim) ul.bury(victim);
  check('上界陨落者不带魂路（上界没有魂路，是刻意的留白）',
    up.dead.length > n0 && up.dead.every((r) => r.soulRoute === null),
    `上界名录 ${up.dead.length} 位`);
}

// ── 5u. 世界推进的**唯一入口**（`advanceWorld`）与幽冥时钟的接线 ──
//
// 为什么单开一节（BACKLOG #13）：2026-09-23 新增 `stepNether`（幽冥鬼魂四步：
// 对账 / 到期 / 积怨 / 逐出）时，**真实游戏跑了它、各测试脚本自己抄的那份时钟
// 列表漏了它** —— 于是长测与 playtest 里幽冥四步一次都不跑、实体只增不减。
// 实测 playtest 跑 60 年印「幽冥鬼魂 186」，而同一世界 `soulLog.linger` 只有
// 60（186 是 60 年累计生成、一只没清过）。
//
// 这个模式**已经踩过两次**（更早一次是长测漏掉植被 / 野火）。所以修法不是
// 「补上那一行」，而是把时钟列表收进 `sim/advance.js` **一处**，再在这里钉住：
// 本节断言的**不是**「某个数等于某个值」，而是**「`advanceWorld` 确实把六个
// 时钟跑起来了」**。谁把幽冥那段从 `advance.js` 里删掉 / 注释掉，这一节当场变红。
//
// ⚠️ 本节**故意不 import `stepNether`**：直接调它等于绕过被测对象，
//    接线真断了也照样绿——那正是这个 bug 当初没被抓到的原因。
section('5u. 世界推进的唯一入口：六个时钟一次跑齐（BACKLOG #13 守卫）');

{
  // ── ① 节拍表本身：上界与幽冥**逐字同构**（每 10 日）；裂缝周期取自裂缝模块 ──
  // 故障：把 nether 的周期单独改成别的值 → 上界与幽冥的推进节奏分叉，
  //   而两张表在报告里都「有数」，没人看得出它们已经不同频。
  check('ADVANCE_PERIODS：上界与幽冥同拍（10 日），裂缝周期取自裂缝模块本身',
    ADVANCE_PERIODS.upper === ADVANCE_PERIODS.nether
    && ADVANCE_PERIODS.nether === 10
    && ADVANCE_PERIODS.rift === RIFT_PERIOD_DAYS,
    `upper=${ADVANCE_PERIODS.upper} nether=${ADVANCE_PERIODS.nether}`
    + ` rift=${ADVANCE_PERIODS.rift}(=RIFT_PERIOD_DAYS)`
    + ` eco=${ADVANCE_PERIODS.eco} fire=${ADVANCE_PERIODS.fire}`);

  // ── ② 缺累加器 ⇒ **宁可不推**，绝不静默退化成「每次调用都跑」 ──
  // 故障：`createAdvanceState()` 没被长期持有（例如每次现建一个），低频时钟
  //   退化成每帧一次——不报错，只是 `stepNether` 的 O(实体 × 魂池) 两两比对
  //   每帧跑一遍，机器发烫、帧率掉，而所有读数一切正常。
  {
    const w = generateWorld({ preset: WORLD_PRESETS.small, seed: 31337, scatter: true });
    check('缺 state 时 advanceWorld 直接返回 null（节流不许静默失效）',
      advanceWorld(w, 30, {}) === null && w.day === 0,
      `返回 null 且 world.day 仍为 ${w.day}`);
  }

  // ── ③ 裂缝时钟的开关语义（契约 C1.1 在**推进侧**的唯一兑现处）──
  // 故障：`riftActive` 被忽略（或恒真）⇒ 视界关着裂缝照常推进，于是玩家
  //   关窗期间那道缝走完一生，而他永远看不到——不报错，只是世界白白演化。
  {
    const w = generateWorld({ preset: WORLD_PRESETS.small, seed: 4242, scatter: true });
    const st = createAdvanceState();
    let on = 0;
    let off = 0;
    for (let i = 0; i < 12; i += 1) {
      const f = advanceWorld(w, 30, { state: st, riftActive: true });
      if (f && f.rift) on += 1;
    }
    for (let i = 0; i < 12; i += 1) {
      const f = advanceWorld(w, 30, { state: st, riftActive: false });
      if (f && f.rift) off += 1;
    }
    check('裂缝时钟：视界开着每 30 日一拍、关着一拍不跑（12 拍 vs 0 拍）',
      on === 12 && off === 0, `开 ${on} 拍 · 关 ${off} 拍`);
  }

  // ── ④ 真实世界跑 60 年：节拍 + 非空性 + 消散 + 守恒 + 上限 ────────
  //
  // ⚠️ **不手工种鬼魂**——让 `life.step` 自己产出（死亡 → `enterNether` →
  //    `spawnNetherGhost`）。这样验的是「真实世界那条路」。
  //    第一版在这里手工种了 35 只，然后拿 `ghostBorn === 35` 断言——**错了**：
  //    真实世界同时也在产鬼（实测 `ghostBorn = 236`），手工那 35 只淹在里面，
  //    「我种的那 30 只散了没有」根本判不出来。手工种的隔离场景见 ⑦⑧。
  const NETHER_SEED = 20260923;
  const NET_YEARS = 60;
  const STEP = 3;
  const TOTAL_DAYS = NET_YEARS * TIME.daysPerYear;
  // 节流规则：累加器每次 `+STEP`，**跨过**周期那一拍才跑 ⇒ 实际步长是
  // `ceil(周期 / STEP) * STEP`（10 日周期在 STEP=3 下 = 12 日）。
  // ⚠️ 第一版按 `总日数 / 周期` 算成 2160，实测 1800——**断言算错了，不是代码错了**。
  const tickSpan = Math.ceil(ADVANCE_PERIODS.nether / STEP) * STEP;
  const expectTicks = Math.floor(TOTAL_DAYS / tickSpan);

  const runNet = (withNether) => {
    const w = generateWorld({ preset: WORLD_PRESETS.medium, seed: NETHER_SEED, scatter: true });
    const life = new Life(w, mulberry32(NETHER_SEED ^ 0xa5a5a5a5));
    life.processPendingSpawns();
    // 与 `main.js` 的 `attachNether` 同款：seed 传**凡间原值**（派生在生成器内部做）
    w.nether = withNether
      ? generateNetherWorld({ preset: WORLD_PRESETS.medium, seed: w.seed })
      : null;
    const st = createAdvanceState();
    let firedNether = 0;
    for (let d = 0; d < TOTAL_DAYS; d += STEP) {
      const f = advanceWorld(w, STEP, { life, state: st, riftActive: false });
      if (f && f.nether) firedNether += 1;
    }
    return { w, firedNether };
  };
  const A = runNet(false);
  const B = runNet(true);

  // ── ⑤ 接线：`advanceWorld` 必须**真的**报了 `fired.nether` ──
  check(`advanceWorld 按 10 日节拍跑幽冥（STEP=${STEP} ⇒ 实际 ${tickSpan} 日一拍，${NET_YEARS} 年 ${expectTicks} 拍）`,
    B.firedNether === expectTicks && A.firedNether === 0,
    `挂幽冥 ${B.firedNether} 拍 · 不挂 ${A.firedNether} 拍 · 期望 ${expectTicks}（${tickSpan} 日/拍）`);

  // ── ⑥ 非空性守卫 + 「对账」真的在跑 + 守恒 + 上限 ──
  // ⚠️ 账本的键是 `nether.popLog`（`ensureNetherPopLog` 的落点），**不是**
  //    `netherPopLog`。写成后者时 `logB.ghostBorn` 是 `undefined`，
  //    下面第一条会红——这正是我们要的：**错键必须当场红，不能静默空过**。
  const stB = netherGhostStats(B.w.nether);
  const logB = B.w.nether.popLog || {};
  check('真实世界自己产出了鬼魂（非空性守卫：空的话下面几条是 0 == 0 的空过）',
    (logB.ghostBorn || 0) > 0 && stB.total > 0 && stB.total === B.w.nether.entities.length,
    `ghostBorn=${logB.ghostBorn} · 现存 ${stB.total}（普通 ${stB.ghost} / 鬼修 ${stB.cultivator}）`);
  // 「到期 / 对账」在跑 —— 60 年内自然鬼魂还没到 200 年寿命（`GHOST_DECAY_YEARS`），
  // 所以这里的 `ghostDied` **全部**来自第 1 步「对账」（绑魂鬼魂的魂一离开魂池即散，
  // 见 BACKLOG #12）。不跑 `stepNether` 的话它是 0，且实体只增不减。
  check('「到期 / 对账」真的在跑（ghostDied > 0 且现存 < 累计生成）',
    (logB.ghostDied || 0) > 0 && stB.total < (logB.ghostBorn || 0),
    `ghostDied=${logB.ghostDied} · 现存 ${stB.total} < 累计生成 ${logB.ghostBorn}`);
  check('守恒式：现存 === ghostBorn − ghostDied − evicted',
    B.w.nether.entities.length
      === (logB.ghostBorn || 0) - (logB.ghostDied || 0) - (logB.evicted || 0),
    `${B.w.nether.entities.length} === ${logB.ghostBorn} − ${logB.ghostDied} − ${logB.evicted}`);
  check('幽冥实体数不超过上限（`NETHER_SOUL_CAP`）',
    B.w.nether.entities.length <= NETHER_SOUL_CAP,
    `${B.w.nether.entities.length} / ${NETHER_SOUL_CAP}`);

  // ── ⑦ 隔离世界：手工种鬼魂、**不挂 life** ⇒ 没有自然产出，判据可控 ──
  //
  // ⚠️ **不挂 `life` 是关键**：真实世界会自己产鬼，混在一起就分不清
  //    「我种的 30 只散了没有」与「新生的把数抵消了」。
  //    这也是 ④ 的对照组：同一个 `advanceWorld`，只把 `life` 拿掉。
  const seedGhosts = () => {
    const w = generateWorld({ preset: WORLD_PRESETS.medium, seed: NETHER_SEED, scatter: true });
    w.nether = generateNetherWorld({ preset: WORLD_PRESETS.medium, seed: w.seed });
    // 30 只普通鬼魂（10 年寿命，好在 60 年内全部到期）+ 5 只鬼修（3000 年寿命）
    for (let i = 0; i < 30; i += 1) spawnNetherGhost(w.nether, { kind: 'ghost', decayYears: 10 });
    for (let i = 0; i < 5; i += 1) spawnNetherGhost(w.nether, { kind: 'ghostCultivator' });
    return w;
  };
  {
    const w = seedGhosts();
    const st = createAdvanceState();
    let fired = 0;
    for (let d = 0; d < TOTAL_DAYS; d += STEP) {
      const f = advanceWorld(w, STEP, { state: st, riftActive: false });
      if (f && f.nether) fired += 1;
    }
    const stC = netherGhostStats(w.nether);
    const logC = w.nether.popLog || {};
    check('隔离世界：到期消散真的跑了（10 年寿命的 30 只普通鬼魂，60 年后一只不剩）',
      fired === expectTicks && logC.ghostBorn === 35 && logC.ghostDied === 30
      && stC.total === 5 && stC.ghost === 0,
      `${fired} 拍 · ghostBorn=${logC.ghostBorn} ghostDied=${logC.ghostDied}`
      + ` · 现存 ${stC.total}（普通 ${stC.ghost} / 鬼修 ${stC.cultivator}）`);
    check('隔离世界：积怨升阶真的跑了（5 只鬼修 level 从 1 涨上去了）',
      stC.cultivator === 5 && w.nether.entities.length === 5
      && w.nether.entities.every((e) => e.level > 1),
      `鬼修 level：${w.nether.entities.map((e) => e.level).join('/')}`);
    check('隔离世界：守恒式 现存 === ghostBorn − ghostDied − evicted',
      w.nether.entities.length
        === (logC.ghostBorn || 0) - (logC.ghostDied || 0) - (logC.evicted || 0),
      `${w.nether.entities.length} === ${logC.ghostBorn} − ${logC.ghostDied} − ${logC.evicted}`);
  }

  // ── ⑧ 反例：把幽冥 tick 关掉 ⇒ 一只都不会散 ──
  // 这条是「假红工厂」的反面：它证明 ⑥⑦ 不是恒真——把被测的那条线掐掉，
  // 上面那几条读数**必须**变成另一副样子。
  {
    const w = seedGhosts();
    const st = createAdvanceState();
    let fired = 0;
    for (let d = 0; d < TOTAL_DAYS; d += STEP) {
      const f = advanceWorld(w, STEP, { state: st, riftActive: false, nether: false });
      if (f && f.nether) fired += 1;
    }
    const lg = w.nether.popLog || {};
    check('反例：关掉幽冥 tick 后，10 年寿命的鬼魂 60 年一只都不散（证明上面不是恒真）',
      fired === 0 && w.nether.entities.length === 35 && !lg.ghostDied,
      `fired ${fired} 拍 · 现存 ${w.nether.entities.length} 只 · ghostDied ${lg.ghostDied}`);
  }

  // ── ⑨ 凡间指纹：A 与 B **逐字一致**（铁律一）──
  // 判据是「两条线的凡间指纹逐字一致」——铁律一在幽冥上的形态。
  // 故障：给 `stepNether` 加了任何抽签；或让它去改 `world.souls` /
  //   `world.entities`（哪怕只 splice 一个元素）。两者都不报错，
  //   只是历史换了个人——本项目头号故障类「静静地错」。
  const fp = (w) => `${Math.round(w.day)}|${w.entities.length}|${w.chronicle.length}`
    + `|${w.milestones.length}|${w.dead.length}|`
    + w.entities.slice(0, 40).map((e) => `${e.name}@${e.x},${e.y}@${e.level}@${e.hp}`).join(';');
  const fa = fp(A.w);
  const fb = fp(B.w);
  check('幽冥对凡间是**纯观察**：挂幽冥与不挂幽冥，60 年凡间指纹逐字一致（铁律一）',
    fa === fb,
    fa === fb
      ? `一致 · day=${A.w.day} 生灵=${A.w.entities.length}`
        + ` 编年史=${A.w.chronicle.length} 名录=${A.w.dead.length}`
      : '不一致——幽冥 tick 移动了凡间的随机流，或改了凡间的账本');
}

// ── 5v. 上界空间生态（D6-2 工程包 C）────────────────────────────
//
// 规格：D6-2 工程包 C —— 上界凡人 / 修士要有**最小限度**的空间行为：
// 低频目标选择 + 简单移动 + 可通行检查。**不做 A*，不做寻路，不 `new Life(upper)`。**
//
// 这一组守的核心事实：**上界实体不再定格在出生点**。
// 在 C 包之前，`upperLife.step()` 里没有任何一行改 `e.x` / `e.y`——实体从出生
// （或从凡间飞升落地）到陨落，一直站在原地。那种坏法**不报错、不 NaN**，
// 只是视界窗口里上界永远是十二个不动的点，看起来像「还没做」。
//
// 每条都注明「什么故障会让它变红」。
section('5v. 上界空间生态：会动 / 站得住 / 低频 / 不抽主上界流（工程包 C）');

{
  const makeSpatialWorld = (seed) => {
    const m = generateWorld({ preset: WORLD_PRESETS.small, seed, scatter: true });
    const u = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: m.seed });
    m.upper = u;
    return { m, u };
  };
  // ⚠️ 一律走 `advanceWorld` 驱动（不许自己抄时钟列表）——与 5u 同一条纪律。
  const driveUpper = (m, ul, years) => {
    const st = createAdvanceState();
    for (let k = 0; k < years * 12; k += 1) {
      advanceWorld(m, 30, { upperLife: ul, state: st, nether: false, riftActive: false });
    }
  };
  const offWalkableCount = (u) => u.entities.filter(
    (e) => !upperWalkable(u, Math.floor(e.y) * u.w + Math.floor(e.x)),
  ).length;

  // ── ① 真的会动（60 年）──
  // 故障：删掉 `step()` 末尾的 `this.stepSpatial(dtDays)`；或 `stepSpatial` 提前 return；
  //   或 `moveSpatially` 的速度常量被改成 0 → 实体一格不动 → 红。
  const SW = makeSpatialWorld(20260914);
  const swLife = new UpperLife(SW.u);
  const swBefore = new Map(SW.u.entities.map((e) => [e.id, { x: e.x, y: e.y }]));
  driveUpper(SW.m, swLife, 60);
  let swMoved = 0;
  for (const e of SW.u.entities) {
    const b = swBefore.get(e.id);
    if (b && Math.hypot(e.x - b.x, e.y - b.y) > 1) swMoved += 1;
  }
  // 非空性守卫：开局 12 人若全陨落了，`swMoved === 0` 会因为「没人可动」而假红/假绿。
  check('上界空间生态的非空性守卫：60 年后开局 12 人仍在（不然下面的「会动」判不出来）',
    swBefore.size === 12 && SW.u.entities.length >= 12,
    `开局 ${swBefore.size} 人 · 60 年后 ${SW.u.entities.length} 人`);
  check('上界实体真的会移动：60 年后开局 12 人全部离开出生点（> 1 格）',
    swMoved === swBefore.size,
    `移动过 ${swMoved}/${swBefore.size}`);

  // ── ② 始终站在可通行格上（判据单源 = upperWalkable）──
  // 故障：`spatialCanStep` 改用「只判坐标在界内」/ 自己另写一套阈值；
  //   或 `moveSpatially` 的子步化被去掉（`dtDays` 一大就穿过云海）→ 实体站进云海 → 红。
  // ⚠️ 判据必须用 `upperWalkable`（与生成侧 / 飞升落点 / 裂隙过滤同一把尺子），
  //   不能用 `0 <= x < w` 那种只证明没越界的写法。
  check('上界实体始终站在 upperWalkable 为真的格上（子步化没有让它们穿过云海）',
    offWalkableCount(SW.u) === 0,
    `${offWalkableCount(SW.u)} 个实体站在云海 / 虚空里`);

  // ── ③ 低频 + 不瞬移：单拍位移有上界 ──
  // 故障：`moveSpatially` 的 `UPPER_MAX_MOVE_TILES` 被删掉（位移随 dtDays 线性放大，
  //   高倍速 / 长测下实体一拍拍出几十格，等于瞬移）→ 红。
  const SL = makeSpatialWorld(20260914);
  const slLife = new UpperLife(SL.u);
  const slBefore = SL.u.entities.map((e) => ({ e, x: e.x, y: e.y }));
  slLife.stepSpatial(10);
  let slMax = 0;
  for (const { e, x, y } of slBefore) slMax = Math.max(slMax, Math.hypot(e.x - x, e.y - y));
  // 上界 tick 是 10 游戏日一拍。`UPPER_TILES_PER_DAY = 0.9` ⇒ 名义 9 格，
  // 被 `UPPER_MAX_MOVE_TILES = 8` 截平。判据写 8 + 一点容差。
  check('单拍（10 游戏日）位移 ≤ UPPER_MAX_MOVE_TILES（不瞬移、不是「按 dtDays 线性放大」）',
    slMax <= 8.001, `单拍最大位移 ${slMax.toFixed(3)} 格（上限 8）`);

  // ── ④ 反向对照：关掉空间行为 ⇒ 一格不动（证明 ① 有区分力）──
  // ⚠️ 没有这条，① 的「会动」可能来自**别的**东西（例如有人把凡间的移动逻辑也接到了上界），
  //   而 `stepSpatial` 本身根本没起作用。
  const NL = makeSpatialWorld(20260914);
  const nlLife = new UpperLife(NL.u);
  nlLife.stepSpatial = () => {};          // 关掉空间行为
  const nlBefore = new Map(NL.u.entities.map((e) => [e.id, { x: e.x, y: e.y }]));
  driveUpper(NL.m, nlLife, 60);
  let nlMoved = 0;
  for (const e of NL.u.entities) {
    const b = nlBefore.get(e.id);
    if (b && Math.hypot(e.x - b.x, e.y - b.y) > 1) nlMoved += 1;
  }
  check('对照：关掉 stepSpatial 后，60 年开局 12 人一格不动（证明上一条不是恒真）',
    nlMoved === 0, `关掉后移动过 ${nlMoved} 人（期望 0）`);

  // ── ⑤ 本包最承重：`stepSpatial` 抽 `this.rng` 的次数**恒为 0** ──
  // 故障：`stepSpatial` / `pickSpatialTarget` / `moveSpatially` 里有人图省事写了
  //   `this.rng()`（而不是 `this.spatialRng()`）。后果：空间行为每拍抽签次数
  //   **挂在上界人口上**（每个实体重选目标抽 2×24+1 次），下一拍的修炼 / 化生 /
  //   立派 / 法宝 / 繁衍 / 炼器**整体错位**——`maybeForge` 的注释里记着同一个教训
  //   （逐人掷签曾让 200 年的 `popLog.born` 从 16 掀到 584）。
  const RL = makeSpatialWorld(20260914);
  const rlLife = new UpperLife(RL.u);
  let rngDraws = 0;
  const realRng = rlLife.rng;
  rlLife.rng = () => { rngDraws += 1; return realRng(); };
  let spatialDraws = 0;
  const realSpatial = rlLife.spatialRng;
  rlLife.spatialRng = () => { spatialDraws += 1; return realSpatial(); };
  for (let k = 0; k < 60; k += 1) rlLife.stepSpatial(10);
  check('★ stepSpatial 消费 this.rng 的次数恒为 0（空间行为不移动上界既有随机流）',
    rngDraws === 0, `60 次 stepSpatial 抽了 this.rng ${rngDraws} 次（期望 0）`);
  check('对照：同一批 stepSpatial 确实抽了 spatialRng > 0 次（证明上一条不是「函数没跑」）',
    spatialDraws > 0, `抽了 spatialRng ${spatialDraws} 次`);

  // ── ⑥ 修士偏向灵气（本包的「生态」含义：往灵气厚的地方走 ⇒ 修得更快）──
  // 用**合成图**把偏好做成确定性的：全图可通行，右半 qi=1 / 左半 qi=0。
  //   修士取 24 个采样里 qi 最高的 → 几乎必然落在右半；
  //   凡人纯随机 → 约一半。
  // 故障：`pickSpatialTarget` 的物种分支写反（修士走随机分支）；或把
  //   `isUpperMortal` 判据写错（修士被当成凡人）→ 修士那侧掉到 ~50% → 红。
  const QL = makeSpatialWorld(20260914);
  const qlLife = new UpperLife(QL.u);
  QL.u.height.fill(0.8);                  // 全图可通行
  QL.u.water.fill(0);
  for (let y = 0; y < QL.u.h; y += 1) {
    for (let x = 0; x < QL.u.w; x += 1) QL.u.qi[y * QL.u.w + x] = x > QL.u.w / 2 ? 1 : 0;
  }
  const qcx = Math.floor(QL.u.w / 2);
  const qcy = Math.floor(QL.u.h / 2);
  const rightShare = (cultivator) => {
    const probe = {
      sp: cultivator ? SPECIES.CULTIVATOR : SPECIES.HUMAN,
      level: cultivator ? 10 : 0, x: qcx, y: qcy,
    };
    let right = 0; let n = 0;
    for (let i = 0; i < 2000; i += 1) {
      const r = qlLife.pickSpatialTarget(probe);
      if (!r) continue;
      n += 1;
      if (r[0] > QL.u.w / 2) right += 1;
    }
    return n ? right / n : -1;
  };
  const cultShare = rightShare(true);
  const mortalShare = rightShare(false);
  check('修士选点偏向灵气厚的一侧（合成图右半 qi=1：修士 ≥ 90% 落右半）',
    cultShare >= 0.9, `修士落右半 ${(cultShare * 100).toFixed(1)}%（阈值 90%）`);
  check('对照：凡人选点无灵气偏好（合成图右半 qi=1：凡人 ≈ 一半，落在 30%~70%）',
    mortalShare >= 0.3 && mortalShare <= 0.7,
    `凡人落右半 ${(mortalShare * 100).toFixed(1)}%（期望 30%~70%）`);

  // ── ⑦ 移动状态在存档里往返（tx / ty / timer / state 是**实体列**）──
  // 空间行为**没有新增任何字段**：它用的 `x` / `y` / `tx` / `ty` / `timer` / `state`
  // 早就是实体行的第 2/3/12/13/11/10 列（`save.js` 的 `entities.map` 与
  // `restoreEntity` 两侧都有）。所以 C 包**不需要动存档格式**——这条断言钉住这一点：
  // 故障：有人为了存移动状态**新增一列**（那就动了存档格式与 `restoreEntity` 的行号，
  //   中间插列会把 `row[N]` 全顶歪）；或反过来，有人把 `tx` / `ty` 从实体列里删掉
  //   （读档后目标丢失，实体下一拍重选——不报错，但「存读档后轨迹应当连续」被破坏）→ 红。
  const SAV = makeSpatialWorld(20260914);
  const savLife = new UpperLife(SAV.u);
  driveUpper(SAV.m, savLife, 20);
  const savBack = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(SAV.m))));
  const savRow = (e) => `${e.x}|${e.y}|${e.tx}|${e.ty}|${e.timer}|${e.state}`;
  const savA = SAV.u.entities.map(savRow).sort();
  const savB = savBack.upper.entities.map(savRow).sort();
  check('上界实体的移动状态（x/y/tx/ty/timer/state）跨存档逐字往返（没有新增列）',
    savA.length > 0 && savA.join('||') === savB.join('||'),
    `${savA.length} 条 · ${savA.join('||') === savB.join('||') ? '逐字一致' : '不一致'}`);
}

// ── 5w. 幽冥最低生态（D6-2 工程包 D）────────────────────────────
//
// 规格：普通鬼魂沿冥河窄带活动 · 鬼修分档活动范围 · 阴气（`veg`）**影响**
// （不是决定）积怨成长 · 消散地点轻量留痕 · 高阶鬼修空间吸引。
// **不做**鬼城 / 鬼宗 / 幽冥战争 / 寻路（A*）。**零 rng**（`netherLife` 铁律一）。
//
// 这一组守的核心事实：**幽冥实体不再定格在落点**，且行为受**生态规则**约束。
// 在 D 包之前，`stepNether` 的四步只改 `level` / 删实体，没有任何一行改 `e.x` /
// `e.y`——鬼魂从落点到消散一直站在原地。那种坏法**不报错、不 NaN**，只是视界
// 窗口里幽冥永远是几个不动的点，看起来像「还没做」。
//
// 每条都注明「什么故障会让它变红」。
section('5w. 幽冥最低生态：会动 / 留在窄带 / 阴气影响积怨 / 消散留痕（工程包 D）');

{
  // 手工种鬼魂的幽冥世界。`decayYears` 传**大正数**表示「本测试期间不消散」——
  // ⚠️ **不要传 `-1`**：`spawnNetherGhost` 的 `decayYears < 0` 会落成哨兵
  //    `ghostDecayDay = -1e9`，而 `stepNether` 的判据是 `day >= ghostDecayDay`
  //    ⇒ `0 >= -1e9` 恒真 ⇒ **立即消散**（源码注释说的「永不消散」与实现相反，
  //    见 BACKLOG `#20`；生产路径（`reincarnation.js`）不传 `decayYears`，所以不受影响）。
  const mkNetherWorld = (seed, nGhost, nCult) => {
    const w = generateWorld({ preset: WORLD_PRESETS.small, seed, scatter: true });
    w.nether = generateNetherWorld({ preset: WORLD_PRESETS.small, seed: w.seed });
    for (let i = 0; i < nGhost; i += 1) {
      spawnNetherGhost(w.nether, { kind: 'ghost', decayYears: 100000 });
    }
    for (let i = 0; i < nCult; i += 1) {
      spawnNetherGhost(w.nether, { kind: 'ghostCultivator', decayYears: 100000 });
    }
    return w;
  };
  // ⚠️ 一律走 `advanceWorld` 驱动（不许自己抄时钟列表）——与 5u / 5v 同一条纪律。
  //    也**故意不直接调 `stepNether`**（同 5u 的理由：直接调等于绕过被测对象）。
  const driveNether = (w, years, step = 10) => {
    const st = createAdvanceState();
    const total = years * TIME.daysPerYear;
    let fired = 0;
    for (let d = 0; d < total; d += step) {
      const f = advanceWorld(w, step, { state: st, nether: true, riftActive: false });
      if (f && f.nether) fired += 1;
    }
    return fired;
  };
  const tileOf = (n, e) => Math.floor(e.y) * n.w + Math.floor(e.x);

  // ── ① 抽函数等价性：窄带集合与**独立朴素扫描**互为对照 ──
  // 工程包 D 把 `bankCandidates` 里内联的「附近有没有冥河」抽成了 `nearRiverAt`，
  // 并让活动范围判据共用它。这条断言用一份**独立实现**（直接扫 `water`）双向核对：
  //   · 集合里每格都满足「可通行 + 附近有冥河」；
  //   · 独立扫描认为该进窄带的格，集合里**一个不漏**。
  // 故障：`nearRiverAt` 抽错（半径 / 边界 / 判据与内联版不等价）⇒ 两向核对至少一侧红。
  {
    const w = mkNetherWorld(20260924, 0, 0);
    const n = w.nether;
    const tiles = netherBankTiles(n);
    const nearRiverNaive = (x, y, r) => {
      for (let yy = Math.max(0, y - r); yy <= Math.min(n.h - 1, y + r); yy += 1) {
        for (let xx = Math.max(0, x - r); xx <= Math.min(n.w - 1, x + r); xx += 1) {
          if (n.water[yy * n.w + xx] > 0.0015) return true;
        }
      }
      return false;
    };
    let bad = 0;
    for (let k = 0; k < tiles.length; k += 1) {
      const i = tiles[k];
      if (!netherWalkable(n, i)
        || !nearRiverNaive(i % n.w, Math.floor(i / n.w), NETHER_BANK_RADIUS)) bad += 1;
    }
    let missed = 0;
    for (let i = 0; i < n.size; i += 1) {
      if (netherWalkable(n, i)
        && nearRiverNaive(i % n.w, Math.floor(i / n.w), NETHER_BANK_RADIUS)
        && tiles.indexOf(i) < 0) missed += 1;
    }
    check('窄带集合非空，且与独立扫描双向一致（抽 nearRiverAt 未改变语义）',
      tiles.length > 0 && bad === 0 && missed === 0,
      `${tiles.length} 格 · 不合格 ${bad} · 遗漏 ${missed}`);
  }

  // ── ② D1：普通鬼魂会动 + 留在窄带内 + 站得住 ──
  // 故障：删掉 `stepNether` 末尾的 `stepNetherSpatial(...)`；或 `pickNetherSpatialTarget`
  //   恒返回 null；或速度常量被改成 0 → 一格不动 → 红。
  //   活动范围判据写错（例如忘了 `nearRiverAt`）→ 鬼魂漂出窄带 → 红。
  {
    const w = mkNetherWorld(20260924, 12, 0);
    const n = w.nether;
    const before = new Map(n.entities.map((e) => [e.id, { x: e.x, y: e.y }]));
    driveNether(w, 60);
    let moved = 0;
    for (const e of n.entities) {
      const b = before.get(e.id);
      if (b && Math.hypot(e.x - b.x, e.y - b.y) > 1) moved += 1;
    }
    const bankSet = new Set(netherBankTiles(n));
    const offBank = n.entities.filter((e) => !bankSet.has(tileOf(n, e))).length;
    const offWalk = n.entities.filter((e) => !netherWalkable(n, tileOf(n, e))).length;
    // 非空性守卫：若 12 只全散了，下面两条会因为「没人可动」而假绿。
    check('幽冥空间生态的非空性守卫：60 年后 12 只普通鬼魂仍在',
      before.size === 12 && n.entities.length >= 12,
      `开局 ${before.size} 只 · 60 年后 ${n.entities.length} 只`);
    check('D1 普通鬼魂真的会移动：60 年后全部离开落点（> 1 格）',
      moved === before.size, `移动过 ${moved}/${before.size}`);
    check('D1 普通鬼魂始终在河边窄带内（判据单源 = netherBankTiles 规范）',
      offBank === 0, `出窄带 ${offBank} 只`);
    check('D1 普通鬼魂始终站在 netherWalkable 为真的格上（子步化没让它们走进冥河）',
      offWalk === 0, `站不住 ${offWalk} 只`);
  }

  // ── ③ D2：鬼修分档活动范围（高阶能离开窄带）──
  // 判据：把一只鬼修直接设为鬼帝（`level = 51` ⇒ tier 5 ⇒ 活动半径 4 + 5×3 = 19），
  //   跑 60 年，它**必须**至少有一拍走到窄带（半径 4）之外。
  // 故障：`activityRadiusOf` 对鬼修返回 `BANK_RADIUS`（分档没生效）⇒ 永远出不了窄带 → 红；
  //   或范围判据写反（鬼修被限制得比普通鬼魂还紧）→ 红。
  {
    const w = mkNetherWorld(20260924, 0, 1);
    const n = w.nether;
    const cult = n.entities[0];
    cult.level = 51;                                  // 鬼帝（tier 5）
    const bankSet = new Set(netherBankTiles(n));
    const st = createAdvanceState();
    let leftBank = 0;
    for (let d = 0; d < 60 * TIME.daysPerYear; d += 10) {
      advanceWorld(w, 10, { state: st, nether: true, riftActive: false });
      if (!bankSet.has(tileOf(n, cult))) leftBank += 1;
    }
    const reach = NETHER_BANK_RADIUS + ghostTierOf(cult.level) * NETHER_TIER_REACH;
    const reachSet = new Set(netherBankTiles(n, reach));
    check('D2 高阶鬼修曾经离开窄带（活动范围随阶位放宽）',
      leftBank > 0,
      `离开窄带 ${leftBank} 拍 · level=${cult.level} tier=${ghostTierOf(cult.level)} reach=${reach}`);
    check('D2 鬼修始终在其阶位允许的范围（netherBankTiles(reach)）内',
      reachSet.has(tileOf(n, cult)), `格 ${tileOf(n, cult)} ∈ reach=${reach}`);
  }

  // ── ④ 不瞬移：单拍位移有上界 ──
  // 故障：`NETHER_MAX_MOVE_TILES` 被删掉（位移随 `days` 线性放大，长测下鬼魂一拍拍出
  //   几十格，等于瞬移）→ 红。
  {
    const w = mkNetherWorld(20260924, 6, 0);
    const n = w.nether;
    const snap = n.entities.map((e) => ({ e, x: e.x, y: e.y }));
    advanceWorld(w, 10, { state: createAdvanceState(), nether: true, riftActive: false });
    let mx = 0;
    for (const { e, x, y } of snap) mx = Math.max(mx, Math.hypot(e.x - x, e.y - y));
    check('幽冥单拍（10 游戏日）位移 ≤ NETHER_MAX_MOVE_TILES（不瞬移）',
      mx <= 6.001, `单拍最大位移 ${mx.toFixed(3)} 格（上限 6）`);
  }

  // ── ⑤ 本包最承重：幽冥空间行为**零 rng**（确定性 + 结构）──
  // ⚠️ 上界 5v 用「拦截 `this.rng` 计数」验零抽签；**幽冥没有这条路径**——
  //    `stepNether` 是纯函数、不接收 `rng`（铁律一），所以那条手法在这里不适用。
  //    改用**两条更硬的判据**：
  //      · 行为：同种子跑两遍，实体轨迹**逐字一致**（能抓到 `Math.random`）；
  //      · 结构：`netherLife.js` **不 import 任何随机数生成器**（不接主随机流）。
  //    ⚠️ 不能靠「两遍一致」抓 `mulberry32(seed)` 这种**确定性**伪随机——所以
  //    结构那条是必要的补充（它的故障模式与行为那条不同）。
  //    凡间指纹那一侧由 5u⑨ 守（挂幽冥与不挂幽冥，60 年凡间指纹逐字一致）。
  {
    const runNetherOnce = () => {
      const w = mkNetherWorld(20260924, 10, 2);
      driveNether(w, 40);
      return w.nether.entities
        .map((e) => `${e.id}@${e.x.toFixed(6)},${e.y.toFixed(6)}@${e.ghostRancor.toFixed(6)}`)
        .sort().join(';');
    };
    const s1 = runNetherOnce();
    const s2 = runNetherOnce();
    check('★ 同种子跑两遍，幽冥实体轨迹逐字一致（空间行为零 rng、无 Math.random）',
      s1.length > 0 && s1 === s2, s1 === s2 ? `一致 · ${s1.length} 字符` : '不一致');
    const netherSrc = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/inkbox/sim/netherLife.js'),
      'utf8',
    );
    const importLines = netherSrc.split('\n').filter((l) => l.trim().startsWith('import'));
    check('netherLife.js 不 import 任何随机数生成器（结构上不接主随机流）',
      !importLines.some((l) => /mulberry|noise|random/i.test(l)),
      `import 行 ${importLines.length} 条`);
    check('netherLife.js 源码不含 Math.random',
      !/Math\.random/.test(netherSrc), '未出现');
  }

  // ── ⑥ D3：阴气（`veg`）影响积怨 —— 影响，不是决定 ──
  // 合成图：**消除冥河**（`water.fill(0)`）⇒ `nearRiverAt` 恒 false ⇒ 鬼修采样全落空
  //   ⇒ **位置被锁死**（不动），于是可以精确比较「同 baseGain、不同 veg」的积怨增量。
  // 左半 veg=1 / 右半 veg=0，两只鬼修分置两侧，跑一拍：
  //   系数 = 0.6 + 0.8×veg ⇒ 左 1.4 / 右 0.6。
  // 故障：系数写成常量（环境没接上）⇒ 两侧相等 → 红；
  //   或系数下界被调成 0（「离开最佳格永远不能升级」）⇒ 右侧积怨 = 0 → 红。
  {
    const w = mkNetherWorld(777, 0, 0);
    const n = w.nether;
    n.water.fill(0);                                  // 消除冥河 ⇒ 锁死位置
    const findWalk = (pred) => {
      for (let y = 1; y < n.h - 1; y += 1) {
        for (let x = 1; x < n.w - 1; x += 1) {
          if (netherWalkable(n, y * n.w + x) && pred(x, y)) return { x: x + 0.5, y: y + 0.5 };
        }
      }
      return null;
    };
    const lo = findWalk((x) => x < n.w / 2);
    const hi = findWalk((x) => x >= n.w / 2);
    for (let y = 0; y < n.h; y += 1) {
      for (let x = 0; x < n.w; x += 1) n.veg[y * n.w + x] = x < n.w / 2 ? 1 : 0;
    }
    const a = spawnNetherGhost(n, { kind: 'ghostCultivator', decayYears: 100000 });
    const b = spawnNetherGhost(n, { kind: 'ghostCultivator', decayYears: 100000 });
    a.x = lo.x; a.y = lo.y; a.tx = lo.x; a.ty = lo.y;
    b.x = hi.x; b.y = hi.y; b.tx = hi.x; b.ty = hi.y;
    advanceWorld(w, 100, { state: createAdvanceState(), nether: true, riftActive: false });
    check('D3 阴气重的一侧积怨更快（环境**影响**成长）',
      a.ghostRancor > 0 && a.ghostRancor > b.ghostRancor,
      `veg=1 侧 ${a.ghostRancor.toFixed(4)} > veg=0 侧 ${b.ghostRancor.toFixed(4)}`);
    check('D3「不是决定」：荒芜（veg=0）侧照样积怨（基础积怨独立于环境）',
      b.ghostRancor > 0, `${b.ghostRancor.toFixed(4)} > 0`);
  }

  // ── ⑦ D4：消散留痕写 `veg`（+ 对照 + 存档往返）──
  // 故障：`leaveDecayTrace` 没接上（消散时没写 veg）⇒ 增量 0 → 红；
  //   写到了错的格（用 `e.tx` 而不是 `e.x`）⇒ 对照那条红；
  //   增量小到被量化抹平（< 1/65535）⇒ 存档往返那条红（这是「内存可见、存档消失」的故障类）。
  {
    const w = mkNetherWorld(888, 0, 0);
    const n = w.nether;
    const doomed = spawnNetherGhost(n, { kind: 'ghost', decayYears: 0 });
    const di = tileOf(n, doomed);
    const before = n.veg[di];
    const kept = spawnNetherGhost(n, { kind: 'ghost', decayYears: 100000 });
    const ki = tileOf(n, kept);
    const keepBefore = n.veg[ki];
    advanceWorld(w, 10, { state: createAdvanceState(), nether: true, riftActive: false });
    check('D4 到期消散的那只被清掉（前提）', !n.entities.includes(doomed),
      `现存 ${n.entities.length}`);
    check('D4 消散地点 veg 抬升（轻量留痕）', Math.abs(n.veg[di] - before - 0.03) < 1e-6,
      `${before.toFixed(5)} → ${n.veg[di].toFixed(5)}`);
    check('对照：未消散的那只所在格 veg 不变',
      Math.abs(n.veg[ki] - keepBefore) < 1e-9,
      `${keepBefore.toFixed(5)} → ${n.veg[ki].toFixed(5)}`);
    // 存档往返：留痕必须存得住（量化步长 1/65535）
    const w2 = mkNetherWorld(999, 0, 0);
    const n2 = w2.nether;
    const k = Math.floor(n2.h / 2) * n2.w + Math.floor(n2.w / 2);
    n2.veg[k] = 0.5;
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w2))));
    check('D4 留痕跨存档往返（在量化误差内）',
      Math.abs(back.nether.veg[k] - 0.5) <= (1 / 65535) * 1.01,
      `0.5 → ${back.nether.veg[k].toFixed(7)}`);
  }

  // ── ⑧ D5：高阶鬼修空间吸引 ──
  // 用 `pickNetherSpatialTarget` 直接采样（同 5v⑥ 用 `pickSpatialTarget` 的手法）：
  //   同一探针、同一批 `day` 种子，跑两遍——一遍无吸引源、一遍在右侧放一个吸引源，
  //   比较「目标到吸引源的平均距离」。
  // 故障：`stepNetherSpatial` 没收集 `lures`（或 `pickNetherSpatialTarget` 忽略了它）
  //   ⇒ 两组距离相同 → 红。
  {
    const w = mkNetherWorld(555, 0, 0);
    const n = w.nether;
    const tiles = netherBankTiles(n);
    const ci = tiles[Math.floor(tiles.length / 2)];
    const cx = (ci % n.w) + 0.5;
    const cy = Math.floor(ci / n.w) + 0.5;
    const probe = { id: 424242, sp: SPECIES.GHOST, soulKind: 'ghost', level: 0, x: cx, y: cy };
    const lure = [{ x: cx + 6, y: cy }];
    let cnt = 0;
    let sumNo = 0;
    let sumYes = 0;
    for (let d = 1; d <= 400; d += 1) {
      const t0 = pickNetherSpatialTarget(n, probe, d, []);
      const t1 = pickNetherSpatialTarget(n, probe, d, lure);
      if (!t0 || !t1) continue;
      cnt += 1;
      sumNo += Math.hypot(t0[0] + 0.5 - lure[0].x, t0[1] + 0.5 - lure[0].y);
      sumYes += Math.hypot(t1[0] + 0.5 - lure[0].x, t1[1] + 0.5 - lure[0].y);
    }
    check('非空性守卫：D5 采样有效次数足够（不然均值没意义）', cnt > 100, `${cnt}/400`);
    check('D5 有吸引源时，低阶实体的目标平均更靠近吸引源',
      cnt > 0 && sumYes / cnt < sumNo / cnt,
      `无吸引 ${(sumNo / cnt).toFixed(3)} → 有吸引 ${(sumYes / cnt).toFixed(3)}`);
  }

  // ── ⑨ 不压红既有基线：5u⑦ 隔离世界在 D3 之后仍满足「5 只鬼修 level > 1」──
  // 这条是**跨组回归守卫**：D3 让积怨增速乘了 [0.6, 1.4] 的环境系数，
  //   最坏情况（全程 veg=0）系数 0.6 ⇒ 60 年积怨 36 ⇒ level 11 > 1，仍有余量。
  // 故障：把 `RANCOR_ENV_MIN` 调成 0（或负数）⇒ 荒芜处不积怨 ⇒ 5u⑦ 的那条会红。
  //   ⚠️ 单独盯 `level` 本身（不是 popLog）：只盯账本会在「等级没涨」时照样绿。
  {
    const w = generateWorld({ preset: WORLD_PRESETS.medium, seed: 20260923, scatter: true });
    w.nether = generateNetherWorld({ preset: WORLD_PRESETS.medium, seed: w.seed });
    for (let i = 0; i < 30; i += 1) {
      spawnNetherGhost(w.nether, { kind: 'ghost', decayYears: 10 });
    }
    for (let i = 0; i < 5; i += 1) spawnNetherGhost(w.nether, { kind: 'ghostCultivator' });
    const st = createAdvanceState();
    for (let d = 0; d < 60 * TIME.daysPerYear; d += 3) {
      advanceWorld(w, 3, { state: st, nether: true, riftActive: false });
    }
    const lg = w.nether.popLog || {};
    const list = w.nether.entities;
    check('D3 不压红 5u⑦：30 只 10 年寿命鬼魂 60 年后一只不剩（ghostBorn=35 / ghostDied=30）',
      lg.ghostBorn === 35 && lg.ghostDied === 30 && list.length === 5,
      `ghostBorn=${lg.ghostBorn} ghostDied=${lg.ghostDied} 现存 ${list.length}`);
    check('D3 不压红 5u⑦：5 只鬼修 level 全部 > 1（环境系数下界 0.6 留有余量）',
      list.length === 5 && list.every((e) => e.level > 1),
      `level：${list.map((e) => e.level).join('/')}`);
  }
}

// ── 5x. 三界统一生态读数（D6-2 工程包 E）────────────────────────
//
// 规格：三界面板要报**同一口径**的生态账本（生 / 亡 / 现存），且「账平不平」可验算。
// 本组守的是**读数的口径与守恒式**（纯函数层）；面板文字与 DOM 的对账在 playtest 10e。
//
// 为什么把读数抽成纯函数再测（而不是只在 playtest 里查文字）：
//   · 纯函数能在**无头**下测，不用等浏览器；
//   · 「口径」这件事一旦有两份（面板一份、测试一份），迟早分叉——抽成一处，
//     面板与测试都调它。
section('5x. 三界统一生态读数：上界 / 幽冥的生态账本与守恒式（工程包 E）');

{
  // ── ① 上界口径：**故障注入**式验证（不依赖世界跑出非零值）──
  // ⚠️ 为什么不能只用「真实世界跑一段」当判据：实测 60 年上界的
  //    `arrived / born / bornMortal / died` **全是 0**（只有 `seeded` 非零）——
  //    此时漏加任何一项都**不影响结果**，断言恒绿（假绿工厂）。
  //    所以让四项各取一个**不同的**值：漏加哪一项，「生」都会不对。
  // 故障：`upperEcoStats` 漏掉某个加项（例如忘了 `bornMortal`）⇒ 这条红。
  {
    const seeded = 3; const arrived = 5; const born = 7; const bornMortal = 11; const died = 4;
    const alive = seeded + arrived + born + bornMortal - died;      // 22
    const fake = {
      entities: new Array(alive).fill(null),
      popLog: { seeded, arrived, born, bornMortal, died, sucked: 0, arrivedThunder: 0 },
    };
    const eco = upperEcoStats(fake);
    check('★ 上界口径：生 = seeded + arrived + born + bornMortal（四项各取不同值）',
      eco.born === seeded + arrived + born + bornMortal,
      `生 ${eco.born} · 期望 ${seeded}+${arrived}+${born}+${bornMortal}`
      + `=${seeded + arrived + born + bornMortal}`);
    check('★ 上界守恒式（构造式）：现存 === 生 − 亡',
      eco.alive === eco.born - eco.died, `${eco.alive} === ${eco.born} − ${eco.died}`);
  }

  // ── ② 上界：真实世界跑 300 年，守恒式在**真实**演化下也成立 ──
  // 300 年（不是 60 年）：实测 60 年上界人口一个都没动（账本四项全 0），
  //   要到 300 年量级才有 `arrived` / `died`——**窗口短于事件的最小可能时刻**
  //   是既有故障类。这里用与 C 包长跑同一尺度。
  {
    const w = generateWorld({ preset: WORLD_PRESETS.medium, seed: 20260924, scatter: true });
    const u = generateUpperWorld({ preset: WORLD_PRESETS.medium, seed: w.seed });
    w.upper = u;
    const ul = new UpperLife(u);
    const st = createAdvanceState();
    for (let k = 0; k < 300 * 12; k += 1) {
      advanceWorld(w, 30, { upperLife: ul, state: st, nether: false, riftActive: false });
    }
    const eco = upperEcoStats(u);
    const pop = u.popLog || {};
    check('上界 300 年生态读数非空（生 > 0 且现存 > 0）',
      eco.born > 0 && eco.alive > 0, `生 ${eco.born} · 亡 ${eco.died} · 现存 ${eco.alive}`);
    check('★ 上界守恒式（真实 300 年）：现存 === 生 − 亡',
      eco.alive === eco.born - eco.died,
      `${eco.alive} === ${eco.born} − ${eco.died}`
      + `（seeded ${pop.seeded || 0} + arrived ${pop.arrived || 0} + born ${pop.born || 0}`
      + ` + bornMortal ${pop.bornMortal || 0} − died ${pop.died || 0}）`);
  }

  // ── ③ 幽冥口径：**故障注入**式验证（三个计数各取不同值）──
  // 与上界 ① 同理：真实场景里 `evicted` 常是 0、`died` 与 `born` 又总是成对出现，
  //   只靠真实世界测不出「哪一项加错了」。三项各取不同值 ⇒ 漏加 / 算重都会红。
  // 故障：`netherEcoStats` 把 `evicted` 也算进 `died`、或漏了 `evicted` 减项 ⇒ 红。
  {
    const ghostBorn = 9; const ghostDied = 5; const evicted = 2;
    const alive = ghostBorn - ghostDied - evicted;                  // 2
    const fake = {
      entities: new Array(alive).fill(null).map(() => ({ soulKind: 'ghost', level: 0 })),
      popLog: { ghostBorn, cultivatorBorn: 0, ghostDied, cultivatorAdvanced: 0, evicted },
    };
    const eco = netherEcoStats(fake);
    check('★ 幽冥口径：生 = ghostBorn，亡 = ghostDied，逐 = evicted（三项各取不同值）',
      eco.born === ghostBorn && eco.died === ghostDied && eco.evicted === evicted,
      `生 ${eco.born} · 亡 ${eco.died} · 逐 ${eco.evicted}`);
    check('★ 幽冥守恒式（构造式）：现存 === 生 − 亡 − 逐 − 出 − 夺',
      eco.alive === eco.born - eco.died - eco.evicted - eco.climbedOut - eco.possessedOut,
      `${eco.alive} === ${eco.born} − ${eco.died} − ${eco.evicted}`
      + ` − ${eco.climbedOut} − ${eco.possessedOut}`);
  }

  // ── ④ 幽冥：隔离世界（手工种 + 不挂 life），三个数可控 ⇒ 逐个核对 ──
  // 30 只 10 年寿命 + 5 只鬼修，60 年后：生 35 / 亡 30 / 逐 0 / 现存 5。
  // 故障：`netherEcoStats` 把 `evicted` 漏进减项（或把 `ghostDied` 算重）⇒ 红。
  {
    const w = generateWorld({ preset: WORLD_PRESETS.medium, seed: 20260924, scatter: true });
    w.nether = generateNetherWorld({ preset: WORLD_PRESETS.medium, seed: w.seed });
    for (let i = 0; i < 30; i += 1) spawnNetherGhost(w.nether, { kind: 'ghost', decayYears: 10 });
    for (let i = 0; i < 5; i += 1) spawnNetherGhost(w.nether, { kind: 'ghostCultivator' });
    const st = createAdvanceState();
    for (let d = 0; d < 60 * TIME.daysPerYear; d += 3) {
      advanceWorld(w, 3, { state: st, nether: true, riftActive: false });
    }
    const eco = netherEcoStats(w.nether);
    check('幽冥生态读数：三个数都落在预期上（生 35 / 亡 30 / 逐 0 / 现存 5）',
      eco.born === 35 && eco.died === 30 && eco.evicted === 0 && eco.alive === 5,
      `生 ${eco.born} · 亡 ${eco.died} · 逐 ${eco.evicted} · 现存 ${eco.alive}`);
    check('★ 幽冥守恒式：现存 === 生 − 亡 − 逐 − 出 − 夺',
      eco.alive === eco.born - eco.died - eco.evicted - eco.climbedOut - eco.possessedOut,
      `${eco.alive} === ${eco.born} − ${eco.died} − ${eco.evicted}`
      + ` − ${eco.climbedOut} − ${eco.possessedOut}`);
  }

  // ── ⑤ 逐出进「逐」不进「亡」（上限逐出是独立的第三条路径）──
  // 故障：把 `evicted` 也算进 `died`（或反之）⇒ 这条红。
  //   ⚠️ 这是「两条离开路径必须分得开」的守卫——合并了的话，
  //   面板上的「亡」会把「被清出去」说成「死了」（两个意思完全不同）。
  {
    const w = generateWorld({ preset: WORLD_PRESETS.medium, seed: 4242, scatter: true });
    w.nether = generateNetherWorld({ preset: WORLD_PRESETS.medium, seed: w.seed });
    const over = NETHER_SOUL_CAP + 20;                 // 塞到上限之上 ⇒ 跑一拍逐出 20 只
    for (let i = 0; i < over; i += 1) {
      spawnNetherGhost(w.nether, { kind: 'ghost', decayYears: 100000 });
    }
    const before = netherEcoStats(w.nether);
    advanceWorld(w, 10, { state: createAdvanceState(), nether: true, riftActive: false });
    const after = netherEcoStats(w.nether);
    check('逐出进「逐」不进「亡」（上限逐出是独立的第三条路径）',
      after.evicted > before.evicted && after.died === before.died
      && after.alive === NETHER_SOUL_CAP,
      `逐 ${before.evicted} → ${after.evicted} · 亡 ${before.died} → ${after.died}`
      + ` · 现存 ${after.alive} / 上限 ${NETHER_SOUL_CAP}`);
    check('★ 逐出之后守恒式仍然成立',
      after.conserved, `${after.alive} === ${after.born} − ${after.died} − ${after.evicted}`);
  }

  // ── ⑥ 两界读数**口径一致**：都提供 born / died / alive 三个同名字段 ──
  // 故障：有人给某一界改了字段名（例如 `total` / `dead`），面板两处就要各写一套
  //   ⇒ 「统一口径」名存实亡。这条钉住「两界读数可互换读取」。
  {
    const w = generateWorld({ preset: WORLD_PRESETS.small, seed: 77, scatter: true });
    w.upper = generateUpperWorld({ preset: WORLD_PRESETS.small, seed: w.seed });
    w.nether = generateNetherWorld({ preset: WORLD_PRESETS.small, seed: w.seed });
    const ue = upperEcoStats(w.upper);
    const ne = netherEcoStats(w.nether);
    const keys = (o) => Object.keys(o).sort().join(',');
    check('两界生态读数共用同名字段（born / died / alive 都在，口径统一）',
      ['born', 'died', 'alive'].every((k) => k in ue && k in ne),
      `上界 {${keys(ue)}} · 幽冥 {${keys(ne)}}`);
  }
}

section('6. 大世界压力测试');
const bigPreset = WORLD_PRESETS.large;
const bt = Date.now();
const big = generateWorld({ preset: bigPreset, seed: 777, scatter: true });
const bigGenMs = Date.now() - bt;
const bigLife = new Life(big, mulberry32(31337));
bigLife.processPendingSpawns();

// ── 吞吐判据：**相对基线**，不是绝对阈值 ──────────────────────
//
// 为什么不能用绝对阈值：同一份代码五次实测 18,452 / 23,167 / 31,161 / 45,995 /
// 36,154 ms —— **2.5 倍散布**，而 30,000 ms 正好卡在散布中间。那是这台机器
// 被别的进程跑满（同机并行着几十个测试），**不是代码变慢了**。
// 绝对阈值落在抖动基线上，红的时候分不清「代码慢了」与「机器忙了」——
// 两者症状一模一样，处置却相反，所以这种红没人敢信，最后只会被无视。
//
// 办法：同进程先跑一段**定长纯 CPU 参照负载**，拿它当分母。
//   · 空载：参照负载 20~40 ms，比值约 580~615；
//   · 机器被跑满：分子分母**一起**变慢，比值基本不动 → 不会假红；
//   · 代码真的慢 2.5 倍：分子涨、分母不动 → 比值跟着涨 → 撞红。
// `RATIO_MAX = 1500` 是在实测 615 上留约 2.5 倍余量（标定见 `scripts/_thrcheck.mjs`）。
// ⚠️ `baselineMs` 与比值**必须打印**：否则下次红了你还是不知道是
//    「代码慢了」还是「机器被跑满了」——只打绝对值等于把这道判断又丢了。
const CPU_REF_ITERS = 30_000_000;
const RATIO_MAX = 1500;
const cpuRefT0 = Date.now();
let cpuRefAcc = 0;
for (let i = 0; i < CPU_REF_ITERS; i += 1) cpuRefAcc += i % 7;
// `Math.max(1, ...)` 是防「参照负载被引擎优化掉」：真被优化掉时 baselineMs 会是 0，
// 比值随即爆掉——那时应该红，而不是除零后拿到 Infinity 悄悄通过。
const baselineMs = Math.max(1, Date.now() - cpuRefT0);

const bt2 = Date.now();
let peakEntities = 0;
for (let year = 0; year < 60; year += 1) {
  for (let k = 0; k < 12; k += 1) { big.day += 30; bigLife.step(30); }
  peakEntities = Math.max(peakEntities, big.entities.length);
}
const bigMs = Date.now() - bt2;
check('大世界生成', bigGenMs < 8000, `${bigGenMs} ms`);
check('大世界模拟吞吐（相对基线：机器忙时分子分母一起涨，比值不变）',
  bigMs < RATIO_MAX * baselineMs,
  `60 年 ${bigMs} ms / 参照负载 ${baselineMs} ms = ${(bigMs / baselineMs).toFixed(0)}`
  + `（阈值 ${RATIO_MAX}）· 峰值 ${peakEntities} 生灵 · 参照累加 ${cpuRefAcc}`);
check('生灵数量未失控', big.entities.length <= 3000, `${big.entities.length} 个`);

// ── 7. 模拟期确定性（生成期确定 ≠ 模拟期确定）──────────────────
//
// 5n 组只证明了**生成期**确定性：两次 `generateUpperWorld` 的 12 人签名逐字一致。
// 但生成期确定**推不出**模拟期确定。模拟代码里只要混进一个
//   · `Math.random()` / `Date.now()` / `performance.now()`，或
//   · 依赖 `Set` / `Map` 迭代顺序、对象键顺序的遍历，
// 两次跑就会在第 N 天分叉——而生成期签名照样逐字一致，整份测试全绿。
//
// 这类不确定性**不报错、不 NaN**，只是让「同一份存档读两遍跑出两个世界」，
// 玩家读档后世界线悄悄漂移（静默不确定性，与「不报错只在读数上错」同源）。
// 它也不会被存读档等价测试抓到：等价测试比的是**同一条线**存档前后，
// 两条独立跑分叉的线根本不进它的视野。
//
// 判据：同一 preset + 同一凡间种子 + 同一 Life 种子，各跑 10 年，
// 指纹（时间 / 各账本长度 / 每人 name@x,y@level@restUntil）逐字一致。
// 什么故障会让它变红：任何一处非确定性来源进入**模拟**路径（生成路径不算，
// 那条已被 5n 覆盖）。反过来说，它绿只证明这 10 年这条种子没踩到，
// 不证明全路径确定——所以下面把指纹**长度**也打出来，好判断它真的跑了东西。
const DET_PRESET = WORLD_PRESETS.small;
const DET_SEED = 60606;
const DET_YEARS = 10;
const detFingerprint = (w) => [
  `day=${w.day}`,
  `n=${w.entities.length}`,
  `vil=${w.villages.length}`,
  `fac=${w.factions.length}`,
  `clan=${w.clans.length}`,
  `dead=${w.dead.length}`,
  `chr=${w.chronicle.length}`,
  `ms=${w.milestones.length}`,
  w.entities
    .map((e) => `${e.name}@${e.x},${e.y}@${e.level}@${e.restUntil || 0}`)
    .sort()
    .join('|'),
].join('#');
const runDeterminism = () => {
  const w = generateWorld({ preset: DET_PRESET, seed: DET_SEED, scatter: true });
  const l = new Life(w, mulberry32(DET_SEED));
  for (let y = 0; y < DET_YEARS; y += 1) {
    for (let k = 0; k < 12; k += 1) { w.day += 30; l.step(30); }
  }
  return detFingerprint(w);
};
const detA = runDeterminism();
const detB = runDeterminism();
// 非空性守卫：两条都空（生成期就没撒人）时 `'' === ''` 会**假绿**。
check('模拟期确定性测试确实跑出了世界（非空性守卫）',
  detA.length > 20 && detA !== detFingerprint(generateWorld({ preset: DET_PRESET, seed: DET_SEED, scatter: true })),
  `指纹 ${detA.length} 字符 · 已推进 ${DET_YEARS} 年`);
check('同一 preset + 同一种子跑 10 年：世界指纹逐字一致（模拟期确定性）',
  detA === detB,
  detA === detB
    ? `指纹一致 · ${detA.length} 字符`
    : `分叉：\n    A=${detA.slice(0, 240)}\n    B=${detB.slice(0, 240)}`);

console.log(`\n${'='.repeat(56)}`);
if (failures === 0) {
  console.log('全部通过 ✓');
  process.exit(0);
} else {
  console.log(`${failures} 项未通过 ✗`);
  process.exit(1);
}
