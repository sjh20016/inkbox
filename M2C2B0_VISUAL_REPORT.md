# M2-C2B0 Visual Acceptance Report

The B5 visual matrix was accepted after fresh PNG inspection. All 24 legacy / `realm-style-v1` pairs use the same camera pose within each pair and have identical triangle and draw-call counts. The eight representative release goldens are linked below; every PNG for the full 24-pair matrix remains under the local ignored reports tree.

## Release goldens

| View | Legacy | Realm Style v1 |
|---|---|---|
| Mortal overview | [PNG](reports/release/render3d-m2c2b0/golden/mortal-overview-legacy.png) | [PNG](reports/release/render3d-m2c2b0/golden/mortal-overview-realm-style-v1.png) |
| Nether overview | [PNG](reports/release/render3d-m2c2b0/golden/nether-nether-overview-legacy.png) | [PNG](reports/release/render3d-m2c2b0/golden/nether-nether-overview-realm-style-v1.png) |
| Upper overview | [PNG](reports/release/render3d-m2c2b0/golden/upper-upper-overview-legacy.png) | [PNG](reports/release/render3d-m2c2b0/golden/upper-upper-overview-realm-style-v1.png) |
| Cross-realm Nether breach, near | [PNG](reports/release/render3d-m2c2b0/golden/cross-cross-nether-breach-near-legacy.png) | [PNG](reports/release/render3d-m2c2b0/golden/cross-cross-nether-breach-near-realm-style-v1.png) |

## Reviewed results

- Mortal reads as warm land, blue-green water, restrained five-way tree variation, real houses and recognizable cultivators. The paired 179,874-triangle overview retains 12 draw calls. Near, mid, and far HLOD views preserve real house and settlement identity; the B5 matrix includes the accepted views.
- Nether reads through charcoal and cold greys, with muted dry-brush structure. Its 121 naturally-derived residents include 120 ghosts and one `ghostCultivator`; the real cultivator body renders and picks at LOD0, and cinnabar is reserved for actual soul-lamp glass and real Rift/breach accents. The separate B4 cross fixture advanced four real new Nether rifts naturally before breach captures.
- Upper reads through mineral blue/green, ochre, ivory gaps, and actual highland relief. It uses existing terrain and entities; it does not claim a floating-island or cloud topology.
- Cross-realm captures show target ownership on both sides. For Upper and Nether windows, measured ownership mismatches were zero. The oblique boundary proof compared 6,336 seam samples with zero mismatches; each tested target boundary had 40 intersecting breach edges. Near/far picking had zero depth and entity identity mismatches. GL error, console error, and runtime error counts were zero; all tested shader programs linked, and global `scene.fog` stayed null.
- Window creation is an intentional simulation action: it may add legitimate age-zero rifts. The proof compares full World + `advanceState` digests after setup and after pure rendering; those two digests match. This separates setup effects from style/camera changes.

## Full matrix image paths (local, ignored)

The complete 24-pair / 48-PNG list is recorded in [the matrix manifest](reports/m2c2b0/b5-matrix-final/matrix.json), with per-suite evidence in `reports/m2c2b0/b5-matrix-final/{mortal,nether,upper,cross}/evidence.json`. These artifacts are intentionally local and ignored by Git; they are not release goldens. Each table entry below links both source PNG paths.

| Pair | Legacy PNG | Realm Style v1 PNG |
|---|---|---|
| mortal / overview | [legacy](reports/m2c2b0/b5-matrix-final/mortal/overview-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/mortal/overview-realm-style-v1.png) |
| mortal / settlement-near | [legacy](reports/m2c2b0/b5-matrix-final/mortal/settlement-near-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/mortal/settlement-near-realm-style-v1.png) |
| mortal / settlement-mid | [legacy](reports/m2c2b0/b5-matrix-final/mortal/settlement-mid-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/mortal/settlement-mid-realm-style-v1.png) |
| mortal / settlement-far-hlod | [legacy](reports/m2c2b0/b5-matrix-final/mortal/settlement-far-hlod-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/mortal/settlement-far-hlod-realm-style-v1.png) |
| mortal / wateredge | [legacy](reports/m2c2b0/b5-matrix-final/mortal/wateredge-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/mortal/wateredge-realm-style-v1.png) |
| mortal / forest | [legacy](reports/m2c2b0/b5-matrix-final/mortal/forest-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/mortal/forest-realm-style-v1.png) |
| mortal / character | [legacy](reports/m2c2b0/b5-matrix-final/mortal/character-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/mortal/character-realm-style-v1.png) |
| nether / overview | [legacy](reports/m2c2b0/b5-matrix-final/nether/nether-overview-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/nether/nether-overview-realm-style-v1.png) |
| nether / terrain-close | [legacy](reports/m2c2b0/b5-matrix-final/nether/nether-terrain-close-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/nether/nether-terrain-close-realm-style-v1.png) |
| nether / entity-close | [legacy](reports/m2c2b0/b5-matrix-final/nether/nether-entity-close-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/nether/nether-entity-close-realm-style-v1.png) |
| nether / Mortal-Nether window | [legacy](reports/m2c2b0/b5-matrix-final/nether/mortal-nether-large-window-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/nether/mortal-nether-large-window-realm-style-v1.png) |
| upper / overview | [legacy](reports/m2c2b0/b5-matrix-final/upper/upper-overview-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/upper/upper-overview-realm-style-v1.png) |
| upper / highland-cliff | [legacy](reports/m2c2b0/b5-matrix-final/upper/upper-highland-cliff-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/upper/upper-highland-cliff-realm-style-v1.png) |
| upper / entity-close | [legacy](reports/m2c2b0/b5-matrix-final/upper/upper-entity-close-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/upper/upper-entity-close-realm-style-v1.png) |
| upper / cloud-negative-space | [legacy](reports/m2c2b0/b5-matrix-final/upper/upper-cloud-negative-space-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/upper/upper-cloud-negative-space-realm-style-v1.png) |
| upper / Mortal-Upper window | [legacy](reports/m2c2b0/b5-matrix-final/upper/mortal-upper-large-window-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/upper/mortal-upper-large-window-realm-style-v1.png) |
| cross / Upper overview | [legacy](reports/m2c2b0/b5-matrix-final/cross/cross-upper-overview-upper-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/cross/cross-upper-overview-upper-realm-style-v1.png) |
| cross / Upper breach near | [legacy](reports/m2c2b0/b5-matrix-final/cross/cross-upper-breach-near-upper-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/cross/cross-upper-breach-near-upper-realm-style-v1.png) |
| cross / Upper breach far | [legacy](reports/m2c2b0/b5-matrix-final/cross/cross-upper-breach-far-upper-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/cross/cross-upper-breach-far-upper-realm-style-v1.png) |
| cross / Upper breach oblique | [legacy](reports/m2c2b0/b5-matrix-final/cross/cross-upper-breach-oblique-upper-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/cross/cross-upper-breach-oblique-upper-realm-style-v1.png) |
| cross / Nether overview | [legacy](reports/m2c2b0/b5-matrix-final/cross/cross-nether-overview-nether-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/cross/cross-nether-overview-nether-realm-style-v1.png) |
| cross / Nether breach near | [legacy](reports/m2c2b0/b5-matrix-final/cross/cross-nether-breach-near-nether-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/cross/cross-nether-breach-near-nether-realm-style-v1.png) |
| cross / Nether breach far | [legacy](reports/m2c2b0/b5-matrix-final/cross/cross-nether-breach-far-nether-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/cross/cross-nether-breach-far-nether-realm-style-v1.png) |
| cross / Nether breach oblique | [legacy](reports/m2c2b0/b5-matrix-final/cross/cross-nether-breach-oblique-nether-legacy.png) | [v1](reports/m2c2b0/b5-matrix-final/cross/cross-nether-breach-oblique-nether-realm-style-v1.png) |

Machine-readable accepted summaries live in `reports/release/render3d-m2c2b0/summary/visual-matrix.json`, `cross-realm-proof.json`, `mortal-style-proof.json`, `nether-style-proof.json`, `upper-style-proof.json`, and `purity.json`.
