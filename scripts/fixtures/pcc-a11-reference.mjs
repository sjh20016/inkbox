import { SEA_LEVEL } from '../../src/inkbox/core/config.js';
import { cellHash } from '../../src/inkbox/render3d/vegetation/deriveVegetation.js';
import { visualElevation } from '../../src/inkbox/render3d/terrain/VisualElevation.js';
import { diagonalAD } from '../../src/inkbox/render3d/terrain/topology.js';

const WET = 0.0015;
const DEPTH_BANDS = [0.016, 0.055, 0.15];
const EPS_GEO = 0.01;
const EPS_SHADE = 0.005;
const T_MAX = 12;
const SHADE_STRENGTH = Object.freeze({ structural: 0.59, deep: 0.16, mass: 0.16 });
const SUN_KEY = Object.freeze([-0.45, 0.76, -0.47].map(v => v / Math.hypot(-0.45, 0.76, -0.47)));
const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const depthByte = d => d > 0 ? Math.min(255, Math.round(d * 510)) : 0;
const depthBand = d => d < DEPTH_BANDS[0] ? 0 : d < DEPTH_BANDS[1] ? 1 : d < DEPTH_BANDS[2] ? 2 : 3;
const a0DepthBand = d => d > 0.15 ? 4 : d > 0.055 ? 3 : d > 0.016 ? 2 : d > WET ? 1 : 0;
const eligible = (height, water) => height >= SEA_LEVEL && water <= WET;
const treeEligible = (world, i, height, water, veg) => veg >= 0.25 && height >= SEA_LEVEL
  && water <= WET && cellHash(world.seed, i) <= veg * 0.7;

function grow(array, length, value) {
  if (length < array.length) { array[length] = value; return array; }
  const next = new Uint32Array(Math.max(256, array.length * 2));
  next.set(array); next[length] = value;
  return next;
}

function broadAt(geo, w, h, x, y) {
  const sampleX = (sx, sy) => {
    const c = Math.max(0, Math.min(w - 1, sx)), i = Math.floor(c), f = c - i;
    return geo[sy * w + i] * (1 - f) + geo[sy * w + Math.min(w - 1, i + 1)] * f;
  };
  const sampleY = (sx, sy) => {
    const c = Math.max(0, Math.min(h - 1, sy)), i = Math.floor(c), f = c - i;
    return geo[i * w + sx] * (1 - f) + geo[Math.min(h - 1, i + 1) * w + sx] * f;
  };
  const R = 2.5;
  return [
    Math.fround((sampleX(x + R, y) - sampleX(x - R, y)) / (2 * R)),
    Math.fround((sampleY(x, y + R) - sampleY(x, y - R)) / (2 * R)),
  ];
}

function shadeAt(geo, w, h, x, y, out, offset) {
  const at = (xx, yy) => geo[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))];
  const c = at(x, y), l = at(x - 1, y), r = at(x + 1, y), d = at(x, y - 1), u = at(x, y + 1);
  const gx = (r - l) * 0.5, gy = (u - d) * 0.5;
  const slope = Math.hypot(gx, gy), curv = l + r + d + u - 4 * c;
  const ridge = ss(0.16, 1.7, -curv), valley = ss(0.22, 2.0, curv) * 0.58;
  const brk = ss(1.2, 3.8, slope) * ss(0.30, 1.8, Math.abs(curv));
  const structure = Math.max(ridge, valley, brk) * ss(0.10, 0.65, slope);
  const ink = Math.min(0.82, structure * SHADE_STRENGTH.structural * 0.72);
  const c2d = ss(0.12, 0.50, Math.abs(curv)) * ss(0.35, 1.60, slope);
  const deep = Math.min(0.22, structure * structure * SHADE_STRENGTH.deep + c2d * SHADE_STRENGTH.deep);
  const [bx, by] = broadAt(geo, w, h, x, y), b2 = bx * bx + by * by;
  const nl = Math.hypot(bx, 1, by);
  const keyDot = (-bx * SUN_KEY[0] + SUN_KEY[1] - by * SUN_KEY[2]) / nl;
  const mass = ss(0.01, 0.7225, b2);
  out[offset] = ink;
  out[offset + 1] = deep;
  out[offset + 2] = Math.min(0.24, (1 - ss(0.10, 0.60, keyDot)) * SHADE_STRENGTH.mass * mass * 0.65);
  out[offset + 3] = Math.min(0.16, ss(0.68, 0.98, keyDot) * SHADE_STRENGTH.mass * mass * 0.30);
}

/** Render-owned diagnostic shadow. It never mutates World or renderer state. */
export class PresentationChangeLayer {
  constructor(world, { waterStepId = null } = {}) {
    this.observe = true;
    this.waterStepId = Number.isSafeInteger(waterStepId) ? waterStepId : null;
    this.eventSequence = 0;
    this.lastWaterStepId = this.waterStepId;
    this.stats = null;
    this.totalClassificationCpuMs = 0;
    this.allocatedBytes = 0;
    this.reset(world, 'enable');
  }

  reset(world, reason = 'reset') {
    this.world = world;
    const { size, w, h } = world;
    this.exactGeo = new Float32Array(size);
    this.presentedGeo = new Float32Array(size);
    this.exactWaterGeo = new Float32Array(size);
    this.presentedWaterGeo = new Float32Array(size);
    this.exactDepth = new Uint8Array(size);
    this.presentedDepth = new Uint8Array(size);
    this.depthTexelStamp = new Uint32Array(size);
    this.exactShade = new Float64Array(size * 4);
    this.presentedShade = new Float64Array(size * 4);
    this.forceAt = new Int32Array(size); this.forceAt.fill(-1);
    this.forceMask = new Uint8Array(size);
    this.diagonalStamp = new Uint32Array(Math.max(0, w - 1) * Math.max(0, h - 1));
    this.shadeStamp = new Uint32Array(size);
    this.forcedStamp = new Uint32Array(size);
    this.forcedShadeStamp = new Uint32Array(size);
    this.shadeCandidates = new Uint32Array(size);
    this.shadeCandidateLength = 0;
    this.stamp = 0;
    this.forceBuckets = Array.from({ length: T_MAX }, () => ({ items: new Uint32Array(256), length: 0 }));
    this.queuedCells = 0;
    for (let i = 0; i < size; i++) {
      const g = Math.fround(visualElevation(world.height[i]));
      const wg = Math.fround(Math.fround(visualElevation(world.height[i] + world.water[i])) + 0.04);
      this.exactGeo[i] = this.presentedGeo[i] = g;
      this.exactWaterGeo[i] = this.presentedWaterGeo[i] = wg;
      this.exactDepth[i] = this.presentedDepth[i] = depthByte(world.water[i]);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 4;
      shadeAt(this.exactGeo, w, h, x, y, this.exactShade, o);
    }
    this.presentedShade.set(this.exactShade);
    this.lastWaterStepId = this.waterStepId;
    this.resetReason = reason;
    this.allocatedBytes = this.exactGeo.byteLength + this.presentedGeo.byteLength
      + this.exactWaterGeo.byteLength + this.presentedWaterGeo.byteLength
      + this.exactDepth.byteLength + this.presentedDepth.byteLength
      + this.depthTexelStamp.byteLength
      + this.exactShade.byteLength + this.presentedShade.byteLength
      + this.forceAt.byteLength + this.forceMask.byteLength + this.diagonalStamp.byteLength
      + this.shadeStamp.byteLength + this.forcedStamp.byteLength + this.forcedShadeStamp.byteLength
      + this.shadeCandidates.byteLength
      + this.forceBuckets.reduce((n, b) => n + b.items.byteLength, 0);
  }

  setWaterStepId(id) {
    const next = Number.isSafeInteger(id) ? id : null;
    if (this.waterStepId === null && next !== null) {
      // No water-step clock was available for earlier events; realign rather than
      // pretending RAF time was a hydrology step.
      this.waterStepId = next;
      this.reset(this.world, 'water-step-clock-started');
      return;
    }
    if (next !== null && this.waterStepId !== null && next < this.waterStepId) {
      this.waterStepId = next;
      this.reset(this.world, 'water-step-clock-reset');
      return;
    }
    this.waterStepId = next;
  }

  #schedule(index, mask, stepId) {
    if (stepId === null) return;
    if (this.forceAt[index] < 0) {
      const due = stepId + T_MAX;
      const bucket = this.forceBuckets[due % T_MAX];
      if (bucket.length === bucket.items.length) {
        bucket.items = grow(bucket.items, bucket.length, index);
        this.allocatedBytes += bucket.items.byteLength;
      } else bucket.items[bucket.length] = index;
      bucket.length++;
      this.forceAt[index] = due;
      this.queuedCells++;
    }
    this.forceMask[index] |= mask;
  }

  #clearPending(index, mask) {
    this.forceMask[index] &= ~mask;
    if (!this.forceMask[index] && this.forceAt[index] >= 0) {
      this.forceAt[index] = -1;
      this.queuedCells--;
    }
  }

  #markShadeCell(i) {
    if (this.shadeStamp[i] === this.stamp) return;
    this.shadeStamp[i] = this.stamp;
    this.shadeCandidates[this.shadeCandidateLength++] = i;
  }

  #markDepthTexel(i, stats) {
    if (i < 0 || i >= this.depthTexelStamp.length || this.depthTexelStamp[i] === this.stamp) return;
    this.depthTexelStamp[i] = this.stamp;
    stats.waterDepthChangedTexels++;
  }

  #markShadeAffected(index) {
    const { w, h } = this.world, x = index % w, y = (index / w) | 0;
    for (let delta = -3; delta <= 3; delta++) {
      const xx = x + delta, yy = y + delta;
      if (xx >= 0 && xx < w) this.#markShadeCell(y * w + xx);
      if (yy >= 0 && yy < h) this.#markShadeCell(yy * w + x);
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < w && yy >= 0 && yy < h) this.#markShadeCell(yy * w + xx);
    }
  }

  #currentGeo(i) { return Math.fround(visualElevation(this.world.height[i])); }
  #currentWaterGeo(i) {
    return Math.fround(Math.fround(visualElevation(this.world.height[i] + this.world.water[i])) + 0.04);
  }

  #processForced(stepId, stats) {
    if (stepId === null || this.lastWaterStepId === null || stepId <= this.lastWaterStepId) return;
    const advance = stepId - this.lastWaterStepId;
    if (advance >= T_MAX) {
      for (let b = 0; b < T_MAX; b++) this.#drainBucket(this.forceBuckets[b], stepId, stats);
    } else {
      for (let s = this.lastWaterStepId + 1; s <= stepId; s++) this.#drainBucket(this.forceBuckets[s % T_MAX], stepId, stats);
    }
    this.lastWaterStepId = stepId;
  }

  #drainBucket(bucket, stepId, stats) {
    let write = 0;
    for (let read = 0; read < bucket.length; read++) {
      const i = bucket.items[read], due = this.forceAt[i];
      if (due < 0) continue;
      if (due > stepId) { bucket.items[write++] = i; continue; }
      const mask = this.forceMask[i];
      if (mask & 1) { this.presentedGeo[i] = this.#currentGeo(i); this.#clearPending(i, 1); this.#markForced(i, stats); }
      if (mask & 2) { this.presentedWaterGeo[i] = this.#currentWaterGeo(i); this.#clearPending(i, 2); this.#markForced(i, stats); }
      if (mask & 4) { this.forcedShadeStamp[i] = this.stamp; this.#clearPending(i, 4); }
      this.forceAt[i] = this.forceMask[i] ? stepId + T_MAX : -1;
      if (this.forceMask[i]) {
        const nextDue = this.forceAt[i], nextBucket = this.forceBuckets[nextDue % T_MAX];
        if (nextBucket.length === nextBucket.items.length) {
          nextBucket.items = grow(nextBucket.items, nextBucket.length, i);
          this.allocatedBytes += nextBucket.items.byteLength;
        } else nextBucket.items[nextBucket.length] = i;
        nextBucket.length++;
      }
      if (mask & 1) this.#markShadeAffected(i);
      if (mask & 4) this.#markShadeCell(i);
    }
    bucket.length = write;
  }

  #evaluateShade(stats, stepId) {
    const { w, h } = this.world;
    for (let j = 0; j < this.shadeCandidateLength; j++) {
      const i = this.shadeCandidates[j], x = i % w, y = (i / w) | 0, o = i * 4;
      shadeAt(this.exactGeo, w, h, x, y, this.exactShade, o);
      let error = 0;
      for (let k = 0; k < 4; k++) error = Math.max(error, Math.abs(this.exactShade[o + k] - this.presentedShade[o + k]));
      const forced = this.forcedShadeStamp[i] === this.stamp;
      if (error > EPS_SHADE || forced) {
        for (let k = 0; k < 4; k++) this.presentedShade[o + k] = this.exactShade[o + k];
        stats.terrainShadeCandidateCells++;
        if (error <= EPS_SHADE) this.#markForced(i, stats);
        this.#clearPending(i, 4);
      } else if (error !== 0) this.#schedule(i, 4, stepId);
    }
  }

  #markForced(index, stats) {
    if (this.forcedStamp[index] === this.stamp) return;
    this.forcedStamp[index] = this.stamp;
    stats._forcedCount++;
  }

  observeFrame(frame) {
    if (!this.observe || this.world !== frame.world) return;
    const start = performance.now(), w = frame.world;
    const { lists, old, counts } = frame;
    const stepId = this.waterStepId;
    const stats = {
      eventSequence: ++this.eventSequence, waterStepId: stepId,
      exactHeightCells: counts.height, exactWaterCells: counts.water,
      exactTypeCells: counts.type, exactVegCells: counts.veg, exactFireCells: counts.fire,
      unionChangedCells: counts.cells, terrainGeoCandidateCells: 0,
      terrainShadeCandidateCells: 0, waterGeoCandidateCells: 0, waterDepthChangedTexels: 0,
      wetDryCrossings: 0, depthBandCrossings: 0, a0DepthBandCrossings: 0, typeCrossings: counts.type,
      diagonalFlips: 0, vegetationEligibilityChanges: 0, treeEligibilityChanges: 0, forcedSyncCells: 0,
      bridgeScanCpuMs: frame.bridgeScanCpuMs, classificationCpuMs: 0,
      tmaxClockAvailable: stepId !== null, tmaxQueuedCells: this.queuedCells,
      _forcedCount: 0,
    };

    this.stamp++;
    if (this.stamp >= 0xfffffffe) {
      this.shadeStamp.fill(0); this.diagonalStamp.fill(0); this.depthTexelStamp.fill(0);
      this.forcedStamp.fill(0); this.forcedShadeStamp.fill(0); this.stamp = 1;
    }
    this.shadeCandidateLength = 0;
    const qW = Math.max(0, w.w - 1), qH = Math.max(0, w.h - 1);
    const oldWorld = { w: w.w, h: w.h, height: old.height, generation: w.generation };

    for (let j = 0; j < lists.height.length; j++) {
      const i = lists.height.indices[j], x = i % w.w, y = (i / w.w) | 0;
      const nowGeo = this.#currentGeo(i);
      this.exactGeo[i] = nowGeo;
      const delta = Math.abs(nowGeo - this.presentedGeo[i]);
      if (delta > EPS_GEO) {
        this.presentedGeo[i] = nowGeo; this.#clearPending(i, 1);
        stats.terrainGeoCandidateCells++;
      } else if (delta !== 0) this.#schedule(i, 1, stepId);
      this.#markShadeAffected(i);
      for (let qy = Math.max(0, y - 1); qy <= Math.min(qH - 1, y); qy++) {
        for (let qx = Math.max(0, x - 1); qx <= Math.min(qW - 1, x); qx++) {
          const qi = qy * qW + qx;
          if (this.diagonalStamp[qi] === this.stamp) continue;
          this.diagonalStamp[qi] = this.stamp;
          // A small wrapper gives the topology oracle the old Bridge snapshot.
          if (diagonalAD(oldWorld, qx, qy) !== diagonalAD(w, qx, qy)) stats.diagonalFlips++;
        }
      }
    }

    for (let j = 0; j < lists.water.length; j++) {
      const i = lists.water.indices[j], before = old.water[i], after = w.water[i];
      if ((before > WET) !== (after > WET)) stats.wetDryCrossings++;
      if (depthBand(before) !== depthBand(after)) stats.depthBandCrossings++;
      if (a0DepthBand(before) !== a0DepthBand(after)) stats.a0DepthBandCrossings++;
      const byte = depthByte(after);
      if (byte !== this.exactDepth[i]) {
        this.exactDepth[i] = byte;
        const x = i % w.w, y = (i / w.w) | 0;
        this.#markDepthTexel(i, stats);
        if (x > 0) this.#markDepthTexel(i - 1, stats);
        if (x + 1 < w.w) this.#markDepthTexel(i + 1, stats);
        if (y + 1 < w.h) this.#markDepthTexel(i + w.w, stats);
        this.presentedDepth[i] = byte;
      }
    }

    for (let j = 0; j < counts.cells; j++) {
      const i = lists.cells[j], mask = lists.masks[j];
      if (mask & 3) {
        const nowW = this.#currentWaterGeo(i); this.exactWaterGeo[i] = nowW;
        if (w.water[i] <= WET) {
          if (this.presentedWaterGeo[i] !== nowW) { this.presentedWaterGeo[i] = nowW; stats.waterGeoCandidateCells++; }
          this.#clearPending(i, 2);
        } else {
          const delta = Math.abs(nowW - this.presentedWaterGeo[i]);
          if (delta > EPS_GEO) { this.presentedWaterGeo[i] = nowW; this.#clearPending(i, 2); stats.waterGeoCandidateCells++; }
          else if (delta !== 0) this.#schedule(i, 2, stepId);
        }
      }
      if (eligible(old.height[i], old.water[i]) !== eligible(w.height[i], w.water[i]))
        stats.vegetationEligibilityChanges++;
      if (treeEligible(w, i, old.height[i], old.water[i], old.veg[i]) !== treeEligible(w, i, w.height[i], w.water[i], w.veg[i]))
        stats.treeEligibilityChanges++;
    }

    this.#processForced(stepId, stats);
    this.#evaluateShade(stats, stepId);
    stats.forcedSyncCells = stats._forcedCount;
    delete stats._forcedCount;
    stats.classificationCpuMs = performance.now() - start;
    this.totalClassificationCpuMs += stats.classificationCpuMs;
    this.stats = stats;
  }

  memoryStats() {
    const capacities = this.forceBuckets.reduce((n, b) => n + b.items.length, 0);
    const capacityBytes = this.exactGeo.byteLength + this.presentedGeo.byteLength
      + this.exactWaterGeo.byteLength + this.presentedWaterGeo.byteLength
      + this.exactDepth.byteLength + this.presentedDepth.byteLength + this.depthTexelStamp.byteLength
      + this.exactShade.byteLength + this.presentedShade.byteLength + this.forceAt.byteLength
      + this.forceMask.byteLength + this.diagonalStamp.byteLength + this.shadeStamp.byteLength
      + this.forcedStamp.byteLength + this.forcedShadeStamp.byteLength + this.shadeCandidates.byteLength
      + this.forceBuckets.reduce((n, b) => n + b.items.byteLength, 0);
    return { allocatedBytes: this.allocatedBytes, capacityBytes, forcedQueueCapacity: capacities, queuedCells: this.queuedCells };
  }

  dispose() {
    this.observe = false; this.world = null; this.stats = null;
    this.exactGeo = this.presentedGeo = this.exactWaterGeo = this.presentedWaterGeo = null;
    this.exactDepth = this.presentedDepth = this.depthTexelStamp = this.exactShade = this.presentedShade = null;
    this.forceAt = this.forceMask = this.diagonalStamp = this.shadeStamp = this.forcedStamp = this.forcedShadeStamp = this.shadeCandidates = null;
    this.forceBuckets = null;
  }
}

export const PCC_THRESHOLDS = Object.freeze({ wet: WET, depthBands: DEPTH_BANDS, epsGeo: EPS_GEO, epsShade: EPS_SHADE, tMaxWaterSteps: T_MAX });
