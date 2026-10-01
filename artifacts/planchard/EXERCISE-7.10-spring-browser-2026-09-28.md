# Exercise 7.10 — fresh variable pitch spring

Source: PDF374 / printed7-66. Built from a blank desktop Chrome document in dark theme. Top-plane origin-centered Ø.235in circle, fully defined. Helix variable-pitch table follows the book, start angle0°, right hand/clockwise, Reverse unchecked. Circular-profile Sweep Ø.015in linked directly to the helix; three authored steps, one exact solid. Plain Carbon Steel7.85g/cm³ is a chosen material because the exercise does not name a grade.

| Revolution | Pitch(in) | Height(in) | Diameter(in) |
|---|---|---|---|
|0|.021|0|.235|
|1|.021|.021|.235|
|2|.080|.0715|.235|
|3|.080|.1515|.235|
|4|.021|.202|.235|
|5|.021|.223|.235|
|6|.021|.244|.235|

Pitch interpolates linearly between region values; heights are integrated rather than treating each region as a constant-pitch step.

Exact Chrome volume .01284543cm³ and mass .1008366g. Independent replay of the actual browser-exported bundle: three compiled features, issues[], volume .012845428665532546cm³, COM(−.000018215317372962506,.3347471595458917,−.00005867232147809114)cm.

Actual clean library Save and80,238,678-byte project export; exact STEP154,097bytes. Driving region at revolution3 pitch.080→.090 increases integrated helix height.244→.254in; downstream circular Sweep regenerates to .01284804cm³, mass .1008571g, overallY.6832cm. Undo restores clean saved state and overallY.6578cm. Reload followed by canonical saved-library click reopens three steps, one body and fully defined circle cleanly. Reopened exact mass, volume and COM match the original result.

Artifacts: EXERCISE-7.10-spring-browser-2026-09-28.{mforge,step,png}. Screenshot is actual Chrome. Physical spring stiffness, production fit and drawing are outside this geometry acceptance.
