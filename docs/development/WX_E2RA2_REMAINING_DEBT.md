# Production async prerequisite: NOT SATISFIED

The migrated Frame, status/entity Query, entity render consumers and Camera geometry are frozen commit readers. This does not cover the whole game.

- Canvas terrain, settlements/sites/territory/war/fire/wanling/FX/realm overlays and picking helpers still have authority reads.
- Three ElevationField, Stage/Scene/terrain/settlements/assets/geography and parts of input/preview still use World. Only entity derivation is migrated. Sculpt preview intentionally uses the established mutable authority until release.
- G1 current identity/candidates/resolve borrow entity/World references after legal-boundary validation. Existing references must not survive a yield. Guards refuse new legacy access but cannot revoke a previously borrowed JavaScript reference.
- Settlement/social/disaster/history queries, story navigation, watch/journal and observer details are legal-boundary legacy queries. Observation actions that actually write still use original domain commands and publish afterward.
- Stage and short-lived event consumers retain their synchronous pre-advance drain. A future backend needs a committed event packet/watermark with exactly-once order; this package does not pretend that projection already exists.
- Dirty terrain COW copies each changed whole layer. Query and Frame each allocate entity records. Measured allocation and latency determine value; no FPS improvement is promised.

Full Sandbox / Render3DHost must not receive an in-flight draft. Any resumable prototype is limited to a private authority and an isolated Canvas/actual Three entity demo fed only committed facts. Fixed dt=3 remains research-only L2 relative to the variable-dt product; no default entry switch is authorized here.
