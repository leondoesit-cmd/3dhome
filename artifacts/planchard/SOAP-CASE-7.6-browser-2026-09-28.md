# Exercise 7.6 — soap case design example

Source: PDF372 / printed7-64. The book deliberately leaves the dimensions to the designer. This is a clearly labeled example, authored from a blank desktop Chrome document in dark theme, not a dimensioned-book reconstruction.

Chosen dimensions:120×80×25mm overall, R10mm vertical corners, 2mm inward shell with top face removed. Four history steps: fully defined Top rectangle, Extruded Boss, four-edge Fillet, Shell. One solid with ABS density1.04g/cm³.

Actual Chrome exact volume36.34955724789027cm³; mass37.80354g; COM(60,6.956482014,40)mm. Analytic rounded-rectangle shell volume agrees. Save/reload/library reopen preserved all four features, the fully defined sketch and ABS material; reopened Chrome exact mass36.34956cm³/0.03780354kg matches.

Actual browser exports: SOAP-CASE-7.6-browser-2026-09-28.mforge; STEP62,542bytes; PNG proof. Independent actual-bundle replay has no issues and passes the BREP export gate. A native tolerance of.0010000000000000005cm exposed floating-point rounding at the unchanged.001cm limit. The gate now allows four relative double ULPs only; genuinely larger tolerance.001001cm still rejects. See docs/planchard/rib-and-export-repairs-2026-09-28.md.
