# G3-PERF-A1.0 Evidence Intake and Reproduction

## Verdict

`A1_0_EVIDENCE_READY`

The supplied A0R package is intact, its independent verifier passes against the original data, and the required experiments reproduce on the exact H3 product commit. No product source was changed in A1-0.

## Identity and provenance

- Product baseline and candidate: `codex/g2-h3-terrain-color-pilot-luna` at `bfabe00e3c0865721e5c426c4915a1f879498714`.
- Current `main` at intake: `e1e55039bb56efda7a307513ede07a9fab3bf534`; H3 is 86 commits ahead and 0 behind.
- PR #13, #14, and #15 were all open Draft PRs at intake; none was merged.
- The primary checkout `codex/g2-latest-local` had pre-existing deletions and untracked files. Intake and reproduction ran from an isolated snapshot of the H3 commit; those primary-checkout files were not included.
- A0R archive SHA-256: `f6bbea52ac4956d1e3bdcbc7c27256c7644f1668fc596bcfd066091b57fedcbf` (matches the requested value).
- All 12 files listed in the archive manifest matched their SHA-256 and byte-length entries. The archive manifest identifies Node `v24.14.1`, Three.js `0.186.1`, and the source commit above.
- `reports/analysis/g3/a1-0/evidence-index.json` records SHA-256 for every preserved original and rerun file; its published SHA-256 is `c170deab031d5af04d87711068b42818184177298418ea63877601ce7362dc8f`.

The archive and original JSON/logs are retained in `reports/analysis/g3/a1-0/original/`. Reproduction outputs and logs are in `reports/analysis/g3/a1-0/rerun-windows/`. The unchanged experiment sources, README, and manifest are in `scripts/perf-a0r/`.

Before publishing the Windows rerun files, machine-local `meta.root` values were replaced with `[local source path redacted]`. Numeric rows, hashes, and other experiment data were left intact; the evidence index covers the published copies. The verifier was rerun after this metadata-only normalization and still reported `VERIFY OK`.

## Reproduction environment and adaptation

- Product source: exact H3 commit above.
- Local runtime: Node `v24.11.1`, Windows 10 build `19045`, 12th Gen Intel Core i3-12100 (8 logical CPUs), Three.js `0.186.1`.
- Installed Edge: `155.0.4283.45`; no browser or GPU rendering was used for these Node experiments, so DPR and renderer are not applicable.
- The package's original timing host was Amazon Linux 2023, Node `v24.14.1`, Xeon 2.90 GHz ×2. The local host differs; CPU milliseconds are retained as local references and are not compared as portable performance claims.
- The A0R scripts were not edited. On Windows, `INKBOX_ROOT` was supplied as a `file://` URL so the scripts' existing dynamic imports resolve correctly. `WARM=30`, census/epsilon/water steps `60`, replay steps `30`, seed `673231`, expanse preset, and generation version `2` were retained.

## Commands and results

The following scripts completed sequentially with exit code 0:

```text
node census.mjs
node census.mjs                         # census_rerun
node eps_contract.mjs                   # TMAX=12, PLANE=mortal
node water_index.mjs
node replay.mjs                         # MODE=real, STEPS=30
node replay.mjs                         # MODE=typeonly, STEPS=30
node verify.mjs                         # DIR=<rerun output directory>
```

The independent verifier reported `VERIFY OK` with eight passing checks:

- Standard and archipelago census counts matched across the two runs.
- Both state-hash chains matched across the two runs.
- Census and epsilon-contract state hashes matched for both maps.
- Every original A0 census count row matched for standard and archipelago.

The 60-step census reproduced the original A0 counters exactly. On the reproduced sequence, standard-map median/p95 counts were 66,005/66,419 height cells, 68,952/68,973 water cells, 65/82 type cells, 152/211 diagonal flips, and 0/0 vegetation-eligibility changes. Archipelago medians/p95 were 64,091/64,490 height cells, 89,643/91,215 water cells, 95/132 type cells, 216/292 diagonal flips, and 1/12 vegetation-eligibility changes.

The type-only replay remains in the raw evidence to preserve the observed regression where a type-only event schedules vegetation work even though derived tree membership is unchanged. No attempt was made to fix that behavior in A1-0.

## Scope and limitations

- A1-0 changed only reproducibility scripts and evidence artifacts; World, hydrology, save encoding, RNG, rendering, and default world generation were untouched.
- Deterministic counts and hashes are portable checks. The local Node timing fields are not comparable to the original Xeon/Amazon Linux measurements.
- The current task sheet contains the operative PCC thresholds and contracts. A separate RFC v1.1 file was not present in the repository snapshot, so this report does not claim a line-by-line RFC document audit.

## Reproduction artifact locations

- Scripts: `scripts/perf-a0r/`
- Original evidence: `reports/analysis/g3/a1-0/original/`
- Local Windows reproduction: `reports/analysis/g3/a1-0/rerun-windows/`
- Exit state: `A1_0_EVIDENCE_READY`
