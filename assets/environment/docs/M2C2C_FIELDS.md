# Read-only realm scalar presentation

Package 6 maps only the actual Nether `veg` field to the existing terrain material.
No trace field, ghost density layout, city, new identity or save key is created.
The material keeps the existing river/type/height structure. High yin deepens
cold grey-green ink masses; low yin opens paper negative space. Sparse dry brush
and bone-white breaks stay in world space, without additional decoration density.

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
