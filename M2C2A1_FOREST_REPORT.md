# M2-C2A.1 Dense Forest LOD CPU Probe

## Scope and result

The latest product-loop-only run supersedes the historical rAF values below. At the real 5k moving-forest view, assignment-only median/p95 is **1.2/1.7 ms**, total reassignment **1.7/2.3 ms**, and Host update **2.1/2.9 ms**. Synthetic moving 5k/10k assignment-only is **1.4/2.0 ms** and **2.5/3.2 ms**. These are bounded measurements; the 10k fixture is still synthetic and does not justify a larger LOD redesign.

The browser run separates real `DENSITY_A` vegetation from controlled synthetic fixtures. The real case uses the first 5,000 `deriveVegetation()` records from a 5,807-tree World, preserving numeric World `cell` IDs, positions, and derived sizes (1.4000–2.4999). Its camera is centered on the densest 16×16 tile, containing 140 trees. Synthetic 5k/10k fixtures replace only `VegetationLayer.trees`; they use unique presentation-only cells, a uniform grid, and sizes 0.72–1.32. They do not represent World vegetation counts or distribution.

I corrected the static fixture setup after the first report exposed stale full-World LOD stats. Each real mode now reinstalls the 5,000-tree subset, clears only the probe layer/stage's pending region rebuild flags, forces one upload/reassignment, and asserts both `layer.trees.length` and the LOD sum equal 5,000 on every measured frame. A new static-only 180-frame run passed those assertions. It produced LOD `[1024, 3976, 0]`, 1,313 budget demotions, zero assignment calls, and `Render3DHost.update()` median/p95 0.30/0.80 ms.

For the real subset's 180-frame rotate/pan/zoom pass, assignment-only median/p95 was 1.70/2.90 ms, above the 1.5 ms investigation guide. Projection + `chooseLOD` + requested-Map loop was 0.80/1.40 ms, partition 0.30/0.60 ms, budget assignment 0.50/0.90 ms, and CPU matrix writing 0.50/1.20 ms. The isolated `chooseLOD` microbenchmark averaged 50.3 ns per call, so it is not by itself the dominant measured cost. The stationary subset caused no repeated reassignments.

The synthetic before/after runs found one allocation site: `visible.concat(outside)` made 187 temporary arrays in each 180-frame dynamic pass, copying 935,000 references at 5k and 1.87 million at 10k. The budget loop now traverses the existing pooled arrays in the same visible-then-outside order. LOD counts and demotions match before and after, and the measured concat arrays are eliminated. CPU timings do not show a stable speedup: synthetic total-reassign median/p95 was 2.4/4.0 ms before and 2.3/4.2 ms after at 5k, and 4.5/6.6 ms before and 4.5/8.1 ms after at 10k. No CPU speedup is claimed; the change is an allocation reduction.

## Historical double-render pressure measurements

Edge 154, AMD Radeon 610M via D3D11, 1500×940 viewport, DPR 1. Each percentile is calculated from its own frame samples. `assignmentOnlyMs` is computed per sample as `max(0, totalReassignMs - matrixUploadMs)` before summarizing; phase p95 values are not added together. Values below are milliseconds as `median/p95`.

| Scenario | rAF | Host update | Total reassign | Assignment only | Projection + choose + Map | Partition | Budget | CPU matrix write |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Real DENSITY_A first 5k, static | 27.9/44.5 | 0.3/0.8 | — (0 calls) | — | — | — | — | — |
| Real DENSITY_A first 5k, rotate/pan/zoom | 27.9/61.2 | 2.8/4.4 | 2.2/3.6 | 1.7/2.9 | 0.8/1.4 | 0.3/0.6 | 0.5/0.9 | 0.5/1.2 |
| Synthetic uniform grid 5k, before | 27.4/66.8 | 3.0/4.8 | 2.4/4.0 | not captured | 1.1/1.9 | 0.4/0.9 | 0.5/0.7 | 0.0/1.4 |
| Synthetic uniform grid 5k, after | 27.6/66.7 | 2.9/4.9 | 2.3/4.2 | 2.1/3.3 | 1.0/1.9 | 0.4/0.9 | 0.5/0.8 | 0.0/1.3 |
| Synthetic uniform grid 10k, before | 22.3/72.3 | 4.9/7.1 | 4.5/6.6 | not captured | 1.5/2.5 | 0.6/0.8 | 1.0/1.5 | 1.5/2.5 |
| Synthetic uniform grid 10k, after | 27.8/77.8 | 4.9/8.5 | 4.5/8.1 | 3.3/5.3 | 1.6/3.0 | 0.6/1.0 | 1.0/1.6 | 1.5/2.5 |

The real dynamic case wrote matrices in 90 of 180 frames: 450,000 `setMatrixAt` calls and 270 `needsUpdate` marks. Synthetic dynamic 5k/10k wrote in 54/101 frames: 270,000/1,010,000 `setMatrixAt` calls and 162/303 marks. `matrixUploadMs` measures CPU `setMatrixAt`/`writeMatrices` work only; GPU transfer time is not measured. The write path still creates three `renderTrees` arrays per write (162/303 arrays in the synthetic passes), which remains visible in probe counts.

These historical runs manually called `update()` and `render()` while the application's animation loop remained active. Their rAF intervals include both paths and are stress observations, not stand-alone product frame-rate claims. The current runner observes the product loop without another update/render. Static means unchanged camera and no ordinary LOD reassignments; a separate forced-recompute micro-path in the synthetic runs is not presented as normal static frame cost.

## Original C2A product-loop GPU check

The user's performance concern was checked against the unchanged original commit `7164850ba28dccdecbb1d3db0e4aeaa0637db82c` in a separate checkout. The camera is applied after World adoption; its pixels-per-unit state is warmed before enabling LOD. The two overview views reproduce A0 exactly: GOLDEN_A 179,874 triangles / 12 draws, DENSITY_A 282,411 / 12. Host update median/p95 is 0.4/0.6 ms and 0.5/0.8 ms respectively. Asynchronous, non-disjoint GPU timer queries give 5.49/5.96 ms and 6.99/7.48 ms. These are measurements on the reference Edge/AMD machine, not a universal triangle limit or a promise for other hardware.

The real DENSITY_A forest at zoom 9 draws 414,037 triangles / 13 draws. A same-page old-shader / polynomial-hash / restored-old comparison gives GPU median/p95 8.00/8.36, 7.98/8.51 and 8.04/8.44 ms (121 valid queries per case, zero invalid). The alternative hash has no stable benefit, so the production shader remains unchanged. No density, resolution, DPR or LOD quality reduction was used. CPU submission time is reported separately from GPU execution time. Evidence: `reports/m2c2a1/perf-pressure/original-overview-fixed.json` and `original-product-frame-probe.json`.

## Corrected product-loop forest probe

`reports/m2c2a1/forest-product-loop/M2C2A1_FOREST_PROBE.json` passed all 180-frame modes, full World + advanceState equality, console/runtime checks and WebGL NO_ERROR. It observes exactly the application's existing update/render loop. The forced stationary micro-path is separate and is excluded from the ordinary frame measurements. Values below are median/p95 milliseconds.

| Fixture / motion | rAF | Host update | Assignment only | Total reassign | Projection + choose + Map | Partition | Budget | CPU matrix write |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Real 5k static | 11.1/16.8 | 0.5/0.7 | —, zero calls | — | — | — | — | — |
| Real 5k moving | 11.1/22.3 | 2.1/2.9 | 1.2/1.7 | 1.7/2.3 | 0.5/0.7 | 0.2/0.4 | 0.4/0.6 | 0.0/0.8 |
| Synthetic 5k moving | 11.1/27.7 | 2.1/3.2 | 1.4/2.0 | 1.6/2.6 | 0.6/1.0 | 0.3/0.6 | 0.4/0.6 | 0.0/0.9 |
| Synthetic 10k moving | 11.1/27.9 | 4.1/5.2 | 2.5/3.2 | 3.7/4.7 | 1.1/1.7 | 0.5/0.9 | 0.8/1.0 | 1.4/1.6 |

All moving cases have 179 observed assignments; real 5k writes matrices on 88 frames (440,000 instances / 264 update marks). Synthetic 5k/10k writes on 54/100 frames (270,000/1,000,000 instances and 162/300 marks). Known concat allocations remain zero. Static synthetic cases also have zero ordinary assignments. There is no same-harness before run for this corrected sampler, so lower values than the historical double-render run are not claimed as a production optimization gain. The only production optimization remains the eliminated concat allocation.

## LOD and purity

| Fixture | Requested LOD | Assigned LOD | Budget demotions | Concat references eliminated in dynamic pass |
|---|---:|---:|---:|---:|
| Real DENSITY_A first 5k, static | — | [1024, 3976, 0] | 1,313 | — |
| Real DENSITY_A first 5k, dynamic | [2475, 2525, 0] | [1024, 3976, 0] | 1,451 | 950,000 |
| Synthetic 5k | [2605, 2395, 0] | [1024, 3976, 0] | 1,581 | 935,000 |
| Synthetic 10k | [5143, 4857, 0] | [1024, 5000, 3976] | 6,073 | 1,870,000 |

Synthetic LOD counts and budget demotions match the before run. The complete DENSITY_A World + `advanceState` SHA-256 remained `62e4c87937af73ca8d68f5b0d420450c0d64544b0a5068d76edb8fab1e778b74` before and after the real subset and both synthetic fixtures. Synthetic records never enter World or simulation RNG. Opt-in `VegetationLayer.setLODProbeEnabled()` is disabled by default and reports projection/choice, partition, budget, CPU matrix write time, total reassignment, writes, update marks, and known concat-array elements avoided.

## Evidence and validation

- Original dynamic real + synthetic run: `reports/m2c2a1/forest-probe-final/M2C2A1_FOREST_PROBE.json`
- Corrected real static-only 180-frame follow-up: `reports/m2c2a1/forest-real-static-final/M2C2A1_FOREST_PROBE.json`
- Synthetic before: `reports/m2c2a1/forest-probe/M2C2A1_FOREST_PROBE_BEFORE.json`
- Synthetic after comparison: `reports/m2c2a1/forest-probe-after/M2C2A1_FOREST_PROBE.json`
- Runner: `scripts/inkbox-render3d-m2c2a1-forest.mjs`
- Focused `npm run test:render3d:m2c2a` passed all eight groups after the source change, including LOD budget/identity/region and 600-day World/RNG equivalence. The original full browser run reported no collected runtime/log errors. The corrected static follow-up additionally collected zero `console.error` calls and returned WebGL `NO_ERROR`; this console/GL check does not retroactively cover the earlier dynamic run.

The source change removes only the measured concat allocation. LOD thresholds, hysteresis, budget semantics, World generation, and simulation RNG remain unchanged. The 5k/10k synthetic assignment-only p95 remains above the guide, with projection/Map, partition, budget, and CPU matrix work still contributing; this evidence does not justify broader restructuring.
