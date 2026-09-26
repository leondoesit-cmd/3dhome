# AXLE exercise 5.6: required material unavailable

Browser reproduction on 2026-09-22, checkout based on `287dd91`.

Source: Planchard, Engineering Graphics with SOLIDWORKS 2021, PDF page 259 / printed page 5-41. AXLE requires a Front Plane circle, diameter 0.188 in, a 1.375 in Mid Plane extrusion, and 1060 Alloy. Dual units and ANSI drafting are also requested; those requirements have not yet been verified.

## Completed browser work

Created a Front Plane sketch centered at (0, 0), applied a driving circle diameter of 0.47752 cm, and confirmed Fully defined. Selected the Mid-plane end condition and entered depth 3.4925 cm. The viewport shows the resulting cylinder and reports Rebuild succeeded, one part. Saved as **AXLE - exercise 5.6 - material pending**. Full geometric measurement and save/reopen verification remain pending.

## Reproduce the material gap

1. Select the axle body and open Material & finish.
2. The stock choices include Aluminum 6061, Steel 304, Brass C360, ABS, Titanium Grade 5, Nitrile rubber, and Polycarbonate. There is no 1060 Alloy.
3. Open Engineering material data and inspect the full Material selector. Toolbox entries add Aluminum 6063 and other materials, but no 1060 Alloy.
4. Custom material exposes grade, treatment, qualification, modulus, stress, and service fields, but no editable density field. The unchanged material pane displays density 7.85 g/cm³ and the document says Material <not specified>.

## Requested coder change

Provide a verified Aluminum 1060 material record usable by part assignment and mass properties, with its density and source explicitly recorded. Alternatively support custom material density and persist the material identity and physical properties together. Do not silently substitute 6061 or attach a 1060 label to the default density. Strength properties must remain unspecified unless supported by the selected temper and source.

Acceptance: assign 1060 Alloy to this saved axle, save/reopen, verify the name and density persist, and verify mass properties use that density. The current model has no alloy assigned; its material-dependent results must not be presented as those of 1060 Alloy.

Stopped at this new functionality gap under the user's instruction to document gaps for their coder. No application code changed in this continuation.
