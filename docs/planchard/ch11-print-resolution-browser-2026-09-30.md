# Chapter 11 — STL resolution, live Chrome acceptance

Fresh sample authored in desktop Chrome through the visible sketch and feature tools on September 30, 2026. This is a labeled print sample, not a dimensioned book exercise.

- Top-plane circle snapped to the origin, diameter 2 cm entered through Smart Dimension. Fully defined sketch.
- Blind extrusion 1 cm. Two editable history steps and one exact closed solid.
- Output → Export STL → Custom: deviation 0.01 mm, angle 5°, matching the book's Chapter 11 custom-resolution example.
- Downloaded binary STL: 576 triangles, 28,884 bytes. Bounds in millimetres approximately X ±10, Y 0–10, Z ±10 (polygon sampling explains the small chord extrema).
- Named and saved the source, exported its project bundle, reloaded Chrome, opened the saved library entry, and reopened STL export. Custom, 0.01 mm and 5° persisted visibly.

Protected artifacts: `artifacts/planchard/CH11-print-sample-browser-2026-09-30.mforge`, `CH11-custom-resolution-browser-2026-09-30.stl`, and `CH11-custom-resolution-reopened-browser-2026-09-30.jpg`.

Implementation: `js/cad_stl.js` converts user millimetres/degrees into native centimetres/radians; `js/modeler.js` exposes and persists the export form. Native closed-solid validation remains required. Six focused STL tests and `npm run check` pass (598 modules, 1490 source assertions).

## 3MF export acceptance

Added native 3MF Core mesh export through Output → Export 3MF, using the saved custom resolution. Actual Chrome export succeeded. Independently opened the downloaded ZIP with .NET and parsed its XML: three required package files, explicit millimeter unit, 290 shared vertices, 576 triangles, and Z bounds 0–10 mm. Export rotates ModelForge's Y-up space into a right-handed Z-up print space without reflecting winding. It validates the native solid and rejects open or inconsistently oriented mesh edges. Three focused 3MF tests plus six STL tests pass; module gates pass with 599 modules and 1490 source assertions.

Protected `CH11-custom-resolution-browser-2026-09-30.3mf` and `CH11-3MF-export-browser-2026-09-30.jpg`. Format reference: [3MF Consortium Core specification](https://github.com/3MFConsortium/spec_core/blob/master/3MF%20Core%20Specification.md). This is core geometry exchange; material extensions and slicer/printer settings are not included.

## AMF export acceptance

Added flat-triangle AMF XML export through Output → Export AMF with the same resolution, native-solid validation, closed-mesh check and right-handed Z-up conversion. Actual Chrome export succeeded. Independently parsed the downloaded XML with .NET: version 1.2, millimeter units, 290 vertices, 576 triangles, Z bounds 0–10 mm. Protected `CH11-custom-resolution-browser-2026-09-30.amf` and `CH11-AMF-export-browser-2026-09-30.jpg`. Layout reference: [FreeCAD's AMF exporter](https://github.com/FreeCAD/FreeCAD/blob/main/src/Mod/Mesh/App/Exporter.cpp). This exports core geometry, without materials, curved-triangle or printer extensions. Ten focused print-format tests pass; module gates pass with 600 modules and 1490 source assertions.

## Print orientation and bed preparation acceptance

Output → Print setup now exposes a base plane, bed width/depth and build height in millimeters, with a live centered bounding-footprint preview and fit status. In desktop Chrome the fresh sample was placed on Front with a 30 × 30 × 30 mm printer volume, preview 20 × 10 × 20 mm, and applied through the visible form. CAD sketch/feature geometry stays 20 × 10 × 20 mm in its original modeling coordinates; print placement is stored separately.

Actual STL, 3MF and AMF exports were independently read using .NET. All three are centered on X/Y, have their lowest Z at 0 mm, and maximum Z 19.99765 mm (the faceted circle's expected chord deviation from 20 mm). STL has 576 triangles; 3MF/AMF have 290 shared vertices and 576 triangles. The settings were saved to the library and a new compact project bundle exported. Protected `CH11-print-setup-browser-2026-09-30.{mforge,stl,3mf,amf,jpg}`. Twelve focused print tests and module/import/source gates pass (601 modules, 1490 assertions).

Slicing and physical printing require an actual slicer/printer and are not claimed as completed. The whole ebook remains unfinished.

Cold Chrome reload and library reopen visibly preserved Front and all three 30 mm printer dimensions. A visible 19 mm width edit showed Exceeds print bed; Apply refused it with Part exceeds the selected print-bed size in this orientation. Canceled the form, preserving the saved setup. Proof: CH11-print-bed-overflow-browser-2026-09-30.jpg.
