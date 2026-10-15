// 水墨沙盒 · 地图上的地点
//
// 秘境、洞府、上古阵法、灵脉——这些东西让地图本身有「值得去的地方」，
// 修士会朝它们走，宗门会为灵脉开战，玩家也能亲手往地图上埋一处机缘。
//
// 来源：
//   secretRealmSystem.js  5 类秘境（剑冢/丹阁/阵眼/古战场/仙府废墟），
//                         3-7 重考验，奖励 +0.08~0.15 修炼加成
//   immortalCaveSystem.js 5 类洞府，60-120 年出世间隔，胜者得传承
//   ancientFormationSystem.js 5 种阵法，100 年冷却，70% 得exp / 30% 损血

import { SECRET_REALMS, CAVE_TYPES, CAVE_SITES, FORMATIONS, MANUALS, narrate, pickFrom } from '../core/lore.js';
import { claimGroundArtifact, ownerLine } from './artifacts.js';
import { clamp } from '../core/noise.js';

/**
 * 地点自然消亡的年限（游戏年），秘境与阵法是「机缘有时」，会自己散去。
 *
 * 遗蜕也要设年限：它原本是「永不消失」，于是六百年下来地图上堆了四百多处
 * 旧战场与遗蜕，把真正的机缘淹没了。三百年正好是一代人的时间——
 * 前人留下的东西还在，但不会积成一座垃圾场。
 */
export const SITE_LIFESPAN_YEARS = Object.freeze({
  secret: 160,
  cave: 400,
  formation: 120,
  ruin: 220,
});

/** 一名修士进入秘境后的结算 */
export function enterSite(world, entity, site, rng) {
  const level = entity.level || 0;
  if (level < 3) return null;

  const fortune = entity.fortune || 50;
  const roll = rng();
  // 境界越高、气运越好，越容易走到底
  const successChance = clamp(0.28 + level * 0.022 + (fortune - 50) / 260, 0.1, 0.92);

  if (roll < successChance) {
    const gain = site.reward || '感悟';
    entity.exp += (entity.level || 1) * 12 + rng() * 40;
    entity.fortune = clamp(entity.fortune + 4, 0, 100);
    // 有几率带出一本功法
    if (rng() < 0.45 && entity.techniques.length < 3) {
      const manual = pickFrom(rng, MANUALS);
      if (!entity.techniques.some((t) => t.name === manual.name)) {
        entity.techniques.push(manual);
        world.record(`【${entity.name}】自${site.name}带出《${manual.name}》。`, 'site', entity);
      }
    }
    // 遗蜕里那件法宝：走这一条，不是「路过捡到」（见 sim/artifacts.js）。
    // 取不到是正常的——东西可能已经先被人捡走、或者朽掉了，那就只是白跑一趟。
    if (site.artifactId) {
      const got = claimGroundArtifact(world, entity, site.artifactId, rng, 'found');
      if (got) {
        world.record(
          `【${entity.name}】入${site.name}，取走了那件${got.name}。${ownerLine(got).text}`,
          'artifact',
          entity,
        );
      } else {
        world.record(`【${entity.name}】入${site.name}，里面已空无一物。`, 'site', entity);
      }
      site.artifactId = 0;
    }
    world.record(`【${entity.name}】入${site.name}，得${gain}。`, 'site', entity);
    return { ok: true, gain };
  }

  // 失败：受伤或心境受损
  // 死因标记：秘境重伤致死 ⇒ `deathOther`（不是寿终）。
  entity.diedOf = 'site';
  entity.hp -= entity.maxHp * (0.15 + rng() * 0.3);
  entity.mind = clamp(entity.mind - 6, 0, 100);
  entity.heartDemon = clamp(entity.heartDemon + 4, 0, 100);
  world.record(`【${entity.name}】入${site.name}，重伤而出。`, 'site', entity);
  return { ok: false };
}

/** 在一处合适的位置落下一个秘境 */
export function spawnSecretRealm(world, rng, near = null) {
  const spot = findSiteSpot(world, rng, near, 0.35);
  if (!spot) return null;
  const kind = SECRET_REALMS[Math.floor(rng() * SECRET_REALMS.length)];
  const site = world.addSite({
    kind: 'secret',
    sub: kind.key,
    x: spot.x,
    y: spot.y,
    name: kind.name,
    omen: kind.omen,
    reward: kind.reward,
    note: kind.note,
    age: 0,
    visits: 0,
  });
  // 文案刻意不点名，没有单一当事人
  world.record(
    narrate(rng, 'secretRealm', { place: placeLabel(world, spot.x, spot.y), omen: kind.omen, name: '数名修士' }),
    'site',
  );
  return site;
}

/** 落下一座洞府 */
export function spawnCave(world, rng, near = null) {
  const spot = findSiteSpot(world, rng, near, 0.3);
  if (!spot) return null;
  const cave = CAVE_TYPES[Math.floor(rng() * CAVE_TYPES.length)];
  const siteName = CAVE_SITES[Math.floor(rng() * CAVE_SITES.length)];
  const site = world.addSite({
    kind: 'cave',
    x: spot.x,
    y: spot.y,
    name: `${siteName}·${cave.name}`,
    reward: cave.reward,
    element: cave.element,
    age: 0,
    visits: 0,
  });
  // 洞府自行开启，无当事人
  world.record(
    narrate(rng, 'caveOpen', { place: siteName, cave: cave.name, reward: cave.reward }),
    'site',
  );
  return site;
}

/** 落下一处上古阵法 */
export function spawnFormation(world, rng, near = null) {
  const spot = findSiteSpot(world, rng, near, 0.2);
  if (!spot) return null;
  const formation = FORMATIONS[Math.floor(rng() * FORMATIONS.length)];
  const site = world.addSite({
    kind: 'formation',
    x: spot.x,
    y: spot.y,
    name: formation.name,
    note: formation.note,
    age: 0,
    visits: 0,
  });
  // 阵法成形，无当事人
  world.record(
    narrate(rng, 'formation', { place: placeLabel(world, spot.x, spot.y), formation: formation.name, note: formation.note }),
    'site',
  );
  return site;
}

function placeLabel(world, x, y) {
  const i = clamp(Math.floor(y), 0, world.h - 1) * world.w + clamp(Math.floor(x), 0, world.w - 1);
  if (world.height[i] > 0.75) return '山中';
  if (world.veg[i] > 0.6) return '林间';
  if (world.riverBase[i] > 0) return '河畔';
  if (world.water[i] > 0.0015) return '海上';
  return '旷野';
}

/** 找一个可放置地点的位置。minQi 是灵气下限，机缘总落在灵气厚的地方 */
function findSiteSpot(world, rng, near, minQi = 0.3) {
  const cx = near ? near.x : world.w / 2;
  const cy = near ? near.y : world.h / 2;
  const spread = near ? (near.radius || 12) : Math.max(world.w, world.h) * 0.5;
  for (let k = 0; k < 80; k += 1) {
    const x = clamp(Math.floor(cx + (rng() * 2 - 1) * spread), 2, world.w - 3);
    const y = clamp(Math.floor(cy + (rng() * 2 - 1) * spread), 2, world.h - 3);
    const i = y * world.w + x;
    if (world.water[i] > 0.0015) continue;
    if (!world.isWalkable(i)) continue;
    if (world.qi[i] < minQi) continue;
    if (world.sites.some((s) => Math.hypot(s.x - x, s.y - y) < 6)) continue;
    return { x, y };
  }
  return null;
}

/**
 * 地点推进：
 *   1. 让附近的修士进来（秘境/洞府是机缘，阵法是无差别卷入）
 *   2. 地点随年岁淡去
 */
export function stepSites(world, dtDays, rng) {
  const sites = world.sites;
  if (!sites.length) return;

  for (let si = sites.length - 1; si >= 0; si -= 1) {
    const site = sites[si];
    site.age += dtDays;

    // 有人路过就进去。
    // 频率压得比较低：地点多起来之后，哪怕每年 0.35 次也足以让
    // 「入某遗蜕，重伤而出」占掉编年史的一半。
    const yearFrac = dtDays / 360;
    if (rng() < yearFrac * 0.12) {
      const visitor = findVisitor(world, site, rng);
      if (visitor) {
        site.visits += 1;
        if (site.kind === 'formation') {
          resolveFormation(world, visitor, site, rng);
        } else {
          enterSite(world, visitor, site, rng);
        }
        if (site.kind === 'secret' && site.visits >= 2) {
          // 秘境被人探空后自然消失
          // 秘境闭合，无当事人
          world.record(`${site.name} 被人探尽，就此闭合。`, 'site');
          world.removeSite(site);
          continue;
        }
      }
    }

    const lifespan = (SITE_LIFESPAN_YEARS[site.kind] || 200) * 360;
    if (site.age > lifespan) {
      // 地点自行尘封 / 异象散去，无当事人
      if (site.kind === 'cave') world.record(`${site.name} 尘封，再无人至。`, 'site');
      else if (site.kind === 'secret') world.record(`${site.name} 的异象散了。`, 'site');
      world.removeSite(site);
    }
  }
}

/** 阵法是无差别卷入：70% 得机缘，30% 吃亏。来源 ancientFormationSystem.js:164,203 */
function resolveFormation(world, entity, site, rng) {
  if (rng() < 0.7) {
    entity.exp += 30 + rng() * 60;
    entity.fortune = clamp(entity.fortune + 3, 0, 100);
    if (site.name === '聚灵阵') entity.exp += 60;
    world.record(`【${entity.name}】误入${site.name}，反得一场造化。`, 'site', entity);
  } else {
    // 死因标记：误入阵法被伤致死 ⇒ `deathOther`（不是寿终）。
    entity.diedOf = 'site';
    entity.hp -= entity.maxHp * 0.15;
    entity.mind = clamp(entity.mind - 4, 0, 100);
    world.record(`【${entity.name}】被${site.name}所伤，仓皇退出。`, 'site', entity);
  }
}

function findVisitor(world, site, rng) {
  let best = null;
  let bestDist = Infinity;
  const R = 14;
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    if ((e.level || 0) < 3) continue;
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.x - site.x, e.y - site.y);
    if (d < R && d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  if (!best) return null;
  // 距离越近越可能真的进去
  return rng() < 1 - bestDist / R ? best : null;
}

/** 玩家用神力直接往地图上放一处地点 */
export function plantSite(world, rng, kind, x, y) {
  if (kind === 'secret') return spawnSecretRealm(world, rng, { x, y, radius: 3 });
  if (kind === 'cave') return spawnCave(world, rng, { x, y, radius: 3 });
  if (kind === 'formation') return spawnFormation(world, rng, { x, y, radius: 3 });
  return null;
}
