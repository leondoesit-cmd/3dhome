# SLOPED WEDGE BLOCK — exercise 6.5

Browser-authored from the user's *Engineering Graphics with SOLIDWORKS 2021* PDF, physical page 305 (printed page 6-37), on 2026-09-24. Saved as **SLOPED WEDGE BLOCK - exercise 6.5 - 6061 Alloy** in the ModelForge library; the local disk backup is `.model-backups/cm_mueu5ruc/latest.json`.

- A fully defined Right-plane six-edge side profile has a 2.00 in depth, 2.00 in height, 0.50 in base, 1.00 in rear plateau, and 1.50 in slope run from the front foot to the rear. Boss-Extrude1 makes it 3.00 in wide.
- A fully defined Front-plane rectangle spans the central 1.00 in band above the 0.50 in base. Extruded Cut1 is through-all, leaving two 1.00 in side ribs. The book leaves the cut's lower extent and parts of the oblique silhouette underdimensioned; this flat-bottom channel is the recorded interpretation, not an inferred production specification.
- 6061 Alloy uses the book's 0.097 lb/in³ density, entered as 2.6849507569 g/cm³ with a source note. Exact mass properties: 6.75 in³ volume and 0.65475 lb mass. The body remains one exact solid with a 3 × 2 × 2 in bounding box after save and reopen.
- The saved A3 sheet uses ANSI third-angle projection, IPS values with two decimal places, four views, five dimensions (two overall and three topology-bound: 1.00 plateau, 0.50 base, 1.00 side rib), a central-channel interpretation note, and material/mass/date title-block fields.

The book's origin arrow appears to target the outer rib's slope/base junction. This model's global origin is the lower front corner of the Right-plane profile; the origin placement is the remaining reference difference. The sketch/feature geometry, density, and drawing have been browser-saved and reopened, but the origin should be aligned before using this as a coordinate-sensitive assembly reference.

During this workflow, committing a cut could leave a sketch point selected. Its material pane then accepted an appearance for the point instead of the actual body and rejected engineering density edits. The cut now selects its rebuilt body, clears sketch/topology selection, and the material pane resolves only document solids. Save removes obsolete body appearances that targeted sketch geometry. Browser regressions cover the cut selection and sketch-vertex guard; the cleaned saved record has one body appearance, targeting the actual solid.
