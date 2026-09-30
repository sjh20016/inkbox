export const PLANES = Object.freeze(['mortal', 'upper', 'nether']);

// Renderer-owned epoch: identities, dimensions and replaced terrain buffers.
// No fields are added to World or to the save schema.
export function snapshotWorldSet(world) {
  if (!world || !Number.isInteger(world.w) || !Number.isInteger(world.h) || world.w < 2 || world.h < 2) {
    throw new Error('Render3D requires valid world dimensions');
  }
  return PLANES.map(plane => {
    const value = plane === 'mortal' ? world : world[plane];
    if (!value) return null;
    if (value.w !== world.w || value.h !== world.h || value.size !== value.w * value.h) {
      throw new Error(`Render3D coordinate contract mismatch: ${plane}`);
    }
    const buffers = ['height', 'water', 'type', 'veg'].map(key => {
      if (value[key]?.length !== value.size) throw new Error(`Render3D invalid ${plane}.${key}`);
      return value[key];
    });
    return { world: value, w: value.w, h: value.h, buffers };
  });
}

export function sameWorldSet(a, b) {
  return !!a && a.every((entry, i) => entry === null ? b[i] === null : !!b[i]
    && entry.world === b[i].world && entry.w === b[i].w && entry.h === b[i].h
    && entry.buffers.every((buffer, j) => buffer === b[i].buffers[j]));
}
