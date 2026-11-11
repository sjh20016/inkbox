import { worldGeneration } from './index.js';
import { subscribeTerrainChanges, readTerrainChanges, disposeTerrainSubscription, TERRAIN_LAYERS } from '../../world/terrainChanges.js';

// Terrain arrays remain authoritative; this facade provides bounded change notifications.
export class TerrainReadView {
  constructor(world) { this.world = world; this.subscription = subscribeTerrainChanges(world); }
  initial() { return Object.freeze({ worldGeneration: worldGeneration(this.world), width: this.world.w,
    height: this.world.h, layers: TERRAIN_LAYERS.slice(), full: true }); }
  changes() { return readTerrainChanges(this.subscription); }
  dispose() { disposeTerrainSubscription(this.subscription); this.subscription = null; this.world = null; }
}

