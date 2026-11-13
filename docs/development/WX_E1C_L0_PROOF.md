# WX-E1C L0 proof — shared lookup increment

The Top25 freeze is commit `ac9d330`. This proof tests the actual dirty shared-only production bytes recorded in the JSON, not a later relabelled HEAD. Fixed reference #66 `90219509ff77e7f13ec17b6e222c6c0844475569` is Git-blob-verified on every export. Pure effect/condition/experience oracles are import-relocated frozen #66 bodies with a separate disabled metrics module, so oracle reads cannot pollute candidate work counters.

37 controlled cases compare exact returned key sets and every primitive with `Object.is`, preserving malformed-input rejection. Native proof made 972,712 oracle comparisons / 16,537,224 axes with zero mismatch. At each window both diagnostics OFF and ON candidates exactly deep-equal the ENTIRE reference serializeWorld and ALL registered G8 runtime/RNG, and all formal sourceTag counts match. Three independent restores (reference plus two candidate copies) of each v11 snapshot continue with identical hashes. This is independent saved continuation, not a claim that terrain round-tripping is lossless.

[WX_E1C_L0_ACCEPTANCE.json](WX_E1C_L0_ACCEPTANCE.json) retains source hashes, exact runtime/RNG states, work counters, checkpoint hashes, saved-fork hashes and environment. Natural inputs are the unchanged official WX-D100/400y archives; no population or ecology is injected.

| Age / same step sequence | Reference helper visits | Indexed candidates | Index build visits / builds | Full world + runtime SHA256 | Runtime SHA256 |
|---|---:|---:|---:|---|---|
| 100y / 90d / dt3 | 252462 | 916 | 16233 / 30 | `6a8a192007b87c553ac02fa2aaf835b4675ce6f694f32e0884128f5d7c2af642` | `1ec9637175a61a7db5552c60d2541236e27d19c9d6ac371eaeadb041b1635e56` |
| 100y / 3d / dt0.1 | 254295 | 908 | 16215 / 30 | `22827a7da5ae29f1c78b36fa0747e6342923eb277944bc5f9ec6237c9f607b6c` | `da4dbb20407c692157f49f7fa38f647a483ebc169ee30fb7313a9c00ac57e810` |
| 400y / 90d / dt3 | 2910697 | 2144 | 41986 / 30 | `9d91499313a855a9f58d18363fb090a239222c272349a79a9bafd2d589193a2f` | `39eedbfac4595305d4f7a9b9da9aa107871a83a40bee77dd8ad088ff19ba9187` |
| 400y / 3d / dt0.1 | 2635152 | 2060 | 41942 / 30 | `85d8f116597af862bc7afa0429244f2131ea727c64ad964efa39b349a19d9482` | `b35dc75e8bd8fd56fa0b011dbaf74693c64cf0e3d654eb69ac59afdceceba65f` |

The 400y90d shared work changes from 2,910,697 full-find visits to 2,144 target candidates plus 41,986 visible construction visits (30 lazy maps). Natural windows had no shared fallback in this audited loop; unowned/invalid paths still scan and are explicitly counted. Peer scanning is unchanged at this increment: 15,607,517 visits. Therefore this is not a >=90% reduction of the combined 18,518,214 baseline and is not an overall speedup claim.

## Scope and mutation proof

The WeakMap entry exists only during the stock synchronous Life entity loop, after pending births/grid preparation and before death/ascension compaction, and is deleted in finally. A lazily built map validates positive safe unique IDs and object identity; strict plane/id targets, live health/distance and current original array index are read every invocation. World.addEntity/removeEntity invalidate after append or swap/pop. Read/load/new-world/direct push/splice/replacement BETWEEN intervals therefore use a fresh build or original scan. Upper/nether, worldless, missing/empty and malformed data retain fallback semantics. All Life method identities must remain stock; an overridden method that performs a same-length mutation in the real loop is tested and disables the view.

The audit found no direct mortal entity-list mutation inside the stock entity loop. Arbitrary uninstrumented writes INSIDE a trusted interval cannot be detected by length alone and are outside this narrow contract. New callbacks, mutation paths or source changes require renewed review; they must invalidate or disable the view. No production Proxy, persistent population cache, saved field, RNG draw, rule or scheduling change is introduced. The existing death sweep, reincarnation and three-realm clocks remain outside this view. Original ThreeRealms/SaveEquivalence gates remain mandatory.

Independent reviewer accepted the shared-only source and explicitly identified the missing cost budget coverage. The new `test:wx-e1c` ratchet now executes actual indexed production calls at N500/1000/1500/2500, far and dense cases, exposes exactly one N construction pass and one target candidate/query, and rejects actual full-scan fallback and actual unregistered counted-work paths. Original E1 fallback fixtures remain valid; they do not require a new algorithm to perform N work.

Ordered mentor and live ally lookup, final ABBAABBA, browser comparison and final-head CI are not yet claimed by this shared increment. Each subsequent increment needs its own proof and reviewed pins.

The shared increment also passed local npm ci, core/G8/C1, Wanxiang A/B/C/D, original E0/E1, new E1C, save-equivalence, three-realms, build and package. [WX_E1C_SHARED_GATE.json](WX_E1C_SHARED_GATE.json) records every real exit code and tested source hash. This is separate from the required final pushed HEAD's Fast/Heavy CI.

## Ordered mentor increment

After shared commit `fdfdae0`, mentor candidates are resolved from the current relation Map and the minimum current world-array index is chosen. The old peer loop remains for nearCount/allies, so this step adds O(R) relation traversal and does not yet remove its O(N) population term. Independent source review preceded the two deliberately updated pins.

41 controlled cases pass. Native proof compares every actual complete conditions map as well as every effect axis: 1919858 queries / 56316876 Object.is axes, zero mismatch. All four natural age/dt windows retain exactly the same complete world/runtime/RNG/sourceTags/fork hashes as the shared stage. [WX_E1C_MENTOR_ACCEPTANCE.json](WX_E1C_MENTOR_ACCEPTANCE.json) contains the actual tested source, counters and full runtime states. Unsupported custom relation getters, invalid keys, duplicate identities, live deaths and reordered mentors retain correct fallback/order behavior.

This mentor increment independently passed the full local npm ci + commissioned base sequence, new E1C, save-equivalence, three-realms, build and package. [WX_E1C_MENTOR_GATE.json](WX_E1C_MENTOR_GATE.json) records the tested source and exit codes.

## Live local peer increment

The separate4-cell Map/Set view is active only in the same audited synchronous native Life loop. It never modifies Life.grid. The two in-loop movement sites notify it: ground-escape after both coordinate writes, and moveTowards finally (including early exits). Bucket membership changes on displacement; hp/faction/state/relations are read live. Only unordered ally/near counts use cell iteration; mentor remains selected by original world-array index. Any failed/partial local query clears and recomputes ALL peer fields with the original ordered scan. Invalid and astronomical coordinates fall back safely.

45 controlled cases, including Proxy-traced actual other-actor native movement, cell/negative/radius boundaries, long movement, live death/revival/state/faction/relation changes, formal structural invalidation and unowned mutation. Native final proof: 1919921 queries / 56318262 Object.is axes, zero mismatch. All four full world/runtime/RNG/sourceTag and v11 fork results match the previous increments. [WX_E1C_SPATIAL_ACCEPTANCE.json](WX_E1C_SPATIAL_ACCEPTANCE.json) records the actual final production bytes and complete runtime states.

| Age / window / dt | Legacy peer+helper entries | Local peer candidates | Shared targets | ID build | Spatial build | Position checks / cell moves | Relation entries |
|---|---:|---:|---:|---:|---:|---:|---:|
| 100y / 90d / 3 | 2398460 | 155755 | 916 | 16233 | 16233 | 16135 / 4480 | 3654 |
| 100y / 3d / 0.1 | 2340620 | 134334 | 908 | 16215 | 16215 | 16133 / 217 | 3844 |
| 400y / 90d / 3 | 18518214 | 750317 | 2144 | 41986 | 41986 | 41048 / 10532 | 2016 |
| 400y / 3d / 0.1 | 18582888 | 775864 | 2060 | 41942 | 41942 | 41344 / 618 | 2020 |

At400y90d, peer+shared candidates plus BOTH full construction passes total836,433 versus18,518,214 baseline scan entries (95.48% lower in these specified categories). The table separately exposes41,048 position checks,10,532 cell moves and2,016 relation entries; Map lookups and bucket allocations are in the raw counters. This is not a complete CPU-operation/heap-byte comparison or a wall-time/FPS speedup. Both views build30 times, once per queried pass; there is no in-pass rebuild, invalidation instead uses fallback. Natural proof windows had no fallback. Dense controlled populations honestly visit N candidates; far unrelated population leaves2 candidates/query fixed.

Independent review accepted the final three production hashes and the complete fallback follow-up before pinning. The natural cost ratchet also received independent review: explicit relation, empty-cell, map, construction, position, candidate and query-frequency caps; exact sourceTags and input hashes; current production byte binding. Red examples execute real extra-relation and extra-cell-probe work, as well as real fallback and unregistered counted work. No wall-clock assertions are added to CI.

Compact complete end-world snapshots (including all G8 runtime/RNG) are materialized under `reports/local/wx-e1c/evidence/worlds/<completeSHA>.json`, with a content-addressed manifest `WORLD_SNAPSHOTS.json`; each file byte SHA is the already-proved full-world hash. The final evidence archive includes these files. Natural child-realm histories are unavailable in these archives; the original three-realm gates remain separate genuine control coverage. No aged three-realm history or200-year W6 result is claimed.

The spatial production bytes passed the full local npm ci/base/E0/E1/E1C/save-equivalence/three-realms/build/package sequence; [WX_E1C_SPATIAL_GATE.json](WX_E1C_SPATIAL_GATE.json) preserves actual exits. The added natural budget/configuration then passed focused independent review and its actual native-report gate. Final fast/build/package checks cover the subsequently added harness/manifest files; final pushed HEAD must still pass full Fast/Heavy. Mutation paths and explicit unsupported boundaries are tabulated in [WX_E1C_MUTATION_AUDIT.md](WX_E1C_MUTATION_AUDIT.md).
