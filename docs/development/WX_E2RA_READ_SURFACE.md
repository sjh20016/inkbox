# WX-E2R-a world read surface

Static source inventory on E-INT anchor. Runtime opt-in tracing and real Edge coverage remain separate evidence; this file does not claim that all World reads were migrated.

| Consumer | Frequency | Authority read / write | E2R-a path and remaining debt |
|---|---|---|---|
| `main.js` frame/update/advanceDays | RAF / committed game days | World day, camera, terrain, runtime writes | Unchanged synchronous simulation; Canvas entity call now supplies RenderFrame. Clock and RNG stay authoritative. |
| `render/unitsLayer.js` drawEntities | Canvas frame | Entities x/y/tx/ty/sp/level/faction/face/id; terrain height and faction colors | Entity list from shared RenderFrame; terrain height and faction palettes remain World facade. Draw order remains source array order. |
| `render/terrainLayer.js`, camera, overlay, presentationStage | redraw / frame / click | Five terrain arrays, height, access, FX, selection | World compatibility debt; camera picking depends on more than entity coordinates. |
| `render3d/stage/PlaneRenderProfile.js` -> `EntityLayer` | 15 Hz derivation | Canonical entities plus mortal wanling/biyi/wraiths | `deriveEntities` canonical list uses shared RenderFrame with refresh; auxiliary containers and appearance/terrain reads remain explicit compatibility debt. Existing class/ID sort retained. |
| `render3d/WorldRenderBridge.js`, Render3DAdapter | dirty / frame / input | Five terrain layers, picking, G7-like 3D commands | Existing terrainChanges bounded journal reused by TerrainReadView. Actual GPU terrain upload and 3D commands remain existing paths. |
| `ui/qol.js` world info | world/load/renderer state | Seed | Seed HUD text and title from getWorldStatus Query. Clipboard action remains legacy command. |
| `ui/realmInspector.js` settlement / house | click | Village/ruin, society, condition | Bounded getSettlementInspection Query computes existing card then copies primitive rows and identity. Other inspection kinds remain World reads. |
| `ui/railPanels.js`, G1/mingpu | periodic / click / edit | World entities, watch, biography, mutations | Unmigrated. `markWatchRead` is an authoritative observation write, not a passive read. |
| `main.js` Canvas pointer / applyTool / undo, G7 | click/drag/cancel | Permission checks and World writes | Pointer applyTool dispatch uses CommandBridge then executes complete original applyTool. Selection and 3D stroke remain legacy; History cancel/undo semantics unchanged. |
| Save/load and `newWorld` | manual | Full World/runtime/RNG replace | No save schema changes. World identity gives a new generation; stale bridge input rejected. |

`terrainChanges` journal is bounded at 2048 records per World and can signal full refresh on overflow. TerrainReadView copies all five arrays on initial/overflow and changed rectangles on notification; it does not hold a second authoritative terrain. Canvas legacy realm-view/API calls can still omit the optional Frame, which is registered compatibility debt; the production mortal call always supplies it.

`scripts/inkbox-wx-e2ra-read-audit.mjs` now performs opt-in Proxy access tracing of the actual RenderFrame, HUD Query and settlement Query on genuine100/400y restores. [WX_E2RA_READ_AUDIT.json](WX_E2RA_READ_AUDIT.json) folds array indices into field families and records no writes. Complete serialized World/runtime/RNG before/after is identical. Maps/Sets/typed arrays are leaf containers in this tracer; it is not a trace of every main/Camera/Presentation/G1 reader. No production Proxy is installed.

[WX_E2RA_READ_CONTRACT.json](WX_E2RA_READ_CONTRACT.json) registers the migrated producer fields and legacy debt. `test:wx-e2ra` rejects direct canonical entity reads in migrated Three derivation and unknown World fields at the projection boundary, including actual injected direct/bracket source red examples. It does not impose a whole-repository World ban.
