# WX-E2R-a delivery record

Branch `arch/wx-e2ra-world-readview` from green E-INT `b83fbfb`. First contract commit `f0a6510`; production consumer/main/lifecycle/bridge source received independent review before the main cost pin. This remains an incremental synchronous boundary with documented legacy readers, without a Worker or new simulation schedule.

Production seams:
1. Canvas `main.js` -> `UnitsLayer.drawEntities` receives the frozen `renderFrame(world,'mortal')` list in original entity array order.
2. Three `deriveEntities` uses the same `renderFrame` factory for canonical entities, while retaining existing class/ID sort, mortal auxiliary visual containers and LOD.
3. HUD seed uses `getWorldStatus`; `realmInspector` settlement and house cards use `getSettlementInspection`, which copies existing card rows and does not return a village or World.
4. Canvas pointer click/drag calls the synchronous `CommandBridge`, forwarding the entire existing `applyTool` with G7 guards, History and feedback. Stale world generation is rejected; cancellation remains at existing pointer boundary.

Correctness: actual complete production applyTool and undo bodies are extracted unchanged from fixed #66 and run with the same command/step sequences, with extra candidate projections/queries. Natural100/400y90d dt3 and3d dt0.1 preserve complete World, all runtime/RNG including playerRng, Three derivation rows and independent v11 forks. Formal fresh three-realm controls also match; they are not aged natural histories. [WX_E2RA_L0_ACCEPTANCE.json](WX_E2RA_L0_ACCEPTANCE.json) includes exact source, inputs, runtime states and full content-addressed output snapshots. Those full World JSON files are delivered with local evidence.

`test:wx-e2ra` checks actual Canvas draw primitives including injury bars, immutable/copied facts, generation/plane rejection, terrain copies and real source/read red cases. Natural read tracing is recorded in WX_E2RA_READ_AUDIT.json. Core/G7/Render3D M1+bridge/G2.6 passed. The complete local npm ci + commissioned base sequence, original E0/E1, new E2R-a, save-equivalence, three-realms, build/package passed; [WX_E2RA_GATE.json](WX_E2RA_GATE.json) preserves the actual source/exits. Earlier interrupted long tests are not substituted for these completed runs.

100y detail correctness smokes passed on real Canvas and actual WebGL Three: actual pointer terrain changes/official undo, settlement and person panels, formal upper/nether windows, UI save/load, stale generation rejection and owned cleanup. Failed/mislabeled harness attempts remain in local evidence. These short smokes are NOT performance acceptance. Full30s comparison matrix and final-head Fast/Heavy are still pending here. E2R-b debt is in `WX_E2RA_READ_SURFACE.md` and `WX_E2RA_FOLLOWUP.md`.

Rollback: revert the consumer commit to leave the standalone contract, or revert both E2R commits. Neither commit changes simulation or save schema.
