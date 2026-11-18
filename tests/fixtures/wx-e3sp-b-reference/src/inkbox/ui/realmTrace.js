// 水墨沙盒 · 跨界「追迹」的纯逻辑 —— D8-G
//
// ───────────────────────────────────────────────────────────────────────
// 这个模块负责什么
// ───────────────────────────────────────────────────────────────────────
//
// 「记挂」（`sim/watch.js`，D7-E）回答「我记挂的那个人如今在哪一界」；
// 「视界」（`ui/realmView.js` / `render/realmViewLayer.js`，D8）是一扇窗。
// D8-G 把两者接上：点一条记挂，若他已在**另一界**，就**引路**过去——
//   ① 算出「可循迹的目标」（他在哪一界、同坐标落在哪）；
//   ② 摊出一条**只针对他**的「跨界来历」链条（凡间 → 上界 / 凡间 → 幽冥）。
//
// ⚠️ **引路，不代替玩家开门**（蓝图 §D8-G 原话）。「开视界」会留下**真实世界
//    副作用**（划选边缘裂开细缝、缝会漏物吸人），所以系统不能为了「方便追踪」
//    偷偷替玩家开缝。本模块因此**只算、不做**：不算相机、不碰 DOM、不写世界、
//    不抽 RNG，也**够不到 `openRifts`**（零 `sim` 写入口 import）——
//    「不代替玩家开门」这条纪律是**结构性**的，不是靠自觉。
//
// ⚠️ **本模块 import 的都是纯函数**（`realmLabel`），顶层不碰 DOM ⇒ node 能直接
//    import ⇒ `scripts/inkbox-view.mjs` 的 V9 组可以写成**运行时**断言，
//    而不是只扫源码（同 `ui/realmInspector.js` 的做法）。
//
// ⚠️ **不按名字猜**：两条可靠跨界引用都来自 `sim` 写下的 id 快照
//    （上界 `arrivedLog[].fromKey`、幽冥 `ghostOf.ref`）。本模块**只消费**
//    `resolveWatch` 已经解析好的状态，**自己不去查名字**。

import { realmLabel } from '../core/cultivation.js';

/**
 * 上界来路 → 玩家可见的「怎么过去的」。与 `ui/realmInspector.js` 的 `VIA_LABEL`
 * **同一口径**（都是 `arrivedLog.via` 的三个值），只是这里要的是**短词**——
 * 链条上写「↓ 飞升」，不写「↓ 飞升而来」。
 */
export const TRACE_VIA_LABEL = Object.freeze({
  rift: '经裂隙',
  ascend: '飞升',
  thunder: '天雷飞升',
});

/** 凡间那一端的界名。上界 / 幽冥的界名走 `ui/realmView.js` 的 `PLANE_LABEL`。 */
const MORTAL_LABEL = '凡间';

/** 境界显示名。**level 0 要说「凡人」**（`realmLabel(0)` 会落进炼气档，是错的）。 */
function realmName(level) {
  const lv = Number.isFinite(level) ? level : 0;
  return lv >= 1 ? realmLabel(lv) : '凡人';
}

/**
 * 从「已解析的记挂状态」算出**可循迹的目标**（他在哪一界、同坐标在哪）。
 *
 * 只认可靠引用：上界找 `upper.entities` 里 `id === resolved.upperId` 的那具身子
 * （`upperId` 来自 `arrivedLog`），幽冥取 `resolved.ghost`（来自 `ghostOf.ref`）。
 * **查不到坐标就返回 `null`**——宁可只说「已入上界」（名录里查无此人），
 * 也不要随便指一个地方。
 *
 * @param {object} world 凡间 world（挂 `.upper` / `.nether` 的那个）
 * @param {object} resolved `resolveWatch(world, entry)` 的产物
 * @returns {{plane:'upper'|'nether', x:number, y:number, name:string}|null}
 */
export function traceTargetOf(world, resolved) {
  if (!world || !resolved) return null;
  if (resolved.state === 'ascended' && world.upper) {
    const list = Array.isArray(world.upper.entities) ? world.upper.entities : [];
    const ent = list.find((e) => e && e.id === resolved.upperId);
    if (ent && Number.isFinite(ent.x) && Number.isFinite(ent.y)) {
      return { plane: 'upper', x: ent.x, y: ent.y, name: ent.name || '' };
    }
    return null;
  }
  if (resolved.state === 'nether' && resolved.ghost) {
    const g = resolved.ghost;
    if (Number.isFinite(g.x) && Number.isFinite(g.y)) {
      return { plane: 'nether', x: g.x, y: g.y, name: g.name || '' };
    }
    return null;
  }
  return null;
}

/**
 * 「跨界来历」链条——**只针对当前这个人**，不是全局图谱（蓝图 §D8-G 末段）。
 *
 * 形如：
 * ```text
 * 凡间：沈秋
 * 　↓ 飞升
 * 上界：沈秋 · 筑基三层
 * ```
 * 或：
 * ```text
 * 凡间：陆迟
 * 　↓ 跌入裂隙
 * 幽冥：陆迟 · 游魂
 * ```
 *
 * @param {object} world 凡间 world
 * @param {object} entry 记挂条目（`world.watch` 里那一条，用它的 `name` 作凡间端）
 * @param {object} resolved `resolveWatch` 的产物
 * @returns {{head:string, lines:string[]}|null} 不是跨界状态（在世 / 故人 / 不可考）返回 `null`
 */
export function crossRealmChain(world, entry, resolved) {
  if (!entry || !resolved) return null;
  const fromName = entry.name || '无名';

  if (resolved.state === 'ascended') {
    const via = (resolved.upper && TRACE_VIA_LABEL[resolved.upper.via]) || '飞升';
    const list = world && world.upper && Array.isArray(world.upper.entities)
      ? world.upper.entities
      : [];
    const ent = list.find((e) => e && e.id === resolved.upperId);
    const toName = (ent && ent.name) || fromName;
    const toSuffix = ent ? ` · ${realmName(ent.level)}` : '';
    return {
      head: `跨界来历 · ${fromName}`,
      lines: [`${MORTAL_LABEL}：${fromName}`, `　↓ ${via}`, `上界：${toName}${toSuffix}`],
    };
  }

  if (resolved.state === 'nether') {
    const g = resolved.ghost;
    const toName = (g && g.ghostOf && g.ghostOf.name) || (g && g.name) || fromName;
    // 类别与 `ui/realmInspector.js` 的 ghostRows 同口径：鬼修 / 游魂。
    const kind = g && g.soulKind === 'ghostCultivator' ? '鬼修' : '游魂';
    return {
      head: `跨界来历 · ${fromName}`,
      lines: [`${MORTAL_LABEL}：${fromName}`, '　↓ 跌入裂隙', `幽冥：${toName} · ${kind}`],
    };
  }

  return null;
}
