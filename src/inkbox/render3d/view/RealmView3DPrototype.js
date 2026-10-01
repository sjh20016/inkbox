/**
 * M2-B B1 · 视界窗口的**可见性 + 区域归属**装配（§18 / §20 / §25 / §67）。
 *
 * M2-A 在这里是把水 / 植被 / 聚落 / 标记**整层关掉**（`root.visible = !open`），
 * 于是「开窗之后窗外一片光秃」。M2-B 改成：**层一直画**，由 `RegionGeometry`
 * 决定**画哪一半**——
 *
 *   · 凡间 Stage → 保留**窗外**（`inside = false`）
 *   · 目标界 Stage → 保留**窗内**（`inside = true`）
 *   · 两者用**同一张区域表** ⇒ 「窗内只提交目标位面内容」（V5）由构造保证（§20）
 *
 * ⚠️ 这里只做装配；过滤本身在各 Layer 里，判据一律是 `RegionGeometry`（§19）。
 */
export class RealmView3DPrototype {
  constructor(host) { this.host = host; }

  apply(state, activePlane) {
    this.open = !!(state?.open && state.region && this.host.stages.has(state.targetPlane) && activePlane === 'mortal');
    this.targetPlane = this.open ? state.targetPlane : null;
    for (const [plane, stage] of this.host.stages) {
      const visible = this.open ? plane === 'mortal' || plane === this.targetPlane : plane === activePlane;
      stage.setVisible(visible);
      // Slab 是历史研究探针：它自己那套矩形区域仍然优先（§30 不扩建，但也不破坏）。
      const slabRegion = this.host.slabProbe && plane === 'mortal' ? this.host.slabRegion : null;
      const mask = slabRegion || (this.open && visible ? state.region : null);
      stage.setRegionMask(mask, plane !== 'mortal');

      // §18：**不再因为开窗就整层关掉**。层的内容由 Region 过滤，而不是隐藏。
      for (const layer of [stage.water, stage.vegetation, stage.settlements, stage.markers]) {
        const root = layer?.group || layer?.mesh;
        if (root) root.visible = !this.host.slabProbe;
      }
      this.#applySelection(stage, plane);
    }
  }

  /**
   * §25：开窗之后不能再显示一个「含糊的凡间操作型选择环」。
   *
   *   · 选中**凡间**对象 ⇒ 只在凡间**可见那一半**显示（窗外）；
   *     它若落在窗内，那块地已经被目标界接管，凡间环画在那里只会误导。
   *   · 选中**上界 / 幽冥**对象 ⇒ 由目标位面画**只读反馈**（`readonly` 样式，
   *     与凡间那枚可操作的红环区分开）。
   *
   * ⚠️ 本方法只决定 `visible`，不改变「谁被选中」——选择状态仍是单一来源。
   */
  #applySelection(stage, plane) {
    const marker = stage.selectionMarker;
    if (!marker) return;
    const cell = marker.cell;
    if (!cell) { marker.mesh.visible = false; return; }
    if (this.host.slabProbe) { marker.mesh.visible = false; return; }
    if (!this.open) { marker.mesh.visible = true; return; }
    const inside = stage.regionGeometry?.isInsideCell(cell.x, cell.y) ?? false;
    // 凡间：只在窗外显示；目标界：只在窗内显示。两者互补、互不重叠。
    marker.mesh.visible = plane === 'mortal' ? !inside : (plane === this.targetPlane && inside);
  }
}
