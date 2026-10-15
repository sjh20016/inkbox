# Four real Site families

This production extension follows the separately accepted cave pilot. It binds
only the existing Mortal `world.sites` kinds, through the marker layer's single
derivation. No Site behavior, coordinates, subtype, terrain or save fields change.

| assetId | Main recognizer | LOD0 / LOD1 / LOD2 triangles | Footprint / height |
| --- | --- | --- | --- |
| `mortal.site.secret` | Unexplained split stone entrance; unified across subtypes | 72 / 36 / 6 | 3.2 × 2.6 / 3.2 |
| `mortal.site.cave` | Recessed cliff entrance from the accepted pilot | 84 / 36 / 6 | 3.6 × 2.6 / 2.8 |
| `mortal.site.formation` | Eight/four locally grounded stone array points | 96 / 48 / 6 | 4.2 × 4.2 / 1.1 |
| `mortal.site.ruin` | Broken wall, columns and fragments | 84 / 36 / 6 | 3.8 × 3.2 / 2.8 |

Secret, Cave and Ruin are closed single-instance recognizers. Formation LOD0/1
uses one closed 12-triangle `env_site_formation_stone` GLB module, shared by eight
or four presentation parts; its authored normalized offsets, widths and heights
are recorded in `compositeParts`. The radius remains .37 of the parent width;
LOD0 part widths remain .15 of it and alternating heights remain 1/.72 of the
parent height. LOD1 is the exact LOD0 cardinal subset (indices 0/2/4/6), retaining
width .15 and height 1.0; it never widens stones or reduces their height during
the LOD transition. The old low perimeter is omitted because its spanning faces buried
on slopes. Secret and Cave share the reduced entrance silhouette; all four share
`env_site_shared_lod2`. Seven unique Site nodes use four detailed draws, three
reduced draws, or one far draw. Four kinds on flat land submit 11/7/4 physical
instances and 336/156/24 triangles at the three LODs. A part always carries the
same current Site id, kind and authoritative center; it creates no World object.

The Stage borrows all geometry/material resources. Capacity stays at 256 Site
identities; the independent Site budget demotes after 64 LOD0 and 160 LOD1
identities. Only the Formation stone node has 2048 fixed physical instance slots,
allowing all 256 identities at eight parts each when LOD is disabled. Other nodes
retain 256 slots each. The seven nodes total 3584 slots / 229376 bytes of instance
matrix arrays, with no instance-color allocation. Their unique shipped geometry
arrays occupy 35640 bytes; the 65536-byte index atlas is shared with the entire
environment library. Normal all-Formation capacity submits 1184 parts: 64×8,
160×4 and 32×1. An entire group is reserved and validated before submission.
Excess identities retain fallback markers; `fallback` uses rendered identity
count, while `instances`/`triangles` count actual physical parts. `lod` counts
identities and `instanceLOD` counts parts. EnvironmentBatch counts physical LOD
from each successful record, including mixed LOD0/1 using the same node. Its
shared node advertises `lods:[0,1]` and `lod:null`. Unknown kinds have a
separate marker bucket and never pretend to be one of the four production kinds.

The complete footprint must belong to the Stage's submitted Region and suitable
non-water terrain, retaining the complete parent 4.2×4.2 Formation footprint and
raw relief limit .25. Formation stones individually use minimum center/corner
Stage elevation, at their original authored X/Z offsets. All sampled top corners
of every stone must clear terrain, or the whole Site keeps its marker; no partial
array replaces an identity. LOD2 and other families retain their original single
minimum-ground/authoritative-center guard. A rejected recognizer keeps the marker
(`groundRejected`), without lifting terrain or changing the Site position.
Region, unsuitable terrain, missing assets and disabled production also fall back.

Picker records identify current `world.sites` entries; removal and actual
`stepSites` closure clear instance identity. The formal Node gate executes the
Secret's second-visit exhaustion and all four existing lifespan closures. It also
checks actual shipped GLB geometry, normalized closed components, shared node
identity/draws, Region, LOD, fixed capacity, resource ownership and World SHA.
Run `node scripts/inkbox-render3d-m2c2c-sites.mjs`. Browser evidence remains a
separate acceptance layer; CPU raycasts do not claim GPU or normal-camera proof.

The genuine seed226/day72000 save's Formation105 at (90,101) demonstrated why
whole-footprint grounding was insufficient: only 9/96 stone triangle centroids
cleared terrain and all 48 old perimeter triangles were buried. The repaired
actual GLB eight parts expose 66/96 stone centroids and every top corner, with
minimum top clearance .190881 world units. This CPU evidence does not account
for tree/entity occlusion; the normal-camera GPU gate remains separate.
The natural save additionally admits all three actual LODs with 8/4/1 parts and
minimum actual top clearances .190881/.391959/.176532. The Site gate checks this
save when present at `reports/local/m2c2c/pilot/full-sites-natural-save.json`, or
at an explicit `INKBOX_SITE_NATURAL_SAVE` path (a missing explicit path fails).
Without that external cache, the report honestly marks natural coverage unavailable;
the always-run gate still validates the exact cardinal subset and sloped GLB tops.
