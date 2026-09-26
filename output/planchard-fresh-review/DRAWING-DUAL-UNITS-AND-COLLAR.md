# Drawing improvements and shaft collar progress

2026-09-22. Implemented dual-unit sheet dimensions with independent precision, persisted ANSI/ISO setup presets, and automatic dimensions for the selected view. Presets configure units, precision and projection; they are not a claim of comprehensive ANSI/ISO drafting compliance. Explicit tolerance text and overridden dimension text are retained verbatim; angle dimensions are not length-converted.

AXLE drawing saved with inches (3 decimals) and bracketed millimeters (2 decimals), third-angle projection. Browser screenshot confirms the 1.375 [34.93] length and 0.188 [4.78] overall width. Save/reopen retained the settings. Browser SVG export completed; automated SVG assertions verify dual-unit text. Physical printer output was not tested. Existing automatically generated width dimensions are not diameter callouts; final drawing cleanup remains.

Continued to ebook exercise 5.7, SHAFT COLLAR (PDF 260 / printed 5-42). Created in the browser from a fully defined concentric Front Plane sketch, with outer diameter 0.438 in, bore 0.188 in and depth 0.250 in. Saved as **SHAFT COLLAR - exercise 5.7**. Added Aluminum 2014 to the stock catalog with density 2.8 g/cm³ and its supplier source (Worthwill Aluminum, Density of Aluminum, p. 1). Temper-specific strength values remain unset.

Reopened collar: exact geometry, one part, dimensions 11.1252 × 11.1252 × 6.35 mm, volume 0.5035532 cm³, mass 1.409949 g, centroid (0,0,3.175) mm. The ebook's rounded outer-diameter inch and metric labels (.438 and 11.11) are not exact conversions; this model follows its stated .438-inch value.

Collar drawing saved with the dual-unit setup, overall dimensions, material and measured mass. Bore diameter annotation and final sheet cleanup remain before calling it a finished drawing. Next modeling exercise is FLAT BAR - 3 HOLE (5.8).
