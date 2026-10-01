# Exercise 8.5 — fresh browser vice example

Work in progress. The companion Screw Mate folder and AVI are absent. All three parts were authored from blank through desktop Chrome drawing tools and constraint forms. Chosen dimensions are a labeled designer example; the printed 0.1 revolutions/mm gives the required 10 mm/turn relation.

## Protected fresh parts

- `VICE-base-fresh-browser-2026-09-30.mforge`: 7 steps, one solid. The intended fixed jaw corner coordinates were not fully realized: the native mate face picker exposed X −35..55 mm, Z −33..35 mm. Correcting those coordinates and assigning steel is pending.
- `VICE-screw-fresh-browser-2026-09-30.mforge`: 6 steps, three fully defined circle sketches, one steel solid, exact 13.31573 cm³. Its positive X shaft and handle direction must be reversed to put the handle outside the bearing block.
- `VICE-jaw-fresh-browser-2026-09-30.{mforge,step}`: 4 steps, both sketches fully defined, 20 × 68 × 50 mm jaw, bottom Y10 mm, bore center Y35 mm, driving Ø10.4 mm clearance bore cut symmetrically through all. Plain Carbon Steel 7.85 g/cm³; exact 66.30103 cm³, 0.5204631 kg; COM (0,35,0) mm. STEP export succeeded in Chrome. Proof: `VICE-jaw-exact-browser-2026-09-30.jpg`.

## Assembly checkpoint

Library name: **Planchard 8.5 - screw mate vice assembly - fresh labeled example 2026-09-30**.

Three fresh components, four resolved topology mates:

1. Base bearing cylinder ↔ shaft cylinder Screw mate, pitch 10 mm/turn.
2. Shaft cylinder ↔ jaw bore Concentric.
3. Screw and jaw Right planes Coincident (Opposed).
4. Base and jaw Top planes Coincident (Aligned).

The default opposed Top-plane mate initially overrode the jaw concentric relation; changing this mate to Aligned through its inspector resolved all four mates. The current Turns value specifies the screw position, so the resulting pose is fully constrained.

Human UI motion check: at Turns 0 the screw placement is X −13.25 cm, Y3.5 cm, Z0. Setting Turns 1 changes X to −14.25 cm, with Y/Z and Euler rotation unchanged, proving exactly 10 mm axial displacement per revolution. This is a preliminary kinematic check; final physically correct pose, clearance, save/reopen and final STEP acceptance await the part corrections above.

Protected editable assembly checkpoint: `VICE-assembly-checkpoint-browser-2026-09-30.mforge` (1,838,029 bytes).

Latest module/link/source assertion gates: 595 modules, 1,490 assertions; all pass.
