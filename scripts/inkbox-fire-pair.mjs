#!/usr/bin/env node
// 水墨沙盒 · B2-5 火灾生态配对实验（对照 A / 对照 B）
//
// ───────────────────────────────────────────────────────────────────────
// 这个脚本做什么
// ───────────────────────────────────────────────────────────────────────
//
// 委托书 §B2-5 要求**两种对照**，本脚本一次跑完：
//
//   对照 A（纯观察对照）
//     同一个真实着火的世界，采集器开 / 关 ⇒ World、存档、RNG 必须等价。
//     兑现方式：同一 seed 跑到同一日、施加同一次雷击，然后
//       · A1：关采集（`collect=false`）继续推进；
//       · A2：开采集（fireProbe 每快照一次）继续推进。
//     两组末态 digest 必须逐字节相同。差别只在「有没有留下读数」。
//
//   对照 B（真实干预对照）
//     同 seed、同一起点、同一落点：
//       · B-control：自然状态跑到底（不点火）；
//       · B-treatment：第 strikeDay 日施加**正式**雷击（powers.js 的
//         `lightning()`，即产品 pointerdown → applyTool 的同一条路）。
//     两组从干预时刻起允许分叉（RNG 消耗、伤亡、生态）——这正是要研究的
//     真实因果，**不是纯度失败**。
//
//   Host-Replay（宿主真实时间回放）
//     火灾的恢复层（焦土 → 灰烬 → 褪去）只在 main.js 的宿主时钟里跑。
//     `--hostSeconds=<n>` 会在干预后的每个采样点补跑 n 秒宿主时间，
//     把「只推进游戏日」与「推进游戏日 + 宿主时间」分开报告。
//
// ───────────────────────────────────────────────────────────────────────
// 纪律
// ───────────────────────────────────────────────────────────────────────
//
//   · 世界推进只有 `advanceWorld()` 一个入口（本脚本不抄任何时钟列表）。
//   · 落点选取不抽 RNG（`fire-probe.pickStrikePoint`，纯函数）。
//   · 干预只走正式能力（`fire-probe.strike` → `powers.lightning`）。
//   · 死亡归因走三层链（`fire-probe.attributeStrike`），不许一把抓。
//   · `Math.random()` 全文没有。
//   · 产物：`reports/inkbox/experiments/<experiment>/fire.csv` + `summary.json`
//     + `attribution.json`（对照 B 的归因链）。
//   · **逐 seed 断点落盘**（B1-5 教训：长跑不许只在末尾写产物）。每个 seed
//     跑完立刻写 `partial/seed-<seed>.json`（先 .tmp 再 rename，原子替换）。
//     最终产物只在全部 seed 的 partial 齐备后才写 ⇒ **多个进程各跑一个 seed
//     并行也安全**，中断后重跑自动跳过已完成的 seed。`--finalizeOnly=true`
//     只做聚合（要求所有 partial 已在）。

import fs from 'node:fs';
import path from 'node:path';
import { advanceWorld } from '../src/inkbox/sim/advance.js';
import { createLabWorld } from './experiment/world-factory.mjs';
import { worldFingerprint } from './experiment/digest.mjs';
import { writeText, writeJson, toCsv } from './experiment/report.mjs';
import {
  FIRE_COLUMNS, pickStrikePoint, strikeRect, fireProbe, strike,
  attributeStrike, hostReplay, countingRng,
} from './experiment/fire-probe.mjs';

const DAYS_PER_YEAR = 360;

function parseArgv(argv) {
  const values = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq === -1) continue;
    values[token.slice(2, eq)] = token.slice(eq + 1);
  }
  return values;
}

const args = parseArgv(process.argv.slice(2));
const seeds = String(args.seeds || '20260914,7,424242').split(',').map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n >= 0);
const strikeYear = Number(args.strikeYear || 30);
const afterYears = Number(args.afterYears || 70);
// 宿主真实时间回放只覆盖**灾后前 hostYears 年**（每年一次，每次 hostSeconds 秒）。
// ⚠️ 为什么不是「每个采样点都回放」：覆盖层恢复层在玩家时间尺度上是**分钟级**
//    （焦土 → 灰烬 → 褪去，实测 60 宿主秒内大部分转完）。灾后十年还要年年等
//    宿主时钟，纯属把墙钟浪费在早已恢复完的地形上。hostYears=0 = 完全不回放
//    （那就是「只推进游戏日」的对照组，用于证明跳过恢复层会得到错误结论）。
const hostYears = args.hostYears === undefined ? 10 : Number(args.hostYears);
const hostSeconds = args.hostSeconds === undefined ? 60 : Number(args.hostSeconds);
const outputRoot = args.outputRoot || 'reports/inkbox/experiments';
const experiment = args.experiment || `b2-fire-pair-y${strikeYear}+${afterYears}`;
const preset = args.preset || 'medium';
const quiet = args.quiet === 'true';
// 断点续跑：默认开。已完成的 seed 直接读 `partial/seed-<seed>.json`；
// `--finalizeOnly=true` 只做聚合（要求所有 seed 的 partial 都在）。
const finalizeOnly = args.finalizeOnly === 'true';
const resume = args.resume !== 'false';

const strikeDay = strikeYear * DAYS_PER_YEAR;
const totalDay = strikeDay + afterYears * DAYS_PER_YEAR;

function log(line) {
  if (!quiet) process.stdout.write(`${line}\n`);
}

/**
 * 建一条世界线并推进到 `targetDay`。
 *
 * ⚠️ `rng` 一律用 `countingRng(lab.ecoRng)` 外包——**不改变取值与顺序**，
 *    只是多一个「这条线吃了多少随机数」的读数。Host-Replay 会按覆盖层格子
 *    数抽签，这个读数正是「宿主时间也吃随机数」的直接证据。
 */
function advanceTo(lab, targetDay, onSample) {
  const rng = countingRng(lab.ecoRng);
  while (lab.world.day < targetDay) {
    const chunk = Math.min(3, targetDay - lab.world.day);
    advanceWorld(lab.world, chunk, {
      life: lab.life, upperLife: lab.upperLife, rng,
      state: lab.advanceState, riftActive: false,
    });
    if (onSample) onSample(rng);
  }
  return rng;
}

/** 一组（control 或 treatment）的完整运行。 */
function runGroup(seed, group, { doStrike }) {
  const startedAt = Date.now();
  const lab = createLabWorld({
    seed, preset, profile: 'natural',
    generationVersion: 2, terrainPreset: 'standard',
  });
  const rows = [];
  const ctxBase = { group, seed };

  // ── 第一段：推进到雷击日（两组逐字节相同）────────────────────
  const rngPre = advanceTo(lab, strikeDay, null);
  const point = pickStrikePoint(lab.world);
  const rect = strikeRect(point);
  rows.push(fireProbe(lab.world, { ...ctxBase, phase: 'pre-strike', rect, ecoDraws: rngPre.draws }));

  // ── 干预 ────────────────────────────────────────────────────
  let strikeInfo = null;
  if (doStrike) {
    if (!point) throw new Error(`seed ${seed}：找不到可点火的落点（全图无足够植被的陆格）`);
    strikeInfo = strike(lab.world, point);
    log(`  [${group}] seed ${seed} 雷击于 (${point.x},${point.y}) veg=${point.veg.toFixed(3)} `
      + `半径8内生灵=${point.nearby} 标记死亡=${strikeInfo.markedDead}`);
    log(`   世界自述：「${strikeInfo.text}」`);
  }
  rows.push(fireProbe(lab.world, { ...ctxBase, phase: doStrike ? 'strike' : 'no-strike', rect, ecoDraws: rngPre.draws }));

  // ── 第二段：灾后推进（按年采样）─────────────────────────────
  const sampleYear = 1;
  let lastHost = null;
  const rngPost = rngPre;   // 同一个计数外包继续累计
  let yearAfterStrike = 0;
  while (lab.world.day < totalDay) {
    const target = Math.min(totalDay, lab.world.day + sampleYear * DAYS_PER_YEAR);
    advanceTo(lab, target, null);
    yearAfterStrike += 1;
    if (hostYears > 0 && yearAfterStrike <= hostYears) {
      // Host-Replay：宿主真实时间。⚠️ 必须与 advanceWorld 共用同一个 rng 实例，
      //   否则复刻出的宿主时间和真正跑过的不是一条线。
      lastHost = hostReplay(lab.world, rngPost, hostSeconds);
    }
    rows.push(fireProbe(lab.world, {
      ...ctxBase, phase: 'after', rect,
      ecoDraws: rngPost.draws,
    }));
  }

  const fingerprint = worldFingerprint(lab.world);
  return {
    seed, group, rows, fingerprint, strikeInfo, point,
    elapsedMs: Date.now() - startedAt,
    finalDay: lab.world.day,
    ecoDraws: rngPost.draws(),
    hostReplay: lastHost,
  };
}

// ── 主流程 ────────────────────────────────────────────────────────
const outDir = path.join(outputRoot, experiment);
fs.mkdirSync(outDir, { recursive: true });

const allRows = [];
const attribution = [];
const digests = {};

// ── 逐 seed 断点（B1-5 教训：长跑不许只在末尾落盘）────────────────
// 每个 seed 的四条线（B-control / B-treatment / A-nocollect / A-collect）
// 一跑完就立刻写成 `partial/seed-<seed>.json`（先写 .tmp 再 rename，
// ⇒ 磁盘上任何时刻的 partial 都是完整的，杀进程也不会留下半个文件）。
// 最终产物只在**全部** seed 的 partial 齐备后才写：多进程各跑一个 seed
// 并行时不会互相写坏对方的 fire.csv，中断后重跑自动跳过已完成 seed。
const partialDir = path.join(outDir, 'partial');
fs.mkdirSync(partialDir, { recursive: true });
// ⚠️ `seeds` **不进** configKey：partial 是 per-seed 的，与「这一进程被请求跑
//    哪些 seed」无关。否则单 seed 进程写出的 partial 永远无法被多 seed 的
//    finalize 认领（并行断点直接失效）。
const configKey = JSON.stringify({
  experiment, strikeYear, afterYears, hostYears, hostSeconds, preset,
  generationVersion: 2, terrainPreset: 'standard',
  columns: FIRE_COLUMNS.length,
});
const partialPath = (seed) => path.join(partialDir, `seed-${seed}.json`);
function loadPartial(seed) {
  try {
    const data = JSON.parse(fs.readFileSync(partialPath(seed), 'utf8'));
    return data && data.configKey === configKey && data.seed === seed ? data : null;
  } catch {
    return null;
  }
}
function savePartial(seed, payload) {
  const tmp = `${partialPath(seed)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ configKey, seed, ...payload }, null, 2));
  fs.renameSync(tmp, partialPath(seed));
}

for (const seed of seeds) {
  log(`[seed ${seed}] 对照 A（采集开/关等价）+ 对照 B（自然 vs 正式雷击 @y${strikeYear}）`);

  const cached = resume ? loadPartial(seed) : null;
  if (cached) {
    log(`  ↳ 断点命中：沿用已有 partial，跳过计算`);
    allRows.push(...cached.control.rows, ...cached.treatment.rows);
    Object.assign(digests, cached.digests);
    attribution.push(cached.attribution);
    continue;
  }
  if (finalizeOnly) {
    throw new Error(`--finalizeOnly=true 但 seed ${seed} 没有可用 partial（从未跑过，或配置与本行参数不匹配）`);
  }

  // ── 对照 B：control / treatment ─────────────────────────────
  let t0 = Date.now();
  const control = runGroup(seed, 'B-control', { doStrike: false });
  log(`  [B-control] seed ${seed} ✓ ${((Date.now() - t0) / 1000).toFixed(1)}s · digest ${control.fingerprint.digest}`);
  t0 = Date.now();
  const treatment = runGroup(seed, 'B-treatment', { doStrike: true });
  log(`  [B-treatment] seed ${seed} ✓ ${((Date.now() - t0) / 1000).toFixed(1)}s · digest ${treatment.fingerprint.digest}`);
  allRows.push(...control.rows, ...treatment.rows);

  // 归因链：末态人口差 + 直接标记死亡
  const lastControl = control.rows[control.rows.length - 1];
  const lastTreat = treatment.rows[treatment.rows.length - 1];
  const attrItem = {
    seed,
    strikeDay,
    strikePoint: treatment.point,
    ecoDrawsControl: control.ecoDraws,
    ecoDrawsTreatment: treatment.ecoDraws,
    ...attributeStrike(treatment.strikeInfo, lastControl, lastTreat),
  };
  attribution.push(attrItem);

  // ── 对照 A：同世界、采集开/关 ⇒ digest 必须相同 ─────────────
  // 做法：再跑两条到 strikeDay、施加同一次雷击，然后一条继续推进但**不采集**
  //   （连 fireProbe 都不调），另一条照常采集。末态 digest 逐字节相同 ⇒ 纯度。
  const seedDigests = {
    [`${seed}/B-control`]: control.fingerprint,
    [`${seed}/B-treatment`]: treatment.fingerprint,
  };
  const a1 = createLabWorld({
    seed, preset, profile: 'natural', generationVersion: 2, terrainPreset: 'standard',
  });
  const a2 = createLabWorld({
    seed, preset, profile: 'natural', generationVersion: 2, terrainPreset: 'standard',
  });
  t0 = Date.now();
  for (const [i, lab] of [a1, a2].entries()) {
    const rng = countingRng(lab.ecoRng);
    advanceTo(lab, strikeDay, null);
    const pt = pickStrikePoint(lab.world);
    if (pt) strike(lab.world, pt);
    // 采集组照常采样；对照组这一步什么都不做（纯推进）
    let yearAfter = 0;
    while (lab.world.day < totalDay) {
      const target = Math.min(totalDay, lab.world.day + 360);
      advanceTo(lab, target, null);
      yearAfter += 1;
      if (hostYears > 0 && yearAfter <= hostYears) hostReplay(lab.world, rng, hostSeconds);
      if (i === 1) {
        fireProbe(lab.world, {
          group: 'A-collect', seed, phase: 'after',
          rect: pt ? strikeRect(pt) : { x0: 0, y0: 0, x1: 0, y1: 0 },
          ecoDraws: rng.draws,
        });
      }
    }
    seedDigests[`${seed}/A-${i === 0 ? 'nocollect' : 'collect'}`] = worldFingerprint(lab.world);
  }
  const dgNo = seedDigests[`${seed}/A-nocollect`].digest;
  const dgYes = seedDigests[`${seed}/A-collect`].digest;
  log(`  [A 对照] seed ${seed} ✓ ${((Date.now() - t0) / 1000).toFixed(1)}s · `
    + `nocollect=${dgNo} collect=${dgYes} ${dgNo === dgYes ? '✓ 等价' : '✗ 不等价'}`);
  Object.assign(digests, seedDigests);

  savePartial(seed, {
    control: {
      rows: control.rows, fingerprint: control.fingerprint,
      ecoDraws: control.ecoDraws, elapsedMs: control.elapsedMs, finalDay: control.finalDay,
    },
    treatment: {
      rows: treatment.rows, fingerprint: treatment.fingerprint,
      ecoDraws: treatment.ecoDraws, elapsedMs: treatment.elapsedMs, finalDay: treatment.finalDay,
      strikeInfo: treatment.strikeInfo, point: treatment.point,
    },
    digests: seedDigests,
    attribution: attrItem,
  });
  log(`  ↳ partial 已落盘：partial/seed-${seed}.json`);
}

// ── 产物（仅当全部 seed 的 partial 齐备时才写，保证「不拿部分数据充完整」）──
const missing = seeds.filter((s) => !loadPartial(s));
// 单 seed 进程**不写**最终产物：并行时每个进程只被请求一个 seed，写出去的就是
// 只含自己那一份的残品，会把兄弟进程的成果覆盖掉。要它写必须显式
// `--writeFinal=true`（确认没有兄弟进程在跑时用）。
const mayWriteFinal = finalizeOnly || seeds.length > 1 || args.writeFinal === 'true';
if (missing.length > 0) {
  console.log(`\n⏳ 未写最终产物：还缺 seed ${missing.join(', ')} 的 partial。`);
  console.log(`   等其余进程跑完后，用同一组参数执行：`);
  console.log(`   node scripts/inkbox-fire-pair.mjs --experiment=${experiment} --seeds=${seeds.join(',')}`
    + ` --strikeYear=${strikeYear} --afterYears=${afterYears} --hostYears=${hostYears}`
    + ` --hostSeconds=${hostSeconds} --finalizeOnly=true`);
} else if (!mayWriteFinal) {
  console.log(`\n⏳ 单 seed 运行：只写 partial，不写最终产物（防止并行时互相覆盖）。`);
  console.log(`   确认没有其它进程在跑同一个实验后，显式收尾：`);
  console.log(`   node scripts/inkbox-fire-pair.mjs --experiment=${experiment} --seeds=${seeds.join(',')}`
    + ` --strikeYear=${strikeYear} --afterYears=${afterYears} --hostYears=${hostYears}`
    + ` --hostSeconds=${hostSeconds} --writeFinal=true`);
} else {
  writeText(path.join(outDir, 'fire.csv'), toCsv(FIRE_COLUMNS, allRows));
  writeJson(path.join(outDir, 'attribution.json'), {
    note: '对照 B 的三层归因链。directMarked = 雷击直接标记 hp=0 的人数；'
      + 'populationDelta = 干预组 − 对照组末态人口（含火灾次级效应的上界，'
      + '**不是**灾害直接死亡数）。',
    hostSeconds,
    hostYears,
    strikeYear,
    afterYears,
    items: attribution,
  });
  writeJson(path.join(outDir, 'summary.json'), {
    experiment,
    seeds,
    strikeYear,
    afterYears,
    hostSeconds,
    hostYears,
    preset,
    generationVersion: 2,
    terrainPreset: 'standard',
    rows: allRows.length,
    digests,
    // 对照 A 的机器可判判据
    purityA: seeds.every((s) => {
      const a = digests[`${s}/A-nocollect`];
      const b = digests[`${s}/A-collect`];
      return a && b && a.digest === b.digest && a.bytes === b.bytes;
    }),
  });

  console.log(`\n完成：${seeds.length} seed · 对照 A purity=${seeds.every((s) => {
    const a = digests[`${s}/A-nocollect`];
    const b = digests[`${s}/A-collect`];
    return a && b && a.digest === b.digest;
  }) ? '✓ 等价' : '✗ 不等价'}`);
  console.log(`输出目录：${outDir}`);
}
