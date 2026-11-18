// Identity-only lookup: consumers never dereference an authoritative draft.
const managed = new WeakMap();
export const committedEntry = world => world && managed.get(world);
export const registerCommittedWorld = (world, session, plane) => managed.set(world, { session, plane });
export const unregisterCommittedWorld = world => managed.delete(world);
export function committedFrameOf(world, plane) {
  const entry = committedEntry(world);
  if (!entry) return undefined;
  if (plane && plane !== entry.plane) return null;
  return entry.session.frames[entry.plane] || null;
}
export function committedGeometryOf(world) {
  const frame = committedFrameOf(world);
  if (frame === null) throw new Error('Committed geometry unavailable for disposed World');
  return frame?.geometry;
}
export function assertCommittedLegacyReadAllowed(world) {
  const entry = committedEntry(world);
  if (entry && (entry.session.inProgress || entry.session.fault || entry.session.disposed))
    throw new Error('Authoritative World read prohibited outside a complete committed boundary');
}
