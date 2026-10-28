import { generateNetherWorld } from './worldgenNether.js';
import { classify, recomputeQi } from './terrain.js';

// The preview owns this candidate. Product world generation and save reconstruction
// continue to use worldgenNether unchanged.
export const NETHER_STRATA_VERSION = 'dn2a-strata-1';
const metadata = new WeakMap();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function hash(seed, x, y) {
  let n = (seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b)) >>> 0;
  n ^= n >>> 16; n = Math.imul(n, 0x7feb352d); n ^= n >>> 15;
  n = Math.imul(n, 0x846ca68b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function noise(seed, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), tx = smooth(0, 1, x - ix), ty = smooth(0, 1, y - iy);
  return mix(mix(hash(seed, ix, iy), hash(seed, ix + 1, iy), tx),
    mix(hash(seed, ix, iy + 1), hash(seed, ix + 1, iy + 1), tx), ty) * 2 - 1;
}
function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
function polygon(seed, tag, cx, cy, rx, ry, angle, count = 9) {
  const c = Math.cos(angle), s = Math.sin(angle), vertices = [];
  for (let i = 0; i < count; i++) {
    const theta = (i + (hash(seed ^ tag, i, 1) - 0.5) * 0.22) * Math.PI * 2 / count;
    const radius = (i === 2 || i === 6 ? 0.66 : 0.78) + hash(seed ^ tag, i, 2) * 0.37;
    const u = Math.cos(theta) * rx * radius, v = Math.sin(theta) * ry * radius;
    vertices.push([cx + u * c - v * s, cy + u * s + v * c]);
  }
  return vertices;
}
function signedPolygonDistance(x, y, points) {
  let inside = false, distance = Infinity;
  for (let j = points.length - 1, i = 0; i < points.length; j = i++) {
    const [ax, ay] = points[j], [bx, by] = points[i];
    distance = Math.min(distance, segmentDistance(x, y, ax, ay, bx, by));
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside ? distance : -distance;
}
export function getNetherStrataMetadata(world) { return metadata.get(world) ?? null; }
export function generateNetherStrataCandidate(options = {}, seedArg) {
  const opts = options.w ? { preset: options, seed: seedArg } : options;
  const world = generateNetherWorld(opts);
  const { w, h } = world, seed = world.seed >>> 0;
  const inputSeed = Math.trunc(Number(opts.seed ?? seed) || 0);
  const familyIndex = (Math.abs(inputSeed) % 3 + ((inputSeed >>> 4) % 3)) % 3;
  const family = ['断崖横列', '裂谷纵贯', '台地错落'][familyIndex];
  const angle = familyIndex === 0 ? 0.04 : familyIndex === 1 ? 1.38 : 0.63;
  const shift = (n, k) => n + 0.10 * noise(seed ^ k, n * 2.7, k * 0.001);
  const plates = [
    { x: shift(0.27, 13), y: shift(0.28, 29), rx: 0.31, ry: 0.24, angle, lift: 0.68 },
    { x: shift(0.70, 31), y: shift(0.29, 41), rx: 0.26, ry: 0.23, angle: angle + 0.32, lift: 0.43 },
    { x: shift(0.55, 53), y: shift(0.76, 61), rx: 0.34, ry: 0.20, angle: angle - 0.36, lift: 0.25 },
  ];
  plates.forEach((p, i) => { p.outline = polygon(seed, 0x715 + i, p.x, p.y, p.rx, p.ry, p.angle); });
  const faultX = familyIndex === 1 ? 0.53 : 0.28;
  const faultY = familyIndex === 0 ? 0.35 : 0.64;
  const ravine = familyIndex === 1
    ? [0.38, 0.02, 0.62, 0.98] : familyIndex === 0
      ? [0.03, 0.57, 0.95, 0.49] : [0.22, 0.03, 0.78, 0.93];
  const abyssX = clamp(plates[0].x + 0.10, 0.24, 0.48);
  const abyssY = clamp(plates[0].y + 0.085, 0.25, 0.45);
  const abyssOutline = polygon(seed, 0xadd, abyssX, abyssY, 0.13, 0.12, angle + 0.2, 8);
  const edge = 2.2 / Math.min(w, h);
  const riverPhase = hash(seed, 17, 23) * Math.PI * 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, nx = x / (w - 1), ny = y / (h - 1);
    const wx = noise(seed ^ 0x75128, nx * 4.1, ny * 4.1) * 0.025;
    const wy = noise(seed ^ 0x172b3, nx * 4.1, ny * 4.1) * 0.023;
    const grain = noise(seed ^ 0x321dc, nx * 12, ny * 12);
    const base = 0.355 + grain * 0.017 + noise(seed ^ 0x4a627, nx * 3.1, ny * 3.1) * 0.021;
    let uplift = 0;
    for (const p of plates) uplift = Math.max(uplift,
      p.lift * smooth(-edge, edge, signedPolygonDistance(nx + wx, ny + wy, p.outline)));
    // Wide oriented scarp; one side drops into a low apron. The narrow transition
    // is still the single authoritative height surface sampled by TerrainMesh.
    const fault = familyIndex === 1 ? nx + wx - (faultX + 0.09 * (ny - 0.5))
      : ny + wy - (faultY + 0.10 * (nx - 0.5));
    const apron = 0.18 * (1 - smooth(-0.011, 0.011, fault)) *
      smooth(0.10, 0.18, nx) * (1 - smooth(0.83, 0.92, nx));
    const ravineD = segmentDistance(nx + wx, ny + wy, ...ravine);
    const canyon = 0.32 * (1 - smooth(0.013, 0.037, ravineD));
    const abyssFace = smooth(-edge * 1.2, edge * 1.2,
      signedPolygonDistance(nx + wx, ny + wy, abyssOutline));
    const openSeam = segmentDistance(nx + wx, ny + wy, abyssX + 0.035, abyssY + 0.015,
      abyssX + 0.17, Math.max(abyssY + 0.16, 0.54));
    const seamCut = 0.82 * (1 - smooth(0.012, 0.041, openSeam));
    const abyss = Math.max(1.16 * abyssFace, seamCut);
    const riverY = 0.53 + 0.055 * noise(seed ^ 0x165ab, nx * 3.0, 0.4)
      + 0.020 * Math.sin(nx * 9 + riverPhase);
    const riverD = Math.abs(ny - riverY) * h;
    const bank = smooth(1.5, 6.5, riverD);
    const landHeight = clamp(base + uplift + apron - canyon - abyss, 0.06, 1.24);
    world.height[i] = riverD < 2.8 ? mix(0.267, landHeight, bank) : landHeight;
    world.water[i] = riverD < 2.8 ? 0.038 * (1 - smooth(1.3, 2.8, riverD)) + 0.002 : 0;
    world.riverBase[i] = world.water[i] > 0 ? Math.min(0.05, world.water[i] * 0.8) : 0;
    const nearRiver = Math.exp(-riverD / 9);
    world.moist[i] = clamp(0.21 + nearRiver * 0.53 + canyon * 0.55, 0.04, 0.92);
    world.veg[i] = clamp(0.12 + nearRiver * 0.43 + abyss * 1.25, 0, 0.9);
    world.temp[i] = clamp(0.26 - (world.height[i] - 0.3) * 0.32 + nearRiver * 0.04, 0.07, 0.5);
    world.over[i] = 0;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; world.type[i] = classify(world, x, y, i);
  }
  recomputeQi(world);
  let cliffX = plates[0].x, cliffY = plates[0].y, cliffDrop = 0;
  for (let y = 4; y < h - 4; y++) for (let x = 4; x < w - 4; x++) {
    const nx = x / (w - 1), ny = y / (h - 1);
    if (Math.hypot(nx - plates[0].x, ny - plates[0].y) > 0.36 ||
        Math.hypot(nx - abyssX, ny - abyssY) < 0.16) continue;
    const top = world.height[y * w + x];
    if (top < 0.85) continue;
    const low = Math.min(world.height[y * w + x - 3], world.height[y * w + x + 3],
      world.height[(y - 3) * w + x], world.height[(y + 3) * w + x]);
    if (top - low > cliffDrop) { cliffDrop = top - low; cliffX = nx; cliffY = ny; }
  }
  const landmark = (kind, nx, ny, label) => Object.freeze({ kind, x: Math.round(nx * (w - 1)), y: Math.round(ny * (h - 1)), label });
  metadata.set(world, Object.freeze({ version: NETHER_STRATA_VERSION, family,
    landmarks: Object.freeze([
      landmark('plateau', plates[0].x, plates[0].y, '断狱台地'),
      landmark('cliff', cliffX, cliffY, '墨骨绝壁'),
      landmark('abyss', abyssX, abyssY - 0.075, '无间深渊'),
    ]) }));
  return world;
}
