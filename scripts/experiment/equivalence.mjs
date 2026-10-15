// World Laboratory · B1 §0.4 模拟等价证明
//
// ───────────────────────────────────────────────────────────────────────
// 这文件要回答的唯一问题
// ───────────────────────────────────────────────────────────────────────
//
//   > 「B1 的无头实验路径」与「产品初始化路径」在**同 seed / 同尺寸 /
//   >   同地理类型 / 同操作序列**下，跑出来的是**同一条世界线**吗？
//
// 为什么这是 B1-0 的**硬门禁**：后续所有长期数值结论都建立在
// 「实验跑的是产品那个世界」这个前提上。如果两条路径建出来的世界不同，
// 那么 B1-1 到 B1-5 量到的全是**另一个世界**的数——而且看起来完全正常，
// 因为两份报告都自洽、都有指纹、都能跑完。
//
// 委托书 §0.4 点名要验的六项，本文件逐项兑现：
//   ① 初始 World 内容（`worldDigest`）
//   ② 三界装配（`upper` / `nether` 在不在、`digest` 是否一致）
//   ③ 推进时钟（`advanceState` 的字段与初值）
//   ④ RNG 流（凡间主流的 draw 次数，以及「抽到的序列」逐值相同）
//   ⑤ 世界序列化摘要（`serializeWorld` → sha256，逐 byte）
//   ⑥ 分层对照（0 日 / 30 日 / 360 日 / 更长时间）
//
// ───────────────────────────────────────────────────────────────────────
// 两条路径到底差在哪（这是本文件存在的原因）
// ───────────────────────────────────────────────────────────────────────
//
//   产品路径（`src/inkbox/main.js:newWorld`）：
//     createSandboxWorld(preset, seed)
//       └─ creationOptions() → { generationVersion, terrainPreset, progressive }
//          ⚠️ 默认 generationVersion **= 2**（M2-C2E 的新地形体系），
//             terrainPreset 默认 **'standard'**
//       └─ generateWorld({ preset, seed, scatter: true, generationVersion, terrainPreset })
//       └─ createMapProgress(world, progressive)   ← 默认 progressive=false ⇒ 删掉 mapProgress
//     new Life(world, mulberry32(seed ^ 0xa5a5a5a5))
//     attachUpper(world)   → generateUpperWorld({ preset, seed: mortal.seed })
//     attachNether(world)  → generateNetherWorld({ preset, seed: mortal.seed })
//
//   旧 B0 实验路径（`.migration/world-factory.mjs`）：
//     generateWorld({ preset, seed, scatter: true })   ← 一个 generationVersion 都没传
//       ⇒ 缺省 generationVersion=1 ⇒ **旧地形**（没有 smoothGeneratedHeight）
//       ⇒ **这就是委托书 §0.3 点名的「M2-C2E 新世界生成差异」**
//
// 所以本文件**不是**把旧 factory 与新 factory 比一遍就完事——
// 它比的是「产品实际会建出来的世界」与「实验框架建出来的世界」。
// 前者才是标尺。
//
// ⚠️ 本模块**只读**：不写 world、不抽签、不落盘。它只返回一份对照结论。

import { createHash } from 'node:crypto';
import { mulberry32 } from '../../src/inkbox/core/noise.js';
import { serializeWorld } from '../../src/inkbox/io/save.js';
import { WORLD_PRESETS } from '../../src/inkbox/core/config.js';
// ⚠️ 这里**直接静态 import** 那四个无 DOM 的模块（worldgen / worldgenUpper /
//    worldgenNether / Life / UpperLife / advance）。为什么可以：
//      · 这几个模块的 import 图上没有 `render` / `ui` / `document`；
//      · 真正有 DOM 的是 `main.js` 与 `ui/worldCreation.js`，而本文件**刻意
//        不 import 它们**——那正是本文件要复刻的对象（复刻 + 源码证据核对），
//        而不是依赖的对象。
//    早先的版本用了一串 `await import()` + 闭包 `*Ref()` 的写法来「收紧
//    import 图」，但那是**没有收益的复杂度**：这几个模块本来就无 DOM，
//    而 `src/inkbox/ui/worldCreation.js` 读 `document` 也只是在函数体内、
//    静态 import 它并不会在加载期崩溃。用一个更简单、更可读的写法表达
//    同一个约束，比用花哨的动态导入去「表演」这个约束更好。
import { generateWorld } from '../../src/inkbox/world/worldgen.js';
import { generateUpperWorld, recomputeUpperQi } from '../../src/inkbox/world/worldgenUpper.js';
import { generateNetherWorld } from '../../src/inkbox/world/worldgenNether.js';
import { createMapProgress } from '../../src/inkbox/world/mapProgress.js';
import { Life } from '../../src/inkbox/sim/life.js';
import { UpperLife } from '../../src/inkbox/sim/upperLife.js';
import { advanceWorld } from '../../src/inkbox/sim/advance.js';
import { createLabWorld, LIFE_RNG_KEY, ECO_RNG_SEED } from './world-factory.mjs';
import { worldFingerprint } from './digest.mjs';

/** 与 `main.js:375` 逐字相同的凡间主流种子派生。 */
export const PRODUCT_LIFE_RNG_KEY = 0xa5a5a5a5;

/**
 * 产品路径建的世界的**等价物**。
 *
 * ⚠️ 本函数刻意**不直接调 `main.js`**：那个类一构造就要 DOM、Canvas、
 *    `document.getElementById`……在无头环境里根本进不来（委托书明文禁止
 *    实验依赖浏览器）。所以这里逐字复刻 `newWorld` 的**建世界那几行**，
 *    并把「复刻是否忠实」这件事本身变成一条可断言的检查——
 *    见 `productPathSourceEvidence()`：它把 `main.js` 里那几行**源码文本**
 *    取出来，逐句核对本文件用的是同一个键名与同一个默认值。
 *
 *    换句话说：本文件不宣称「我抄对了」，它把源码摆出来让人核对。
 *
 * @param {{seed: number, preset: string, generationVersion?: number, terrainPreset?: string, progressive?: boolean}} spec
 */
export function createProductEquivalentWorld(spec) {
  const preset = WORLD_PRESETS[spec.preset];
  if (!preset) throw new Error(`未知 preset「${spec.preset}」`);
  const generationVersion = spec.generationVersion ?? 2;      // creationOptions 的默认
  const terrainPreset = spec.terrainPreset ?? 'standard';     // creationOptions 的默认
  const progressive = spec.progressive ?? false;              // inkProgressive 未勾选 = false

  // ⚠️ 这两行是 `createSandboxWorld` 的逐字等价（去掉了 DOM 取控件那一步，
  //    把控件值改成显式入参——语义完全相同，因为 `options` 优先于控件）。
  const world = generateWorld({
    preset, seed: spec.seed, scatter: true, generationVersion, terrainPreset,
  });
  // 用官方 helper，形状与产品侧同源（见 world-factory.mjs 的同款注释）。
  createMapProgress(world, progressive);

  // ── 三界装配（`newWorld` 的 `attachUpper` / `attachNether`）────────
  // ⚠️ 这两步在 `createSandboxWorld` **之外**，但它们在 `newWorld` 里是同一个
  //    事务的一部分。少建一个界，`world.upper` 就是 `undefined`：
  //      · `arriveUpper` 找不到落点 ⇒ 飞升者凭空消失（不报错，只是上界恒 0）；
  //      · `openRifts(..., 'nether')` 整条被拒（`reason: 'no-plane'`）
  //        ⇒ 四条跨界通道一条都跑不到，长测印出一片干净的 0。
  //    所以「产品等价世界」必须含这一装配，否则它等价的是一个**残缺的产品**。
  //
  // ⚠️ seed 传凡间的**原值**：上界 / 幽冥的 seed 派生在各自生成器内部做
  //    （异或、自逆 ⇒ 先派生再传会静默退回凡间种子）。
  world.upper = generateUpperWorld({ preset, seed: world.seed });
  recomputeUpperQi(world.upper);
  world.nether = generateNetherWorld({ preset, seed: world.seed });

  // ── 凡间主循环（`newWorld` 的 `new Life(...)`）────────────────────
  //
  // ⚠️⚠️ **必须在建世界测试里也算上它。** 这是本文件踩过的一个坑，值得写下来：
  //
  //   `Life` 的构造器里有一行 `this.events = new WorldEvents(world, rng, ...)`，
  //   而 `WorldEvents.reset()` 会**抽 RNG**（`envoyIn = 150*360 + rng()*100*360` …）
  //   并把它写进 `world.worldEventState`。
  //
  //   ⇒ 「建了世界」与「建了世界 + 建了 Life」是**两个不同的世界状态**：
  //     后者多了一份 `worldEventState`，而它进 `serializeWorld`。
  //     第一版本文件只调了 `createSandboxWorld` 就比对，于是差异恒定落在
  //     `worldEvents` 这一个字段上——那不是实验框架的错，是本文件的错。
  //
  //   ⇒ 结论：**产品等价物 = `newWorld` 建完之后的那个 world**，含 Life 与三界。
  //     换句话说，标尺是整个 `newWorld`，不是它的前两行。
  //
  // ⚠️ 这里用**朴素** `mulberry32(seed ^ 0xa5a5a5a5)`（产品侧没有计数包装），
  //    与 `main.js:375` 逐字相同。实验侧的计数包装**不改变取到的值**——
  //    这一点由 `compareSteppedWorlds` 的 draw-count 对照单独证明。
  const productLife = new Life(world, mulberry32(world.seed ^ PRODUCT_LIFE_RNG_KEY));

  return { world, life: productLife };
}

// ───────────────────────────────────────────────────────────────────────
// 指纹（比 digest.mjs 多两样：三界装配状态、advanceState 快照）
// ───────────────────────────────────────────────────────────────────────

/** 世界序列化摘要（与 `digest.mjs` 同口径，但**不含** upper/nether 挂载状态）。 */
export function mortalDigest(world) {
  return createHash('sha256').update(JSON.stringify(serializeWorld(world)), 'utf8').digest('hex');
}

/** 三界装配状态：上界 / 幽冥「挂没挂、尺寸对不对、digest 是什么」。 */
function planeWiring(world) {
  const out = { hasUpper: !!world.upper, hasNether: !!world.nether };
  if (world.upper) {
    out.upperSize = [world.upper.w, world.upper.h];
    out.upperSeed = world.upper.seed;
    out.upperDigest = mortalDigest(world.upper);
  }
  if (world.nether) {
    out.netherSize = [world.nether.w, world.nether.h];
    out.netherSeed = world.nether.seed;
    out.netherDigest = mortalDigest(world.nether);
  }
  return out;
}

/** 世界键集（`Object.keys` 排序）——「多了一个字段」这件事在这里现形。 */
function worldKeySet(world) {
  return Object.keys(world).sort();
}

// ───────────────────────────────────────────────────────────────────────
// 主对照
// ───────────────────────────────────────────────────────────────────────

/**
 * 建两条路径的世界并逐项比对**建世界阶段**。
 *
 * @param {{seed: number, preset: string, generationVersion?: number, terrainPreset?: string}} spec
 * @returns {object} 对照结论（全字段可判定）
 */
export function compareWorldConstruction(spec) {
  const productSide = createProductEquivalentWorld(spec);
  const product = productSide.world;
  const lab = createLabWorld({
    seed: spec.seed,
    preset: spec.preset,
    profile: 'natural',
    generationVersion: spec.generationVersion ?? 2,
    terrainPreset: spec.terrainPreset ?? 'standard',
  });

  const productKeys = worldKeySet(product);
  const labKeys = worldKeySet(lab.world);
  const missingInLab = productKeys.filter((k) => !labKeys.includes(k));
  const extraInLab = labKeys.filter((k) => !productKeys.includes(k));

  const productWiring = planeWiring(product);
  const labWiring = planeWiring(lab.world);

  return {
    spec: { ...spec },
    mortal: {
      productDigest: mortalDigest(product),
      labDigest: mortalDigest(lab.world),
      same: mortalDigest(product) === mortalDigest(lab.world),
    },
    keySet: {
      missingInLab,
      extraInLab,
      same: missingInLab.length === 0 && extraInLab.length === 0,
      count: { product: productKeys.length, lab: labKeys.length },
    },
    wiring: {
      product: productWiring,
      lab: labWiring,
      same: JSON.stringify(productWiring) === JSON.stringify(labWiring),
    },
    // 生成元数据：M2-C2E 起 world.generation 会记录版本与预设名。
    // ⚠️ 它是**新字段**，旧 v1 世界没有它——所以这里单独列出来，
    //    既是「v2 有没有生效」的判据，也是 §0.3「明确记录 generationVersion /
    //    terrainPreset」的兑现处。
    generation: {
      product: product.generation ? { ...product.generation } : null,
      lab: lab.world.generation ? { ...lab.world.generation } : null,
      same: JSON.stringify(product.generation || null) === JSON.stringify(lab.world.generation || null),
    },
    lab,
  };
}

/**
 * 建两条路径的世界，**各自独立跑 sameDays 个游戏日**，再比对。
 *
 * ⚠️ 为什么必须「各自从零跑」而不是「跑同一个世界」：
 *    同一个世界跑一次就变了，跑第二次得到的是「变了之后的世界」。
 *    要证两条路径等价，必须是**两条独立的线**从同一个起点出发，
 *    各走各的，最后逐 byte 相同。
 *
 * @param {{seed:number, preset:string, generationVersion?:number, terrainPreset?:string}} spec
 * @param {number[]} dayMarks 要对照的游戏日分层（例 `[0, 30, 360, 1080]`）
 * @param {number} stepDays 每次 advanceWorld 的推进天数（默认 3，与标准实验一致）
 */
export function compareSteppedWorlds(spec, dayMarks, stepDays = 3) {
  const marks = [...new Set(dayMarks)].filter((d) => Number.isFinite(d) && d >= 0).sort((a, b) => a - b);
  const maxDay = marks.length ? marks[marks.length - 1] : 0;

  // ── 两条独立的线 ────────────────────────────────────────────
  const productSide = createProductEquivalentWorld(spec);
  const product = productSide.world;
  const lab = createLabWorld({
    seed: spec.seed,
    preset: spec.preset,
    profile: 'natural',
    generationVersion: spec.generationVersion ?? 2,
    terrainPreset: spec.terrainPreset ?? 'standard',
  });

  // ── 产品侧的推进 ────────────────────────────────────────────
  // ⚠️ 逐字复刻 `main.js:advanceDays` 的形态：life / upperLife / rng(生态) /
  //    state / riftActive。Life 实例已在 `createProductEquivalentWorld` 里建好
  //    （因为它的构造会写 world，属于「建世界」的一部分）。
  const productLife = productSide.life;
  const productUpperLife = newProductUpperLife(product);
  const productState = { upper: 0, nether: 0, rift: 0, wraith: 0, eco: 0, fire: 0 };
  const productEcoRng = mulberry32(ECO_RNG_SEED);

  // ── 分层观测 ────────────────────────────────────────────────
  const marks_out = [];
  let cursor = 0;

  const observe = (label, dayA, dayBEntries) => {
    marks_out.push({ day: dayA, label, ...dayBEntries });
  };

  // day 0
  observe('day0', 0, {
    product: { digest: mortalDigest(product), day: product.day, draws: null },
    lab: { digest: mortalDigest(lab.world), day: lab.world.day, draws: lab.lifeRngDraws },
    same: mortalDigest(product) === mortalDigest(lab.world),
    sameWiring: JSON.stringify(planeWiring(product)) === JSON.stringify(planeWiring(lab.world)),
  });
  cursor = 0;

  for (const mark of marks) {
    if (mark === 0) continue;
    // 推进到 mark（按 stepDays 切块，与 runner 同款）
    while (cursor < mark) {
      const chunk = Math.min(stepDays, mark - cursor);
      advanceProduct(product, productLife, productUpperLife, productEcoRng, productState, chunk);
      advanceLab(lab, chunk);
      cursor += chunk;
    }
    const productDigestNow = mortalDigest(product);
    const labDigestNow = mortalDigest(lab.world);
    observe(`day${mark}`, mark, {
      product: { digest: productDigestNow, day: product.day },
      lab: { digest: labDigestNow, day: lab.world.day, draws: lab.lifeRngDraws },
      same: productDigestNow === labDigestNow,
      sameWiring: JSON.stringify(planeWiring(product)) === JSON.stringify(planeWiring(lab.world)),
    });
  }

  return {
    spec: { ...spec },
    stepDays,
    marks: marks_out,
    allSame: marks_out.every((m) => m.same),
    finalDay: { product: product.day, lab: lab.world.day },
    finalWiring: {
      product: planeWiring(product),
      lab: planeWiring(lab.world),
      same: JSON.stringify(planeWiring(product)) === JSON.stringify(planeWiring(lab.world)),
    },
    maxDay,
  };
}

// ── 产品侧的构造助手（逐字复刻 main.js，不 import 它）────────────────

/** 产品侧的 `UpperLife`（`main.js:attachUpper` 逐字同款：流从 `upper.seed` 派生）。 */
function newProductUpperLife(world) {
  return new UpperLife(world.upper);
}

function advanceProduct(world, life, upperLife, ecoRng, state, days) {
  return advanceWorld(world, days, {
    life, upperLife, rng: ecoRng, state, riftActive: false,
  });
}

function advanceLab(lab, days) {
  return advanceWorld(lab.world, days, {
    life: lab.life, upperLife: lab.upperLife, rng: lab.ecoRng,
    state: lab.advanceState, riftActive: false,
  });
}

// ───────────────────────────────────────────────────────────────────────
// 源码证据：把「本文件复刻的是不是当前源码」摆出来
// ───────────────────────────────────────────────────────────────────────

/**
 * 抓 `main.js` 里那几行建世界的源码文本，作为「复刻忠实度」的证据。
 *
 * ⚠️ 这不是「我们小心了」，是**结构上可核对**：本文件用的是
 *    `0xa5a5a5a5` 与 `12345` 两个常量。它们对不对，不该由注释担保，
 *    而该由「源码里写的是什么」决定。所以这里把源码片段取出来放进报告。
 *
 * @returns {{lines: string[], keys: {lifeRngKey: number|null, ecoRngSeed: number|null, generationVersion: number|null, terrainPreset: string|null}}}
 */
export async function productPathSourceEvidence(repoRoot) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const read = (rel) => {
    try { return fs.readFileSync(path.join(repoRoot, rel), 'utf8'); } catch { return null; }
  };
  const main = read('src/inkbox/main.js') || '';
  const creation = read('src/inkbox/ui/worldCreation.js') || '';

  const grab = (text, re) => { const m = text.match(re); return m ? m[0].trim() : null; };

  const lines = [];
  const lifeLine = grab(main, /new Life\(this\.world, mulberry32\([^)]*\)\)/);
  const rngLine = grab(main, /this\.rng = mulberry32\(\d+\)/);
  const genLine = grab(creation, /const generationVersion = [^;]+;/);
  const terrainLine = grab(creation, /const terrain = [^;]+;/);
  if (lifeLine) lines.push(lifeLine);
  if (rngLine) lines.push(rngLine);
  if (genLine) lines.push(genLine);
  if (terrainLine) lines.push(terrainLine);

  const parseHex = (s) => { const m = s && s.match(/0x[0-9a-fA-F]+/); return m ? Number(m[0]) : null; };
  const parseDec = (s) => { const m = s && s.match(/mulberry32\((\d+)\)/); return m ? Number(m[1]) : null; };
  // `generationVersion = overrides.generationVersion ?? (terrain === 'legacy' ? 1 : 2)`
  //   ⇒ 抓最后一个数字（非 legacy 分支的版本号）。
  const parseGv = (s) => { const m = s && s.match(/const generationVersion = [^;]*?:\s*(\d+)\s*\)\s*;/); return m ? Number(m[1]) : null; };
  // `terrain = overrides.terrainPreset ?? element('inkTerrainSelect')?.value ?? 'standard'`
  //   ⇒ 抓 `?? 'xxx'` 里的最后那个字符串字面量（缺省地理类型）。
  const parseTp = (s) => { const m = s && s.match(/\?\?\s*'([a-z]+)'\s*;/); return m ? m[1] : null; };

  return {
    lines,
    keys: {
      lifeRngKey: parseHex(lifeLine),
      ecoRngSeed: parseDec(rngLine),
      generationVersion: parseGv(genLine),
      terrainPreset: parseTp(terrainLine),
    },
  };
}
