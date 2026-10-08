import { generateWorld } from '../world/worldgen.js';
import { createMapProgress, accessBounds, expandMap } from '../world/mapProgress.js';

const element = id => globalThis.document?.getElementById(id);
export function parseSeed(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) throw new RangeError('种子须为 0 至 4294967295 的整数');
  const seed = Number(text);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('种子须为 0 至 4294967295 的整数');
  return seed;
}
export function creationOptions(overrides = {}) {
  const terrain = overrides.terrainPreset ?? element('inkTerrainSelect')?.value ?? 'standard';
  const generationVersion = overrides.generationVersion ?? (terrain === 'legacy' ? 1 : 2);
  return { generationVersion, terrainPreset: terrain === 'legacy' ? 'standard' : terrain,
    progressive: overrides.progressive ?? element('inkProgressive')?.checked ?? false };
}
export function createSandboxWorld(preset, seed, options = {}) {
  const { progressive, ...generation } = creationOptions(options);
  const world = generateWorld({ preset, seed: parseSeed(seed), scatter: true, ...generation });
  createMapProgress(world, progressive);
  return world;
}
export function syncCreationControls(sandbox) {
  const world = sandbox.world;
  if (!world) return;
  const terrain = element('inkTerrainSelect');
  if (terrain) terrain.value = world.generation?.terrainPreset ?? 'legacy';
  const progressive = element('inkProgressive');
  if (progressive) progressive.checked = !!world.mapProgress;
  syncMapProgress(sandbox);
}
export function syncMapProgress(sandbox) {
  const world = sandbox.world;
  if (!world) return;
  const button = element('inkBtnExpand'), label = element('inkMapProgress');
  const b = accessBounds(world), stage = world.mapProgress?.stage;
  if (button) { button.hidden = stage === undefined; button.disabled = stage === undefined || stage >= 3; }
  const text = stage === undefined ? '' : '已开放 ' + (b.x1-b.x0+1) + '×' + (b.y1-b.y0+1) + ' · ' + (stage+1) + '/4';
  if (label && label.textContent !== text) label.textContent = text;
}
export function expandSandboxMap(sandbox, all = false) {
  sandbox.render3d?.endStroke?.();
  if (!expandMap(sandbox.world, all)) return false;
  sandbox.terrain?.invalidate();
  sandbox.camera?.fit(sandbox.world);
  sandbox.dirty = true;
  sandbox.qol?.markDirty('terrain');
  syncMapProgress(sandbox);
  const b = accessBounds(sandbox.world);
  sandbox.notify?.('地图已拓展 · 开放 ' + (b.x1-b.x0+1) + '×' + (b.y1-b.y0+1));
  return true;
}
