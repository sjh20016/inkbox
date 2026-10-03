// 水墨沙盒 · 3D 实体派生（Render3D M1-A）—— 纯函数：零 THREE / 零 DOM / 零 RNG
//
// ───────────────────────────────────────────────────────────────────────
// 为什么单独一层
// ───────────────────────────────────────────────────────────────────────
//
// `EntityLayer` 需要 `THREE`（`InstancedMesh`），而**派生逻辑不需要**。把
// 「世界状态 → 该画什么」抽成纯函数后，`scripts/inkbox-render3d-m1.mjs` 就能在
// node 里直接断言「实体数 = 实例数」「删一个实体 ⇒ 少一个实例」「改地形 ⇒ 实例 Y 变」，
// 不必启浏览器。这是 M0 已经立下的手法（`deriveVegetation.js` 同款）。
//
// ⚠️ **口径全部取自 `src/inkbox` 的权威定义，本文件不发明任何新口径**：
//   · 物种字段是 **`sp`**（`core/config.js` 的 `SPECIES`），**不是** `kind`
//     （`kind` 属于 `world.sites`，两者同名不同义——这是最容易写错的一处）；
//   · 「是不是修士」的权威判据是 **`level > 0`**（`world/World.js` 的 `cultivationStats`
//     注释明令；`sp` 只是 `awaken()` 顺手同步改写的镜像）；
//   · 实体 x/y 是**浮点格中心**（整数 + 0.5，`sim/life.js` 的 `spot[0] + 0.5`）；
//   · **`world.wraiths`（凡间鬼影）不在 `world.entities` 里**，是独立容器
//     （`sim/wraiths.js` 头注释说明了为什么：鬼进 entities 会被掷觉醒骰并修炼飞升）。
//
// ⚠️ 本文件**只读**：不写 `world`、不抽 RNG、不 `Math.random`。派生结果只喂给渲染器。

import { SPECIES, SPECIES_INFO } from '../../core/config.js';
import { REALMS, realmIndexFor } from '../../core/cultivation.js';
import { characterAppearanceOf } from '../characters/characterAppearance.js';

/**
 * 视觉类别。前四个来自 `world.entities`，`wraith` 来自 `world.wraiths`（凡间鬼影）。
 * ⚠️ 顺序是**渲染顺序契约**：`EntityLayer` 按此顺序建 `InstancedMesh`，
 *    测试也按此顺序取数组 ⇒ 改顺序会让断言全红（故意的，防悄悄重排）。
 */
export const ENTITY_CLASSES = Object.freeze(['human', 'cultivator', 'beast', 'spirit', 'wraith']);

/** 类别 → `SPECIES_INFO` 的键。`wraith` 复用鬼魂档（`ghost`）的配色。 */
const CLASS_SPECIES = Object.freeze({
  human: SPECIES.HUMAN,
  cultivator: SPECIES.CULTIVATOR,
  beast: SPECIES.BEAST,
  spirit: SPECIES.SPIRIT,
  wraith: SPECIES.GHOST,
});

/**
 * 一个实体该算哪一类视觉。
 *
 * ⚠️ 灵兽 / 山精 / 鬼魂**先判 `sp`**（它们不参与凡间觉醒，`level` 恒 0），
 *    凡人 / 修士**才按 `level > 0`** 分——因为 `sp` 与 `level` 理论上可能不同步，
 *    而权威口径是 `level`。
 */
export function entityClassOf(sp, level) {
  if (sp === SPECIES.BEAST) return 'beast';
  if (sp === SPECIES.SPIRIT) return 'spirit';
  if (sp === SPECIES.GHOST) return 'wraith';
  return (Number(level) || 0) > 0 ? 'cultivator' : 'human';
}

/**
 * 离地高度（视觉格）。**不改实体真实 x/y**，只抬高它的**表现**。
 * 蓝图 M1-A2：山精悬浮、高境界修士允许略微离地。
 */
export function entityLiftOf(cls, level) {
  if (cls === 'spirit') return 0.9;
  if (cls === 'wraith') return 0.5;
  if (cls === 'cultivator' && (Number(level) || 0) >= 20) return 0.4;
  return 0;
}

/**
 * 一个实体该是什么颜色（`#rrggbb` 字符串，交给渲染层转 `THREE.Color`）。
 *
 * 蓝图 M1-A2：**修士按宗门或境界产生小面积色彩区别**——
 * 有宗门用 `faction.color`（唯一真源 `core/config.js` 的 `FACTION_COLORS`），
 * 无宗门退回**境界色**（`core/cultivation.js` 的 `REALMS[].color`）。其余按物种色。
 */
export function entityColorOf(cls, level, faction, factionColorById) {
  if (cls === 'cultivator') {
    const own = factionColorById && factionColorById.get(faction);
    if (own) return own;
    return REALMS[realmIndexFor(Number(level) || 0)].color;
  }
  const info = SPECIES_INFO[CLASS_SPECIES[cls]] || SPECIES_INFO[SPECIES.HUMAN];
  return info.color;
}

/** 稳定的渲染顺序（`world.entities` 顺序**不保证稳定**：`removeEntity` 会与末尾交换后 pop）。 */
function byId(a, b) { return (a.id | 0) - (b.id | 0); }

/**
 * 世界状态 → 按类别分组的实体记录。
 *
 * @param {object} world 凡间 world（含 `entities` / `factions` / `wraiths`）
 * @returns {{human:Array, cultivator:Array, beast:Array, spirit:Array, wraith:Array, total:number}}
 *   每条记录 `{ id, x, y, level, faction, lift, color }`。**纯派生，不写 world。**
 */
function deriveFromWorld(world, includeWraiths) {
  const out = { human: [], cultivator: [], beast: [], spirit: [], wraith: [], total: 0 };
  if (!world) return out;

  const factionColorById = new Map();
  const factions = Array.isArray(world.factions) ? world.factions : [];
  for (const f of factions) if (f && Number.isFinite(f.id)) factionColorById.set(f.id, f.color);

  const entities = Array.isArray(world.entities) ? world.entities : [];
  for (const e of entities) {
    if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
    const level = Number.isFinite(e.level) ? e.level : 0;
    const faction = Number.isFinite(e.faction) ? e.faction : 0;
    const cls = entityClassOf(e.sp, level);
    const color = entityColorOf(cls, level, faction, factionColorById);
    out[cls].push({
      id: e.id, x: e.x, y: e.y, level, faction,
      lift: entityLiftOf(cls, level),
      color,
      appearance: characterAppearanceOf(e, cls, color),
    });
    out.total += 1;
  }

  const wraiths = includeWraiths && Array.isArray(world.wraiths) ? world.wraiths : [];
  for (const g of wraiths) {
    if (!g || !Number.isFinite(g.x) || !Number.isFinite(g.y)) continue;
    const level = Number.isFinite(g.level) ? g.level : 0;
    const color = entityColorOf('wraith', level, 0, factionColorById);
    out.wraith.push({
      id: g.id, x: g.x, y: g.y, level, faction: 0,
      lift: entityLiftOf('wraith', level),
      color,
      appearance: characterAppearanceOf(g, 'wraith', color),
    });
    out.total += 1;
  }

  for (const cls of ENTITY_CLASSES) out[cls].sort(byId);
  return out;
}

/** Stage ownership follows the container passed in, never an entity ID range. */
export function deriveEntities(world) { return deriveFromWorld(world, true); }
export function deriveUpperEntities(world) { return deriveFromWorld(world, false); }
export function deriveNetherEntities(world) { return deriveFromWorld(world, false); }

/**
 * 「这批派生结果和上一批一样吗」——精确逐字段比较（不用哈希，**没有碰撞风险**）。
 * `EntityLayer` 靠它决定「要不要重写 3000 条 instanceMatrix」（写矩阵的代价主要在
 * GPU 上传，不是 CPU 比较）。
 */
export function sameEntities(a, b) {
  if (!a || !b) return false;
  for (const cls of ENTITY_CLASSES) {
    const x = a[cls]; const y = b[cls];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i += 1) {
      const p = x[i]; const q = y[i];
      if (p.id !== q.id || p.x !== q.x || p.y !== q.y
        || p.level !== q.level || p.faction !== q.faction || p.color !== q.color
        || p.lift !== q.lift
        || p.appearance?.role !== q.appearance?.role
        || p.appearance?.paletteIndex !== q.appearance?.paletteIndex) return false;
    }
  }
  return true;
}
