import { getCommittedFrame, assertLegacyReadAllowed, publishAfterCommand } from './committedStore.js';
import { expandSandboxMap } from '../../ui/worldCreation.js';

export function expandCommittedMap(all = false) {
  if (!this.committedAuthorityAvailable()) return false;
  const result = expandSandboxMap(this, all);
  this.publishCommittedEdit();
  return result;
}

// Only boundary routing lives here. The existing Sandbox/domain operations
// retain authority; these methods never project a DTO back into a World.
export const committedSandboxBoundary = Object.freeze({
  getLegacyWorld() { assertLegacyReadAllowed(this.world); return this.world; },
  committedAuthorityAvailable() {
    try { assertLegacyReadAllowed(this.world); return true; } catch { return false; }
  },
  publishCommittedEdit() {
    if (getCommittedFrame(this.world) && !this.commandBridge.executing) return publishAfterCommand(this.world);
    return null;
  },
  preparePersistence() {
    assertLegacyReadAllowed(this.world);
    this.cancelPointerInput?.(); this.render3d?.cancelStroke?.();
  },
  dispatchTransit(request) {
    if (!this.committedAuthorityAvailable()) return { ok: false, reason: 'world-unavailable' };
    const result = request();
    if (result?.ok) {
      this.publishCommittedEdit();
      this.qol.markDirty('intervention');
      this.transitPanel?.refresh(true);
    }
    return result;
  },
});
