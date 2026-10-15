import { SEA_LEVEL } from '../../core/config.js';

export function cellHash(seed, cell, salt = 0) {
  let n = (seed ^ Math.imul(cell + 1, 0x9e3779b1) ^ salt) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad); n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

export function deriveVegetation(world, maxTrees = 10000) {
  const trees = [];
  for (let i = 0; i < world.size; i++) {
    if (world.veg[i] < 0.25 || world.height[i] < SEA_LEVEL || world.water[i] > 0.0015) continue;
    const rank = cellHash(world.seed, i);
    if (rank > world.veg[i] * 0.7) continue;
    trees.push({ cell: i, rank, x: Math.max(0, Math.min(world.w - 1, i % world.w + (cellHash(world.seed, i, 11) - 0.5) * 0.65)), y: Math.max(0, Math.min(world.h - 1, Math.floor(i / world.w) + (cellHash(world.seed, i, 23) - 0.5) * 0.65)), size: 1.4 + cellHash(world.seed, i, 37) * 1.1, rotation: cellHash(world.seed, i, 49) * Math.PI });
  }
  // Stable ranking spreads the cap over the whole map rather than its first rows.
  if (trees.length > maxTrees) trees.sort((a, b) => a.rank - b.rank).length = maxTrees;
  return trees;
}
