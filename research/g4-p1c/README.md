# G4-P1C ocean connectivity prototype

This directory contains a research-only hydrology rule. It is not imported by the product loop and does not change `legacy-v1`, the frozen P1A oracle, or `static-sea-v2`.

## Rule identity and semantics

The prototype identity is `ocean-connected-prototype-v1`. It uses four-neighbor flood fill from every world-edge cell whose height is strictly below `SEA_LEVEL`. A cell is static ocean only while it belongs to that connected mask. A world with no below-sea edge cell has no static ocean source. Corner cells are ordinary seeds; diagonal contact alone does not connect.

At the start of the next four-day hydrology tick after a topology event, the mask is rebuilt. Newly connected cells are normalized to the sea plane. Newly disconnected cells keep their water and then take part in normal flow, evaporation, erosion, and thermal erosion. River base flow is still supplied by the existing `maintainRivers()` function.

The cache and its buffers live in a `WeakMap`, not on `World` and not in saves. Call `prepareConnectedOcean(world)` for a newly created or restored mortal World. After a terrain edit, compare the old and new heights and call `notifyTerrainMutation(world, previousHeights, reason)` with a `Map<cellIndex, oldHeight>`. It invalidates the mask only if a cell crossed the strict `< SEA_LEVEL` boundary. Call `stepHydrologyConnectedOcean(world, 4)` at the hydrology boundary. Height-layer replacement or a true dimensions change is detected automatically; water-only changes do not invalidate the mask.

This is an adapter, not a product integration. Any future integration must wire all height mutation paths, including brush transactions, undo, both Canvas and Three sculpting, hydrology erosion, world creation, and restore.

## Reproduce

From the repository root on the research branch:

```powershell
node scripts/inkbox-g4-p1c-scenarios.mjs
node scripts/inkbox-g4-p1c-bench.mjs
```

The scenario runner exercises actual `World`, terrain, water, river, save, brush-history, and map-progress code. The benchmark runner compares V3 and P1C on identical generated Worlds at 200×128, 288×180, and 512×320. Machine-readable outputs go to `reports/analysis/g4/g4-p1c/evidence/`.
