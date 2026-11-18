// Independent player access clipping; RealmMask remains the sole realm window.
export class AccessGeometry {
  constructor(world, bounds, regionGeometry = null, inside = true) {
    this.world = world; this.bounds = bounds; this.source = regionGeometry; this.sourceInside = !!inside;
    this.allInside = false; this.quadW = world.w - 1; this.quadH = world.h - 1;
  }
  contains(x, y) {
    const b = this.bounds;
    return Number.isFinite(x) && Number.isFinite(y) && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  }
  isInsideQuad(x, y) {
    return x >= 0 && y >= 0 && x < this.quadW && y < this.quadH && this.contains(x + .5, y + .5)
      && (!this.source || this.source.allInside || this.source.isInsideQuad(x, y) === this.sourceInside);
  }
  isInsideCell(x, y) {
    return this.contains(x, y) && (!this.source || this.source.allInside || this.source.isInsideCell(x, y) === this.sourceInside);
  }
}
export function composeAccessGeometry(world, bounds, geometry, inside) {
  if (!bounds) return { geometry, inside };
  return { geometry: new AccessGeometry(world, bounds, geometry, inside), inside: true };
}
