// Command catalog and keyboard map for the model editor. Kept out of
// modeler.js so the ribbon, search, and key handler share one vocabulary.

import { documentDescription } from "./core/custom_properties.js";

export const KEY_VIEW = { 4: "top", 5: "front", 6: "side" };

// Letter keys pick a sketch or direct tool. R is reserved for parametric
// Revolve (see FEATURE_COMMAND); S opens the shortcut bar. Sphere stays on
// the ribbon as `directsph`.
export const KEY_TOOL = {
  v: "select", b: "rect", c: "circle", l: "wall", p: "poly", x: "cut", o: "cutc",
  q: "srect", g: "scirc", a: "sarc", d: "dim", t: "trim", e: "extend",
  j: "sslot", n: "spoly", y: "sell",
};

export const FEATURE_COMMAND = {
  extrude: "extrude", extrudeCut: "extrudecut", revolve: "revolvefeature", sweep: "sweepfeature",
  loft: "loftfeature", fillet: "filletfeature", chamfer: "chamferfeature", shell: "shellfeature",
  pattern: "patternfeature", mirror: "mirrorfeature", boolean: "booleanfeature", hole: "holefeature",
  dome: "domefeature", draft: "draftfeature", thicken: "thickenfeature", rib: "ribfeature",
  splitBody: "splitbodyfeature", moveBody: "movebodyfeature", revolveCut: "revolvecutfeature", sweepCut: "sweepcutfeature",
  helix: "helixfeature", thread: "threadfeature", knurl: "knurlfeature", insert: "insertfeature",
};

export const DIRECT_COMMAND_TOOLS = {
  directbox: "rect",
  directcyl: "circle",
  directsph: "sph",
  directpoly: "poly",
  directrev: "rev",
};

export function commandUnavailableReason(id, catalog, fallback) {
  var def = (catalog || []).find(function (c) { return c.id === id; });
  if (!def || !def.available || def.available()) return "";
  return (def.reason && def.reason()) || fallback || "";
}

/* ---- bill of materials ----
   generateBOM() in cad_interference.js counts the components; these two turn
   that count into the table the editor draws and the CSV it exports. They live
   here rather than in modeler.js because a row is arithmetic over data, and
   modeler.js cannot be loaded by a Node test. */
export function bomTableRows(rows, components) {
  var byKey = new Map();
  (components || []).forEach(function (component) {
    if (!component) return;
    var key = component.modelKey || component.name || "Unknown";
    if (!byKey.has(key)) byKey.set(key, component);
  });
  return (rows || []).map(function (row, index) {
    var component = byKey.get(row.key);
    // A material may be recorded on the instance or on the model it came off.
    var material = (component && (component.material || (component.def && component.def.material))) || row.material || "";
    // the model's Description property, as a SOLIDWORKS BOM's Description column
    var description = (component && (documentDescription(component) || documentDescription(component.def))) || "";
    return {
      item: index + 1, key: row.key, name: row.name, description: description,
      quantity: row.quantity, material: String(material),
    };
  });
}

export function bomCsv(rows, headers, withMaterial) {
  var columns = withMaterial ? 4 : 3;
  var cell = function (value) {
    var text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  var lines = [(headers || []).slice(0, columns).map(cell).join(",")];
  (rows || []).forEach(function (row) {
    var cells = [row.item, row.quantity, row.name];
    if (withMaterial) cells.push(row.material);
    lines.push(cells.map(cell).join(","));
  });
  return lines.join("\n");
}

export function buildCommandCatalog(ctx) {
  var t = ctx.t;
  var E = ctx.editor;
  var closedSketchProfile = ctx.closedSketchProfile;
  var activeParts = ctx.activeParts;
  var partDoc = function () { return E.docType === "part"; };
  var assemblyDoc = function () { return E.docType === "assembly"; };
  var solids = function () { return !!(E.def && activeParts(E.def).length); };
  var closed = function () { return !!closedSketchProfile(); };
  var revolvable = function () { return closed() || !!ctx.openSketchChain?.(); };
  var needPart = function () { return t("cmdNeedPartDoc"); };
  var needSketch = function () { return partDoc() ? t("cmdNeedClosedSketch") : t("cmdNeedPartDoc"); };
  var needSolid = function () { return partDoc() ? t("cmdNeedSolid") : t("cmdNeedPartDoc"); };
  var needAsm = function () { return t("cmdNeedAssembly"); };
  // Optional so the module still gates sanely when a caller omits the helper.
  var canonical = ctx.canonicalAuthoring || function () { return false; };
  var sketchCount = function () { return ((E.def && E.def.sketches) || []).length; };
  var components = function () { return !!(E.assembly && E.assembly.components && E.assembly.components.length); };
  // A parametric-v1 document rewrites or refuses every direct primitive.
  var directOk = function () { return partDoc() && !canonical(); };
  var needDirect = function () { return partDoc() ? t("needSketchThenFeature") : t("cmdNeedPartDoc"); };
  var needSketches = function () { return partDoc() ? t("cmdNeedTwoSketches") : t("cmdNeedPartDoc"); };
  var needTwoBodies = function () { return partDoc() ? t("cmdNeedTwoBodies") : t("cmdNeedPartDoc"); };
  return [
    { id:"select", icon:"ph-cursor", label:t("tool_select"), group:t("cmdSketch"), shortcut:"V", terms:"cursor move" },
    { id:"wall", icon:"ph-line-segment", label:t("tool_wall"), group:t("cmdSketch"), shortcut:"L", terms:"line chain profile", available:function(){ return partDoc(); }, reason:needPart },
    { id:"srect", icon:"ph-rectangle", label:t("tool_srect"), group:t("cmdSketch"), shortcut:"Q", terms:"rectangle profile", available:function(){ return partDoc(); }, reason:needPart },
    { id:"centerrectangle", icon:"ph-rectangle", label:t("centerRectangle"), group:t("cmdSketch"), terms:"center rectangle symmetric origin dimensions precise", available:partDoc, reason:needPart },
    { id:"dimensionedcircle", icon:"ph-circle", label:"Dimensioned circle", group:t("cmdSketch"), terms:"precise circle center centre diameter dimension fully defined", available:partDoc, reason:needPart },
    { id:"dimensionedpolygon", icon:"ph-hexagon", label:"Dimensioned polygon", group:t("cmdSketch"), terms:"precise hexagon polygon center centre circumscribed diameter rotation fully defined", available:partDoc, reason:needPart },
    { id:"faceboundary", icon:"ph-copy-simple", label:t("faceBoundary"), group:t("cmdSketch"), terms:"convert entities offset face boundary copy inset", available:function(){return partDoc() && solids();}, reason:needSolid },
    { id:"scirc", icon:"ph-circle-dashed", label:t("tool_scirc"), group:t("cmdSketch"), shortcut:"G", terms:"circle", available:function(){ return partDoc(); }, reason:needPart },
    { id:"sarc", icon:"sarc", label:t("centerpointArc"), group:t("cmdSketch"), shortcut:"A", terms:"centerpoint centre center start end arc", available:function(){ return partDoc(); }, reason:needPart },
    { id:"arc3point", icon:"arc3point", label:t("arcThreePoint"), group:t("cmdSketch"), terms:"three point arc", available:function(){ return partDoc(); }, reason:needPart },
    { id:"tangentarc", icon:"tangentarc", label:t("tangentArc"), group:t("cmdSketch"), terms:"tangent arc continue endpoint", available:function(){ return partDoc(); }, reason:needPart },
    { id:"sslot", icon:"ph-pill", label:t("tool_sslot"), group:t("cmdSketch"), shortcut:"J", terms:"slot oblong straight", available:function(){ return partDoc(); }, reason:needPart },
    { id:"spoly", icon:"ph-hexagon", label:t("tool_spoly"), group:t("cmdSketch"), shortcut:"N", terms:"polygon hexagon n-gon regular", available:function(){ return partDoc(); }, reason:needPart },
    { id:"sell", icon:"ph-circle", label:t("tool_sell"), group:t("cmdSketch"), shortcut:"Y", terms:"ellipse oval", available:function(){ return partDoc(); }, reason:needPart },
    { id:"dim", icon:"ph-ruler", label:t("tool_dim"), group:t("cmdSketch"), shortcut:"D", terms:"measure smart dimension", available:function(){ return partDoc(); }, reason:needPart },
    { id:"trim", icon:"ph-scissors", label:t("tool_trim"), group:t("cmdSketch"), shortcut:"T", terms:"remove segment", available:function(){ return partDoc(); }, reason:needPart },
    { id:"extend", icon:"ph-arrows-out-line-horizontal", label:t("tool_extend"), group:t("cmdSketch"), shortcut:"E", available:function(){ return partDoc(); }, reason:needPart },
    { id:"sketchfillet", icon:"ph-corners-out", label:t("sketchFillet"), group:t("cmdSketch"), terms:"sketch fillet round corner tangent arc radius", available:function(){ return partDoc(); }, reason:needPart },
    { id:"offset", icon:"ph-copy-simple", label:t("tool_offset"), group:t("cmdSketch"), available:function(){ return partDoc(); }, reason:needPart },
    { id:"constr", icon:"ph-line-segments", label:t("tool_constr"), group:t("cmdSketch"), terms:"construction geometry", available:function(){ return partDoc(); }, reason:needPart },
    { id:"mirror", icon:"ph-flip-horizontal", label:t("sketchMirror"), group:t("cmdSketch"), available:function(){ return partDoc(); }, reason:needPart },
    { id:"pattern", icon:"ph-dots-nine", label:t("sketchPattern"), group:t("cmdSketch"), terms:"linear array", available:function(){ return partDoc(); }, reason:needPart },
    { id:"circpattern", icon:"ph-circles-three", label:t("sketchCircPattern"), group:t("cmdSketch"), terms:"circular polar array bolt circle", available:function(){ return partDoc(); }, reason:needPart },
    { id:"project", icon:"ph-projector-screen", label:t("projectEdges"), group:t("cmdSketch"), available:function(){ return partDoc(); }, reason:needPart },
    { id:"directbox", icon:"ph-cube", label:t("tool_rect"), group:t("grpDirect"), shortcut:"B", terms:"box rectangle primitive direct", available:directOk, reason:needDirect },
    { id:"directcyl", icon:"ph-cylinder", label:t("tool_circle"), group:t("grpDirect"), shortcut:"C", terms:"cylinder circle primitive direct", available:directOk, reason:needDirect },
    { id:"directcone", icon:"ph-triangle", label:"Cone", group:t("grpDirect"), terms:"cone frustum tapered primitive", available:partDoc, reason:needPart },
    { id:"refpoint", icon:"ph-dot-outline", label:"Reference point", group:t("cmdFeatures"), terms:"datum point vertex reference", available:partDoc, reason:needPart },
    { id:"sketchpoint", icon:"ph-dot-outline", label:"Sketch point", group:t("cmdSketch"), terms:"place standalone sketch point", available:partDoc, reason:needPart },
    { id:"sketchtext", icon:"ph-text-t", label:"Sketch text", group:t("cmdSketch"), terms:"letters engrave emboss extrude cut", available:partDoc, reason:needPart },
    { id:"stocksize", icon:"ph-ruler", label:"Stock size", group:t("cmdEvaluate"), terms:"raw stock envelope dimensions material", available:function(){return partDoc() && solids();}, reason:needSolid },
    { id:"towalls", icon:"ph-wall", label:"To planner walls", group:t("cmdEvaluate"), terms:"convert sketch outline to architectural walls", available:partDoc, reason:needPart },
    { id:"finishpreview", icon:"ph-eye", label:"Finish preview", group:t("cmdFeatures"), terms:"fillet chamfer shell live preview", available:function(){return partDoc() && solids();}, reason:needSolid },
    { id:"exportglb", icon:"ph-cube", label:"Export GLB", group:t("cmdEvaluate"), terms:"model only glb gltf binary", available:partDoc, reason:needPart },
    { id:"equations", icon:"ph-function", label:"Equations", group:t("cmdSketch"), terms:"variables named dimensions equations", available:partDoc, reason:needPart },
    { id:"customprops", icon:"ph-list-bullets", label:"Custom properties", group:t("cmdEvaluate"), terms:"document metadata description property" },
    { id:"smartmates", icon:"ph-magnet", label:"Smart mates", group:t("cmdEvaluate"), terms:"assembly infer mate drag", available:assemblyDoc, reason:needAsm },
    { id:"sheetmetal", icon:"ph-fold", label:"Sheet metal", group:t("cmdFeatures"), terms:"base flange edge flange unfold", available:partDoc, reason:needPart },
    { id:"branch", icon:"ph-git-branch", label:"Branch", group:t("cmdEvaluate"), terms:"undo history tree alternate branch" },
    { id:"directsph", icon:"ph-sphere", label:t("tool_sph"), group:t("grpDirect"), shortcut:"S", terms:"sphere primitive center centre diameter parametric precise", available:partDoc, reason:needPart },
    { id:"directpoly", icon:"ph-polygon", label:t("tool_poly"), group:t("grpDirect"), shortcut:"P", terms:"polygon extrude direct", available:directOk, reason:needDirect },
    { id:"directrev", icon:"ph-spiral", label:t("tool_rev"), group:t("grpDirect"), terms:"revolve profile sketch direct", available:directOk, reason:needDirect },
    { id:"newsketch", icon:"ph-pencil-line", label:t("createSketch"), group:t("cmdFeatures"), terms:"reference plane face profile", available:function(){ return partDoc(); }, reason:needPart },
    { id:"dynamicmirror", icon:"ph-flip-horizontal", label:"Dynamic mirror", group:t("cmdSketch"), terms:"live symmetric line centerline", available:function(){return partDoc() && E.authoring?.phase==="sketch";}, reason:needPart },
    { id:"finishsketch", icon:"ph-check", label:t("finishSketch"), group:t("cmdSketch"), terms:"exit plane done finish", available:function(){ return partDoc() && E.authoring && E.authoring.phase==="sketch"; }, reason:function(){ return t("cmdNeedOpenSketch"); } },
    { id:"extrude", icon:"ph-cube", label:t("opExtrude"), group:t("cmdFeatures"), available:function(){ return partDoc() && revolvable(); }, reason:function(){ return revolvable() ? needPart() : needSketch(); } },
    { id:"extrudecut", icon:"ph-scissors", label:t("extrudeCut"), group:t("cmdFeatures"), available:function(){return partDoc()&&revolvable()&&solids();}, reason:function(){ return !partDoc() ? t("cmdNeedPartDoc") : !closed() ? t("cmdNeedClosedSketch") : t("cmdNeedSolid"); } },
    { id:"revolvefeature", icon:"ph-arrow-counter-clockwise", label:t("opRevolve"), group:t("cmdFeatures"), shortcut:"R", available:function(){ return partDoc() && revolvable(); }, reason:needSketch },
    { id:"revolvecutfeature", icon:"revolvecutfeature", label:t("opRevolveCut"), group:t("cmdFeatures"), terms:"revolve cut lathe groove subtract", available:function(){ return partDoc() && revolvable() && solids(); }, reason:function(){ return !partDoc() ? t("cmdNeedPartDoc") : !closed() ? t("cmdNeedClosedSketch") : t("cmdNeedSolid"); } },
    { id:"sweepfeature", icon:"ph-path", label:t("opSweep"), group:t("cmdFeatures"), available:function(){ return partDoc() && sketchCount() >= 1; }, reason:needSketches },
    { id:"sweepcutfeature", icon:"sweepcutfeature", label:t("opSweepCut"), group:t("cmdFeatures"), terms:"sweep cut channel slot subtract path", available:function(){ return partDoc() && sketchCount() >= 2 && solids(); }, reason:function(){ return !partDoc() ? t("cmdNeedPartDoc") : sketchCount() < 2 ? t("cmdNeedTwoSketches") : t("cmdNeedSolid"); } },
    { id:"loftfeature", icon:"ph-stack", label:t("loftOp"), group:t("cmdFeatures"), available:function(){ return partDoc() && sketchCount() >= 2; }, reason:needSketches },
    { id:"repeatlast", icon:"ph-arrow-clockwise", label:t("repeatOperation"), group:t("cmdFeatures"), terms:"repeat last again", available:function(){ return partDoc() && !!E.lastOperation; }, reason:function(){ return t("repeatUnavailable"); } },
    { id:"filletfeature", icon:"ph-corners-out", label:t("quickFillet"), group:t("cmdFeatures"), available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"chamferfeature", icon:"ph-corners-in", label:t("quickChamfer"), group:t("cmdFeatures"), available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"shellfeature", icon:"ph-bowl-food", label:t("shellOp"), group:t("cmdFeatures"), available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"domefeature", icon:"ph-sphere", label:"Dome", group:t("cmdFeatures"), terms:"dome rounded spherical cap face", available:function(){return partDoc() && solids();}, reason:needSolid },
    { id:"draftfeature", icon:"ph-angle", label:t("draftOp"), group:t("cmdFeatures"), terms:"draft taper mould mold release parting neutral plane", available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"thickenfeature", icon:"ph-stack-simple", label:t("thickenOp"), group:t("cmdFeatures"), terms:"thicken surface sheet offset boss solidify", available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"ribfeature", icon:"ph-triangle", label:t("ribOp"), group:t("cmdFeatures"), terms:"rib web brace gusset stiffener support", available:function(){ return partDoc() && solids() && sketchCount() >= 1; }, reason:function(){ return !partDoc() ? t("cmdNeedPartDoc") : !solids() ? t("cmdNeedSolid") : t("cmdNeedOpenLine"); } },
    { id:"splitbodyfeature", icon:"ph-square-split-horizontal", label:t("splitBodyOp"), group:t("cmdFeatures"), terms:"split body part plane halve divide separate", available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"movebodyfeature", icon:"ph-arrows-out-cardinal", label:t("moveBodyOp"), group:t("cmdFeatures"), terms:"move copy body translate rotate offset duplicate", available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"patternfeature", icon:"ph-dots-nine", label:t("quickPattern"), group:t("cmdFeatures"), available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"mirrorfeature", icon:"ph-flip-horizontal", label:t("quickMirror"), group:t("cmdFeatures"), available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"booleanfeature", icon:"ph-intersect", label:t("opBoolean"), group:t("cmdFeatures"), available:function(){ return partDoc() && E.def && activeParts(E.def).length >= 2; }, reason:needTwoBodies },
    { id:"holefeature", icon:"ph-circle-dashed", label:t("holeWizard"), group:t("cmdFeatures"), terms:"hole wizard bore drill counterbore countersink tap", available:function(){ return partDoc() && solids(); }, reason:function(){ return needSolid(); } },
    { id:"helixfeature", icon:"helixfeature", label:t("opHelix"), group:t("cmdFeatures"), terms:"helix spiral spring thread path", available:function(){ return partDoc(); }, reason:needPart },
    { id:"threadfeature", icon:"threadfeature", label:t("opThread"), group:t("cmdFeatures"), terms:"thread screw iso cosmetic modeled tap", available:function(){ return partDoc() && solids(); }, reason:function(){ return needSolid(); } },
    { id:"knurlfeature", icon:"knurlfeature", label:t("opKnurl"), group:t("cmdFeatures"), terms:"knurl diamond grip din 82", available:function(){ return partDoc() && solids(); }, reason:function(){ return needSolid(); } },
    { id:"insertfeature", icon:"insertfeature", label:t("opInsert"), group:t("cmdFeatures"), terms:"insert bushing brass liner", available:function(){ return partDoc() && solids(); }, reason:function(){ return needSolid(); } },
    { id:"toolboxfastener", icon:"stdscrew", label:t("toolboxFastener"), group:t("cmdFeatures"), terms:"toolbox fastener shcs bolt nut screw washer hinge slide pipe elbow valve flange hardware", available:function(){return partDoc() || assemblyDoc();}, reason:needPart },
    { id:"config", icon:"config", label:t("configurations"), group:t("cmdEvaluate"), terms:"configuration suppress exploded", available:function(){ return partDoc() || assemblyDoc(); }, reason:needPart },
    { id:"refplane", icon:"ph-square-half", label:t("refPlane"), group:t("cmdFeatures"), available:function(){ return partDoc(); }, reason:needPart },
    { id:"refaxis", icon:"ph-axis-arrow", label:t("refAxis"), group:t("cmdFeatures"), available:function(){ return partDoc(); }, reason:needPart },
    { id:"coordsys", icon:"ph-crosshair", label:t("refCoord"), group:t("cmdFeatures"), available:function(){ return partDoc(); }, reason:needPart },
    { id:"regen", icon:"ph-arrows-clockwise", label:t("regenerate"), group:t("cmdEvaluate"), terms:"force rebuild regenerate refresh update all features", shortcut:"Ctrl+B", available:function(){ return partDoc() && !E.kernelBusy; }, reason:needPart },
    { id:"fit", icon:"ph-crosshair-simple", label:t("zoomFit"), group:t("cmdEvaluate"), shortcut:"F" },
    /* cad_drawings.js has drawn assembly sheets with BOM balloons all along;
       only this gate kept them out of reach. */
    { id:"drawing", icon:"ph-file-svg", label:t("drawingExport"), group:t("cmdEvaluate"),
      available:function(){ return partDoc() || (assemblyDoc() && E.assembly && E.assembly.components.length); },
      reason:function(){ return assemblyDoc() ? t("cmdNeedOneComponent") : needPart(); } },
    { id:"mass", icon:"ph-scales", label:t("massProps"), group:t("cmdEvaluate"),
      available:function(){ return partDoc()?solids():assemblyDoc()&&components(); },
      reason:function(){return assemblyDoc()?t("cmdNeedOneComponent"):needSolid();} },
    /* Gated like Section: it needs something on screen to pick two points on,
       which in a part is a solid and in an assembly is a component. */
    { id:"measure", icon:"measure", label:t("measureTool"), group:t("cmdEvaluate"), terms:"measure distance delta angle between points vertices ruler",
      available:function(){ return partDoc() ? solids() : components(); },
      reason:function(){ return partDoc() ? t("cmdNeedSolid") : t("cmdNeedOneComponent"); } },
    { id:"section", icon:"ph-selection-background", label:t("sectionView"), group:t("cmdEvaluate"), terms:"clip clipping slice cross section interior", available:function(){ return partDoc() ? solids() : components(); }, reason:function(){ return partDoc() ? t("cmdNeedSolid") : t("cmdNeedOneComponent"); } },
    { id:"paint", icon:"ph-paint-brush", label:t("tool_paint"), group:t("cmdEvaluate"), shortcut:"P", terms:"paint color appearance face material finish brush", available:function(){ return partDoc(); }, reason:needPart },
    { id:"note", icon:"ph-note-pencil", label:t("tool_note"), group:t("cmdEvaluate"), shortcut:"N", terms:"note annotation callout markup draw ink comment redline", available:function(){ return partDoc(); }, reason:needPart },
    { id:"standards", icon:"ph-seal-check", label:t("standardsAudit"), group:t("cmdEvaluate"), available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"stdscrew", icon:"ph-screwdriver", label:t("stdScrewCommand"), group:t("cmdFeatures"), available:function(){return partDoc();}, reason:needPart },
    { id:"stdgear", icon:"ph-gear-six", label:t("stdGearCommand"), group:t("cmdFeatures"), available:function(){return partDoc();}, reason:needPart },
    { id:"bundle", icon:"ph-package", label:t("projectBundle"), group:t("cmdEvaluate") },
    { id:"bundlein", icon:"ph-package", label:t("importBundle"), group:t("cmdEvaluate") },
    { id:"stepin", icon:"ph-upload-simple", label:t("stepImport"), group:"STEP", available:function(){ return partDoc(); }, reason:needPart },
    { id:"stepout", icon:"ph-file-step", label:t("stepExport"), group:"STEP", available:function(){ return partDoc() ? solids() : assemblyDoc() && E.assembly && E.assembly.components.length; }, reason:function(){ return assemblyDoc() ? t("cmdNeedOneComponent") : needSolid(); } },
    { id:"igesout", icon:"ph-file-arrow-down", label:t("exportIges"), group:"STEP", available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"stlout", icon:"ph-file-arrow-down", label:t("exportStl"), group:t("cmdEvaluate"), terms:"binary stl fine mesh millimeters 3d print", available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"3mfout", icon:"ph-printer", label:"Export 3MF", group:t("cmdEvaluate"), terms:"3mf additive manufacturing millimeters 3d print", available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"amfout", icon:"ph-printer", label:"Export AMF", group:t("cmdEvaluate"), terms:"amf additive manufacturing millimeters 3d print", available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"printsetup", icon:"ph-printer", label:"Print setup", group:t("cmdEvaluate"), terms:"printer bed build volume orientation 3d print", available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"assembly", icon:"ph-stack", label:t("docAssembly"), group:t("cmdAssembly") },
    { id:"components", icon:"ph-cube", label:t("components"), group:t("cmdAssembly") },
    { id:"mates", icon:"ph-link", label:t("mate"), group:t("cmdAssembly") },
    { id:"screwmate", icon:"threadfeature", label:t("screwMate"), group:t("cmdAssembly"), terms:"screw thread pitch mate", available:function(){ return assemblyDoc() && E.assembly && E.assembly.components.length > 1; }, reason:function(){ return assemblyDoc() ? t("cmdNeedComponents") : needAsm(); } },
    { id:"gearmate", icon:"ph-gear", label:t("gearMate"), group:t("cmdAssembly"), terms:"gear ratio teeth rotation mate mechanical", available:function(){ return assemblyDoc() && E.assembly && E.assembly.components.length > 1; }, reason:function(){ return assemblyDoc() ? t("cmdNeedComponents") : needAsm(); } },
    { id:"beltmate", icon:"ph-circles-three-plus", label:t("beltMate"), group:t("cmdAssembly"), terms:"belt pulley diameter open crossed rotation coupling", available:function(){return assemblyDoc() && E.assembly && E.assembly.components.length>1;}, reason:function(){return assemblyDoc()?t("cmdNeedComponents"):needAsm();} },
    { id:"symmetricmate", icon:"ph-flip-horizontal", label:t("symmetricMate"), group:t("cmdAssembly"), terms:"symmetric mirror plane mate advanced", available:function(){ return assemblyDoc() && E.assembly && E.assembly.components.length > 1; }, reason:function(){ return assemblyDoc() ? t("cmdNeedComponents") : needAsm(); } },
    { id:"partdoc", icon:"ph-cube-focus", label:t("docPart"), group:t("cmdAssembly") },
    { id:"explode", icon:"ph-arrows-out", label:t("explodeView"), group:t("cmdAssembly"), available:function(){ return assemblyDoc() && E.assembly && E.assembly.components.length > 1; }, reason:function(){ return assemblyDoc() ? t("cmdNeedComponents") : needAsm(); } },
    { id:"explodestep", icon:"ph-arrows-out-line-horizontal", label:t("explodeStep"), group:t("cmdAssembly"), terms:"explode step chain distance direction leader line", available:function(){ return assemblyDoc() && E.assembly && E.assembly.components.length > 1; }, reason:function(){ return assemblyDoc() ? t("cmdNeedComponents") : needAsm(); } },
    { id:"motion", icon:"ph-play-circle", label:t("motionStudy"), group:t("cmdAssembly"), available:function(){ return assemblyDoc() && E.assembly && E.assembly.components.length; }, reason:function(){ return assemblyDoc() ? t("cmdNeedOneComponent") : needAsm(); } },
    { id:"interference", icon:"ph-intersect", label:t("interferenceCheck"), group:t("cmdAssembly"), available:function(){ return assemblyDoc() && E.assembly && E.assembly.components.length > 1; }, reason:function(){ return assemblyDoc() ? t("cmdNeedComponents") : needAsm(); } },
    { id:"bom", icon:"ph-table", label:t("billOfMaterials"), group:t("cmdAssembly"), available:function(){ return assemblyDoc() && E.assembly && E.assembly.components.length; }, reason:function(){ return assemblyDoc() ? t("cmdNeedOneComponent") : needAsm(); } },
    { id:"isolate", icon:"ph-eye", label:t("isolate"), group:t("cmdAssembly"), terms:"hide others isolate", available:function(){ return assemblyDoc() && E.assembly && (E.componentSel && E.componentSel.length || E.assembly.isolated); }, reason:function(){ return assemblyDoc() ? t("cmdNeedOneComponent") : needAsm(); } },
  ];
}
