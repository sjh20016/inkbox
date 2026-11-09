# WX-E1 delivery: L0 effect work, deterministic cost admission

Draft PR [#66](https://github.com/sjh20016/inkbox/pull/66) targets WX-E0 `perf/wx-e0-raincoat-first`, pinned `cda97516d4a20e258af103cd395ddff67644b793`. No upstream PR or main history was rewritten. Source-level L0 changes were independently reviewed; the E2P scheduler research starts separately from #65 and is not imported by production.

## Completed source changes

- W1 opt-in WeakMap diagnostics separate static entry/definition/application, dynamic condition/experience/clamp, actual peer/helper visits, logical temporary allocations, fixed source tags, Life phases, dt buckets and movement substeps. Actor identity uses WeakSet to avoid retaining dead entities. Global legacy effects timing is used only serially. Metrics do not write world/save/RNG.
- W2-A builds one invocation-local active-ID Set from traits/states rather than ~17 concatenations. It preserves dormant, duplicate, expiration and axis ordering semantics. No dynamic effect cache is introduced.
- W2-B streams nearby peers in original array order, preserving the first mentor and the complete returned condition map. It removes peer buffers, with **no reduction claimed in inherited O(N) entity visits**. No population index is added.
- W5 runs real production queries on controlled N=500/1000/1500/2500 fixtures with exact work counts and red controls. Cost cards now state transitive population work. An independent source review preceded deliberate LF-normalized anchor updates. Every prior Fast/Heavy command remains; E1 oracle/cost checks are an additive Fast step.
- W3 remains disabled. W6 supplies an executable six-run/200-year comparison interface and frozen thresholds. It is explicitly blocked for promotion while requested cumulative ecology metrics are unavailable; no long matrix is claimed.

## Full world, runtime/RNG and saved continuations

The frozen reference modules match #65 except import relocation (independently checked). Every returned axis and key set is compared using Object.is, including number/expiry/dormant/mentor-order/plane/invalid-state fixtures. A real-call observer checks the same live input objects without replaying mutation or RNG. Native source comparison exports the full #65 source, with explicit text CRLF normalization and exact binary checks.

Final source sampling: `9638010eb9894635579fcd8c76596e9594c66865`; actual tree/dirty flags and source-byte hashes accompany every raw JSON. W2-A and W2-B each passed separately before final sampling. Final 100/400-year seed20260914 90d/dt3 and the two additional **reused** seed73101/61003 100-year archives continued for 90d; all complete world/runtime/RNG and independently restored v11 30d save forks match #65. These are mature archive continuations, not newly run three-century ecology studies. The final oracle totals 684,857 queries / 11,643,514 axes, zero differences.

| Native input / 90d dt3 | Complete world + runtime SHA256 | Runtime/RNG SHA256 |
|---|---|---|
| 20260914 / 100y | `6a8a192007b87c553ac02fa2aaf835b4675ce6f694f32e0884128f5d7c2af642` | `1ec9637175a61a7db5552c60d2541236e27d19c9d6ac371eaeadb041b1635e56` |
| 20260914 / 400y | `9d91499313a855a9f58d18363fb090a239222c272349a79a9bafd2d589193a2f` | `39eedbfac4595305d4f7a9b9da9aa107871a83a40bee77dd8ad088ff19ba9187` |

For the final 90d windows, active arrays/copies are zero; activity element visits are 3,799 / 13,370 (100/400y), compared with W1 repeated short-circuit visits 63,761 / 224,511. The separate old copied-element totals are 63,959 / 225,981. Peer visits remain 2,145,998 / 15,607,517; helper visits remain 252,462 / 2,910,697. This is allocation/traversal-work evidence, not an exclusive allocation-time or FPS guarantee.

## Reproduction and report provenance

```sh
npm ci
npm run test:wx-e0
npm run test:wx-e1
node scripts/inkbox-wx-e1-profile.mjs --out=reports/local/wx-e1/w1/profile.json
node scripts/inkbox-wx-e1-verify.mjs --native --out=reports/local/wx-e1/final/native.json
node scripts/inkbox-wx-e1-perf.mjs --out=reports/local/wx-e1/perf/native.json
node scripts/inkbox-wx-e1-browser.mjs --out=reports/local/wx-e1/browser
node scripts/inkbox-wx-e1-ecology.mjs --validate-config
```

Default natural archives are read from the sibling `inkbox-wxe0/reports/local/wx-e0/checkpoints`; use `--checkpoint-root=...` and `--seed=...` for another explicitly identified archive source. Input filenames never imply newly generated provenance. Browser baseline can use `--source=../inkbox-wxe0`; its output and source hashes stay separate from candidate data. Browser controls generate upper/nether worlds only to satisfy formal product loading; these are **not natural 400-year three-realm histories**.

Raw reports, actual process logs, input archives and profiles stay under ignored reports/local/wx-e1, outside the distributable package. Initial export failed because git archive honored Windows CRLF; the retry verifies normalized text and records both raw and Git hashes. An initial launcher rejected multiple positional New-Item paths before Node started; its stale shell exit values are explicitly invalidated in final/launch-failure.json. Neither failure was relabeled a passing experiment.

## Performance and browser verdict

The separate measured report is added after diagnostics-OFF ABBAABBA and real official-page browser runs finish. Fixed dt3 and dt0.1 are distinct workloads; stage timing is nested and never added as exclusive CPU totals. E2P fixed-step renderer-bridge profiles include full display-snapshot publication costs and are not a direct production E0/E1 FPS comparison.

## Rollback and outstanding boundaries

W2-A `ec36399` and W2-B `0fa88fc` are separate increments; revert one with its corresponding reviewed cost anchors/oracle budget update, or discard this Draft to return to #65. No save version/field migration is needed. The diagnostic/gate increment `9e86146` is separate. E2P is another branch and has no production default path.

Still outside acceptance: formal E2 scheduling migration, any W3 full-effect snapshot, L1/L2 ecological promotion, 800-year worlds, natural 400-year upper/nether history and front-display hardware GPU signoff. Existing mortal individuals, cultivator origins, life extension, sect supplies, formal deaths, reincarnation, and three-realm clocks were not replaced or reduced.
