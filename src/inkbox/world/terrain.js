// 水墨沙盒 · 地表类型推导
//
// 类型不是独立存的状态，而是「高程 + 水位 + 气温 + 湿度 + 坡度 + 覆盖层」
// 推导出来的结果。这样玩家抬山、放水、烧林之后，地表会自动变成该有的样子。

import { SEA_LEVEL, TERRAIN } from '../core/config.js';
import { clamp, smoothstep } from '../core/noise.js';

export const OVER = Object.freeze({
  NONE: 0,
  FARMLAND: 1,
  SCORCHED: 2,
  ASH: 3,
  LAVA: 4,
  RUINS: 5,
  ROAD: 6,
  SAND: 7,
  SNOW: 8,
});

const OVER_TO_TERRAIN = Object.freeze({
  [OVER.FARMLAND]: TERRAIN.FARMLAND,
  [OVER.SCORCHED]: TERRAIN.SCORCHED,
  [OVER.ASH]: TERRAIN.ASH,
  [OVER.LAVA]: TERRAIN.LAVA,
  [OVER.RUINS]: TERRAIN.RUINS,
  [OVER.ROAD]: TERRAIN.ROAD,
  [OVER.SAND]: TERRAIN.DESERT,
  [OVER.SNOW]: TERRAIN.SNOW,
});

/** 坡度（用四邻域高程差估算，单位：高程/格） */
export function slopeAt(world, x, y) {
  const w = world.w;
  const h = world.h;
  const xm = x > 0 ? x - 1 : x;
  const xp = x < w - 1 ? x + 1 : x;
  const ym = y > 0 ? y - 1 : y;
  const yp = y < h - 1 ? y + 1 : y;
  const i = y * w + x;
  const dx = world.height[y * w + xp] - world.height[y * w + xm];
  const dy = world.height[yp * w + x] - world.height[ym * w + x];
  const spanX = Math.max(1, xp - xm);
  const spanY = Math.max(1, yp - ym);
  return Math.sqrt((dx / spanX) ** 2 + (dy / spanY) ** 2);
}

/**
 * 各地表的灵气基数。山高水长处灵气厚，焦土熔岩处灵气绝。
 * 与 type 一样是推导量：玩家抬山、放水、烧林之后，灵气会自动跟着变。
 */
const QI_BASE = Object.freeze([
  0.12, // DEEP 渊
  0.16, // OCEAN 海
  0.22, // SEA 泽
  0.28, // SHALLOW 浅滩
  0.30, // SAND 汀
  0.34, // GRASS 草原
  0.38, // MEADOW 芳甸
  0.52, // FOREST 林
  0.58, // JUNGLE 密林
  0.24, // SAVANNA 疏林
  0.18, // DESERT 荒漠
  0.22, // TUNDRA 冻原
  0.46, // SWAMP 泽薮
  0.55, // ROCK 石
  0.70, // MOUNTAIN 山
  0.86, // PEAK 峻岭
  0.92, // SNOW 雪峰
  0.32, // FARMLAND 田
  0.04, // SCORCHED 焦土
  0.06, // ASH 烬
  0.02, // LAVA 熔岩
  0.40, // RUINS 废墟
  0.30, // ROAD 径
]);

/**
 * 灵气浓度 0..1。
 * 基数看地表，河道额外加成（水脉即灵脉），灵脉节点再叠加。
 */
export function qiAt(world, x, y, i) {
  let qi = QI_BASE[world.type[i]] ?? 0.3;
  if (world.riverBase[i] > 0) qi += Math.min(0.28, world.riverBase[i] * 12);
  const leylines = world.leylines;
  if (leylines && leylines.length) {
    for (let k = 0; k < leylines.length; k += 1) {
      const l = leylines[k];
      const dx = l.x - x;
      const dy = l.y - y;
      const d2 = dx * dx + dy * dy;
      const r = l.radius;
      if (d2 < r * r) qi += l.strength * (1 - Math.sqrt(d2) / r);
    }
  }
  return qi > 1 ? 1 : qi;
}

export function classify(world, x, y, i = y * world.w + x) {
  const height = world.height[i];
  const water = world.water[i];
  const over = world.over[i];

  if (over === OVER.LAVA) return TERRAIN.LAVA;

  // 水域按「水深」分层，而不是按海拔——这样深海、大陆架、湖泊、河道
  // 在同一张图上自然区分开，河道也会画成一道浅淡的水痕。
  if (water > 0.0015) {
    if (water > 0.15) return TERRAIN.DEEP;
    if (water > 0.055) return TERRAIN.OCEAN;
    if (water > 0.016) return TERRAIN.SEA;
    return TERRAIN.SHALLOW;
  }

  if (over !== OVER.NONE) {
    const mapped = OVER_TO_TERRAIN[over];
    if (mapped !== undefined) return mapped;
  }

  // 低平近水处 → 汀（沙洲滩地）
  if (height < SEA_LEVEL + 0.004) return TERRAIN.SAND;

  const temp = world.temp[i];
  const moist = world.moist[i];
  const slope = slopeAt(world, x, y);

  if (height > 0.9) return temp < 0.4 ? TERRAIN.SNOW : TERRAIN.PEAK;
  if (height > 0.8) return TERRAIN.PEAK;
  if (height > 0.7) return TERRAIN.MOUNTAIN;
  if (height > 0.62 || slope > 0.076) return TERRAIN.ROCK;

  if (temp < 0.16) return TERRAIN.TUNDRA;
  if (temp < 0.3) {
    if (moist > 0.55) return TERRAIN.FOREST;
    return moist < 0.26 ? TERRAIN.TUNDRA : TERRAIN.GRASS;
  }
  if (moist > 0.82 && temp > 0.62) return TERRAIN.JUNGLE;
  if (moist > 0.62) return TERRAIN.FOREST;
  if (moist < 0.19) return temp > 0.62 ? TERRAIN.DESERT : TERRAIN.SAVANNA;
  if (moist < 0.33) return TERRAIN.SAVANNA;
  if (moist > 0.74 && height < SEA_LEVEL + 0.05) return TERRAIN.SWAMP;
  return moist > 0.5 ? TERRAIN.MEADOW : TERRAIN.GRASS;
}

/** 一次把该格的所有推导量都算好：地表类型 + 灵气。 */
function applyTile(world, x, y, i) {
  world.type[i] = classify(world, x, y, i);
  world.qi[i] = qiAt(world, x, y, i);
  return world.type[i];
}

export function recomputeTile(world, x, y) {
  const i = y * world.w + x;
  return applyTile(world, x, y, i);
}

/**
 * 类型脏标记。模拟每帧会改动成千上万格的高程与水位，
 * 但如果每格都立刻重算类型，代价太高；这里只登记真正变过的格子，
 * 由模拟循环末尾统一 flush 一次。
 */
export function markDirty(world, i) {
  const flags = world._typeDirtyFlags && world._typeDirtyFlags.length === world.size
    ? world._typeDirtyFlags
    : (world._typeDirtyFlags = new Uint8Array(world.size));
  if (flags[i]) return;
  flags[i] = 1;
  if (!world._typeDirtyList) world._typeDirtyList = [];
  world._typeDirtyList.push(i);
}

/** 高程变了会连带影响四邻的坡度，所以邻居也要重算 */
export function markDirtyWithNeighbors(world, i) {
  const x = i % world.w;
  const y = (i - x) / world.w;
  markDirty(world, i);
  if (x > 0) markDirty(world, i - 1);
  if (x < world.w - 1) markDirty(world, i + 1);
  if (y > 0) markDirty(world, i - world.w);
  if (y < world.h - 1) markDirty(world, i + world.w);
}

export function flushDirty(world) {
  const list = world._typeDirtyList;
  if (!list || list.length === 0) return 0;
  const flags = world._typeDirtyFlags;
  const w = world.w;
  const count = list.length;
  for (let k = 0; k < count; k += 1) {
    const i = list[k];
    const x = i % w;
    const y = (i - x) / w;
    applyTile(world, x, y, i);
    flags[i] = 0;
  }
  list.length = 0;
  world.touch();
  return count;
}

/** 全量重算（生成世界后、载入旧存档后调用） */
export function recomputeAll(world) {
  for (let y = 0; y < world.h; y += 1) {
    for (let x = 0; x < world.w; x += 1) {
      const i = y * world.w + x;
      applyTile(world, x, y, i);
    }
  }
  world.touch();
}

/**
 * 只重算灵气层，不动地表类型。
 *
 * 载入存档时用得上：`type` 是随存档逐格存下来的（保证读档后地表一模一样），
 * 但 `qi` 还额外依赖 `world.leylines`——而灵脉是读档时才灌进来的。
 * 所以顺序必须是「先填 leylines，再调 recomputeQi」；
 * 反过来算出来的灵气层会缺掉灵脉那部分加成，读档后地图上的地气与修炼速度全都偏低。
 */
export function recomputeQi(world) {
  const size = world.size;
  const qi = world.qi;
  for (let y = 0, i = 0; y < world.h; y += 1) {
    for (let x = 0; x < world.w; x += 1, i += 1) {
      qi[i] = qiAt(world, x, y, i);
    }
  }
  world.touch();
}

/** 局部重算（笔刷落点周围一圈，含边界外扩 1 格以修正坡度） */
export function recomputeRect(world, x0, y0, x1, y1) {
  const ax = Math.max(0, x0 - 1);
  const ay = Math.max(0, y0 - 1);
  const bx = Math.min(world.w - 1, x1 + 1);
  const by = Math.min(world.h - 1, y1 + 1);
  for (let y = ay; y <= by; y += 1) {
    for (let x = ax; x <= bx; x += 1) {
      const i = y * world.w + x;
      applyTile(world, x, y, i);
    }
  }
  world.touch();
}

/**
 * 覆盖层自然衰减：焦土生草、灰烬肥田、熔岩冷却成石。
 * 每 yearTicks 天推进一次，速率极慢，让灾难痕迹能留存很久。
 */
export function decayOverlay(world, dtDays, rng) {
  const rate = dtDays / 3600;
  const over = world.over;
  const height = world.height;
  let changed = false;
  for (let i = 0; i < world.size; i += 1) {
    const value = over[i];
    if (value === OVER.NONE) continue;
    if (rng() > rate) continue;
    if (value === OVER.SCORCHED) {
      over[i] = world.veg[i] > 0.4 ? OVER.NONE : OVER.ASH;
      changed = true;
    } else if (value === OVER.ASH) {
      over[i] = OVER.NONE;
      changed = true;
    } else if (value === OVER.LAVA) {
      over[i] = OVER.ASH;
      height[i] = clamp(height[i] + 0.012, 0, 1);
      markDirtyWithNeighbors(world, i);
      changed = true;
    } else if (value === OVER.RUINS) {
      over[i] = OVER.NONE;
      changed = true;
    } else if (value === OVER.SAND) {
      // 荒漠要靠长年湿润才能退回草原
      if (world.moist[i] > 0.55) {
        over[i] = OVER.NONE;
        changed = true;
      }
    } else if (value === OVER.SNOW) {
      if (world.temp[i] > 0.5) {
        over[i] = OVER.NONE;
        changed = true;
      }
    }
  }
  if (changed) world.touch();
  return changed;
}

/** 岸边判定：用于渲染时勾勒水岸线 */
export function isShoreline(world, x, y) {
  const i = y * world.w + x;
  if (world.water[i] > 0.0015) return false;
  if (x > 0 && world.water[i - 1] > 0.0015) return true;
  if (x < world.w - 1 && world.water[i + 1] > 0.0015) return true;
  if (y > 0 && world.water[i - world.w] > 0.0015) return true;
  if (y < world.h - 1 && world.water[i + world.w] > 0.0015) return true;
  return false;
}

export { smoothstep };
