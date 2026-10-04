import { cellHash } from './deriveVegetation.js';

// Small silhouette changes on the same three meshes. These are visual variants,
// not species or ecology facts; the LOD envelope remains the existing base size.
export const TREE_VARIANT_SCALES = Object.freeze([
  Object.freeze([0.90, 1.12, 1.00]), Object.freeze([1.10, 0.95, 0.94]),
  Object.freeze([0.94, 1.08, 1.10]), Object.freeze([1.14, 0.88, 0.90]),
  Object.freeze([1.00, 1.00, 1.04]),
]);

export function treeVariantIndex(seed, cell) {
  let key = cell;
  if (!Number.isInteger(key)) {
    key = 2166136261;
    for (const character of String(cell)) key = Math.imul(key ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return Math.min(4, Math.floor(cellHash(seed, key, 173) * 5));
}
