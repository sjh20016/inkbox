// 水墨沙盒 · 程序化山河生成
//
// 生成顺序刻意模仿真实地貌：先板块起伏，再褶皱成山，再让雨水汇成河，
// 最后按「距水远近 + 纬度气温」铺植被。因此地图上看到的河谷、山脊、
// 湿润带彼此是有因果的，而不是各画各的。

import { SEA_LEVEL, TERRAIN, TERRAIN_INFO } from '../core/config.js';
import { ELEMENTS } from '../core/cultivation.js';
import { World } from './World.js';
import { recomputeAll, classify } from './terrain.js';
import { createNoise2D, fbm, ridged, domainWarp, clamp, smoothstep, mulberry32 } from '../core/noise.js';

const HEIGHT_BINS = 256;

/** 目标水域占比：山水画以水与云气为重，留出足够的「虚」 */
const WATER_TARGET = 0.42;

function buildHeightField(world, noise, warpNoise) {
  const { w, h, height } = world;
  for (let y = 0; y < h; y += 1) {
    const ny = y / h;
    for (let x = 0; x < w; x += 1) {
      const nx = x / w;
      const [wx, wy] = domainWarp(warpNoise, nx * 2.6, ny * 2.6, 0.55, 1.0);
      let base = fbm(noise, wx * 3.6, wy * 3.6, 6, 2.05, 0.52);

      // 大陆遮罩：中心隆起、边缘沉入海面
      const cx = nx * 2 - 1;
      const cy = ny * 2 - 1;
      const radial = Math.sqrt(cx * cx * 1.02 + cy * cy * 1.12);
      const mask = smoothstep(1.22, 0.22, radial);

      let value = (base - 0.5) * 0.82 + mask * 0.5 + 0.06;

      // 褶皱山脉：只在内陆隆起区叠加，并用幂次把山脊收窄，
      // 否则会摊成一大片高原，画出来就没有「峰」了。
      const ridge = ridged(noise, nx * 5.2 + 11.3, ny * 5.2 + 7.7, 5, 2.1, 0.5);
      value += Math.pow(ridge, 1.7) * smoothstep(0.3, 0.85, mask) * 0.42;

      // 高原台地
      const plateau = fbm(noise, nx * 2.1 + 41.5, ny * 2.1 + 23.9, 3, 2.0, 0.5);
      value += smoothstep(0.66, 0.96, plateau) * 0.1 * mask;

      height[y * w + x] = value;
    }
  }

  // 用「分位数重排」压出想要的地形分布。
  // 直接线性拉伸的话，噪声会摊成一大片高原——山不像山，倒像一块被雪盖住的板。
  // 这里把高程按原始排名重新映射：低处缓（大片可居的平原水乡），
  // 高处陡（只有少数格子冲上云霄），于是山脊自然成「峰」。
  const sample = [];
  for (let i = 0; i < world.size; i += 3) sample.push(height[i]);
  sample.sort((a, b) => a - b);
  const last = sample.length - 1;

  const quantileOf = (value) => {
    let lo = 0;
    let hi = last;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sample[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return last > 0 ? lo / last : 0;
  };

  const landSpan = 1 - SEA_LEVEL;
  for (let i = 0; i < world.size; i += 1) {
    const q = quantileOf(height[i]);
    height[i] = q < WATER_TARGET
      ? SEA_LEVEL * Math.pow(q / WATER_TARGET, 0.72)
      : SEA_LEVEL + landSpan * Math.pow((q - WATER_TARGET) / (1 - WATER_TARGET), 2.15);
  }
}

/** 用汇流量法生成树枝状水系，同时把河道刻低 */
function carveRivers(world, rainNoise) {
  const { w, h, height, flow } = world;
  const size = world.size;
  const heads = new Int32Array(HEIGHT_BINS).fill(-1);
  const nexts = new Int32Array(size).fill(-1);

  for (let i = 0; i < size; i += 1) {
    const x = i % w;
    const y = (i - x) / w;
    const rain = 0.35 + fbm(rainNoise, x / w * 7.5, y / h * 7.5, 3, 2, 0.5) * 1.1;
    flow[i] = rain;
    const bin = Math.min(HEIGHT_BINS - 1, Math.max(0, Math.floor(height[i] * (HEIGHT_BINS - 1))));
    nexts[i] = heads[bin];
    heads[bin] = i;
  }

  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  for (let bin = HEIGHT_BINS - 1; bin >= 0; bin -= 1) {
    for (let i = heads[bin]; i !== -1; i = nexts[i]) {
      const x = i % w;
      const y = (i - x) / w;
      let lowest = -1;
      let lowestHeight = height[i];
      for (let d = 0; d < 8; d += 1) {
        const nx = x + dirs[d][0];
        const ny = y + dirs[d][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        const drop = height[ni] + (d > 3 ? 0.0035 : 0);
        if (drop < lowestHeight) {
          lowestHeight = drop;
          lowest = ni;
        }
      }
      if (lowest >= 0) flow[lowest] += flow[i];
    }
  }

  const threshold = size * 0.0042;
  let maxFlow = 1;
  for (let i = 0; i < size; i += 1) if (flow[i] > maxFlow) maxFlow = flow[i];

  const { water, riverBase } = world;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      if (flow[i] < threshold) continue;
      if (height[i] < SEA_LEVEL - 0.01) continue;
      const t = Math.min(1, (flow[i] - threshold) / (threshold * 6));
      height[i] = Math.max(SEA_LEVEL - 0.05, height[i] - (0.006 + t * 0.022));
      // 河道基流：越靠下游越宽，保证河流长年有水
      riverBase[i] = 0.004 + t * 0.018;
      if (water[i] < riverBase[i]) water[i] = riverBase[i];
    }
  }
  return maxFlow;
}

/** 多源 BFS：每个格子到最近水域的格距 */
function distanceToWater(world) {
  const { w, h, water } = world;
  const dist = new Int32Array(world.size).fill(-1);
  const queue = new Int32Array(world.size + 1);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < world.size; i += 1) {
    if (world.height[i] < SEA_LEVEL || water[i] > 0.0015) {
      dist[i] = 0;
      queue[tail += 1] = i;
    }
  }
  while (head < tail) {
    head += 1;
    const i = queue[head];
    const x = i % w;
    const y = (i - x) / w;
    const nd = dist[i] + 1;
    for (let d = 0; d < 4; d += 1) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (dist[ni] !== -1) continue;
      dist[ni] = nd;
      queue[tail += 1] = ni;
    }
  }
  return dist;
}

function buildClimate(world, noise, dist) {
  const { w, h, temp, moist, height } = world;
  for (let y = 0; y < h; y += 1) {
    const ny = y / h;
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const nx = x / w;

      // 气温：赤道（画幅中部）最暖，两极转寒，越高越冷
      const latitude = 1.16 - Math.abs(ny * 2 - 1) * 1.02;
      const altitude = Math.max(0, height[i] - SEA_LEVEL) * 0.5;
      const jitter = fbm(noise, nx * 4.5 + 61.2, ny * 4.5 + 17.4, 3, 2, 0.5) - 0.5;
      temp[i] = clamp(latitude - altitude + jitter * 0.12, 0, 1);

      // 湿度：离水越近越湿，并叠加一层缓慢起伏的湿润带
      const d = dist[i] < 0 ? 40 : dist[i];
      const nearWater = Math.exp(-d / 20) * 0.78;
      const band = fbm(noise, nx * 4.8 + 91.7, ny * 4.8 + 55.1, 4, 2, 0.5) * 0.42;
      const dry = smoothstep(0.7, 1.0, temp[i]) * 0.34;
      moist[i] = clamp(nearWater + band - dry + 0.08, 0, 1);
    }
  }
}

function seedVegetation(world, noise) {
  const { w, h, veg, moist, height, temp } = world;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (height[i] < SEA_LEVEL + 0.005) {
        veg[i] = 0;
        continue;
      }
      const altPenalty = smoothstep(0.62, 0.92, height[i]);
      const coldPenalty = smoothstep(0.42, 0.12, temp[i]);
      const dryPenalty = smoothstep(0.3, 0.06, moist[i]);
      const base = clamp((moist[i] - 0.16) * 1.35, 0, 1);
      const patch = fbm(noise, x / w * 13.5, y / h * 13.5, 3, 2, 0.5) * 0.35 + 0.82;
      veg[i] = clamp(base * patch * (1 - altPenalty) * (1 - coldPenalty * 0.85) * (1 - dryPenalty * 0.9), 0, 1);
    }
  }
}

function fillSea(world) {
  const { height, water } = world;
  for (let i = 0; i < world.size; i += 1) {
    if (height[i] < SEA_LEVEL) water[i] = SEA_LEVEL - height[i];
  }
}

/**
 * 布下灵脉。
 *
 * 灵脉是沙盒里「值得争的东西」：它把一片地的灵气抬高，修士会往那里聚，
 * 宗门会为它开战，洞府与秘境也倾向于落在它附近。所以要先于 recomputeAll
 * 布好，灵气层才算得对。
 */
/**
 * 这一格「人站得上去吗」。
 *
 * ⚠️ **不能读 `world.type`**——`seedLeylines` 排在 `recomputeAll` 之前，
 * 那一刻 `world.type` 还是 `new Uint8Array(size)` 的全 0（= `TERRAIN.DEEP`）。
 * 实测踩过：落点过滤第一版直接读 `world.type`，于是每一格都被判成不可通行，
 * **全部灵脉候选被拒**，长测报 `灵脉 0/0 条被占`。
 * `classify()` 只依赖 `height / water / over / temp / moist / 坡度`，
 * 这些在 `buildClimate` 之后都已经就绪，所以这里直接算，不依赖推导好的 `type` 层。
 */
function walkableAt(world, x, y, i) {
  const info = TERRAIN_INFO[classify(world, x, y, i)];
  return Boolean(info && info.walk);
}

/**
 * 标出「够大、住得下人的陆地」。
 *
 * ⚠️ 为什么需要——实测挖出来的硬事实，而且是**三个病因里唯一一个真该修的**：
 *
 * 灵脉优先落在「峻岭 / 雪峰」上（高处的灵气最厚），
 * 而有些峻岭坐落在**与世隔绝的一小块可通行地里**：四周被水域或连绵峻岭围死。
 * 于是它的山脚虽然站得住人，却和任何门派都不连通——代价洪泛永远走不到，
 * 这条灵脉**永远不可能有主**，是纯装饰。
 *
 * 实测（中堂 288×180，150 年）四个种子里两个中招：
 *   · 种子 7 的 `#1@(165,88)`：山脚 305 格可通行，而**把伸手预算放大到 1e9，
 *     八家门派仍然一家都够不着**（它们各自的可达域是 21488 / 21683 格，
 *     这条灵脉的山脚自成一个第三块）；
 *   · 种子 1234 的 `#3` 同样。
 * 它和「认领逻辑」「名额」「预算」全都无关——那些是另外两个病因，见 KNOWN_ISSUES.md。
 *
 * 判据用「连通块够大」而**不是**「是最大那一块」：
 * 实测种子 7 有两块几乎一样大的陆地（21488 与 21683 格），
 * 八家门派里七家在**小**的那块上——取「最大」会反过来把七家所在的大陆判成不可用。
 *
 * @param minCells 连通块至少多少格才算「住得下人」。取可通行总面积的 10%：
 *                 288×180 中堂约 22500 格可通行，门槛 2250 格（约 47×47）。
 */
function bigLandMask(world, minCells) {
  const size = world.size;
  const mask = new Uint8Array(size);
  const label = new Int32Array(size).fill(-1);
  const stack = new Int32Array(size);
  const comp = [];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let start = 0; start < size; start += 1) {
    if (label[start] !== -1) continue;
    const sx = start % world.w;
    const sy = (start - sx) / world.w;
    if (!walkableAt(world, sx, sy, start)) { label[start] = -2; continue; }
    // 迭代式洪泛，不用递归：长卷 384×240 的连通块能有八万多格，递归会爆栈。
    const cells = [];
    let top = 0;
    stack[top] = start;
    top += 1;
    label[start] = comp.length;
    while (top > 0) {
      top -= 1;
      const i = stack[top];
      cells.push(i);
      const x = i % world.w;
      const y = (i - x) / world.w;
      for (let d = 0; d < 4; d += 1) {
        const nx = x + DIRS[d][0];
        const ny = y + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) continue;
        const ni = ny * world.w + nx;
        if (label[ni] !== -1) continue;
        if (!walkableAt(world, nx, ny, ni)) { label[ni] = -2; continue; }
        label[ni] = comp.length;
        stack[top] = ni;
        top += 1;
      }
    }
    comp.push(cells);
  }
  for (let c = 0; c < comp.length; c += 1) {
    if (comp[c].length < minCells) continue;
    for (let k = 0; k < comp[c].length; k += 1) mask[comp[c][k]] = 1;
  }
  return mask;
}

/** 半径 R 的圆盘里有没有一格属于「够大的陆地」。 */
function discHitsBigLand(world, cx, cy, R, mask) {
  const r2 = R * R;
  for (let dy = -R; dy <= R; dy += 1) {
    const y = cy + dy;
    if (y < 0 || y >= world.h) continue;
    for (let dx = -R; dx <= R; dx += 1) {
      const x = cx + dx;
      if (x < 0 || x >= world.w) continue;
      if (dx * dx + dy * dy > r2) continue;
      if (mask[y * world.w + x]) return true;
    }
  }
  return false;
}

function seedLeylines(world, noise) {
  const random = mulberry32(world.seed ^ 0x1b873593);
  const candidates = [];
  for (let y = 3; y < world.h - 3; y += 1) {
    for (let x = 3; x < world.w - 3; x += 1) {
      const i = y * world.w + x;
      if (world.water[i] > 0.0015) continue;
      const type = world.type[i] || TERRAIN.GRASS;
      // 山石处灵气最厚；河道交汇处也是好位置。
      //
      // ⚠️⚠️ 下面这四个分支**至今是死代码**，而且**是刻意留着的**，别以为读错了。
      //
      // `seedLeylines` 排在 `recomputeAll` **之前**，那一刻 `world.type` 还是
      // `new Uint8Array(size)` 的全 0（= `TERRAIN.DEEP`），于是每次都被 `||` 兜成
      // `GRASS`、一路落进 `else score = 0.25 + height * 0.3`——
      // **灵脉实际是纯按高度落点的**，PEAK/SNOW/山/石/河道这几档从来没生效过。
      // （现象碰巧对得上：高处迟早会被分类成峻岭，所以肉眼看不出来。）
      //
      // 试过修它（把顺序改成「先 `recomputeAll` → 再布灵脉 → 再 `recomputeQi`」，
      // 依赖关系是成立的，`recomputeQi` 本来就是为这种情形写的）。**实测后果是
      // 整个政治层退化，所以回退了**：中堂 288×180、种子 20260914，
      // 800 年下来宗门从 **7 家掉到 4 家**，最大一家占地从 ≤60% 涨到 **67%**，
      // `没有一家把地图吃干` 直接挂；四个种子的 150 年快照也普遍从 8~10 家掉到 3~5 家。
      // 也就是说：**现有那批调参（人口、开宗、灵气）是照着「纯按高度」的落点标定出来的**。
      // 改落点等于把标定全部作废，那是另一件事，不该混在「修一个静默 bug」里做。
      //
      // 所以：**要读 `world.type` 的新代码，一律用 `classify()` 现算**
      // （见 `walkableAt`）。别读 `world.type`——它是空的。
      let score = 0;
      if (type === TERRAIN.PEAK || type === TERRAIN.SNOW) score = 0.95;
      else if (type === TERRAIN.MOUNTAIN) score = 0.8;
      else if (type === TERRAIN.ROCK) score = 0.6;
      else if (world.riverBase[i] > 0) score = 0.7;
      else score = 0.25 + world.height[i] * 0.3;
      score += noise(x * 0.03, y * 0.03) * 0.2;
      if (score > 0.55) candidates.push({ x, y, score });
    }
  }
  if (!candidates.length) return;

  // 够大的陆地。灵脉的**山脚**必须落在上面，否则这条灵脉永远不可能有主。
  // （山脚的定义与 sim/territory.js 的 leylineApproach 一致：半径 +8 那一圈。
  //   这里半径还没定，所以下面选定半径之后再判。）
  let walkableTotal = 0;
  for (let y = 0; y < world.h; y += 1) {
    for (let x = 0; x < world.w; x += 1) {
      if (walkableAt(world, x, y, y * world.w + x)) walkableTotal += 1;
    }
  }
  const minLand = Math.max(300, Math.round(walkableTotal * 0.1));
  const bigLand = bigLandMask(world, minLand);

  const target = Math.max(3, Math.min(9, Math.round(world.size / 9000)));
  const placed = [];
  const minGap = Math.max(10, Math.round(Math.sqrt(world.size) * 0.13));
  let attempts = 0;
  let skipped = 0;
  while (placed.length < target && attempts < 1200) {
    attempts += 1;
    const pick = candidates[Math.floor(random() * candidates.length)];
    let tooClose = false;
    for (let k = 0; k < placed.length; k += 1) {
      if (Math.hypot(placed[k].x - pick.x, placed[k].y - pick.y) < minGap) { tooClose = true; break; }
    }
    if (tooClose) continue;
    const radius = 6 + Math.floor(random() * 5);
    // 山脚够不到「住得下人的陆地」→ 换一个落点。
    // 不这么判的话，会生成一条谁都够不着的灵脉（实测见 bigLandMask 的注释）。
    if (!discHitsBigLand(world, pick.x, pick.y, radius + 8, bigLand)) { skipped += 1; continue; }
    placed.push(pick);
    world.addLeyline({
      x: pick.x,
      y: pick.y,
      radius,
      strength: 0.28 + pick.score * 0.35 + random() * 0.1,
      element: ELEMENTS[Math.floor(random() * ELEMENTS.length)],
    });
  }
  if (skipped > 0 && placed.length < target) {
    world.record(`另有 ${skipped} 处灵气汇聚之地远隔山海，无人可至`, 'genesis');
  }
  world.record(`天地间有灵脉 ${placed.length} 道`, 'genesis');
}

/**
 * 生成一个完整世界。
 * @param {{preset:{w:number,h:number}, seed:number|string, scatter?:boolean}} options
 */
export function generateWorld({ preset, seed = 1, scatter = true } = {}) {
  const world = new World(preset.w, preset.h, seed);
  const rootNoise = createNoise2D(world.seed);
  const warpNoise = createNoise2D(world.seed ^ 0x9e3779b9);
  const rainNoise = createNoise2D(world.seed ^ 0x51ed2701);
  const moistNoise = createNoise2D(world.seed ^ 0x2545f491);

  buildHeightField(world, rootNoise, warpNoise);
  carveRivers(world, rainNoise);
  fillSea(world);
  const dist = distanceToWater(world);
  buildClimate(world, moistNoise, dist);
  seedVegetation(world, rootNoise);
  // 灵气层依赖灵脉，所以先布灵脉再全量推导
  seedLeylines(world, rootNoise);
  recomputeAll(world);

  world.record(`天地初开 · 种子 ${world.seed}`, 'genesis');
  if (scatter) scatterInitialLife(world);
  return world;
}

/** 在世界里撒下最初的一批生灵（优先落在湿润的平地上） */
function scatterInitialLife(world) {
  const random = mulberry32(world.seed ^ 0x7f4a7c15);
  const candidates = [];
  const wilds = [];
  for (let y = 2; y < world.h - 2; y += 1) {
    for (let x = 2; x < world.w - 2; x += 1) {
      const i = y * world.w + x;
      const type = world.type[i];
      if (type === TERRAIN.GRASS || type === TERRAIN.MEADOW || type === TERRAIN.FOREST) {
        if (world.fertility(i) >= 0.45) candidates.push(i);
      }
      // 灵兽与山精出没于深山老林，而不是人烟稠密处
      if (type === TERRAIN.FOREST || type === TERRAIN.JUNGLE
        || type === TERRAIN.MOUNTAIN || type === TERRAIN.ROCK) {
        wilds.push(i);
      }
    }
  }

  const groups = 6;
  for (let g = 0; g < groups; g += 1) {
    if (!candidates.length) break;
    const origin = candidates[Math.floor(random() * candidates.length)];
    const ox = origin % world.w;
    const oy = (origin - ox) / world.w;
    world.pendingSpawns.push({ x: ox, y: oy, species: 'human', count: 6 + Math.floor(random() * 6) });
  }

  // 荒野生灵：灵兽成小群，山精独居
  for (let g = 0; g < 14; g += 1) {
    if (!wilds.length) break;
    const origin = wilds[Math.floor(random() * wilds.length)];
    const ox = origin % world.w;
    const oy = (origin - ox) / world.w;
    const spirit = random() < 0.35;
    world.pendingSpawns.push({
      x: ox,
      y: oy,
      species: spirit ? 'spirit' : 'beast',
      count: spirit ? 1 : 2 + Math.floor(random() * 3),
    });
  }
}

export { clamp };
