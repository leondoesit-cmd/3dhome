# Chapter11 tray geometric layers — actual browser audit

**PASS13/13 independent checks**,10October2026. Parent actually cold-loaded the accepted two-cylinder tray in desktop Chrome,opened Layer analysis,applied0.2mm,then changed only layer height to0.25mm and selected layer40. This read-only audit checks those actual JSON/SVG exports,screenshots and after-layer bundle;it does not author CAD,edit ADVANCE or commit.

|Actual height|Layer count|First sectionZ|Last sectionZ|Each section|
|---|---:|---:|---:|---|
|0.2mm|50|0.1mm|9.9mm|Two separate closed loops,zero holes,628.119178060839mm² total area|
|0.25mm|40|0.125mm|9.875mm|Two separate closed loops,zero holes,the same area|

Every one of the90 exported layers independently passes slab bounds/numbering/midpoint checks,occurrence identities5952/5953 and names,left/right separation,and one convex positively oriented144-vertex loop per object. Each vertex lies on its expectedR10 circle atX−25/+25mm within5.33e−15mm. Loop bounds are leftX−35..−15,rightX15..35,Y−10..10,leaving a30mm gap. Layers fillZ0..10 continuously. Export bounds70×20×10mm match the saved Top100×100×50mm illustrative bed and1144triangle native print tessellation.

Independent regular-polygon area gives **144×100×sin(2π/144)=628.119178060838mm²**,matching all reported/shoelace areas. Ideal native two-circle area is628.318530717959mm²;the0.03172796% deficit is expected faceting,not a native size change. Integrated layer area×10mm is6281.191780608384mm³;independent parsing of the previously accepted actual1144triangle binarySTL gives6281.191771738047mm³,a residual8.87e−6mm³ from float serialization.

Both actual analysisJSONs retain the same sourceMeshFingerprint`fnv1a32-a17b222d`,source name,mm/Z-up coordinates,Topbed and0.01mm/5°tessellation. All metadata exceptlayerHeight/layerCount/layers is identical;this is the stated one-variable comparison. The fingerprint is an exported index-stream identifier,not a cryptographic source certificate. Geometric/source/assembly checks independently substantiate the resulting contours.

All three actual SVGs contain two closed even-odd paths matching the corresponding JSON contours with the documented SVGY reflection:0.2layer1,0.25layer1 and0.25layer40. The final screenshot visibly shows selected40/40,sectionZ9.875mm,two closed contours,zero holes and628.119mm². This verifies selection beyond the initial section,not just a changed form field.

## CAD preservation and limits

`CH11-tray-after-layer-browser-2026-10-10.mforge` preserves the **entire active assembly structurally exactly** against`CH11-tray-cold-accepted-browser-2026-10-09.mforge`:definitions/native caches,occurrence poses/grounding,mates,metadata/context,printSetup andstlExportSettings. Both are113055bytes. The top-level project timestamp and inactive blankmainModel scaffolding differ;no whole-project byte-identity claim is made. Active tray key remains`asm_mv0j0gpy`.

This completes actual browser **geometric mid-slab layer inspection and one-variable height comparison** on the accepted multipart tray. It does **not** create perimeters,infill,supports,nozzle/toolpaths,G-code or a physical print. The actual UI and JSON explicitly preserve that qualification. Source assembly cold durability predates this run and its source was cold-loaded beforeApply;generated analysis replay/persistence after a further reload is not asserted.

Evidence:`artifacts/planchard/CH11-tray-layer-browser-audit-2026-10-10.json`;actual`CH11-tray-layer-0.2`,`.25`,layer40JSON/SVG/PNG andafter-layerbundle. No source/model input was modified by this audit.
