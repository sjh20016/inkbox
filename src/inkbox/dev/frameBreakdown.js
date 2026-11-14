// Opt-in wall-clock instrumentation. Never stores metrics on World or samples RNG.
let enabled = false, capacity = 100000, nextId = 1, dropped = 0;
let samples = [], head = 0, stack = [];
const now = () => performance.now();
const reserved = new Set(['id','parentId','name','startMs','endMs','inclusiveMs','exclusiveMs']);
function metadata(data) {
  if (!data) return undefined;
  return Object.fromEntries(Object.entries(data).filter(([key,value]) => !reserved.has(key)
    && (value === null || ['string','number','boolean'].includes(typeof value))));
}
function append(row) {
  if (samples.length < capacity) samples.push(row);
  else { samples[head] = row; head = (head + 1) % capacity; dropped++; }
}
export function configureFrameBreakdown(options = {}) {
  if (stack.length) throw new Error('Cannot reconfigure breakdown inside a measured span');
  if (options.capacity !== undefined) {
    if (!Number.isInteger(options.capacity) || options.capacity < 1) throw new RangeError('Invalid sample capacity');
    if (options.reset === false && options.capacity !== capacity)
      throw new Error('Changing capacity requires a reset');
    capacity = options.capacity;
  }
  if (options.reset !== false) { samples = []; head = 0; dropped = 0; nextId = 1; }
  enabled = options.enabled === true;
  return { enabled, capacity };
}
export function frameBreakdownEnabled() { return enabled; }
export function beginBreakdown(name, data) {
  if (!enabled) return null;
  const token = { id: nextId++, parentId: stack.at(-1)?.id ?? null, name, startMs: now(), childMs: 0, data: metadata(data) };
  stack.push(token);
  return token;
}
export function endBreakdown(token, data) {
  if (!token || !stack.includes(token)) return;
  const endMs = now();
  // Exception exits may unwind an unfinished nested span. Preserve that fact.
  while (stack.length && stack.at(-1) !== token) finish(stack.at(-1), endMs, { interrupted: true });
  if (stack.at(-1) === token) finish(token, endMs, data);
}
function finish(token, endMs, data) {
  stack.pop();
  const inclusiveMs = endMs - token.startMs;
  if (stack.length) stack.at(-1).childMs += inclusiveMs;
  append({ id: token.id, parentId: token.parentId, name: token.name, startMs: token.startMs, endMs,
    inclusiveMs, exclusiveMs: Math.max(0, inclusiveMs - token.childMs), ...token.data, ...metadata(data) });
}
export function markBreakdown(name, data) {
  if (!enabled) return;
  const timestamp = now();
  append({ id: nextId++, parentId: stack.at(-1)?.id ?? null, name, startMs: timestamp, endMs: timestamp, inclusiveMs: 0, exclusiveMs: 0, ...metadata(data) });
}
export function snapshotFrameBreakdown() {
  const ordered = head ? [...samples.slice(head), ...samples.slice(0, head)] : samples.slice();
  return { schemaVersion: 1, enabled, capacity, dropped, activeSpans: stack.length,
    timeOrigin: performance.timeOrigin, clock: 'performance.now wall milliseconds; not CPU or GPU time',
    definition: 'inclusive includes child spans; exclusive subtracts only instrumented direct children; never add nested inclusive durations',
    samples: ordered.map(row => ({ ...row })) };
}
