# G2-PERF-H3.0 Terrain Color Write Report

- Verdict: **COLOR_WRITE_REDUCTION_PROVEN; FRAME_GAIN_UNPROVEN**
- Product baseline: P0.3 head `4960f88d6256d63a82c0172bb052c62ae5acb1f3`
- Candidate: cache the terrain type/fire tuple and skip unchanged Float32 color writes in `TerrainMesh.update()`.
- Raw captures and per-run source-hash manifests remain local under the ignored `reports/analysis/g2-h3/` tree; this report is the compact repository artifact.

## Scope and method

The change is limited to terrain vertex colors. Height writes, adaptive topology, art texture updates, Bridge dirty detection, and simulation behavior are unchanged. Each color update compares the incoming type/fire tuple with a render-owned snapshot, computes RGB only when that tuple changes, and queues row ranges only when the Float32 output color actually changes.

Two formal 512×320 expanse cases were measured on Edge 155.0.4283.45, Intel UHD Graphics 730 through ANGLE/D3D11, DPR 1, in headless mode. Each run used 120 warm-up and 300 measured product RAFs at the normal `setSpeed(2)` entry. Detailed runs followed B→A→A→B for both standard geography (H3-E1) and the fixed archipelago fixture (H3-E2). The low-perturbation frame comparison used one baseline and one candidate run per map. The physical display was not part of the measurement.

## Detailed ABBA results

`Color bytes queued` is the byte count represented by Three.js color attribute update ranges (Float32 components × 4 bytes). It describes bytes queued to the WebGL API, not confirmed driver transfer or VRAM traffic. `Scanned cells` is the total color dirty-region area examined by the diagnostic wrapper; the optimization does not remove the Bridge scan or shrink those input dirty boxes.

| Case | Order | Color dirty cells scanned | Color tuples changed | Color bytes queued |
| --- | --- | ---: | ---: | ---: |
| H3-E1 standard | B1 | 6,197,886 | 2,957 | 74,374,632 |
| H3-E1 standard | A1 | 6,035,790 | 2,850 | 861,972 |
| H3-E1 standard | A2 | 6,197,886 | 2,957 | 891,624 |
| H3-E1 standard | B2 | 6,518,362 | 3,097 | 78,220,344 |
| H3-E2 archipelago | B1 | 6,382,804 | 5,256 | 76,593,648 |
| H3-E2 archipelago | A1 | 6,224,548 | 4,937 | 1,513,428 |
| H3-E2 archipelago | A2 | 6,382,804 | 5,256 | 1,618,944 |
| H3-E2 archipelago | B2 | 6,223,606 | 5,144 | 74,683,272 |

Across the two standard-map baseline/candidate repeats, queued color bytes fell from 152,594,976 to 1,753,596 (**98.85%**). Across the two archipelago repeats, they fell from 151,276,920 to 3,132,372 (**97.93%**). The number of changed output tuples stayed in the same range, so the reduction comes from avoiding unchanged color writes, not suppressing legitimate color changes.

## Frame-level result

Low-perturbation p95 frame CPU was 55.3 ms baseline versus 52.0 ms candidate on H3-E1, and 55.4 ms baseline versus 56.2 ms candidate on H3-E2. RAF interval p95 remained about 50 ms in all four runs. The two maps do not show a consistent whole-frame gain; this work is accepted as a color-write reduction and is not presented as a proven FPS improvement.

## Fixed snapshot replay and correctness

The replay harness creates 24 fixed snapshot events on each 512×320 map, including sparse type/fire changes across broad Bridge bounds, local water/vegetation/height edits, RegionMask changes, elevation-profile toggles, art enable/disable, and a final `setWorld()` swap. Replay itself invokes no hydrology or RNG.

For every snapshot, the P0.3 baseline and candidate matched in all World arrays, Bridge dirty classification, and Stage geometry/texture output hashes. The baseline and candidate also matched after world replacement. In this sparse replay, the candidate queued 99.97% fewer color components while preserving the same rendered arrays. The per-event digest file and raw GPU/browser run captures remain local; this report contains only the aggregate replay result.

## Verification

- Render3D Bridge regression: 38 assertions passed, including one-cell type edits, repeat updates, fire threshold changes, and comparison with full color reconstruction.
- Existing related checks: Render3D 23 groups, M2-C 10 groups, M2-C2E geometry 13/13, and G2.3 terrain 6/6 passed.
- The M2-B vegetation suite has one legacy static-source-shape assertion that also fails on a clean P0.3 baseline; it expects an obsolete expression in `VegetationLayer.update()` and is unrelated to this terrain color change.
- Headless Edge detailed matrix: 8/8 ABBA runs passed at 300 frames each; low-perturbation comparison: 4/4 runs passed at 300 frames each.
- Fixed snapshot replay: 48/48 map events passed, plus both world-swap checks.

## Limits

The candidate still visits the incoming dirty rectangles and the detailed diagnostic scan contributes work to measured frame CPU. The frame-level comparison therefore remains conservative. Update-range byte counts are application/API-side metrics, not GPU transfer measurements. No performance budget or rendering cadence was changed.
