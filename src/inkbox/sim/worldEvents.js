// 水墨沙盒 · 世界级事件
//
// 这些是「世界自己会发生的大事」：仙使下凡赐传承、丹道大会、秘境出世、
// 禁术流传、灵兽认主，以及灾年。它们不需要玩家参与，但会让世界有节奏感。
//
// 来源：
//   upperRealmSystem.js      仙使降临，每 150-250 年，5 类仙使
//   alchemyContestSystem.js  丹道大会，30-50 年，5 异象
//   secretRealmSystem.js     秘境出世，80-150 年
//   immortalCaveSystem.js    洞府出世，60-120 年
//   ancientFormationSystem.js 古阵现世，100 年冷却
//   forbiddenTechniqueSystem.js 禁术，≥15 级，1% 概率
//   spiritBeastSystem.js     灵兽认主，30 年冷却，4% 概率
//   worldCrisisSystem.js     世界危机，第 45 年起年概率 0.5，最多 2 个并存

import {
  MANUALS, SPIRIT_BEASTS, FORBIDDEN_TECHNIQUES, CRISES,
  SECRET_REALMS, FORMATIONS, narrate, pickFrom,
} from '../core/lore.js';
import { clamp } from '../core/noise.js';
import { spawnSecretRealm, spawnCave, spawnFormation } from './sites.js';
import { addKarma } from './cultivation.js';
import { placeOf } from './sects.js';

/** 仙使的类别。来源 upperRealmSystem.js:99-135 */
const IMMORTAL_ENVOYS = Object.freeze([
  { key: 'sword', name: '剑仙', manual: '太虚剑诀' },
  { key: 'alchemy', name: '丹仙', manual: '万象丹经' },
  { key: 'formation', name: '阵仙', manual: '阵法全书' },
  { key: 'talisman', name: '符仙', manual: '破界符法' },
  { key: 'loose', name: '散仙', manual: '五行遁术' },
]);

/** 丹道大会的五种异象。来源 alchemyContestSystem.js:4-10 */
const ALCHEMY_OMENS = Object.freeze(['丹劫', '丹香', '丹灵', '丹霞', '丹鸣']);

export class WorldEvents {
  constructor(world, rng) {
    this.world = world;
    this.rng = rng;
    this.reset();
  }

  reset() {
    const rng = this.rng;
    this.envoyIn = 150 * 360 + rng() * 100 * 360;
    this.alchemyIn = 30 * 360 + rng() * 20 * 360;
    this.secretIn = 80 * 360 + rng() * 70 * 360;
    this.caveIn = 60 * 360 + rng() * 60 * 360;
    this.formationIn = 100 * 360;
    this.crisisIn = 45 * 360;
    this.activeCrises = [];
  }

  step(dtDays) {
    const world = this.world;
    const rng = this.rng;

    this.envoyIn -= dtDays;
    this.alchemyIn -= dtDays;
    this.secretIn -= dtDays;
    this.caveIn -= dtDays;
    this.formationIn -= dtDays;
    this.crisisIn -= dtDays;

    if (this.envoyIn <= 0) {
      this.envoyIn = 150 * 360 + rng() * 100 * 360;
      this.sendEnvoy();
    }
    if (this.alchemyIn <= 0) {
      this.alchemyIn = 30 * 360 + rng() * 20 * 360;
      this.holdAlchemyContest();
    }
    if (this.secretIn <= 0) {
      this.secretIn = 80 * 360 + rng() * 70 * 360;
      spawnSecretRealm(world, rng);
    }
    if (this.caveIn <= 0) {
      this.caveIn = 60 * 360 + rng() * 60 * 360;
      spawnCave(world, rng);
    }
    if (this.formationIn <= 0) {
      this.formationIn = 100 * 360;
      if (rng() < 0.6) spawnFormation(world, rng);
    }
    if (this.crisisIn <= 0) {
      this.crisisIn = 360;
      this.maybeStartCrisis();
    }

    this.stepForbidden();
    this.stepSpiritBeasts(dtDays);
    this.stepCrises(dtDays);
  }

  // ── 仙使下凡 ────────────────────────────────────────────
  sendEnvoy() {
    const world = this.world;
    const rng = this.rng;
    const candidates = world.entities.filter((e) => (e.level || 0) >= 15 && e.hp > 0);
    if (!candidates.length) return;
    const chosen = candidates[Math.floor(rng() * candidates.length)];
    const envoy = IMMORTAL_ENVOYS[Math.floor(rng() * IMMORTAL_ENVOYS.length)];

    chosen.exp += (chosen.level || 1) * 40;
    chosen.fortune = clamp(chosen.fortune + 12, 0, 100);
    chosen.pollution = clamp(chosen.pollution - 15, 0, 100);
    chosen.upperRealmLegacy = envoy.name;
    if (chosen.techniques.length < 3) {
      const manual = MANUALS.find((m) => m.name === envoy.manual);
      if (manual && !chosen.techniques.some((t) => t.name === manual.name)) {
        chosen.techniques.push(manual);
      }
    }
    world.record(
      `${envoy.name}自天外而下，于${placeOf(world, chosen.x, chosen.y)}寻见【${chosen.name}】，赐下传承。`,
      'envoy',
      chosen,
    );
  }

  // ── 丹道大会 ────────────────────────────────────────────
  holdAlchemyContest() {
    const world = this.world;
    const rng = this.rng;
    const omen = ALCHEMY_OMENS[Math.floor(rng() * ALCHEMY_OMENS.length)];
    const entrants = world.entities.filter((e) => (e.level || 0) >= 8 && e.hp > 0);
    if (!entrants.length) return;

    let winner = entrants[0];
    for (let i = 1; i < entrants.length; i += 1) {
      // 丹修与高境界者占优
      const scoreOf = (e) => (e.level || 0) + (e.dao && e.dao.path.key === 'alchemy' ? 12 : 0) + rng() * 14;
      if (scoreOf(entrants[i]) > scoreOf(winner)) winner = entrants[i];
    }
    winner.exp += (winner.level || 1) * 25;
    winner.fortune = clamp(winner.fortune + 6, 0, 100);
    const sect = winner.faction ? world.factionById(winner.faction) : null;
    if (sect) sect.reputation = clamp(sect.reputation + 10, 0, 100);
    world.record(
      `丹道大会现「${omen}」，【${winner.name}】${sect ? `代表${sect.name}` : ''}夺魁，得号丹道魁首。`,
      'contest',
      winner,
    );
  }

  // ── 禁术 ────────────────────────────────────────────────
  stepForbidden() {
    const world = this.world;
    const rng = this.rng;
    const dtYears = 1;
    const eligible = world.entities.filter((e) => (e.level || 0) >= 15 && e.hp > 0 && !e.forbidden);
    if (!eligible.length) return;
    // 原作是每 tick 1%，这里折算成「每年每人约 1%」
    const chance = 0.01 * dtYears;
    for (let i = 0; i < eligible.length; i += 1) {
      if (rng() >= chance) continue;
      const e = eligible[i];
      const technique = FORBIDDEN_TECHNIQUES[Math.floor(rng() * FORBIDDEN_TECHNIQUES.length)];
      e.forbidden = technique.name;
      e.pollution = clamp(e.pollution + 12, 0, 100);
      e.exp += (e.level || 1) * 18;
      addKarma(world, e, 6, `修习${technique.name}`);
      world.record(
        narrate(rng, 'forbidden', { name: e.name, technique: technique.name, sign: technique.sign }),
        'forbidden',
        e,
      );
      // 后果：正道追杀
      if (rng() < 0.25) {
        const hunter = world.entities.find((o) => o !== e && (o.level || 0) >= (e.level || 0) + 3 && !o.forbidden);
        if (hunter) {
          e.hp -= e.maxHp * 0.3;
          world.record(`${hunter.name} 闻讯追至，与【${e.name}】交手。`, 'forbidden', [hunter, e]);
        }
      }
      break;
    }
  }

  // ── 灵兽认主 ────────────────────────────────────────────
  stepSpiritBeasts(dtDays) {
    const world = this.world;
    const rng = this.rng;
    const yearFrac = dtDays / 360;
    const eligible = world.entities.filter((e) => (e.level || 0) >= 10 && !e.beast && e.hp > 0);
    if (!eligible.length) return;
    // 每人每年约 4%，30 年冷却
    for (let i = 0; i < eligible.length; i += 1) {
      const e = eligible[i];
      if (world.day - (e.lastBeastDay || -1e9) < 30 * 360) continue;
      if (rng() >= 0.04 * yearFrac) continue;
      e.lastBeastDay = world.day;
      const beast = SPIRIT_BEASTS[Math.floor(rng() * SPIRIT_BEASTS.length)];
      e.beast = beast.name;
      e.fortune = clamp(e.fortune + 5, 0, 100);
      e.exp += 30;
      world.record(
        narrate(rng, 'spiritBeast', { name: e.name, place: placeOf(world, e.x, e.y), beast: beast.name }),
        'beast',
        e,
      );
      break;
    }
  }

  // ── 世界危机 ────────────────────────────────────────────
  maybeStartCrisis() {
    const world = this.world;
    const rng = this.rng;
    if (world.day < 45 * 360) return;
    if (this.activeCrises.length >= 2) return;
    if (rng() >= 0.5) return;
    if (!world.villages.length) return;

    const village = world.villages[Math.floor(rng() * world.villages.length)];
    const crisis = CRISES[Math.floor(rng() * CRISES.length)];
    const entry = {
      key: crisis.key,
      name: crisis.name,
      note: crisis.note,
      villageId: village.id,
      x: village.x,
      y: village.y,
      startedDay: world.day,
      durationDays: 360 * (2 + rng() * 4),
      resolved: false,
      byPlayer: false,
    };
    this.activeCrises.push(entry);
    // 村落级天灾，无单一当事人
    world.record(
      narrate(rng, 'crisis', { place: village.name, disaster: crisis.name, note: crisis.note }),
      'crisis',
    );
  }

  stepCrises(dtDays) {
    const world = this.world;
    const rng = this.rng;
    for (let i = this.activeCrises.length - 1; i >= 0; i -= 1) {
      const c = this.activeCrises[i];
      const village = world.villageById(c.villageId);
      if (!village) {
        this.activeCrises.splice(i, 1);
        continue;
      }
      // 灾中：村子受损
      village.hp -= dtDays * 0.05;
      village.food = Math.max(0, village.food - dtDays * 0.02);

      if (world.day - c.startedDay > c.durationDays) {
        const survived = village.hp > 30;
        const ending = survived
          ? `${village.name} 熬过了${c.name}。城中人少了一半，但还活着。`
          : `${village.name} 没能撑过${c.name}，人散了。`;
        // 世界自发的灾年走 chronicle 就够——它每 2~5 年就出一场，全塞进
        // 大事账本会把真正的世界大事挤出 600 条滚动窗口（这个坑在突破那边
        // 已经踩过一次：60 年 572 条、548 条是突破）。但**玩家亲手降下的灾**
        // 必须进大事记：结局就是他那一手的代价，看不到结局等于没有反馈。
        if (c.byPlayer) world.milestone(ending, 'crisis');
        else world.record(ending, 'crisis');
        if (!survived) village.hp = 0;
        this.activeCrises.splice(i, 1);
      }
    }
    void rng;
  }

  /**
   * 玩家用神力召来一场灾（「降灾」工具）。
   *
   * ⚠️ 这条路径原本**全库无调用方**——工具面板上没有入口，玩家根本没有
   *    降灾的手段，20 行代码一直是死的。D2 Batch 2 把它接到 `ui/tools.js`。
   *
   * `roll` 由调用方给：`powers.js` 传一个**由落点算出的确定性**值，于是
   * 这个动作**一次 rng 都不抽**。这不是洁癖——`this.rng` 与 `Life.rng`
   * 是同一条流（`life.js` 构造时把它交给 `WorldEvents`），玩家点一下鼠标
   * 就把整个世界线往后挪，等于把既有长测的标定全部作废（铁律 1）。
   * 不传 `roll` 时退回抽签，留给测试与将来的世界自发路径。
   *
   * ⚠️ 并存上限与 `maybeStartCrisis` 同为 2：玩家可以连点，但世界同时承受的
   *    经年灾祸不会无限堆叠（每条每 tick 都在扣村子的 hp / 粮）。
   * 返回 entry（带 `text`），超上限时返回 null。
   */
  triggerCrisis(x, y, roll = null) {
    const world = this.world;
    const rng = this.rng;
    if (this.activeCrises.length >= 2) return null;
    const c = roll ? roll.crisis : rng();
    const d = roll ? roll.duration : rng();
    const crisis = CRISES[Math.min(CRISES.length - 1, Math.floor(c * CRISES.length))];
    const village = world.villages.find((v) => Math.hypot(v.x - x, v.y - y) < 16) || null;
    const entry = {
      key: crisis.key,
      name: crisis.name,
      note: crisis.note,
      villageId: village ? village.id : 0,
      x,
      y,
      startedDay: world.day,
      durationDays: 360 * (2 + d * 3),
      resolved: false,
      byPlayer: true,
    };
    this.activeCrises.push(entry);
    const text = village
      ? `${village.name}起${crisis.name}——${crisis.note}。这场灾要熬 ${Math.round(entry.durationDays / 360)} 年。`
      : `${placeOf(world, x, y)}起${crisis.name}——${crisis.note}。此地并无聚落，灾祸空悬。`;
    entry.text = text;
    // 玩家亲手降下的灾：进大事记，与 `powers.js` 的即时天灾同一本账。
    world.milestone(text, 'crisis');
    return entry;
  }
}

export { SECRET_REALMS, FORMATIONS, IMMORTAL_ENVOYS };
