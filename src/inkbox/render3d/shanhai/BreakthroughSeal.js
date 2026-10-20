import * as THREE from 'three';
import { makeCanvas } from './canvas.js';

/**
 * V1 · 山海入画 — 突破异象的「法印」层：在既有墨圈 / 气柱之上，悬起一枚篆意法印，
 * 外圈八卦爻纹缓转；成功则印升起、金光由内而外，失败则朱印裂开、碎墨下坠。
 * 只读取 ThreeBreakthroughFx 已通过归属检查的条目；固定池，不按事件分配对象。
 */
export const SHANHAI_FX = { enabled: false };
const make = makeCanvas;
const TRIGRAMS = ['111', '011', '101', '001', '110', '010', '100', '000'];

function sealTexture(style) {
  const S = 256, c = make(S, S), g = c?.getContext?.('2d');
  if (!g) return null;
  const success = style.endsWith('Success'), major = style.startsWith('major');
  const ink = success ? (major ? '#C9A23E' : '#5C8D6B') : (major ? '#B23A2E' : '#704247');
  g.translate(S / 2, S / 2);
  g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'round';
  // Outer brushed ring (飞白): broken arcs of varying weight.
  for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; g.lineWidth = 5 + (i % 3) * 2; g.globalAlpha = 0.55 + (i % 4) * 0.12; g.beginPath(); g.arc(0, 0, 112, a, a + Math.PI * 2 / 26 * 0.82); g.stroke(); }
  g.globalAlpha = 1;
  // Eight trigrams.
  for (let i = 0; i < 8; i++) {
    g.save(); g.rotate(i / 8 * Math.PI * 2); g.translate(0, -88);
    TRIGRAMS[i].split('').forEach((bit, k) => { const y = k * 8 - 8; if (bit === '1') g.fillRect(-14, y, 28, 5); else { g.fillRect(-14, y, 11, 5); g.fillRect(3, y, 11, 5); } });
    g.restore();
  }
  g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 66, 0, Math.PI * 2); g.stroke();
  // Central square seal, 白文: the glyph is knocked out of the ink block.
  g.fillRect(-46, -46, 92, 92);
  g.globalCompositeOperation = 'destination-out';
  g.font = '700 38px "Noto Serif SC","Songti SC",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const text = success ? (major ? '破境' : '小成') : (major ? '劫败' : '气散');
  g.fillText(text[0], 0, -18); g.fillText(text[1], 0, 22);
  if (!success) { g.lineWidth = 6; g.beginPath(); g.moveTo(-60, -70); g.lineTo(-8, -6); g.lineTo(-22, 12); g.lineTo(40, 76); g.stroke(); }
  for (let i = 0; i < 70; i++) { g.globalAlpha = 0.6; g.fillRect((Math.sin(i * 12.9898) * 0.5) * 220, (Math.sin(i * 78.233) * 0.5) * 220, 2 + i % 3, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class BreakthroughSeal {
  constructor(capacity = 16) {
    this.root = new THREE.Group(); this.root.name = 'ShanhaiBreakthroughSeal';
    this.textures = {}; this.pool = [];
        for (let i = 0; i < capacity; i++) {
      const material = new THREE.SpriteMaterial({ map: null, transparent: true, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(material); sprite.visible = false; sprite.raycast = () => {}; sprite.renderOrder = 40;
      sprite.userData.presentationOnly = true; this.root.add(sprite); this.pool.push(sprite);
    }
    this.used = 0; this.stats = { active: 0 };
  }
  begin() { this.used = 0; }
  /** point: render-space ground point; progress 0..1 of item life. */
  add(style, point, progress, seed = 0) {
    if (!SHANHAI_FX.enabled || this.used >= this.pool.length) return;
    const sprite = this.pool[this.used++], major = style.startsWith('major'), success = style.endsWith('Success');
    if (!(style in this.textures)) this.textures[style] = sealTexture(style);
    if (!this.textures[style]) return;
    sprite.material.map = this.textures[style]; sprite.material.needsUpdate = true;
    const appear = Math.min(1, progress * 4), vanish = Math.min(1, (1 - progress) * 3);
    const size = (major ? 9 : 2.6) * (success ? 0.7 + appear * 0.3 : 1.0 - progress * 0.25);
    const rise = success ? (major ? 4 + progress * 7 : 1.6 + progress * 2.2) : (major ? 5 - progress * 4 : 1.8 - progress * 1.2);
    sprite.position.set(point.x, point.y + rise, point.z);
    sprite.scale.set(size, size, 1);
    sprite.material.rotation = (success ? 1 : -1) * progress * 1.2 + seed * 0.3 + (success ? 0 : Math.sin(progress * 40) * 0.04);
    sprite.material.opacity = Math.max(0, appear * vanish) * (major ? 0.95 : 0.85);
    sprite.visible = true;
  }
  end() { for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false; this.stats.active = this.used; }
  dispose() { for (const s of this.pool) s.material.dispose(); for (const t of Object.values(this.textures)) t?.dispose(); this.root.removeFromParent(); }
}
