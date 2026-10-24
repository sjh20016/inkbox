import * as THREE from 'three';
import { makeCanvas } from './canvas.js';

/**
 * V1 · 山海入画 — 视界「揭卷」边：沿视界 Region 边界，把凡间表层画成一圈被掀起、
 * 微微卷翘的纸边（内缘焦痕、外缘撕口纤维），并在窗口最靠前的角落钤一枚界印。
 * 窗外仍是凡间，窗内才是另一界 —— 视界永远是局部揭开，而不是全屏切换。
 * 纯表现：不拾取（raycast = noop）、不写 World / 存档，随界缘重建一起重建。
 */
const make = makeCanvas;

function stripTexture() {
  const W = 256, H = 64, c = make(W, H), g = c.getContext('2d');
  // v = 0 → inner (attached to the open window), v = 1 → torn outer lip.
  const grad = g.createLinearGradient(0, 0, 0, H);
  // A narrow ink/gold hem sits at the edge; the old opaque cream sheet floated
  // above the mountain profile and formed a second, white boundary wall.
  grad.addColorStop(0, 'rgba(74,61,43,0.58)');
  grad.addColorStop(0.06, 'rgba(177,151,100,0.48)');
  grad.addColorStop(0.16, 'rgba(224,211,181,0.18)');
  grad.addColorStop(0.42, 'rgba(224,211,181,0.025)');
  grad.addColorStop(1, 'rgba(224,211,181,0)');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  let seed = 17; const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  g.globalCompositeOperation = 'destination-out';
  for (let x = 0; x < W; x += 2) { const d = H * (0.62 + r() * 0.34); g.fillRect(x, d, 2, H - d); }
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(160,140,110,0.35)';
  for (let i = 0; i < 140; i++) { const x = r() * W, y = H * (0.3 + r() * 0.5); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 10, y + r() * 6); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

function sealTexture(text, color) {
  const S = 128, c = make(S, S), g = c.getContext('2d');
  g.fillStyle = color; g.beginPath(); g.roundRect?.(10, 10, S - 20, S - 20, 10); if (!g.roundRect) g.rect(10, 10, S - 20, S - 20); g.fill();
  g.globalCompositeOperation = 'destination-out';
  let seed = text.charCodeAt(0); const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 90; i++) { g.globalAlpha = 0.5 + r() * 0.5; g.fillRect(10 + r() * (S - 20), 10 + r() * (S - 20), 1 + r() * 3, 1 + r() * 2); }
  g.globalAlpha = 1;
  g.font = `700 ${text.length > 1 ? 40 : 66}px "Noto Serif SC","Songti SC",serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (text.length > 1) { g.fillText(text[0], S / 2, S * 0.33); g.fillText(text[1], S / 2, S * 0.68); } else g.fillText(text, S / 2, S / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class RealmVeilRim {
  constructor({ coordinates }) {
    this.coordinates = coordinates;
    this.texture = stripTexture();
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: true, alphaTest: 0.02 });
    this.material.name = 'ShanhaiVeilRim';
    this.geometry = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'ShanhaiVeilRim'; this.mesh.raycast = () => {}; this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    this.mesh.userData.presentationOnly = true; this.mesh.userData.decorative = 'shanhai';
    this.seals = {
      upper: new THREE.SpriteMaterial({ map: sealTexture('上界', '#B64A3B'), transparent: true, depthTest: true }),
      nether: new THREE.SpriteMaterial({ map: sealTexture('幽冥', '#8D394C'), transparent: true, depthTest: true }),
    };
    this.seal = new THREE.Sprite(this.seals.upper); this.seal.raycast = () => {}; this.seal.renderOrder = 7; this.seal.visible = false;
    this.root = new THREE.Group(); this.root.name = 'ShanhaiVeil'; this.root.add(this.mesh, this.seal); this.root.visible = false;
    this.stats = { edges: 0 };
  }
  clear() { this.root.visible = false; this.stats.edges = 0; }
  rebuild({ regionGeometry, mortalElevation, targetPlane, accessBounds = null, enabled = true }) {
    if (!enabled || !regionGeometry?.edgeCount || !mortalElevation) { this.clear(); return; }
    const pos = [], uv = [], idx = []; let u = 0, best = null;
    const inside = (x, y) => regionGeometry.isInsideQuad(Math.floor(x), Math.floor(y));
    const lift = 0.16, reach = targetPlane === 'upper' ? 0.42 : 0.34;
    for (const { ax, ay, bx, by } of regionGeometry.boundaryEdges()) {
      if (accessBounds && (Math.min(ax, bx) < accessBounds.x0 || Math.max(ax, bx) > accessBounds.x1 || Math.min(ay, by) < accessBounds.y0 || Math.max(ay, by) > accessBounds.y1)) continue;
      let nx = -(by - ay), ny = bx - ax; const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      if (inside(mx + nx * 0.5, my + ny * 0.5)) { nx = -nx; ny = -ny; } // outward = away from the window
      const ya = mortalElevation.node(ax, ay), yb = mortalElevation.node(bx, by), base = pos.length / 3;
      const wobA = Math.sin(ax * 1.7 + ay * 2.3) * 0.045, wobB = Math.sin(bx * 1.7 + by * 2.3) * 0.045;
      const pa = this.coordinates.cellToRender(ax, ay), pb = this.coordinates.cellToRender(bx, by);
      const qa = this.coordinates.cellToRender(ax + nx * (reach + wobA), ay + ny * (reach + wobA));
      const qb = this.coordinates.cellToRender(bx + nx * (reach + wobB), by + ny * (reach + wobB));
      pos.push(pa.x, ya + 0.025, pa.z, pb.x, yb + 0.025, pb.z, qa.x, ya + lift + wobA, qa.z, qb.x, yb + lift + wobB, qb.z);
      uv.push(u, 0, u + 0.25, 0, u, 1, u + 0.25, 1); u += 0.25;
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      const p = this.coordinates.cellToRender(mx, my);
      if (!best || p.z - p.x * 0.3 > best.score) best = { score: p.z - p.x * 0.3, x: qa.x, y: Math.max(ya, yb) + lift + 2.4, z: qa.z };
    }
    this.geometry.dispose(); this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.geometry.setIndex(idx); this.mesh.geometry = this.geometry;
    this.seal.material = this.seals[targetPlane] || this.seals.upper;
    if (best) { this.seal.position.set(best.x, best.y, best.z); this.seal.scale.set(2.5, 2.5, 1); }
    this.seal.visible = !!best; this.root.visible = pos.length > 0; this.stats.edges = pos.length / 12;
  }
  setZoom(zoom = 1) { const s = 2.5 / Math.max(0.6, Math.min(4, zoom)); this.seal.scale.set(s, s, 1); }
  dispose() {
    this.geometry.dispose(); this.material.dispose(); this.texture.dispose();
    for (const m of Object.values(this.seals)) { m.map.dispose(); m.dispose(); }
    this.root.removeFromParent();
  }
}
