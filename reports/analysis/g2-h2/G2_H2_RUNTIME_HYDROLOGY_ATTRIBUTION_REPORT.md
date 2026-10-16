# G2 H2 Runtime Hydrology Attribution Report

- Status: **DOWNSTREAM_RENDER_DOMINANT + ARCHIPELAGO_FIXTURE_VALID**
- Product baseline: 74934a8b1360af9007c69935d5becdf8f9809872 on analysis/g2-h2-runtime-hydrology-attribution-luna
- Profiled: 12/12 runs; complete matrix
- Source commit: 74934a8b1360af9007c69935d5becdf8f9809872; seed: 673231; map size: 512×320; speed entry: setSpeed(2)
- Browser: Edg/155.0.4283.45
- Active WebGL renderer: ANGLE (Intel, Intel(R) UHD Graphics 730 (0x00004692) Direct3D11 vs_5_0 ps_5_0, D3D11)
- GPU devices detected: Intel(R) UHD Graphics 730; Microsoft Basic Render Driver
- Viewport / DPR: 1416×808 @ DPR 1
- Measurement: 120 warm-up product RAFs, 300 measured product RAFs per run; both timing-only and detailed diagnostic modes are retained.

## Method and scope

The game booted through `inkbox.html`; scenarios used the product `newWorld("expanse", seed)` path and the official `setSpeed(2)` entry. The application’s RAF called its regular `update(dt)` and `render(now)` methods. Edge 155 ran in headless mode with hardware GPU acceleration (`gpu:true`); background renderer/timer throttling was disabled to keep product RAF scheduling stable in this managed desktop session. Recorded frames were visible and focused. The verdict compares mean direct hydro CPU with mean render CPU on the same Three hydrology frames, avoiding a comparison of per-call cost against all-frame averages. The run did not call `update` manually, adjust `dt`, alter the hydro accumulator, change the hydro cadence, or disable scene work.

Low-perturbation runs time the official update/render wrappers and optional hydrology phases, and read the existing PlaneStage profile. Detailed runs additionally clone `height`, `water`, and `type` immediately before each hydrology call, count changed cells after the timed call, copy bridge dirty regions, time individual layer methods, and wrap WebGL upload calls. Snapshot and post-call diff time is reported separately from `stepHydrologyMs`; detailed frame CPU therefore includes added diagnostic work.

The complex-water fixture modifies a single generated `World` instance after standard generation. It is an analysis fixture only. It creates curved straits, a branching inlet, a lagoon and a grouped island chain from deterministic geometric fields. It does not change default world generation or the save schema.

## Matrix results

| Case | Renderer / map | Runs | Hydro step p95 / max (ms) | Hydro frame CPU p95 (ms) | Non-hydro frame CPU p95 (ms) | Frame >16.7 / 33.3 / 50 ms (%) | RAF interval p95 (ms) | Layer update p95 (ms) | WebGL submit p95 (ms) | Upload source p95 (bytes) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| H2-E1 | three / standard | 2 | 19.50 / 21.10 | 114.30 | 24.10 | 23.83 / 19.17 / 18.17 | 83.50 | 48.40 | 19.60 | 1918546136.00 |
| H2-E2 | canvas / standard | 2 | 17.10 / 17.80 | 41.10 | 17.90 | 18.67 / 6.00 / 0.50 | 33.30 | — | — | 0.00 |
| H2-E3 | three / archipelago | 2 | 18.50 / 20.10 | 95.10 | 16.70 | 20.00 / 16.00 / 15.83 | 66.80 | 38.30 | 15.90 | 1910929272.00 |
| H2-E4 | canvas / archipelago | 2 | 18.00 / 19.00 | 42.00 | 16.60 | 15.50 / 6.00 / 0.33 | 33.30 | — | — | 0.00 |

## Instrumentation perturbation check

Each case has one low-perturbation timing-only run plus two detailed runs. Detailed runs add field snapshots/diffs and per-layer/WebGL wrappers; this table shows their frame-tail movement rather than folding diagnostic overhead into the timing-only baseline. Negative deltas reflect run-to-run variation, not a performance benefit from instrumentation.

| Case | Timing-only frame p95 | Detailed frame p95 | Detailed delta | Timing-only hydro step p95 (ms) |
| --- | ---: | ---: | ---: | ---: |
| H2-E1 | 72.40 | 92.10 | 19.70 | 17.10 |
| H2-E2 | 29.70 | 34.70 | 5.00 | 19.80 |
| H2-E3 | 83.80 | 76.50 | -7.30 | 21.50 |
| H2-E4 | 30.00 | 33.80 | 3.80 | 16.80 |

WebGL `gpuUploadBytes` is the aggregate source-array byte length observed at wrapped upload calls (or the explicit `bufferData` size), not a driver-confirmed transfer count; range-limited calls can make it an upper-bound estimate.


### Per-hydrology-call changes (detailed runs)

| Case | water changed p50 / p95 | height changed p50 / p95 | type changed p50 / p95 | wet/dry transitions p50 / p95 | water bbox cells; bbox/change | height bbox cells; bbox/change | type bbox cells; bbox/change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| H2-E1 | 68945.00 / 68969.00 | 66110.00 / 66478.00 | 67.00 / 84.00 | 0.00 / 2.00 | 163840.00; 2.38 / 2.38 | 163840.00; 2.48 / 2.49 | 158887.82; 2347.97 / 2857.91 |
| H2-E2 | 68864.00 / 68939.00 | 66419.00 / 66644.00 | 78.00 / 101.00 | 0.00 / 1.00 | 163840.00; 2.38 / 2.38 | 163840.00; 2.47 / 2.48 | 159156.23; 2057.53 / 2413.93 |
| H2-E3 | 87929.00 / 90035.00 | 64044.00 / 64490.00 | 107.00 / 167.00 | 2.00 / 12.00 | 163840.00; 1.86 / 1.97 | 163840.00; 2.56 / 2.57 | 155417.87; 1459.13 / 1984.53 |
| H2-E4 | 85251.00 / 88063.00 | 64011.00 / 64125.00 | 123.00 / 319.00 | 3.00 / 47.00 | 163840.00; 1.92 / 2.04 | 163840.00; 2.56 / 2.58 | 156275.08; 1281.59 / 1620.49 |

### Hydrology sub-phase timings (detailed runs)

| Case | Sea refill p50 / p95 | River maintenance p50 / p95 | Water flow + evaporation p50 / p95 | Erosion p50 / p95 | Thermal p50 / p95 | Dirty flush p50 / p95 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| H2-E1 | 1.00 / 1.90 | 0.20 / 0.50 | 4.10 / 5.60 | 3.20 / 4.00 | 2.60 / 3.40 | 3.50 / 5.40 |
| H2-E2 | 0.90 / 1.70 | 0.20 / 0.50 | 3.90 / 5.00 | 3.30 / 3.80 | 2.40 / 3.10 | 2.90 / 4.30 |
| H2-E3 | 0.90 / 1.30 | 0.20 / 0.30 | 4.50 / 5.60 | 3.40 / 4.00 | 2.70 / 3.60 | 4.20 / 5.60 |
| H2-E4 | 0.80 / 1.10 | 0.20 / 0.50 | 4.40 / 5.50 | 3.40 / 4.40 | 2.40 / 3.10 | 3.70 / 4.70 |

## Topology comparison

| Map | Water coverage | Coastline edges | Island count* | Medium islands | Inland seas | Largest landmass | Wet vegetation frontier | Hydro-sensitive coast |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| standard | 41.98% | 3600.00 | 2.00 | 1.00 | 0.00 | 99.67% | 4.00 | 2357.00 |
| archipelago | 58.32% | 3976.00 | 12.00 | 9.00 | 3.00 | 59.21% | 1640.00 | 1733.00 |

* Island count uses 4-neighbor components, excludes the largest landmass and ignores components smaller than the stated minimum in `summary.json`; medium islands are 0.1%–4% of map cells. Coastline length counts shared land/water cell edges. Wet vegetation frontier counts vegetated land cells directly touching water.

## Frame-level tail evidence

The frame table below uses detailed runs. A “hydrology frame” contains at least one formal `stepHydrology()` call in that same official RAF callback. Stage profile fields are inclusive group timings; `terrainUpdateMs` includes terrain scalar/mesh/side work, and `waterUpdateMs` includes water and surface-field work. `layerUpdateMs` is summed across active PlaneStages and excludes bridge scanning. Individual terrain-side and surface-field timers are nested diagnostics and must not be added twice.

| Case | Hydrology frames | Frame CPU p95 hydro / other | Hydro step p95 | Render CPU p95 hydro | Bridge p95 hydro | Terrain p95 hydro | Water p95 hydro | Vegetation p95 hydro | Layer total p95 hydro |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| H2-E1 | 109 | 114.30 / 24.10 | 19.50 | 88.20 | 3.30 | 17.60 | 25.30 | 24.70 | 63.50 |
| H2-E2 | 68 | 41.10 / 17.90 | 17.10 | 18.40 | — | — | — | — | — |
| H2-E3 | 95 | 95.10 / 16.70 | 18.50 | 71.80 | 2.10 | 15.90 | 25.90 | 14.80 | 53.10 |
| H2-E4 | 67 | 42.00 / 16.60 | 18.00 | 17.90 | — | — | — | — | — |

### Slowest measured frames

| Case / run | Index | Hydrology steps | Hydro step CPU | Frame CPU | Update CPU | Render CPU | Bridge scan | Terrain group | Water group | WebGL submission | Upload source bytes/calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| H2-E3-detailed-r2 | 264 | 1 | 20.10 | 220.60 | 24.80 | 195.80 | 2.30 | 92.80 | 18.60 | 68.20 | 1879224584.00 / 1263.00 |
| H2-E3-detailed-r2 | 5 | 1 | 16.40 | 168.20 | 26.30 | 141.80 | 2.00 | 43.00 | 55.90 | 20.00 | 1913303256.00 / 1284.00 |
| H2-E1-detailed-r2 | 2 | 1 | 17.00 | 165.90 | 25.30 | 140.50 | 2.20 | 55.40 | 44.10 | 17.40 | 1910681864.00 / 1287.00 |
| H2-E1-detailed-r1 | 5 | 1 | 17.20 | 159.50 | 29.20 | 130.10 | 1.80 | 42.90 | 42.50 | 17.90 | 1915924744.00 / 1291.00 |
| H2-E3-detailed-r1 | 2 | 1 | 17.10 | 158.10 | 27.30 | 130.80 | 1.70 | 44.40 | 43.30 | 20.50 | 1913550712.00 / 1286.00 |
| H2-E1-detailed-r2 | 4 | 1 | 19.10 | 120.50 | 26.90 | 93.60 | 2.20 | 24.00 | 30.80 | 17.10 | 1923789016.00 / 1292.00 |
| H2-E1-detailed-r1 | 17 | 1 | 15.80 | 117.30 | 22.50 | 94.80 | 1.60 | 21.50 | 36.90 | 17.90 | 1910681816.00 / 1282.00 |
| H2-E1-detailed-r2 | 11 | 1 | 21.10 | 117.10 | 27.20 | 89.90 | 2.00 | 25.30 | 19.60 | 18.60 | 1902817496.00 / 1276.00 |
| H2-E1-detailed-r2 | 168 | 1 | 21.10 | 114.30 | 37.00 | 77.20 | 7.30 | 12.30 | 12.60 | 21.30 | 1915924696.00 / 1286.00 |
| H2-E1-detailed-r2 | 27 | 1 | 19.50 | 114.00 | 26.80 | 87.20 | 1.80 | 17.00 | 25.30 | 23.50 | 1918546136.00 / 1288.00 |
| H2-E1-detailed-r1 | 242 | 1 | 16.90 | 110.40 | 22.20 | 88.20 | 1.90 | 15.10 | 15.10 | 22.30 | 1913303256.00 / 1284.00 |
| H2-E1-detailed-r2 | 101 | 1 | 15.40 | 107.90 | 20.10 | 87.80 | 2.20 | 16.00 | 12.10 | 27.80 | 1923789016.00 / 1292.00 |

## Findings

- **H2-BQ1 — water/surface field pressure:** On hydro frames, p95 surfaceField 3.40→3.40 ms (Δ 0.00); waterUpdate group p95 25.30→25.90 ms. The measured delta is small; coastline length alone did not produce a large surface-field cost.
- **H2-BQ2 — vegetation threshold changes:** No increase in measured re-derivation cost or frequency: the detailed samples contained 109/600 E1 hydro frames and 95/600 E3 hydro frames, while VegetationUpdate p95 was 24.70→14.80 ms. Type changes p95 rose 84.00→167.00 and the frontier rose 4.00→1640.00 cells, but both maps already re-derive vegetation on hydro frames because height changes each step.
- **H2-BQ3 — >33.3 ms frame risk:** 33.3 ms frame-CPU rate: standard 19.17%, archipelago 16.00%; canvas comparison: 6.00% vs 6.00%. The central-continent case had the higher threshold rate in this sample. E1 terrain/vegetation p95 was 17.60/24.70 ms versus E3 15.90/14.80 ms, while the water group differed by only 0.60 ms; added coast length alone did not predict tails.
- **H2-BQ4 — upper-bound fixture value:** Yes as a deterministic stress fixture. Its higher water coverage, longer coast, multiple medium land components, and smaller dominant landmass extend the standard-map sample; it is not yet a measured worst-case bound for all future maps.

### C1–C3: attribution and candidate world type

- Center-continent long-frame attribution: DOWNSTREAM_RENDER_DOMINANT; across Three hydro frames, mean direct step CPU was 15.50 ms and mean render CPU was 63.12 ms (4.07×). On center-continent E1, direct stepHydrology p95 was 19.50 ms per call, while render CPU p95 on hydro frames was 88.20 ms and summed PlaneStage layer-update p95 was 63.50 ms. Canvas E2 render CPU p95 on hydro frames was 18.40 ms despite a similar hydro step p95 of 17.10 ms; Three’s terrain/water/vegetation updates and WebGL submission explain most of that gap. The slow-frame rows retain direct hydro, update/render, bridge, layer, and submission times for each tail.
- Complex-island pressure distribution: The fixture raises coast edges 3600.00→3976.00 and wet-vegetation frontier 4.00→1640.00 cells. Per hydro call, water changes p95 68969.00→90035.00 cells. On hydro frames, water-update p95 is 25.90 ms and vegetation p95 is 14.80 ms.
- Future map-type recommendation: Keep it as a test fixture now. Treat it as a future start-world candidate only after the measured tail pressure is addressed; this H2 branch does not promote it to a product preset.

### C4: next optimization entry points

1. **Terrain mesh rebuild and GPU buffer locality** — evidence: terrain group peaked at 92.80 ms in a measured slow frame; E1 height dirty bounds span all 163,840 cells; correctness risk: high: height/type geometry must stay correct across incremental updates; complexity: high; priority: 1.
1. **Hydrology-triggered vegetation re-derivation** — evidence: E1 vegetation p95 24.70 ms on hydro frames; the archipelago fixture has 1,640 vegetated shoreline cells; correctness risk: medium: instance membership and shoreline thresholds; complexity: medium; priority: 2.
1. **Hydrology full-grid pass profiling/optimization** — evidence: E1 stepHydrology p95 19.50 ms; water flow, erosion, thermal, and dirty flush are measurable sub-phases; correctness risk: high: water, erosion, type threshold, and dirty-flush semantics; complexity: medium; priority: 3.

## Recalculation and provenance

The 12 raw per-frame JSON files remain in the local run bundle and are not included in this public branch. The published branch contains the recalculated summary, run manifest, and screenshots. Recalculate locally with node scripts/inkbox-g2-h2-recalculate.mjs; the local raw JSON files retain source SHA-256 values, browser/device metadata, scenario setup, and timing mode.

Generated 2026-10-16T01:53:10.399Z.
