# WX-E2R-a contract, increment 1

Base: E-INT b83fbfb96134f915b7056d56aab99b88e71953c5. Synchronous simulation remains authoritative.

`renderFrame(world,plane)` returns schemaVersion 1, worldGeneration, plane, committedDay, frameGeneration, entityCount and frozen entity values. Entity order follows `world.entities` for Canvas overlap. Numeric coordinates remain JS Number (Float64); `tx/ty` and `face` preserve Canvas gait; exact `hp/maxHp` retain the injury bar. Canonical `entityKey` includes the plane. No World, Entity, Map or Set reference is emitted. The frame is reused within the same committed day/revision and invalidated explicitly after bridge commands; world swaps create distinct generations. Mismatched plane queries are rejected.

`getWorldStatus` and `getEntityInspection` return bounded primitive facts and observation metadata. A missing or dead identity returns null once removed from the authoritative entity container.

`CommandBridge` currently forwards only caller-provided existing authoritative operations after checking the world generation. It does not implement an alternate simulation path. Caller must preserve the existing G7 transaction and UI feedback. Rejections from that path retain their existing UI behavior; the bridge itself reports stale-world separately.

`TerrainReadView` subscribes to the existing five-layer terrainChanges journal. Initial/overflow notifications COPY the five layers; subsequent notifications copy changed rectangles. It does not copy terrain every render frame or own a second authority. Actual Canvas/Three terrain upload still uses the registered World facade pending E2R-b. Dispose subscriptions at world swap.

Production Canvas/Three canonical entity consumers, HUD seed Query, settlement/house Query and Canvas applyTool bridge are connected. Runtime opt-in projection tracing and complete same-command/undo World/all-RNG/v11 proofs are recorded separately. Actual browser/retained-memory performance acceptance remains required. Source read guards are restricted to migrated paths; other World readers remain explicit debt.
