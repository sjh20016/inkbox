import { createCoordinates } from './coordinates.js';

// Own snapshots, never dirty flags on World: Canvas and Three may observe independently.
export class WorldRenderBridge {
  constructor(world) {
    this.world = world;
    this.coordinates = createCoordinates(world);
    this.snapshots = Object.fromEntries(['height', 'water', 'type', 'veg'].map(key => [key, world[key].slice()]));
  }
  changes() {
    const w = this.world;
    const { height, water, type, veg } = w;
    const old = this.snapshots;
    let x0 = w.w, y0 = w.h, x1 = -1, y1 = -1;
    for (let i = 0; i < w.size; i++) {
      const changed = old.height[i] !== height[i] || old.water[i] !== water[i] || old.type[i] !== type[i] || old.veg[i] !== veg[i];
      if (changed) { old.height[i] = height[i]; old.water[i] = water[i]; old.type[i] = type[i]; old.veg[i] = veg[i]; }
      if (changed) { const x = i % w.w, y = Math.floor(i / w.w); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }
}
