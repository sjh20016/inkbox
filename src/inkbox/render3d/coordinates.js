// Integer world coordinates denote cell centres. X/Z span [0,w-1]/[0,h-1].
export function createCoordinates(world) {
  const { w, h } = world;
  const clamp = (v, max) => Math.max(0, Math.min(max, v));
  const worldToRender = (x, y, elevation = 0) => ({ x: x - (w - 1) / 2, y: elevation, z: y - (h - 1) / 2 });
  const renderToWorld = (x, z) => ({ x: x + (w - 1) / 2, y: z + (h - 1) / 2 });
  return {
    worldToRender, renderToWorld,
    cellToRender: worldToRender,
    renderPointToCell(point) {
      const p = renderToWorld(point.x, point.z);
      return { x: clamp(Math.round(p.x), w - 1), y: clamp(Math.round(p.y), h - 1) };
    },
  };
}
