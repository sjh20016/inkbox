// Opt-in, unsaved diagnostics. Observing a world never changes its random streams
// or creates game facts. Timings are wall-clock attribution, not CPU attribution.
const sessions = new WeakMap();

export function workMetricsEnabled(world) { return sessions.has(world); }

/** Fixed buckets: fractional frame steps never create unbounded metric keys. */
export function recordWorkDt(world, days) {
  const metrics=sessions.get(world);
  if(!metrics || !Number.isFinite(days) || days<=0)return;
  const row=metrics['life.dtDays'] ||= {count:0,sum:0,min:days,max:days,
    buckets:{'<=0.05':0,'<=0.1':0,'<=0.5':0,'<=1':0,'<=3':0,'<=10':0,'<=30':0,'>30':0}};
  row.count++;row.sum+=days;row.min=Math.min(row.min,days);row.max=Math.max(row.max,days);
  const bucket=days<=.05?'<=0.05':days<=.1?'<=0.1':days<=.5?'<=0.5':days<=1?'<=1':days<=3?'<=3':days<=10?'<=10':days<=30?'<=30':'>30';
  row.buckets[bucket]++;
}

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
