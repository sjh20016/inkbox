# WX-E2R-a browser evidence

Serial baseline then candidate, 30 seconds per case after 5 seconds warmup at speed index 2. Both reports exited 0. Source and harness identities, report hashes, full measurements, screenshots and checks are recorded in [WX_E2RA_BROWSER_ACCEPTANCE.json](WX_E2RA_BROWSER_ACCEPTANCE.json).

Baseline HEAD `b83fbfb96134f915b7056d56aab99b88e71953c5`, report SHA-256 `0463fca0d37cfd56ab0ddd5d305c1c061ea4ff132aaea10ad40004b03bec4639`. Candidate HEAD `b5109848f92913c19fa1b8e700f223c4aee0a5dd`, report SHA-256 `9394e8c4cef71282f6457cb8afb5eb2d0c360653e60135013bf455326cb0d3cb`.
Environment: Windows 10.0.26200, Node v24.11.1, AMD Ryzen 9 8940HX with Radeon Graphics, Edg/157.0.4341.42; isolated headless Edge. Three cases report actual WebGL 2 on AMD Radeon 610M via ANGLE/D3D11. This is not front-display GPU certification.

| Age | Renderer / view | P95 baseline → candidate (ms) | P99 baseline → candidate (ms) | Actual days/s baseline → candidate | Candidate Frame JSON bytes |
|---:|---|---:|---:|---:|---:|
| 100 | canvas / overview | 22.3 → 22.3 | 23.0 → 22.4 | 6.008 → 6.009 | 139599 |
| 100 | canvas / detail | 22.3 → 22.3 | 22.4 → 22.3 | 6.010 → 5.999 | 139646 |
| 100 | 3d / overview | 16.8 → 16.8 | 22.3 → 22.3 | 6.006 → 6.006 | 139768 |
| 100 | 3d / detail | 33.5 → 38.8 | 44.5 → 44.5 | 5.997 → 6.004 | 142227 |
| 400 | canvas / overview | 105.8 → 100.2 | 122.5 → 111.2 | 5.979 → 5.992 | 366307 |
| 400 | canvas / detail | 94.6 → 100.2 | 100.2 → 111.4 | 5.996 → 5.988 | 367063 |
| 400 | 3d / overview | 83.6 → 100.2 | 94.7 → 105.8 | 5.998 → 5.992 | 374754 |
| 400 | 3d / detail | 100.2 → 94.6 | 111.3 → 116.8 | 6.004 → 5.998 | 375944 |

Each cell is one 30-second observation, not proof of stable FPS. Browser time uses variable dt, so paired runs are not the same simulation sequence and cannot establish L0 equivalence. Child realms are generated control realms, not natural aged three-realm histories. Frame JSON bytes are candidate ReadView projections; baseline has no equivalent projection. Raw long-task events and heap used bytes before, after and after reload (detail only) are retained in the JSON.

In detail cases, settlement and person panels were opened through official APIs and verified in the DOM; actual pointer input raised terrain and the official undo restored all changed cells. Upper and nether windows used official selectTool/commitSelection APIs, not pointer-drawn windows. Save and load used DOM controls and confirmation; candidate rejected a stale-world command after reload. Overview cases do not perform detail-only interactions. All cases reported no browser errors, complete owned-profile/process cleanup and exited servers. Screenshots are linked by path in the JSON.

Earlier smoke reports remain under the local browser directory. In particular smoke-three-1 used an invalid renderer argument and actually rendered Canvas; failed 3d attempts are preserved and are not Three acceptance evidence.
