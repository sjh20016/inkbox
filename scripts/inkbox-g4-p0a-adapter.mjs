// Served only as /__g4__/hydrology-entry.mjs by the localhost G4 experiment server.
import * as H from '/src/inkbox/sim/hydrology.js';
import { VARIANTS, enterStaticSea } from '/__g4__/variants-r2.mjs';

const adapterSHA = '__G4_ADAPTER_SOURCE_SHA256__';
const allowed = Object.freeze(['V0_current', 'V1_noErosion', 'V3_staticSeaStrict', 'V9_hydrologyOff']);
const variant = new URL(location.href).searchParams.get('g4variant') || 'V0_current';
if (!allowed.includes(variant)) throw new Error(`G4 invalid/forbidden variant: ${variant}`);
if (typeof VARIANTS[variant] !== 'function') throw new Error(`G4 missing R2 variant: ${variant}`);

// This fingerprint is a browser-side binding check, not a replacement for source SHA-256.
function fingerprintOf(value) {
  let hash = 2166136261;
  const source = Function.prototype.toString.call(value);
  for (let i = 0; i < source.length; i += 1) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `${variant}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
const fingerprint = fingerprintOf(variant === 'V0_current' ? H.stepHydrology : VARIANTS[variant]);

let hydroStepCount = 0;
let hydroTotalMs = 0;
let productWorldCalls = 0;
let worldIsProductWorld = null;
let lastDtDays = null;
let lastStep = null;
let prepareCalls = 0;
let prepareChangedCells = 0;
let prepareTotalMs = 0;
let v3StepNormalizationCalls = 0;
let v3StepNormalizedCells = 0;
const errors = [];
const MAX_ERRORS = 16;

function recordError(message) {
  if (errors.length < MAX_ERRORS) errors.push(String(message));
}

// Constant-size summary: no world-wide scan is added to the timed hydrology path.
function summary(world) {
  const n = world?.size || 0;
  const middle = n >>> 1;
  return {
    revision: world?.revision ?? null,
    terrainDirty: world?.terrainDirty ?? null,
    size: n,
    waterSamples: n ? [world.water[0], world.water[middle], world.water[n - 1]] : [],
    heightSamples: n ? [world.height[0], world.height[middle], world.height[n - 1]] : [],
  };
}

export function prepareWorld(world) {
  if (!world || !world.height || !world.water) throw new Error('G4 prepareWorld requires a World');
  const start = performance.now();
  const changedCells = enterStaticSea(world);
  const elapsedMs = performance.now() - start;
  prepareCalls += 1;
  prepareChangedCells += changedCells;
  prepareTotalMs += elapsedMs;
  return Object.freeze({ changedCells, elapsedMs, calls: prepareCalls });
}

export function stepHydrology(world, dtDays, opts) {
  lastDtDays = dtDays;
  if (dtDays !== 4) {
    const message = `G4 unexpected dtDays=${String(dtDays)}; expected 4`;
    recordError(message);
    throw new Error(message);
  }
  const productWorld = globalThis.inkbox?.world;
  if (productWorld && world === productWorld) {
    worldIsProductWorld = true;
    productWorldCalls += 1;
  } else if (worldIsProductWorld === null) {
    // Paused clone-world Oracle calls are permitted; only a matched real call proves wiring.
    worldIsProductWorld = false;
  }
  const before = summary(world);
  const start = performance.now();
  hydroStepCount += 1;
  try {
    // V0 must forward exactly once with the original dtDays and opts object.
    const result = variant === 'V0_current'
      ? H.stepHydrology(world, dtDays, opts)
      : VARIANTS[variant](world);
    hydroTotalMs += performance.now() - start;
    if (variant === 'V3_staticSeaStrict') {
      v3StepNormalizationCalls += 1;
      v3StepNormalizedCells += world._g4lastNorm || 0;
    }
    lastStep = { before, after: summary(world), elapsedMs: performance.now() - start };
    return result;
  } catch (error) {
    hydroTotalMs += performance.now() - start;
    recordError(error?.stack || error);
    lastStep = { before, after: summary(world), failed: true };
    throw error;
  }
}

export function resetCounters() {
  hydroStepCount = 0;
  hydroTotalMs = 0;
  productWorldCalls = 0;
  worldIsProductWorld = null;
  lastDtDays = null;
  lastStep = null;
  v3StepNormalizationCalls = 0;
  v3StepNormalizedCells = 0;
  errors.length = 0;
}

export function readProbe() {
  const copySummary = (value) => value && Object.freeze({
    ...value,
    waterSamples: Object.freeze([...value.waterSamples]),
    heightSamples: Object.freeze([...value.heightSamples]),
  });
  const step = lastStep && Object.freeze({
    ...lastStep,
    before: copySummary(lastStep.before),
    after: copySummary(lastStep.after),
  });
  return Object.freeze({
    variant, adapterSHA, fingerprint, hydroStepCount, hydroTotalMs,
    productWorldCalls, worldIsProductWorld, lastDtDays,
    normalizationCalls: Object.freeze({ prepare: prepareCalls, v3Steps: v3StepNormalizationCalls }),
    normalizationChangedCells: Object.freeze({ prepare: prepareChangedCells, v3Steps: v3StepNormalizedCells }),
    prepareTotalMs, lastStep: step,
    errors: Object.freeze([...errors]),
  });
}

Object.defineProperty(globalThis, '__g4Probe', {
  configurable: false, enumerable: false, get: readProbe,
});
