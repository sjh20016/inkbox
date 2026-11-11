# E-INT E-line integration baseline (2026-11-11)

This integration is authorized by the E-INT / WX-E1C / WX-E2R-a task package. It does not merge a candidate into main or promote a performance experiment.

Remote refs were fetched and rechecked before integration: main `bd62ade03c56908ce5942f7100d6b5cb2bc38934`; #66 `perf/wx-e1-effects-proof` at `90219509ff77e7f13ec17b6e222c6c0844475569`; #64 `feature/wx-s11-story-proofreading` at `e1b5abb60215b75523112fc67c6f7aba3b85d3f3`. The original #60–#67 branches remain unchanged. Their current-head Fast/Heavy runs were successful when inspected; those results do not replace this integration's own checks.

`integrate/wx-e-anchor` starts from that main and merges #66 once with `--no-ff`. Merge commit `16b49e755158dee6c7f1149fe93ceaa0def50c42` has exactly the two parents main `bd62ade…` and #66 `9021950…`. Its tree is `0b7bc43c9f2b7a9f0add181bf98baf562b39a49e`, exactly #66's tree; `git diff --quiet 9021950 HEAD` passed at the merge. #60, #61, #62 and #65 are already ancestors of #66 and were not merged or cherry-picked again. No merge conflict occurred.

The integration worktree is independent of the original E0, E1 and E2P worktrees. The documentation commit following the merge changes no production source. Downstream A (`perf/wx-e1c-near-kin-index`) and B (`arch/wx-e2ra-world-readview`) must start from the SAME final E-INT HEAD only after that HEAD's Fast Gate and Heavy Gate succeed. A and B target this integration branch and are not merged together in this task. Story rehearsal branches from the same green anchor and merges #64 once; it cannot silently alter the E-line anchor.

Natural checkpoints are reused without modification from the official WX-D simulation, with complete G8 runtime:

| seed / age / game day | bytes | SHA256 |
|---|---:|---|
| 20260914 / 100 years / 36000 | 2826671 | `08404e6fa62c4cba154bfe03b0b116cd9eb7e835bd2cd1e69b800fc87b92ad18` |
| 20260914 / 400 years / 144000 | 10073655 | `d204519759a222d3fac8d5847d9f025329c9a1fa83a20e3835dfbd7ef59666bd` |

Production admission preserves individual mortal simulation, cultivator sources, lifespan, sect supply, formal death, reincarnation, all three realm clocks, all RNG draws, v11 saves and complete formal game days. No Worker, fixed dt=3, rule change, or new save field is enabled here. Research #67 remains outside this integration.

See [E_INT_GATE.md](E_INT_GATE.md) and [E_INT_GATE.json](E_INT_GATE.json) for the actual local run, source hashes, environment and failure history. Final current-head CI is visible in the E-INT Draft PR checks, not inferred from upstream results.
