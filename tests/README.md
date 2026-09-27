# Inkbox test groups

| Group | Purpose | Entry points | Default |
| --- | --- | --- | --- |
| `core` | Fast module graph, minimal world advance, HTTP entry, and transient runtime-event contract | `inkbox-import-check.mjs`, `inkbox-core-check.mjs`, `inkbox-startup-check.mjs`, `inkbox-runtime-events.mjs` | Yes, through `npm test` |
| `runtime-events` | Bounded transient event queue, plane isolation, RNG neutrality, and save/load exclusion | `inkbox-runtime-events.mjs` | Yes, through `npm test` or directly with `npm run test:runtime-events` |
| `regression` | Four intervention outcomes and WorldEvents lifecycle/save-load | `inkbox-intervention-regression.mjs` | No; run `npm run test:regression` |
| `save-equivalence` | Extended field-level save equivalence, including 120 years before save and 60 years after reload | `inkbox-save-equiv.mjs` | No; run `npm run test:save-equivalence` when needed |
| `simulation` | Broad subsystem smoke; longer research runs remain opt-in | `inkbox-smoke.mjs`, `inkbox-longrun.mjs` | No; `inkbox-smoke.mjs` includes a 60-year large-world section |
| `diagnostic` | Historical exploratory output; not a product-health verdict | `reports/` | No |
| `legacy` | Frozen V3/V4 mainline checks that exercise `src/main.js` and old entry points | `scripts/v341-*` through `scripts/v400-*`, `module-import-smoke.mjs` | No |

The full checkout keeps historical probes and legacy checks for reference. The clean Inkbox package includes the active runtime, core and regression entry points, and selected simulation scripts; it omits research probes and frozen V3/V4 tests. A green `npm test` means the active Inkbox entry and fast core path work; it does not claim that every simulation probe or legacy branch was run.
