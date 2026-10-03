/* The pro tool catalog: every tool of the planner, the model editor and the
 * cabinet designer, grouped the way the pro ribbon shows it
 * (editor → tab → group → tool).
 *
 * This file is data only, so a Node test can check every entry against the
 * app. Each tool names ONE binding to something that already works:
 *
 *   tool:<id>      the planner drawing tool with data-tool="<id>"
 *   act:<id>       the planner action with data-act="<id>" (runAction)
 *   click:<css>    a control that has no action name, clicked as is
 *   reveal:<css>   a panel: open its left tab / section and scroll to it
 *   left:<tab>     a left sidebar tab (library, structure, tree, project, home)
 *   mcmd:<id>      a model-editor command from buildCommandCatalog()
 *   cab:<attr>:<v> a cabinet-designer control, data-<attr>="<v>"
 *   mep:<v>        an MEP panel control, data-mep="<v>"
 *   mrel:<id>      a model-editor sketch relation, data-relation="<id>"
 *   mcon:<id>      a relation from the model-editor palette, data-constraint="<id>"
 *   meng:<key>     a material / engineering action of the selected part (Look pane)
 *   nest:#id       a section of the cut-plan / production dialog (opens it)
 *   nestgo:#id     a button in that dialog, pressed after opening it
 *   run:<act>      a planner action runAction() knows but no button carries
 *   pro:<name>     a command from js/pro_actions.js (existing feature, new entry)
 *   lib:<cat>      the library opened on one category (furniture_meta.js ids)
 *   mclick:#id     a model-editor header control (opens the editor first)
 *   planned:<id>   a tool the designs have and the app does not yet: shown,
 *                  marked "planned", and listed in docs/PRO_TOOL_GAPS.md
 *
 * A planned tool is shown so the layout is final, but it never pretends to
 * work: pressing it says it is planned. */

export const PRO_EDITORS = ["plan", "model", "cab"];

function T(label, icon, bind, key) {
  return { label: label, icon: icon, bind: bind || null, key: key || "" };
}

const PLAN = [
  ["Build", [
    ["Select", [T("Select", "ph-cursor", "tool:select", "1"), T("Erase", "ph-eraser", "tool:erase", "E"), T("Lock walls", "ph-lock", "act:lockStruct", "L")]],
    ["Walls", [T("Wall", "ph-wall", "tool:wall", "2"), T("Arc wall", "ph-bezier-curve", "tool:arcwall", "7"), T("Rectangle", "ph-rectangle", "tool:rect", "8"), T("Offset", "ph-copy-simple", "tool:walloffset"), T("Join", "ph-link", "tool:walljoin"), T("Break", "ph-scissors", "tool:wallbreak"), T("Bite", "ph-selection-slash", "tool:wallbite"), T("Reverse", "ph-arrows-left-right", "tool:wallreverse"), T("Paint side", "ph-paint-bucket", "tool:wallpaint")]],
    ["Openings", [T("Door", "ph-door", "tool:door", "3"), T("Window", "ph-frame-corners", "tool:window", "4"), T("Passage", "ph-columns", "tool:passage", "5"), T("Open segment", "ph-square-split-horizontal", "act:openseg"), T("Flip swing", "ph-arrows-clockwise", "run:flipSwing")]],
    ["Levels", [T("Add floor", "ph-stack", "act:addFloor"), T("Slab void", "ph-selection", "tool:slabvoid", "9"), T("Slab from stairs", "ph-stairs", "act:slabFromStairs"), T("Cutaway", "ph-house-line", "act:dollhouse"), T("Stairs", "ph-stairs", "pro:stairs"), T("Roof", "ph-house", "pro:roof")]],
    ["Rooms", [T("Room stamp", "ph-stamp", "tool:roomstamp"), T("Room presets", "ph-squares-four", "reveal:#plan-room-palette"), T("Point", "ph-crosshair", "tool:point", "6"), T("Add corridor", "ph-path", "run:addcorr"), T("Auto generate", "ph-magic-wand", "act:autoGenerate")]],
  ]],
  ["Constrain", [
    ["Dimensions", [T("Distance", "ph-ruler", "act:conDist"), T("Angle", "ph-angle", "act:conAngle"), T("Offset", "ph-arrows-out-line-horizontal", "act:conOffset"), T("Lock length", "ph-lock-simple", "act:lockWallDim"), T("Reference dim", "ph-ruler", "pro:refdim")]],
    ["Relations", [T("Parallel", "ph-equals", "act:conParallel"), T("Perpendicular", "ph-arrow-elbow-down-right", "act:conPerpendicular"), T("Collinear", "ph-dots-three", "act:conCollinear"), T("Equal length", "ph-equals", "act:conEqualLength"), T("Horizontal", "ph-arrows-horizontal", "act:conHorizontal"), T("Vertical", "ph-arrows-vertical", "act:conVertical"), T("Point on wall", "ph-map-pin-line", "act:conPointWall"), T("Symmetric", "ph-flip-horizontal", "act:ndSymmetric")]],
    ["Corners", [T("Square to 90°", "ph-square", "act:squareWall"), T("Fillet", "ph-bezier-curve", "act:wmFillet"), T("Chamfer", "ph-diamond", "act:wmChamfer"), T("Equal spacing", "ph-dots-three-outline", "act:wmEqualSpacing"), T("Pin", "ph-push-pin", "act:ndPin")]],
    ["Solve", [T("Warnings & DOF", "ph-warning-circle", "reveal:#warnPanel"), T("Repin", "ph-crosshair-simple", "act:conRepin"), T("Flip", "ph-arrows-clockwise", "act:conFlip"), T("Parameters", "ph-function", "reveal:#paramSection")]],
  ]],
  ["Interior", [
    ["Place", [T("Library", "ph-books", "left:library"), T("Real size", "ph-ruler", "act:prodSize"), T("Duplicate", "ph-copy", "act:dupSel", "⌘D"), T("Delete", "ph-trash", "act:deleteSel"), T("Variants", "ph-swap", "reveal:#i_variant_box"), T("Stack", "ph-stack", "pro:stack"), T("Kitchen run", "ph-rows", "pro:cabRun")]],
    ["Arrange", [T("Align left", "ph-align-left", "act:alLeft"), T("Align top", "ph-align-top", "act:alTop"), T("Distribute", "ph-dots-three-outline", "act:alDistX"), T("Face wall", "ph-arrow-bend-up-right", "act:faceAuto"), T("Group", "ph-selection-all", "act:groupItems", "⌘G"), T("Ungroup", "ph-selection-slash", "act:ungroupItems", "⇧⌘G"), T("Rotate 90°", "ph-arrow-clockwise", "act:rotR"), T("Auto layout", "ph-magic-wand", "run:autoArrange")]],
    ["Finish", [T("Textures", "ph-paint-brush-broad", "act:openTextureGallery"), T("Floor texture", "ph-grid-four", "act:uploadFloorTex"), T("Wall texture", "ph-paint-roller", "act:uploadWallTex"), T("Match floor", "ph-eyedropper", "act:matchFloor"), T("Seamless", "ph-infinity", "act:makeSeamless"), T("Room floor", "ph-grid-nine", "click:#r_floor_pick"), T("Lights", "ph-lightbulb", "lib:lighting")]],
  ]],
  ["MEP", [
    ["Networks", [T("Electrical", "ph-lightning", "mep:sys:power"), T("Water", "ph-drop", "mep:sys:water"), T("Drainage", "ph-drop-half-bottom", "mep:sys:drain"), T("Comms", "ph-wifi-high", "mep:sys:comms"), T("Air con", "ph-wind", "mep:sys:hvac"), T("Gas", "ph-flame", "mep:sys:gas")]],
    ["Route", [T("Auto generate", "ph-magic-wand", "mep:auto"), T("In wall", "ph-wall", "mep:layer:wall"), T("At ceiling", "ph-arrow-line-up", "mep:layer:ceiling"), T("Under floor", "ph-arrow-line-down", "mep:layer:floor"), T("Floor routes", "ph-stack", "mep:floor-routes"), T("Validate", "ph-seal-check", "reveal:#mepReview"), T("Angle snap", "ph-angle", "mep:angle-snap")]],
    ["Panels", [T("MEP panel", "ph-circuitry", "reveal:#mepPanel"), T("Smart home", "ph-house-simple", "reveal:#smartHomePanel"), T("Fixtures", "ph-shower", "mep:fixtures")]],
  ]],
  ["Site & scan", [
    ["Site", [T("Locate", "ph-map-pin", "act:siteLocate"), T("Pick on map", "ph-globe-hemisphere-west", "act:sitePick"), T("Footprint", "ph-polygon", "act:siteFootprint"), T("Import site", "ph-download-simple", "act:siteImport"), T("Map provider", "ph-globe", "reveal:#site_provider"), T("Site rotation", "ph-compass", "reveal:#site_rot"), T("GeoJSON", "ph-map-trifold", "act:importjson")]],
    ["Capture", [T("Room scan", "ph-scan", "act:roomScan"), T("Blueprint trace", "ph-image", "act:importBlueprintTrace"), T("Blueprint AI", "ph-magic-wand", "act:importBlueprint"), T("Survey", "ph-clipboard-text", "click:#surveyBtn")]],
  ]],
  ["Annotate", [
    ["Mark", [T("Place marker", "ph-map-pin-simple", "act:mkPlace"), T("Duplicate marker", "ph-copy", "act:mkDup"), T("Reference point", "ph-crosshair", "tool:point"), T("Dimension", "ph-ruler", "pro:dimension"), T("Note", "ph-note-pencil", "pro:note"), T("Symbols", "ph-shapes", "pro:symbols")]],
    ["Style", [T("Plan style", "ph-paint-brush", "act:togglePlanStyle"), T("Layers", "ph-stack-simple", "reveal:#layer-chips"), T("Tool names", "ph-text-aa", "act:toggleToolNames")]],
    ["Drawings", [T("Drawing 3D", "ph-pencil-ruler", "act:drawing3d"), T("Wall types", "ph-wall", "act:wallTypeEditor"), T("Wall elevation", "ph-frame-corners", "reveal:#w_elev"), T("Section", "ph-knife", "pro:section"), T("Print sheet", "ph-printer", "pro:sheetPrint"), T("Sheet SVG", "ph-file-svg", "pro:sheetSvg")]],
  ]],
  ["Analyze", [
    ["Quantities", [T("Cost export", "ph-currency-circle-dollar", "act:exportCost"), T("Wall take-off", "ph-list-numbers", "act:exportWallTakeoff"), T("Wall schedule", "ph-table", "act:exportWallSchedule"), T("Cut plan", "ph-scissors", "act:cutPlan"), T("Cost estimate", "ph-calculator", "reveal:#costList"), T("Area summary", "ph-ruler", "pro:areaSummary")]],
    ["Check", [T("Warnings", "ph-warning", "reveal:#warnPanel"), T("Tree", "ph-tree-structure", "left:tree"), T("Clearances", "ph-arrows-out", "pro:clearances"), T("Layout check", "ph-chart-bar", "pro:layoutCheck")]],
  ]],
  ["View & render", [
    ["View", [T("Plan", "ph-blueprint", "act:viewPlan"), T("3D", "ph-cube", "act:view3d"), T("Split", "ph-columns", "act:viewSplit"), T("Dollhouse", "ph-house-line", "act:dollhouse"), T("Frame", "ph-frame-corners", "act:frame", "F"), T("Walk", "ph-person-simple-walk", "act:walk", "W"), T("Part codes", "ph-hash", "pro:partCodes")]],
    ["Render", [T("Photo mode", "ph-camera", "act:photo", "P"), T("Video studio", "ph-video-camera", "click:#videoStudioBtn"), T("Edit in 3D", "ph-hand-grabbing", "act:edit3d"), T("Physics", "ph-atom", "act:physics"), T("Sun & sky", "ph-sun", "reveal:#envSection")]],
  ]],
  ["Output", [
    ["File", [T("Save", "ph-floppy-disk", "act:save", "⌘S"), T("Open", "ph-folder-open", "act:load"), T("New plan", "ph-file-plus", "act:newPlan"), T("Import JSON", "ph-upload-simple", "act:importjson", "⌘O"), T("History", "ph-clock-counter-clockwise", "pro:history")]],
    ["Export", [T("DXF", "ph-file-dashed", "pro:dxf"), T("IFC", "ph-buildings", "pro:ifc"), T("Plan SVG", "ph-file-svg", "pro:planSvg"), T("Schedules CSV", "ph-file-csv", "pro:schedules"), T("JSON", "ph-file-code", "act:exportjson", "⌘E"), T("glTF / Blender", "ph-cube", "act:exportgltf"), T("PNG 2D", "ph-image", "act:png2d"), T("PNG 3D", "ph-image-square", "act:png3d")]],
    ["Team", [T("Workspace", "ph-users-three", "act:workspace"), T("Friends", "ph-user-plus", "act:friends"), T("AI helper", "ph-sparkle", "act:agent"), T("Walls guide", "ph-graduation-cap", "run:plannerTutorial"), T("Planning guide", "ph-list-checks", "reveal:#planningGuide")]],
  ]],
];

const MODEL = [
  ["Sketch", [
    ["Draw", [T("New sketch", "ph-pencil-simple", "mcmd:newsketch"), T("Select", "ph-cursor", "mcmd:select", "V"), T("Line", "ph-line-segment", "mcmd:wall", "L"), T("Rectangle", "ph-rectangle", "mcmd:srect", "Q"), T("Centre rect", "ph-rectangle-dashed", "mcmd:centerrectangle"), T("Circle", "ph-circle", "mcmd:scirc", "G"), T("Arc", "ph-circle-half", "mcmd:sarc", "A"), T("3-point arc", "ph-bezier-curve", "mcmd:arc3point"), T("Tangent arc", "ph-arrow-bend-up-right", "mcmd:tangentarc"), T("Slot", "ph-pill", "mcmd:sslot", "J"), T("Centre slot", "ph-pill", "mcmd:centerslot"), T("Spline", "ph-wave-sine", "mcmd:sspline"), T("Polygon", "ph-hexagon", "mcmd:spoly", "N"), T("Ellipse", "ph-circle-dashed", "mcmd:sell", "Y"), T("Centreline", "ph-line-segments", "mcmd:constr"), T("Point", "ph-dot-outline", "mcmd:sketchpoint"), T("Text", "ph-text-t", "mcmd:sketchtext")]],
    ["Modify", [T("Trim", "ph-scissors", "mcmd:trim", "T"), T("Extend", "ph-arrow-line-right", "mcmd:extend", "E"), T("Fillet", "ph-bezier-curve", "mcmd:sketchfillet"), T("Offset", "ph-copy-simple", "mcmd:offset"), T("Mirror", "ph-flip-horizontal", "mcmd:mirror"), T("Dynamic mirror", "ph-flip-horizontal", "mcmd:dynamicmirror"), T("Linear pattern", "ph-dots-three-outline", "mcmd:pattern"), T("Circular pattern", "ph-circles-three", "mcmd:circpattern"), T("Convert face", "ph-copy", "mcmd:faceboundary"), T("Project", "ph-arrow-down", "mcmd:project"), T("Repair sketch", "ph-first-aid", "mcmd:sketchrepair")]],
    ["Relations", [T("Smart dimension", "ph-ruler", "mcmd:dim", "D"), T("Coincident", "ph-circles-four", "mrel:coincident"), T("Horizontal", "ph-arrows-horizontal", "mrel:horizontal"), T("Vertical", "ph-arrows-vertical", "mrel:vertical"), T("Parallel", "ph-equals", "mrel:parallel"), T("Perpendicular", "ph-arrow-elbow-down-right", "mrel:perpendicular"), T("Tangent", "ph-circle-half", "mrel:tangent"), T("Equal", "ph-equals", "mrel:equal"), T("Concentric", "ph-circles-three", "mcon:concentric"), T("Midpoint", "ph-dot-outline", "mcon:midpoint"), T("Intersection", "ph-intersect", "mcon:intersection"), T("Symmetric", "ph-flip-horizontal", "mcon:symmetric"), T("Fix", "ph-lock", "mcon:fixed"), T("Equations", "ph-function", "mcmd:equations"), T("Finish sketch", "ph-check", "mcmd:finishsketch")]],
  ]],
  ["Features", [
    ["Add", [T("Extrude", "ph-arrow-fat-up", "mcmd:extrude"), T("Revolve", "ph-arrows-clockwise", "mcmd:revolvefeature"), T("Sweep", "ph-path", "mcmd:sweepfeature"), T("Loft", "ph-stack", "mcmd:loftfeature"), T("Rib", "ph-git-commit", "mcmd:ribfeature"), T("Thicken", "ph-rows", "mcmd:thickenfeature"), T("Dome", "ph-circle-half-tilt", "mcmd:domefeature")]],
    ["Remove", [T("Extrude cut", "ph-arrow-fat-down", "mcmd:extrudecut"), T("Revolve cut", "ph-arrow-counter-clockwise", "mcmd:revolvecutfeature"), T("Sweep cut", "ph-path", "mcmd:sweepcutfeature"), T("Hole wizard", "ph-circle-notch", "mcmd:holefeature")]],
    ["Edit", [T("Fillet", "ph-bezier-curve", "mcmd:filletfeature"), T("Chamfer", "ph-diamond", "mcmd:chamferfeature"), T("Shell", "ph-cube-transparent", "mcmd:shellfeature"), T("Draft", "ph-trapezoid", "mcmd:draftfeature"), T("Thread", "ph-screwdriver", "mcmd:threadfeature"), T("Knurl", "ph-grid-nine", "mcmd:knurlfeature"), T("Helix", "ph-spiral", "mcmd:helixfeature"), T("Repeat last", "ph-arrow-counter-clockwise", "mcmd:repeatlast")]],
    ["Bodies", [T("Pattern", "ph-dots-nine", "mcmd:patternfeature"), T("Mirror", "ph-flip-horizontal", "mcmd:mirrorfeature"), T("Split body", "ph-scissors", "mcmd:splitbodyfeature"), T("Move body", "ph-arrows-out-cardinal", "mcmd:movebodyfeature"), T("Combine", "ph-intersect", "mcmd:booleanfeature"), T("Insert part", "ph-plus-square", "mcmd:insertfeature"), T("Fastener", "ph-nut", "mcmd:toolboxfastener")]],
    ["Direct", [T("Box", "ph-cube", "mcmd:directbox"), T("Cylinder", "ph-cylinder", "mcmd:directcyl"), T("Sphere", "ph-globe-simple", "mcmd:directsph"), T("Prism", "ph-hexagon", "mcmd:directpoly"), T("Revolve", "ph-arrows-clockwise", "mcmd:directrev"), T("Cone", "ph-triangle", "mcmd:directcone")]],
  ]],
  ["Reference", [
    ["Geometry", [T("Plane", "ph-square-half", "mcmd:refplane"), T("Axis", "ph-line-vertical", "mcmd:refaxis"), T("Coordinate sys", "ph-crosshair-simple", "mcmd:coordsys"), T("Ref point", "ph-dot-outline", "mcmd:refpoint")]],
    ["Setup", [T("Configurations", "ph-sliders", "mcmd:config"), T("Standards", "ph-seal-check", "mcmd:standards"), T("Rebuild", "ph-arrows-clockwise", "mcmd:regen"), T("Custom props", "ph-list-bullets", "mcmd:customprops"), T("Variables", "ph-function", "mcmd:equations")]],
  ]],
  ["Assembly", [
    ["Parts", [T("Assembly", "ph-puzzle-piece", "mcmd:assembly"), T("Components", "ph-cube-focus", "mcmd:components"), T("Mates", "ph-link", "mcmd:mates"), T("Screw mate", "ph-nut", "mcmd:screwmate"), T("Part document", "ph-file", "mcmd:partdoc"), T("Smart mates", "ph-magnet", "mcmd:smartmates")]],
    ["Study", [T("Exploded view", "ph-arrows-out", "mcmd:explode"), T("Explode step", "ph-arrows-out-line-horizontal", "mcmd:explodestep"), T("Motion study", "ph-play", "mcmd:motion"), T("Interference", "ph-warning", "mcmd:interference"), T("Isolate", "ph-eye", "mcmd:isolate")]],
  ]],
  ["Evaluate", [
    ["Measure", [T("Measure", "ph-ruler", "mcmd:measure"), T("Mass props", "ph-scales", "mcmd:mass"), T("Section view", "ph-knife", "mcmd:section"), T("Fit check", "ph-arrows-in", "mcmd:fitcheck"), T("Fit view", "ph-frame-corners", "mcmd:fit"), T("Split", "ph-columns", "mclick:#mdModeSplit")]],
    ["Check", [T("Material check", "ph-seal-check", "meng:check"), T("Rebuild errors", "ph-warning", "mclick:#mdDiagJump")]],
  ]],
  ["Toolbox", [
    ["Standard parts", [T("Std screw", "ph-nut", "mcmd:stdscrew"), T("Std gear", "ph-gear-six", "mcmd:stdgear"), T("Fastener", "ph-nut", "mcmd:toolboxfastener")]],
    ["Engineering", [T("Sheet metal", "ph-folder-simple", "mcmd:sheetmetal"), T("Stock size", "ph-ruler", "mcmd:stocksize"), T("To walls", "ph-wall", "mcmd:towalls")]],
  ]],
  ["Drawing", [
    ["Sheet", [T("Drawing", "ph-file-text", "mcmd:drawing"), T("BOM", "ph-list-numbers", "mcmd:bom"), T("Note", "ph-note-pencil", "mcmd:note")]],
  ]],
  ["Appearance", [
    ["Look", [T("Paint", "ph-paint-bucket", "mcmd:paint"), T("Finish preview", "ph-eye", "mcmd:finishpreview")]],
  ]],
  ["Output", [
    ["Use", [T("Save to library", "ph-floppy-disk", "mclick:#mdSave"), T("Model library", "ph-books", "mclick:#mdLib"), T("Branch", "ph-git-branch", "mcmd:branch"), T("Print setup", "ph-printer", "mcmd:printsetup"), T("Export GLB", "ph-cube", "mcmd:exportglb")]],
    ["Exchange", [T("Project bundle", "ph-package", "mcmd:bundle"), T("Open bundle", "ph-folder-open", "mcmd:bundlein"), T("Import STEP", "ph-download-simple", "mcmd:stepin"), T("Export STEP", "ph-export", "mcmd:stepout"), T("Export IGES", "ph-export", "mcmd:igesout"), T("Export STL", "ph-export", "mcmd:stlout"), T("Export 3MF", "ph-printer", "mcmd:3mfout"), T("Export AMF", "ph-printer", "mcmd:amfout")]],
  ]],
];

const CAB = [
  ["Design", [
    ["Start", [T("Families", "ph-squares-four", "cab:tab:fams"), T("Presets", "ph-cards-three", "cab:tab:presets"), T("Blank carcass", "ph-selection-plus", "cab:act:blank")]],
    ["Interior", [T("Horizontal partition", "ph-minus", "cab:tool:hwall"), T("Vertical partition", "ph-line-vertical", "cab:tool:vwall"), T("Erase partition", "ph-eraser", "cab:tool:erase")]],
    ["Edit", [T("Inspector", "ph-cursor-click", "cab:tab:insp"), T("Fronts & look", "ph-paint-brush", "cab:tab:look"), T("Hardware", "ph-nut", "cab:tab:hw"), T("History", "ph-clock-counter-clockwise", "cab:tab:hist")]],
    ["Run", [T("Kitchen run", "ph-rows", "pro:cabRun"), T("Worktop", "ph-table", "pro:cabWorktop")]],
    ["My presets", [T("Save preset", "ph-floppy-disk", "cab:act:save"), T("Load preset", "ph-folder-open", "cab:tab:mine")]],
  ]],
  ["View", [
    ["Mode", [T("2D", "ph-square", "cab:mode:2d"), T("3D", "ph-cube", "cab:mode:3d"), T("Split", "ph-columns", "cab:mode:split")]],
    ["Level", [T("Compose", "ph-layout", "cab:level:composition"), T("Technical", "ph-sliders-horizontal", "cab:level:technical"), T("Model editor", "ph-cube-focus", "cab:level:advanced")]],
  ]],
  ["Review", [
    ["Check", [T("Checks", "ph-seal-check", "cab:tab:checks"), T("Summary", "ph-list-numbers", "cab:tab:bom")]],
  ]],
  ["Production", [
    ["Make", [T("Cut plan & production", "ph-scissors", "cab:act:nest"), T("Production pack", "ph-package", "nest:#nzProductionHost"), T("Shop setup", "ph-gear-six", "nest:#nzShopSetup"), T("Materials", "ph-stack", "nest:#nzMat"), T("Saw", "ph-knife", "nest:#nzSaw"), T("Stock rack", "ph-rows", "nest:#nzRack")]],
    ["Quote", [T("Quote", "ph-currency-circle-dollar", "nest:#nzQuote"), T("Suppliers", "ph-truck", "nest:#nzSup"), T("Quote document", "ph-file-text", "nestgo:#nzQuoteDoc"), T("Purchase order", "ph-shopping-cart", "nestgo:#nzPo")]],
    ["Export", [T("Cut list CSV", "ph-file-csv", "nestgo:#nzCsv"), T("DXF", "ph-file-dashed", "nestgo:#nzDxf"), T("Drill map", "ph-circles-three", "nestgo:#nzDrill"), T("Sheets PNG", "ph-image", "nestgo:#nzPng"), T("Manufacturing JSON", "ph-file-code", "nestgo:#nzManufacturingJson"), T("Cabinet PNG", "ph-image-square", "cab:act:png"), T("Part labels", "ph-tag", "nest:#nzProductionExportLabels"), T("Send to shop", "ph-paper-plane-tilt", "pro:cabSend")]],
  ]],
];

export const PRO_CATALOG = {
  plan: { name: "Planner", tabs: PLAN },
  model: { name: "Model editor", tabs: MODEL },
  cab: { name: "Cabinet designer", tabs: CAB },
};

/* Flat list, one row per tool, for search and tests. */
export function proTools(editor) {
  var eds = editor ? [editor] : PRO_EDITORS;
  var out = [];
  eds.forEach(function (ed) {
    PRO_CATALOG[ed].tabs.forEach(function (tab) {
      tab[1].forEach(function (group) {
        group[1].forEach(function (tool) {
          out.push({ editor: ed, tab: tab[0], group: group[0], label: tool.label, icon: tool.icon, bind: tool.bind, key: tool.key });
        });
      });
    });
  });
  return out;
}

export function parseBinding(bind) {
  if (!bind) return null;
  var i = bind.indexOf(":");
  var kind = bind.slice(0, i), rest = bind.slice(i + 1);
  if (kind === "cab") {
    var j = rest.indexOf(":");
    return { kind: "cab", attr: rest.slice(0, j), value: rest.slice(j + 1) };
  }
  return { kind: kind, value: rest };
}

/* Hebrew for every editor, tab, group and tool name above, keyed by the English
   label. Terms follow the app's own Hebrew strings (tool_*, cost_*, mep_* …). */
export const PRO_HE = {
  "Planner": "מתכנן", "Model editor": "עורך המודלים", "Cabinet designer": "מעצב הארונות",
  "Model": "מודל", "Cabinet": "ארון",
  "Build": "בנייה", "Select": "בחירה", "Erase": "מחק", "Lock walls": "נעילת קירות", "Walls": "קירות", "Wall": "קיר", "Arc wall": "קיר מעוגל", "Rectangle": "מלבן", "Offset": "היסט", "Join": "חבר", "Break": "שבור", "Bite": "הסרת קטע", "Reverse": "הפוך צדדים", "Paint side": "טיפוס קיר",
  "Openings": "פתחים", "Door": "דלת", "Window": "חלון", "Passage": "מעבר", "Open segment": "פתח מקטע",
  "Levels": "קומות", "Add floor": "הוסף קומה", "Slab void": "פתח רצפה", "Slab from stairs": "פתח ממדרגות", "Cutaway": "בית בובות",
  "Rooms": "חדרים", "Room stamp": "חדר מוכן", "Room presets": "תבניות חדרים", "Point": "נקודה", "Auto generate": "יצירה אוטומטית",
  "Constrain": "אילוצים", "Dimensions": "מידות", "Distance": "מרחק", "Angle": "זווית", "Lock length": "נעל אורך",
  "Relations": "יחסים", "Parallel": "מקביל", "Perpendicular": "ניצב", "Collinear": "על קו אחד", "Equal length": "אורך שווה", "Horizontal": "אופקי", "Vertical": "אנכי", "Point on wall": "נקודה על קיר", "Symmetric": "סימטרי",
  "Corners": "פינות", "Square to 90°": "ישר ל־90°", "Fillet": "עיגול פינה", "Chamfer": "שיפוע", "Equal spacing": "מרווח שווה", "Pin": "קבע",
  "Solve": "פתרון", "Warnings & DOF": "אזהרות ודרגות חופש", "Repin": "קבע מחדש", "Flip": "הפוך", "Parameters": "פרמטרים",
  "Interior": "פנים", "Place": "הצבה", "Library": "ספרייה", "Real size": "מידה אמיתית", "Duplicate": "שכפל", "Delete": "מחק",
  "Arrange": "סידור", "Align left": "יישור לשמאל", "Align top": "יישור למעלה", "Distribute": "פיזור", "Face wall": "פנים לקיר", "Group": "קבץ", "Ungroup": "בטל קיבוץ", "Rotate 90°": "סובב 90°",
  "Finish": "גימור", "Textures": "טקסטורות", "Floor texture": "טקסטורת רצפה", "Wall texture": "טקסטורת קיר", "Match floor": "התאם רצפה", "Seamless": "ללא תפר",
  "MEP": "תשתיות", "Networks": "רשתות", "Electrical": "חשמל", "Water": "מים", "Drainage": "ניקוז", "Comms": "תקשורת", "Air con": "מיזוג", "Gas": "גז",
  "Route": "תוואי", "In wall": "בתוך קיר", "At ceiling": "בתקרה", "Under floor": "מתחת לרצפה", "Floor routes": "תוואי רצפה", "Panels": "חלוניות", "MEP panel": "חלונית תשתיות", "Smart home": "בית חכם",
  "Site & scan": "אתר וסריקה", "Site": "אתר", "Locate": "אתר מיקום", "Pick on map": "בחר במפה", "Footprint": "טביעת מבנה", "Import site": "ייבוא אתר",
  "Capture": "קליטה", "Room scan": "סריקת חדר", "Blueprint trace": "עקיבת תוכנית", "Blueprint AI": "תוכנית ב־AI",
  "Annotate": "סימון", "Mark": "סמן", "Place marker": "הצב סמן", "Duplicate marker": "שכפל סמן", "Reference point": "נקודת ייחוס",
  "Style": "סגנון", "Plan style": "סגנון תוכנית", "Layers": "שכבות", "Tool names": "שמות כלים", "Drawings": "שרטוטים", "Drawing 3D": "שרטוט תלת־ממד", "Wall types": "טיפוסי קירות",
  "Analyze": "ניתוח", "Quantities": "כמויות", "Cost export": "ייצוא עלות", "Wall take-off": "כתב כמויות לקיר", "Wall schedule": "טבלת קירות", "Cut plan": "תוכנית ניסור", "Check": "בדיקה", "Warnings": "אזהרות", "Tree": "עץ",
  "View & render": "תצוגה ורינדור", "View": "תצוגה", "Plan": "תוכנית", "3D": "תלת־ממד", "Split": "מפוצל", "Dollhouse": "בית בובות", "Frame": "מסגר", "Walk": "סיור", "Compose": "הרכבה", "Technical": "טכני", "Level": "רמה", "Part codes": "קודי חלקים",
  "Render": "רינדור", "Photo mode": "מצב צילום", "Video studio": "סטודיו וידאו", "Edit in 3D": "עריכה בתלת־ממד", "Physics": "פיזיקה",
  "Output": "פלט", "File": "קובץ", "Save": "שמור", "Open": "פתח", "New plan": "תוכנית חדשה", "Import JSON": "ייבוא JSON", "Export": "ייצוא", "JSON": "JSON", "glTF": "glTF", "PNG 2D": "PNG דו־ממד", "PNG 3D": "PNG תלת־ממד",
  "Team": "צוות", "Workspace": "סביבת עבודה", "Friends": "חברים", "AI helper": "עוזר AI",
  "Sketch": "סקיצה", "Draw": "ציור", "New sketch": "סקיצה חדשה", "Line": "קו", "Centre rect": "מלבן ממרכז", "Circle": "עיגול", "Arc": "קשת", "3-point arc": "קשת 3 נקודות", "Tangent arc": "קשת משיקה", "Slot": "חריץ", "Centre slot": "חריץ ממרכז", "Spline": "ספליין", "Polygon": "מצולע", "Ellipse": "אליפסה",
  "Modify": "שינוי", "Trim": "קיצוץ", "Extend": "הארכה", "Mirror": "שיקוף", "Dynamic mirror": "שיקוף דינמי", "Linear pattern": "תבנית קווית", "Circular pattern": "תבנית מעגלית", "Convert face": "המר פאה", "Project": "הטלה", "Repair sketch": "תיקון סקיצה",
  "Smart dimension": "מידה חכמה", "Coincident": "חופף", "Tangent": "משיק", "Equal": "שווה", "All relations": "כל היחסים", "Finish sketch": "סיים סקיצה",
  "Features": "פיצ'רים", "Add": "הוספה", "Extrude": "שליפה", "Revolve": "סיבוב", "Sweep": "סחיפה", "Loft": "לופט", "Rib": "צלע", "Thicken": "עיבוי", "Dome": "כיפה",
  "Remove": "הסרה", "Extrude cut": "חיתוך שליפה", "Revolve cut": "חיתוך סיבוב", "Sweep cut": "חיתוך סחיפה", "Hole wizard": "אשף חורים",
  "Edit": "עריכה", "Shell": "מעטפת", "Draft": "זווית שליפה", "Thread": "הברגה", "Knurl": "חירוץ", "Helix": "סליל", "Repeat last": "חזור על האחרון",
  "Bodies": "גופים", "Pattern": "תבנית", "Split body": "פצל גוף", "Move body": "הזז גוף", "Combine": "שילוב", "Insert part": "הכנס חלק", "Fastener": "מחבר",
  "Direct": "ישיר", "Box": "תיבה", "Cylinder": "גליל", "Sphere": "כדור", "Prism": "מנסרה",
  "Reference": "ייחוס", "Geometry": "גאומטריה", "Plane": "מישור", "Axis": "ציר", "Coordinate sys": "מערכת צירים", "Setup": "הגדרות", "Configurations": "תצורות", "Standards": "תקנים", "Rebuild": "בנה מחדש",
  "Assembly": "הרכבה", "Parts": "חלקים", "Components": "רכיבים", "Mates": "התאמות", "Screw mate": "התאמת בורג", "Part document": "מסמך חלק",
  "Study": "ניתוח תנועה", "Exploded view": "מבט מפורק", "Explode step": "שלב פירוק", "Motion study": "סימולציית תנועה", "Interference": "התנגשויות", "Isolate": "בודד",
  "Evaluate": "הערכה", "Measure": "מדידה", "Mass props": "תכונות מסה", "Section view": "מבט חתך", "Fit check": "בדיקת התאמה", "Fit view": "התאם תצוגה",
  "Toolbox": "ארגז כלים", "Standard parts": "חלקים תקניים", "Std screw": "בורג תקני", "Std gear": "גלגל שיניים תקני",
  "Drawing": "שרטוט", "Sheet": "גיליון", "BOM": "רשימת חלקים", "Note": "הערה", "Appearance": "מראה", "Look": "מראה", "Paint": "צביעה",
  "Print setup": "הגדרות הדפסה", "Export 3MF": "ייצוא 3MF", "Export AMF": "ייצוא AMF",
  "Exchange": "החלפת קבצים", "Project bundle": "חבילת פרויקט", "Open bundle": "פתח חבילה", "Import STEP": "ייבוא STEP", "Export STEP": "ייצוא STEP", "Export IGES": "ייצוא IGES", "Export STL": "ייצוא STL",
  "Design": "עיצוב", "Start": "התחלה", "Families": "משפחות", "Presets": "תבניות", "Blank carcass": "גוף ריק",
  "Horizontal partition": "מחיצה אופקית", "Vertical partition": "מחיצה אנכית", "Erase partition": "מחק מחיצה",
  "Inspector": "מאפיינים", "Fronts & look": "חזיתות ומראה", "Hardware": "פרזול", "History": "היסטוריה",
  "My presets": "התבניות שלי", "Save preset": "שמור תבנית", "Load preset": "טען תבנית", "Mode": "מצב", "2D": "דו־ממד",
  "Review": "בקרה", "Checks": "בדיקות", "Summary": "סיכום", "Production": "ייצור", "Make": "ייצור", "Cut plan & production": "תוכנית ניסור וייצור", "PNG export": "ייצוא PNG",
  "Production pack": "חבילת ייצור", "Shop setup": "הגדרות סדנה", "Materials": "חומרים", "Saw": "מסור", "Stock rack": "מלאי לוחות", "Quote": "הצעת מחיר", "Suppliers": "ספקים", "Quote document": "מסמך הצעת מחיר", "Purchase order": "הזמנת רכש", "Cut list CSV": "רשימת חיתוך CSV", "DXF": "DXF", "Drill map": "מפת קידוחים", "Sheets PNG": "גיליונות PNG", "Manufacturing JSON": "דוח ייצור JSON", "Cabinet PNG": "ארון PNG",
};

Object.assign(PRO_HE, {
  "Flip swing": "הפוך כיוון פתיחה", "Stairs": "מדרגות", "Roof": "גג", "Add corridor": "הוסף מסדרון", "Reference dim": "מידת ייחוס",
  "Variants": "וריאנטים", "Stack": "ערימה", "Auto layout": "סידור אוטומטי", "Room floor": "רצפת חדר", "Lights": "תאורה",
  "Validate": "אימות", "Angle snap": "הצמדת זווית", "Fixtures": "אביזרים", "Map provider": "ספק מפה", "Site rotation": "סיבוב אתר", "GeoJSON": "GeoJSON",
  "Survey": "מדידת מצב קיים", "Note": "הערה", "Symbols": "סמלים", "Wall elevation": "חזית קיר", "Section": "חתך", "Sheet / PDF": "גיליון / PDF",
  "Cost estimate": "אומדן עלות", "Area summary": "סיכום שטחים", "Clearances": "מרווחים", "Layout check": "בדיקת פריסה", "Sun & sky": "שמש ושמיים",
  "glTF / Blender": "glTF / Blender", "Walls guide": "מדריך קירות", "Planning guide": "מדריך תכנון",
  "Centreline": "קו עזר", "Midpoint": "נקודת אמצע", "Dimension": "מידה", "Print sheet": "הדפס גיליון", "Sheet SVG": "גיליון SVG", "IFC": "IFC", "Plan SVG": "תוכנית SVG", "Schedules CSV": "טבלאות CSV", "Text": "טקסט", "Intersection": "חיתוך", "Concentric": "משותף מרכז", "Fix": "קבע", "Equations": "משוואות", "Cone": "חרוט",
  "Ref point": "נקודת ייחוס", "Custom props": "מאפיינים מותאמים", "Variables": "משתנים", "Smart mates": "התאמות חכמות", "Material check": "בדיקת חומר",
  "Rebuild errors": "שגיאות בנייה", "Engineering": "הנדסה", "Sheet metal": "פח", "Stock size": "מידת גלם", "To walls": "המר לקירות",
  "Finish preview": "תצוגת גימור", "Use": "שימוש", "Save to library": "שמור לספרייה", "Model library": "ספריית מודלים", "Branch": "ענף", "Export GLB": "ייצוא GLB",
  "Run": "שורת ארונות", "Kitchen run": "שורת מטבח", "Worktop": "משטח עבודה", "Part labels": "תוויות חלקים", "Send to shop": "שלח לנגרייה",
});

/* The label in the UI language; English when a string has no Hebrew yet. */
export function proLabel(text, lang) {
  return lang === "he" ? PRO_HE[text] || text : text;
}
