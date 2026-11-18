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

/**
 * 可快照的 mulberry32 随机流（G8）。
 *
 * 与 `mulberry32(seed)` **逐签同序**：同一初始化规则（seed 为 0 时取 0x9e3779b9）、
 * 同一 32 位整数运算，返回值仍是可直接调用的 `rng()`。区别只有两点：
 *   · `rng.getState()` 返回当前 32 位内部状态（不抽签）；
 *   · `rng.setState(s)` 把游标恢复到该状态（不抽签）。
 * mulberry32 的状态每签恒加 0x6d2b79f5，所以这个 32 位整数本身就是完整游标，
 * 不需要记录抽签次数或历史。
 *
 * 只给**跨节拍长期持有**的模拟流用；一次性生成 / 纯哈希随机仍用 `mulberry32`，
 * 不为它们分配额外的闭包。
 */
export function rngStream(seed) {
  let state = (Number(seed) >>> 0) || 0x9e3779b9;
  function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  Object.defineProperties(random, {
    getState: { value: () => state },
    setState: { value: (next) => {
      if (!isRngState(next)) throw new TypeError(`invalid rng state: ${next}`);
      state = next >>> 0;
    } },
  });
  return random;
}

/** 合法的 32 位无符号游标（0 也合法：状态在运行中可以恰好经过 0）。 */
export function isRngState(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

/** 读取流游标；不可快照的流（测试注入的任意函数）返回 null。 */
export function rngStateOf(rng) {
  return typeof rng?.getState === 'function' ? rng.getState() : null;
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
