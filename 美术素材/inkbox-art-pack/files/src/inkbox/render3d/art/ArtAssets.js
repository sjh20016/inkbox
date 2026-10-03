import * as THREE from 'three';

// 美术素材加载器。素材缺失 / 在 Node 里（无 DOM）⇒ 一律退回程序生成的占位纹理，画面降级而不报错。
// 素材来源：assets/art/*.png（由 tools/gen_art_assets.py 生成，manifest.json 记录用途）。

const FILES = Object.freeze({
  cun: 'cun.png', edge: 'edge.png', mist: 'mist_puff.png', paper: 'paper_grain.png',
  ramp_upper: 'ramp_upper.png', ramp_nether: 'ramp_nether.png',
});

function dataTexture(width, height, fill, { repeat = true, srgb = false } = {}) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(fill(x / width, y / height), (y * width + x) * 4);
  const t = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

function fallbacks() {
  const ramp = (a, b) => dataTexture(32, 1, (u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, 255], { repeat: false, srgb: true });
  return {
    // 占位皴：竖向条纹噪声，够让墙看起来不是纯色。
    cun: dataTexture(64, 64, (u, v) => { const k = hash(Math.floor(u * 24), Math.floor(v * 6)) > 0.5 ? 255 : 90; return [k, k, k, 255]; }),
    edge: dataTexture(64, 4, (u) => { const k = 255 * hash(Math.floor(u * 32), 1); return [k, k, k, 255]; }),
    mist: dataTexture(32, 32, (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5) * 2; const a = Math.max(0, 1 - r) * 200; return [244, 240, 228, a]; }, { repeat: false }),
    paper: null,
    ramp_upper: ramp([118, 98, 72], [238, 240, 226]),
    ramp_nether: ramp([118, 98, 72], [36, 30, 42]),
  };
}

export class ArtAssets {
  constructor({ baseUrl = new URL('../../../../assets/art/', import.meta.url).href, load = typeof document !== 'undefined' } = {}) {
    this.baseUrl = baseUrl;
    this.tex = fallbacks();
    this.loaded = new Set();
    this.listeners = new Set();
    this.failed = [];
    if (load) this.loadAll();
  }

  loadAll() {
    const loader = new THREE.TextureLoader();
    for (const [name, file] of Object.entries(FILES)) {
      if (name === 'paper') continue;               // 纸纹走 DOM 叠层，不进 WebGL
      loader.load(this.baseUrl + file, (texture) => {
        texture.wrapS = texture.wrapT = name.startsWith('ramp') || name === 'mist' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
        texture.colorSpace = name.startsWith('ramp') || name === 'mist' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = name !== 'ramp_upper' && name !== 'ramp_nether';
        if (!texture.generateMipmaps) texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        this.tex[name]?.dispose?.();
        this.tex[name] = texture;
        this.loaded.add(name);
        for (const cb of this.listeners) cb(name, texture);
      }, undefined, () => { this.failed.push(file); });
    }
  }

  get(name) { return this.tex[name]; }
  onChange(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  /** 纸纹 PNG 的 URL（DOM 叠层用）。 */
  paperUrl() { return this.baseUrl + FILES.paper; }

  dispose() {
    for (const t of Object.values(this.tex)) t?.dispose?.();
    this.listeners.clear();
  }
}
