# E-INT / WX-S1 + S1.1 isolated story rehearsal

## Scope and ancestry

- E-line anchor: `b83fbfb96134f915b7056d56aab99b88e71953c5` (Draft #68, current-head Fast/Heavy green per integration coordinator).
- Story head merged once: `e1b5abb60215b75523112fc67c6f7aba3b85d3f3` (PR #64, already includes #63). Shared merge base: `c4b169d707704b614344345dfb1cac8fe96d50a9`.
- Exclusive worktree: `../inkbox-e-story`, branch `integrate/wx-e-story-rehearsal`. This is a rehearsal candidate only; neither parent branch nor main is changed.

## Actual merge conflicts

`git merge --no-ff origin/feature/wx-s11-story-proofreading` reported three content conflicts:

1. `package.json`: kept both E1 and S1/S1.1 test/profile scripts.
2. `scripts/inkbox-package.mjs`: kept both E0/E1 costs, fixtures, reports, and all story scripts/reports in the explicit package manifest.
3. `tests/README.md`: kept both E0 instructions and S1/S1.1 test guidance.

`.github/workflows/ci.yml` and `FEATURE_EXTENSION_CONTRACT.md` merged automatically and retain both families. `src/inkbox/main.js`, G1 and story UI had no textual conflict. The story inspector adds `appendObjectStoryReader` to the existing `main.js` panel after the E-line source; original S1/S1.1 integration/UI tests exercise the combined wiring. No E-line simulation rule, dt, RNG or save change was made in conflict resolution.

## WX-E0 cost admission

The five added `src/inkbox/wanxiang/story*.js` modules each have a draft ten-field cost card in `SIMULATION_COST_REGISTRY.json`. All are read-time projections with no new save field, RNG draw, cache, or simulation-step consumer. Their source costs differ: `storyFacts` retains at most 24 proof rows per card; `storyPeople` examines retained 128 history/24 ledger rows and current sites; `storySelection` sorts query candidates; `storyWorld` scans current objects/inventories and bounded histories; `storyReading` can scan a whole world only through manual export. Manual whole-world export may repeat entity and artifact lookup per object, so its worst case is explicitly recorded as query-time debt, not called constant time.

First `test:wx-e0` exit code 1 was expected: five new paths lacked protected reviewed hashes and the story `main.js` differed from its E-line reviewed anchor. The contract was neither disabled nor weakened. LF-normalized source hashes for independent review:

| Path | SHA-256 |
| --- | --- |
| `src/inkbox/main.js` | `01dd217f40abf0394c3bbaaf184f7abe22ba85b9b80a72aaad6b71d8ef429799` |
| `src/inkbox/wanxiang/storyFacts.js` | `63c08d642380cb9b338efea1a0c15e8faf1d2e814e7251ffcb049dc13208cc84` |
| `src/inkbox/wanxiang/storyPeople.js` | `925361221514aedb958a767c0e97a260228cb737d47dd9d5062c1f3d55804cd0` |
| `src/inkbox/wanxiang/storyReading.js` | `a9753b37699960f9941d58f4e3f7518f791ae214def523ec1681360116169c9f` |
| `src/inkbox/wanxiang/storySelection.js` | `03cb954daa052b2da6c38cabf98bc637d892f70615ebe5b32ad5fcc692078ba3` |
| `src/inkbox/wanxiang/storyWorld.js` | `1b92812cfa920f4f75daa0ad5046ddaa53aadae421c4134c410da322b2868b01` |

The independent reviewer completed the exact-source cost/purity review before these six hashes were deliberately pinned on 2026-11-11. The review accepts the explicit manual export cost as query-time debt; it is not a performance promotion. The unchanged E0 contract then passed (19 cards / 19 protected anchors / original 65-path inventory), including its real red/green controls. The initial admission failure remains in its original log.

## Local verification

Node v24.11.1 and `npm ci` with process-local `.cache/npm` succeeded. S1 and S1.1, core, G8, C1, Wanxiang A/B/C/D, WX-E1, save-equivalence, three-realms, build and package all exited0 on the merge result. After reviewed admission, the full `test:wx-e0` suite exited0; npm ci, build and package were rerun and passed. [E_INT_STORY_GATE.json](E_INT_STORY_GATE.json) records actual commands, failure history, source hashes and environment; original command logs are under ignored `reports/local/e-int-story/`. No source or assertion was removed to make a gate pass. Final-head Fast/Heavy CI is required on the separate Draft PR. No story browser/GPU/performance acceptance is claimed here.

## Debt and rollback

The story branch is read-only presentation logic but its explicit manual whole-world export can be expensive; no performance benchmark has been run here. Any failure of the cost review or final gate blocks this combined candidate, while the green E-line anchor remains independent. Roll back by discarding only branch `integrate/wx-e-story-rehearsal` and its exclusive worktree; do not rewrite #63/#64 or E-INT.
