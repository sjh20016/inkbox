# Environment asset library

Packages 3–4 ship three house visual families and one real hall family for a current STRUCT.HOUSE: mortal.house.base, mortal.house.small and mortal.house.courtyard. All retain the real village and original house coordinates. Courtyard is a roof silhouette; neutral timber replaces source cinnabar and gold. It implies no new wealth class, household or site.

## Source and LODs

Run node assets/environment/source/build-environment.mjs to rebuild the one runtime GLB, index atlas and manifest. Source inputs are the project's authored bld_house, bld_hut and bld_manor GLBs. Development source and preview files stay out of the player package.

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

Fixed-capacity InstancedMesh batches borrow library geometry and one Stage material. World replacement and realm/style/production toggles reuse the library and atlas. The host loads once and releases the library after Stage buffers and materials. Production remains opt-in with ?renderer=3d&assets=on until full Pass1 acceptance.
