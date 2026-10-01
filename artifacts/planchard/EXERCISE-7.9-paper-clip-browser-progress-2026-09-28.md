# Exercise 7.9 — fresh Gem paper clip example

Source: PDF374 / printed7-66. Authored from a blank document in desktop Chrome, dark theme. The book specifies Ø.010in wire and Plain Carbon Steel, but supplies no overall dimensions. Chosen centerline envelope: .35in width ×.95in height.

Top-plane continuous path has four vertical lines and three semicircular arcs, seven entities, four driving lengths and sixteen constraints, fully defined. Path points in inches: (0,0)→(0,.5); upper R.075 arc to(−.15,.5); line to(−.15,0); lower R.15 arc to(.15,0); line to(.15,.625); upper R.175 arc to(−.2,.625); line to(−.2,.1). Adjacent endpoints were merged through the UI. Circular-profile Sweep Ø.010in, one solid, Plain Carbon Steel7.85g/cm³.

Exact Chrome volume .004384468cm³, mass .03441807g. Actual library Save completed cleanly; project bundle and44,172-byte STEP exported. Independent replay of that browser-authored bundle succeeds with two compiled features, issues[], volume .004384467933104797cm³ and COM(−.08773210882500135,0,.8384748970369859)cm.

Artifacts: EXERCISE-7.9-paper-clip-browser-2026-09-28.{mforge,step,png}, plus original checkpoint. The source tab stalled after reload; canonical saved-library reopening in the healthy spring editor succeeded with clean state, two steps, fully defined path and matching exact mass/COM. Driving wire diameter.010→.012in rebuilt the solid to .006313634cm³/.04956203g, the expected1.44 volume ratio. Undo restores .010in and the original exact volume/mass/COM with clean saved state. Final actual Chrome screenshot protected.

Workflow defects found: inferred tangency incorrectly selected an unrelated inner arc, and fitting a single vertical segment cropped it at extreme zoom. UI agent repaired finite tangent contact and pixel-scaled tolerance, arc extrema and camera-aware sketch zoom; 41 focused behavioral tests pass. Actual fresh Chrome checks verified visible vertical endpoints, reversible toolbar zoom and no false tangency at the extension of a finite segment. Screenshots: sketch-vertical-fit-browser-2026-09-28.png and sketch-finite-tangent-browser-2026-09-28.png.
