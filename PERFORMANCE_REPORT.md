# M2-C performance evidence

Final source: `reports/release/render3d-m2c/evidence.json`, captured on 2026-10-03 in Microsoft Edge 154, WebGL2 / ANGLE Direct3D11, Intel UHD Graphics 730. Browser viewport is 1500 × 940; the playfield drawing buffer is 1086 × 806 at DPR 1. No other test browser or CLI batch ran during this final measurement.

The commit field is the base revision (`c1596291c14f9c23c2af3361186b037699745bc2`), not a claim that the dirty tree equals that revision. Captured rendering source digest is `99a51fe99ce0ab3a82c12dea6f5c0a789c194040b07a56295fec3bc699b5d63b`; the JSON includes every rendering file hash and all three worldgen hashes.

These are **CPU-visible frame timings**, not GPU timer-query measurements. Submission samples time one explicit `renderer.render()` call after five warmup frames; 60 samples per profile are taken on consecutive animation frames. The application loop remains active, so the adjacent requestAnimationFrame interval measures browser scheduling plus the product loop and the extra test submission. Neither column proves GPU time or guarantees 60 FPS. Timer precision and short sampling make the smaller CPU numbers noisy; pigment/pilot appearing faster than baseline is not an optimization claim.

All four overview profiles share GOLDEN_A seed 20260930, small 200 × 128 map, day 1440, the same world digest and camera recipe. World creation resets sandbox RNG before newWorld, including greetOnBoot draws, resets advanceState, and advances one day per call. The actual world contains 119 entities, 14 cultivators, six villages and 89 houses.

| Profile | Submission mean / median / p95 ms | rAF mean / median / p95 ms | Draw calls | Triangles | Aggregate instances | Product RT |
|---|---:|---:|---:|---:|---:|---|
| Baseline | 0.538 / 0.500 / 1.100 | 16.672 / 16.700 / 16.800 | 11 | 118,676 | 6,955 | none |
| S1 pigment | 0.273 / 0.200 / 0.500 | 16.668 / 16.700 / 16.800 | 11 | 118,676 | 6,955 | none |
| S1 + S2 ink | 0.357 / 0.400 / 0.700 | 16.665 / 16.700 / 16.900 | 11 | 118,676 | 6,955 | none |
| S1 + S2 + pilots | 0.275 / 0.200 / 0.600 | 17.503 / 16.700 / 33.300 | 11 | 384,656 | 3,584 | none |

Aggregate instances sum the entities, vegetation mesh count and logical buildings in visible stages; this does not measure the count of unoccluded screen pixels or faces. Baseline vegetation submits two crossed cards per tree, whereas a pilot tree submits one volume. Buildings are counted once despite separate wall/roof batches. The pilot rAF p95 reaches 33.3 ms in this short sample, so this evidence does not support an unconditional stable-60-FPS claim.

S0.5 uses the same renderer for a temporary linear-color RT + DepthTexture + MSAA4 → fullscreen triangle. Each configuration has 30 measured submissions after five warmup submissions. No S3 art composition was implemented or enabled; the probe is a compatibility experiment and all allocations are disposed.

| Probe DPR / scale | RT resolution | Submission mean / median / p95 ms | Extra mean over direct ms | Color max byte error | Depth / framebuffer / resize |
|---|---|---:|---:|---:|---|
| 1 / full | 1086 × 806 | 0.130 / 0.100 / 0.200 | 0.087 | 2 | pass |
| 1 / half | 543 × 403 | 0.077 / 0.100 / 0.100 | 0.033 | 2 | pass |
| 1.5 / full | 1629 × 1209 | 0.207 / 0.200 / 0.500 | 0.163 | 2 | pass |
| 1.5 / half | 815 × 605 | 0.147 / 0.200 / 0.200 | 0.103 | 2 | pass |

Known-color direct and copied readbacks differ by at most two bytes after linear 8-bit quantization. Depth sampling distinguishes occupied pixels from clear background. All four framebuffer checks and post-allocation color/depth/MSAA resizes return GL error zero. GPU memory is 21 geometries / seven textures both before and after the probe. Gate is true for compatibility; it does not establish a sustained UHD 730 budget for default postprocessing. S3 remains absent from the shipping path.

The 600-frame bounded lifecycle run rotates 360°, zooms 1.45–18, resizes/restores the playfield, opens upper/nether windows and switches all profiles. After warmup and at frame 599, resources remain 21 geometries / seven textures. Recorded simulation facts stay unchanged. rAF mean / median / p95 are 21.341 / 16.700 / 16.800 ms; the mean includes test-side synchronous picking and transitions. Three 432-point raycast grids produce 149 upper-window hits (48 upper, 86 mortal, 15 boundary), 145 nether-window hits (56 nether, 89 mortal), and 200 mortal hits, with zero invisible-plane mismatches. This roughly ten-second run is a finite stability check, not endurance testing; the separate soak report provides the longer run.

All 32 screenshots have complete manifests. Repeated scenario recreation yields one entire-world-plus-advanceState SHA256 per scenario: GOLDEN_A has 20 matching manifests, DENSITY_A eight, TERRAIN_STRESS four. Medium/close cultivator and house-tree-character shots additionally prove five of five body projections reach the intended entity before any terrain, house or tree; ordinary picker identity also matches. Candidate selection changes the camera and POI only. No entity positions, terrain, buildings or tree facts are fabricated or moved.

Earlier runs exposed a reserved GLSL word, inadequate occlusion checks and host-wide out-of-memory failures when heavy CLI jobs overlapped leftover headless processes. Those failures prompted the shader fix, complete opaque-scene visibility checks, sequential testing, and graceful Browser.close/process-tree cleanup. They are not final performance results. Final official collection exits zero with no browser runtime or shader errors, and leaves no added headless Edge process tree.

## Independent 6000-frame stability and texture probe

`scripts/inkbox-render3d-m2c-soak.mjs` ran alone in a fresh Edge session after screenshot collection. `soak-evidence.json` records 6000 frames over 100147 ms on the real DENSITY_A world. Twenty 300-frame chunks rotate one full revolution, resize/restore, repeatedly toggle baseline/pilot and keep the world paused. From the settled samples, resources remain 14 geometries / 3 textures with unchanged program count and profile identity. The entire raw World fingerprint is identical before/after. All chunks report GL error zero; the command exits 0. rAF average/median/p95 are 16.695/16.700/16.800 ms. This is a bounded roughly 100-second run, not an hours-long endurance or arbitrary-density guarantee; it does not supersede the pilot overview p95 of 33.3 ms.

The same session performs a real GPU readback of a synthetic 7×5 non-power-of-two TerrainDataTextures fixture, leaving the Sandbox world untouched. A 0.32-cell offset preserves nearest categorical IDs. Raw/final elevation samples, type-only and height-only one-cell RGBA uploads and all untouched neighbor bytes pass; GL error is zero and temporary geometry/texture counts return to 14/3. This verifies the r186 partial-upload path beyond Node-side buffer assertions.
