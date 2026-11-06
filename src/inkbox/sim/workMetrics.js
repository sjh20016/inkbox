// Opt-in, unsaved diagnostics. Observing a world never changes its random streams
// or creates game facts. Timings are wall-clock attribution, not CPU attribution.
const sessions = new WeakMap();

export function enableWorkMetrics(world, enabled = true) {
  if (enabled) sessions.set(world, Object.create(null));
  else sessions.delete(world);
}

export function startWorkMetric(world) {
  return sessions.has(world) ? performance.now() : null;
}

export function endWorkMetric(world, key, started) {
  const metrics = sessions.get(world);
  if (!metrics || started === null) return;
  const row = metrics[key] ||= { calls: 0, wallMs: 0 };
  row.calls++;
  row.wallMs += performance.now() - started;
}

export function countWorkMetric(world, key, amount = 1) {
  const metrics = sessions.get(world);
  if (metrics) metrics[key] = (metrics[key] || 0) + amount;
}

export function workMetricsSnapshot(world) {
  return structuredClone(sessions.get(world) || {});
}
