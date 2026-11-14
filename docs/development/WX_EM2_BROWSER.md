# WX-E-M2 Edge acceptance

PASS for declared coverage:8 unchanged-combined baseline cases,72 formal current-source trials (24 configurations, three independent A/B/A samples each),58 S1/S1.1 active-reading checks across desktop/mobile Canvas and real software-WebGL function QA, plus two independent hardware-WebGL/Canvas CPU-profile+input trials. This does not approve future cross-frame product isolation.

Machine: Intel i3-12100, Edge157.0.4341.57,1366x768,DPR1; actual Three backend Intel UHD730/D3D11. Each formal trial independently loads the same original100/400-year v11 bytes, warms5s, samples30s. The inherited input SHA256 values exactly match the previously committed E1C/E2R acceptance inputs. Browser child realms are newly generated controls, not natural centuries.

27 successful rows were retained when the next owned Edge launch hit EBUSY. The bounded startup fix preserves all endpoint ownership checks, delayed ENOENT and EACCES rejection; only the remaining45 rows ran again. Both batches have exactly the same281 production-source paths/hashes and browser build. All72 profile/process cleanups and both servers completed. The failed startup profile was independently absent with0 matching Edge processes. Original interrupted report retained.

JS and rAF percentiles below are per trial, not pooled or subtracted from Node. A=diagnostics off,B=on. Speed indices0/2/5 are pause/2x/20x.

|Age|Renderer/view|Speed index|JS P95 A/B/A ms|rAF P95 A/B/A ms|Completed days/s A/B/A|
|---|---|---|---|---|---|
|400|canvas/detail|2|119.7 / 106.7 / 118.9|116.7 / 116.6 / 116.8|5.927 / 5.961 / 5.928|
|400|3d/detail|2|109.5 / 116.5 / 101.0|116.7 / 116.7 / 100.1|5.956 / 5.926 / 5.966|
|400|canvas/overview|2|126.8 / 125.9 / 126.6|166.6 / 183.3 / 166.7|4.926 / 4.783 / 4.871|
|400|3d/overview|2|86.3 / 91.0 / 114.2|83.4 / 100.0 / 116.8|5.984 / 5.976 / 5.937|
|400|canvas/detail|0|8.8 / 9.7 / 9.2|66.6 / 66.8 / 66.7|0.000 / 0.000 / 0.000|
|400|3d/detail|0|5.4 / 5.6 / 5.2|33.5 / 33.5 / 33.5|0.000 / 0.000 / 0.000|
|400|canvas/overview|0|13.6 / 12.4 / 15.8|149.9 / 150.0 / 150.4|0.000 / 0.000 / 0.000|
|400|3d/overview|0|5.3 / 6.3 / 5.6|16.8 / 16.8 / 16.8|0.000 / 0.000 / 0.000|
|400|canvas/detail|5|98.2 / 102.1 / 92.3|100.0 / 100.0 / 99.9|59.500 / 59.843 / 59.787|
|400|3d/detail|5|103.2 / 92.4 / 101.2|100.1 / 99.9 / 100.0|59.579 / 59.794 / 59.727|
|400|canvas/overview|5|114.2 / 120.4 / 121.9|166.7 / 166.8 / 166.6|49.129 / 48.291 / 50.064|
|400|3d/overview|5|85.9 / 83.3 / 98.9|83.4 / 83.4 / 100.0|59.735 / 59.787 / 59.769|
|100|canvas/detail|2|23.8 / 21.5 / 20.1|50.1 / 49.9 / 49.9|5.999 / 6.004 / 5.997|
|100|3d/detail|2|18.1 / 25.0 / 19.2|33.4 / 33.5 / 33.5|5.995 / 5.996 / 5.997|
|100|canvas/overview|2|25.9 / 26.0 / 33.6|66.8 / 66.8 / 83.3|6.000 / 6.004 / 6.009|
|100|3d/overview|2|20.6 / 19.5 / 22.1|16.8 / 16.8 / 17.0|5.998 / 6.000 / 5.947|
|100|canvas/detail|0|5.1 / 5.5 / 6.7|33.4 / 33.4 / 33.5|0.000 / 0.000 / 0.000|
|100|3d/detail|0|4.4 / 4.8 / 4.3|33.5 / 33.5 / 33.5|0.000 / 0.000 / 0.000|
|100|canvas/overview|0|6.6 / 6.8 / 6.6|66.8 / 66.8 / 66.8|0.000 / 0.000 / 0.000|
|100|3d/overview|0|4.8 / 4.1 / 4.0|16.8 / 16.8 / 16.8|0.000 / 0.000 / 0.000|
|100|canvas/detail|5|33.1 / 30.0 / 26.9|50.1 / 50.0 / 50.0|59.985 / 60.056 / 60.027|
|100|3d/detail|5|23.8 / 24.7 / 29.1|33.5 / 33.5 / 33.5|59.991 / 60.020 / 59.877|
|100|canvas/overview|5|33.8 / 29.2 / 32.3|66.8 / 66.8 / 66.8|59.985 / 59.951 / 60.034|
|100|3d/overview|5|22.6 / 31.1 / 26.5|33.3 / 33.4 / 33.3|59.969 / 58.523 / 58.237|

CPU profiling was OFF throughout this matrix. Two separate400-year2x detail runs retain full cpuprofile and raw timing files; large export occurs after sampling/profile sealing. Sampled stacks confirm residual readEffects and wanlingEffectAt work and GC; self-hit counts are in WX_EM2_BREAKDOWN.json, not presented as exact CPU percentages.

Input tests use actual pending previews/native mouse, Canvas touchCancel and Three trusted lostpointercapture; all five terrain layers restore, then8 real strokes and official undos per renderer. Node-issued→preview P95 Canvas269ms / Three114ms; release→authority-visible P95 161/107ms; full gesture→authority P95 393/299ms includes the deliberate110ms hold. Values include CDP transport and next-rAF visibility;8 samples each are limited latency evidence, not a broad guarantee. The Canvas Escape behavior is still layered dismissal, not paint cancellation; carry this exact debt into B.

Raw JSON, screenshot, cpuprofile, heap, timestamps, source/input hashes and cleanup receipts live in reports/local/wx-em2. JSON frame byte estimates are not actual heap allocation. Remaining GPU execution time and exact raster/compositor attribution are unmeasured; paused Canvas overview has rAF~150ms while owned JS~12-16ms, so the gap cannot be labelled Life or pure GPU time.
