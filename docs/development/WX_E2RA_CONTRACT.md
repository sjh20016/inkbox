# WX-E2R-a contract, increment 1

Base: E-INT b83fbfb96134f915b7056d56aab99b88e71953c5. Synchronous simulation remains authoritative.

`renderFrame(world,plane)` returns schemaVersion 1, worldGeneration, plane, committedDay, frameGeneration, entityCount and frozen entity values. Entity order follows `world.entities` for Canvas overlap. Numeric coordinates remain JS Number (Float64); `tx/ty` and `face` preserve Canvas gait. No World, Entity, Map or Set reference is emitted. The frame is reused within a committed day and invalidated explicitly after player command; world swaps create distinct generations.

`getWorldStatus` and `getEntityInspection` return bounded primitive facts and observation metadata. A missing or dead identity returns null once removed from the authoritative entity container.

`CommandBridge` currently forwards only caller-provided existing authoritative operations after checking the world generation. It does not implement an alternate simulation path. Caller must preserve the existing G7 transaction and UI feedback. Rejections from that path retain their existing UI behavior; the bridge itself reports stale-world separately.

`TerrainReadView` subscribes to existing five-layer terrainChanges journal. Its initial notification is metadata; actual terrain arrays remain behind the current World facade pending E2R-b. Overflow requests a full refresh. Dispose subscriptions at world swap.

Open debt before delivery: production consumers not yet connected; runtime read trace and browser equivalence pending. This is the first contract increment only.
