// World Laboratory · 诊断（委托书 §12）
//
// ───────────────────────────────────────────────────────────────────────
// 最重要的一句话：**这些不是 correctness assertion**
// ───────────────────────────────────────────────────────────────────────
//
// 委托书 §12 的原文：
//
//   > B0 的 diagnostics 只负责发现值得人工阅读的异常。
//   > 全部应属于：`warning / observation`，而非：`test failed`。
//
// 这条界线必须划得很硬，理由是**本项目已经吃过的亏**：
// 一条会无理由变红的断言，和一条永远绿的断言一样有害——它训练人去忽略它。
// 一个「人口贴顶」的世界可能正是设计意图（有 `POP_SOFT_CAP` 这个保险丝），
// 一个「粮食长期过剩」的世界可能是下一阶段要治的病。诊断的职责是**指出现象**，
// 不是**判定好坏**。
//
// 所以：
//   · 本文件**不抛异常、不返回退出码**。它只产出一串结构化观察。
//   · 唯一的 `critical` 是**守恒式失效**（`conservation_violation`）——
//     那不是「世界不健康」，那是**账本坏了**，属于 correctness failure
//     （委托书 §10.G：「若守恒式失效：这属于 correctness failure」）。
//     ⚠️ 即便如此，它在本文件里也**只被记录、不被用来让进程失败**：
//     实验进程的退出码只反映「实验有没有跑完」，不反映「世界好不好」。
//
// ───────────────────────────────────────────────────────────────────────
// 关于阈值：本文件**不抄任何游戏常量**
// ───────────────────────────────────────────────────────────────────────
//
// 委托书 §12 点名：「不要把 400 复制为隐藏常量。尽可能从现有状态或序列行为判断。」
//
// 本文件对这条的落实方式是**口径分离**：
//   · 判「粮食是否长期高位」时，上限取**本次实验观测到的** `foodMax` 最大值，
//     而不是 400。这样即便 `life.js` 的 clamp 上界改成 800，
//     诊断也**自动跟着走**，不会变成一条测错东西的假证据。
//   · 判「粮仓见底」时用 **0**（clamp 下界，由数据导出）。
//   · 判「停滞」时用「该 flow 曾经动过、后段不再动」的**行为**判据，
//     而不是「累计量 < 某个数」。
//
// `DETECTOR` 里的数是**探测灵敏度**，不是游戏规则——它们只回答
// 「多小的变化算没变」，不回答「多少才健康」。这一点在下面逐个注明。

import {
  coefficientOfVariation, isNonDecreasing, mean, median, min, percentile, tail,
} from './stats.mjs';

/**
 * 探测灵敏度常量。**它们全部是「检测器参数」，不是游戏常量。**
 *
 * ⚠️ 修改这里的任何一项，都只改变「什么程度的现象会被打印出来」，
 *    不改变世界的运行。这是本文件与 `core/config.js` 的本质区别。
 */
export const DETECTOR = Object.freeze({
  /** 后段均值与整段均值的相对偏离小于此值 ⇒ 视为「长期几乎不变」。1%。 */
  plateauRelDrift: 0.01,
  /** 整段变异系数小于此值 ⇒ 视为「长期几乎不变」。1%。 */
  plateauCv: 0.01,
  /**
   * 后段 `food.p10` 超过「本次实验观测到的粮食上限」的这个比例 ⇒ 提示长期过剩。
   * ⚠️ 分母是**观测上限**（`max(foodMax)`），不是 400。理由见文件头。
   */
  foodFloorRatio: 0.5,
  /** 宗门人口 HHI 高于此值 ⇒ 提示高度集中。（HHI ∈ [1/n, 1]，1 = 一宗独占） */
  sectHhiHigh: 0.5,
  /** 灵脉头名份额高于此值 ⇒ 提示高度集中。 */
  leylineTopShareHigh: 0.6,
  /** 探针人口相对峰值的回撤超过此比例 ⇒ 提示一次人口跌落。 */
  populationDrawdown: 0.2,
});

/** 严重度（进 `diagnostics.json` 的 `severity` 字段）。 */
export const SEVERITY = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
});

function entry(severity, code, seed, metric, window, evidence) {
  return { severity, code, seed, metric, window, evidence };
}

/** 从一串快照里取某一列的数值序列（自动跳过 null）。 */
function column(snapshots, key) {
  const out = [];
  for (let i = 0; i < snapshots.length; i += 1) {
    const v = snapshots[i][key];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// 单指标诊断
// ───────────────────────────────────────────────────────────────────────

/**
 * `population_plateau` —— 长期人口几乎不变。
 *
 * 委托书 §12 明文：「暂时不要自动判断是好是坏。」
 * 所以这里是 `info`，且 evidence 里同时给出「相对变化」「变异系数」「平台起点」
 * 三个数——因为「贴顶」与「卡死」在单看一个数时长得一样：
 *   · 贴顶（`POP_SOFT_CAP` 保险丝生效）⇒ 人口高、波动小；
 *   · 卡死（生育链断了）⇒ 人口可能低、波动也小。
 *
 * ⚠️⚠️ **判据只看「后段」（`final_third`），不看整段**——这一条是修过的。
 *
 * 最初的实现拿**整段**去算漂移与变异系数，结果是**结构性漏报**：
 * 一个「前 50 年从 0 涨到 1400、之后 250 年一动不动」的世界，
 * 整段均值是 1289、后段均值是 1400（相对漂移 +8.6% > 1% 阈值），
 * 整段变异系数也被成长期拉高 —— **两条判据都不满足，诊断不触发**。
 * 而那正是委托书最想让人看见的现象：世界在第 50 年撞上了硬上限，
 * 此后两百五十年没有任何变化。
 *
 * 换句话说，**判据窗口选错，量到的就不是现象本身**——这与本项目
 * `World.js:129` 记下的那条教训同款：「一个计数放在任何闸门之后，
 * 量到的就是那道闸门，不是现象本身。」
 *
 * 改看后段之后：成长期被排除在窗口之外，平台本身成为唯一的观测对象。
 * 代价是「一直在缓慢增长」的世界不会被报出来——但那本来就**不是**平台，
 * 不该用这个码。
 */
function detectPopulationPlateau(snapshots, seed, out) {
  // 直接扫 snapshots 而不是用 `column()`：这里需要**年号**与人口配对，
  // 而 `column()` 会把 null 滤掉、破坏下标对齐。
  const series = [];
  for (let i = 0; i < snapshots.length; i += 1) {
    const v = snapshots[i].popTotal;
    if (typeof v === 'number' && Number.isFinite(v)) {
      series.push({ v, day: snapshots[i].day, year: snapshots[i].year });
    }
  }
  if (series.length < 6) return;

  // 后段窗口 = 序列的最后 1/3（至少 3 个点，否则算不出有意义的离散度）。
  const windowLen = Math.max(3, Math.ceil(series.length / 3));
  if (series.length < windowLen + 1) return;
  const seg = series.slice(series.length - windowLen);

  const values = seg.map((p) => p.v);
  const segMean = mean(values);
  if (!(segMean > 0)) return;

  const last = values[values.length - 1];
  const relChange = Math.abs(last - values[0]) / segMean;
  const cv = coefficientOfVariation(values);
  if (cv === null) return;
  if (relChange >= DETECTOR.plateauRelDrift || cv >= DETECTOR.plateauCv) return;

  // ── 平台从哪一年开始 ────────────────────────────────────────
  // 从末尾往前扫，找出「最早一个仍落在平台带内」的点。
  // 这一项是给读报告的人用的：它把「人口 1400」变成
  // 「人口从第 50 年起就是 1400，之后 250 年没动过」——后者才是结论。
  const band = Math.max(Number.EPSILON, Math.abs(last) * DETECTOR.plateauRelDrift);
  let startIdx = series.length - 1;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (Math.abs(series[i].v - last) <= band) startIdx = i; else break;
  }
  const plateauFrom = series[startIdx];
  const tailPoint = series[series.length - 1];

  out.push(entry(SEVERITY.INFO, 'population_plateau', seed, 'popTotal', 'final_third', {
    plateauFromDay: plateauFrom.day,
    plateauFromYear: plateauFrom.year,
    plateauYears: Math.max(0, (tailPoint.year || 0) - (plateauFrom.year || 0)),
    finalValue: last,
    windowMean: segMean,
    relativeChangeInWindow: relChange,
    coefficientOfVariationInWindow: cv,
    samples: series.length,
    windowSamples: seg.length,
    note: '后段人口几乎不变。贴顶（保险丝生效）与卡死（生育链断了）在此读数下同形，'
      + '需结合人口绝对水平判断——而 births 累计数当前不可得，见 telemetry_gap。',
  }));
}

/**
 * `food_high_floor` —— 后段粮食下沿长期高于观测上限的一半 ⇒ 可能长期过剩。
 *
 * ⚠️ 上限取**观测值**而非 400。委托书 §12：「不要把 400 复制为隐藏常量。」
 */
function detectFoodHighFloor(snapshots, seed, out) {
  const p10 = column(snapshots, 'foodP10');
  const ceilingSeries = column(snapshots, 'foodMax');
  if (p10.length < 4 || !ceilingSeries.length) return;
  const ceiling = percentile(ceilingSeries, 1);      // 观测到的粮食上限
  if (!(ceiling > 0)) return;
  const tailP10 = percentile(tail(p10), 0.5);
  if (tailP10 === null) return;
  if (tailP10 > ceiling * DETECTOR.foodFloorRatio) {
    out.push(entry(SEVERITY.WARNING, 'food_high_floor', seed, 'food.p10', 'final_third', {
      tailP10,
      observedCeiling: ceiling,
      ratio: tailP10 / ceiling,
      detectorRatio: DETECTOR.foodFloorRatio,
      note: '后段最穷的一成聚落，粮仓仍高于观测上限的一半 ⇒ 粮食可能长期过剩。观测上限来自本次实验的 foodMax，不是写死的 400。',
    }));
  }
}

/**
 * `monotonic_resource` —— 宗门资源长期只增不减 ⇒ 提示可能缺少 sink。
 *
 * 委托书 §12 的原文提示码就是 `possible_missing_sink`。
 *
 * ⚠️ 判据是**后段**（`final_third`）单调不减，不是整段：早年被消耗过、
 *    后来只增不减，同样是「sink 死了」的形态，而且更值得看。
 */
function detectMonotonicResource(snapshots, seed, out) {
  const targets = [
    { key: 'sectSpiritStoneTotal', label: 'sect.spiritStone.total' },
    { key: 'sectProvisionsTotal', label: 'sect.provisions.total' },
  ];
  for (const t of targets) {
    const series = column(snapshots, t.key);
    if (series.length < 4) continue;
    const seg = tail(series);
    if (!isNonDecreasing(seg)) continue;
    const first = seg[0];
    const last = seg[seg.length - 1];
    // 「一直是一条平线」不算「只增不减」——那可能是宗门压根不存在（长度 0 的数组和）。
    // 用「后段有过增长」把它排除掉，否则一个没有宗门的世界会印出一条无意义的提示。
    if (!(last > first)) continue;
    out.push(entry(SEVERITY.WARNING, 'monotonic_resource', seed, t.label, 'final_third', {
      start: first,
      end: last,
      growth: last - first,
      samples: seg.length,
      hint: 'possible_missing_sink',
    }));
  }
}

/**
 * `concentration` —— 宗门人口 / 灵脉归属高度集中。
 *
 * 委托书 §10.D：「这里特别重要。未来要用它判断：一宗长期控制多数灵脉
 * 究竟是自然霸权还是结构锁死。」
 */
function detectConcentration(snapshots, seed, out) {
  const hhiSeries = column(snapshots, 'sectPopHHI');
  if (hhiSeries.length >= 4) {
    const tailMean = mean(tail(hhiSeries));
    if (tailMean !== null && tailMean > DETECTOR.sectHhiHigh) {
      out.push(entry(SEVERITY.WARNING, 'concentration', seed, 'sect.populationHHI', 'final_third', {
        meanHHI: tailMean,
        detectorThreshold: DETECTOR.sectHhiHigh,
        uniformReference: 'HHI 的均匀分布基准是 1/n；越高越集中。',
      }));
    }
  }
  const shareSeries = column(snapshots, 'leylineTopOwnerShare');
  if (shareSeries.length >= 4) {
    const tailMean = mean(tail(shareSeries));
    if (tailMean !== null && tailMean > DETECTOR.leylineTopShareHigh) {
      out.push(entry(SEVERITY.WARNING, 'concentration', seed, 'leylines.topOwnerShare', 'final_third', {
        meanTopShare: tailMean,
        detectorThreshold: DETECTOR.leylineTopShareHigh,
        note: '有主灵脉中，头名宗门长期占据多数。是自然霸权还是结构锁死，需要 paired control 才能判——B0 只记录。',
      }));
    }
  }
}

/**
 * `stalled_flow` —— 某个累计 flow **曾经动过、后段完全不动**。
 *
 * ⚠️ 判据刻意排除了「从头到尾都是 0」的情形：那不是「流停了」，那是
 *    「这条通道在这个实验条件下本来就不该通」（例如 `natural + closed`
 *    下的 `riftOpenedCum`）。把两者混为一谈会印出一堆噪音，
 *    而噪音会训练人忽略整份诊断。前者归 `cross_realm_flow_absent`。
 */
function detectStalledFlow(snapshots, seed, out) {
  const flows = [
    'soulCumulativeCreated', 'warDeclaredCum', 'clanFoundedCum', 'artifactForgedCum',
    'netherBornCum', 'riftOpenedCum', 'possessionSucceededCum', 'popDeathsCum',
  ];
  for (const key of flows) {
    const series = column(snapshots, key);
    if (series.length < 6) continue;
    const seg = tail(series);
    const everMoved = series[series.length - 1] > series[0];
    const stalled = seg[seg.length - 1] === seg[0];
    if (everMoved && stalled) {
      out.push(entry(SEVERITY.INFO, 'stalled_flow', seed, key, 'final_third', {
        valueAtWindowStart: seg[0],
        valueAtEnd: seg[seg.length - 1],
        valueAtRunStart: series[0],
        samples: seg.length,
        note: '该累计量在整段里涨过，但后段完全不再变化 ⇒ 这条流水可能已经停了。',
      }));
    }
  }
}

/**
 * `conservation_violation` —— 幽冥守恒式失效。
 *
 * 委托书 §10.G：「若守恒式失效：这属于 correctness failure。」
 * 所以这是本文件里**唯一**的 `critical`。
 *
 * ⚠️ 但它仍然**不让进程失败**（见文件头）。实验的退出码回答的是
 *    「实验跑完了吗」，不是「世界对吗」——后者是 `npm run test:three-realms`
 *    与长测判据的职责。把两件事混在一个退出码里，会让「跑完了但世界有问题」
 *    与「根本没跑起来」变得无法区分。
 */
function detectConservation(snapshots, seed, out) {
  for (const [key, label] of [
    ['netherConserved', '幽冥生态守恒（鬼魂 + 鬼修 === 生 − 亡 − 逐 − 出 − 夺）'],
    ['netherItemsConserved', '幽冥物品守恒（在世 === 自生 + 跌入 − 漏出 − 朽）'],
  ]) {
    const bad = snapshots.filter((s) => s[key] === false);
    if (!bad.length) continue;
    out.push(entry(SEVERITY.CRITICAL, 'conservation_violation', seed, key, 'whole_run', {
      violatedSamples: bad.length,
      totalSamples: snapshots.length,
      firstViolationDay: bad[0].day,
      firstViolationYear: bad[0].year,
      description: label,
      note: '这是 correctness failure，不是 health concern。',
    }));
  }
}

/**
 * `cross_realm_flow_absent` —— 三界跨界流水整段为 0。
 *
 * ⚠️ 委托书 §10.H 明文：「如果 profile 是 `natural + viewPolicy=closed`：
 *    裂隙数据为 0 不应该自动报警为 bug。这是预期实验条件。」
 *    所以这里是 `info`，且 evidence 里写明「在本实验条件下是预期」。
 */
function detectCrossRealmAbsence(snapshots, seed, out, viewPolicy) {
  const last = snapshots[snapshots.length - 1];
  if (!last) return;
  const total = (last.riftOpenedCum || 0) + (last.riftLeakedCum || 0)
    + (last.riftCrossedCum || 0) + (last.riftLostCum || 0);
  if (total > 0) return;
  out.push(entry(SEVERITY.INFO, 'cross_realm_flow_absent', seed, 'rift.*', 'whole_run', {
    riftOpenedCum: last.riftOpenedCum,
    riftLeakedCum: last.riftLeakedCum,
    riftCrossedCum: last.riftCrossedCum,
    riftLostCum: last.riftLostCum,
    viewPolicy,
    expected: viewPolicy === 'closed',
    note: viewPolicy === 'closed'
      ? '视界恒闭 ⇒ 裂缝时钟从不累加，裂隙数据为 0 是**预期实验条件**，不是 bug（委托书 §10.H）。'
      : '视界策略不是 closed，但裂隙读数全 0 ⇒ 值得检查开缝是否落空（见 profile_preset_mismatch）。',
  }));
}

// ───────────────────────────────────────────────────────────────────────
// 探针诊断（短时窗口）
// ───────────────────────────────────────────────────────────────────────

/**
 * `granary_empty` —— 某次探针观测到有聚落粮仓见底。
 *
 * 这是**探针存在的全部理由**：一次只持续几十天的粮荒在年度快照上完全看不见。
 * 阈值取 0（`life.js:1494` 的 clamp 下界），由数据导出，不新增游戏常量。
 */
function detectGranaryEmpty(probes, seed, out) {
  const hits = probes.filter((p) => (p.foodEmptyCount || 0) > 0);
  if (!hits.length) return;
  out.push(entry(SEVERITY.WARNING, 'granary_empty', seed, 'food.emptyVillages', 'probe_window', {
    probeDaysWithEmptyGranary: hits.length,
    totalProbes: probes.length,
    firstDay: hits[0].day,
    firstYear: hits[0].year,
    minFoodAtFirstHit: hits[0].foodMin,
    note: '年度快照可能整年跳过这种短时粮荒——这正是探针层的用途。',
  }));
}

/**
 * `population_drop` —— 探针序列上的显著人口回撤。
 *
 * 判据是**相对**的（相对此前峰值），不是绝对人数：绝对阈值在 small 与 large
 * 预设之间没有可比性，而相对回撤有。
 */
function detectPopulationDrop(probes, seed, out) {
  if (probes.length < 4) return;
  let peak = probes[0].popTotal;
  let worst = null;
  for (let i = 1; i < probes.length; i += 1) {
    const pop = probes[i].popTotal;
    if (pop > peak) { peak = pop; continue; }
    if (peak <= 0) continue;
    const drawdown = (peak - pop) / peak;
    if (!worst || drawdown > worst.drawdown) {
      worst = { drawdown, peak, trough: pop, peakDay: null, troughDay: probes[i].day, troughYear: probes[i].year };
    }
  }
  if (!worst || worst.drawdown < DETECTOR.populationDrawdown) return;
  out.push(entry(SEVERITY.WARNING, 'population_drop', seed, 'population.total', 'probe_window', {
    maxDrawdown: worst.drawdown,
    peak: worst.peak,
    trough: worst.trough,
    troughDay: worst.troughDay,
    troughYear: worst.troughYear,
    detectorThreshold: DETECTOR.populationDrawdown,
  }));
}

/**
 * `sect_stability_swing` —— 宗门最低稳定度在探针序列上出现显著下探。
 *
 * ⚠️ 阈值刻意做成**相对**的（下探到中位数的一半以下），不抄 `sects.js:346`
 *    的 45。理由：45 是「解体判定的闸门」，把它抄进诊断会让诊断在
 *    闸门被调整的那天**静默测错东西**（委托书 §12 的同款告诫）。
 */
function detectSectStabilitySwing(probes, seed, out) {
  const series = probes.map((p) => p.sectStabilityMin).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (series.length < 4) return;
  const mid = median(series);
  const low = min(series);
  if (mid === null || low === null || !(mid > 0)) return;
  if (low >= mid * 0.5) return;
  out.push(entry(SEVERITY.INFO, 'sect_stability_swing', seed, 'sects.stability.min', 'probe_window', {
    minimum: low,
    median: mid,
    ratio: low / mid,
    note: '这是**相对**判据（相对中位数），不是「低于 45 就危机」那种抄来的闸门。',
  }));
}

// ───────────────────────────────────────────────────────────────────────
// 汇总入口
// ───────────────────────────────────────────────────────────────────────

/**
 * 对一个 seed 的结果跑全部诊断。
 *
 * @param {object} result `runner.runSeed` 的返回值
 * @param {object} config 已校验的配置
 * @returns {object[]} 诊断条目数组（委托书 §13 的形状）
 */
export function diagnoseSeed(result, config) {
  const out = [];
  const { snapshots, probes, seed } = result;

  if (snapshots.length >= 2) {
    detectPopulationPlateau(snapshots, seed, out);
    detectFoodHighFloor(snapshots, seed, out);
    detectMonotonicResource(snapshots, seed, out);
    detectConcentration(snapshots, seed, out);
    detectStalledFlow(snapshots, seed, out);
    detectCrossRealmAbsence(snapshots, seed, out, config.viewPolicy);
  }
  detectConservation(snapshots, seed, out);

  if (probes.length >= 2) {
    detectGranaryEmpty(probes, seed, out);
    detectPopulationDrop(probes, seed, out);
    detectSectStabilitySwing(probes, seed, out);
  }

  // 夹具 / 环境注记（由 world-factory 收集，逐字转成诊断条目）。
  for (const note of result.notes || []) {
    const code = note.split(':')[0].trim();
    out.push(entry(SEVERITY.INFO, code, seed, 'profile', 'setup', { note }));
  }

  return out;
}

/** 诊断条目的严重度计数（进 summary，便于一眼看出这批实验有没有硬伤）。 */
export function countBySeverity(diagnostics) {
  const counts = { info: 0, warning: 0, critical: 0 };
  for (let i = 0; i < diagnostics.length; i += 1) {
    const s = diagnostics[i].severity;
    if (counts[s] === undefined) counts[s] = 0;
    counts[s] += 1;
  }
  return counts;
}
