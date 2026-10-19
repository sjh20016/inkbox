import * as THREE from 'three';
import { makeCanvas } from './canvas.js';
import { shanhaiSceneFor } from './ShanhaiStyle.js';
import { sceneryGeometry } from './ShanhaiSceneryLayer.js';

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
    // V1.1 远岛：平顶、下垂收束的倒悬山剪影（V1 为倒三角，近看像风筝）。小、淡、成组。
    for (let i = 0; i < 7; i++) {
      const x = W * (0.06 + r() * 0.88), y = H * (0.20 + r() * 0.18), w = 14 + r() * (i < 2 ? 46 : 22), d = w * (0.75 + r() * 0.4);
      g.fillStyle = s.hills[1 + (i % 2)]; g.globalAlpha = 0.30 + r() * 0.15;
      g.beginPath(); g.moveTo(x - w, y);
      g.quadraticCurveTo(x - w * 0.4, y - w * 0.16, x, y - w * 0.12); g.quadraticCurveTo(x + w * 0.5, y - w * 0.18, x + w, y);
      g.lineTo(x + w * 0.62, y + d * 0.30); g.lineTo(x + w * 0.30, y + d * 0.55); g.lineTo(x + w * 0.08, y + d);
      g.lineTo(x - w * 0.14, y + d * 0.62); g.lineTo(x - w * 0.52, y + d * 0.36); g.closePath(); g.fill();
      if (i < 3) { g.fillStyle = '#D2AE4E'; g.globalAlpha = 0.35; g.fillRect(x - w * 0.10, y - w * 0.30, w * 0.20, w * 0.10); }
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

/**
 * V1.1 浮岛：上平下收的「倒悬山」——顶面略隆、沿口不规则；岩身分三折内收，
 * 比例宽 > 高（约 1 : 0.9–1.3），底部垂一束钟乳状石根。顶点色由上到下：
 * 草绿顶 → 赭石沿口 → 石青岩身 → 纸色淡出（悬于云中）。
 */
function isletGeometry(radius, height, seed, palette) {
  const r = rand(seed), seg = 11;
  const prof = [[1.00, 0.18], [1.04, 0.0], [0.96, -0.10], [0.82, -0.26], [0.62, -0.46], [0.44, -0.64], [0.26, -0.82], [0.10, -0.95], [0.0, -1.0]];
  const jitter = Array.from({ length: seg }, () => 0.82 + r() * 0.34);
  const pos = [], col = [], idx = [];
  const cTop = new THREE.Color(palette.top), cLip = new THREE.Color(palette.lip), cRock = new THREE.Color(palette.rock), cFoot = new THREE.Color(palette.foot);
  const tmp = new THREE.Color();
  // apex of top dome
  pos.push(0, radius * 0.30, 0); tmp.copy(cTop); col.push(tmp.r, tmp.g, tmp.b);
  prof.forEach(([k, yy], ring) => {
    for (let j = 0; j < seg; j++) {
      const a = j / seg * Math.PI * 2 + (ring % 2) * 0.12, jj = jitter[j] * (ring > 1 ? 0.92 + r() * 0.16 : 1);
      const rr = radius * k * jj, y = yy > 0 ? radius * yy : height * yy;
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
      const t = ring <= 1 ? 0 : (ring - 1) / (prof.length - 2);
      if (ring === 0) tmp.copy(cTop); else if (ring === 1) tmp.copy(cLip);
      else if (t < 0.45) tmp.copy(cLip).lerp(cRock, Math.min(1, t / 0.30));
      else tmp.copy(cRock).lerp(cFoot, (t - 0.45) / 0.55);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  });
  for (let j = 0; j < seg; j++) idx.push(0, 1 + (j + 1) % seg, 1 + j);
  for (let ring = 0; ring < prof.length - 1; ring++) for (let j = 0; j < seg; j++) {
    const a = 1 + ring * seg + j, b = 1 + ring * seg + (j + 1) % seg, c = a + seg, d = b + seg;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); const flat = g.toNonIndexed(); g.dispose(); flat.computeVertexNormals();
  return flat;
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
    // V1.1: traverse — floater groups own nested geometries (V1 only freed direct children).
    const owned = new Set();
    for (const child of [...this.root.children]) { child.traverse(o => { if (o.geometry && !o.userData.sharedGeometry) owned.add(o.geometry); }); child.removeFromParent(); }
    for (const g of owned) g.dispose();
    for (const g of this.sharedGeometries || []) g.dispose(); this.sharedGeometries = [];
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
  /** Upper: 浮岛（倒悬山 + 云台仙殿 / 松）; Nether: 断岩残碑. Placed strictly outside [0,w)×[0,h). */
  buildFloaters(plane, world, r) {
    const upper = plane === 'upper';
    const pal = upper ? { top: '#6E9A6A', lip: '#B89A68', rock: '#4F8790', foot: '#E8E4D6' } : { top: '#4A4743', lip: '#2E2C29', rock: '#1E1D1B', foot: '#9A958A' };
    const rock = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const ink = new THREE.MeshBasicMaterial({ color: upper ? '#24333A' : '#0E0D0C', side: THREE.BackSide });
    ink.onBeforeCompile = shader => { shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * 0.16;'); };
    const decor = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    const hall = new THREE.MeshLambertMaterial({ color: upper ? '#F0EDE1' : '#2A2826', flatShading: true });
    const gold = new THREE.MeshBasicMaterial({ color: upper ? '#D5B65A' : '#B23A2E' });
    this.materials.push(rock, ink, decor, hall, gold);
    // Shared motif geometries (one per kind), instanced by reference on many isles.
    const motifs = upper ? { terrace: sceneryGeometry('terrace', 'upper'), stele: sceneryGeometry('stele', 'upper') }
      : { stele: sceneryGeometry('stele', 'nether'), remnant: sceneryGeometry('remnant', 'nether') };
    const pine = new THREE.ConeGeometry(0.55, 1.9, 6); pine.translate(0, 0.95, 0);
    this.sharedGeometries = [...Object.values(motifs), pine];
    const pineMat = new THREE.MeshLambertMaterial({ color: upper ? '#3F6F57' : '#2A2826', flatShading: true }); this.materials.push(pineMat);
    const hw = world.w / 2, hh = world.h / 2;
    // Composition: one or two large anchor isles + a cluster of small ones around each (主宾呼应).
    const anchors = upper ? 3 : 2, plan = [];
    for (let a = 0; a < anchors; a++) {
      const side = (a * 2 + ((world.seed >>> 0) % 4)) % 4, along = 0.2 + r() * 0.6;
      const x = side === 0 ? -hw - 46 - r() * 30 : side === 1 ? hw + 46 + r() * 30 : (along - 0.5) * world.w;
      const z = side === 2 ? -hh - 46 - r() * 30 : side === 3 ? hh + 50 + r() * 26 : (along - 0.5) * world.h;
      const y = upper ? 22 + r() * 20 : 6 + r() * 12;
      const R = upper ? 8 + r() * 4 : 5 + r() * 3;
      plan.push({ x, y, z, R, big: true });
      const n = upper ? 2 + Math.floor(r() * 3) : 2 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const ang = r() * Math.PI * 2, dist = R * (1.8 + r() * 1.6);
        plan.push({ x: x + Math.cos(ang) * dist, y: y + (r() - 0.3) * 14, z: z + Math.sin(ang) * dist, R: R * (0.22 + r() * 0.26), big: false });
      }
    }
    plan.forEach((q, i) => {
      const g = new THREE.Group(); noRaycast(g);
      const height = q.R * (0.9 + r() * 0.45);
      const geo = isletGeometry(q.R, height, (world.seed >>> 0) + i * 97 + 3, pal);
      const body = noRaycast(new THREE.Mesh(geo, rock)); g.add(body);
      const line = noRaycast(new THREE.Mesh(geo, ink)); line.userData.sharedGeometry = true; g.add(line);
      if (q.big) {
        const kind = upper ? 'terrace' : 'remnant';
        const m = noRaycast(new THREE.Mesh(motifs[kind], decor)); m.userData.sharedGeometry = true;
        m.scale.setScalar(q.R * (upper ? 0.34 : 0.42)); m.position.y = q.R * 0.22; m.rotation.y = r() * Math.PI * 2; g.add(m);
      } else if (r() < 0.6) {
        const m = noRaycast(new THREE.Mesh(motifs.stele, decor)); m.userData.sharedGeometry = true; m.scale.setScalar(Math.max(0.6, q.R * 0.35)); m.position.set(q.R * 0.2, q.R * 0.24, 0); g.add(m);
      }
      const pines = q.big ? 3 + Math.floor(r() * 3) : Math.floor(r() * 3);
      for (let p = 0; p < pines; p++) {
        const ang = r() * Math.PI * 2, d = q.R * (0.55 + r() * 0.35), s = (q.big ? 1.1 : 0.7) * (0.7 + r() * 0.6);
        const t = noRaycast(new THREE.Mesh(pine, pineMat)); t.userData.sharedGeometry = true; t.scale.set(s, s * (1.1 + r() * 0.5), s);
        t.position.set(Math.cos(ang) * d, q.R * 0.14, Math.sin(ang) * d); g.add(t);
      }
      g.position.set(q.x, q.y, q.z); g.rotation.y = r() * Math.PI * 2;
      const skirt = noRaycast(new THREE.Sprite(this.materials[0])); skirt.scale.set(q.R * 4.2, q.R * 1.4, 1); skirt.position.y = -height * 0.62; g.add(skirt);
      g.userData.base = g.position.clone(); g.userData.phase = r() * Math.PI * 2;
      this.root.add(g); this.floaters.push(g);
    });
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
