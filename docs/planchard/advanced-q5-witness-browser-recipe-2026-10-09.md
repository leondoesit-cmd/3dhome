# Advanced Q5 witness trace and next browser feature

Read-only review of PDF509–510 / printed10-29–10-30 using the original rendered source and600dpi `advanced-q5-front-witnesses.png`. No answers, mass or COM were used to select geometry. Existing fresh eight-step checkpoint remains unchanged: `ADVANCED-Q5-core-bevel-browser-2026-10-01.mforge`,212376bytes, SHA256`a68bf7760df525509e41afecb9777502c11c7e89d47f5c2f6d1a8a341de223a4`.

Follow-up: the parent subsequently authored the resolved upper recess in Chrome. See `advanced-q5-side-rear-hole-witness-followup-2026-10-09.md` for the additional PDF510 topology review. In particular, the rear9-as-side-depth interpretation below is **not certified**; a rear-facing pocket/bore with9 locating width is a competing interpretation. Do not use the older rear paragraph as a committed cutting recipe.

Coordinates below follow its existing stock: widthW=X0..50mm, depthD=−Z0..100mm, heightH=Y0..63mm. Right-plane sketch coordinates are(U,V)=(−D,H); Top-plane coordinates are(U,V)=(W,−D). This note adds no authored model or geometry artifacts.

## Resolved upper rear step

The top50/12/40 labels are **not a serial depth chain**. The50 and40 dimension lines run along C/depth to the same rear datumD100. Their front witness planes are the far-side notchD50 and the main near-side stepD60 respectively. The12 dimension runs across B/width between the two parallel longitudinal witness lines of that small notch, setting its widthW0..12. The visible boundary joins notchD50 to main stepD60 atW12. The upper15 is vertical, from the raised platformH63 to their common lowered rear ledgeH48. These are distinct from the lower15 heel dimension.

This resolves a next browser feature independently of the remaining pocket/hole ambiguities: a15mm-deep upper rear recess with a jog in its front boundary.

Use a new Top Plane sketch atH63mm, or an equivalent correctly oriented support at the existing top. Close and fully constrain this six-vertex polygon in millimetres:

|Vertex|Top U = X|Top V = Z|
|---|---:|---:|
|1|0|−50|
|2|0|−100|
|3|50|−100|
|4|50|−60|
|5|12|−60|
|6|12|−50|

Reverse Blind Extrude Cut15mm, fromY63 to48. If sketch support already carries63mm, leave feature start offset0 to avoid doubling it. This cuts D50..100 overW0..12 and D60..100 overW12..50. It preserves the established core bevel, front arcs and lower stock. Do not extend the core bevel across the outer rail to manufacture another dimension. Browser source/outline checks and clean native one-solid Save remain required after authorship.

## Distinct side-depth witnesses

The13 label is along the B/width projection at the central near-side recess; its witnesses compare outer side and inset pocket floor. It supports a13mm side recess depth, not a13mm longitudinal notch or vertical height. Corresponding cutter limits would beX50→37. The nearby5 is also transverse and compares the central hub projection with the pocket floor; it supports a5mm projection from that floor. Do not replace the hub/profile with a plainR25 disk cut: the source clearly retains central material and localR10 transitions.

The rear9 label lies across the B projection between the rear side pocket's inset wall and outer side. Its best-supported interpretation is9mm pocket depth, X50→41. This interpretation needs the final selected pocket/profile to preserve its rear web. The nearby10 is a vertical witness from the lowered rear top to rear-hole level, supportingH48−10=38mm if its lower witness is the hole centre. The rendered lower end is crowded by the hole/centreline; verify that centre endpoint before authoring the bore.

The **other9**, at upper left, is different: its dimension line runs along C/depth, with extensions landing on the far upper reference. It is not the rear9 side-cut depth. I cannot identify both originating feature edges unambiguously from this one isometric view. In particular9 must not replace the established core bevel setback18tan20°=6.551464mm: those numbers describe different witnesses or an unresolved datum. No9mm bevel change is authorized by this trace.

## Lower relief: source-supported profile, depth still unresolved

The bottom15 runs along C from the rear datumD100 to the heel/bottom transitionD85. The adjacent bottom40 spans from the relief's other bottom transitionD45 toD85. Thus the relief's two baseline endpoints are(D,H)=(45,0),(85,0), retaining a15mm rear heel. This40 is independent of the top40 step dimension even though their values match.

The lower20° and45° arcs reference the local bottom/depth baseline, unlike the upper20° which references vertical. An inferred tangent continuation consistent with their witnesses rises20° fromD45 and descends45° toD85, with the printedR10 rounding their meeting corner. This can be prepared as a **draft source-derived Right-plane sketch**, without committing a cut width that the view does not establish.

For that explicitly stated tangent-continuation interpretation, the unrounded line intersection is(D,H)=(74.3261531631,10.6738468369)mm. A tangentR10 corner has endpoints(68.3396509331,8.4949382178) and(78.8309201782,6.1690798218), centre(71.7598523663,−0.9019879901)mm. These are analytical consequences of40mm span/20°/45°/R10, not dimensions measured from pixels or fitted to an answer. The arc follows the small upper cap between the tangencies. Radius10 does not imply a3D edge fillet or a whole circle removal. Confirm tangent continuation and full-width versus local relief before committing extrusion.

## Hole and side-profile limits on certainty

All three holes are explicitlyØ10 Through All. The text specifies the top centre20mm from the top front edge and30mm from the top right edge. The latter givesW20 if “right” denotes the outerW50 edge. The former still needs its exact front datum identified after the new top recess. Taking the existing beveled top edge literally would giveD36.551464+20=56.551464; itsR5 boundary would cross the newly resolvedD60 step although the print shows a closed circular top opening. Taking an unbeveled projected front datum instead gives another coordinate. This conflict must stay explicit: do not silently useD50 or alter the accepted bevel to make the circle fit.

The main side pocket isR25, rear pocketR20 and local transitionsR10. The visible central bore appears on the35mm centre-height construction plane, but its depth station/hub/recess transition must be resolved against the differing coreR30 and railR25 tangent planes. The rear hole's horizontal station is likewise not explicitly dimensioned by an unambiguous centre witness in this crop. Their radii and side-depth labels alone do not define complete cutting contours. Do not derive their missing stations from projected pixel distances, the suggested thirteen features/twelve sketches, or printed mass/COM.

Next concrete browser step is the six-vertex upper rear recess above. Lower-relief sketch can follow only with its tangent-continuation interpretation recorded. Side/rear profiles, the left9 witness and hole front datum remain explicit source uncertainties; complete Q5 acceptance is still pending.
