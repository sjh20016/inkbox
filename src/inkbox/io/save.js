// 水墨沙盒 · 存档
//
// 地形层用 Uint16 量化后 base64，比直接存 JSON 小数小一个数量级；
// 生灵/聚落/势力数量有限，直接用 JSON。整体放进 localStorage。
//
// ⚠️ 修仙层（境界、灵根、道途、心魔、因果、关系网、灵脉、地点、飞升名录）
// 全部要一起存。少存一样，读档之后修士就退化成凡人——
// 这是「迁移玩法系统」时最容易漏掉的一环：新的状态不写进存档，
// 玩家一存一读，几百年的修行全没了。
//
// ── 关于「存读档等价」──────────────────────────────────────
// 地形层是有损的：7 个标量层各量化成 16 位，单格误差约 7.6e-6。
// 于是读档后继续演化，轨迹会和「一直不存档」的那条线缓慢分叉——
// 不是漏存了字段，而是那 7.6e-6 在混沌系统里被放大了。
//
// 曾试过把地形层改成原样存 Float32，是逐位无损的，但体积会翻倍：
// 长卷 384×240 的存档将从 ~2 MB 涨到 ~4.1 MB，逼近 localStorage 的
// 5 MB 上限，玩家一存大世界就可能失败。所以这里选择保留量化。
//
// 判定标准因此分两层：
//   · 硬要求：读档瞬间结构完整——除地形层与 tick 内的一次性标记
//     （_justAwakened）外，逐字段一致；
//   · 可接受：继续演化后的轨迹分叉，量级与量化误差相符。
// 见 scripts/inkbox-save-equiv.mjs。

import { APP, WORLD_PRESETS } from '../core/config.js';
import { World } from '../world/World.js';
import { recomputeAll, recomputeQi } from '../world/terrain.js';
import { DAO_PATHS, TRIBULATION_OMENS } from '../core/cultivation.js';
import { MANUALS, NETHER_TECHNIQUES } from '../core/lore.js';
// 上界（第二个世界，v8）。两个 import 各自只为一件事：
//   · `generateUpperWorld`  —— 读档时重建上界（v7 老档降级、以及重算 temp/moist）；
//   · `recomputeUpperQi`    —— 上界专用灵气补算。
//
// ⚠️ 这里**刻意不 import `deriveUpperSeed`、也绝不自己写 `seed ^ 0x55505052`**。
//    `generateUpperWorld` 的 `seed` 参数契约是「**凡间**种子，不是上界的」——
//    它内部自己派生（`worldgenUpper.js:578`）。所以在 save.js 里再派生一次是
//    **双重派生**，而异或自逆 → 上界种子**恰好退回凡间种子**：
//      · 不报错；
//      · 两张图的 `warRng`（`life.js:124` 从 `world.seed` 派生，外部覆盖不了）
//        从此完全重合——正是规格 §1.4 点名要避免的那个坑。
//    「派生只能有一处」这条纪律，在这里的兑现方式就是**一处都不写**。
//
// ⚠️ 灵气层同理：上界要 `qiAtUpper`（地表基数 × 1.8 + 仙脉），凡间的 `recomputeQi`
//    走的是另一套公式，会把上界灵气整层覆盖掉——不报错，只是地气色全不对。
//
// 幽冥界（第三个世界，v10）。与上界**同一条纪律、逐字同形**：
//   · `generateNetherWorld` —— 读档时重建幽冥（v9 老档降级、以及重算 temp/moist/riverBase）；
//   · 它**没有**专用的灵气补算函数：幽冥的 `qi` 走凡间那套 `qiAt`（阴气在 `veg` 层，
//     不在 `qi` 层），所以 `restoreWorldState` 用默认的 `recomputeQi` 就是对的。
// ⚠️ 与上界**逐字相同**的两条陷阱，别只防一边（见下面 `deserializeWorld` 的注释）：
//    · 别 import `deriveNetherSeed`、也别自己写 `seed ^ 0x4e455452`——
//      `generateNetherWorld` 的 `seed` 参数契约是「**凡间**种子」，它内部自己派生；
//    · 更别把 `data.nether.seed`（已派生的幽冥种子）喂回去——异或自逆 → 退回凡间种子。
import { generateUpperWorld, recomputeUpperQi } from '../world/worldgenUpper.js';
import { generateNetherWorld } from '../world/worldgenNether.js';
// 凡间鬼影（D6-3 工程包 B）。只 import 一个**读侧还原**函数：
//   · 写侧在 `serializeWorld` 里**逐字段显式写**（22 键，键集 = `WRAITH_TEMPLATE`）；
//   · 读侧交给 `restoreWraiths`——它按模板逐键兜底、丢弃野键，于是「形状」只有
//     `sim/wraiths.js` 一处定义。若在这里手抄一份兜底表，往模板加字段时**必然**
//     漏一处，而且漏处**不报错**（那个字段读档后恒为默认值）。
// ⚠️ 依赖方向 `io/save.js → sim/wraiths.js → core/*`，不成环（wraiths.js 不 import io）。
import { restoreWraiths } from '../sim/wraiths.js';
// 压缩层。只在这一处 import：`serializeWorld` / `deserializeWorld` **保持同步不变**，
// 所以 inkbox-smoke / inkbox-save-equiv / 几个探针都不受影响——异步只到存储边界为止。
// 见 io/codec.js 头注释：压缩不是优化，是「三界并存能不能存下」的前置条件。
import {
  encodeSave, decodeSave, lastCodecUsed, lastFallbackReason, isCompressed,
} from './codec.js';

// ── 版本 ─────────────────────────────────────────────────
// v1 → v2：加 id 列与修仙层（境界/灵根/道途/关系网）。
// v2 → v3：加转世（incarnation / soulId / pastLife）。**当时忘了改这个常量**，
//          所以 v3 的档在文件里也写着 `v: 2`——好在还原是按下标读的，
//          `?? 1` / `?? null` 一兜底就退化成「第一世」，没出事。
// v3 → v4：加法宝（entity.artifacts 列 + world.artifacts/nextArtifactId/artifactLog）。
//          这一次把常量补上，顺便把 v3 漏掉的那一笔记在这里。
// v4 → v5：加家世与世家（entity 的 surname/parentA/parentB/clan/gen/
//          heritageQ/heritageB/heritageM 八列 + world.clans/nextClanId/clanLog/
//          lastClanFoundDay）。**新列一律追加在行尾**——中间插一列会把
//          `row[45]`（关系网）与 `row[46..48]`（转世）的下标全顶歪，
//          而那种错不会报错，只会让读档后的人悄悄换一副关系网。
// v5 → v6：加三块新玩法，同样**只追加在行尾**（row[57..59]）：
//          · `log`               —— 个人事件流，传记的原料（sim/biography.js）；
//          · `possessedBy`       —— 夺舍印记，存的是**快照对象**不是 id
//                                   （夺舍者会从 world.entities 移除，存 id 必悬垂）；
//          · `nascentEscapeUsed` —— 元婴脱壳记账，一生只触发一次，
//                                   不存的话读档后同一个人可以反复脱壳、永远死不了。
//          世界级加 world.wars / warLog / nextWarId（大战，见 sim/war.js）
//          与 world.possessionLog（夺舍累计账本）。
//          为什么账本也要存：`possessionStats` 数的是「此刻在世、还带着印记的人」，
//          当事人一死就归零——于是「夺舍从没发生过」与「发生过但没人活着」
//          读数一样。累计账本是唯一能把这两者分开的东西（同 warLog.declared
//          与 nextSoulId 的理由）。
// v6 → v7：加逝者名录（sim/necrology.js）。**世界级字段，不动实体行**：
//          · `world.dead`    —— 每个离世者一份不可失效的快照（宗门/世家/村名
//                               一律存字符串，不存 id；id 只当稳定键）；
//          · `world.deadLog` —— 累计账本 {total, ascended, evicted}。
//          为什么不加实体列：名录是世界级的，与实体行无关。而 save.js 的教训是
//          「新列一律追加在行尾，中间插一列会把后面所有列的下标顶歪，
//          而那种错不会报错，只会让读档后的人悄悄换一副关系网」。
//          世界级字段没有这个风险。
//          为什么账本必须存：`world.dead.length` 会被淘汰裁剪、会变小，
//          于是「从来没有凡人死过」与「死过十万个、全被淘汰了」在长测读数上
//          长得一模一样。同 warLog.declared / possessionLog 的理由。
// v7 → v8：加**上界**（第二个世界，见 reports/design/upperworld.md）。
//          凡间 world 上挂一个引用 `world.upper`（main.js 的 newWorld 里设），
//          存档顶层因此多一个 `upper` 键——它是**整个上界 world 的序列化块**，
//          形状与凡间那一层同源（理由见 serializeUpperWorld 的注释）。
//          · 上界**只存 6 个地形层**：height / water / veg / type / over / struct。
//            `temp` / `moist` 是生成期产物，读档时照 seed 重算（见
//            deserializeUpperWorld）；`fire` / `riverBase` 在上界恒为 0
//            （不跑 stepFire、不刻河）；`owner` 在凡间那层本身就是死数据。
//            逐条理由见规格 §1.3。
//          · 上界的实体 / 聚落 / 宗门 / 灵脉等数组**照凡间的做法存**。本轮它们
//            可能是空的，但**空数组也要写**：缺键就是「只在一侧存在的字段」，
//            save-equiv 那条判据会红。
//          · **凡间实体行不动**——上界是独立 world，各字段天然隔离。
//          · v8 内追加（**不升版本号**，见下）：上界飞升者的**来历快照**两列
//            `fromMortal`（0/1）、`fromSect`（宗门名字符串，`null` 写成空串），
//            **追加在实体行尾**（row[60..61]，紧接 v6 的 `nascentEscapeUsed`）。
//            读侧（`restoreEntity` / `restoreLegacyEntity`）一律兜底成
//            `false` / `null`，并**真的写进实体对象**；活对象那侧由
//            `World.addEntity` 这个唯一漏斗补同样的默认值，两边键集必须一致
//            （save-equiv:140 的判据取键集并集）。
//            为什么追加在行尾、为什么读侧要兜底：中间插一列会把 `row[45]`
//            （关系网）与 `row[46..48]`（转世）的下标全顶歪，而那种错不报错，
//            只会让读档后的人悄悄换一副关系网（见上面 v4 → v5 那一段）。
//            为什么**不升版本号**：全仓**只有一处**读 `v`——本文件 `restoreWorldState`
//            里的 `(data.v || 1) < 2`（v1 老档降级判据），**没有任何按 v2..v8 分叉的
//            迁移分支**；「追加行尾列 + 读侧兜底」本身就向后兼容，升号反而会误导
//            后来人以为存在 v8 → v9 的迁移代码（`scripts/*` 里那几处 `raw.v = N`
//            只是**造老档**用的，不按当前版本分叉）。
//            ⚠️ **这两列必须无 id**：凡间的 `entity.id` 与上界 id **同段会撞号**
//            （两个世界的 `nextEntityId` 各自从 1 / `UPPER_ID_BASE` 起编，
//            见 `World.js:140`），存 id 就是存一个指向别人的悬垂指针。所以只存
//            「是不是凡间来的」这个布尔 + 宗门**名字**（同 v7 逝者名录、v6
//            `possessedBy` 的理由：存字符串，永不悬垂）。见规格 §6.3 第 3 条。
//          · v7 老档没有 `upper` 块 → 读档时**照派生 seed 生成一个上界**，
//            不留 `null`。理由同下面 v1 老档那一段：老档里缺的键若不补成
//            默认值，就是「只在一侧存在的字段」。
// v8 内追加（阶段三 · 空间裂缝，见规格 §4）：凡间 payload 加三个**世界级**字段
//          `rifts` / `nextRiftId` / `riftLog`（纯数据、无 id 引用，见 serializeWorld
//          里那一段）。**不动实体行**——裂缝是世界级数组，与实体行无关，所以没有
//          「新列追加在行尾」的下标风险。上界 payload **刻意不含**这三个键
//          （裂缝是凡间专属，见 serializeUpperWorld 的 delete 段）。
//          为什么**不升版本号**：与上面 v8 内追加 `fromMortal`/`fromSect` 同一理由。
//          已复核：全 `src/inkbox` 里读 `v` 的地方**只有一处**——`restoreWorldState`
//          的 `(data.v || 1) < 2`（v1 老档降级判据），不按 v2..v8 分叉。本次是
//          「新增世界级键 + 读侧兜底」，对老档天然向后兼容（缺键 → 空数组 / 全零账本），
//          升号只会误导后来人以为存在 v9 迁移代码。
// v8 → v9：加**魂路累计账本** `world.soulLog`（世界级字段，不动实体行，
//          见 sim/reincarnation.js 的 `ensureSoulLog`）。五键：
//          `natural`（自然入池）/ `linger`（滞留入池）/ `ghost`（成鬼修）/
//          `wraith`（怨魂化）/ `gone`（魂火散尽，**本轮新增的第五路**）。
//          为什么必须存：五条魂路里有三条（`ghost` / `wraith` / `gone`）
//          **从不进 `world.souls`**，于是它们在别的任何读数里都不可见——只有
//          这本账记得住。它单调递增、反推不出来，不存的话「从来没走过这条路」
//          与「走过但没存」在长测读数上完全一样（同 warLog / possessionLog /
//          deadLog / riftLog 的理由）。
//          这一次**升版本号**（不同于 v8 内那两次追加）：它是一块全新的世界级
//          账本，记一笔明确的版本边界，便于后来人定位「哪一档开始有 soulLog」。
//          写/读两侧都按 `riftLog` 的做法**逐键显式写**（不写 `world.soulLog || {...}`）：
//          老档五键全缺，写侧钉成 5 键，形状只有一种，save-equiv 键集判据不会红。
// v9 → v10：加**幽冥界**（第三个世界，见 reports/design/upperworld.md §8 与 §8.9）。
//          与 v8 的上界**逐字同形**：凡间 world 上挂一个引用 `world.nether`
//          （阶段 8-B 只做地形与存档；main.js 的接线是后续子阶段的事），
//          存档顶层因此多一个 `nether` 键——它是**整个幽冥 world 的序列化块**。
//          · 幽冥**也只存 6 个地形层**：height / water / veg / type / over / struct。
//            这 6 层与上界的**键名相同、语义不同**（§8.9 裁决 8.1①）：
//            `water` → **冥河**、`veg` → **阴气 / 荒芜**。复用「先照凡间整个存一遍
//            再裁层」的做法，而不是手写一份「幽冥专用字段清单」——后者是第二份真相，
//            凡间每加一个世界级字段它都不会跟上。
//            `temp` / `moist` 是生成期产物、`riverBase` 是从 seed 刻出来的，
//            三者读档时照同 seed 重算（见 deserializeNetherWorld）；
//            `fire` 恒 0（幽冥不跑 stepFire）、`owner` 在凡间那层本身就是死数据。
//          · 幽冥的实体 / 聚落 / 宗门等数组**照凡间的做法存**。本轮它们恒空，
//            但**空数组也要写**：缺键就是「只在一侧存在的字段」，save-equiv 会红。
//          · 上界那三样专属字段（`popLog` / `arrivedLog` / `mortalLog`）**不抄**
//            （§8.2：抄形状，不抄键名）。幽冥自己的账本是 8-C / 8-D 的事，
//            见下面 `NETHER_ONLY_KEYS` 为什么现在是空的。
//          · **凡间与上界的 payload 都不动**——幽冥是独立 world，各字段天然隔离。
//          · v9 老档没有 `nether` 块 → 读档时**照派生 seed 生成一个幽冥**，
//            不留 `null`。理由同 v8 的 `upper` 与 v1 老档那两段：老档里缺的键
//            若不补成默认值，就是「只在一侧存在的字段」。
//          ⚠️ **这一次升版本号**（与 v8 内那两次追加不同）：它是一块全新的
//          **世界级序列化块**（顶层多一个键），与 `soulLog` 那次同一个量级，
//          记一笔明确的版本边界，便于后来人定位「哪一档开始有 nether」。
//          已复核：全 `src/inkbox` 里读 `v` 的地方**仍然只有一处**——
//          `restoreWorldState` 的 `(data.v || 1) < 2`，不按 v2..v10 分叉。
// v11 内追加（D6-3 工程包 B · 凡间鬼影，见 sim/wraiths.js）：凡间 payload 加两个
//          **世界级**字段 `wraiths`（数组）与 `wraithLog`（只有 `dissolved` 一键）。
//          **不动实体行**——鬼影**不在 `world.entities` 里**（理由见 wraiths.js
//          头注释：鬼若进 `world.entities` 会被 `stepCultivation` 的觉醒骰 / 修炼 /
//          飞升整条链吃掉，不报错且污染上界人口账），所以它们有自己的容器与自己的
//          22 字段形状，没有「新列追加在行尾」的下标风险。
//          上界与幽冥 payload **刻意不含**这两个键（缝开在凡间、鬼爬进凡间，
//          见两处 `serialize*World` 的 delete 段）。
//          为什么**不升版本号**：与 v8 内追加 `rifts` 那段**逐字同理由**——「新增
//          世界级键 + 读侧兜底」对老档天然向后兼容（缺键 → 空数组 / 全零账本），
//          升号只会误导后来人以为存在 v12 迁移代码。已复核：读 `v` 处仍只有一处。
const SAVE_VERSION = 11;

// 读档时的查表：道途只存 key、功法只存名字，靠这两张表还原成完整对象。
// 用 Map 而不是每次 find()，是因为读档可能要还原上千个生灵。
const DAO_BY_KEY = new Map(DAO_PATHS.map((p) => [p.key, p]));
// ⚠️ **两张功法表都要进这张查表**：凡间的 `MANUALS` 与幽冥的 `NETHER_TECHNIQUES`
// （D6-3 工程包 C）。功法在存档里**只存名字**（见 `:320` 与 `restoreEntity` 的
// `row[31]` 还原段），所以任何**能进 `entity.techniques` 的名字**都必须在这张表里
// ——漏一张的后果是「那门功法读档后静默消失」，而且**不报错**（`if (manual)` 静默跳过）。
// 幽冥功法经由「凡人捡到幽冥法宝即习得」（`artifacts.js` 的 `giveTo`）进 `techniques`，
// 所以这张表必须认得它们。
const MANUAL_BY_NAME = new Map(
  [...MANUALS, ...NETHER_TECHNIQUES].map((m) => [m.name, m]),
);
const OMEN_BY_KEY = new Map(TRIBULATION_OMENS.map((o) => [o.key, o]));

/**
 * 数值兜底：**只在「不是有限数」时才用默认值**。
 *
 * 千万别写成 `e.mind || 60`。道心会被 clamp 到 0，而 `0 || 60` 等于 60——
 * 一个道心尽失的修士，存档再读回来就道心 60 了。实测抓到过：
 * 513 位生灵里有 2 位读档后道心对不上，查了半天才发现是 `||` 干的。
 * 同类字段（气运、口粮、因果、心魔、污染、修为）一律走这里，
 * 免得以后又有人手写一个 `||`。
 */
function num(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function encodeQuantized(source, max = 1) {
  const out = new Uint16Array(source.length);
  const scale = 65535 / max;
  for (let i = 0; i < source.length; i += 1) {
    const v = source[i] / max;
    out[i] = v <= 0 ? 0 : v >= 1 ? 65535 : Math.round(v * 65535);
  }
  const bytes = new Uint8Array(out.buffer);
  return bytesToBase64(bytes);
}

function decodeQuantized(text, length, max = 1) {
  const bytes = base64ToBytes(text);
  const view = new Uint16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const out = new Float32Array(length);
  const scale = max / 65535;
  for (let i = 0; i < length; i += 1) out[i] = (view[i] || 0) * scale;
  return out;
}

function encodeBytes(source) {
  return bytesToBase64(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
}

function decodeBytes(text, length) {
  const bytes = base64ToBytes(text);
  const out = new Uint8Array(length);
  out.set(bytes.subarray(0, length));
  return out;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + chunk)));
  }
  return btoa(binary);
}

function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function serializeWorld(world, meta = {}) {
  return {
    v: SAVE_VERSION,
    app: APP.version,
    w: world.w,
    h: world.h,
    seed: world.seed,
    day: world.day,
    year: world.year,
    nextEntityId: world.nextEntityId,
    nextVillageId: world.nextVillageId,
    nextFactionId: world.nextFactionId,
    terrain: {
      height: encodeQuantized(world.height, 1),
      water: encodeQuantized(world.water, 1),
      temp: encodeQuantized(world.temp, 1),
      moist: encodeQuantized(world.moist, 1),
      veg: encodeQuantized(world.veg, 1),
      fire: encodeQuantized(world.fire, 1),
      riverBase: encodeQuantized(world.riverBase, 0.05),
      type: encodeBytes(world.type),
      over: encodeBytes(world.over),
      struct: encodeBytes(world.struct),
      owner: encodeBytes(world.owner),
    },
    entities: world.entities.map((e) => [
      // ⚠️ id 必须存。宗门记着 leaderId、关系网以 id 为键，
      // 少了这一列，读档后「谁是掌门」「谁跟谁有仇」就全断线了。
      num(e.id, 0),
      e.sp, e.x, e.y,
      e.hp, e.maxHp, e.age, e.lifespan,
      e.faction, e.village, e.state, e.timer,
      e.tx, e.ty, e.anim, e.face, e.name, e.kills,
      // ── 以下为修仙层（v2 新增）──────────────────────────
      num(e.level, 0),
      num(e.exp, 0),
      e.root || null,
      e.dao ? e.dao.path.key : null,
      e.dao ? e.dao.stage : 0,
      e.dao ? e.dao.progress : 0,
      num(e.karma, 0),
      num(e.fortune, 40),
      num(e.heartDemon, 0),
      // ⚠️ 这里原来写的是 `e.mind || 60`。道心会被 clamp 到 0，
      // 而 `0 || 60` 等于 60——一个道心尽失的修士，存档再读回来就道心 60 了。
      // 实测抓到过：513 位生灵里有 2 位读档后道心对不上。
      num(e.mind, 70),
      num(e.pollution, 0),
      e.daoTitle || null,
      e.bloodline || null,
      (e.techniques || []).map((t) => t.name),
      e.beast || null,
      e.madUntil ?? -1,
      // ── 法宝（v4 新增）──────────────────────────────────
      // 这一列原来是 `num(e.equipTier, 0)`——而 `equipTier` **从来没有人写过**，
      // 存的一直是个恒为 0 的常量。现在换成真的法宝对象数组，**整个存**：
      // 每件法宝自带履历（历任主人与年份），履历就是这件东西的全部故事，
      // 只存 id 再指望从别处还原是还原不出来的。
      e.artifacts || [],
      num(e.trialCount, 0),
      e.lastTrialDay ?? -1e9,
      e.lastDemonDay ?? -1e9,
      e.lastKarmaDay ?? -1e9,
      num(e.lastAwakenTry, 0),
      e.lastBeastDay ?? -1e9,
      num(e.foundedSect, 0),
      // 口粮（吃饱和度）与所修禁术：都会改变后续演化，不能丢。
      num(e.carried, 0),
      e.forbidden || null,
      e._lastOmen ? (e._lastOmen.key || null) : null,
      // 关系网：只存 [对方 id, 类型, 分值]，读档时按 id 重新连
      e.relations ? Array.from(e.relations.entries()).map(([id, r]) => [id, r.type, r.score]) : [],
      // ── 转世（v3 新增）──────────────────────────────────
      // 这三列一个都不能少：
      //   · `soulId` 是「这一世由哪个神魂转来」，测试靠它断言同一个神魂不会转世两次；
      //   · `pastLife` 里有记忆碎片、宿缘清单与「想起来没有」——
      //     少存 `remembered`，读档后已经觉醒过的人会再觉醒一次，
      //     编年史里凭空多出一批「想起前世」，宿缘也会被重复接进关系网。
      num(e.incarnation, 1),
      e.soulId ?? null,
      e.pastLife || null,
      // ── 家世（v5 新增）──────────────────────────────────
      // 八列一个都不能少：
      //   · `surname` / `parentA` / `parentB` 是世系的两条边——丢了它们，
      //     读档后「谁是谁的后人」就断了，世家在第二代集体失忆；
      //   · `heritageQ` / `heritageB` / `heritageM` 是**出生时记下的双亲快照**。
      //     少存这三列，读档后新生的孩子继承不到天资与家传血脉，
      //     家世会从「能遗传」退化成「只是个标签」，而且一样不报错；
      //   · `clan` / `gen` 是世家归属与世代。
      e.surname || null,
      num(e.parentA, 0),
      num(e.parentB, 0),
      num(e.clan, 0),
      num(e.gen, 0),
      num(e.heritageQ, -1),
      e.heritageB || null,
      e.heritageM || null,
      // ── 传记 / 夺舍 / 脱壳（v6 新增）────────────────────
      //   · `log` 一律写成数组（空的也写 `[]`）。写 `null` 会让「新实体是 []、
      //     读档后是 null」——键都在，值不同，逐字段比对立刻红。
      //     空数组一行只占 3 个字节，不值得为它引入两种形状；
      //   · `possessedBy` 是快照对象，不是 id（理由见文件头 v5 → v6 注释）；
      //   · `nascentEscapeUsed` 一律归一成布尔：`|| false` 把 undefined 也收进来。
      e.log || [],
      e.possessedBy || null,
      e.nascentEscapeUsed || false,
      // ── 飞升者来历（v8 内追加，row[60..61]）────────────────
      // 上界副本实体身上的**来源快照**，由 `world/planes.js` 的 `arriveUpper` 落。
      //   · `fromMortal` —— 是不是自凡间飞升上来的（上界面板「新来的，从井里」、
      //                     `inkbox-longrun.mjs` 那条「飞升者在上界活得下去」都读它）；
      //   · `fromSect`   —— 来之前在凡间所属宗门的**名字字符串**，`null` 写成空串。
      //
      // ⚠️ 这两列**必须无 id**（`mortalId` 那种凡间裸 id 一律不许进来）：
      //    两界的 `nextEntityId` 各自从 1 / `UPPER_ID_BASE` 起编，凡间 id 与上界 id
      //    **同段会撞号**（`World.js:140`），存下来就是一个指向别人的悬垂指针。
      //    存名字则永不悬垂（同 v7 逝者名录、v6 `possessedBy` 的理由）。
      e.fromMortal || false,
      e.fromSect || '',
      // ── 养伤截止日（row[62]，2026-09-22 追加在**行尾**）──────────
      // 存的是 `world.day` 坐标下的绝对日。`-1e9` = 从没养过伤。
      // ⚠️ 只能追加在行尾：中间插一列会把 `row[45]`（关系网）与
      //    `row[46..48]`（转世）的下标全顶歪，而**那种错不报错**。
      // ⚠️ 老档（62 列）这一格是 `undefined`，读侧必须逐键兜底。
      e.restUntil ?? -1e9,
      // ── 幽冥鬼魂（v11 内追加，row[63..67]）──────────────────
      // 契约 reports/d5/BATCH2-DESIGN.md §三。非幽冥实体（凡间 / 上界）这五格
      // 一律落到**稳定默认值**，所以凡间与上界的存档形状**一格没变**。
      //   · `soulKind`     —— `'ghost'`（普通鬼魂）| `'ghostCultivator'`（鬼修）| null。
      //     这是「这个实体是不是幽冥鬼魂」的唯一开关，渲染与 stepNether 都读它；
      //   · `ghostOf`      —— **身份快照对象**（不是 id）。`ref` 用 `mortal:<id>` 字符串，
      //     理由同 v8 的 `fromMortal` / v6 的 `possessedBy`：凡间 id 与幽冥 / 上界 id
      //     **同段会撞号**，存裸 id 就是指向别人的悬垂指针，且**不报错**；
      //   · `ghostRancor`  —— 积怨（鬼修升阶燃料；普通鬼魂恒 0）；
      //   · `ghostDecayDay`—— 消散日（`world.day` 坐标）。`-1e9` = 永不消散；
      //   · `soulBind`     —— 魂池链接（**仅 linger 普通鬼魂有**，指向魂池里那条
      //     「这只鬼在等的魂」，**不是**凡间实体 id）。
      //     ⚠️ 它与 row[47] 的 `soulId`（「这一世由哪个神魂**转来**」= 来源）**不是一回事**：
      //        那是**来源**，这是**绑定**。2026-09-23 曾共用 `soulId` 一名，被判定为
      //        「同名不同义 = 口径混淆」而拆开——**别再合并回去**。两者都是值不是 id 引用，
      //        也都不指向凡间实体。
      // ⚠️ 只能追加在**行尾**：中间插一列会把 `row[45]`（关系网）等下标全顶歪，
      //    而**那种错不报错**（同上面 row[62] 的警告）。
      // ⚠️ 老档（63 列）这五格是 `undefined`，读侧必须逐键兜底。
      e.soulKind ?? null,
      e.ghostOf ?? null,
      num(e.ghostRancor, 0),
      num(e.ghostDecayDay, -1e9),
      e.soulBind ?? null,
      // ── 不良状态印记（D6-3 工程包 D，row[68]）──────────────────
      // 存的是**快照对象** `{ ghostName, ghostLevel, day, until, mode }`，不是 id：
      // 跨位面身份带世界限定符（鬼修的 id 在幽冥段 `NETHER_ID_BASE`），
      // 存裸 id 就是悬垂指针（同 v6 `possessedBy` / v8 `fromMortal` 的理由）。
      //   · `mode: 'possess'` + `until: -1` = 被鬼修真夺舍（永久）；
      //   · `mode: 'haunt'`   + `until > day` = 被高阶鬼修暂时附身（行为锁读到它）。
      // ⚠️ 只能追加在**行尾**：中间插一列会把 `row[45]`（关系网）等下标全顶歪，
      //    而**那种错不报错**（同 row[62] / row[63..67] 的警告）。
      // ⚠️ 老档（68 列）这一格是 `undefined`，读侧必须逐键兜底。
      e.possessionScar || null,
    ]),
    villages: world.villages.map((v) => ({
      id: v.id, x: v.x, y: v.y, faction: v.faction, name: v.name,
      pop: v.pop, food: v.food, houses: v.houses,
      fields: v.fields || 0,
      // 建房节奏：不存的话读档后所有村子会同时开工，房屋数量出现台阶。
      buildCooldown: v.buildCooldown ?? 20,
      level: v.level, hp: v.hp, age: v.age,
    })),
    factions: world.factions.map((f) => ({
      id: f.id, name: f.name, color: f.color, accent: f.accent,
      element: f.element || null, doctrine: f.doctrine || null,
      villages: f.villages, pop: f.pop, followers: f.followers || 0, kills: f.kills,
      reputation: f.reputation ?? 30,
      stability: f.stability ?? 70,
      // 资源账本：stepOneSect 每 tick 都会读改写，不存的话读档后第一帧就崩。
      resources: f.resources || { spiritStone: 20, heritage: 5, provisions: 30 },
      leylines: f.leylines || [],
      relations: f.relations ? Array.from(f.relations.entries()) : [],
      // 门史已在 stepOneSect 里封顶（SECT_HISTORY_CAP），直接整段存。
      history: f.history || [],
      founderId: f.founderId || 0,
      founderName: f.founderName || null,
      leaderId: f.leaderId || 0, leaderName: f.leaderName || null,
      // 长老只存实体 id，读档后按 id 反查即可（和关系网一个道理）。
      elders: f.elders || [],
      foundedDay: f.foundedDay ?? 0,
      destroyedDay: f.destroyedDay ?? -1,
      destroyReason: f.destroyReason || null,
      lastConflictDay: f.lastConflictDay ?? -1e9,
      claim: f.claim || null,
      // 地盘不进存档：它是推导量，由地形 + 宗门资产每三十天重算一次
      // （见 sim/territory.js）。存下来反而危险——玩家把山挖断之后，
      // 旧地盘会跟着存档一起活过来，跟脚下的地形对不上。
      capitalX: f.capitalX, capitalY: f.capitalY,
      war: Array.from(f.war),
    })),
    // ── 修仙层的地图物件 ──────────────────────────────
    leylines: world.leylines || [],
    nextLeylineId: world.nextLeylineId || 1,
    sites: world.sites || [],
    nextSiteId: world.nextSiteId || 1,
    // ── 法宝 ──
    // ⚠️ 这里只存**无主**的那些（躺在地上等人捡的）。在手的法宝在各自
    // `entity.artifacts` 里，不重复存——否则同一件东西会有两份状态，
    // 读档时哪份是真的就说不清了。`artifactLog` 是累计账本（造出过多少、
    // 碎过多少），单调递增，必须存：它是长测判断「法宝这套玩法还在不在转」
    // 的唯一读数，编年史那 400 条滚动窗口会把它顶出去。
    artifacts: world.artifacts || [],
    nextArtifactId: world.nextArtifactId || 1,
    artifactLog: world.artifactLog
      || { forged: 0, found: 0, inherited: 0, broken: 0, spirit: 0, spiritLost: 0, decayed: 0, left: 0, netherIn: 0, netherOut: 0 },
    ascended: (world.ascended || []).slice(-120),
    plane: world.plane || 'mortal',
    // ── 转世 ──
    // 神魂池是**真实状态**，不是推导量：它记着「哪些人的命还排着队要回来」。
    // 不存的话读档后这些神魂凭空消失，此后两条世界线走出的转世次数就不一样了。
    souls: world.souls || [],
    nextSoulId: world.nextSoulId || 1,
    // ── 世家 ──
    // 「谁开的族、传到第几代、声望多少、家学是什么、什么时候断的」都是真实状态，
    // 反推不出来。而「现在还剩几个人、有没有绝」是每次普查现算的（见 sim/family.js），
    // 不存——存推导量迟早会和世界对不上。
    clans: world.clans || [],
    nextClanId: world.nextClanId || 1,
    clanLog: world.clanLog || { founded: 0, ended: 0 },
    lastClanFoundDay: world.lastClanFoundDay ?? -1e9,
    // ── 大战 ──
    // 进行中的大战带着参战名单、已打几阵、攒了多少紧张度，全是反推不出来的
    // 真实状态；不存的话读档后所有战事凭空消失、账本归零，长测读数与
    // 「接着玩」那条线就对不上了。而战力、接壤表、参与方强弱一律**现算**
    // （territory.js 的规矩：推导量不进存档）。
    wars: world.wars || [],
    nextWarId: world.nextWarId || 1,
    warLog: world.warLog || { declared: 0, resolved: 0, destroyed: 0, casualties: 0 },
    // ── 空间裂缝（三界并存 · 阶段三，见 reports/design/upperworld.md §4）──
    //
    // **存在凡间**（规格 §4.2）：用户原话是「上界视界和**下界**的边缘」，
    // 所以裂缝开在凡间的边缘，挂 `world.rifts`。上界要显示时按坐标对位读
    // （两图同尺寸）。这三个键**刻意不进上界 payload**（见 serializeUpperWorld）。
    //
    // 逐字段显式写，**不展开整个对象**：本项目的规矩是「写什么由代码决定，
    // 不由对象当前恰好有哪些键决定」。裂缝记录是**纯数据、无任何 id 引用**
    // （铁律三），字段恰好是契约那 10 个：id / x / y / strength / openedDay /
    // age / closedDay / leaked / crossed / targetPlane。
    //
    // ⚠️ **`age` 必须存**（契约 C1.1）：它是「这条缝在**视界开启期间**累积的
    // 天数」，是玩家历次开关视界的函数——`world.day` 与 `openedDay` 都推不出它，
    // 所以它**不是派生量**，进档不违反铁律二。不存的话读档后每条缝都「返老还童」
    // 回到 age 0，寿命从头再算，玩家读一次档就能把一条快闭合的缝续命。
    //
    // ⚠️ **`targetPlane` 必须存**（D6-2 工程包 B2）：它是「这条缝连的是上界
    // 还是幽冥」，**推不出来**——一条缝能活 30–40 年，玩家关掉视界以后它仍然
    // 必须知道自己原本连接哪里（裂缝的行为按它分流，见 `sim/rifts.js`）。
    // 不存的话读档后所有幽冥缝都会退回 `undefined`，而 `stepRifts` 把
    // `undefined` 当**上界缝**处理（那是老档的兼容判据）——于是读一次档，
    // 一世界的幽冥缝就集体改成往上界漏物，**静默且不可逆**。
    //
    // ⚠️ 刻意**不存** `radius` 与 `peakDay`：两者都是 `age` 加公式的推导量
    //    （铁律二：能现算的一律现算），半径由 `rifts.js` 的
    //    `riftRadiusAt(rift)` 现算。存了迟早和公式对不上，还白占体积。
    //
    // 账本 `riftLog` 必须存：单条裂缝闭合后会被从 `rifts` 剔除，于是
    // 「从来没裂过缝」与「裂过很多、全闭合了」在读数上长得一模一样
    // （同 `warLog` / `possessionLog` / `deadLog` 的理由）。
    rifts: (world.rifts || []).map((r) => ({
      id: num(r.id, 0),
      x: r.x,
      y: r.y,
      strength: num(r.strength, 0),
      openedDay: num(r.openedDay, 0),
      age: num(r.age, 0),
      closedDay: num(r.closedDay, -1),
      leaked: num(r.leaked, 0),
      crossed: num(r.crossed, 0),
      // 归一成 `'upper'` / `'nether'` 两个字面量之一：写侧就把形状钉死，
      // 免得读侧兜底与写侧形状不一致（save-equiv 的键集判据会红）。
      // 缺键（手工构造的测试记录）→ `'upper'`，与 `openRifts` 的归一同一口径。
      targetPlane: r.targetPlane === 'nether' ? 'nether' : 'upper',
    })),
    nextRiftId: world.nextRiftId || 1,
    // 显式补齐五个键，不写 `world.riftLog || {...}`：老形状（只有 4 个键）
    // 会让 payload 少一个 `lost`，而读侧兜底会补上——两侧形状不同，
    // save-equiv 的键集判据会红。写侧就把它钉成 5 键，形状只有一种。
    riftLog: {
      opened: num(world.riftLog && world.riftLog.opened, 0),
      closed: num(world.riftLog && world.riftLog.closed, 0),
      leaked: num(world.riftLog && world.riftLog.leaked, 0),
      crossed: num(world.riftLog && world.riftLog.crossed, 0),
      lost: num(world.riftLog && world.riftLog.lost, 0),
    },
    // ── 凡间鬼影（D6-3 工程包 B）──────────────────────────────
    // 自幽冥缝爬入凡间的鬼。**存在凡间**（同 `rifts` 的理由：缝开在凡间边缘），
    // 所以这两个键也**刻意不进上界 / 幽冥 payload**（见两处 `serialize*World`）。
    //
    // ⚠️ 这批实体**不在 `world.entities` 里**（理由见 `sim/wraiths.js` 头注释：
    //    鬼若进 `world.entities` 会被 `stepCultivation` 的觉醒骰 / 修炼 / 飞升
    //    整条链吃掉，不报错且污染上界人口账）。所以它**不能**复用上面那套
    //    `entities` 的 68 列行数组——这里逐字段显式写。
    //
    // ⚠️ **键集契约 = `sim/wraiths.js` 的 `WRAITH_TEMPLATE`**（22 个键）。
    //    读侧不手抄兜底表，而是调 `restoreWraiths` 让模板单源定义形状——
    //    往模板加字段时只有一处要改，不会出现「写了但没读回来」的静默漏键。
    //    ⚠️ 往模板加字段后**必须回来这里补一行**（写侧是显式的，故意如此：
    //       「写什么由代码决定，不由对象当前恰好有哪些键决定」）。
    //
    // ⚠️ `id` 必须存，且**保留幽冥段的值**（`NETHER_ID_BASE` 段）：它是
    //    「这只鬼从幽冥来的」这件事在数据上的唯一痕迹，也是「凡间鬼影容器
    //    与 `world.entities` 结构上不相交」的依据（铁律三）。
    // ⚠️ `ghostOf` 是**身份快照对象**（全是值、零 id 引用，同幽冥实体的
    //    `row[64]`）：整存，不存引用。存引用会在读档后指向一个已经不存在的对象。
    // ⚠️ `dissolveDay` 是 `world.day` 坐标下的**绝对日**（锚在 `climbedDay`）。
    //    必须存：它是「这只鬼在凡间还能飘多久」，读档后 `world.day` 会继续走，
    //    存绝对日才能让两条轴对得上，不会「读一次档续命」。
    wraiths: (world.wraiths || []).map((e) => ({
      id: num(e.id, 0),
      sp: e.sp,
      x: e.x,
      y: e.y,
      tx: e.tx,
      ty: e.ty,
      vx: num(e.vx, 0),
      vy: num(e.vy, 0),
      hp: num(e.hp, 0),
      maxHp: num(e.maxHp, 0),
      level: num(e.level, 0),
      soulKind: e.soulKind || 'ghost',
      ghostOf: e.ghostOf || null,
      name: e.name || null,
      rancor: num(e.rancor, 0),
      fromRiftId: num(e.fromRiftId, 0),
      climbedDay: num(e.climbedDay, 0),
      dissolveDay: num(e.dissolveDay, 0),
      state: e.state || 'wander',
      timer: num(e.timer, 0),
      anim: num(e.anim, 0),
      face: num(e.face, 1),
    })),
    // 账本**只有一个键**（`dissolved`，累计消散数）。刻意不存「累计来过」——
    // 它 = `wraiths.length + dissolved`，**现算**（铁律二）。逐键显式写，
    // 不写 `world.wraithLog || {...}`（对象存在却少键时会漏，同上面 riftLog）。
    wraithLog: {
      dissolved: num(world.wraithLog && world.wraithLog.dissolved, 0),
    },
    // ── 魂路累计账本（v9，见 sim/reincarnation.js 的 ensureSoulLog）──
    // 五条魂路里 `ghost`（成鬼修）/ `wraith`（怨魂化）/ `gone`（魂火散尽）
    // **从不进 `world.souls`**，所以在任何「此刻在世」的读数里都看不见——
    // 只有这本账记得住它们各走过多少回。它单调递增、反推不出来：不存的话
    // 「从来没走过这条路」与「走过但没存」在长测读数上完全一样
    // （同 warLog / possessionLog / deadLog / riftLog 的理由）。
    //
    // 逐键显式写，**不写 `world.soulLog || {...}`**（同上面 riftLog 的理由）：
    // 老档五键全缺，`|| {...}` 只在整体缺失时才兜底，一旦对象存在却少键
    // （比如老形状没有第五路 `gone`）就会漏写，让写侧形状与读侧兜底形状
    // 不一致，save-equiv 的键集判据会红。写侧就把它钉成 5 键。
    soulLog: {
      natural: num(world.soulLog && world.soulLog.natural, 0),
      linger: num(world.soulLog && world.soulLog.linger, 0),
      ghost: num(world.soulLog && world.soulLog.ghost, 0),
      wraith: num(world.soulLog && world.soulLog.wraith, 0),
      gone: num(world.soulLog && world.soulLog.gone, 0),
    },
    // ── 夺舍 ──
    // 累计账本，反推不出来。不存的话读档后它归零，于是「夺舍从来没发生」
    // 与「发生过但没存」在长测读数上完全一样——这正是本文件最怕的那类错。
    // （2026-09-17 修：这一行最初漏了，是 save-equiv 的「世界级五样」判据抓出来的。
    //   同一次编辑里 deserialize 侧落地了、serialize 侧没有——两个编辑报 success，
    //   实际只写进去一个。**改动存档格式后必须 grep 复核两侧都在。**）
    //
    // ⚠️ **逐键显式写，不写 `world.possessionLog || {...}`**（同上面 `soulLog` 的理由）：
    //    D6-3 工程包 D 追加了 `crossPlane` / `haunted` 两键，而老世界的
    //    `possessionLog` 只有三键。用 `|| {...}` 兜底的话，对象**存在却少键**时
    //    会原样写出老形状 ⇒ 写侧与读侧键集不一致，save-equiv 判据红。
    //    写侧就把它钉成 5 键。
    possessionLog: {
      succeeded: num(world.possessionLog && world.possessionLog.succeeded, 0),
      failed: num(world.possessionLog && world.possessionLog.failed, 0),
      suspected: num(world.possessionLog && world.possessionLog.suspected, 0),
      crossPlane: num(world.possessionLog && world.possessionLog.crossPlane, 0),
      haunted: num(world.possessionLog && world.possessionLog.haunted, 0),
    },
    // ── 逝者名录 ──
    // 每个离世者一份不可失效的快照 + 累计账本，反推不出来（见 sim/necrology.js）。
    // 不存的话读档后「一个人死了，他的一生就再也翻不出来了」——
    // 而名录里存的全是**已经解析成字符串**的宗门/世家/村名，读回来不会悬垂。
    dead: world.dead || [],
    deadLog: world.deadLog || { total: 0, ascended: 0, evicted: 0 },
    // 卜算子只存「见过没有 / 拨过几次 / 见证过哪几个里程碑 / 说过哪些话」。
    // 台词同时也进了 chronicle，但 chronicle 是 400 条的滚动窗口，
    // 会把他的话顶出去——所以他自己的 log 必须单独存，否则读档后
    // 那块对话条就空了。亲缘是推导量，不存。
    busanzi: {
      met: !!(world.busanzi && world.busanzi.met),
      acts: (world.busanzi && world.busanzi.acts) || 0,
      milestones: (world.busanzi && world.busanzi.milestones) || [],
      peakPop: (world.busanzi && world.busanzi.peakPop) || 0,
      tier: (world.busanzi && world.busanzi.tier) || 0,
      log: (world.busanzi && world.busanzi.log) || [],
    },
    // 编年史本身已在 World.record 里封顶 400 条，这里不必再截。
    chronicle: world.chronicle || [],
    // ── 世界大事账本（v11）──────────────────────────────────
    // 与 `chronicle` **同一类**：三张图（凡间/上界/幽冥）各自都有、都照常存，
    // 所以既不 `delete`（不像 riftLog/soulLog 那样是凡间专属），
    // 也不进 `WORLD_NOT_SAVED`（它不是推导量）。
    // 封顶在 `World.milestone()` 里（MILESTONE_CAP），这里同样不再截。
    milestones: world.milestones || [],
    // ── 世界事件生命周期（v11）─────────────────────────────
    // WorldEvents 的倒计时、活动灾祸和结局历史属于可变的世界状态；旧档没有时
    // 由 Life 创建一套新计时器。这里存快照而不存运行时控制器，避免保存 world 引用。
    worldEvents: world.worldEventState || null,
    // ── 上界（v8）──────────────────────────────────────────
    // 凡间 world 上挂着 `world.upper` 这个引用时才写这一块（main.js 的 newWorld 里设）。
    //
    // 为什么写成「存在才写」而不是「一律写」：单世界的老档 / 测试里 `world.upper`
    // 是 undefined，一律写会得到一个 `upper: undefined` 的键——它 `hasOwnProperty`
    // 为真、`JSON.stringify` 却把它整个丢掉，于是「写了」与「没写」落盘后长得一模一样，
    // 而 save-equiv 的「payload 顶层有没有没接进比对的键」那条会当场红。
    // （同 `X: undefined` 那类坑，见 scripts/inkbox-save-equiv.mjs:266 那段注释。）
    ...(world.upper ? { upper: serializeUpperWorld(world.upper) } : {}),
    // ── 幽冥界（v10）──────────────────────────────────────────
    // 与上界**逐字同形**的「存在才写」（理由见上面 `upper` 那一段：
    // `nether: undefined` 会 `hasOwnProperty` 为真、`JSON.stringify` 却把它丢掉，
    // 于是「写了」与「没写」落盘后长得一模一样，而 save-equiv 的顶层键判据会红）。
    ...(world.nether ? { nether: serializeNetherWorld(world.nether) } : {}),
    meta,
  };
}

export function deserializeWorld(data) {
  const preset = { w: data.w, h: data.h };
  const world = new World(preset.w, preset.h, data.seed);
  const t = data.terrain;
  const size = world.size;
  world.height = decodeQuantized(t.height, size, 1);
  world.water = decodeQuantized(t.water, size, 1);
  world.temp = decodeQuantized(t.temp, size, 1);
  world.moist = decodeQuantized(t.moist, size, 1);
  world.veg = decodeQuantized(t.veg, size, 1);
  world.fire = decodeQuantized(t.fire, size, 1);
  if (t.riverBase) world.riverBase = decodeQuantized(t.riverBase, size, 0.05);
  world.type = decodeBytes(t.type, size);
  world.over = decodeBytes(t.over, size);
  world.struct = decodeBytes(t.struct, size);
  world.owner = decodeBytes(t.owner, size);

  restoreWorldState(world, data);

  // ── 上界（v8）──────────────────────────────────────────
  // 有 `payload.upper` 就照它还原；**v7 及更早的老档没有这一块**，就地生成一个。
  //
  // 为什么老档要「生成」而不是留 null：留 null 就是「只在一侧存在的字段」——
  // 新世界的人有上界、老档读回来的人没有，于是任何遍历 world 的代码从此对不上，
  // 而且不报错。理由与下面 `busanzi` 那段 v1 降级、以及 `dead`/`deadLog` 一模一样。
  //
  // ⚠️ `preset` 只传 `{ w, h }` 是**刻意的**：存档里存的是**尺寸**，不是预设名。
  //    两张图必须同尺寸（视界是画中画裁剪贴图，尺寸不同直接对不上），
  //    而 `WORLD_PRESETS` 的 key 是可以被改标签、被增删的——按 key 去查表还原
  //    迟早会出现「同一个档在不同版本读出来尺寸不一样」。存什么就用什么。
  //
  // ⚠️ `seed` 传的是**凡间种子**（`data.seed`），**不要**先 `deriveUpperSeed` 一次：
  //    `generateUpperWorld` 内部自己派生（见文件头 import 处那段注释），
  //    再派生一次是双重派生，异或自逆 → 上界种子恰好退回凡间种子。
  //
  // ⚠️⚠️ 两处**都是**双重派生，两个方向各栽一次，别只防一边：
  //    · 这条降级分支：别在传进去**之前**先派生（`deriveUpperSeed(data.seed)`）；
  //    · 下面 `deserializeUpperWorld` 的第二个参数：别传 `data.upper.seed`。
  //      那个值**已经是派生后的上界种子**，喂回 `generateUpperWorld` 会被再派生一次，
  //      异或自逆 → 同样退回凡间种子。
  //    两条路的后果一模一样：`world.seed` 相等 → `Life` 的
  //    `warRng = mulberry32(seed ^ 0x776172)`（`life.js:124`，构造函数里派生、
  //    外部覆盖不了）在两界完全相同，两张图的战争随机流逐次重合。
  //    **不报错**，只是「上界那场仗」与「凡间那场仗」永远同时同签发生。
  //    13:57 那次修的就是这里（第一版写成了 `deriveUpperSeed(data.seed)`）——
  //    是失手，不是有意；由 upper-gen 复核 `worldgenUpper.js:578` 的
  //    「seed 参数收的是凡间种子」契约后改掉。
  world.upper = data.upper
    ? deserializeUpperWorld(data.upper, data.seed)
    : generateUpperWorld({ preset: { w: data.w, h: data.h }, seed: data.seed });

  // ── 幽冥界（v10）──────────────────────────────────────────
  // 与上界**逐字同形**：有 `payload.nether` 就照它还原；**v9 及更早的老档没有这一块**，
  // 就地生成一个（理由见上面 upper 那一段：留 null 就是「只在一侧存在的字段」）。
  //
  // ⚠️ `seed` 传的是**凡间种子**（`data.seed`），**不要**先 `deriveNetherSeed` 一次，
  //    也**不要**传 `data.nether.seed`——两处都是**双重派生**（异或自逆），
  //    后果与上界那两处完全一样：`nether.seed === mortal.seed`，
  //    三界的 `warRng`（`life.js:124` 从 `world.seed` 派生、外部覆盖不了）逐次重合，
  //    而且**不报错**。见上面 `deserializeUpperWorld` 的注释与
  //    `worldgenNether.js` 头注释里那段「幽冥的种子为什么必须是 `凡间种子 ^ 0x4e455452`」。
  world.nether = data.nether
    ? deserializeNetherWorld(data.nether, data.seed)
    : generateNetherWorld({ preset: { w: data.w, h: data.h }, seed: data.seed });
  return world;
}

// ── 上界（v8）──────────────────────────────────────────────
//
// 上界是一个**独立的 `World` 实例**，凡间 world 上只挂一个引用 `world.upper`。
// 它的 entities / villages / factions / leylines / … 与凡间完全隔离，
// 所以「两界 id 撞车」这件事不会发生——代价是**它整套都要单独进存档**。

/**
 * 上界**独有**、凡间没有的世界级字段。
 *
 * 为什么不能硬塞进 `serializeWorld` 的通用形状里：那会让**凡间**的 payload
 * 凭空多出几个键，而凡间 world 上并没有这些字段——于是
 * `scripts/inkbox-save-equiv.mjs` 的「世界级字段逐键一致」当场红
 * （左 `undefined` ≠ 右 `{born:0,...}`）。凡间形状与上界形状必须各自自洽。
 *
 * ⚠️ 这份清单必须与 `worldgenUpper.js` 实际挂到 world 上的字段**同源**。
 *    加一处忘一处，就是「读档后上界凭空少一样东西」——不报错，
 *    只是长测读数慢慢和「接着玩」那条线对不上。见规格 §6.2 那张表。
 *
 * ⚠️ `realmCap` / `bottlenecks` **已删**（本轮顺手修的遗留）。核实结论：
 *    全 `src/inkbox` 里除了这一行**没有任何生产者/消费者**——境界天花板由
 *    `core/cultivation.js` 的 `ceilingFor(plane)` **现算**（凡间 60 / 上界 69），
 *    `bottlenecks` 是同一文件里的常量表。它们从来不是上界 world 上的字段，
 *    写侧「存在才写」永不触发，是两条**死条目**。留着反而危险：哪天有人真给
 *    上界挂上 `realmCap`，它会绕过铁律二（能现算的派生量不入档）被写进存档，
 *    造出第二份真源。`scripts/inkbox-save-equiv.mjs` 里那份清单已同步删掉，
 *    并留了一条反向闸门（`derivedLeak`）盯着它们别以状态字段的形式冒出来。
 */
const UPPER_ONLY_KEYS = ['popLog', 'arrivedLog', 'mortalLog'];

/**
 * 上界块的序列化。
 *
 * **先照凡间的形状整个存一遍，再把地形裁到 6 层**——而不是手写一份
 * 「上界专用字段清单」。理由：手写清单就是第二份真相。凡间那边每加一个世界级
 * 字段（大战、世家、逝者名录……），那份清单不会自动跟上；漏掉的那个读档后
 * 凭空消失，而且**不报错**。照 `serializeWorld` 走一遍则天然同形。
 *
 * 裁掉的那几层各自有理由（规格 §1.3）：
 *   · `temp` / `moist` —— 生成期产物，运行期只被 `classify` / `decayOverlay` **读**；
 *     读档时照同 seed 重新生成一次就能逐格拿回来（见 deserializeUpperWorld）。
 *     省下的是中堂两层量化 Float32 ≈ 276 KB；
 *   · `fire`      —— 上界不跑 `stepFire`（规格 §1.5），恒为 0；
 *   · `riverBase` —— 上界不刻河（规格 §1.4），恒为 0；
 *   · `owner`     —— 凡间那一层本身就是死数据（规格 §1.3 的顺带发现：
 *                   全项目只有 save.js 自己在读写它），上界更不该抄。
 */
function serializeUpperWorld(upper) {
  const payload = serializeWorld(upper);

  const t = payload.terrain;
  payload.terrain = {
    height: t.height, water: t.water, veg: t.veg,
    type: t.type, over: t.over, struct: t.struct,
  };

  // 位面名。`World` 构造器把 `plane` 默认成 `'mortal'`，而上界要写自己的。
  // 这里直接钉成 `'upper'`，**不写成 `upper.plane || 'upper'`**——那句是个
  // 看起来像兜底、实际永远取不到 `'upper'` 的假兜底（构造器已经给了 `'mortal'`）。
  // 本函数只在序列化上界时被调用，所以「是上界」这件事本身就是依据。
  payload.plane = 'upper';

  // 上界专有字段：**存在才写**，不写默认值。
  // 阶段一 `worldgenUpper` 可能还没造出这些字段；一律写默认值会让 payload 里
  // 出现一个 world 上根本没有的键，读档后凭空长出来——那比缺键更难查。
  // 等 worldgenUpper 把它们造出来，两侧（写/读）自动就都覆盖到了。
  for (const key of UPPER_ONLY_KEYS) {
    if (upper[key] !== undefined) payload[key] = upper[key];
  }

  // 空间裂缝是**凡间专属**（规格 §4.2：裂缝开在凡间边缘），上界实例上这三个
  // 字段恒空。`serializeWorld(upper)` 会照凡间形状把它们一起写进来，这里显式删掉。
  //
  // 为什么删而不是「反正空的、留着也无所谓」：
  //   · 留着会让上界 payload 平白多出三个**恒空**的键，读档后 `restoreWorldState`
  //     又把它们还原成空——两份空状态互相印证，看着无害，实则是「上界也跑裂缝」
  //     这个**不存在**的语义被写进了存档格式，后来人会照着它去接线；
  //   · 删掉之后读侧靠 `restoreWorldState` 的兜底把它们补成空（`data.rifts`
  //     缺失 → `[]`），凡间与上界两侧形状各自自洽。
  // 与上面「上界只存 6 层」是同一类裁剪：裁掉的每一项都要写明理由。
  delete payload.rifts;
  delete payload.nextRiftId;
  delete payload.riftLog;
  // 凡间鬼影同理（D6-3 工程包 B）：缝开在凡间，鬼从缝爬进**凡间**——
  // 上界既没有缝也没有爬进来的鬼，这两个键在上界恒空。留着就是「上界也跑
  // 幽冥缝」这个不存在的语义（同上面三条裂缝字段）。读侧靠 `restoreWorldState`
  // 兜底成空数组 / `{dissolved:0}`，两侧形状各自自洽。
  delete payload.wraiths;
  delete payload.wraithLog;
  // 魂路累计账本也是**凡间专属**：上界从不调 `enterNether`，一条魂路都不跑，
  // 这本账在上界恒为零。留着会写进一个「上界也转世」的**不存在**的语义
  // （同上面三条裂缝字段的理由），所以显式删掉；读侧靠 `restoreWorldState`
  // 兜底成五键全零，两侧形状各自自洽。
  delete payload.soulLog;
  // 夺舍累计账本同理（D6-3 工程包 D 复核）：上界不跑 `stepPossession`
  // （`resetUpperSystems` 第 2 条已把它钉成全零），而凡间那侧新加的
  // `crossPlane` / `haunted` 更是「鬼修自幽冥缝夺舍**凡人**」的子账——上界既无
  // 鬼修、也无缝，这两键在上界恒零。留着就是「上界也跑跨位面夺舍」这个
  // **不存在**的语义（同上面 `soulLog` 的理由），所以显式删掉。
  //
  // ⚠️ 这一条**此前漏删**：`soulLog` 与 `possessionLog` 是同一类东西（某界不跑
  //    的累计账本、在 `reset*Systems` 里被显式归零），却只删了前者。读侧靠
  //    `restoreWorldState` 兜底成五键全零，两侧形状各自自洽。
  delete payload.possessionLog;
  return payload;
}

/**
 * 上界块的还原。
 *
 * ⚠️ 这里是「上界只存 6 层」这个设计**唯一的兑现处**，也是最容易留洞的地方：
 *    `classify()` 会读 `temp` / `moist`（`terrain.js:123-124`），
 *    `decayOverlay()` 也会读（`terrain.js:275-283`）。如果只把 6 层填回去、
 *    其余留 `new World()` 的全 0，那么玩家一旦在上界用笔刷（触发 `recomputeTile`
 *    → `classify`）或让 `decayOverlay` 跑起来，地表类型就会按「气温 0、湿度 0」
 *    重算——**整张图变成极地冻原**，而且不报错。
 *
 * 所以做法是：**先照 seed 重新生成一张**（拿回 temp / moist / fire / riverBase），
 * 再用存档里的 6 层**覆盖**它。存档始终是权威，重生成只用来补那几层没存的。
 *
 * 实测确认（见报告）：`deserializeWorld` 走的**不是** `recomputeAll`——只要
 * `type` 存着就走 `recomputeQi`（只算灵气层，不碰 `type`/`temp`/`moist`）。
 * 也就是说：**读档那一刻** `temp`/`moist` 确实不会被读；洞在**读档之后**
 * 玩家一动地形才张开。这里选择「照 seed 重算」而不是「把这两层也存上」，
 * 是为了守住规格 §1.3 的体积账（+276 KB / 中堂）。
 *
 * 前提：`generateUpperWorld` 对同一 `(preset, seed)` 必须**纯确定性**。
 * 哪天它引入 `Date.now()` 或全局可变状态，这里会静默拿回一张错的气候图——
 * 而 `type` 是存档里的旧值，看起来一切正常。
 *
 * @param {object} data       `payload.upper`（上界块）
 * @param {number} mortalSeed **凡间**种子。传它而不是 `data.seed`：
 *   `data.seed` 是**派生后**的上界种子，而 `generateUpperWorld` 要的是凡间种子，
 *   传派生后的进去会被它再派生一次 → 异或自逆 → 上界种子退回凡间种子（见 import 处注释）。
 */
function deserializeUpperWorld(data, mortalSeed) {
  const t = data.terrain;
  // ⚠️ `mortalSeed` 必须是**凡间**种子（调用方传 `data.seed`，即凡间 payload 的 seed）。
  //    绝不能改传 `data.upper.seed`：那是**派生后**的上界种子（= 凡间种子 ^ 0x55505052），
  //    而 `generateUpperWorld` 的契约是「收凡间种子、内部自己派生」
  //    （`worldgenUpper.js:578`）。派生函数是异或，**自逆**——多派生一次就回到原值，
  //    于是 `upper.seed === mortal.seed`，两界 `warRng` 重合，且不报错。
  //    见上面 `deserializeWorld` 那段「两处都是双重派生」的注释。
  const upper = generateUpperWorld({ preset: { w: data.w, h: data.h }, seed: mortalSeed });
  const size = upper.size;

  // 存档里的 6 层覆盖生成结果。剩下那几层（temp / moist / fire / riverBase）
  // 刻意**不覆盖**：它们是生成期量（temp/moist）或在上界恒为 0（fire/riverBase）。
  upper.height = decodeQuantized(t.height, size, 1);
  upper.water = decodeQuantized(t.water, size, 1);
  upper.veg = decodeQuantized(t.veg, size, 1);
  upper.type = decodeBytes(t.type, size);
  upper.over = decodeBytes(t.over, size);
  upper.struct = decodeBytes(t.struct, size);

  // 其余世界级状态与凡间**走同一条路**（见 restoreWorldState 的注释），
  // 但灵气层要传上界自己的公式（凡间那套会把 ×1.8 与仙脉加成整个抹掉）。
  restoreWorldState(upper, data, recomputeUpperQi);

  // 上界专有那几样。写侧是「存在才写」，读侧就对称地「存在才还原」——
  // 否则会造出「序列化结果里没有、world 上却有」的键，读档后凭空长出来。
  for (const key of UPPER_ONLY_KEYS) {
    if (data[key] !== undefined) upper[key] = data[key];
  }
  return upper;
}

// ── 幽冥界（v10）────────────────────────────────────────────
//
// 与上界那一整段**逐字同形**（独立的 `World` 实例 + 顶层一个 `nether` 键），
// 差别只有三处，逐条写在这里，免得后来人以为是抄漏了：
//   1. 裁层后保留的 6 层**键名相同、语义不同**（`water` → 冥河、`veg` → 阴气），
//      这是 §8.9 裁决 8.1① 的直接后果；
//   2. **没有**专用的灵气补算函数——幽冥的 `qi` 走凡间那套 `qiAt`
//      （阴气在 `veg` 层，不在 `qi` 层），所以 `restoreWorldState` 用默认参数就是对的；
//   3. 专属字段清单 `NETHER_ONLY_KEYS` 现含 `popLog`（幽冥世界级账本，见那个常量）。

/**
 * 幽冥**独有**、凡间与上界都没有的世界级字段。
 *
 * ⚠️ 8-B 时这里是空数组（只做地形）；8-C 落账本时按原计划**只加键名**即可——
 * 写侧（`serializeNetherWorld`）与读侧（`deserializeNetherWorld`）都遍历这个清单，
 * 所以加一处就两侧同源，不必再改本文件结构。
 *
 * 现含 `popLog`（幽冥世界级账本，契约 reports/d5/BATCH2-DESIGN.md §四）：
 *   `{ ghostBorn, cultivatorBorn, ghostDied, cultivatorAdvanced, evicted }`。
 * 初值建在 `world/worldgenNether.js` 的 `resetNetherSystems`（与 `ensureUpperPopLog`
 * 同款纪律：形状只有一处定义）。⚠️ 与上界的 `popLog` **不撞车**——两者是不同
 * `World` 实例上的不同对象。
 *
 * 本项目对「造一个没人写、没人读的字段」的立场是明确的：那是「算出来了但没人读」的
 * 死分支，只会让读档形状与真实状态对不上（同 `UPPER_ONLY_KEYS` 里 `realmCap` /
 * `bottlenecks` 被删掉的理由）。`popLog` 已由生成侧写入、面板 / 探针读取，故登记。
 * ⚠️ 加键时**两侧必须同源**——这个清单就是那个「同源」的唯一处，
 *    别在写侧或读侧各写一份字面量（那正是 `ensureUpperPopLog` 收敛掉的那类坑）。
 */
const NETHER_ONLY_KEYS = ['popLog'];

/**
 * 幽冥块的序列化。
 *
 * **先照凡间的形状整个存一遍，再把地形裁到 6 层**——与 `serializeUpperWorld`
 * 逐字同形，理由也逐字相同（手写一份「幽冥专用字段清单」就是第二份真相）。
 * 裁掉的那几层各自有理由：
 *   · `temp` / `moist` —— 生成期产物（只被 `classify` / `decayOverlay` **读**），
 *     读档时照同 seed 重新生成一次就能逐格拿回来（见 `deserializeNetherWorld`）；
 *   · `fire`      —— 幽冥不跑 `stepFire`，恒为 0；
 *   · `riverBase` —— 由 `worldgenNether` 从 seed 刻出来（§8.9 裁决 8.1① 把它钉在
 *                    6 层之外），读档时重算即得；
 *   · `owner`     —— 凡间那一层本身就是死数据，幽冥更不该抄。
 */
function serializeNetherWorld(nether) {
  const payload = serializeWorld(nether);

  const t = payload.terrain;
  payload.terrain = {
    height: t.height, water: t.water, veg: t.veg,
    type: t.type, over: t.over, struct: t.struct,
  };

  // 位面名。与上界同：直接钉成 `'nether'`，**不写 `nether.plane || 'nether'`**——
  // 那句是假兜底（构造器已经给了 `'mortal'`，`||` 的右值永远取不到）。
  // 本函数只在序列化幽冥时被调用，所以「是幽冥」这件事本身就是依据。
  payload.plane = 'nether';

  // 幽冥专有字段：**存在才写**，不写默认值（理由同 `serializeUpperWorld`：
  // 一律写默认值会让 payload 里出现一个 world 上根本没有的键，读档后凭空长出来，
  // 那比缺键更难查）。清单现含 `popLog`（幽冥世界级账本）——它是 `resetNetherSystems`
  // 建出来的真实状态，一定存在，所以这一段会把它写进 payload；读侧对称地还原。
  for (const key of NETHER_ONLY_KEYS) {
    if (nether[key] !== undefined) payload[key] = nether[key];
  }

  // 凡间专属的那几类键：幽冥一样不跑，显式删掉。留着会让 payload 平白多出几个
  // **恒空**的键，读档后 `restoreWorldState` 又把它们还原成空——两份空状态互相印证，
  // 看着无害，实则是「幽冥也跑裂缝 / 也转世 / 也夺舍」这个**不存在**的语义被写进了存档格式，
  // 后来人会照着它去接线（与「上界只存 6 层」是同一类裁剪）。
  //   · `rifts` / `nextRiftId` / `riftLog` —— 裂缝开在**凡间**（§4.2）；
  //   · `wraiths` / `wraithLog`            —— 凡间鬼影（D6-3 工程包 B）：
  //     鬼自凡间的缝爬入**凡间**，幽冥那一侧只负责「送出去」，不持有它们；
  //   · `soulLog`                          —— 魂路账本记在**凡间**那侧
  //     （§8.2「魂池不搬家」：`enterNether` 由凡间的 `Life` 调，幽冥实例上恒为零）；
  //   · `possessionLog`                    —— 夺舍账本记在**凡间**那侧
  //     （`resetNetherSystems` 第 2 条已把它钉成全零；D6-3 工程包 D 新加的
  //     `crossPlane` / `haunted` 是「鬼修自幽冥缝夺舍凡人」的子账，由凡间的
  //     `stepNetherRift` 记账——幽冥那一侧只负责「送出鬼修」，不记这笔账）。
  delete payload.rifts;
  delete payload.nextRiftId;
  delete payload.riftLog;
  delete payload.wraiths;
  delete payload.wraithLog;
  delete payload.soulLog;
  delete payload.possessionLog;
  return payload;
}

/**
 * 幽冥块的还原。
 *
 * ⚠️ 与上界同一个**最容易留洞**的地方：`classify()` 会读 `temp` / `moist`
 *    （`terrain.js:123-124`），`decayOverlay()` 也会读。如果只把 6 层填回去、
 *    其余留 `new World()` 的全 0，那么玩家一旦在幽冥动地形（触发 `recomputeTile`
 *    → `classify`）或让 `decayOverlay` 跑起来，地表类型就会按「气温 0、湿度 0」
 *    重算——**整张图变成极地冻原**，而且不报错。
 *
 * 所以做法与上界完全一致：**先照 seed 重新生成一张**（拿回 temp / moist /
 * fire / riverBase），再用存档里的 6 层**覆盖**它。存档始终是权威，
 * 重生成只用来补那几层没存的。
 *
 * 前提同 `generateNetherWorld` 头注释：对同一 `(preset, seed)` 必须**纯确定性**。
 * 已实测（临时探针，见报告）：同 seed 两次生成逐格相同（0 格差异），
 * 异 seed 逐格不同（51816 / 51840 格差异）。
 *
 * @param {object} data       `payload.nether`（幽冥块）
 * @param {number} mortalSeed **凡间**种子。理由与 `deserializeUpperWorld` 逐字相同：
 *   传 `data.nether.seed`（已派生的幽冥种子）会被 `generateNetherWorld` 再派生一次，
 *   异或自逆 → 退回凡间种子，三界 `warRng` 重合，且**不报错**。
 */
function deserializeNetherWorld(data, mortalSeed) {
  const t = data.terrain;
  const nether = generateNetherWorld({ preset: { w: data.w, h: data.h }, seed: mortalSeed });
  const size = nether.size;

  // 存档里的 6 层覆盖生成结果。剩下那几层（temp / moist / fire / riverBase）
  // 刻意**不覆盖**：它们是生成期量或从 seed 重算的量。
  nether.height = decodeQuantized(t.height, size, 1);
  nether.water = decodeQuantized(t.water, size, 1);
  nether.veg = decodeQuantized(t.veg, size, 1);
  nether.type = decodeBytes(t.type, size);
  nether.over = decodeBytes(t.over, size);
  nether.struct = decodeBytes(t.struct, size);

  // 其余世界级状态与凡间 / 上界**走同一条路**（见 restoreWorldState 的注释）。
  // 第三个参数**不传**：幽冥没有专用灵气公式，默认的 `recomputeQi`（凡间那套）就是对的。
  restoreWorldState(nether, data);

  // 幽冥专有那几样（清单现含 `popLog`）。写侧「存在才写」，读侧对称地「存在才还原」——
  // 否则会造出「序列化结果里没有、world 上却有」的键，读档后凭空长出来。
  for (const key of NETHER_ONLY_KEYS) {
    if (data[key] !== undefined) nether[key] = data[key];
  }
  return nether;
}

/**
 * 把「地形之外的一切世界级状态」灌进一个**已经建好、地形已经解好**的 world。
 *
 * 为什么抽出来：凡间与上界 / 幽冥的地形层**不同**（凡间存 11 层；上界与幽冥
 * 各只存 6 层，见 `serializeUpperWorld` / `serializeNetherWorld`），
 * 但除此之外的世界级状态**一模一样**——日子、计数器、灵脉、宗门、世家、大战、
 * 名录、编年史……
 *
 * 这里如果各写一份，就会出现「凡间补了个兜底、上界忘了补」这种**静默分叉**：
 * 读档后上界少一样东西，不报错，只是几百年后读数对不上。所以只此一份。
 *
 * ⚠️ 顺序有讲究，别随手重排：
 *   · 灵脉必须在最后的 `recomputeQi` **之前**灌进来（灵气 = 地表基数 + 河道 + 灵脉）；
 *   · 法宝 id 兜底必须排在**生灵还原之后**（在手的法宝在 `entity.artifacts` 上）；
 *   · 生灵还原必须排在宗门/聚落还原之前——没有，但宗门关系网按 id 反查，
 *     而关系网的连接写在生灵那一段后面。
 *
 * @param {World} world 已经 new 出来、地形层已经填好的世界
 * @param {object} data  存档 payload（凡间或上界块，两者形状同源）
 * @param {(world: World) => void} [recomputeQiLayer] 灵气层重算函数。
 *   默认凡间的 `recomputeQi`；**上界必须传 `recomputeUpperQi`**——
 *   两界的灵气公式不同（上界是「地表基数 × 1.8 + 仙脉」，凡间是「基数 + 河道 + 灵脉」），
 *   传错不会报错，只会把整层地气按另一套公式覆盖掉。
 */
function restoreWorldState(world, data, recomputeQiLayer = recomputeQi) {
  world.day = data.day || 0;
  world.year = data.year || 0;
  world.nextEntityId = data.nextEntityId || 1;
  world.nextVillageId = data.nextVillageId || 1;
  world.nextFactionId = data.nextFactionId || 1;

  // ── 地图物件先落地 ─────────────────────────────────────
  // ⚠️ 顺序很重要：灵气层 = 地表基数 + 河道 + 灵脉加成。
  // 灵脉必须在 recomputeQi 之前灌进去，否则算出来的灵气全偏，
  // 读档后修士修炼速度、突破概率、地气染色都会整体偏低。
  world.leylines = Array.isArray(data.leylines) ? data.leylines : [];
  world.nextLeylineId = data.nextLeylineId || 1;
  world.sites = Array.isArray(data.sites) ? data.sites : [];
  world.nextSiteId = data.nextSiteId || 1;
  world.artifacts = Array.isArray(data.artifacts) ? data.artifacts : [];
  world.nextArtifactId = data.nextArtifactId || 1;
  world.artifactLog = data.artifactLog
    || { forged: 0, found: 0, inherited: 0, broken: 0, spirit: 0, spiritLost: 0, decayed: 0, left: 0, netherIn: 0, netherOut: 0 };
  world.ascended = Array.isArray(data.ascended) ? data.ascended : [];
  world.souls = Array.isArray(data.souls) ? data.souls : [];
  world.nextSoulId = data.nextSoulId || 1;
  // 兜底：万一 `nextSoulId` 比池里最大的 id 还小（老档或手工改过的档），
  // 就地抬上去。不抬的话新神魂会**撞 id**，两个神魂共用一个 id，
  // 「同一个神魂不会转世两次」这条不变量就再也测不出来了。
  for (let i = 0; i < world.souls.length; i += 1) {
    const id = world.souls[i].id || 0;
    if (id >= world.nextSoulId) world.nextSoulId = id + 1;
  }
  world.plane = data.plane || 'mortal';
  // ── 世家 ──────────────────────────────────────────────
  world.clans = Array.isArray(data.clans) ? data.clans : [];
  world.nextClanId = data.nextClanId || 1;
  world.clanLog = data.clanLog || { founded: 0, ended: 0 };
  world.lastClanFoundDay = data.lastClanFoundDay ?? -1e9;
  // ── 大战 ──────────────────────────────────────────────
  world.wars = Array.isArray(data.wars) ? data.wars : [];
  world.nextWarId = data.nextWarId || 1;
  world.warLog = data.warLog || { declared: 0, resolved: 0, destroyed: 0, casualties: 0 };
  // ── 空间裂缝（三界并存 · 阶段三）────────────────────────
  // 老档（阶段三之前）没有这三项：裂缝确实一条都没有、账本确实为零——
  // 零是诚实的缺省值，不是「猜」。与 `dead`/`deadLog` 的 v7 降级同一个形状。
  //
  // ⚠️ 读侧**三路都要兜住**：
  //   · `data.rifts` 缺失 / 不是数组 → 空数组；
  //   · `data.riftLog` 缺失**或只有旧形状的 4 个键**（少了 `lost`）→ 逐键补 0。
  //     绝不能写 `data.riftLog || {5键}`：那样 4 键的老形状会被原样收下，
  //     `lost` 永久是 `undefined`（`undefined + 1 = NaN` 那一类坑），
  //     长测的「裂缝吞了多少人」读数永远缺一项，而且**不报错**。
  //   · 单条裂缝**没有 `age` 键**（本契约之前的档）→ 按绝对时间估算，见下。
  //   · 单条裂缝**没有 `targetPlane` 键**（D6-2 工程包 B 之前的档）→ 兜 `'upper'`。
  //     这是**诚实缺省**，不是猜：那个契约之前只有上界裂缝这一种可能
  //     （`openRifts` 内部只有上界逻辑），所以「缺键 = 上界缝」是历史事实。
  //     ⚠️ 兜 `'upper'` 与 `'undefined'` 的差别是**承重的**：`stepRifts` 的
  //     冻结判据是 `rift.targetPlane === 'nether'`，两者在这里行为相同，
  //     但存档里的**形状**不同（写侧恒写 10 键）。兜底让老档读进来就是完整
  //     10 键形状，与写侧一致——否则 save-equiv 的键集判据会红在 `rifts` 上。
  //
  // ⚠️ **`age` 的老档兜底必须是「按绝对时间估算」，不能兜成 0**（契约 C1.1）：
  // `age` 是「视界开启期间累积的天数」，老档里没有这个键，但它有
  // `openedDay` 与存档时的 `world.day`——两者之差就是该缝在**绝对时间轴**上
  // 已经活过的天数（老档的曲线本来就按绝对时间走，所以这恰好是它的真值）。
  // 兜成 0 会让老档里所有已存在的缝**全部「返老还童」**回到刚裂开的样子：
  // 曲线从头再涨一遍、寿命重新计时——玩家读一次档，世界里那些快闭合的缝
  // 就集体续命 30–40 年，静默改变老档行为，而且不报错。
  // `Math.max(0, ...)` 防负数：`openedDay` 比 `day` 大只在手工构造的档里出现。
  world.rifts = Array.isArray(data.rifts)
    ? data.rifts.map((r) => ({
      id: num(r.id, 0),
      x: r.x,
      y: r.y,
      strength: num(r.strength, 0),
      openedDay: num(r.openedDay, 0),
      age: Number.isFinite(r.age)
        ? Math.max(0, r.age)
        : Math.max(0, (world.day || 0) - num(r.openedDay, 0)),
      closedDay: num(r.closedDay, -1),
      leaked: num(r.leaked, 0),
      crossed: num(r.crossed, 0),
      // 老档缺键 → `'upper'`（诚实缺省，理由见上面那段）。认不出别的值也归 `'upper'`：
      // 与 `openRifts` 的归一同一口径，两边都只有两个字面量。
      targetPlane: r.targetPlane === 'nether' ? 'nether' : 'upper',
    }))
    : [];
  world.nextRiftId = data.nextRiftId || 1;
  world.riftLog = {
    opened: num(data.riftLog && data.riftLog.opened, 0),
    closed: num(data.riftLog && data.riftLog.closed, 0),
    leaked: num(data.riftLog && data.riftLog.leaked, 0),
    crossed: num(data.riftLog && data.riftLog.crossed, 0),
    lost: num(data.riftLog && data.riftLog.lost, 0),
  };
  // 魂路累计账本（v9）。老档（v9 之前）没有这一项，五键兜底成全零——
  // 不是「猜」，是「确实不知道」：那些世界里的魂路走向在存档那一刻就没被
  // 记下来，补不出来。零是诚实的缺省值。逐键显式写（同上面 riftLog），
  // 缺哪个键补哪个，不写 `data.soulLog || {...}`（对象存在却少键时会漏）。
  world.soulLog = {
    natural: num(data.soulLog && data.soulLog.natural, 0),
    linger: num(data.soulLog && data.soulLog.linger, 0),
    ghost: num(data.soulLog && data.soulLog.ghost, 0),
    wraith: num(data.soulLog && data.soulLog.wraith, 0),
    gone: num(data.soulLog && data.soulLog.gone, 0),
  };
  // 兜底：`nextRiftId` 必须比世上最大的裂缝 id 还大。理由同下面大战 / 世家那两段——
  // 撞 id 的后果是「两条裂缝共用一个 id」，按 id 闭合 / 移除时会动错那一条，
  // 而 `riftLog` 照样在涨，读档当时看不出任何异常。
  for (let i = 0; i < world.rifts.length; i += 1) {
    const id = world.rifts[i].id || 0;
    if (id >= world.nextRiftId) world.nextRiftId = id + 1;
  }
  // ── 凡间鬼影（D6-3 工程包 B）────────────────────────────
  // 老档（本包之前）没有这两项：确实一只鬼都没爬出来、账本确实为零——零是
  // 诚实的缺省值，不是「猜」（同上面 `rifts` / `dead` 的降级形状）。
  // ⚠️ 形状**不在本文件手抄**：交给 `restoreWraiths`（`sim/wraiths.js`），
  //    它按 `WRAITH_TEMPLATE` 逐键兜底、丢弃野键。写侧是显式的 22 字段，
  //    读侧是模板单源——两边都由「模板」这一份真相约束，不会各写一份形状。
  // ⚠️ 同理**不写** `data.wraithLog || {dissolved:0}`：逐键兜底，缺哪个补哪个。
  restoreWraiths(world, data.wraiths);
  world.wraithLog = { dissolved: num(data.wraithLog && data.wraithLog.dissolved, 0) };
  // 夺舍累计账本。老档（v6 之前）没有这一项，兜底成全零——不是「猜」，
  // 是「确实不知道」：那些世界里的夺舍次数在存档的那一刻就没被记下来，
  // 补不出来。零是诚实的缺省值。
  // ⚠️ **逐键兜底**（同写侧的理由）：D6-3 工程包 D 追加的 `crossPlane` / `haunted`
  //    在本次改动之前写下的档里不存在，缺哪个补哪个——不能整体 `|| {...}`，
  //    那样「对象存在却少键」会漏补。
  world.possessionLog = {
    succeeded: num(data.possessionLog && data.possessionLog.succeeded, 0),
    failed: num(data.possessionLog && data.possessionLog.failed, 0),
    suspected: num(data.possessionLog && data.possessionLog.suspected, 0),
    crossPlane: num(data.possessionLog && data.possessionLog.crossPlane, 0),
    haunted: num(data.possessionLog && data.possessionLog.haunted, 0),
  };
  // 逝者名录（v7）。老档（v7 之前）没有这两项：名录确实没有内容，账本确实为零——
  // 零是诚实的缺省值，不是「猜」。注意 `data.X || 默认值` 会把「存了默认值」
  // 与「根本没这个键」伪装成同一个结果，所以老档判据必须同时查**读回来的值**
  // 与**序列化结果的键集**（见 scripts/inkbox-save-equiv.mjs）。
  world.dead = Array.isArray(data.dead) ? data.dead : [];
  world.deadLog = data.deadLog || { total: 0, ascended: 0, evicted: 0 };
  // 兜底：`nextWarId` 必须比世上最大的 id 还大。理由同下面世家那一段——
  // 撞 id 的后果是「两场战事共用一个 id」，`warById()` 只返回第一个，
  // 而 `warLog.declared` 照样在涨，读档当时看不出任何异常。
  for (let i = 0; i < world.wars.length; i += 1) {
    const id = world.wars[i].id || 0;
    if (id >= world.nextWarId) world.nextWarId = id + 1;
  }
  // 兜底：`nextClanId` 必须比世上最大的 id 还大。不抬的话新立的世家会**撞 id**，
  // 于是「一个人只属于一个世家」这条不变量再也测不出来——而那是那种
  // 「读档当时看不出、几百年后才显形」的错（和法宝 id 那条一模一样）。
  for (let i = 0; i < world.clans.length; i += 1) {
    const id = world.clans[i].id || 0;
    if (id >= world.nextClanId) world.nextClanId = id + 1;
  }

  // ── 生灵 ──────────────────────────────────────────────
  const rows = data.entities || [];
  const legacy = (data.v || 1) < 2;
  if (legacy) {
    // v1 存档没有 id 列，也没有关系网。按顺序补发 id 即可——
    // 旧档里没有任何东西引用实体 id，不会产生悬空引用。
    let nextId = world.nextEntityId;
    world.entities = rows.map((row) => restoreLegacyEntity(row, nextId++));
    world.nextEntityId = nextId;
  } else {
    world.entities = rows.map((row) => restoreEntity(row, row[0]));
    // 兜底：万一某行 id 缺失/重复，就地重发一个，避免关系网错连。
    const seen = new Set();
    let nextId = world.nextEntityId;
    for (let i = 0; i < world.entities.length; i += 1) {
      const e = world.entities[i];
      if (!e.id || seen.has(e.id)) {
        e.id = nextId++;
        world.nextEntityId = nextId;
      }
      seen.add(e.id);
    }
  }

  // ── 关系网：等所有人都在场再连（表里存的是对方 id）──────
  if (!legacy) {
    for (let i = 0; i < rows.length; i += 1) {
      const rel = rows[i][45];
      if (!Array.isArray(rel) || rel.length === 0) continue;
      const e = world.entities[i];
      const map = new Map();
      for (let k = 0; k < rel.length; k += 1) {
        const [otherId, type, score] = rel[k];
        map.set(otherId, { type, score, since: 0 });
      }
      e.relations = map;
    }
  }

  // ── 法宝 id 兜底 ────────────────────────────────────────
  // `nextArtifactId` 必须比世上最大的 id 还大。老档或手工改过的档里它可能偏小，
  // 那样新炼出的法宝会**撞 id**，「一件法宝只能在一个地方」这条不变量
  // 就再也测不出来了（id 撞了之后按 id 找东西会找到两件）。
  //
  // ⚠️ 扫描必须放在**生灵还原之后**：地上那批在 `world.artifacts`，
  // 在手的在 `entity.artifacts`，而后者到这时候才存在。
  // 只扫前者的话，恰好漏掉数量多的那一边——而撞 id 是那种
  // 「读档当时看不出、几百年后才显形」的错。
  for (let i = 0; i < world.artifacts.length; i += 1) {
    const id = world.artifacts[i].id || 0;
    if (id >= world.nextArtifactId) world.nextArtifactId = id + 1;
  }
  for (let i = 0; i < world.entities.length; i += 1) {
    const list = world.entities[i].artifacts;
    if (!list) continue;
    for (let k = 0; k < list.length; k += 1) {
      const id = list[k].id || 0;
      if (id >= world.nextArtifactId) world.nextArtifactId = id + 1;
    }
  }

  world.villages = (data.villages || []).map((v) => ({
    ...v,
    fields: v.fields || 0,
    buildCooldown: v.buildCooldown ?? 20,
  }));
  world.factions = (data.factions || []).map((f) => ({
    ...f,
    war: new Set(f.war || []),
    // 宗门关系是 Map<对方宗门 id, 分值>，与生灵关系网是两回事，别混。
    relations: new Map(f.relations || []),
    leylines: f.leylines || [],
    history: f.history || [],
    elders: f.elders || [],
    resources: f.resources || { spiritStone: 20, heritage: 5, provisions: 30 },
    // 地盘不在这里还原：读档后由 territory.js 按地形重算，
    // 所以老存档里那份 territory 字段直接忽略即可。
    claim: f.claim || null,
    lastConflictDay: f.lastConflictDay ?? -1e9,
  }));
  world.chronicle = data.chronicle || [];
  // 世界大事账本：老档（v10 及以前）没有这个键 → 补成空数组。
  // 「补空」在这里是**诚实**的：那些档确实没记过大事账本，不是「记了但丢了」。
  // 编年史那 400 条还在，所以老档读回来只是「大事记面板一开始是空的，
  // 往后跑才会长出来」，而不是「历史被抹掉了」。
  world.milestones = Array.isArray(data.milestones) ? data.milestones : [];
  world.worldEventState = data.worldEvents && data.worldEvents.version === 1
    ? data.worldEvents : null;
  world.busanzi = data.busanzi
    ? {
      met: !!data.busanzi.met,
      acts: data.busanzi.acts || 0,
      milestones: data.busanzi.milestones || [],
      peakPop: data.busanzi.peakPop || 0,
      tier: data.busanzi.tier || 0,
      log: data.busanzi.log || [],
    }
    // v1 老档没有这一项。met 给 false，于是读档后卜算子会重新登场说那三句话——
    // 对一个从没见过的世界来说，这反而是对的。
    : { met: false, acts: 0, milestones: [], peakPop: 0, tier: 0, log: [] };

  // 类型层随存档一起保存，直接沿用可以保证「存档 → 读档」逐格一致；
  // 只有缺失时才从高程/水位重新推导。
  //
  // ⚠️ 这里读的是 `data.terrain.type`，不是调用方的局部变量：地形层在调用方就解好了。
  //    上界走的也是这一条路——它只存 6 层，`temp/moist` 是**重新生成**出来的
  //    （见 deserializeUpperWorld），所以万一 `type` 缺失，`recomputeAll`
  //    在上界也照样算得出正确的地表类型（上界的 `classifyUpper` 用的就是同一个
  //    `classify`），不会读到一层全 0 的 temp/moist。
  if (!data.terrain.type || data.terrain.type.length === 0) recomputeAll(world);
  // 灵气层则**一律**重算：它依赖灵脉，而灵脉是刚刚才灌进去的。
  // （上面 `recomputeAll` 已经顺带算过一遍灵气；这里再算一遍是**幂等**的——
  //   凡间两遍结果相同，上界则靠传进来的 `recomputeUpperQi` 把公式换掉。）
  recomputeQiLayer(world);
  world.touch();
}

/** v2 存档的单行还原 */
function restoreEntity(row, id) {
  const entity = {
    id,
    sp: row[1], x: row[2], y: row[3], vx: 0, vy: 0,
    hp: row[4], maxHp: row[5], age: row[6], lifespan: row[7],
    faction: row[8], village: row[9], state: row[10], timer: row[11],
    tx: row[12], ty: row[13], anim: row[14], face: row[15],
    name: row[16], kills: row[17], carried: row[42] || 0,
    // ── 修仙层 ──
    level: row[18] || 0,
    exp: row[19] || 0,
    root: row[20] || null,
    dao: null,
    karma: row[24] || 0,
    fortune: row[25] ?? 40,
    heartDemon: row[26] || 0,
    mind: row[27] ?? 70,
    pollution: row[28] || 0,
    daoTitle: row[29] || null,
    bloodline: row[30] || null,
    techniques: [],
    beast: row[32] || null,
    forbidden: row[43] || null,
    madUntil: row[33] ?? -1,
    // 法宝（v4）。老档这一格是 `equipTier`（一个恒为 0 的数字），
    // `Array.isArray` 一挡就退化成空手，不会带进一个假的法宝。
    artifacts: Array.isArray(row[34]) ? row[34] : [],
    trialCount: row[35] || 0,
    lastTrialDay: row[36] ?? -1e9,
    lastDemonDay: row[37] ?? -1e9,
    lastKarmaDay: row[38] ?? -1e9,
    lastAwakenTry: row[39] || 0,
    lastBeastDay: row[40] ?? -1e9,
    foundedSect: row[41] || 0,
    // ── 转世（v3）──
    // 老存档没有这三列，`?? 1` / `?? null` 兜底之后就是一个普通的「第一世」生灵。
    incarnation: row[46] ?? 1,
    soulId: row[47] ?? null,
    pastLife: row[48] || null,
    // ── 家世（v5）──
    // 老存档（v4 及以前）没有这八列，兜底之后就是一个「没有家世」的人——
    // 正好等于 v4 时的行为，不会凭空长出一段不存在的血脉。
    surname: row[49] || null,
    parentA: row[50] || 0,
    parentB: row[51] || 0,
    clan: row[52] || 0,
    gen: row[53] || 0,
    heritageQ: row[54] ?? -1,
    heritageB: row[55] || null,
    heritageM: row[56] || null,
    // v6 追加的三列。老档（v5 及以前）这三格是 undefined，下面这几个 `||`
    // 正好把它们兜成新实体的初值——**同一个世界两种形状**就是这么避免的。
    log: Array.isArray(row[57]) ? row[57] : [],
    possessedBy: row[58] || null,
    nascentEscapeUsed: row[59] || false,
    // ── 飞升者来历（v8 内追加，row[60..61]）────────────────
    // 旧档（v8 之前写下的、只有 60 列的行）这两格是 `undefined`，必须兜成
    // 新实体的初值，而且**要真的写进对象**——只读不写就成了「活对象有键、
    // 读档后缺键」，save-equiv 的键集并集判据（scripts/inkbox-save-equiv.mjs:140）
    // 当场红。`fromSect` 读侧把空串归一回 `null`（写侧 null → ''，见上面注释）。
    fromMortal: row[60] || false,
    fromSect: row[61] || null,
    // 养伤截止日（row[62]，2026-09-22 追加）。老档这一格是 `undefined`，
    // 兜成 `-1e9`（= 从没养过伤）。**要真的写进对象**——只读不写就成了
    // 「活对象有键、读档后缺键」，save-equiv 的键集并集判据当场红。
    restUntil: row[62] ?? -1e9,
    // ── 幽冥鬼魂（v11 内追加，row[63..67]）──────────────────────
    // 老档（63 列及以前）这几格是 `undefined`，逐键兜成新实体的初值——
    // 凡间 / 上界实体读回来就是「不是鬼魂」（`soulKind === null`），与写侧默认值对称。
    // ⚠️ **要真的写进对象**（理由同上面 restUntil）：只读不写就成了
    //    「活对象有键、读档后缺键」，save-equiv 的键集并集判据当场红。
    soulKind: row[63] ?? null,
    ghostOf: row[64] || null,
    ghostRancor: row[65] ?? 0,
    ghostDecayDay: row[66] ?? -1e9,
    // 列 67 的 `soulBind`（魂池链接）。**这个键必须写**：与 row[47] 的 `soulId`
    // 曾经同名，那时若在这里补键会**后者覆盖前者**（老档 row[67]=undefined→null，
    // 把 row[47] 的「转世来源」静默冲成 null）。2026-09-23 已把列 67 改名为
    // `soulBind`，名字不再撞车，所以可以、也必须在这里逐键兜底。
    soulBind: row[67] ?? null,
    // 不良状态印记（row[68]，D6-3 工程包 D）。老档（68 列及以前）这一格是
    // `undefined`，兜成 `null`（= 没有印记）。**要真的写进对象**——只读不写就成了
    // 「活对象有键、读档后缺键」，save-equiv 的键集并集判据当场红（同 `restUntil`）。
    possessionScar: row[68] || null,
    relations: new Map(),
  };
  // 道途只存了 key，靠 DAO_PATHS 还原成完整对象（含 name/evil/stages/thresholds）。
  if (row[21]) {
    const path = DAO_BY_KEY.get(row[21]);
    if (path) entity.dao = { path, stage: row[22] || 0, progress: row[23] || 0 };
  }
  // 功法只存了名字，靠 MANUALS 还原（kind/note 这些描述性字段不必进存档）。
  const names = row[31];
  if (Array.isArray(names)) {
    for (let i = 0; i < names.length; i += 1) {
      const manual = MANUAL_BY_NAME.get(names[i]);
      if (manual) entity.techniques.push(manual);
    }
  }
  // 天劫异象同理：只存 key，靠 TRIBULATION_OMENS 还原。
  if (row[44]) {
    const omen = OMEN_BY_KEY.get(row[44]);
    if (omen) entity._lastOmen = omen;
  }
  return entity;
}

/** v1 存档的单行还原：没有修仙层，补齐默认值即可 */
function restoreLegacyEntity(row, id) {
  return {
    id,
    sp: row[0], x: row[1], y: row[2], vx: 0, vy: 0,
    hp: row[3], maxHp: row[3], age: row[4], lifespan: row[5],
    faction: row[6], village: row[7], state: row[8], timer: row[9],
    tx: row[10], ty: row[11], anim: row[12], face: row[13],
    name: row[14], kills: row[15], carried: 0,
    level: 0, exp: 0, root: null, dao: null,
    karma: 0, fortune: 40, heartDemon: 0, mind: 70, pollution: 0,
    daoTitle: null, bloodline: null, techniques: [], beast: null,
    forbidden: null, madUntil: -1, artifacts: [], trialCount: 0,
    lastTrialDay: -1e9, lastDemonDay: -1e9, lastKarmaDay: -1e9,
    lastAwakenTry: 0, lastBeastDay: -1e9, foundedSect: 0,
    // 转世那三列：v1 档连修仙层都没有，更不会有前世
    incarnation: 1, soulId: null, pastLife: null,
    // v6 那三列。v1 档当然也没有——但**键必须存在**：
    // 缺键就是「只在一侧存在的字段」，save-equiv 那条判据会红。
    log: [], possessedBy: null, possessionScar: null, nascentEscapeUsed: false,
    // 飞升者来历（v8 内追加）。v1 档当然没有，但**键必须存在**——
    // 缺键就是「只在一侧存在的字段」，save-equiv 那条判据会红（同上面 v6 那三列）。
    fromMortal: false, fromSect: null,
    // 养伤（row[62]，2026-09-22 追加）。v1 档当然没有，但**键必须存在**——
    // 缺键就是「只在一侧存在的字段」，save-equiv 那条判据会红。
    restUntil: -1e9,
    // 幽冥鬼魂（v11 内追加，row[63..67]）。v1 档当然没有，但**键必须存在**——
    // 缺键就是「只在一侧存在的字段」（同上面 v6 / v8 那两组）。
    // `soulBind`（列 67 的魂池链接）与上面转世那三列的 `soulId`（来源）**不是一回事**。
    soulKind: null, ghostOf: null, ghostRancor: 0, ghostDecayDay: -1e9, soulBind: null,
    // v1 档连修仙层都没有，家世当然也没有
    surname: null, parentA: 0, parentB: 0, clan: 0, gen: 0,
    heritageQ: -1, heritageB: null, heritageM: null,
    relations: new Map(),
  };
}

/**
 * 存档。**异步**——gzip 用的 CompressionStream 是异步的，这是压缩唯一的代价。
 *
 * 返回值口径（两个数都留着，别混）：
 *   · `bytes`    —— 真正写进 localStorage 的字符数（压缩后，含 `INKGZ1:` 前缀）。
 *                   **判配额只能用这个**：localStorage 按 UTF-16 码元计费，不是字节。
 *   · `rawBytes` —— 压缩前的明文长度。界面要显示「原始体积」时用它；
 *                   `rawBytes / bytes` 就是这一档的实际压缩比。
 *   · `codec`    —— `'gzip'` 或 `'plain'`。退回明文时必须是 `'plain'`：
 *                   不报出来的话，长卷存档会从 24.6% 悄悄涨到 72.3% 而无人察觉。
 *   · `fallbackReason` —— `codec === 'plain'` 时**为什么**退回明文。两个取值含义不同：
 *                   `'compression-unavailable'`（本机不支持，换浏览器可解）
 *                   与 `` `compress-failed: ...` ``（支持但抛错了，是我们的 bug）。
 *                   只给 `codec` 的话，调用方只能把两者都说成「本机不支持压缩」——
 *                   那是**归因错误**，会把玩家指向错误的方向。
 *
 * ⚠️ `JSON.stringify` 必须在 `await` **之前**且保持同步。它读的是活世界，
 * 而 `await` 期间帧循环还在推进世界——挪到后面会让「存档那一刻」与「被存的世界」错开，
 * 存下来的是一份缝合怪，而且不报任何错。
 */
export async function saveToStorage(world, slot = 'auto', meta = {}) {
  const payload = JSON.stringify(serializeWorld(world, meta));
  const encoded = await encodeSave(payload);
  // 紧接在 encodeSave 之后读。这两个是模块级状态、只反映**最近一次**编码，
  // 中间只要再夹一次 encodeSave（别处也存了一次档）就会被覆盖成别人的结果。
  const codec = lastCodecUsed();
  // `fallbackReason` 与 `codec` 同时读、同一个理由（见上）。**它必须一起带出去**：
  // 退回明文有两个含义完全不同的原因——`'compression-unavailable'`（本机不支持压缩）
  // 与 `` `compress-failed: ...` ``（支持，但压缩时抛错了）。调用方只拿到
  // `codec === 'plain'` 是分不清这两者的，于是只能把两者都说成「本机不支持压缩」
  // ——那是**归因错误**：现象报出来了，却把玩家指向错误的方向（去查浏览器设置，
  // 而真因是一次编码异常）。见 codec.js:242 与 :254 两个赋值点。
  const fallbackReason = lastFallbackReason();
  try {
    localStorage.setItem(`${APP.saveKey}:${slot}`, encoded);
    return { ok: true, bytes: encoded.length, rawBytes: payload.length, codec, fallbackReason };
  } catch (error) {
    return {
      ok: false,
      error: String(error && error.message ? error.message : error),
      bytes: encoded.length,
      rawBytes: payload.length,
      codec,
      fallbackReason,
    };
  }
}

/**
 * 读档。**异步**，因为要解压。
 *
 * ⚠️ `await decodeSave(raw)` 必须在 try 里面。`decodeSave` 在
 * 「有 `INKGZ1:` 前缀但解压失败」时**抛错**（见 io/codec.js 的理由：
 * 原样返回一份压缩垃圾只会让 JSON.parse 报一句与真实原因无关的
 * `Unexpected token 'I'`，把「档被截断」这个真因盖掉）。
 * 老明文存档走的是同一条路：没有前缀 → 原样返回 → 逐字符不变。
 */
export async function loadFromStorage(slot = 'auto') {
  const raw = localStorage.getItem(`${APP.saveKey}:${slot}`);
  if (!raw) return null;
  try {
    return deserializeWorld(JSON.parse(await decodeSave(raw)));
  } catch (error) {
    console.error('[inkbox] 存档损坏', error);
    return null;
  }
}

export function listSlots() {
  const out = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(`${APP.saveKey}:`)) continue;
    const slot = key.slice(APP.saveKey.length + 1);
    const raw = localStorage.getItem(key) || '';
    // `bytes` 是**落盘**长度（压缩后）。`compressed` 让界面能区分
    // 「这一档是压缩过的」与「这一档是老明文档 / 本机不支持压缩」——
    // 两者体积差 3 倍，只显示一个数字的话玩家会以为存档坏了。
    out.push({ slot, bytes: raw.length, compressed: isCompressed(raw) });
  }
  return out.sort((a, b) => a.slot.localeCompare(b.slot));
}

export function deleteSlot(slot) {
  localStorage.removeItem(`${APP.saveKey}:${slot}`);
}

// ⚠️ **导出刻意不压缩**，与存档（saveToStorage）是两条路，别顺手统一。
// 导出的东西是给人看的、要能直接打开读、也可能被外部工具处理；
// 压成 gzip 之后它就不再是一个 JSON 文件了，而换来的是**磁盘**上的体积——
// 磁盘没有 localStorage 那个 5,242,877 码元的硬上限，没必要付这个代价。
// 读回来不成问题：importFile 走 decodeSave，两种格式都认。
export function exportFile(world, filename) {
  const payload = JSON.stringify(serializeWorld(world));
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `inkbox-${world.seed}-${Math.floor(world.day / 360)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function importFile(file) {
  const text = await file.text();
  // 走 decodeSave 而不是直接 JSON.parse：这样导入既吃**导出的明文**，
  // 也吃**从 localStorage 里抠出来的压缩档**——玩家想备份存档时最自然的做法
  // 就是复制那一格的值，那条路必须通。
  return deserializeWorld(JSON.parse(await decodeSave(text)));
}

export { WORLD_PRESETS };
