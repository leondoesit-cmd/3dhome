# O-RING native configured drawing feasibility

Read-only proposal; no implementation or CAD/browser/model edits. Current `cad_configured_drawing.js:configuredBodiesForView` explicitly derives a64×20 sampled torus for every named circular-sweep table row, including a named active row. The source authored path circle/profile diameters and frame are used, but this is analytic sampled geometry, not a native BRep regeneration. Other configured models currently return active bodies. Existing configuration drawing tests verify row sizes/labels, not native configuration geometry.

## Grounded native route

The app already has a safe isolated route:

1. Deep-clone the canonical document; locate the requested configuration and verify circularSweepTableTarget agrees with designTable pathSketchId/sweepFeatureId. Apply **applyConfiguration(snapshot,cfg)** to the clone, which restores captured authoring/suppression and applies actual row path/profile values through applyCircularSweepRow. Never call setActiveConfiguration on live E.def.
2. **compileKernelFeatureTree(snapshot)** clones/normalizes and lowers the real authored history. Reject compile/source/suppression errors. Request **regenerateInCadWorker({...compiled.document,features:compiled.features},{restoreMode:'mesh',scope:uniqueConfiguredScope,signal})**. Existing worker protocol emits verified exact-native-mesh proof, workerMeshData and topology while computing native geometry inside the worker. It does not require a second UI-thread kernel.
3. Accept only ok/nonapproximate native results for the actual terminal circular sweep body, with verifiedSerializedExact and usable mesh. Expand its mesh indices through existing **tessellateParts([{id:...,meshData:...}])**, copy exact bounds and native provenance. Release regeneration handles in finally; keep copied serializable mesh only. Other terminal/merged-body cases require explicit mapping rather than choosing an arbitrary run result.

Bounded initial eligibility should be the actual canonical single-body circular-sweep design-table workflow: genuine circle path, circular section and named valid row, no unrelated terminal bodies or suppressed/missing source. Noncanonical/general configured parts retain explicit existing qualifications. This can improve all named O-RING rows without changing source CAD or its active configuration.

## Cache and publication contract

Proposed new derived cache module with `request(document,configurationId)` returning a deduplicated promise and `peek(document,configurationId)` returning status pending/ready/error plus prepared bodies. Key must include document identity, authored sketches/features/history/reference geometry/variables/rollback, requested configuration modelValues/overrides/suppression and design-table target/row; exclude derived meshes/timestamps. Cache replacement clears old scope work and stale completions cannot publish after source/history/document switch. Retain only bounded current-owner entries. Cache never writes drawing/model authoring, CAD parts, current activeConfiguration or Undo.

The synchronous drawing projector can consume ready bodies and schedule eligible missing rows once. Pending/error states must visibly say native configured geometry pending/unavailable; sampled torus or active native geometry must not be silently presented as a successful named native row. Cache completion invalidates sheet projection/scene and redraws only if source identity is still current. Ordinary SVG/drawing export must await requested eligible row preparation and revalidate document/history before exporting; it must fail explicitly on error, not announce a native configured export from fallback. Cold reload recomputes derived rows and must wait before final proof. Existing synchronous createDrawingSvg cannot itself await a worker; it needs a prepared-body provider/preflight contract or remains explicitly qualified outside this path.

## Important topology limit

Current buildSheetScene/controller uses **one active topologyIndex for the entire sheet**. A configured native mesh cache alone does not make nonactive persistent dimension/Model Item anchors correct: radius/placement may differ even with the same persistent IDs. Therefore the first finite geometry-only cache must not claim general native configured associative dimensions or reference geometry. Either guard topology-bound operations on nonactive configured views as unsupported, or explicitly add per-view native topology resolution with its own tests. O-RING named-view shape/size/label proof can remain bounded to native configured projected geometry; full configuration drawing parity is a separate gap.

## Meaningful acceptance tests

- Read-only canonical actual O-RING source fixture, native Small/Medium/Large rebuilds: row diameters/profile thickness/torus volume2π²Rr² and native sweep ownership, projected dimensions versus row parameters, isolated active source authoring/native parts unchanged.
- Single request/dedup/readiness, source-row and upstream-dimension edits invalidate, document/config/history switch cancels/discards late result, failures/approximate mesh reject, no cached active-body substitution.
- Real ordinary live projection/export preflight consumes prepared native mesh, cold reconstruction yields the same bounds/labels/geometry under declared native meshing settings; export cannot pass before preparation or on failed native source.
- Explicit per-view topology qualification/guards, preserved existing configuration/active drawing paths and no source-geometry/Undo mutation.

Feasibility is good for isolated native geometry using existing APIs. Safe completion requires asynchronous ready/export handling and honest topology limits, not replacing the64×20 generator with another sampled formula. Parent approval to implement this finite scope is pending.
