# Read-only realm scalar presentation

Package 6 maps only the actual Nether `veg` field to the existing terrain material.
No trace field, ghost density layout, city, new identity or save key is created.
The material keeps the existing river/type/height structure. High yin deepens
cold grey-green ink masses; low yin opens paper negative space. Sparse dry brush
and bone-white breaks stay in world space, without additional decoration density.

Package 7 adds the independently derived Upper `qi` grid through that same cache
protocol. Its mode restores clearer paper, quieter ink and modest mineral blue /
green layers with sparse warm ridge edges. Colors come from RealmStyleProfile.
High qi remains an environmental property: no Site, palace, sect anchor, platform
or floating topology is created. The readonly spatial proof records actual
walkable qi, entity qi quantiles, saturation and position changes; local target
selection is not presented as global pathfinding or a renderer-induced behavior.

The fixed medium seed 20260923 recipe reached day 21600 by ordinary 3-day steps.
Sixty annual samples observed twelve cultivators (720 entity-years), with no
mortal subgroup in this recipe. Walkable qi p10/p50/p90 was .684/.936/1 and 26.40%
of walkable cells saturated at 1. At year 60, 75% of current entity cells and
91.7% of stored target cells saturated; mean target-minus-current qi was .0062.
Per-entity cumulative annual endpoint distance averaged 1487.39 cells and
first-to-last displacement 39.03; these are sampled endpoints, not reconstructed
paths. Six full World/advanceState SHA probes confirmed a readonly observer.
High initial qi, saturation, one seed and annual cadence limit the conclusion
to compatibility with the existing local sampler, not global attraction.
The 217384-byte detailed JSON stays in ignored reports/local/m2c2c/upper-qi;
SHA256 09ea880d8f9d68a2aeb3c1ee3618eb53353644913a75b1207965603b0d3e4a99.

Each supported PlaneStage owns one lazy ScalarFieldTexture. Its exact World-size
cache uses one normalized byte per cell (RED/UNSIGNED_BYTE, R8); no RGBA32F scalar
allocation. Values clamp to [0,1] and round to bytes. Linear sampling and three
nearby taps translate the actual field into broad masses, never into a new fact.
The cache scans at most once per 0.25 seconds while the Stage is visible, production
is enabled and terrain art is active. Only changed bytes request an upload.

r186 supports partial DataTexture update ranges only for RGBA. Therefore each
dirty R8 refresh requests one bounded full-grid upload, without updateRanges.
Counters record scan time, changed cells, upload requests and requested bytes;
requests may be coalesced before a GPU frame. The bounded cadence is an explicit
technical debt while Upper qi has no Bridge dirty channel; the Bridge is unchanged.

Toggles retain the cache and the fixed terrain shader. Re-enable reads current
World values, and Stage replacement disposes its texture exactly once. The
terrain borrows the cache and continues using the same Region quad index mask;
three realms never share field textures. With geography disabled the field-mode
uniform is zero and borrows the existing type texture, requiring no scalar upload.

Node acceptance checks the byte protocol, unchanged-frame uploads, missed-change
resync, actual World identity, uniforms, Region isolation, toggles and disposal.
GPU compilation, history comparisons and normal compositions are accepted later
by the separate product-RAF browser matrix, not inferred from these CPU checks.
