# M2-C2B0 Performance and Lifecycle Report

This report separates the current, serial `legacy` / `realm-style-v1` comparison from the older original-code baseline and from C2A.1's tree-assignment probe. These runs use different capture times and harnesses; neither the old rAF observations nor the current profile pair supports a global speedup claim.

## Current fixed-pose profile comparison

Reference system: Edge on ANGLE AMD Radeon 610M / D3D11, 1500×940 browser viewport, DPR 1. The runner adopted each World, disabled LOD, applied a fixed camera, warmed the product loop and required six stable frames before sampling. It recorded 120 CPU update samples and 121 asynchronous GPU timer-query samples per profile. Queries were drained, deleted, and disjoint-filtered; all six workload/profile cases retained 121 valid queries and zero invalid/disjoint results. CPU update, CPU submission, rAF, and GPU time are distinct measurements.

| Scenario | Triangles / draws (both profiles) | Legacy CPU median/p95 ms | v1 CPU median/p95 ms | Legacy GPU median/p95 ms | v1 GPU median/p95 ms | v1 GPU change vs same-run legacy |
|---|---:|---:|---:|---:|---:|---:|
| GOLDEN_A overview | 179,874 / 12 | 0.3 / 0.5 | 0.3 / 0.5 | 4.66272 / 5.09364 | 4.832 / 5.15024 | +3.6% |
| DENSITY_A overview | 282,411 / 12 | 0.4 / 0.6 | 0.4 / 0.6 | 5.46004 / 5.82392 | 5.83176 / 6.1336 | +6.8% |
| DENSITY_A forest, zoom 9 | 414,037 / 13 | 0.4 / 0.7 | 0.4 / 0.6 | 7.226 / 7.65204 | 7.64332 / 7.9772 | +5.8% |

Within each matched pair the geometry and draw count are unchanged. The current v1 timer results are slightly higher than same-run legacy; that is an observed difference for this device, not a universal performance bound. The fixed original-code C2A.1 GPU baseline was measured separately at another time: GOLDEN_A 5.49/5.96 ms, DENSITY_A 6.99/7.48 ms, and forest 8.00/8.36 ms (median/p95). Different runs, clocks, and harness conditions make those figures unsuitable for claiming a speed increase. Older rAF numbers also include historical double-render pressure in some probes and are not product frame-rate comparisons.

## Tree reassignment probe carried forward from C2A.1

The corrected product-loop probe measures `assignmentOnlyMs` while moving the camera; it is not a full-frame or GPU measurement. Its real case is the first 5,000 actual derived trees from DENSITY_A's 5,807-tree World. The 5k and 10k comparison cases are synthetic uniform grids.

| Workload | Assignment-only median/p95 ms | Interpretation |
|---|---:|---|
| Real DENSITY_A, 5k trees | 1.2 / 1.7 | Actual tree records and cell IDs |
| Synthetic uniform grid, 5k | 1.4 / 2.0 | Controlled presentation-only workload |
| Synthetic uniform grid, 10k | 2.5 / 3.2 | Stress fixture, not a World population |

The measured change removes `visible.concat(outside)` temporary arrays: 895,000 potential concat references at synthetic 5k and 1,790,000 at synthetic 10k over the corrected 179 observed moving assignments (the older double-render harness counted 935,000/1,870,000). LOD counts and budgets remain equal. CPU timings do not establish a stable speed gain; the demonstrated benefit is allocation reduction only. C2A.1 details are in [M2C2A1_FOREST_REPORT.md](M2C2A1_FOREST_REPORT.md).

## Lifecycle soak

The accepted B6 soak ran 6,000 frames over 20 states (legacy/v1 × LOD on/off × Mortal/Upper/Nether/Upper-window/Nether-window). Product instrumentation counted 7,789 updates and 7,789 renders; the World + `advanceState` digest stayed constant. It held at 53 geometries, 7 textures, and 13 programs across states; 21 post-GC samples peaked at 17,031,232 JS heap bytes, 1,924 DOM nodes, and 87 listeners. There were no collected console or runtime errors. The separate 600-frame lifecycle check also observed 600 actual update and render calls, preserved the World, and restored viewport dimensions.

The local Fast core and all three Heavy suites passed; final package and clean-clone results are recorded in [the final gate summary](reports/release/render3d-m2c2b0/summary/final-gates.json). Remote CI was not dispatched. Machine-readable evidence is in `reports/release/render3d-m2c2b0/summary/lifecycle-soak.json` and `visual-matrix.json`; the large, per-case evidence remains under ignored `reports/m2c2b0/`.
