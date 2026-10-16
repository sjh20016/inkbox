import { SEA_LEVEL, TERRAIN } from '/src/inkbox/core/config.js';
import { recomputeAll } from '/src/inkbox/world/terrain.js';

const WATER_THRESHOLD = 0.0015;
const PLANTABLE = new Set([TERRAIN.GRASS, TERRAIN.MEADOW, TERRAIN.FOREST, TERRAIN.JUNGLE, TERRAIN.SAVANNA]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function ellipseScore(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  return 1 - Math.sqrt(dx * dx + dy * dy);
}

function landScore(nx, ny, phase) {
  // Three substantial land regions form a broken western and eastern arc.
  const regions = [
    ellipseScore(nx, ny, 0.34, 0.47, 0.215, 0.34),
    ellipseScore(nx, ny, 0.68, 0.48, 0.172, 0.285),
    ellipseScore(nx, ny, 0.44, 0.76, 0.13, 0.13),
    ellipseScore(nx, ny, 0.25, 0.20, 0.095, 0.14),
  ];
  // Discrete island chains are intentional elliptical groups rather than random speckle.
  const islands = [
    [0.11, 0.31, 0.040, 0.030], [0.16, 0.57, 0.033, 0.026], [0.21, 0.78, 0.035, 0.047],
    [0.47, 0.13, 0.040, 0.031], [0.55, 0.22, 0.030, 0.026], [0.58, 0.83, 0.038, 0.031],
    [0.79, 0.20, 0.041, 0.034], [0.86, 0.38, 0.032, 0.043], [0.84, 0.65, 0.047, 0.031],
    [0.73, 0.81, 0.033, 0.040], [0.31, 0.88, 0.030, 0.035], [0.93, 0.83, 0.023, 0.035],
    [0.07, 0.78, 0.022, 0.028], [0.91, 0.08, 0.024, 0.028],
  ];
  for (const [cx, cy, rx, ry] of islands) regions.push(ellipseScore(nx, ny, cx, cy, rx, ry) * 0.92);
  const base = Math.max(...regions);
  const coastNoise = Math.sin(nx * 31 + phase) * Math.sin(ny * 23 - phase * 0.7) * 0.025
    + Math.sin(nx * 79 - phase * 1.3) * Math.sin(ny * 67 + phase) * 0.009;
  return base + coastNoise;
}

function isChannel(nx, ny, phase) {
  // A curving, map-spanning strait divides the two large land regions.
  const straitX = 0.515 + 0.028 * Math.sin(ny * Math.PI * 2 + phase);
  if (ny > 0.09 && ny < 0.91 && Math.abs(nx - straitX) < 0.008) return true;

  // A branching inlet cuts a western peninsula and opens into a broad bay.
  const inletY = 0.54 + 0.065 * Math.sin(nx * Math.PI * 2 + phase * 0.5);
  if (nx > 0.18 && nx < 0.47 && Math.abs(ny - inletY) < 0.011) return true;

  // Enclosed lagoon plus a narrow outlet: the open section is a strait, the oval is inland water.
  if (ellipseScore(nx, ny, 0.735, 0.56, 0.052, 0.087) > -0.04) return true;
  const outletX = 0.742 + 0.012 * Math.sin((ny - 0.56) * 18);
  if (ny > 0.47 && ny < 0.67 && nx > 0.77 && nx < 0.89 && Math.abs(nx - outletX) < 0.009) return true;

  // A small enclosed lake provides an interior-water component for topology accounting.
  return ellipseScore(nx, ny, 0.35, 0.62, 0.023, 0.038) > -0.08;
}

function hash01(x, y, seed) {
  let n = Math.imul(x + (seed >>> 0), 0x45d9f3b) ^ Math.imul(y + 0x632be5ab, 0x27d4eb2d);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n ^= n >>> 16;
  return (n >>> 0) / 0x100000000;
}

function protectedSpawn(world, i) {
  const x = i % world.w, y = (i - x) / world.w;
  for (const spawn of world.pendingSpawns || []) {
    if ((x - spawn.x) ** 2 + (y - spawn.y) ** 2 <= 7 ** 2) return true;
  }
  for (const entity of world.entities || []) {
    if ((x - entity.x) ** 2 + (y - entity.y) ** 2 <= 7 ** 2) return true;
  }
  return false;
}

/**
 * Apply a deterministic test-only broken-coast / archipelago mask to a formal World.
 * It changes only that fixture instance; no default generation, RNG, or save schema is involved.
 */
export function applyArchipelagoFixture(world) {
  if (!world?.height || world.w < 128 || world.h < 96) throw new TypeError('Expected a generated World of at least 128x96');
  const phase = ((world.seed >>> 0) % 100003) / 100003 * Math.PI * 2;
  const originalHeight = world.height.slice();
  const { height, water, riverBase, veg } = world;
  let protectedLandCells = 0;

  for (let y = 0; y < world.h; y += 1) {
    const ny = (y + 0.5) / world.h;
    for (let x = 0; x < world.w; x += 1) {
      const i = y * world.w + x;
      const nx = (x + 0.5) / world.w;
      const score = landScore(nx, ny, phase);
      const land = !isChannel(nx, ny, phase) && (score > 0.025 || protectedSpawn(world, i));
      const priorHeight = originalHeight[i];
      if (land) {
        const interior = smoothstep(-0.02, 0.64, score);
        const oldRelief = clamp(priorHeight - SEA_LEVEL, -0.06, 0.22);
        height[i] = clamp(SEA_LEVEL + 0.014 + interior * 0.265 + oldRelief * 0.38, SEA_LEVEL + 0.004, 0.88);
        water[i] = Math.max(0, riverBase[i]);
        protectedLandCells += protectedSpawn(world, i) ? 1 : 0;
      } else {
        const depth = 0.014 + clamp((SEA_LEVEL - priorHeight) * 0.58, 0, 0.15);
        height[i] = SEA_LEVEL - depth;
        water[i] = depth;
        riverBase[i] = 0;
        veg[i] = 0;
      }
    }
  }

  recomputeAll(world);
  for (let i = 0; i < world.size; i += 1) {
    if (water[i] > WATER_THRESHOLD || !PLANTABLE.has(world.type[i])) {
      veg[i] = 0;
      continue;
    }
    if (veg[i] <= 0.01) veg[i] = clamp(0.12 + world.moist[i] * 0.34 + hash01(i % world.w, (i / world.w) | 0, world.seed) * 0.16, 0.08, 0.72);
    else veg[i] = clamp(veg[i], 0.06, 0.88);
  }
  world.touch();
  const topology = measureArchipelagoTopology(world);
  return { kind: 'archipelago-fixture', seed: world.seed, dimensions: [world.w, world.h], protectedLandCells, topology };
}

function componentStats(world, isWater) {
  const visited = new Uint8Array(world.size), queue = new Int32Array(world.size), components = [];
  for (let start = 0; start < world.size; start += 1) {
    if (visited[start] || (world.water[start] > WATER_THRESHOLD) !== isWater) continue;
    let head = 0, tail = 0, touchesEdge = false;
    visited[start] = 1; queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++], x = i % world.w, y = (i - x) / world.w;
      if (x === 0 || y === 0 || x === world.w - 1 || y === world.h - 1) touchesEdge = true;
      const neighbors = [x > 0 ? i - 1 : -1, x + 1 < world.w ? i + 1 : -1,
        y > 0 ? i - world.w : -1, y + 1 < world.h ? i + world.w : -1];
      for (const next of neighbors) {
        if (next < 0 || visited[next] || (world.water[next] > WATER_THRESHOLD) !== isWater) continue;
        visited[next] = 1; queue[tail++] = next;
      }
    }
    components.push({ cells: tail, touchesEdge });
  }
  return components.sort((a, b) => b.cells - a.cells);
}

/** Stable, intentionally approximate geography metrics for H2 reports. */
export function measureArchipelagoTopology(world) {
  const total = world.size;
  let waterCells = 0, coastlineLengthApprox = 0, wetVegetationFrontierCells = 0, hydroSensitiveCoastCells = 0;
  const isWater = i => world.water[i] > WATER_THRESHOLD;
  for (let y = 0; y < world.h; y += 1) {
    for (let x = 0; x < world.w; x += 1) {
      const i = y * world.w + x, wet = isWater(i);
      if (wet) waterCells += 1;
      let touchesWater = false;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) {
          if (!wet) coastlineLengthApprox += 1;
          continue;
        }
        const neighborWet = isWater(ny * world.w + nx);
        if (neighborWet !== wet) {
          coastlineLengthApprox += 0.5;
          touchesWater ||= !wet;
        }
      }
      if (!wet && touchesWater && world.veg[i] > 0.02) wetVegetationFrontierCells += 1;
      if (!wet && touchesWater && world.height[i] <= SEA_LEVEL + 0.08) hydroSensitiveCoastCells += 1;
    }
  }
  const lands = componentStats(world, false), waters = componentStats(world, true);
  const totalLand = total - waterCells, largest = lands[0]?.cells || 0;
  const islandMin = Math.max(32, Math.ceil(total * 0.0002));
  const mediumMin = Math.max(32, Math.ceil(total * 0.001)), mediumMax = Math.ceil(total * 0.04);
  const inlandMin = Math.max(64, Math.ceil(total * 0.001));
  return {
    waterCoveragePct: waterCells / total * 100,
    coastlineLengthApprox,
    islandCount: lands.slice(1).filter(component => component.cells >= islandMin).length,
    mediumIslandCount: lands.slice(1).filter(component => component.cells >= mediumMin && component.cells <= mediumMax).length,
    inlandSeaCount: waters.filter(component => !component.touchesEdge && component.cells >= inlandMin).length,
    largestLandmassPct: totalLand ? largest / totalLand * 100 : 0,
    wetVegetationFrontierCells,
    hydroSensitiveCoastCells,
    definitions: {
      waterThreshold: WATER_THRESHOLD,
      connectivity: '4-neighbor',
      islandCount: `land connected components excluding the largest landmass and components under ${islandMin} cells`,
      islandMinimumCells: islandMin,
      mediumIslandRangeCells: [mediumMin, mediumMax],
      inlandSeaMinimumCells: inlandMin,
      coastline: 'land/water shared cell edges; map-border land edges included',
      wetVegetationFrontier: 'vegetated land cells directly touching water',
      hydroSensitiveCoast: `coastal land cells with height <= SEA_LEVEL + 0.08 (${(SEA_LEVEL + 0.08).toFixed(3)})`,
    },
  };
}
