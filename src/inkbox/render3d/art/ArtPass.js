import * as THREE from 'three';
import { resolveArtProfile } from './ArtPassProfile.js';
import { realmStyleFor } from './RealmStyleProfile.js';

/** Single, thin presentation coordinator. M2-B owns elevation, regions and boundary.
 * No alternate Stage, mask, event drain, clock, world fields or postprocessing renderer.
 */
export class ArtPass {
  constructor(host, { profile = 'baseline' } = {}) {
    this.host = host; this.profile = resolveArtProfile(profile); this.saved = new WeakMap();
    this.styleContextKey = null;
    this.clearColor = host.gpu.getClearColor?.(new THREE.Color()).clone() || new THREE.Color('#d9cdb4');
  }
  setProfile(value) {
    if (value !== this.profile) this.profile = resolveArtProfile(value, this.profile);
    for (const stage of this.host.stages.values()) this.styleStage(stage);
    this.styleContextKey = null;
    this.syncStyleContext();
    return this.profile;
  }
  styleStage(stage) {
    const realmStyle = this.profile.enabled && this.profile.mode === 'realm-style-v1'
      ? realmStyleFor(stage.plane) : null;
    const profile = !this.profile.enabled ? null : realmStyle ? {
      ...this.profile, realmStyle, paperColor: realmStyle.paper.color,
      pigmentDensity: realmStyle.pigment.density, pigmentSaturation: realmStyle.pigment.saturation,
      terrainBoundaryStrength: realmStyle.pigment.boundaryStrength,
      structuralInkStrength: realmStyle.ink.structure, silhouetteInkStrength: realmStyle.ink.silhouette,
      inkDensity: realmStyle.ink.density, dryBrushStrength: realmStyle.ink.dryBrush,
      distanceFade: realmStyle.pigment.distanceFade ?? this.profile.distanceFade,
    } : this.profile;
    stage.terrain?.setArtProfile(profile);
    stage.markers?.setArtProfile(profile);
    const pilot = profile?.pilots ? profile : null;
    for (const [category, layer] of [['entity', stage.entities], ['vegetation', stage.vegetation], ['building', stage.settlements]])
      layer?.setArtProfile(realmStyle ? { ...pilot, layerCategory: category,
        distanceFade: realmStyle[category].distanceFade ?? pilot.distanceFade } : pilot);
    if (stage.water) {
      const material = stage.water.material;
      if (!this.saved.has(material)) this.saved.set(material, { color: material.color.clone(), opacity: material.opacity });
      const saved = this.saved.get(material);
      // Existing water semantics and geometry remain authoritative. Pale pigment, not a new sea.
      material.color.copy(realmStyle ? new THREE.Color(realmStyle.water.color)
        : profile ? new THREE.Color(profile.paperColor).lerp(new THREE.Color('#667e80'), 0.24) : saved.color);
      material.opacity = realmStyle ? realmStyle.water.opacity : profile ? 0.40 : saved.opacity;
    }
  }
  syncStyleContext() {
    const targetPlane = this.host.realmPrototype?.open ? this.host.realmPrototype.targetPlane : null;
    const backgroundPlane = targetPlane ? 'mortal' : this.host.activePlane;
    const key = `${this.profile.name}|${backgroundPlane}|${targetPlane || ''}`;
    if (key === this.styleContextKey) return;
    this.styleContextKey = key;
    this.styleBoundary(targetPlane);
    const color = !this.profile.enabled ? this.clearColor
      : this.profile.mode === 'realm-style-v1' ? realmStyleFor(backgroundPlane).paper.background
        : this.profile.paperColor;
    this.host.gpu.setClearColor(color);
  }
  styleBoundary(targetPlane = null) {
    const boundary = this.host.boundary;
    const material = boundary?.material;
    if (!material) return;
    if (!this.saved.has(material)) this.saved.set(material, { color: material.color.clone() });
    const realmStyle = this.profile.enabled && this.profile.mode === 'realm-style-v1' && targetPlane
      ? realmStyleFor(targetPlane) : null;
    boundary.setRealmStyle?.(realmStyle?.boundary ?? null);
    if (realmStyle)
      material.color.set('#ffffff');
    else if (this.profile.enabled) material.color.set('#b8b4aa');
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
