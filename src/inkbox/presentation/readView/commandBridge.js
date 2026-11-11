import { worldGeneration, invalidateReadView } from './index.js';

// The caller supplies the established authoritative operation, including all
// G7 validation, History, UI receipts and RNG. No alternate mutation path.
export class CommandBridge {
  constructor(getWorld) { this.getWorld = getWorld; }
  dispatch(command, execute) {
    const world = this.getWorld();
    if (!world || command?.worldGeneration !== worldGeneration(world))
      return Object.freeze({ ok: false, reason: 'stale-world' });
    let value;
    try { value = execute(); }
    finally { invalidateReadView(world); }
    return Object.freeze({ ok: true, value });
  }
}
