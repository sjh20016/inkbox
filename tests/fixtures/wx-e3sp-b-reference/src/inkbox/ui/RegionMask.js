import { regionContains } from './realmView.js';

/** Renderer-independent view region in world cell coordinates. */
export class RegionMask {
  constructor(selection) {
    const path = Array.isArray(selection?.path)
      ? selection.path.map(point => Object.freeze([point[0], point[1]])) : [];
    this.path = Object.freeze(path);
    this.x0 = selection.x0;
    this.y0 = selection.y0;
    this.x1 = selection.x1;
    this.y1 = selection.y1;
    this.area = selection.area;
    Object.freeze(this);
  }

  contains(x, y) {
    return regionContains(this, x, y);
  }
}
