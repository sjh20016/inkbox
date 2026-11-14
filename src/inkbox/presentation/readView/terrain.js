import { worldGeneration } from './index.js';
import { subscribeTerrainChanges, readTerrainChanges, disposeTerrainSubscription, TERRAIN_LAYERS } from '../../world/terrainChanges.js';

// Terrain arrays remain authoritative; this facade provides bounded change notifications.
export class TerrainReadView {
  constructor(world) { this.world = world; this.subscription = subscribeTerrainChanges(world); }
  initial() {
    const layers = {};
    for (const name of TERRAIN_LAYERS) layers[name] = this.world[name].slice();
    return Object.freeze({ worldGeneration: worldGeneration(this.world), width: this.world.w,
      height: this.world.h, full: true, layers: Object.freeze(layers) });
  }
  changes() {
    const change = readTerrainChanges(this.subscription);
    if (!change) return null;
    if (change.full) return this.initial();
    const blocks = [];
    for (let i = 0; i < TERRAIN_LAYERS.length; i++) {
      const region = change.regions[i];
      if (!region) continue;
      const name = TERRAIN_LAYERS[i], width = region.x1 - region.x0 + 1;
      const data = new this.world[name].constructor(width * (region.y1 - region.y0 + 1));
      for (let y = region.y0; y <= region.y1; y++)
        data.set(this.world[name].subarray(y * this.world.w + region.x0, y * this.world.w + region.x1 + 1),
          (y - region.y0) * width);
      blocks.push(Object.freeze({ layer: name, ...region, data }));
    }
    return Object.freeze({ worldGeneration: worldGeneration(this.world), full: false, blocks: Object.freeze(blocks) });
  }
  dispose() { disposeTerrainSubscription(this.subscription); this.subscription = null; this.world = null; }
}

