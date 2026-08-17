// Command catalog and keyboard map for the model editor. Kept out of
// modeler.js so the ribbon, search, and key handler share one vocabulary.

export const KEY_VIEW = { 4: "top", 5: "front", 6: "side" };

// Letter keys pick a sketch or direct tool. R is reserved for parametric
// Revolve (see FEATURE_COMMAND); the old sketch-revolve tool has no chord.
export const KEY_TOOL = {
  v: "select", b: "rect", c: "circle", s: "sph", l: "wall", p: "poly", x: "cut", o: "cutc",
  q: "srect", g: "scirc", a: "sarc", d: "dim", t: "trim", e: "extend",
  j: "sslot", n: "spoly", y: "sell",
};

export const FEATURE_COMMAND = {
  extrude: "extrude", extrudeCut: "extrudecut", revolve: "revolvefeature", sweep: "sweepfeature",
  loft: "loftfeature", fillet: "filletfeature", chamfer: "chamferfeature", shell: "shellfeature",
  pattern: "patternfeature", mirror: "mirrorfeature", boolean: "booleanfeature", hole: "holefeature",
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

export function buildCommandCatalog(ctx) {
  var t = ctx.t;
  var E = ctx.editor;
  var closedSketchProfile = ctx.closedSketchProfile;
  var activeParts = ctx.activeParts;
  var partDoc = function () { return E.docType === "part"; };
  var assemblyDoc = function () { return E.docType === "assembly"; };
  var solids = function () { return !!(E.def && activeParts(E.def).length); };
  var closed = function () { return !!closedSketchProfile(); };
  var needPart = function () { return t("cmdNeedPartDoc"); };
  var needSketch = function () { return partDoc() ? t("cmdNeedClosedSketch") : t("cmdNeedPartDoc"); };
  var needSolid = function () { return partDoc() ? t("cmdNeedSolid") : t("cmdNeedPartDoc"); };
  var needAsm = function () { return t("cmdNeedAssembly"); };
  return [
    { id:"select", icon:"ph-cursor", label:t("tool_select"), group:t("cmdSketch"), shortcut:"V", terms:"cursor move" },
    { id:"wall", icon:"ph-line-segment", label:t("tool_wall"), group:t("cmdSketch"), shortcut:"L", terms:"line chain profile" },
    { id:"srect", icon:"ph-rectangle", label:t("tool_srect"), group:t("cmdSketch"), shortcut:"Q", terms:"rectangle profile" },
    { id:"scirc", icon:"ph-circle-dashed", label:t("tool_scirc"), group:t("cmdSketch"), shortcut:"G", terms:"circle" },
    { id:"sarc", icon:"ph-bezier-curve", label:t("tool_sarc"), group:t("cmdSketch"), shortcut:"A", terms:"arc" },
    { id:"sslot", icon:"ph-pill", label:t("tool_sslot"), group:t("cmdSketch"), shortcut:"J", terms:"slot oblong straight" },
    { id:"spoly", icon:"ph-hexagon", label:t("tool_spoly"), group:t("cmdSketch"), shortcut:"N", terms:"polygon hexagon n-gon regular" },
    { id:"sell", icon:"ph-circle", label:t("tool_sell"), group:t("cmdSketch"), shortcut:"Y", terms:"ellipse oval" },
    { id:"dim", icon:"ph-ruler", label:t("tool_dim"), group:t("cmdSketch"), shortcut:"D", terms:"measure smart dimension" },
    { id:"trim", icon:"ph-scissors", label:t("tool_trim"), group:t("cmdSketch"), shortcut:"T", terms:"remove segment" },
    { id:"extend", icon:"ph-arrows-out-line-horizontal", label:t("tool_extend"), group:t("cmdSketch"), shortcut:"E" },
    { id:"offset", icon:"ph-copy-simple", label:t("tool_offset"), group:t("cmdSketch") },
    { id:"constr", icon:"ph-line-segments", label:t("tool_constr"), group:t("cmdSketch"), terms:"construction geometry" },
    { id:"mirror", icon:"ph-flip-horizontal", label:t("sketchMirror"), group:t("cmdSketch") },
    { id:"pattern", icon:"ph-dots-nine", label:t("sketchPattern"), group:t("cmdSketch"), terms:"linear array" },
    { id:"circpattern", icon:"ph-circles-three", label:t("sketchCircPattern"), group:t("cmdSketch"), terms:"circular polar array bolt circle" },
    { id:"project", icon:"ph-projector-screen", label:t("projectEdges"), group:t("cmdSketch") },
    { id:"directbox", icon:"ph-cube", label:t("tool_rect"), group:t("grpDirect"), shortcut:"B", terms:"box rectangle primitive direct" },
    { id:"directcyl", icon:"ph-cylinder", label:t("tool_circle"), group:t("grpDirect"), shortcut:"C", terms:"cylinder circle primitive direct" },
    { id:"directsph", icon:"ph-sphere", label:t("tool_sph"), group:t("grpDirect"), shortcut:"S", terms:"sphere primitive direct" },
    { id:"directpoly", icon:"ph-polygon", label:t("tool_poly"), group:t("grpDirect"), shortcut:"P", terms:"polygon extrude direct" },
    { id:"directrev", icon:"ph-spiral", label:t("tool_rev"), group:t("grpDirect"), terms:"revolve profile sketch direct" },
    { id:"newsketch", icon:"ph-pencil-line", label:t("createSketch"), group:t("cmdFeatures"), terms:"reference plane face profile" },
    { id:"finishsketch", icon:"ph-check", label:t("finishSketch"), group:t("cmdSketch"), terms:"exit plane done finish", available:function(){ return partDoc() && E.authoring && E.authoring.phase==="sketch"; }, reason:function(){ return t("cmdNeedOpenSketch"); } },
    { id:"extrude", icon:"ph-cube", label:t("opExtrude"), group:t("cmdFeatures"), available:function(){ return partDoc() && closed(); }, reason:function(){ return closed() ? needPart() : needSketch(); } },
    { id:"extrudecut", icon:"ph-scissors", label:t("extrudeCut"), group:t("cmdFeatures"), available:function(){return partDoc()&&closed()&&solids();}, reason:function(){ return !partDoc() ? t("cmdNeedPartDoc") : !closed() ? t("cmdNeedClosedSketch") : t("cmdNeedSolid"); } },
    { id:"revolvefeature", icon:"ph-arrow-counter-clockwise", label:t("opRevolve"), group:t("cmdFeatures"), shortcut:"R" },
    { id:"sweepfeature", icon:"ph-path", label:t("opSweep"), group:t("cmdFeatures") },
    { id:"loftfeature", icon:"ph-stack", label:t("loftOp"), group:t("cmdFeatures") },
    { id:"filletfeature", icon:"ph-corners-out", label:t("quickFillet"), group:t("cmdFeatures") },
    { id:"chamferfeature", icon:"ph-corners-in", label:t("quickChamfer"), group:t("cmdFeatures") },
    { id:"shellfeature", icon:"ph-bowl-food", label:t("shellOp"), group:t("cmdFeatures") },
    { id:"patternfeature", icon:"ph-dots-nine", label:t("quickPattern"), group:t("cmdFeatures") },
    { id:"mirrorfeature", icon:"ph-flip-horizontal", label:t("quickMirror"), group:t("cmdFeatures") },
    { id:"booleanfeature", icon:"ph-intersect", label:t("opBoolean"), group:t("cmdFeatures") },
    { id:"holefeature", icon:"ph-circle-dashed", label:t("holeWizard"), group:t("cmdFeatures"), terms:"hole wizard bore drill", available:function(){ return partDoc() && solids(); }, reason:function(){ return needSolid(); } },
    { id:"refplane", icon:"ph-square-half", label:t("refPlane"), group:t("cmdFeatures"), available:function(){ return partDoc(); }, reason:needPart },
    { id:"refaxis", icon:"ph-axis-arrow", label:t("refAxis"), group:t("cmdFeatures"), available:function(){ return partDoc(); }, reason:needPart },
    { id:"coordsys", icon:"ph-crosshair", label:t("refCoord"), group:t("cmdFeatures"), available:function(){ return partDoc(); }, reason:needPart },
    { id:"regen", icon:"ph-arrows-clockwise", label:t("regenerate"), group:t("cmdEvaluate"), shortcut:"Ctrl+B", available:function(){ return partDoc() && !E.kernelBusy && solids(); }, reason:needSolid },
    { id:"fit", icon:"ph-crosshair-simple", label:t("zoomFit"), group:t("cmdEvaluate"), shortcut:"F" },
    { id:"drawing", icon:"ph-file-svg", label:t("drawingExport"), group:t("cmdEvaluate"), available:function(){ return partDoc(); }, reason:needPart },
    { id:"mass", icon:"ph-scales", label:t("massProps"), group:t("cmdEvaluate"), available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"standards", icon:"ph-seal-check", label:t("standardsAudit"), group:t("cmdEvaluate"), available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"stdscrew", icon:"ph-screwdriver", label:t("stdScrewCommand"), group:t("cmdFeatures"), available:function(){return partDoc();}, reason:needPart },
    { id:"stdgear", icon:"ph-gear-six", label:t("stdGearCommand"), group:t("cmdFeatures"), available:function(){return partDoc();}, reason:needPart },
    { id:"bundle", icon:"ph-package", label:t("projectBundle"), group:t("cmdEvaluate") },
    { id:"bundlein", icon:"ph-package", label:t("importBundle"), group:t("cmdEvaluate") },
    { id:"stepin", icon:"ph-upload-simple", label:t("stepImport"), group:"STEP", available:function(){ return partDoc(); }, reason:needPart },
    { id:"stepout", icon:"ph-file-step", label:t("stepExport"), group:"STEP", available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"igesout", icon:"ph-file-arrow-down", label:t("exportIges"), group:"STEP", available:function(){ return partDoc() && solids(); }, reason:needSolid },
    { id:"assembly", icon:"ph-cubes-three", label:t("docAssembly"), group:t("cmdAssembly") },
    { id:"components", icon:"ph-cube", label:t("components"), group:t("cmdAssembly") },
    { id:"mates", icon:"ph-link", label:t("mate"), group:t("cmdAssembly") },
    { id:"partdoc", icon:"ph-cube-focus", label:t("docPart"), group:t("cmdAssembly") },
    { id:"explode", icon:"ph-arrows-out", label:t("explodeView"), group:t("cmdAssembly"), available:function(){ return assemblyDoc() && E.assembly && E.assembly.components.length > 1; }, reason:function(){ return assemblyDoc() ? t("cmdNeedComponents") : needAsm(); } },
    { id:"motion", icon:"ph-play-circle", label:t("motionStudy"), group:t("cmdAssembly"), available:function(){ return assemblyDoc() && E.assembly && E.assembly.components.length; }, reason:function(){ return assemblyDoc() ? t("cmdNeedOneComponent") : needAsm(); } },
    { id:"interference", icon:"ph-intersect", label:t("interferenceCheck"), group:t("cmdAssembly"), available:function(){ return assemblyDoc() && E.assembly && E.assembly.components.length > 1; }, reason:function(){ return assemblyDoc() ? t("cmdNeedComponents") : needAsm(); } },
    { id:"bom", icon:"ph-table", label:t("billOfMaterials"), group:t("cmdAssembly"), available:function(){ return assemblyDoc() && E.assembly && E.assembly.components.length; }, reason:function(){ return assemblyDoc() ? t("cmdNeedOneComponent") : needAsm(); } },
  ];
}
