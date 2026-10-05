# Environment asset library

M2-C2B Packages 3–4 ship three visual families for current STRUCT.HOUSE and a separate family for current STRUCT.HALL: mortal.house.base, mortal.house.small and mortal.house.courtyard. All retain the real village and original house coordinates. Courtyard is a roof silhouette; neutral timber replaces source cinnabar and gold. It implies no new wealth class, household or site.

## Source and LODs

Run node assets/environment/source/build-environment.mjs to rebuild the one runtime GLB, index atlas and manifest. Source inputs are the project's authored bld_house, bld_hut, bld_manor and bld_hall GLBs. Development source and preview files stay out of the player package.

| Family | LOD0 | LOD1 | LOD2 | HLOD cluster | Roof |
| --- | ---: | ---: | ---: | ---: | --- |
| base | 80 | 30 | 8 | 14 | X-axis gable |
| small | 128 | 30 | 8 | 14 | Warm thatch gable |
| courtyard | 188 | 30 | 8 | 14 | Inset hip ridge |
| hall | 116 | 30 | 8 | 14 | Main gable and warm timber |

The builder centers X/Z, places the ground pivot at Y=0 and independently normalizes the authored dimensions. Normals use the inverse transpose. LOD1 removes doors, plinths and secondary posts and keeps one warm eave beam. LOD2 keeps only the roof. HLOD retains white walls, roof type and orientation in the existing 2–4 clusters, with gaps and real member ownership.

houseFamilyFor reads seed, real village identity, permanent center and original house coordinates. Stable radial bands and coherent rows choose families without RNG. Level, population, neighbor removal, array order and camera changes cannot reassign a surviving house. Opposing rows share a ridge axis and face the center. Each house uses existing Stage elevation at its real cell; this creates no terrain flattening or corner-conforming foundation.

The production center proxy is reduced to 40% of its old dimensions so it does not swallow the houses. It remains a derived, non-identifying symbol. Current STRUCT.HALL records now use the authored bld_hall through the same shared batches, with their existing 1.6 size multiplier. Source red/gold are neutralized because HALL alone does not prove a wealthy sect. The same exact house key remains the identity. Faction capital anchors do not authorize gate, wall or tower assets.

## Atlas and ownership

EntityAtlas.png is a 128×128 nearest index texture, with 8×8 cells storing slot+1 in the red byte. No mipmaps or color-space conversion. RealmStyleProfile resolves the 28 semantic slots and remains the runtime color authority.

The GLB has one shared glTF material, one external atlas URI, identity-transformed ASCII nodes and one primitive per module. Runtime validation compares manifest bounds, counts and semantic slots with decoded geometry.

Fixed-capacity InstancedMesh batches borrow library geometry and one Stage material. World replacement and realm/style/production toggles reuse the library and atlas. The host loads once and releases the library after Stage buffers and materials. The accepted M2-C2B production path is default in Render3D; ?assets=off restores the diagnostic fallback.

## Package 5 character reuse and ordinary Ghost Family

Upper entities keep the existing body/rig and the role derived from real level, faction and dao.path. UpperStyle supplies mineral blue/green, ivory and sparse real role accents. Wandering state adds no wanderer outfit or sect token.

Ghost cultivators keep body_base, hair_ghost, ghost_torn_hem and the existing soul_lamp prop. In production Nether presentation their cloth uses the cold grey-green slot. Only the actual actor lamp uses the sparse soul-flame red.

Ordinary entities with soulKind=ghost in the Nether use three authored opaque tapered silhouettes, stable by seed/plane/entity ID. They have no face, rig, transparency, lamp or new role. LOD budgets are 36/16/6 triangles; all variants share the 6-triangle far geometry. Fixed InstancedMesh batches borrow the same environment atlas and Stage material and map directly to the original entities container. Mortal wraiths retain their previous presentation.

## Package 6 natural terrain decorations

Five natural revisions replace the source rock plinths, clean columns, symmetrical altar steps and slab crossbeams with asymmetric inclined stone facets. Budgets: 42/20/6 triangles. No site, altar, building, floating island, cloud ground or collision semantics.

RealmDecorationLayer belongs to the existing Upper/Nether Stage. Its layout reads only raw height, slope, terrain type, plane and seed. One candidate per 8-cell Upper or 10-cell Nether block; stable hash selects the actual cell and size. Upper capacity/screen/detail limits are 256/160/64; Nether 192/96/40. Props under four projected pixels disappear. Camera changes only affect LOD, frustum and screen submission, never regenerate layout.

Every quad touched by the conservative rotated footprint must belong to the Stage RegionGeometry. Center-only admission is forbidden. The base is buried at the minimum of the same ElevationField's center and four rotated corner samples; it creates no new terrain elevation. Ground results and unchanged camera views are cached. No simulation RNG, World field, save data or picker identity.

Upper cloud/negative space uses the existing terrain shader's low-valley wash and Stage-local mineral palette. No separate cloud plane was introduced. Natural props use the same atlas and Stage material as the shipping library. Toggle independently with host.setDecorationsEnabled(false) or ?decorations=off.

## Package 7 ground artifacts

Nether ground artifacts use only actual world.artifacts IDs, coordinates, names, slots, tiers and qualities. A neutral faceted marker with earth chips uses 20/8/4 triangles, and never implies the item's named weapon shape or a soul lamp. The fixed-capacity (256) batch shares the Stage Environment material and atlas. PlanePicker returns the exact artifact ID; missing IDs do not resolve to a nearby substitute. The readonly inspector displays the original item facts. No simulation or save changes.

Generated ghost, mineral and artifact caps now face outward, verified at upper and lower extrema in the actual GLB. Nine natural actor Edge cases, seven decoration pairs and five ground-artifact cases passed after the correction.

## M2-C2C Package 4: four real Site recognizers

The current library adds `mortal.site.secret/cave/formation/ruin`, binding only
the four existing World kinds. See [Site production families](M2C2C_SITE_FAMILIES.md)
for geometry counts, shared modules, footprint, grounding and identity contracts.
The Site extension uses eight unique nodes: four detailed, three reduced, and
one shared far node. It does not multiply three LOD geometries for every kind.
The accepted cave pilot and four-family CPU gates have separate evidence;
this asset index does not claim completion of the whole C2C browser matrix.
