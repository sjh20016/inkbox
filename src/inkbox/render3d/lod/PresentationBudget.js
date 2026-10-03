/** Shared presentation-only screen-space LOD thresholds and fixed batch budgets. */
export const LOD_BUDGETS = Object.freeze({
  // Thresholds are an initial operational profile; M2-C2A audit screenshots can tune them.
  thresholds: Object.freeze({ tree: Object.freeze({ enterLod0: 28, leaveLod0: 24, enterLod2: 5, leaveLod2: 7 }),
    character: Object.freeze({ enterLod0: 44, leaveLod0: 38, enterLod2: 7, leaveLod2: 9 }),
    building: Object.freeze({ enterLod0: 52, leaveLod0: 44, enterLod2: 9, leaveLod2: 12 }),
    settlement: Object.freeze({ enterLod0: 60, leaveLod0: 50, enterLod2: 24, leaveLod2: 32 }) }),
  categories: Object.freeze({ tree: Object.freeze({ capacity: 10000, lod0: 1024, lod1: 5000 }),
    character: Object.freeze({ capacity: 3256, lod0: 256, lod1: 1200 }),
    building: Object.freeze({ capacity: 4608, lod0: 512, lod1: 2048 }),
    settlement: Object.freeze({ capacity: 512, lod0: 96, lod1: 256 }) }),
});

const categoryKey = c => String(c || 'tree').toLowerCase().replace(/s$/, '');

/** Approximate an entity's larger projected screen dimension using a shared view. */
export function projectedPixels(height, view = {}, width = height) {
  const h = Math.max(0, Number(height) || 0), w = Math.max(0, Number(width) || 0);
  const ppu = Number.isFinite(view.pixelsPerUnit) ? view.pixelsPerUnit : 1;
  const vppu = Number.isFinite(view.verticalPixelsPerUnit) ? view.verticalPixelsPerUnit : ppu;
  return Math.max(h * Math.max(0, vppu), w * Math.max(0, ppu));
}

/** Return a LOD index (0 detailed, 1 reduced, 2 silhouette), with a stable dead band. */
export function chooseLOD(category, pixels, previous, enabled = true) {
  if (!enabled) return 0;
  const bands = LOD_BUDGETS.thresholds[categoryKey(category)] || LOD_BUDGETS.thresholds.tree;
  const px = Math.max(0, Number(pixels) || 0);
  let lod = Number.isInteger(previous) && previous >= 0 && previous <= 2 ? previous : 1;
  if (lod === 0) {
    if (px < bands.leaveLod0) lod = px < bands.enterLod2 ? 2 : 1;
  } else if (lod === 2) {
    if (px > bands.leaveLod2) lod = px > bands.enterLod0 ? 0 : 1;
  } else if (px >= bands.enterLod0) lod = 0;
  else if (px <= bands.enterLod2) lod = 2;
  return lod;
}

/** Enforce per-detail density caps by demoting only presentation quality, never entities. */
export function budgetLOD(category, desired, counts = [0, 0, 0]) {
  const key = categoryKey(category);
  const budget = LOD_BUDGETS.categories[key] || LOD_BUDGETS.categories.tree;
  let lod = Math.max(0, Math.min(2, desired | 0));
  const requested = lod;
  if (lod === 0 && counts[0] >= budget.lod0) lod = 1;
  if (lod === 1 && counts[1] >= budget.lod1) lod = 2;
  counts[lod] = (counts[lod] || 0) + 1;
  return { lod, demoted: lod !== requested, capacity: budget.capacity,
    capacityOverflow: counts[0] + counts[1] + counts[2] > budget.capacity };
}

/** Apply detail budgets in input order, preserving every source entry. */
export function allocateCategoryBudget(category, entries, previousStates = null) {
  const key = categoryKey(category);
  const capacity = LOD_BUDGETS.categories[key]?.capacity ?? 3256;
  const count = entries?.length || 0;
  const result = new Array(count), counts = [0, 0, 0];
  let budgetDemotions = 0;
  for (let i = 0; i < count; i++) {
    const item = entries[i];
    const previous = previousStates?.get?.(item.id ?? item.cell ?? i);
    const outcome = budgetLOD(key, chooseLOD(key, item.pixels, previous, true), counts);
    if (outcome.demoted) budgetDemotions++;
    result[i] = { item, lod: outcome.lod, budgetDemoted: outcome.demoted };
  }
  return { entries: result, count, overflow: Math.max(0, count - capacity), capacity, counts, budgetDemotions };
}
