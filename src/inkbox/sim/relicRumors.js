// 水墨沙盒 · 遗物传闻（万象拾趣 V0.1 · P1）
//
// ───────────────────────────────────────────────────────────────────────
// 这一层的全部职责：把一件法宝**自己的履历**（`a.history`：炼成 / 易主 /
// 遗落 / 器灵）与它**此刻的状态**（在手 / 躺在地上 `lostDay` / 朽坏年限）
// 摊成几行**带时间戳**的线索。参考 Dwarf Fortress 的传闻三要素——有来源、
// 有时间、会过时——这里只取其中两条：每行线索都标着「据第几年所记」，
// 所有权后来变了，旧线索不会跟着改口。
//
// 结构性约束（与 `ui/realmInspector.js` 的只读契约同款）：
//   · **零写入**——本模块没有任何 `world.xxx =` 或对 `a` 的赋值；
//   · **零随机**——一次 `rng()` 都不调，同一天同一件法宝摊出同一行字；
//     （P1 线索全部是条件派生，不需要任何抽签。）
//   · **零新持久状态**——一切从 `a.history`（上限 HISTORY_CAP=10）与
//     `a.lostDay / a.x / a.y` 现算，存档里没有新增键。
//
// 身份纪律：履历里只有**名字**，不是稳定 ID（见委托书 §3 的已知陷阱）。
// 所以本模块只摊「物件的历史」，**绝不**派生「旧主的活弟子正在找它」这类
// 关系剧情——名字会重名、人会死，同名匹配造出来的关系是假的关系。
// 「遗落」这一步本身（`artifacts.js` 的 `toGround`）把日期写进履历，
// 是 P1 唯一一处对既有模块的改动。
//
// 消费方：`main.js`（凡间检视的无主之物 / 修士来历）、
// `ui/realmInspector.js`（3D 拾取的法宝卡与遗蜕卡）。三处都是现成的
// 只读展示路径，卡片只在玩家点击时构建，不在任何逐帧路径上。

import { GROUND_DECAY_YEARS, ownerLine } from './artifacts.js';
import { clamp } from '../core/noise.js';

/** 「遗落」在履历里的 kind。与 `artifacts.js` 的 pushHistory 用同一个格子 */
export const LOST_KIND = 'lost';

/** 距朽坏还剩多少比例时开始提示「恐将朽坏」 */
const DECAY_WARNING_FRACTION = 0.7;

function yearOf(day) {
  return Math.floor(day / 360) + 1;
}

/**
 * 地名标签。与 `artifacts.js` 内部的 `spotLabel`、`sites.js` 的 `placeLabel`
 * 是**同一份判据**（高程 > 0.75 山中 / 植被 > 0.6 林间 / 河道 河畔 /
 * 水深 海上 / 其余旷野）。为避免循环 import 各写一份——那边的注释写明了
 * 这是刻意的四行重复，不是疏漏。
 */
function spotLabel(world, x, y) {
  if (!world || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const cx = clamp(Math.floor(x), 0, world.w - 1);
  const cy = clamp(Math.floor(y), 0, world.h - 1);
  const i = cy * world.w + cx;
  if (world.height[i] > 0.75) return '山中';
  if (world.veg[i] > 0.6) return '林间';
  if (world.riverBase[i] > 0) return '河畔';
  if (world.water[i] > 0.0015) return '海上';
  return '旷野';
}

/** 履历里全部「遗落」条目（`[day, 'lost', null]`）。履历不存在时为空。 */
export function lostEntries(a) {
  const hist = (a && Array.isArray(a.history)) ? a.history : [];
  return hist.filter((entry) => entry && entry[1] === LOST_KIND);
}

/** 这件法宝此刻是否无主躺在地上 */
export function isGrounded(a) {
  return Boolean(a) && Number.isFinite(a.lostDay) && a.lostDay >= 0;
}

/** 在地上躺了多少游戏年（未满一年为 0）。在手法宝恒 0。 */
export function groundAgeYears(world, a) {
  if (!isGrounded(a) || !world) return 0;
  return Math.max(0, Math.floor((world.day - a.lostDay) / 360));
}

/**
 * 一行紧凑的遗物线索（无话可说时为空串）。
 *
 *   · 躺在地上 ⇒「第X年遗落于林间，至今已躺 3 年；年岁已久，恐将朽坏」
 *   · 在手但曾失落 ⇒「据第X年所记，此物曾一度失落人间，后为人所得」
 *
 * ⚠️ 第二句**刻意不提**当年失落在哪里：履历里只记了日期没记地点，
 *    而它此刻的坐标是持宝人的位置——把现坐标说成当年失落处就是编造。
 */
export function artifactClueLine(world, a) {
  if (!a) return '';
  if (isGrounded(a)) {
    const years = groundAgeYears(world, a);
    const place = spotLabel(world, a.x, a.y);
    const decay = GROUND_DECAY_YEARS * 360;
    const old = (world.day - a.lostDay) >= decay * DECAY_WARNING_FRACTION;
    return `第${yearOf(a.lostDay)}年遗落于${place || '荒野'}`
      + `，至今已躺${years > 0 ? ` ${years} 年` : '不足一年'}${old ? '；年岁已久，恐将朽坏' : ''}`;
  }
  const lost = lostEntries(a);
  if (!lost.length) return '';
  const last = lost[lost.length - 1];
  return `据第${yearOf(last[0])}年所记，此物曾一度失落人间，后为人所得`;
}

/**
 * 3D 法宝卡的完整线索行集。来历在前，遗落与现状随后——
 * 都是 `[标签, 一句话]`，由检视面板原样渲染。
 */
export function artifactClueRows(world, a) {
  if (!a) return [];
  const rows = [];
  const line = ownerLine(a).text;
  if (line) rows.push(['来历', line]);
  if (isGrounded(a) && world) {
    const place = spotLabel(world, a.x, a.y);
    rows.push(['遗落', `第${yearOf(a.lostDay)}年遗落于${place || '荒野'}（${Math.floor(a.x)}，${Math.floor(a.y)}）`]);
    const years = groundAgeYears(world, a);
    const decay = GROUND_DECAY_YEARS * 360;
    const old = (world.day - a.lostDay) >= decay * DECAY_WARNING_FRACTION;
    rows.push(['现状', `已无主${years > 0 ? ` ${years} 年` : '不足一年'}`
      + `${old ? '；年岁已久，恐将朽坏' : ''}`]);
    return rows;
  }
  const lost = lostEntries(a);
  if (lost.length) {
    const last = lost[lost.length - 1];
    rows.push(['旧闻', `据第${yearOf(last[0])}年所记，此物曾一度失落人间，后为人所得`]);
  }
  return rows;
}
