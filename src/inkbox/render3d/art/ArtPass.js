import * as THREE from 'three';
import { resolveArtProfile } from './ArtPassProfile.js';
import { realmStyleFor } from './RealmStyleProfile.js';
import { ART_DEBUG_MODES, ART_COMPARISON_STYLES } from './ArtDiagnostics.js';

/** Single, thin presentation coordinator. M2-B owns elevation, regions and boundary.
 * No alternate Stage, mask, event drain, clock, world fields or postprocessing renderer.
 */
export class ArtPass {
  constructor(host, { profile = 'baseline', development = false, debugView = 'final' } = {}) {
    this.host = host; this.profile = resolveArtProfile(profile); this.saved = new WeakMap();
    this.development = development;
    this.debugView = development && Object.hasOwn(ART_DEBUG_MODES, debugView) ? debugView : 'final';
    this.comparisonStyle = 'c2d1-style';
    this.comparisonReady = Promise.resolve(this.comparisonStyle);
    this.comparisonSnapshot = null;
    this.comparisonDebugSupported = true;
    this.comparisonSourceRevision = null;
    this.comparisonMaterials = new WeakMap();
    this.comparisonBoundary = null;
    this.styleContextKey = null;
    this.clearColor = host.gpu.getClearColor?.(new THREE.Color()).clone() || new THREE.Color('#d9cdb4');
  }
  setComparisonStyle(value = 'c2d1-style') {
    if (!this.development) value = 'c2d1-style';
    if (!ART_COMPARISON_STYLES.includes(value)) return Promise.reject(new Error(`Unknown art comparison style: ${value}`));
    // Serialize imports and mutations. A later click never overtakes a previous switch.
    const pending = this.comparisonReady.catch(() => {}).then(async () => {
      if (!this.host || this.host.disposed) throw new Error('ArtPass disposed during comparison switch');
      const snapshot = value === 'c2d1-style' ? null
        : (await import('./ArtComparisonSnapshots.js')).ART_COMPARISON_SNAPSHOTS[value];
      if (!this.host || this.host.disposed) throw new Error('ArtPass disposed during comparison load');
      this.comparisonStyle = value; this.comparisonSnapshot = snapshot;
      this.comparisonDebugSupported = !snapshot;
      this.comparisonSourceRevision = snapshot?.revision ?? null;
      if (snapshot) this.debugView = 'final';
      this.setProfile(this.profile);
      return this.comparisonStyle;
    });
    this.comparisonReady = pending;
    return pending;
  }
  realmStyleFor(plane) { return this.comparisonSnapshot?.styles[plane] ?? realmStyleFor(plane); }
  rememberComparisonMaterial(material) {
    if (!this.development || !material) return null;
    let saved = this.comparisonMaterials.get(material);
    if (!saved) {
      // Capture the current constructed material, not an imported candidate shader
      // constant: subsequent candidate shader changes stay authoritative.
      saved = { vertexShader: material.vertexShader, fragmentShader: material.fragmentShader,
        transparent: material.transparent, depthWrite: material.depthWrite, side: material.side,
        forceSinglePass: material.forceSinglePass, opacity: material.uniforms?.opacity?.value,
        fieldColors: Object.fromEntries(['fieldInkColor', 'fieldColdColor', 'fieldMineralBlue', 'fieldMineralGreen', 'fieldMineralGold']
          .filter(key => material.uniforms?.[key]).map(key => [key, material.uniforms[key].value.clone()])) };
      this.comparisonMaterials.set(material, saved);
    }
    return saved;
  }
  syncComparisonMaterial(material, kind) {
    const saved = this.rememberComparisonMaterial(material);
    if (!saved?.fragmentShader) return;
    const source = this.comparisonSnapshot?.shaders[kind] ?? saved;
    if (material.fragmentShader !== source.fragmentShader || material.vertexShader !== source.vertexShader) {
      material.dispose(); // release the former renderer program before reusing this object
      material.vertexShader = source.vertexShader; material.fragmentShader = source.fragmentShader;
      material.needsUpdate = true;
    }
    if (kind === 'boundary') {
      const historical = !!this.comparisonSnapshot;
      const config = historical ? { transparent: true, depthWrite: true, side: THREE.DoubleSide, forceSinglePass: true } : saved;
      let changed = false;
      for (const key of ['transparent', 'depthWrite', 'side', 'forceSinglePass']) {
        if (material[key] !== config[key]) { material[key] = config[key]; changed = true; }
      }
      if (changed) material.needsUpdate = true;
      if (material.uniforms.opacity) material.uniforms.opacity.value = historical ? .96 : saved.opacity;
    }
    if (kind === 'terrain') {
      const styles = this.comparisonSnapshot?.styles;
      const historicalColors = styles ? { fieldInkColor: styles.nether.ink.color, fieldColdColor: styles.nether.pilotPalette.blue,
        fieldMineralBlue: styles.upper.terrain.rock, fieldMineralGreen: styles.upper.terrain.palette[13], fieldMineralGold: styles.upper.pilotPalette.warm } : null;
      for (const [key, color] of Object.entries(saved.fieldColors)) {
        if (historicalColors) material.uniforms[key].value.set(historicalColors[key]);
        else material.uniforms[key].value.copy(color);
      }
    }
  }
  setProfile(value) {
    if (value !== this.profile) this.profile = resolveArtProfile(value, this.profile);
    for (const stage of this.host.stages.values()) this.styleStage(stage);
    this.styleContextKey = null;
    this.syncStyleContext();
    return this.profile;
  }
  setDebugView(view = 'final') {
    if (!this.development) view = 'final';
    if (!Object.hasOwn(ART_DEBUG_MODES, view)) throw new Error(`Unknown art debug view: ${view}`);
    if (!this.comparisonDebugSupported && view !== 'final')
      throw new Error(`${this.comparisonStyle} contains historical final shaders only; switch to c2d1-style for decomposition`);
    this.debugView = view;
    for (const stage of this.host.stages.values()) this.syncDebugStage(stage);
    return this.debugView;
  }
  syncDebugStage(stage) {
    const mode = ART_DEBUG_MODES[this.debugView];
    for (const material of [stage.terrain?.inkMaterial, stage.water?.inkMaterial])
      if (material?.uniforms.artDebugMode) material.uniforms.artDebugMode.value = mode;
  }
  styleStage(stage) {
    const realmStyle = this.profile.enabled && this.profile.mode === 'realm-style-v1'
      ? this.realmStyleFor(stage.plane) : null;
    const profile = !this.profile.enabled ? null : realmStyle ? {
      ...this.profile, realmStyle, paperColor: realmStyle.paper.color,
      pigmentDensity: realmStyle.pigment.density, pigmentSaturation: realmStyle.pigment.saturation,
      terrainBoundaryStrength: realmStyle.pigment.boundaryStrength,
      structuralInkStrength: realmStyle.ink.structure, silhouetteInkStrength: realmStyle.ink.silhouette,
      inkDensity: realmStyle.ink.density, dryBrushStrength: realmStyle.ink.dryBrush,
      distanceFade: realmStyle.pigment.distanceFade ?? this.profile.distanceFade,
      // M2-C2D P2：明度骨架只加三项真正可解释的 tone control。
      massShadeStrength: realmStyle.tone?.massShade ?? 0, deepInkStrength: realmStyle.tone?.deepInk ?? 0,
      heightWashStrength: realmStyle.tone?.heightWash ?? 0,
    } : this.profile;
    stage.terrain?.setArtProfile(profile);
    this.syncComparisonMaterial(stage.terrain?.inkMaterial, 'terrain');
    stage.markers?.setArtProfile(profile, realmStyle ? {
      upper: this.realmStyleFor('upper').boundary.rift,
      nether: this.realmStyleFor('nether').boundary.rift,
    } : null);
    stage.setEnvironmentArtProfile(profile);
    const pilot = profile?.pilots ? profile : null;
    for (const [category, layer] of [['entity', stage.entities], ['vegetation', stage.vegetation], ['building', stage.settlements]])
      layer?.setArtProfile(realmStyle ? { ...pilot, layerCategory: category,
        distanceFade: realmStyle[category].distanceFade ?? pilot.distanceFade } : pilot);
    if (stage.water) {
      // M2-C2D P1：realm-style 走连续绘画水面材质；其余档案保持 legacy 调色路径。
      const mainComparison = this.comparisonStyle === 'main-style';
      if (mainComparison && stage.water.inkActive) stage.water.inkMaterial.dispose();
      if (!mainComparison && realmStyle && stage.water.mesh.material === stage.water.material)
        stage.water.material.dispose();
      stage.water.setArtProfile(realmStyle && !mainComparison ? profile : null);
      if (!mainComparison) this.syncComparisonMaterial(stage.water.inkMaterial, 'water');
      if (!stage.water.inkActive) {
        const material = stage.water.material;
        if (!this.saved.has(material)) this.saved.set(material, { color: material.color.clone(), opacity: material.opacity });
        const saved = this.saved.get(material);
        // Existing water semantics and geometry remain authoritative. Pale pigment, not a new sea.
        material.color.copy(mainComparison && realmStyle ? new THREE.Color(realmStyle.water.color)
          : profile ? new THREE.Color(profile.paperColor).lerp(new THREE.Color('#667e80'), 0.24) : saved.color);
        material.opacity = mainComparison && realmStyle ? realmStyle.water.opacity : profile ? 0.40 : saved.opacity;
      }
    }
    this.syncDebugStage(stage);
  }
  syncStyleContext() {
    const targetPlane = this.host.realmPrototype?.open ? this.host.realmPrototype.targetPlane : null;
    const backgroundPlane = targetPlane ? 'mortal' : this.host.activePlane;
    const key = `${this.comparisonStyle}|${this.profile.name}|${backgroundPlane}|${targetPlane || ''}`;
    if (key === this.styleContextKey) return;
    this.styleContextKey = key;
    this.styleBoundary(targetPlane);
    const color = !this.profile.enabled ? this.clearColor
      : this.profile.mode === 'realm-style-v1' ? this.realmStyleFor(backgroundPlane).paper.background
        : this.profile.paperColor;
    this.host.gpu.setClearColor(color);
  }
  styleBoundary(targetPlane = null) {
    const boundary = this.host.boundary;
    const material = boundary?.material;
    // Host owns the shader material; this pass owns only the temporary main Lambert.
    if (this.comparisonBoundary && this.comparisonBoundary.boundary !== boundary) {
      this.comparisonBoundary.legacy?.dispose(); this.comparisonBoundary = null;
    }
    if (!material) return;
    this.rememberComparisonMaterial(material);
    if (!this.saved.has(material)) this.saved.set(material, { color: material.color.clone() });
    const realmStyle = this.profile.enabled && this.profile.mode === 'realm-style-v1' && targetPlane
      ? this.realmStyleFor(targetPlane) : null;
    boundary.setRealmStyle?.(realmStyle?.boundary ?? null, realmStyle ?? null);
    if (realmStyle)
      material.color.set('#ffffff');
    else if (this.profile.enabled) material.color.set('#b8b4aa');
    else material.color.copy(this.saved.get(material).color);
    if (this.comparisonStyle === 'main-style') {
      if (!this.comparisonBoundary) this.comparisonBoundary = { boundary, legacy: null };
      if (!this.comparisonBoundary.legacy) {
        material.dispose();
        this.comparisonBoundary.legacy = new THREE.MeshLambertMaterial({
          vertexColors: true, side: THREE.DoubleSide, flatShading: true, transparent: true, opacity: .96 });
      }
      const legacy = this.comparisonBoundary.legacy;
      legacy.color.copy(material.color);
      boundary.mesh.material = legacy;
    } else {
      if (this.comparisonBoundary?.legacy) {
        this.comparisonBoundary.legacy.dispose(); this.comparisonBoundary.legacy = null;
      }
      boundary.mesh.material = material;
      this.syncComparisonMaterial(material, 'boundary');
    }
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
      if (stage.water?.inkMaterial?.uniforms.pixelsPerUnit) stage.water.inkMaterial.uniforms.pixelsPerUnit.value = view.pixelsPerUnit;
      stage.setEnvironmentArtView(view);
      for (const layer of [stage.entities, stage.vegetation, stage.settlements]) layer?.setArtView(view);
    }
  }
  dispose() {
    this.comparisonBoundary?.legacy?.dispose(); this.comparisonBoundary = null;
    this.comparisonMaterials = new WeakMap(); this.saved = new WeakMap(); this.host = null;
  }
}
