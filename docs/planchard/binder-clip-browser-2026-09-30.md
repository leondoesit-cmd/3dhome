# Exercise 8.3 binder clip — fresh browser reconstruction

The book asks for a designer-dimensioned Gem binder clip assembly, with one binder body and two instances of a swept wire handle. This is a labeled example, not a claim of measured commercial dimensions.

## Body checkpoint

Created from a blank model in desktop Chrome, using the dark app theme and normal sketch/feature forms. Library name: **Planchard 8.3 - binder body - fresh designer example 2026-09-30**.

Right-plane three-line open section: (0.02, 0.047) → (0.8, 0.4) → (0.8, −0.4) → (0.02, −0.047) inches. Set point coordinates and the vertical relation leave the section fully defined. Thin Extrude, 0.024-inch mid-plane wall, 1-inch symmetric depth, creates the body.

Two concentric annuli on the Right plane have centres (0, ±0.08) inches, outside diameter 0.1 inch and bore 0.05 inch. Both centres are constrained, circles are concentric, and the lower diameters use the upper named dimensions HingeOutside and HingeBore. Fully defined sketch, four loops/two enclosed regions. Normal Extrude with 1-inch symmetric depth and merge produces two associative boss features and one final solid.

Plain Carbon Steel assigned through Material & finish; model colour #15171b. Save confirms success. Evaluate → Mass properties reports **Exact solid geometry**, bounds 2.54 × 2.1265 × 2.1895 cm, volume **1.161378 cm³**, mass **0.009116818 kg**, COM (0, 0, 1.153137) cm.

Output → Project bundle downloaded through the browser and was copied to `artifacts/planchard/BINDER-BODY-fresh-browser-2026-09-30.mforge` (175,300,027 bytes). Output → Export STEP completed and is protected as `BINDER-BODY-fresh-browser-2026-09-30.step` (77,353 bytes). The unexpectedly large bundle is assigned for repair.

## Handle in progress

Another blank model was named **Planchard 8.3 - binder wire handle - fresh designer example 2026-09-30**. A six-segment connected Front-plane path was drawn with the mouse, then its seven vertices were located using Set point coordinates: (−0.45,0), (−0.315,0), (−0.236,1.024), (0,1.26), (0.236,1.024), (0.315,0), (0.45,0) inches. Fully defined before rounding. Five sketch fillets of radius 0.08 inch produced six lines/five tangent arcs. Despite Keep constrained corners enabled, the tool drops corner Fix constraints and leaves 8 DOF; this preservation issue is assigned to the plane agent. The visible path is symmetric and connected.

The fillet preservation repair was then loaded. The old sweep and five rounds were undone through the UI, the fully defined sharp path saved/reloaded/library reopened, and all five rounds recreated. **Fully defined throughout**, 34 constraints/five radius dimensions; each retained virtual sharp corner has Fix and Point on entity relations to both adjacent lines.

Sweep → Circular profile → diameter 0.04 inch, Follow path, Create solid was committed through the feature form. Plain Carbon Steel assigned and exact Save completed. Mass properties: **one exact solid, 0.05961581 cm³, 0.0004679841 kg**, COM (0,1.549249,0) cm, bounds 2.286 × 3.2178 × 0.1016 cm. Proof `BINDER-WIRE-exact-browser-2026-09-30.jpg`. Earlier 8-DOF state is protected separately as `BINDER-WIRE-partial-browser-2026-09-30.mforge`; it is not final acceptance. Corrected STEP export started. Final compact bundle, two-instance assembly mates, limit-angle motion, and assembly acceptance remain pending.

## Assembly and hinge solver repair

Fresh blank assembly contains the body and two instances of this run's wire. Six actual UI mates: one bore/straight-wire concentric mate, Right centre-plane coincidence, and Front-plane Angle mate with minimum 0°/maximum 150° per handle. Upper coincidence aligned, lower opposed. Reopened saved assembly reports all six resolved and two degrees of freedom. Manual RX −90° preserved its interior pose; RX −170° clamped to the 150° stop (represented by equivalent Euler RX30°, RY180°, RZ0°). Undo restored the interior pose; both handles then left at RX−60°, upper RZ0°, lower RZ−180°, and saved.

The real assembly exposed an angle seed bug at opposed plane normals: generic angle azimuth tilted the already held hinge axis, leaving concentric/centre mates unresolved. `cad_mate_solver.js` now seeds around that held axis. Protected pre-repair UI export reproduces the failure, corrected solver resolves both hinges; a small synthetic hinge regression covers the drift and stop. Focused mechanical/limit tests 13/13 pass. Chrome reload/library reopen verifies two hinge freedoms.

Proof: `BINDER-hinge-motion-browser-2026-09-30.jpg`. Exact interference check before final intermediate rotation found two small body/handle overlaps (~0.001 cm³ each), because full-width rolled hinges intersect wire bends. End-hinge relief is being authored through Chrome; final interference, compact bundle, STEP and reopened final acceptance remain pending. The checkpoint is not final acceptance.

## Final acceptance

The body was relieved through an actual fully constrained Right-plane rectangular cut: Z±0.06in/Y±0.14in, symmetric X span0.76in. This retains four short end hinges and one connected body, exact1.003416cm³/7.876817gsteel. Updated assembly body through Update from library. The split bore faces were ambiguous, so both old concentric references were replaced by visible end-bore selections: upper generated-5 atX−1.118/Y+0.203cm, lower generated-2 atX−1.118/Y−0.203cm, R0.064cm, each mated to the wire's generated-5 straight cylinder. Allsixmatesresolved,2DOF; upper alignedcentreplane/loweropposed, bothRX−60° intermediatepose.

Exact Interference → **No interference detected**, then Save. UIexport protected `BINDER-final-browser-2026-09-30.mforge` (3,922,644bytes; onlyoneactiveassembly,3components/6mates) and `BINDER-final-browser-2026-09-30.step` (269,544bytes,3MANIFOLD_SOLID_BREPentities). Openbundle visibleProjectlink form imported protectedfinalbundle; allsixmates/2DOFretained, Assembly→Interferenceagain **No interference detected**. Proof `BINDER-final-reopened-clearance-browser-2026-09-30.jpg`. Exercise8.3 accepted as a labeled designerexample, not measuredcommercialgeometry.
