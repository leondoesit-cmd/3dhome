# Engineering material and gear service checks

The material workflow covers all 27 stock/toolbox entries plus custom materials. Stock aluminum 6061 and toolbox aluminum 6063 retain separate identities. Appearance colors and density never supply strength values automatically.

## Using the editor

1. Select a body and open its Appearance tab. Choose **Engineering material data**.
2. Select the material and record its grade, condition/treatment, qualification reference, temperature range, speed, cycles, service duration, environment and lubrication. Incomplete records may be saved; they cannot pass verification.
3. For a generated spur gear, enter **Mating material data**, then **Loads and tolerances**. Specify selected-gear torque and speed, life, mating width, load/safety factors, center-distance and tooth-thickness tolerances, backlash limits and measured profile deviation with its reference.
4. Choose one of the two methods below and use **Check material and load**. Ordinary bodies receive a material-data completeness check; this is not a general structural solver.

## Methods and scope

**Preliminary bending/contact screening** requires explicitly qualified isotropic elastic properties for both materials, allowable stresses applicable to the declared service life, and module-based Lewis form factors with their source. Bending uses `Ft / (b m Y)`, with the supplied load factors. Contact uses elastic Hertz line contact at the operating pitch point. The smaller mating face width controls the calculation, and the supplied stress safety factors reduce allowable stress.

**Configuration-specific rating** works for every catalog entry and custom materials. Enter the rated torque of each gear and a reference to a report covering the exact geometry, both materials, face widths and qualified service envelope. Recording this rating is an explicit action. The application compares factored torque against these declared limits; it does not independently authenticate the report. Wood, anisotropic materials and appearance-only finishes require this route, with the actual material/substrate and condition identified in the record.

Both methods check temperature, speed, cycles, elapsed service duration, environment and lubrication. Geometry checks evaluate center-distance tolerance extremes and nominal spacing using operating pressure angles; they check contact ratio, root clearance, involute engagement and backlash, including tooth-thickness tolerance. Measured profile deviation must fit the specified drawing tolerance. These are selected tolerance checks, not a complete gear inspection standard.

All dimensions entered here are millimeters, torque is Nm, stress/modulus are MPa, speed is rpm, duration is hours, and temperature is Celsius. Model geometry is converted from centimeters. Use qualification data applicable to the actual material, manufacturing process and service conditions; no illustrative strength values are shipped as material ratings.

## Persistence and invalidation

Material qualifications are stored in the document's `engineeringMaterials` library and referenced by bodies. Gear service inputs and supplied ratings are stored with the gear. Ordinary document serialization preserves these records. Changing either material qualification, gear geometry or face widths makes an existing configuration rating stale. Editing service loads retains the rating and checks the new loads against it. Changing the body's material catalog assignment requires a matching qualification. Surface appearance changes do not change the body's engineering material.

## Meaning of results

Results are **Needs attention**, **Screening passed**, or **Within the supplied rating**. None grants production approval or implements full ISO 6336 certification. Thermal distortion, wear, lubricant-film behavior, scuffing, rim/hub stress and full fatigue spectra still require the applicable engineering review. Standards audit includes the live service result while retaining its production-review requirement.

The scope distinction follows [ISO 6336-1](https://www.iso.org/standard/63819.html). Hertz contact references include [NIST's elastic compression technical paper](https://emtoolbox.nist.gov/Publications/NationalStandardsLaboratoryTechnicalPaperNo25.pdf). These references explain method scope; the application does not claim to implement the complete standards.

## Regression coverage

`tests/cad_material_validation.test.mjs` exercises every material, independent force/stress expectations, missing and corrupt inputs, service limits, tolerance extremes, stale ratings, overloads, serialization and audit integration. `tests/cad_material_validation.browser.mjs` exercises actual material and gear controls, draft persistence, and incomplete-data reporting.
