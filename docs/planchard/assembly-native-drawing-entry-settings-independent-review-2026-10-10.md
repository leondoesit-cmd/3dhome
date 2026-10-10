# Assembly native Drawing entry/settings independent review — 2026-10-10

Read-only review of core/assembly_drawing_settings.js, modeler native Drawing entry/settings integration, and the scoped assembly CSS visibility rules.

Independent test run: **12/12 PASS** — five assembly drawing-settings tests, five interactive component-balloon tests, and two drawing-mode transition tests. First owned native sheet inherits valid legacy page units/ratio/projection/standard/title metadata, invalid inputs use native sheet defaults, and cold SVG is stable. Existing authored native drawings remain authoritative, including an intentionally empty view array; subsequent legacy settings do not reset them. The ordinary settings dialog exposes Open native Drawing. Assembly CSS retains native Drawing canvas/hint/mode access while hiding part sketch and split controls; hidden preview rendering is suppressed during transition.

No confirmed defect within the declared scope. Legacy free-text drawingSettings.notes are intentionally retained in legacy settings but are not automatically converted to positioned native paper notes. Their placement is undefined; book notes must be authored through ordinary native Note. This qualification is explicit in the implementation report and was confirmed with its owner. No invented paper placement is inferred.

Native component balloons retain their separate qualification: mesh triangle-centroid anchors with occurrence-path/BOM linkage, not persistent face/edge association. Native assembly component topology freshness and source material/contact acceptance remain independent checks.

No code, authored CAD, browser state, ADVANCE or Git changes were performed. Actual rendered/browser acceptance remains parent-owned.
