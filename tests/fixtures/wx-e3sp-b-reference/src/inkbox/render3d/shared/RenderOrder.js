/** Explicit draw order for the composable plane stages. */
export const RENDER_ORDER = Object.freeze({
  terrain: 0,
  water: 1,
  vegetation: 2,
  settlements: 3,
  entities: 4,
  markers: 5,
  selection: 6,
  realmBoundary: 7,
  fx: 8,
  debug: 9,
});
