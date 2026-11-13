# WX-E1C measured performance

Actual sampled source: clean `1c6edc84bc96bb8d49283f5644e890381870bb44`; fixed reference #66 `90219509ff77e7f13ec17b6e222c6c0844475569`. Node v24.11.1, V8 13.6.233.10-node.28, AMD Ryzen 9 8940HX with Radeon Graphics        , win32 10.0.26200. The following documentation commits do not relabel this run. Raw source bytes were preserved separately with the sampled SHA256 manifest.

Diagnostics OFF, one independent30-game-day warmup per source/workload, then ABBAABBA with4 independent restores/source. All windows are30 game days; dt3 and dt0.1 are separate step sequences, never cross-compared as L0. Restore and serialization are outside advance timing and reported in the JSON. CPU is process user+system time, which can exceed wall time with concurrent VM work. Two counter-only restores/workload reproduce exact logical work and the same complete World/runtime/RNG.

| Natural input / dt | 30d wall P50 ms #66 -> E1C | Lower wall time | Step P95 ms | Step P99 ms | CPU P50 ms |
|---|---:|---:|---:|---:|---:|
| 100y / 3 | 150.9 -> 134.2 | 11.1% | 22.13 -> 20.44 | 28.85 -> 28.47 | 219 -> 156 |
| 100y / 0.1 | 4143.0 -> 3574.7 | 13.7% | 15.85 -> 13.99 | 17.76 -> 15.94 | 4203 -> 3610 |
| 400y / 3 | 1076.3 -> 869.6 | 19.2% | 124.33 -> 103.16 | 132.27 -> 103.93 | 1157 -> 922 |
| 400y / 0.1 | 29688.5 -> 23495.9 | 20.9% | 110.78 -> 89.90 | 113.89 -> 93.64 | 30016 -> 23781 |

This machine/sample shows11.1–20.9% lower native advance median across the four workloads. This is NOT95% CPU/FPS acceleration:95.48% refers only to the specified query-plus-construction visit categories in the90d proof. Existing effects/catalog/wanling/sect/movement work remains. No observed step P95/P99 ratio exceeds1.25 in this sample; four windows cannot establish universal tail behavior. Window P95/P99 with n4 equals the observed maximum; per-step samples pool40 or1200 calls/source, using nearest-rank empirical quantiles.

Every one of the8 repeated window complete World/runtime/RNG hashes matches within its workload. Real natural100/400y checkpoints are reused unchanged; input hashes and all actual source/harness hashes are in WX_E1C_PERFORMANCE.json. No new population, rule, RNG draw, save field, worker, scheduling choice or discarded game day produced the timing result.

## Browser results

Installed Edge157.0.4341.42, headless1366x768, real Canvas and active WebGL Three (AMD Radeon610M / ANGLE D3D11). The same E-INT baseline as B was measured first, then this clean A source. Each case is one30s observation after5s warmup at2x (target6 game days/s), with diagnostics OFF. Browser production dt varies by elapsed frame time; these runs are separate observations and are NOT a same-step full-world oracle.

| 400y detail | Frame P95 ms baseline -> A | Frame P99 ms baseline -> A | Actual game days/s baseline -> A | Frames >50ms / total, A | Long tasks, A |
|---|---:|---:|---:|---:|---:|
| canvas | 94.6 -> 66.8 | 100.2 -> 77.9 | 5.996 -> 5.995 | 411 / 543 | 408 |
| 3d | 100.2 -> 66.8 | 111.3 -> 77.9 | 6.004 -> 5.993 | 457 / 539 | 427 |

Long frames remain; this does not establish stable FPS or general GPU performance. Detail interactions opened settlement/person panels, used actual pointer terrain changes and official undo, formal upper/nether window APIs, and DOM save/load. All changed terrain cells restored, browser errors were empty and owned profiles/processes/servers exited. Fresh child realms here are explicit controls, not aged natural histories. Screenshots, before/after/reload heaps, renderer receipts and raw timings are in the content-hashed JSON and local evidence archive. No front-display GPU certification or long soak is claimed.
