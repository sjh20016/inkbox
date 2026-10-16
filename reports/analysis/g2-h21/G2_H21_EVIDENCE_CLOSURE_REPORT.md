# G2 H2.1 Evidence Closure

- Verdict: **H21_EVIDENCE_PARTIAL**
- Analysis parent: `analysis/g2-h2-runtime-hydrology-attribution-luna`
- Product baseline used by H2: `74934a8b1360af9007c69935d5becdf8f9809872`
- Raw matrix: **12/12 runs**, 300 measured frames each, 4 scenarios × 3 modes/repeats
- Browser/device: Edge 155.0.4283.45, Intel UHD Graphics 730 / ANGLE D3D11, 512×320, DPR 1

## Evidence that remains useful

The raw JSON records remain locally available. An integrity manifest records a SHA-256 for each raw file, scenario, timing mode, browser/GPU, viewport/DPR, and every source identity recorded at measurement time. The archive contains the original raw files unchanged. It is retained locally under the ignored `reports/analysis/g2-h21-local-evidence/` directory; raw performance records and per-run source metadata are not part of the repository upload.

The independent recalculation completed from all 12 raw files and reproduced the CPU attribution. In the standard Three scene, `stepHydrology()` p95 was 19.50 ms; Three render CPU p95 on hydrology frames was 88.20 ms. The inclusive terrain and water groups were 17.60 ms and 25.30 ms p95, respectively. These are instrumented measurements, and group p95 values come from different frames, so they must not be added. The detailed instrumentation also snapshots three full fields and adds work outside the timed hydrology call. This supports the conclusion that downstream Three work is a stronger optimization target than treating direct hydrology CPU as the only bottleneck; it is not a formal player FPS result.

## GPU upload metric correction

The historical `gpuUploadBytes` field is preserved byte-for-byte in raw records. Its old wrapper summed whole CPU view lengths and numeric `bufferData` capacities without decoding overloads. The reported ~1.9 GB per-frame value is therefore a mixed diagnostic estimate. It is neither a valid upload-source upper bound nor a driver-confirmed transfer or VRAM traffic measurement.

The H2.1 wrapper now classifies buffer and texture calls separately. Whole buffer sources and typed-array subranges count as known API input bytes; a numeric `bufferData` value is reported as allocation capacity, not uploaded bytes. Uncompressed texture data is only an input-byte upper bound and remains unknown for effective byte count when format/type, pixel-store alignment, skips, or PBO state are not decoded. Opaque texture sources and unsupported overloads remain unknown. The counters describe bytes presented to WebGL calls, never confirmed GPU transfer.

Seven unit cases pass: full TypedArray, view, WebGL2 offset/length, numeric buffer capacity, uncompressed texture update, opaque/PBO unknowns, and counter aggregation.

## Source identity and probe isolation

All 12 captures identify the P1 product head and the instrumented hydrology source. Their recorded source hashes remain in the original JSON and integrity manifest. H2.1 changed the current profiling and recalculation scripts after the measurements, so those two files naturally differ from the captured hashes; the measurement-time versions remain identified by their recorded SHA-256 values. The hydrology and product-source identities match. The raw data is independently recalculable with the closure script, which now exits nonzero unless the complete expected 12-run, 300-frame matrix is present.

The hydrology diff adds guarded snapshots/timers around the existing calls. With the probe absent or disabled, the original call order and return shape remain intact. A same-seed comparison against P1 passed for 24 hydrology calls and 24 formal `advanceWorld` calls: World dimensions/day/year, serialized World/save SHA-256 (`8b16547505ea0b3b91f9285ffa619e78f3936a5aa6369393ed11a771bb7ace5d`), `advanceState`, hydrology return sequence, and 16 subsequent outputs from each Life/ecology RNG all match. The machine evidence is in the local package. H3 uses a separate clean worktree at the P0.3 hardening commit and does not inherit the H2 hydrology probe.

## Limits and H3 readiness

This closure corrects interpretation and preserves local evidence; it does not retroactively produce exact GPU transfer byte counts for the historical captures. The raw evidence is deliberately local because it includes per-run source identities and detailed project-derived timing records. CPU attribution remains usable for selecting a Three rendering hotspot, provided H3 independently measures the clean P0.3 product build before changing product code.

**H2.1 verdict: `H21_EVIDENCE_PARTIAL`.** The CPU findings are suitable as a hypothesis for H3. The historical upload-byte values are not suitable as optimization evidence.
