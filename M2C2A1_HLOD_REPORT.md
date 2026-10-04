# M2-C2A.1 HLOD Cluster Report

- Result: PASS (5 focused checks)
- Production HLOD: deterministic 2–4 contiguous groups along each village bbox long axis.
- Geometry: one shared 12-triangle vertex-color geometry and one InstancedMesh (capacity 512 × 4).
- Identity: each cluster pick entry retains the real settlementId and an exact, non-overlapping subset of house source indices.
- Real village centers are assigned to the nearest cluster identity and suppressed as standalone far LOD masses; near/mid still render them as real buildings.
- Grounding: each cluster uses a deterministic representative house for elevation sampling.
- Compatibility: stats.hlod counts villages; stats.hlodClusters and stats.hlodTriangles report submitted cluster geometry.
- Debug comparison: setHLODMode("legacy" | "cluster"), default cluster.
- Fixture: 64 × 48 generated world, 1,440 simulation days; initial/final SHA-256 1d0911f592982f023d70ab11f8546b7788d34e64a4bb6d472c3b85505a1c6d38.
- Measured far cluster batch: {"villages":5,"clusters":19,"triangles":228,"capacity":2048,"sharedGeometryTriangles":12}.

Checks:
- PASS cluster mode keeps one shared 12-triangle instanced geometry within four slots per settlement
- PASS shared cluster roof faces point outward and remain raycastable from above
- PASS cluster pivots use representative member ground and legacy mode remains reversible
- PASS far HLOD restores every real house at near range without changing World
- PASS a settlement crossing a real Region mask refuses both HLOD modes

Browser evidence (GOLDEN_A, source server on port 4192):
- Camera target is the same real village POI for all captures: settlementId 5, 15 houses; yaw 1.77 and polar 0.65. Near/mid/far use zoom 9/6/0.65. The far legacy and cluster captures share the exact camera target, yaw, polar, zoom, and crop rectangle (360 × 360 CSS px at x=541, y=269.25).
- Near and mid verify the target house at real LOD0/LOD1, respectively; both are raycast-visible. The scenario visibility proof also confirms the same village's cultivator (4 visible body points), house, and tree are in-frame and visible.
- Far legacy submits 6 village HLOD masses / 48 HLOD triangles. Far cluster submits 22 clusters across the same 6 villages / 264 HLOD triangles; the target settlementId 5 is present in the cluster entries. The target village's 15 house members are partitioned into four disjoint clusters; the real center is associated with a cluster.
- Whole-world digest is unchanged before and after capture: SHA-256 `0f9efd918df2e4f26bcf678cffe2ca1593381c9abee209de9e2e8cc747d755f1`; console and runtime error lists are empty.
- Human visual review by the parent agent passed the A2 gate: near/mid show real settlement detail and a visible cultivator/tree; the matched far comparison removes the oversized black village-center mass and reads as separated roof groups with visible gaps. This is a visual assessment of the supplied PNGs, alongside the structural checks above.
- Captures: [near](reports/m2c2a1/hlod/near.png), [mid](reports/m2c2a1/hlod/mid.png), [far legacy crop](reports/m2c2a1/hlod/far-legacy.png), [far cluster crop](reports/m2c2a1/hlod/far-cluster.png), [far legacy overview](reports/m2c2a1/hlod/far-legacy-overview.png), [far cluster overview](reports/m2c2a1/hlod/far-cluster-overview.png). Machine-readable camera, visibility, stats, and digest evidence: [evidence.json](reports/m2c2a1/hlod/evidence.json).
