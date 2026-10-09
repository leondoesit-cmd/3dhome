# Basic Q6B source-qualified native validation — 2026-10-09

Read-only audit of the parent's actual Chrome-authored source-qualified bundle (940617 bytes), driving edit (941534 bytes), restored bundle (940639 bytes), and exported STEP (143178 bytes). No authored geometry was changed by this audit.

The qualified bundle passes 10 finite checks: original sketches and upstream features preserved, physical X−5 mm move without a copy, bounds X−70..70 mm, unreversed Coordinate System1 at (70,0,20) mm, and source nominal density 2.7 g/cm³. One native solid has volume 114721.624844641 mm³ and mass 309.748387081 g. World COM is (−16.247778335,15.506081574,−2.665835357) mm; named source-frame COM is (−86.247778335,15.506081574,−22.665835357) mm.

The actual central drill diameter constraint1746 changed 4→4.1 mm while both other drill diameters remained4 mm. Its native volume is 114705.720531832 mm³, removing 15.904312808786 mm³. The independent cylinder formula π/4 × (4.1²−4²) ×25 gives15.904312808798 mm³; disagreement is1.24e−11 mm³. Parent reports actual Undo/Redo/Undo; restored sketches and feature specs exactly match the nominal export.

STEP imports as one solid. Bidirectional material differences are1.42e−14 and3.13e−12 cm³, with nominal volume and COM preserved. All6 restoration/STEP checks pass. Import here was disposable validation, not browser CAD authoring.

The source R10/R30 profile arcs, later generalR7 fillet, associative2 mm inset and9.5 mm pocket floor remain unchanged. The printed volume114721.22 differs by0.404845 mm³ (0.000353%); no exact BREP identity or target fitting is claimed. Companion COM Y15.506 versus printed Y15.44 remains a source discrepancy. Coordinate System1 is persisted; exported activeCoordinateSystemId is origin. Parent separately verified named reporting through the transient Mass Properties selection. Full cold persistence is pending the parent's next browser check.

Machine-readable evidence: [native audit](../../artifacts/planchard/BASIC-Q6B-source-qualified-native-audit-2026-10-09.json).

## Final cold preservation

Actual cold export BASIC-Q6B-cold-accepted-browser-2026-10-09.mforge (940569 bytes) passes all13 present-field durability checks against the restored nominal export. Every main-model field is exact except rebuilt parts[0].meshData and lastRebuild; the entire exactTopologyCache, original feature graph, four sketches/constraints, ten history entries, reference frames, source citations, density2.7, Description and engineering qualifications remain exact. Rebuild is successful and its signature is exact. These are rebuild/session differences, with no source-geometry or material drift.

Parent reports full reload and actual clean saved model; one native solid, four fully defined sketches, source world COM and the named coordsys_mv0hr6b7 reporting COM were verified in Chrome. Description, density/provenance and unrated qualification were read and cancelled. The stored origin reporting preference remains distinct from this verified transient named selector.

Scoped final acceptance is recommended: browser authoring, independent native geometry, analytical driving-diameter change, Undo/Redo/Undo restoration, exported STEP and cold durability pass. The printed volume and COM-Y discrepancies stated above remain disclosed; no exact companion BREP identity or certified alloy-properties claim is made.
