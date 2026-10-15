// 水墨沙盒 · 确定性噪声工具
// 全部随机都从种子派生，保证同一世界种子可完全复现。

export function hashString(text) {
  let hash = 2166136261;
  const value = String(text ?? '');
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = (Number(seed) >>> 0) || 0x9e3779b9;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 二维梯度噪声（Perlin 风格），值域约 [-1, 1] */
export function createNoise2D(seed) {
  const random = mulberry32(seed);
  const perm = new Uint8Array(512);
  const source = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) source[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = source[i];
    source[i] = source[j];
    source[j] = tmp;
  }
  for (let i = 0; i < 512; i += 1) perm[i] = source[i & 255];

  const gradX = new Float32Array(256);
  const gradY = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) {
    const angle = (i / 256) * Math.PI * 2 + random() * 0.02;
    gradX[i] = Math.cos(angle);
    gradY[i] = Math.sin(angle);
  }

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];
    const n00 = gradX[aa] * xf + gradY[aa] * yf;
    const n10 = gradX[ba] * (xf - 1) + gradY[ba] * yf;
    const n01 = gradX[ab] * xf + gradY[ab] * (yf - 1);
    const n11 = gradX[bb] * (xf - 1) + gradY[bb] * (yf - 1);
    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return nx0 + v * (nx1 - nx0);
  }

  return noise;
}

/** 分形叠加噪声，返回 [0,1] */
export function fbm(noise, x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += noise(x * frequency, y * frequency) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / norm * 0.5 + 0.5;
}

/** 山脊噪声，制造连绵山脉 */
export function ridged(noise, x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    const value = 1 - Math.abs(noise(x * frequency, y * frequency));
    sum += value * value * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / norm;
}

/** 域扭曲：让地貌摆脱噪声的“云絮感”，更像真实山河 */
export function domainWarp(noise, x, y, strength = 1.4, frequency = 0.6) {
  const wx = noise(x * frequency + 5.2, y * frequency + 1.3);
  const wy = noise(x * frequency + 9.7, y * frequency + 3.1);
  return [x + wx * strength, y + wy * strength];
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}
