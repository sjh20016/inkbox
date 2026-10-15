import { deriveEntities, deriveUpperEntities, deriveNetherEntities } from '../entities/deriveEntities.js';
import { INK } from '../../core/config.js';

/**
 * Technical M2-A layer composition. Plane semantics stay here, outside layers.
 *
 * M2-B B1（§25）：上界 / 幽冥也开 `selection`，但走 **readonly** 样式（`selectionTint` +
 * `selectionReadonly`）——窗内检视另一界的东西时给的是**只读反馈**，
 * 绝不能长成凡间那枚可操作的红环（§25「禁止点击幽冥鬼后出现凡间操作型选择环」）。
 *
 * ⚠️ §26 / §27：目标位面**只补已有模拟数据里确实存在、且能只读映射**的内容。
 *    `water` / `vegetation` / `settlements` / `markers` 仍为 `false`：
 *    「上界的蓝色水」「幽冥的灰色树林」都还没有可靠语义，**先留空**，
 *    不为了填满 Layer 而机械复制凡间 profile。
 */
export const PLANE_RENDER_PROFILE = Object.freeze({
  mortal: Object.freeze({ terrain: true, water: true, vegetation: true, entities: deriveEntities, settlements: true, markers: true, selection: true }),
  upper: Object.freeze({
    terrain: true, water: false, vegetation: false, entities: deriveUpperEntities, settlements: false, markers: false,
    selection: true, selectionReadonly: true, selectionTint: INK.gold, terrainTint: '#d4dfd3',
  }),
  nether: Object.freeze({
    terrain: true, water: false, vegetation: false, entities: deriveNetherEntities, settlements: false, markers: false,
    selection: true, selectionReadonly: true, selectionTint: INK.orchid, terrainTint: '#8f8292',
  }),
});

export function renderProfileFor(plane) {
  const profile = PLANE_RENDER_PROFILE[plane];
  if (!profile) throw new Error(`Unknown render plane: ${plane}`);
  return profile;
}
