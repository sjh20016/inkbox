/**
 * M2-B B1 · 「按格网建的几何体」的唯一遮罩实现（§19）。
 *
 * TerrainMesh 与 WaterLayer 都是 `gridGeometry()` 出来的规则格网：quad `(x,y)`
 * 占索引里固定 6 个位置。两者都**只**通过这里改写索引——
 * 不再各写一套「Terrain 一套 contains / Water 一套 bounding box」。
 *
 * 判据一律来自 `RegionGeometry.isInsideQuad()`，而 RegionGeometry 又只从
 * `RegionMask` 派生 ⇒ 全工程只有一条区域判据链。
 *
 * @param {object} options
 * @param {THREE.BufferGeometry} options.geometry 目标几何体（索引会被原地改写）
 * @param {ArrayLike<number>} options.fullIndices 未遮罩时的完整索引（构造期存下的副本）
 * @param {object|null} options.regionGeometry `RegionGeometry`
 * @param {boolean} options.inside `true` = 保留窗内，`false` = 保留窗外
 * @param {number} options.quadW quad 列数（`world.w - 1`）
 * @param {number} options.quadH quad 行数（`world.h - 1`）
 * @returns {number} 实际保留的 quad 数（= `drawRange.count / 6`）
 */
export function applyQuadMask({ geometry, fullIndices, regionGeometry, inside, quadW, quadH }) {
  if (!regionGeometry || regionGeometry.allInside) {
    geometry.index.array.set(fullIndices);
    geometry.index.needsUpdate = true;
    geometry.setDrawRange(0, fullIndices.length);
    return fullIndices.length / 6;
  }
  const kept = geometry.index.array;
  let count = 0;
  let quads = 0;
  for (let y = 0; y < quadH; y += 1) {
    for (let x = 0; x < quadW; x += 1) {
      if (regionGeometry.isInsideQuad(x, y) !== inside) continue;
      const i = (y * quadW + x) * 6;
      for (let k = 0; k < 6; k += 1) kept[count++] = fullIndices[i + k];
      quads += 1;
    }
  }
  geometry.index.needsUpdate = true;
  geometry.setDrawRange(0, count);
  return quads;
}
