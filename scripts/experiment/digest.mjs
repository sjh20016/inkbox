// World Laboratory · 世界指纹（digest）
//
// ───────────────────────────────────────────────────────────────────────
// 委托书 §15 的硬约束：**不要重新发明第二套世界序列化规则**
// ───────────────────────────────────────────────────────────────────────
//
// 本项目**已经有**一份权威的世界序列化：`src/inkbox/io/save.js` 的
// `serializeWorld(world)`。它是存档格式，所以它必然覆盖「读档后能不能复原」
// 所需的**全部**状态——漏一个字段，读档就会分叉，那是会被 save-equivalence
// 测试当场抓住的（`scripts/inkbox-save-equiv.mjs`）。
//
// 所以本文件**不定义任何字段清单**，只做两件事：
//   ① 调 `serializeWorld`；
//   ② 对它的 JSON 取 SHA-256。
//
// ⚠️ **反面教材**（本文件刻意不做的事）：手写一份
//    `{day, entities, villages, factions, ...}` 的字段清单再 `JSON.stringify`。
//    项目里已经有过这种写法（`scripts/inkbox-render3d-bridge.mjs:573` 的那个
//    `digest()`）——它在那里是**对的**，因为它的用途是「证明渲染侧没写回
//    那几个被点名渲染的字段」，范围小且明确。但把它拿来当「世界线有没有变」
//    的判据就**错了**：它漏掉 `souls` / `soulLog` / `warLog` / `riftLog` /
//    `artifactLog` / `clanLog` / `possessionLog` / `deadLog` / `chronicle` /
//    `clan` / `relations`……而**漏掉的那个恰好最可能是实验框架污染的那个**
//    （比如采集器偷抽了一次 RNG，把 `Life.rng` 的相位挪了一格，
//    表现为几百年后某个人的寿元不同——手写清单根本看不见）。
//
// ⚠️ `serializeWorld` 会**按存在与否**决定写不写 `upper` / `nether` 两块
//    （`save.js:419-431`）。所以「忘了挂上界」与「挂上了但没推进」
//    在 digest 上是**可区分**的——这正是我们要的性质。
//
// ⚠️ 本模块是**只读**的：`serializeWorld` 只读不写。已由 collector purity
//    测试反向验证（开关采集后 digest 必须逐字相同）。

import { createHash } from 'node:crypto';
import { serializeWorld } from '../../src/inkbox/io/save.js';

/** 摘要算法与版本。进 manifest，让「换了算法」这件事在报告里看得见。 */
export const DIGEST_ALGORITHM = 'sha256';
export const DIGEST_SCHEME = 'serializeWorld/sha256/v1';

/**
 * 世界指纹。
 *
 * @param {object} world 凡间 world（`upper` / `nether` 若已挂上，会自动进指纹）。
 * @returns {string} 64 位十六进制小写摘要。
 */
export function worldDigest(world) {
  const payload = JSON.stringify(serializeWorld(world));
  return createHash(DIGEST_ALGORITHM).update(payload, 'utf8').digest('hex');
}

/**
 * 摘要输入的**字节长度**。
 * 与摘要一起记录：两个不同的世界若恰好长度相同而摘要不同，说明是内容差异；
 * 若长度都不同，则连「结构规模」都变了（例如实体数差一个数量级）。
 * 这是排障时最先要看的一个数——它比摘要便宜，也比摘要可读。
 */
export function worldDigestBytes(world) {
  return Buffer.byteLength(JSON.stringify(serializeWorld(world)), 'utf8');
}

/** 一次性拿摘要与字节数（只序列化一次，避免长跑收尾时多花一倍时间）。 */
export function worldFingerprint(world) {
  const payload = JSON.stringify(serializeWorld(world));
  return {
    digest: createHash(DIGEST_ALGORITHM).update(payload, 'utf8').digest('hex'),
    bytes: Buffer.byteLength(payload, 'utf8'),
    scheme: DIGEST_SCHEME,
  };
}
