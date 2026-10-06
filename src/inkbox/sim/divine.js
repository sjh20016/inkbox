// 水墨沙盒 · 仙道神力（玩家侧）
//
// 地形那套神力（powers.js）改的是山水；这里改的是**修行**——
// 赐灵根、引灵脉、播秘境、降天劫、传功法、点化飞升、立宗。
//
// 迁移原作的玩法系统时，最要紧的不是把设定抄进来，而是让玩家摸得到它：
// 一套只会在后台自己跑的修仙模拟，和一个能亲手拨动它的沙盒，是两回事。
//
// 每个函数都返回一句「发生了什么」的白话，供 UI 提示用。

import { SPECIES } from '../core/config.js';
import { clamp } from '../core/noise.js';
import { MANUALS, FORBIDDEN_TECHNIQUES, narrate } from '../core/lore.js';
import { ELEMENTS } from '../core/cultivation.js';
import { awaken, attemptBreakthrough, ascend, placeName, addKarma } from './cultivation.js';
import { plantSite } from './sites.js';
import { foundSect, SECT_FOUNDER_MIN_LEVEL, findBuildableNear } from './sects.js';

/** 地图上灵脉的条数上限，防止玩家狂点把灵气层堆爆 */
export const MAX_LEYLINES = 24;

/** 神力一次最多影响几个目标：避免一键把整张图的人都点化飞升 */
const MAX_TARGETS = 6;

function near(world, x, y, radius) {
  const r2 = radius * radius;
  const out = [];
  for (let i = 0; i < world.entities.length; i += 1) {
    const e = world.entities[i];
    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy <= r2) out.push(e);
  }
  return out;
}

const byLevelDesc = (a, b) => (b.level || 0) - (a.level || 0);

/**
 * 赐灵根：让范围内的凡人觉醒。
 * 这是「造一个修士」的总开关——世界的修士本来靠极低的自然觉醒率慢慢冒出来，
 * 玩家想看点热闹，总得有个能立刻见效的手段。
 */
export function grantRoot(world, x, y, radius, rng) {
  const targets = near(world, x, y, radius)
    .filter((e) => (e.level || 0) <= 0 && e.sp === SPECIES.HUMAN && e.hp > 0)
    .slice(0, MAX_TARGETS);
  if (!targets.length) return '范围内没有未觉醒的凡人可点化';
  let n = 0;
  const awakened = [];
  for (const e of targets) {
    if (awaken(e, rng, { world })) {
      world.record(`${e.name} 于${placeName(world, e)}觉醒${e.root.rootName}`, 'awaken', e);
      awakened.push(`${e.name}（${e.root.rootName}）`);
      n += 1;
    }
  }
  if (!n) return `范围内有 ${targets.length} 名凡人，但此次点化未能开启灵根`;
  return `点化 ${n} 人：${awakened.join('、')}。灵根已开`;
}

/** 引灵脉：在山川上点出一道灵脉。灵气厚的地方修炼快，宗门也会来争。 */
export function placeLeyline(world, x, y, rng) {
  if (world.leylines.length >= MAX_LEYLINES) return `灵脉已满（${MAX_LEYLINES} 道）`;
  const i = world.idx(clamp(Math.floor(x), 0, world.w - 1), clamp(Math.floor(y), 0, world.h - 1));
  if (world.water[i] > 0.0015) return '水中聚不住灵脉';
  const strength = 0.34 + world.height[i] * 0.34 + rng() * 0.1;
  const line = world.addLeyline({
    x: Math.floor(x),
    y: Math.floor(y),
    radius: 6 + Math.floor(rng() * 5),
    strength,
    element: ELEMENTS[Math.floor(rng() * ELEMENTS.length)],
  });
  // 玩家对地形动手，无当事人
  world.record(`天降灵脉于${placeLabel(world, line.x, line.y)}，地气自此涌出。`, 'world');
  return `灵脉落于 (${line.x}, ${line.y}) · 强度 ${strength.toFixed(2)}`;
}

/** 播秘境：落一处机缘，修士会自己找上门 */
export function placeSecret(world, x, y, rng) {
  const site = plantSite(world, rng, 'secret', Math.floor(x), Math.floor(y));
  if (!site) return '此处落不下秘境';
  return `秘境「${site.name}」现世`;
}

/** 埋洞府：埋一处前人遗泽，等后人来取 */
export function placeCave(world, x, y, rng) {
  const site = plantSite(world, rng, 'cave', Math.floor(x), Math.floor(y));
  if (!site) return '此处落不下洞府';
  return `洞府「${site.name}」已埋`;
}

/**
 * 降天劫：逼范围内的修士立刻冲一次瓶颈。
 * 成则破境、败则倒退，甚至走火入魔——这是玩家手上最刺激的一根杠杆。
 */
export function sendTribulation(world, x, y, radius, rng) {
  const targets = near(world, x, y, radius)
    .filter((e) => (e.level || 0) >= 1 && e.root)
    .sort(byLevelDesc)
    .slice(0, MAX_TARGETS);
  if (!targets.length) return '此地无修士可劫';
  const before = targets.map((e) => e.level);
  for (const e of targets) attemptBreakthrough(world, e, rng);
  const up = targets.filter((e, i) => e.level > before[i]).length;
  const down = targets.filter((e, i) => e.level < before[i]).length;
  return `天劫落于 ${targets.length} 人：${up} 人破境 · ${down} 人倒退`;
}

/** 传功法：给范围内的修士一部典籍 */
export function grantManual(world, x, y, radius, rng) {
  const targets = near(world, x, y, radius)
    .filter((e) => (e.level || 0) >= 1 && e.techniques.length < 3)
    .sort(byLevelDesc)
    .slice(0, MAX_TARGETS);
  if (!targets.length) return '此地无人可传';
  let n = 0;
  const names = [];
  for (const e of targets) {
    const pool = MANUALS.filter((m) => !e.techniques.some((t) => t.name === m.name));
    if (!pool.length) continue;
    const manual = pool[Math.floor(rng() * pool.length)];
    e.techniques.push(manual);
    names.push(`${e.name}得《${manual.name}》`);
    n += 1;
  }
  if (!n) return '此地修士已各有所承';
  // 多人同受典籍，且文案为合并公告，无单一当事人
  world.record(`天授典籍：${names.join('、')}。`, 'cultivate');
  return `传下 ${n} 部典籍`;
}

/**
 * 点化飞升：把范围内境界最高的人直接送走。
 * 刻意做成「玩家亲手点」而不是自动发生——飞升是这个世界最重的一件事，
 * 交给天意随机掉，不如让玩家自己决定什么时候送谁上去。
 */
export function ascendChosen(world, x, y, radius, rng) {
  const target = near(world, x, y, radius)
    .filter((e) => (e.level || 0) >= 1 && e.root && !e._ascended)
    .sort(byLevelDesc)[0];
  if (!target) return '此地无修士可点化';
  const who = `${target.name}（${placeName(world, target)}）`;
  ascend(world, target, rng);
  target._ascended = true;
  return `${who}白日飞升`;
}

/**
 * 立宗：让附近境界够高的散修就地开山立派。
 * 世界自己每二十年才看一次，玩家想加速就直接点。
 */
export function foundSectAt(world, x, y, radius, rng) {
  // 玩家多半会点在村子上，而村子中心有祠堂、周围是屋舍，isBuildable 一律为假。
  // 所以不能只判落点那一格，得在附近螺旋找一块空地立山门。
  const spot = findBuildableNear(world, Math.floor(x), Math.floor(y), 8);
  if (!spot) return '左近无处可立山门';
  const [tx, ty] = spot;
  const founder = near(world, tx, ty, Math.max(radius, 8))
    .filter((e) => !e.faction && e.root && (e.level || 0) >= SECT_FOUNDER_MIN_LEVEL)
    .sort(byLevelDesc)[0];
  if (!founder) return `方圆之内无筑基以上的散修（需 ${SECT_FOUNDER_MIN_LEVEL} 重）`;
  const sect = foundSect(world, tx, ty, founder, rng);
  if (!sect) return '宗门数量已达上限';
  for (let i = 0; i < world.villages.length; i += 1) {
    const v = world.villages[i];
    if (v.faction) continue;
    if (Math.hypot(v.x - tx, v.y - ty) > 26) continue;
    v.faction = sect.id;
    if (!sect.villages.includes(v.id)) sect.villages.push(v.id);
    for (let m = 0; m < world.entities.length; m += 1) {
      const o = world.entities[m];
      if (o.village === v.id && !o.faction) o.faction = sect.id;
    }
  }
  return `【${sect.name}】开山立派，${founder.name}为开山祖师`;
}

/** 降禁术：把一部禁术塞给范围内境界最高的人，从此为正道所不容 */
export function grantForbidden(world, x, y, radius, rng) {
  const target = near(world, x, y, radius)
    .filter((e) => (e.level || 0) >= 15 && e.hp > 0 && !e.forbidden)
    .sort(byLevelDesc)[0];
  if (!target) return `此地无人受得起禁术（需 15 重以上）`;
  const tech = FORBIDDEN_TECHNIQUES[Math.floor(rng() * FORBIDDEN_TECHNIQUES.length)];
  target.forbidden = tech.name;

  // ── 后果必须与**后台自动路径**逐项一致 ────────────────────────────
  // ⚠️ 2026-09-22 之前，这里**只有** `forbidden` 赋值 + 一行编年史，
  //    而 `worldEvents.js:160-163,170` 的同名事件另有 4 项后果
  //    （污染 / 修为 / 因果 / 25% 引来追杀）。
  //    ⇒ **玩家主动按下的干预，效果严格弱于世界自己随机发生的那一次**，
  //      而这个按钮正是 `PLAYER_GUIDE.md:65` 承诺「你轻拨一次因果，
  //      可能被当事人记三十年」的那个。玩家按下最戏剧性的干预，
  //      只得到一个 toast——这不是「效果偏弱」，是**机械上等于空操作**。
  //    现在两边逐项对齐，数值**不另调**：同样 +12 污染、level×18 修为、
  //    +6 因果、25% 追杀、扣 30% 血。
  // ⚠️ 这里用的 `rng` 是**界面随机流**（`main.js:116` `mulberry32(12345)`），
  //    **不是** `Life.rng` ⇒ 加一次抽签**不违反铁律 1**（不动主随机流）。
  // ⚠️ 代价要说清楚：这会让玩家的按钮**真的能杀人**（追杀扣 30% 血）。
  //    但那正是「轻拨因果有代价」的意思，且与后台路径同源，不是新增机制。
  target.pollution = clamp(target.pollution + 12, 0, 100);
  target.exp += (target.level || 1) * 18;
  addKarma(world, target, 6, `修习${tech.name}`);

  // ⚠️ 编年史文本**必须走与后台路径同一个模板池**（`worldEvents.js:165`）。
  //    原先这里是一句写死的字符串，与池里那条 `'【{name}】修习{technique}，{sign}。…'`
  //    只差一对【】——**不报错、只是所有别的编年史行都带【】而它不带**。
  //    这正是本项目故障类 1/3 的样子：字段存在、函数返回干净、只有读数上静静地不一样。
  //    走 `narrate()` 会多抽一次签，但这里用的是**界面随机流**（见上），不动 `Life.rng`。
  world.record(
    narrate(rng, 'forbidden', { name: target.name, technique: tech.name, sign: tech.sign }),
    'forbidden',
    target,
  );

  // 后果：正道追杀（与 `worldEvents.js:170` 同一个 25%）
  if (rng() < 0.25) {
    const hunter = world.entities.find(
      (o) => o !== target && (o.level || 0) >= (target.level || 0) + 3 && !o.forbidden,
    );
    if (hunter) {
      target.hp -= target.maxHp * 0.3;
      world.record(`${hunter.name} 闻讯追至，与【${target.name}】交手。`, 'forbidden', [hunter, target]);
    }
  }

  return `${target.name}修得禁术「${tech.name}」`;
}

/** 给一个格坐标配个地名，用于叙事 */
function placeLabel(world, x, y) {
  const i = world.idx(clamp(x, 0, world.w - 1), clamp(y, 0, world.h - 1));
  const info = world.infoOf(i);
  return info && info.name ? info.name : '荒野';
}

export { MAX_TARGETS };
