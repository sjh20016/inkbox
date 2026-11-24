# E2R-a.2 read surfaces

Baseline: accepted E-M2 published `61646341e00452417f04bc351afe8884b2ef7ddf`, tree `f2c810610caf742c67780433d3008d93dad139b8`. Formal product keeps its variable dt. This package establishes a partial observation boundary, not permission to run the full game asynchronously.

| Producer / fields | Mutation owner | Complete boundary | Consumer | Legacy fallback / proof |
| --- | --- | --- | --- | --- |
| CommittedViewStore / entity order, HP, positions, level, faction, appearance | native Life / powers | whole advanceWorld or whole admitted gesture | Canvas UnitsLayer.drawEntities and Three deriveEntities | unmanaged fixtures only; poisoned managed World test |
| Store / faction colors, creature form, wanling, biyi pairs, wraith DTOs | original faction / wanling / relation systems | same shared generation | Three entity derivation | no Map, Entity, mutable typed array or World in graph; no forced managed refresh |
| TerrainReadView / height, water, type, veg, qi; map access stage | original setters and terrain journal | all planes built before front swap | real Camera pick/clamp/visibleRect/canAccess and Canvas entity elevations | initial/overflow full layer projection, dirty layers COW; retained frames immutable |
| Store / status and entity inspection | native simulation and commands | same atomic publication | getWorldStatus, getEntityInspection, getCommittedQuery | old frozen query while step or fault; disposed references never fall back |
| Legacy World / settlement, social history, places, terrain/disaster details | original domain systems | legal complete boundary only | settlement Query, G1, S1, ObserveEcho, Journal, rail callbacks | explicit guard and no callback writes while busy/fault; not DTO migrated |
| Legacy transient event buffers | original runtimeEvents | original pre-advance PresentationStage drain | Stage, combat/environment/observeEcho | original order and count preserved; Store never drains events; main legacy frame is blocked while busy/fault |
| Original tool parameters + serializable descriptor | original G7, applyTool, History, TerrainStroke | entire actual operation, including History.end / journal outcome | Canvas pointer and Three power/undo paths | ordered receipt; stale/busy refusals do not run operation; failures retain front and fault |
| Full v11 World/runtime | original save module and G8 capture | complete authority only | save/export/autosave/load/import | preview canceled for manual persistence; autosave defers during edit; runtime capture refuses uncommitted sculpt |

No blanket World-import ban is used. Strong negative tests apply to the migrated consumers. Legacy borrowed references are not safe across a transaction; see REMAINING_DEBT. Existing E1C Life.grid and temporary lookup pass are untouched.
