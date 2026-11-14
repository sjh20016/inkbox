# WX-E-M2 Edge evidence

Status: measurements in progress. The unchanged #72 checkout is being exercised with installed Edge, isolated profiles and the repository's owned CDP/server helpers. The user explicitly selected Edge. No Tabbit state or mock renderer is used.

The baseline reuses the reviewed E1C/E2R browser harness: formal v11 input loading, real pointer terrain stroke, official undo, settlement/G1 panels, realm windows, DOM save/load, stale-generation rejection and actual WebGL draw calls. Screenshots, console errors, raw rAF and long-task samples and owned cleanup receipts remain with the corresponding sample. A software backend, if returned by WebGL, is reported as such and is not hardware-GPU certification.

Candidate segmented measurements use `scripts/inkbox-e-m2-browser.mjs`. A/B mean diagnostics off/on on the same source, not different rules. Each trial loads its own original checkpoint, warms for five seconds and samples for thirty seconds. CPU profiling is explicitly separate (`--cpu-profile=1`); profiling trials are excluded from ABBA overhead conclusions. The sample is sealed before large export/serialization. Source/input hashes and exact environment are attached to every run.

Raw outputs are under `reports/local/wx-em2/`. Reports must retain failed/interrupted attempts. A run's `pass` refers only to its declared coverage; it cannot certify unexecuted matrix rows or all product interactions.
