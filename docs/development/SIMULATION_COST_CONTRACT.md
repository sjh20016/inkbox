# Simulation Cost Admission Contract

This contract governs new simulation consumers and changes to registered hot paths. It is an engineering review gate, not a runtime registry or a proof of asymptotic complexity.

## Required cost card

Every new simulation mechanism must have a card in `SIMULATION_COST_REGISTRY.json` with all ten fields:

1. `consumerAndFactSource`: authoritative objects read and formal write entry point.
2. `settlementObjects`: exactly which objects are processed.
3. `timePrecision`: per step, due action, day boundary, formal event, or player query.
4. `worstCaseCost`: maximum objects, search range, temporary allocation, and worst-case order.
5. `queryMethod`: ID/index/single reference/bounded active set and why it cannot be more local.
6. `rngContract`: stream, additional draws, and restore behavior.
7. `cacheInvalidation`: cached dependencies and invalidation; state explicitly when no cache exists.
8. `dataLifetime`: active/warm/cold history, save capacity, expiry, cleanup, and legacy restore.
9. `failureAndExit`: death, ascension, possession, exhausted resources, vanished sites, and cancellation as applicable.
10. `testEvidence`: natural source, controlled boundaries, determinism, save, read purity, and measurement method.

Use `not-applicable` with a short reason only where a dimension truly does not apply. A missing or empty field fails the mechanical check.

## Protected hot paths and review anchors

The registry pins SHA-256 hashes for the small set of sensitive files listed there, together with a complete cost card for each. Hashes normalize CRLF and CR line endings to LF before calculation, so checkout platform does not change the anchor. A content change fails until a reviewer examines the diff and updates the hash and card deliberately. A new hot path must be added to the registry before it can pass. The checker also accepts changed-file lists so CI can reject unregistered simulation consumers.

Hashes are human-review anchors: they detect unreviewed content changes, but do not understand code or prove that a reviewed change is efficient. They must never be refreshed automatically by the checker. An approved update records the reviewed source hash and a concise review note.

The initial hashes describe baseline `c4b169d`; they do not claim that historical costs have already been optimized or measured. `src/inkbox/sim/siteSearch.js` is a planned protected entry and remains absent at baseline; its cost card is provisional until implementation is reviewed and its hash is explicitly registered.

## Exceptions

An exception requires a concrete bounded workload, why a more local/low-frequency path is not viable, the targeted test or measurement, an owner/review trigger, and an expiry or review date. “Existing behavior” alone is not approval for newly introduced work. Existing baseline costs may be listed as inherited review debt, without claiming remediation.

## Default boundaries

- Do not add full-population/full-location walks, profile decoding, full effect materialization, or unbounded history search to per-entity/per-step, `Life.step`, `stepEntity`, `planNext`, `main.update`, HUD, or rAF paths.
- Prefer formal event or due-time work and bounded ID/local queries. Do not add a parallel clock, cache whole dynamic effect results without complete invalidation, or add diagnostic state to saves/RNG.
- New observational reads must be world- and RNG-pure.
- The checker is intentionally narrow: registry completeness, required cost-card fields, and exact protected-file hashes. It is not an AST analyzer or a general loop detector. CI should pass changed paths to catch new consumers that are not among existing protected anchors.

## Mechanical gate behavior

Run `node scripts/inkbox-wx-e0-cost-contract.mjs`. It validates this contract's required field vocabulary, every registry card, registered file existence/hash, and optional changed paths supplied through `WX_E0_CHANGED_FILES` (newline-separated repo-relative paths). A mismatch reports the path and reason. Controlled fixtures exercise red for an unregistered/modified hot path and green for a reviewed event consumer with a complete card; fixture source is never loaded by the game.
