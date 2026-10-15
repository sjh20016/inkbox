// 水墨沙盒 · 神格工具（笔刷）与天灾
//
// 玩家所有「改变世界」的动作都从这里走。每个工具只做一件事：
// 改若干格的高程 / 水深 / 覆盖层 / 建筑 / 生灵。
// 改完之后立刻做局部类型重算，并记进撤销栈。

import { SEA_LEVEL, SPECIES, TERRAIN, LIMITS } from '../core/config.js';
import { clamp } from '../core/noise.js';
import { OVER, recomputeRect, recomputeAll } from '../world/terrain.js';
import { ignite, extinguish } from './ecology.js';
import { placeOf } from './sects.js';

// ── 撤销栈 ────────────────────────────────────────────────
export class History {
  constructor(limit = LIMITS.maxUndo) {
    this.limit = limit;
    this.stack = [];
    this.current = null;
    this.bounds = null;
  }

  begin() {
    this.current = new Map();
    this.bounds = null;
  }

  record(world, i) {
    if (!this.current || this.current.has(i)) return;
    this.current.set(i, {
      h: world.height[i],
      w: world.water[i],
      o: world.over[i],
      t: world.type[i],
      s: world.struct[i],
      v: world.veg[i],
      f: world.fire[i],
    });
    const x = i % world.w;
    const y = (i - x) / world.w;
    const b = this.bounds;
    if (!b) this.bounds = { x0: x, y0: y, x1: x, y1: y };
    else {
      if (x < b.x0) b.x0 = x;
      if (y < b.y0) b.y0 = y;
      if (x > b.x1) b.x1 = x;
      if (y > b.y1) b.y1 = y;
    }
  }

  end(label) {
    if (!this.current || this.current.size === 0) {
      this.current = null;
      this.bounds = null;
      return false;
    }
    this.stack.push({ changes: this.current, label, bounds: this.bounds });
    if (this.stack.length > this.limit) this.stack.shift();
    this.current = null;
    this.bounds = null;
    return true;
  }

  cancel() {
    this.current = null;
    this.bounds = null;
  }

  undo(world) {
    const entry = this.stack.pop();
    if (!entry) return null;
    for (const [i, o] of entry.changes) {
      world.height[i] = o.h;
      world.water[i] = o.w;
      world.over[i] = o.o;
      world.type[i] = o.t;
      world.struct[i] = o.s;
      world.veg[i] = o.v;
      world.fire[i] = o.f;
    }
    const b = entry.bounds;
    recomputeRect(world, b.x0, b.y0, b.x1, b.y1);
    world.touch();
    return entry.label;
  }

  clear() {
    this.stack.length = 0;
    this.current = null;
  }
}

function brushIndices(world, cx, cy, radius, fn) {
  const r = Math.max(0, radius - 0.5);
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(world.w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(world.h - 1, Math.ceil(cy + radius));
  const touched = { x0, y0, x1, y1, count: 0 };
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      // 距离要按「格中心」算。调用方传进来的 cx/cy 是 x + 0.5，
      // 若拿整数格号 x 去减，笔刷的有效中心就落到四格交角上了：
      // 中心格永远拿不到满强度（半径 2 时只有 0.54 倍），
      // 而半径 1 时 r = 0.5、四格距离都是 √0.5 > 0.5，直接一个格子都画不出来。
      const dx = (x + 0.5) - cx;
      const dy = (y + 0.5) - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const falloff = r <= 0 ? 1 : 1 - Math.sqrt(d2) / r;
      fn(y * world.w + x, x, y, falloff);
      touched.count += 1;
    }
  }
  return touched;
}

function seedFrom(x, y, salt) {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 抬高/压低地形。amount 为正则抬升，为负则下沉 */
export function sculpt(world, x, y, radius, amount, history) {
  const t = brushIndices(world, x, y, radius, (i, _px, _py, falloff) => {
    history.record(world, i);
    const soft = falloff * falloff * (3 - 2 * falloff);
    world.height[i] = clamp(world.height[i] + amount * soft, 0, 1);
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  return t.count;
}

/** 平整：向笔刷中心高程靠拢 */
export function flatten(world, x, y, radius, strength, history) {
  const centerIdx = world.idx(clamp(Math.round(x), 0, world.w - 1), clamp(Math.round(y), 0, world.h - 1));
  const target = world.height[centerIdx];
  const t = brushIndices(world, x, y, radius, (i, _px, _py, falloff) => {
    history.record(world, i);
    world.height[i] = world.height[i] + (target - world.height[i]) * strength * falloff;
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  return t.count;
}

/** 皴擦：在笔刷内叠加噪声，制造岩石质感 */
export function roughen(world, x, y, radius, strength, history) {
  const t = brushIndices(world, x, y, radius, (i, px, py, falloff) => {
    history.record(world, i);
    const n = seedFrom(px, py, 7) * 2 - 1;
    world.height[i] = clamp(world.height[i] + n * strength * falloff, 0, 1);
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  return t.count;
}

/** 注水：抬高水面（会在低洼处自然成湖） */
export function addWater(world, x, y, radius, amount, history) {
  const t = brushIndices(world, x, y, radius, (i, _px, _py, falloff) => {
    history.record(world, i);
    world.water[i] = Math.max(0, world.water[i] + amount * falloff);
    if (world.fire[i] > 0) world.fire[i] = 0;
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  return t.count;
}

/** 抽水 */
export function removeWater(world, x, y, radius, amount, history) {
  const t = brushIndices(world, x, y, radius, (i, _px, _py, falloff) => {
    history.record(world, i);
    world.water[i] = Math.max(0, world.water[i] - amount * falloff);
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  return t.count;
}

/** 植被笔刷：植林 / 焚林 */
export function paintVegetation(world, x, y, radius, target, history) {
  const t = brushIndices(world, x, y, radius, (i, _px, _py, falloff) => {
    history.record(world, i);
    if (world.water[i] > 0.02) return;
    const value = clamp(target * (0.45 + falloff * 0.75), 0, 1);
    world.veg[i] = value;
    if (target <= 0.05) {
      world.over[i] = OVER.SCORCHED;
      world.fire[i] = 0;
    } else if (world.over[i] === OVER.SCORCHED || world.over[i] === OVER.ASH) {
      world.over[i] = OVER.NONE;
    }
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  return t.count;
}

/** 焚林：烧掉草木并留下火头，火会自己顺着风向蔓延 */
export function burnForest(world, x, y, radius, history) {
  const t = brushIndices(world, x, y, radius, (i, _px, _py, falloff) => {
    history.record(world, i);
    if (world.water[i] > 0.02) return;
    if (falloff < 0.18) return;
    world.veg[i] = Math.max(0, world.veg[i] * 0.25);
    world.over[i] = OVER.SCORCHED;
    world.fire[i] = Math.max(world.fire[i], 0.32 + falloff * 0.5);
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  return t.count;
}

/** 地表覆盖笔刷：沙化 / 雪原 / 沼泽 / 沃土 */
export function paintOverlay(world, x, y, radius, overlay, history) {
  const t = brushIndices(world, x, y, radius, (i, _px, _py, falloff) => {
    history.record(world, i);
    if (world.water[i] > 0.02) return;
    if (falloff < 0.25 && overlay !== OVER.NONE) return;
    world.over[i] = overlay;
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  return t.count;
}

/** 熔岩：既是地形也是灾害 */
export function pourLava(world, x, y, radius, history) {
  const t = brushIndices(world, x, y, radius, (i, _px, _py, falloff) => {
    history.record(world, i);
    world.over[i] = OVER.LAVA;
    world.veg[i] = 0;
    world.fire[i] = 0;
    if (world.water[i] > 0) world.water[i] = Math.max(0, world.water[i] - 0.05 * falloff);
    world.height[i] = clamp(world.height[i] + 0.004 * falloff, 0, 1);
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  return t.count;
}

/** 生灵笔刷 */
export function paintLife(life, x, y, radius, species, count) {
  return life.spawn(x, y, species, count);
}

/** 抹除：范围内生灵消散 */
export function eraseLife(world, x, y, radius) {
  const r2 = radius * radius;
  let removed = 0;
  for (let i = world.entities.length - 1; i >= 0; i -= 1) {
    const e = world.entities[i];
    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy > r2) continue;
    // 这里原本是 `scatterArtifacts(world, e); world.entities.splice(i, 1);`。
    // splice 把这条死讯**从所有账本上抹掉**：necrology（world.dead / deadLog）、
    // 神魂（enterNether）、关系清理、死亡叙事全都看不见它，人就这么静默地没了。
    // 改成置 hp = 0，交给 life.step() 的清理循环走正常死亡管线
    // （onDeath → rememberDead / recordDeath / enterNether / dropArtifacts / onDeathRelations）。
    // ⚠️ 死亡因此**推迟到下一个 step()**，本函数只标记、不立即移除。
    //
    // 法宝不再在这里 scatter：onDeath 里的 dropArtifacts 会处理，而且更对——
    // 它先找弟子/道侣接手（继承），scatterArtifacts 则一律扔地上。两者都会清空
    // `entity.artifacts`，同时留着的话先 scatter 会让 dropArtifacts 空转，反而丢掉继承。
    // 村庄人口也不在这里减：pop 是 syncVillagePops() 每 tick 现算的推导量。
    e.hp = 0;
    removed += 1;
  }
  if (!removed) return 0;
  world.touch();
  // 返回「已标记待死」数——不是「已移除」数。同时把「我抹掉了什么」写成人话
  // 交给玩家，并（有人罹难时）进大事记。抹除**完全静默**过：玩家点一下，
  // 一片人没了，通知栏只说「抹除 · 落于 (x, y)」——没有地名、没有人数。
  return disasterMilestone(world, '生灵尽数消散', x, y, radius, removed);
}

// ── 玩家干预的「世界反馈」───────────────────────────────────
//
// 玩家按下的每一次灾祸都是**玩家自己在改写历史**。「我动了一下世界，
// 历史改变了」这句话的硬判据，就是「大事记」里多出这一笔。
//
// 原先四处天灾只写 `record('天降陨石','disaster')`：没有地名、没有伤亡数，
// 而且不进大事账本——玩家造的灾在世界史里等于没发生，只有翻编年史才看得到
// 一句没有主语的「天降陨石」。这里统一补三件事：
//   1. 带地名（`placeOf`，与宗门 / 战事 / 立村同一套地名，不另造一套）；
//   2. 带后果（多少人罹难、多少所聚落受损），且这个数**由真的改过
//      `village.hp` 撑着**——故障类 1「字段存在 ≠ 生效」就死在这里，
//      写一个没有改动的数字出来比不写更坏；
//   3. 有后果才走 `world.milestone`（它内部仍写 chronicle，编年史一行不少）。
//
// ⚠️ **不抽 rng**。`placeOf` / `Math.hypot` 都是纯函数，`milestone()` 本身
//    也不抽（见 `World.js` 的注释），所以加这一段**不移动随机流**。
//
// 为什么「空落一笔」不进大事记：大事账本是 600 条**滚动窗口**，往里面塞
// 无后果的条目会把真正的世界大事挤出去。但**不写大事记 ≠ 静默**——
// 那一笔照旧进 chronicle（玩家翻编年史看得到），而且落笔时会有即时提示。
// 这条区分让「有后果 / 无后果」两种落笔都能被两侧断言分开测。
const DISASTER_VILLAGE_RADIUS = 8;
const DISASTER_VILLAGE_DAMAGE = 14;

/** 灾祸波及的聚落：真的扣 hp / 粮，返回受灾名单（不是「判定的名单」） */
function damageVillages(world, x, y, radius, amount) {
  const hurt = [];
  for (let i = 0; i < world.villages.length; i += 1) {
    const v = world.villages[i];
    if (Math.hypot(v.x - x, v.y - y) > radius) continue;
    v.hp = Math.max(0, v.hp - amount);
    v.food = Math.max(0, v.food - amount * 0.25);
    hurt.push(v);
  }
  return hurt;
}

/**
 * 记一笔玩家天灾，返回给玩家看的人话。
 *
 * 返回值会被 `main.js:applyTool` 直接 `notify` 出去（`tool.mode === 'click'`
 * 时字符串结果就是玩家看到的提示），所以这里写的每一句都必须**当场为真**。
 */
function disasterMilestone(world, kind, x, y, radius, killed, damage = DISASTER_VILLAGE_DAMAGE) {
  const place = placeOf(world, x, y);
  const hurt = damageVillages(world, x, y, radius + DISASTER_VILLAGE_RADIUS, damage);
  const parts = [];
  if (killed > 0) parts.push(`${killed} 人罹难`);
  if (hurt.length) parts.push(`${hurt.length} 所聚落受损`);
  const text = parts.length
    ? `${place}${kind}：${parts.join('，')}。`
    : `${place}${kind}，所幸四下无人烟。`;
  if (parts.length) world.milestone(text, 'disaster');
  else world.record(text, 'disaster');
  return text;
}

// ── 天灾 ──────────────────────────────────────────────────

/** 闪电：点燃落点，并可击碎一格山体 */
export function lightning(world, x, y, history) {
  const tx = clamp(Math.round(x), 0, world.w - 1);
  const ty = clamp(Math.round(y), 0, world.h - 1);
  const i = world.idx(tx, ty);
  history.record(world, i);
  world.height[i] = clamp(world.height[i] + 0.01, 0, 1);
  const lit = ignite(world, tx, ty, 3, 1.2);
  // 雷击会直接抹掉一圈生灵
  let killed = 0;
  const r2 = 4 * 4;
  for (let k = world.entities.length - 1; k >= 0; k -= 1) {
    const e = world.entities[k];
    if ((e.x - x) ** 2 + (e.y - y) ** 2 > r2) continue;
    e.hp -= 400;
    if (e.hp <= 0) {
      // 原本是 `scatterArtifacts(world, e); world.entities.splice(k, 1);`——
      // 同 eraseLife：splice 让这条死讯对 necrology / 神魂 / 关系清理 / 死亡叙事隐身。
      // 改成让 hp 归零，由 life.step() 的清理循环走 onDeath 正常管线。
      // 法宝交给 onDeath 的 dropArtifacts（比 scatterArtifacts 多一层弟子/道侣继承）；
      // 村庄人口由 syncVillagePops() 现算，不在这里减。
      // ⚠️ 死亡推迟到下一个 step()，下面的 killed 是「已标记」数而非「已移除」数。
      e.hp = 0;
      killed += 1;
    }
  }
  recomputeRect(world, tx, ty, tx, ty);
  // 原先返回 `{ lit, killed }` 对象，而 `applyTool` 只认字符串 ⇒ 玩家看到的
  // 是通用提示「雷霆 · 落于 (x, y)」：点燃了几处草木、劈没劈死人，一个字都没有。
  const said = disasterMilestone(world, '落下一道雷霆', x, y, 4, killed, 6);
  return lit > 0 ? `${said}雷火点燃 ${lit} 处草木。` : said;
}

/** 陨石：砸出环形坑，坑内成焦土与熔岩，冲击波夷平建筑 */
export function meteor(world, x, y, radius, history) {
  const cx = clamp(Math.round(x), 0, world.w - 1);
  const cy = clamp(Math.round(y), 0, world.h - 1);
  const t = brushIndices(world, cx, cy, radius, (i, px, py, falloff) => {
    history.record(world, i);
    const d = Math.hypot(px - cx, py - cy) / Math.max(1, radius);
    const bowl = -Math.cos(Math.min(1, d) * Math.PI) * 0.5 + 0.5; // 中心 0 → 边缘 1
    world.height[i] = clamp(world.height[i] - (1 - bowl) * 0.11, 0, 1);
    if (d < 0.62) {
      world.over[i] = OVER.LAVA;
      world.veg[i] = 0;
    } else if (d < 1) {
      world.over[i] = OVER.SCORCHED;
      world.veg[i] = 0;
    }
    world.struct[i] = 0;
    world.fire[i] = Math.max(0, world.fire[i]);
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  ignite(world, cx, cy, radius + 2, 1);

  let killed = 0;
  const r2 = (radius + 2) * (radius + 2);
  for (let k = world.entities.length - 1; k >= 0; k -= 1) {
    const e = world.entities[k];
    if ((e.x - x) ** 2 + (e.y - y) ** 2 > r2) continue;
    // 原本是 `scatterArtifacts(world, e); world.entities.splice(k, 1);`——
    // 同 eraseLife：splice 让这场死对 necrology / 神魂 / 关系清理 / 死亡叙事隐身。
    // 置 hp = 0 交给 life.step() 的清理循环走 onDeath 正常管线；法宝由
    // onDeath 的 dropArtifacts 处理（scatterArtifacts 只会一律扔地上，丢掉继承那一层）；
    // 村庄人口由 syncVillagePops() 现算，不在这里减。
    // ⚠️ 死亡推迟到下一个 step()，返回的 killed 是「已标记」数而非「已移除」数。
    e.hp = 0;
    killed += 1;
  }
  return disasterMilestone(world, '天降陨石', x, y, radius + 2, killed, 22);
}

/** 地震：地层错动 + 建筑倒塌 */
export function earthquake(world, x, y, radius, history) {
  const cx = clamp(Math.round(x), 0, world.w - 1);
  const cy = clamp(Math.round(y), 0, world.h - 1);
  const t = brushIndices(world, cx, cy, radius, (i, px, py, falloff) => {
    history.record(world, i);
    const n = seedFrom(px, py, 991) * 2 - 1;
    const m = seedFrom(px, py, 313) * 2 - 1;
    world.height[i] = clamp(world.height[i] + n * 0.05 * falloff + m * 0.02, 0, 1);
    if (world.struct[i] && falloff > 0.15) {
      if (seedFrom(px, py, 77) < 0.55) {
        world.struct[i] = 5;
        world.over[i] = OVER.RUINS;
      }
    }
    if (world.over[i] === OVER.LAVA) world.over[i] = OVER.ASH;
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  return disasterMilestone(world, '地动山摇', x, y, radius, 0, 18);
}

/** 洪水：在范围内抬高水面并淹没低地 */
export function flood(world, x, y, radius, history) {
  const cx = clamp(Math.round(x), 0, world.w - 1);
  const cy = clamp(Math.round(y), 0, world.h - 1);
  const t = brushIndices(world, cx, cy, radius, (i, _px, _py, falloff) => {
    history.record(world, i);
    world.water[i] = Math.max(0, world.water[i] + (0.02 + falloff * 0.09));
    world.fire[i] = 0;
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  return disasterMilestone(world, '洪水滔天', x, y, radius, 0, 16);
}

/** 降雨：灭火、润泽、催生植被 */
export function rain(world, x, y, radius, history) {
  const t = brushIndices(world, x, y, radius, (i, _px, _py, falloff) => {
    history.record(world, i);
    world.fire[i] = 0;
    if (world.water[i] < 0.004) {
      world.veg[i] = clamp(world.veg[i] + 0.12 * falloff, 0, 1);
    }
    if (world.over[i] === OVER.SCORCHED && falloff > 0.4) world.over[i] = OVER.NONE;
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  return t.count;
}

/** 瘟疫：范围内生灵大量死亡，聚落凋敝 */
export function plague(world, x, y, radius) {
  const r2 = radius * radius;
  let killed = 0;
  for (let k = world.entities.length - 1; k >= 0; k -= 1) {
    const e = world.entities[k];
    if ((e.x - x) ** 2 + (e.y - y) ** 2 > r2) continue;
    if (seedFrom(Math.round(e.x), Math.round(e.y), 4242) < 0.55) {
      // 原本是 `scatterArtifacts(world, e); world.entities.splice(k, 1);`——
      // 同 eraseLife：splice 让这条死讯对 necrology / 神魂 / 关系清理 / 死亡叙事隐身。
      // 置 hp = 0 交给 life.step() 走 onDeath 正常管线；法宝由 dropArtifacts
      // 处理（含弟子/道侣继承），村庄人口由 syncVillagePops() 现算。
      // ⚠️ 死亡推迟到下一个 step()，返回的 killed 是「已标记」数而非「已移除」数。
      e.hp = 0;
      killed += 1;
    }
  }
  return disasterMilestone(world, '瘟疫横行', x, y, radius, killed, 16);
}

/**
 * 降灾：让一处聚落陷入**经年**灾祸，而不是当场抹平。
 *
 * 为什么需要它（即时天灾已经有了）：即时天灾是「一下按到底」——血条归零、
 * 尘埃落定，玩家看不到世界**接下来**怎么反应。而 `worldEvents` 里那套
 * 「村落级灾祸」是**持续过程**：每 tick 扣村子的 hp / 粮，2~5 年后才结算
 * 「熬过了」还是「没能撑过」。玩家亲手点的灾，结局会写进大事记——这才是
 * G1 要的那个闭环：干预 → 变化 → 反应 → 可观察事件 → 再干预。
 * （在此之前这条路径**全库无调用方**，玩家根本没有降灾的手段。）
 *
 * ⚠️ 不抽任何 rng：灾种与时长都由落点算出（`seedFrom` 是纯哈希）。
 *    理由见 `worldEvents.js:triggerCrisis` 的注释——`WorldEvents` 与 `Life`
 *    共用同一条流，抽一下就移动世界线。
 */
export function triggerCrisis(world, events, x, y) {
  if (!events || typeof events.triggerCrisis !== 'function') return '';
  const cx = clamp(Math.round(x), 0, world.w - 1);
  const cy = clamp(Math.round(y), 0, world.h - 1);
  const entry = events.triggerCrisis(x, y, {
    crisis: seedFrom(cx * 31 + cy, cy + (world.day % 97), 7331),
    duration: seedFrom(cx, cy, 9973),
  });
  if (!entry) return '此方天地已有两场经年灾祸未了，再降也是白降。';
  return entry.text;
}

/** 沃野：把一片地变成可耕地 */
export function fertilize(world, x, y, radius, history) {
  const t = brushIndices(world, x, y, radius, (i, _px, _py, falloff) => {
    history.record(world, i);
    if (world.water[i] > 0.02) return;
    world.veg[i] = clamp(world.veg[i] + 0.5 * falloff, 0, 1);
    if (world.over[i] === OVER.SCORCHED || world.over[i] === OVER.ASH || world.over[i] === OVER.LAVA) {
      world.over[i] = OVER.NONE;
    }
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  return t.count;
}

/** 铺路：让生灵走得快，聚落之间自然形成道路 */
export function paveRoad(world, x, y, radius, history) {
  const t = brushIndices(world, x, y, radius, (i, _px, _py, falloff) => {
    history.record(world, i);
    if (world.water[i] > 0.02) return;
    if (falloff < 0.3) return;
    world.over[i] = OVER.ROAD;
  });
  recomputeRect(world, t.x0, t.y0, t.x1, t.y1);
  return t.count;
}

export function resetWorld(world) {
  for (let i = 0; i < world.size; i += 1) {
    world.water[i] = 0;
    world.over[i] = 0;
    world.struct[i] = 0;
    world.fire[i] = 0;
  }
  for (let i = 0; i < world.size; i += 1) {
    if (world.height[i] < SEA_LEVEL) world.water[i] = SEA_LEVEL - world.height[i];
  }
  recomputeAll(world);
}

export { SEA_LEVEL, TERRAIN, SPECIES, extinguish };
