# Realm Style Profile v1

This note describes the shipped `realm-style-v1` presentation profile. The profile changes how existing Stage layers are shaded; it does not add simulation facts or new render-world topology.

## Ownership and routing

[`ArtPass`](src/inkbox/render3d/art/ArtPass.js) is the single style coordinator. For each `PlaneStage`, it resolves `realmStyleFor(stage.plane)` and passes that immutable realm style to the existing terrain, vegetation, entity, settlement, marker, water, and boundary materials that the Stage actually owns. The `stage.plane` value is the source of the material palette; an open realm view separately controls the boundary palette and paper background. In a cross-realm window, the background remains Mortal paper while the window target supplies the boundary style.

[`REALM_STYLES`](src/inkbox/render3d/art/RealmStyleProfile.js) is recursively frozen. `ART_PROFILES['realm-style-v1']` selects the mode; `resolveArtProfile` keeps custom control values bounded and immutable. Nothing is written to `World` or the save payload. Existing geometry, layer ownership, selection, picking, RegionGeometry and lifecycle stay in their current Host and Stage paths.

## Existing materials and semantic palettes

| Stage | Palette anchors and role | Existing layer use |
|---|---|---|
| Mortal | Paper `#ECE4D2`; ink `#303533`; blue-green `#70868A`; leaf `#A9B77D`; earth `#B58A5F`; cinnabar `#B75A49` | Terrain’s 23 entries follow `TERRAIN_INFO` indices. Existing water gets `#8FB5B8` at 0.43 opacity. Tree batches use three leaf colors plus five restrained tints. Existing house walls, grey roofs, wood, earth, and entity cloth/skin/accent keep their semantic roles. |
| Nether | Paper `#D5D1C7`; charcoal `#181A19`; cold grey-green `#353A39` / `#566D69`; muted earth `#66594D`; red `#8E302B` | Existing Nether terrain and entity batches only. Red is a restricted event/accent color; the 12-slot entity palette preserves neutral robe slots and assigns cinnabar to the soul-lamp glass slot. No Mortal settlements or vegetation are invented in Nether. |
| Upper | Paper `#E8DEC8`; mineral blue `#386786` / `#3C648C`; green `#3E8069`; terrain ochre `#D5BD85` / `#855A40` (old-gold `#B89B55` remains a reserved/semantic anchor); warm stone `#C8AE7C` | Existing terrain and entity batches only. The wash is attached to the terrain relief. No Upper vegetation, water, settlement, floating-island, or independent cloud layer is fabricated. |

Terrain pigment uses the existing indexed terrain identity and fixed profile palette. It is a material-local palette lookup, not a screen-wide grading LUT. Existing water geometry and semantic identity remain authoritative; only its style color and opacity are adjusted. Entity and building roles use the existing instanced materials and palette slots. The five tree silhouette variants are deterministic from `(world.seed, tree.cell)` via [`treeVariation.js`](src/inkbox/render3d/vegetation/treeVariation.js); the five scale triplets change presentation only and consume no simulation RNG.

The profile adds no fullscreen color LUT or `THREE.Fog`. `PilotMaterial` can use the bounded atmosphere values explicitly owned by each realm profile; browser evidence confirms `scene.fog` remains null, so there is no global fog leaking across Stages. Nether cinnabar remains sparse, Upper negative space remains open, and Mortal keeps warm human structures legible against land and water.

## Boundaries and limits

The palette does not imply new ecology or formal architecture. Upper currently has no authored floating-island topology: the pale valley wash is attached to terrain, and the paper background is the existing Stage background. Actual captures also use the existing character GLB and zoom cap. See the [visual evidence report](M2C2B0_VISUAL_REPORT.md) for matched legacy/profile images and the [performance report](M2C2B0_PERFORMANCE_REPORT.md) for measured workload limits.
