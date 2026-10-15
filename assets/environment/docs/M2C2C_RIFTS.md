# Persistent Rift world wounds

The persistent presentation reads one `deriveMarkers(world).rifts` list from
current Mortal `world.rifts`. Coordinates, identity, age and targetPlane are
actual World fields. Radius comes only from the existing `visibleRift` reader
into `sim/rifts.riftRadiusAt`; this layer contains no radius evolution formula.
Unknown targetPlane remains an honest legacy marker, without choosing a realm.

`RiftWoundLayer` uses one owned closed twelve-triangle stroke geometry, one
opaque shared material and one fixed InstancedMesh. Capacity is 64 wounds × 14
broken strokes = 896 instances. A full pool costs one draw and 10,752 triangles;
two ordinary supported wounds cost one draw and 336 triangles on flat terrain.
No per-Rift geometry, material, renderer, particle stream or physics is created.
The geometry and instance buffer are reused through production/geography toggles
and released exactly once with their Stage marker layer.

The strokes form two irregular, disconnected seam edges through the real radius.
They never form a closed annulus or nested glowing circle. Immutable id/seed/
coordinates select direction and roughness; real age subtly changes width.
Upper edges use mineral blue, pale gold and cold white. Nether edges use burnt
ink and bone white, with only one small cinnabar stroke per fourteen candidates.
Each short stroke follows the same Stage ElevationField tangent and a buried
plane residual. Completely buried candidates are rejected rather than lifted.

Production requires both `productionAssets` and `geography.rifts`. The old ring
is suppressed only for a true Rift that submits some wound geometry. Closed,
removed, moved or aged Rifts refresh through the existing four-Hertz marker
cadence. Unknown targets, overflow and zero submitted strokes preserve the
legacy fallback; counters report these cases without implying production.

Persistent Rifts retain the old Region exception: changing inside/outside masks
does not filter their identity or stroke instances. They remain Mortal World
objects; Host/Boundary continues using actual targetPlane to represent breaches
across an observation window. This layer creates no Upper/Nether copy or new
Rift and never changes the simulator's boundary or lifecycle.

Only persistent wound geometry is pickable as `kind=rift, riftId`. It validates
the current active World record and returns authoritative coordinates. Removed
or closed identities fail even before the next geometry refresh. Legacy rings
keep their previous off-path picking behavior. Transient FX is a separate
snapshot consumer and contributes no picker geometry here.

Run `node scripts/inkbox-render3d-m2c2c-rift-wounds.mjs` for authoritative-field,
geometry/capacity, Region exception, age/target/position refresh, fallback,
current triangle raycasting, World SHA and once-only resource disposal gates.
These are CPU assertions; normal-camera GPU and combined transient FX evidence
must be reported by the complete C2C acceptance suite.

## Short-lived snapshot brushes

`ThreeFxProbe` reads exactly one `PresentationStage.snapshotPlane(plane)` per
visible Stage update. The existing `main.js` ingest/update remains the sole
runtime event queue consumer. The audited FX kinds are `rift`, `riftcross`,
`possession`, and `ascension`, mapped upstream from the corresponding existing
events. Unrelated legacy effects continue using the old debug rings; the four
new kinds never appear in both representations at once.

Each Stage owns one six-triangle torn-brush geometry, one transparent material
and 256 preallocated instances (64 events × at most four strokes). Matrix,
color and alpha buffers are reused. Expired effects disappear by count, without
per-event mesh creation or disposal. Stats expose active instances, events,
fixed capacity, clipped events, overflow frames, Region rejects and draw/tri
counts. A full pool is one draw and 1536 triangles. Opacity/shape evolution uses
the existing snapshot age/ttl and immutable visual seed; no simulation RNG runs.

Cross trails use complete finite from/to coordinates, planes and matching
depart/arrive phase. The bounded local stroke follows that actual direction;
missing, coincident or inconsistent payloads use generic torn ink. A rift-open
does not supply a target subtype, so it never guesses an Upper/Nether color.
Possession alone produces thin cinnabar convergence; ascension alone produces
short vertical paper/mineral strokes. There is no persistent pollution field.

Complete stroke footprints must belong to the existing RegionGeometry side.
FX is never pickable. Production/geography off retains the prior debug path;
toggling preserves resources, and World replacement releases each pool once.
The rifts gate uses real openRifts plus explicit presentation API unit fixtures
and a clearly labelled overflow stress snapshot. The 11-mode, 600-day purity
gate observes actual producer snapshots and matches all World/advance/save SHA
and eleven RNG streams, including independent Upper spatial sampling.
