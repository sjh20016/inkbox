import * as THREE from 'three';
import { resolveArtProfile } from './ArtPassProfile.js';

/** Single, thin presentation coordinator. M2-B owns elevation, regions and boundary.
 * No alternate Stage, mask, event drain, clock, world fields or postprocessing renderer.
 */
export class ArtPass {
  constructor(host, { profile = 'baseline' } = {}) {
    this.host = host; this.profile = resolveArtProfile(profile); this.saved = new WeakMap();
    this.clearColor = host.gpu.getClearColor?.(new THREE.Color()).clone() || new THREE.Color('#d9cdb4');
  }
  setProfile(value) {
    if (value !== this.profile) this.profile = resolveArtProfile(value, this.profile);
    for (const stage of this.host.stages.values()) this.styleStage(stage);
    this.styleBoundary();
    this.host.gpu.setClearColor(this.profile.enabled ? this.profile.paperColor : this.clearColor);
    return this.profile;
  }
  styleStage(stage) {
    const profile = this.profile.enabled ? this.profile : null;
    stage.terrain?.setArtProfile(profile);
    const pilot = profile?.pilots ? profile : null;
    stage.entities?.setArtProfile(pilot);
    stage.vegetation?.setArtProfile(pilot);
    stage.settlements?.setArtProfile(pilot);
    if (stage.water) {
      const material = stage.water.material;
      if (!this.saved.has(material)) this.saved.set(material, { color: material.color.clone(), opacity: material.opacity });
      const saved = this.saved.get(material);
      // Existing water semantics and geometry remain authoritative. Pale pigment, not a new sea.
      material.color.copy(profile ? new THREE.Color(profile.paperColor).lerp(new THREE.Color('#667e80'), 0.24) : saved.color);
      material.opacity = profile ? 0.40 : saved.opacity;
    }
  }
  styleBoundary() {
    const material = this.host.boundary?.material;
    if (!material) return;
    if (!this.saved.has(material)) this.saved.set(material, { color: material.color.clone() });
    if (this.profile.enabled) material.color.set('#b8b4aa');
    else material.color.copy(this.saved.get(material).color);
    // The entry point is here; no second skirt or realm geometry is introduced.
  }
  update() {
    const rig = this.host.cameraRig, camera = rig.camera;
    const pixelsPerUnit = (this.host.height || 800) * camera.zoom / Math.max(1, camera.top - camera.bottom);
    camera.updateMatrixWorld();
    const inverse = camera.matrixWorldInverse.elements;
    const view = { pixelsPerUnit: Number.isFinite(pixelsPerUnit) ? pixelsPerUnit : 1,
      verticalPixelsPerUnit: Number.isFinite(pixelsPerUnit) ? pixelsPerUnit * Math.hypot(inverse[4], inverse[5]) : 1,
      camera, width: this.host.width || 900, height: this.host.height || 800 };
    for (const stage of this.host.stages.values()) {
      if (!stage.visible) continue;
      if (stage.terrain?.inkMaterial) stage.terrain.inkMaterial.uniforms.pixelsPerUnit.value = view.pixelsPerUnit;
      for (const layer of [stage.entities, stage.vegetation, stage.settlements]) layer?.setArtView(view);
    }
  }
  dispose() { this.saved = new WeakMap(); this.host = null; }
}
