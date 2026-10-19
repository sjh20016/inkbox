import * as THREE from 'three';
import { makeCanvas } from './canvas.js';
import { shanhaiSceneFor } from './ShanhaiStyle.js';

/**
 * V1 · 山海入画 — Host-level painted atmosphere. Presentation only:
 *  - a painted backdrop (paper sky, layered distant ranges, mist band) per background plane;
 *  - per-realm light colour / intensity on the existing hemisphere + sun;
 *  - a cloud / mist / ink-fog base that cradles the world slab (outside the playable bounds);
 *  - upper-realm floating islets and nether drifting shards, also strictly outside the map.
 * Nothing here is pickable (raycast is a no-op), saved, simulated, or read by World.
 */
const rand = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const noRaycast = object => { object.raycast = () => {}; object.userData.presentationOnly = true; object.userData.decorative = 'shanhai'; return object; };

function paintBackdrop(plane, seed = 7) {
  const s = shanhaiSceneFor(plane), W = 1536, H = 960, r = rand(seed * 31 + plane.length * 977);
  const canvas = makeCanvas(W, H);
  const g = canvas.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, s.sky.top); sky.addColorStop(0.55, s.sky.horizon); sky.addColorStop(1, s.sky.bottom);
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // Sun / moon: a pale pigment disc, never a light source.
  g.globalAlpha = s.sun.alpha; g.fillStyle = s.sun.color;
  g.beginPath(); g.arc(s.sun.x * W, s.sun.y * H, s.sun.r * W, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  // Layered distant ranges: far = pale, near = deeper; each fades into a mist band.
  const layers = s.hills.length;
  for (let li = 0; li < layers; li++) {
    const base = H * (0.40 + li * 0.075), amp = H * (0.10 + li * 0.035), jag = plane === 'nether' ? 1.9 : plane === 'upper' ? 1.3 : 0.9;
    const phases = Array.from({ length: 5 }, () => r() * Math.PI * 2), freqs = [1.3, 2.7, 5.1, 9.7, 17.3].map(f => f * (0.8 + r() * 0.4));
    const ridge = [];
    for (let x = 0; x <= W; x += 6) {
      const t = x / W; let y = 0;
      for (let k = 0; k < 5; k++) y += Math.sin(t * Math.PI * freqs[k] + phases[k]) / (k + 1) ** (plane === 'nether' ? 0.8 : 1.15);
      // Shan-shui peaks: sharpen the positive lobes into spires.
      y = Math.sign(y) * Math.abs(y) ** (plane === 'upper' ? 0.7 : 0.9) * jag;
      ridge.push([x, base - y * amp * 0.55 - amp * 0.35]);
    }
    const grad = g.createLinearGradient(0, base - amp * 1.3, 0, base + amp * 0.9);
    grad.addColorStop(0, s.hills[li]); grad.addColorStop(0.62, s.hills[li]); grad.addColorStop(1, s.mistBand);
    g.fillStyle = grad; g.beginPath(); g.moveTo(0, H);
    for (const [x, y] of ridge) g.lineTo(x, y);
    g.lineTo(W, H); g.closePath(); g.globalAlpha = 0.55 + li * 0.15; g.fill(); g.globalAlpha = 1;
    // Dry ink along the ridge: broken strokes, thicker on the nearer layer.
    g.strokeStyle = s.hillInk; g.lineCap = 'round';
    for (let i = 1; i < ridge.length; i++) {
      if (r() < 0.35) continue;
      g.globalAlpha = (0.10 + li * 0.10) * (0.5 + r() * 0.5); g.lineWidth = 0.6 + li * 0.8 + r();
      g.beginPath(); g.moveTo(...ridge[i - 1]); g.lineTo(...ridge[i]); g.stroke();
    }
    // Cun: short downward strokes from the ridge on nearer layers.
    if (li > 0) for (let i = 0; i < ridge.length; i += 3) {
      if (r() < 0.55) continue; const [x, y] = ridge[i];
      g.globalAlpha = 0.06 + li * 0.04; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x + (r() - 0.5) * 8, y + 10 + r() * amp * 0.35); g.stroke();
    }
    g.globalAlpha = 1;
  }
  // Mist band across the lower half; the world slab floats in it.
  const mist = g.createLinearGradient(0, H * 0.55, 0, H);
  mist.addColorStop(0, s.mistBand + '00'); mist.addColorStop(0.35, s.mistBand + 'CC'); mist.addColorStop(1, s.sky.bottom);
  g.fillStyle = mist; g.fillRect(0, H * 0.55, W, H * 0.45);
  if (plane === 'upper') {
    // Distant floating islets + a hairline bridge: a mural motif, not geometry.
    for (let i = 0; i < 6; i++) {
      const x = W * (0.08 + r() * 0.84), y = H * (0.16 + r() * 0.22), w = 30 + r() * 70;
      g.fillStyle = s.hills[1 + (i % 2)]; g.globalAlpha = 0.55;
      g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x, y - w * 0.45, x + w, y); g.lineTo(x + w * 0.2, y + w * 0.8); g.closePath(); g.fill();
      g.fillStyle = '#D2AE4E'; g.globalAlpha = 0.45; g.fillRect(x - w * 0.12, y - w * 0.32, w * 0.24, w * 0.08);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 9; i++) { // cloud ribbons
      const y = H * (0.22 + r() * 0.5), x = W * r(), len = 160 + r() * 380;
      const cg = g.createLinearGradient(x, 0, x + len, 0); cg.addColorStop(0, '#FFFFFF00'); cg.addColorStop(0.5, '#FFFDF6D0'); cg.addColorStop(1, '#FFFFFF00');
      g.fillStyle = cg; g.beginPath(); g.ellipse(x + len / 2, y, len / 2, 6 + r() * 10, 0, 0, Math.PI * 2); g.fill();
    }
  }
  if (plane === 'nether') {
    g.fillStyle = '#E8E2D4';
    for (let i = 0; i < 260; i++) { g.globalAlpha = 0.05 + r() * 0.12; g.fillRect(r() * W, r() * H * 0.8, 1.5, 1.5 + r() * 3); }
    g.globalAlpha = 1;
  }
  // Paper fibres over everything.
  for (let i = 0; i < 1800; i++) { g.globalAlpha = 0.025; g.fillStyle = r() < 0.5 ? '#000000' : '#FFFFFF'; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1); }
  g.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.name = `ShanhaiBackdrop:${plane}`;
  return texture;
}

function puffTexture(kind) {
  const S = 128, canvas = makeCanvas(S, S);
  const g = canvas.getContext('2d'), r = rand(kind.length * 131);
  for (let i = 0; i < 9; i++) {
    const x = S * (0.3 + r() * 0.4), y = S * (0.35 + r() * 0.3), rad = S * (0.18 + r() * 0.16);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)'); grad.addColorStop(0.7, 'rgba(255,255,255,0.22)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function isletGeometry(radius, height, seed) {
  const r = rand(seed), geo = new THREE.ConeGeometry(radius, height, 7, 3, false);
  geo.rotateX(Math.PI); // point downwards
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i); if (y > height / 2 - 1e-3) continue;
    pos.setX(i, pos.getX(i) * (0.8 + r() * 0.4)); pos.setZ(i, pos.getZ(i) * (0.8 + r() * 0.4));
  }
  geo.computeVertexNormals();
  return geo;
}

export class ShanhaiAtmosphere {
  constructor(host) {
    this.host = host; this.enabled = false; this.plane = null; this.backdrops = new Map();
    this.root = new THREE.Group(); this.root.name = 'ShanhaiAtmosphere'; this.root.visible = false;
    host.scene.add(this.root);
    this.defaults = null; this.time = 0; this.puffs = []; this.floaters = [];
    this.stats = { puffs: 0, floaters: 0, backdrop: null };
  }
  captureLights() {
    const { hemiLight: hemi, sunLight: sun } = this.host;
    if (!this.defaults && hemi && sun) this.defaults = { sky: hemi.color.clone(), ground: hemi.groundColor.clone(), hemi: hemi.intensity,
      sun: sun.color.clone(), sunIntensity: sun.intensity, sunDir: sun.position.clone() };
  }
  setContext({ enabled, plane = 'mortal' }) {
    this.captureLights();
    const key = `${!!enabled}|${plane}|${this.worldKey()}`;
    if (key === this.key) return; this.key = key;
    this.enabled = !!enabled; this.plane = plane;
    const { hemiLight: hemi, sunLight: sun, scene } = this.host;
    if (!this.enabled) {
      scene.background = null; this.root.visible = false;
      if (this.defaults && hemi && sun) {
        hemi.color.copy(this.defaults.sky); hemi.groundColor.copy(this.defaults.ground); hemi.intensity = this.defaults.hemi;
        sun.color.copy(this.defaults.sun); sun.intensity = this.defaults.sunIntensity; sun.position.copy(this.defaults.sunDir);
      }
      return;
    }
    const s = shanhaiSceneFor(plane);
    if (!this.backdrops.has(plane)) this.backdrops.set(plane, paintBackdrop(plane, (this.host.world?.seed >>> 0) % 997));
    scene.background = this.backdrops.get(plane); this.stats.backdrop = plane;
    if (hemi && sun) {
      hemi.color.set(s.light.sky); hemi.groundColor.set(s.light.ground); hemi.intensity = s.light.hemi;
      sun.color.set(s.light.sun); sun.intensity = s.light.sunIntensity; sun.position.set(...s.light.sunDir);
    }
    this.buildBase(plane);
    this.root.visible = true;
  }
  worldKey() { const w = this.host.world; return w ? `${w.w}x${w.h}:${w.seed}` : 'none'; }
  clearBase() {
    for (const child of [...this.root.children]) { child.removeFromParent(); child.geometry?.dispose?.(); }
    for (const m of this.materials || []) { m.map?.dispose(); m.dispose(); }
    this.materials = []; this.puffs = []; this.floaters = [];
  }
  /** Cloud / mist / ink fog ring just outside the slab, below the playable surface. */
  buildBase(plane) {
    this.clearBase();
    const world = this.host.world; if (!world) return;
    const s = shanhaiSceneFor(plane), r = rand((world.seed >>> 0) + plane.length * 7919);
    const hw = world.w / 2, hh = world.h / 2;
    const map = puffTexture(s.base.kind);
    const shades = [s.base.color, new THREE.Color(s.base.color).lerp(new THREE.Color(s.base.ink), plane === 'nether' ? 0.45 : 0.12).getStyle()];
    const mats = shades.map((c, i) => new THREE.SpriteMaterial({ map, color: c, transparent: true, depthWrite: false,
      opacity: s.base.opacity * (i ? 0.75 : 1), fog: false }));
    this.materials = mats;
    const perimeter = 2 * (world.w + world.h), step = plane === 'upper' ? 9 : 12;
    for (let ring = 0; ring < 2; ring++) {
      for (let d = 0; d < perimeter; d += step * (1 + ring * 0.4)) {
        let x, z; const t = d + r() * step;
        if (t < world.w) { x = t - hw; z = -hh; } else if (t < world.w + world.h) { x = hw; z = t - world.w - hh; }
        else if (t < 2 * world.w + world.h) { x = hw - (t - world.w - world.h); z = hh; } else { x = -hw; z = hh - (t - 2 * world.w - world.h); }
        const out = 6 + ring * 18 + r() * 14, len = Math.hypot(x, z) || 1;
        // push outward along the nearest edge normal, not radially, so corners stay wrapped
        const nx = Math.abs(x) >= hw - 0.5 ? Math.sign(x) : 0, nz = Math.abs(z) >= hh - 0.5 ? Math.sign(z) : 0;
        const sprite = noRaycast(new THREE.Sprite(mats[(ring + (r() < 0.3 ? 1 : 0)) % 2]));
        const size = (plane === 'upper' ? 46 : 38) + r() * 30 + ring * 16;
        sprite.scale.set(size * 1.7, size * 0.8, 1);
        sprite.position.set(x + (nx || x / len * 0.3) * out, -18 - ring * 9 + r() * 10, z + (nz || z / len * 0.3) * out);
        sprite.renderOrder = -2; sprite.userData.base = sprite.position.clone(); sprite.userData.phase = r() * Math.PI * 2;
        this.root.add(sprite); this.puffs.push(sprite);
      }
    }
    // A broad under-sheet so the slab never reads as hovering over blank paper.
    const sheetMat = new THREE.MeshBasicMaterial({ map, color: s.base.color, transparent: true, opacity: 0.85, depthWrite: false });
    this.materials.push(sheetMat);
    const sheet = noRaycast(new THREE.Mesh(new THREE.PlaneGeometry(world.w * 1.9, world.h * 2.1), sheetMat));
    sheet.rotation.x = -Math.PI / 2; sheet.position.y = -34; sheet.renderOrder = -3; this.root.add(sheet);
    if (plane === 'upper' || plane === 'nether') this.buildFloaters(plane, world, r);
    this.stats.puffs = this.puffs.length; this.stats.floaters = this.floaters.length;
  }
  /** Upper: 浮岛小殿; Nether: 断岩残碑. Placed strictly outside [0,w)×[0,h). */
  buildFloaters(plane, world, r) {
    const upper = plane === 'upper';
    const rock = new THREE.MeshLambertMaterial({ color: upper ? '#5C7F86' : '#3B3936', flatShading: true });
    const top = new THREE.MeshLambertMaterial({ color: upper ? '#5C8D6B' : '#57534C', flatShading: true });
    const hall = new THREE.MeshLambertMaterial({ color: upper ? '#F0EDE1' : '#2A2826', flatShading: true });
    const roof = new THREE.MeshLambertMaterial({ color: upper ? '#2F4955' : '#121110', flatShading: true });
    const gold = new THREE.MeshBasicMaterial({ color: upper ? '#D5B65A' : '#B23A2E' });
    this.materials.push(rock, top, hall, roof, gold);
    const count = upper ? 9 : 7, hw = world.w / 2, hh = world.h / 2;
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group(); noRaycast(g);
      const radius = upper ? 2.6 + r() * 3.4 : 2.2 + r() * 2.8, height = radius * (1.6 + r());
      const body = noRaycast(new THREE.Mesh(isletGeometry(radius, height, i * 97 + 3), rock)); body.position.y = -height / 2; g.add(body);
      const cap = noRaycast(new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.02, radius * 0.96, 1.2, 7), top)); cap.position.y = 0.4; g.add(cap);
      if (upper && r() < 0.75) {
        const base = noRaycast(new THREE.Mesh(new THREE.BoxGeometry(radius * 0.7, radius * 0.45, radius * 0.55), hall)); base.position.y = 1 + radius * 0.22; g.add(base);
        const rf = noRaycast(new THREE.Mesh(new THREE.ConeGeometry(radius * 0.72, radius * 0.42, 4), roof)); rf.rotation.y = Math.PI / 4; rf.position.y = 1 + radius * 0.66; g.add(rf);
        const tip = noRaycast(new THREE.Mesh(new THREE.SphereGeometry(radius * 0.06, 6, 4), gold)); tip.position.y = 1 + radius * 0.9; g.add(tip);
      } else if (!upper) {
        const stele = noRaycast(new THREE.Mesh(new THREE.BoxGeometry(radius * 0.25, radius * 0.9, radius * 0.1), hall)); stele.position.y = radius * 0.4; stele.rotation.z = (r() - 0.5) * 0.5; g.add(stele);
        if (r() < 0.6) { const lamp = noRaycast(new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 4), gold)); lamp.position.set(radius * 0.35, radius * 0.6, 0); g.add(lamp); }
      }
      const side = i % 4, along = r();
      const x = side === 0 ? -hw - 30 - r() * 40 : side === 1 ? hw + 30 + r() * 40 : (along - 0.5) * world.w * 1.1;
      const z = side === 2 ? -hh - 34 - r() * 40 : side === 3 ? hh + 40 + r() * 30 : (along - 0.5) * world.h * 1.1;
      g.position.set(x, upper ? 18 + r() * 30 : 4 + r() * 18, z); g.rotation.y = r() * Math.PI * 2;
      const skirt = noRaycast(new THREE.Sprite(this.materials[0])); skirt.scale.set(radius * 4.2, radius * 1.6, 1); skirt.position.y = -height * 0.55; g.add(skirt);
      g.userData.base = g.position.clone(); g.userData.phase = r() * Math.PI * 2;
      this.root.add(g); this.floaters.push(g);
    }
  }
  update(dt) {
    if (!this.enabled || !this.root.visible) return;
    this.time += Math.max(0, Math.min(0.1, dt || 0));
    const t = this.time;
    // Close-up views fly inside the cloud ring: fade the cradle out instead of fogging the subject.
    const zoom = this.host.cameraRig?.camera?.zoom ?? 1, fade = Math.max(0, Math.min(1, (3.0 - zoom) / 1.6));
    for (const [i, m] of (this.materials || []).entries()) {
      if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
      if (m.isSpriteMaterial || i === 2) m.opacity = m.userData.baseOpacity * fade;
    }
    for (const p of this.puffs) p.visible = fade > 0.01;
    for (const p of this.puffs) { const b = p.userData.base, ph = p.userData.phase; p.position.set(b.x + Math.sin(t * 0.07 + ph) * 3, b.y + Math.sin(t * 0.11 + ph) * 0.8, b.z + Math.cos(t * 0.05 + ph) * 3); }
    for (const f of this.floaters) { const b = f.userData.base; f.position.y = b.y + Math.sin(t * 0.35 + f.userData.phase) * 1.2; }
  }
  dispose() {
    this.clearBase(); for (const t of this.backdrops.values()) t.dispose(); this.backdrops.clear();
    if (this.host?.scene?.background && this.enabled) this.host.scene.background = null;
    this.root.removeFromParent(); this.host = null;
  }
}
