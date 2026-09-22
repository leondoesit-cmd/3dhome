# AXLE material gap closed

Implemented and browser-verified 2026-09-22.

- Added a distinct Aluminum 1060 stock material with nominal density from Hydro's Alloy 1xxx datasheet (revision 2019/01, page 1): 0.0975 lb/in³. Stored conversion uses 453.59237 g/lb and 2.54 cm/in without rounding intermediate calculations. The UI records the source and provides a link. No temper-dependent strength properties are inferred.
- Added editable density in g/cm³ and a separate density reference to engineering material profiles, including custom materials.
- Material assignment updates the body name, catalog identity, density and density reference together. Shared assigned profiles update all their bodies. Invalid densities are rejected before mutation.
- Stock material selection refreshes its displayed density immediately. Saving physical data distinguishes success from incomplete strength qualification.

Browser verification on the retained AXLE:

1. Assigned Aluminum 1060 through Material & finish and inspected its density reference.
2. Entered zero density: rejected, form remained open.
3. Assigned temporary custom density 1.25 g/cm³: exact mass changed to 0.7818428 g.
4. Undid that test and saved **AXLE - exercise 5.6 - Aluminum 1060**.
5. Reloaded the application and reopened that library record. Exact mass properties reported diameter 4.7752 mm, length 34.925 mm, volume 0.6254742 cm³, mass 1.688024 g, and center of mass (0,0,0). Body identity remained Aluminum 1060.

Twenty focused tests passed, including exact mass after JSON serialization, custom density changes, shared-profile propagation, and atomic rejection of invalid values. Module/link checks and source assertions passed. Full suite not run.

This resolves AXLE-1060-MATERIAL-GAP.md. Dual-unit drawing and ANSI settings for the full exercise remain separate workflow verification tasks.
