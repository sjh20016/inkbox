// The only render3d bridge into the authoritative rift formulas.
import { riftRadiusAt, riftIsActive } from '../../sim/rifts.js';

export function visibleRift(rift) {
  if (!rift || !riftIsActive(rift)) return null;
  const radius = riftRadiusAt(rift);
  return radius > 0.05 ? { radius, targetPlane: rift.targetPlane } : null;
}
