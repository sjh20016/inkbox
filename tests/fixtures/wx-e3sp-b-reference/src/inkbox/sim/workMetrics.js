// Opt-in, unsaved diagnostics. Observing a world never changes its random streams
// or creates game facts. Timings are wall-clock attribution, not CPU attribution.
const sessions = new WeakMap();
const timingSessions = new WeakSet();
const actors = new WeakMap();

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

export function enableWorkMetrics(world, enabled = true, {timing = true} = {}) {
  if (enabled) {
    sessions.set(world, Object.create(null));actors.set(world, new WeakSet());
    if(timing)timingSessions.add(world);else timingSessions.delete(world);
  } else {sessions.delete(world);timingSessions.delete(world);actors.delete(world);}
}

export function startWorkMetric(world) {
  return timingSessions.has(world) ? performance.now() : null;
}

export function endWorkMetric(world, key, started) {
  const metrics = sessions.get(world);
  if (!metrics || started === null) return;
  const row = metrics[key] ||= { calls: 0, wallMs: 0 };
  row.calls++;
  const elapsed=performance.now()-started;
  row.wallMs += elapsed;
  if(key==='life.stepEntity'){
    // Fixed histogram: p95/p99 are upper bounds, not exact sample quantiles.
    const histogram=row.histogram ||= Array(33).fill(0);
    histogram[Math.max(0,Math.min(32,Math.ceil(Math.log2(Math.max(elapsed,2**-12)))+12))]++;
    row.maxMs=Math.max(row.maxMs||0,elapsed);
  }
}

export function recordWorkActor(world, entity) {
  const seen=actors.get(world);
  if(seen&&entity!==null&&(typeof entity==='object'||typeof entity==='function')&&!seen.has(entity)){seen.add(entity);countWorkMetric(world,'effects.actors');}
}

export function maxWorkMetric(world, key, value) {
  const metrics=sessions.get(world);
  if(metrics)metrics[key]=Math.max(metrics[key]||0,value);
}

export function countWorkMetric(world, key, amount = 1) {
  const metrics = sessions.get(world);
  if (metrics) metrics[key] = (metrics[key] || 0) + amount;
}

export function workMetricsSnapshot(world) {
  return structuredClone(sessions.get(world) || {});
}
