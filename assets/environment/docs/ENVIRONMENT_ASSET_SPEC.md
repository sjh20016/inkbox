# Environment asset library

This directory contains the first production environment sample: `mortal.house.base`, bound only to a current `STRUCT.HOUSE`. Its visual owner remains the existing village and original house coordinates.

## Source and LODs

`source/bld_house.glb` is the authored `美术素材/实验建筑资产/建筑/bld_house.glb` input. Run `node assets/environment/source/build-environment.mjs` from the repository root to rebuild the shipped GLB, palette-index atlas, and manifest. The builder uses Node's built-in `zlib`; it adds no npm dependency or package script.

The source has 80 triangles and bounds `[-0.46, 0, -0.42]` to `[0.46, 0.86, 0.42]`. The builder centers X/Z, moves the ground pivot to Y=0, and independently normalizes width, height, and depth to one. It keeps the authored 8×8 semantic UV slots and transforms normals by the inverse transpose of the normalization scale. The renderer restores the original derived footprint and presentation height with nonuniform instance scale.

| Module | Triangles | Geometry |
| --- | ---: | --- |
| `env_house_base_lod0` | 80 | Authored source geometry, ground-centered unit bounds |
| `env_house_base_lod1` | 30 | Simple wall, X-axis main gable roof, one warm eave beam; no door, posts, or plinth |
| `env_house_base_lod2` | 8 | Shared tiny roof silhouette with the source X-axis ridge |

LOD1 spans unit width and height. Its wall reaches Y=0 after removal of the source plinth, so it does not float above the terrain anchor. Rotation starts at zero. This sample does not encode HALL, household class, or a separate identity for subparts.

## Atlas and manifest

`materials/EntityAtlas.png` is a 128×128 nearest-sampled index texture with an 8×8 grid. Each cell stores `slot + 1` in its red byte. The loader disables mipmaps and color-space conversion; it resolves the decoded slot through the 28-entry palette order in `data/palette_slots.json` and RealmStyleProfile at runtime. The PNG contains no authored display-color palette.

`mesh/environment_library.glb` has one shared glTF material, one external atlas URI, identity-transformed ASCII nodes, and one primitive per LOD. `data/environment_manifest.json` records source provenance, unit bounds, decoded triangle expectations, UV semantic slots and the stable asset id. The runtime library validates these fields against decoded geometry before exposing it to batches.

Source and builder files are development inputs and must stay out of the player package. Ship the generated GLB, atlas, manifest, palette slot list, runtime modules, and this specification only after the package audit accepts them.
