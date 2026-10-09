# Official chain link and pins — read-only source dimensions

The publisher's Chapter 10 modern parts and legacy `CSWA Sample Exam` parts have identical decoded analytic coordinate multisets: 52 link records and five records for each pin, with zero numerical difference. Source hashes and extraction paths are retained in `scratch/planchard/official-chain-source-measurements-2026-10-09.json`. This identifies the supplied geometric variant independently of any exam answer. Both source variants specify `Titanium` and `Imported1`; neither contains native sketch dimensions.

| Measurement | Source geometry, mm |
|---|---|
| Link pivot centres | (0,100,0) and (0,-100,0), separation 200 |
| Pivot axes | Upper Z; lower X, perpendicular |
| Both outer round ends / bores | Ø100 / Ø50 |
| Upper bar | X ±50, Z ±50; straight section Y 0..100 |
| Upper round cap | Radius 50, centre Y100, extends to Y150 |
| Fork slot | Z ±20, starts at Y50, open through upper cap |
| Ear thickness | 30 each, Z -50..-20 and 20..50 |
| Lower tongue | X ±20, Z ±50; straight section Y -100..0 |
| Lower round cap | Radius 50 in YZ, centre Y-100, extends to Y-150 |
| Long pin | Plain Ø50 cylinder, Y -300..0 |
| Short pin | Plain Ø50 cylinder, Y -100..0 |

The implied link bounds are X±50, Y±150, Z±50. The upper bore runs along Z through both ears; the lower bore runs along X through the 40 mm tongue. These source coordinates define an authorable recipe: upper rectangular bar and semicircular end, lower narrow tongue and semicircular end, fork slot and two orthogonal bores. The embedded source preview corroborates the fork/tongue arrangement. No shoulders are present in the pin analytic records or preview.

Independent analytic integration of this measured recipe gives **1,396,349.540849362 mm³**, centroid **(0,14.748210874998628,0) mm**. The source cached tuple has rounded volume `0.001396` and centroid Y `0.014748`, consistent with cubic metres/metres; this is a corroboration after dimension extraction, not a fitted target. Pin volumes are π·25²·300 and π·25²·100 mm³. The source's empty MaterialTree payload does not independently establish a density or titanium grade; material-name evidence must remain distinct from certification.

Modern `Contents/Config-0-Partition` contains only empty schema streams. The imported geometry is instead in `Config-0-FeatureBodies/LocalBodies`: its wrapped Parasolid stream begins at byte 36. Legacy OLE sources retain the same LocalBodies stream location. The pure Node CFB reader extracts 33 streams per legacy file with source bytes unchanged; two optional compressed-stream interpretations fail cleanly and are recorded rather than substituted. LocalBodies extraction validates nested zlib member lengths.

Evidence folders are `scratch/planchard/official-{chain-link,long-pin,short-pin}-localbody-inspection` and corresponding `official-legacy-...-localbody-inspection`. `record-observations.json` retains raw offsets, analytic types and coordinates. Legacy chain preview is `scratch/planchard/official-legacy-chain-link-container/PreviewPNG.png`.

This reader checks analytic record/vector invariants but does not decode the complete face/shell/body graph. Equality here means analytic coordinate multiset equality, not a native solid Boolean comparison. No source geometry was imported, no final model was authored, no executable was installed, and browser/app/ADVANCE files were untouched.
