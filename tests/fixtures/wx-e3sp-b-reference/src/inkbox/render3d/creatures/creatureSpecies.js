// 水墨沙盒 · 山海异兽视觉变体 —— 纯函数：零 THREE / 零 DOM / 零模拟 RNG
//
// ───────────────────────────────────────────────────────────────────────
// 为什么单独一层
// ───────────────────────────────────────────────────────────────────────
//
// 世界试装只决定「一头灵兽画成哪种异兽、朝哪边站」，这绝不能动用模拟随机流：
// `world.entities` 的生成顺序、战斗、存档都以 `sim` 的 RNG 为唯一事实来源。
// 所以视觉变体只从**稳定事实**推导：`world.seed + entity.id` 的哈希。
// 同一个世界、同一头灵兽，渲染器重开多少次都得到同一只异兽、同一个朝向。
//
// ⚠️ 只读：本文件不写 world、不抽 RNG、不用 `Math.random`。
// ⚠️ 不伪造语义：朝向只是「站姿朝向」，不表示移动方向、不表示敌意。

/** FNV-1a 32 位 + 末轮雪崩。输入全是稳定事实（seed / id / salt），无时间、无随机。 */
export function stableCreatureHash(seed, entityId, salt = '') {
  const text = `${seed >>> 0}|${entityId >>> 0}|${salt}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

/**
 * 稳定地给一头灵兽挑一种异兽。
 * @param {number} seed world.seed
 * @param {number} entityId entity.id（渲染层**只读**）
 * @param {ReadonlyArray<string>} species 可用物种 id（顺序稳定）
 * @returns {string|null}
 */
export function creatureSpeciesFor(seed, entityId, species) {
  if (!Array.isArray(species) || species.length === 0) return null;
  return species[stableCreatureHash(seed, entityId, 'species') % species.length];
}

/** 稳定站姿朝向（弧度，绕 Y）。只由 seed + id 决定，和移动/战斗状态无关。 */
export function creatureFacingFor(seed, entityId) {
  return (stableCreatureHash(seed, entityId, 'facing') % 4096) / 4096 * Math.PI * 2;
}
