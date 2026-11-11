# WX-E1 measured performance and acceptance limits

## Native experiment

Actual sample source `9638010eb9894635579fcd8c76596e9594c66865`, clean at sample start; reference is an independently verified #65 export. Windows 10.0.26200, Node v24.11.1, AMD Ryzen 9 8940HX, 32 logical CPUs. The report records the input archive hashes, complete source hashes and actual launch argv. Later documentation/package commits do not relabel these runs. CPU and browser experiments are serialized between E1/E2P.

Diagnostics OFF, one independent 30-day warmup per source, then ABBAABBA, four independent 30-day restores per version per workload. Restore/serialization are excluded from native advance time and recorded separately. P50/P95/P99 use nearest-rank empirical quantiles; with four window samples P95/P99 equal the observed maximum, not a production tail estimate. Per-step columns pool 40 or 1,200 steps per version. All eight window world/runtime/RNG digests match within each workload. Two separate counter-only restores per workload reproduce exact work snapshots and the same complete save.

| Natural input / dt | 30d wall P50 ms E0→E1 | Native step P95 ms E0→E1 | Native step P99 ms E0→E1 | CPU P50 ms E0→E1 |
|---|---:|---:|---:|---:|
| 100y / 3 | 303.4 → 325.9 | 55.65 → 48.19 | 60.58 → 61.20 | 391 → 406 |
| 100y / 0.1 | 5,641.5 → 5,097.8 | 27.51 → 23.48 | 35.86 → 27.09 | 5,781 → 5,156 |
| 400y / 3 | 1,714.8 → 1,571.7 | 223.06 → 201.48 | 243.72 → 232.42 | 1,813 → 1,626 |
| 400y / 0.1 | 43,059.8 → 43,540.4 | 202.99 → 203.64 | 225.54 → 235.39 | 43,563 → 43,501 |

Verdict: **allocation work is reduced, overall speed improvement is mixed**. The mature fractional-step workload does not improve in this sample. No workload has an observed step P95/P99 ratio exceeding the predeclared 1.25 review threshold, but four samples cannot establish absence of every regression. This does not establish stable browser FPS or solve mature-world main-thread blocking. No acceleration percentage is advertised as a general result.

## Exact work and semantic evidence

| 90d dt3 metric (100y / 400y) | W1 before | E1 after |
|---|---:|---:|
| active concatenated arrays | 1,131,372 / 3,021,286 | 0 / 0 |
| active short-circuit element visits | 63,761 / 224,511 | 3,799 / 13,370 (single passes) |
| active copied elements | 63,959 / 225,981 | 0 / 0 |
| peer entity visits | 2,145,998 / 15,607,517 | exactly unchanged |
| helper entity visits | 252,462 / 2,910,697 | exactly unchanged |

The counts refer to world-aware calls; worldless legacy skill queries are separately counted by the serial effects meter. Array counts are logical operations, not heap bytes or exclusive allocation wall time. The remaining conditional O(N) scans are a real debt. Streaming peers removes intermediate buffers but deliberately retains first-mentor order and live dependencies.

Both increments separately passed old/new per-axis Object.is and 100/400-year 90-day world/runtime/RNG comparison plus saved continuation forks. Final validation additionally reuses 73101/61003 100-year archives for 90-day same-source comparisons. No natural facts, inhabitants, birth probabilities or resources were injected for performance. See [delivery](WX_E1_DELIVERY.md), [W1 targets](WX_E1_PROFILE_AND_TARGETS.md) and local final/native.json / final/seed-*.json for exact runtime states and hashes.

## Browser scope

Official production E0 and E1 pages are tested separately at real default 2×, with 400-year mortal checkpoints and formally generated control upper/nether worlds required by product loading. Canvas and actual Three each receive a continuous 30-second profile, real frames, pause/character inspection and formal save/load. These two source versions have variable browser dt sequences, so their world digests are not an L0 scheduling comparison. Browser profiler sampling adds overhead and headless results do not certify front-display GPU performance.

On 2026-11-11 both processes exited 0. The baseline served unchanged #65; the candidate served `32c2665` with simulation source identical to the native sample at `9638010`. The actual browser harness dirty state and hashes are recorded independently, without relabeling older runs. Edge headless, 1366×768; Three reports WebGL2 / ANGLE AMD Radeon 610M D3D11, which is not front-display GPU certification.

| Official page / 400y / default 2× | Frames in ~30s | Frame P95 / P99 ms | Actual days per real second (target 6) |
|---|---:|---:|---:|
| E0 Canvas | 284 | 139.1 / 167.0 | 5.838 |
| E1 Canvas | 255 | 161.4 / 172.6 | 5.612 |
| E0 actual Three | 299 | 139.2 / 183.7 | 5.792 |
| E1 actual Three | 319 | 122.3 / 139.2 | 5.925 |

Every case contains >50ms intervals and fails the proposed smooth-frame target. These are single diagnostic browser samples with different variable dt sequences; the mixed results do not prove a consistent renderer speedup. Each case also completed live character inspection, real UI save and UI load; owned browser/profile and server cleanup are recorded complete. Setup calls the official newWorld API; creation-menu clicks are not claimed. The first harness attempts failed on initial menu/slot controls and the unsaved-world confirmation; their JSONs are preserved. The passing harness clicks the actual discard-confirmation control rather than bypassing the product guard.

Raw files: `w1/browser-baseline/report.json` and `browser/report.json`, with four CPU profiles and screenshots in the same directories. E2P's fixed-dt renderer bridge includes clone/publication costs and is reported in its own Draft; it is not substituted for this official production flow.

## Reproduction

`node scripts/inkbox-wx-e1-perf.mjs --out=reports/local/wx-e1/perf/native.json` runs the complete native experiment. The original E0 archives are required or explicitly supply `--checkpoint-root=...`. Do not substitute synthetic populations for natural inputs. `--mode=count` runs repeatable native counter observations without ABBA timing claims. Browser commands are in [delivery](WX_E1_DELIVERY.md).

W6 3 seeds × old/new × 200 years is **pending**, with unavailable cumulative metrics hard-blocking promotion. No W3 cache, L1/L2 rule change, default worker scheduler, 800-year study or natural 400-year three-realm history is claimed.
