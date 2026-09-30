import { deriveEntities, deriveUpperEntities, deriveNetherEntities } from '../entities/deriveEntities.js';

/** Technical M2-A layer composition. Plane semantics stay here, outside layers. */
export const PLANE_RENDER_PROFILE = Object.freeze({
  mortal: Object.freeze({ terrain: true, water: true, vegetation: true, entities: deriveEntities, settlements: true, markers: true, selection: true }),
  upper: Object.freeze({ terrain: true, water: false, vegetation: false, entities: deriveUpperEntities, settlements: false, markers: false, selection: false, terrainTint: '#d4dfd3' }),
  nether: Object.freeze({ terrain: true, water: false, vegetation: false, entities: deriveNetherEntities, settlements: false, markers: false, selection: false, terrainTint: '#8f8292' }),
});

export function renderProfileFor(plane) {
  const profile = PLANE_RENDER_PROFILE[plane];
  if (!profile) throw new Error(`Unknown render plane: ${plane}`);
  return profile;
}
