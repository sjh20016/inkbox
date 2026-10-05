# Four real Site families

This production extension follows the separately accepted cave pilot. It binds
only the existing Mortal `world.sites` kinds, through the marker layer's single
derivation. No Site behavior, coordinates, subtype, terrain or save fields change.

| assetId | Main recognizer | LOD0 / LOD1 / LOD2 triangles | Footprint / height |
| --- | --- | --- | --- |
| `mortal.site.secret` | Unexplained split stone entrance; unified across subtypes | 72 / 36 / 6 | 3.2 × 2.6 / 3.2 |
| `mortal.site.cave` | Recessed cliff entrance from the accepted pilot | 84 / 36 / 6 | 3.6 × 2.6 / 2.8 |
| `mortal.site.formation` | Low perimeter and eight stone array points | 144 / 48 / 6 | 4.2 × 4.2 / 1.1 |
| `mortal.site.ruin` | Broken wall, columns and fragments | 84 / 36 / 6 | 3.8 × 3.2 / 2.8 |

Each family is one closed, instanced recognizer, with zero separately allocated
helper modules. Secret and Cave share the reduced entrance silhouette; all four
share `env_site_shared_lod2`. The library and EnvironmentBatch decode/instantiate
eight unique Site nodes, rather than twelve per-ID LOD copies. Four simultaneously
submitted kinds use four detailed draws, three reduced draws, or one far draw.
There is no HLOD copy or separate Site identity for a fragment.

The Stage borrows all geometry/material resources. Capacity stays at 256 total
production Site records; the independent Site budget demotes after 64 LOD0 and
160 LOD1 entries. Excess production records retain their authoritative fallback
markers and contribute to overflow/fallback counters. Unknown kinds have a
separate marker bucket and never pretend to be one of the four production kinds.

The complete footprint must belong to the Stage's submitted Region and suitable
non-water terrain. Grounding remains the minimum center/corner Stage elevation.
If a short recognizer would be completely below its authoritative cell, it keeps
the marker (`groundRejected`) instead of being lifted or hiding the true identity.
Region, unsuitable terrain, missing assets and disabled production also fall back.

Picker records identify current `world.sites` entries; removal and actual
`stepSites` closure clear instance identity. The formal Node gate executes the
Secret's second-visit exhaustion and all four existing lifespan closures. It also
checks actual shipped GLB geometry, normalized closed components, shared node
identity/draws, Region, LOD, fixed capacity, resource ownership and World SHA.
Run `node scripts/inkbox-render3d-m2c2c-sites.mjs`. Browser evidence remains a
separate acceptance layer; CPU raycasts do not claim GPU or normal-camera proof.
