import { mapProgressSummary } from '../world/mapProgress.js';
import { TERRAIN_PRESETS } from '../world/worldGeneration.js';

/** One-way adapters: renderer percentages never become simulation stages. */
export function buildWorldProgressViewModel(world) {
  const progress = mapProgressSummary(world), b = progress.bounds;
  return Object.freeze({ stage: progress.percent, openedPercent: progress.percent,
    boundaryText: `${b.x1 - b.x0 + 1} × ${b.y1 - b.y0 + 1}`,
    canRequestExpand: progress.enabled && progress.stage < 3,
    disabledReason: progress.enabled ? '山河已全部开放' : '此世界未启用渐进开放',
    progressText: progress.nextUnlockDay === null ? '全境已开放' : `距下次拓展 ${Math.ceil(progress.daysRemaining)} 日` });
}
export function buildWorldCreationInfoViewModel(world) {
  const progress = buildWorldProgressViewModel(world);
  return Object.freeze({ seed: world.seed,
    terrainName: world.generation?.version >= 2 ? TERRAIN_PRESETS[world.generation.terrainPreset]?.label || '地貌不可考' : '旧版地貌',
    mapSize: Object.freeze({ width: world.w, height: world.h }), gradualAccess: !!world.mapProgress,
    openedRangeText: `${progress.openedPercent}% · ${progress.boundaryText}` });
}
