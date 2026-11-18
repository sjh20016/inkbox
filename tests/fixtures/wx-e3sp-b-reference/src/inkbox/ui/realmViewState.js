import { viewPlaneForTool } from './realmView.js';
import { RegionMask } from './RegionMask.js';

// Committed selections are normally replaced, not edited. Compare values as well so an
// external in-place path edit cannot leave a stale mask. Keep identity across frames.
const regionCache = new WeakMap();

function sameRegion(selection, region) {
  if (selection.x0 !== region.x0 || selection.y0 !== region.y0
    || selection.x1 !== region.x1 || selection.y1 !== region.y1
    || selection.area !== region.area) return false;
  const sourcePath = Array.isArray(selection.path) ? selection.path : [];
  if (sourcePath.length !== region.path.length) return false;
  for (let i = 0; i < sourcePath.length; i += 1) {
    if (sourcePath[i][0] !== region.path[i][0] || sourcePath[i][1] !== region.path[i][1]) return false;
  }
  return true;
}

function regionFor(selection) {
  let region = regionCache.get(selection);
  if (!region || !sameRegion(selection, region)) {
    region = new RegionMask(selection);
    regionCache.set(selection, region);
  }
  return region;
}

/** The single derived view state shared by Canvas, Three and rift timing. */
export function getRealmViewState({ selection, toolId }) {
  const targetPlane = viewPlaneForTool(toolId);
  const open = Boolean(selection && targetPlane);
  return Object.freeze({
    open,
    targetPlane,
    region: open ? regionFor(selection) : null,
  });
}
