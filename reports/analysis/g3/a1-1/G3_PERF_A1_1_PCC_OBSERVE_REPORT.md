# G3-PERF-A1.0 · A1-1 PCC observe

## Verdict

`A1_1_BLOCKED` — correctness probes passed, but the shadow classifier exceeds the task's 3 ms stop line by a wide margin. The 60-step quick sequence is the maximum work performed for this phase. Per the task sequence, A1-2 was not run and no terrain-index candidate is included.

## Candidate identity and scope

- Base product: H3 commit `bfabe00e3c0865721e5c426c4915a1f879498714`.
- `WorldRenderBridge.changes(observer)` builds five exact typed index lists and a unique changed-cell list inside the existing World scan. It calls the observer before committing Bridge snapshots, then commits snapshots from those lists. There is no second full-world scan to build the lists.
- `changes()` with no observer retains the original return shape and update order. Exact lists are allocated lazily and reused only while observation is enabled.
- `PlaneStage.pcc.observe` defaults to `false`. Enabling it creates a render-owned `PresentationChangeLayer`; disabling it disposes the shadow arrays. The observer writes no World fields, renderer buffers, camera state, RNG, or clock state. Rendering still consumes the legacy dirty regions.
- `PlaneStage.pcc.waterStepId` accepts an explicit authoritative hydrology step id. It defaults to `null`; the implementation never treats RAF or `world.revision` as a water step. The seeded map benchmark supplied explicit step ids. Without a step id, T_max forced synchronization is recorded as unavailable.
- The shadow initialization performs a one-time map pass when observation is enabled. Each observed frame then classifies exact sparse changes and their local terrain-shade dependencies.

## Correctness evidence

The direct suite reports 22 assertions. It covered micro-height exact changes below ε_geo, cumulative drift, a diagonal flip, wet/dry and depth-band crossings, simultaneous fields at one cell, type-only, untouched veg-only and water-only edits, old snapshot visibility during the callback, 12 RAF updates at one water-step id, T_max forcing at step 12, repeated flag transitions, hidden-stage updates, visible restoration, and `setWorld` reset.

For standard and archipelago maps (512×320, seed 673231, generationVersion 2, expanse preset, WARM30), the candidate and observer-off twin runs had identical height/water/type/veg/fire hash sequences, save-serialization hashes, and dirty-region outputs. The 60 rows for each map matched the archived A0R counts for exact height/water/type changes, wet/dry crossings, A0 depth-band crossings, diagonal flips, and vegetation terrain eligibility. The exact five-channel lists also matched a brute-force per-cell oracle on every tested frame. A small paired `PlaneStage` test compared all geometry attribute/index hashes and draw ranges with observation on and off, including a hide/restore cycle.

The observer has no RNG reference and does not call a random API. A paired Mulberry32 control stream remained identical; this is not a full simulation-RNG integration test. The 600-step sequence, actual save decode/reload, Region switch, and a full-map independent shade-output oracle were not run because the cost gate was already exceeded.

## Cost and memory

Local measurements use Node `v24.11.1` on Windows 10 build 19045, Intel Core i3-12100 (8 logical CPUs). Edge `155.0.4283.45` was installed but not used; these were Node-only runs, so GPU, DPR, and renderer measurements are not applicable. Times are local references, not portable performance claims.

| Map | Baseline Bridge P50 | Observed Bridge scan P50 | Classification P50 / P95 | Bridge + classification P50 / P95 | PCC retained buffer capacity |
|---|---:|---:|---:|---:|---:|
| Standard | 1.44 ms | 3.12 ms | 19.42 / 31.42 ms | 26.34 / 40.26 ms | 20,579,076 bytes |
| Archipelago | 1.47 ms | 3.36 ms | 19.89 / 29.90 ms | 28.34 / 39.70 ms | 20,919,044 bytes |

The observer's additional JavaScript heap retained after GC was 1,532,304 bytes for standard and 1,806,232 bytes for archipelago. Bridge exact-list buffers retained 1,870,848 and 1,608,704 bytes respectively; cumulative Bridge typed-array allocation during the sequence was 3,571,456 and 3,047,168 bytes. PCC capacity includes the shadow fields and retained T_max queues. Exact per-frame GC allocation churn was not isolated from the Node runtime; list capacity, cumulative typed-array growth, retained PCC capacity, and post-GC heap delta are recorded instead.

Classification P50 is about 6.5× the stop limit on both maps. The task requires stopping when this cost is stably above 3 ms, so no 600-step run or later implementation phase was started.

## Reproduction

From the H3 source root:

```powershell
$env:STEPS = '60'
$env:EXTENDED = '0'
node --expose-gc scripts/inkbox-g3-pcc-observe-test.mjs
$env:DIR = 'reports/analysis/g3/a1-0/rerun-windows'
node scripts/perf-a0r/verify.mjs
```

Both commands exited `0`. The A1-1 command writes raw rows and timings to `reports/analysis/g3/a1-1/pcc-observe-quick.json`; its console output is preserved in `pcc-observe-quick.log`. A0R post-normalization verification ended with `VERIFY OK`.

## Artifact hashes

| Artifact | SHA-256 |
|---|---|
| `scripts/inkbox-g3-pcc-observe-test.mjs` | `2573f34006f359e5cff7e60714c59f07cc720b97987792d162eae24f9376f1b6` |
| `reports/analysis/g3/a1-1/pcc-observe-quick.json` | `f3472e16ea83e940e0a1ca430d420536d707bad588b429fa949b7f92940d4b0b` |
| `reports/analysis/g3/a1-1/pcc-observe-quick.log` | `8b640e23cffc0513bbf6451e30b4d1edd8dce30de6ecde47c5c671ed544096a2` |
| `reports/analysis/g3/a1-0/evidence-index.json` | `c170deab031d5af04d87711068b42818184177298418ea63877601ce7362dc8f` |

## Evidence and limitations

- A0R intake and reproduction: `reports/analysis/g3/a1-0/G3_PERF_A1_0_EVIDENCE_REPORT.md` and `reports/analysis/g3/a1-0/evidence-index.json`.
- A1-1 per-frame rows, hashes, and measurements: `reports/analysis/g3/a1-1/pcc-observe-quick.json`.
- A1-1 console record: `reports/analysis/g3/a1-1/pcc-observe-quick.log`.
- `terrainShadeCandidateCells` is a shadow statistic only. This blocked prototype has not passed the required independent full-field shade oracle or every A1-1 lifecycle case and must not be treated as production policy.
- A1-2 was stopped by the A1-1 phase gate. The unverified sparse-index experiment was removed from the candidate source.
- `G2_PERF_BLOCKED` remains unchanged. No G2 performance gate was run, and nothing was merged to `main`.
