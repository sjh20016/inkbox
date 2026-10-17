// Hydrology rule variants. Names are canonical; docs must use these names.
//   V0_current          = main stepHydrology (E0)
//   V1_noErosion        = refill + rivers + water + flush (E2, RULE_CHANGE)
//   V2_seaSkipProto     = the first G4 prototype ("R1"): skips sea cells but does NOT normalize the sea,
//                         may deposit into sea cells, runs the ORIGINAL global stepThermal. Kept only to reproduce old numbers.
//   V3_staticSeaStrict  = static-sea boundary candidate (E5): sea = height < SEA_LEVEL, water := SEA_LEVEL - height every step;
//                         land water flowing into sea is absorbed; sediment reaching sea is discarded (sink);
//                         thermal only on land-land pairs inside eroded bbox ±3. RULE_CHANGE.
//   V9_hydrologyOff     = no hydrology at all (lower bound, not a product candidate)
import { M, SEA_LEVEL } from './env.mjs';
const { H, T } = M; const { clamp } = M.noise;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function stepWaterLand(world, dtDays, { normalizeOnAbsorb = false } = {}) {
  const flowRate = 0.34, evapRate = 0.00042, { w, h, height, water, temp } = world;
  const delta = world._g4wd || (world._g4wd = new Float32Array(world.size)); delta.fill(0);
  let moved = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (height[i] < SEA_LEVEL) continue;
    const depth = water[i]; if (depth <= 0.0008) continue;
    const surface = height[i] + depth;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx, other = height[ni] + water[ni]; if (other >= surface) continue;
      const amount = Math.min(depth * flowRate * 0.25, (surface - other) * flowRate * 0.5); if (amount <= 0) continue;
      delta[i] -= amount; if (height[ni] >= SEA_LEVEL) delta[ni] += amount; moved += amount;
    }
  }
  if (moved > 0) for (let i = 0; i < world.size; i++) { const d = delta[i]; if (d === 0) continue; const n = water[i] + d; water[i] = n > 0 ? n : 0; T.markDirty(world, i); }
  for (let i = 0; i < world.size; i++) { const depth = water[i]; if (depth <= 0.0006 || height[i] < SEA_LEVEL || world.riverBase[i] > 0) continue; water[i] = Math.max(0, depth - evapRate * dtDays * (0.35 + temp[i])); }
  if (moved > 0.0001) world.touch();
  return moved;
}
function stepErosionLand(world, dtDays, { seaIsSink }) {
  const { w, h, height, water } = world; const delta = world._g4ed || (world._g4ed = new Float32Array(world.size)); delta.fill(0);
  const rate = clamp(dtDays * 0.02 * 0.9, 0, 0.02); let touched = 0; const bb = [w, h, -1, -1];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; const depth = water[i]; if (depth < 0.002) continue; const hi = height[i]; if (hi < SEA_LEVEL) continue;
    let lowest = -1, lh = hi, steep = 0;
    for (let d = 0; d < 4; d++) { const ni = (y + DIRS[d][1]) * w + (x + DIRS[d][0]); const nh = height[ni]; if (nh < lh) { lh = nh; lowest = ni; } const df = hi - nh; if (df > steep) steep = df; }
    if (lowest < 0 || steep <= 0.0015) continue;
    const amount = Math.min(rate * Math.min(1, depth * 14) * steep * 6, steep * 0.35, 0.0022); if (amount <= 1e-6) continue;
    delta[i] -= amount; if (!seaIsSink || height[lowest] >= SEA_LEVEL) delta[lowest] += amount * 0.72; touched++;
    if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y;
  }
  if (touched > 0) { for (let i = 0; i < world.size; i++) { const d = delta[i]; if (d === 0) continue; height[i] = clamp(height[i] + d, 0, 1); T.markDirtyWithNeighbors(world, i); } world.touch(); }
  return { touched, bb };
}
// Same formula as H.stepThermal, restricted to land-land pairs inside bbox ±pad.
function stepThermalLandLocal(world, dtDays, bb, pad = 3) {
  const threshold = 0.085, rate = clamp(dtDays * 0.03, 0, 0.08), { w, h, height } = world;
  const delta = world._g4td || (world._g4td = new Float32Array(world.size)); delta.fill(0);
  const x0 = Math.max(1, bb[0] - pad), y0 = Math.max(1, bb[1] - pad), x1 = Math.min(w - 2, bb[2] + pad), y1 = Math.min(h - 2, bb[3] + pad);
  let touched = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x; const hi = height[i]; if (hi < SEA_LEVEL) continue;
    for (let d = 0; d < 4; d++) {
      const ni = (y + DIRS[d][1]) * w + (x + DIRS[d][0]); if (ni < i) continue; if (height[ni] < SEA_LEVEL) continue;
      const diff = hi - height[ni]; if (Math.abs(diff) <= threshold) continue;
      const move = Math.min((Math.abs(diff) - threshold) * rate * 0.5, 0.0015); if (move <= 1e-6) continue;
      const dir = diff > 0 ? -1 : 1; delta[i] += dir * move; delta[ni] -= dir * move; touched++;
    }
  }
  if (touched > 0) { for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) { const i = y * w + x; const d = delta[i]; if (d === 0) continue; height[i] = clamp(height[i] + d, 0, 1); T.markDirtyWithNeighbors(world, i); } world.touch(); }
  return touched;
}
/** Boundary normalization: every sea cell holds exactly SEA_LEVEL - height. Returns number of cells corrected. */
export function normalizeSea(world) {
  const { height, water } = world; let fixed = 0;
  for (let i = 0; i < world.size; i++) { const hi = height[i]; if (hi >= SEA_LEVEL) continue; const t = Math.fround(SEA_LEVEL - hi); if (water[i] !== t) { water[i] = t; T.markDirty(world, i); fixed++; } }
  if (fixed) world.touch();
  return fixed;
}
export const VARIANTS = {
  V0_current: (w) => H.stepHydrology(w, 4),
  V1_noErosion: (w) => { H.refillSea(w); H.maintainRivers(w); H.stepWater(w, 4); T.flushDirty(w); },
  V2_seaSkipProto: (w) => { H.maintainRivers(w); stepWaterLand(w, 4); const e = stepErosionLand(w, 4, { seaIsSink: false }); if (e.touched > 0) H.stepThermal(w, 4); T.flushDirty(w); },
  V3_staticSeaStrict: (w) => { H.maintainRivers(w); stepWaterLand(w, 4); const e = stepErosionLand(w, 4, { seaIsSink: true }); if (e.touched > 0) stepThermalLandLocal(w, 4, e.bb); w._g4lastNorm = normalizeSea(w); T.flushDirty(w); },
  V9_hydrologyOff: (_w) => {},
};
/** One-time switch from V0 state to V3: normalize sea, then flush. */
export function enterStaticSea(world) { const n = normalizeSea(world); T.flushDirty(world); return n; }
