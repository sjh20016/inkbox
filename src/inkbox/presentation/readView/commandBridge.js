import { worldGeneration, invalidateReadView } from './index.js';
import { getCommittedFrame, assertLegacyReadAllowed, publishAfterCommand, abortCompleteStep } from './committedStore.js';

function serializable(value, seen = new Set(), depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 8 || seen.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false;
  seen.add(value);
  const keys = Object.keys(value);
  const ok = keys.length <= 4096 && keys.every(key => !['__proto__', 'prototype', 'constructor'].includes(key)
    && serializable(value[key], seen, depth + 1));
  seen.delete(value);
  return ok;
}

// The caller supplies the established authoritative operation, including all
// G7 validation, History, UI receipts and RNG. No alternate mutation path.
export class CommandBridge {
  constructor(getWorld) { this.getWorld = getWorld; this.sequences = new WeakMap(); this.executing = false; }
  create(type, payload = {}) {
    const world = this.getWorld(), frame = getCommittedFrame(world);
    return Object.freeze({ schemaVersion: 1, worldGeneration: worldGeneration(world),
      seq: (this.sequences.get(world) || 0) + 1, issuedAtCommittedDay: frame?.committedDay ?? world?.day,
      type, payload: JSON.parse(JSON.stringify(payload)) });
  }
  dispatch(command, execute) {
    const world = this.getWorld();
    if (!world || command?.worldGeneration !== worldGeneration(world))
      return Object.freeze({ ok: false, reason: 'stale-world' });
    try { assertLegacyReadAllowed(world); }
    catch { return Object.freeze({ ok: false, reason: 'world-unavailable' }); }
    if (this.executing) return Object.freeze({ ok: false, reason: 'command-in-progress' });
    const prior = this.sequences.get(world) || 0, frame = getCommittedFrame(world);
    // Generation-only callers retain their synchronous compatibility contract.
    // Product pointer commands use the complete serializable descriptor below.
    const typed = command.schemaVersion !== undefined;
    if (typed && (command.schemaVersion !== 1 || !Number.isSafeInteger(command.seq)
      || !/^[a-z][a-z0-9-]{0,63}$/.test(command.type || '') || !serializable(command.payload)))
      return Object.freeze({ ok: false, reason: 'invalid-command' });
    if (typed && command.seq !== prior + 1) return Object.freeze({ ok: false, reason: 'out-of-order' });
    if (typed && command.issuedAtCommittedDay !== (frame?.committedDay ?? world.day))
      return Object.freeze({ ok: false, reason: 'stale-commit' });
    if (typeof execute !== 'function') return Object.freeze({ ok: false, reason: 'missing-operation' });
    this.executing = true;
    this.sequences.set(world, prior + 1);
    let value;
    try {
      value = execute();
      if (value && typeof value.then === 'function') throw new TypeError('Authoritative command must complete synchronously');
      if (this.getWorld() !== world) throw new Error('Command replaced its authoritative World');
      if (frame) publishAfterCommand(world);
      else invalidateReadView(world);
      const committed = getCommittedFrame(world);
      return Object.freeze({ ok: true, value, seq: prior + 1, worldGeneration: command.worldGeneration,
        commitSequence: committed?.commitSequence ?? null, committedDay: committed?.committedDay ?? world.day });
    } catch (error) {
      // History does not roll back every power. Never publish a partly executed
      // command, and require explicit replacement/recovery of the authority.
      if (frame) abortCompleteStep(world);
      throw error;
    } finally { this.executing = false; }
  }
}
