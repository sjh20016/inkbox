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
