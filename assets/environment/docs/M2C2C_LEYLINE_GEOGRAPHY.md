# Real leyline terrain veins

`mortal.leyline.vein` binds only current `world.leylines` entries. The single
`deriveMarkers` entry now includes their actual `id/x/y/strength/radius`; the
layer never changes qi, ownership, terrain, RNG, save fields or World kinds.

The production library contains three closed modules with 36/12/4 triangles.
They share the existing atlas and Stage material: ink with small stone accents.
Strength changes the number and dimensions of short patches, keeping the same
semantic palette. Weak `.3` uses ten narrow interrupted patches; strong `.9`
uses nineteen wider patches with shorter gaps. Radius bounds the stroke extent;
an immutable seed/id/coordinate hash chooses its orientation without sim RNG.

Each patch samples the Stage ElevationField to form a local terrain tangent.
Its closed geometry is tilted with an optional unit instance quaternion, and
the base is buried by the smallest center/corner plane residual. There is no
upward offset, lifted strip, long floating platform or tower. The conservative
footprint includes the horizontal contribution of the tilted thickness, and
every touched submitted quad must belong to the same Region. Water/unknown
terrain and fully buried patches are rejected honestly. Multiple short patches
retain the same authoritative leyline id and center; none gains a new identity.

One EnvironmentBatch owns three fixed mesh buffers and a global 256-record cap.
Assets/geography switches preserve those buffers; borrowed library geometry,
atlas and Stage material are never disposed by the layer. Overflow and rejected
patches are counted. The old violet circle is suppressed only if a true leyline
has at least one valid production patch; otherwise it remains the fallback.
Picker uses actual submitted geometry and validates current World identity.

Natural CPU coverage was measured from seed 226, small, ordinary three-day
simulation through day 72000 and the existing save/import path. All three real
leylines produce valid terrain patches: ids 1/2/3 submit 8/10/5 respectively,
23 instances in one reduced-detail draw (276 triangles). Fifteen candidate
patches are rejected by terrain suitability; zero leyline identities fall back.
These measurements describe CPU geometry admission, not normal-camera GPU proof.

`node scripts/inkbox-render3d-m2c2c-leylines.mjs` checks actual GLB, exact identity,
strength/radius updates, tangent geometry, conservative Region, fixed switches,
raycasting/removal, capacity/ownership, World SHA and the optional quaternion
contract. Existing rotationY records keep their exact previous Float32 matrix.
Full normal-camera browser/purity/performance acceptance remains a later gate.
