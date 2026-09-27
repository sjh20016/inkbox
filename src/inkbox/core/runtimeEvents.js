// Inkbox transient runtime events.
// These describe moments for presentation consumers; durable history belongs in world.record().
// `day` is simulation time. Consumers may attach a real timestamp only after draining the queue.

const queues = new WeakMap();

export const RUNTIME_EVENT_CAP = 256;
export const RUNTIME_EVENT_TYPES = Object.freeze([
  'tool-impact',
  'tribulation',
  'ascension',
  'rift-open',
  'rift-cross',
  'possession',
  'war-start',
  'sect-fall',
  'major-death',
]);

const EVENT_TYPE_SET = new Set(RUNTIME_EVENT_TYPES);
const PLANES = new Set(['mortal', 'upper', 'nether']);
const OPTIONAL_NUMBER_FIELDS = ['x', 'y', 'intensity'];
const OPTIONAL_ID_FIELDS = ['subjectId', 'targetId'];

function assertWorld(world) {
  if (!world || typeof world !== 'object') {
    throw new TypeError('Runtime events require a world object');
  }
}

function finiteNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Runtime event ${field} must be a finite number`);
  }
  return value;
}

function cloneJsonValue(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Runtime event data must contain only finite numbers');
    return value;
  }
  if (typeof value !== 'object') throw new TypeError('Runtime event data must be JSON-safe');
  if (ancestors.has(value)) throw new TypeError('Runtime event data cannot be circular');

  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    ancestors.add(value);
    const copy = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError('Runtime event data cannot contain sparse arrays');
      copy.push(cloneJsonValue(value[index], ancestors));
    }
    ancestors.delete(value);
    return copy;
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Runtime event data must use plain objects (no DOM, Canvas, or class instances)');
  }

  ancestors.add(value);
  const copy = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw new TypeError('Runtime event data cannot contain symbol keys');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable) continue;
    if (!Object.hasOwn(descriptor, 'value')) throw new TypeError('Runtime event data cannot contain getters or setters');
    Object.defineProperty(copy, key, {
      value: cloneJsonValue(descriptor.value, ancestors),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  ancestors.delete(value);
  return copy;
}

function queueFor(world) {
  assertWorld(world);
  let queue = queues.get(world);
  if (!queue) {
    queue = [];
    queues.set(world, queue);
  }
  return queue;
}

function snapshot(event) {
  const copy = { ...event };
  if (Object.hasOwn(event, 'data')) copy.data = cloneJsonValue(event.data);
  return copy;
}

/** Add one short-lived presentation event without touching simulation state or RNG. */
export function emitRuntimeEvent(world, type, payload = {}) {
  if (!EVENT_TYPE_SET.has(type)) throw new TypeError(`Unsupported runtime event type: ${type}`);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Runtime event payload must be an object');
  }

  const plane = payload.plane ?? world?.plane ?? 'mortal';
  if (!PLANES.has(plane)) throw new TypeError(`Unsupported runtime event plane: ${plane}`);
  const day = finiteNumber(payload.day ?? world?.day ?? 0, 'day');
  const event = { type, plane, day };

  for (const field of OPTIONAL_NUMBER_FIELDS) {
    if (payload[field] !== undefined) event[field] = finiteNumber(payload[field], field);
  }
  for (const field of OPTIONAL_ID_FIELDS) {
    const value = payload[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) {
      throw new TypeError(`Runtime event ${field} must be a string or finite number`);
    }
    event[field] = value;
  }
  if (payload.data !== undefined) event.data = cloneJsonValue(payload.data);

  const queue = queueFor(world);
  if (queue.length === RUNTIME_EVENT_CAP) queue.shift();
  queue.push(event);
  return snapshot(event);
}

/** Return isolated snapshots in emission order without consuming them. */
export function peekRuntimeEvents(world) {
  return queueFor(world).map(snapshot);
}

/** Return isolated snapshots in emission order, then discard the transient queue. */
export function drainRuntimeEvents(world) {
  const queue = queueFor(world);
  const events = queue.map(snapshot);
  queue.length = 0;
  return events;
}
