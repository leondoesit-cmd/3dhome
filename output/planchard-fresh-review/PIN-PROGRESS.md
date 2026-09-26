# PIN — exercise 6.2

Browser-authored from the user's Engineering Graphics with SOLIDWORKS 2021 PDF, physical page 303 (printed page 6-35), on 2026-09-24.

- Saved as **PIN - exercise 6.2**. Front-plane six-line closed profile, fixed at the origin, fully defined by named driving dimensions: flange radius 1.000 in, flange length 1.375 in, shaft radius 0.7625 in, overall length 3.476 in.
- Revolved the profile 360° around the X axis. Applied Aluminum 6061 (2.70 g/cm³). Chamfered the flange shoulder outer edge and shaft-tip edge at 0.100 in × 45° in one history feature. The saved document rebuilds successfully as one solid; exact topology is cached for both Revolve and Chamfer.
- Set the drawing to ANSI, inch units, third-angle projection, and three decimal places. Reopened the saved record in the browser and confirmed the drawing preset persisted, with overall 3.476 in and 2.000 in dimensions visible.
- The exact Mass Properties command reports 8.103978 in³, **0.7904919 lb** (358.5611 g), and centre of mass X 1.500277 in, Y/Z 0. The measured envelope is 3.476 × 2 × 2 in.

Gaps closed during the workflow: the Chamfer edge browser now accepts signature-verified exact topology while a saved display mesh rebuilds, refreshes when a body is selected after opening the command, and labels its edges in the part's units. Ordinary part drawings now use their triangle data directly instead of rebuilding a temporary Three scene during the viewport transition; the saved PIN drawing completes without the previous browser stack overflow.

Next ebook exercise: 6.3 Mounting Nut. Its instruction to measure a physical metric nut leaves the dimensions unspecified; choose and record a measured specimen or a clearly identified reference size before calling that model dimensionally faithful.
