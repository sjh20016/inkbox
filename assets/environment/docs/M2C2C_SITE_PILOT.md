# Cave Site production pilot

`mortal.site.cave` binds only existing Mortal `world.sites` entries with `kind=cave`.
The shipped GLB contains a recessed closed stone entrance: LOD0 84 triangles,
LOD1 36 triangles, and the shared closed six-triangle `env_site_shared_lod2`.
Its 3.6 × 2.6 cell footprint has one recognizer, no separately identified helpers.
The semantic atlas and all existing assets retain their original slots and geometry.

`WorldMarkerLayer.deriveMarkers` remains the only World Site derivation.
`SiteGeographyLayer` receives those buckets and uses the Stage's shared material
and Host's shared library. It owns a fixed-capacity 256-instance EnvironmentBatch;
assets/geography toggles write empty buffers and preserve the allocated batch.
LOD uses the independent `site` category, hysteresis and detail demotion.

The entire conservative footprint must belong to the same submitted Region,
stay inside the grid, be non-water and have raw height spread at most 0.25.
Grounding uses the minimum Stage elevation at center/corners, burying the base
rather than floating it. Rejected terrain/masks, unavailable assets and disabled
production retain the original marker at the authoritative coordinates.
Unrecognized kinds have their own honest marker bucket, outside the four-kind contract.

Both production instances and fallback markers record `renderSites` with
`id/x/y/kind`. PlanePicker raycasts submitted geometry, validates against current
World entries, and returns `siteId`; stale/removed/moved records cannot inspect
a neighbour. UI cards resolve the current id and show only existing Site fields.
Site identity does not enter simulation, save, RNG, or decorations.

The pilot CPU gate is `node scripts/inkbox-render3d-m2c2c-sites.mjs`; its report
explicitly distinguishes CPU raycasting from browser/GPU acceptance. Package,
normal-camera browser and ancestor gates are required before expanding four families.

The pilot also passed actual Edge WebGL acceptance with the ordinary simulated,
serialized day-28500 World (seed 20260930, small). The product import UI loaded
the save without Site or terrain edits. Camera projection targeted 80/24/5 pixels
and submitted the actual 84/36/6-triangle GLB nodes. All three real input clicks
resolved cave id 1, `照夜洞府` at (68,27). Assets-off restored its legacy marker;
the complete World/advance digest remained unchanged and all GPU programs linked.
These captures are ignored technical proof, outside the final Golden budget.
