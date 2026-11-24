# WX-E1 W6 ecology comparison runner

This runner is an executable, pre-registered screening harness for a future L1/L2 rule experiment. No L1/L2 feature is introduced or promoted by WX-E1, so the six-run 200-year matrix is intentionally pending and was not run as part of this task.

The frozen seeds, 200-year horizon, 3-day formal `advanceWorld` increments, and per-seed thresholds live in `WX_E1_ECOLOGY_THRESHOLDS.json`. The defaults are seeds `20260914`, `73101`, and `61003`, old and new source roots (six total runs), each produced using the official E0 `nativeApi().fresh(seed)` and `advanceWorld` path. At each 200-year endpoint, the runner captures the official save/runtime, creates two independent restores of the same serialized snapshot, advances both by the same additional 30 days, and requires their complete serialized world/runtime/RNG values to match. It separately reports uninterrupted-versus-restored equality without asserting it because serialization can quantize terrain. It records exact HEAD/tree, dirty state, E0 source hashes, and a hash over all current `src/inkbox/**/*.js` files for each source. The report is persisted after each completed old/new seed pair so later failures leave completed evidence. It does not create substitute populations or alter simulation rules.

Run the cheap CLI/config validation without simulation:

```sh
node scripts/inkbox-wx-e1-ecology.mjs --validate-config
```

Run the full matrix only when an L1/L2 experiment has been approved and both exact source trees are ready:

```sh
node scripts/inkbox-wx-e1-ecology.mjs --old-source /absolute/path/to/old --new-source /absolute/path/to/new --mode full
```

Available endpoint evidence includes living population and surviving birth-origin cohorts, retained death records by cause/age-days, `deadLog` totals when present, villages/factions/resources, site and breakthrough records retained in profiles, globally unique artifact IDs/owners, soul-route totals, and serialized runtime/RNG hashes. Missing fields are reported as unavailable rather than zero. The JSON labels these as endpoint or retained-ledger measures. It does not count retained birth origins or copied historical records as cumulative new births. Exact cumulative natural birth/cultivator-origin counts and lifetime death-cause totals are unavailable because no authoritative cumulative ledgers retain them; per-profile breakthrough/site records and per-death cause rows are bounded and censored. Even if all measured thresholds pass, the result remains `ecologyAcceptance: blocked-unavailable-required-metrics` and `promotionEligible: false`. The thresholds include those limitations and must be revised and frozen before any later experiment if the measured contract changes.

`--validate-config` checks only CLI policy and threshold-file structure. Full mode also validates the frozen config before starting. It does not claim ecological results. This task ran only that validation and the runner syntax check; no 200-year simulations were run.
