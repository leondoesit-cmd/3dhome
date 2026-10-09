# Chapter11 FLAT-PLATE orientation export validation — 2026-10-09

Read-only finite audit of actual Right-alternative and Top-preferred Chrome exports. The independent print variant key is cm_mv0i715k_5952; feature specifications, sketches, history and nominal material/density/provenance remain unchanged from the accepted FLAT-PLATE cold source. Both native reconstructions have one solid, volume102186.064886949 mm³.

Both variants pass11 checks each, plus cross-orientation congruence. All six STL/AMF/3MF meshes have2350 triangles, geometrically welded closed edges with opposite directed incidence, positive signed volume, centered XY and minimumZ0. Right extents are40.64×50.80×101.60 mm; Top extents101.60×50.80×40.64 mm. AMF and3MF explicitly declare millimeters; unitless binary STL scale matches these dimensions. AMF/3MF volume is102181.431424531 mm³ in both orientations; STL float32 volume differs by less than0.0043 mm³. Right and Top vertex sets are congruent under the exact orientation transform to0.00001 mm.

The native BREP and triangular mesh are not identical: mesh volume is4.633462 mm³ lower (0.00453434%), the expected finite curved-surface approximation qualification. Parent observed custom0.01 mm deviation/5° angle controls for both exports; only the later Top bundle persists stlExportSettings, so no persisted Right settings claim is made. The150 mm illustrative cubic bed contains both orientations. Front preview was observed by parent and is not an exported third variant in this audit.

This validates source preservation, units, orientation and mesh export integrity. It does not validate slicer settings, supports, physical printing or printer/material/process suitability. Cold persistence remains pending parent's next actual browser leg.

Machine-readable evidence: [orientation audit](../../artifacts/planchard/CH11-FLAT-orientation-export-audit-2026-10-09.json).

## Final cold preservation

Actual cold bundle362618 bytes passes12 present-field checks. Source feature/history/sketch geometry, native part mesh/material, reference frames, custom PrintStudy qualification and active Top150³ printSetup are exact; custom resolution0.01 mm/5° is preserved. Native exact-cache contents are exact, with only five entry signatures refreshed by the current code. Rebuild and standards-audit timestamps also differ.

One explicit metadata qualification remains: nested stlExportSettings.printSetup retains the earlier Right last-export snapshot, while the authoritative printSetup is Top. Source openStlExportForm.onApply copies current printDocument.printSetup into fresh export settings; it never selects this stale nested orientation. Thus the next visible cold export uses Top. The comparison does not claim nested byte-identical last-export metadata. Parent verified Top setup/fit, mesh resolution, PrintStudy qualification, source mass/material and clean Save in the actual cold UI.

Scoped orientation/export acceptance is recommended. No manufacturing, slicer or physical-print acceptance is implied.

## Final actual cold STL witness and explicit save

Actual cold STL117584 bytes is byte-identical to the previously audited Top STL:2350 triangles,101.599998×50.799999×40.639999 mm, positive volume102181.428289600 mm³, centeredXY/Z0. This directly demonstrates that current Top setup overrides historical nestedRight metadata. Parent explicitly saved afterward; final bundle362730 passes9 checks, including exact source feature/sketch/history/part nonmesh metadata, custom qualification and now-entirely-exact Top export settings. Only rebuilt meshData/exactBuildToken differ in the part. The earlier historical nestedRight qualification is superseded for the final saved checkpoint. Scoped final orientation/export acceptance is recommended, with the curved-mesh approximation and physical-process limits retained.
