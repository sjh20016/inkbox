# W1 measured profile and predeclared W2 targets

Frozen before W2 source edits. Reference: #65 `cda97516d4a20e258af103cd395ddff67644b793`. W1 instrumentation: `a530265fdfcad8171b63f19e75d2d29364804e78`; actual dirty state and every source hash are in `reports/local/wx-e1/w1/profile-final.json`. Node v24.11.1; Windows; CPU identity is in the JSON, rather than inferred from elapsed time. M0 npm ci, core, G8, E0 and save-equivalence each exited 0.

## Natural evidence (diagnostics ON, inclusive wall milliseconds)

| Input / window | readEffects profile calls | conditions ms | experience ms | clamp ms | peer entity visits | helper visits | active arrays |
|---|---:|---:|---:|---:|---:|---:|---:|
| 100y / 30d, dt3 | 22,223 | 66.9 | 46.9 | 16.4 | 715,093 | 86,747 | 374,316 |
| 100y / 90d, dt3 | 67,200 | 193.9 | 133.2 | 39.2 | 2,145,998 | 252,462 | 1,131,372 |
| 400y / 30d, dt3 | 60,118 | 470.7 | 203.5 | 38.7 | 5,274,575 | 968,358 | 1,014,414 |
| 400y / 90d, dt3 | 179,026 | 1,469.9 | 615.1 | 119.4 | 15,607,517 | 2,910,697 | 3,021,286 |
| 100y / **3d**, dt0.1 | 64,394 | 234.4 | 153.5 | 44.1 | 2,086,325 | 254,295 | 1,093,259 |
| 400y / **3d**, dt0.1 | 175,625 | 1,545.1 | 623.5 | 124.0 | 15,947,736 | 2,635,152 | 2,981,625 |

The fractional workload is prebounded to **30 steps / 3 days**, not 30 or 90 days. Each row has separate OFF/ON runs with exactly equal complete serialized world and all registered runtime/RNG. Global measureEffects counts profile calls including worldless skill reads; world metrics count all entries (including no-profile defaults), so these denominators differ deliberately. Sources include hp-limit, cultivation, pollution, eating, perception, retreat, movement, combat, skill, breakthrough, learning, aid-intent and healing. No stack capture is used.

Static entries/definitions/application, Life phases, dt buckets, actual movement substeps and individual entity histogram upper bounds are recorded separately. World timers are nested within Life and effects totals. Village/sect/relation **scan visits remain uncovered**; their inclusive phase timers are not a claim of full scan coverage. Active-array/copy counters are logical allocation operations, not measured heap bytes or an exclusive allocation-time estimate. Instrumentation overhead is material; none of these timings proves a speedup.

## Fixed input and scale evidence

Controlled scale changes only far unrelated entities: N=500/1000/1500/2500, 1,000 queries per round after 100 warmups, 5 rounds. Both peer and final-helper searches visit exactly 0.5/1.0/1.5/2.5 million entities. Peer median µs/query: 16.55 / 32.02 / 46.19 / 73.91; helper: 16.06 / 31.62 / 45.49 / 74.94. This proves a linear population term for these triggered queries; it does not prove natural Life is universally quadratic.

The fixed 400-year world supplies 1,499 actual maxHpFor/combatPower query contexts, retaining actor/target/world/day. One restore, one warmup, five timed rounds; median 17.48 ms per batch. Complete capture before/after is identical. Unsupported live-event contexts are excluded, never replaced with an empty world.

Native CPU profiles: `w1/cpu/dt3.cpuprofile` (1,981 samples, 2.531 s process span), `w1/cpu/dt0.1.cpuprofile` (2,597 samples, 3.368 s). Commands use `node --cpu-prof --cpu-prof-dir=reports/local/wx-e1/w1/cpu --cpu-prof-name=dt3.cpuprofile scripts/inkbox-wx-e1-profile.mjs --mode=cpu --ages=400 --days=30 --dt=3` and the dt0.1 variant with `--days=3 --dt=0.1`. Both processes exited 0; windows are restored independently. Browser CPU/frames are a separate artifact and must not be inferred from Node.

## Targets frozen for W2

1. W2-A: replace ~17 temporary traits+states concatenations per experience call with one bounded valid-ID pass; preserve dormant and expiry behavior exactly. No cross-call cache. Target active temporary arrays: **0**, logical copies **0**.
2. W2-B: remove the peer intermediate arrays by streaming in original world-array order. Preserve first mentor, every returned condition, and live positions/health. Keep the inherited O(N) scan visible; do not claim O(1). No full-population index.
3. Each increment must pass fixed #65 pure-read oracle, every axis using Object.is, 100/400-year 90-day full-world + complete runtime/RNG equality, OFF/ON equality and independent v11 save forks. No rule/RNG/save change is acceptable.
4. Final diagnostics OFF ABBAABBA: warm up each version independently, 4 samples/version × 30d for both ages and dt3/dt0.1. Include native wall/CPU and step p50/p95/p99 plus restore/serialization separately. No fixed speedup promise. A reproducible sustained >25% tail regression blocks that candidate; report noisy or weak changes honestly.
5. W5 counts, source anchors and all original Fast/Heavy remain mandatory. Long ecology runner is supplied for W6; no L1/L2 is promoted under L0 evidence.

The evidence supports bounded allocation work and removal of redundant peer buffers first. Population-dependent query work remains a documented debt. Frame decoupling is separately tested in E2P, with actual committed days and backlog visible.

## W1 evidence map (same frozen data, 400y / 30d / dt3)

| Hot path | Inclusive wall / frequency | Population or allocation work | Growth supported by evidence | Source | Semantic risk |
|---|---|---|---|---|---|
| deriveConditions | 470.7ms / 57,947 calls | 5,274,575 peer entity visits | O(N) per qualified scan; aggregate depends on qualifying queries | natural OFF/ON plus fixed-N experiment | first mentor/world order and live position must be preserved |
| experienceEffects | 203.5ms / 59,694 world-aware calls | 1,014,414 active arrays; 968,358 helper visits | bounded state-list allocation plus qualified O(N) helper scan | explicit logical counters and controlled scale | dormant/expiry, plane keys, current helper health/position |
| clamp | 38.7ms / 59,694 calls | fixed effect axes | constant per returned axis count | separate timer in effects | floating accumulation/clamp order |
| static effects | 72.1ms total legacy static timer | entry/definition/application subphases reported separately | bounded declared profile lists; immutable catalog compilation only | W1 profile JSON | do not cache dynamic state from catalog revision |
| Life | 1,597.1ms / 10 steps | entity loop plus other subsystems | no universal quadratic claim; dt0.1 repeats per-step work far more often per day | native dt3/dt0.1 and CPU profiles | mortality, resources, clocks and RNG order |

Wall times overlap by containment. Logical allocation counts measure operations and copied elements, not exclusive heap-allocation milliseconds. The W1 Node results establish the selected W2 targets; later browser measurements are reported separately and do not retroactively change these targets.
