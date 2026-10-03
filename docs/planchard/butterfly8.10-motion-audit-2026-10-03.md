# Exercise 8.10 rotary assembly audit — 2026-10-03

Source: printed page 8-45 / PDF page 423. The book requests the reader's own
butterfly valve design, appropriate mates and motion, then an exploded ANSI A
landscape assembly drawing. This audit does not complete the drawing requirement.

## Reproduced assembly gap

The protected browser export
`artifacts/planchard/BUTTERFLY-assembly-seven-parts-browser-2026-10-03.mforge`
contains seven task-created part occurrences. The body is grounded, its seat is
locked, the stem has a native cylindrical concentric mate plus an axial Align Y
mate, and disc, lever and two pins form a rigid connected group with the stem.

Before the repair, the solver treated the first-picked endpoint of every Lock as
an immovable reference. Reverse-picked disc/lever/pin locks caused this assembly
to report zero degrees of freedom. A stem motor at 15 RPM and one second failed
with conflicting disc and lever locks despite the group having a physical shaft
rotation available.

Rigid locks now join both movable endpoints in the same solver cluster. Grounded
members remain fixed. A motor-prescribed member seeds its followers in either
selection order, including inverse rigid transforms; the numerical solve still
measures every lock and rejects incompatible grounded poses or motors. Other
mate types retain their directed reference/target behavior.

Read-only evaluation of the protected export after the repair reports one
unprescribed degree of freedom. A stem motor at 15 RPM evaluates successfully at
one second: stem, disc, lever and both pins rotate 90 degrees about Y, the lever
retains Y = 70 mm, and body/seat remain stationary. No saved model geometry or
artifact was modified by this audit. Human Chrome validation remains the root
agent's responsibility.

## Human UI motion workflow

1. Open Motion study from the assembly ribbon.
2. Leave Relation at **Keep existing relations**. This does not create a gear
   relation; the displayed gear fields are ignored for this choice.
3. Choose the butterfly stem as Motor, Y as Motor axis and 15 RPM.
4. Evaluate time 0, 0.5 and 1 second for closed, 45-degree and open poses.
   Saved motor baselines permit seeking back to zero without accumulating turns.
5. To enforce travel, add an Angle mate between body and stem Front plane normals
   and set its inspector minimum to 0 and maximum to 90 degrees. The angle range
   leaves the shaft's one degree of freedom available. A motor that prescribes
   an out-of-range pose is rejected atomically rather than saved beyond its stop.

## Disc sweep calculation

The unchamfered disc has outer radius 29.9 mm and plate half-thickness 7 mm.
Rotation about its in-plane Y shaft sweeps an X/Z radius up to
`sqrt(29.9² + 7²) = 30.709 mm`, exceeding the seat's 30 mm bore radius.

Equal 6 mm, 45-degree chamfers on both outer plate rims leave a 2 mm axial land
at the outer diameter. The outer-land bound is
`sqrt(29.9² + 1²) = 29.917 mm`. At the chamfer's inner endpoint the bound is
`sqrt(23.9² + 7²) = 24.904 mm`; the convex radial norm along the straight bevel
cannot exceed its endpoint maximum. Thus the plate envelope stays below the
30 mm seat radius by approximately 0.083 mm. The central hub, radius 12 mm and
half-length 10 mm, has a smaller 15.620 mm envelope. This is a declared geometric
fit for the example, not a qualified production seal or manufacturing tolerance.

## Verification

- Nine dedicated rigid-lock/motor tests pass: either pick order, inverse pose
  with grounded member, conflicting motors without partial publication,
  inconsistent grounded cycle, both-grounded conflict, 0–90 degree travel, free rigid-group mobility, and unchanged directional grounding rules.
- All nine dedicated tests plus the selected mate, production, nested assembly
  and gear regression suites passed: 110 tests total.
- `npm run check` passed: no free identifiers, 622 linked modules, 1490 source
  assertions. This is not a claim that full CI or browser motion validation ran.

