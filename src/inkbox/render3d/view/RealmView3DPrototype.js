// World-space, geometry-only prototype; camera and simulation are not inputs.
export class RealmView3DPrototype {
  constructor(host) { this.host = host; }
  apply(state, activePlane) {
    this.open = !!(state?.open && state.region && this.host.stages.has(state.targetPlane) && activePlane === 'mortal');
    this.targetPlane = this.open ? state.targetPlane : null;
    for (const [plane, stage] of this.host.stages) {
      const visible = this.open ? plane === 'mortal' || plane === this.targetPlane : plane === activePlane;
      stage.setVisible(visible);
      const slabRegion = this.host.slabProbe && plane === 'mortal' ? this.host.slabRegion : null;
      stage.setRegionMask(slabRegion || (this.open && visible ? state.region : null), plane !== 'mortal');
      // Only terrain and entities are in scope for the Mask experiment.
      for (const layer of [stage.water, stage.vegetation, stage.settlements, stage.markers]) {
        const root = layer?.group || layer?.mesh;
        if (root) root.visible = !this.open && !this.host.slabProbe;
      }
      if (stage.selectionMarker) stage.selectionMarker.mesh.visible = !!stage.selectionMarker.cell && !this.open && !this.host.slabProbe;
    }
  }
}
