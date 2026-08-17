// Custom model editor ("CAD-lite"): sketch profiles, extrude, add primitives,
// apply materials/textures, constrain dimensions, and save reusable models.
// Saved models register into FURN/PRICE so they behave exactly like built-ins:
// placeable from the library select, priced, serialized with the scene.
//
// Model definition (stored in localStorage "home3d_models" + embedded in scene JSON):
//   { key, name, price, col, parts: [part...] }
// Part kinds (model-local frame like furniture: x=width, z=depth, y=up, floor y=0):
//   box: {x0,x1,y0,y1,z0,z1}    cyl: {x,y,z,r,r2,h} (y = base)   sph: {x,y,z,r}
//   ext: {axis:'y'|'z'|'x', from, to, pts:[{u,v}]}  extruded sketch profile
// Common part fields: id, kind, name, color, metal, rough, opacity, tex(dataURL)

import * as THREE from "three";
import { render as gpuRender } from "./gpu.js";
import { S, uid, clamp, fin, hexStr } from "./state.js";
import { FURN, PRICE, CATALOG, flabel, clearVSpanCache, buildItem } from "./furniture.js";
import { box, cyl, sph, clearGroup } from "./primitives.js";
import { getLang } from "./i18n.js";
import { render2D } from "./plan2d.js";
import { createHistory } from "./edit_history.js";
import { createHistoryPanel } from "./ui_history.js";
import { createEditorView, createViewportSwap } from "./editor_view.js";
import { getMainScene, has3D } from "./view3d.js";
import { validCustomModelKey, sanitizeDisplayName } from "./safe.js";
import {
  ensureSketch, ensureSketchDoc, sketchById, addSketch, removeSketch, planeLabel,
  sketchPoint, sketchEntity, solveSketch, resolveProfilePoints,
  lineData, circleData, ellipseData, entityPoints, removeSketchEntity,
} from "./sketch_solver.js";
import {
  addSmartDimension, currentMeasure, distanceDimensionLayout, hitSketchDimension,
  drawSketchDimensions, drawConstraintGlyphs,
} from "./sketch_dimensions.js";
import {
  resolveEquations, evaluateExpression, collectSymbols,
  isValidName, nameAvailable, addVariable, removeVariable,
} from "./sketch_equations.js";
import { trimEntity, extendEntity, offsetEntity, toggleConstruction, projectLoop } from "./sketch_trim.js";
import { mirrorEntities, linearPatternEntities, circularPatternEntities } from "./sketch_pattern.js";
import { addFeature, ensureFeatureTree, regenerateFeatures, releaseRegeneration } from "./cad_feature_tree.js";
import {
  exportStep, exportIges, importStep,
  makeBrepExtrusion, makeBrepPrimitive, booleanBrep, chamferBrep, extractBrepTopology, filletBrep, shapeToMeshData, shellBrep, disposeBrep,
  serializeBrep, transformBrep,
} from "./cad_kernel.js";
import { downloadDrawing } from "./cad_drawings.js";
import { addEdgeFlange, createSheetMetalPart, flatPattern } from "./cad_sheet_metal.js";
import { solveTopologyMates, topologyReference } from "./cad_mates.js";
import { analyzeSketchProfiles, curveSegments, healSketchEndpoints, pointInProfile, profileCentroid } from "./sketch_profiles.js";
import { createReferencePlane, createReferenceAxis, createCoordinateSystem } from "./cad_reference_geometry.js";
import { createExplodedView, addExplodeStep, applyExplodedView } from "./cad_exploded_view.js";
import { createMotionStudy, addRotaryMotor, evaluateMotionStudy } from "./cad_motion_study.js";
import { detectInterference, generateBOM, computeMassProperties } from "./cad_interference.js";
import { createProjectBundle, exportProjectBundle, importProjectBundle } from "./cad_project_bundle.js";
import { measureDistance, evaluateDraftAngle } from "./cad_evaluate.js";
import { auditStandardParts, involuteGearOutline } from "./cad_standards.js";
import {
  ensureItemDefinition,
  commitDefinition,
} from "./core/project.js";
import { migrateDefinition, cloneDomain } from "./core/schema.js";
import {
  analyzeParametricHistory, createFeatureDefinition, ensureParametricDocument,
  recordSketchInHistory, removeHistoryNode, reorderHistoryNode, suppressHistoryNode,
  updateFeatureDefinition,
} from "./core/parametric_document.js";
import { compileKernelFeatureTree } from "./core/kernel_feature_adapter.js";
import { publishRebuildStatus, rebuildParametricDocument } from "./core/parametric_rebuild.js";
import { featureDefaults, featureEditorGroups, featureSpec } from "./core/feature_catalog.js";
import { inferAuthoringMode } from "./core/authoring_mode.js";
import { createImportedDefinition, detectStepLengthUnit, stepUnitCorrection } from "./core/import_normalization.js";
import { encodeBinaryPayload } from "./core/binary_payload.js";
import { externalizeAttachments } from "./core/attachment_store.js";
import { garbageCollectAttachments } from "./core/attachment_gc.js";
import { loadModelLibrary, saveModelLibrary } from "./core/model_library_store.js";
import { rebuildDefinition } from "./core/rebuild.js";
import { applyTopologyRebindings, createTopologyReference, topologyForFeature } from "./core/topology.js";
import { frameDirection, frameFromPlane, framePoint, frameProjectPoint, realignFrame } from "./core/frame.js";
import { circularPatternPivot, circularPatternStepDegrees, linearPatternAxisDefinitions, linearPatternDirection, linearPatternOffsets, parseSkippedPatternInstances, patternAxisEnabled, rotatedPatternBounds } from "./core/pattern_geometry.js";
import { finalizeCabinetAdvancedDefinition, syncCabinetDefinition } from "./parametric_cabinet.js";
import { assignCabinetManufacturing, CABINET_MANUFACTURING_ROLES } from "./core/cabinet_advanced.js";
import { layoutCab } from "./cabinet.js";
import { createSurfaceSketch, supportsSurfaceUV } from "./core/surface_uv.js";
import { clearMeshProjectionCache, projectMeshEdges } from "./core/mesh_projection.js";

var LS_MODELS = "home3d_models";
var LS_ASSEMBLIES = "home3d_assemblies";
var modelLibraryCache = [];

/* ================= i18n (local, he/en) ================= */
var TXT = {
  title: ["עורך מודלים", "Model Editor"],
  name: ["שם המודל", "Model name"],
  price: ["מחיר ₪", "Price ₪"],
  save: ["שמור לספרייה", "Save to library"],
  close: ["סגור", "Close"],
  tool_select: ["בחירה / הזזה", "Select / move"],
  tool_rect: ["מלבן (תיבה)", "Rectangle (box)"],
  tool_circle: ["עיגול (גליל)", "Circle (cylinder)"],
  tool_poly: ["מצולע ← אקסטרוד", "Polygon → extrude"],
  tool_wall: ["קו סקיצה מחובר", "Connected sketch line"],
  tool_sph: ["כדור", "Sphere"],
  view_top: ["מבט על (X·Z)", "Top (X·Z)"],
  view_front: ["מבט חזית (X·Y)", "Front (X·Y)"],
  view_side: ["מבט צד (Z·Y)", "Side (Z·Y)"],
  view_right: ["מבט ימין (Z·Y)", "Right (Z·Y)"],
  depth: ["עומק אקסטרוד", "Extrude depth"],
  base: ["גובה בסיס", "Base offset"],
  parts: ["חלקים", "Parts"],
  inspector: ["מאפיינים", "Properties"],
  material: ["חומר", "Material"],
  color: ["צבע", "Color"],
  metal: ["מתכתיות", "Metalness"],
  rough: ["חספוס", "Roughness"],
  opacity: ["אטימות", "Opacity"],
  solidView: ["מוצק", "Solid"],
  transparentView: ["שקוף", "Transparent"],
  texture: ["טקסטורה אישית", "Custom image"],
  textureGallery: ["חיפוש בגלריה", "Gallery search"],
  clearTex: ["הסר טקסטורה", "Remove texture"],
  dup: ["שכפל", "Duplicate"],
  del: ["מחק", "Delete"],
  mirrorX: ["שיקוף X", "Mirror X"],
  centerX: ["מרכז X", "Center X"],
  centerZ: ["מרכז Z", "Center Z"],
  floor: ["הצמד לרצפה", "Snap to floor"],
  constraints: ["אילוצים", "Constraints"],
  snap: ["הצמדה לרשת", "Grid snap"],
  ortho: ["אילוץ ניצב (Shift)", "Ortho lock (Shift)"],
  dimHint: ["לחיצה כפולה על צלע: קביעת אורך", "Dbl-click an edge: set its length"],
  library: ["מודלים שמורים", "Saved models"],
  load: ["טען", "Load"],
  newModel: ["מודל חדש", "New model"],
  saved: ["המודל נשמר לספרייה", "Model saved to library"],
  needParts: ["הוסיפו לפחות חלק אחד", "Add at least one part"],
  polyHint: ["קליק: נקודה · קליק כפול/Enter: סגירה ואקסטרוד · Esc: ביטול", "Click: point · Dbl-click/Enter: close & extrude · Esc: cancel"],
  editModel: ["ערוך מודל נבחר", "Edit selected model"],
  openModeler: ["עורך מודלים", "Model editor"],
  segLen: ["אורך צלע (ס\"מ):", "Edge length (cm):"],
  undo: ["בטל", "Undo"],
  redo: ["בצע שוב", "Redo"],
  osnap: ["הצמדה לאובייקטים", "Object snap"],
  tool_cut: ["חיתוך מצולע (חור)", "Polygon cut (hole)"],
  tool_cutc: ["חיתוך עגול (קדח)", "Circular cut (bore)"],
  cutHint: ["שרטטו את קו החיתוך על חלק קיים · קליק כפול/Enter: ביצוע חיתוך", "Sketch the cut on an existing part · Dbl-click/Enter: apply cut"],
  cutcHint: ["גררו ממרכז הקדח החוצה על חלק קיים", "Drag from bore center outward on an existing part"],
  cutDone: ["החיתוך בוצע", "Cut applied"],
  cutNone: ["אין חלק מתאים מתחת לחיתוך (עובד על אקסטרודים ותיבות)", "No suitable part under the cut (works on extrudes & boxes)"],
  fillet: ["רדיוס פינה, או c+מרחק לקיטום ישר (למשל 5 או c5):", "Corner radius, or c+distance for a chamfer (e.g. 5 or c5):"],
  vertexHint: ["לחיצה כפולה על פינה: Fillet/Chamfer", "Dbl-click a corner: fillet/chamfer"],
  patLin: ["מערך ליניארי", "Linear pattern"],
  patCirc: ["מערך מעגלי", "Circular pattern"],
  patCount: ["מספר עותקים (כולל המקור):", "Instance count (incl. original):"],
  patStep: ["מרווח dx,dy,dz בס\"מ:", "Spacing dx,dy,dz in cm:"],
  patAngle: ["זווית כוללת במעלות (360=מעגל שלם):", "Total angle in degrees (360=full circle):"],
  patSkip: ["חלק זה אינו נתמך במערך מעגלי", "This part type is unsupported in a circular pattern"],
  tool_rev: ["גוף סיבוב (Revolve)", "Revolve"],
  revHint: ["שרטטו פרופיל (חצי חתך) · הציר האנכי הכחול הוא ציר הסיבוב · קליק כפול/Enter: סיום", "Sketch a half-profile · the blue vertical axis is the revolve axis · Dbl-click/Enter: finish"],
  shellOp: ["ריקון (Shell)", "Shell"],
  shellT: ["עובי דופן בס\"מ:", "Wall thickness (cm):"],
  shellFail: ["לא ניתן לרוקן את החלק הזה (נתמך: אקסטרוד/תיבה/גליל ישר)", "Cannot shell this part (supported: extrude/box/straight cylinder)"],
  loftOp: ["Loft / פחיסה", "Loft / Taper"],
  loftScale: ["קנה־מידה של הפרופיל העליון (למשל 0.5):", "Top profile scale (e.g. 0.5):"],
  loftOff: ["היסט הפרופיל העליון du,dv בס\"מ:", "Top profile offset du,dv (cm):"],
  loftFail: ["Loft נתמך רק על חלקי אקסטרוד (ללא חורים)", "Loft works on extrude parts without holes"],
  /* step names for the history list — what the panel calls each operation */
  hint3d: ["גררו לסיבוב · גלגלת לזום · גלגלת לחוצה או Shift+גרירה להזזה", "Drag to orbit · wheel to zoom · middle-drag or Shift-drag to pan"],
  mode2d: ["שרטוט", "Sketch"],
  mode3d: ["מודל", "Model"],
  modeDrawing: ["גיליון", "Drawing"],
  drawingHint: ["גיליון שרטוט · הזיזו את הדף או בחרו סרגל חכם לתיקון מידה", "Drawing sheet · pan the page or choose Smart ruler to correct a dimension"],
  smartRuler: ["סרגל חכם", "Smart ruler"],
  smartRulerHint: ["בחרו שתי נקודות · גררו את המידה למקום · לחיצה כפולה לעריכת הערך", "Pick two points · drag the dimension into place · double-click its value to edit"],
  rulerPickPoint: ["בחרו נקודת סקיצה", "Pick a sketch point"],
  rulerSamePoint: ["בחרו נקודה שנייה שונה", "Pick a different second point"],
  panDrawing: ["הזזת גיליון", "Pan sheet"],
  opMoveDim: ["הזזת מידה", "Move dimension"],
  modelPlaneHint: ["עבודה על מישור", "Working plane"],
  exitPlane: ["סיום עבודה על המישור", "Finish plane editing"],
  quickTools: ["מידול מהיר", "Quick model"],
  quickValue: ["ערך", "Value"],
  quickApply: ["החל", "Apply"],
  quickNeedPart: ["בחרו חלק מהמודל או מעץ החלקים", "Select a part in the model or parts tree"],
  quickNeedSketch: ["נדרשת סקיצה סגורה עבור Extrude", "A closed sketch is required for Extrude"],
  quickFillet: ["עיגול פינות", "Fillet"],
  quickChamfer: ["קיטום פינות", "Chamfer"],
  needEdges: ["בחרו קצה אחד או יותר בתצוגת התלת־ממד (Ctrl לבחירה מרובה)", "Select one or more edges in the 3D view first (Ctrl-click to add)"],
  needFace: ["בחרו פאה בתצוגת התלת־ממד", "Select a face in the 3D view first"],
  prefNormalTo: ["סובב את המצלמה למישור בפתיחת סקיצה", "Rotate camera normal to the sketch plane"],
  prefAutoDim: ["הפוך ערך שהוקלד למידה מניעה", "Typed value becomes a driving dimension"],
  normalTo: ["ניצב למישור", "Normal to"],
  quickHole: ["קדח", "Hole"],
  quickPattern: ["מערך", "Pattern"],
  quickMirror: ["שיקוף", "Mirror"],
  quickDuplicate: ["שכפול", "Duplicate"],
  opDraw: ["שרטוט חלק", "Draw part"],
  opRevolve: ["גוף סיבוב", "Revolve"],
  opCut: ["חיתוך", "Cut"],
  opExtrude: ["אקסטרוד", "Extrude"],
  opMove: ["הזזת חלק", "Move part"],
  opVertex: ["הזזת פינה", "Move vertex"],
  opFillet: ["עיגול פינה", "Fillet corner"],
  opSegLen: ["אורך צלע", "Edge length"],
  opProp: ["שינוי מאפיין", "Change property"],
  opTexture: ["טקסטורה", "Texture"],
  /* ---- panel chrome: icon groups, tabs, empty states ---- */
  grpCreate: ["יצירה", "Create"],
  grpModel: ["מודל", "Model"],
  grpPart: ["חלק נבחר", "Selected part"],
  tabParts: ["חלקים", "Parts"],
  tabLib: ["מודלים שמורים", "Saved models"],
  tabSet: ["הגדרות שרטוט", "Sketch settings"],
  tabShape: ["צורה ומידות", "Shape & size"],
  tabLook: ["חומר וגימור", "Material & finish"],
  tabOps: ["פעולות על החלק", "Part operations"],
  tabHist: ["היסטוריה", "History"],
  /* the tab strips show their caption now instead of hiding it in a tooltip,
     so each pane needs a name that survives a 60px-wide tab */
  tabTreeShort: ["עץ", "Tree"],
  tabTreeLong: ["עץ התכן וההיסטוריה", "Design tree & history"],
  tabLibShort: ["ספרייה", "Library"],
  tabSetShort: ["הגדרות", "Settings"],
  tabSketchShort: ["סקיצה", "Sketch"],
  tabShapeShort: ["צורה", "Shape"],
  tabLookShort: ["גימור", "Finish"],
  tabOpsShort: ["פעולות", "Ops"],
  tabHistShort: ["היסטוריה", "History"],
  noSel: ["לא נבחר חלק", "No part selected"],
  noSelHint: ["בחרו חלק בשרטוט או ברשימת החלקים", "Pick a part on the canvas or in the parts list"],
  noParts: ["עדיין אין חלקים", "No parts yet"],
  noPartsHint: ["בחרו כלי צורה וגררו על השרטוט", "Choose a shape tool and drag on the canvas"],
  noLib: ["אין עדיין מודלים שמורים", "Nothing saved yet"],
  noLibHint: ["\"שמור לספרייה\" מוסיף את המודל לקטלוג", "\"Save to library\" adds this model to the catalog"],
  partName: ["שם החלק", "Part name"],
  partCount: ["חלקים", "parts"],
  views: ["מבט", "View"],
  zoomIn: ["התקרב", "Zoom in"],
  zoomOut: ["התרחק", "Zoom out"],
  zoomFit: ["התאם לתצוגה", "Zoom to fit"],
  delModel: ["מחק מהספרייה", "Delete from library"],
  askDel: ["למחוק את המודל מהספרייה?", "Delete this model from the library?"],
  opAlign: ["יישור", "Align"],
  opCopy: ["שכפול", "Duplicate"],
  opShape: ["עריכת צורה", "Reshape"],
  keysTitle: ["קיצורי מקלדת", "Keyboard shortcuts"],
  size: ["מידות המודל", "Model size"],
  contextRoom: ["בתוך החדר", "In the room"],
  loftNoTex: ["לגוף Loft אין מיפוי טקסטורה — צבע בלבד", "Lofted geometry has no UVs — colour only"],
  gridSize: ["צעד רשת", "Grid step"],
  wallWidth: ["עובי תצוגת קו", "Line display weight"],
  wallHint: ["קליק: נקודה הבאה · הקלידו אורך, Tab וזווית, Enter · Enter נוסף לסיום", "Click the next point · type length, Tab and angle, Enter · Enter again to finish"],
  constraintLength: ["אילוץ אורך", "Length constraint"],
  constraintAngle: ["אילוץ זווית", "Angle constraint"],
  constraintDriven: ["המידות נשמרות כאילוצים וניתנות לעריכה", "Dimensions are saved as editable constraints"],
  docPart: ["חלק", "Part"],
  docAssembly: ["הרכבה", "Assembly"],
  components: ["רכיבים", "Components"],
  addComponent: ["הוסף רכיב", "Insert component"],
  noComponents: ["אין רכיבים בהרכבה", "No components in this assembly"],
  noComponentsHint: ["שמרו חלקים לספרייה ואז הוסיפו אותם להרכבה", "Save parts to the library, then insert them into the assembly"],
  emptyLibTitle: ["ספריית המודלים ריקה", "Your model library is empty"],
  emptyLibHint: ["רכיבים בהרכבה מגיעים ממודלים שמורים. שמרו חלק לספרייה, או הריצו את מדריך ההרכבה שמוסיף שני רכיבי תרגול.", "Assembly components come from saved models. Save a part to the library, or run the assembly tutorial — it adds two practice components for you."],
  runAssemblyGuide: ["פתחו את מדריך ההרכבה", "Run the assembly tutorial"],
  assemblyName: ["שם ההרכבה", "Assembly name"],
  saveAssembly: ["שמור הרכבה", "Save assembly"],
  newAssembly: ["הרכבה חדשה", "New assembly"],
  assemblies: ["הרכבות שמורות", "Saved assemblies"],
  transform: ["מיקום וסיבוב", "Position & rotation"],
  grounded: ["מקובע", "Grounded"],
  visible: ["מוצג", "Visible"],
  mate: ["Mate / אילוץ הרכבה", "Assembly mate"],
  mateHint: ["בחרו שני רכיבים עם Ctrl/Cmd ואז הוסיפו Mate", "Ctrl/Cmd-select two components, then add a mate"],
  mateX: ["יישור X", "Align X"],
  mateY: ["יישור Y", "Align Y"],
  mateZ: ["יישור Z", "Align Z"],
  mateDistance: ["מרחק X", "X distance"],
  savedAssembly: ["ההרכבה נשמרה", "Assembly saved"],
  regenerate: ["בנה מחדש BREP", "Regenerate BREP"],
  stepImport: ["ייבוא STEP", "Import STEP"],
  stepExport: ["ייצוא STEP", "Export STEP"],
  drawingExport: ["שרטוט SVG", "Drawing SVG"],
  sheetMetal: ["פח", "Sheet metal"],
  kernelReady: ["גאומטריית BREP נבנתה", "BREP geometry regenerated"],
  kernelBusy: ["טוען מנוע CAD…", "Loading CAD kernel…"],
  exactBuilding: ["בונה חיתוך BREP מדויק…", "Building exact BREP boolean…"],
  exactReady: ["גוף BREP מדויק", "Exact BREP solid"],
  exactFailed: ["בניית הגוף המדויק נכשלה", "Exact solid build failed"],
  topologySelection: ["בחירת טופולוגיה", "Topology selection"],
  clearTopologySelection: ["נקה בחירה", "Clear selection"],
  /* ---- parametric sketcher ---- */
  grpSketch: ["סקיצה", "Sketch"],
  grpSketchEdit: ["עריכת סקיצה", "Sketch edit"],
  tool_scirc: ["מעגל סקיצה", "Sketch circle"],
  tool_srect: ["מלבן סקיצה", "Sketch rectangle"],
  tool_sarc: ["קשת סקיצה", "Sketch arc"],
  tool_sslot: ["חריץ", "Slot"],
  tool_spoly: ["מצולע משוכלל", "Regular polygon"],
  tool_sell: ["אליפסה", "Ellipse"],
  /* Ribbon captions. The group heading above them already says "Sketch", so
     these drop the noun the full name repeats and the tab stops overflowing. */
  cap_select: ["בחירה", "Select"],
  cap_wall: ["קו", "Line"],
  cap_srect: ["מלבן", "Rectangle"],
  cap_scirc: ["מעגל", "Circle"],
  cap_sarc: ["קשת", "Arc"],
  cap_spoly: ["מצולע", "Polygon"],
  cap_dim: ["מידה", "Dimension"],
  cap_constr: ["קו עזר", "Construction"],
  cap_project: ["הטלה", "Project"],
  cap_pattern: ["ליניארי", "Linear"],
  cap_circpattern: ["מעגלי", "Circular"],
  slotHint: ["קליק: התחלת ציר · קליק: סוף · קליק: רוחב · הקלידו מספר לערך מדויק", "Click: centreline start · click: end · click: width · type a number for an exact value"],
  ellipseHint: ["קליק: מרכז · קליק: קצה הציר הראשי · קליק: רדיוס משני", "Click: centre · click: major axis end · click: minor radius"],
  polygonHint: ["גררו מהמרכז לקודקוד · הקלידו מספר צלעות ב-Tab", "Drag centre → corner · Tab to type the side count"],
  twoPointHint: ["גררו, או קליק־קליק · הקלידו מידה ואז Enter", "Drag, or click twice · type a size then Enter"],
  sketchCircPattern: ["מערך מעגלי", "Circular pattern"],
  circPatternNeed: ["בחרו ישויות ונקודת מרכז (או מעגל שמרכזו הציר)", "Select entities plus a centre point (or a circle whose centre is the axis)"],
  circPatternAngle: ["זווית בין עותקים (מעלות):", "Angle between copies (degrees):"],
  dyn_length: ["אורך", "L"],
  dyn_angle: ["זווית", "A"],
  dyn_width: ["רוחב", "W"],
  dyn_height: ["גובה", "H"],
  dyn_diameter: ["קוטר", "Ø"],
  dyn_major: ["ציר ראשי", "Major"],
  dyn_minor: ["ציר משני", "Minor"],
  dyn_sides: ["צלעות", "Sides"],
  tool_trim: ["גזירה", "Trim"],
  tool_extend: ["הארכה", "Extend"],
  tool_offset: ["היסט", "Offset"],
  tool_dim: ["מידה חכמה", "Smart dimension"],
  tool_constr: ["קו עזר", "Construction toggle"],
  tabSketch: ["סקיצה ואילוצים", "Sketch & constraints"],
  arcHint: ["קליק: מרכז · קליק: התחלה · קליק: סוף", "Click: centre · click: start · click: end"],
  trimHint: ["לחצו על הקטע שברצונכם להסיר", "Click the piece you want gone"],
  extendHint: ["לחצו קרוב לקצה שיש להאריך", "Click near the end you want extended"],
  offsetHint: ["לחצו על ישות כדי להעתיקה במרחק", "Click an entity to copy it at a distance"],
  dimHint2: ["לחצו על ישות (או שתי נקודות) כדי למדוד ולנעול", "Click an entity (or two points) to measure and lock it"],
  offsetAsk: ["מרחק היסט בס\"מ (שלילי = הצד השני):", "Offset distance in cm (negative = other side):"],
  dimAsk: ["ערך המידה:", "Dimension value:"],
  dofFull: ["מוגדר במלואו", "Fully defined"],
  dofUnder: ["דרגות חופש", "DOF"],
  dofOver: ["מוגדר יתר על המידה", "Over-defined"],
  dofConflict: ["אילוצים סותרים", "Conflicting constraints"],
  noSketch: ["הסקיצה ריקה", "The sketch is empty"],
  noSketchHint: ["ציירו קו, מעגל או קשת ואז הוסיפו אילוצים", "Draw a line, circle or arc, then add constraints"],
  selHint: ["בחרו ישות (Ctrl/Cmd לבחירה מרובה) כדי להפעיל אילוץ", "Select entities (Ctrl/Cmd for more than one) to apply a constraint"],
  cCoincident: ["מתלכדות", "Coincident"],
  cHorizontal: ["אופקי", "Horizontal"],
  cVertical: ["אנכי", "Vertical"],
  cParallel: ["מקביל", "Parallel"],
  cPerpendicular: ["ניצב", "Perpendicular"],
  cTangent: ["משיק", "Tangent"],
  cEqual: ["שווה", "Equal"],
  cConcentric: ["קונצנטרי", "Concentric"],
  cMidpoint: ["אמצע", "Midpoint"],
  cSymmetric: ["סימטרי", "Symmetric"],
  cFixed: ["קיבוע", "Fix"],
  cPointOnLine: ["נקודה על ישות", "Point on entity"],
  needSel: ["הבחירה אינה מתאימה לאילוץ הזה", "That selection does not fit this constraint"],
  overDefined: ["האילוץ סותר את הקיימים — בוטל", "That constraint fights the existing ones — undone"],
  constraintList: ["אילוצים בסקיצה", "Sketch constraints"],
  suppress: ["השהה", "Suppress"],
  opSketch: ["סקיצה", "Sketch"],
  opConstraint: ["אילוץ", "Constraint"],
  opDim: ["מידה", "Dimension"],
  opTrim: ["גזירה", "Trim"],
  opDragPt: ["גרירת נקודה", "Drag point"],
  projectEdges: ["הטל קצוות חלק", "Project part edges"],
  sketches: ["סקיצות", "Sketches"],
  sketch: ["סקיצה", "Sketch"],
  equations: ["משתנים ומשוואות", "Variables & equations"],
  addVariable: ["משתנה חדש", "New variable"],
  varName: ["שם", "Name"],
  varExpr: ["ערך או ביטוי", "Value or expression"],
  dimName: ["שם המידה", "Dimension name"],
  badName: ["השם אינו חוקי או תפוס", "That name is invalid or already taken"],
  eqHelp: ["אפשר לכתוב מידה כפונקציה של אחרת, למשל Width / 2", "Write one dimension in terms of another, e.g. Width / 2"],
  sketchMirror: ["שיקוף", "Mirror"],
  sketchPattern: ["מערך ליניארי", "Linear pattern"],
  mirrorNeed: ["בחרו ישויות ואת קו השיקוף אחרון", "Select the entities, then the mirror line last"],
  patternAsk: ["מספר עותקים (כולל המקור):", "Copies including the original:"],
  patternPitch: ["מרווח בס\"מ (שלילי = הכיוון ההפוך):", "Pitch in cm (negative reverses it):"],
  patternDir: ["כיוון: u (אופקי) או v (אנכי):", "Direction: u (across) or v (up):"],
  patternMade: ["המערך נוצר — המרווח הוא מידה שאפשר לנעול או לקשור למשוואה", "Pattern created — its pitch is a dimension you can name or drive with an equation"],
  mirrorMade: ["השיקוף נוצר וקשור לקו — הזזת המקור תזיז גם אותו", "Mirrored and tied to the line — moving the original moves the copy"],
  patternFail: ["לא ניתן ליצור מערך מהבחירה הזו", "That selection cannot be patterned"],
  profileBroken: ["הפרופיל בסקיצה נשבר — מוצגת הצורה האחרונה התקינה", "This feature's sketch profile is broken — showing its last good shape"],
  newSketch: ["סקיצה חדשה במישור הזה", "New sketch on this plane"],
  sketchPlane: ["מישור הסקיצה", "Sketch plane"],
  sketchOffset: ["היסט", "Offset"],
  /* ---- feature history ---- */
  featureTree: ["עץ הפעולות", "Feature tree"],
  brepTree: ["פעולות BREP", "BREP features"],
  reorder: ["גררו לשינוי הסדר", "Drag to reorder"],
  unsuppress: ["הפעל מחדש", "Unsuppress"],
  rollbackTo: ["גלגל לכאן", "Roll back to here"],
  rollbackBar: ["סרגל הגלגול", "Rollback bar"],
  rollbackRelease: ["לחיצה כפולה: שחרור לסוף", "Double-click: release to the end"],
  rolledNote: ["חלק מהפעולות מגולגלות ואינן נבנות", "Some features are rolled back and are not being built"],
  projected: ["הקצוות הוטלו כקווי עזר", "Edges projected as construction lines"],
  cmdFeatures: ["תכונות", "Features"],
  cmdSketch: ["סקיצה", "Sketch"],
  cmdEvaluate: ["בדיקה", "Evaluate"],
  cmdAssembly: ["הרכבה", "Assembly"],
  cmdSearch: ["חיפוש פקודה", "Search commands"],
  cmdSearchHint: ["הקלידו שם כלי או פעולה…", "Type a tool or command…"],
  featureFilter: ["סינון עץ הפעולות", "Filter feature tree"],
  finishCommand: ["סיום הפעולה", "Finish command"],
  cancelCommand: ["ביטול הפעולה", "Cancel command"],
  noCommands: ["לא נמצאו פקודות", "No matching commands"],
  evaluateModel: ["בדיקת ובניית המודל", "Evaluate and rebuild model"],
  profileReady: ["פרופיל סגור ומוכן", "Closed profile ready"],
  profileMultiple: ["נמצאו כמה פרופילים סגורים", "Multiple closed profiles found"],
  profilePartial: ["נמצא פרופיל סגור, אך יש גם גאומטריה פתוחה", "Closed profile found with additional open geometry"],
  profileOpen: ["הסקיצה פתוחה", "The sketch has open endpoints"],
  profileBranched: ["יש הסתעפות בפרופיל", "The profile contains a branch"],
  profileEmpty: ["עדיין אין פרופיל סגור", "No closed profile yet"],
  profileHeal: ["אחד קצוות חופפים", "Merge overlapping endpoints"],
  profileHealed: ["קצוות חופפים אוחדו", "Overlapping endpoints merged"],
  profileEnds: ["קצוות פתוחים", "open endpoints"],
  profileLoops: ["לולאות סגורות", "closed loops"],
  profileHoles: ["חורים פנימיים", "inner holes"],
  selectionInfo: ["מידע בחירה", "Selection info"],
  selectAllSketch: ["בחר הכול בסקיצה", "Select all sketch geometry"],
  constraintExists: ["האילוץ כבר קיים", "That constraint already exists"],
  removeConflicts: ["הסר אילוצים סותרים", "Remove conflicting constraints"],
  entitiesLabel: ["ישויות", "entities"],
  dimensionsLabel: ["מידות", "dimensions"],
  selectedLabel: ["נבחרו", "selected"],
  drivingDimension: ["מידה מניעה", "Driving dimension"],
  drivenDimension: ["מידת ייחוס", "Driven/reference dimension"],
  guide: ["מדריך", "Guide"],
  guideTitle: ["מדריך אינטראקטיבי", "Interactive guide"],
  guideStep: ["שלב", "Step"],
  guideOf: ["מתוך", "of"],
  guideBack: ["הקודם", "Back"],
  guideNext: ["המשך", "Continue"],
  guideSkip: ["דלג על השלב", "Skip step"],
  guideClose: ["סגור מדריך", "Close guide"],
  guideDone: ["הושלם", "Completed"],
  guideWaiting: ["מחכה לפעולה שלך", "Waiting for your action"],
  guideIntroTitle: ["בואו נכיר את סביבת הסקיצה", "Meet the sketch workspace"],
  guideIntroBody: ["בתרגול קצר ניצור צורה, נערוך אותה, נבחר קווים ונגדיר אילוצים ויחסים. הפעולות מתבצעות על המודל הפתוח וניתנות לביטול כרגיל.", "In this short exercise you will create and edit geometry, select lines, and add constraints and relations. Changes are made in the open model and can be undone normally."],
  guideIntroTip: ["אפשר לסגור את המדריך בכל רגע ולחזור אליו מכפתור המדריך.", "Close the guide at any time and reopen it from the Guide button."],
  guideToolsTitle: ["1. בחרו כלי ליצירת צורה", "1. Choose a shape tool"],
  guideToolsBody: ["בסרגל הסקיצה נמצאים קו, מלבן, מעגל וקשת. התחילו בלחיצה על ״מלבן סקיצה״.", "The Sketch ribbon contains line, rectangle, circle, and arc tools. Start by choosing Sketch rectangle."],
  guideToolsTip: ["קיצורי הדרך מופיעים על הכלים: Q למלבן, L לקו, G למעגל ו־A לקשת.", "Shortcuts appear on the tools: Q for rectangle, L for line, G for circle, and A for arc."],
  guideDrawTitle: ["2. צרו מלבן על משטח העבודה", "2. Draw a rectangle"],
  guideDrawBody: ["גררו מנקודת ההתחלה אל הפינה הנגדית. ארבעת הקווים ייווצרו כסקיצה אחת עם פינות משותפות.", "Drag from the first corner to the opposite corner. Four connected sketch lines will be created."],
  guideDrawTip: ["החזיקו Shift בזמן יצירה או הזזה כדי לנעול כיוון.", "Hold Shift while drawing or moving to lock the direction."],
  guideMoveTitle: ["3. בצעו מניפולציה על הצורה", "3. Manipulate the shape"],
  guideMoveBody: ["עברנו לכלי הבחירה. גררו אחת מפינות המלבן ושימו לב כיצד הקווים המחוברים והאילוצים מגיבים יחד.", "The Select tool is active. Drag a rectangle corner and watch the connected lines and constraints respond together."],
  guideMoveTip: ["אפשר גם לבחור ישות ולערוך ערכי X, Y, אורך וזווית בלוח המאפיינים.", "You can also select an entity and edit X, Y, length, and angle in Properties."],
  guideSelectTitle: ["4. בחרו קו", "4. Select a line"],
  guideSelectBody: ["לחצו על אחד מקווי המלבן. קו שנבחר מודגש, והמידע עליו מופיע בלוח הימני.", "Click one rectangle edge. The selected line is highlighted and its details appear in the right panel."],
  guideSelectTip: ["לחיצה רגילה מחליפה בחירה; Ctrl/Cmd מוסיף או מסיר ישות מהבחירה.", "A regular click replaces the selection; Ctrl/Cmd adds or removes an entity."],
  guideDimTitle: ["5. הגדירו אילוץ אורך", "5. Add a length constraint"],
  guideDimBody: ["בלוח ״צורה ומידות״ שנו את ערך ״אילוץ אורך״ של הקו. הערך יהפוך למידה מניעה שתישאר ניתנת לעריכה.", "In Shape & size, change the selected line's Length constraint value. It becomes a driving dimension that remains editable."],
  guideDimTip: ["למדידה ישירה על הקנבס אפשר להשתמש גם בכלי ״מידה חכמה״ (D).", "For direct canvas measurement you can also use Smart dimension (D)."],
  guidePairTitle: ["6. בחרו שני קווים", "6. Select two lines"],
  guidePairBody: ["בחרו קו אחד, ואז החזיקו Ctrl/Cmd ולחצו על קו נוסף. לוח האילוצים יפעיל רק יחסים שמתאימים לבחירה.", "Select one line, then hold Ctrl/Cmd and click another. The constraint palette enables only relations that fit the selection."],
  guidePairTip: ["אפשר לבצע בחירה מרובה גם מרשימת הישויות בצד שמאל.", "You can also multi-select from the entity list on the left."],
  guideRelationTitle: ["7. הגדירו יחס בין הקווים", "7. Define a relation between lines"],
  guideRelationBody: ["לחצו על ״שווה״ בלוח האילוצים. אורך הקו השני ייקשר לאורך הראשון, והיחס יופיע ברשימת האילוצים.", "Choose Equal in the constraint palette. The second line will follow the first line's length, and the relation will appear in the constraint list."],
  guideRelationTip: ["באותה דרך אפשר להגדיר מקביל, ניצב, משיק, קונצנטרי ועוד — לפי סוגי הישויות שנבחרו.", "The same flow supports parallel, perpendicular, tangent, concentric, and more, depending on the selected entities."],
  guideFinishTitle: ["מעולה — יסודות הסקיצה בידיכם", "Great — you know the sketch basics"],
  guideFinishBody: ["יצרתם צורה, ערכתם אותה, הוספתם מידה והגדרתם יחס בין קווים. מכאן אפשר לסגור פרופיל ולבצע Extrude כדי להפוך אותו לגוף תלת־ממדי.", "You created and edited geometry, added a dimension, and defined a relation between lines. Next, close a profile and Extrude it into a 3D solid."],
  guideFinishTip: ["מד ה־DOF בלוח הסקיצה מראה כמה חופש עוד נשאר. היעד במודל פרמטרי הוא בדרך כלל ״מוגדר במלואו״.", "The DOF indicator shows how much freedom remains. A parametric sketch is usually headed toward Fully defined."],
  guideFinish: ["סיום", "Finish"],
  guideHubTitle: ["מה תרצו ללמוד?", "What would you like to learn?"],
  guideHubBody: ["בחרו מסלול. כל מסלול מדגיש את הכלים הרלוונטיים ומתקדם רק לאחר שביצעתם את הפעולה בעורך.", "Choose a learning path. Each path highlights the relevant tools and advances after you perform the action in the editor."],
  guideSketchTrack: ["יסודות סקיצה", "Sketch basics"],
  guideSketchTrackDesc: ["צורות, בחירה, מידות ויחסים", "Shapes, selection, dimensions, and relations"],
  guideSolidworksTrack: ["פרויקט: קוביית CAD", "Project: CAD cube"],
  guideSolidworksTrackDesc: ["ארבע סקיצות מוגדרות, Extrude ושלושה קדחים", "Four defined sketches, Extrude, and three bores"],
  swIntroTitle: ["נבנה את הקובייה מהסרטון", "Build the cube from the video"],
  swIntroBody: ["המסלול משחזר את הרצף מדקה 1:05: בוחרים מישור, מגדירים ריבוע, מבצעים Extrude, חותכים שלושה קדחים ניצבים ומעגלים את כל הקצוות.", "This path recreates the sequence from 1:05: choose a plane, dimension a square, Extrude it, cut three perpendicular bores, and round the edges."],
  swIntroTip: ["לחיצה על פאה במודל בוחרת אוטומטית את מישור הסקיצה המתאים.", "Clicking a model face automatically chooses its sketch plane."],
  swPlaneTitle: ["1. בחרו מישור ופתחו סקיצה", "1. Choose a plane and start a sketch"],
  swPlaneBody: ["מה עושים: בוחרים Top Plane ופותחים Sketch. אחר כך בוחרים מלבן. למה: המישור קובע שה־Extrude יעלה בציר Y. תוצאה צפויה: רשת X·Z וכלי המלבן פעיל.", "Do: choose Top Plane, start a Sketch, then choose Rectangle. Why: this plane makes the Extrude run along Y. Expected: the X·Z grid is visible and Rectangle is active."],
  swPlaneTip: ["במודל קיים אפשר ללחוץ על פאה ואז לבחור כלי סקיצה; המבט והמישור יתעדכנו יחד.", "On an existing model, click a face and then a sketch tool; the view and plane update together."],
  swRectTitle: ["2. שרטטו ריבוע ממורכז", "2. Draw a centred square"],
  swRectBody: ["מה עושים: יוצרים ריבוע 60×60 ס״מ סביב הראשית. ארבע הפינות חייבות להיות מחוברות. תוצאה צפויה: ארבעה קווים, פרופיל סגור, אך עדיין נשארות דרגות חופש.", "Do: create a 60 × 60 cm square around the origin. All four corners must be connected. Expected: four lines and one closed profile, still with remaining DOF."],
  swRectTip: ["הצמדה לראשית ולרשת עוזרת לשמור על סקיצה סימטרית.", "Origin and grid snaps make a symmetric sketch easier."],
  swDimTitle: ["3. הגדירו רוחב וגובה", "3. Dimension width and height"],
  swDimBody: ["מה ממלאים: רוחב 60 ס״מ, גובה 60 ס״מ ומיקום פינת עיגון ביחס לראשית. תוצאה צפויה: Fully defined, ללא אדום וללא DOF חופשי.", "Fill: width 60 cm, height 60 cm, and anchor one corner to the origin reference. Expected: Fully defined, no red state, and zero free DOF."],
  swDimTip: ["אפשר להשתמש ב׳מידה חכמה׳ או לערוך אילוץ אורך בלוח צורה ומידות.", "Use Smart dimension or edit the Length constraint in Shape & size."],
  swExtrudeTitle: ["4. בצעו Extrude לקובייה", "4. Extrude the cube"],
  swExtrudeBody: ["בדקו את כל השדות: End condition=Blind, Depth=60, Direction=Forward, Offset=0, Draft=0, Operation=Add ו־Merge=On. רק אז Apply. תוצאה: קובייה 60×60×60.", "Check every field: End condition=Blind, Depth=60, Direction=Forward, Offset=0, Draft=0, Operation=Add, Merge=On. Then Apply. Expected: a 60 × 60 × 60 cube."],
  swExtrudeTip: ["הסקיצה נשארת מקושרת לגוף, כך ששינוי מידה מעדכן את המודל.", "The sketch remains linked to the solid, so changing a dimension updates the model."],
  swCircleTitle: ["5. שרטטו מעגל על פאה", "5. Sketch a circle on a face"],
  swCircleBody: ["מה עושים: בוחרים את פאת Front, פותחים עליה Sketch ומציירים מעגל. מרכז המעגל נמצא באמצע הפאה. תוצאה צפויה: סקיצה חדשה בשם Front bore sketch.", "Do: select the Front face, start a Sketch on it, and draw a circle at the face centre. Expected: a separate sketch named Front bore sketch."],
  swCircleTip: ["הפאה שנלחצה קובעת את מישור הסקיצה החדש.", "The clicked face determines the new sketch plane."],
  swDiameterTitle: ["6. הגדירו את קוטר הקדח", "6. Dimension the bore"],
  swDiameterBody: ["מה ממלאים: קוטר 40 ס״מ ושתי מידות מיקום למרכז. תוצאה צפויה: Fully defined. אם מד ה־DOF אינו אפס, אין להמשיך לחיתוך.", "Fill: diameter 40 cm and two centre-location dimensions. Expected: Fully defined. Do not continue to the cut while any DOF remains."],
  swDiameterTip: ["בחרו את המעגל והשתמשו במידה חכמה כדי לקבע קוטר.", "Select the circle and use Smart dimension to lock its diameter."],
  swCutTitle: ["7. בצעו חיתוך Through all", "7. Cut Through all"],
  swCutBody: ["בדקו: End condition=Through all, Direction=Forward, Offset=0, Draft=0 ו־Keep tool=Off. Apply יוצר Pocket התלוי בסקיצה וב־Extrude הקודם. תוצאה צפויה: קדח אחד וללא Rebuild errors.", "Check: End condition=Through all, Direction=Forward, Offset=0, Draft=0, Keep tool=Off. Apply creates a Pocket dependent on the sketch and prior Extrude. Expected: one bore and no rebuild errors."],
  swCutTip: ["החיתוך נבנה כ־Boolean BREP אמיתי, לא רק כחור מצויר על הפאה.", "The cut is a real BREP boolean, not merely a face overlay."],
  swOtherCutsTitle: ["8. הוסיפו קדחים בשתי הפאות הנוספות", "8. Add bores on the other two faces"],
  swOtherCutsBody: ["צרו סקיצה חדשה על פאת ימין ועל הפאה העליונה, ובכל אחת הפעילו Extrude cut. שלושת הקדחים הניצבים נפגשים בתוך גוף אחד.", "Create a new sketch on the right and top faces, then use Extrude cut on each. The three perpendicular bores meet inside one solid."],
  swOtherCutsTip: ["אפשר לסובב את המודל בין הפעולות; לחיצה על כל פאה בוחרת את הציר הנכון.", "Orbit between operations; clicking each face picks the correct axis."],
  swRightCircleTitle: ["8. סקיצת הקדח הימני", "8. Sketch the right bore"],
  swRightCircleBody: ["על פאת ימין צרו מעגל שמרכזו מוגדר בשתי מידות מיקום.", "On the right face, create a circle whose centre is located by two driving dimensions."],
  swRightDimTitle: ["9. הגדירו במלואה את סקיצת ימין", "9. Fully define the right sketch"],
  swRightDimBody: ["הגדירו את מיקום המרכז ואת הקוטר. מד ה־DOF חייב להציג ׳מוגדר במלואו׳.", "Dimension the centre location and diameter. The DOF indicator must show Fully defined."],
  swRightCutTitle: ["10. הגדירו Extrude cut ימני", "10. Define the right Extrude cut"],
  swTopCircleTitle: ["11. סקיצת הקדח העליון", "11. Sketch the top bore"],
  swTopCircleBody: ["על הפאה העליונה צרו את המעגל השלישי ומקמו את מרכזו במידות.", "On the top face, create the third circle and locate its centre with dimensions."],
  swTopDimTitle: ["12. הגדירו במלואה את הסקיצה העליונה", "12. Fully define the top sketch"],
  swTopDimBody: ["השלימו מידות מרכז וקוטר עד שלא נשארות דרגות חופש.", "Complete the centre and diameter dimensions until no degrees of freedom remain."],
  swTopCutTitle: ["13. הגדירו Extrude cut עליון", "13. Define the top Extrude cut"],
  swFeatureFormTip: ["בדקו כל שדה בטופס לפני Apply — גם ערכי ברירת המחדל הם חלק מהגדרת התכונה.", "Review every field before Apply—even default values are part of the feature definition."],
  swFilletTitle: ["14. בדקו את שרשרת הבנייה", "14. Check the rebuild chain"],
  swFilletBody: ["פתחו History ובדקו את הסדר: Sketch בסיס → Extrude → שלוש זוגות של Bore sketch ו־Extrude Cut. Rebuild diagnostics צריך להיות ריק. אדום פירושו reference חסר ואין לסיים את המודל.", "Open History and verify the order: base Sketch → Extrude → three Bore sketch / Extrude Cut pairs. Rebuild diagnostics must be empty. Red means a missing reference and the model is not ready."],
  swFilletTip: ["Fillet דורש קצוות מדויקים מתוצאת ה־BREP; מוסיפים אותו רק לאחר Regenerate ובחירת קצוות אמיתיים.", "Fillet requires exact edges from the BREP result; add it only after Regenerate and selecting real edges."],
  swFinishTitle: ["קוביית ה־CAD מוכנה", "The CAD cube is complete"],
  swFinishBody: ["נוצר גוף פרמטרי תקין עם ארבע סקיצות מוגדרות במלואן, Extrude ושלושה חיתוכי Through all בשרשרת תלות רציפה וללא שגיאות rebuild.", "You now have a valid parametric body with four fully defined sketches, one Extrude, and three chained Through all cuts with no rebuild errors."],
  swFinishTip: ["כל פעולה מופיעה בעץ ובהיסטוריה וניתנת לביטול או לעריכה.", "Every operation remains available in the tree/history for undo or editing."],
  guideFlowerTrack: ["פרויקט: פרח", "Project: Flower"],
  guideFlowerTrackDesc: ["בניית פרח מכדורים ותיבות", "Build a flower from spheres and boxes"],
  guideAssemblyTrack: ["יסודות הרכבה", "Assembly basics"],
  guideAssemblyTrackDesc: ["רכיבים, טרנספורמציה ו־Mates", "Components, transforms, and mates"],
  guideScrewTrack: ["פרויקט: בורג", "Project: Screw"],
  guideScrewTrackDesc: ["בורג M8×30 תקני ובדיקת ISO", "Standards-compliant M8×30 screw and ISO audit"],
  guideGearTrack: ["פרויקט: גלגל שיניים", "Project: Gear"],
  guideGearTrackDesc: ["פרופיל אינוולוטי ובדיקת ISO", "Involute profile and ISO audit"],
  stdScrewCommand: ["בורג ISO 4017", "ISO 4017 screw"],
  stdGearCommand: ["גלגל שיניים ISO", "ISO gear"],
  standardAuditTitle: ["2. הריצו בדיקת DIN / ISO", "2. Run the DIN / ISO audit"],
  standardAuditBody: ["הבדיקה מודדת את הגאומטריה ומשווה אותה לפרופיל התקן המותקן. רק תוצאה ללא חריגות מאשרת המשך.", "The audit measures the geometry against the installed standard profile. Only a result with no deviations permits continuation."],
  guideStudBallTrack: ["פרויקט: כדור עם ניטים", "Project: Studded ball"],
  guideStudBallTrackDesc: ["כדור מרכזי וניטים כדוריים", "Sphere core with spherical studs"],
  guideDreidelTrack: ["פרויקט: סביבון", "Project: Dreidel"],
  guideDreidelTrackDesc: ["פרופיל וגוף סיבוב", "Profile and revolved body"],
  guideTracksBack: ["לכל המסלולים", "All learning paths"],
  guideModeTitle: ["איך תרצו ללמוד?", "How would you like to learn?"],
  guideModeBody: ["בחרו תרגול מודרך או הדגמה אוטומטית שבונה את המודל מולכם.", "Choose guided practice or an automatic demonstration that builds the model for you."],
  guideInteractiveMode: ["תרגול אינטראקטיבי", "Interactive practice"],
  guideInteractiveModeDesc: ["אתם מבצעים כל פעולה והמדריך בודק את ההתקדמות", "You perform each action and the guide checks your progress"],
  guideAutoMode: ["הדגמה אוטומטית", "Automatic demonstration"],
  guideAutoModeDesc: ["המדריך מבצע את העבודה ומציג את התהליך שלב אחר שלב", "The guide performs the work and shows the process step by step"],
  guideAutoWatching: ["הדגמה אוטומטית", "Automatic demonstration"],
  guideAutoBody: ["צפו בעבודה המתבצעת כעת בעורך. אין צורך לבצע פעולה.", "Watch the work being performed in the editor. No action is required."],
  guideAutoSlider: ["שלב בהדגמה", "Demo step"],
  guideAutoPause: ["השהיה", "Pause"],
  guideAutoResume: ["המשך הדגמה", "Resume demo"],
  guideKeepResult: ["שמרו את התוצאה", "Keep result"],
  guideKeepResultTip: ["השאירו את המודל שההדגמה בנתה במקום לשחזר את המודל שלכם", "Leave the demonstrated model in place instead of restoring your own"],
  guideDemoRestored: ["ההדגמה נוקתה · המודל שלכם חזר", "Demo cleared · your model is back"],
  guideDemoKept: ["המודל של ההדגמה נשמר בעורך", "The demonstrated model was kept in the editor"],
  flowerIntroTitle: ["נבנה פרח מצורות בסיסיות", "Build a flower from basic shapes"],
  flowerIntroBody: ["נעבוד במבט חזית ונרכיב ראש פרח מכדורים, גבעול ועציץ מתיבות. הצורות יתווספו למודל הפתוח וניתנות לביטול.", "Work in Front view to build a blossom from spheres, plus a stem and pot from boxes. Shapes are added to the open model and can be undone."],
  flowerIntroTip: ["מומלץ להתחיל במודל ריק, אך המדריך סופר רק את הצורות שתוסיפו בכל שלב.", "A blank model is recommended, but the guide counts only shapes added during each step."],
  flowerCenterTitle: ["1. צרו את מרכז הפרח", "1. Create the flower center"],
  flowerCenterBody: ["כלי הכדור פעיל. גררו במרכז החלק העליון של השרטוט כדי ליצור כדור קטן שיהיה לב הפרח.", "The Sphere tool is active. Drag near the upper center of the canvas to create a small sphere for the flower center."],
  flowerCenterTip: ["במבט חזית מיקום הכדור נקבע ישירות לפי X ו־Y.", "In Front view, the sphere position follows X and Y directly."],
  flowerPetalsTitle: ["2. הוסיפו ארבעה עלי כותרת", "2. Add four petals"],
  flowerPetalsBody: ["צרו ארבעה כדורים קטנים נוספים מסביב למרכז — למעלה, למטה ובשני הצדדים.", "Create four more small spheres around the center: above, below, left, and right."],
  flowerPetalsTip: ["אין צורך בדיוק מושלם; אחר כך תוכלו לבחור כל כדור ולגרור אותו למקום.", "Perfect placement is not required; you can select and drag each sphere afterward."],
  flowerStemTitle: ["3. צרו גבעול", "3. Create the stem"],
  flowerStemBody: ["כלי התיבה פעיל. גררו מלבן צר וגבוה מתחת לראש הפרח כדי ליצור גבעול.", "The Box tool is active. Drag a tall, narrow rectangle below the blossom to create the stem."],
  flowerStemTip: ["עומק האקסטרוד בלוח ההגדרות קובע את עובי התיבה בתלת־ממד.", "Extrude depth in Sketch settings controls the box thickness in 3D."],
  flowerPotTitle: ["4. הוסיפו עציץ", "4. Add a pot"],
  flowerPotBody: ["צרו תיבה רחבה ונמוכה בבסיס הגבעול. היא תשמש כעציץ פשוט.", "Create a short, wide box at the base of the stem for a simple flower pot."],
  flowerPotTip: ["בחרו את התיבה לאחר היצירה כדי לשנות מידות מדויקות בלוח צורה ומידות.", "Select the box afterward to enter exact dimensions in Shape & size."],
  flowerViewTitle: ["5. עברו לתצוגת מודל", "5. Switch to Model view"],
  flowerViewBody: ["לחצו על ״מודל״ כדי לראות את הפרח בתלת־ממד. גררו את התצוגה לסיבוב וגללו לזום.", "Choose Model to inspect the flower in 3D. Drag to orbit and scroll to zoom."],
  flowerViewTip: ["אפשר לחזור לשרטוט בכל רגע עם מקש 2 ולמודל עם מקש 3.", "Press 2 to return to Sketch and 3 for Model at any time."],
  flowerFinishTitle: ["הפרח הבסיסי מוכן", "Your basic flower is ready"],
  flowerFinishBody: ["הרכבתם מודל מורכב מכמה גופים בסיסיים. נסו כעת לצבוע את המרכז, עלי הכותרת, הגבעול והעציץ בחומרים שונים.", "You assembled a model from basic solids. Next, try assigning different colors and materials to the center, petals, stem, and pot."],
  flowerFinishTip: ["בחרו חלק ופתחו את לשונית ״חומר וגימור״ כדי להעניק לכל חלק צבע משלו.", "Select a part and open Material & finish to give each piece its own color."],
  assemblyIntroTitle: ["נכיר הרכבות ו־Mates", "Learn assemblies and mates"],
  assemblyIntroBody: ["הרכבה מחברת כמה מודלים כרכיבים עצמאיים. אם אין בהרכבה שני רכיבים, יתווספו שני רכיבי תרגול זמניים שאינם נשמרים בספרייה.", "An assembly combines independent model components. If fewer than two components exist, two temporary practice components are added without saving them to the library."],
  assemblyIntroTip: ["בפרויקט רגיל שומרים חלקים לספרייה ומוסיפים אותם דרך ״הוסף רכיב״.", "In a real project, save parts to the library and add them with Insert component."],
  assemblyPickTitle: ["1. בחרו רכיב", "1. Select a component"],
  assemblyPickBody: ["לחצו על אחד הרכיבים ברשימה. הרכיב הנבחר יוצג בלוח המאפיינים עם מיקום וסיבוב.", "Select a component from the list. Its position and rotation appear in the Properties panel."],
  assemblyPickTip: ["הרכיב הראשון מקובע כברירת מחדל ומשמש כעוגן של ההרכבה.", "The first component is grounded by default and anchors the assembly."],
  assemblyMoveTitle: ["2. הזיזו רכיב", "2. Move a component"],
  assemblyMoveBody: ["בחרו את הרכיב שאינו מקובע ושנו את ערך X, Y או Z בלוח המאפיינים.", "Select the ungrounded component and change its X, Y, or Z value in Properties."],
  assemblyMoveTip: ["רכיב מקובע אינו זז עד שמבטלים את האפשרות ״מקובע״ בלשונית החומר/נראות.", "A grounded component will not move until Grounded is cleared in the visibility panel."],
  assemblyPairTitle: ["3. בחרו שני רכיבים", "3. Select two components"],
  assemblyPairBody: ["בחרו רכיב אחד, החזיקו Ctrl/Cmd ולחצו על הרכיב השני.", "Select one component, then hold Ctrl/Cmd and select the other."],
  assemblyPairTip: ["סדר הבחירה חשוב: הרכיב הראשון הוא המקור והשני מותאם אליו.", "Selection order matters: the first component is the reference and the second follows it."],
  assemblyMateTitle: ["4. הוסיפו Mate של יישור X", "4. Add an Align X mate"],
  assemblyMateBody: ["לחצו על ״יישור X״. הרכיב השני יתיישר לאותו מיקום X של הרכיב הראשון והקשר יישמר בהרכבה.", "Choose Align X. The second component moves to the first component's X position and the relation remains in the assembly."],
  assemblyMateTip: ["אפשר להוסיף גם יישור Y/Z, מרחק, הצמדת פאות וצירים קונצנטריים.", "You can also add Y/Z alignment, distance, coincident faces, and concentric axes."],
  assemblySaveTitle: ["5. שמרו את ההרכבה", "5. Save the assembly"],
  assemblySaveBody: ["לחצו על ״שמור הרכבה״ כדי לשמור את הרכיבים, הטרנספורמציות וה־Mates יחד.", "Choose Save assembly to store the components, transforms, and mates together."],
  assemblySaveTip: ["שינוי עתידי ב־Mate יעדכן שוב את מיקום הרכיבים בזמן הבנייה.", "Future mate changes will reapply component positioning during rebuild."],
  assemblyFinishTitle: ["הרכבת התרגול מוכנה", "Practice assembly complete"],
  assemblyFinishBody: ["בחרתם רכיבים, הזזתם רכיב והגדרתם קשר ביניהם. אפשר להמשיך עם Mates נוספים או להוסיף מודלים מהספרייה.", "You selected components, moved one, and related them with a mate. Continue with more mates or add library models."],
  assemblyFinishTip: ["להרכבות יציבות: מקבעים רכיב בסיס אחד ומגדירים את שאר המיקומים באמצעות Mates.", "For stable assemblies, ground one base component and position the rest with mates."],
  screwIntroTitle: ["נבנה בורג מגופים בסיסיים", "Build a screw from basic solids"],
  screwIntroBody: ["ניצור בורג M8×30 עם ראש משושה מתוך מחולל ISO 4017:2022 ונאמת את מידותיו אוטומטית.", "Create an M8×30 hexagon-head screw from the ISO 4017:2022 generator and validate its dimensions automatically."],
  screwShaftTitle: ["1. צרו את גוף הבורג", "1. Create the screw shaft"],
  screwShaftBody: ["לחצו על ״בורג ISO 4017״. המחולל ייצור קוטר M8, פסיעה 1.25 מ״מ, אורך 30 מ״מ וראש משושה לפי חבילת המידות המותקנת.", "Choose ISO 4017 screw. The generator creates M8 diameter, 1.25 mm pitch, 30 mm length, and a hexagonal head from the installed dimensional pack."],
  screwHeadTitle: ["2. הוסיפו ראש", "2. Add the head"],
  screwHeadBody: ["צרו תיבה רחבה יותר סביב מרכז הגליל כדי לקבל ראש בורג.", "Create a wider box around the cylinder center for the screw head."],
  screwSlotTitle: ["3. סמנו חריץ בראש", "3. Mark a head slot"],
  screwSlotBody: ["צרו תיבה דקה וארוכה לרוחב הראש. צבע שונה יגרום לה להיקרא כחריץ.", "Create a long, thin box across the head. A contrasting color will make it read as a slot."],
  screwFinishTitle: ["הבורג הסכמטי מוכן", "Schematic screw complete"],
  gearIntroTitle: ["נבנה גלגל שיניים", "Build a gear"],
  gearIntroBody: ["ניצור גלגל שיניים אינוולוטי, מודול 2 מ״מ ו־20 שיניים, לפי ISO 53, ISO 54 ו־ISO 21771-1.", "Create a 20-tooth, module 2 mm involute gear following ISO 53, ISO 54, and ISO 21771-1."],
  gearBlankTitle: ["1. צרו דיסקה מרכזית", "1. Create the center blank"],
  gearBlankBody: ["לחצו על ״גלגל שיניים ISO״. המחולל יחשב את מעגל הפסיעה, מעגל הבסיס וכל נקודות פרופיל האינוולוטה.", "Choose ISO gear. The generator calculates the pitch circle, base circle, and every involute-profile sample."],
  gearTeethTitle: ["2. הוסיפו שש שיניים", "2. Add six teeth"],
  gearTeethBody: ["צרו לפחות שש תיבות קטנות מסביב להיקף הדיסקה. סובבו או מקמו אותן לפי הכיוון הרדיאלי.", "Create at least six small boxes around the disk perimeter. Position or rotate them radially."],
  gearFinishTitle: ["גלגל השיניים הבסיסי מוכן", "Basic gear complete"],
  studIntroTitle: ["נבנה כדור עם ניטים", "Build a studded ball"],
  studIntroBody: ["ניצור כדור מרכזי ונוסיף סביבו כדורים קטנים שישמשו כניטים.", "Create a central sphere and surround it with smaller spheres as studs."],
  studCoreTitle: ["1. צרו כדור מרכזי", "1. Create the core sphere"],
  studCoreBody: ["במבט חזית גררו כדור גדול במרכז השרטוט.", "In Front view, drag a large sphere at the center."],
  studAddTitle: ["2. הוסיפו שישה ניטים", "2. Add six studs"],
  studAddBody: ["צרו לפחות שישה כדורים קטנים סביב קו המתאר של הכדור המרכזי.", "Create at least six small spheres around the core outline."],
  studFinishTitle: ["הכדור עם הניטים מוכן", "Studded ball complete"],
  dreidelIntroTitle: ["נבנה סביבון באמצעות Revolve", "Build a dreidel with Revolve"],
  dreidelIntroBody: ["נצייר חצי־פרופיל שכולל ידית, גוף רחב וחוד, ונסובב אותו סביב הציר האנכי.", "Draw a half-profile containing a handle, wide body, and point, then revolve it around the vertical axis."],
  dreidelToolTitle: ["1. בחרו גוף סיבוב", "1. Choose Revolve"],
  dreidelToolBody: ["לחצו על כלי Revolve. העורך יעבור למבט חזית והציר הכחול יהיה ציר הסיבוב.", "Choose Revolve. The editor switches to Front view and the blue axis becomes the revolution axis."],
  dreidelProfileTitle: ["2. ציירו את חצי־הפרופיל", "2. Draw the half-profile"],
  dreidelProfileBody: ["התחילו ליד הציר: ידית צרה, כתף רחבה, גוף משופע וחוד. סגרו את הפרופיל בלחיצה כפולה או Enter.", "Start near the axis: narrow handle, wide shoulder, tapered body, and point. Finish with double-click or Enter."],
  dreidelFinishTitle: ["הסביבון מוכן", "Dreidel complete"],
  patternIntroTitle: ["נלמד מערך (Pattern) של גוף", "Pattern a solid"],
  patternIntroBody: ["מערך משכפל גוף קיים לרשת ליניארית או לטבעת מעגלית. הכלל היחיד שחייבים לזכור: קודם בוחרים גוף אחד, ורק אחר כך פותחים את Pattern — בלי בחירה הפקודה לא תיצור כלום.", "A pattern copies an existing solid into a linear grid or a circular ring. The one rule to remember: select a single solid first, then open Pattern — with nothing selected the command produces nothing."],
  patternSeedTitle: ["1. צרו גוף מקור", "1. Create the seed solid"],
  patternSeedBody: ["גררו תיבה קטנה במרכז השרטוט. זהו הגוף שממנו יבנה המערך.", "Drag a small box near the center. This is the solid the pattern will copy."],
  patternSelectTitle: ["2. בחרו את הגוף", "2. Select the solid"],
  patternSelectBody: ["לחצו על התיבה ברשימת החלקים (או בתצוגה) עד שהיא מסומנת. Pattern פועל על גוף אחד נבחר בלבד.", "Click the box in the parts list (or in the viewport) until it is highlighted. Pattern works on exactly one selected solid."],
  patternOpenTitle: ["3. פתחו את Pattern", "3. Open Pattern"],
  patternOpenBody: ["בלשונית Features לחצו על Pattern. ייפתח טופס עם תצוגה מקדימה חיה של העותקים.", "In the Features tab choose Pattern. A form opens with a live preview of the copies."],
  patternLinearTitle: ["4. מערך ליניארי", "4. Linear pattern"],
  patternLinearBody: ["השאירו Pattern type על Linear, סמנו Enable X axis, קבעו X instances ל‑4 ו‑X spacing למרווח שגדול מרוחב התיבה, ולחצו Apply. מרווח קטן מהגוף גורם לעותקים לחפוף — זו הסיבה הנפוצה ל״לא קרה כלום״.", "Leave Pattern type on Linear, tick Enable X axis, set X instances to 4 and X spacing larger than the box width, then Apply. A spacing smaller than the solid makes the copies overlap — the usual reason it looks like nothing happened."],
  patternCircularTitle: ["5. מערך מעגלי", "5. Circular pattern"],
  patternCircularBody: ["בחרו שוב גוף, פתחו Pattern, החליפו Pattern type ל‑Circular, קבעו Circular instances ל‑6, Circular extent 360° וציר Y, ולחצו Apply. הסיבוב הוא סביב ציר המודל — גוף שיושב על הציר יסתובב בתוך עצמו.", "Select a solid again, open Pattern, switch Pattern type to Circular, set Circular instances to 6, extent 360° and axis Y, then Apply. The ring turns about the model axis — a solid sitting on that axis spins inside itself."],
  patternFinishTitle: ["המערך מוכן", "Pattern complete"],
  guidePatternTrack: ["פרויקט: מערך ליניארי ומעגלי", "Project: Linear & circular pattern"],
  guidePatternTrackDesc: ["שכפול גוף לרשת ולטבעת", "Copy a solid into a grid and a ring"],
  projectModelTip: ["עברו למודל כדי לבדוק את התוצאה בתלת־ממד, ואז צבעו כל חלק מלשונית חומר וגימור.", "Switch to Model to inspect the result in 3D, then color parts in Material & finish."],
  projectViewTitle: ["בדקו את התוצאה בתלת־ממד", "Inspect the result in 3D"],
  projectViewBody: ["לחצו על ״מודל״, סובבו את התצוגה ובדקו כיצד הגופים מתחברים.", "Choose Model, orbit the view, and inspect how the solids fit together."],
};
function t(k) {
  return TXT[k] ? TXT[k][getLang() === "en" ? 1 : 0] : k;
}

/* ================= library persistence + FURN registration ================= */
function loadLib() {
  return cloneData(modelLibraryCache);
}
async function initializeModelLibrary() {
  var legacy=[];
  try {
    var stored=JSON.parse(localStorage.getItem(LS_MODELS)) || [];
    if (Array.isArray(stored) && stored.some(function(model){return Array.isArray(model.parts);})) legacy=stored;
  } catch(e) {}
  try { modelLibraryCache=await loadModelLibrary(legacy); }
  catch(e) { modelLibraryCache=legacy; }
  writeLibraryIndex(modelLibraryCache);
}
function writeLibraryIndex(lib) {
  try {
    localStorage.setItem(LS_MODELS, JSON.stringify(lib.map(function(model){return {
      key:model.key,name:model.name,w:model.w,d:model.d,h:model.h,partCount:(model.parts || []).length,updatedAt:Date.now()
    };})));
    return true;
  } catch (e) { return false; }
}
async function saveLib(lib) {
  try {
    await saveModelLibrary(lib);
    modelLibraryCache=cloneData(lib);
    writeLibraryIndex(lib);
    return true;
  } catch (e) { return false; }
}

function loadAssemblies() {
  try {
    var list = JSON.parse(localStorage.getItem(LS_ASSEMBLIES)) || [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}
function saveAssemblies(list) {
  try { localStorage.setItem(LS_ASSEMBLIES, JSON.stringify(list)); } catch (e) {}
}
function newAssembly() {
  return {
    key: "asm_" + Date.now().toString(36),
    name: t("newAssembly"),
    components: [],
    mates: [],
  };
}
function cloneData(value) {
  if(value == null)return value;
  return typeof structuredClone==="function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
function componentDef(component) {
  if (!component) return null;
  if (component.def && Array.isArray(component.def.parts)) return component.def;
  var lib = loadLib();
  for (var i = 0; i < lib.length; i++) if (lib[i].key === component.modelKey) return lib[i];
  var f = FURN[component.modelKey];
  return f && f.custom && Array.isArray(f.custom.parts) ? f.custom : null;
}
function normalizeTransform(component) {
  if (!component.transform) component.transform = {};
  ["x", "y", "z", "rx", "ry", "rz"].forEach(function (k) {
    if (!fin(component.transform[k])) component.transform[k] = 0;
  });
  return component.transform;
}
function applyAssemblyMates(assembly) {
  if (!assembly) return;
  (Array.isArray(assembly.mates) ? assembly.mates : []).forEach(function (mate) {
    var a = assembly.components.find(function (c) { return c.id === mate.a; });
    var b = assembly.components.find(function (c) { return c.id === mate.b; });
    if (!a || !b || b.grounded) return;
    var at = normalizeTransform(a), bt = normalizeTransform(b);
    if (mate.type === "alignX") bt.x = at.x;
    else if (mate.type === "alignY") bt.y = at.y;
    else if (mate.type === "alignZ") bt.z = at.z;
    else if (mate.type === "distanceX") bt.x = at.x + (fin(mate.value) ? mate.value : 0);
  });
  solveTopologyMates(assembly);
}

// bbox over all parts
function basePartBounds(p) {
  if ((p.kind === "direct" || p.kind === "mesh") && p.bounds) return { ...p.bounds };
  if ((p.kind === "direct" || p.kind === "mesh") && p.meshData) {
    var mp=p.meshData.positions || [], mb={x0:Infinity,x1:-Infinity,y0:Infinity,y1:-Infinity,z0:Infinity,z1:-Infinity};
    for (var mbi=0;mbi+2<mp.length;mbi+=3) {
      mb.x0=Math.min(mb.x0,mp[mbi]);mb.x1=Math.max(mb.x1,mp[mbi]);
      mb.y0=Math.min(mb.y0,mp[mbi+1]);mb.y1=Math.max(mb.y1,mp[mbi+1]);
      mb.z0=Math.min(mb.z0,mp[mbi+2]);mb.z1=Math.max(mb.z1,mp[mbi+2]);
    }
    if (isFinite(mb.x0)) return mb;
  }
  if (p.kind === "box") return { x0: Math.min(p.x0, p.x1), x1: Math.max(p.x0, p.x1), y0: Math.min(p.y0, p.y1), y1: Math.max(p.y0, p.y1), z0: Math.min(p.z0, p.z1), z1: Math.max(p.z0, p.z1) };
  if (p.kind === "cyl") { var R = Math.max(p.r, p.r2 != null ? p.r2 : p.r); return { x0: p.x - R, x1: p.x + R, y0: p.y, y1: p.y + p.h, z0: p.z - R, z1: p.z + R }; }
  if (p.kind === "sph") return { x0: p.x - p.r, x1: p.x + p.r, y0: p.y - p.r, y1: p.y + p.r, z0: p.z - p.r, z1: p.z + p.r };
  if (p.kind === "rev") {
    var RR = 0, ry0 = 1e9, ry1 = -1e9;
    p.pts.forEach(function (q) { RR = Math.max(RR, Math.abs(q.u)); ry0 = Math.min(ry0, q.v); ry1 = Math.max(ry1, q.v); });
    return { x0: p.x - RR, x1: p.x + RR, y0: ry0, y1: ry1, z0: p.z - RR, z1: p.z + RR };
  }
  if (p.kind === "loft") {
    var lu0 = 1e9, lu1 = -1e9, lv0 = 1e9, lv1 = -1e9;
    (p.pts0 || []).concat(p.pts1 || []).forEach(function (q) { lu0 = Math.min(lu0, q.u); lu1 = Math.max(lu1, q.u); lv0 = Math.min(lv0, q.v); lv1 = Math.max(lv1, q.v); });
    var llo = Math.min(p.from, p.to), lhi = Math.max(p.from, p.to);
    if (p.axis === "y") return { x0: lu0, x1: lu1, z0: lv0, z1: lv1, y0: llo, y1: lhi };
    if (p.axis === "z") return { x0: lu0, x1: lu1, y0: lv0, y1: lv1, z0: llo, z1: lhi };
    return { z0: lu0, z1: lu1, y0: lv0, y1: lv1, x0: llo, x1: lhi };
  }
  // ext
  if (p.frame) {
    var framed=(p.pts || []).flatMap(function(q){return [framePoint(p.frame,q.u,q.v,p.from),framePoint(p.frame,q.u,q.v,p.to)];});
    if (framed.length) return {
      x0:Math.min.apply(null,framed.map(function(q){return q.x;})),x1:Math.max.apply(null,framed.map(function(q){return q.x;})),
      y0:Math.min.apply(null,framed.map(function(q){return q.y;})),y1:Math.max.apply(null,framed.map(function(q){return q.y;})),
      z0:Math.min.apply(null,framed.map(function(q){return q.z;})),z1:Math.max.apply(null,framed.map(function(q){return q.z;})),
    };
  }
  var u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  p.pts.forEach(function (q) { u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); v0 = Math.min(v0, q.v); v1 = Math.max(v1, q.v); });
  var lo = Math.min(p.from, p.to), hi = Math.max(p.from, p.to);
  if (p.axis === "y") return { x0: u0, x1: u1, z0: v0, z1: v1, y0: lo, y1: hi };
  if (p.axis === "z") return { x0: u0, x1: u1, y0: v0, y1: v1, z0: lo, z1: hi };
  return { z0: u0, z1: u1, y0: v0, y1: v1, x0: lo, x1: hi };
}
function partBounds(p) {
  return rotatedPatternBounds(basePartBounds(p), partPatternRotations(p));
}
/* Compatibility render projection.  In parametric-v1 documents `features` and
   `history` are authoritative; parts are disposable preview records consumed by
   the existing Three.js scene.  Legacy documents still honour their rollback
   index here until migration converts them to canonical history. */
export function activeParts(def) {
  if (!def || !Array.isArray(def.parts)) return [];
  var upto = fin(def.rollback) && def.rollback >= 0 ? Math.min(def.rollback, def.parts.length) : def.parts.length;
  return def.parts.slice(0, upto).filter(function (p) { return p && !p.suppressed; });
}

// Command previews live outside the document so saving, rebuilding and undo
// never mistake transient geometry for design intent.  Every visual surface
// consumes this projection helper, which keeps 2D, 3D and drawing views in sync.
function renderedParts(def) {
  var parts=activeParts(def);
  if(def===E.def && E.authoring && Array.isArray(E.authoring.previewParts)){
    /* A finish preview is a temporary replacement for its source body, not a
       second coincident body.  Drawing both made the exact fillet flicker and
       left the old sharp edge visible through the result. */
    if(E.authoring.previewReplacesPartId)parts=parts.filter(function(part){return part.id!==E.authoring.previewReplacesPartId;});
    parts=parts.concat(E.authoring.previewParts);
  }
  return parts;
}

/* Add one derived preview part.  Canonical feature creation happens before this
   adapter is called; this function never records design intent. */
function addPart(part) {
  part.id = part.id || uid();
  part.featureId = part.featureId || "feature:part:" + part.id;
  if (fin(E.def.rollback) && E.def.rollback < E.def.parts.length) {
    E.def.parts.splice(E.def.rollback, 0, part);
    E.def.rollback++;
  } else E.def.parts.push(part);
  return part;
}

function resetClonedPartIdentity(part) {
  var oldPartId = part.id, oldFeatureId = part.featureId || (oldPartId && "feature:part:" + oldPartId);
  part.id = uid();
  part.featureId = "feature:part:" + part.id;
  var remap = function (value) {
    return typeof value === "string" && oldFeatureId && value.indexOf(oldFeatureId) === 0
      ? part.featureId + value.slice(oldFeatureId.length)
      : value;
  };
  (part.exactFilletTargets || []).forEach(function (reference) {
    reference.ownerFeatureId = remap(reference.ownerFeatureId);
    reference.persistentId = remap(reference.persistentId);
  });
  part.exactFilletEdges = (part.exactFilletEdges || []).map(remap);
  (part.exactOperations || []).forEach(function (operation) {
    operation.id = remap(operation.id) || part.featureId + ":" + operation.type + ":" + uid();
    (operation.targets || []).forEach(function (reference) {
      reference.ownerFeatureId = remap(reference.ownerFeatureId);
      reference.persistentId = remap(reference.persistentId);
    });
  });
  if (part.meshData && Array.isArray(part.meshData.topology)) {
    part.meshData.topology.forEach(function (entry) {
      entry.ownerFeatureId = remap(entry.ownerFeatureId);
      entry.persistentId = remap(entry.persistentId);
    });
    (part.meshData.faceRanges || []).forEach(function (entry) { entry.persistentId = remap(entry.persistentId); });
  }
  delete part.exactBuildToken;
  part.exactPending = false;
  return part;
}

function defBounds(def) {
  var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
  renderedParts(def).forEach(function (p) {
    var q = partBounds(p);
    b.x0 = Math.min(b.x0, q.x0); b.x1 = Math.max(b.x1, q.x1);
    b.y0 = Math.min(b.y0, q.y0); b.y1 = Math.max(b.y1, q.y1);
    b.z0 = Math.min(b.z0, q.z0); b.z1 = Math.max(b.z1, q.z1);
  });
  if (b.x1 < b.x0) b = { x0: -30, x1: 30, y0: 0, y1: 60, z0: -30, z1: 30 };
  return b;
}
function translateDescriptor(descriptor,dx,dy,dz) {
  if (!descriptor || typeof descriptor!=="object") return;
  [descriptor.origin,descriptor.center].forEach(function(point){if(point){point.x+=dx;point.y+=dy;point.z+=dz;}});
  (descriptor.endpoints || []).forEach(function(point){point.x+=dx;point.y+=dy;point.z+=dz;});
  if (descriptor.bounds) [descriptor.bounds.min,descriptor.bounds.max].forEach(function(point){if(point){point.x+=dx;point.y+=dy;point.z+=dz;}});
}
function translateTopologyReferences(value,dx,dy,dz) {
  if (!value || typeof value!=="object") return;
  if (value.type==="topology-reference") {translateDescriptor(value.descriptor,dx,dy,dz);return;}
  if (Array.isArray(value)) value.forEach(function(item){translateTopologyReferences(item,dx,dy,dz);});
  else Object.keys(value).forEach(function(key){translateTopologyReferences(value[key],dx,dy,dz);});
}
function movePart(p, dx, dy, dz) {
  if (p.kind === "box") { p.x0 += dx; p.x1 += dx; p.y0 += dy; p.y1 += dy; p.z0 += dz; p.z1 += dz; }
  else if (p.kind === "cyl" || p.kind === "sph") { p.x += dx; p.y += dy; p.z += dz; }
  else if (p.kind === "rev") {
    p.x += dx; p.z += dz;
    p.pts.forEach(function (q) { q.v += dy; }); // profile v is absolute height
  }
  else if (p.kind === "loft") {
    var lu, lv, lw;
    if (p.axis === "y") { lu = dx; lv = dz; lw = dy; }
    else if (p.axis === "z") { lu = dx; lv = dy; lw = dz; }
    else { lu = dz; lv = dy; lw = dx; }
    [p.pts0, p.pts1].forEach(function (lp) { lp.forEach(function (q) { q.u += lu; q.v += lv; }); });
    p.from += lw; p.to += lw;
  }
  else if (p.kind === "direct" || p.kind === "mesh") {
    if (p.bounds) {p.bounds.x0+=dx;p.bounds.x1+=dx;p.bounds.y0+=dy;p.bounds.y1+=dy;p.bounds.z0+=dz;p.bounds.z1+=dz;}
  }
  else if (p.frame) {
    p.frame.origin.x += dx; p.frame.origin.y += dy; p.frame.origin.z += dz;
  }
  else {
    var du, dv, dw;
    if (p.axis === "y") { du = dx; dv = dz; dw = dy; }
    else if (p.axis === "z") { du = dx; dv = dy; dw = dz; }
    else { du = dz; dv = dy; dw = dx; }
    [p.pts].concat(p.holes || []).forEach(function (lp) {
      lp.forEach(function (q) { q.u += du; q.v += dv; });
    });
    (p.cuts3d || []).forEach(function (cut) {
      if (cut.frame) return;
      var cu = cut.axis === "y" || cut.axis === "z" ? dx : dz;
      var cv = cut.axis === "y" ? dz : dy;
      (cut.loop || []).forEach(function (q) { q.u += cu; q.v += cv; });
    });
    if (p.sketch && p.sketch.kind === "wall" && p.axis === "y") {
      p.sketch.a.u += du; p.sketch.a.v += dv;
      p.sketch.b.u += du; p.sketch.b.v += dv;
    }
    p.from += dw; p.to += dw;
  }
  (p.cuts3d || []).forEach(function (cut) {
    if (!cut.frame || !cut.frame.origin) return;
    cut.frame.origin.x += dx; cut.frame.origin.y += dy; cut.frame.origin.z += dz;
  });
  if (p.meshData && Array.isArray(p.meshData.positions)) {
    for (var mi=0;mi<p.meshData.positions.length;mi+=3) {
      p.meshData.positions[mi]+=dx;
      p.meshData.positions[mi+1]+=dy;
      p.meshData.positions[mi+2]+=dz;
    }
    clearMeshProjectionCache(p.meshData);
    (p.meshData.topology || []).forEach(function (entry) {
      var descriptor = entry && entry.descriptor;
      if (!descriptor) return;
      [descriptor.origin, descriptor.center].forEach(function (point) {
        if (!point) return;
        point.x += dx; point.y += dy; point.z += dz;
      });
      (descriptor.endpoints || []).forEach(function (point) { point.x += dx; point.y += dy; point.z += dz; });
      if (descriptor.bounds) {
        [descriptor.bounds.min, descriptor.bounds.max].forEach(function (point) {
          if (!point) return;
          point.x += dx; point.y += dy; point.z += dz;
        });
      }
    });
  }
}

// Center model in x/z, rest on floor, and compute catalog dims.
function normalizeDef(def) {
  var b = defBounds(def);
  var cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, fy = b.y0;
  var dx=-cx,dy=-fy,dz=-cz;
  def.parts.forEach(function (p) { movePart(p, dx, dy, dz); });
  (Array.isArray(def.sketches) ? def.sketches : def.sketch ? [def.sketch] : []).forEach(function(sketch){
    if (sketch.frameSpace==="local" && sketch.frame && sketch.frame.origin) {
      sketch.frame.origin.x+=dx;sketch.frame.origin.y+=dy;sketch.frame.origin.z+=dz;
    } else {
      var du=sketch.plane==="side" ? dz : dx, dv=sketch.plane==="top" ? dz : dy;
      (sketch.points || []).forEach(function(point){point.x+=du;point.y+=dv;});
      if (sketch.plane==="top") sketch.offset=(Number(sketch.offset)||0)+dy;
      else if (sketch.plane==="front") sketch.offset=(Number(sketch.offset)||0)+dz;
      else sketch.offset=(Number(sketch.offset)||0)+dx;
    }
  });
  (def.references || []).forEach(function(reference){
    if (!reference || ["origin","plane:top","plane:front","plane:right","axis:x","axis:y","axis:z"].includes(reference.id) || !reference.origin) return;
    reference.origin.x+=dx;reference.origin.y+=dy;reference.origin.z+=dz;
  });
  translateTopologyReferences({sketches:def.sketches,parts:def.parts,features:def.features},dx,dy,dz);
  b = defBounds(def);
  def.w = Math.max(10, Math.round(b.x1 - b.x0));
  def.d = Math.max(10, Math.round(b.z1 - b.z0));
  def.h = Math.max(5, Math.round(b.y1 - b.y0));
  if ((def.parts || []).some(function(part){return !!part.parametricEnvelope;}) && def.parameters) {
    if (def.parameters.width && typeof def.parameters.width==="object") def.parameters.width.value=b.x1-b.x0;
    if (def.parameters.depth && typeof def.parameters.depth==="object") def.parameters.depth.value=b.z1-b.z0;
    if (def.parameters.height && typeof def.parameters.height==="object") def.parameters.height.value=b.y1-b.y0;
  }
}

function hexNum(s) { return parseInt(String(s || "#999999").replace("#", ""), 16); }

// texture cache for custom-part image textures (shared with primitives' box() via opt.tex)
function applyTexTo(mesh, p, wCm, hCm) {
  if (!mesh || !p.tex) return;
  if (!S.customTexCache) S.customTexCache = {};
  if (!S.customTexCache[p.tex]) {
    var loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    var tl = loader.load(p.tex, function () {
      S.dirty3D = true;
      S.repaint3D = true;
      updatePreview();
    });
    tl.wrapS = tl.wrapT = THREE.RepeatWrapping;
    S.customTexCache[p.tex] = tl;
  }
  // Cloning before the bitmap lands yields a version>0 texture with a null
  // image, which throws inside the renderer's texture upload; the loader
  // callback above re-runs this once the image is decoded.
  if (!S.customTexCache[p.tex].image) return;
  var tex = S.customTexCache[p.tex].clone();
  tex.repeat.set((wCm || 100) / 100, (hCm || 100) / 100);
  mesh.material.map = tex;
  mesh.material.color.setHex(0xffffff);
  mesh.material.needsUpdate = true;
}

/* Shade a tessellated curve as a curve.
   `computeVertexNormals` on unindexed triangles gives every facet its own flat
   normal, so a cylinder lights up as a ring of flat staves no matter how finely
   it is divided — subdividing further only makes narrower staves. Averaging the
   normals of neighbouring facets that meet within `limit` rounds the shading
   off, while anything sharper keeps its own normal, so a box still has crisp
   corners and the rim where a wall meets its cap stays a hard edge. */
function smoothTessellationNormals(geometry, limit) {
  var position = geometry.getAttribute("position");
  if (!position || geometry.getIndex()) return geometry;
  var triangles = Math.floor(position.count / 3);
  if (triangles < 2) return geometry;
  var faces = new Float32Array(triangles * 3);
  var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (var f = 0; f < triangles; f++) {
    a.fromBufferAttribute(position, f * 3); b.fromBufferAttribute(position, f * 3 + 1); c.fromBufferAttribute(position, f * 3 + 2);
    n.crossVectors(b.sub(a), c.sub(a));
    if (n.lengthSq() > 1e-20) n.normalize();
    faces[f * 3] = n.x; faces[f * 3 + 1] = n.y; faces[f * 3 + 2] = n.z;
  }
  // Vertices that share a corner share a smoothing decision; quantising the key
  // is safe because the extruder emits the very same profile point each time.
  var shared = new Map();
  for (var v = 0; v < triangles * 3; v++) {
    var key = Math.round(position.getX(v) * 1e4) + "," + Math.round(position.getY(v) * 1e4) + "," + Math.round(position.getZ(v) * 1e4);
    if (!shared.has(key)) shared.set(key, []);
    shared.get(key).push(v);
  }
  var cutoff = Math.cos(limit == null ? Math.PI / 4.5 : limit), normals = new Float32Array(triangles * 3 * 3);
  shared.forEach(function (group) {
    group.forEach(function (vertex) {
      var own = Math.floor(vertex / 3) * 3, x = 0, y = 0, z = 0;
      group.forEach(function (other) {
        var face = Math.floor(other / 3) * 3;
        if (faces[own] * faces[face] + faces[own + 1] * faces[face + 1] + faces[own + 2] * faces[face + 2] < cutoff) return;
        x += faces[face]; y += faces[face + 1]; z += faces[face + 2];
      });
      var size = Math.hypot(x, y, z) || 1;
      normals[vertex * 3] = x / size; normals[vertex * 3 + 1] = y / size; normals[vertex * 3 + 2] = z / size;
    });
  });
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return geometry;
}

function buildExactMesh(parent, p) {
  if (!p.meshData || !Array.isArray(p.meshData.positions) || p.meshData.positions.length < 9) return null;
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(p.meshData.positions, 3));
  geometry.computeVertexNormals();
  smoothTessellationNormals(geometry);
  geometry.computeBoundingSphere();
  var material = new THREE.MeshStandardMaterial({
    color: hexNum(p.color),
    metalness: fin(p.metal) ? p.metal : 0.08,
    roughness: fin(p.rough) ? p.rough : 0.8,
    transparent: fin(p.opacity) && p.opacity < 1,
    opacity: fin(p.opacity) ? p.opacity : 1,
    side: THREE.DoubleSide,
  });
  var mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function topologyEntriesForPart(part) {
  if (!part) return [];
  if (part.meshData && Array.isArray(part.meshData.topology)) return part.meshData.topology;
  var featureId = part.featureId || "feature:part:" + part.id;
  var sources = [];
  if (E.brepRun && Array.isArray(E.brepRun.topology)) sources = sources.concat(E.brepRun.topology);
  if (E.coreRun && Array.isArray(E.coreRun.topology)) sources = sources.concat(E.coreRun.topology);
  var seen = new Set();
  var entries = sources.filter(function (entry) {
    if (!entry || entry.ownerFeatureId !== featureId || seen.has(entry.persistentId)) return false;
    seen.add(entry.persistentId);
    return true;
  });
  var analytic=[];
  if (part.kind === "box") analytic=topologyForFeature({id:featureId,type:"box"}, {x0:part.x0,x1:part.x1,y0:part.y0,y1:part.y1,z0:part.z0,z1:part.z1});
  else if (part.kind === "cyl") analytic=topologyForFeature({id:featureId,type:"cylinder"}, {x:part.x,y:part.y,z:part.z,r:part.r,h:part.h});
  else if (part.kind === "ext") analytic=topologyForFeature({id:featureId,type:"extrude"}, {axis:part.axis,frame:part.frame,from:part.from,to:part.to,points:part.pts,profileEntityIds:part.profileEntityIds});
  var currentIds=new Set(analytic.map(function(entry){return entry.persistentId;}));
  return analytic.concat(entries.filter(function(entry){return !currentIds.has(entry.persistentId);}));
}

function edgePoints(descriptor) {
  if (!descriptor) return [];
  // Two points for a straight edge, a whole run of them for a merged arc.
  if (Array.isArray(descriptor.endpoints) && descriptor.endpoints.length >= 2) return descriptor.endpoints;
  var origin = descriptor.origin, axis = descriptor.axis, length = Number(descriptor.measure);
  if (descriptor.curve === "line" && origin && axis && fin(length)) {
    var size = Math.hypot(axis.x, axis.y, axis.z) || 1, half = length / (2 * size);
    return [
      {x:origin.x-axis.x*half,y:origin.y-axis.y*half,z:origin.z-axis.z*half},
      {x:origin.x+axis.x*half,y:origin.y+axis.y*half,z:origin.z+axis.z*half},
    ];
  }
  if (descriptor.curve === "circle" && origin && axis && fin(Number(descriptor.radius))) {
    var n = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
    var seed = Math.abs(n.y) < .9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
    var u = new THREE.Vector3().crossVectors(n,seed).normalize(), v = new THREE.Vector3().crossVectors(n,u).normalize();
    var points = [], steps = curveSegments(descriptor.radius, Math.PI*2, 24, 128);
    for (var i=0;i<=steps;i++) {
      var angle = i*Math.PI*2/steps;
      points.push({x:origin.x+(u.x*Math.cos(angle)+v.x*Math.sin(angle))*descriptor.radius,y:origin.y+(u.y*Math.cos(angle)+v.y*Math.sin(angle))*descriptor.radius,z:origin.z+(u.z*Math.cos(angle)+v.z*Math.sin(angle))*descriptor.radius});
    }
    return points;
  }
  return [];
}

function topologySelected(persistentId) {
  return (E.topologySelection || []).some(function (ref) { return ref.persistentId === persistentId; });
}
function topologyHovered(persistentId) {
  return !!(E.hoverTopology && E.hoverTopology.persistentId === persistentId);
}

/* Every visible edge of every part is a pick target. Edges used to be drawn
   only for the already-selected part, so chamfering one rib meant clicking the
   body first and guessing that edges had appeared. Keep depth testing enabled:
   drawing hidden underside/internal topology through an opaque body makes a
   correct imported solid look like it contains stray wireframe boxes. */
function addTopologyPickEdges(parent, part) {
  if (!part || E.docType !== "part") return;
  topologyEntriesForPart(part).filter(function (entry) { return entry.kind === "edge"; }).forEach(function (entry) {
    var points = edgePoints(entry.descriptor);
    if (points.length < 2) return;
    var geometry = new THREE.BufferGeometry().setFromPoints(points.map(function (p) { return new THREE.Vector3(p.x,p.y,p.z); }));
    var selected = topologySelected(entry.persistentId), hovered = topologyHovered(entry.persistentId);
    var material = new THREE.LineBasicMaterial({
      // unselected edges read as ordinary model edges, the way a CAD viewport
      // draws them — visible enough to aim at, quiet enough to ignore
      color: selected ? 0xffa21a : hovered ? 0x53c1ff : 0x35506b,
      transparent: true,
      opacity: selected ? .95 : hovered ? .95 : part === E.sel ? .55 : .35,
      depthTest: true,
      depthWrite: false,
    });
    var line = new THREE.Line(geometry,material);
    line.renderOrder = 20;
    line.userData.cadPart = part.id;
    line.userData.cadFeatureId = entry.ownerFeatureId;
    line.userData.cadTopology = entry;
    parent.add(line);

    /* WebGL ignores LineBasicMaterial.linewidth on most machines, which left
       both hover and selection as a one-pixel hairline.  A small unpickable
       tube gives the feedback a stable screen presence while the original
       line remains the generous raycast target. */
    if (selected || hovered) {
      var vectors=points.map(function(point){return new THREE.Vector3(point.x,point.y,point.z);});
      var closed=entry.descriptor && entry.descriptor.curve==="circle";
      var path=vectors.length===2 ? new THREE.LineCurve3(vectors[0],vectors[1]) : new THREE.CatmullRomCurve3(vectors,closed,"centripetal");
      var bounds=partBounds(part),span=Math.max(bounds.x1-bounds.x0,bounds.y1-bounds.y0,bounds.z1-bounds.z0,1);
      var glow=new THREE.Mesh(
        new THREE.TubeGeometry(path,Math.max(8,vectors.length*2),Math.max(selected ? .32 : .2,span*(selected ? .0045 : .003)),6,closed),
        new THREE.MeshBasicMaterial({color:selected?0xff7a00:0x35bfff,transparent:true,opacity:selected ? .92 : .72,depthTest:true,depthWrite:false})
      );
      glow.renderOrder=24;
      glow.raycast=function(){};
      parent.add(glow);
    }
  });
}

/* A selected face has to LOOK selected. The picker resolved a face reference
   long before this existed, but nothing on screen changed, so the honest
   reading was "face selection does not work". Rather than depend on the exact
   kernel's triangle ranges — analytic boxes and cylinders have none — collect
   whichever triangles of the built mesh lie in the face's own plane and face
   the same way. That works for every part kind the editor can build. */
function faceHighlightMesh(mesh, descriptor, color, opacity) {
  if (!mesh || !mesh.geometry || !descriptor) return null;
  /* A cylindrical wall has no single plane to test against — it is one face
     whose normal turns all the way round. Match it on the axis instead: a
     facet belongs to the wall when it stands parallel to the axis at the
     right distance from it. Highlighting the plane through one facet would
     light a single stave of a face the user picked whole. */
  var round = descriptor.surface === "cylinder" && descriptor.axis && fin(Number(descriptor.radius));
  var normal = descriptor.normal, origin = descriptor.origin || descriptor.center;
  if ((!normal && !round) || !origin) return null;
  var position = mesh.geometry.getAttribute("position");
  if (!position) return null;
  var index = mesh.geometry.getIndex();
  var count = index ? index.count : position.count;
  var n = normal ? new THREE.Vector3(normal.x, normal.y, normal.z).normalize() : new THREE.Vector3(0, 1, 0);
  var axis = round ? new THREE.Vector3(descriptor.axis.x, descriptor.axis.y, descriptor.axis.z).normalize() : null;
  var centre = new THREE.Vector3(origin.x, origin.y, origin.z);
  var radius = round ? Math.abs(Number(descriptor.radius)) : 0;
  var band = Math.max(.35, radius * .05);
  mesh.updateMatrixWorld(true);   // built this frame; its matrix is not current yet
  var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  var ab = new THREE.Vector3(), ac = new THREE.Vector3(), tn = new THREE.Vector3(), radial = new THREE.Vector3();
  var kept = [];
  for (var i = 0; i + 2 < count; i += 3) {
    var ia = index ? index.getX(i) : i, ib = index ? index.getX(i+1) : i+1, ic = index ? index.getX(i+2) : i+2;
    a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
    tn.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    if (tn.lengthSq() < 1e-12) continue;
    tn.normalize();   // already world space — the corners were transformed above
    if (round) {
      if (Math.abs(tn.dot(axis)) > .25) continue;               // caps face along the axis, walls across it
      radial.subVectors(a, centre);
      radial.addScaledVector(axis, -radial.dot(axis));           // drop the along-axis part
      if (Math.abs(radial.length() - radius) > band) continue;   // a bore inside the same body is not this wall
      n.copy(tn);                                                // lift each facet along its own outward normal
    } else {
      /* Geometry winding is not guaranteed to agree with the analytic face
         normal (especially on extrusions).  Plane distance already rejects
         the opposite side, so orientation must be compared unsigned. */
      if (Math.abs(tn.dot(n)) < .96) continue;
      // and in the same plane, not just parallel to it — the far side of a box
      // is parallel to the near one
      var offset = (a.x-origin.x)*n.x + (a.y-origin.y)*n.y + (a.z-origin.z)*n.z;
      if (Math.abs(offset) > .35) continue;
    }
    /* Lift the overlay a hair off the surface it copies. Coincident triangles
       z-fight no matter what the render order says, and polygon offset alone is
       not reliable across backends — the highlight has to be visible or the
       selection is invisible again. */
    var lift = .06;
    kept.push(
      a.x+n.x*lift, a.y+n.y*lift, a.z+n.z*lift,
      b.x+n.x*lift, b.y+n.y*lift, b.z+n.z*lift,
      c.x+n.x*lift, c.y+n.y*lift, c.z+n.z*lift
    );
  }
  if (!kept.length) return null;
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(kept, 3));
  geometry.computeVertexNormals();
  var highlight = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: color, transparent: true, opacity: opacity, side: THREE.DoubleSide,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  highlight.renderOrder = 18;
  /* The overlay is feedback, never geometry.  Letting it participate in the
     raycast made the highlighted face become unclickable on the next click. */
  highlight.raycast=function(){};
  return highlight;
}
function addFaceHighlights(parent, part, mesh) {
  if (!part || !mesh || E.docType !== "part") return;
  var entries = topologyEntriesForPart(part).filter(function (entry) { return entry.kind === "face"; });
  var drawn = new Set();
  var paint = function (reference, color, opacity) {
    if (!reference || drawn.has(reference.persistentId)) return;
    var entry = entries.find(function (candidate) { return candidate.persistentId === reference.persistentId; });
    var descriptor = (entry && entry.descriptor) || reference.descriptor;
    var highlight = faceHighlightMesh(mesh, descriptor, color, opacity);
    if (!highlight) return;
    drawn.add(reference.persistentId);
    parent.add(highlight);
  };
  (E.topologySelection || []).forEach(function (reference) { if (reference.kind === "face") paint(reference, 0xff7200, .62); });
  if (E.hoverTopology && E.hoverTopology.kind === "face") paint(E.hoverTopology, 0x24b7ff, .38);
}

function buildExt(parent, p, opt) {
  if (p.meshData && !p.exactPending) return buildExactMesh(parent, p);
  if (!p.pts || p.pts.length < 3) return null;
  var shape = new THREE.Shape();
  p.pts.forEach(function (q, i) {
    var u = q.u, v = q.v;
    if (!p.frame && p.axis === "y") v = -v;      // compensate rotateX(-90): z' = -shapeY
    if (!p.frame && p.axis === "x") u = -u;      // compensate rotateY(+90): z' = -shapeX
    if (i === 0) shape.moveTo(u, v); else shape.lineTo(u, v);
  });
  // through-holes from cut operations (same sketch-plane mapping as the outline)
  (p.holes || []).forEach(function (hl) {
    if (!hl || hl.length < 3) return;
    var path = new THREE.Path();
    hl.forEach(function (q, i) {
      var u = q.u, v = q.v;
      if (!p.frame && p.axis === "y") v = -v;
      if (!p.frame && p.axis === "x") u = -u;
      if (i === 0) path.moveTo(u, v); else path.lineTo(u, v);
    });
    shape.holes.push(path);
  });
  var depth = Math.abs(p.to - p.from) || 1;
  var g = smoothTessellationNormals(new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false }));
  if (p.frame) {
    var xAxis=new THREE.Vector3(p.frame.xAxis.x,p.frame.xAxis.y,p.frame.xAxis.z);
    var yAxis=new THREE.Vector3(p.frame.yAxis.x,p.frame.yAxis.y,p.frame.yAxis.z);
    var normal=new THREE.Vector3(p.frame.normal.x,p.frame.normal.y,p.frame.normal.z);
    if (p.to < p.from) normal.multiplyScalar(-1);
    var matrix=new THREE.Matrix4().makeBasis(xAxis,yAxis,normal);
    var start=framePoint(p.frame,0,0,p.from);
    matrix.setPosition(start.x,start.y,start.z);
    g.applyMatrix4(matrix);
  }
  else if (p.axis === "y") g.rotateX(-Math.PI / 2);
  else if (p.axis === "x") g.rotateY(Math.PI / 2);
  if (!p.frame) g.translate(
    p.axis === "x" ? Math.min(p.from, p.to) : 0,
    p.axis === "y" ? Math.min(p.from, p.to) : 0,
    p.axis === "z" ? Math.min(p.from, p.to) : 0
  );
  var m = new THREE.MeshStandardMaterial({
    color: hexNum(p.color),
    metalness: fin(p.metal) ? p.metal : 0.08,
    roughness: fin(p.rough) ? p.rough : 0.8,
    transparent: fin(p.opacity) && p.opacity < 1,
    opacity: fin(p.opacity) ? p.opacity : 1,
    side: THREE.DoubleSide,
  });
  var me = new THREE.Mesh(g, m);
  me.castShadow = true;
  me.receiveShadow = true;
  parent.add(me);
  return me;
}

function applyViewportDisplayStyle(mesh, style, previewOnly) {
  if (!mesh || !mesh.material || previewOnly || !style) return;
  var materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach(function (material) {
    if (!material) return;
    material.transparent = style === "transparent";
    material.opacity = style === "transparent" ? 0.3 : 1;
    material.depthWrite = style !== "transparent";
    material.needsUpdate = true;
  });
  mesh.castShadow = style !== "transparent";
  mesh.receiveShadow = style !== "transparent";
}

function buildPart(g, p, displayStyle) {
  var rotations=partPatternRotations(p);
  /* The newest transform is the outermost group: R(new) × R(previous) × body.
     This also makes a pattern of an existing pattern behave predictably. */
  for(var rotationIndex=rotations.length-1;rotationIndex>=0;rotationIndex--){
    var rotation=rotations[rotationIndex],transformGroup=new THREE.Group(),pivot=rotation.pivot || {x:0,y:0,z:0},bodyGroup=new THREE.Group();
    transformGroup.position.set(Number(pivot.x)||0,Number(pivot.y)||0,Number(pivot.z)||0);transformGroup.rotation[rotation.axis]=rotation.angle;
    bodyGroup.position.set(-(Number(pivot.x)||0),-(Number(pivot.y)||0),-(Number(pivot.z)||0));transformGroup.add(bodyGroup);g.add(transformGroup);g=bodyGroup;
  }
  var opt = {
    metal: fin(p.metal) ? p.metal : undefined,
    rough: fin(p.rough) ? p.rough : undefined,
    opacity: fin(p.opacity) ? p.opacity : undefined,
    trans: fin(p.opacity) && p.opacity < 1,
  };
  var col = hexNum(p.color), me = null, b;
  if (p.meshData && !p.exactPending) {
    me = buildExactMesh(g, p);
  } else if (p.kind === "box") {
    if (p.tex) opt.tex = p.tex; // box() handles texture mapping itself
    me = box(g, p.x0, p.x1, p.y0, p.y1, p.z0, p.z1, col, opt);
  } else if (p.kind === "cyl") {
    opt.r2 = p.r2 != null ? p.r2 : p.r;
    // The furniture default of 24 sides is fine across a room; under a modeller's
    // nose a 40 cm cylinder shows every one of them.
    opt.seg = curveSegments(Math.max(p.r, opt.r2), Math.PI * 2, 24, 96);
    me = cyl(g, p.x, p.y + p.h / 2, p.z, p.r, p.h, col, opt);
    if (p.tex) applyTexTo(me, p, Math.PI * 2 * p.r, p.h);
  } else if (p.kind === "sph") {
    me = sph(g, p.x, p.y, p.z, p.r, col, opt);
    if (p.tex) applyTexTo(me, p, 4 * p.r, 4 * p.r);
  } else if (p.kind === "ext") {
    me = buildExt(g, p, opt);
    if (p.tex && me) { b = partBounds(p); applyTexTo(me, p, b.x1 - b.x0, b.y1 - b.y0); }
  } else if (p.kind === "rev") {
    me = buildRev(g, p);
    if (p.tex && me) { b = partBounds(p); applyTexTo(me, p, b.x1 - b.x0, b.y1 - b.y0); }
  } else if (p.kind === "loft") {
    me = buildLoft(g, p); // no UVs on lofted geometry — color/material only
  }
  if (me) {
    /* Display style belongs to the editor viewport, not to the part material.
       Keeping it out of `p.opacity` means toggling X-ray inspection never
       dirties the document or leaks into placed instances of this model. */
    applyViewportDisplayStyle(me, displayStyle, p.previewOnly);
    me.userData.cadPart = p.id;
    me.userData.cadFeatureId = p.featureId || "feature:part:" + p.id;
    me.userData.cadFaceRanges = p.meshData && p.meshData.faceRanges || null;
    if (p === E.sel && me.material) {
      me.material = me.material.clone();
      if (me.material.emissive) me.material.emissive.setHex(0x3f2508);
    }
    addTopologyPickEdges(g, p);
    addFaceHighlights(g, p, me);
  }
  return me;
}

export function registerCustomModel(def) {
  if (
    !def ||
    !validCustomModelKey(def.key) ||
    !Array.isArray(def.parts) ||
    !def.parts.length ||
    def.parts.length > 500 ||
    // a model whose every step is suppressed or rolled back builds nothing,
    // and an empty catalogue entry is worse than a refused save
    !activeParts(def).length
  )
    return false;
  def.name = sanitizeDisplayName(def.name || def.key, 80) || def.key;
  def.parts.forEach(function (part) {
    if (part && typeof part === "object") {
      part.name = String(part.name || part.kind || "part").slice(0, 80);
      if (typeof part.color !== "string" || !/^#[0-9a-f]{6}$/i.test(part.color))
        part.color = "#999999";
    }
  });
  try {
    normalizeDef(def);
    if (!(def.metadata && def.metadata.adapter === "cabinet")) rebuildFeatureTreeFromDocument(def);
  } catch (_) {
    return false;
  }
  FURN[def.key] = {
    label: def.name || def.key,
    w: def.w, d: def.d, h: def.h,
    col: def.col || "#c9bfae",
    custom: def,
    build: def.metadata && def.metadata.adapter === "cabinet"
      ? function (g, it) {
          /* Advanced cabinet parts remain grouped by their semantic motion
             unit, so the existing door/drawer opening slider still drives the
             authored geometry after a CAD edit. */
          var L = layoutCab(it), groups = {}, yo = (it.cab && it.cab.elev) || 0;
          function groupFor(p) {
            var unitId = p.cabinetUnit;
            if (unitId == null || !L.units[unitId]) return { parent:g, off:null };
            if (!groups[unitId]) {
              var u = L.units[unitId], gr = new THREE.Group();
              gr.position.set((u.px || 0) + (u.tx || 0), yo + (u.py || 0) + (u.ty || 0), (u.pz || 0) + (u.tz || 0));
              if (u.rot) gr.rotation[u.rot] = u.ang || 0;
              g.add(gr); groups[unitId] = gr;
            }
            return { parent:groups[unitId], off:L.units[unitId] };
          }
          activeParts(def).forEach(function (p) {
            var target = groupFor(p), q = cloneData(p);
            if (target.off) movePart(q, -(target.off.px || 0), -(target.off.py || 0), -(target.off.pz || 0));
            else if (yo) movePart(q, 0, yo, 0);
            buildPart(target.parent, q);
          });
        }
      : function (g, it) { activeParts(def).forEach(function (p) {
          var q=p;
          if (p.parametricEnvelope === "box" && it) q=Object.assign({},p,{x0:-it.w/2,x1:it.w/2,y0:0,y1:it.h,z0:-it.d/2,z1:it.d/2});
          else if (p.parametricEnvelope === "cylinder" && it) q=Object.assign({},p,{x:0,y:0,z:0,r:it.w/2,r2:it.w/2,h:it.h});
          buildPart(g, q);
        }); },
  };
  PRICE[def.key] = fin(def.price) ? def.price : 0;
  // re-registering replaces the builder, so any measured vertical span for the
  // old shape is now wrong (elevation views read it)
  clearVSpanCache();
  return true;
}

// Convert a built-in (procedural) furniture type into an editable part list by
// building its meshes once and reading them back. Unrotated cylinders/spheres
// keep their exact shape; everything else (incl. RoundedBox, whose .parameters
// report the pre-scale unit box) becomes its axis-aligned bounding box.
function defFromBuiltin(type, it) {
  var f = FURN[type];
  if (!f || !f.build) return null;
  var g = new THREE.Group();
  /* Decompose the piece AS IT IS ON SCREEN, not the catalogue default. Copying
     the whole item is what makes that true for every builder at once: variant
     picks the shape and finish, and `cab` carries a modular cabinet's entire
     spec — cherry-picking a field list here is how a cabinet you had just
     designed came back as the stock unit. The copy is deep so a builder that
     caches or normalizes its spec cannot write back into the placed item. */
  var item = JSON.parse(JSON.stringify(it || {}));
  item.type = type;
  item.w = (it && it.w) || f.w;
  item.d = (it && it.d) || f.d;
  item.h = (it && it.h) || f.h;
  try {
    buildItem(g, item);
  } catch (e) {
    return null;
  }
  g.updateMatrixWorld(true);
  var parts = [];
  g.traverse(function (o) {
    if (!o.isMesh || !o.geometry || !o.material) return;
    var mat = o.material;
    var common = {
      id: uid(),
      color: "#" + mat.color.getHexString(),
      metal: fin(mat.metalness) ? mat.metalness : 0.08,
      rough: fin(mat.roughness) ? mat.roughness : 0.8,
    };
    if (mat.transparent && fin(mat.opacity) && mat.opacity < 1) common.opacity = mat.opacity;
    var gt = o.geometry.type, pr = o.geometry.parameters || {};
    var unrotated = !o.rotation.x && !o.rotation.y && !o.rotation.z;
    if (gt === "CylinderGeometry" && unrotated) {
      var p = new THREE.Vector3();
      o.getWorldPosition(p);
      parts.push(Object.assign({
        kind: "cyl", name: "cylinder",
        x: p.x, z: p.z, y: p.y - pr.height / 2,
        r: pr.radiusBottom, r2: pr.radiusTop, h: pr.height,
      }, common));
    } else if (gt === "SphereGeometry") {
      var q = new THREE.Vector3();
      o.getWorldPosition(q);
      parts.push(Object.assign({ kind: "sph", name: "sphere", x: q.x, y: q.y, z: q.z, r: pr.radius }, common));
    } else {
      var bb = new THREE.Box3().setFromObject(o);
      if (!isFinite(bb.min.x) || bb.isEmpty()) return;
      parts.push(Object.assign({
        kind: "box", name: "box",
        x0: bb.min.x, x1: bb.max.x, y0: bb.min.y, y1: bb.max.y, z0: bb.min.z, z1: bb.max.z,
      }, common));
    }
    if (o.geometry.dispose) o.geometry.dispose();
    if (mat.dispose) mat.dispose();
  });
  if (!parts.length) return null;
  return {
    key: "cm_" + Date.now().toString(36),
    name: flabel(type) + (getLang() === "en" ? " (custom)" : " (מותאם)"),
    price: PRICE[type] || 0,
    col: f.col || "#c9bfae",
    parts: parts,
  };
}

// custom-model defs referenced by the given items (for embedding in scene exports)
export function usedCustomModels(items) {
  var out = [], seen = {};
  (items || []).forEach(function (it) {
    var f = FURN[it.type];
    if (f && f.custom && !seen[it.type]) { seen[it.type] = 1; out.push(f.custom); }
  });
  return out;
}

export function refreshCatalogSelect() {
  // keep the CATALOG "custom" category (grid UI) in sync with registered models
  var cat = (CATALOG || []).find(function (c) { return c.id === "custom"; });
  if (cat && cat.sub && cat.sub[0]) {
    var items = cat.sub[0].items;
    items.length = 0;
    for (var kk in FURN) if (FURN[kk].custom) items.push(kk);
  }
  var sel = document.getElementById("furnsel");
  if (sel) {
    var cur = sel.value;
    sel.innerHTML = "";
    for (var k in FURN) {
      var o = document.createElement("option");
      o.value = k;
      o.textContent = FURN[k].custom ? "★ " + FURN[k].label : (FURN[k].label || k);
      sel.appendChild(o);
    }
    if (cur && FURN[cur]) sel.value = cur;
  }
  window.dispatchEvent(new Event('catalogUpdated'));
}

// Load definitions before main fills the select. localStorage keeps only a
// compact index; geometry, textures and exact attachment references live in IDB.
await initializeModelLibrary();
loadLib().forEach(registerCustomModel);

/* ================= editor state ================= */
var E = {
  open: false,
  docType: "part",    // part | assembly
  def: null,          // model being edited
  assembly: null,
  brepRun: null,
  coreRun: null,
  componentSel: [],   // assembly multi-selection; last entry is primary
  sel: null,          // selected part
  tool: "select",
  mode: "3d",          // "2d" sketch | "3d" model | "drawing" read-only sheet
  displayStyle: "solid", // viewport-only: solid | transparent
  modelPlaneActive: false, // sketch canvas over the solid model, on E.view
  view: "top",        // top | front | side
  scl: 2,             // px per cm
  ox: 0, oy: 0,       // canvas pan (px)
  grid: 5, osnap: true,
  depth: 60, baseOff: 0,
  wallWidth: 10,
  wallPts: null,      // connected line/wall centreline currently being drawn
  dynInput: null,     // typed dimension entry while drawing {field, values{}}
  poly: null,         // in-progress polygon [{u,v}]
  ssel: [],           // sketch selection: entities and/or points, in pick order
  arcPts: null,       // in-progress arc [centre, start]
  slotPts: null,      // in-progress slot centreline [start, end]
  ellPts: null,       // in-progress ellipse [centre, major axis end]
  polySides: 6,       // side count the polygon tool draws with
  solveInfo: null,    // last solver report: DOF, status, conflicting constraint ids
  topologySelection: [], // persistent face/edge/axis references from the 3D viewport
  hoverTopology: null, // topology reference under the cursor in the 3D viewport
  /* Two habits every CAD user turns off first, so they start off here. Normal
     to: snapping the camera square to a plane the moment a sketch opens, which
     throws away the 3D view you were working in. Auto dimension: turning a
     number typed while drawing into a driving dimension, so the sketch arrives
     already defined instead of staying free until it is dimensioned on
     purpose. Both are toggles in Settings, not decisions made for you. */
  sketchNormalTo: false,
  autoDimTyped: false,
  drag: null,
  dimPick: [],        // first/second Smart Ruler endpoints in Drawing mode
  dimSel: null,       // selected placed dimension constraint id
  cv: null, cx: null,
  pv: null,           // preview {renderer,scene,camera,group,az,el,dist}
  commandTab: "features",
  kernelBusy: false,  // an exact-kernel regeneration is in flight
  treeQuery: "",
  tour: { active: false, track: null, mode: null, step: 0, completed: {}, baseline: null, target: null, autoOrigin: null, position: null, drag: null, moved: false, keepResult: false },
  authoring: { phase:"model", referenceId:null, sketchId:null, featureType:null, sketchSelection:[] },
};

/* Sketching habits are per-user, not per-document — they outlive the model the
   switch happened to be flipped in. */
var LS_MODELER_PREFS = "home3d_modeler_prefs";
var MODELER_PREFS = ["sketchNormalTo", "autoDimTyped", "osnap"];
function loadModelerPrefs() {
  try {
    var stored = JSON.parse(localStorage.getItem(LS_MODELER_PREFS)) || {};
    MODELER_PREFS.forEach(function (key) { if (typeof stored[key] === "boolean") E[key] = stored[key]; });
  } catch (e) {}
}
function saveModelerPrefs() {
  try {
    var out = {};
    MODELER_PREFS.forEach(function (key) { out[key] = !!E[key]; });
    localStorage.setItem(LS_MODELER_PREFS, JSON.stringify(out));
  } catch (e) {}
}
loadModelerPrefs();

function newDef() {
  var def=ensureParametricDocument({
    key: "cm_" + Date.now().toString(36), name: t("newModel"), price: 500,
    col: "#c9bfae", parts: [], constraints: [], rollback: null,
    sketches: [], activeSketch: null, variables: [],
    features: [], history:[], referenceGeometry: [], metadata:{authoringSystem:"parametric-v1"},
  });
  def.metadata.authoringSystem="parametric-v1";
  return def;
}
// Drawing stays freehand.  Keep only a little numeric cleanup so repeated
// pointer updates do not accumulate floating-point noise; the visible grid is
// a reference, not a magnet.
function snapV(v) { return Math.round(v * 10) / 10; }

/* ---- gentle object snapping: connection points (endpoints) only ---- */
function snapTargets(excludePart) {
  var ts = [];
  (E.def.parts || []).forEach(function (p) {
    if (p === excludePart) return;
    var f = partUV(p);
    if (f.type === "rect") {
      var u0 = Math.min(f.u0, f.u1), u1 = Math.max(f.u0, f.u1), v0 = Math.min(f.v0, f.v1), v1 = Math.max(f.v0, f.v1);
      ts.push({ u: u0, v: v0, k: "e" }, { u: u1, v: v0, k: "e" }, { u: u0, v: v1, k: "e" }, { u: u1, v: v1, k: "e" });
    } else if (f.type === "circle") {
      // Closed curves have no connection endpoint.
    } else {
      var loops = [f.pts].concat(p.holes || []);
      loops.forEach(function (lp) {
        lp.forEach(function (q, i) {
          ts.push({ u: q.u, v: q.v, k: "e" });
        });
      });
    }
  });
  // Every sketch drawn in this plane is snappable, including the dimmed ones:
  // referencing geometry you can see is the whole reason they are on screen.
  ensureSketchDoc(E.def).forEach(function (sketch) {
    if (!sameSketchContext(sketch,ensureSketch(E.def))) return;
    var active = sketch.id === E.def.activeSketch;
    (sketch.entities || []).forEach(function (entity) {
      if (entity === excludePart) return;
      if (entity.type === "line") {
        var a = sketchPoint(sketch, entity.a), b = sketchPoint(sketch, entity.b);
        if (!a || !b) return;
        // only the sketch you are editing hands out point ids: snapping to
        // another sketch's point must copy it, never join to it
        ts.push({ u: a.x, v: a.y, k: "e", pointId: active ? a.id : null });
        ts.push({ u: b.x, v: b.y, k: "e", pointId: active ? b.id : null });
      }
    });
  });
  // points of the polygon being sketched (lets you close precisely / build symmetric shapes)
  if (E.poly) E.poly.forEach(function (q) { ts.push({ u: q.u, v: q.v, k: "e" }); });
  return ts;
}
// Snap a cursor position only when it is almost exactly on a connection point.
function snapPt(uv, excludePart) {
  E._osnap = null;
  if (E.osnap) {
    // Four screen pixels makes the join intentional without pulling the cursor
    // away from precise nearby geometry, independent of zoom level.
    var thr = 4 / E.scl, best = null, bd = thr;
    snapTargets(excludePart).forEach(function (tt) {
      var d = Math.hypot(uv.u - tt.u, uv.v - tt.v);
      if (d < bd) { bd = d; best = tt; }
    });
    if (best) { E._osnap = best; return { u: best.u, v: best.v, pointId: best.pointId || null }; }
  }
  return { u: snapV(uv.u), v: snapV(uv.v) };
}

function pointInPoly(uv, pts) {
  var inside = false;
  for (var a = 0, b = pts.length - 1; a < pts.length; b = a++) {
    if (pts[a].v > uv.v !== pts[b].v > uv.v &&
      uv.u < ((pts[b].u - pts[a].u) * (uv.v - pts[a].v)) / (pts[b].v - pts[a].v) + pts[a].u) inside = !inside;
  }
  return inside;
}
function loopCentroid(pts) {
  var u = 0, v = 0;
  pts.forEach(function (q) { u += q.u; v += q.v; });
  return { u: u / pts.length, v: v / pts.length };
}

// Convert a box part to the equivalent extrude along `ax` (so it can take holes / rotate).
function boxToExt(p, ax) {
  var q = { id: p.id, featureId:p.featureId, kind: "ext", axis: ax, name: p.name || "box", color: p.color, metal: p.metal, rough: p.rough, opacity: p.opacity, tex: p.tex, holes: [] };
  function rectPts(u0, u1, v0, v1) { return [{ u: u0, v: v0 }, { u: u1, v: v0 }, { u: u1, v: v1 }, { u: u0, v: v1 }]; }
  if (ax === "y") { q.pts = rectPts(p.x0, p.x1, p.z0, p.z1); q.from = p.y0; q.to = p.y1; }
  else if (ax === "z") { q.pts = rectPts(p.x0, p.x1, p.y0, p.y1); q.from = p.z0; q.to = p.z1; }
  else { q.pts = rectPts(p.z0, p.z1, p.y0, p.y1); q.from = p.x0; q.to = p.x1; }
  return q;
}

function cutRangeForAxis(bounds, axis) {
  var lo = axis === "x" ? bounds.x0 : axis === "y" ? bounds.y0 : bounds.z0;
  var hi = axis === "x" ? bounds.x1 : axis === "y" ? bounds.y1 : bounds.z1;
  var pad = Math.max(2, (hi - lo) * 0.08);
  return { from: lo - pad, to: hi + pad };
}

var exactBuildTimers = new WeakMap();

async function exactBrepForPart(p) {
  if (!p || !["ext","box","cyl"].includes(p.kind)) throw new Error("Exact operations require an extrude, box, or straight cylinder");
  var ownerFeatureId = p.featureId || "feature:part:" + p.id, solid, expectedTopology;
  if (p.kind==="box") {
    var boxParams={x:Math.min(p.x0,p.x1),y:Math.min(p.y0,p.y1),z:Math.min(p.z0,p.z1),w:Math.abs(p.x1-p.x0),h:Math.abs(p.y1-p.y0),d:Math.abs(p.z1-p.z0)};
    solid=await makeBrepPrimitive({type:"box",...boxParams});
    expectedTopology=topologyForFeature({id:ownerFeatureId,type:"box"},boxParams);
  } else if (p.kind==="cyl" && (p.r2==null || Math.abs(p.r2-p.r)<1e-6)) {
    var cylParams={x:p.x,y:p.y,z:p.z,r:p.r,h:p.h};
    solid=await makeBrepPrimitive({type:"cylinder",...cylParams});
    expectedTopology=topologyForFeature({id:ownerFeatureId,type:"cylinder"},cylParams);
  } else if (p.kind==="ext") {
    solid=await makeBrepExtrusion({axis:p.axis,frame:p.frame,from:p.from,to:p.to,points:p.pts});
    expectedTopology=topologyForFeature({id:ownerFeatureId,type:"extrude"},{axis:p.axis,frame:p.frame,from:p.from,to:p.to,points:p.pts,profileEntityIds:p.profileEntityIds});
  } else throw new Error("Exact operations require a straight cylinder");
  var b = partBounds(p), cuts = [];
  (p.holes || []).forEach(function (loop) { cuts.push({axis:p.axis,frame:p.frame,from:p.from,to:p.to,loop:loop}); });
  (p.cuts3d || []).forEach(function (cut) { cuts.push(cut); });
  for (var i = 0; i < cuts.length; i++) {
    var cut = cuts[i], range = cut.frame ? {from:cut.from,to:cut.to} : cutRangeForAxis(b, cut.axis);
    var cutter = await makeBrepExtrusion({axis:cut.axis,frame:cut.frame,from:range.from,to:range.to,points:cut.loop});
    var next = await booleanBrep("subtract", solid, cutter);
    disposeBrep(solid); disposeBrep(cutter); solid = next;
  }
  extractBrepTopology(solid, { ownerFeatureId:ownerFeatureId, expectedTopology:expectedTopology });
  var operations = Array.isArray(p.exactOperations) && p.exactOperations.length ? p.exactOperations.filter(function(operation){return !operation.suppressed;}) : [];
  if (!operations.length && fin(p.exactFillet) && p.exactFillet > 0) operations.push({
    id:ownerFeatureId + ":fillet", type:"fillet", amount:p.exactFillet,
    targets:cloneData(p.exactFilletTargets || []), persistentIds:(p.exactFilletEdges || []).slice(),
  });
  try {
    for (var oi=0;oi<operations.length;oi++) {
      var operation=operations[oi], priorTopology=cloneData(solid.topology || []), next;
      var opId=operation.id || ownerFeatureId + ":" + operation.type + ":" + (oi+1);
      var opParams={targets:cloneData(operation.targets || [])};
      var persistentIds=(operation.targets || []).map(function(reference){return reference.persistentId;});
      if (!persistentIds.length) persistentIds=(operation.persistentIds || []).slice();
      if (operation.type==="fillet") {
        opParams={...opParams,...cloneData(operation.params || {}),radius:operation.amount};
        next=await filletBrep(solid, operation.amount, {...(operation.params || {}),edgePersistentIds:persistentIds});
      } else if (operation.type==="chamfer") {
        opParams={...opParams,...cloneData(operation.params || {}),distance:operation.amount};
        next=await chamferBrep(solid, operation.amount, {...(operation.params || {}),edgePersistentIds:persistentIds});
      } else if (operation.type==="shell") {
        opParams.thickness=operation.amount;
        next=await shellBrep(solid, operation.amount, {facePersistentIds:persistentIds,direction:operation.params && operation.params.direction,tolerance:operation.params && operation.params.tolerance,join:operation.params && operation.params.join});
      } else throw new Error("Unsupported exact operation: " + operation.type);
      var expectedAfter=topologyForFeature({id:opId,type:operation.type},opParams,[{topology:priorTopology}]);
      disposeBrep(solid); solid=next;
      extractBrepTopology(solid,{ownerFeatureId:opId,expectedTopology:expectedAfter});
    }
  } catch (error) {
    disposeBrep(solid);
    throw error;
  }
  return solid;
}

function queueExactMesh(p) {
  if (!p || !["ext","box","cyl"].includes(p.kind)) return;
  var scheduled = exactBuildTimers.get(p);
  if (scheduled) { clearTimeout(scheduled); exactBuildTimers.delete(p); }
  var token = (p.exactBuildToken || 0) + 1;
  p.exactBuildToken = token;
  p.exactPending = true;
  p.exactError = null;
  updatePreview();
  // The full browser kernel is intentionally lazy-loaded.  Keep the editor
  // interactive and replace an indefinite spinner with an actionable status
  // on devices where compiling the WASM module takes unusually long.  The
  // original build is not cancelled: a late result still replaces the
  // lightweight preview below.
  var slowTimer = typeof window !== "undefined" ? setTimeout(function () {
    if (p.exactBuildToken !== token || !p.exactPending) return;
    p.exactPending = false;
    p.exactError = "Exact CAD kernel is still loading; the lightweight preview remains active.";
    updatePreview();
  }, 15000) : null;
  exactBrepForPart(p).then(async function (brep) {
    try {
      var meshData = await shapeToMeshData(brep, {deflection:0.28,angle:0.18});
      meshData.topology = cloneData(brep.topology || []);
      if (p.exactBuildToken !== token) return;
      if (slowTimer) clearTimeout(slowTimer);
      p.meshData = meshData;
      p.exactPending = false;
      p.exactError = null;
      updatePreview();
      if (E.mode === "3d") renderPreview();
    } finally { disposeBrep(brep); }
  }).catch(function (error) {
    if (p.exactBuildToken !== token) return;
    if (slowTimer) clearTimeout(slowTimer);
    p.exactPending = false;
    p.exactError = String(error && error.message || error);
    console.warn("Exact CAD mesh build failed:", p.exactError);
    updatePreview();
  });
}

function scheduleExactMesh(p) {
  if (!p || !((p.cuts3d && p.cuts3d.length) || p.exactFillet || (p.exactOperations && p.exactOperations.length))) return;
  var old = exactBuildTimers.get(p);
  if (old) clearTimeout(old);
  exactBuildTimers.set(p, setTimeout(function () {
    exactBuildTimers.delete(p);
    queueExactMesh(p);
  }, 140));
}

// Through-cut: punch `loop` as a hole into every part under it in the current view.
// Cuts on the extrusion axis remain lightweight profile holes. Orthogonal cuts
// become OpenCascade booleans, so the same body can be bored from several faces
// just like the workflow in a full CAD modeller.
function applyCut(loop) {
  if (!loop || loop.length < 3) return 0;
  var frame=activeSketchFrame(), ax = frame ? "frame" : axisOfView(), c = loopCentroid(loop), changed = 0;
  E.def.parts = E.def.parts.map(function (p) {
    var footprint=partUV(p), inside=footprint.type === "poly"
      ? pointInPoly(c,footprint.pts)
      : footprint.type === "circle"
        ? Math.hypot(c.u-footprint.u,c.v-footprint.v)<=footprint.r
        : c.u >= Math.min(footprint.u0,footprint.u1) && c.u <= Math.max(footprint.u0,footprint.u1)
          && c.v >= Math.min(footprint.v0,footprint.v1) && c.v <= Math.max(footprint.v0,footprint.v1);
    if (frame && inside && (p.kind==="box" || p.kind==="ext" || (p.kind==="cyl" && (p.r2==null || Math.abs(p.r2-p.r)<1e-6)))) {
      var range=frameRangeForBounds(partBounds(p),frame);
      p.cuts3d=p.cuts3d || [];
      p.cuts3d.push({axis:"frame",frame:cloneData(frame),from:range.from,to:range.to,loop:loop.map(function(q){return {u:q.u,v:q.v};})});
      changed++;
      scheduleExactMesh(p);
      return p;
    }
    if (p.kind === "box") {
      if (inside) p = boxToExt(p, ax);
    }
    if (p.kind === "ext") {
      if (inside) {
        var copy = loop.map(function (q) { return { u:q.u, v:q.v }; });
        if (p.axis === ax && !(p.cuts3d && p.cuts3d.length)) {
          p.holes = p.holes || [];
          p.holes.push(copy);
        } else {
          p.cuts3d = p.cuts3d || [];
          p.cuts3d.push({axis:ax,loop:copy});
        }
        changed++;
        if (p.cuts3d && p.cuts3d.length) scheduleExactMesh(p);
      }
    }
    return p;
  });
  return changed;
}

// Fillet: replace polygon corner i with an arc of radius r (SolidWorks-style corner round).
function filletVertex(pts, i, r) {
  var n = pts.length;
  var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
  var a1u = p0.u - p1.u, a1v = p0.v - p1.v, a2u = p2.u - p1.u, a2v = p2.v - p1.v;
  var l1 = Math.hypot(a1u, a1v), l2 = Math.hypot(a2u, a2v);
  if (l1 < 0.01 || l2 < 0.01) return false;
  a1u /= l1; a1v /= l1; a2u /= l2; a2v /= l2;
  var ang = Math.acos(clamp(a1u * a2u + a1v * a2v, -1, 1));
  if (ang < 0.05 || ang > Math.PI - 0.05) return false;
  var d = r / Math.tan(ang / 2);
  var dm = Math.min(l1, l2) * 0.49;
  if (d > dm) { d = dm; r = d * Math.tan(ang / 2); }
  var t1 = { u: p1.u + a1u * d, v: p1.v + a1v * d }, t2 = { u: p1.u + a2u * d, v: p1.v + a2v * d };
  var bu = a1u + a2u, bv = a1v + a2v, bl = Math.hypot(bu, bv);
  var cen = { u: p1.u + (bu / bl) * (r / Math.sin(ang / 2)), v: p1.v + (bv / bl) * (r / Math.sin(ang / 2)) };
  var s1 = Math.atan2(t1.v - cen.v, t1.u - cen.u), s2 = Math.atan2(t2.v - cen.v, t2.u - cen.u);
  var sweep = s2 - s1;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  var steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
  var arc = [];
  for (var k = 0; k <= steps; k++) {
    var aa = s1 + (sweep * k) / steps;
    arc.push({ u: cen.u + Math.cos(aa) * r, v: cen.v + Math.sin(aa) * r });
  }
  pts.splice.apply(pts, [i, 1].concat(arc));
  return true;
}

// Chamfer: replace polygon corner i with a straight cut `d` cm along both edges.
function chamferVertex(pts, i, d) {
  var n = pts.length;
  var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
  var l1 = Math.hypot(p0.u - p1.u, p0.v - p1.v), l2 = Math.hypot(p2.u - p1.u, p2.v - p1.v);
  if (l1 < 0.01 || l2 < 0.01) return false;
  d = Math.min(d, l1 * 0.49, l2 * 0.49);
  var t1 = { u: p1.u + ((p0.u - p1.u) / l1) * d, v: p1.v + ((p0.v - p1.v) / l1) * d };
  var t2 = { u: p1.u + ((p2.u - p1.u) / l2) * d, v: p1.v + ((p2.v - p1.v) / l2) * d };
  pts.splice(i, 1, t1, t2);
  return true;
}

// Inset a polygon loop inward by t (miter offset). Interior side is detected per
// edge by point-in-polygon probing, so winding order doesn't matter.
function insetLoop(pts, t) {
  var n = pts.length, offs = [];
  for (var i = 0; i < n; i++) {
    var a = pts[i], b = pts[(i + 1) % n];
    var du = b.u - a.u, dv = b.v - a.v, L = Math.hypot(du, dv);
    if (L < 0.01) return null;
    var nu = -dv / L, nv = du / L;
    var mid = { u: (a.u + b.u) / 2 + nu * 0.1, v: (a.v + b.v) / 2 + nv * 0.1 };
    if (!pointInPoly(mid, pts)) { nu = -nu; nv = -nv; }
    offs.push({ au: a.u + nu * t, av: a.v + nv * t, du: du, dv: dv });
  }
  var out = [];
  for (var k = 0; k < n; k++) {
    var e0 = offs[(k - 1 + n) % n], e1 = offs[k];
    // intersect offset lines e0 and e1
    var den = e0.du * e1.dv - e0.dv * e1.du;
    if (Math.abs(den) < 1e-6) { out.push({ u: e1.au, v: e1.av }); continue; }
    var s = ((e1.au - e0.au) * e1.dv - (e1.av - e0.av) * e1.du) / den;
    out.push({ u: e0.au + e0.du * s, v: e0.av + e0.dv * s });
  }
  // sanity: every inset vertex must land inside the original loop
  for (var m = 0; m < n; m++) if (!pointInPoly(out[m], pts)) return null;
  return out;
}

/* ---- revolve (lathe) & loft solids ---- */
function stdMat(p) {
  return new THREE.MeshStandardMaterial({
    color: hexNum(p.color),
    metalness: fin(p.metal) ? p.metal : 0.08,
    roughness: fin(p.rough) ? p.rough : 0.8,
    transparent: fin(p.opacity) && p.opacity < 1,
    opacity: fin(p.opacity) ? p.opacity : 1,
    side: THREE.DoubleSide,
  });
}
function revMaxR(p) {
  var R = 0;
  p.pts.forEach(function (q) { R = Math.max(R, Math.abs(q.u)); });
  return R;
}
function buildRev(parent, p) {
  if (!p.pts || p.pts.length < 2) return null;
  var prof = p.pts.map(function (q) { return new THREE.Vector2(Math.max(0.01, Math.abs(q.u)), q.v); });
  prof.push(prof[0].clone()); // close the loop so the solid has no missing wall
  var g;
  try {
    var angle=Math.max(.001,Math.min(360,Number(p.angle)||360))*Math.PI/180;
    var start=p.symmetric ? -angle/2 : p.direction==="reverse" ? -angle : 0;
    g = new THREE.LatheGeometry(prof, p.seg || 32, start, angle);
  } catch (e) {
    return null;
  }
  g.translate(p.x || 0, 0, p.z || 0);
  var me = new THREE.Mesh(g, stdMat(p));
  me.castShadow = true;
  me.receiveShadow = true;
  parent.add(me);
  return me;
}
// map sketch-plane (u,v) + axis coordinate w into model xyz, per extrude axis convention
function loftXYZ(axis, u, v, w) {
  if (axis === "y") return [u, w, v];
  if (axis === "z") return [u, v, w];
  return [w, v, u];
}
function buildLoft(parent, p) {
  var n = (p.pts0 || []).length;
  if (n < 3 || !p.pts1 || p.pts1.length !== n) return null;
  var pos = [], idx = [], i;
  for (i = 0; i < n; i++) pos.push.apply(pos, loftXYZ(p.axis, p.pts0[i].u, p.pts0[i].v, p.from));
  for (i = 0; i < n; i++) pos.push.apply(pos, loftXYZ(p.axis, p.pts1[i].u, p.pts1[i].v, p.to));
  for (i = 0; i < n; i++) { // side walls
    var a = i, b = (i + 1) % n;
    idx.push(a, b, n + b, a, n + b, n + a);
  }
  try { // end caps
    [p.pts0, p.pts1].forEach(function (ring, ri) {
      var tris = THREE.ShapeUtils.triangulateShape(ring.map(function (q) { return new THREE.Vector2(q.u, q.v); }), []);
      tris.forEach(function (tr) { idx.push(ri * n + tr[0], ri * n + tr[1], ri * n + tr[2]); });
    });
  } catch (e) {}
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  var me = new THREE.Mesh(g, stdMat(p));
  me.castShadow = true;
  me.receiveShadow = true;
  parent.add(me);
  return me;
}

function partPatternRotations(p) {
  var rotations=Array.isArray(p && p.patternRotations) ? p.patternRotations.slice() : [];
  if(p && p.patternRotation)rotations.push(p.patternRotation);
  return rotations.filter(function(rotation){return rotation && ["x","y","z"].includes(rotation.axis) && Number.isFinite(Number(rotation.angle));}).map(function(rotation){return {axis:rotation.axis,angle:Number(rotation.angle),pivot:rotation.pivot ? {x:Number(rotation.pivot.x)||0,y:Number(rotation.pivot.y)||0,z:Number(rotation.pivot.z)||0}:undefined};});
}

// Circular pattern copies keep an explicit model-space transform. Applying it
// to a render group supports every part kind and all three axes, including
// imported meshes and boxes that previously stayed coincident with the seed.
function rotatePatternPart(p, axis, angle, radialDistance) {
  if(!p)return null;
  p.patternRotations=partPatternRotations(p);
  var normalizedAxis=["x","y","z"].includes(axis)?axis:"y";
  p.patternRotations.push({axis:normalizedAxis,angle:Number(angle)||0,pivot:circularPatternPivot({axis:normalizedAxis,radialDistance:radialDistance})});
  delete p.patternRotation;
  return p;
}
function patternPlacements(params) {
  var count=Math.max(2,Math.min(100,Math.round(Number(params && params.count)||2)));
  if(params && params.mode==="circular"){
    var skipped=parseSkippedPatternInstances(params.skipInstances);
    return Array.from({length:count-1},function(_,index){return {circularIndex:index+1,instance:index+1};}).filter(function(placement){return !skipped.has(placement.instance);});
  }
  return linearPatternOffsets(params || {},count);
}
function rotPartY(p, ang) { return rotatePatternPart(p,"y",ang); }
/* ================= undo =================
   Tree machinery is shared (edit_history.js); the modeler only says what a
   snapshot is and what is inside one. It stays local to the editor: Ctrl+Z
   here walks the part list, and when it runs out it stops rather than escaping
   into the plan's history. Leaving the modeler is what commits or drops the
   session.

   The snapshot carries BOTH documents. An assembly lives on E.assembly rather
   than on E.def, so while only the def was recorded, every component insert,
   mate and delete pushed a step that restored an identical part document —
   undo in an assembly appeared to do nothing at all. */
function snapDoc() {
  return JSON.stringify({ d: E.def, a: E.assembly });
}
const H = createHistory({
  get: snapDoc,
  set: function (s) {
    var o = JSON.parse(s);
    E.def = o.d;
    E.assembly = o.a || null;
    // the selected part / entity / component may not exist in the restored doc
    E.sel = null;
    E.ssel = [];
    E.topologySelection = [];
    E.componentSel = [];
    refreshAll();
  },
  scan: scanDoc,
  subtree: docSubtree,
  onChange: syncUndoButtons,
});

/* ---- what is inside a document ------------------------------------------
   Read off a snapshot, so the history tree can say which step touched which
   part — and, scoped to one of them, show only its own thread. The nesting is
   the one the editor already works in: a sketch owns its entities and the
   constraints over them, a sketch-driven solid hangs off the sketch that
   drives it, a boolean hangs off its first input, and a mate hangs off the
   component it moves.

   Point coordinates fold into the entity that uses them (as wall corners fold
   into the wall, in the plan): dragging a line is an edit of the line, not of
   two anonymous points. */
function scanDoc(str) {
  var o;
  try {
    o = JSON.parse(str);
  } catch (err) {
    return [];
  }
  var def = (o && o.d) || {},
    asm = (o && o.a) || null,
    out = [];
  (def.sketches || []).forEach(function (s) {
    var pt = {};
    (s.points || []).forEach(function (p) { pt[p.id] = p.x + "," + p.y; });
    out.push({ id: "sketch:" + s.id, kind: "sketch", label: s.name || t("sketch"), sig: s.name + "|" + s.plane + "|" + s.offset });
    (s.entities || []).forEach(function (e) {
      var geo = [e.a, e.b, e.c, e.center, e.p].map(function (k) { return pt[k] || ""; }).join(";");
      out.push({
        id: "ent:" + e.id, parent: "sketch:" + s.id, kind: "entity",
        label: (e.name || e.type || "line"), sig: JSON.stringify(e) + "|" + geo,
      });
    });
    (s.constraints || []).forEach(function (c) {
      out.push({
        id: "con:" + c.id, parent: c.entity != null ? "ent:" + c.entity : "sketch:" + s.id,
        kind: c.value != null ? "dim" : "entity",
        label: conLabel(c), sig: JSON.stringify(c),
      });
    });
  });
  (def.parts || []).forEach(function (p, i) {
    out.push({
      id: "part:" + (p.id != null ? p.id : "i" + i),
      parent: p.sketchDriven && p.sketchId ? "sketch:" + p.sketchId : null,
      kind: "part", label: (p.name || p.kind) + " " + (i + 1), sig: JSON.stringify(p),
    });
  });
  (def.features || []).forEach(function (f) {
    out.push({
      id: "feat:" + f.id, parent: f.inputs && f.inputs.length ? "feat:" + f.inputs[0] : null,
      kind: "feature", label: f.name || f.type, sig: JSON.stringify(f),
    });
  });
  (def.variables || []).forEach(function (v) {
    out.push({ id: "var:" + v.id, kind: "dim", label: v.name, sig: JSON.stringify(v) });
  });
  if (asm) {
    (asm.components || []).forEach(function (c) {
      out.push({ id: "comp:" + c.id, kind: "component", label: c.name || c.modelKey, sig: JSON.stringify(c) });
    });
    (asm.mates || []).forEach(function (m) {
      out.push({ id: "mate:" + m.id, parent: m.a != null ? "comp:" + m.a : null, kind: "mate", label: m.type, sig: JSON.stringify(m) });
    });
  }
  return out;
}
function conLabel(c) {
  var d = CONSTRAINT_DEFS.filter(function (x) { return x.id === c.type; })[0];
  return (d ? t(d.label) : c.type) + (c.value != null ? " " + Math.round(c.value * 10) / 10 : "");
}
/* Children the ids alone do not spell out: which solids a sketch drives, and
   which mates move a component. Everything else is already a parent link. */
function docSubtree(id) {
  var at = id.indexOf(":"), kind = id.slice(0, at), key = id.slice(at + 1), out = [];
  if (kind === "sketch") {
    (E.def.parts || []).forEach(function (p) {
      if (p.sketchDriven && String(p.sketchId) === key) out.push("part:" + p.id);
    });
  } else if (kind === "comp" && E.assembly) {
    (E.assembly.mates || []).forEach(function (m) {
      if (String(m.a) === key || String(m.b) === key) out.push("mate:" + m.id);
    });
  } else if (kind === "part") {
    // a solid the sketch drives is where its profile edits show up
    var part = (E.def.parts || []).filter(function (p) { return String(p.id) === key; })[0];
    if (part && part.sketchDriven && part.profileEntityIds) {
      part.profileEntityIds.forEach(function (e) { out.push("ent:" + e); });
      (part.holeProfileEntityIds || []).forEach(function (loop) { loop.forEach(function (e) { out.push("ent:" + e); }); });
    }
  }
  return out;
}
/* Whatever the editor currently has picked, named the way the scan names it —
   and the way back, so a chip in the panel selects the object it names. */
function docScope() {
  if (E.docType === "assembly") {
    var c = E.componentSel && E.componentSel.length ? E.componentSel[E.componentSel.length - 1] : null;
    return c ? "comp:" + c.id : null;
  }
  var s = E.sel;
  if (!s) return null;
  if (s.kind) return "part:" + s.id;              // a solid
  if (s.type) return "ent:" + s.id;               // a sketch line / circle / arc
  return null;                                     // a bare sketch point
}
function docPick(id) {
  var at = id.indexOf(":"), kind = id.slice(0, at), key = id.slice(at + 1);
  if (kind === "part") {
    var p = (E.def.parts || []).filter(function (q) { return String(q.id) === key; })[0];
    if (!p) return;
    E.sel = p;
    E.topologySelection = [];
    E.ssel = [];
  } else if (kind === "ent" || kind === "con") {
    // a constraint is picked through the entity it holds — that is the thing
    // the canvas can actually show you
    var want = key;
    if (kind === "con")
      (E.def.sketches || []).forEach(function (s) {
        (s.constraints || []).forEach(function (c) {
          if (String(c.id) === key && c.entity != null) want = String(c.entity);
        });
      });
    var sk = null, ent = null;
    (E.def.sketches || []).forEach(function (s) {
      (s.entities || []).forEach(function (e) {
        if (String(e.id) === want) { ent = e; sk = s; }
      });
    });
    if (!ent) return;
    E.def.activeSketch = sk.id;
    E.ssel = [ent];
    E.sel = ent;
  } else if (kind === "sketch") {
    if (!(E.def.sketches || []).some(function (s) { return String(s.id) === key; })) return;
    E.def.activeSketch = key;
    E.sel = null;
    E.ssel = [];
  } else if (kind === "comp" && E.assembly) {
    var c = (E.assembly.components || []).filter(function (q) { return String(q.id) === key; })[0];
    if (!c) return;
    E.componentSel = [c];
  } else return;
  refreshAll();
  if (histPanel) histPanel.refreshNow();
}
function pushUndo(label, tag) { H.push(label, tag); }
function doUndo() { H.undo(); }
function doRedo() { H.redo(); }
var histPanel = null;
function syncUndoButtons() {
  if (!root) return;
  var u = root.querySelector("#mdUndo"), r = root.querySelector("#mdRedo");
  if (u) {
    u.disabled = !H.canUndo();
    u.title = "Ctrl+Z" + (H.undoLabel() ? " · " + H.undoLabel() : "");
  }
  if (r) {
    r.disabled = !H.canRedo();
    r.title = "Ctrl+Y" + (H.redoLabel() ? " · " + H.redoLabel() : "");
  }
  if (histPanel) histPanel.refresh();
}

/* ---- view plane mapping: (u,v) sketch coords <-> model (x,y,z) ---- */
// top:   u=x, v=z, normal axis y (v axis points +z = down on canvas)
// front: u=x, v=y, normal axis z (v up on canvas)
// side:  u=z, v=y, normal axis x
function axisOfView() { return planeAxis(E.view); }
// The extrude direction a sketch plane implies. Read from the sketch's own
// plane, never from the current view — that is what made the same profile
// extrude differently depending on where the camera happened to be.
function planeAxis(plane) { return plane === "top" ? "y" : plane === "front" ? "z" : "x"; }
function activeSketchFrame() {
  var sketch=ensureSketch(E.def);
  return sketch && sketch.frameSpace==="local" && (E.modelPlaneActive || E.mode==="2d") ? sketch.frame : null;
}
function sameFrameOrientation(a,b) {
  if (!a || !b || !a.normal || !b.normal || !a.xAxis || !b.xAxis) return false;
  var nd=a.normal.x*b.normal.x+a.normal.y*b.normal.y+a.normal.z*b.normal.z;
  var xd=a.xAxis.x*b.xAxis.x+a.xAxis.y*b.xAxis.y+a.xAxis.z*b.xAxis.z;
  return nd>.99999 && xd>.99999;
}
function partEditableInSketch(part) {
  var frame=activeSketchFrame();
  return !!part && part.kind==="ext" && (frame ? part.axis==="frame" && sameFrameOrientation(part.frame,frame) : part.axis===axisOfView());
}
function frameRangeForBounds(bounds,frame) {
  var values=[];
  [bounds.x0,bounds.x1].forEach(function(x){[bounds.y0,bounds.y1].forEach(function(y){[bounds.z0,bounds.z1].forEach(function(z){values.push(frameProjectPoint(frame,{x:x,y:y,z:z}).w);});});});
  var lo=Math.min.apply(null,values),hi=Math.max.apply(null,values),pad=Math.max(2,(hi-lo)*.08);
  return {from:lo-pad,to:hi+pad};
}
function sameSketchContext(a,b) {
  if (!a || !b) return false;
  if (a.frameSpace==="local" || b.frameSpace==="local") return a.frameSpace==="local" && b.frameSpace==="local" && a.support && b.support && a.support.persistentId===b.support.persistentId;
  return a.plane===b.plane;
}
function partUV(p) {
  // returns projected 2D footprint for the current view: {type:'rect',u0,u1,v0,v1} | {type:'circle',u,v,r} | {type:'poly',pts}
  var b = partBounds(p);
  function rect(u0, u1, v0, v1) { return { type: "rect", u0: u0, u1: u1, v0: v0, v1: v1 }; }
  var frame=activeSketchFrame();
  if (frame) {
    if (p.kind==="ext" && p.frame && sameFrameOrientation(p.frame,frame)) {
      var projectLoop=function(loop){return (loop || []).map(function(q){var world=framePoint(p.frame,q.u,q.v,p.from);var local=frameProjectPoint(frame,world);return {u:local.u,v:local.v};});};
      return {type:"poly",pts:projectLoop(p.pts),holes:(p.holes || []).map(projectLoop)};
    }
    var projected=[];
    [b.x0,b.x1].forEach(function(x){[b.y0,b.y1].forEach(function(y){[b.z0,b.z1].forEach(function(z){projected.push(frameProjectPoint(frame,{x:x,y:y,z:z}));});});});
    return rect(Math.min.apply(null,projected.map(function(q){return q.u;})),Math.max.apply(null,projected.map(function(q){return q.u;})),Math.min.apply(null,projected.map(function(q){return q.v;})),Math.max.apply(null,projected.map(function(q){return q.v;})));
  }
  if ((p.kind === "direct" || p.kind === "mesh") && p.meshData) {
    var meshProjection=projectMeshEdges(p.meshData,E.view);
    if(meshProjection.segments.length)return meshProjection;
  }
  if (p.kind === "ext" && p.axis === axisOfView()) return { type: "poly", pts: p.pts };
  if (p.kind === "loft" && p.axis === axisOfView()) return { type: "poly", pts: p.pts0 };
  if (p.kind === "rev" && E.view === "top") return { type: "circle", u: p.x, v: p.z, r: revMaxR(p) };
  if (p.kind === "cyl" && E.view === "top") return { type: "circle", u: p.x, v: p.z, r: Math.max(p.r, p.r2 != null ? p.r2 : p.r) };
  if (p.kind === "sph") {
    if (E.view === "top") return { type: "circle", u: p.x, v: p.z, r: p.r };
    if (E.view === "front") return { type: "circle", u: p.x, v: p.y, r: p.r };
    return { type: "circle", u: p.z, v: p.y, r: p.r };
  }
  if (E.view === "top") return rect(b.x0, b.x1, b.z0, b.z1);
  if (E.view === "front") return rect(b.x0, b.x1, b.y0, b.y1);
  return rect(b.z0, b.z1, b.y0, b.y1);
}
function moveInView(p, du, dv) {
  if (p && p.type === "line") {
    var sketch = ensureSketch(E.def), pts = sketchLinePoints(p);
    if (pts.a) { pts.a.x += du; pts.a.y += dv; }
    if (pts.b && pts.b !== pts.a) { pts.b.x += du; pts.b.y += dv; }
    resolveSketch(false);
    return;
  }
  var frame=activeSketchFrame();
  if (frame) movePart(p,frame.xAxis.x*du+frame.yAxis.x*dv,frame.xAxis.y*du+frame.yAxis.y*dv,frame.xAxis.z*du+frame.yAxis.z*dv);
  else if (E.view === "top") movePart(p, du, 0, dv);
  else if (E.view === "front") movePart(p, du, dv, 0);
  else movePart(p, 0, dv, du);
}
/* ============ where the sketch sheet lives on screen ============
   Two mappings, one interface. In 2D (and in the read-only drawing) the sheet
   is a plain pan/zoom transform: E.ox/E.oy/E.scl. Sketching over the solid in
   3D used to use the same transform, which only lines up if the camera has
   first been snapped square to the plane — that forced "normal to" on every
   sketch and is exactly what a real CAD package does NOT do. Over the model we
   project the sketch plane through the live camera instead, so a profile can be
   drawn straight onto a face from whatever angle the model is being viewed at,
   and the view can be orbited mid-sketch without the geometry sliding off it.

   Everything downstream still speaks toPx/toUV, so nothing else had to know. */
function standardPlaneFrame(view, offset) {
  var w = fin(offset) ? offset : 0;
  if (view === "top") return {origin:{x:0,y:w,z:0},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:0,z:1},normal:{x:0,y:1,z:0}};
  if (view === "front") return {origin:{x:0,y:0,z:w},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},normal:{x:0,y:0,z:1}};
  return {origin:{x:w,y:0,z:0},xAxis:{x:0,y:0,z:1},yAxis:{x:0,y:1,z:0},normal:{x:1,y:0,z:0}};
}
/* The plane the sketch canvas is currently drawing on, in world space. Null
   whenever the plain 2D transform is the right one. */
/* toPx runs hundreds of times per repaint, and the projection costs two layout
   reads and a matrix update. It cannot change within a single frame unless we
   change it ourselves, so it is computed once and dropped at the frame
   boundary; anything that moves the camera or the canvas drops it by hand. */
function invalidateSketchProjection() { E._proj = undefined; }
function sketchProjection() {
  if (E._proj !== undefined) return E._proj;
  E._proj = computeSketchProjection();
  requestAnimationFrame(invalidateSketchProjection);
  return E._proj;
}
function computeSketchProjection() {
  if (E.mode !== "3d" || !E.modelPlaneActive) return null;
  if (!E.pv || !E.pv.cam || !E.cv || !E.pv.rr || !E.pv.rr.domElement) return null;
  var sketch = ensureSketch(E.def);
  var frame = activeSketchFrame() || standardPlaneFrame(E.view, sketch && sketch.offset);
  var host = E.pv.rr.domElement.getBoundingClientRect(), self = E.cv.getBoundingClientRect();
  if (host.width < 4 || host.height < 4) return null;
  // The camera is only where `place()` puts it once it has been placed, and its
  // world matrix has to be current or every projection is a frame stale.
  if (E.pv.place) E.pv.place();
  E.pv.cam.updateMatrixWorld(true);
  var proj = {
    frame: frame, cam: E.pv.cam,
    w: host.width, h: host.height,
    dx: host.left - self.left, dy: host.top - self.top,
  };
  // Screen scale at the plane origin. Hit tolerances, glyph sizes and dimension
  // offsets are all quoted in E.scl, so it has to stay meaningful here.
  var a = projectSketchPoint(proj, 0, 0), b = projectSketchPoint(proj, 1, 0), c = projectSketchPoint(proj, 0, 1);
  var scale = Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y));
  if (fin(scale) && scale > 0.01) E.scl = scale;
  return proj;
}
function projectSketchPoint(proj, u, v) {
  var world = framePoint(proj.frame, u, v, 0);
  var ndc = new THREE.Vector3(world.x, world.y, world.z).project(proj.cam);
  return { x: proj.dx + (ndc.x * .5 + .5) * proj.w, y: proj.dy + (-ndc.y * .5 + .5) * proj.h };
}
function toPx(u, v) {
  var proj = sketchProjection();
  if (proj) return projectSketchPoint(proj, u, v);
  var vv = !activeSketchFrame() && E.view === "top" ? v : -v; // framed and elevation sketches use v-up
  return { x: E.ox + u * E.scl, y: E.oy + vv * E.scl };
}
function toUV(px, py) {
  var proj = sketchProjection();
  if (proj) {
    // Cast the pointer ray and land it on the sketch plane. Behind the camera,
    // or parallel to the plane, there is no answer — hold the last one rather
    // than throwing geometry to infinity.
    var ndc = new THREE.Vector3(((px - proj.dx) / proj.w) * 2 - 1, -(((py - proj.dy) / proj.h) * 2 - 1), .5);
    ndc.unproject(proj.cam);
    var eye = proj.cam.position, dir = ndc.sub(eye).normalize();
    var n = proj.frame.normal, o = proj.frame.origin;
    var denom = dir.x * n.x + dir.y * n.y + dir.z * n.z;
    if (Math.abs(denom) < 1e-6) return E._lastUV || { u: 0, v: 0 };
    var travel = ((o.x - eye.x) * n.x + (o.y - eye.y) * n.y + (o.z - eye.z) * n.z) / denom;
    if (travel <= 0) return E._lastUV || { u: 0, v: 0 };
    var hit = frameProjectPoint(proj.frame, { x: eye.x + dir.x * travel, y: eye.y + dir.y * travel, z: eye.z + dir.z * travel });
    E._lastUV = { u: hit.u, v: hit.v };
    return E._lastUV;
  }
  var u = (px - E.ox) / E.scl, v = (py - E.oy) / E.scl;
  if (activeSketchFrame() || E.view !== "top") v = -v;
  return { u: u, v: v };
}

/* ================= DOM ================= */
var root = null;
var swapView = null;
function el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function btn(label, cb, cls) {
  var b = el("button", cls || "", label);
  b.addEventListener("click", cb);
  return b;
}

// tools carry their key in the caption so the shortcut is learnable in passing
function kt(label, key) { return label + " · " + key; }

/* Panel tabs are named, not guessed at. `ico("tab", …)` produced a 40px square
   whose only clue was a hover caption, so five of them read as five mystery
   buttons; a strip of labelled tabs is both smaller and self-explaining. */
function tab(id, icon, label, title, extra) {
  return '<button type="button" data-tab="' + id + '" title="' + (title || label) + '">' +
    '<i class="ph ' + icon + '"></i><span>' + label + "</span>" + (extra || "") + "</button>";
}
function tabstrip(side, tabs, extra) {
  return '<div class="md-strip" data-strip="' + side + '">' + tabs.join("") + (extra || "") + "</div>";
}

/* A labelled CommandManager button — the one place each command lives, so it
   is spelled out rather than left to a glyph.
   `full` is the unabbreviated name for the tooltip and for screen readers. The
   caption itself can be terse because the group heading right underneath
   already supplies the noun: "Rectangle" under "Sketch" says everything
   "Sketch rectangle" did, in half the ribbon. */
function commandButton(id, icon, label, key, cls, full) {
  var name = full || label;
  return (
    '<button type="button" class="md-command ' + (cls || "") + '" data-command="' + id +
    '" aria-label="' + name + '" title="' + name + (key ? " · " + key : "") + '">' +
    '<i class="ph ' + icon + '"></i><span>' + label + "</span>" +
    (key ? '<kbd>' + key + "</kbd>" : "") + "</button>"
  );
}

function commandGroup(label, commands) {
  return '<div class="md-command-group"><div class="md-command-items">' + commands.join("") +
    '</div><span class="md-command-group-label">' + label + "</span></div>";
}

/* The chrome is built once, with the labels of the language current at the
   time — and every icon's caption and the whole shortcut sheet are baked in at
   that moment. Throw it away on a language switch so the next open rebuilds it
   in the new one; the panes re-label themselves on every refresh anyway. */
function destroyDOM() {
  if (E.pv && E.pv.rr) E.pv.rr.dispose();
  E.pv = null;
  swapView = null; // it closes over elements that are about to be removed
  histPanel = null;
  E.cv = null;
  E.cx = null;
  E.mode = "3d";
  E.modelPlaneActive = false;
  window.removeEventListener("keydown", onKey);
  if (root) root.remove();
  root = null;
}

function buildDOM() {
  E.lang = getLang();
  root = el("div", "", "");
  root.id = "modeler";
  root.innerHTML =
    '<div class="md-head">' +
    '<div class="md-head-logo"><i class="ph ph-cube"></i> <b>' + t("title") + "</b>" +
    '<span class="md-sub" id="mdSub"></span></div>' +
    '<div class="md-docmodes" id="mdDocModes">' +
    '<button data-doc="part" class="on"><i class="ph ph-cube"></i> ' + t("docPart") + '</button>' +
    '<button data-doc="assembly"><i class="ph ph-cubes-three"></i> ' + t("docAssembly") + '</button>' +
    '</div>' +
    '<div class="md-head-inputs">' +
    '<label class="md-field"><span>' + t("name") + '</span><input id="mdName" type="text" autocomplete="off"></label>' +
    '<label class="md-field md-field-sm"><span>' + t("price") + '</span><input id="mdPrice" type="number" min="0"></label>' +
    "</div>" +
    /* Regenerate / STEP / drawing all have a labelled home in the Evaluate tab
       of the command manager. Repeating them here as unlabelled glyphs gave the
       same command two appearances and taught neither of them. */
    '<div class="md-head-actions">' +
    '<button id="mdUndo" data-tip="' + kt(t("undo"), "Ctrl+Z") + '"><i class="ph ph-arrow-u-up-left"></i></button>' +
    '<button id="mdRedo" data-tip="' + kt(t("redo"), "Ctrl+Y") + '"><i class="ph ph-arrow-u-up-right"></i></button>' +
    '<div class="md-separator"></div>' +
    '<button id="mdGuide" class="md-guide-launch" data-tip="' + t("guideTitle") + '"><i class="ph ph-graduation-cap"></i><span>' + t("guide") + '</span></button>' +
    '<button id="mdSave" class="btn-accent"><i class="ph ph-floppy-disk"></i> ' + t("save") + "</button>" +
    '<button id="mdClose" data-tip="Esc"><i class="ph ph-x"></i> ' + t("close") + "</button>" +
    "</div>" +
    "</div>" +
    /* One line, not five cards. The five phases still read left to right and
       still carry their live readout, but as a breadcrumb they cost 26px
       instead of 60 and stop competing with the ribbon for attention. */
    '<nav class="md-workflow" id="mdWorkflow" aria-label="Parametric modeling workflow">' +
      '<button type="button" data-workflow-step="context"><b>Part</b><small id="mdWorkflowContext">cm · origin</small></button>' +
      '<button type="button" data-workflow-step="reference"><b>Reference</b><small id="mdWorkflowReference">none</small></button>' +
      '<button type="button" data-workflow-step="sketch"><b>Sketch</b><small id="mdWorkflowSketch">empty</small></button>' +
      '<button type="button" data-workflow-step="feature"><b>Feature</b><small id="mdWorkflowFeature">none</small></button>' +
      '<button type="button" data-workflow-step="history"><b>History</b><small id="mdWorkflowHistory">0 steps</small></button>' +
    '</nav>' +
    '<div class="md-commandmanager" aria-label="Command manager">' +
    '<div class="md-command-tabs" role="tablist">' +
    '<button type="button" class="on" data-cmdtab="features" role="tab">' + t("cmdFeatures") + '</button>' +
    '<button type="button" data-cmdtab="sketch" role="tab">' + t("cmdSketch") + '</button>' +
    '<button type="button" data-cmdtab="evaluate" role="tab">' + t("cmdEvaluate") + '</button>' +
    '<button type="button" data-cmdtab="assembly" role="tab">' + t("cmdAssembly") + '</button>' +
    '<button type="button" id="mdCommandSearchBtn" class="md-command-search-btn" aria-label="' + t("cmdSearch") + '" title="' + kt(t("cmdSearch"), "Ctrl+K") + '"><i class="ph ph-magnifying-glass"></i><span>' + t("cmdSearch") + '</span><kbd>Ctrl K</kbd></button>' +
    '</div>' +
    '<div class="md-command-panes">' +
    '<div class="md-command-pane on" data-command-pane="features">' +
      commandGroup("Start", [
        commandButton("newsketch", "ph-pencil-line", "Create sketch", null, "primary"),
        commandButton("extrude", "ph-cube", t("opExtrude"), null, "primary"),
        commandButton("extrudecut", "ph-scissors", "Extrude cut", null),
        commandButton("revolvefeature", "ph-arrow-counter-clockwise", t("opRevolve"), "R"),
        commandButton("sweepfeature", "ph-path", "Sweep"),
        commandButton("loftfeature", "ph-stack", "Loft"),
      ]) +
      commandGroup("Finish", [
        commandButton("filletfeature", "ph-corners-out", "Fillet"),
        commandButton("chamferfeature", "ph-corners-in", "Chamfer"),
        commandButton("shellfeature", "ph-bowl-food", "Shell"),
        commandButton("patternfeature", "ph-dots-nine", "Pattern"),
        commandButton("mirrorfeature", "ph-flip-horizontal", "Mirror"),
        commandButton("booleanfeature", "ph-intersect", "Boolean"),
      ]) +
      commandGroup("References", [
        commandButton("refplane", "ph-square-half", "Plane", null, "", "Reference plane"),
        commandButton("refaxis", "ph-axis-arrow", "Axis", null, "", "Reference axis"),
        commandButton("coordsys", "ph-crosshair", "Coord sys", null, "", "Coordinate system"),
      ]) +
      commandGroup("Standards", [
        commandButton("stdscrew", "ph-screwdriver", "Screw", null, "", "ISO 4017 hex screw"),
        commandButton("stdgear", "ph-gear-six", "Gear", null, "", "ISO involute gear"),
      ]) +
    '</div>' +
    '<div class="md-command-pane" data-command-pane="sketch">' +
      commandGroup(t("grpSketch"), [
        commandButton("select", "ph-cursor", t("cap_select"), "V", "", t("tool_select")),
        commandButton("wall", "ph-line-segment", t("cap_wall"), "L", "", t("tool_wall")),
        commandButton("srect", "ph-rectangle", t("cap_srect"), "Q", "", t("tool_srect")),
        commandButton("scirc", "ph-circle-dashed", t("cap_scirc"), "G", "", t("tool_scirc")),
        commandButton("sarc", "ph-bezier-curve", t("cap_sarc"), "A", "", t("tool_sarc")),
        commandButton("sslot", "ph-pill", t("tool_sslot"), "J"),
        commandButton("spoly", "ph-hexagon", t("cap_spoly"), "N", "", t("tool_spoly")),
        commandButton("sell", "ph-circle", t("tool_sell"), "Y"),
        commandButton("dim", "ph-ruler", t("cap_dim"), "D", "primary", t("tool_dim")),
        commandButton("trim", "ph-scissors", t("tool_trim"), "T"),
        commandButton("extend", "ph-arrows-out-line-horizontal", t("tool_extend"), "E"),
      ]) +
      commandGroup(t("grpSketchEdit"), [
        commandButton("offset", "ph-copy-simple", t("tool_offset")),
        commandButton("constr", "ph-line-segments", t("cap_constr"), null, "", t("tool_constr")),
        commandButton("mirror", "ph-flip-horizontal", t("sketchMirror")),
        commandButton("pattern", "ph-dots-nine", t("cap_pattern"), null, "", t("sketchPattern")),
        commandButton("circpattern", "ph-circles-three", t("cap_circpattern"), null, "", t("sketchCircPattern")),
        commandButton("project", "ph-projector-screen", t("cap_project"), null, "", t("projectEdges")),
      ]) +
    '</div>' +
    '<div class="md-command-pane" data-command-pane="evaluate">' +
      commandGroup(t("cmdEvaluate"), [
        commandButton("regen", "ph-arrows-clockwise", "Regenerate", "Ctrl+B", "primary", t("regenerate")),
        commandButton("fit", "ph-crosshair-simple", t("zoomFit"), "F"),
        commandButton("drawing", "ph-file-svg", t("drawingExport")),
        commandButton("mass", "ph-scales", "Mass", null, "", "Mass properties"),
        commandButton("standards", "ph-seal-check", "Audit", null, "", "DIN / ISO standards audit"),
        commandButton("bundle", "ph-package", "Save bundle", null, "", "Export project bundle"),
        commandButton("bundlein", "ph-package", "Open bundle", null, "", "Import project bundle"),
      ]) +
      commandGroup("STEP", [
        commandButton("stepin", "ph-upload-simple", "Import", null, "", t("stepImport")),
        commandButton("stepout", "ph-file-step", "Export", null, "", t("stepExport")),
        commandButton("igesout", "ph-file-arrow-down", "IGES", null, "", "Export IGES"),
        // the unit override belongs next to the import it modifies, not in the header
        '<label class="md-command-field"><span>Source units</span>' +
        '<select id="mdStepUnit" aria-label="STEP source units"><option value="auto">Auto</option>' +
        '<option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option>' +
        '<option value="in">inch</option><option value="ft">feet</option></select></label>',
      ]) +
    '</div>' +
    '<div class="md-command-pane" data-command-pane="assembly">' +
      commandGroup(t("cmdAssembly"), [
        commandButton("assembly", "ph-cubes-three", t("docAssembly"), null, "primary"),
        commandButton("components", "ph-cube", t("components")),
        commandButton("mates", "ph-link", t("mate")),
        commandButton("partdoc", "ph-cube-focus", t("docPart")),
        commandButton("explode", "ph-arrows-out", "Explode", null, "", "Exploded view"),
        commandButton("motion", "ph-play-circle", "Motion", null, "", "Motion study"),
        commandButton("interference", "ph-intersect", "Interference"),
        commandButton("bom", "ph-table", "BOM", null, "", "Bill of materials"),
      ]) +
    '</div></div></div>' +
    '<div class="md-body">' +

    /* ---- left: design intent and ordered model history ----
       Every sketch tool and every feature op used to be repeated here as an
       unlabelled glyph while also living in the command manager above. One
       home per command: the ribbon owns the verbs, this panel owns the model
       tree. What's left is a plain text tab strip. */
    '<div class="md-panel md-left">' +
    tabstrip("L", [
      tab("parts", "ph-tree-structure", t("tabTreeShort"), t("tabTreeLong"), '<span class="md-badge" id="mdPartBadge"></span>'),
      tab("lib", "ph-folder-open", t("tabLibShort"), t("tabLib")),
      tab("set", "ph-sliders-horizontal", t("tabSetShort"), t("tabSet")),
    ], '<button type="button" class="md-strip-act" data-act="new" title="' + t("newModel") + '"><i class="ph ph-file-plus"></i></button>') +
    '<div class="md-strip-meta"><span class="md-hsize" id="mdSize"></span></div>' +
    '<div class="md-tabs" data-side="L">' +
    '<div class="md-pane on" data-pane="parts"><div id="mdParts"></div></div>' +
    '<div class="md-pane" data-pane="lib"><div id="mdLib"></div></div>' +
    '<div class="md-pane" data-pane="set"><div id="mdCons"></div></div>' +
    "</div>" +
    /* A property manager, not a launcher. The nine buttons that used to sit in
       this panel were the same nine commands as the Features ribbon tab,
       permanently parked over the model; now the panel only exists while a
       feature is being defined, it titles itself after that feature, and it
       covers the tree rather than the live preview it is there to show. */
    '<aside class="md-quick-tools" id="mdQuickTools" aria-label="' + t("quickTools") + '">' +
    '<div class="md-quick-settings" id="mdQuickSettings" hidden></div>' +
    '</aside>' +
    "</div>" +

    /* ---- middle: the drawing, full-bleed, with its controls floating on it ---- */
    '<div class="md-mid">' +
    '<canvas id="mdCanvas"></canvas>' +
    '<div id="md3dHost" class="md-3dhost"></div>' +
    '<div class="md-modes" id="mdModes">' +
    '<button data-mode="3d" class="on" data-tip="3"><i class="ph ph-cube"></i> ' + t("mode3d") + "</button>" +
    '<button data-mode="2d" data-tip="2"><i class="ph ph-pencil-line"></i> ' + t("mode2d") + "</button>" +
    '<button data-mode="drawing" data-tip="7"><i class="ph ph-file-svg"></i> ' + t("modeDrawing") + "</button>" +
    "</div>" +
    '<div class="md-drawing-tools" id="mdDrawingTools" role="toolbar" aria-label="Drawing correction tools">' +
    '<button type="button" data-drawing-tool="select" class="on"><i class="ph ph-hand"></i><span>' + t("panDrawing") + '</span></button>' +
    '<button type="button" data-drawing-tool="dim"><i class="ph ph-ruler"></i><span>' + t("smartRuler") + '</span><kbd>D</kbd></button>' +
    '<span class="md-drawing-tools-sep"></span>' +
    '<button type="button" id="mdDrawingSave" class="save"><i class="ph ph-floppy-disk"></i><span>' + t("save") + '</span></button>' +
    '</div>' +
    '<div class="md-views" id="mdViews">' +
    '<div class="md-vgroup">' +
    '<button data-view="top" data-tip="' + kt(t("view_top"), "4") + '"><i class="ph ph-arrow-line-down"></i><span>' + (getLang()==="en"?"Top":"על") + ' · X·Z</span></button>' +
    '<button data-view="front" data-tip="' + kt(t("view_front"), "5") + '"><i class="ph ph-arrow-line-right"></i><span>' + (getLang()==="en"?"Front":"חזית") + ' · X·Y</span></button>' +
    '<button data-view="side" data-tip="' + kt(t("view_right"), "6") + '"><i class="ph ph-arrow-line-up"></i><span>' + (getLang()==="en"?"Right":"ימין") + ' · Z·Y</span></button>' +
    "</div>" +
    '<div class="md-vgroup md-zoom">' +
    '<button data-zoom="in" data-tip="' + t("zoomIn") + '"><i class="ph ph-plus"></i></button>' +
    '<button data-zoom="out" data-tip="' + t("zoomOut") + '"><i class="ph ph-minus"></i></button>' +
    '<button data-zoom="fit" data-tip="' + kt(t("zoomFit"), "F") + '"><i class="ph ph-crosshair-simple"></i></button>' +
    '</div>' +
    '<div class="md-vgroup md-display" role="group" aria-label="Model display style">' +
    '<button type="button" data-display="solid" class="on" aria-pressed="true"><i class="ph ph-cube"></i><span>' + t("solidView") + '</span></button>' +
    '<button type="button" data-display="transparent" aria-pressed="false"><i class="ph ph-cube-focus"></i><span>' + t("transparentView") + '</span></button>' +
    '</div><button type="button" id="mdFinishPlane" class="md-finish-plane"><i class="ph ph-check"></i><span>' + t("exitPlane") + '</span></button></div>' +
    '<div class="md-hint" id="mdHint"></div>' +
    '<div class="md-context-actions" id="mdContextActions" hidden>' +
    '<button type="button" id="mdAcceptCommand" class="accept" aria-label="' + t("finishCommand") + '" title="' + t("finishCommand") + '"><i class="ph ph-check"></i></button>' +
    '<button type="button" id="mdCancelCommand" class="cancel" aria-label="' + t("cancelCommand") + '" title="' + t("cancelCommand") + '"><i class="ph ph-x"></i></button>' +
    '<span id="mdActiveCommand"></span></div>' +
    '<div class="md-status" id="mdStatus"></div>' +
    "</div>" +

    /* ---- right: the model as it will look, and the selected part ---- */
    '<div class="md-panel md-right" id="mdRightPanel">' +
    '<div id="mdRightResizer" class="md-resizer"></div>' +
    '<div class="md-prev-wrap">' +
    '<canvas id="mdPrev"></canvas>' +
    '<label class="md-context-toggle"><input type="checkbox" id="mdContextBtn"><span>' + t("contextRoom") + "</span></label>" +
    "</div>" +
    tabstrip("R", [
      tab("sketch", "ph-compass-tool", t("tabSketchShort"), t("tabSketch"), '<span class="md-badge" id="mdDofBadge"></span>'),
      tab("shape", "ph-ruler", t("tabShapeShort"), t("tabShape")),
      tab("look", "ph-paint-brush", t("tabLookShort"), t("tabLook")),
      tab("ops", "ph-magic-wand", t("tabOpsShort"), t("tabOps")),
      tab("hist", "ph-clock-counter-clockwise", t("tabHistShort"), t("tabHist")),
    ]) +
    '<div class="md-strip-meta"><span class="md-hsel" id="mdSelName"></span></div>' +
    '<div class="md-tabs" data-side="R">' +
    '<div class="md-pane" data-pane="sketch"><div id="mdSketch"></div></div>' +
    '<div class="md-pane on" data-pane="shape"><div id="mdInsp"></div></div>' +
    '<div class="md-pane" data-pane="look"><div id="mdLook"></div></div>' +
    '<div class="md-pane" data-pane="ops"><div id="mdOps"></div></div>' +
    '<div class="md-pane" data-pane="hist"><div id="mdHist"></div></div>' +
    "</div></div></div>" +
    '<div class="md-command-search" id="mdCommandSearch" hidden role="dialog" aria-modal="true" aria-label="' + t("cmdSearch") + '">' +
    '<div class="md-command-search-card"><div class="md-command-search-input"><i class="ph ph-magnifying-glass"></i>' +
    '<input id="mdCommandSearchInput" type="search" autocomplete="off" placeholder="' + t("cmdSearchHint") + '"><kbd>Esc</kbd></div>' +
    '<div id="mdCommandResults" class="md-command-results" role="listbox"></div></div></div>' +
    '<div class="md-reference-picker" id="mdReferencePicker" hidden>' +
      '<section role="dialog" aria-modal="true" aria-labelledby="mdReferenceTitle">' +
        '<header><div><small>NEW SKETCH</small><h3 id="mdReferenceTitle">Choose a stable reference</h3></div><button type="button" data-reference-cancel aria-label="Cancel"><i class="ph ph-x"></i></button></header>' +
        '<p>A sketch must be attached to a plane or planar face. This reference remains in design history and is resolved on every rebuild.</p>' +
        '<div class="md-reference-options" id="mdReferenceOptions"></div>' +
      '</section></div>' +
    '<div class="md-reference-picker md-report" id="mdReport" hidden>' +
      '<section role="dialog" aria-modal="true" aria-labelledby="mdReportTitle">' +
        '<header><div><small id="mdReportKicker"></small><h3 id="mdReportTitle"></h3></div><button type="button" data-report-close aria-label="' + t("close") + '"><i class="ph ph-x"></i></button></header>' +
        '<pre id="mdReportBody"></pre>' +
      '</section></div>' +
    '<div class="md-tour-layer" id="mdTour" hidden>' +
      '<section class="md-tour-card" role="dialog" aria-modal="false" aria-labelledby="mdTourTitle">' +
        '<div class="md-tour-head" title="Drag to move"><div><span id="mdTourCount"></span><h3 id="mdTourTitle"></h3></div>' +
        '<button type="button" id="mdTourClose" aria-label="' + t("guideClose") + '" title="' + t("guideClose") + '"><i class="ph ph-x"></i></button></div>' +
        '<div class="md-tour-progress" aria-hidden="true"><span id="mdTourProgress"></span></div>' +
        '<p id="mdTourBody"></p><div class="md-tour-demo" id="mdTourDemo" hidden aria-hidden="true"></div><div class="md-tour-tracks" id="mdTourTracks" hidden></div>' +
        '<label class="md-tour-slider" id="mdTourSlider" hidden><span>' + t("guideAutoSlider") + '</span><output id="mdTourSliderValue"></output><input id="mdTourRange" type="range" min="0" value="0"></label>' +
        '<div class="md-tour-tip"><i class="ph ph-lightbulb"></i><span id="mdTourTip"></span></div>' +
        '<div class="md-tour-status" id="mdTourStatus" role="status"></div>' +
        '<div class="md-tour-actions"><button type="button" id="mdTourBack"><i class="ph ph-arrow-right"></i>' + t("guideBack") + '</button>' +
        '<button type="button" id="mdTourSkip" class="md-tour-skip">' + t("guideSkip") + '</button>' +
        '<button type="button" id="mdTourKeep" class="md-tour-skip" title="' + t("guideKeepResultTip") + '" hidden>' + t("guideKeepResult") + '</button>' +
        '<button type="button" id="mdTourNext" class="btn-accent">' + t("guideNext") + '<i class="ph ph-arrow-left"></i></button></div>' +
      '</section></div>';
  document.body.appendChild(root);

  // tools: mutually exclusive, one drawing mode at a time
  root.querySelectorAll("[data-tool]").forEach(function (b) {
    b.addEventListener("click", function () { setTool(b.getAttribute("data-tool")); });
  });
  root.querySelectorAll("[data-drawing-tool]").forEach(function (b) {
    b.addEventListener("click", function () { setTool(b.getAttribute("data-drawing-tool")); });
  });
  root.querySelectorAll("[data-cmdtab]").forEach(function (b) {
    b.addEventListener("click", function () { setCommandTab(b.getAttribute("data-cmdtab")); });
  });
  root.querySelectorAll("[data-command]").forEach(function (b) {
    b.addEventListener("click", function () { runCommand(b.getAttribute("data-command")); });
  });
  root.querySelectorAll("[data-view]").forEach(function (b) {
    b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
  });
  root.querySelectorAll("[data-zoom]").forEach(function (b) {
    b.addEventListener("click", function () { zoomBy(b.getAttribute("data-zoom")); });
  });
  root.querySelectorAll("[data-display]").forEach(function (b) {
    b.addEventListener("click", function () { setModelDisplay(b.getAttribute("data-display")); });
  });
  root.querySelector("#mdFinishPlane").addEventListener("click", finishSketchWorkflow);
  // tabs swap the pane inside their own panel; the two panels are independent
  root.querySelectorAll("[data-tab]").forEach(function (b) {
    b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); });
  });
  root.querySelector('[data-act="new"]').addEventListener("click", newModel);
  root.querySelectorAll("[data-workflow-step]").forEach(function(button){
    button.addEventListener("click",function(){
      var step=button.getAttribute("data-workflow-step");
      if(step==="reference"||step==="sketch")beginSketchWorkflow();
      else if(step==="feature")setCommandTab("features");
      else if(step==="history")setTab("parts");
    });
  });
  root.querySelector("[data-reference-cancel]").addEventListener("click",cancelReferenceSelection);
  root.querySelector("[data-report-close]").addEventListener("click",closeReport);
  root.querySelector("#mdReport").addEventListener("click",function(event){ if(event.target===this) closeReport(); });
  root.querySelectorAll("#mdDocModes [data-doc]").forEach(function (b) {
    b.addEventListener("click", function () { setDocumentType(b.getAttribute("data-doc")); });
  });

  // sketch settings live in their own pane now, so they never crowd the tools
  var cons = root.querySelector("#mdCons");
  cons.innerHTML =
    '<label class="md-row"><span class="t">' + t("gridSize") + '</span><input id="mdGrid" type="number" value="5" min="1"><span class="u">cm</span></label>' +
    '<label class="md-check"><input type="checkbox" id="mdOsnap" checked><span>' + t("osnap") + "</span></label>" +
    '<label class="md-check"><input type="checkbox" id="mdNormalTo"><span>' + t("prefNormalTo") + "</span></label>" +
    '<label class="md-check"><input type="checkbox" id="mdAutoDim"><span>' + t("prefAutoDim") + "</span></label>" +
    '<div class="md-sep"></div>' +
    '<label class="md-row"><span class="t">' + t("depth") + '</span><input id="mdDepth" type="number" value="60" min="1"><span class="u">cm</span></label>' +
    '<label class="md-row"><span class="t">' + t("base") + '</span><input id="mdBase" type="number" value="0"><span class="u">cm</span></label>' +
    '<label class="md-row"><span class="t">' + t("wallWidth") + '</span><input id="mdWallWidth" type="number" value="10" min="0.5"><span class="u">cm</span></label>' +
    '<div class="md-note">' + t("ortho") + "</div>" +
    '<h5 class="md-h5">' + t("keysTitle") + "</h5>" +
    '<div class="md-keys">' +
    [
      [t("tool_select"), "V"], [t("tool_rect"), "B"], [t("tool_circle"), "C"], [t("tool_sph"), "S"],
      [t("tool_wall"), "L"], [t("tool_srect"), "Q"], [t("tool_scirc"), "G"], [t("tool_sarc"), "A"],
      [t("tool_dim"), "D"], [t("tool_trim"), "T"], [t("tool_extend"), "E"],
      [t("tool_poly"), "P"], [t("tool_rev"), "R"], [t("tool_cut"), "X"], [t("tool_cutc"), "O"],
      [t("mode3d") + " / " + t("mode2d") + " / " + t("modeDrawing"), "3 / 2 / 7"],
      [t("view_top") + " / " + t("view_front") + " / " + t("view_right"), "4 / 5 / 6"],
      [t("zoomFit"), "F"], [t("ortho"), "Shift"], [t("normalTo"), "Ctrl+8"],
      [t("cmdSearch"), "Ctrl+K · /"], [t("regenerate"), "Ctrl+B"],
      [t("undo") + " / " + t("redo"), "Ctrl+Z / Y"], [t("del"), "Del"], [t("close"), "Esc"],
    ].map(function (k) { return '<div class="md-key"><span>' + k[0] + "</span><kbd>" + k[1] + "</kbd></div>"; }).join("") +
    "</div>";
  cons.querySelector("#mdOsnap").checked = !!E.osnap;
  cons.querySelector("#mdOsnap").addEventListener("change", function () { E.osnap = this.checked; saveModelerPrefs(); });
  var normalToBox = cons.querySelector("#mdNormalTo");
  normalToBox.checked = !!E.sketchNormalTo;
  normalToBox.addEventListener("change", function () {
    E.sketchNormalTo = this.checked;
    saveModelerPrefs();
    if (E.sketchNormalTo) orientModelToView(true); else if (E.pv) E.pv.clearFixedFrame(true);
    drawSketch();
  });
  var autoDimBox = cons.querySelector("#mdAutoDim");
  autoDimBox.checked = !!E.autoDimTyped;
  autoDimBox.addEventListener("change", function () { E.autoDimTyped = this.checked; saveModelerPrefs(); });
  cons.querySelector("#mdGrid").addEventListener("change", function () { E.grid = Math.max(1, +this.value || 5); drawSketch(); syncStatus(); });
  cons.querySelector("#mdDepth").addEventListener("change", function () { E.depth = Math.max(1, +this.value || 60); });
  cons.querySelector("#mdBase").addEventListener("change", function () { E.baseOff = +this.value || 0; });
  cons.querySelector("#mdWallWidth").addEventListener("change", function () { E.wallWidth = Math.max(0.5, +this.value || 10); });

  root.querySelector("#mdSave").addEventListener("click", saveCurrentDocument);
  root.querySelector("#mdDrawingSave").addEventListener("click", saveCurrentDocument);
  root.querySelector("#mdGuide").addEventListener("click", startTour);
  root.querySelector("#mdClose").addEventListener("click", closeModeler);
  root.querySelector("#mdUndo").addEventListener("click", doUndo);
  root.querySelector("#mdRedo").addEventListener("click", doRedo);
  root.querySelector("#mdCommandSearchBtn").addEventListener("click", function () { openCommandSearch(); });
  root.querySelector("#mdCommandSearchInput").addEventListener("input", renderCommandResults);
  root.querySelector("#mdCommandSearch").addEventListener("pointerdown", function (e) {
    if (e.target === this) closeCommandSearch();
  });
  root.querySelector("#mdAcceptCommand").addEventListener("click", finishActiveCommand);
  root.querySelector("#mdCancelCommand").addEventListener("click", cancelActiveCommand);
  root.querySelector("#mdTourClose").addEventListener("click", closeTour);
  installTourDragging();
  root.querySelector("#mdTourBack").addEventListener("click", function () { goTourStep(-1); });
  root.querySelector("#mdTourSkip").addEventListener("click", function () { goTourStep(1, true); });
  // `change`, not `input`: every seek replays the demo, and re-running it for
  // each pixel of a slider drag locked the editor up for seconds at a time.
  root.querySelector("#mdTourRange").addEventListener("change", function () { seekAutomaticTour(+this.value); });
  root.querySelector("#mdTourRange").addEventListener("input", function () {
    var value = +this.value, steps = tourSteps();
    root.querySelector("#mdTourSliderValue").textContent = (value + 1) + " / " + steps.length;
  });
  root.querySelector("#mdTourKeep").addEventListener("click", function () { E.tour.keepResult = true; closeTour(); });
  root.querySelector("#mdTourNext").addEventListener("click", function () {
    if (E.tour.mode === "auto") { if(E.tour.step>=tourSteps().length-1)closeTour();else seekAutomaticTour(E.tour.step+1, true); return; }
    if (E.tour.step >= tourSteps().length - 1) closeTour();
    else goTourStep(1);
  });
  root.querySelectorAll("#mdModes button").forEach(function (b) {
    b.addEventListener("click", function () {
      var mode=b.getAttribute("data-mode");
      if(mode==="2d"&&isCanonicalAuthoring()&&E.authoring.phase!=="sketch")beginSketchWorkflow();
      else if(mode==="3d"&&E.authoring.phase==="sketch")finishSketchWorkflow();
      else setMode(mode);
    });
  });
  histPanel = createHistoryPanel(H, {
    showBaseline: true,
    scope: docScope,
    onPick: docPick,
  });
  root.querySelector("#mdHist").appendChild(histPanel.el);
  root.querySelector("#mdName").addEventListener("change", function () {
    if (E.docType === "assembly" && E.assembly) E.assembly.name = this.value;
    else E.def.name = this.value;
  });
  root.querySelector("#mdPrice").addEventListener("change", function () { if (E.docType === "part") E.def.price = +this.value || 0; });

  E.cv = root.querySelector("#mdCanvas");
  E.cx = E.cv.getContext("2d");
  wireSketch();
  watchSketchSize();
  initPreview();

  // Resize logic for right panel
  var resizer = root.querySelector("#mdRightResizer");
  var rightPanel = root.querySelector("#mdRightPanel");
  var rDrag = null;
  resizer.addEventListener("pointerdown", function (e) {
    resizer.setPointerCapture(e.pointerId);
    rDrag = { startX: e.clientX, startW: rightPanel.offsetWidth };
  });
  resizer.addEventListener("pointermove", function (e) {
    if (!rDrag) return;
    var dx = document.documentElement.dir === "rtl" ? e.clientX - rDrag.startX : rDrag.startX - e.clientX;
    var newW = Math.max(260, Math.min(rDrag.startW + dx, window.innerWidth - 420));
    rightPanel.style.width = newW + "px";
    sizeSketch();
    drawSketch();
    if (E.pv && E.pv.rr) renderPreview();
  });
  resizer.addEventListener("pointerup", function () { rDrag = null; });

  root.querySelector("#mdContextBtn").addEventListener("change", function(e) {
    E.pv.inRoom = e.target.checked;
    renderPreview();
  });

  window.addEventListener("keydown", onKey);
}

/* ================= interactive sketch guide =================
   This is a coach layered over the real editor, not a detached slideshow. Each
   practice step observes the document state, so Continue unlocks only after
   the user has actually performed the modelling action. */
function tourEntityCount() {
  return E.def ? (ensureSketch(E.def).entities || []).length : 0;
}
function tourConstraintCount(type) {
  if (!E.def) return 0;
  return (ensureSketch(E.def).constraints || []).filter(function (c) { return !c.suppressed && c.type === type; }).length;
}
function tourPointSignature() {
  if (!E.def) return "";
  return (ensureSketch(E.def).points || []).map(function (p) {
    return p.id + ":" + Math.round(p.x * 1000) + "," + Math.round(p.y * 1000);
  }).sort().join("|");
}

function sketchTourSteps() {
  return [
    { title:"guideIntroTitle", body:"guideIntroBody", tip:"guideIntroTip", target:".md-commandmanager", manual:true },
    { title:"guideToolsTitle", body:"guideToolsBody", tip:"guideToolsTip", target:'[data-command="srect"]',
      prepare:function () { setCommandTab("sketch"); },
      done:function () { return E.tool === "srect"; } },
    { title:"guideDrawTitle", body:"guideDrawBody", tip:"guideDrawTip", target:".md-mid",
      baseline:function () { return tourEntityCount(); },
      prepare:function () { setCommandTab("sketch"); if (E.tool !== "srect") setTool("srect"); },
      done:function () { return tourEntityCount() >= Number(E.tour.baseline || 0) + 4; } },
    { title:"guideMoveTitle", body:"guideMoveBody", tip:"guideMoveTip", target:".md-mid",
      baseline:tourPointSignature,
      prepare:function () { setTool("select"); E.ssel = []; E.sel = null; refreshAll(); },
      done:function () { return !!E.tour.baseline && tourPointSignature() !== E.tour.baseline; } },
    { title:"guideSelectTitle", body:"guideSelectBody", tip:"guideSelectTip", target:".md-mid",
      prepare:function () { setTool("select"); E.ssel = []; E.sel = null; refreshAll(); },
      done:function () { return selLines().length === 1; } },
    { title:"guideDimTitle", body:"guideDimBody", tip:"guideDimTip", target:'[data-tour-prop="length"]',
      baseline:function () { return tourConstraintCount("distance"); },
      prepare:function () { setTool("select"); setTab("shape"); },
      done:function () { return tourConstraintCount("distance") > Number(E.tour.baseline || 0); } },
    { title:"guidePairTitle", body:"guidePairBody", tip:"guidePairTip", target:".md-mid",
      prepare:function () { setTool("select"); E.ssel = []; E.sel = null; setTab("sketch"); refreshAll(); },
      done:function () { return selLines().length === 2; } },
    { title:"guideRelationTitle", body:"guideRelationBody", tip:"guideRelationTip", target:'[data-constraint="equal"]',
      baseline:function () { return tourConstraintCount("equal"); },
      prepare:function () { setTab("sketch"); },
      done:function () { return tourConstraintCount("equal") > Number(E.tour.baseline || 0); } },
    { title:"guideFinishTitle", body:"guideFinishBody", tip:"guideFinishTip", target:'[data-tab="sketch"]', manual:true },
  ];
}

function tourPartCount(kind) {
  return !E.def ? 0 : (E.def.parts || []).filter(function (part) { return !part.suppressed && (!kind || part.kind === kind); }).length;
}
function tourAssemblyTransformSignature() {
  return !E.assembly ? "" : E.assembly.components.map(function (component) {
    var tr = normalizeTransform(component);
    return component.id + ":" + [tr.x,tr.y,tr.z,tr.rx,tr.ry,tr.rz].join(",");
  }).join("|");
}

function tourAllSketchEntityCount(type) {
  if (!E.def) return 0;
  return ensureSketchDoc(E.def).reduce(function (sum, sketch) {
    return sum + (sketch.entities || []).filter(function (entity) { return !type || entity.type === type; }).length;
  }, 0);
}
function tourCutCount() {
  if (!E.def) return 0;
  return (E.def.parts || []).reduce(function (sum, part) {
    return sum + (part.holes || []).length + (part.cuts3d || []).length;
  }, 0);
}
function tourSketchIsFullyDefined(sketch) {
  return !!sketch && (sketch.entities || []).length > 0 && solveSketch(sketch).status === "fully-constrained";
}
function tourActiveSketchIsFullyDefined() {
  return !!E.def && tourSketchIsFullyDefined(ensureSketch(E.def));
}
function tourCubeIsComplete() {
  if (!E.def) return false;
  var modeledSketches = ensureSketchDoc(E.def).filter(function (sketch) {
    return (sketch.entities || []).length > 0;
  });
  var rebuildErrors = E.coreRun && E.coreRun.issues
    ? E.coreRun.issues.some(function (issue) { return issue.severity === "error"; })
    : false;
  return modeledSketches.length >= 4
    && modeledSketches.every(tourSketchIsFullyDefined)
    && tourPartCount("ext") >= 1
    && tourCutCount() >= 3
    && !rebuildErrors;
}
function solidworksCubeTourSteps() {
  return [
    {title:"swIntroTitle",body:"swIntroBody",tip:"swIntroTip",target:'.md-commandmanager',manual:true,
      prepare:function(){if(E.docType!=="part")setDocumentType("part");setMode("2d");setView("top");setCommandTab("sketch");}},
    {title:"swPlaneTitle",body:"swPlaneBody",tip:"swPlaneTip",target:'[data-command="srect"]',
      prepare:function(){setMode("2d");setView("top");setCommandTab("sketch");},done:function(){return E.view==="top"&&E.tool==="srect";}},
    {title:"swRectTitle",body:"swRectBody",tip:"swRectTip",target:'.md-mid',baseline:function(){return tourEntityCount();},
      prepare:function(){setMode("2d");setView("top");if(E.tool!=="srect")setTool("srect");},done:function(){return tourEntityCount()>=Number(E.tour.baseline||0)+4;}},
    {title:"swDimTitle",body:"swDimBody",tip:"swDimTip",target:'[data-command="dim"]',
      prepare:function(){setCommandTab("sketch");},done:tourActiveSketchIsFullyDefined},
    {title:"swExtrudeTitle",body:"swExtrudeBody",tip:"swExtrudeTip",target:'[data-command="extrude"]',baseline:function(){return tourPartCount("ext");},
      prepare:function(){setMode("2d");setCommandTab("features");},done:function(){return tourPartCount("ext")>Number(E.tour.baseline||0);}},
    {title:"swCircleTitle",body:"swCircleBody",tip:"swCircleTip",target:'[data-command="scirc"]',baseline:function(){return tourAllSketchEntityCount("circle");},
      prepare:function(){setMode("3d");setCommandTab("sketch");},done:function(){return tourAllSketchEntityCount("circle")>Number(E.tour.baseline||0);}},
    {title:"swDiameterTitle",body:"swDiameterBody",tip:"swDiameterTip",target:'[data-command="dim"]',
      prepare:function(){setMode("2d");setCommandTab("sketch");},done:tourActiveSketchIsFullyDefined},
    {title:"swCutTitle",body:"swCutBody",tip:"swCutTip",target:'[data-command="extrudecut"]',baseline:tourCutCount,
      prepare:function(){setMode("3d");setView("front");var p=(E.def.parts||[]).filter(function(q){return q.kind==="ext";}).slice(-1)[0];if(p)E.sel=p;refreshAll();},done:function(){return tourCutCount()>Number(E.tour.baseline||0);}},
    /* The right and top bores repeat the front bore, and they used to be
       `manual` — the guide stopped checking exactly where the work gets hard,
       so Continue passed whether or not anything had been modelled. They now
       observe the document the same way steps 5–7 do. */
    {title:"swRightCircleTitle",body:"swRightCircleBody",tip:"swCircleTip",target:'[data-command="scirc"]',baseline:function(){return tourAllSketchEntityCount("circle");},
      prepare:function(){setMode("2d");setView("side");setCommandTab("sketch");},done:function(){return tourAllSketchEntityCount("circle")>Number(E.tour.baseline||0);}},
    {title:"swRightDimTitle",body:"swRightDimBody",tip:"swDimTip",target:'[data-command="dim"]',
      prepare:function(){setMode("2d");setCommandTab("sketch");},done:tourActiveSketchIsFullyDefined},
    {title:"swRightCutTitle",body:"swOtherCutsBody",tip:"swFeatureFormTip",target:'[data-command="extrudecut"]',baseline:tourCutCount,
      prepare:function(){setMode("3d");setCommandTab("features");},done:function(){return tourCutCount()>Number(E.tour.baseline||0);}},
    {title:"swTopCircleTitle",body:"swTopCircleBody",tip:"swCircleTip",target:'[data-command="scirc"]',baseline:function(){return tourAllSketchEntityCount("circle");},
      prepare:function(){setMode("2d");setView("top");setCommandTab("sketch");},done:function(){return tourAllSketchEntityCount("circle")>Number(E.tour.baseline||0);}},
    {title:"swTopDimTitle",body:"swTopDimBody",tip:"swDimTip",target:'[data-command="dim"]',
      prepare:function(){setMode("2d");setCommandTab("sketch");},done:tourActiveSketchIsFullyDefined},
    {title:"swTopCutTitle",body:"swOtherCutsBody",tip:"swFeatureFormTip",target:'[data-command="extrudecut"]',baseline:tourCutCount,
      prepare:function(){setMode("3d");setCommandTab("features");},done:function(){return tourCutCount()>Number(E.tour.baseline||0);}},
    {title:"swFilletTitle",body:"swFilletBody",tip:"swFilletTip",target:'#mdHist',
      prepare:function(){setMode("3d");setTab("hist");refreshAll();},done:tourCubeIsComplete},
    {title:"swFinishTitle",body:"swFinishBody",tip:"swFinishTip",target:'[data-mode="3d"]',prepare:function(){setMode("3d");},done:tourCubeIsComplete},
  ];
}
function addPracticeAssemblyComponent(index) {
  var color = index ? "#62a6d8" : "#d89b62";
  var def = {
    key:"tour_component_" + index, name:index ? "Tutorial cap" : "Tutorial base", price:0, col:color,
    parts:[{id:uid(),kind:"box",name:index ? "cap" : "base",x0:-10,x1:10,y0:0,y1:index?8:12,z0:-10,z1:10,color:color,metal:0.05,rough:0.7}],
    constraints:[],sketches:[],features:[],variables:[],
  };
  E.assembly.components.push({
    id:uid(), modelKey:def.key, name:def.name, def:def, visible:true,
    grounded:E.assembly.components.length === 0,
    transform:{x:E.assembly.components.length * 28,y:0,z:0,rx:0,ry:0,rz:0},
  });
}
function ensurePracticeAssembly() {
  if (E.docType !== "assembly") setDocumentType("assembly");
  if (!E.assembly) E.assembly = newAssembly();
  while (E.assembly.components.length < 2) addPracticeAssemblyComponent(E.assembly.components.length);
  E.componentSel = []; E.sel = null;
  setTab("parts"); refreshAll(); fitPreview();
}

function flowerTourSteps() {
  return [
    {title:"flowerIntroTitle",body:"flowerIntroBody",tip:"flowerIntroTip",target:'.md-command-pane[data-command-pane="features"]',manual:true,
      prepare:function(){ if(E.docType!=="part")setDocumentType("part");setMode("2d");setView("front");setCommandTab("features");setTab("parts");}},
    {title:"flowerCenterTitle",body:"flowerCenterBody",tip:"flowerCenterTip",target:'.md-mid',
      baseline:function(){return tourPartCount("sph");},prepare:function(){setView("front");setTool("sph");},
      done:function(){return tourPartCount("sph")>Number(E.tour.baseline||0);}},
    {title:"flowerPetalsTitle",body:"flowerPetalsBody",tip:"flowerPetalsTip",target:'.md-mid',
      baseline:function(){return tourPartCount("sph");},prepare:function(){setTool("sph");},
      done:function(){return tourPartCount("sph")>=Number(E.tour.baseline||0)+4;}},
    {title:"flowerStemTitle",body:"flowerStemBody",tip:"flowerStemTip",target:'.md-mid',
      baseline:function(){return tourPartCount("box");},prepare:function(){setTool("rect");},
      done:function(){return tourPartCount("box")>Number(E.tour.baseline||0);}},
    {title:"flowerPotTitle",body:"flowerPotBody",tip:"flowerPotTip",target:'.md-mid',
      baseline:function(){return tourPartCount("box");},prepare:function(){setTool("rect");},
      done:function(){return tourPartCount("box")>Number(E.tour.baseline||0);}},
    {title:"flowerViewTitle",body:"flowerViewBody",tip:"flowerViewTip",target:'[data-mode="3d"]',
      done:function(){return E.mode==="3d";}},
    {title:"flowerFinishTitle",body:"flowerFinishBody",tip:"flowerFinishTip",target:'[data-tab="look"]',manual:true},
  ];
}

function preparePrimitiveProject(view) {
  if(E.docType!=="part")setDocumentType("part");setMode("2d");setView(view||"top");setCommandTab("features");setTab("parts");
}
function projectViewStep() {
  return {title:"projectViewTitle",body:"projectViewBody",tip:"projectModelTip",target:'[data-mode="3d"]',done:function(){return E.mode==="3d";}};
}
function standardizedPartCount(family) {
  return !E.def?0:(E.def.parts||[]).filter(function(p){return p.standardCompliance&&p.standardCompliance.family===family;}).length;
}
function screwTourSteps() {
  return [
    {title:"screwIntroTitle",body:"screwIntroBody",tip:"projectModelTip",target:'.md-command-pane[data-command-pane="features"]',manual:true,prepare:function(){preparePrimitiveProject("top");}},
    {title:"screwShaftTitle",body:"screwShaftBody",tip:"projectModelTip",target:'[data-command="stdscrew"]',baseline:function(){return standardizedPartCount("hex-screw");},prepare:function(){setCommandTab("features");},done:function(){return standardizedPartCount("hex-screw")>Number(E.tour.baseline||0);}},
    {title:"standardAuditTitle",body:"standardAuditBody",tip:"projectModelTip",target:'[data-command="standards"]',prepare:function(){setCommandTab("evaluate");},done:function(){return !!(E.def.lastStandardsAudit&&E.def.lastStandardsAudit.ok);}},
    projectViewStep(),
    {title:"screwFinishTitle",body:"screwIntroBody",tip:"projectModelTip",target:'[data-tab="look"]',manual:true},
  ];
}
function gearTourSteps() {
  return [
    {title:"gearIntroTitle",body:"gearIntroBody",tip:"projectModelTip",target:'.md-command-pane[data-command-pane="features"]',manual:true,prepare:function(){preparePrimitiveProject("top");}},
    {title:"gearBlankTitle",body:"gearBlankBody",tip:"projectModelTip",target:'[data-command="stdgear"]',baseline:function(){return standardizedPartCount("involute-gear");},prepare:function(){setCommandTab("features");},done:function(){return standardizedPartCount("involute-gear")>Number(E.tour.baseline||0);}},
    {title:"standardAuditTitle",body:"standardAuditBody",tip:"projectModelTip",target:'[data-command="standards"]',prepare:function(){setCommandTab("evaluate");},done:function(){return !!(E.def.lastStandardsAudit&&E.def.lastStandardsAudit.ok);}},
    projectViewStep(),
    {title:"gearFinishTitle",body:"gearIntroBody",tip:"projectModelTip",target:'[data-tab="look"]',manual:true},
  ];
}
function studBallTourSteps() {
  return [
    {title:"studIntroTitle",body:"studIntroBody",tip:"projectModelTip",target:'.md-command-pane[data-command-pane="features"]',manual:true,prepare:function(){preparePrimitiveProject("front");}},
    {title:"studCoreTitle",body:"studCoreBody",tip:"projectModelTip",target:'.md-mid',baseline:function(){return tourPartCount("sph");},prepare:function(){setTool("sph");},done:function(){return tourPartCount("sph")>Number(E.tour.baseline||0);}},
    {title:"studAddTitle",body:"studAddBody",tip:"projectModelTip",target:'.md-mid',baseline:function(){return tourPartCount("sph");},prepare:function(){setTool("sph");},done:function(){return tourPartCount("sph")>=Number(E.tour.baseline||0)+6;}},
    projectViewStep(),
    {title:"studFinishTitle",body:"studIntroBody",tip:"projectModelTip",target:'[data-tab="look"]',manual:true},
  ];
}
/* Pattern is the one feature people report as "broken": it silently does
   nothing without a selected solid, and overlapping spacing looks like a
   no-op. Both failure modes get their own step here. */
function patternTourSteps() {
  return [
    {title:"patternIntroTitle",body:"patternIntroBody",tip:"projectModelTip",target:'.md-command-pane[data-command-pane="features"]',manual:true,prepare:function(){preparePrimitiveProject("front");}},
    {title:"patternSeedTitle",body:"patternSeedBody",tip:"projectModelTip",target:'.md-mid',
      baseline:function(){return tourPartCount("box");},prepare:function(){setTool("rect");},
      done:function(){return tourPartCount("box")>Number(E.tour.baseline||0);}},
    {title:"patternSelectTitle",body:"patternSelectBody",tip:"projectModelTip",target:'#mdParts',
      prepare:function(){setTool("select");setTab("parts");refreshAll();},
      done:function(){return !!selectedSolid();}},
    {title:"patternOpenTitle",body:"patternOpenBody",tip:"projectModelTip",target:'[data-command="patternfeature"]',
      prepare:function(){setCommandTab("features");},
      done:function(){return E.authoring.featureType==="pattern";}},
    {title:"patternLinearTitle",body:"patternLinearBody",tip:"projectModelTip",target:'#mdQuickSettings',
      baseline:function(){return tourPartCount();},
      done:function(){return tourPartCount()>Number(E.tour.baseline||0);}},
    {title:"patternCircularTitle",body:"patternCircularBody",tip:"projectModelTip",target:'[data-command="patternfeature"]',
      baseline:function(){return tourPartCount();},prepare:function(){setCommandTab("features");},
      done:function(){return tourPartCount()>Number(E.tour.baseline||0);}},
    projectViewStep(),
    {title:"patternFinishTitle",body:"patternIntroBody",tip:"projectModelTip",target:'[data-tab="look"]',manual:true},
  ];
}
function dreidelTourSteps() {
  return [
    {title:"dreidelIntroTitle",body:"dreidelIntroBody",tip:"projectModelTip",target:'.md-command-pane[data-command-pane="features"]',manual:true,prepare:function(){preparePrimitiveProject("front");}},
    {title:"dreidelToolTitle",body:"dreidelToolBody",tip:"projectModelTip",target:'[data-command="revolvefeature"]',done:function(){return E.tool==="rev";}},
    {title:"dreidelProfileTitle",body:"dreidelProfileBody",tip:"projectModelTip",target:'.md-mid',baseline:function(){return tourPartCount("rev");},prepare:function(){if(E.tool!=="rev")setTool("rev");},done:function(){return tourPartCount("rev")>Number(E.tour.baseline||0);}},
    projectViewStep(),
    {title:"dreidelFinishTitle",body:"dreidelIntroBody",tip:"projectModelTip",target:'[data-tab="look"]',manual:true},
  ];
}

function assemblyTourSteps() {
  return [
    {title:"assemblyIntroTitle",body:"assemblyIntroBody",tip:"assemblyIntroTip",target:'[data-command-pane="assembly"]',manual:true,prepare:ensurePracticeAssembly},
    {title:"assemblyPickTitle",body:"assemblyPickBody",tip:"assemblyPickTip",target:'#mdParts',
      prepare:function(){setTab("parts");E.componentSel=[];E.sel=null;refreshAll();},
      done:function(){return E.componentSel.length===1;}},
    {title:"assemblyMoveTitle",body:"assemblyMoveBody",tip:"assemblyMoveTip",target:'#mdInsp .md-prop-grid',
      baseline:tourAssemblyTransformSignature,
      prepare:function(){var c=E.assembly&&E.assembly.components.filter(function(q){return !q.grounded;})[0];if(c){E.componentSel=[c];E.sel=c;}setTab("shape");refreshAll();},
      done:function(){return tourAssemblyTransformSignature()!==E.tour.baseline;}},
    {title:"assemblyPairTitle",body:"assemblyPairBody",tip:"assemblyPairTip",target:'#mdParts',
      prepare:function(){setTab("parts");E.componentSel=[];E.sel=null;refreshAll();},
      done:function(){return E.componentSel.length===2;}},
    {title:"assemblyMateTitle",body:"assemblyMateBody",tip:"assemblyMateTip",target:'[data-mate="alignX"]',
      baseline:function(){return E.assembly?(E.assembly.mates||[]).length:0;},prepare:function(){setTab("ops");},
      done:function(){return E.assembly&&(E.assembly.mates||[]).length>Number(E.tour.baseline||0);}},
    {title:"assemblySaveTitle",body:"assemblySaveBody",tip:"assemblySaveTip",target:'#mdSave',
      done:function(){return E.assembly&&loadAssemblies().some(function(a){return a.key===E.assembly.key;});}},
    {title:"assemblyFinishTitle",body:"assemblyFinishBody",tip:"assemblyFinishTip",target:'[data-command-pane="assembly"]',manual:true},
  ];
}

function tourSteps() {
  if (E.tour.track === "solidworks") return solidworksCubeTourSteps();
  if (E.tour.track === "flower") return flowerTourSteps();
  if (E.tour.track === "assembly") return assemblyTourSteps();
  if (E.tour.track === "screw") return screwTourSteps();
  if (E.tour.track === "gear") return gearTourSteps();
  if (E.tour.track === "studball") return studBallTourSteps();
  if (E.tour.track === "dreidel") return dreidelTourSteps();
  if (E.tour.track === "pattern") return patternTourSteps();
  return sketchTourSteps();
}

function clearTourTarget() {
  if (!root) return;
  root.querySelectorAll(".md-tour-target").forEach(function (node) { node.classList.remove("md-tour-target"); });
  root.querySelectorAll(".md-tour-click-marker").forEach(function(node){node.remove();});
  E.tour.target = null;
}

function showTourClickMarker(target) {
  if(!root||!target||E.tour.mode!=="auto")return;
  var tr=target.getBoundingClientRect(),rr=root.getBoundingClientRect(),marker=document.createElement("span");
  marker.className="md-tour-click-marker";marker.innerHTML='<i class="ph ph-cursor-click"></i>';
  marker.style.left=(tr.left-rr.left+tr.width/2)+"px";marker.style.top=(tr.top-rr.top+tr.height/2)+"px";
  root.appendChild(marker);
}

function clampTourPosition(position) {
  if (!root) return position;
  var card=root.querySelector(".md-tour-card"), rr=root.getBoundingClientRect();
  if(!card)return position;
  var margin=12,maxX=Math.max(margin,rr.width-card.offsetWidth-margin),maxY=Math.max(margin,rr.height-card.offsetHeight-margin);
  return {x:Math.min(maxX,Math.max(margin,position.x)),y:Math.min(maxY,Math.max(margin,position.y))};
}

function applyTourPosition() {
  if(!root)return;
  var card=root.querySelector(".md-tour-card");if(!card)return;
  if(!E.tour.position){
    // Parked against the trailing edge, not centred: centred put the card on
    // top of the canvas, which is the one thing most steps ask you to look at.
    var rr=root.getBoundingClientRect(),rtl=getLang()!=="en";
    E.tour.position={x:rtl?24:Math.max(12,rr.width-card.offsetWidth-24),y:Math.max(12,rr.height-card.offsetHeight-32)};
  }
  E.tour.position=clampTourPosition(E.tour.position);
  card.style.left=E.tour.position.x+"px";card.style.top=E.tour.position.y+"px";
}

/* Keep the card off the control it is pointing at. Only for targets small
   enough to dodge — for the canvas there is nowhere to go, and shuffling the
   card around on every step is worse than leaving it parked. */
function avoidTourTargetOverlap(target) {
  if(!root||!target||E.tour.moved)return;
  var card=root.querySelector(".md-tour-card");if(!card)return;
  var rr=root.getBoundingClientRect(),tr=target.getBoundingClientRect(),cr=card.getBoundingClientRect();
  if(tr.width>rr.width*0.5&&tr.height>rr.height*0.5)return;
  if(cr.right<tr.left||cr.left>tr.right||cr.bottom<tr.top||cr.top>tr.bottom)return;
  var margin=16,w=card.offsetWidth,h=card.offsetHeight;
  var options=[
    {x:tr.right-rr.left+margin,y:E.tour.position.y},
    {x:tr.left-rr.left-w-margin,y:E.tour.position.y},
    {x:E.tour.position.x,y:tr.bottom-rr.top+margin},
    {x:E.tour.position.x,y:tr.top-rr.top-h-margin},
  ];
  for(var i=0;i<options.length;i++){
    var o=options[i];
    if(o.x<margin||o.y<margin||o.x+w>rr.width-margin||o.y+h>rr.height-margin)continue;
    var left=rr.left+o.x,top=rr.top+o.y;
    if(left+w<tr.left||left>tr.right||top+h<tr.top||top>tr.bottom){E.tour.position=o;applyTourPosition();return;}
  }
}

function installTourDragging() {
  if(!root)return;
  var card=root.querySelector(".md-tour-card"),handle=root.querySelector(".md-tour-head");
  if(!card||!handle)return;
  handle.addEventListener("pointerdown",function(event){
    if(event.button!==0||event.target.closest("button"))return;
    applyTourPosition();
    E.tour.drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,originX:E.tour.position.x,originY:E.tour.position.y};
    E.tour.moved=true;   // once placed by hand, stop repositioning it for them
    handle.setPointerCapture(event.pointerId);card.classList.add("is-dragging");event.preventDefault();
  });
  handle.addEventListener("pointermove",function(event){
    var drag=E.tour.drag;if(!drag||drag.pointerId!==event.pointerId)return;
    E.tour.position=clampTourPosition({x:drag.originX+event.clientX-drag.startX,y:drag.originY+event.clientY-drag.startY});
    applyTourPosition();
  });
  function finish(event){if(!E.tour.drag||E.tour.drag.pointerId!==event.pointerId)return;E.tour.drag=null;card.classList.remove("is-dragging");}
  handle.addEventListener("pointerup",finish);handle.addEventListener("pointercancel",finish);
}

function tourStepDone(step, index) {
  if (!step || step.manual) return true;
  if (E.tour.completed[index]) return true;
  try {
    var done = !!step.done();
    if (done) E.tour.completed[index] = true;
    return done;
  } catch (error) { return false; }
}

function renderTourDemo(step,index) {
  var host=root&&root.querySelector("#mdTourDemo");if(!host||!step)return;
  var form=String(step.target||"").indexOf("QuickSettings")>=0||String(step.title||"").toLowerCase().indexOf("extrude")>=0||String(step.title||"").toLowerCase().indexOf("fillet")>=0;
  var canvas=String(step.target||"").indexOf("md-mid")>=0;
  var phase=form?2:canvas?1:0,icons=form?["ph-cursor-click","ph-keyboard","ph-check-circle"]:canvas?["ph-crosshair","ph-pencil-line","ph-ruler"]:["ph-selection","ph-eye","ph-check-circle"],en=getLang()==="en";
  var labels=form?(en?["Select feature","Fill every field","Apply + rebuild"]:["בחירת תכונה","מילוי כל השדות","Apply ובנייה"]):canvas?(en?["Choose reference","Create geometry","Fully constrain"]:["בחירת מישור","יצירת גאומטריה","הגדרה מלאה"]):(en?["Find the control","Check the result","Continue"]:["מציאת הכלי","בדיקת התוצאה","המשך"]);
  host.hidden=false;host.innerHTML='<div class="md-tour-demo-scene phase-'+phase+'"><span class="md-tour-demo-cursor"><i class="ph ph-cursor"></i></span>'+labels.map(function(label,i){return '<span class="md-tour-demo-stage '+(i===phase?'active':'')+'"><i class="ph '+icons[i]+'"></i><b>'+label+'</b></span>';}).join('<i class="ph ph-arrow-right md-tour-demo-arrow"></i>')+'</div>';
}

function renderTourHub() {
  if (!root) return;
  var layer=root.querySelector("#mdTour"),tracks=root.querySelector("#mdTourTracks");
  layer.hidden=false;root.classList.add("md-tour-open");clearTourTarget();
  root.querySelector("#mdTourCount").textContent=t("guideTitle");
  root.querySelector("#mdTourTitle").textContent=t("guideHubTitle");
  root.querySelector("#mdTourBody").textContent=t("guideHubBody");
  root.querySelector(".md-tour-progress").hidden=true;
  root.querySelector(".md-tour-tip").hidden=true;
  root.querySelector("#mdTourDemo").hidden=true;
  root.querySelector("#mdTourStatus").hidden=true;
  root.querySelector(".md-tour-actions").hidden=true;
  root.querySelector("#mdTourSlider").hidden=true;
  tracks.hidden=false;
  tracks.innerHTML=[
    ["sketch","ph-compass-tool","guideSketchTrack","guideSketchTrackDesc"],
    ["solidworks","ph-cube-focus","guideSolidworksTrack","guideSolidworksTrackDesc"],
    ["flower","ph-flower-lotus","guideFlowerTrack","guideFlowerTrackDesc"],
    ["assembly","ph-cubes-three","guideAssemblyTrack","guideAssemblyTrackDesc"],
    ["screw","ph-screwdriver","guideScrewTrack","guideScrewTrackDesc"],
    ["gear","ph-gear-six","guideGearTrack","guideGearTrackDesc"],
    ["studball","ph-circle-dashed","guideStudBallTrack","guideStudBallTrackDesc"],
    ["dreidel","ph-selection-foreground","guideDreidelTrack","guideDreidelTrackDesc"],
    ["pattern","ph-dots-nine","guidePatternTrack","guidePatternTrackDesc"],
  ].map(function(item){return '<button type="button" data-tour-track="'+item[0]+'"><i class="ph '+item[1]+'"></i><span><b>'+t(item[2])+'</b><small>'+t(item[3])+'</small></span><i class="ph '+(getLang()==="en"?"ph-arrow-right":"ph-arrow-left")+'"></i></button>';}).join("");
  tracks.querySelectorAll("[data-tour-track]").forEach(function(button){button.addEventListener("click",function(){renderTourMode(button.getAttribute("data-tour-track"));});});
  requestAnimationFrame(applyTourPosition);
}

function renderTourMode(track) {
  if (!root) return;
  E.tour.track=track; clearTourTarget();
  root.querySelector("#mdTourCount").textContent=t("guideTitle");
  root.querySelector("#mdTourTitle").textContent=t("guideModeTitle");
  root.querySelector("#mdTourBody").textContent=t("guideModeBody");
  root.querySelector(".md-tour-progress").hidden=true;
  root.querySelector(".md-tour-tip").hidden=true;
  root.querySelector("#mdTourDemo").hidden=true;
  root.querySelector("#mdTourStatus").hidden=true;
  root.querySelector(".md-tour-actions").hidden=false;
  root.querySelector("#mdTourSlider").hidden=true;
  var tracks=root.querySelector("#mdTourTracks"); tracks.hidden=false;
  tracks.innerHTML='<button type="button" data-tour-mode="interactive"><i class="ph ph-hand-tap"></i><span><b>'+t("guideInteractiveMode")+'</b><small>'+t("guideInteractiveModeDesc")+'</small></span><i class="ph '+(getLang()==="en"?"ph-arrow-right":"ph-arrow-left")+'"></i></button>'+
    '<button type="button" data-tour-mode="auto"><i class="ph ph-play-circle"></i><span><b>'+t("guideAutoMode")+'</b><small>'+t("guideAutoModeDesc")+'</small></span><i class="ph '+(getLang()==="en"?"ph-arrow-right":"ph-arrow-left")+'"></i></button>';
  tracks.querySelectorAll("[data-tour-mode]").forEach(function(button){button.addEventListener("click",function(){selectTourTrack(track,button.getAttribute("data-tour-mode"));});});
  var back=root.querySelector("#mdTourBack"); back.disabled=false;
  back.innerHTML='<i class="ph '+(getLang()==="en"?"ph-arrow-left":"ph-arrow-right")+'"></i>'+t("guideTracksBack");
  back.onclick=function(){E.tour.track=null;E.tour.mode=null;renderTourHub();};
  root.querySelector("#mdTourSkip").hidden=true; root.querySelector("#mdTourNext").hidden=true;
}

function selectTourTrack(track, mode) {
  E.tour.track=track;E.tour.mode=mode||"interactive";E.tour.step=0;E.tour.completed={};
  var back=root&&root.querySelector("#mdTourBack"); if(back)back.onclick=null;
  if(E.tour.mode==="auto") {
    E.tour.autoOrigin={docType:E.docType,def:cloneData(E.def),assembly:cloneData(E.assembly),mode:E.mode,view:E.view,tool:E.tool,commandTab:E.commandTab};
    seekAutomaticTour(0);
  } else prepareTourStep();
}

function renderTour() {
  if (!root || !E.tour.active) return;
  if (!E.tour.track) { renderTourHub(); return; }
  var steps = tourSteps(), index = Math.max(0, Math.min(E.tour.step, steps.length - 1)), step = steps[index];
  var layer = root.querySelector("#mdTour"), done = tourStepDone(step, index);
  layer.hidden = false;
  root.classList.add("md-tour-open");
  root.querySelector("#mdTourTracks").hidden = true;
  root.querySelector(".md-tour-progress").hidden = false;
  root.querySelector(".md-tour-tip").hidden = false;
  root.querySelector(".md-tour-actions").hidden = false;
  var slider=root.querySelector("#mdTourSlider"),range=root.querySelector("#mdTourRange");
  slider.hidden=E.tour.mode!=="auto";
  if(E.tour.mode==="auto"){range.max=steps.length-1;range.value=index;root.querySelector("#mdTourSliderValue").textContent=(index+1)+" / "+steps.length;}
  root.querySelector("#mdTourTitle").textContent = E.tour.mode === "auto" ? t("guideAutoWatching") + " · " + t(step.title) : t(step.title);
  root.querySelector("#mdTourBody").textContent = E.tour.mode === "auto" ? t("guideAutoBody") : t(step.body);
  root.querySelector("#mdTourTip").textContent = t(step.tip);
  renderTourDemo(step,index);
  // The slider counts every card; the header used to count only the practice
  // steps between intro and summary, so the two disagreed on every screen.
  root.querySelector("#mdTourCount").textContent = index === 0 ? t("guideTitle")
    : index === steps.length - 1 ? t("guideDone")
    : t("guideStep") + " " + (index + 1) + " " + t("guideOf") + " " + steps.length;
  root.querySelector("#mdTourProgress").style.width = Math.round((index / (steps.length - 1)) * 100) + "%";
  var status = root.querySelector("#mdTourStatus");
  status.hidden = E.tour.mode === "auto" || !!step.manual;
  status.classList.toggle("done", done);
  status.innerHTML = done
    ? '<i class="ph ph-check-circle"></i> ' + t("guideDone")
    : '<i class="ph ph-hand-tap"></i> ' + t("guideWaiting");
  var back = root.querySelector("#mdTourBack"), next = root.querySelector("#mdTourNext"), skip = root.querySelector("#mdTourSkip");
  back.disabled = false;
  skip.hidden = E.tour.mode === "auto" || !!step.manual;
  root.querySelector("#mdTourKeep").hidden = E.tour.mode !== "auto";
  next.hidden = false;
  next.disabled = E.tour.mode === "auto" ? false : !done;
  next.innerHTML = index === steps.length - 1
    ? '<i class="ph ph-check"></i>' + t("guideFinish")
    : t("guideNext") + '<i class="ph ' + (getLang() === "en" ? "ph-arrow-right" : "ph-arrow-left") + '"></i>';
  back.innerHTML = '<i class="ph ' + (getLang() === "en" ? "ph-arrow-left" : "ph-arrow-right") + '"></i>' + (index === 0 ? t("guideTracksBack") : t("guideBack"));
  clearTourTarget();
  var target = root.querySelector(step.target);
  if (target) {
    target.classList.add("md-tour-target");
    E.tour.target = target;
    showTourClickMarker(target);
  }
  requestAnimationFrame(function () { applyTourPosition(); avoidTourTargetOverlap(target); });
}

function prepareTourStep() {
  var steps = tourSteps(), step = steps[E.tour.step];
  if (!step) return;
  E.tour.preparing = true;
  E.tour.baseline = step.baseline ? step.baseline() : null;
  if (step.prepare) step.prepare();
  E.tour.preparing = false;
  renderTour();
}

function tourMaterial(color) { return {color:color||"#55b7a7",metal:0.08,rough:0.58}; }
function tourBox(x0,x1,y0,y1,z0,z1,color,name) { return addPart(Object.assign({id:uid(),kind:"box",name:name||"Demo box",x0:x0,x1:x1,y0:y0,y1:y1,z0:z0,z1:z1},tourMaterial(color))); }
function tourCylinder(x,y,z,r,h,color,name) { return addPart(Object.assign({id:uid(),kind:"cyl",name:name||"Demo cylinder",x:x,y:y,z:z,r:r,h:h},tourMaterial(color))); }
function tourSphere(x,y,z,r,color,name) { return addPart(Object.assign({id:uid(),kind:"sph",name:name||"Demo sphere",x:x,y:y,z:z,r:r},tourMaterial(color))); }
function tourCircleLoop(u,v,r,segments) {
  var loop=[];segments=segments||32;
  for(var i=0;i<segments;i++){var a=i*Math.PI*2/segments;loop.push({u:u+Math.cos(a)*r,v:v+Math.sin(a)*r});}
  return loop;
}

function fullyDimensionTourRectangle(lines,size) {
  var sketch=ensureSketch(E.def);if(!lines||lines.length<2)return;
  var anchor=sketchPoint(sketch,lines[0].a);if(!anchor)return;
  sketch.constraints.push({id:uid(),type:"fixed",point:anchor.id,x:anchor.x,y:anchor.y});
  sketch.constraints.push({id:uid(),type:"distance",entity:lines[0].id,value:size});
  sketch.constraints.push({id:uid(),type:"distance",entity:lines[1].id,value:size});
  resolveSketch(false);
}

function fullyDimensionTourCircle(circle,diameter) {
  var sketch=ensureSketch(E.def),centre=circle&&sketchPoint(sketch,circle.c);if(!circle||!centre)return;
  sketch.constraints.push({id:uid(),type:"fixed",point:centre.id,x:centre.x,y:centre.y});
  sketch.constraints.push({id:uid(),type:"diameter",entity:circle.id,value:diameter});resolveSketch(false);
}

function showTourFeatureForm(type,values) {
  openParametricFeature(type);
  Object.keys(values||{}).forEach(function(key){
    var input=root&&root.querySelector('#mdQuickSettings input[data-parameter="'+key+'"],#mdQuickSettings select[data-parameter="'+key+'"]');if(!input)return;
    if(input.type==="checkbox")input.checked=!!values[key];else input.value=values[key];
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
}

function createTourSketch(view,name) {
  var sketch=addSketch(E.def,view,0,name);E.def.activeSketch=sketch.id;E.view=view;
  E.authoring.sketchId=sketch.id;E.authoring.sketchSelection=[sketch.id];return sketch;
}

/* Only ever commit a form that is actually open. The apply button survives in
   the DOM after the panel closes, so an unguarded click applied the previous
   feature a second time. */
function applyOpenTourFeature() {
  var host=root&&root.querySelector("#mdQuickSettings");if(!host||host.hidden)return;
  var button=host.querySelector(".md-quick-apply");if(button)button.click();
}

function insertISO4017Screw() {
  if(E.docType!=="part")setDocumentType("part");
  var group=uid(),spec={family:"hex-screw",standard:"ISO 4017:2022",diameterMm:8,pitchMm:1.25,lengthMm:30,flankAngleDeg:60,toleranceClass:"6g",productGrade:"A",series:"coarse",headAcrossFlatsMm:13,headHeightMm:5.3};
  var acrossCorners=13/Math.sqrt(3)/10,hex=[];
  for(var i=0;i<6;i++){var a=Math.PI/6+i*Math.PI/3;hex.push({u:Math.cos(a)*acrossCorners,v:Math.sin(a)*acrossCorners});}
  pushUndo(t("stdScrewCommand"));
  addPart(Object.assign({id:uid(),kind:"cyl",name:"ISO 4017 M8×30",x:0,y:0,z:0,r:.4,h:3,standardGroupId:group,standardRole:"thread",standardCompliance:spec,threadGeometry:{mode:"modeled",profile:"ISO-metric-60",pitchMm:1.25,flankAngleDeg:60,toleranceClass:"6g"}},tourMaterial("#aeb7c2")));
  addPart(Object.assign({id:uid(),kind:"ext",name:"Hex head",axis:"y",from:3,to:3.53,pts:hex,holes:[],standardGroupId:group,standardRole:"head"},tourMaterial("#bbc3cc")));
  E.def.lastStandardsAudit=null;E.sel=E.def.parts[E.def.parts.length-2];refreshAll();fitSketch();updateTourProgress();
}

function insertISOInvoluteGear() {
  if(E.docType!=="part")setDocumentType("part");
  var spec={family:"involute-gear",standard:"ISO 21771-1:2024",rackStandard:"ISO 53:1998",moduleStandard:"ISO 54:1996",moduleMm:2,teeth:20,pressureAngleDeg:20,profile:"involute",pitchDiameterMm:40};
  pushUndo(t("stdGearCommand"));
  addPart(Object.assign({id:uid(),kind:"ext",name:"ISO involute gear m2 z20",axis:"y",from:0,to:.8,pts:involuteGearOutline(spec),holes:[],standardCompliance:spec},tourMaterial("#d0a84b")));
  E.def.lastStandardsAudit=null;E.sel=E.def.parts[E.def.parts.length-1];refreshAll();fitSketch();updateTourProgress();
}

function performAutomaticTourStep(track,index,showFields) {
  if(!E.tour.active||E.tour.mode!=="auto")return;
  if(track==="solidworks") {
    if(index===0){setDocumentType("part");E.def=newDef();E.def.name=getLang()==="en"?"CAD cube tutorial":"תרגול קוביית CAD";E.sel=null;E.ssel=[];E.topologySelection=[];E.authoring={phase:"sketch",referenceId:"plane:top",sketchId:null,featureType:null,sketchSelection:[],featureSelection:[]};setMode("2d");setView("top");setCommandTab("sketch");ensureSketch(E.def);}
    if(index===1){setMode("2d");setView("top");setCommandTab("sketch");setTool("srect");}
    if(index===2){var rectLines=addSketchRectangle({u:-30,v:-30},{u:30,v:30});E.tour.autoLines=rectLines||[];}
    if(index===3&&E.tour.autoLines&&E.tour.autoLines.length)fullyDimensionTourRectangle(E.tour.autoLines,60);
    if(index===4){E.depth=60;E.baseOff=0;showTourFeatureForm("extrude",{endCondition:"blind",depth:60,offset:0,direction:"forward",symmetric:false,draftAngle:0,draftOutward:false,mergeResult:true});if(!showFields)applyOpenTourFeature();}
    if(index===5){setMode("2d");createTourSketch("front","Front bore sketch");setCommandTab("sketch");var circle=addSketchCircle({u:0,v:30},{u:20,v:30});E.tour.autoCircle=circle;E.ssel=circle?[circle]:[];E.sel=circle||null;}
    if(index===6&&E.tour.autoCircle)fullyDimensionTourCircle(E.tour.autoCircle,40);
    if(index===7){showTourFeatureForm("extrudeCut",{endCondition:"through-all",depth:60,offset:0,direction:"forward",symmetric:false,draftAngle:0,draftOutward:false,keepTool:false});if(!showFields)applyOpenTourFeature();}
    if(index===8){setMode("2d");createTourSketch("side","Right bore sketch");setCommandTab("sketch");E.tour.autoCircle=addSketchCircle({u:0,v:30},{u:20,v:30});}
    if(index===9&&E.tour.autoCircle)fullyDimensionTourCircle(E.tour.autoCircle,40);
    if(index===10){showTourFeatureForm("extrudeCut",{endCondition:"through-all",depth:60,offset:0,direction:"forward",symmetric:false,draftAngle:0,draftOutward:false,keepTool:false});if(!showFields)applyOpenTourFeature();}
    if(index===11){setMode("2d");createTourSketch("top","Top bore sketch");setCommandTab("sketch");E.tour.autoCircle=addSketchCircle({u:0,v:0},{u:20,v:0});}
    if(index===12&&E.tour.autoCircle)fullyDimensionTourCircle(E.tour.autoCircle,40);
    if(index===13){showTourFeatureForm("extrudeCut",{endCondition:"through-all",depth:60,offset:0,direction:"forward",symmetric:false,draftAngle:0,draftOutward:false,keepTool:false});if(!showFields)applyOpenTourFeature();}
    if(index===14){setMode("3d");setTab("hist");E.topologySelection=[];refreshAll();}
    if(index===15)setMode("3d");
  } else if(track==="sketch") {
    setDocumentType("part");setMode("2d");setView("top");setCommandTab("sketch");
    var sk=ensureSketch(E.def),lines;
    if(index===1)setTool("srect");
    if(index===2){lines=addSketchRectangle({u:-22,v:-14},{u:22,v:14});E.tour.autoLines=lines||[];}
    if(index===3&&E.tour.autoLines&&E.tour.autoLines[0]){var pt=sketchPoint(sk,E.tour.autoLines[0].a);if(pt){pt.x-=6;pt.y-=4;resolveSketch(false);}}
    if(index===4&&E.tour.autoLines){E.ssel=[E.tour.autoLines[0]];E.sel=E.tour.autoLines[0];setTool("select");}
    if(index===5&&E.tour.autoLines){sk.constraints.push({id:uid(),type:"distance",entity:E.tour.autoLines[0].id,value:50});resolveSketch(false);}
    if(index===6&&E.tour.autoLines){E.ssel=[E.tour.autoLines[0],E.tour.autoLines[2]];E.sel=E.tour.autoLines[2];}
    if(index===7&&E.tour.autoLines){sk.constraints.push({id:uid(),type:"equal",a:E.tour.autoLines[0].id,b:E.tour.autoLines[2].id});resolveSketch(false);}
  } else if(track==="flower") {
    preparePrimitiveProject("front");
    if(index===1)tourSphere(0,34,0,7,"#e5a93d","Flower center");
    if(index===2)[[0,48],[-14,34],[14,34],[0,20]].forEach(function(q){tourSphere(q[0],q[1],0,7,"#e678a0","Petal");});
    if(index===3)tourBox(-3,3,-4,20,-3,3,"#55a85b","Stem");
    if(index===4)tourBox(-13,13,-17,-4,-8,8,"#b86f46","Pot");
    if(index===5)setMode("3d");
  } else if(track==="screw") {
    preparePrimitiveProject("top");
    if(index===1)insertISO4017Screw();
    if(index===2){var sa=auditStandardParts({parts:activeParts(E.def)});E.def.lastStandardsAudit={at:Date.now(),ok:sa.ok,checked:sa.checked,blocking:sa.blocking};}
    if(index===3)setMode("3d");
  } else if(track==="gear") {
    preparePrimitiveProject("top");
    if(index===1)insertISOInvoluteGear();
    if(index===2){var gaudit=auditStandardParts({parts:activeParts(E.def)});E.def.lastStandardsAudit={at:Date.now(),ok:gaudit.ok,checked:gaudit.checked,blocking:gaudit.blocking};}
    if(index===3)setMode("3d");
  } else if(track==="studball") {
    preparePrimitiveProject("front");
    if(index===1)tourSphere(0,20,0,18,"#639bd1","Ball core");
    if(index===2)[[0,41,0],[0,-1,0],[21,20,0],[-21,20,0],[0,20,21],[0,20,-21]].forEach(function(q){tourSphere(q[0],q[1],q[2],5,"#e4b64f","Stud");});
    if(index===3)setMode("3d");
  } else if(track==="dreidel") {
    preparePrimitiveProject("front");
    if(index===1)setTool("rev");
    if(index===2)addPart(Object.assign({id:uid(),kind:"rev",name:"Dreidel",x:0,z:0,pts:[{u:0,v:0},{u:5,v:7},{u:18,v:18},{u:16,v:35},{u:5,v:42},{u:5,v:55},{u:0,v:55}]},tourMaterial("#7659b8")));
    if(index===3)setMode("3d");
  } else if(track==="pattern") {
    preparePrimitiveProject("front");
    if(index===1){E.tour.autoSeed=tourBox(12,22,0,10,-5,5,"#5f8fd6","Pattern seed");E.sel=E.tour.autoSeed;setTab("parts");}
    if(index===2){E.sel=E.tour.autoSeed||selectedSolid();setTab("parts");}
    if(index===3||index===4){
      if(!E.sel)E.sel=E.tour.autoSeed;
      if(index===3){showTourFeatureForm("pattern",{mode:"linear",axisX:true,countX:4,spacingX:18});if(!showFields)applyOpenTourFeature();}
    }
    if(index===5){E.sel=E.tour.autoSeed||selectedSolid();showTourFeatureForm("pattern",{mode:"circular",count:6,angle:360,axis:"y",equalSpacing:true});if(!showFields)applyOpenTourFeature();}
    if(index===6)setMode("3d");
  } else if(track==="assembly") {
    ensurePracticeAssembly();
    if(index===1){E.componentSel=[E.assembly.components[1]];E.sel=E.assembly.components[1];}
    if(index===2)E.assembly.components[1].transform.x=12;
    if(index===3){E.componentSel=[E.assembly.components[0],E.assembly.components[1]];E.sel=E.assembly.components[1];}
    if(index===4){E.assembly.components[1].transform.x=E.assembly.components[0].transform.x;E.assembly.mates.push({id:uid(),type:"alignX",a:E.assembly.components[0].id,b:E.assembly.components[1].id});}
    // The Save card demonstrated nothing: it marked itself done without ever
    // writing the assembly, so the demo ended with nothing in the library.
    if(index===5){saveAssemblyDocument();E.tour.demoAssemblyKey=E.assembly.key;}
  }
  E.tour.completed[index]=true;refreshAll();if(E.mode==="3d")fitPreview();
}

function restoreAutomaticTourOrigin() {
  var origin=E.tour.autoOrigin;if(!origin)return;
  setDocumentType(origin.docType);E.def=cloneData(origin.def);E.assembly=cloneData(origin.assembly);
  H.clear().seed();
  E.sel=null;E.ssel=[];E.componentSel=[];E.tour.autoLines=null;E.tour.autoCircle=null;E.tour.autoSeed=null;
  setCommandTab(origin.commandTab||"features");setView(origin.view||"top");setTool(origin.tool||"select");setMode(origin.mode||"2d");
}

/* Seeking rebuilds the demo from the origin document, which is the only honest
   way to land on an arbitrary step. Stepping forward one is the common case and
   does not need that: the editor already holds the previous step's result, so
   we only commit whatever feature form that step left open and run the new one.
   Replaying every time made each Continue cost more than the one before it. */
function seekAutomaticTour(index, incremental) {
  if(!E.tour.active||E.tour.mode!=="auto")return;
  var steps=tourSteps();index=Math.max(0,Math.min(steps.length-1,index));
  E.tour.preparing=true;
  var from=0;
  if(incremental&&index===E.tour.step+1){applyOpenTourFeature();from=index;}
  else{restoreAutomaticTourOrigin();E.tour.completed={};}
  for(var i=from;i<=index;i++)performAutomaticTourStep(E.tour.track,i,i===index);
  E.tour.step=index;E.tour.preparing=false;prepareTourStep();
}

function startTour() {
  if (!root || !E.open) return;
  E.tour.active = true;
  E.tour.track = null;
  E.tour.mode = null;
  E.tour.step = 0;
  E.tour.completed = {};
  renderTourHub();
}

function closeTour() {
  if (!E.tour) return;
  // A demonstration rewrites the open document — the CAD cube track replaces it
  // outright. Leaving that behind silently threw away whatever the user had on
  // screen before they pressed Guide, so put it back unless they asked to keep
  // the demonstrated model.
  if (E.tour.mode === "auto" && E.tour.autoOrigin) {
    if (E.tour.keepResult) flash(t("guideDemoKept"));
    else {
      // The assembly demo saves, so restoring the document is not enough — drop
      // the library entry it wrote too, or every replay leaves another orphan.
      if (E.tour.demoAssemblyKey) saveAssemblies(loadAssemblies().filter(function (a) { return a.key !== E.tour.demoAssemblyKey; }));
      E.tour.preparing = true; restoreAutomaticTourOrigin(); E.tour.preparing = false; refreshAll(); flash(t("guideDemoRestored"));
    }
  }
  E.tour.keepResult = false;
  E.tour.demoAssemblyKey = null;
  E.tour.active = false;
  E.tour.autoOrigin=null;
  E.tour.baseline = null;
  E.tour.preparing = false;
  clearTourTarget();
  if (!root) return;
  root.classList.remove("md-tour-open");
  var layer = root.querySelector("#mdTour");
  if (layer) layer.hidden = true;
}

function goTourStep(delta, skipped) {
  if (!E.tour.active) return;
  if (!E.tour.track) return;
  if (E.tour.mode==="auto") { if(delta<0&&E.tour.step===0){restoreAutomaticTourOrigin();E.tour.autoOrigin=null;E.tour.mode=null;renderTourMode(E.tour.track);return;}seekAutomaticTour(E.tour.step+delta,delta===1);return; }
  if (delta < 0 && E.tour.step === 0) { renderTourMode(E.tour.track);return; }
  var steps = tourSteps(), step = steps[E.tour.step];
  if (delta > 0 && !skipped && !tourStepDone(step, E.tour.step)) return;
  if (skipped) E.tour.completed[E.tour.step] = true;
  E.tour.step = Math.max(0, Math.min(steps.length - 1, E.tour.step + delta));
  prepareTourStep();
}

function updateTourProgress() {
  if (!E.tour.active || E.tour.preparing) return;
  renderTour();
}

var SKETCH_TOOLS = ["wall", "srect", "scirc", "sarc", "sslot", "spoly", "sell", "dim", "trim", "extend", "offset", "constr"];
/* Snap the camera square to the sketch plane. Only ever on request now — as an
   automatic side effect of opening a sketch it threw away the orientation the
   user had chosen, which is the whole reason drawing on the model felt like
   being kicked into a 2D view. */
function orientModelToView(force) {
  if (!E.pv || E.mode !== "3d") return;
  if (!force && E.modelPlaneActive && !E.sketchNormalTo) return;
  var frame=activeSketchFrame();
  if (frame) { E.pv.lookAtFrame(frame); return; }
  if (E.view === "top") E.pv.orbitTo(0, 1.5);
  else if (E.view === "front") E.pv.orbitTo(0, 0.05);
  else E.pv.orbitTo(Math.PI / 2, 0.05);
}
function syncModelPlane() {
  if (!root) return;
  var active = E.mode === "3d" && E.modelPlaneActive;
  root.classList.toggle("md-model-sketching", active);
  var finish = root.querySelector("#mdFinishPlane");
  if (finish) finish.hidden = !active;
  if (active) orientModelToView();
}
function finishModelPlane() {
  E.modelPlaneActive = false;
  E.wallPts = null; E.poly = null; E.arcPts = null; E.drag = null;
  setTool("select", true);
  if (E.pv) E.pv.clearFixedFrame(false);
  syncModelPlane();
  updatePreview();
}

function isCanonicalAuthoring() {
  return E.docType === "part" && E.def && E.def.metadata && E.def.metadata.authoringSystem === "parametric-v1";
}

function referencePlaneView(reference) {
  if (!reference) return "top";
  if (reference.id === "plane:front") return "front";
  if (reference.id === "plane:right") return "side";
  if (reference.id === "plane:top") return "top";
  var normal=reference.normal || reference.descriptor && reference.descriptor.normal || {x:0,y:1,z:0};
  var ax=Math.abs(normal.x||0),ay=Math.abs(normal.y||0),az=Math.abs(normal.z||0);
  return ay>=ax&&ay>=az ? "top" : az>=ax ? "front" : "side";
}

function referenceLabel(reference) {
  return reference && (reference.name || reference.semantic || reference.id || reference.persistentId) || "Reference";
}

function cancelReferenceSelection() {
  var picker=root && root.querySelector("#mdReferencePicker");
  if(picker)picker.hidden=true;
  E.authoring.phase="model";E.authoring.featureType=null;
  syncAuthoringWorkflow();
}

function chooseSketchReference(reference, preferredTool) {
  if(!reference)return;
  var stayIn3D = E.mode === "3d";
  var picker=root.querySelector("#mdReferencePicker");if(picker)picker.hidden=true;
  pushUndo(t("newSketch"));
  var sketch=ensureSketch(E.def), isEmpty=!(sketch.entities || []).length && !(E.def.history || []).some(function(entry){return entry.kind==="sketch"&&entry.targetId===sketch.id;});
  var topology=reference.type==="topology-reference" || !!reference.persistentId;
  if(topology) {
    E.topologySelection=[cloneData(reference)];
    if(!attachSketchToSelectedFace()){H.discard();flash("Select a planar or supported analytic face");cancelReferenceSelection();return;}
    sketch=ensureSketch(E.def);
  } else {
    var view=referencePlaneView(reference);
    if(!isEmpty)sketch=addSketch(E.def,view,0,referenceLabel(reference)+" sketch");
    sketch.plane=view;sketch.offset=0;sketch.referenceId=reference.id;sketch.name=referenceLabel(reference)+" sketch";
    delete sketch.support;delete sketch.supportOffset;
    if(!["plane:top","plane:front","plane:right"].includes(reference.id)){
      sketch.frame=frameFromPlane(reference.origin || {x:0,y:0,z:0},reference.normal || {x:0,y:1,z:0});
      sketch.frameSpace="local";
    } else {delete sketch.frame;delete sketch.frameSpace;}
    E.def.activeSketch=sketch.id;E.view=view;
  }
  recordSketchInHistory(E.def,sketch);
  E.def.metadata ||= {};E.def.metadata.authoringSystem="parametric-v1";
  E.authoring={phase:"sketch",referenceId:sketch.referenceId,sketchId:sketch.id,featureType:null,sketchSelection:[sketch.id],preferredTool:preferredTool || null};
  /* Opening a sketch from the 3D model keeps you IN the 3D model. The sheet is
     laid over the solid on the chosen plane and the camera is left exactly
     where it was — dropping to a flat 2D view (or spinning normal to the face)
     is a choice, not a precondition, and it is the thing that made drawing on
     a part feel like leaving the part. Coming from 2D, stay in 2D. */
  E.ssel=[];E.sel=null;
  if(stayIn3D){E.modelPlaneActive=true;syncModelPlane();}else setMode("2d");
  setCommandTab("sketch");setTab("sketch");
  if(preferredTool)setTool(preferredTool,true);else setTool("select",true);
  refreshAll();
  if(!stayIn3D)requestAnimationFrame(fitSketch);else drawSketch();
}

function beginSketchWorkflow(preferredTool) {
  if(E.docType!=="part")return;
  var picker=root && root.querySelector("#mdReferencePicker"),host=root && root.querySelector("#mdReferenceOptions");
  if(!picker||!host)return;
  E.authoring.phase="reference";E.authoring.preferredTool=typeof preferredTool==="string" ? preferredTool : null;
  host.innerHTML="";
  (E.def.references || []).filter(function(reference){return reference.type==="plane";}).forEach(function(reference){
    var button=el("button","md-reference-option",'<i class="ph ph-square-half"></i><span><b>'+referenceLabel(reference)+'</b><small>'+reference.id+'</small></span>');
    button.addEventListener("click",function(){chooseSketchReference(reference,E.authoring.preferredTool);});host.appendChild(button);
  });
  var face=(E.topologySelection || []).find(function(reference){return reference.kind==="face";});
  if(face){var faceButton=el("button","md-reference-option selected",'<i class="ph ph-selection"></i><span><b>Selected face</b><small>'+(face.semantic || face.persistentId)+'</small></span>');faceButton.addEventListener("click",function(){chooseSketchReference(face,E.authoring.preferredTool);});host.prepend(faceButton);}
  picker.hidden=false;syncAuthoringWorkflow();
}

function finishSketchWorkflow() {
  if(E.docType!=="part")return;
  if(!E.authoring || E.authoring.phase!=="sketch"){
    beginSketchWorkflow();
    flash("Choose a stable reference before entering sketch mode");
    return;
  }
  var sketch=ensureSketch(E.def),run=solveSketch(sketch);
  if(run.status==="conflicting"||run.status==="over-constrained"){
    setTab("sketch");flash("Resolve conflicting constraints before finishing the sketch");return;
  }
  recordSketchInHistory(E.def,sketch);
  E.authoring.phase="model";E.authoring.sketchId=sketch.id;E.authoring.referenceId=sketch.referenceId;E.authoring.sketchSelection=[sketch.id];
  E.modelPlaneActive=false;setMode("3d");setCommandTab("features");setTab("parts");
  flash(run.degreesOfFreedom ? "Sketch saved · "+run.degreesOfFreedom+" DOF remain" : "✓ Fully defined sketch saved");
  refreshAll();
}

function syncAuthoringWorkflow() {
  if(!root||!E.def)return;
  var phase=E.authoring && E.authoring.phase || "model",steps=["context","reference","sketch","feature","history"];
  var active=phase==="reference"?1:phase==="sketch"?2:E.authoring && E.authoring.featureType?3:4;
  root.querySelectorAll("[data-workflow-step]").forEach(function(button,index){button.classList.toggle("active",index===active);button.classList.toggle("complete",index<active);});
  var units=E.def.context && E.def.context.units || {length:"cm"};
  var context=root.querySelector("#mdWorkflowContext");if(context)context.textContent=units.length+" · "+(E.def.context && E.def.context.activeCoordinateSystemId || "origin");
  var sketch=ensureSketch(E.def),hasRecordedSketch=(E.def.history || []).some(function(entry){return entry.kind==="sketch"&&entry.targetId===sketch.id;}),reference=root.querySelector("#mdWorkflowReference");if(reference)reference.textContent=hasRecordedSketch && sketch.referenceId ? sketchPlaneCaption() : "Choose a plane or face";
  var sketchText=root.querySelector("#mdWorkflowSketch");if(sketchText){var info=E.solveInfo || solveSketch(sketch);sketchText.textContent=(sketch.entities || []).length ? (info.status==="fully-constrained"?"Fully defined":((sketch.constraints || []).length?"Partially defined · ":"Under-defined · ")+info.degreesOfFreedom+" DOF") : "Create a constrained profile";}
  var feature=root.querySelector("#mdWorkflowFeature");if(feature)feature.textContent=E.authoring && E.authoring.featureType ? (featureSpec(E.authoring.featureType)?.label || E.authoring.featureType) : "Turn intent into geometry";
  var history=root.querySelector("#mdWorkflowHistory");if(history)history.textContent=(E.def.history || []).length+" editable steps";
  root.classList.toggle("md-authoring-sketch",phase==="sketch");
}
function faceSketchAttachment() {
  var support=(E.topologySelection || []).find(function(reference){return reference.kind==="face";});
  if (!support) return null;
  if(support.descriptor && support.descriptor.surface!=="plane")return supportsSurfaceUV(support.descriptor)?{support:cloneData(support),surface:true}:null;
  var descriptor=support.descriptor || {}, normal=descriptor.normal || {};
  var ax=Math.abs(normal.x || 0), ay=Math.abs(normal.y || 0), az=Math.abs(normal.z || 0), dominant=Math.max(ax,ay,az);
  if (dominant<.5) return null;
  var plane=ay>=ax && ay>=az ? "top" : az>=ax ? "front" : "side";
  var origin=descriptor.origin || {x:0,y:0,z:0};
  return {support:cloneData(support),plane:plane,offset:0,frame:frameFromPlane(origin,normal)};
}
function attachSketchToSelectedFace() {
  var attachment=faceSketchAttachment();
  if (!attachment) return false;
  var sketch=ensureSketch(E.def);
  if(attachment.surface){pushUndo(t("newSketch"));var surfaceSketch=createSurfaceSketch(attachment.support,{id:"sketch:surface:"+uid(),name:(attachment.support.semantic || "Surface")+" UV sketch"});E.def.sketches=(E.def.sketches || []).concat([surfaceSketch]);E.def.activeSketch=surfaceSketch.id;E.view="front";E.ssel=[];flash("✓ Surface unwrapped into UV sketch space");return true;}
  var same=sketch.support && sketch.support.persistentId===attachment.support.persistentId;
  if (same) return true;
  pushUndo(t("newSketch"));
  if ((sketch.entities || []).length || sketch.support) sketch=addSketch(E.def,attachment.plane,attachment.offset,(attachment.support.semantic || "Face")+" sketch",attachment.support);
  else {
    sketch.plane=attachment.plane;
    sketch.offset=attachment.offset;
    sketch.name=(attachment.support.semantic || "Face")+" sketch";
    sketch.referenceId=attachment.support.persistentId;
    sketch.support=attachment.support;
  }
  sketch.frame=attachment.frame;
  sketch.frameSpace="local";
  sketch.supportOffset=0;
  E.def.activeSketch=sketch.id;
  E.view=attachment.plane;
  E.ssel=[];
  return true;
}
function setTool(id, keepPlaneState) {
  if(E.mode !== "drawing" && isCanonicalAuthoring() && !E.tour.active) {
    if(SKETCH_TOOLS.includes(id) && E.authoring.phase!=="sketch") { beginSketchWorkflow(id); return; }
    if(["rect","circle","sph","poly","rev","cut","cutc"].includes(id)) {
      var replacement=id==="rect"?"srect":id==="circle"?"scirc":null;
      if(replacement)beginSketchWorkflow(replacement);else flash("Create or select a sketch, then apply a declarative feature");
      return;
    }
  }
  var openingModelPlane = E.mode === "3d" && !E.modelPlaneActive && !keepPlaneState;
  var attachedToFace=openingModelPlane && id !== "select" ? attachSketchToSelectedFace() : false;
  if (E.wallPts && id !== "wall") finishWallChain(false);
  if (id !== E.tool) E.dynInput = null;
  if (id !== E.tool) { E.dimPick = []; E.dimSel = null; }
  E.tool = id;
  if (E.mode === "3d" && !keepPlaneState) E.modelPlaneActive = true;
  E.poly = null;
  if (id !== "sarc") E.arcPts = null;
  if (id !== "sslot") E.slotPts = null;
  if (id !== "sell") E.ellPts = null;
  // a tool that acts on a picked entity keeps the selection; a drawing tool
  // starts clean so the constraint palette is not offering stale pairs
  if (["wall", "srect", "scirc", "sarc", "sslot", "spoly", "sell", "rect", "circle", "sph", "poly", "rev", "cut", "cutc"].indexOf(id) >= 0) { E.ssel = []; E.sel = null; }
  // The line tool used to snap the view back to top, from when it drew
  // floor-plan walls. It is the generic sketch-line tool now and has to work on
  // whichever plane you are sketching on — forcing the view silently moved your
  // geometry into the top sketch.
  // Revolve is different: its profile is a height profile revolved about the
  // vertical axis, so it genuinely needs an elevation view.
  if (id === "rev" && E.view === "top") setView("front");
  // Smart Ruler is the one editing command that belongs on the released
  // drawing sheet. It writes a real driving sketch dimension, not a detached
  // annotation, so the corrected model and the saved definition stay in sync.
  if (id !== "select" && id !== "dim" && E.mode === "drawing") setMode("2d");
  syncModelPlane();
  syncTools();
  if (attachedToFace) refreshAll(); else drawSketch();
  if (openingModelPlane) requestAnimationFrame(fitSketch);
  updateTourProgress();
}
function setView(id) {
  E.view = id;
  E.poly = null;
  E.arcPts = null;
  E.dimPick = [];
  E.dimSel = null;
  // Changing plane changes which sketch is editable, which every panel shows —
  // redrawing the canvas alone would leave the lists describing the old plane.
  var swapped = E.mode === "drawing" ? false : adoptSketchForView();
  if (E.mode === "3d") orientModelToView();
  syncTools();
  if (swapped) refreshAll(); else drawSketch();
  if (E.mode === "3d" && E.modelPlaneActive) fitSketch();
}
function zoomBy(dir) {
  if (E.mode === "3d" && !E.modelPlaneActive) {
    if (dir === "fit") fitPreview();
    else if (E.pv) E.pv.zoomBy(dir === "in" ? 1/1.25 : 1.25);
    return;
  }
  if (dir === "fit") { fitSketch(); return; }
  var k = dir === "in" ? 1.25 : 1 / 1.25;
  var W = E.cw / 2, Hh = E.ch / 2;
  var ns = clamp(E.scl * k, 0.3, 20);
  E.ox = W - ((W - E.ox) / E.scl) * ns;
  E.oy = Hh - ((Hh - E.oy) / E.scl) * ns;
  E.scl = ns;
  drawSketch();
}
/* Frame the whole model in the sketch the way the 3D view frames it — without
   this the only way back from a stray scroll was to close and reopen. */
function fitSketch() {
  // the observer re-measures a frame later, which is too late for anything
  // that fits immediately after opening
  if (!E.cw || !E.ch) sizeSketch();
  /* Sketching over the model, the sheet has no pan/zoom of its own — it is the
     camera's projection of the plane. Fitting means framing the model. */
  if (sketchProjection()) { fitPreview(); drawSketch(); return; }
  var W = E.cw, Hh = E.ch;
  var u0, u1, v0, v1;
  var hasParts = renderedParts(E.def).length > 0;
  if (hasParts) {
    if (activeSketchFrame()) renderedParts(E.def).forEach(function(part){
      var projected=partUV(part), us=[], vs=[];
      if(projected.type==="rect"){us=[projected.u0,projected.u1];vs=[projected.v0,projected.v1];}
      else if(projected.type==="circle"){us=[projected.u-projected.r,projected.u+projected.r];vs=[projected.v-projected.r,projected.v+projected.r];}
      else if(projected.type==="segments"){var segmentPoints=projected.segments.flatMap(function(segment){return [segment.a,segment.b];});us=segmentPoints.map(function(q){return q.u;});vs=segmentPoints.map(function(q){return q.v;});}
      else{us=projected.pts.map(function(q){return q.u;});vs=projected.pts.map(function(q){return q.v;});}
      u0=u0===undefined?Math.min.apply(null,us):Math.min(u0,Math.min.apply(null,us));u1=u1===undefined?Math.max.apply(null,us):Math.max(u1,Math.max.apply(null,us));
      v0=v0===undefined?Math.min.apply(null,vs):Math.min(v0,Math.min.apply(null,vs));v1=v1===undefined?Math.max.apply(null,vs):Math.max(v1,Math.max.apply(null,vs));
    });
    else {
      var b = defBounds(E.def);
      if (E.view === "top") { u0 = b.x0; u1 = b.x1; v0 = b.z0; v1 = b.z1; }
      else if (E.view === "front") { u0 = b.x0; u1 = b.x1; v0 = b.y0; v1 = b.y1; }
      else { u0 = b.z0; u1 = b.z1; v0 = b.y0; v1 = b.y1; }
    }
  }
  /* Sketch geometry counts too. Framing only the solids meant that a document
     which is all sketch — every document, right up until the first extrude —
     zoomed to nothing. Sketch points are already in this plane's u/v. */
  ensureSketchDoc(E.def).forEach(function (sketch) {
    if (!sameSketchContext(sketch,ensureSketch(E.def))) return;
    (sketch.points || []).forEach(function (p) {
      u0 = u0 === undefined ? p.x : Math.min(u0, p.x);
      u1 = u1 === undefined ? p.x : Math.max(u1, p.x);
      v0 = v0 === undefined ? p.y : Math.min(v0, p.y);
      v1 = v1 === undefined ? p.y : Math.max(v1, p.y);
    });
    // a circle or ellipse reaches past its centre point, which is the only
    // point of it the loop above saw
    var pointsById = new Map((sketch.points || []).map(function (q) { return [q.id, q]; }));
    (sketch.entities || []).forEach(function (e) {
      var reach = 0, centre = null;
      if (e.type === "circle") {
        var o = circleData(e, pointsById);
        if (o) { centre = o.center; reach = o.radius; }
      } else if (e.type === "ellipse") {
        var el = ellipseData(e, pointsById);
        if (el) { centre = el.center; reach = Math.max(el.rx, el.ry); }
      }
      if (!centre) return;
      u0 = Math.min(u0, centre.x - reach); u1 = Math.max(u1, centre.x + reach);
      v0 = Math.min(v0, centre.y - reach); v1 = Math.max(v1, centre.y + reach);
    });
  });
  if (u0 === undefined) { u0 = -30; u1 = 30; v0 = -30; v1 = 30; }
  var du = Math.max(20, u1 - u0), dv = Math.max(20, v1 - v0);
  E.scl = clamp(Math.min((W - 80) / du, (Hh - 80) / dv), 0.3, 20);
  var cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  E.ox = W / 2 - cu * E.scl;
  E.oy = Hh / 2 - (!activeSketchFrame() && E.view === "top" ? cv : -cv) * E.scl;
  drawSketch();
}

/* One pane visible per panel. The old editor stacked all five sections down the
   left panel, which overflowed the screen and left the parts list, history and
   library unreachable — the tabs are what make the panel fit at any height. */
function setTab(id) {
  if (!root) return;
  var b = root.querySelector('[data-tab="' + id + '"]');
  if (!b) return;
  var panel = b.closest(".md-panel");
  panel.querySelectorAll("[data-tab]").forEach(function (o) { o.classList.toggle("on", o === b); });
  panel.querySelectorAll(".md-pane").forEach(function (p) { p.classList.toggle("on", p.getAttribute("data-pane") === id); });
  if (id === "hist" && histPanel) histPanel.refresh();
}
function activeTab(side) {
  var p = root && root.querySelector('.md-tabs[data-side="' + side + '"] .md-pane.on');
  return p ? p.getAttribute("data-pane") : null;
}

function setCommandTab(id) {
  if (!root || !root.querySelector('[data-command-pane="' + id + '"]')) return;
  E.commandTab = id;
  root.querySelectorAll("[data-cmdtab]").forEach(function (b) {
    var on = b.getAttribute("data-cmdtab") === id;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  root.querySelectorAll("[data-command-pane]").forEach(function (p) {
    p.classList.toggle("on", p.getAttribute("data-command-pane") === id);
  });
}

/* The feature forms are opened from the ribbon now, so a form has to be able to
   name the button that opened it — both to keep it lit while the form is up and
   to put it out again when the form closes. */
var FEATURE_COMMAND = {
  extrude: "extrude", extrudeCut: "extrudecut", revolve: "revolvefeature", sweep: "sweepfeature",
  loft: "loftfeature", fillet: "filletfeature", chamfer: "chamferfeature", shell: "shellfeature",
  pattern: "patternfeature", mirror: "mirrorfeature", boolean: "booleanfeature",
};
function closeFeaturePanel() {
  if (!root) return;
  var host = root.querySelector("#mdQuickSettings");
  if (host) host.hidden = true;
  syncCommandManager(); // puts the ribbon button that opened the form back out
}

function runCommand(id) {
  if (!id) return;
  var tools = ["select", "rect", "circle", "sph", "poly", "rev", "cut", "cutc", "wall", "srect", "scirc", "sarc", "sslot", "spoly", "sell", "dim", "trim", "extend", "offset", "constr"];
  if (tools.indexOf(id) >= 0) setTool(id);
  else if (id === "newsketch") beginSketchWorkflow();
  else if (id === "extrude") openParametricFeature("extrude");
  else if (id === "extrudecut") openParametricFeature("extrudeCut");
  else if (id === "revolvefeature") openParametricFeature("revolve");
  else if (id === "sweepfeature") openParametricFeature("sweep");
  else if (id === "loftfeature") openParametricFeature("loft");
  else if (id === "filletfeature") openParametricFeature("fillet");
  else if (id === "chamferfeature") openParametricFeature("chamfer");
  else if (id === "shellfeature") openParametricFeature("shell");
  else if (id === "patternfeature") openParametricFeature("pattern");
  else if (id === "mirrorfeature") openParametricFeature("mirror");
  else if (id === "booleanfeature") openParametricFeature("boolean");
  else if (id === "mirror") mirrorSelection();
  else if (id === "pattern") patternSelection();
  else if (id === "circpattern") patternCircularSelection();
  else if (id === "project") projectPartEdges();
  else if (id === "regen") regenerateExactModel();
  else if (id === "stepin") importStepDocument();
  else if (id === "stepout") exportStepDocument();
  else if (id === "igesout") exportIgesDocument();
  else if (id === "drawing" && E.docType === "part") downloadDrawing(E.def);
  else if (id === "mass") showMassProperties();
  else if (id === "standards") runStandardsAudit();
  else if (id === "stdscrew") insertISO4017Screw();
  else if (id === "stdgear") insertISOInvoluteGear();
  else if (id === "bundle") exportBundleDocument();
  else if (id === "bundlein") importBundleDocument();
  else if (id === "refplane") addReferenceGeometry("plane");
  else if (id === "refaxis") addReferenceGeometry("axis");
  else if (id === "coordsys") addReferenceGeometry("coordsys");
  else if (id === "fit") E.mode === "3d" ? fitPreview() : fitSketch();
  else if (id === "model3d") setMode("3d");
  else if (id === "assembly") setDocumentType("assembly");
  else if (id === "partdoc") setDocumentType("part");
  else if (id === "components") { setDocumentType("assembly"); setTab("parts"); }
  else if (id === "mates") { setDocumentType("assembly"); setTab("ops"); }
  else if (id === "explode") createDefaultExplodedView();
  else if (id === "motion") createDefaultMotionStudy();
  else if (id === "interference") runInterferenceCheck();
  else if (id === "bom") showAssemblyBOM();
  closeCommandSearch();
  syncCommandManager();
}

/* Common solid operations live beside the viewport with their one or two
   useful parameters exposed immediately. This deliberately avoids bouncing
   through the inspector and modal prompts for the operations used all day. */
function selectedSolid() {
  return E.sel && !isSketchObject(E.sel) && E.sel.kind ? E.sel : null;
}

function quickDuplicatePart() {
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  pushUndo(t("quickDuplicate"));
  var q = resetClonedPartIdentity(cloneData(p)); movePart(q, 10, 0, 10); addPart(q); E.sel = q;
  refreshAll(); return true;
}

function mirrorProjectionPart(q,planeId) {
  var plane=planeId || "plane:right",loops=function(part){return part.kind==="loft"?[part.pts0,part.pts1]:[part.pts].concat(part.holes || []);};
  if(plane==="plane:top"){
    if(q.kind==="box"){var y0=q.y0;q.y0=-q.y1;q.y1=-y0;}
    else if(q.kind==="cyl"){q.y=-q.y-q.h;}else if(q.kind==="sph")q.y=-q.y;else if(q.kind==="rev"){q.pts.forEach(function(v){v.v=-v.v;});q.pts.reverse();}
    else if(q.axis==="y"){var fy=q.from;q.from=-q.to;q.to=-fy;}else loops(q).forEach(function(loop){(loop || []).forEach(function(v){v.v=-v.v;});loop && loop.reverse();});
  } else if(plane==="plane:front"){
    if(q.kind==="box"){var z0=q.z0;q.z0=-q.z1;q.z1=-z0;}else if(q.kind==="cyl"||q.kind==="sph"||q.kind==="rev")q.z=-q.z;
    else if(q.axis==="z"){var fz=q.from;q.from=-q.to;q.to=-fz;}else loops(q).forEach(function(loop){(loop || []).forEach(function(v){if(q.axis==="x")v.u=-v.u;else v.v=-v.v;});loop && loop.reverse();});
  } else {
    if(q.kind==="box"){var x0=q.x0;q.x0=-q.x1;q.x1=-x0;}else if(q.kind==="cyl"||q.kind==="sph"||q.kind==="rev")q.x=-q.x;
    else if(q.axis==="x"){var fx=q.from;q.from=-q.to;q.to=-fx;}else loops(q).forEach(function(loop){(loop || []).forEach(function(v){v.u=-v.u;});loop && loop.reverse();});
  }
  return q;
}

function quickMirrorPart(options) {
  var params={...featureDefaults("mirror"),...(options || {})};
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  pushUndo(t("quickMirror"));
  var planeId=params.planeReference || (E.authoring.referenceId && String(E.authoring.referenceId).indexOf("plane:")===0 ? E.authoring.referenceId : "plane:right");
  var feature;
  delete params.planeReference;
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"mirror",{inputs:[p.featureId],references:{sketches:[],features:[p.featureId],topology:[],references:[planeId]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  var q = mirrorProjectionPart(resetClonedPartIdentity(cloneData(p)),planeId);
  if(feature){q.derivedFeatureId=feature.id;q.sourceFeatureId=p.featureId;}
  if(params.keepOriginal!==false)addPart(q);else{var index=E.def.parts.indexOf(p);if(index>=0)E.def.parts.splice(index,1,q);else addPart(q);} E.sel = q; refreshAll(); return true;
}

function quickRoundPart(kind, amount) {
  var params={...featureDefaults(kind),...(typeof amount==="object"?amount:kind==="fillet"?{radius:amount}:{distance:amount})};
  amount=kind==="fillet"?params.radius:params.distance;
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  if (!["box","cyl","ext"].includes(p.kind) || (p.kind==="cyl" && p.r2!=null && Math.abs(p.r2-p.r)>=1e-6)) { flash(t("quickNeedPart")); return false; }
  var sourceFeatureId=(E.authoring.featureSelection || []).slice(-1)[0] || p.featureId;
  /* Edges come from the selection, and only from the selection. Falling back to
     "every edge of the body" meant the command silently did something other
     than what was asked whenever a pick had not landed — which reads as fillet
     being unable to work on one rib at a time. */
  var targets=cloneData((E.topologySelection || []).filter(function(reference){return reference.kind==="edge";}));
  if (!targets.length) { flash(t("needEdges")); return false; }
  pushUndo(kind === "fillet" ? t("quickFillet") : t("quickChamfer"));
  var feature;
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,kind,{inputs:[sourceFeatureId],references:{sketches:[],features:[sourceFeatureId],topology:targets,references:[]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  p.exactOperations=p.exactOperations || [];
  p.exactOperations.push({
    id:feature ? feature.id : (p.featureId || "feature:part:"+p.id)+":"+kind+":"+(p.exactOperations.length+1),
    type:kind,amount:Math.max(.1,amount),targets:targets,params:cloneData(params),
  });
  delete p.exactFillet; delete p.exactFilletTargets; delete p.exactFilletEdges;
  E.sel=p; queueExactMesh(p); refreshAll(); return true;
}

function quickShellPart(thickness) {
  var params={...featureDefaults("shell"),...(typeof thickness==="object"?thickness:{thickness:thickness})};thickness=params.thickness;
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  if (!["box","cyl","ext"].includes(p.kind) || (p.kind==="cyl" && p.r2!=null && Math.abs(p.r2-p.r)>=1e-6)) { flash(t("shellFail")); return false; }
  var targets=cloneData((E.topologySelection || []).filter(function(reference){return reference.kind==="face";}));
  if (!targets.length) { flash(t("needFace")); return false; }
  pushUndo(t("shellOp"));
  var feature;
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"shell",{inputs:[p.featureId],references:{sketches:[],features:[p.featureId],topology:targets,references:[]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  p.exactOperations=p.exactOperations || [];
  p.exactOperations.push({
    id:feature ? feature.id : (p.featureId || "feature:part:"+p.id)+":shell:"+(p.exactOperations.length+1),
    type:"shell",amount:Math.max(.1,thickness),targets:targets,params:cloneData(params),
  });
  E.sel=p; queueExactMesh(p); refreshAll(); return true;
}

function quickPatternPart(count, pitch) {
  var params={...featureDefaults("pattern"),...(typeof count==="object"?count:{count:count,spacing:pitch})};count=Math.max(2,Math.round(params.count));pitch=Number(params.spacing)||0;
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  pushUndo(t("quickPattern"));
  var feature;
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"pattern",{inputs:[p.featureId],references:{sketches:[],features:[p.featureId],topology:[],references:[]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  var circularStep=circularPatternStepDegrees(params,count)*Math.PI/180,placements=patternPlacements(params);
  placements.forEach(function(placement,index){var q=resetClonedPartIdentity(cloneData(p));if(params.mode==="circular")rotatePatternPart(q,params.axis,circularStep*placement.circularIndex,params.radialDistance);else movePart(q,placement.x,placement.y,placement.z);if(feature){q.derivedFeatureId=feature.id;q.sourceFeatureId=p.featureId;q.patternIndex=index+1;q.patternGridIndex=placement.indices;}addPart(q);});
  refreshAll(); return true;
}

function featureReferenceOptions(type) {
  var expected=type==="axis-reference"?"axis":"plane";
  return (E.def.references || []).filter(function(reference){return reference.type===expected;}).map(function(reference){return {value:reference.id,label:reference.name || reference.id};});
}

function featureField(host,field,value) {
  var wrap=el("label","md-quick-field type-"+field.type);wrap.dataset.parameter=field.key;
  var caption=el("span","md-feature-field-label",field.label);
  if(field.unit){var units=E.def.context && E.def.context.units || {length:"cm",angle:"deg"};caption.appendChild(el("small","md-feature-unit",field.unit==="angle"?(units.angle || "deg"):(units.length || "cm")));}
  wrap.appendChild(caption);var input;
  if(field.type==="boolean"){
    input=el("input");input.type="checkbox";input.checked=!!value;wrap.appendChild(input);wrap.appendChild(el("span","md-feature-switch",'<i></i>'));
  } else if(field.type==="select"||field.type==="axis-reference"||field.type==="plane-reference"){
    input=el("select");var choices=field.choices || featureReferenceOptions(field.type);
    choices.forEach(function(choice){var option=el("option","",choice.label);option.value=choice.value;if(String(choice.value)===String(value))option.selected=true;input.appendChild(option);});wrap.appendChild(input);
  } else {
    input=el("input");input.type=field.type==="text"?"text":"number";input.value=value??"";
    if(field.min!=null)input.min=field.min;if(field.max!=null)input.max=field.max;input.step=field.step || ".1";wrap.appendChild(input);
  }
  input.dataset.parameter=field.key;input.dataset.parameterType=field.type;host.appendChild(wrap);return input;
}

function featureControlValue(control) {
  if(control.field.type==="boolean")return !!control.input.checked;
  if(control.field.type==="number")return control.input.value===""?NaN:Number(control.input.value);
  return control.input.value;
}

function featureReferenceValue(feature,type) {
  if(type==="axis-reference"&&feature && feature.references && feature.references.axis)return feature.references.axis;
  if(type==="plane-reference"&&feature && feature.references && feature.references.plane)return feature.references.plane;
  var refs=feature && feature.references && feature.references.references || [];
  var found=refs.find(function(reference){var id=typeof reference==="string"?reference:reference && reference.id;return type==="axis-reference"?String(id||"").indexOf("axis:")===0:String(id||"").indexOf("plane:")===0;});
  if(found)return typeof found==="string"?found:found.id;
  return type==="axis-reference"?"axis:y":"plane:right";
}

function readFeatureParameterForm(controls,baseParams) {
  var params={...(baseParams || {})},references={};
  controls.forEach(function(control){var value=featureControlValue(control);if(typeof value==="number"&&!Number.isFinite(value))return;if(control.field.key==="$axisReference")references.axis=value;else if(control.field.key==="$planeReference")references.plane=value;else params[control.field.key]=value;});
  if(params.endCondition==="mid-plane")params.symmetric=true;
  if(["axisX","axisY","axisZ"].some(function(key){return Object.prototype.hasOwnProperty.call(params,key);}) || params.directionAxis)params.direction=linearPatternDirection(params);
  return {params:params,references:references};
}

function renderFeatureParameterForm(host,type,state,onLive) {
  var controls=[],groups=featureEditorGroups(type),patternMode=state.params && state.params.mode || "linear",patternDrafts={linear:{},circular:{}};
  var patternModeKeys={linear:["axisX","countX","spacingX","spacingIncrementX","axisY","countY","spacingY","spacingIncrementY","axisZ","countZ","spacingZ","spacingIncrementZ"],circular:["count","angle","radialDistance","axis","equalSpacing"]};
  function rememberPatternSettings(mode){if(type!=="pattern")return;(patternModeKeys[mode] || []).forEach(function(key){var control=controls.find(function(item){return item.field.key===key;});if(control)patternDrafts[mode][key]=featureControlValue(control);});}
  function restorePatternSettings(mode){if(type!=="pattern")return;Object.entries(patternDrafts[mode] || {}).forEach(function(entry){var control=controls.find(function(item){return item.field.key===entry[0];});if(!control)return;if(control.field.type==="boolean")control.input.checked=!!entry[1];else control.input.value=entry[1];});}
  function syncConditionalFields(){
    var mode=controls.find(function(item){return item.field.key==="mode";});
    if(type==="pattern" && mode){
      var linear=mode.input.value==="linear";
      ["axisX","axisY","axisZ"].forEach(function(axisKey){
        var axisControl=controls.find(function(item){return item.field.key===axisKey;}),enabled=linear && axisControl && axisControl.input.checked,suffix=axisKey.slice(-1);
        [axisKey,"count"+suffix,"spacing"+suffix,"spacingIncrement"+suffix].forEach(function(key){var control=controls.find(function(item){return item.field.key===key;}),wrap=control && control.input.closest(".md-quick-field");if(wrap)wrap.classList.toggle("parameter-inactive",key===axisKey?!linear:!enabled);});
      });
      var circularCount=controls.find(function(item){return item.field.key==="count";}),circularWrap=circularCount && circularCount.input.closest(".md-quick-field");if(circularWrap)circularWrap.classList.toggle("parameter-inactive",linear);
      host.querySelectorAll('[data-parameter="angle"],[data-parameter="radialDistance"],[data-parameter="axis"],[data-parameter="equalSpacing"]').forEach(function(node){node.closest(".md-quick-field").classList.toggle("parameter-inactive",mode.input.value!=="circular");});
      if(linear){
        var axisParams={};["X","Y","Z"].forEach(function(suffix){["axis","count","spacing"].forEach(function(prefix){var key=prefix+suffix,control=controls.find(function(item){return item.field.key===key;});axisParams[key]=prefix==="axis"?!!(control && control.input.checked):Number(control && control.input.value);});});
        linearPatternAxisDefinitions(axisParams).forEach(function(definition){if(definition.axis==="vector")return;var control=controls.find(function(item){return item.field.key==="count"+definition.axis.toUpperCase();});if(control && Number(control.input.value)!==definition.count)control.input.value=String(definition.count);});
      }
    }
    if(type==="chamfer" && mode){
      var active={secondDistance:mode.input.value==="two-distance",angle:mode.input.value==="distance-angle",flip:mode.input.value!=="equal-distance"};
      ["secondDistance","angle","flip"].forEach(function(key){
        var control=controls.find(function(item){return item.field.key===key;}),wrap=control && control.input.closest(".md-quick-field");
        if(wrap)wrap.classList.toggle("parameter-hidden",!active[key]);
      });
    }
  }
  groups.forEach(function(group){
    var section=el("details","md-feature-group");section.open=true;
    section.appendChild(el("summary","",'<i class="ph '+(group.icon || "ph-sliders-horizontal")+'"></i><span>'+group.label+'</span><small>'+group.fields.length+'</small>'));
    var body=el("div","md-feature-group-body");
    group.fields.forEach(function(field){
      var value=field.key==="$axisReference"?featureReferenceValue(state,"axis-reference"):field.key==="$planeReference"?featureReferenceValue(state,"plane-reference"):["axisX","axisY","axisZ"].includes(field.key)?patternAxisEnabled(state.params,field.key.slice(-1).toLowerCase()):state.params && state.params[field.key];
      var input=featureField(body,field,value);var control={field:field,input:input};controls.push(control);
      var live=function(){
        if(type==="pattern" && field.key==="mode" && input.value!==patternMode){rememberPatternSettings(patternMode);restorePatternSettings(input.value);patternMode=input.value;}
        if(type==="pattern" && ["axisX","axisY","axisZ"].includes(field.key) && !controls.some(function(item){return ["axisX","axisY","axisZ"].includes(item.field.key) && item.input.checked;}))input.checked=true;
        syncConditionalFields();
        if(type==="pattern")rememberPatternSettings(patternMode);
        if(onLive)onLive(readFeatureParameterForm(controls,state.params));
      };
      input.addEventListener("input",live);input.addEventListener("change",live);
    });
    section.appendChild(body);host.appendChild(section);
  });
  if(type==="pattern"){rememberPatternSettings("linear");rememberPatternSettings("circular");}
  syncConditionalFields();
  return controls;
}

function setFeatureReferencesFromForm(feature,referenceValues) {
  feature.references ||= {};feature.references.references ||= [];
  var retained=feature.references.references.filter(function(reference){var id=typeof reference==="string"?reference:reference && reference.id;return !(String(id||"").indexOf("axis:")===0&&referenceValues.axis)&&!(String(id||"").indexOf("plane:")===0&&referenceValues.plane);});
  if(referenceValues.axis)retained.push(referenceValues.axis);if(referenceValues.plane)retained.push(referenceValues.plane);feature.references.references=retained;
}

function selectedFeatureIds() {
  var selected=(E.authoring.featureSelection || []).slice();
  var part=selectedSolid();if(part&&part.featureId&&!selected.includes(part.featureId))selected.push(part.featureId);
  return selected;
}

function selectedSketchIds() {
  var selected=(E.authoring.sketchSelection || []).filter(function(id){return (E.def.sketches || []).some(function(sketch){return sketch.id===id;});});
  var active=ensureSketch(E.def);if(active&&!selected.includes(active.id))selected.push(active.id);return selected;
}

function createMultiSketchFeature(type, values) {
  var ids=selectedSketchIds(),required=type==="loft"?2:2;
  if(ids.length<required){flash((featureSpec(type)?.label || type)+" requires "+required+" sketches selected in history");return false;}
  var refs=ids.slice(0,type==="sweep"?2:ids.length),params={...featureDefaults(type),...((values && values.params) || values || {})};
  if(type==="sweep"){
    var profile=(E.def.sketches || []).find(function(sketch){return sketch.id===refs[0];}),path=(E.def.sketches || []).find(function(sketch){return sketch.id===refs[1];});
    var profileRun=analyzeSketchProfiles(profile),profileLoop=profileRun.profiles[0];
    if(!profileLoop||!(path.points || []).length){flash("Sweep needs a closed profile and a sketched path");return false;}
    params.profile=profileLoop.points.map(function(point){return {x:point.u,y:point.v,z:0};});params.path=(path.points || []).map(function(point){return {x:point.x,y:point.y,z:path.offset || 0};});
  } else {
    params.sections=refs.map(function(id){var sketch=(E.def.sketches || []).find(function(item){return item.id===id;}),profile=analyzeSketchProfiles(sketch).profiles[0];return profile?profile.points.map(function(point){return {x:point.u,y:point.v,z:sketch.offset || 0};}):null;});
    if(params.sections.some(function(section){return !section;})){flash("Every loft sketch must contain a closed profile");return false;}
  }
  pushUndo("Create "+(featureSpec(type)?.label || type));
  try{createFeatureDefinition(E.def,type,{references:{sketches:refs,features:[],topology:[],references:[]},params:params});}
  catch(error){H.discard();flash(String(error.message||error));return false;}
  refreshAll();return true;
}

function createRevolveFeature(options) {
  var params={...featureDefaults("revolve"),...(typeof options==="number"?{angle:options}:options || {})};
  var profile=closedSketchProfile(),sketch=ensureSketch(E.def);if(!profile){flash(t("quickNeedSketch"));return false;}
  pushUndo(t("opRevolve"));recordSketchInHistory(E.def,sketch);var feature;
  var axisReference=params.axisReference || "axis:y";delete params.axisReference;
  try{feature=createFeatureDefinition(E.def,"revolve",{references:{sketches:[sketch.id],features:[],topology:[],references:[axisReference],profileEntityIds:profile.entityIds},params:{...params,axis:String(axisReference).split(":")[1] || "y",profileEntityIds:profile.entityIds,sketchId:sketch.id}});}catch(error){H.discard();flash(String(error.message||error));return false;}
  E.sel=addPart({id:uid(),featureId:feature.id,kind:"rev",name:feature.name,x:0,z:0,seg:48,angle:params.angle,direction:params.direction,symmetric:params.symmetric,pts:profile.points,color:"#b89a6e",metal:.08,rough:.7,sketchDriven:true,sketchId:sketch.id,profileEntityIds:profile.entityIds});refreshAll();return true;
}

function clearFeaturePreview(refresh) {
  if(!E.authoring)return;E.authoring.previewParts=[];E.authoring.previewReplacesPartId=null;
  E.authoring.featurePreviewState=null;E.authoring.featurePreviewBadge=null;
  E._featurePreviewToken=(E._featurePreviewToken || 0)+1;
  if(E._featureExactPreviewTimer){clearTimeout(E._featureExactPreviewTimer);E._featureExactPreviewTimer=0;}
  if(E._featurePreviewFrame){cancelAnimationFrame(E._featurePreviewFrame);E._featurePreviewFrame=0;}
  if(refresh)refreshAll();
}

function extrudePreviewPart(type,params) {
  var analysis=sketchProfileAnalysis(),profile=analysis.profiles[0];if(!profile)return null;
  var sketch=ensureSketch(E.def),inside=analysis.profiles.slice(1).filter(function(candidate){return pointInProfile(profileCentroid(candidate.points),profile.points);});
  var axis=planeAxis(sketch.plane),normal=sketch.frame && sketch.frame.normal,principalDirection=normal?(axis==="x"?Math.sign(normal.x||1):axis==="y"?Math.sign(normal.y||1):Math.sign(normal.z||1)):1;
  var direction=(params.direction==="reverse"?-1:1)*(principalDirection || 1),depth=Math.max(.1,Number(params.depth)||.1),offset=Number(params.offset)||0,symmetric=!!params.symmetric||params.endCondition==="mid-plane";
  var center=(sketch.frameSpace==="local"?0:Number(sketch.offset)||0)+direction*offset,from=symmetric?center-direction*depth/2:center,to=symmetric?center+direction*depth/2:center+direction*depth;
  return {id:"preview:"+type,featureId:"preview:"+type,previewOnly:true,kind:"ext",axis:sketch.frameSpace==="local"?"frame":axis,frame:sketch.frameSpace==="local"?cloneData(sketch.frame):undefined,from:from,to:to,pts:profile.points,holes:inside.map(function(hole){return hole.points;}),color:type==="extrudeCut"?"#d75a4a":"#6f8de8",opacity:type==="extrudeCut"?.42:.62,metal:.04,rough:.68,name:"Live "+(featureSpec(type)?.label || type)};
}

function exactFinishPreviewPart(type,state) {
  var source=selectedSolid(),targetKind=type==="shell"?"face":"edge";
  if(!source || !["box","cyl","ext"].includes(source.kind))return null;
  var targets=cloneData((E.topologySelection || []).filter(function(reference){return reference.kind===targetKind;}));
  if(!targets.length)return null;
  var amount=type==="fillet"?Number(state.params.radius):type==="chamfer"?Number(state.params.distance):Number(state.params.thickness);
  if(!Number.isFinite(amount) || amount<=0)return null;
  var preview=cloneData(source);
  preview.previewOnly=true;preview.id=source.id;preview.name="Live "+(featureSpec(type)?.label || type);
  preview.color=type==="shell"?"#43a6c9":"#7567e8";preview.opacity=.94;
  preview.exactOperations=preview.exactOperations || [];
  preview.exactOperations.push({
    id:"preview:"+type,type:type,amount:amount,targets:targets,params:cloneData(state.params),
  });
  return preview;
}

/* Exact finish previews are debounced so dragging a radius scrubber does not
   queue a kernel build for every pointer event.  The source body remains
   untouched and the latest token alone is allowed to replace the preview. */
function queueExactFeaturePreview(preview,type,liveBadge) {
  var token=(E._featurePreviewToken || 0)+1;E._featurePreviewToken=token;
  if(E._featureExactPreviewTimer)clearTimeout(E._featureExactPreviewTimer);
  if(liveBadge){liveBadge.classList.add("on");liveBadge.innerHTML='<i class="ph ph-spinner-gap"></i> Live · calculating exact '+type+'…';}
  E._featureExactPreviewTimer=setTimeout(async function(){
    E._featureExactPreviewTimer=0;var brep=null;
    try{
      brep=await exactBrepForPart(preview);
      var meshData=await shapeToMeshData(brep,{deflection:.24,angle:.16});
      meshData.topology=cloneData(brep.topology || []);
      if(token!==E._featurePreviewToken || !E.authoring || !(E.authoring.previewParts || []).includes(preview))return;
      preview.meshData=meshData;preview.exactError=null;updatePreview();renderPreview();
      if(liveBadge){liveBadge.innerHTML='<i class="ph ph-broadcast"></i> Live · exact preview updates as you edit';liveBadge.classList.add("pulse");setTimeout(function(){liveBadge.classList.remove("pulse");},180);}
    }catch(error){
      if(token!==E._featurePreviewToken)return;
      preview.exactError=String(error && error.message || error);
      if(liveBadge)liveBadge.innerHTML='<i class="ph ph-warning"></i> Preview unavailable · adjust the value or selection';
    }finally{if(brep)disposeBrep(brep);}
  },90);
}

function syncNewFeaturePreview(type,state,liveBadge) {
  var previews=[];
  E.authoring.previewReplacesPartId=null;
  if(type==="extrude"||type==="extrudeCut"){
    var extrusion=extrudePreviewPart(type,state.params);if(extrusion)previews.push(extrusion);
  } else if(type==="revolve"){
    var profile=closedSketchProfile();if(profile)previews.push({id:"preview:revolve",featureId:"preview:revolve",previewOnly:true,kind:"rev",x:0,z:0,seg:48,pts:profile.points,angle:state.params.angle,direction:state.params.direction,symmetric:state.params.symmetric,color:"#6f8de8",opacity:.62,metal:.04,rough:.68,name:"Live Revolve"});
  } else if(type==="pattern"){
    var seed=selectedSolid(),count=Math.max(2,Math.min(100,Math.round(Number(state.params.count)||2))),circularStep=circularPatternStepDegrees(state.params,count)*Math.PI/180,placements=patternPlacements(state.params);
    if(seed)placements.forEach(function(placement,index){var copy=resetClonedPartIdentity(cloneData(seed));copy.previewOnly=true;copy.id="preview:pattern:"+(index+1);copy.featureId=copy.id;copy.opacity=.52;if(state.params.mode==="circular")rotatePatternPart(copy,state.params.axis,circularStep*placement.circularIndex,state.params.radialDistance);else movePart(copy,placement.x,placement.y,placement.z);copy.patternGridIndex=placement.indices;previews.push(copy);});
  } else if(type==="mirror"){
    var source=selectedSolid();if(source){var plane=state.references && state.references.plane || "plane:right",copy=mirrorProjectionPart(resetClonedPartIdentity(cloneData(source)),plane);copy.previewOnly=true;copy.id="preview:mirror";copy.featureId=copy.id;copy.opacity=.52;previews.push(copy);}
  } else if(type==="fillet"||type==="chamfer"||type==="shell"){
    var finish=exactFinishPreviewPart(type,state);
    if(finish){previews.push(finish);E.authoring.previewReplacesPartId=finish.id;}
  }
  E.authoring.previewParts=previews;
  if(finish)queueExactFeaturePreview(finish,type,liveBadge || E.authoring.featurePreviewBadge);
}

function queueNewFeaturePreview(type,state,liveBadge) {
  if(E._featurePreviewFrame)cancelAnimationFrame(E._featurePreviewFrame);
  E._featurePreviewFrame=requestAnimationFrame(function(){E._featurePreviewFrame=0;syncNewFeaturePreview(type,state,liveBadge);refreshAll();if(liveBadge && !["fillet","chamfer","shell"].includes(type)){liveBadge.classList.add("on");liveBadge.innerHTML='<i class="ph ph-broadcast"></i> Live · sketch, 3D, orthographic and drawing views synced';}});
}

function finishSelectionMessage(type) {
  var required=type==="shell"?"face":"edge",count=(E.topologySelection || []).filter(function(reference){return reference.kind===required;}).length;
  if(!selectedSolid())return "Select a solid body in the viewport first";
  if(!count)return (type==="shell"?"Select a face to remove":"Select one or more edges")+" in the viewport · Ctrl/Cmd-click adds more";
  return "✓ "+count+" "+required+(count===1?"":"s")+" selected · drag the value below for a live preview";
}

function syncActiveFeatureSelectionFeedback() {
  if(!root || !E.authoring || !E.authoring.featureType)return;
  var note=root.querySelector("#mdQuickSettings [data-live-selection]");
  if(!note)return;
  var type=note.getAttribute("data-live-selection");
  note.textContent=["fillet","chamfer","shell"].includes(type)?finishSelectionMessage(type):["extrude","extrudeCut","revolve","sweep","loft"].includes(type)?selectedSketchIds().length+" sketch(es) selected":selectedFeatureIds().length+" feature(s) · "+(E.topologySelection || []).length+" topology reference(s)";
  note.classList.toggle("ready",note.textContent.indexOf("✓")===0);
  if(type==="pattern"){
    var selected=selectedSolid(),selectionId=selected && selected.id || null;
    if(E.authoring._patternPreviewSelectionId!==selectionId){E.authoring._patternPreviewSelectionId=selectionId;syncNewFeaturePreview(type,E.authoring.featurePreviewState || {params:featureDefaults("pattern"),references:{}},E.authoring.featurePreviewBadge);updatePreview();drawSketch();}
  }
}

function addFinishScrubber(host,type,controls) {
  var key=type==="fillet"?"radius":type==="chamfer"?"distance":type==="shell"?"thickness":null;
  if(!key)return;
  var control=controls.find(function(item){return item.field.key===key;}),part=selectedSolid();
  if(!control || !part)return;
  var b=partBounds(part),positive=[b.x1-b.x0,b.y1-b.y0,b.z1-b.z0].filter(function(value){return value>1e-6;}),limit=Math.max(Number(control.input.value)||1,Math.min.apply(null,positive)/2);
  var wrap=el("label","md-feature-scrubber");wrap.appendChild(el("span","",'<i class="ph ph-arrows-left-right"></i> Drag for live preview'));
  var range=el("input"),step=Number(control.field.step)||.1;range.type="range";range.min=String(Math.max(Number(control.field.min)||step,step));range.max=String(Math.max(limit,Number(control.input.value)||1));range.step=String(step);range.value=control.input.value;wrap.appendChild(range);
  range.addEventListener("input",function(){control.input.value=range.value;control.input.dispatchEvent(new Event("input",{bubbles:true}));});
  control.input.addEventListener("input",function(){var value=Number(control.input.value);if(Number.isFinite(value)){if(value>Number(range.max))range.max=String(value);range.value=String(value);}});
  var note=host.querySelector(".md-feature-selection-note");host.insertBefore(wrap,note || null);
}

function openParametricFeature(type) {
  if(E.docType!=="part")return;if(E.mode==="drawing")setMode("3d");
  var spec=featureSpec(type);if(!spec){flash("Unsupported feature: "+type);return;}
  var host=root && root.querySelector("#mdQuickSettings");if(!host)return;
  if(E.authoring.featureEdit)cancelFeatureParameterEdit(true);
  clearFeaturePreview(false);E.authoring.featureType=type;E.authoring.phase="model";E.quickAction=type;host.hidden=false;host.innerHTML="";
  host.appendChild(el("div","md-feature-form-title",'<i class="ph '+spec.icon+'"></i><span><b>'+spec.label+'</b><small>Complete feature definition · live preview before commit</small></span>'));
  var state={type:type,params:featureDefaults(type),references:{}};
  if(type==="extrude"||type==="extrudeCut"){state.params.depth=E.depth;state.params.offset=E.baseOff;}
  if(type==="revolve")state.references.axis="axis:y";if(type==="mirror")state.references.plane=E.authoring.referenceId||"plane:right";
  var liveBadge=el("div","md-feature-live",'<i class="ph ph-broadcast"></i> Live preview ready');host.appendChild(liveBadge);
  E.authoring.featurePreviewState=state;E.authoring.featurePreviewBadge=liveBadge;
  var controls=renderFeatureParameterForm(host,type,state,function(next){state.params=next.params;state.references={...state.references,...next.references};E.depth=Number(state.params.depth)||E.depth;E.baseOff=Number(state.params.offset)||0;queueNewFeaturePreview(type,state,liveBadge);});
  var selectionNote=el("div","md-feature-selection-note");
  selectionNote.setAttribute("data-live-selection",type);host.appendChild(selectionNote);syncActiveFeatureSelectionFeedback();addFinishScrubber(host,type,controls);
  var actions=el("div","md-feature-actions");
  actions.appendChild(btn('<i class="ph ph-x"></i> Cancel',function(){E.authoring.featureType=null;clearFeaturePreview(true);closeFeaturePanel();syncAuthoringWorkflow();},"md-quick-cancel"));
  actions.appendChild(btn('<i class="ph ph-check"></i> '+t("quickApply"),function(){
    var values=readFeatureParameterForm(controls,state.params),params=values.params,ok=false;state.references={...state.references,...values.references};clearFeaturePreview(false);
    if(type==="extrude"||type==="extrudeCut")ok=extrudeClosedSketch({type:type,...params});
    else if(type==="revolve")ok=createRevolveFeature({...params,axisReference:state.references.axis});
    else if(type==="sweep"||type==="loft")ok=createMultiSketchFeature(type,params);
    else if(type==="fillet"||type==="chamfer")ok=quickRoundPart(type,params);
    else if(type==="shell")ok=quickShellPart(params);
    else if(type==="pattern")ok=quickPatternPart(params);
    else if(type==="mirror"){E.authoring.referenceId=state.references.plane;ok=quickMirrorPart({...params,planeReference:state.references.plane});}
    else if(type==="boolean"){
      var ids=selectedFeatureIds();if(ids.length<2){flash("Select two feature history nodes for a Boolean");syncNewFeaturePreview(type,state);refreshAll();return;}
      pushUndo("Create Boolean");try{createFeatureDefinition(E.def,"boolean",{inputs:ids.slice(0,2),references:{sketches:[],features:ids.slice(0,2),topology:[],references:[]},params:params});ok=true;refreshAll();}catch(error){H.discard();flash(String(error.message||error));}
    }
    if(ok){E.authoring.featureType=null;closeFeaturePanel();setMode("3d");setTab("parts");syncAuthoringWorkflow();}else{E.authoring.featurePreviewState=state;E.authoring.featurePreviewBadge=liveBadge;syncNewFeaturePreview(type,state,liveBadge);refreshAll();}
  },"md-quick-apply"));host.appendChild(actions);
  syncNewFeaturePreview(type,state,liveBadge);refreshAll();syncAuthoringWorkflow();
}

function commandCatalog() {
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
    { id:"newsketch", icon:"ph-pencil-line", label:"Create sketch", group:t("cmdFeatures"), terms:"reference plane face profile" },
    { id:"extrude", icon:"ph-cube", label:t("opExtrude"), group:t("cmdFeatures"), available:function(){ return E.docType === "part" && !!closedSketchProfile(); } },
    { id:"extrudecut", icon:"ph-scissors", label:"Extrude Cut", group:t("cmdFeatures"), available:function(){return E.docType==="part"&&!!closedSketchProfile()&&!!activeParts(E.def).length;} },
    { id:"revolvefeature", icon:"ph-arrow-counter-clockwise", label:t("opRevolve"), group:t("cmdFeatures"), shortcut:"R" },
    { id:"sweepfeature", icon:"ph-path", label:"Sweep", group:t("cmdFeatures") },
    { id:"loftfeature", icon:"ph-stack", label:"Loft", group:t("cmdFeatures") },
    { id:"filletfeature", icon:"ph-corners-out", label:"Fillet", group:t("cmdFeatures") },
    { id:"chamferfeature", icon:"ph-corners-in", label:"Chamfer", group:t("cmdFeatures") },
    { id:"shellfeature", icon:"ph-bowl-food", label:"Shell", group:t("cmdFeatures") },
    { id:"patternfeature", icon:"ph-dots-nine", label:"Pattern", group:t("cmdFeatures") },
    { id:"mirrorfeature", icon:"ph-flip-horizontal", label:"Mirror feature", group:t("cmdFeatures") },
    { id:"booleanfeature", icon:"ph-intersect", label:"Boolean", group:t("cmdFeatures") },
    { id:"refplane", icon:"ph-square-half", label:"Reference plane", group:t("cmdFeatures"), available:function(){ return E.docType === "part"; } },
    { id:"refaxis", icon:"ph-axis-arrow", label:"Reference axis", group:t("cmdFeatures"), available:function(){ return E.docType === "part"; } },
    { id:"coordsys", icon:"ph-crosshair", label:"Coordinate system", group:t("cmdFeatures"), available:function(){ return E.docType === "part"; } },
    { id:"regen", icon:"ph-arrows-clockwise", label:t("regenerate"), group:t("cmdEvaluate"), shortcut:"Ctrl+B", available:function(){ return E.docType === "part" && !E.kernelBusy && !!activeParts(E.def).length; } },
    { id:"fit", icon:"ph-crosshair-simple", label:t("zoomFit"), group:t("cmdEvaluate"), shortcut:"F" },
    { id:"drawing", icon:"ph-file-svg", label:t("drawingExport"), group:t("cmdEvaluate"), available:function(){ return E.docType === "part"; } },
    { id:"mass", icon:"ph-scales", label:"Mass properties", group:t("cmdEvaluate"), available:function(){ return E.docType === "part" && !!activeParts(E.def).length; } },
    { id:"standards", icon:"ph-seal-check", label:"DIN / ISO audit", group:t("cmdEvaluate"), available:function(){ return E.docType === "part" && !!activeParts(E.def).length; } },
    { id:"stdscrew", icon:"ph-screwdriver", label:t("stdScrewCommand"), group:t("cmdFeatures"), available:function(){return E.docType==="part";} },
    { id:"stdgear", icon:"ph-gear-six", label:t("stdGearCommand"), group:t("cmdFeatures"), available:function(){return E.docType==="part";} },
    { id:"bundle", icon:"ph-package", label:"Project bundle", group:t("cmdEvaluate") },
    { id:"bundlein", icon:"ph-package", label:"Import bundle", group:t("cmdEvaluate") },
    { id:"stepin", icon:"ph-upload-simple", label:t("stepImport"), group:"STEP", available:function(){ return E.docType === "part"; } },
    { id:"stepout", icon:"ph-file-step", label:t("stepExport"), group:"STEP", available:function(){ return E.docType === "part" && !!activeParts(E.def).length; } },
    { id:"igesout", icon:"ph-file-arrow-down", label:"Export IGES", group:"STEP", available:function(){ return E.docType === "part" && !!activeParts(E.def).length; } },
    { id:"assembly", icon:"ph-cubes-three", label:t("docAssembly"), group:t("cmdAssembly") },
    { id:"components", icon:"ph-cube", label:t("components"), group:t("cmdAssembly") },
    { id:"mates", icon:"ph-link", label:t("mate"), group:t("cmdAssembly") },
    { id:"partdoc", icon:"ph-cube-focus", label:t("docPart"), group:t("cmdAssembly") },
    { id:"explode", icon:"ph-arrows-out", label:"Exploded view", group:t("cmdAssembly"), available:function(){ return E.docType === "assembly" && E.assembly && E.assembly.components.length > 1; } },
    { id:"motion", icon:"ph-play-circle", label:"Motion study", group:t("cmdAssembly"), available:function(){ return E.docType === "assembly" && E.assembly && E.assembly.components.length; } },
    { id:"interference", icon:"ph-intersect", label:"Interference", group:t("cmdAssembly"), available:function(){ return E.docType === "assembly" && E.assembly && E.assembly.components.length > 1; } },
    { id:"bom", icon:"ph-table", label:"Bill of materials", group:t("cmdAssembly"), available:function(){ return E.docType === "assembly" && E.assembly && E.assembly.components.length; } },
  ];
}

function syncCommandManager() {
  if (!root) return;
  root.querySelectorAll("[data-command]").forEach(function (b) {
    var id = b.getAttribute("data-command"), def = commandCatalog().find(function (c) { return c.id === id; });
    // a ribbon button is lit while its tool is picked *or* its feature form is open
    var feature = E.authoring && E.authoring.featureType;
    b.classList.toggle("on", id === E.tool || (feature && id === FEATURE_COMMAND[feature]) ||
      (id === "model3d" && E.mode === "3d"));
    b.disabled = !!(def && def.available && !def.available());
  });
}

function openCommandSearch(seed) {
  if (!root) return;
  var overlay = root.querySelector("#mdCommandSearch"), input = root.querySelector("#mdCommandSearchInput");
  overlay.hidden = false;
  input.value = seed || "";
  renderCommandResults();
  requestAnimationFrame(function () { input.focus(); input.select(); });
}

function closeCommandSearch() {
  var overlay = root && root.querySelector("#mdCommandSearch");
  if (overlay) overlay.hidden = true;
}

function renderCommandResults() {
  if (!root) return;
  var input = root.querySelector("#mdCommandSearchInput"), host = root.querySelector("#mdCommandResults");
  var query = String(input.value || "").trim().toLowerCase();
  var list = commandCatalog().filter(function (c) {
    return !query || (c.label + " " + c.group + " " + (c.terms || "") + " " + (c.shortcut || "")).toLowerCase().indexOf(query) >= 0;
  }).slice(0, 12);
  host.innerHTML = "";
  if (!list.length) { host.appendChild(el("div", "md-command-empty", t("noCommands"))); return; }
  list.forEach(function (c, index) {
    var row = el("button", "md-command-result" + (index === 0 ? " selected" : ""));
    row.type = "button";
    row.setAttribute("role", "option");
    row.disabled = !!(c.available && !c.available());
    row.appendChild(el("i", "ph " + c.icon));
    var copy = el("span", "copy");
    copy.appendChild(el("b", "", c.label));
    copy.appendChild(el("small", "", c.group));
    row.appendChild(copy);
    if (c.shortcut) row.appendChild(el("kbd", "", c.shortcut));
    row.addEventListener("click", function () { if (!row.disabled) runCommand(c.id); });
    host.appendChild(row);
  });
}

function finishActiveCommand() {
  if (dynHasEntry() && dynCommit()) { syncContextActions(); return; }
  if (E.wallPts) finishWallChain(false);
  else if (E.poly) {
    if (E.poly.length < 3) { flash(t("polyHint")); return; }
    finishPoly();
  }
  syncContextActions();
}

function cancelActiveCommand() {
  if (E.wallPts) finishWallChain(true);
  E.poly = null;
  E.arcPts = null;
  E.slotPts = null;
  E.ellPts = null;
  E.dynInput = null;
  E.drag = null;
  E._osnap = null;
  drawSketch();
  syncHint();
  syncContextActions();
}

function syncContextActions() {
  var bar = root && root.querySelector("#mdContextActions");
  if (!bar) return;
  var active = !!(E.wallPts || E.poly || E.arcPts || E.slotPts || E.ellPts || (E.drag && E.drag.sticky));
  bar.hidden = !active;
  if (!active) return;
  var labels = { wall:t("tool_wall"), poly:t("tool_poly"), cut:t("tool_cut"), rev:t("tool_rev"), sarc:t("tool_sarc"),
    sslot:t("tool_sslot"), sell:t("tool_sell"), spoly:t("tool_spoly"), srect:t("tool_srect"), scirc:t("tool_scirc") };
  root.querySelector("#mdActiveCommand").textContent = labels[E.tool] || t("cmdSketch");
  root.querySelector("#mdAcceptCommand").disabled = !!E.arcPts || (!!E.poly && E.poly.length < 3)
    || !!(E.slotPts || E.ellPts || (E.drag && E.drag.sticky)) && !dynHasEntry();
}

function newModel() {
  if (E.docType === "assembly") {
    E.assembly = newAssembly();
    E.componentSel = [];
    E.sel = null;
    syncHead();
    refreshLib();
    refreshAll();
    return;
  }
  E.def = newDef();
  E.srcItem = null;
  E.sel = null;
  E.authoring={phase:"model",referenceId:null,sketchId:null,featureType:null,sketchSelection:[],featureSelection:[]};
  H.clear().seed();
  syncHead();
  refreshAll();
  setTab("parts");
}

function setDocumentType(type) {
  type = type === "assembly" ? "assembly" : "part";
  if (type === E.docType) return;
  E.docType = type;
  E.poly = null;
  E.wallPts = null;
  E.drag = null;
  E.sel = null;
  E.ssel = [];
  E.topologySelection = [];
  E.arcPts = null;
  E.componentSel = [];
  if (type === "assembly" && !E.assembly) E.assembly = newAssembly();
  root.classList.toggle("md-assembly", type === "assembly");
  root.querySelectorAll("#mdDocModes [data-doc]").forEach(function (b) {
    b.classList.toggle("on", b.getAttribute("data-doc") === type);
  });
  if (type === "assembly") { setMode("3d"); setCommandTab("assembly"); }
  else { setMode("3d"); setCommandTab("features"); }
  syncHead();
  refreshLib();
  refreshAll();
  if (type === "assembly") fitPreview(); else fitSketch();
}

function saveAssemblyDocument() {
  if (!E.assembly) E.assembly = newAssembly();
  E.assembly.name = root.querySelector("#mdName").value || E.assembly.name;
  applyAssemblyMates(E.assembly);
  var saved = cloneData(E.assembly);
  var list = loadAssemblies().filter(function (a) { return a.key !== saved.key; });
  list.push(saved);
  saveAssemblies(list);
  refreshLib();
  flash("✓ " + t("savedAssembly"));
  updateTourProgress();
}

function saveCurrentDocument() {
  if (E.docType === "assembly") saveAssemblyDocument();
  else saveModel();
}

function syncTools() {
  root.querySelectorAll("[data-tool]").forEach(function (b) {
    b.classList.toggle("on", b.getAttribute("data-tool") === E.tool);
  });
  root.querySelectorAll("[data-view]").forEach(function (b) {
    b.classList.toggle("on", b.getAttribute("data-view") === E.view);
  });
  root.querySelectorAll("[data-drawing-tool]").forEach(function (b) {
    b.classList.toggle("on", b.getAttribute("data-drawing-tool") === E.tool);
    b.setAttribute("aria-pressed", b.getAttribute("data-drawing-tool") === E.tool ? "true" : "false");
  });
  root.classList.toggle("md-tool-dim", E.mode === "drawing" && E.tool === "dim");
  syncHint();
  syncStatus();
  syncExtrudeButton();
  syncCommandManager();
  syncContextActions();
}

/* Whether the sketch currently offers a profile changes with almost every edit,
   not just with the active tool — so this is its own sync, called from
   refreshAll as well as from the toolbar. */
function syncExtrudeButton() {
  if (!root) return;
  var profileInfo = E.docType === "part" ? sketchProfileAnalysis() : {profiles:[],openEnds:[],branchPoints:[]};
  var available = E.docType === "part" && !!profileInfo.profiles.length;
  var why = available ? t("profileReady")
    : profileInfo.branchPoints.length ? t("profileBranched")
    : profileInfo.openEnds.length ? t("profileOpen") + " · " + profileInfo.openEnds.length + " " + t("profileEnds")
    : t("profileEmpty");
  // the ribbon's Extrude is now the only one, so it carries the readiness state
  root.querySelectorAll('[data-command="extrude"]').forEach(function (button) { button.title = why; });
  syncCommandManager();
}

/* The hint used to pulse forever at the bottom of the canvas. It only earns
   that much attention while a multi-step tool is mid-sketch; the rest of the
   time it states the two double-click gestures quietly, and the readouts that
   change as you work moved to the status bar. */
function sketchPlaneCaption() {
  var sketch=ensureSketch(E.def);
  if (activeSketchFrame() && sketch.support) return "Face · " + (sketch.support.semantic || sketch.support.persistentId);
  return t(E.view === "top" ? "view_top" : E.view === "front" ? "view_front" : "view_right");
}
function syncHint() {
  var hint = root && root.querySelector("#mdHint");
  if (!hint) return;
  var live = (E.mode !== "3d" || E.modelPlaneActive) && (E.tool === "wall" || E.tool === "poly" || E.tool === "rev" || E.tool === "cut" || E.tool === "cutc" || E.tool === "sarc" || E.tool === "sslot" || E.tool === "sell");
  var topology=(E.topologySelection || []),finishType=E.authoring && ["fillet","chamfer","shell"].includes(E.authoring.featureType) ? E.authoring.featureType : null;
  var topologyCaption=topology.length ? topology.length+" "+(topology.every(function(reference){return reference.kind===topology[0].kind;})?topology[0].kind+"(s)":"references")+" selected · Ctrl/Cmd-click adds or removes" : finishType ? finishSelectionMessage(finishType) : null;
  hint.textContent =
    E.mode === "3d" && !E.modelPlaneActive ? (topologyCaption || t("hint3d")) :
    E.mode === "drawing" && E.tool === "dim" ? t("smartRulerHint") :
    E.mode === "drawing" ? t("drawingHint") :
    E.tool === "sslot" ? t("slotHint") :
    E.tool === "sell" ? t("ellipseHint") :
    E.tool === "spoly" ? t("polygonHint") + " (" + E.polySides + ")" :
    E.tool === "srect" || E.tool === "scirc" ? t("twoPointHint") :
    E.tool === "wall" ? t("wallHint") :
    E.tool === "poly" ? t("polyHint") :
    E.tool === "rev" ? t("revHint") :
    E.tool === "cut" ? t("cutHint") :
    E.tool === "cutc" ? t("cutcHint") :
    E.tool === "sarc" ? t("arcHint") :
    E.tool === "trim" ? t("trimHint") :
    E.tool === "extend" ? t("extendHint") :
    E.tool === "offset" ? t("offsetHint") :
    E.tool === "dim" ? t("dimHint2") :
    t("dimHint") + " · " + t("vertexHint");
  if (E.mode === "3d" && E.modelPlaneActive) hint.textContent = t("modelPlaneHint") + ": " + sketchPlaneCaption() + " · " + hint.textContent;
  hint.classList.toggle("live", live);
  hint.classList.toggle("selection",E.mode==="3d" && !E.modelPlaneActive && !!topologyCaption);
}

/* A CAD status line: which plane you are drawing on, where the cursor is in
   centimetres, the grid it will land on, and the zoom. */
function syncStatus() {
  var st = root && root.querySelector("#mdStatus");
  if (!st) return;
  if (E.mode === "3d" && !E.modelPlaneActive) {
    var mode=(E.def && E.def.authoringMode) || "fully-parametric";
    var recognition=E.def && E.def.metadata && E.def.metadata.import && E.def.metadata.import.recognition;
    st.innerHTML='<b>'+mode.replace(/-/g," ")+'</b>'+(recognition && recognition!=="none" ? '<span class="md-st-sep"></span>'+recognition+' reconstruction' : "");
    return;
  }
  var lbl = activeSketchFrame() ? ["U", "V"] : E.view === "top" ? ["X", "Z"] : E.view === "front" ? ["X", "Y"] : ["Z", "Y"];
  var m = E._mouse;
  st.innerHTML =
    '<b>' + sketchPlaneCaption() + "</b>" +
    '<span class="md-st-sep"></span>' +
    (m ? lbl[0] + " " + (Math.round(m.u * 10) / 10) + " · " + lbl[1] + " " + (Math.round(m.v * 10) / 10) + " cm" : "—") +
    '<span class="md-st-sep"></span>' +
    (E.mode === "drawing" ? '<i class="ph ph-eye"></i> '+t("modeDrawing") : '<i class="ph ph-grid-four"></i> ' + E.grid + " cm") +
    (E.osnap ? '<span class="md-st-sep"></span><i class="ph ph-magnet"></i>' : "") +
    '<span class="md-st-sep"></span>' + Math.round(E.scl * 50) + "%" +
    (E.docType === "part" && E.solveInfo && ensureSketch(E.def).entities.length
      ? '<span class="md-st-sep"></span><span class="md-st-dof md-dof-' + E.solveInfo.status + '">' +
        (E.solveInfo.status === "fully-constrained" ? t("dofFull")
          : E.solveInfo.status === "conflicting" ? t("dofConflict")
          : E.solveInfo.status === "over-constrained" ? t("dofOver")
          : t("dofUnder") + " " + E.solveInfo.degreesOfFreedom) + "</span>"
      : "") +
    (sketchSelectionSummary() ? '<span class="md-st-sep"></span><b class="md-st-selection">' + sketchSelectionSummary() + "</b>" : "");
}

/* ================= sketch canvas ================= */
/* Backing store at device resolution, drawing in CSS pixels. Without the scale
   every line of the sketch is resampled on a retina screen, which on a drawing
   made of one-pixel strokes is the difference between a CAD view and a smear.
   E.cw/E.ch are the CSS size — the pan/zoom maths is all in those units. */
function sizeSketch() {
  var r = E.cv.parentElement.getBoundingClientRect();
  /* The editor is measured the moment it is shown, which on the first open can
     be before layout has run — the pane reports 0×0. Every bit of pan/zoom
     maths is in these units, so a zero here does not fail loudly: it silently
     clamps zoom-to-fit to its floor and puts the drawing in a corner. Keep the
     last good size until a real one arrives (the observer below re-measures). */
  if (r.width < 1 || r.height < 1) return false;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  E.cw = r.width; E.ch = r.height;
  E.cv.width = Math.round(r.width * dpr);
  E.cv.height = Math.round(r.height * dpr);
  if (E.cx) E.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!E._centered) { E.ox = r.width / 2; E.oy = r.height / 2; E._centered = true; }
  return true;
}

/* One observer covers every way the drawing area can change size: the editor
   opening, the right panel being dragged, the window resizing, the browser
   zooming. Before this, only window resize was handled. */
function watchSketchSize() {
  if (E._sizeObserver || typeof ResizeObserver === "undefined") return;
  E._sizeObserver = new ResizeObserver(function () {
    if (!E.open) return;
    var was = E.cw;
    if (!sizeSketch()) return;
    // the first real measurement is also the first chance to frame the model
    if (!was && E.mode !== "3d") fitSketch(); else drawSketch();
    layout3DHost();
  });
  E._sizeObserver.observe(E.cv.parentElement);
}

/* A released drawing should be useful even when the sketch author never added
   driving constraints. Explicit dimensions still render normally; uncovered
   lines, circles and arcs receive lightweight measured dimensions here. */
function drawAutomaticDrawingDimensions(c, sketch, points) {
  if (E.mode !== "drawing" || !sketch) return;
  var covered = new Set((sketch.constraints || []).filter(function(con){
    return !con.suppressed && con.entity && con.value != null;
  }).map(function(con){return con.entity;}));
  c.save(); c.font="10px sans-serif"; c.textAlign="center"; c.textBaseline="middle";
  (sketch.entities || []).forEach(function(entity){
    if (entity.construction || covered.has(entity.id)) return;
    var label, x, y;
    if (entity.type === "line") {
      var a=points.get(entity.a), b=points.get(entity.b); if(!a||!b)return;
      var pa=toPx(a.x,a.y),pb=toPx(b.x,b.y),dx=pb.x-pa.x,dy=pb.y-pa.y,L=Math.hypot(dx,dy);if(L<1)return;
      label=(Math.round(Math.hypot(b.x-a.x,b.y-a.y)*10)/10)+" cm";
      x=(pa.x+pb.x)/2-(dy/L)*11;y=(pa.y+pb.y)/2+(dx/L)*11;
    } else {
      var circle=circleData(entity,points);if(!circle)return;
      var center=toPx(circle.center.x,circle.center.y);
      label="R "+(Math.round(Math.abs(circle.radius)*10)/10)+" cm";
      x=center.x+Math.abs(circle.radius)*E.scl*.58;y=center.y-Math.abs(circle.radius)*E.scl*.58;
    }
    var tw=c.measureText(label).width;
    c.fillStyle="rgba(255,255,255,.94)";c.fillRect(x-tw/2-3,y-7,tw+6,14);
    c.fillStyle="#263340";c.fillText(label,x,y);
  });
  c.restore();
}
/* Trace an ellipse in screen space. The on-screen tilt is read back out of the
   projection rather than assumed, because half the views mirror v — and a
   mirrored ellipse is the same ellipse at the negated angle, which is exactly
   what projecting its major axis gives. */
function pathEllipse(c, o) {
  if (!o || o.rx < 1e-4 || o.ry < 1e-4) return false;
  var centre = toPx(o.center.x, o.center.y);
  var tip = toPx(o.center.x + Math.cos(o.rot), o.center.y + Math.sin(o.rot));
  c.ellipse(centre.x, centre.y, o.rx * E.scl, o.ry * E.scl,
    Math.atan2(tip.y - centre.y, tip.x - centre.x), 0, Math.PI * 2);
  return true;
}

function drawSketch() {
  if (!E.open) return;
  invalidateSketchProjection();   // the camera or the pane may have moved since
  syncContextActions();
  if (!E.cw || !E.ch) sizeSketch();
  var c = E.cx, W = E.cw, H = E.ch;
  c.clearRect(0, 0, W, H);
  var drawing = E.mode === "drawing";
  if (drawing) {
    c.fillStyle = "#dfe3e8"; c.fillRect(0,0,W,H);
    c.fillStyle = "#fff"; c.fillRect(22,22,Math.max(0,W-44),Math.max(0,H-44));
    c.strokeStyle = "#202832"; c.lineWidth = 1; c.strokeRect(29.5,29.5,Math.max(0,W-59),Math.max(0,H-59));
    var titleW=Math.min(230,Math.max(150,W*.3)), titleX=W-30-titleW, titleY=H-86;
    c.strokeRect(titleX+.5,titleY+.5,titleW,56); c.beginPath();c.moveTo(titleX,titleY+28);c.lineTo(titleX+titleW,titleY+28);c.moveTo(titleX+titleW*.62,titleY);c.lineTo(titleX+titleW*.62,titleY+56);c.stroke();
    c.fillStyle="#202832";c.font="600 11px sans-serif";c.fillText((E.def&&E.def.name)||t("newModel"),titleX+8,titleY+18);
    c.font="10px sans-serif";c.fillText(sketchPlaneCaption(),titleX+8,titleY+46);c.fillText("cm",titleX+titleW*.67,titleY+18);
  }
  /* Grid and axes. Over the model they belong to the sketch PLANE, so they are
     drawn in u/v and projected like everything else — a grid that recedes with
     the face is what tells you which plane you are drawing on when the camera
     is not square to it. On the flat sheet they stay screen-aligned. */
  var step = E.grid * E.scl;
  while (step < 8) step *= 2;
  c.strokeStyle = "rgba(120,130,140,.15)";
  c.lineWidth = 1;
  var projected = sketchProjection();
  if (projected) {
    var reach = E.grid * 20, spacing = E.grid * (E.scl < 1.2 ? 4 : 1);
    c.beginPath();
    for (var g = -reach; g <= reach + 1e-6; g += spacing) {
      var lineStart = toPx(-reach, g), lineEnd = toPx(reach, g);
      c.moveTo(lineStart.x, lineStart.y); c.lineTo(lineEnd.x, lineEnd.y);
      var colStart = toPx(g, -reach), colEnd = toPx(g, reach);
      c.moveTo(colStart.x, colStart.y); c.lineTo(colEnd.x, colEnd.y);
    }
    c.stroke();
    c.strokeStyle = "rgba(90,140,220,.55)";
    c.beginPath();
    var uA = toPx(-reach, 0), uB = toPx(reach, 0), vA = toPx(0, -reach), vB = toPx(0, reach);
    c.moveTo(uA.x, uA.y); c.lineTo(uB.x, uB.y); c.moveTo(vA.x, vA.y); c.lineTo(vB.x, vB.y);
    c.stroke();
    c.fillStyle = "rgba(90,110,130,.85)";
    c.font = "11px sans-serif";
    c.fillText("U", uB.x + 4, uB.y - 4);
    c.fillText("V", vB.x + 4, vB.y - 4);
  } else {
    c.beginPath();
    if (!drawing) {
      for (var gx = E.ox % step; gx < W; gx += step) { c.moveTo(gx, 0); c.lineTo(gx, H); }
      for (var gy = E.oy % step; gy < H; gy += step) { c.moveTo(0, gy); c.lineTo(W, gy); }
    }
    c.stroke();
    // axes through origin
    c.strokeStyle = drawing ? "rgba(45,55,65,.28)" : "rgba(90,140,220,.5)";
    if (drawing) c.setLineDash([10,4,2,4]);
    c.beginPath(); c.moveTo(0, E.oy); c.lineTo(W, E.oy); c.moveTo(E.ox, 0); c.lineTo(E.ox, H); c.stroke();
    c.setLineDash([]);
    c.fillStyle = "rgba(90,110,130,.8)";
    c.font = "11px sans-serif";
    var lbl = activeSketchFrame() ? ["U", "V"] : E.view === "top" ? ["X", "Z"] : E.view === "front" ? ["X", "Y"] : ["Z", "Y"];
    c.fillText(lbl[0], W - 14, E.oy - 6);
    c.fillText(lbl[1], E.ox + 6, 14);
  }

  // parts — a step that is suppressed or below the rollback bar is drawn as a
  // dashed ghost, so the canvas never shows something the model does not have
  var built = renderedParts(E.def);
  (E.def.parts || []).forEach(function (p) {
    // Over the model the shaded solid IS the part. Its flattened u/v outline on
    // top of itself was only ever a stand-in for a model you could not see.
    if (projected) return;
    var f = partUV(p), on = p === E.sel, inactive = built.indexOf(p) < 0;
    c.save();
    if (inactive) { c.globalAlpha = 0.4; c.setLineDash([6, 4]); }
    c.strokeStyle = drawing ? "#18212b" : on ? "#e08030" : "#5a7a9a";
    c.fillStyle = drawing ? "rgba(255,255,255,0)" : on ? "rgba(224,128,48,.18)" : "rgba(90,122,154,.10)";
    c.lineWidth = drawing ? 1.45 : on ? 2 : 1.2;
    c.beginPath();
    if (f.type === "rect") {
      var a = toPx(f.u0, f.v0), b = toPx(f.u1, f.v1);
      c.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else if (f.type === "circle") {
      var q = toPx(f.u, f.v);
      c.arc(q.x, q.y, f.r * E.scl, 0, 7);
    } else if(f.type === "segments") {
      f.segments.forEach(function(segment){var a=toPx(segment.a.u,segment.a.v),b=toPx(segment.b.u,segment.b.v);c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);});
    } else {
      f.pts.forEach(function (q, i) {
        var s = toPx(q.u, q.v);
        if (i === 0) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
      });
      c.closePath();
      // hole loops as sub-paths; evenodd fill leaves them empty
      (f.holes || p.holes || []).forEach(function (hl) {
        hl.forEach(function (q, i) {
          var s = toPx(q.u, q.v);
          if (i === 0) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
        });
        c.closePath();
      });
    }
    if(f.type!=="segments")c.fill("evenodd"); c.stroke();
    // vertex handles + edge lengths for a selected sketched polygon
    if (on && f.type === "poly") {
      c.fillStyle = "#e08030";
      f.pts.forEach(function (q, i) {
        var s = toPx(q.u, q.v);
        c.fillRect(s.x - 3, s.y - 3, 6, 6);
        var q2 = f.pts[(i + 1) % f.pts.length], s2 = toPx(q2.u, q2.v);
        var L = Math.hypot(q2.u - q.u, q2.v - q.v);
        c.fillStyle = "#7a5a30";
        c.fillText(Math.round(L) + "", (s.x + s2.x) / 2 + 3, (s.y + s2.y) / 2 - 3);
        c.fillStyle = "#e08030";
      });
    }
    // dimensions for selected rect
    if (on && f.type === "rect") {
      var a2 = toPx(f.u0, f.v0), b2 = toPx(f.u1, f.v1);
      c.fillStyle = "#7a5a30";
      c.fillText(Math.round(Math.abs(f.u1 - f.u0)) + "", (a2.x + b2.x) / 2 - 8, Math.min(a2.y, b2.y) - 5);
      c.fillText(Math.round(Math.abs(f.v1 - f.v0)) + "", Math.max(a2.x, b2.x) + 5, (a2.y + b2.y) / 2);
    }
    c.restore();
  });

  // A drawing sheet always carries the projected overall size, independent of
  // selection. The editable sketch keeps its contextual, selection-based sizes.
  if (drawing && built.length) {
    var db=defBounds(E.def), du0,du1,dv0,dv1;
    if(E.view==="top"){du0=db.x0;du1=db.x1;dv0=db.z0;dv1=db.z1;}
    else if(E.view==="front"){du0=db.x0;du1=db.x1;dv0=db.y0;dv1=db.y1;}
    else{du0=db.z0;du1=db.z1;dv0=db.y0;dv1=db.y1;}
    var d0=toPx(du0,dv0),d1=toPx(du1,dv1),left=Math.min(d0.x,d1.x),right=Math.max(d0.x,d1.x),top=Math.min(d0.y,d1.y),bottom=Math.max(d0.y,d1.y);
    c.save();c.strokeStyle="#34414e";c.fillStyle="#18212b";c.lineWidth=1;c.font="10px sans-serif";
    var hy=Math.max(40,top-22);c.beginPath();c.moveTo(left,top);c.lineTo(left,hy-4);c.moveTo(right,top);c.lineTo(right,hy-4);c.moveTo(left,hy);c.lineTo(right,hy);c.moveTo(left,hy);c.lineTo(left+6,hy-3);c.moveTo(left,hy);c.lineTo(left+6,hy+3);c.moveTo(right,hy);c.lineTo(right-6,hy-3);c.moveTo(right,hy);c.lineTo(right-6,hy+3);c.stroke();
    var wt=(Math.round(Math.abs(du1-du0)*10)/10)+" cm";c.fillStyle="#fff";var wtw=c.measureText(wt).width;c.fillRect((left+right-wtw)/2-4,hy-7,wtw+8,14);c.fillStyle="#18212b";c.fillText(wt,(left+right-wtw)/2,hy+3);
    var vx=Math.min(W-40,right+24);c.beginPath();c.moveTo(right,top);c.lineTo(vx-4,top);c.moveTo(right,bottom);c.lineTo(vx-4,bottom);c.moveTo(vx,top);c.lineTo(vx,bottom);c.moveTo(vx,top);c.lineTo(vx-3,top+6);c.moveTo(vx,top);c.lineTo(vx+3,top+6);c.moveTo(vx,bottom);c.lineTo(vx-3,bottom-6);c.moveTo(vx,bottom);c.lineTo(vx+3,bottom-6);c.stroke();
    var ht=(Math.round(Math.abs(dv1-dv0)*10)/10)+" cm";c.save();c.translate(vx+4,(top+bottom)/2);c.rotate(-Math.PI/2);c.fillStyle="#fff";var htw=c.measureText(ht).width;c.fillRect(-htw/2-4,-9,htw+8,14);c.fillStyle="#18212b";c.fillText(ht,-htw/2,1);c.restore();c.restore();
  }

  // True sketch entities are independent from solid parts. Lines carry
  // constraints and metadata but create no 3D body until a feature consumes a
  // closed profile.
  var drawingSketches = drawing ? sketchesOnPlane(E.view) : [];
  var sketch = drawingSketches.length ? drawingSketches[drawingSketches.length-1] : ensureSketch(E.def);

  /* Other sketches sharing this plane are drawn first, dimmed and unpickable —
     they are context you constrain against, not geometry you are editing. A
     sketch on another plane is not drawn at all: it is not in this projection,
     and pretending otherwise is what let a top-plane profile extrude as if it
     had been drawn on the front. */
  ensureSketchDoc(E.def).forEach(function (other) {
    if (other === sketch || !sameSketchContext(other,sketch)) return;
    var opts = new Map((other.points || []).map(function (q) { return [q.id, q]; }));
    c.save();
    c.globalAlpha = drawing ? 1 : 0.32;
    c.strokeStyle = drawing ? "#18212b" : "#5a7a9a";
    c.lineWidth = 1.1;
    (other.entities || []).forEach(function (e) {
      c.beginPath();
      if (e.type === "line") {
        var a = opts.get(e.a), b = opts.get(e.b);
        if (!a || !b) return;
        var sa = toPx(a.x, a.y), sb = toPx(b.x, b.y);
        c.moveTo(sa.x, sa.y); c.lineTo(sb.x, sb.y);
      } else if (e.type === "ellipse") {
        if (!pathEllipse(c, ellipseData(e, opts))) return;
      } else {
        var o = circleData(e, opts);
        if (!o) return;
        var sc = toPx(o.center.x, o.center.y);
        if (e.type === "arc") c.arc(sc.x, sc.y, Math.abs(o.radius) * E.scl, -o.end, -o.start);
        else c.arc(sc.x, sc.y, Math.abs(o.radius) * E.scl, 0, Math.PI * 2);
      }
      c.stroke();
    });
    if (drawing) {
      drawAutomaticDrawingDimensions(c, other, opts);
      drawSketchDimensions(c, other, E.scl, toPx, []);
    }
    c.restore();
  });

  var spts = new Map((sketch.points || []).map(function (q) { return [q.id, q]; }));
  var conflicts = (E.solveInfo && E.solveInfo.conflicts) || [];
  var fully = E.solveInfo && E.solveInfo.status === "fully-constrained";
  // A fully defined sketch turns black the way a CAD sketch does — it is the
  // one piece of state you want readable without looking at any panel.
  var baseCol = drawing ? "#18212b" : fully ? "#1b2733" : "#2684c7";
  // The active sketch is only live in its own plane. Looking at a plane it does
  // not belong to shows an empty sheet — the next mark opens a sketch there.
  var live = sketch.frameSpace==="local" ? !!(E.modelPlaneActive || E.mode==="2d") : sketch.plane === E.view;

  (live ? sketch.entities || [] : []).forEach(function (entity) {
    var selected = E.ssel.indexOf(entity) >= 0;
    c.save();
    c.strokeStyle = entity.construction ? "#8394a6" : selected ? "#e08030" : baseCol;
    c.lineWidth = selected ? 2.3 : Math.max(1.2, entity.weight || 1.2);
    if (entity.construction) c.setLineDash([7, 4]);
    c.beginPath();
    if (entity.type === "line") {
      // read through the map built above, not by re-scanning the point array:
      // that scan is per line per frame, which is the whole sketch squared
      var a = spts.get(entity.a), b = spts.get(entity.b);
      if (!a || !b) { c.restore(); return; }
      var sa = toPx(a.x, a.y), sb = toPx(b.x, b.y);
      c.moveTo(sa.x, sa.y); c.lineTo(sb.x, sb.y); c.stroke();
      c.setLineDash([]);
      // Only the selected line states its own size. Labelling every segment
      // duplicates whatever dimensions the sketch already carries and buries
      // the constraint glyphs underneath the text.
      if (selected) {
        var len = Math.hypot(b.x - a.x, b.y - a.y);
        var ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        c.fillStyle = "#e08030";
        c.font = "11px sans-serif";
        c.fillText(Math.round(len * 10) / 10 + " cm · " + Math.round(ang * 10) / 10 + "°", (sa.x + sb.x) / 2 + 5, (sa.y + sb.y) / 2 - 7);
      }
    } else if (entity.type === "ellipse") {
      var el2 = ellipseData(entity, spts);
      if (!pathEllipse(c, el2)) { c.restore(); return; }
      c.stroke();
      c.setLineDash([]);
      if (selected) {
        var ec = toPx(el2.center.x, el2.center.y);
        c.fillStyle = "#e08030";
        c.font = "11px sans-serif";
        c.fillText(Math.round(el2.rx * 10) / 10 + " × " + Math.round(el2.ry * 10) / 10, ec.x + 4, ec.y - 4);
      }
    } else {
      var o = circleData(entity, spts);
      if (!o) { c.restore(); return; }
      var sc = toPx(o.center.x, o.center.y), rpx = Math.abs(o.radius) * E.scl;
      // canvas y grows downward in every view, so a sweep drawn CCW in model
      // space is drawn CW on screen
      if (entity.type === "arc") c.arc(sc.x, sc.y, rpx, -o.end, -o.start);
      else c.arc(sc.x, sc.y, rpx, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      if (selected) {
        c.fillStyle = "#e08030";
        c.font = "11px sans-serif";
        c.fillText("R " + Math.round(o.radius * 10) / 10, sc.x + 4, sc.y - 4);
      }
    }
    c.restore();
  });

  // sketch points, drawn over the entities so they stay grabbable
  (live && (!drawing || E.tool === "dim") ? sketch.points || [] : []).forEach(function (q) {
    var s = toPx(q.x, q.y), on = E.ssel.indexOf(q) >= 0;
    c.fillStyle = on ? "#e08030" : q.fixed ? "#0f8a6a" : drawing ? "#4f46e5" : baseCol;
    if (drawing) {
      c.save(); c.strokeStyle = "#fff"; c.lineWidth = 2; c.beginPath(); c.arc(s.x, s.y, on ? 5 : 4, 0, Math.PI * 2); c.stroke(); c.fill(); c.restore();
    } else c.fillRect(s.x - 3, s.y - 3, 6, 6);
    if (q.fixed) { c.strokeStyle = "#0f8a6a"; c.lineWidth = 1; c.strokeRect(s.x - 5, s.y - 5, 10, 10); }
  });

  if (drawing && E.tool === "dim" && E.dimPick.length && E._mouse) {
    var picked = E.dimPick[0], pickPx = toPx(picked.x, picked.y), mousePx = toPx(E._mouse.u, E._mouse.v);
    c.save(); c.strokeStyle = "#e08030"; c.fillStyle = "#e08030"; c.lineWidth = 1.4; c.setLineDash([5,4]);
    c.beginPath(); c.moveTo(pickPx.x, pickPx.y); c.lineTo(mousePx.x, mousePx.y); c.stroke(); c.setLineDash([]);
    c.font = "600 11px sans-serif";
    c.fillText(Math.round(Math.hypot(E._mouse.u-picked.x,E._mouse.v-picked.y)*10)/10 + " cm", (pickPx.x+mousePx.x)/2+5, (pickPx.y+mousePx.y)/2-6);
    c.restore();
  }

  if (live) {
    var profileInfo = sketchProfileAnalysis();
    // A faint region fill makes the exact profiles the feature engine sees
    // visible. Open and branched endpoints are called out directly on-canvas.
    (!drawing ? profileInfo.profiles : []).forEach(function (profile) {
      if (!profile.points.length) return;
      c.save(); c.globalAlpha = profile.selected ? 0.14 : 0.065;
      c.fillStyle = profile.selected ? "#e08030" : "#2684c7";
      c.beginPath();
      profile.points.forEach(function (p, index) { var sp = toPx(p.u, p.v); if (!index) c.moveTo(sp.x, sp.y); else c.lineTo(sp.x, sp.y); });
      c.closePath(); c.fill(); c.restore();
    });
    profileInfo.openEnds.forEach(function (p) {
      var sp = toPx(p.x, p.y);
      c.save(); c.strokeStyle = "#d0342c"; c.lineWidth = 2; c.beginPath(); c.arc(sp.x, sp.y, 7, 0, Math.PI * 2); c.stroke(); c.restore();
    });
    profileInfo.branchPoints.forEach(function (p) {
      var sp = toPx(p.x, p.y);
      c.save(); c.fillStyle = "#d0342c"; c.translate(sp.x, sp.y); c.rotate(Math.PI / 4); c.fillRect(-5, -5, 10, 10); c.restore();
    });
    if (drawing) drawAutomaticDrawingDimensions(c, sketch, spts);
    drawSketchDimensions(c, sketch, E.scl, toPx, conflicts, { selectedId:drawing ? E.dimSel : null });
    if (!drawing) drawConstraintGlyphs(c, sketch, toPx, conflicts);
  }

  // in-progress circle / arc
  if (E.tool === "scirc" && E.drag && E.drag.mode === "scirc" && E._mouse) {
    var cc = toPx(E.drag.u, E.drag.v);
    c.save(); c.strokeStyle = "#2684c7"; c.setLineDash([5, 4]); c.beginPath();
    c.arc(cc.x, cc.y, Math.hypot(E._mouse.u - E.drag.u, E._mouse.v - E.drag.v) * E.scl, 0, Math.PI * 2);
    c.stroke(); c.restore();
  }
  if (E.arcPts && E.arcPts.length && E._mouse) {
    var ac = toPx(E.arcPts[0].u, E.arcPts[0].v);
    var ar = E.arcPts.length > 1
      ? Math.hypot(E.arcPts[1].u - E.arcPts[0].u, E.arcPts[1].v - E.arcPts[0].v)
      : Math.hypot(E._mouse.u - E.arcPts[0].u, E._mouse.v - E.arcPts[0].v);
    c.save(); c.strokeStyle = "#2684c7"; c.setLineDash([5, 4]);
    c.beginPath(); c.arc(ac.x, ac.y, ar * E.scl, 0, Math.PI * 2); c.stroke();
    c.fillStyle = "#2684c7"; c.fillRect(ac.x - 3, ac.y - 3, 6, 6);
    c.restore();
  }

  // Connected wall/line chain preview. Each committed span becomes a real,
  // independently constrained extruded feature; the centreline remains visible
  // so users can continue the chain with predictable endpoint snapping.
  if (E.wallPts && E.wallPts.length && E._mouse) {
    var w0 = E.wallPts[E.wallPts.length - 1], w1 = E._mouse;
    var ws0 = toPx(w0.u, w0.v), ws1 = toPx(w1.u, w1.v);
    c.save();
    c.strokeStyle = "#18a36b";
    c.lineWidth = 2;
    c.setLineDash([8, 5]);
    c.beginPath(); c.moveTo(ws0.x, ws0.y); c.lineTo(ws1.x, ws1.y); c.stroke();
    c.setLineDash([]);
    c.fillStyle = "#18a36b";
    c.fillRect(ws0.x - 4, ws0.y - 4, 8, 8);
    var liveL = Math.hypot(w1.u - w0.u, w1.v - w0.v);
    var liveA = (Math.atan2(w1.v - w0.v, w1.u - w0.u) * 180) / Math.PI;
    if (!E.dynInput) c.fillText(Math.round(liveL * 10) / 10 + " cm · " + Math.round(liveA * 10) / 10 + "°", ws1.x + 10, ws1.y - 10);
    c.restore();
  }

  // in-progress slot: centreline, then the full outline once the width is live
  if (E.slotPts && E.slotPts.length && E._mouse) {
    var s0 = E.slotPts[0], s1 = E.slotPts[1] || E._mouse;
    c.save(); c.strokeStyle = "#2684c7"; c.lineWidth = 1.5; c.setLineDash([6, 4]);
    var sp0 = toPx(s0.u, s0.v), sp1 = toPx(s1.u, s1.v);
    c.beginPath(); c.moveTo(sp0.x, sp0.y); c.lineTo(sp1.x, sp1.y); c.stroke();
    if (E.slotPts.length > 1) {
      var halfW = pointToLineDistance(E._mouse, s0, s1);
      c.setLineDash([]);
      strokeSlotOutline(c, s0, s1, halfW);
    }
    c.fillStyle = "#2684c7"; c.fillRect(sp0.x - 3, sp0.y - 3, 6, 6);
    c.restore();
  }

  // in-progress ellipse: major axis, then the curve once the minor is live
  if (E.ellPts && E.ellPts.length && E._mouse) {
    var e0 = E.ellPts[0], e1 = E.ellPts[1] || E._mouse;
    c.save(); c.strokeStyle = "#2684c7"; c.lineWidth = 1.5; c.setLineDash([6, 4]);
    var ep0 = toPx(e0.u, e0.v), ep1 = toPx(e1.u, e1.v);
    c.beginPath(); c.moveTo(ep0.x, ep0.y); c.lineTo(ep1.x, ep1.y); c.stroke();
    if (E.ellPts.length > 1) {
      c.setLineDash([]);
      c.beginPath();
      pathEllipse(c, {
        center: { x: e0.u, y: e0.v },
        rx: Math.hypot(e1.u - e0.u, e1.v - e0.v),
        ry: Math.max(0.01, pointToLineDistance(E._mouse, e0, e1)),
        rot: Math.atan2(e1.v - e0.v, e1.u - e0.u),
      });
      c.stroke();
    }
    c.fillStyle = "#2684c7"; c.fillRect(ep0.x - 3, ep0.y - 3, 6, 6);
    c.restore();
  }

  // in-progress polygon: the n-gon the release will actually build
  if (E.tool === "spoly" && E.drag && E.drag.mode === "spoly" && E._mouse) {
    var pc = { u: E.drag.u, v: E.drag.v };
    var pr = Math.hypot(E._mouse.u - pc.u, E._mouse.v - pc.v);
    var pa = Math.atan2(E._mouse.v - pc.v, E._mouse.u - pc.u);
    c.save(); c.strokeStyle = "#2684c7"; c.lineWidth = 1.5;
    c.beginPath();
    for (var pk = 0; pk <= E.polySides; pk++) {
      var pang = pa + (pk * Math.PI * 2) / E.polySides;
      var pp = toPx(pc.u + Math.cos(pang) * pr, pc.v + Math.sin(pang) * pr);
      if (!pk) c.moveTo(pp.x, pp.y); else c.lineTo(pp.x, pp.y);
    }
    c.stroke();
    c.setLineDash([4, 4]); c.strokeStyle = "rgba(38,132,199,.5)";
    var pcp = toPx(pc.u, pc.v);
    c.beginPath(); c.arc(pcp.x, pcp.y, pr * E.scl, 0, Math.PI * 2); c.stroke();
    c.restore();
  }

  // in-progress polygon (green = add material, red dashed = cut)
  var cutting = E.tool === "cut" || E.tool === "cutc";
  if (E.poly && E.poly.length) {
    c.strokeStyle = cutting ? "#c03030" : "#30a060";
    c.lineWidth = 2;
    if (cutting) c.setLineDash([5, 4]);
    c.beginPath();
    E.poly.forEach(function (q, i) {
      var s = toPx(q.u, q.v);
      if (i === 0) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
    });
    if (E._mouse) { var m = toPx(E._mouse.u, E._mouse.v); c.lineTo(m.x, m.y); }
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = cutting ? "#c03030" : "#30a060";
    E.poly.forEach(function (q) { var s = toPx(q.u, q.v); c.fillRect(s.x - 3, s.y - 3, 6, 6); });
  }
  // rubber band for rect/circle/bore
  if (E.drag && (E.drag.mode === "draw" || E.drag.mode === "srect") && E._mouse) {
    var a3 = toPx(E.drag.u, E.drag.v), m2 = toPx(E._mouse.u, E._mouse.v);
    c.strokeStyle = cutting ? "#c03030" : "#30a060";
    c.lineWidth = 1.5;
    if (cutting) c.setLineDash([5, 4]);
    c.beginPath();
    if (E.tool === "rect" || E.tool === "srect") c.rect(Math.min(a3.x, m2.x), Math.min(a3.y, m2.y), Math.abs(m2.x - a3.x), Math.abs(m2.y - a3.y));
    else c.arc(a3.x, a3.y, Math.hypot(m2.x - a3.x, m2.y - a3.y), 0, 7);
    c.stroke();
    c.setLineDash([]);
  }
  // OSNAP marker: □ endpoint, △ midpoint, ○ center, ◇ quadrant, ✛ origin
  if (E._osnap) {
    var sp = toPx(E._osnap.u, E._osnap.v), k = E._osnap.k;
    c.strokeStyle = "#c8a018";
    c.lineWidth = 2;
    c.beginPath();
    if (k === "e") c.rect(sp.x - 5, sp.y - 5, 10, 10);
    else if (k === "m") { c.moveTo(sp.x, sp.y - 6); c.lineTo(sp.x + 6, sp.y + 5); c.lineTo(sp.x - 6, sp.y + 5); c.closePath(); }
    else if (k === "c") c.arc(sp.x, sp.y, 6, 0, 7);
    else if (k === "q") { c.moveTo(sp.x, sp.y - 6); c.lineTo(sp.x + 6, sp.y); c.lineTo(sp.x, sp.y + 6); c.lineTo(sp.x - 6, sp.y); c.closePath(); }
    else { c.moveTo(sp.x - 7, sp.y); c.lineTo(sp.x + 7, sp.y); c.moveTo(sp.x, sp.y - 7); c.lineTo(sp.x, sp.y + 7); }
    c.stroke();
  }

  // typed length/angle/size, last so nothing is drawn over the numbers
  if (E._mouse) {
    var hud = toPx(E._mouse.u, E._mouse.v);
    dynDrawHud(c, hud.x, hud.y);
  }
}

/* The slot outline as a path: two parallel sides and two half-circle caps —
   the same shape addSketchSlot builds, so the preview cannot promise geometry
   the commit will not produce. */
function strokeSlotOutline(c, a, b, halfWidth) {
  var dx = b.u - a.u, dy = b.v - a.v, span = Math.hypot(dx, dy);
  if (span < 1e-6 || halfWidth < 1e-6) return;
  // sampled in model space and projected point by point: half the views mirror
  // v, and a canvas arc drawn from an assumed sweep direction caps the wrong end
  var dir = Math.atan2(dy, dx), loop = [];
  var cap = function (centre, from) {
    for (var i = 0; i <= 12; i++) {
      var ang = from + (i / 12) * Math.PI;
      loop.push({ u: centre.u + Math.cos(ang) * halfWidth, v: centre.v + Math.sin(ang) * halfWidth });
    }
  };
  cap(b, dir - Math.PI / 2);
  cap(a, dir + Math.PI / 2);
  c.beginPath();
  loop.forEach(function (p, i) {
    var s = toPx(p.u, p.v);
    if (!i) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
  });
  c.closePath();
  c.stroke();
}

function hitPart(uv) {
  // Sketch geometry sits on top of the solids it will become, and is thinner,
  // so it gets first refusal on every pick.
  var sk = hitSketch(uv);
  if (sk) return sk;
  // topmost part whose footprint contains uv
  for (var i = E.def.parts.length - 1; i >= 0; i--) {
    var p = E.def.parts[i], f = partUV(p);
    if (f.type === "rect") {
      if (uv.u >= Math.min(f.u0, f.u1) && uv.u <= Math.max(f.u0, f.u1) && uv.v >= Math.min(f.v0, f.v1) && uv.v <= Math.max(f.v0, f.v1)) return p;
    } else if (f.type === "circle") {
      if (Math.hypot(uv.u - f.u, uv.v - f.v) <= f.r) return p;
    } else if (f.type === "segments") {
      var edgeTolerance=6/E.scl;
      if(f.segments.some(function(segment){return pointToLineDistance(uv,segment.a,segment.b)<=edgeTolerance;}))return p;
      if(f.bounds && uv.u>=f.bounds.u0&&uv.u<=f.bounds.u1&&uv.v>=f.bounds.v0&&uv.v<=f.bounds.v1)return p;
    } else {
      var inside = false, pts = f.pts;
      for (var a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        if (pts[a].v > uv.v !== pts[b].v > uv.v &&
          uv.u < ((pts[b].u - pts[a].u) * (uv.v - pts[a].v)) / (pts[b].v - pts[a].v) + pts[a].u) inside = !inside;
      }
      if (inside) return p;
    }
  }
  return null;
}

/* Evaluate results (mass, standards, interference, BOM) and the failures that
   have to be read word for word. These used to be native `alert()`s, which
   block the event loop — the WebGPU viewport freezes mid-frame behind them —
   and look nothing like the rest of the editor. Same dialog chrome as the
   reference picker; Esc and the backdrop dismiss it. */
function report(kicker, title, body) {
  var host = root && root.querySelector("#mdReport");
  if (!host) { flash(title); return; }
  root.querySelector("#mdReportKicker").textContent = kicker;
  root.querySelector("#mdReportTitle").textContent = title;
  root.querySelector("#mdReportBody").textContent = Array.isArray(body) ? body.join("\n") : String(body || "");
  host.hidden = false;
}

function closeReport() {
  var host = root && root.querySelector("#mdReport");
  if (host) host.hidden = true;
}

function reportOpen() {
  var host = root && root.querySelector("#mdReport");
  return !!(host && !host.hidden);
}

function flash(msg) {
  var hint = root && root.querySelector("#mdHint");
  if (!hint) return;
  hint.textContent = msg;
  hint.classList.add("live", "flash");
  clearTimeout(E._flashT);
  E._flashT = setTimeout(function () { hint.classList.remove("flash"); syncTools(); }, 1800);
}

function finishPoly() {
  if (E.poly && E.poly.length >= 3 && E.tool === "rev") {
    pushUndo(t("opRevolve"));
    E.sel = addPart({
      id: uid(), kind: "rev", name: "revolve",
      x: 0, z: 0, seg: 32,
      pts: E.poly.map(function (q) { return { u: q.u, v: q.v }; }),
      color: "#b89a6e", metal: 0.08, rough: 0.7,
    });
    E.poly = null;
    refreshAll();
    return;
  }
  if (E.poly && E.poly.length >= 3 && E.tool === "cut") {
    pushUndo(t("opCut"));
    flash(applyCut(E.poly) ? t("cutDone") : t("cutNone"));
    E.poly = null;
    refreshAll();
    return;
  }
  if (E.poly && E.poly.length >= 3) {
    pushUndo(t("opExtrude"));
    var frame=activeSketchFrame(), ax = frame ? "frame" : axisOfView();
    E.sel = addPart({
      id: uid(), kind: "ext", axis: ax, frame:frame ? cloneData(frame) : undefined,
      from: E.baseOff, to: E.baseOff + E.depth,
      pts: E.poly.map(function (q) { return { u: q.u, v: q.v }; }),
      color: "#b89a6e", metal: 0.08, rough: 0.7, name: "extrude",
    });
  }
  E.poly = null;
  refreshAll();
}

/* A cheap fingerprint of everything the profile analysis reads. Any real edit
   moves a point, changes a radius, or adds/removes an entity, and all of those
   land here — so a matching fingerprint means the analysis would return the
   same answer. */
function sketchFingerprint(sketch, selectedIds) {
  var h = 2166136261;
  var mix = function (n) { h = Math.imul(h ^ ((n | 0) + 0x9e3779b9), 16777619) >>> 0; };
  var mixText = function (s) { for (var i = 0; i < s.length; i++) mix(s.charCodeAt(i)); };
  mix(sketch.points.length); mix(sketch.entities.length);
  sketch.points.forEach(function (p) { mix(p.x * 1000); mix(p.y * 1000); });
  sketch.entities.forEach(function (e) {
    mixText(e.id); mixText(e.type || "");
    mix(e.construction ? 1 : 0);
    mix((e.r || 0) * 1000); mix((e.rx || 0) * 1000); mix((e.ry || 0) * 1000); mix((e.rot || 0) * 1000);
  });
  selectedIds.forEach(mixText);
  return h;
}
var profileMemo = { sketch: null, key: 0, value: null };

/* Called from the canvas every frame, from the extrude button and from the
   sketch pane — three times per refresh for one answer. Memoised on that
   fingerprint so the topology walk runs once per actual change. */
function sketchProfileAnalysis() {
  if (!E.def) return {status:"empty",profiles:[],openEnds:[],branchPoints:[],nearMergeCount:0};
  var sketch = ensureSketch(E.def);
  var selectedIds = selEntities().map(function (entity) { return entity.id; });
  var key = sketchFingerprint(sketch, selectedIds);
  if (profileMemo.sketch === sketch && profileMemo.key === key) return profileMemo.value;
  profileMemo.sketch = sketch;
  profileMemo.key = key;
  profileMemo.value = analyzeSketchProfiles(sketch, {
    selectedIds:selectedIds,
    // half a millimetre is small enough not to erase intentional details, but
    // large enough to repair the common "looks closed" endpoint split.
    tolerance:0.05,
  });
  return profileMemo.value;
}

/* The selected loop wins; otherwise the largest loop is the feature profile.
   Disconnected construction and reference geometry no longer blocks a valid
   region elsewhere in the sketch. */
function closedSketchProfile() {
  var analysis = sketchProfileAnalysis();
  return analysis.profiles.length ? analysis.profiles[0] : null;
}

function extrudeClosedSketch(options) {
  options=options || {};var featureType=options.type || "extrude",params={...featureDefaults(featureType),...options};delete params.type;
  var analysis = sketchProfileAnalysis(), profile = analysis.profiles[0];
  if (!profile) {
    flash(analysis.branchPoints.length ? t("profileBranched") : analysis.openEnds.length ? t("profileOpen") + " · " + analysis.openEnds.length + " " + t("profileEnds") : t("profileEmpty"));
    setTab("sketch");
    return false;
  }
  var sketch = ensureSketch(E.def);
  var target=featureType==="extrudeCut" ? (selectedSolid() || activeParts(E.def)[activeParts(E.def).length-1]) : null;
  var selectedTarget=(E.authoring.featureSelection || []).slice(-1)[0];
  if(selectedTarget&&!(E.def.features||[]).some(function(item){return item.id===selectedTarget;}))selectedTarget=null;
  var targetFeatureId=target ? (selectedTarget || ((E.def.features || []).slice(-1)[0]||{}).id || target.featureId) : null;
  if(featureType==="extrudeCut"&&!target){flash("Extrude Cut requires a target feature");return false;}
  pushUndo(featureType==="extrudeCut" ? "Extrude Cut" : "Extrude sketch");
  var inside = analysis.profiles.slice(1).filter(function (candidate) {
    return pointInProfile(profileCentroid(candidate.points), profile.points);
  });
  var usedIds = profile.entityIds.concat.apply(profile.entityIds.slice(), inside.map(function (hole) { return hole.entityIds; }));
  var healed = healSketchEndpoints(sketch, usedIds, analysis.tolerance);
  var axis = planeAxis(sketch.plane);
  var normal=sketch.frame && sketch.frame.normal;
  var direction=normal ? (axis==="x" ? Math.sign(normal.x || 1) : axis==="y" ? Math.sign(normal.y || 1) : Math.sign(normal.z || 1)) : 1;
  if (!direction) direction=1;
  var localFrame=sketch.frameSpace==="local" && sketch.frame;
  var depth=Math.max(.1,Number(params.depth)||E.depth),offset=Number.isFinite(Number(params.offset))?Number(params.offset):E.baseOff;
  var featureDirection=params.direction==="reverse"?-direction:direction,symmetric=!!params.symmetric||params.endCondition==="mid-plane";
  var center=(localFrame?0:sketch.offset)+featureDirection*offset;
  var start=symmetric?center-featureDirection*depth/2:center,end=symmetric?center+featureDirection*depth/2:center+featureDirection*depth;
  recordSketchInHistory(E.def,sketch);
  var feature=null;
  if(isCanonicalAuthoring()){
    try{
      feature=createFeatureDefinition(E.def,featureType,{
        inputs:targetFeatureId ? [targetFeatureId] : [],
        references:{sketches:[sketch.id],features:targetFeatureId ? [targetFeatureId] : [],topology:[],references:[],profileEntityIds:profile.entityIds},
        params:{...params,depth:depth,offset:offset,axis:localFrame?"frame":axis,profileEntityIds:profile.entityIds,sketchId:sketch.id,operation:featureType==="extrudeCut"?"subtract":params.operation || "add"},
      });
    }catch(error){H.discard();flash(String(error.message||error));return false;}
  }
  if(featureType==="extrudeCut"){
    var changed=applyCut(profile.points);
    if(!changed){if(feature)removeHistoryNode(E.def,"history:feature:"+feature.id);H.discard();flash(t("cutNone"));return false;}
    E.authoring.featureType=null;E.authoring.phase="model";refreshAll();flash("✓ Extrude Cut · "+(params.endCondition || "through-all"));return true;
  }
  var part = { id: uid(), kind: "ext", axis: localFrame ? "frame" : axis, frame:localFrame ? cloneData(sketch.frame) : undefined, from: start, to: end,
    pts: profile.points, holes:inside.map(function (hole) { return hole.points; }),
    profileEntityIds: profile.entityIds, holeProfileEntityIds:inside.map(function (hole) { return hole.entityIds; }),
    sketchId: sketch.id, sketchDriven: true, support:cloneData(sketch.support), supportBaseOffset:(Number(sketch.supportOffset)||0)+offset, supportDepth:depth,
    direction:params.direction,symmetric:symmetric,draftAngle:Number(params.draftAngle)||0,draftOutward:!!params.draftOutward,
    featureId:feature ? feature.id : undefined,
    color: "#b89a6e", metal: 0.08, rough: 0.7, name: feature ? feature.name : "Sketch Extrude" };
  part.to=end;part.supportDepth=depth;
  addPart(part); E.sel = part; refreshAll();
  flash("✓ " + t("opExtrude") + (inside.length ? " · " + inside.length + " " + t("profileHoles") : "") + (healed ? " · " + t("profileHealed") : ""));
  E.authoring.featureType=null;E.authoring.phase="model";
  return true;
}

function sketchLinePoints(line) {
  var sketch = ensureSketch(E.def);
  return { a: sketchPoint(sketch, line.a), b: sketchPoint(sketch, line.b) };
}

function newSketchPoint(sketch, p) {
  if (p.pointId && sketchPoint(sketch, p.pointId)) return p.pointId;
  var id = uid();
  sketch.points.push({ id: id, x: p.u, y: p.v });
  return id;
}

/* ================= parametric sketcher =================
   Sketch geometry is not the model. Lines, circles and arcs live in
   E.def.sketch with their constraints; solid parts only appear when a feature
   (extrude, revolve…) consumes a closed profile. Every edit that can move
   geometry ends in resolveSketch(), which is the single place the solver runs
   and the single place a conflicting edit gets rolled back. */

/* ---- which sketch you are drawing in ----
   A sketch belongs to a plane, so the view you are looking through decides
   which one is editable. Switching to a plane adopts the sketch already on it;
   the first mark you make on an empty plane opens a new one. */
function activeSketch() { return ensureSketch(E.def); }
function sketchesOnPlane(plane) {
  return ensureSketchDoc(E.def).filter(function (s) { return s.plane === plane && s.frameSpace!=="local"; });
}
// Call this from every path that CREATES sketch geometry.
function sketchForView() {
  var current = ensureSketch(E.def);
  if (current.plane === E.view) return current;
  var existing = sketchesOnPlane(E.view);
  var target = existing.length ? existing[existing.length - 1] : addSketch(E.def, E.view, 0);
  E.def.activeSketch = target.id;
  E.ssel = [];
  return target;
}
// Called when the view changes: adopt a sketch on the new plane if there is
// one, but do not create an empty sketch just because you looked at a plane.
function adoptSketchForView() {
  var current = ensureSketch(E.def);
  if (current.plane === E.view && current.frameSpace!=="local") return false;
  var existing = sketchesOnPlane(E.view);
  if (existing.length) {
    E.def.activeSketch = existing[existing.length - 1].id;
    E.ssel = [];
    if (isSketchObject(E.sel)) E.sel = null;
    E.solveInfo = solveSketch(ensureSketch(E.def));
    return true;
  }
  if (current.frameSpace==="local") {
    var principal=addSketch(E.def,E.view,0);
    E.def.activeSketch=principal.id;
    E.ssel=[];
    E.solveInfo=solveSketch(principal);
    return true;
  }
  if (!current.entities.length) {
    // an untouched sketch just follows you rather than littering the document
    current.plane = E.view;
    current.name = planeLabel(E.view) + " sketch";
    return true;
  }
  return false;
}

function constraintMeasure(sketch, constraint) {
  var target = null;
  if (constraint.type === "distance") target = constraint.entity
    ? {type:"line",id:constraint.entity} : {type:"points",a:constraint.a,b:constraint.b};
  else if (constraint.type === "radius" || constraint.type === "diameter") {
    var dimensioned = sketchEntity(sketch, constraint.entity);
    target = dimensioned && dimensioned.type === "ellipse"
      ? {type:"ellipse",id:constraint.entity,axis:constraint.axis}
      : {type:"circle",id:constraint.entity};
  }
  else if (constraint.type === "angle" && constraint.entity) {
    var entity = sketchEntity(sketch,constraint.entity);
    var line = lineData(entity,new Map((sketch.points || []).map(function (p) { return [p.id,p]; })));
    return line ? line.angle*180/Math.PI : constraint.value;
  } else if (constraint.type === "angle") target = {type:"angle",a:constraint.a,b:constraint.b};
  if (!target) return constraint.value;
  var measured = currentMeasure(sketch,target);
  return constraint.type === "diameter" ? measured*2 : measured;
}

// Run the solver. A constraint that cannot be satisfied is not left in the
// document half-applied — the geometry and the constraint list both go back.
function resolveSketch(rollbackOnConflict, fast) {
  var sketch = ensureSketch(E.def);
  // `fast` skips the solver's rank analysis: it is for frames inside a drag,
  // where the geometry has to follow the cursor and the DOF badge can wait for
  // the pointer to come up. Never combined with rollback, which reads status.
  var quick = !!fast && !rollbackOnConflict;
  // Snapshot values in place, keyed by id: the selection and the inspector hold
  // references to these very objects, and swapping in fresh ones on a rollback
  // would leave both pointing at geometry that is no longer in the document.
  var before = null;
  if (rollbackOnConflict) {
    before = { pts: {}, r: {} };
    sketch.points.forEach(function (p) { before.pts[p.id] = { x: p.x, y: p.y }; });
    sketch.entities.forEach(function (e) { if (e.type === "circle") before.r[e.id] = e.r; });
  }
  // Equations decide what the dimensions are, so they resolve first — solving
  // against last cycle's numbers would show geometry one edit behind.
  E.eqErrors = resolveEquations(E.def).errors;
  var report = solveSketch(sketch, quick ? { diagnostics: false } : {});
  // a quick pass keeps the previous status and conflict list on screen rather
  // than blanking the badge for the duration of a drag
  E.solveInfo = report.diagnostics === false
    ? Object.assign({}, E.solveInfo || {}, { converged: report.converged, error: report.error, stale: true })
    : report;
  sketch.constraints.forEach(function (constraint) {
    if (constraint.driven && constraint.value != null) constraint.value = constraintMeasure(sketch,constraint);
  });
  if (before && (E.solveInfo.status === "conflicting" || E.solveInfo.status === "over-constrained")) {
    sketch.points.forEach(function (p) {
      var q = before.pts[p.id];
      if (q) { p.x = q.x; p.y = q.y; }
    });
    sketch.entities.forEach(function (e) { if (e.id in before.r) e.r = before.r[e.id]; });
    // re-drive from the restored geometry, not from the state that failed
    syncSketchDrivenParts();
    return false;
  }
  syncSketchDrivenParts();
  return true;
}

/* Re-derive the profile of every solid that was extruded from a sketch. This is
   what makes the model parametric rather than a pile of frozen meshes: change a
   sketch dimension and the solid it drives changes with it.
   A profile that no longer resolves — an entity deleted, a loop opened — keeps
   its last good shape and is flagged, because silently deleting the user's
   solid is a far worse answer than showing a stale one with a warning. */
function syncSketchDrivenParts() {
  var changed = false;
  (E.def.parts || []).forEach(function (p) {
    if (!p.sketchDriven || !p.profileEntityIds || !p.profileEntityIds.length) return;
    var sketch = p.sketchId ? sketchById(E.def, p.sketchId) : ensureSketch(E.def);
    var pts = sketch ? resolveProfilePoints(sketch, p.profileEntityIds) : null;
    var holePts = sketch && Array.isArray(p.holeProfileEntityIds)
      ? p.holeProfileEntityIds.map(function (ids) { return resolveProfilePoints(sketch, ids); }) : [];
    if (!pts || holePts.some(function (loop) { return !loop; })) {
      if (!p.profileError) { p.profileError = true; changed = true; }
      return;
    }
    if (p.profileError) { p.profileError = false; changed = true; }
    // the plane can move under a feature too
    var axis = sketch.frameSpace==="local" && sketch.frame ? "frame" : planeAxis(sketch.plane);
    if (p.axis !== axis) { p.axis = axis; changed = true; }
    var geometryChanged=false;
    if (axis==="frame" && JSON.stringify(p.frame)!==JSON.stringify(sketch.frame)) { p.frame=cloneData(sketch.frame); changed=true; geometryChanged=true; }
    if (axis==="frame" && p.support) {
      var supportBase=(Number(sketch.supportOffset)||0)+(Number(p.from)||0);
      if (p.supportBaseOffset!==supportBase) {p.supportBaseOffset=supportBase;changed=true;}
    }
    if (pts.length !== p.pts.length || pts.some(function (q, i) {
      return Math.abs(q.u - p.pts[i].u) > 1e-6 || Math.abs(q.v - p.pts[i].v) > 1e-6;
    })) {
      p.pts = pts;
      geometryChanged=true;
      changed = true;
    }
    if (holePts.length && (holePts.length !== (p.holes || []).length || holePts.some(function (loop, h) {
      var old = (p.holes || [])[h] || [];
      return loop.length !== old.length || loop.some(function (q, i) { return !old[i] || Math.abs(q.u-old[i].u)>1e-6 || Math.abs(q.v-old[i].v)>1e-6; });
    }))) {
      p.holes = holePts;
      geometryChanged=true;
      changed = true;
    }
    if (geometryChanged) {
      delete p.meshData;
      if ((p.cuts3d && p.cuts3d.length) || p.exactFillet || (p.exactOperations && p.exactOperations.length)) scheduleExactMesh(p);
    }
  });
  return changed;
}

function syncFaceSupportedSketchFrames() {
  var changed=false, topology=[];
  (E.def.parts || []).forEach(function(part){topology=topology.concat(topologyEntriesForPart(part));});
  ensureSketchDoc(E.def).forEach(function(sketch){
    if (!sketch.support || sketch.frameSpace!=="local") return;
    var match=topology.find(function(entry){return entry.persistentId===sketch.support.persistentId;});
    if (!match && sketch.support.semantic) match=topology.find(function(entry){return entry.kind==="face" && entry.ownerFeatureId===sketch.support.ownerFeatureId && entry.semantic===sketch.support.semantic;});
    if (!match || !match.descriptor || !match.descriptor.origin || !match.descriptor.normal) return;
    var offset=Number(sketch.supportOffset)||0, origin={
      x:match.descriptor.origin.x+match.descriptor.normal.x*offset,
      y:match.descriptor.origin.y+match.descriptor.normal.y*offset,
      z:match.descriptor.origin.z+match.descriptor.normal.z*offset,
    };
    var aligned=realignFrame(sketch.frame,origin,match.descriptor.normal);
    if (JSON.stringify(aligned)!==JSON.stringify(sketch.frame)) {sketch.frame=aligned;changed=true;}
  });
  if (changed) syncSketchDrivenParts();
  return changed;
}

function sketchDrivingConstraints(sketch, id) {
  return (sketch.constraints || []).filter(function (c) {
    return c.entity === id || c.a === id || c.b === id || c.point === id;
  });
}

/* ---- selection: entities and points, Ctrl/Cmd to extend ---- */
var SKETCH_ENTITY_TYPES = ["line", "circle", "arc", "ellipse"];
/* The gate between sketch geometry and solid parts. Everything downstream keys
   off it — picking, the inspector, deletion — so a kind missing from this list
   gets handed to the solid-part code and reads a `pts` array that is not there. */
function isSketchObject(o) {
  return !!o && (SKETCH_ENTITY_TYPES.indexOf(o.type) >= 0 || (o.id && "x" in o && "y" in o));
}
function selectSketch(obj, additive) {
  if (!obj) { if (!additive) { E.ssel = []; E.sel = null; } return; }
  var i = E.ssel.indexOf(obj);
  if (additive) {
    if (i >= 0) E.ssel.splice(i, 1); else E.ssel.push(obj);
  } else E.ssel = [obj];
  E.sel = E.ssel.length ? E.ssel[E.ssel.length - 1] : null;
}
function selEntities() { return E.ssel.filter(function (o) { return SKETCH_ENTITY_TYPES.indexOf(o.type) >= 0; }); }
function selPoints() { return E.ssel.filter(function (o) { return o.type === undefined && "x" in o; }); }
function selLines() { return E.ssel.filter(function (o) { return o.type === "line"; }); }
function selCircles() { return E.ssel.filter(function (o) { return o.type === "circle" || o.type === "arc"; }); }
// Anything with a centre. Equal and concentric read this; tangent does not,
// because the solver's tangent residual is a circle's centre-to-line distance
// and has no meaning against an ellipse.
function selConics() { return E.ssel.filter(function (o) { return o.type === "circle" || o.type === "arc" || o.type === "ellipse"; }); }

function sketchSelectionSummary() {
  if (!E.def || !E.ssel.length) return "";
  var sketch = ensureSketch(E.def), points = new Map((sketch.points || []).map(function (p) { return [p.id, p]; }));
  var entities = selEntities(), pickedPoints = selPoints();
  if (entities.length > 1) {
    var total = entities.reduce(function (sum, entity) {
      if (entity.type === "line") { var line = lineData(entity, points); return sum + (line ? line.length : 0); }
      if (entity.type === "ellipse") {
        var el = ellipseData(entity, points);
        // Ramanujan's approximation — good to better than a part in 10^5, and
        // the alternative is an elliptic integral for a status-bar readout
        if (!el) return sum;
        var h = Math.pow(el.rx - el.ry, 2) / Math.pow(el.rx + el.ry, 2);
        return sum + Math.PI * (el.rx + el.ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
      }
      var circle = circleData(entity, points);
      if (!circle) return sum;
      if (entity.type === "circle") return sum + Math.PI * 2 * circle.radius;
      var span = (circle.end - circle.start + Math.PI * 2) % (Math.PI * 2);
      return sum + span * circle.radius;
    }, 0);
    return entities.length + " " + t("selectedLabel") + " · Σ " + Math.round(total * 10) / 10 + " cm";
  }
  if (entities.length === 1) {
    var entity = entities[0];
    if (entity.type === "line") {
      var line = lineData(entity, points);
      return line ? "L " + Math.round(line.length * 10) / 10 + " cm · " + Math.round(line.angle * 1800 / Math.PI) / 10 + "°" : "";
    }
    if (entity.type === "ellipse") {
      var one = ellipseData(entity, points);
      return one ? "Ø " + Math.round(one.rx * 20) / 10 + " × " + Math.round(one.ry * 20) / 10 + " cm · "
        + Math.round((one.rot * 1800) / Math.PI) / 10 + "° · A "
        + Math.round(Math.PI * one.rx * one.ry * 10) / 10 + " cm²" : "";
    }
    var circle = circleData(entity, points);
    return circle ? "R " + Math.round(circle.radius * 10) / 10 + " cm" + (entity.type === "circle" ? " · A " + Math.round(Math.PI * circle.radius * circle.radius * 10) / 10 + " cm²" : "") : "";
  }
  if (pickedPoints.length === 1) return "X " + Math.round(pickedPoints[0].x * 10) / 10 + " · Y " + Math.round(pickedPoints[0].y * 10) / 10 + " cm";
  return E.ssel.length + " " + t("selectedLabel");
}

/* Sketch hit test in model units. Points beat entities: a shared endpoint is
   the thing you almost always mean when you click where two lines meet. */
function hitSketch(uv) {
  var sketch = ensureSketch(E.def), tol = 7 / E.scl;
  if (sketch.frameSpace!=="local" && sketch.plane !== E.view) return null;
  var best = null, bd = tol;
  (sketch.points || []).forEach(function (p) {
    var d = Math.hypot(uv.u - p.x, uv.v - p.y);
    if (d < bd) { bd = d; best = p; }
  });
  if (best) return best;
  var points = new Map((sketch.points || []).map(function (p) { return [p.id, p]; }));
  bd = tol;
  (sketch.entities || []).forEach(function (e) {
    var d = Infinity;
    if (e.type === "line") {
      var l = lineData(e, points);
      if (!l) return;
      var ll = l.dx * l.dx + l.dy * l.dy;
      var t0 = ll ? clamp(((uv.u - l.a.x) * l.dx + (uv.v - l.a.y) * l.dy) / ll, 0, 1) : 0;
      d = Math.hypot(l.a.x + l.dx * t0 - uv.u, l.a.y + l.dy * t0 - uv.v);
    } else if (e.type === "ellipse") {
      var el = ellipseData(e, points);
      if (!el || el.rx < 1e-4 || el.ry < 1e-4) return;
      // distance to the rim via the point's parametric angle in the ellipse's
      // own frame — close enough to pick with, and never wrong by more than the
      // curvature between two samples
      var cos = Math.cos(el.rot), sin = Math.sin(el.rot);
      var ru = uv.u - el.center.x, rv = uv.v - el.center.y;
      var lx = ru * cos + rv * sin, ly = -ru * sin + rv * cos;
      var th = Math.atan2(ly / el.ry, lx / el.rx);
      d = Math.hypot(lx - Math.cos(th) * el.rx, ly - Math.sin(th) * el.ry);
    } else {
      var o = circleData(e, points);
      if (!o) return;
      d = Math.abs(Math.hypot(uv.u - o.center.x, uv.v - o.center.y) - o.radius);
      if (e.type === "arc") {
        // only the drawn sweep is pickable, not the rest of the circle
        var ang = Math.atan2(uv.v - o.center.y, uv.u - o.center.x);
        if (!angleInArc(ang, o.start, o.end)) d = Infinity;
      }
    }
    if (d < bd) { bd = d; best = e; }
  });
  return best;
}
// Arcs sweep counter-clockwise from start to end, matching how they are drawn.
function angleInArc(a, s, e) {
  var TAU = Math.PI * 2;
  var span = (e - s + TAU) % TAU, rel = (a - s + TAU) % TAU;
  return rel <= span + 1e-6;
}

/* ---- sketch entity creation ---- */
function addSketchCircle(centre, rim) {
  var sketch = sketchForView();
  var r = Math.hypot(rim.u - centre.u, rim.v - centre.v);
  if (r < 0.25) return null;
  var circle = {
    id: uid(), type: "circle", name: "Circle",
    c: newSketchPoint(sketch, centre), r: r, construction: false,
  };
  sketch.entities.push(circle);
  resolveSketch(false);
  return circle;
}
function addSketchRectangle(a, b) {
  if (Math.abs(b.u-a.u) < 0.1 || Math.abs(b.v-a.v) < 0.1) return null;
  var sketch = sketchForView();
  var ids = [
    newSketchPoint(sketch, {u:a.u,v:a.v}), newSketchPoint(sketch, {u:b.u,v:a.v}),
    newSketchPoint(sketch, {u:b.u,v:b.v}), newSketchPoint(sketch, {u:a.u,v:b.v}),
  ];
  var lines = ids.map(function (id, i) {
    return {id:uid(),type:"line",name:"Line",a:id,b:ids[(i+1)%ids.length],construction:false,weight:Math.max(1,E.wallWidth/5)};
  });
  sketch.entities.push.apply(sketch.entities, lines);
  lines.forEach(function (line, i) { sketch.constraints.push({id:uid(),type:i%2 ? "vertical" : "horizontal",entity:line.id}); });
  resolveSketch(false);
  return lines;
}

/* An ellipse is a real solver entity: centre, both semi-axes and a tilt, each
   one a variable the solver drives. Drawn centre → major axis end → minor
   radius, which is the order every CAD package asks for. */
function addSketchEllipse(centre, major, minorDistance) {
  var rx = Math.hypot(major.u - centre.u, major.v - centre.v);
  var ry = Math.abs(minorDistance);
  if (rx < 0.25 || ry < 0.25) return null;
  var sketch = sketchForView();
  var ellipse = {
    id: uid(), type: "ellipse", name: "Ellipse",
    c: newSketchPoint(sketch, centre),
    rx: rx, ry: ry, rot: Math.atan2(major.v - centre.v, major.u - centre.u),
    construction: false,
  };
  sketch.entities.push(ellipse);
  resolveSketch(false);
  return ellipse;
}

/* A slot: two lines capped by two arcs, held together by tangency and equal
   radius rather than by being drawn in the right place. Twelve point freedoms
   minus seven residuals leaves exactly the five a slot has — centre, angle,
   length and width — so dragging either end keeps it a slot, and the width is
   one radius dimension away from being driven by an equation.
   The centreline is added as construction geometry, which is what a slot length
   dimension attaches to. */
function addSketchSlot(a, b, halfWidth) {
  var dx = b.u - a.u, dy = b.v - a.v, span = Math.hypot(dx, dy);
  var w = Math.abs(halfWidth);
  if (span < 0.5 || w < 0.25) return null;
  var sketch = sketchForView();
  var ux = dx / span, uy = dy / span, nx = -uy, ny = ux;

  var ca = newSketchPoint(sketch, a), cb = newSketchPoint(sketch, b);
  var pa0 = newSketchPoint(sketch, { u: a.u + nx * w, v: a.v + ny * w });
  var pa1 = newSketchPoint(sketch, { u: a.u - nx * w, v: a.v - ny * w });
  var pb0 = newSketchPoint(sketch, { u: b.u + nx * w, v: b.v + ny * w });
  var pb1 = newSketchPoint(sketch, { u: b.u - nx * w, v: b.v - ny * w });

  // The loop runs pa1 → pb1 → (cap at b) → pb0 → pa0 → (cap at a) → pa1. Arcs
  // sweep counter-clockwise from their first rim point, so each cap has to name
  // its rim points in the order that takes the sweep away from the centreline.
  var side1 = { id: uid(), type: "line", name: "Slot side", a: pa1, b: pb1, construction: false };
  var capB = { id: uid(), type: "arc", name: "Slot cap", c: cb, a: pb1, b: pb0, construction: false };
  var side0 = { id: uid(), type: "line", name: "Slot side", a: pb0, b: pa0, construction: false };
  var capA = { id: uid(), type: "arc", name: "Slot cap", c: ca, a: pa0, b: pa1, construction: false };
  var centreline = { id: uid(), type: "line", name: "Slot centreline", a: ca, b: cb, construction: true };

  var made = [side1, capB, side0, capA, centreline];
  sketch.entities.push.apply(sketch.entities, made);
  /* Seven residuals against twelve point freedoms. Both sides are held parallel
     to the centreline and tangent to the near cap; equal radius carries that
     width to the far cap, whose own rim points are already tied to its centre.

     Tangency to all four ends would count the same but is not equivalent: the
     tangent residual is |distance| − radius, which an internal tangent
     satisfies just as well, so a big drag could fold the slot into a bowtie
     and stay "solved". Parallel is a signed residual and cannot flip. */
  sketch.constraints.push({ id: uid(), type: "equal", a: capA.id, b: capB.id });
  [side0, side1].forEach(function (side) {
    sketch.constraints.push({ id: uid(), type: "parallel", a: side.id, b: centreline.id });
    sketch.constraints.push({ id: uid(), type: "tangent", a: side.id, b: capA.id });
  });
  resolveSketch(false);
  return made;
}

/* A regular polygon inscribed in a construction circle: every corner is held on
   the circle and every side is held equal to the next. That leaves centre,
   size and rotation free — four freedoms, which is what a polygon actually has.
   Dimension the construction circle and the whole polygon resizes. */
function addSketchPolygon(centre, rim, sides) {
  var n = Math.max(3, Math.min(24, Math.round(sides) || 6));
  var r = Math.hypot(rim.u - centre.u, rim.v - centre.v);
  if (r < 0.25) return null;
  var sketch = sketchForView();
  var start = Math.atan2(rim.v - centre.v, rim.u - centre.u);
  var circle = {
    id: uid(), type: "circle", name: n + "-gon guide",
    c: newSketchPoint(sketch, centre), r: r, construction: true,
  };
  sketch.entities.push(circle);

  var ids = [];
  for (var i = 0; i < n; i++) {
    var ang = start + (i * Math.PI * 2) / n;
    ids.push(newSketchPoint(sketch, { u: centre.u + Math.cos(ang) * r, v: centre.v + Math.sin(ang) * r }));
  }
  var lines = ids.map(function (id, i) {
    return { id: uid(), type: "line", name: "Polygon side", a: id, b: ids[(i + 1) % n], construction: false };
  });
  sketch.entities.push.apply(sketch.entities, lines);
  ids.forEach(function (id) {
    sketch.constraints.push({ id: uid(), type: "pointOnCircle", point: id, entity: circle.id });
  });
  // n-1 equalities, not n: the last one is implied, and asserting it anyway is
  // exactly the redundancy the solver reports as over-defined
  for (var k = 0; k < n - 1; k++) {
    sketch.constraints.push({ id: uid(), type: "equal", a: lines[k].id, b: lines[k + 1].id });
  }
  resolveSketch(false);
  return lines;
}

function addSketchArc(centre, start, end) {
  var sketch = sketchForView();
  var r = Math.hypot(start.u - centre.u, start.v - centre.v);
  if (r < 0.25) return null;
  // the third click only picks a direction; the radius comes from the first two
  var ang = Math.atan2(end.v - centre.v, end.u - centre.u);
  var arc = {
    id: uid(), type: "arc", name: "Arc",
    c: newSketchPoint(sketch, centre),
    a: newSketchPoint(sketch, start),
    b: newSketchPoint(sketch, { u: centre.u + Math.cos(ang) * r, v: centre.v + Math.sin(ang) * r }),
    construction: false,
  };
  sketch.entities.push(arc);
  resolveSketch(false);
  return arc;
}

/* ---- geometric constraints from the current selection ---- */
var CONSTRAINT_DEFS = [
  { id: "coincident", label: "cCoincident", icon: "ph-dot-outline", need: "2 points" },
  { id: "horizontal", label: "cHorizontal", icon: "ph-arrows-horizontal", need: "line(s) or 2 points" },
  { id: "vertical", label: "cVertical", icon: "ph-arrows-vertical", need: "line(s) or 2 points" },
  { id: "parallel", label: "cParallel", icon: "ph-equals", need: "2 lines" },
  { id: "perpendicular", label: "cPerpendicular", icon: "ph-angle", need: "2 lines" },
  { id: "tangent", label: "cTangent", icon: "ph-circle-half", need: "line+circle or 2 circles" },
  { id: "equal", label: "cEqual", icon: "ph-approximate-equals", need: "2 lines or 2 circles" },
  { id: "concentric", label: "cConcentric", icon: "ph-circles-three", need: "2 circles" },
  { id: "midpoint", label: "cMidpoint", icon: "ph-align-center-horizontal", need: "point + line" },
  { id: "pointOnLine", label: "cPointOnLine", icon: "ph-map-pin-simple", need: "point + entity" },
  { id: "symmetric", label: "cSymmetric", icon: "ph-flip-horizontal", need: "2 points + line" },
  { id: "fixed", label: "cFixed", icon: "ph-lock-simple", need: "point(s)" },
];

// Which constraints the current selection could take — the palette greys out
// the rest instead of letting you click into an error message.
function constraintFits(type) {
  var lines = selLines(), circles = selCircles(), points = selPoints(), ents = selEntities();
  switch (type) {
    case "coincident": return points.length === 2;
    case "horizontal": case "vertical": return lines.length >= 1 || points.length === 2;
    case "parallel": case "perpendicular": return lines.length === 2;
    case "tangent": return (lines.length === 1 && circles.length === 1) || circles.length === 2;
    case "equal": return lines.length === 2 || selConics().length === 2;
    case "concentric": return selConics().length === 2;
    case "midpoint": return points.length === 1 && lines.length === 1;
    case "pointOnLine": return points.length === 1 && ents.length === 1;
    case "symmetric": return points.length === 2 && lines.length === 1;
    case "fixed": return points.length >= 1 || ents.length >= 1;
    default: return false;
  }
}

function applyConstraint(type) {
  if (!constraintFits(type)) { flash(t("needSel")); return; }
  var sketch = ensureSketch(E.def);
  var lines = selLines(), circles = selCircles(), conics = selConics(), points = selPoints(), ents = selEntities();
  var added = [];
  var add = function (c) {
    var pairRule = ["parallel", "perpendicular", "equal", "concentric", "tangent", "coincident"].indexOf(c.type) >= 0;
    var exists = sketch.constraints.some(function (old) {
      if (old.suppressed || old.type !== c.type || old.entity !== c.entity || old.point !== c.point) return false;
      return old.a === c.a && old.b === c.b || pairRule && old.a === c.b && old.b === c.a;
    });
    if (exists) return false;
    c.id = uid(); sketch.constraints.push(c); added.push(c); return true;
  };

  pushUndo(t("opConstraint"));
  switch (type) {
    case "coincident": add({ type: "coincident", a: points[0].id, b: points[1].id }); break;
    case "horizontal": case "vertical":
      if (lines.length) lines.forEach(function (l) { add({ type: type, entity: l.id }); });
      else add({ type: type, a: points[0].id, b: points[1].id });
      break;
    case "parallel": case "perpendicular":
      add({ type: type, a: lines[0].id, b: lines[1].id }); break;
    case "tangent":
      add({ type: "tangent", a: (lines[0] || circles[0]).id, b: (lines.length ? circles[0] : circles[1]).id }); break;
    case "equal":
      add({ type: "equal", a: (lines[0] || conics[0]).id, b: (lines[1] || conics[1]).id }); break;
    case "concentric":
      add({ type: "concentric", a: conics[0].id, b: conics[1].id }); break;
    case "midpoint":
      add({ type: "midpoint", point: points[0].id, entity: lines[0].id }); break;
    case "pointOnLine":
      add({ type: ents[0].type === "line" ? "pointOnLine" : "pointOnCircle", point: points[0].id, entity: ents[0].id }); break;
    case "symmetric":
      add({ type: "symmetric", a: points[0].id, b: points[1].id, entity: lines[0].id }); break;
    case "fixed":
      var fixedPoints = points.slice();
      ents.forEach(function (entity) { entityPoints(sketch, entity).forEach(function (p) { if (fixedPoints.indexOf(p) < 0) fixedPoints.push(p); }); });
      fixedPoints.forEach(function (p) { add({ type: "fixed", point: p.id, x: p.x, y: p.y }); }); break;
    default: break;
  }

  if (!added.length) { H.discard(); flash(t("constraintExists")); return; }

  if (!resolveSketch(true)) {
    var ids = added.map(function (c) { return c.id; });
    sketch.constraints = sketch.constraints.filter(function (c) { return ids.indexOf(c.id) < 0; });
    resolveSketch(false);
    H.discard();
    flash(t("overDefined"));
  }
  refreshAll();
}

/* ---- mirror & pattern: copies that stay tied to what they came from ---- */

/* Run an operation that only ever APPENDS to the sketch, and put the sketch
   back exactly as it was if the result cannot be solved. Restoring the arrays
   to their previous contents (rather than replaying history) keeps every
   surviving object's identity, so the selection and the inspector do not end
   up pointing at geometry that is no longer in the document. */
function appendToSketch(label, run) {
  var sketch = ensureSketch(E.def);
  var before = {
    points: sketch.points.slice(),
    entities: sketch.entities.slice(),
    constraints: sketch.constraints.slice(),
  };
  pushUndo(label);
  var made = run(sketch);
  if (!made) { H.discard(); return null; }
  if (!resolveSketch(true)) {
    sketch.points = before.points;
    sketch.entities = before.entities;
    sketch.constraints = before.constraints;
    resolveSketch(false);
    H.discard();
    flash(t("overDefined"));
    return null;
  }
  return made;
}

// Mirror the selection about the last-selected line, the way every CAD package
// reads a mirror selection: the geometry first, the axis last.
function mirrorSelection() {
  var lines = selLines(), ents = selEntities();
  if (lines.length < 1 || ents.length < 2) { flash(t("mirrorNeed")); return; }
  var axis = lines[lines.length - 1];
  var sources = ents.filter(function (e) { return e !== axis; });
  if (!sources.length) { flash(t("mirrorNeed")); return; }

  var made = appendToSketch(t("sketchMirror"), function (sketch) {
    return mirrorEntities(sketch, sources.map(function (e) { return e.id; }), axis.id);
  });
  if (!made) { refreshAll(); return; }
  E.ssel = made.entities.slice();
  E.sel = E.ssel[E.ssel.length - 1];
  flash(t("mirrorMade"));
  refreshAll();
}

function patternSelection() {
  var ents = selEntities();
  if (!ents.length) { flash(t("selHint")); return; }
  var count = parseInt(prompt(t("patternAsk"), "3"), 10);
  if (!fin(count) || count < 2) return;
  var pitch = parseFloat(prompt(t("patternPitch"), "30"));
  if (!fin(pitch) || !pitch) return;
  var dir = String(prompt(t("patternDir"), "u") || "u").trim().toLowerCase();

  var made = appendToSketch(t("sketchPattern"), function (sketch) {
    return linearPatternEntities(sketch, ents.map(function (e) { return e.id; }),
      { count: count, spacing: pitch, direction: dir === "v" ? "v" : "u" });
  });
  if (!made) { flash(t("patternFail")); refreshAll(); return; }
  E.ssel = [];
  E.sel = null;
  flash(t("patternMade"));
  refreshAll();
}

/* Circular pattern. The centre is picked, not typed: a selected sketch point is
   the axis, and selecting a circle or arc instead uses its centre — which is
   how a bolt circle is actually laid out. */
function circularPatternCentre() {
  var points = selPoints();
  if (points.length) return points[points.length - 1].id;
  var circles = selCircles();
  for (var i = circles.length - 1; i >= 0; i--) {
    var id = circles[i].c != null ? circles[i].c : circles[i].center;
    if (id && sketchPoint(ensureSketch(E.def), id)) return id;
  }
  return null;
}

function patternCircularSelection() {
  var ents = selEntities();
  var centre = circularPatternCentre();
  if (!ents.length || !centre) { flash(t("circPatternNeed")); return; }
  var sources = ents.filter(function (e) {
    // patterning the guide circle around its own centre produces a stack of
    // coincident copies, which is never what the pick meant
    return (e.c != null ? e.c : e.center) !== centre;
  });
  if (!sources.length) { flash(t("circPatternNeed")); return; }

  var count = parseInt(prompt(t("patternAsk"), "6"), 10);
  if (!fin(count) || count < 2) return;
  var answer = String(prompt(t("circPatternAngle"), String(Math.round((3600 / count)) / 10)) || "").trim();
  var angle = parseFloat(answer);

  var made = appendToSketch(t("sketchCircPattern"), function (sketch) {
    return circularPatternEntities(sketch, sources.map(function (e) { return e.id; }),
      { count: count, angle: fin(angle) ? angle : 0, center: centre });
  });
  if (!made) { flash(t("patternFail")); refreshAll(); return; }
  E.ssel = [];
  E.sel = null;
  flash(t("patternMade"));
  refreshAll();
}

/* ---- smart dimension: measure what is selected/picked, then lock it ---- */
function drawingSketch() {
  var visible = sketchesOnPlane(E.view);
  return visible.length ? visible[visible.length - 1] : null;
}

function activateDrawingSketch(sketch) {
  if (!sketch) return false;
  if (E.def.activeSketch !== sketch.id) E.def.activeSketch = sketch.id;
  E.solveInfo = solveSketch(sketch);
  return true;
}

function rulerPointAt(sketch, uv) {
  if (!sketch) return null;
  var tolerance = 9 / E.scl, best = null, distance = tolerance;
  (sketch.points || []).forEach(function (point) {
    var d = Math.hypot(uv.u - point.x, uv.v - point.y);
    if (d < distance) { best = point; distance = d; }
  });
  return best;
}

function placedDimensionAt(sketch, px, py) {
  return sketch ? hitSketchDimension(sketch, px, py, toPx, 10) : null;
}

function placeDimensionAtPointer(sketch, constraint, px, py) {
  var layout = distanceDimensionLayout(sketch, constraint, toPx);
  if (!layout) return false;
  constraint.offset = (px - layout.p1.x) * layout.nx + (py - layout.p1.y) * layout.ny - 20;
  return true;
}

function editPlacedDimension(sketch, constraint, historyAlreadyOpen) {
  if (!sketch || !constraint) return false;
  var before = Number(constraint.value) || 0;
  var answer = prompt(t("dimAsk") + " (cm)", String(Math.round(before * 10) / 10));
  if (answer == null || String(answer).trim() === "") return false;
  var value = parseFloat(answer);
  if (!fin(value) || value <= 0) return false;
  if (!historyAlreadyOpen) pushUndo(t("opDim"));
  constraint.value = value;
  activateDrawingSketch(sketch);
  if (!resolveSketch(true)) {
    constraint.value = before;
    resolveSketch(false);
    if (!historyAlreadyOpen) H.discard();
    flash(t("overDefined"));
    return false;
  }
  refreshAll();
  return true;
}

function beginSmartRulerPoint(sketch, point) {
  if (!sketch || !point) { flash(t("rulerPickPoint")); return false; }
  activateDrawingSketch(sketch);
  if (!E.dimPick.length) {
    E.dimPick = [point];
    E.ssel = [point];
    E.sel = point;
    E.dimSel = null;
    drawSketch();
    syncStatus();
    return true;
  }
  var first = E.dimPick[0];
  if (first === point || first.id === point.id) { flash(t("rulerSamePoint")); return false; }

  var existing = (sketch.constraints || []).find(function (constraint) {
    return constraint.type === "distance" && !constraint.entity
      && (constraint.a === first.id && constraint.b === point.id || constraint.a === point.id && constraint.b === first.id);
  });
  pushUndo(t("opDim"));
  var constraint = existing;
  if (!constraint) {
    var measured = currentMeasure(sketch, { type:"points", a:first.id, b:point.id });
    var id = addSmartDimension(sketch, { type:"points", a:first.id, b:point.id }, measured);
    constraint = (sketch.constraints || []).find(function (candidate) { return candidate.id === id; });
    if (!constraint || !resolveSketch(true)) {
      if (constraint) sketch.constraints = sketch.constraints.filter(function (candidate) { return candidate !== constraint; });
      resolveSketch(false);
      H.discard();
      E.dimPick = [];
      E.ssel = [];
      flash(t("overDefined"));
      refreshAll();
      return false;
    }
  }
  E.dimPick = [];
  E.ssel = [];
  E.sel = null;
  E.dimSel = constraint.id;
  E.drag = { mode:"dimension", sketch:sketch, constraint:constraint, editOnRelease:true, created:!existing, moved:false, px:null, py:null };
  drawSketch();
  return true;
}

function finishDimensionDrag() {
  var drag = E.drag;
  if (!drag || drag.mode !== "dimension") return false;
  E.drag = null;
  if (!drag.editOnRelease && !drag.moved) H.discard();
  if (drag.editOnRelease) {
    var edited = editPlacedDimension(drag.sketch, drag.constraint, true);
    if (!drag.created && !drag.moved && !edited) H.discard();
  }
  refreshAll();
  return true;
}

function smartDimension(target) {
  var sketch = ensureSketch(E.def);
  var measured = currentMeasure(sketch, target);
  var unit = target.type === "angle" ? "°" : "cm";
  var answer = prompt(t("dimAsk") + " (" + unit + ")", String(Math.round(measured * 10) / 10));
  var value = parseFloat(answer);
  if (!fin(value)) return;
  pushUndo(t("opDim"));
  var id = addSmartDimension(sketch, target, value);
  if (!id) { H.discard(); return; }
  if (!resolveSketch(true)) {
    sketch.constraints = sketch.constraints.filter(function (c) { return c.id !== id; });
    resolveSketch(false);
    H.discard();
    flash(t("overDefined"));
  }
  refreshAll();
}

// What the smart-dimension tool measures for a given pick, given what was
// already selected: two picked points measure the gap between them.
function dimensionTarget(hit, uv) {
  if (!hit) return null;
  if (hit.type === "line" || hit.type === "circle" || hit.type === "arc") return { type: hit.type, id: hit.id };
  // An ellipse has two numbers, so the pick decides which one: clicking nearer
  // the flat of the curve dimensions the minor axis, nearer the ends the major.
  if (hit.type === "ellipse") {
    var el = ellipseData(hit, new Map((ensureSketch(E.def).points || []).map(function (p) { return [p.id, p]; })));
    var axis = "major";
    if (el && uv) {
      var du = uv.u - el.center.x, dv = uv.v - el.center.y;
      var along = Math.abs(du * Math.cos(el.rot) + dv * Math.sin(el.rot));
      var across = Math.abs(-du * Math.sin(el.rot) + dv * Math.cos(el.rot));
      if (across * el.rx > along * el.ry) axis = "minor";
    }
    return { type: "ellipse", id: hit.id, axis: axis };
  }
  var pts = selPoints();
  if (pts.length === 1 && pts[0] !== hit) return { type: "points", a: pts[0].id, b: hit.id };
  return null;
}

/* Silhouette of every solid part in this view, dropped into the sketch as
   construction geometry — the sketch equivalent of "convert entities". */
function projectPartEdges() {
  var loops = [],segments=[];
  (E.def.parts || []).forEach(function (p) {
    var f = partUV(p);
    if (f.type === "rect") {
      loops.push([{ u: f.u0, v: f.v0 }, { u: f.u1, v: f.v0 }, { u: f.u1, v: f.v1 }, { u: f.u0, v: f.v1 }]);
    } else if (f.type === "circle") {
      var loop = [];
      for (var k = 0; k < 24; k++) loop.push({ u: f.u + Math.cos((k * Math.PI) / 12) * f.r, v: f.v + Math.sin((k * Math.PI) / 12) * f.r });
      loops.push(loop);
    } else if(f.type==="segments")segments.push.apply(segments,f.segments);
    else if (f.pts && f.pts.length > 2) loops.push(f.pts.map(function (q) { return { u: q.u, v: q.v }; }));
  });
  if (!loops.length && !segments.length) { flash(t("needParts")); return; }
  pushUndo(t("projectEdges"));
  var sketch = sketchForView();
  loops.forEach(function (lp) { projectLoop(sketch, lp, true); });
  segments.forEach(function(segment){projectLoop(sketch,[segment.a,segment.b],true,false);});
  resolveSketch(false);
  flash(t("projected"));
  refreshAll();
}

function setLineConstraint(line, type, value) {
  if (!line || line.type !== "line") return;
  var sketch = ensureSketch(E.def);
  var constraint = sketch.constraints.find(function (c) { return c.entity === line.id && c.type === type; });
  if (!constraint) {
    constraint = { id: uid(), entity: line.id, type: type, value: value };
    sketch.constraints.push(constraint);
  } else constraint.value = value;
  resolveSketch(false);
}

/* Set (or retarget) a driving dimension on any sketch entity. One constraint of
   a given type per entity — typing a new radius edits the radius you already
   have instead of stacking a second one the solver has to fight. */
function setEntityDimension(entity, type, value) {
  if (!entity || !entity.id) return;
  var sketch = ensureSketch(E.def);
  var c = sketch.constraints.find(function (q) { return q.entity === entity.id && q.type === type; });
  if (!c) { c = { id: uid(), entity: entity.id, type: type, value: value }; sketch.constraints.push(c); }
  else c.value = value;
  resolveSketch(false);
}

function makeWallSegment(a, b) {
  // Despite the legacy function name, this creates only parametric sketch
  // geometry. It has no depth, material or BREP body until an explicit feature
  // (Extrude/Revolve/etc.) consumes a closed profile.
  if (!a || !b || Math.hypot(b.u - a.u, b.v - a.v) < 0.5) return null;
  var sketch = sketchForView();
  var aid = newSketchPoint(sketch, a), bid = newSketchPoint(sketch, b);
  var dx = b.u - a.u, dy = b.v - a.v;
  var line = {
    id: uid(), type: "line", name: "Line", a: aid, b: bid,
    construction: false, weight: Math.max(1, E.wallWidth / 5),
  };
  sketch.entities.push(line);
  // Infer the rule the drawing implies, the way a CAD sketcher does — a segment
  // that came out axis-aligned is held that way. Nothing else is added: locking
  // both a length and an angle on every segment fully determines a closed chain
  // at exactly the values it was drawn at, and then no dimension can ever be
  // edited without conflicting with the rest. Sizes come from the dimension
  // tool, when the user asks for them.
  if (Math.abs(dy) < 1e-6 && Math.abs(dx) > 1e-6) sketch.constraints.push({ id: uid(), entity: line.id, type: "horizontal" });
  else if (Math.abs(dx) < 1e-6 && Math.abs(dy) > 1e-6) sketch.constraints.push({ id: uid(), entity: line.id, type: "vertical" });
  resolveSketch(false);
  E.sel = line;
  return line;
}

function finishWallChain(cancel) {
  if (cancel && E.wallPts && E.wallPts.length === 1) E.wallPts = null;
  else E.wallPts = null;
  E.dynInput = null;
  E._osnap = null;
  drawSketch();
  syncHint();
}

/* ================= typed dimension entry while drawing =================
   Every drawing tool with numbers worth typing accepts them: start typing, Tab
   between fields, Enter to place. The rule throughout is that a TYPED value
   becomes a driving dimension and a dragged one does not — typing "40" means
   forty and the sketch should carry that as an editable dimension afterwards,
   while a shape you eyeballed stays free to be dragged. */
var DYN_TOOLS = {
  wall:  [{ k:"length", u:" cm" }, { k:"angle", u:"°", signed:true }],
  srect: [{ k:"width",  u:" cm" }, { k:"height", u:" cm" }],
  scirc: [{ k:"diameter", u:" cm" }],
  sell:  [{ k:"major",  u:" cm" }, { k:"minor", u:" cm" }],
  sslot: [{ k:"length", u:" cm" }, { k:"width", u:" cm" }],
  spoly: [{ k:"diameter", u:" cm" }, { k:"sides", u:"", whole:true }],
};

// A typed number only means something once the tool has an anchor on the sheet.
function dynAnchor() {
  if (E.mode === "drawing") return null;
  if (E.tool === "wall") return E.wallPts && E.wallPts.length ? E.wallPts[E.wallPts.length - 1] : null;
  if (E.tool === "sslot") return E.slotPts && E.slotPts.length ? E.slotPts[0] : null;
  if (E.tool === "sell") return E.ellPts && E.ellPts.length ? E.ellPts[0] : null;
  if (E.tool === "srect" || E.tool === "scirc" || E.tool === "spoly") return E.drag && (E.drag.mode === "srect" || E.drag.mode === "scirc" || E.drag.mode === "spoly") ? { u:E.drag.u, v:E.drag.v } : null;
  return null;
}
function dynFields() { return DYN_TOOLS[E.tool] && dynAnchor() ? DYN_TOOLS[E.tool] : null; }

/* What the pointer is currently saying, per field. The HUD shows these greyed
   where nothing has been typed, and commit falls back to them — so Enter always
   produces the shape on screen, only sharper where a number was given. */
function dynLive() {
  var anchor = dynAnchor(), m = E._mouse;
  if (!anchor) return {};
  var to = m || anchor;
  var du = to.u - anchor.u, dv = to.v - anchor.v, reach = Math.hypot(du, dv);
  if (E.tool === "wall") return { length: reach, angle: (Math.atan2(dv, du) * 180) / Math.PI };
  if (E.tool === "srect") return { width: Math.abs(du), height: Math.abs(dv) };
  if (E.tool === "scirc") return { diameter: reach * 2 };
  if (E.tool === "spoly") return { diameter: reach * 2, sides: E.polySides };
  if (E.tool === "sslot") {
    var end = E.slotPts[1];
    if (!end) return { length: reach, width: 0 };
    return { length: Math.hypot(end.u - anchor.u, end.v - anchor.v), width: pointToLineDistance(to, anchor, end) };
  }
  if (E.tool === "sell") {
    var major = E.ellPts[1];
    if (!major) return { major: reach, minor: 0 };
    return {
      major: Math.hypot(major.u - anchor.u, major.v - anchor.v),
      minor: pointToLineDistance(to, anchor, major),
    };
  }
  return {};
}

function pointToLineDistance(p, a, b) {
  var dx = b.u - a.u, dy = b.v - a.v, len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p.u - a.u, p.v - a.v);
  return Math.abs((p.u - a.u) * dy - (p.v - a.v) * dx) / len;
}

function dynTyped(key) {
  var raw = E.dynInput && E.dynInput.values ? E.dynInput.values[key] : "";
  var value = parseFloat(raw);
  return fin(value) ? value : null;
}
// typed if given, measured otherwise
function dynValue(key, live) { var typed = dynTyped(key); return typed == null ? live[key] : typed; }
function dynHasEntry() {
  return !!(E.dynInput && Object.keys(E.dynInput.values).some(function (k) { return E.dynInput.values[k] !== ""; }));
}

// Keystrokes while a drawing tool is anchored. Returns true when consumed.
function dynKey(e) {
  var fields = dynFields();
  if (!fields) return false;
  var start = function () {
    if (!E.dynInput || E.dynInput.tool !== E.tool) E.dynInput = { tool:E.tool, field:fields[0].k, values:{} };
    fields.forEach(function (f) { if (E.dynInput.values[f.k] == null) E.dynInput.values[f.k] = ""; });
    return E.dynInput;
  };
  var current = function () { return fields.filter(function (f) { return f.k === E.dynInput.field; })[0] || fields[0]; };

  if (/^[0-9.]$/.test(e.key) || (e.key === "-" && E.dynInput && current().signed)) {
    e.preventDefault();
    var input = start(), field = input.field;
    if (e.key === "." && (input.values[field].indexOf(".") >= 0 || current().whole)) return true;
    if (e.key === "-" && input.values[field]) return true;      // sign leads, or not at all
    input.values[field] += e.key;
    drawSketch();
    return true;
  }
  if (e.key === "Tab" && fields.length > 1) {
    e.preventDefault();
    var t2 = start();
    var at = fields.findIndex(function (f) { return f.k === t2.field; });
    t2.field = fields[(at + (e.shiftKey ? fields.length - 1 : 1)) % fields.length].k;
    drawSketch();
    return true;
  }
  if (e.key === "Backspace" && E.dynInput) {
    e.preventDefault();
    E.dynInput.values[E.dynInput.field] = String(E.dynInput.values[E.dynInput.field] || "").slice(0, -1);
    drawSketch();
    return true;
  }
  if (e.key === "Enter" && dynHasEntry()) {
    e.preventDefault();
    dynCommit();
    return true;
  }
  return false;
}

/* Whether a number typed while drawing should also be recorded as a driving
   dimension. Off by default: a typed 40 still lands at exactly 40, but the
   sketch stays under-defined until it is dimensioned deliberately with the
   Smart Dimension tool — the same bargain SolidWorks offers, and the reason
   nothing arrives pre-dimensioned and fighting the next edit. */
function autoDimTyped() { return !!E.autoDimTyped; }

/* Place the shape from the numbers on screen. Each branch ends by handing the
   typed values to the same builders the pointer uses, then attaching driving
   dimensions for whatever was actually typed. */
function dynCommit() {
  var fields = dynFields();
  if (!fields) return false;
  var live = dynLive(), anchor = dynAnchor();
  var typedKeys = fields.map(function (f) { return f.k; }).filter(function (k) { return dynTyped(k) != null; });
  var made = null;

  if (E.tool === "wall") {
    var length = Math.max(0.1, Math.abs(dynValue("length", live) || E.grid));
    var rad = ((dynValue("angle", live) || 0) * Math.PI) / 180;
    var end = { u: anchor.u + Math.cos(rad) * length, v: anchor.v + Math.sin(rad) * length };
    pushUndo(t("opDraw"));
    var line = makeWallSegment(anchor, end);
    if (!line) { H.discard(); return false; }
    // A chain is the one case where dimensioning every typed segment is wrong:
    // lock both ends of every span and no dimension can be edited afterwards
    // without fighting its neighbours. Typed length still lands exactly.
    anchor.pointId = line.a;
    E.wallPts.push({ u:end.u, v:end.v, pointId:line.b });
    E._mouse = { u:end.u, v:end.v };
    E.dynInput = null;
    refreshAll();
    return true;
  }

  pushUndo(t("opSketch"));
  var sketch = null;
  if (E.tool === "srect") {
    var w = Math.abs(dynValue("width", live)), h = Math.abs(dynValue("height", live));
    var m = E._mouse || { u: anchor.u + w, v: anchor.v + h };
    var sx = m.u < anchor.u ? -1 : 1, sy = m.v < anchor.v ? -1 : 1;
    var rect = addSketchRectangle(anchor, { u: anchor.u + sx * w, v: anchor.v + sy * h });
    if (rect) {
      sketch = ensureSketch(E.def);
      if (autoDimTyped() && typedKeys.indexOf("width") >= 0) addSmartDimension(sketch, { type:"line", id:rect[0].id }, w);
      if (autoDimTyped() && typedKeys.indexOf("height") >= 0) addSmartDimension(sketch, { type:"line", id:rect[1].id }, h);
    }
    made = rect;
  } else if (E.tool === "scirc") {
    var r = Math.abs(dynValue("diameter", live)) / 2;
    var circle = addSketchCircle(anchor, { u: anchor.u + r, v: anchor.v });
    if (autoDimTyped() && circle && typedKeys.length) addSmartDimension(ensureSketch(E.def), { type:"circle", id:circle.id }, r);
    made = circle;
  } else if (E.tool === "spoly") {
    var pr = Math.abs(dynValue("diameter", live)) / 2;
    var sides = Math.round(dynValue("sides", live) || E.polySides);
    E.polySides = Math.max(3, Math.min(24, sides));
    var poly = addSketchPolygon(anchor, { u: anchor.u + pr, v: anchor.v }, E.polySides);
    if (poly && dynTyped("diameter") != null) {
      var guide = ensureSketch(E.def).entities.filter(function (x) { return x.construction && x.type === "circle"; }).pop();
      if (autoDimTyped() && guide) addSmartDimension(ensureSketch(E.def), { type:"circle", id:guide.id }, pr);
    }
    made = poly;
  } else if (E.tool === "sslot") {
    var slot = dynSlot(live);
    made = slot;
  } else if (E.tool === "sell") {
    made = dynEllipse(live, typedKeys);
  }

  if (!made) { H.discard(); return false; }
  E.drag = null; E.slotPts = null; E.ellPts = null;
  E.dynInput = null;
  // the builders solve before the typed dimensions are attached, so one more
  // pass here is what makes the DOF count describe the shape that was placed
  resolveSketch(false);
  E.ssel = [].concat(made);
  E.sel = E.ssel[E.ssel.length - 1];
  refreshAll();
  return true;
}

function dynSlot(live) {
  var a = E.slotPts[0];
  var end = E.slotPts[1] || E._mouse || { u: a.u + E.grid, v: a.v };
  var dir = Math.atan2(end.v - a.v, end.u - a.u);
  var length = Math.abs(dynValue("length", live) || E.grid);
  var width = Math.abs(dynValue("width", live)) || E.grid;
  var b = { u: a.u + Math.cos(dir) * length, v: a.v + Math.sin(dir) * length };
  var slot = addSketchSlot(a, b, width / 2);
  if (!slot) return null;
  var sketch = ensureSketch(E.def);
  // the slot's own two numbers: centreline length, and the cap radius that is
  // half its width
  if (autoDimTyped() && dynTyped("length") != null) addSmartDimension(sketch, { type:"line", id:slot[4].id }, length);
  if (autoDimTyped() && dynTyped("width") != null) addSmartDimension(sketch, { type:"arc", id:slot[3].id }, width / 2);
  return slot;
}

function dynEllipse(live, typedKeys) {
  var c = E.ellPts[0];
  var major = E.ellPts[1] || E._mouse || { u: c.u + E.grid, v: c.v };
  var dir = Math.atan2(major.v - c.v, major.u - c.u);
  var rx = Math.abs(dynValue("major", live) || E.grid);
  var ry = Math.abs(dynValue("minor", live)) || rx / 2;
  var ellipse = addSketchEllipse(c, { u: c.u + Math.cos(dir) * rx, v: c.v + Math.sin(dir) * rx }, ry);
  if (!ellipse) return null;
  var sketch = ensureSketch(E.def);
  if (autoDimTyped() && typedKeys.indexOf("major") >= 0) sketch.constraints.push({ id:uid(), type:"radius", entity:ellipse.id, value:rx, driven:false });
  if (autoDimTyped() && typedKeys.indexOf("minor") >= 0) sketch.constraints.push({ id:uid(), type:"radius", entity:ellipse.id, axis:"minor", value:ry, driven:false });
  return ellipse;
}

/* The HUD itself: one boxed field per number, the active one highlighted, typed
   values in white and the measured fallback dimmed. */
function dynDrawHud(c, px, py) {
  var fields = dynFields();
  if (!fields || !E.dynInput || E.dynInput.tool !== E.tool) return;
  var live = dynLive();
  c.save();
  c.font = "600 11px sans-serif";
  var boxes = fields.map(function (f) {
    var typed = E.dynInput.values[f.k];
    var shown = typed !== "" && typed != null ? typed
      : (f.whole ? String(Math.round(live[f.k] || 0)) : String(Math.round((live[f.k] || 0) * 10) / 10));
    var label = t("dyn_" + f.k) + " " + shown + f.u;
    return { on: f.k === E.dynInput.field, typed: typed !== "" && typed != null, text: label, w: c.measureText(label).width + 16 };
  });
  var total = boxes.reduce(function (s, b) { return s + b.w + 4; }, 0);
  var x = Math.min(E.cw - total - 8, px + 14), y = Math.max(8, Math.min(E.ch - 30, py + 14));
  boxes.forEach(function (b) {
    c.fillStyle = b.on ? "#2684c7" : "rgba(15,23,42,.92)";
    c.fillRect(x, y, b.w, 22);
    c.fillStyle = b.typed || b.on ? "#fff" : "rgba(255,255,255,.62)";
    c.fillText(b.text, x + 8, y + 15);
    x += b.w + 4;
  });
  c.restore();
}

function constrainWallPoint(point, origin, hardOrtho) {
  if (!origin || !hardOrtho) return point;
  var du = point.u - origin.u, dv = point.v - origin.v;
  var length = Math.hypot(du, dv);
  if (length < 0.001) return point;
  var angle = Math.atan2(dv, du), step = Math.PI / 2;
  var snapped = Math.round(angle / step) * step;
  return { u: origin.u + Math.cos(snapped) * length, v: origin.v + Math.sin(snapped) * length };
}

function wireSketch() {
  var cv = E.cv;
  cv.addEventListener("pointerdown", function (e) {
    cv.setPointerCapture(e.pointerId);
    var r = cv.getBoundingClientRect(), uv = toUV(e.clientX - r.left, e.clientY - r.top);
    /* Sketching on the model: middle-drag, right-drag or Alt-drag orbits the
       camera without leaving the tool. Being able to look around a solid while
       drawing on one of its faces is the point of sketching in 3D — the sheet
       is projected through the camera, so the profile stays welded to the face
       while the model turns underneath it. */
    if (sketchProjection() && (e.button === 1 || e.button === 2 || e.altKey)) {
      e.preventDefault();
      E.drag = { mode: "orbit", px: e.clientX, py: e.clientY };
      return;
    }
    if (E.mode === "drawing") {
      if (E.tool === "dim") {
        var sheetSketch = drawingSketch();
        var localX = e.clientX - r.left, localY = e.clientY - r.top;
        var placed = placedDimensionAt(sheetSketch, localX, localY);
        if (placed) {
          activateDrawingSketch(sheetSketch);
          pushUndo(t("opMoveDim"));
          E.dimPick = [];
          E.ssel = [];
          E.sel = null;
          E.dimSel = placed.id;
          E.drag = { mode:"dimension", sketch:sheetSketch, constraint:placed, editOnRelease:false, moved:false, px:e.clientX, py:e.clientY };
          drawSketch();
          return;
        }
        beginSmartRulerPoint(sheetSketch, rulerPointAt(sheetSketch, uv));
        return;
      }
      E.drag = { mode: "pan", px: e.clientX, py: e.clientY, ox: E.ox, oy: E.oy };
      return;
    }
    if (e.button === 1 || e.button === 2 || e.shiftKey && E.tool === "select" && !hitPart(uv)) {
      E.drag = { mode: "pan", px: e.clientX, py: e.clientY, ox: E.ox, oy: E.oy };
      return;
    }
    var sp = snapPt(uv), su = sp.u, sv = sp.v;
    if (E.tool === "wall") {
      if (!E.wallPts || !E.wallPts.length) {
        E.wallPts = [{ u: su, v: sv }];
        E.dynInput = null;
        E._mouse = { u: su, v: sv };
      } else {
        var last = E.wallPts[E.wallPts.length - 1];
        var cp = E._osnap ? { u: su, v: sv, pointId: sp.pointId || null } : constrainWallPoint({ u: su, v: sv }, last, e.shiftKey);
        if (Math.hypot(cp.u - last.u, cp.v - last.v) >= 0.5) {
          pushUndo(t("opDraw"));
          var madeLine = makeWallSegment(last, cp);
          if (madeLine) {
            last.pointId = madeLine.a;
            E.wallPts.push({ u: cp.u, v: cp.v, pointId: madeLine.b });
          }
          E._mouse = { u: cp.u, v: cp.v };
          refreshAll();
        }
      }
      drawSketch();
      return;
    }
    if (E.tool === "poly" || E.tool === "cut" || E.tool === "rev") {
      if (!E.poly) E.poly = [];
      // ortho lock against previous point (object snap wins when one is hit)
      if (e.shiftKey && E.poly.length && !E._osnap) {
        var pr = E.poly[E.poly.length - 1];
        if (Math.abs(su - pr.u) > Math.abs(sv - pr.v)) sv = pr.v; else su = pr.u;
      }
      E.poly.push({ u: su, v: sv });
      drawSketch();
      return;
    }
    if (E.tool === "rect" || E.tool === "circle" || E.tool === "sph" || E.tool === "cutc") {
      E.drag = { mode: "draw", u: su, v: sv };
      return;
    }
    /* Rectangle, circle and polygon all take two points. A press-drag-release
       places one, and so does click-move-click: releasing without having moved
       leaves the tool armed (`sticky`) so the next click finishes it. Without
       that, typing a size was impossible — Enter needs a hand on the keyboard,
       not on a held mouse button — and click-click is how CAD tools behave. */
    if (E.tool === "srect" || E.tool === "scirc" || E.tool === "spoly") {
      var mode = E.tool;
      if (E.drag && E.drag.mode === mode && E.drag.sticky) { finishTwoPointTool({ u: su, v: sv }); return; }
      E.drag = { mode: mode, u: su, v: sv, px: e.clientX, py: e.clientY };
      E._mouse = { u: su, v: sv };
      drawSketch();
      return;
    }
    if (E.tool === "sslot") {           // slot: centreline start, end, then width
      if (!E.slotPts) E.slotPts = [];
      E.slotPts.push({ u: su, v: sv });
      E._mouse = { u: su, v: sv };
      if (E.slotPts.length === 3) {
        var slotWidth = pointToLineDistance(E.slotPts[2], E.slotPts[0], E.slotPts[1]);
        pushUndo(t("opSketch"));
        var slot = addSketchSlot(E.slotPts[0], E.slotPts[1], slotWidth);
        E.slotPts = null; E.dynInput = null;
        if (slot) { E.ssel = slot.slice(); E.sel = slot[0]; } else H.discard();
        refreshAll();
      }
      drawSketch();
      return;
    }
    if (E.tool === "sell") {            // ellipse: centre, major axis end, minor
      if (!E.ellPts) E.ellPts = [];
      E.ellPts.push({ u: su, v: sv });
      E._mouse = { u: su, v: sv };
      if (E.ellPts.length === 3) {
        var minor = pointToLineDistance(E.ellPts[2], E.ellPts[0], E.ellPts[1]);
        pushUndo(t("opSketch"));
        var ell = addSketchEllipse(E.ellPts[0], E.ellPts[1], minor);
        E.ellPts = null; E.dynInput = null;
        if (ell) selectSketch(ell, false); else H.discard();
        refreshAll();
      }
      drawSketch();
      return;
    }
    if (E.tool === "sarc") {            // sketch arc: centre, start, end
      if (!E.arcPts) E.arcPts = [];
      E.arcPts.push({ u: su, v: sv });
      if (E.arcPts.length === 3) {
        pushUndo(t("opSketch"));
        var arc = addSketchArc(E.arcPts[0], E.arcPts[1], E.arcPts[2]);
        E.arcPts = null;
        if (arc) selectSketch(arc, false); else H.discard();
        refreshAll();
      }
      drawSketch();
      return;
    }
    if (E.tool === "trim" || E.tool === "extend" || E.tool === "offset" || E.tool === "constr") {
      var target = hitSketch(uv);
      if (!target || !target.type) { drawSketch(); return; }
      var sketch = ensureSketch(E.def), ok = false;
      if (E.tool === "trim") { pushUndo(t("opTrim")); ok = trimEntity(sketch, target.id, { x: uv.u, y: uv.v }); }
      else if (E.tool === "extend") { pushUndo(t("tool_extend")); ok = extendEntity(sketch, target.id, { x: uv.u, y: uv.v }); }
      else if (E.tool === "constr") { pushUndo(t("tool_constr")); ok = toggleConstruction(sketch, target.id); }
      else {
        var dist = parseFloat(prompt(t("offsetAsk"), "5"));
        if (!fin(dist) || !dist) return;
        pushUndo(t("tool_offset"));
        ok = !!offsetEntity(sketch, target.id, dist);
      }
      if (!ok) H.discard(); else { E.ssel = []; E.sel = null; resolveSketch(false); }
      refreshAll();
      return;
    }
    if (E.tool === "dim") {
      var dhit = hitSketch(uv);
      var dtarget = dimensionTarget(dhit, uv);
      if (!dtarget) { selectSketch(dhit, false); refreshAll(); return; }
      smartDimension(dtarget);
      E.ssel = []; E.sel = null;
      refreshAll();
      return;
    }
    // select tool
    var p = hitPart(uv);
    // sketch geometry: Ctrl/Cmd extends the selection, points drag and re-solve
    if (isSketchObject(p)) {
      selectSketch(p, e.ctrlKey || e.metaKey);
      if (!p.type && !(e.ctrlKey || e.metaKey)) {
        pushUndo(t("opDragPt"));
        // The point under the cursor is authoritative while you hold it: pin it
        // so the solver moves everything else to suit, instead of being free to
        // slide it back and undo the drag.
        E.drag = { mode: "spoint", pt: p, moved: false, wasFixed: !!p.fixed };
        p.fixed = true;
      }
      refreshAll();
      return;
    }
    // In canonical sketch mode solids are context geometry only. Their design
    // parameters are edited through history, never by dragging the projection.
    if (isCanonicalAuthoring() && E.authoring && E.authoring.phase === "sketch") {
      E.ssel = [];
      E.sel = null;
      refreshAll();
      return;
    }
    E.ssel = [];
    // polygon vertex grab?
    if (E.sel && !E.sel.sketch && partEditableInSketch(E.sel)) {
      for (var i = 0; i < E.sel.pts.length; i++) {
        var s = toPx(E.sel.pts[i].u, E.sel.pts[i].v);
        if (Math.hypot(s.x - (e.clientX - r.left), s.y - (e.clientY - r.top)) < 7) {
          pushUndo(t("opVertex"));
          E.drag = { mode: "vertex", idx: i };
          return;
        }
      }
    }
    E.sel = p;
    if (p) { pushUndo(t("opMove")); E.drag = { mode: "move", u: uv.u, v: uv.v }; }
    refreshAll();
  });
  cv.addEventListener("pointermove", function (e) {
    var r = cv.getBoundingClientRect(), uv = toUV(e.clientX - r.left, e.clientY - r.top);
    E._mouse = uv;
    syncStatus();
    if (E.drag) {
      if (E.drag.mode === "orbit") {
        if (E.pv) {
          E.pv.az += (e.clientX - E.drag.px) * 0.009;
          E.pv.el = clamp(E.pv.el + (e.clientY - E.drag.py) * 0.006, 0.05, 1.5);
          if (E.pv.clearFixedFrame) E.pv.clearFixedFrame(false);
          E.pv.render();
        }
        E.drag.px = e.clientX; E.drag.py = e.clientY;
        drawSketch();   // the sheet is the camera's projection, so it moves too
        return;
      }
      if (E.drag.mode === "pan") {
        E.ox = E.drag.ox + (e.clientX - E.drag.px);
        E.oy = E.drag.oy + (e.clientY - E.drag.py);
      } else if (E.drag.mode === "dimension") {
        var dimensionRect = cv.getBoundingClientRect();
        if (placeDimensionAtPointer(E.drag.sketch, E.drag.constraint, e.clientX - dimensionRect.left, e.clientY - dimensionRect.top)) {
          if (E.drag.px == null || Math.hypot(e.clientX - E.drag.px, e.clientY - E.drag.py) > 2) E.drag.moved = true;
        }
      } else if (E.drag.mode === "move" && E.sel) {
        var du = snapV(uv.u - E.drag.u), dv = snapV(uv.v - E.drag.v);
        if (e.shiftKey) { if (Math.abs(du) > Math.abs(dv)) dv = 0; else du = 0; } // ortho move
        if (du || dv) {
          moveInView(E.sel, du, dv);
          E.drag.u += du; E.drag.v += dv;
          updatePreview(); fillInspector();
        }
      } else if (E.drag.mode === "spoint") {
        // dragging a sketch point solves the whole sketch every frame, so the
        // rest of the geometry follows its constraints live
        var pp = snapPt(uv);
        E.drag.pt.x = pp.u; E.drag.pt.y = pp.v;
        E.drag.moved = true;
        resolveSketch(false, true);   // geometry now, DOF count on release
        fillInspector();
      } else if (E.drag.mode === "scirc" || E.drag.mode === "srect" || E.drag.mode === "spoly") {
        E._mouse = snapPt(uv);
      } else if (E.drag.mode === "vertex" && E.sel) {
        var vp = snapPt(uv, E.sel); // snap dragged vertex to other parts' geometry
        E.sel.pts[E.drag.idx].u = vp.u;
        E.sel.pts[E.drag.idx].v = vp.v;
        updatePreview();
      }
      drawSketch();
      return;
    }
    // live snap feedback while sketching: cursor magnetizes to the target
    if (E.mode === "drawing" && E.tool === "dim") {
      var rulerPoint = rulerPointAt(drawingSketch(), uv);
      if (rulerPoint) E._mouse = { u:rulerPoint.x, v:rulerPoint.y };
      drawSketch();
    } else if (E.wallPts && E.wallPts.length) {
      var wp = snapPt(uv);
      var wl = E.wallPts[E.wallPts.length - 1];
      E._mouse = E._osnap ? wp : constrainWallPoint(wp, wl, e.shiftKey);
      drawSketch();
    } else if (E.poly || (E.tool !== "select" && !E.drag)) {
      var mp = snapPt(uv);
      if (E._osnap) E._mouse = mp;
      drawSketch();
    }
  });
  cv.addEventListener("pointerup", function (e) {
    if (E.drag && E.drag.mode === "dimension") {
      finishDimensionDrag();
      return;
    }
    if (E.drag && (E.drag.mode === "srect" || E.drag.mode === "scirc" || E.drag.mode === "spoly")) {
      var travelled = Math.hypot(e.clientX - E.drag.px, e.clientY - E.drag.py) > 4;
      // a click that did not drag arms the tool instead of drawing a zero-sized
      // shape, so the second point can be clicked — or typed
      if (!travelled && !E.drag.sticky) { E.drag.sticky = true; drawSketch(); syncHint(); return; }
      var sr = cv.getBoundingClientRect();
      finishTwoPointTool(snapPt(toUV(e.clientX - sr.left, e.clientY - sr.top)));
      return;
    }
    if (E.drag && E.drag.mode === "spoint") {
      E.drag.pt.fixed = E.drag.wasFixed;   // the pin lasts only for the drag
      if (!E.drag.moved) H.discard();
      E.drag = null;
      resolveSketch(false);
      refreshAll();
      return;
    }
    if (E.drag && E.drag.mode === "draw") {
      var r = cv.getBoundingClientRect(), uv = toUV(e.clientX - r.left, e.clientY - r.top);
      var sp = snapPt(uv), u1 = sp.u, v1 = sp.v, u0 = E.drag.u, v0 = E.drag.v;
      if (Math.abs(u1 - u0) > 1 || Math.abs(v1 - v0) > 1) {
        pushUndo(t("opDraw"));
        if (E.tool === "cutc") {
          // circular bore: punch a 24-gon hole centered at the drag start
          var cr = Math.hypot(u1 - u0, v1 - v0), loop = [];
          for (var k = 0; k < 24; k++) loop.push({ u: u0 + Math.cos((k * Math.PI) / 12) * cr, v: v0 + Math.sin((k * Math.PI) / 12) * cr });
          flash(applyCut(loop) ? t("cutDone") : t("cutNone"));
        } else {
          var part = makeDrawnPart(u0, v0, u1, v1);
          if (part) { addPart(part); E.sel = part; }
        }
        refreshAll();
      }
    }
    E.drag = null;
    drawSketch();
  });
  cv.addEventListener("dblclick", function (e) {
    if (E.mode === "drawing") {
      if (E.tool === "dim") {
        var drawingRect = cv.getBoundingClientRect(), sketch = drawingSketch();
        var dimension = placedDimensionAt(sketch, e.clientX - drawingRect.left, e.clientY - drawingRect.top);
        if (dimension) {
          E.dimSel = dimension.id;
          editPlacedDimension(sketch, dimension, false);
        }
      }
      return;
    }
    if (E.tool === "wall" && E.wallPts) { finishWallChain(false); return; }
    if (E.tool === "poly" || E.tool === "cut" || E.tool === "rev") { finishPoly(); return; }
    if (E.sel && !E.sel.sketch && partEditableInSketch(E.sel)) {
      var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      var pts = E.sel.pts;
      // fillet: dbl-click a corner (checked before edges — corners win)
      for (var vi = 0; vi < pts.length; vi++) {
        var vs = toPx(pts[vi].u, pts[vi].v);
        if (Math.hypot(vs.x - mx, vs.y - my) < 7) {
          var ans = String(prompt(t("fillet"), 5) || "").trim();
          var isCh = /^c/i.test(ans);
          var fr = parseFloat(isCh ? ans.slice(1) : ans);
          if (fin(fr) && fr > 0) {
            pushUndo(t("opFillet"));
            var ok = isCh ? chamferVertex(pts, vi, fr) : filletVertex(pts, vi, fr);
            if (!ok) H.discard();
            refreshAll();
          }
          return;
        }
      }
      // dimension constraint: set edge length of selected polygon
      for (var i = 0; i < pts.length; i++) {
        var a = toPx(pts[i].u, pts[i].v), b = toPx(pts[(i + 1) % pts.length].u, pts[(i + 1) % pts.length].v);
        var L2 = Math.hypot(b.x - a.x, b.y - a.y);
        if (!L2) continue;
        var tt = clamp(((mx - a.x) * (b.x - a.x) + (my - a.y) * (b.y - a.y)) / (L2 * L2), 0, 1);
        if (Math.hypot(a.x + (b.x - a.x) * tt - mx, a.y + (b.y - a.y) * tt - my) < 6) {
          var q0 = pts[i], q1 = pts[(i + 1) % pts.length];
          var cur = Math.hypot(q1.u - q0.u, q1.v - q0.v);
          var val = parseFloat(prompt(t("segLen"), Math.round(cur)));
          if (fin(val) && val > 0 && cur > 0) {
            pushUndo(t("opSegLen"));
            var k = val / cur;
            q1.u = q0.u + (q1.u - q0.u) * k;
            q1.v = q0.v + (q1.v - q0.v) * k;
            refreshAll();
          }
          return;
        }
      }
    }
  });
  cv.addEventListener("wheel", function (e) {
    e.preventDefault();
    // over the model the wheel dollies the camera; there is no separate sheet
    // zoom to change
    if (sketchProjection() && E.pv) {
      E.pv.zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12);
      drawSketch();
      syncStatus();
      return;
    }
    var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    var k = e.deltaY < 0 ? 1.12 : 1 / 1.12, ns = clamp(E.scl * k, 0.3, 20);
    E.ox = mx - ((mx - E.ox) / E.scl) * ns;
    E.oy = my - ((my - E.oy) / E.scl) * ns;
    E.scl = ns;
    drawSketch();
    syncStatus();
  }, { passive: false });
  cv.addEventListener("pointerleave", function () { E._mouse = null; syncStatus(); });
  cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  /* Edge auto-pan for long sketches. This is the same interaction contract as
     the plan wall tool: entering a 44px edge band eases the canvas underneath
     the stationary pointer, then recalculates the live snapped endpoint in the
     newly exposed model space. */
  var AP_BAND = 44, AP_MAX = 11, AP_RAMP = 550;
  var apRAF = 0, apPtr = null, apT0 = 0, apLast = 0;
  function apAxis(v, size) {
    var d = 0;
    if (v < AP_BAND) d = (v - AP_BAND) / AP_BAND;
    else if (v > size - AP_BAND) d = (v - (size - AP_BAND)) / AP_BAND;
    d = clamp(d, -1, 1);
    return Math.sign(d) * d * d * AP_MAX;
  }
  function apActive() {
    return E.docType === "part" && !E.drag && ((E.wallPts && E.wallPts.length) || (E.poly && E.poly.length));
  }
  function apStep(now) {
    apRAF = 0;
    if (!apPtr || !apActive() || !(E.cw > 0 && E.ch > 0)) return;
    var dx = apAxis(apPtr.x, E.cw), dy = apAxis(apPtr.y, E.ch);
    if (!dx && !dy) return;
    var ramp = 0.25 + 0.75 * clamp((now - apT0) / AP_RAMP, 0, 1);
    var dt = clamp((now - apLast) / 16.7, 0.5, 2);
    apLast = now;
    E.ox -= dx * ramp * dt;
    E.oy -= dy * ramp * dt;
    var uv = toUV(apPtr.x, apPtr.y), sp = snapPt(uv);
    if (E.wallPts && E.wallPts.length) {
      var origin = E.wallPts[E.wallPts.length - 1];
      E._mouse = E._osnap ? sp : constrainWallPoint(sp, origin, apPtr.shiftKey);
    } else {
      E._mouse = E._osnap ? sp : uv;
    }
    drawSketch();
    syncStatus();
    apRAF = requestAnimationFrame(apStep);
  }
  function autoPanFrom(e) {
    var rect = cv.getBoundingClientRect();
    apPtr = { x: e.clientX - rect.left, y: e.clientY - rect.top, shiftKey: e.shiftKey };
    if (!apRAF && apActive() && (apAxis(apPtr.x, E.cw) || apAxis(apPtr.y, E.ch))) {
      apT0 = apLast = performance.now();
      apRAF = requestAnimationFrame(apStep);
    }
  }
  function stopAutoPan() {
    if (apRAF) cancelAnimationFrame(apRAF);
    apRAF = 0;
    apPtr = null;
  }
  cv.addEventListener("pointermove", autoPanFrom);
  cv.addEventListener("pointerleave", stopAutoPan);
  window.addEventListener("blur", stopAutoPan);
}

/* Place a rectangle, circle or polygon from its two defining points, whether
   they arrived by drag or by two clicks. */
function finishTwoPointTool(to) {
  var drag = E.drag;
  if (!drag) return;
  var from = { u: drag.u, v: drag.v };
  // a side count typed mid-drag is a setting, not a dimension: honour it even
  // when the shape itself is finished with the mouse
  var typedSides = dynTyped("sides");
  if (typedSides != null) E.polySides = Math.max(3, Math.min(24, Math.round(typedSides)));
  E.drag = null;
  E.dynInput = null;
  pushUndo(t("opSketch"));
  var made = drag.mode === "srect" ? addSketchRectangle(from, to)
    : drag.mode === "scirc" ? addSketchCircle(from, to)
    : addSketchPolygon(from, to, E.polySides);
  if (!made) { H.discard(); refreshAll(); return; }
  E.ssel = [].concat(made);
  E.sel = E.ssel[E.ssel.length - 1];
  refreshAll();
}

function makeDrawnPart(u0, v0, u1, v1) {
  var lo = E.baseOff, hi = E.baseOff + E.depth;
  var mat = { color: "#c9bfae", metal: 0.08, rough: 0.7 };
  var uu0 = Math.min(u0, u1), uu1 = Math.max(u0, u1), vv0 = Math.min(v0, v1), vv1 = Math.max(v0, v1);
  var frame=activeSketchFrame();
  if (E.tool === "rect") {
    if (frame) return Object.assign({id:uid(),kind:"ext",axis:"frame",frame:cloneData(frame),name:"box",pts:[{u:uu0,v:vv0},{u:uu1,v:vv0},{u:uu1,v:vv1},{u:uu0,v:vv1}],from:lo,to:hi,holes:[]},mat);
    if (E.view === "top") return Object.assign({ id: uid(), kind: "box", name: "box", x0: uu0, x1: uu1, z0: vv0, z1: vv1, y0: lo, y1: hi }, mat);
    if (E.view === "front") return Object.assign({ id: uid(), kind: "box", name: "box", x0: uu0, x1: uu1, y0: vv0, y1: vv1, z0: lo, z1: hi }, mat);
    return Object.assign({ id: uid(), kind: "box", name: "box", z0: uu0, z1: uu1, y0: vv0, y1: vv1, x0: lo, x1: hi }, mat);
  }
  var r = snapV(Math.hypot(u1 - u0, v1 - v0)) || E.grid;
  if (E.tool === "sph") {
    if (frame) {
      var center=framePoint(frame,u0,v0,lo+r);
      return Object.assign({id:uid(),kind:"sph",name:"sphere",x:center.x,y:center.y,z:center.z,r:r},mat);
    }
    if (E.view === "top") return Object.assign({ id: uid(), kind: "sph", name: "sphere", x: u0, z: v0, y: E.baseOff + r, r: r }, mat);
    if (E.view === "front") return Object.assign({ id: uid(), kind: "sph", name: "sphere", x: u0, y: v0, z: 0, r: r }, mat);
    return Object.assign({ id: uid(), kind: "sph", name: "sphere", z: u0, y: v0, x: 0, r: r }, mat);
  }
  // circle -> vertical cylinder (base at baseOff, height=depth); in front/side views centers on the other axis
  if (frame) {
    var pts=[];
    for (var i=0;i<48;i++) pts.push({u:u0+Math.cos(i*Math.PI/24)*r,v:v0+Math.sin(i*Math.PI/24)*r});
    return Object.assign({id:uid(),kind:"ext",axis:"frame",frame:cloneData(frame),name:"cylinder",pts:pts,from:lo,to:hi,holes:[]},mat);
  }
  if (E.view === "top") return Object.assign({ id: uid(), kind: "cyl", name: "cylinder", x: u0, z: v0, y: lo, r: r, h: E.depth }, mat);
  if (E.view === "front") return Object.assign({ id: uid(), kind: "cyl", name: "cylinder", x: u0, z: 0, y: v0, r: r, h: E.depth }, mat);
  return Object.assign({ id: uid(), kind: "cyl", name: "cylinder", z: u0, x: 0, y: v0, r: r, h: E.depth }, mat);
}

// letter keys pick a tool, the way every CAD app does; kept off the panel so
// the icons can stay unlabelled and still be learnable (see the settings pane)
var KEY_TOOL = {
  v: "select", b: "rect", c: "circle", s: "sph", l: "wall", p: "poly", r: "rev", x: "cut", o: "cutc",
  q: "srect", g: "scirc", a: "sarc", d: "dim", t: "trim", e: "extend",
  j: "sslot", n: "spoly", y: "sell",
};
var KEY_VIEW = { 4: "top", 5: "front", 6: "side" };

function onKey(e) {
  if (!E.open) return;
  if (E.mode === "drawing" && (e.ctrlKey || e.metaKey)) {
    var drawingKey = e.key.toLowerCase();
    if (drawingKey === "z") { e.preventDefault(); doUndo(); return; }
    if (drawingKey === "y") { e.preventDefault(); doRedo(); return; }
    if (drawingKey === "s") { e.preventDefault(); saveCurrentDocument(); return; }
  }
  var commandSearch = root && root.querySelector("#mdCommandSearch");
  if (commandSearch && !commandSearch.hidden) {
    if (e.key === "Escape") { e.preventDefault(); closeCommandSearch(); return; }
    if (e.key === "Enter") {
      var first = root.querySelector("#mdCommandResults .md-command-result.selected:not(:disabled)") || root.querySelector("#mdCommandResults .md-command-result:not(:disabled)");
      if (first) { e.preventDefault(); first.click(); }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      var rows = [].slice.call(root.querySelectorAll("#mdCommandResults .md-command-result:not(:disabled)"));
      if (!rows.length) return;
      var at = rows.findIndex(function (r) { return r.classList.contains("selected"); });
      rows.forEach(function (r) { r.classList.remove("selected"); });
      at = e.key === "ArrowDown" ? (at + 1) % rows.length : (at - 1 + rows.length) % rows.length;
      rows[at].classList.add("selected"); rows[at].scrollIntoView({block:"nearest"});
      return;
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openCommandSearch(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); regenerateExactModel(); return; }
  var focusedField = document.activeElement;
  var editingField = focusedField && (focusedField.tagName === "INPUT" || focusedField.tagName === "TEXTAREA" || focusedField.isContentEditable);
  /* A drawing tool waiting on numbers owns the number keys. This has to come
     before the mode and view shortcuts below, or typing a 40 cm side length
     jumps the editor into 2D and drops the digit. */
  if (!editingField && !e.ctrlKey && !e.metaKey && !e.altKey && dynKey(e)) return;
  if (!editingField && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === "2") { setMode("2d"); return; }
    if (e.key === "3") { setMode("3d"); return; }
    if (e.key === "7") { setMode("drawing"); return; }
    if (E.mode === "drawing" && KEY_VIEW[e.key]) { setView(KEY_VIEW[e.key]); return; }
    if (E.mode === "drawing" && e.key.toLowerCase() === "f") { fitSketch(); return; }
    if (E.mode === "drawing" && e.key.toLowerCase() === "d") { setTool("dim"); return; }
    if (E.mode === "drawing" && e.key.toLowerCase() === "v") { setTool("select"); return; }
  }
  if (E.mode === "drawing" && e.key !== "Escape") return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && !editingField) {
    e.preventDefault();
    if (E.docType === "assembly") {
      E.componentSel = (E.assembly && E.assembly.components || []).slice();
      E.sel = E.componentSel[E.componentSel.length - 1] || null;
    } else {
      E.ssel = ensureSketch(E.def).entities.slice();
      E.sel = E.ssel[E.ssel.length - 1] || null;
    }
    refreshAll();
    return;
  }
  if (e.key === "Escape") {
    if (reportOpen()) { e.preventDefault(); closeReport(); return; }
    if (E.tour.active) { e.preventDefault(); closeTour(); return; }
    if (dynHasEntry()) { E.dynInput = null; drawSketch(); return; }
    if (E.wallPts) { finishWallChain(true); return; }
    if (E.poly) { E.poly = null; drawSketch(); return; }
    if (E.arcPts) { E.arcPts = null; drawSketch(); return; }
    if (E.slotPts) { E.slotPts = null; drawSketch(); syncContextActions(); return; }
    if (E.ellPts) { E.ellPts = null; drawSketch(); syncContextActions(); return; }
    if (E.drag && E.drag.sticky) { E.drag = null; drawSketch(); syncContextActions(); return; }
    if (E.mode === "drawing" && (E.dimPick.length || E.dimSel)) {
      E.dimPick = []; E.dimSel = null; E.ssel = []; E.sel = null; drawSketch(); syncStatus(); return;
    }
    if (E.mode === "3d" && E.modelPlaneActive) { finishModelPlane(); return; }
    if (E.docType === "assembly" && E.componentSel.length) { E.componentSel = []; E.sel = null; refreshAll(); return; }
    if (E.sel) { E.sel = null; refreshAll(); return; }
    closeModeler(); return;
  }
  if (e.key === "Enter" && E.wallPts) { finishWallChain(false); return; }
  if (e.key === "Enter" && E.poly) { finishPoly(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); doUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); doRedo(); return; }
  // everything below is a bare key, so it must not fire while a field has focus
  var ae = document.activeElement;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
  if (e.key === "/") { e.preventDefault(); openCommandSearch(); return; }
  if (E.docType === "assembly") {
    if ((e.key === "Delete" || e.key === "Backspace") && E.componentSel.length) {
      e.preventDefault();
      var removed = E.componentSel.map(function (c) { return c.id; });
      E.assembly.components = E.assembly.components.filter(function (c) { return removed.indexOf(c.id) === -1; });
      E.assembly.mates = E.assembly.mates.filter(function (m) { return removed.indexOf(m.a) === -1 && removed.indexOf(m.b) === -1; });
      E.componentSel = []; E.sel = null; refreshAll();
    }
    return;
  }
  var k = e.key.toLowerCase();
  if (e.key === "2") setMode("2d");
  else if (e.key === "3") setMode("3d");
  else if (e.key === "7") setMode("drawing");
  else if (KEY_VIEW[e.key]) setView(KEY_VIEW[e.key]);
  else if (KEY_TOOL[k]) setTool(KEY_TOOL[k]);
  else if (k === "f") E.mode === "3d" && !E.modelPlaneActive ? fitPreview() : fitSketch();
  // Normal To, on request only — SolidWorks' Ctrl+8, same job
  else if (e.key === "8" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); orientModelToView(true); drawSketch(); }
  else if ((e.key === "Delete" || e.key === "Backspace") && E.sel) {
    e.preventDefault();
    pushUndo(t("del"));
    if (isSketchObject(E.sel)) {
      var sketch = ensureSketch(E.def);
      selEntities().forEach(function (q) { removeSketchEntity(sketch, q.id); });
      // deleting a lone point only removes the rules that referenced it —
      // the point itself belongs to whichever entity still draws it
      selPoints().forEach(function (q) {
        sketch.constraints = sketch.constraints.filter(function (c) {
          return c.point !== q.id && c.a !== q.id && c.b !== q.id;
        });
      });
      E.ssel = [];
      resolveSketch(false);
    } else E.def.parts.splice(E.def.parts.indexOf(E.sel), 1);
    E.sel = null;
    refreshAll();
  }
}

/* ================= parts list + inspector ================= */
var KIND_ICON = {
  box: "ph-cube", cyl: "ph-cylinder", sph: "ph-sphere",
  ext: "ph-polygon", rev: "ph-spiral", loft: "ph-triangle",
};
function emptyState(host, icon, title, note) {
  host.appendChild(el("div", "md-empty",
    '<i class="ph ' + icon + '"></i><b>' + title + "</b>" + (note ? "<span>" + note + "</span>" : "")));
}

/* The FeatureManager stays useful on real parts by filtering in place instead
   of rebuilding the model or losing the current selection. */
function addFeatureFilter(host) {
  var wrap = el("label", "md-feature-filter");
  wrap.appendChild(el("i", "ph ph-funnel-simple"));
  var input = el("input");
  input.type = "search";
  input.placeholder = t("featureFilter");
  input.setAttribute("aria-label", t("featureFilter"));
  input.value = E.treeQuery || "";
  input.addEventListener("input", function () { E.treeQuery = input.value; applyFeatureFilter(host); });
  wrap.appendChild(input);
  if (E.treeQuery) {
    var clear = btn('<i class="ph ph-x"></i>', function () { E.treeQuery = ""; input.value = ""; applyFeatureFilter(host); }, "md-feature-filter-clear");
    clear.setAttribute("aria-label", t("cancelCommand"));
    wrap.appendChild(clear);
  }
  host.appendChild(wrap);
}

function applyFeatureFilter(host) {
  var query = String(E.treeQuery || "").trim().toLowerCase();
  host.querySelectorAll(".md-part").forEach(function (row) {
    row.hidden = !!query && row.textContent.toLowerCase().indexOf(query) < 0;
  });
}

function insertAssemblyComponent(modelKey) {
  if (!E.assembly) E.assembly = newAssembly();
  var def = loadLib().find(function (m) { return m.key === modelKey; });
  if (!def) return;
  var i = E.assembly.components.length;
  var component = {
    id: uid(), modelKey: def.key, name: def.name || def.key,
    def: cloneData(def), visible: true, grounded: i === 0,
    transform: { x: i * 25, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
  };
  E.assembly.components.push(component);
  E.componentSel = [component];
  E.sel = component;
  refreshAll();
  fitPreview();
}

function refreshComponents() {
  var host = root.querySelector("#mdParts");
  host.innerHTML = "";
  addFeatureFilter(host);
  var models = loadLib();
  var insert = el("div", "md-insert-component");
  var select = el("select");
  models.forEach(function (m) {
    var o = document.createElement("option");
    o.value = m.key; o.textContent = m.name || m.key;
    select.appendChild(o);
  });
  var add = btn('<i class="ph ph-plus"></i> ' + t("addComponent"), function () {
    if (select.value) insertAssemblyComponent(select.value);
  }, "btn-accent");
  add.disabled = !models.length;
  insert.appendChild(select); insert.appendChild(add); host.appendChild(insert);
  /* An empty library used to leave Assembly as a dead end: an empty dropdown, a
     disabled Insert button, and no hint that the tutorial can seed components.
     Say so, and offer the one action that actually gets the user moving. */
  if (!models.length) {
    host.appendChild(btn('<i class="ph ph-graduation-cap"></i> ' + t("runAssemblyGuide"), function () {
      startTour(); renderTourMode("assembly");
    }));
  }

  var count = E.assembly && E.assembly.components ? E.assembly.components.length : 0;
  var badge = root.querySelector("#mdPartBadge");
  if (badge) { badge.textContent = count || ""; badge.classList.toggle("on", !!count); }
  var sizeEl = root.querySelector("#mdSize");
  if (sizeEl) sizeEl.textContent = count ? count + " " + t("components").toLowerCase() : "";
  if (!count) {
    emptyState(host, "ph-cubes-three", models.length ? t("noComponents") : t("emptyLibTitle"),
      models.length ? t("noComponentsHint") : t("emptyLibHint"));
    return;
  }

  E.assembly.components.forEach(function (component, index) {
    var selected = E.componentSel.indexOf(component) !== -1;
    var row = el("div", "md-part md-component" + (selected ? " on" : ""));
    row.appendChild(el("i", "ph " + (component.grounded ? "ph-anchor-simple" : "ph-cube")));
    row.appendChild(el("span", "nm", (component.name || component.modelKey) + " " + (index + 1)));
    var vis = btn('<i class="ph ' + (component.visible === false ? "ph-eye-slash" : "ph-eye") + '"></i>', function (e) {
      e.stopPropagation(); component.visible = component.visible === false; refreshAll();
    }, "md-part-x");
    vis.title = t("visible"); row.appendChild(vis);
    var del = btn('<i class="ph ph-trash"></i>', function (e) {
      e.stopPropagation();
      E.assembly.components = E.assembly.components.filter(function (c) { return c !== component; });
      E.assembly.mates = E.assembly.mates.filter(function (m) { return m.a !== component.id && m.b !== component.id; });
      E.componentSel = E.componentSel.filter(function (c) { return c !== component; });
      E.sel = E.componentSel[E.componentSel.length - 1] || null;
      refreshAll();
    }, "md-part-x");
    del.title = t("del"); row.appendChild(del);
    row.addEventListener("click", function (e) {
      if (e.ctrlKey || e.metaKey) {
        var at = E.componentSel.indexOf(component);
        if (at === -1) E.componentSel.push(component); else E.componentSel.splice(at, 1);
      } else E.componentSel = [component];
      E.sel = E.componentSel[E.componentSel.length - 1] || null;
      refreshAll();
    });
    host.appendChild(row);
  });
  applyFeatureFilter(host);
}

/* The sketches in the document, each named by the plane it lives on. Clicking
   one makes it the sketch you are editing and swings the view round to its
   plane — you cannot edit a sketch you are not looking at square on. */
function buildSketchList(host, sketches, active) {
  if (sketches.length < 2 && !sketches[0].entities.length && !sketches[0].support) return;
  host.appendChild(el("h5", "md-h5", t("sketches")));
  var list = el("div", "md-tree");
  sketches.forEach(function (s2) {
    var row = el("div", "md-part md-sketch-row" + (s2 === active ? " on" : ""));
    row.appendChild(el("i", "ph ph-compass-tool"));
    row.appendChild(el("span", "nm", s2.name));
    var displayedOffset=s2.frameSpace==="local" ? Number(s2.supportOffset)||0 : Number(s2.offset)||0;
    row.appendChild(el("span", "md-plane-tag", (s2.support ? "@ " + (s2.support.semantic || s2.support.persistentId) : planeLabel(s2.plane)) + (displayedOffset ? " " + displayedOffset : "")));
    if (sketches.length > 1) {
      var x = btn('<i class="ph ph-trash"></i>', function (e) {
        e.stopPropagation();
        pushUndo(t("del"));
        removeSketch(E.def, s2.id);
        E.ssel = []; E.sel = null;
        setView(ensureSketch(E.def).plane);
        refreshAll();
      }, "md-part-x");
      x.title = t("del");
      row.appendChild(x);
    }
    row.addEventListener("click", function (event) {
      if(event && (event.ctrlKey || event.metaKey)){
        E.authoring.sketchSelection ||= [];var selected=E.authoring.sketchSelection.indexOf(s2.id);
        if(selected<0)E.authoring.sketchSelection.push(s2.id);else E.authoring.sketchSelection.splice(selected,1);refreshAll();return;
      }
      E.def.activeSketch = s2.id;
      E.ssel = []; E.sel = null;
      // setView adopts a sketch for the plane, so point it at this one after
      if (E.view !== s2.plane) { setView(s2.plane); E.def.activeSketch = s2.id; }
      if (E.mode === "3d") setMode("2d");
      refreshAll();
    });
    list.appendChild(row);
  });
  host.appendChild(list);
  var add = btn('<i class="ph ph-plus"></i> ' + t("newSketch"), function () {
    beginSketchWorkflow();
  }, "md-wide md-dashed");
  host.appendChild(add);
}

function editSketchFromHistory(sketch) {
  E.def.activeSketch=sketch.id;E.authoring.phase="sketch";E.authoring.sketchId=sketch.id;E.authoring.referenceId=sketch.referenceId;
  E.authoring.sketchSelection=[sketch.id];E.ssel=[];E.sel=null;E.view=sketch.plane || referencePlaneView((E.def.references || []).find(function(reference){return reference.id===sketch.referenceId;}));
  setMode("2d");setCommandTab("sketch");setTab("sketch");refreshAll();requestAnimationFrame(fitSketch);
}

function syncProjectionFromFeature(feature) {
  var part=(E.def.parts || []).find(function(item){return item.featureId===feature.id;});
  if(part && feature.type==="extrude"){
    var depth=Math.max(.1,Number(feature.params.depth)||.1),offset=Number(feature.params.offset)||0,sketchId=feature.references.sketches[0],sketch=(E.def.sketches || []).find(function(item){return item.id===(sketchId && sketchId.id || sketchId);});
    var normal=sketch && sketch.frame && sketch.frame.normal,axis=part.axis==="frame"?planeAxis(sketch && sketch.plane):part.axis,principal=normal?(axis==="x"?Math.sign(normal.x||1):axis==="y"?Math.sign(normal.y||1):Math.sign(normal.z||1)):(part.to>=part.from?1:-1);
    var direction=(feature.params.direction==="reverse"?-1:1)*(principal||1),symmetric=!!feature.params.symmetric||feature.params.endCondition==="mid-plane",center=(part.frame?0:(sketch&&Number(sketch.offset)||0))+direction*offset;
    part.from=symmetric?center-direction*depth/2:center;part.to=symmetric?center+direction*depth/2:center+direction*depth;part.supportDepth=depth;part.supportBaseOffset=offset;
    part.direction=feature.params.direction;part.symmetric=symmetric;part.draftAngle=Number(feature.params.draftAngle)||0;part.draftOutward=!!feature.params.draftOutward;delete part.meshData;part.exactPending=false;
  } else if(part && feature.type==="revolve"){
    part.angle=Math.max(.001,Math.min(360,Number(feature.params.angle)||360));part.direction=feature.params.direction;part.symmetric=!!feature.params.symmetric;delete part.meshData;part.exactPending=false;
  }
  if(feature.type==="pattern"){
    var seed=(E.def.parts || []).find(function(item){return item.featureId===feature.inputs[0];});
    E.def.parts=(E.def.parts || []).filter(function(item){return item.derivedFeatureId!==feature.id;});
    if(seed){var count=Math.max(2,Math.min(100,Math.round(Number(feature.params.count)||2))),circularStep=circularPatternStepDegrees(feature.params,count)*Math.PI/180,placements=patternPlacements(feature.params);placements.forEach(function(placement,index){var copy=resetClonedPartIdentity(cloneData(seed));copy.derivedFeatureId=feature.id;copy.sourceFeatureId=seed.featureId;copy.patternIndex=index+1;copy.patternGridIndex=placement.indices;if(feature.params.mode==="circular")rotatePatternPart(copy,feature.params.axis,circularStep*placement.circularIndex,feature.params.radialDistance);else movePart(copy,placement.x,placement.y,placement.z);E.def.parts.push(copy);});}
  } else if(feature.type==="mirror"){
    var mirrorSeed=(E.def.parts || []).find(function(item){return item.featureId===feature.inputs[0];}),planeReference=(feature.references.references || ["plane:right"])[0];
    E.def.parts=(E.def.parts || []).filter(function(item){return item.derivedFeatureId!==feature.id;});
    if(mirrorSeed){var mirrored=mirrorProjectionPart(resetClonedPartIdentity(cloneData(mirrorSeed)),typeof planeReference==="string"?planeReference:planeReference.id);mirrored.derivedFeatureId=feature.id;mirrored.sourceFeatureId=mirrorSeed.featureId;E.def.parts.push(mirrored);}
  }
  (E.def.parts || []).forEach(function(item){
    (item.exactOperations || []).forEach(function(operation){if(operation.id!==feature.id)return;if(feature.type==="fillet")operation.amount=feature.params.radius;else if(feature.type==="chamfer")operation.amount=feature.params.distance;else if(feature.type==="shell")operation.amount=feature.params.thickness;operation.params=cloneData(feature.params);scheduleExactMesh(item);});
  });
}

function cancelFeatureParameterEdit(silent) {
  var edit=E.authoring && E.authoring.featureEdit;if(!edit)return;
  var feature=(E.def.features || []).find(function(item){return item.id===edit.featureId;});
  if(feature){Object.keys(feature).forEach(function(key){delete feature[key];});Object.assign(feature,cloneData(edit.snapshot));syncProjectionFromFeature(feature);}
  E.authoring.featureEdit=null;E.authoring.editFeatureId=null;E.authoring.featureType=null;H.discard();
  closeFeaturePanel();
  refreshAll();if(!silent)flash("Feature edit cancelled · previous parameters restored");
}

function openFeatureEditor(feature) {
  var host=root && root.querySelector("#mdQuickSettings"),spec=featureSpec(feature.type);if(!host||!spec)return;
  if(E.authoring.featureEdit)cancelFeatureParameterEdit(true);
  pushUndo("Edit "+feature.name);E.authoring.featureEdit={featureId:feature.id,snapshot:cloneData(feature)};
  host.hidden=false;host.innerHTML="";E.authoring.featureType=feature.type;E.authoring.editFeatureId=feature.id;
  host.appendChild(el("div","md-feature-form-title",'<i class="ph '+spec.icon+'"></i><span><b>Edit '+feature.name+'</b><small>History step · '+feature.id+'</small></span>'));
  var name=featureField(host,{key:"$name",label:"Feature name",type:"text"},feature.name),liveBadge=el("div","md-feature-live on",'<i class="ph ph-broadcast"></i> Live · every model view follows these parameters');host.appendChild(liveBadge);
  var pendingFrame=0,controls=renderFeatureParameterForm(host,feature.type,feature,function(next){
    feature.params={...feature.params,...next.params};setFeatureReferencesFromForm(feature,next.references);feature.name=name.value || feature.name;
    if(pendingFrame)cancelAnimationFrame(pendingFrame);pendingFrame=requestAnimationFrame(function(){pendingFrame=0;syncProjectionFromFeature(feature);refreshAll();liveBadge.classList.add("pulse");setTimeout(function(){liveBadge.classList.remove("pulse");},180);});
  });
  name.addEventListener("input",function(){feature.name=name.value || feature.name;var entry=(E.def.history || []).find(function(item){return item.targetId===feature.id;});if(entry)entry.name=feature.name;refreshParts();fillInspector();});
  var dependencies=[];(feature.references.sketches || []).forEach(function(id){dependencies.push("Sketch: "+(id.id||id));});(feature.inputs || []).forEach(function(id){dependencies.push("Feature: "+id);});
  host.appendChild(el("div","md-feature-selection-note",dependencies.length?dependencies.join(" · "):"No upstream feature dependencies"));
  var actions=el("div","md-feature-actions");actions.appendChild(btn('<i class="ph ph-arrow-counter-clockwise"></i> Cancel',function(){cancelFeatureParameterEdit(false);},"md-quick-cancel"));
  actions.appendChild(btn('<i class="ph ph-check"></i> Update feature',function(){
    var values=readFeatureParameterForm(controls,feature.params);
    try{updateFeatureDefinition(E.def,feature.id,{name:name.value || feature.name,params:values.params});setFeatureReferencesFromForm(feature,values.references);syncProjectionFromFeature(feature);E.authoring.featureEdit=null;E.authoring.editFeatureId=null;E.authoring.featureType=null;closeFeaturePanel();refreshAll();flash("✓ Feature rebuilt from history · all views updated");}
    catch(error){flash(String(error.message||error));}
  },"md-quick-apply"));host.appendChild(actions);syncAuthoringWorkflow();syncCommandManager();
}

function buildParametricHistoryTree(host) {
  var analysis=analyzeParametricHistory(E.def,{normalize:false}),sketches=new Map((E.def.sketches || []).map(function(item){return [item.id,item];})),features=new Map((E.def.features || []).map(function(item){return [item.id,item];}));
  host.appendChild(el("div","md-history-summary",'<span><b>'+(E.def.history || []).length+'</b> steps</span><span class="'+(analysis.ok?"ok":"bad")+'">'+(analysis.ok?"Rebuild order valid":analysis.issues.length+" dependency issues")+'</span>'));
  host.appendChild(el("h5","md-h5 md-feature-title","Reference geometry"));
  (E.def.references || []).filter(function(reference){return reference.type==="plane"||reference.type==="axis";}).forEach(function(reference){
    var row=el("div","md-part md-reference-row");row.appendChild(el("i","ph "+(reference.type==="plane"?"ph-square-half":"ph-axis-arrow")));row.appendChild(el("span","nm",reference.name));row.appendChild(el("code","md-plane-tag",reference.id));
    if(reference.type==="plane")row.addEventListener("dblclick",function(){chooseSketchReference(reference);});host.appendChild(row);
  });
  host.appendChild(el("h5","md-h5 md-feature-title","Design history"));
  var tree=el("div","md-tree md-parametric-tree");
  (E.def.history || []).forEach(function(entry,index){
    var target=entry.kind==="sketch"?sketches.get(entry.targetId):features.get(entry.targetId);if(!target)return;
    var selected=entry.kind==="sketch"?(E.authoring.sketchSelection || []).includes(entry.targetId):(E.authoring.featureSelection || []).includes(entry.targetId);
    var row=el("div","md-part md-tree-row md-parametric-node "+entry.kind+" state-"+(entry.status||"pending")+(selected?" on":"")+(entry.suppressed?" md-suppressed":""));
    row.appendChild(el("span","md-history-index",String(index+1)));row.appendChild(el("i","ph "+(entry.kind==="sketch"?"ph-compass-tool":featureSpec(target.type)?.icon || "ph-cube")));
    var copy=el("span","nm");copy.appendChild(el("b","",target.name || entry.name));copy.appendChild(el("small","",entry.kind==="sketch"?(target.referenceId+" · "+(target.status || "under-defined")):(featureSpec(target.type)?.label || target.type)));row.appendChild(copy);
    var up=btn('<i class="ph ph-caret-up"></i>',function(event){event.stopPropagation();pushUndo("Reorder history");var result=reorderHistoryNode(E.def,entry.id,index-1);if(!result.ok){H.discard();flash(result.issues[0].message);}refreshAll();},"md-part-x");up.disabled=index===0;row.appendChild(up);
    var down=btn('<i class="ph ph-caret-down"></i>',function(event){event.stopPropagation();pushUndo("Reorder history");var result=reorderHistoryNode(E.def,entry.id,index+1);if(!result.ok){H.discard();flash(result.issues[0].message);}refreshAll();},"md-part-x");down.disabled=index===E.def.history.length-1;row.appendChild(down);
    row.appendChild(btn('<i class="ph '+(entry.suppressed?'ph-eye-slash':'ph-eye')+'"></i>',function(event){event.stopPropagation();var next=!entry.suppressed;pushUndo(next?"Suppress":"Unsuppress");suppressHistoryNode(E.def,entry.id,next);var part=(E.def.parts || []).find(function(item){return item.featureId===entry.targetId;});if(part)part.suppressed=next;refreshAll();},"md-part-x"));
    row.appendChild(btn('<i class="ph ph-trash"></i>',function(event){event.stopPropagation();pushUndo("Delete history step");var result=removeHistoryNode(E.def,entry.id);if(!result.ok){H.discard();flash(result.issues[0].message);return;}E.def.parts=(E.def.parts || []).filter(function(item){return item.featureId!==entry.targetId&&item.derivedFeatureId!==entry.targetId;});refreshAll();},"md-part-x"));
    row.addEventListener("click",function(event){
      if(entry.kind==="sketch"){if(event.ctrlKey||event.metaKey){E.authoring.sketchSelection ||= [];var at=E.authoring.sketchSelection.indexOf(entry.targetId);if(at<0)E.authoring.sketchSelection.push(entry.targetId);else E.authoring.sketchSelection.splice(at,1);refreshAll();}else editSketchFromHistory(target);}
      else{E.authoring.featureSelection ||= [];if(event.ctrlKey||event.metaKey){var at=E.authoring.featureSelection.indexOf(entry.targetId);if(at<0)E.authoring.featureSelection.push(entry.targetId);else E.authoring.featureSelection.splice(at,1);}else{E.authoring.featureSelection=[entry.targetId];E.sel=(E.def.parts || []).find(function(item){return item.featureId===entry.targetId||item.derivedFeatureId===entry.targetId;}) || null;}refreshAll();}
    });
    row.addEventListener("dblclick",function(event){event.stopPropagation();if(entry.kind==="sketch")editSketchFromHistory(target);else openFeatureEditor(target);});tree.appendChild(row);
  });
  tree.appendChild(btn('<i class="ph ph-plus"></i> Create sketch on reference',beginSketchWorkflow,"md-wide md-dashed"));host.appendChild(tree);
  renderCoreDiagnostics(host);
}

function refreshParts() {
  if (E.docType === "assembly") { refreshComponents(); return; }
  var host = root.querySelector("#mdParts");
  host.innerHTML = "";
  addFeatureFilter(host);
  var sketches = ensureSketchDoc(E.def), sketch = ensureSketch(E.def);
  var sketchCount = sketches.reduce(function (a, s2) { return a + s2.entities.length; }, 0);
  var badge = root.querySelector("#mdPartBadge"), n = isCanonicalAuthoring() ? (E.def.history || []).length : E.def.parts.length + sketchCount + (E.def.referenceGeometry || []).length;
  if (badge) { badge.textContent = n || ""; badge.classList.toggle("on", !!n); }
  var sizeEl = root.querySelector("#mdSize");
  if (sizeEl) {
    var b = defBounds(E.def);
    sizeEl.textContent = renderedParts(E.def).length ? Math.round(b.x1 - b.x0) + "×" + Math.round(b.z1 - b.z0) + "×" + Math.round(b.y1 - b.y0) + " cm" : sketchCount ? sketchCount + " sketch" : "";
  }
  if(isCanonicalAuthoring()) {buildParametricHistoryTree(host);applyFeatureFilter(host);return;}
  if (!n) { emptyState(host, "ph-stack-simple", t("noParts"), t("noPartsHint")); return; }
  renderCoreDiagnostics(host);
  buildSketchList(host, sketches, sketch);
  var ENT_ICON = { line: "ph-line-segment", circle: "ph-circle-dashed", arc: "ph-bezier-curve" };
  sketch.entities.forEach(function (entity, i) {
    var row = el("div", "md-part" + (E.ssel.indexOf(entity) >= 0 ? " on" : ""));
    var swatch = el("span", "sw"); swatch.style.background = entity.construction ? "#8394a6" : "#2684c7"; row.appendChild(swatch);
    row.appendChild(el("i", "ph " + (ENT_ICON[entity.type] || "ph-line-segment")));
    row.appendChild(el("span", "nm", (entity.name || entity.type || "Line") + " " + (i + 1)));
    var x = btn('<i class="ph ph-trash"></i>', async function (e) {
      e.stopPropagation(); pushUndo(t("del"));
      removeSketchEntity(sketch, entity.id);
      E.ssel = E.ssel.filter(function (q) { return q !== entity; });
      if (E.sel === entity) E.sel = null;
      resolveSketch(false);
      refreshAll();
    }, "md-part-x");
    row.appendChild(x);
    // Ctrl/Cmd builds up the pair or triple a constraint needs, exactly as on
    // the canvas — the list is a second way to make the same selection
    row.addEventListener("click", function (e) { selectSketch(entity, e.ctrlKey || e.metaKey); refreshAll(); });
    host.appendChild(row);
  });
  if (E.def.parts.length) buildFeatureTree(host);
  var features = ensureFeatureTree(E.def);
  if (features.length) {
    host.appendChild(el("h5", "md-h5 md-feature-title", t("brepTree")));
    features.forEach(function (feature, index) {
      var row = el("div", "md-part md-feature" + (feature.error ? " error" : ""));
      row.appendChild(el("i", "ph " + (feature.type === "subtract" ? "ph-minus-circle" : feature.type === "union" ? "ph-unite" : "ph-cube")));
      row.appendChild(el("span", "nm", (index + 1) + ". " + (feature.name || feature.type)));
      if (feature.error) row.title = feature.error;
      host.appendChild(row);
    });
  }
  if ((E.def.referenceGeometry || []).length) {
    host.appendChild(el("h5", "md-h5 md-feature-title", "Reference geometry"));
    E.def.referenceGeometry.forEach(function (reference) {
      var icon = reference.type === "reference_plane" ? "ph-square-half" : reference.type === "reference_axis" ? "ph-axis-arrow" : "ph-crosshair";
      var row = el("div", "md-part md-reference-row");
      row.appendChild(el("i", "ph " + icon)); row.appendChild(el("span", "nm", reference.name || reference.type));
      row.appendChild(btn('<i class="ph ph-trash"></i>', function () {
        pushUndo(t("del")); E.def.referenceGeometry = E.def.referenceGeometry.filter(function (item) { return item !== reference; }); refreshAll();
      }, "md-part-x"));
      host.appendChild(row);
    });
  }
  applyFeatureFilter(host);
}

function renderCoreDiagnostics(host) {
  const issues = E.coreRun && E.coreRun.issues ? E.coreRun.issues : [];
  if (!issues.length) return;
  host.appendChild(el("h5", "md-h5 md-feature-title", "Rebuild diagnostics"));
  issues.slice(0, 8).forEach(function (issue) {
    var row = el("div", "md-part md-core-diagnostic " + (issue.severity === "error" ? "error" : "warning"));
    row.appendChild(el("i", "ph " + (issue.severity === "error" ? "ph-warning-octagon" : "ph-warning")));
    var message = el("span", "nm");
    message.textContent = issue.message || issue.code || "Rebuild issue";
    row.appendChild(message);
    row.title = issue.code || "";
    host.appendChild(row);
  });
  if (issues.length > 8) host.appendChild(el("div", "md-note", "+" + (issues.length - 8) + " more"));
}

/* ================= feature history =================
   The parts array IS the history, in build order. This panel is the only place
   that shows all of it: rows can be dragged to reorder, suppressed so they stop
   building, and cut off by a rollback bar that hides everything after it. All
   three are honoured by activeParts(), so the 3D preview, the saved model, the
   catalogue thumbnail and the STEP regeneration agree with what the tree says. */
function buildFeatureTree(host) {
  var tree = el("div", "md-tree");
  var rollback = fin(E.def.rollback) ? clamp(E.def.rollback, 0, E.def.parts.length) : E.def.parts.length;

  host.appendChild(el("h5", "md-h5 md-feature-title", t("featureTree")));

  E.def.parts.forEach(function (p, i) {
    if (i === rollback) tree.appendChild(rollbackBar());
    var rolled = i >= rollback;
    var row = el("div", "md-part md-tree-row" +
      (p === E.sel ? " on" : "") + (p.suppressed ? " md-suppressed" : "") +
      (rolled ? " md-rolled" : "") + (p.profileError ? " error" : ""));
    if (p.profileError) row.title = t("profileBroken");
    row.setAttribute("data-index", i);

    var grip = el("i", "ph ph-dots-six-vertical md-grip");
    grip.title = t("reorder");
    row.appendChild(grip);
    var swatch = el("span", "sw");
    swatch.style.background = /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : "#999999";
    row.appendChild(swatch);
    row.appendChild(el("i", "ph " + (p.profileError ? "ph-warning" : p.sketchDriven ? "ph-link" : KIND_ICON[p.kind] || "ph-cube")));
    row.appendChild(el("span", "nm", (p.name || p.kind) + " " + (i + 1)));

    var roll = btn('<i class="ph ph-arrow-line-down"></i>', function (e) {
      e.stopPropagation();
      pushUndo(t("rollbackTo"));
      // rolling to a feature means "build everything before it", which is what
      // you want when you are about to insert a step ahead of it
      E.def.rollback = i;
      refreshAll();
    }, "md-part-x");
    roll.title = t("rollbackTo");
    row.appendChild(roll);

    var sup = btn('<i class="ph ' + (p.suppressed ? "ph-eye-slash" : "ph-eye") + '"></i>', function (e) {
      e.stopPropagation();
      pushUndo(p.suppressed ? t("unsuppress") : t("suppress"));
      p.suppressed = !p.suppressed;
      refreshAll();
    }, "md-part-x");
    sup.title = p.suppressed ? t("unsuppress") : t("suppress");
    row.appendChild(sup);

    var x = btn('<i class="ph ph-trash"></i>', async function (e) {
      e.stopPropagation();
      pushUndo(t("del"));
      var at = E.def.parts.indexOf(p);
      E.def.parts.splice(at, 1);
      if (fin(E.def.rollback) && E.def.rollback > at) E.def.rollback--;
      if (E.sel === p) E.sel = null;
      refreshAll();
    }, "md-part-x");
    x.title = t("del");
    row.appendChild(x);

    row.addEventListener("click", function () { E.sel = p; E.ssel = []; refreshAll(); });
    wireTreeDrag(row, grip, tree, i);
    tree.appendChild(row);
    (p.exactOperations || []).forEach(function(operation,operationIndex){
      var opRow=el("div","md-part md-tree-operation"+(operation.suppressed ? " md-suppressed" : ""));
      opRow.appendChild(el("i","ph "+(operation.type==="fillet" ? "ph-circle-notch" : operation.type==="chamfer" ? "ph-corners-in" : "ph-bowl-food")));
      opRow.appendChild(el("span","nm",(operationIndex+1)+". "+operation.type[0].toUpperCase()+operation.type.slice(1)+" · "+operation.amount+" cm"));
      var opSup=btn('<i class="ph '+(operation.suppressed ? "ph-eye-slash" : "ph-eye")+'"></i>',function(e){
        e.stopPropagation(); pushUndo(operation.suppressed ? t("unsuppress") : t("suppress"));
        operation.suppressed=!operation.suppressed; delete p.meshData;
        if ((p.exactOperations || []).some(function(candidate){return !candidate.suppressed;})) queueExactMesh(p);
        refreshAll();
      },"md-part-x");
      opRow.appendChild(opSup);
      opRow.appendChild(btn('<i class="ph ph-trash"></i>',function(e){
        e.stopPropagation(); pushUndo(t("del")); p.exactOperations.splice(operationIndex,1); delete p.meshData;
        if (p.exactOperations.length || (p.cuts3d && p.cuts3d.length)) queueExactMesh(p);
        refreshAll();
      },"md-part-x"));
      opRow.addEventListener("click",function(){E.sel=p;E.ssel=[];E.topologySelection=cloneData(operation.targets || []);refreshAll();});
      tree.appendChild(opRow);
    });
  });
  if (rollback >= E.def.parts.length) tree.appendChild(rollbackBar());
  host.appendChild(tree);
}

function rollbackBar() {
  var bar = el("div", "md-rollbar", '<span></span><b>' + t("rollbackBar") + "</b><span></span>");
  bar.title = t("rollbackRelease");
  // double-click releases it to the end, the fastest way back to the whole model
  bar.addEventListener("dblclick", function () {
    pushUndo(t("rollbackRelease"));
    E.def.rollback = null;
    refreshAll();
  });
  return bar;
}

/* Drag a row by its grip to reorder the history. The drop index is read off the
   row the pointer is over, so the list reorders where you see the gap — no
   ghost element, which on a panel this narrow reads better than a floating
   copy of the row. */
function wireTreeDrag(row, grip, tree, index) {
  grip.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    e.stopPropagation();
    // capture keeps the drag alive when the pointer leaves the narrow panel;
    // losing it is not a reason to refuse the drag
    try { grip.setPointerCapture(e.pointerId); } catch (_) { /* keep dragging uncaptured */ }
    var from = index, over = index;
    row.classList.add("md-dragging");
    function move(ev) {
      var rows = [].slice.call(tree.querySelectorAll(".md-tree-row"));
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i].getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) {
          over = +rows[i].getAttribute("data-index");
          rows.forEach(function (q, j) { q.classList.toggle("md-drop", j === i && over !== from); });
          break;
        }
      }
    }
    function up() {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      row.classList.remove("md-dragging");
      if (over !== from) {
        pushUndo(t("reorder"));
        var moved = E.def.parts.splice(from, 1)[0];
        E.def.parts.splice(over, 0, moved);
        refreshAll();
      } else refreshParts();
    }
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
  });
}

// bumped on blur so a second visit to the same field is its own history step
var propGen = 0;
function numRow(host, label, get, set, step, tourKey) {
  var w = el("label", "md-grid-cell");
  if (tourKey) w.setAttribute("data-tour-prop", tourKey);
  var span = el("span", "t");
  span.textContent = label;
  w.appendChild(span);
  var inp = el("input");
  inp.type = "number";
  inp.step = step || 1;
  inp.value = Math.round(get() * 10) / 10;
  inp.addEventListener("change", function () {
    var v = parseFloat(inp.value);
    /* One history step per visit to a field, not one per keystroke: the tag
       coalesces while the field stays focused, and blurring it ends the run so
       coming back later is a step of its own. */
    if (fin(v)) {
      pushUndo((label || t("opProp")) + " → " + Math.round(v * 10) / 10, "prop:" + label + ":" + propGen);
      set(v);
      refreshAll();
    }
  });
  inp.addEventListener("blur", function () { propGen++; });
  w.appendChild(inp);
  host.appendChild(w);
}

/* The inspector was one long column: six dimension cells, four material rows, a
   texture picker and ten operation buttons, all competing for the same scroll.
   It is three panes now — the size of the thing, how it looks, and what you can
   do to it — behind the icon row at the top of the panel. */
function assemblyTransformInspector() {
  var host = root.querySelector("#mdInsp"); host.innerHTML = "";
  var component = E.sel;
  if (!component) { emptyState(host, "ph-cursor-click", t("noSel"), t("mateHint")); return; }
  var nameRow = el("label", "md-row md-row-wide");
  nameRow.appendChild(el("span", "t", t("partName")));
  var name = el("input"); name.type = "text"; name.value = component.name || component.modelKey;
  name.addEventListener("change", function () { component.name = name.value.slice(0, 80) || component.modelKey; refreshAll(); });
  nameRow.appendChild(name); host.appendChild(nameRow);
  host.appendChild(el("h5", "md-h5", t("transform")));
  var grid = el("div", "md-prop-grid"), tr = normalizeTransform(component);
  [["X", "x"], ["Y", "y"], ["Z", "z"], ["RX°", "rx"], ["RY°", "ry"], ["RZ°", "rz"]].forEach(function (pair) {
    numRow(grid, pair[0], function () { return tr[pair[1]]; }, function (v) {
      if (!component.grounded) tr[pair[1]] = v;
      applyAssemblyMates(E.assembly);
    }, 0.1);
  });
  host.appendChild(grid);
  if (component.grounded) host.appendChild(el("div", "md-note", t("grounded") + " · " + t("constraintDriven")));
}

function assemblyFlagsInspector() {
  var host = root.querySelector("#mdLook"); host.innerHTML = "";
  var component = E.sel;
  if (!component) { emptyState(host, "ph-eye", t("noSel"), t("mateHint")); return; }
  [["visible", t("visible")], ["grounded", t("grounded")]].forEach(function (entry) {
    var row = el("label", "md-check");
    var input = el("input"); input.type = "checkbox";
    input.checked = entry[0] === "visible" ? component.visible !== false : !!component.grounded;
    input.addEventListener("change", function () { component[entry[0]] = input.checked; refreshAll(); });
    row.appendChild(input); row.appendChild(el("span", "", entry[1])); host.appendChild(row);
  });
  var def = componentDef(component);
  if (def) host.appendChild(el("div", "md-note", (def.parts || []).length + " " + t("partCount") + " · " + (def.w || "—") + "×" + (def.d || "—") + "×" + (def.h || "—") + " cm"));
}

function addMate(type) {
  if (!E.assembly || E.componentSel.length !== 2) { flash(t("mateHint")); return; }
  var a = E.componentSel[0], b = E.componentSel[1];
  var value = 0;
  if (type === "distanceX") {
    value = parseFloat(prompt(t("mateDistance"), normalizeTransform(b).x - normalizeTransform(a).x));
    if (!fin(value)) return;
  }
  E.assembly.mates.push({ id: uid(), type: type, a: a.id, b: b.id, value: value });
  applyAssemblyMates(E.assembly); refreshAll();
}

function componentTopologyRef(component, kind, side) {
  var def = componentDef(component), b = def ? defBounds(def) : {x0:-5,x1:5,y0:0,y1:10,z0:-5,z1:5};
  var frame;
  if (kind === "axis") frame = {
    surface:"cylinder", origin:{x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2,z:(b.z0+b.z1)/2},
    normal:{x:0,y:1,z:0}, axis:{x:0,y:1,z:0},
  };
  else {
    var positive = side !== "min";
    frame = {
      surface:"plane",
      origin:{x:positive?b.x1:b.x0,y:(b.y0+b.y1)/2,z:(b.z0+b.z1)/2},
      normal:{x:positive?1:-1,y:0,z:0},
    };
  }
  return topologyReference(component.id, kind, (component.modelKey||component.id)+":"+kind+":"+(side||"center"), frame);
}

function addTopologyMate(type) {
  if (!E.assembly || E.componentSel.length !== 2) { flash(t("mateHint")); return; }
  var a=E.componentSel[0], b=E.componentSel[1];
  E.assembly.topologyMates ||= [];
  E.assembly.topologyMates.push({
    id:uid(), type:type,
    a:componentTopologyRef(a,type === "concentric" ? "axis" : "face","max"),
    b:componentTopologyRef(b,type === "concentric" ? "axis" : "face","min"),
    value:0,
  });
  applyAssemblyMates(E.assembly); refreshAll();
}

function assemblyMateInspector() {
  var host = root.querySelector("#mdOps"); host.innerHTML = "";
  host.appendChild(el("h5", "md-h5", t("mate")));
  host.appendChild(el("div", "md-note", t("mateHint")));
  var ops = el("div", "md-ops");
  [["alignX", "mateX"], ["alignY", "mateY"], ["alignZ", "mateZ"], ["distanceX", "mateDistance"]].forEach(function (entry) {
    var mateButton=btn('<i class="ph ph-link"></i> ' + t(entry[1]), function () { addMate(entry[0]); });
    mateButton.setAttribute("data-mate",entry[0]);ops.appendChild(mateButton);
  });
  ops.appendChild(btn('<i class="ph ph-selection"></i> Coincident faces', function () { addTopologyMate("coincident"); }));
  ops.appendChild(btn('<i class="ph ph-circles-three-plus"></i> Concentric axes', function () { addTopologyMate("concentric"); }));
  host.appendChild(ops);
  if (E.assembly && E.assembly.mates.length) {
    host.appendChild(el("h5", "md-h5", t("mate")));
    E.assembly.mates.forEach(function (mate) {
      var row = el("div", "md-mate-row");
      row.appendChild(el("span", "", t(mate.type === "alignX" ? "mateX" : mate.type === "alignY" ? "mateY" : mate.type === "alignZ" ? "mateZ" : "mateDistance")));
      row.appendChild(btn('<i class="ph ph-x"></i>', function () {
        E.assembly.mates = E.assembly.mates.filter(function (m) { return m !== mate; }); refreshAll();
      }, "md-part-x"));
      host.appendChild(row);
    });
  }
  if (E.assembly && E.assembly.topologyMates && E.assembly.topologyMates.length) {
    host.appendChild(el("h5", "md-h5", "Topology mates"));
    E.assembly.topologyMates.forEach(function (mate) {
      var row=el("div","md-mate-row"); row.appendChild(el("span","",mate.type+" · "+mate.a.kind+" ↔ "+mate.b.kind));
      row.appendChild(btn('<i class="ph ph-x"></i>',function(){E.assembly.topologyMates=E.assembly.topologyMates.filter(function(m){return m!==mate;});refreshAll();},"md-part-x")); host.appendChild(row);
    });
  }
}

function fillInspector() {
  if (E.docType === "assembly") {
    assemblyTransformInspector();
    assemblyFlagsInspector();
    assemblyMateInspector();
    var hist = root.querySelector("#mdHist");
    if (hist && !hist.children.length) emptyState(hist, "ph-clock-counter-clockwise", t("tabHist"), t("mateHint"));
    var anm = root.querySelector("#mdSelName");
    if (anm) anm.textContent = E.sel ? (E.sel.name || E.sel.modelKey) : "";
    return;
  }
  fillShape();
  fillLook();
  fillOps();
  fillSketchPane();
  var nm = root.querySelector("#mdSelName"),topologyCount=(E.topologySelection || []).length;
  if (nm) nm.textContent = E.sel ? (E.sel.name || E.sel.kind)+(topologyCount?" · "+topologyCount+" "+(E.topologySelection[0].kind || "reference")+(topologyCount===1?"":"s")+" selected":"") : "";
}

function fillShape() {
  var host = root.querySelector("#mdInsp");
  host.innerHTML = "";
  var p = E.sel;
  if (!p) { emptyState(host, "ph-cursor-click", t("noSel"), t("noSelHint")); return; }

  // Generated solids are read-only projections in a canonical document. The
  // editable source of truth is the feature definition in design history.
  if (isCanonicalAuthoring() && p.kind && !p.type) {
    var featureId=p.derivedFeatureId || p.featureId;
    var feature=(E.def.features || []).find(function(item){return item.id===featureId;});
    if(feature){
      var spec=featureSpec(feature.type);
      host.appendChild(el("div","md-feature-form-title",'<i class="ph '+(spec && spec.icon || "ph-cube")+'"></i><span><b>'+(feature.name || feature.type)+'</b><small>Generated by design history</small></span>'));
      host.appendChild(el("div","md-note","This solid is a derived preview. Edit the feature, its sketch, constraints, or dimensions to change it."));
      var summary=el("div","md-topology-selection");
      Object.keys(feature.params || {}).forEach(function(key){
        var row=el("div","md-topology-ref");
        row.appendChild(el("span","md-topology-kind",key));
        var value=feature.params[key];
        row.appendChild(el("code","md-topology-id",typeof value==="object"?JSON.stringify(value):String(value)));
        summary.appendChild(row);
      });
      (feature.references && feature.references.sketches || []).forEach(function(id){
        var row=el("div","md-topology-ref");row.appendChild(el("span","md-topology-kind","sketch"));row.appendChild(el("code","md-topology-id",id.id || id));summary.appendChild(row);
      });
      host.appendChild(summary);
      host.appendChild(btn('<i class="ph ph-pencil-simple"></i> Edit feature in history',function(){openFeatureEditor(feature);},"md-wide btn-accent"));
      if ((E.topologySelection || []).length) {
        host.appendChild(el("div","md-note",E.topologySelection.length+" topology reference"+(E.topologySelection.length===1?"":"s")+" selected"));
      }
      return;
    }
  }

  // a part you can name is a part you can find again in a twenty-part model
  // (a bare sketch point is identified by where it is, so it gets no name row)
  var isPoint = p.type === undefined && p.kind === undefined && "x" in p && "y" in p;
  if (!isPoint) {
  var nameRow = el("label", "md-row md-row-wide");
  nameRow.appendChild(el("span", "t", t("partName")));
  var nameInp = el("input");
  nameInp.type = "text";
  nameInp.value = p.name || p.kind;
  nameInp.addEventListener("change", function () {
    pushUndo(t("partName"));
    p.name = nameInp.value.slice(0, 80) || p.kind;
    refreshParts();
    var nm = root.querySelector("#mdSelName");
    if (nm) nm.textContent = p.name;
  });
  nameRow.appendChild(nameInp);
  host.appendChild(nameRow);
  if (p.exactPending) host.appendChild(el("div", "md-note", "⏳ " + t("exactBuilding")));
  else if (p.exactError) host.appendChild(el("div", "md-note md-note-error", "⚠ " + t("exactFailed") + " · " + p.exactError));
  else if (p.meshData) host.appendChild(el("div", "md-note", "✓ " + t("exactReady")));
  if ((E.topologySelection || []).length) {
    host.appendChild(el("h5", "md-h5", t("topologySelection")));
    var topologyCard = el("div", "md-topology-selection");
    E.topologySelection.forEach(function (reference) {
      var row = el("div", "md-topology-ref");
      row.appendChild(el("span", "md-topology-kind", reference.kind));
      var label = el("code", "md-topology-id", reference.semantic || reference.persistentId);
      label.title = reference.persistentId;
      row.appendChild(label);
      topologyCard.appendChild(row);
    });
    topologyCard.appendChild(btn(t("clearTopologySelection"), function () { E.topologySelection = []; refreshAll(); }, "md-wide"));
    host.appendChild(topologyCard);
  }
  }

  var grid = el("div", "md-prop-grid");
  var importRecognition=E.def.metadata && E.def.metadata.import && E.def.metadata.import.recognition;
  if(importRecognition && importRecognition!=="none" && E.def.parameters){host.appendChild(el("h5","md-h5","Recognized feature parameters"));Object.values(E.def.parameters).filter(function(parameter){return parameter && parameter.adjustable!==false && parameter.exposure!=="internal" && typeof parameter.value==="number";}).forEach(function(parameter){numRow(grid,parameter.label || parameter.name,function(){return parameter.value;},function(value){parameter.value=parameter.step===1?Math.round(value):value;regenerateExactModel(false);},parameter.step || .1);});}
  if (p.type === "line") {
    var linePts = sketchLinePoints(p), pa = linePts.a, pb = linePts.b;
    numRow(grid, "X1", function () { return pa.x; }, function (v) { pa.x = v; resolveSketch(false); }, 0.1);
    numRow(grid, "Y1", function () { return pa.y; }, function (v) { pa.y = v; resolveSketch(false); }, 0.1);
    numRow(grid, "X2", function () { return pb.x; }, function (v) { pb.x = v; resolveSketch(false); }, 0.1);
    numRow(grid, "Y2", function () { return pb.y; }, function (v) { pb.y = v; resolveSketch(false); }, 0.1);
    numRow(grid, t("constraintLength"), function () { return Math.hypot(pb.x - pa.x, pb.y - pa.y); }, function (v) { setLineConstraint(p, "distance", Math.max(0.5, v)); }, 0.1, "length");
    numRow(grid, t("constraintAngle"), function () { return (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI; }, function (v) { setLineConstraint(p, "angle", v); }, 0.1);
    numRow(grid, t("wallWidth"), function () { return p.weight || 1; }, function (v) { p.weight = clamp(v, 1, 6); }, 0.1);
  } else if (p.type === "circle" || p.type === "arc") {
    var oc = circleData(p, new Map((ensureSketch(E.def).points || []).map(function (q) { return [q.id, q]; })));
    if (oc) {
      numRow(grid, "X", function () { return oc.center.x; }, function (v) { oc.center.x = v; resolveSketch(false); }, 0.1);
      numRow(grid, "Y", function () { return oc.center.y; }, function (v) { oc.center.y = v; resolveSketch(false); }, 0.1);
      // an arc's radius is carried by its rim points, so the driver is the
      // radius dimension rather than a stored scalar
      if (p.type === "circle") numRow(grid, "R", function () { return p.r; }, function (v) { p.r = Math.max(0.1, v); resolveSketch(false); }, 0.1);
      else numRow(grid, "R", function () { return oc.radius; }, function (v) { setEntityDimension(p, "radius", Math.max(0.1, v)); }, 0.1);
    }
  } else if (p.type === "ellipse") {
    var oe = ellipseData(p, new Map((ensureSketch(E.def).points || []).map(function (q) { return [q.id, q]; })));
    if (oe) {
      numRow(grid, "X", function () { return oe.center.x; }, function (v) { oe.center.x = v; resolveSketch(false); }, 0.1);
      numRow(grid, "Y", function () { return oe.center.y; }, function (v) { oe.center.y = v; resolveSketch(false); }, 0.1);
      // the three scalars the solver drives, edited directly
      numRow(grid, t("dyn_major"), function () { return p.rx; }, function (v) { p.rx = Math.max(0.1, v); resolveSketch(false); }, 0.1);
      numRow(grid, t("dyn_minor"), function () { return p.ry; }, function (v) { p.ry = Math.max(0.1, v); resolveSketch(false); }, 0.1);
      numRow(grid, t("constraintAngle"), function () { return ((Number(p.rot) || 0) * 180) / Math.PI; },
        function (v) { p.rot = (v * Math.PI) / 180; resolveSketch(false); }, 0.5);
    }
  } else if (p.type === undefined && "x" in p && "y" in p && p.id) {
    numRow(grid, "X", function () { return p.x; }, function (v) { p.x = v; resolveSketch(false); }, 0.1);
    numRow(grid, "Y", function () { return p.y; }, function (v) { p.y = v; resolveSketch(false); }, 0.1);
  } else if (p.kind === "box") {
    numRow(grid, "X", function () { return (p.x0 + p.x1) / 2; }, function (v) { var w = p.x1 - p.x0; p.x0 = v - w / 2; p.x1 = v + w / 2; });
    numRow(grid, "Y", function () { return p.y0; }, function (v) { var h = p.y1 - p.y0; p.y0 = v; p.y1 = v + h; });
    numRow(grid, "Z", function () { return (p.z0 + p.z1) / 2; }, function (v) { var d = p.z1 - p.z0; p.z0 = v - d / 2; p.z1 = v + d / 2; });
    numRow(grid, "W", function () { return p.x1 - p.x0; }, function (v) { var c = (p.x0 + p.x1) / 2; p.x0 = c - v / 2; p.x1 = c + v / 2; });
    numRow(grid, "H", function () { return p.y1 - p.y0; }, function (v) { p.y1 = p.y0 + v; });
    numRow(grid, "D", function () { return p.z1 - p.z0; }, function (v) { var c = (p.z0 + p.z1) / 2; p.z0 = c - v / 2; p.z1 = c + v / 2; });
  } else if (p.kind === "cyl") {
    numRow(grid, "X", function () { return p.x; }, function (v) { p.x = v; });
    numRow(grid, "Y", function () { return p.y; }, function (v) { p.y = v; });
    numRow(grid, "Z", function () { return p.z; }, function (v) { p.z = v; });
    numRow(grid, "R", function () { return p.r; }, function (v) { p.r = Math.max(0.5, v); });
    numRow(grid, "R2", function () { return p.r2 != null ? p.r2 : p.r; }, function (v) { p.r2 = Math.max(0, v); });
    numRow(grid, "H", function () { return p.h; }, function (v) { p.h = Math.max(0.5, v); });
  } else if (p.kind === "sph") {
    numRow(grid, "X", function () { return p.x; }, function (v) { p.x = v; });
    numRow(grid, "Y", function () { return p.y; }, function (v) { p.y = v; });
    numRow(grid, "Z", function () { return p.z; }, function (v) { p.z = v; });
    numRow(grid, "R", function () { return p.r; }, function (v) { p.r = Math.max(0.5, v); });
  } else if (p.kind === "rev") {
    numRow(grid, "X", function () { return p.x; }, function (v) { p.x = v; });
    numRow(grid, "Z", function () { return p.z; }, function (v) { p.z = v; });
    numRow(grid, "Seg", function () { return p.seg || 32; }, function (v) { p.seg = clamp(Math.round(v), 6, 96); });
  } else {
    numRow(grid, t("base"), function () { return Math.min(p.from, p.to); }, function (v) { var d = Math.abs(p.to - p.from); p.from = v; p.to = v + d; });
    numRow(grid, t("depth"), function () { return Math.abs(p.to - p.from); }, function (v) { p.to = p.from + Math.max(0.5, v); });
  }
  host.appendChild(grid);
  if (isSketchObject(p)) {
    var si = E.solveInfo || solveSketch(ensureSketch(E.def));
    host.appendChild(el("div", "md-note", t("constraintDriven") + " · " + si.status + " · DOF " + si.degreesOfFreedom));
  }
  if (p.kind === "ext" || p.kind === "loft" || p.kind === "rev")
    host.appendChild(el("div", "md-note", t("dimHint") + " · " + t("vertexHint")));
}

/* The sketch pane is the sketcher's cockpit: how defined the sketch is, the
   constraints you can apply to what is selected right now, and the list of
   rules already on it — every one of them editable and removable, because a
   constraint you cannot delete is a constraint you will redraw around. */
function fillSketchPane() {
  var host = root && root.querySelector("#mdSketch");
  if (!host) return;
  host.innerHTML = "";
  var sketch = ensureSketch(E.def);
  var si = E.solveInfo || (E.solveInfo = solveSketch(sketch));
  var profileInfo = sketchProfileAnalysis();

  if (!sketch.entities.length) {
    emptyState(host, "ph-compass-tool", t("noSketch"), t("noSketchHint"));
    // variables belong to the document, not to any one sketch, so they stay
    // reachable before the first line is drawn
    buildEquationList(host);
    syncDofBadge();
    return;
  }

  // status: the headline every CAD sketcher puts in the status bar
  var statusText =
    si.status === "fully-constrained" ? t("dofFull") :
    si.status === "conflicting" ? t("dofConflict") :
    si.status === "over-constrained" ? t("dofOver") :
    t("dofUnder") + " " + si.degreesOfFreedom;
  var badge = el("div", "md-dof md-dof-" + si.status, '<i class="ph ' +
    (si.status === "fully-constrained" ? "ph-lock-simple" : si.status === "under-constrained" ? "ph-arrows-out-cardinal" : "ph-warning") +
    '"></i> ' + statusText);
  host.appendChild(badge);
  var sketchMetrics = el("div", "md-sketch-metrics");
  sketchMetrics.appendChild(el("span", "", '<b>' + sketch.entities.length + '</b><small>' + t("entitiesLabel") + '</small>'));
  sketchMetrics.appendChild(el("span", "", '<b>' + sketch.constraints.filter(function (c) { return !c.suppressed; }).length + '</b><small>' + t("constraints") + '</small>'));
  sketchMetrics.appendChild(el("span", "", '<b>' + sketch.constraints.filter(function (c) { return c.value != null && !c.suppressed; }).length + '</b><small>' + t("dimensionsLabel") + '</small>'));
  host.appendChild(sketchMetrics);
  if (si.conflicts.length) {
    host.appendChild(btn('<i class="ph ph-warning"></i> ' + t("removeConflicts"), function () {
      pushUndo(t("removeConflicts"));
      var bad = new Set(si.conflicts);
      sketch.constraints = sketch.constraints.filter(function (constraint) { return !bad.has(constraint.id); });
      resolveSketch(false); refreshAll();
    }, "md-wide btn-danger"));
  }

  var profileText = profileInfo.status === "ready" ? t("profileReady")
    : profileInfo.status === "multiple" ? t("profileMultiple")
    : profileInfo.status === "partial" ? t("profilePartial")
    : profileInfo.status === "branched" ? t("profileBranched")
    : profileInfo.status === "open" ? t("profileOpen") : t("profileEmpty");
  var profileCard = el("div", "md-profile-state md-profile-" + profileInfo.status);
  profileCard.appendChild(el("div", "md-profile-head", '<i class="ph ' +
    (profileInfo.profiles.length ? "ph-check-circle" : profileInfo.branchPoints.length ? "ph-warning" : "ph-path") + '"></i><b>' + profileText + "</b>"));
  var profileStats = el("div", "md-profile-stats");
  profileStats.appendChild(el("span", "", profileInfo.profiles.length + " " + t("profileLoops")));
  if (profileInfo.openEnds.length) profileStats.appendChild(el("span", "", profileInfo.openEnds.length + " " + t("profileEnds")));
  if (profileInfo.branchPoints.length) profileStats.appendChild(el("span", "", profileInfo.branchPoints.length + " × " + t("profileBranched")));
  profileCard.appendChild(profileStats);
  if (profileInfo.nearMergeCount) {
    profileCard.appendChild(btn('<i class="ph ph-arrows-in"></i> ' + t("profileHeal"), function () {
      pushUndo(t("profileHeal"));
      var ids = sketch.entities.filter(function (e) { return !e.construction && (e.type === "line" || e.type === "arc"); }).map(function (e) { return e.id; });
      var count = healSketchEndpoints(sketch, ids, profileInfo.tolerance);
      if (!count) { H.discard(); return; }
      E.ssel = []; E.sel = null;
      resolveSketch(false);
      flash("✓ " + count + " · " + t("profileHealed"));
      refreshAll();
    }, "md-profile-heal"));
  }
  host.appendChild(profileCard);
  if (E.ssel.length) {
    var selectionCard = el("div", "md-selection-info");
    selectionCard.appendChild(el("i", "ph ph-selection"));
    selectionCard.appendChild(el("span", "", sketchSelectionSummary()));
    selectionCard.appendChild(el("kbd", "", "Ctrl+A"));
    host.appendChild(selectionCard);
  }

  /* Which plane this sketch lives on, and how far off it. Moving a sketch to
     another plane is a real edit — every solid it drives extrudes along the new
     normal — so it sits here with the rest of the sketch's own properties. */
  var planeRow = el("label", "md-row md-row-wide");
  planeRow.appendChild(el("span", "t", t("sketchPlane")));
  var planeSel = el("select");
  [["top", t("view_top")], ["front", t("view_front")], ["side", t("view_side")]].forEach(function (o) {
    var opt = el("option", "", o[1]);
    opt.value = o[0];
    if (sketch.plane === o[0]) opt.selected = true;
    planeSel.appendChild(opt);
  });
  planeSel.addEventListener("change", function () {
    pushUndo(t("sketchPlane"));
    sketch.plane = planeSel.value;
    sketch.name = planeLabel(sketch.plane) + " sketch";
    sketch.referenceId = sketch.plane === "side" ? "plane:right" : "plane:" + sketch.plane;
    delete sketch.support;
    delete sketch.frame;
    delete sketch.frameSpace;
    delete sketch.supportOffset;
    setView(sketch.plane);
    E.def.activeSketch = sketch.id;
    refreshAll();
  });
  planeRow.appendChild(planeSel);
  host.appendChild(planeRow);

  if (sketch.support) {
    var supportCard=el("div","md-topology-selection");
    var supportRow=el("div","md-topology-ref");
    supportRow.appendChild(el("span","md-topology-kind","support face"));
    var supportLabel=el("code","md-topology-id",sketch.support.semantic || sketch.support.persistentId);
    supportLabel.title=sketch.support.persistentId;
    supportRow.appendChild(supportLabel); supportCard.appendChild(supportRow);
    supportCard.appendChild(btn("Detach to principal plane",function(){
      pushUndo(t("sketchPlane"));
      sketch.referenceId=sketch.plane==="side" ? "plane:right" : "plane:"+sketch.plane;
      delete sketch.support; delete sketch.frame; delete sketch.frameSpace; delete sketch.supportOffset;
      refreshAll();
    },"md-wide"));
    host.appendChild(supportCard);
  }

  var grid = el("div", "md-prop-grid");
  numRow(grid, t("sketchOffset"), function () { return sketch.frameSpace==="local" ? Number(sketch.supportOffset)||0 : Number(sketch.offset)||0; }, function (v) {
    if (sketch.frameSpace==="local") sketch.supportOffset=v;
    else sketch.offset = v;
  }, 0.5);
  host.appendChild(grid);

  host.appendChild(el("h5", "md-h5", t("constraints")));
  var pal = el("div", "md-ops md-cons-pal");
  CONSTRAINT_DEFS.forEach(function (d) {
    var fits = constraintFits(d.id);
    var b = btn('<i class="ph ' + d.icon + '"></i> ' + t(d.label), function () { applyConstraint(d.id); });
    b.setAttribute("data-constraint", d.id);
    b.disabled = !fits;
    b.title = t(d.label) + " — " + d.need;
    pal.appendChild(b);
  });
  host.appendChild(pal);
  host.appendChild(el("div", "md-note", t("selHint")));

  if (profileInfo.profiles.length) {
    host.appendChild(btn('<i class="ph ph-cube"></i> ' + t("opExtrude"), function(){openParametricFeature("extrude");}, "md-wide btn-accent"));
  }

  host.appendChild(el("h5", "md-h5", t("constraintList")));
  var list = el("div", "md-cons-list");
  (sketch.constraints || []).forEach(function (con) {
    var row = el("div", "md-cons-row" + (si.conflicts.indexOf(con.id) >= 0 ? " bad" : "") + (con.suppressed ? " off" : ""));
    if (con.exprError) { row.classList.add("bad"); row.title = con.exprError; }
    // The value field holds the expression once a dimension is driven by one,
    // so the resolved number gets its own readout at the end of the row rather
    // than being crammed into a label that then truncates.
    row.appendChild(el("span", "n", con.type));

    // A driving dimension is editable in place; geometric rules have no value.
    // The field takes a number or an expression — typing `Width / 2` here is
    // what links one dimension to another.
    if (con.value != null) {
      var nameInp = el("input", "md-dim-name");
      nameInp.type = "text";
      nameInp.value = con.name || "";
      nameInp.placeholder = t("dimName");
      nameInp.title = t("dimName");
      nameInp.addEventListener("change", function () {
        var next = nameInp.value.trim();
        if (next && !nameAvailable(E.def, next, con)) { flash(t("badName")); nameInp.value = con.name || ""; return; }
        pushUndo(t("dimName"));
        if (next) con.name = next; else delete con.name;
        resolveSketch(false);
        refreshAll();
      });
      row.appendChild(nameInp);

      var inp = el("input", "md-dim-value");
      inp.type = "text";
      inp.disabled = !!con.driven;
      inp.value = con.expr != null && String(con.expr).trim() ? String(con.expr) : String(Math.round(con.value * 100) / 100);
      inp.title = t("eqHelp");
      inp.addEventListener("change", function () {
        var text = inp.value.trim();
        var numeric = parseFloat(text);
        var isPlainNumber = String(numeric) === text && fin(numeric);
        var value;
        if (isPlainNumber) value = numeric;
        else {
          // an expression has to make sense before it is allowed into the model
          try {
            value = evaluateExpression(text, function (ref) {
              var entry = collectSymbols(E.def).get(ref);
              return entry ? Number(entry.node.value) : undefined;
            });
          } catch (error) { flash(String(error.message || error)); inp.value = con.expr || con.value; return; }
        }
        pushUndo(t("opDim"));
        var oldValue = con.value, oldExpr = con.expr;
        con.value = value;
        if (isPlainNumber) delete con.expr; else con.expr = text;
        if (!resolveSketch(true)) {
          con.value = oldValue;
          if (oldExpr == null) delete con.expr; else con.expr = oldExpr;
          resolveSketch(false); H.discard(); flash(t("overDefined"));
        }
        refreshAll();
      });
      row.appendChild(inp);
      var drive = btn('<i class="ph ' + (con.driven ? "ph-eye" : "ph-lock-key") + '"></i>', function () {
        pushUndo(con.driven ? t("drivingDimension") : t("drivenDimension"));
        var wasDriven = !!con.driven;
        con.driven = !wasDriven;
        if (con.driven) {
          delete con.expr;
          con.value = constraintMeasure(sketch,con);
          resolveSketch(false);
        } else if (!resolveSketch(true)) {
          con.driven = true;
          con.value = constraintMeasure(sketch,con);
          resolveSketch(false); H.discard(); flash(t("overDefined")); return;
        }
        refreshAll();
      }, "md-mini" + (con.driven ? " on" : ""));
      drive.title = con.driven ? t("drivenDimension") : t("drivingDimension");
      row.appendChild(drive);
    }
    var sup = btn('<i class="ph ' + (con.suppressed ? "ph-eye-slash" : "ph-eye") + '"></i>', function () {
      pushUndo(t("suppress"));
      con.suppressed = !con.suppressed;
      resolveSketch(false);
      refreshAll();
    }, "md-mini");
    sup.title = t("suppress");
    row.appendChild(sup);
    var del = btn('<i class="ph ph-trash"></i>', function () {
      pushUndo(t("del"));
      sketch.constraints = sketch.constraints.filter(function (q) { return q !== con; });
      resolveSketch(false);
      refreshAll();
    }, "md-mini btn-danger");
    del.title = t("del");
    row.appendChild(del);
    if (con.value != null) {
      row.appendChild(el("span", "md-var-val",
        con.exprError ? "—" : (Math.round(con.value * 10) / 10) + (con.type === "angle" ? "°" : "")));
    }
    list.appendChild(row);
  });
  if (!sketch.constraints.length) list.appendChild(el("div", "md-note", t("constraintDriven")));
  host.appendChild(list);
  buildEquationList(host);
  syncDofBadge();
}

/* Global variables: named numbers, or expressions over other names, that any
   dimension in any sketch can be written in terms of. They are what let one
   edit resize a whole design instead of one edge. */
function buildEquationList(host) {
  host.appendChild(el("h5", "md-h5", t("equations")));
  var vars = E.def.variables || [];
  var list = el("div", "md-cons-list");

  vars.forEach(function (v) {
    var row = el("div", "md-cons-row" + (v.exprError ? " bad" : ""));
    if (v.exprError) row.title = v.exprError;

    var nameInp = el("input", "md-dim-name");
    nameInp.type = "text";
    nameInp.value = v.name;
    nameInp.title = t("varName");
    nameInp.addEventListener("change", function () {
      var next = nameInp.value.trim();
      if (!nameAvailable(E.def, next, v)) { flash(t("badName")); nameInp.value = v.name; return; }
      pushUndo(t("varName"));
      v.name = next;
      resolveSketch(false);
      refreshAll();
    });
    row.appendChild(nameInp);

    var exprInp = el("input", "md-dim-value");
    exprInp.type = "text";
    exprInp.value = v.expr;
    exprInp.title = t("varExpr");
    exprInp.addEventListener("change", function () {
      pushUndo(t("varExpr"));
      var old = v.expr;
      v.expr = exprInp.value.trim();
      resolveEquations(E.def);
      if (v.exprError) { flash(v.exprError); v.expr = old; resolveEquations(E.def); }
      resolveSketch(false);
      refreshAll();
    });
    row.appendChild(exprInp);

    // a variable something depends on cannot just disappear
    var del = btn('<i class="ph ph-trash"></i>', function () {
      pushUndo(t("del"));
      removeVariable(E.def, v.id);
      resolveSketch(false);
      refreshAll();
    }, "md-mini btn-danger");
    del.title = t("del");
    row.appendChild(del);

    var val = el("span", "md-var-val", v.exprError ? "—" : String(Math.round((v.value || 0) * 100) / 100));
    row.appendChild(val);
    list.appendChild(row);
  });

  host.appendChild(list);
  host.appendChild(btn('<i class="ph ph-plus"></i> ' + t("addVariable"), function () {
    var base = "Var", n = 1;
    while (!nameAvailable(E.def, base + n)) n++;
    pushUndo(t("addVariable"));
    addVariable(E.def, base + n, "100");
    resolveSketch(false);
    refreshAll();
  }, "md-wide md-dashed"));
  host.appendChild(el("div", "md-note", t("eqHelp")));
}

// The tab icon carries the DOF count, so the sketch's health is visible even
// while you are working in another pane.
function syncDofBadge() {
  var b = root && root.querySelector("#mdDofBadge");
  if (!b) return;
  var si = E.solveInfo;
  // an empty sketch is not "fully defined", it is simply not a sketch yet
  if (!si || E.docType !== "part" || !ensureSketch(E.def).entities.length) {
    b.textContent = ""; b.className = "md-badge"; return;
  }
  b.textContent = si.status === "fully-constrained" ? "✓" : si.status === "under-constrained" ? String(si.degreesOfFreedom) : "!";
  b.className = "md-badge md-badge-" + si.status;
}

function fillLook() {
  var host = root.querySelector("#mdLook");
  host.innerHTML = "";
  var p = E.sel;
  if (!p) { emptyState(host, "ph-paint-brush", t("noSel"), t("noSelHint")); return; }
  if (isSketchObject(p) && p.type) {
    var construction = el("label", "md-check");
    var check = el("input"); check.type = "checkbox"; check.checked = !!p.construction;
    check.addEventListener("change", function () { p.construction = check.checked; drawSketch(); refreshParts(); });
    construction.appendChild(check); construction.appendChild(el("span", "", "Construction geometry")); host.appendChild(construction);
    host.appendChild(el("div", "md-note", "Sketch entities carry rules and metadata only. They do not create a solid until consumed by a feature."));
    return;
  }

  host.appendChild(el("h5", "md-h5", t("material")));
  if (E.def.metadata && E.def.metadata.adapter === "cabinet") {
    var manufacturingTitle=el("h5","md-h5","Manufacturing classification"); host.appendChild(manufacturingTitle);
    var roleRow=el("label","md-row"), roleLabel=el("span","t","Role"), roleSelect=el("select");
    Object.entries(CABINET_MANUFACTURING_ROLES).forEach(function(entry){var option=el("option");option.value=entry[0];option.textContent=entry[1].label;roleSelect.appendChild(option);});
    roleSelect.value=CABINET_MANUFACTURING_ROLES[p.role]?p.role:"panel";
    var materialSelect=el("select"); ["board","front","back","metal","glass","solidWood","stone"].forEach(function(value){var option=el("option");option.value=value;option.textContent=value;materialSelect.appendChild(option);});
    materialSelect.value=p.materialRole || CABINET_MANUFACTURING_ROLES[roleSelect.value].defaultMaterial;
    function commitManufacturing(){pushUndo("Manufacturing classification");assignCabinetManufacturing(p,{role:roleSelect.value,materialRole:materialSelect.value});refreshParts();}
    roleSelect.addEventListener("change",function(){materialSelect.value=CABINET_MANUFACTURING_ROLES[roleSelect.value].defaultMaterial;commitManufacturing();}); materialSelect.addEventListener("change",commitManufacturing);
    roleRow.appendChild(roleLabel);roleRow.appendChild(roleSelect);host.appendChild(roleRow);
    var materialRoleRow=el("label","md-row");materialRoleRow.appendChild(el("span","t","BOM material"));materialRoleRow.appendChild(materialSelect);host.appendChild(materialRoleRow);
  }
  var mrow = el("label", "md-row");
  var colInp = el("input", "color-inp");
  colInp.type = "color";
  colInp.value = p.color || "#999999";
  colInp.addEventListener("input", function () { p.color = colInp.value; updatePreview(); refreshParts(); drawSketch(); });
  var colLbl = el("span", "t");
  colLbl.textContent = t("color");
  mrow.appendChild(colLbl);
  mrow.appendChild(colInp);
  host.appendChild(mrow);
  [["metal", t("metal")], ["rough", t("rough")], ["opacity", t("opacity")]].forEach(function (mm) {
    var row = el("label", "md-row");
    var lab = el("span", "t");
    lab.textContent = mm[1];
    row.appendChild(lab);
    var sl = el("input");
    sl.type = "range"; sl.min = 0; sl.max = 1; sl.step = 0.05;
    sl.value = fin(p[mm[0]]) ? p[mm[0]] : mm[0] === "rough" ? 0.7 : mm[0] === "opacity" ? 1 : 0.08;
    // a bare slider gives no way to reproduce a finish on a second part
    var out = el("span", "md-val", Math.round(sl.value * 100) + "%");
    sl.addEventListener("input", function () {
      p[mm[0]] = +sl.value;
      out.textContent = Math.round(sl.value * 100) + "%";
      updatePreview();
    });
    row.appendChild(sl);
    row.appendChild(out);
    host.appendChild(row);
  });
  // texture
  host.appendChild(el("h5", "md-h5", t("texture")));
  if (p.kind === "loft") {
    host.appendChild(el("div", "md-note", t("loftNoTex")));
    return;
  }
  if (p.tex) {
    var prev = el("div", "md-tex-prev");
    prev.style.backgroundImage = "url(" + p.tex + ")";
    host.appendChild(prev);
  }
  var texB = btn('<i class="ph ph-upload-simple"></i> ' + t("texture"), function () {
    var fi = document.createElement("input");
    fi.type = "file"; fi.accept = "image/*";
    fi.onchange = function () {
      var f = fi.files && fi.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function (ev) { pushUndo(t("opTexture")); p.tex = ev.target.result; updatePreview(); };
      rd.readAsDataURL(f);
    };
    fi.click();
  });
  
  var texGalleryB = btn('<i class="ph ph-image"></i> ' + t("textureGallery"), async function () {
    try {
      var { openTextureGallery } = await import("./ui_textures.js");
      openTextureGallery("cad_part", function(url, scale) {
        pushUndo(t("opTexture"));
        if (url) {
          p.tex = url; 
        } else {
          delete p.tex;
        }
        updatePreview();
        fillInspector();
      });
    } catch(e) {
      console.error("Failed to load texture gallery", e);
    }
  });
  
  var texRow = el("div", "md-btnrow");
  texRow.appendChild(texGalleryB);
  texRow.appendChild(texB);
  host.appendChild(texRow);

  if (p.tex) host.appendChild(btn('<i class="ph ph-x"></i> ' + t("clearTex"), function () { pushUndo(t("clearTex")); delete p.tex; updatePreview(); fillInspector(); }, "md-wide"));
}

function fillOps() {
  var host = root.querySelector("#mdOps");
  host.innerHTML = "";
  var p = E.sel;
  if (!p) { emptyState(host, "ph-magic-wand", t("noSel"), t("noSelHint")); return; }
  if (isSketchObject(p)) {
    var sketch = ensureSketch(E.def);
    var owned = p.type ? entityPoints(sketch, p) : [p];
    host.appendChild(el("h5", "md-h5", t("constraints")));
    var lineOps = el("div", "md-ops");
    if (p.type === "line") {
      // horizontal/vertical replace each other and any angle dimension: all
      // three drive the same freedom, so keeping two guarantees a conflict
      function addLineRule(type) {
        pushUndo(t("opConstraint"));
        sketch.constraints = sketch.constraints.filter(function (c) {
          return !(c.entity === p.id && (c.type === "angle" || c.type === "horizontal" || c.type === "vertical"));
        });
        var added = { id: uid(), type: type, entity: p.id };
        sketch.constraints.push(added);
        if (!resolveSketch(true)) {
          sketch.constraints = sketch.constraints.filter(function (c) { return c !== added; });
          resolveSketch(false);
          H.discard();
          flash(t("overDefined"));
        }
        refreshAll();
      }
      lineOps.appendChild(btn('<i class="ph ph-arrows-out-line-horizontal"></i> ' + t("cHorizontal"), function () { addLineRule("horizontal"); }));
      lineOps.appendChild(btn('<i class="ph ph-arrows-out-line-vertical"></i> ' + t("cVertical"), function () { addLineRule("vertical"); }));
    }
    if (p.type) {
      lineOps.appendChild(btn('<i class="ph ph-line-segments"></i> ' + t("tool_constr"), function () {
        pushUndo(t("tool_constr")); toggleConstruction(sketch, p.id); refreshAll();
      }));
    }
    lineOps.appendChild(btn('<i class="ph ph-lock"></i> ' + t("cFixed"), function () {
      pushUndo(t("cFixed"));
      owned.forEach(function (q) { q.fixed = true; });
      resolveSketch(false); refreshAll();
    }));
    lineOps.appendChild(btn('<i class="ph ph-lock-key-open"></i> ' + t("cFixed") + " ✕", function () {
      pushUndo(t("cFixed"));
      owned.forEach(function (q) { q.fixed = false; });
      resolveSketch(false); refreshAll();
    }));
    host.appendChild(lineOps);
    if (closedSketchProfile()) {
      host.appendChild(btn('<i class="ph ph-cube"></i> ' + t("opExtrude"), function(){openParametricFeature("extrude");}, "md-wide"));
    }
    if (p.type) {
      host.appendChild(btn('<i class="ph ph-trash"></i> ' + t("del"), function () {
        pushUndo(t("del"));
        removeSketchEntity(sketch, p.id);
        E.ssel = []; E.sel = null;
        resolveSketch(false);
        refreshAll();
      }, "md-wide btn-danger"));
    }
    return;
  }
  var b = partBounds(p);

  host.appendChild(el("h5", "md-h5", t("opAlign")));
  var ops = el("div", "md-ops");
  ops.appendChild(btn('<i class="ph ph-align-center-horizontal-simple"></i> ' + t("centerX"), function () { pushUndo(t("centerX")); movePart(p, -(b.x0 + b.x1) / 2, 0, 0); refreshAll(); }));
  ops.appendChild(btn('<i class="ph ph-align-center-vertical-simple"></i> ' + t("centerZ"), function () { pushUndo(t("centerZ")); movePart(p, 0, 0, -(b.z0 + b.z1) / 2); refreshAll(); }));
  ops.appendChild(btn('<i class="ph ph-align-bottom-simple"></i> ' + t("floor"), function () { pushUndo(t("floor")); movePart(p, 0, -b.y0, 0); refreshAll(); }));
  host.appendChild(ops);

  host.appendChild(el("h5", "md-h5", t("opCopy")));
  ops = el("div", "md-ops");
  ops.appendChild(btn('<i class="ph ph-flip-horizontal"></i> ' + t("mirrorX"), function () {
    pushUndo(t("mirrorX"));
    var q = resetClonedPartIdentity(JSON.parse(JSON.stringify(p)));
    if (q.kind === "box") { var t0 = q.x0; q.x0 = -q.x1; q.x1 = -t0; }
    else if (q.kind === "cyl" || q.kind === "sph" || q.kind === "rev") q.x = -q.x;
    else if (q.kind === "loft") {
      if (q.axis === "y" || q.axis === "z") {
        [q.pts0, q.pts1].forEach(function (lp) {
          lp.forEach(function (v) { v.u = -v.u; });
          lp.reverse();
        });
      } else { var lf0 = q.from; q.from = -q.to; q.to = -lf0; }
    }
    else if (q.axis === "y" || q.axis === "z") {
      [q.pts].concat(q.holes || []).forEach(function (lp) {
        lp.forEach(function (v) { v.u = -v.u; });
        lp.reverse();
      });
    }
    else { var f0 = q.from; q.from = -q.to; q.to = -f0; }
    addPart(q);
    E.sel = q;
    refreshAll();
  }));
  ops.appendChild(btn('<i class="ph ph-copy"></i> ' + t("dup"), function () {
    pushUndo(t("dup"));
    var q = resetClonedPartIdentity(JSON.parse(JSON.stringify(p)));
    movePart(q, 10, 0, 10);
    addPart(q);
    E.sel = q;
    refreshAll();
  }));
  ops.appendChild(btn('<i class="ph ph-dots-three-outline"></i> ' + t("patLin"), function () {
    var n = parseInt(prompt(t("patCount"), 3), 10);
    if (!fin(n) || n < 2) return;
    var st = String(prompt(t("patStep"), "20,0,0") || "").split(",").map(parseFloat);
    if (st.length < 3 || !st.every(fin)) return;
    pushUndo(t("patLin"));
    for (var k = 1; k < n; k++) {
      var q = resetClonedPartIdentity(JSON.parse(JSON.stringify(p)));
      movePart(q, st[0] * k, st[1] * k, st[2] * k);
      addPart(q);
    }
    refreshAll();
  }));
  ops.appendChild(btn('<i class="ph ph-circles-three"></i> ' + t("patCirc"), function () {
    var n = parseInt(prompt(t("patCount"), 4), 10);
    if (!fin(n) || n < 2) return;
    var tot = parseFloat(prompt(t("patAngle"), 360));
    if (!fin(tot) || !tot) return;
    // full circle: don't duplicate the original at 360°
    var step = (tot === 360 ? tot / n : tot / (n - 1)) * Math.PI / 180;
    pushUndo(t("patCirc"));
    var made = 0;
    for (var k = 1; k < n; k++) {
      var q = rotPartY(JSON.parse(JSON.stringify(p)), step * k);
      if (!q) break;
      resetClonedPartIdentity(q);
      addPart(q);
      made++;
    }
    if (!made) { H.discard(); flash(t("patSkip")); return; }
    refreshAll();
  }));
  host.appendChild(ops);

  host.appendChild(el("h5", "md-h5", t("opShape")));
  ops = el("div", "md-ops");
  ops.appendChild(btn('<i class="ph ph-bowl-food"></i> ' + t("shellOp"), function () {
    var th = parseFloat(prompt(t("shellT"), 2));
    if (!fin(th) || th <= 0) return;
    quickShellPart(th);
  }));
  ops.appendChild(btn('<i class="ph ph-trapezoid"></i> ' + t("loftOp"), function () {
    if (p.kind !== "ext" || (p.holes && p.holes.length)) { flash(t("loftFail")); return; }
    var sc = parseFloat(prompt(t("loftScale"), 0.6));
    if (!fin(sc) || sc <= 0) return;
    var off = String(prompt(t("loftOff"), "0,0") || "").split(",").map(parseFloat);
    if (off.length < 2 || !fin(off[0]) || !fin(off[1])) off = [0, 0];
    pushUndo(t("loftOp"));
    var c = loopCentroid(p.pts);
    p.kind = "loft";
    p.name = p.name === "extrude" ? "loft" : p.name;
    p.pts0 = p.pts;
    p.pts1 = p.pts.map(function (q2) { return { u: c.u + (q2.u - c.u) * sc + off[0], v: c.v + (q2.v - c.v) * sc + off[1] }; });
    delete p.pts;
    delete p.holes;
    delete p.tex; // lofted geometry has no UVs
    E.sel = p;
    refreshAll();
  }));
  host.appendChild(ops);

  if (p.kind === "box") {
    host.appendChild(el("h5", "md-h5", t("sheetMetal")));
    var smOps = el("div", "md-ops");
    smOps.appendChild(btn('<i class="ph ph-fold"></i> Convert to sheet metal', function () {
      var thickness = parseFloat(prompt("Thickness (cm)", E.def.sheetMetal ? E.def.sheetMetal.thickness : 0.15));
      if (!fin(thickness) || thickness <= 0) return;
      E.def.sheetMetal = createSheetMetalPart({thickness:thickness,insideRadius:thickness,kFactor:.33,base:{width:Math.abs(p.x1-p.x0),height:Math.abs(p.z1-p.z0)}});
      refreshAll();
    }));
    smOps.appendChild(btn('<i class="ph ph-angle"></i> Add edge flange', function () {
      if (!E.def.sheetMetal) { flash("Convert the selected plate to sheet metal first"); return; }
      var length = parseFloat(prompt("Flange length (cm)", 3)), angle = parseFloat(prompt("Bend angle (degrees)", 90));
      if (!fin(length) || !fin(angle)) return;
      addEdgeFlange(E.def.sheetMetal, "right", length, angle); refreshAll();
    }));
    smOps.appendChild(btn('<i class="ph ph-file-svg"></i> Flat pattern', function () {
      if (!E.def.sheetMetal) return;
      var pattern = flatPattern(E.def.sheetMetal);
      var blob = new Blob([JSON.stringify(pattern,null,2)], {type:"application/json"}), a = document.createElement("a");
      a.href=URL.createObjectURL(blob); a.download=(E.def.name||"sheet")+"-flat-pattern.json"; a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
    }));
    host.appendChild(smOps);
  }

  host.appendChild(btn('<i class="ph ph-trash"></i> ' + t("del"), function () {
    pushUndo(t("del"));
    E.def.parts.splice(E.def.parts.indexOf(p), 1);
    E.sel = null;
    refreshAll();
  }, "md-wide btn-danger"));
}

/* ================= 3D preview =================
   Renderer, orbit and sizing come from editor_view.js — the same viewport the
   cabinet designer uses, so the two editors show a model the same way and there
   is one place to fix when they do not. What stays here is the modeler's own
   second destination: rendering the working parts INSIDE the real room, with
   the plan's lighting and everything around them, instead of on a blank
   backdrop. */
/* Resolve what is under the cursor into a part plus a face/edge reference.
   Split out of the click handler so hovering can run exactly the same
   resolution — the highlight you see before you click has to be the thing the
   click then selects, or picking is a guessing game. */
function resolveTopologyPick(event, view) {
  var rect = (event.currentTarget || view.rr.domElement).getBoundingClientRect();
  var pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  var ray = new THREE.Raycaster();
  /* Keep roughly an eight-pixel acquisition band at every zoom level. */
  ray.params.Line.threshold = clamp((view.dist || 120)*.012,1.5,12);
  ray.setFromCamera(pointer, view.cam);
  var hits = ray.intersectObjects(view.grp.children, true);
  {
    var part = null;
    var pickedView = null;
    var topologyReferencePicked = null;
    if (hits.length) {
      var edgeHit = hits.find(function (hit) { return hit.object && hit.object.userData && hit.object.userData.cadTopology; });
      var chosenHit = edgeHit && edgeHit.distance <= hits[0].distance + 2 ? edgeHit : hits[0];
      var partObject = chosenHit.object;
      if (partObject.userData && partObject.userData.cadTopology) {
        var edgeTopology = partObject.userData.cadTopology;
        topologyReferencePicked = createTopologyReference(edgeTopology.ownerFeatureId, edgeTopology.kind, edgeTopology.persistentId, edgeTopology.descriptor);
      }
      if (chosenHit.face && chosenHit.face.normal) {
        var worldNormal = chosenHit.face.normal.clone().transformDirection(partObject.matrixWorld);
        var ax = Math.abs(worldNormal.x), ay = Math.abs(worldNormal.y), az = Math.abs(worldNormal.z);
        pickedView = ay >= ax && ay >= az ? "top" : az >= ax ? "front" : "side";
        var topologyId = null;
        var faceRanges = partObject.userData && partObject.userData.cadFaceRanges;
        if (Array.isArray(faceRanges) && fin(chosenHit.faceIndex)) {
          var range = faceRanges.find(function (candidate) { return chosenHit.faceIndex >= candidate.triangleStart && chosenHit.faceIndex < candidate.triangleStart + candidate.triangleCount; });
          topologyId = range && range.persistentId;
        }
        var featureId = partObject.userData && partObject.userData.cadFeatureId;
        var entries = [];
        var owner = partObject;
        while (owner && owner !== view.grp) {
          if (!featureId && owner.userData && owner.userData.cadFeatureId) featureId = owner.userData.cadFeatureId;
          if (!part && owner.userData && owner.userData.cadPart) part = E.def.parts.find(function (candidate) { return candidate.id === owner.userData.cadPart; }) || null;
          owner = owner.parent;
        }
        var faceTopology = null;
        if (topologyId) {
          entries = (part ? topologyEntriesForPart(part) : []).concat(E.brepRun && E.brepRun.topology || [], E.coreRun && E.coreRun.topology || []);
          faceTopology = entries.find(function (entry) { return entry.persistentId === topologyId; }) || null;
        }
        if (!faceTopology && part) entries = topologyEntriesForPart(part);
        if (!faceTopology && entries.length) {
          var bestScore = -Infinity;
          entries.filter(function (entry) { return entry.kind === "face"; }).forEach(function (entry) {
            var descriptor=entry.descriptor || {}, normal = descriptor.normal;
            if (!normal) return;
            var alignment = normal.x*worldNormal.x + normal.y*worldNormal.y + normal.z*worldNormal.z;
            var origin=descriptor.origin || descriptor.center, planeDistance=0;
            if (origin) planeDistance=Math.abs((chosenHit.point.x-origin.x)*normal.x+(chosenHit.point.y-origin.y)*normal.y+(chosenHit.point.z-origin.z)*normal.z);
            var score = alignment*1000-planeDistance;
            if (score > bestScore) { bestScore = score; faceTopology = entry; }
          });
        }
        if (faceTopology) topologyReferencePicked = createTopologyReference(faceTopology.ownerFeatureId, "face", faceTopology.persistentId, faceTopology.descriptor);
        else if (featureId) {
          var semantic = ay >= ax && ay >= az ? (worldNormal.y >= 0 ? "top" : "bottom") : ax >= az ? (worldNormal.x >= 0 ? "right" : "left") : (worldNormal.z >= 0 ? "front" : "back");
          topologyReferencePicked = createTopologyReference(featureId, "face", featureId + ":face:" + semantic, {surface:"plane",semantic:semantic,origin:{x:chosenHit.point.x,y:chosenHit.point.y,z:chosenHit.point.z},normal:{x:worldNormal.x,y:worldNormal.y,z:worldNormal.z}});
        }
      }
      while (partObject && partObject !== view.grp) {
        if (partObject.userData && partObject.userData.cadPart) {
          part = E.def.parts.find(function (candidate) { return candidate.id === partObject.userData.cadPart; }) || null;
          break;
        }
        partObject = partObject.parent;
      }
    }
    return { hits: hits, part: part, reference: topologyReferencePicked, pickedView: pickedView };
  }
}

/* Hover feedback. Nothing here changes the model or the selection — it only
   says "this is what a click would take", which is the whole difference
   between a viewport you can pick in and one you cannot. */
function hoverAssemblyTopology(event, view) {
  if (!view || !view.grp || E.docType !== "part") return;
  var found = resolveTopologyPick(event, view);
  var next = found && found.reference || null;
  var same = (!next && !E.hoverTopology) || (next && E.hoverTopology && next.persistentId === E.hoverTopology.persistentId);
  if (view.rr && view.rr.domElement) view.rr.domElement.style.cursor = next ? "pointer" : "";
  if (same) return;
  E.hoverTopology = next;
  updatePreview();
}

function pickAssemblyComponent(event, view) {
  if (!view || !view.grp) return;
  if (E.docType === "part") {
    var found = resolveTopologyPick(event, view) || {};
    var part = found.part || null, topologyReferencePicked = found.reference || null;
    E.sel = part;
    E.ssel = [];
    if (!part || !topologyReferencePicked) E.topologySelection = [];
    else if (event.ctrlKey || event.metaKey || event.shiftKey) {
      var selectedAt = E.topologySelection.findIndex(function (reference) { return reference.persistentId === topologyReferencePicked.persistentId; });
      if (selectedAt === -1) E.topologySelection.push(topologyReferencePicked); else E.topologySelection.splice(selectedAt,1);
    } else E.topologySelection = [topologyReferencePicked];
    if(part && activeTab("R")==="sketch")setTab("shape");
    if(E.authoring && E.authoring.featureType && E.authoring.featurePreviewState && !E.authoring.featureEdit){
      syncNewFeaturePreview(E.authoring.featureType,E.authoring.featurePreviewState,E.authoring.featurePreviewBadge);
    }
    /* Picking a face records which standard plane it lies closest to — that is
       what a later "sketch on this face" needs. It does NOT move the camera:
       clicking a face to select it and having the model spin flat is the
       single most disorienting thing this editor did. Use the view cube, or
       Normal To, when you actually want to be square to it. */
    if (part && found.pickedView) E.selectedFaceView = found.pickedView;
    refreshAll();
    return;
  }
  var rect = (event.currentTarget || view.rr.domElement).getBoundingClientRect();
  var pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  var ray = new THREE.Raycaster();
  ray.setFromCamera(pointer, view.cam);
  var hits = ray.intersectObjects(view.grp.children, true);
  var component = null;
  if (hits.length) {
    var object = hits[0].object;
    while (object && object !== view.grp) {
      if (object.userData && object.userData.cadComponent) {
        component = E.assembly.components.find(function (c) { return c.id === object.userData.cadComponent; }) || null;
        break;
      }
      object = object.parent;
    }
  }
  if (!component) E.componentSel = [];
  else if (event.ctrlKey || event.metaKey) {
    var at = E.componentSel.indexOf(component);
    if (at === -1) E.componentSel.push(component); else E.componentSel.splice(at, 1);
  } else E.componentSel = [component];
  E.sel = E.componentSel[E.componentSel.length - 1] || null;
  E.topologySelection = [];
  refreshAll();
}

function initPreview() {
  E.pv = createEditorView({
    canvas: root.querySelector("#mdPrev"),
    fov: 45, near: 0.1, far: 5000,
    grid: true, shadows: true,
    ambient: 0.55, keyLight: 0.9, fill: 0,
    az: 0.8, el: 0.5, dist: 260,
    minEl: 0.05, maxEl: 1.5, minDist: 1, maxDist: 2000,
    pad: 16, ratio: 0.75,
    center: function () {
      if (E.docType === "assembly") return 0;
      var b = defBounds(E.def);
      return (b.y0 + b.y1) / 2;
    },
    active: function () { return E.open; },
    draw: drawInRoom,
    pick: pickAssemblyComponent,
  });
  // second copy of the parts, placed into the real scene for context rendering
  if (E.pv) E.pv.roomGrp = new THREE.Group();
  /* Pre-highlight whatever the cursor is over. Throttled to one resolve per
     frame — a raycast per pointermove event on a dense model is a stutter, and
     the highlight only ever needs to be right at paint time. */
  var canvas = root.querySelector("#mdPrev");
  if (canvas && E.pv) {
    var queued = null;
    canvas.addEventListener("pointermove", function (event) {
      if (event.buttons) return;   // mid-orbit: no picking
      if (queued) return;
      queued = requestAnimationFrame(function () {
        queued = null;
        hoverAssemblyTopology(event, E.pv);
      });
    });
    canvas.addEventListener("pointerleave", function () {
      if (!E.hoverTopology) return;
      E.hoverTopology = null;
      updatePreview();
    });
  }
}

/* Sketch or model, in the same middle pane. The preview canvas is MOVED there
   rather than a second WebGL context being created — see editor_view.js. The
   thumbnail in the right panel and the big view are one renderer. */
function setMode(m) {
  m = m === "3d" ? "3d" : m === "drawing" ? "drawing" : "2d";
  E.mode = m;
  E.modelPlaneActive = false;
  if (E.pv) E.pv.clearFixedFrame(false);
  if (m === "3d") E.tool = "select";
  if (m === "drawing") E.tool = "select";
  E.dimPick = [];
  E.dimSel = null;
  if (!swapView) {
    swapView = createViewportSwap({
      wrap: root.querySelector(".md-prev-wrap"),
      bigHost: root.querySelector("#md3dHost"),
      panelHost: root.querySelector("#mdRightPanel"),
    });
  }
  swapView(m === "3d", E.pv);
  root.classList.toggle("md-is3d", m === "3d");
  root.classList.toggle("md-isdrawing", m === "drawing");
  syncModelPlane();
  layout3DHost();
  if (m === "3d") fitPreview();
  else if (m === "drawing") { E.ssel=[]; E.sel=null; E.poly=null; E.arcPts=null; E.wallPts=null; fitSketch(); }
  root.querySelectorAll("#mdModes button").forEach(function (b) {
    b.classList.toggle("on", b.getAttribute("data-mode") === m);
  });
  syncTools();
  drawSketch();
}

function setModelDisplay(style, refresh) {
  E.displayStyle = style === "transparent" ? "transparent" : "solid";
  if (root) root.querySelectorAll("[data-display]").forEach(function (button) {
    var active = button.getAttribute("data-display") === E.displayStyle;
    button.classList.toggle("on", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (refresh !== false) updatePreview();
}

/* The panels are columns in the body's flex row now, not cards floating over a
   full-bleed middle pane, so the middle pane IS the free space — the big model
   view fills it with plain `inset: 0` and the old measure-the-gaps pass (which
   also had to mirror itself in RTL) is gone. */
function layout3DHost() {
  if (E.pv) E.pv.render();
}

/* Frame whatever is modelled so it fills the view it has just been given —
   the thumbnail's distance is wrong for a pane ten times the size. */
function fitPreview() {
  if (!E.pv || !E.def) return;
  if (E.docType === "assembly") {
    var span = Math.max(180, ((E.assembly && E.assembly.components.length) || 1) * 90);
    E.pv.frame(span * 1.5);
    E.pv.render();
    return;
  }
  var b = defBounds(E.def),
    dx = b.x1 - b.x0, dy = b.y1 - b.y0, dz = b.z1 - b.z0,
    r = Math.max(1, Math.hypot(dx, dy, dz));
  E.pv.frame(r * 1.5);
  E.pv.render();
}

function buildAssembly(parent) {
  if (!E.assembly) return;
  applyAssemblyMates(E.assembly);
  E.assembly.components.forEach(function (component) {
    if (component.visible === false) return;
    var def = componentDef(component);
    if (!def || !Array.isArray(def.parts)) return;
    var group = new THREE.Group(), tr = normalizeTransform(component);
    group.name = component.name || component.modelKey;
    group.userData.cadComponent = component.id;
    activeParts(def).forEach(function (part) { buildPart(group, part, E.displayStyle); });
    group.position.set(tr.x, tr.y, tr.z);
    group.rotation.set((tr.rx * Math.PI) / 180, (tr.ry * Math.PI) / 180, (tr.rz * Math.PI) / 180);
    if (E.componentSel.indexOf(component) !== -1) {
      group.traverse(function (object) {
        if (!object.isMesh || !object.material) return;
        object.material = object.material.clone();
        if (object.material.emissive) object.material.emissive.setHex(0x4b2800);
      });
    }
    parent.add(group);
  });
}

function updatePreview() {
  if (typeof window !== "undefined") window.cadUpdatePreview = updatePreview;
  if (!E.pv) return;
  clearGroup(E.pv.roomGrp);
  if (E.docType === "part") renderedParts(E.def).forEach(function (p) { buildPart(E.pv.roomGrp, p, E.displayStyle); });
  E.pv.rebuild(function (grp) {
    if (E.docType === "assembly") buildAssembly(grp);
    else renderedParts(E.def).forEach(function (p) { buildPart(grp, p, E.displayStyle); });
  });
}

function renderPreview() {
  if (E.pv) E.pv.render();
}

/* The context room: drop the live working copy into the real scene at the
   item's transform (same placement convention as view3d buildItem), hide the
   stale placed instance, render once with full room lighting and occlusion,
   then put everything back. Returns true when it has drawn, which tells the
   shared viewport to skip its own plain-backdrop pass. */
function drawInRoom(view) {
  if (E.docType === "assembly") return false;
  if (!view.inRoom || !has3D) return false;
  var scene = getMainScene();
  if (!scene) return false;

  var b = defBounds(E.def),
    cy = (b.y0 + b.y1) / 2,
    d = view.dist,
    az = view.az,
    elv = view.el,
    cx = Math.sin(az) * Math.cos(elv) * d,
    cy2 = Math.sin(elv) * d,
    cz = Math.cos(az) * Math.cos(elv) * d;

  // Where the model lives in the room: the item being edited, or the floor-plan
  // content centre for a from-scratch model.
  var wx = 0, wz = 0, elev = 0, rot = 0;
  if (E.srcItem) {
    wx = E.srcItem.x;
    wz = E.srcItem.z;
    rot = E.srcItem.rot || 0;
    if (E.srcItem.elev != null) elev = E.srcItem.elev;
  } else if (S.nodes.length) {
    S.nodes.forEach(function (n) { wx += n.x; wz += n.z; });
    wx /= S.nodes.length;
    wz /= S.nodes.length;
  }
  var wy = elev + cy;

  var rg = E.pv.roomGrp;
  rg.position.set(wx, elev, wz);
  rg.rotation.y = (-rot * Math.PI) / 180;

  var oldMesh = null;
  if (E.srcItem) {
    scene.traverse(function (o) {
      if (o.userData && o.userData.item === E.srcItem) oldMesh = o;
    });
    if (oldMesh) oldMesh.visible = false;
  }
  scene.add(rg);

  // Keep the EXACT same viewing angle as the isolated view: shift the camera to
  // the item's world position and rotate the offset to match its rotation.
  var savedFar = view.cam.far;
  view.cam.far = 12000;
  view.cam.updateProjectionMatrix();
  view.rr.autoClear = true;

  var ang = (-rot * Math.PI) / 180;
  var offset = new THREE.Vector3(cx, cy2, cz);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);

  view.cam.position.set(wx + offset.x, wy + offset.y, wz + offset.z);
  view.cam.lookAt(wx, wy, wz);
  gpuRender(view.rr, scene, view.cam);

  view.cam.far = savedFar;
  view.cam.updateProjectionMatrix();
  scene.remove(rg);
  if (oldMesh) oldMesh.visible = true;
  return true;
}

/* ================= saved-model library panel ================= */
function refreshLib() {
  var host = root.querySelector("#mdLib");
  host.innerHTML = "";
  if (E.docType === "assembly") {
    host.appendChild(btn('<i class="ph ph-file-plus"></i> ' + t("newAssembly"), newModel, "md-wide md-dashed"));
    var assemblies = loadAssemblies();
    if (!assemblies.length) { emptyState(host, "ph-cubes-three", t("assemblies"), t("noComponentsHint")); return; }
    assemblies.forEach(function (assembly) {
      var card = el("div", "md-card" + (E.assembly && assembly.key === E.assembly.key ? " on" : ""));
      var top = el("div", "md-card-top");
      top.appendChild(el("i", "ph ph-cubes-three"));
      top.appendChild(el("span", "nm", assembly.name || assembly.key)); card.appendChild(top);
      card.appendChild(el("div", "md-card-note", (assembly.components || []).length + " " + t("components").toLowerCase() + " · " + (assembly.mates || []).length + " mates"));
      card.addEventListener("click", function () {
        E.assembly = cloneData(assembly); E.componentSel = []; E.sel = null;
        syncHead(); refreshAll(); refreshLib(); fitPreview();
      });
      var del = btn('<i class="ph ph-trash"></i>', function (e) {
        e.stopPropagation(); saveAssemblies(loadAssemblies().filter(function (a) { return a.key !== assembly.key; })); refreshLib();
      }, "md-card-x");
      del.title = t("del"); card.appendChild(del); host.appendChild(card);
    });
    return;
  }
  host.appendChild(btn('<i class="ph ph-file-plus"></i> ' + t("newModel"), newModel, "md-wide md-dashed"));
  var lib = loadLib();
  if (!lib.length) { emptyState(host, "ph-folder-open", t("noLib"), t("noLibHint")); return; }
  lib.forEach(function (m) {
    /* Clicking the card loads it — the row used to be inert with a "Load"
       button riding on it, which read as a list you could select from. */
    var card = el("div", "md-card" + (m.key === E.def.key ? " on" : ""));
    card.title = t("load");
    var top = el("div", "md-card-top");
    top.appendChild(el("i", "ph ph-cube"));
    top.appendChild(el("span", "nm", m.name || m.key));
    card.appendChild(top);
    card.appendChild(el("div", "md-card-note",
      (m.parts ? m.parts.length : 0) + " " + t("partCount") +
      (fin(m.w) ? " · " + m.w + "×" + m.d + "×" + m.h + " cm" : "")));
    card.addEventListener("click", function () {
      E.def = JSON.parse(JSON.stringify(m));
      E.srcItem = null;
      E.sel = null;
      H.clear().seed();
      syncHead();
      refreshAll();
      refreshLib();
    });
    var x = btn('<i class="ph ph-trash"></i>', async function (e) {
      e.stopPropagation();
      if (!confirm(t("askDel") + "\n" + (m.name || m.key))) return;
      await saveLib(loadLib().filter(function (q) { return q.key !== m.key; }));
      delete FURN[m.key];
      delete PRICE[m.key];
      refreshCatalogSelect();
      refreshLib();
      garbageCollectAttachments([S,E.def,loadLib(),loadAssemblies()]).catch(function(){});
    }, "md-card-x");
    x.title = t("delModel");
    card.appendChild(x);
    host.appendChild(card);
  });
}

function syncHead() {
  var name = root.querySelector("#mdName"), price = root.querySelector("#mdPrice");
  if (E.docType === "assembly") {
    name.value = E.assembly ? E.assembly.name || "" : "";
    price.closest(".md-field").style.display = "none";
    root.querySelector("#mdSave").innerHTML = '<i class="ph ph-floppy-disk"></i> ' + t("saveAssembly");
  } else {
    name.value = E.def.name || "";
    price.value = fin(E.def.price) ? E.def.price : 0;
    price.closest(".md-field").style.display = "";
    root.querySelector("#mdSave").innerHTML = '<i class="ph ph-floppy-disk"></i> ' + t("save");
  }
  // says whether saving replaces a library entry or re-points a placed piece
  var sub = root.querySelector("#mdSub");
  if (sub) sub.textContent = E.docType === "assembly" ? "· " + t("docAssembly") : E.srcItem ? "· " + (flabel ? flabel(E.srcItem.type) : E.srcItem.type) : "";
}

function rebuildFeatureTreeFromDocument(target) {
  target=target || E.def;
  var previousFeatures=new Map((target.features || []).map(function(feature){return [feature.id,feature];}));
  target.features = [];
  var combined = null;
  activeParts(target).forEach(function (part, index) {
    part.id = part.id || uid();
    part.featureId = part.featureId || "feature:part:" + part.id;
    var feature = null;
    if (part.kind === "box") {
      var boxParams=part.parametricEnvelope === "box" && target.parameters
        ? {x:"$xMin",y:0,z:"$zMin",w:"$width",h:"$height",d:"$depth"}
        : {x:Math.min(part.x0,part.x1),y:Math.min(part.y0,part.y1),z:Math.min(part.z0,part.z1),w:Math.abs(part.x1-part.x0),h:Math.abs(part.y1-part.y0),d:Math.abs(part.z1-part.z0)};
      feature = addFeature(target, { id:part.featureId, type:"box", name:part.name || "Box", params:boxParams });
    } else if (part.kind === "cyl" && (part.r2 == null || Math.abs(part.r2-part.r)<1e-6)) {
      var cylinderParams=part.parametricEnvelope === "cylinder" && target.parameters
        ? {x:0,y:0,z:0,r:"$radius",h:"$height"} : {x:part.x,y:part.y,z:part.z,r:part.r,h:part.h};
      feature = addFeature(target, { id:part.featureId, type:"cylinder", name:part.name || "Cylinder", params:cylinderParams });
    } else if (part.kind === "ext") {
      feature = addFeature(target, { id:part.featureId, type:"extrude", name:part.name || "Extrude", params:{axis:part.axis,...(part.frame ? {frame:cloneData(part.frame)} : {}),from:part.from,to:part.to,points:cloneData(part.pts),...(part.profileEntityIds ? {profileEntityIds:cloneData(part.profileEntityIds), sketchId:part.sketchId} : {}),...(part.support ? {support:cloneData(part.support),baseOffset:Number(part.supportBaseOffset)||0,depth:Number(part.supportDepth)||Math.abs(part.to-part.from)} : {})}, inputs:part.support ? [part.support.ownerFeatureId] : [] });
      (part.holes || []).forEach(function (hole, holeIndex) {
        var cutter = addFeature(target, { id:part.featureId + ":hole:" + holeIndex, type:"extrude", name:"Hole " + (holeIndex+1), params:{axis:part.axis,...(part.frame ? {frame:cloneData(part.frame)} : {}),from:part.from,to:part.to,points:cloneData(hole)} });
        feature = addFeature(target, { id:part.featureId + ":cut:" + holeIndex, type:"subtract", name:"Cut " + (holeIndex+1), inputs:[feature.id,cutter.id] });
      });
      (part.cuts3d || []).forEach(function (cut, cutIndex) {
        var range = cut.frame ? {from:cut.from,to:cut.to} : cutRangeForAxis(partBounds(part), cut.axis);
        var cutter = addFeature(target, { id:part.featureId + ":cross-hole:" + cutIndex, type:"extrude", name:"Cross cut " + (cutIndex+1), params:{axis:cut.axis,...(cut.frame ? {frame:cloneData(cut.frame)} : {}),from:range.from,to:range.to,points:cloneData(cut.loop)} });
        feature = addFeature(target, { id:part.featureId + ":cross-cut:" + cutIndex, type:"subtract", name:"Cross cut " + (cutIndex+1), inputs:[feature.id,cutter.id] });
      });
    } else if (part.kind === "rev") {
      feature=addFeature(target,{id:part.featureId,type:"revolve",name:part.name || "Revolve",params:{angle:360,points:cloneData(part.pts),...(part.profileEntityIds?{profileEntityIds:cloneData(part.profileEntityIds),sketchId:part.sketchId}:{})}});
    } else if ((part.kind === "direct" || part.kind === "mesh") && part.meshData) {
      var directBounds=partBounds(part);
      var previousImport=previousFeatures.get(part.featureId), directPayload=part.sourcePayload || previousImport && previousImport.params && previousImport.params.sourcePayload;
      feature=addFeature(target,{id:part.featureId,type:"import",name:part.name || "Imported direct body",params:{
        bounds:{min:{x:directBounds.x0,y:directBounds.y0,z:directBounds.z0},max:{x:directBounds.x1,y:directBounds.y1,z:directBounds.z1}},
        topology:cloneData(part.meshData.topology || []),source:cloneData(part.importSource || previousImport && previousImport.params && previousImport.params.source || target.metadata && target.metadata.import || {}),
        ...(directPayload ? {sourcePayload:cloneData(directPayload)} : {}),
      }});
    }
    if (feature) {
      var exactOperations=Array.isArray(part.exactOperations) && part.exactOperations.length ? part.exactOperations.filter(function(operation){return !operation.suppressed;}) : [];
      if (!exactOperations.length && fin(part.exactFillet) && part.exactFillet>0) exactOperations=[{id:part.featureId+":fillet",type:"fillet",amount:part.exactFillet,targets:part.exactFilletTargets || []}];
      exactOperations.forEach(function(operation,operationIndex){
        var params={targets:cloneData(operation.targets || [])};
        if (operation.type==="fillet") params.radius=operation.amount;
        else if (operation.type==="chamfer") params.distance=operation.amount;
        else if (operation.type==="shell") params.thickness=operation.amount;
        else return;
        feature=addFeature(target,{
          id:operation.id || part.featureId+":"+operation.type+":"+(operationIndex+1),
          type:operation.type,name:operation.type[0].toUpperCase()+operation.type.slice(1),params:params,inputs:[feature.id],
        });
      });
    }
    if (!feature) return;
    if (!combined) combined = feature;
    else combined = addFeature(target, { id:"feature:union:through:" + part.id, type:"union", name:"Union " + (index+1), inputs:[combined.id,feature.id] });
  });
  return combined;
}

async function regenerateExactModel(rebuild) {
  if (E.docType !== "part" || !activeParts(E.def).length) { flash(t("needParts")); return null; }
  /* The busy state is a flag, not a button handle. This used to reach for
     `#mdRegen`, an element the ribbon consolidation deleted — the throw landed
     *before* the try below, so Regenerate, Ctrl+B and both STEP/IGES exports
     failed silently with nothing in the hint bar. syncCommandManager owns
     every disabled state; see its comment. */
  E.kernelBusy = true; syncCommandManager(); flash(t("kernelBusy"));
  try {
    if (E.brepRun) releaseRegeneration(E.brepRun);
    var preserveRecognized=E.def.metadata && E.def.metadata.import && E.def.metadata.import.recognition && E.def.metadata.import.recognition!=="none",executionDocument=E.def;
    if(isCanonicalAuthoring()){
      var compiled=compileKernelFeatureTree(E.def);if(!compiled.ok)throw new Error(compiled.issues[0] && compiled.issues[0].message || "Invalid parametric history");
      executionDocument=compiled.document;executionDocument.features=compiled.features;
      E.coreRun=rebuildParametricDocument(E.def,E.srcItem && E.srcItem.parameterOverrides || {});publishRebuildStatus(E.def,E.coreRun);
    } else {
      if ((!preserveRecognized && rebuild !== false) || !ensureFeatureTree(E.def).length) rebuildFeatureTreeFromDocument();
      E.coreRun = rebuildDefinition(E.def, E.srcItem && E.srcItem.parameterOverrides || {});
    }
    E.brepRun = await regenerateFeatures(executionDocument);
    if (!E.brepRun.ok || !E.brepRun.finalShape) throw new Error(E.brepRun.issues[0] ? E.brepRun.issues[0].message : "No supported solid features");
    refreshParts(); flash("✓ " + t("kernelReady")); return E.brepRun;
  } catch (error) {
    flash("BREP: " + String(error.message || error)); console.error(error); return null;
  } finally { E.kernelBusy = false; syncCommandManager(); }
}

async function exportStepDocument() {
  if (E.docType !== "part") return;
  if (!standardsGate("STEP export")) return;
  var run = E.brepRun && E.brepRun.finalShape ? E.brepRun : await regenerateExactModel();
  if (!run || !run.finalShape) return;
  try {
    var bytes = await exportStep(run.finalShape, (E.def.name || "model") + ".step");
    var blob = new Blob([bytes], {type:"model/step"}), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = (E.def.name || "model").replace(/[^a-z0-9_-]+/gi,"_") + ".step";
    a.hidden = true; document.body.appendChild(a); a.click(); a.remove();
    flash("✓ STEP exported");
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  } catch (error) { flash("STEP: " + String(error.message || error)); }
}

async function exportIgesDocument() {
  if (E.docType !== "part") return;
  if (!standardsGate("IGES export")) return;
  var run = E.brepRun && E.brepRun.finalShape ? E.brepRun : await regenerateExactModel();
  if (!run || !run.finalShape) return;
  try {
    var bytes = await exportIges(run.finalShape, (E.def.name || "model") + ".igs");
    downloadBytes(bytes, (E.def.name || "model") + ".igs", "model/iges");
    flash("✓ IGES exported");
  } catch (error) { flash("IGES: " + String(error.message || error)); }
}

function downloadBytes(bytes, name, type) {
  var blob = new Blob([bytes], {type:type}), a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = String(name).replace(/[^a-z0-9_.-]+/gi, "_");
  a.hidden = true; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

function addReferenceGeometry(kind) {
  if (E.docType !== "part") return;
  E.def.referenceGeometry ||= [];
  pushUndo("Add reference geometry");
  var item = kind === "plane" ? createReferencePlane({name:"Plane " + (E.def.referenceGeometry.length + 1), origin:{x:0,y:E.baseOff,z:0}})
    : kind === "axis" ? createReferenceAxis({name:"Axis " + (E.def.referenceGeometry.length + 1)})
    : createCoordinateSystem({name:"Coordinate System " + (E.def.referenceGeometry.length + 1)});
  E.def.referenceGeometry.push(item);
  E.def.references ||= [];
  if(kind==="plane")E.def.references.push(Object.assign({},cloneDomain(item),{type:"plane"}));
  else if(kind==="axis")E.def.references.push({id:item.id,type:"axis",name:item.name,origin:cloneData(item.p1),direction:{x:item.p2.x-item.p1.x,y:item.p2.y-item.p1.y,z:item.p2.z-item.p1.z},refType:item.refType});
  else E.def.references.push(Object.assign({},cloneDomain(item),{type:"coordinate-system"}));
  refreshAll(); flash("✓ " + item.name);
}

function showMassProperties() {
  if (E.docType !== "part") return;
  var mass = computeMassProperties({parts:activeParts(E.def)});
  var lines = [
    "Volume            " + mass.volumeCm3 + " cm³",
    "Mass              " + mass.massKg + " kg   (density " + mass.density + " g/cm³)",
    "Centre of mass    X " + mass.centerOfMass.x + "   Y " + mass.centerOfMass.y + "   Z " + mass.centerOfMass.z + "   cm",
  ];
  if (mass.unmeasured) lines.push("", mass.unmeasured + " body/bodies could not be measured and are excluded.");
  report("EVALUATE", "Mass properties", lines);
}

function standardsGate(action) {
  var audit = auditStandardParts({parts:activeParts(E.def)});
  E.def.lastStandardsAudit = {at:Date.now(),ok:audit.ok,checked:audit.checked,blocking:audit.blocking};
  if (audit.ok) return true;
  report("DIN / ISO", action + " blocked by audit", audit.blocking.map(function (i) { return "• " + (i.partName || i.partId) + ": " + i.message; }));
  return false;
}

function runStandardsAudit() {
  var audit = auditStandardParts({parts:activeParts(E.def)});
  E.def.lastStandardsAudit = {at:Date.now(),ok:audit.ok,checked:audit.checked,blocking:audit.blocking};
  if (!audit.checked) { report("DIN / ISO", "Nothing to audit", "No standardized fastener or gear declarations were found."); return; }
  if (audit.ok) report("DIN / ISO", "Audit passed", "All " + audit.checked + " standardized part(s) conform.");
  else report("DIN / ISO", "Audit failed", audit.blocking.map(function (i) { return "• " + (i.partName || i.partId) + ": " + i.message; }));
}

async function exportBundleDocument() {
  try {
    var bundle = await createProjectBundle(E.def, loadAssemblies(), []);
    exportProjectBundle(bundle); flash("✓ Project bundle exported");
  } catch (error) { flash("Bundle: " + String(error.message || error)); }
}

function importBundleDocument() {
  var input=document.createElement("input"); input.type="file"; input.accept=".mforge,application/json";
  input.addEventListener("change",async function(){
    var file=input.files && input.files[0]; if (!file) return;
    try {
      var bundle=await importProjectBundle(file);
      if (!bundle || !bundle.mainModel || !Array.isArray(bundle.mainModel.parts)) throw new Error("Bundle has no main model");
      if (Array.isArray(bundle.assemblies) && bundle.assemblies.length) {
        var merged=new Map(loadAssemblies().map(function(item){return [item.key,item];}));
        bundle.assemblies.forEach(function(item){if(item && item.key)merged.set(item.key,item);});
        saveAssemblies(Array.from(merged.values()));
      }
      if (E.brepRun) { releaseRegeneration(E.brepRun); E.brepRun=null; }
      E.docType="part"; E.def=migrateDefinition(bundle.mainModel); E.srcItem=null; E.sel=null; E.ssel=[]; E.topologySelection=[];
      H.clear().seed(); syncHead(); refreshAll(); refreshLib(); setMode("3d"); fitPreview();
      flash("✓ Project bundle imported");
    } catch(error) { flash("Bundle: "+String(error.message || error)); }
  });
  input.click();
}

function createDefaultExplodedView() {
  if (E.docType !== "assembly" || !E.assembly) return;
  var view = createExplodedView(E.assembly, "Exploded View " + ((E.assembly.explodedViews || []).length + 1));
  E.assembly.components.forEach(function (component, index) {
    if (index) addExplodeStep(view, [component.id], {x:index * 25,y:0,z:0});
  });
  applyExplodedView(E.assembly, view.id, 1); refreshAll(); flash("✓ " + view.name);
}

function createDefaultMotionStudy() {
  if (E.docType !== "assembly" || !E.assembly || !E.assembly.components.length) return;
  var component = E.componentSel[0] || E.assembly.components.find(function (c) { return !c.grounded; }) || E.assembly.components[0];
  var study = createMotionStudy(E.assembly, "Motion Study " + ((E.assembly.motionStudies || []).length + 1));
  addRotaryMotor(study, component.id, 12); evaluateMotionStudy(E.assembly, study.id, 1); refreshAll(); flash("✓ Motion study added");
}

async function runInterferenceCheck() {
  if (E.docType !== "assembly" || !E.assembly) return;
  var hits = await detectInterference(E.assembly.components || []);
  report("EVALUATE", hits.length ? hits.length + " interference(s)" : "No interference detected",
    hits.length ? hits.map(function (h) { return "• " + h.a + " ↔ " + h.b + (h.volume != null ? "   " + h.volume + " cm³" : ""); }) : "No two components overlap.");
}

function showAssemblyBOM() {
  if (E.docType !== "assembly" || !E.assembly) return;
  var rows = generateBOM(E.assembly);
  report("ASSEMBLY", "Bill of materials", rows.length ? rows.map(function (r) { return String(r.quantity).padStart(4, " ") + " × " + r.name; }) : "This assembly has no components yet.");
}

function importStepDocument() {
  if (E.docType !== "part") return;
  var input = document.createElement("input"); input.type = "file"; input.accept = ".step,.stp,model/step";
  input.addEventListener("change", async function () {
    var file = input.files && input.files[0]; if (!file) return;
    flash(t("kernelBusy"));
    try {
      var bytes=new Uint8Array(await file.arrayBuffer());
      var declaredUnit=detectStepLengthUnit(bytes);
      var unitOverride=(root.querySelector("#mdStepUnit") || {}).value || "auto";
      var unitScale=stepUnitCorrection(declaredUnit,unitOverride);
      var shape = await importStep(bytes, file.name);
      extractBrepTopology(shape, {ownerFeatureId:"feature:import:" + file.name.replace(/[^a-z0-9_-]+/gi,"_")});
      var meshData=await shapeToMeshData(shape,{deflection:.22,angle:.16});
      meshData.topology=cloneData(shape.topology || []);
      var imported=createImportedDefinition({
        name:file.name.replace(/\.(step|stp)$/i,""),sourceName:file.name,format:"step",size:file.size,importedAt:Date.now(),sourceUnit:unitOverride === "auto" ? declaredUnit : unitOverride,declaredUnit:declaredUnit,unitOverride:unitOverride,unitScale:unitScale,meshData:meshData,topology:shape.topology || [],
      });
      var canonicalShape=await transformBrep(shape,imported.metadata.import.sourceTransform);
      disposeBrep(shape); shape=null;
      extractBrepTopology(canonicalShape,{ownerFeatureId:imported.features[imported.features.length-1].id,expectedTopology:imported.parts[0].meshData && imported.parts[0].meshData.topology || []});
      if (imported.authoringMode === "direct-only") {
        var exactPayload=encodeBinaryPayload(await serializeBrep(canonicalShape,file.name.replace(/\.(step|stp)$/i,".brep")),{format:"brep",mediaType:"model/vnd.opencascade.brep"});
        imported.parts[0].sourcePayload=exactPayload;
        imported.parts[0].importSource=cloneData(imported.metadata.import);
        imported.features[0].params.sourcePayload=cloneData(exactPayload);
        imported.metadata.import.exactSource={format:"brep",byteLength:exactPayload.byteLength,checksum:exactPayload.checksum};
      }
      if (E.brepRun) releaseRegeneration(E.brepRun);
      if (!activeParts(E.def).length) {
        imported.key=E.def.key; imported.id=E.def.id || E.def.definitionId || E.def.key; imported.definitionId=imported.id;
        imported.price=E.def.price || 0; E.def=imported;
      } else {
        var suffix=uid(),importedParts=cloneData(imported.parts || []);
        importedParts.forEach(function(importedPart){importedPart.id+="-"+suffix;importedPart.featureId+="-"+suffix;delete importedPart.parametricEnvelope;if(importedPart.meshData&&Array.isArray(importedPart.meshData.topology))importedPart.meshData.topology.forEach(function(entry){entry.ownerFeatureId=importedPart.featureId;entry.persistentId=importedPart.featureId+":"+entry.kind+":"+uid();});E.def.parts.push(importedPart);});
        E.def.sketches=(E.def.sketches || []).concat(cloneData(imported.sketches || []));
        E.def.metadata=E.def.metadata || {}; E.def.metadata.imports=(E.def.metadata.imports || []).concat([imported.metadata.import]);
        E.def.authoringMode=inferAuthoringMode(Object.assign({},E.def,{authoringMode:null}));
        normalizeDef(E.def); rebuildFeatureTreeFromDocument();
      }
      disposeBrep(canonicalShape); canonicalShape=null;
      E.brepRun=await regenerateFeatures(E.def);
      if (!E.brepRun.ok || !E.brepRun.finalShape) throw new Error(E.brepRun.issues[0] ? E.brepRun.issues[0].message : "Imported exact body could not rebuild");
      E.def.importedStep = cloneData(imported.metadata.import);
      E.sel=E.def.parts[E.def.parts.length-1]; E.ssel=[]; E.topologySelection=[];
      H.clear().seed(); syncHead(); refreshAll(); setMode("3d"); fitPreview();
      flash("✓ STEP " + file.name + " · " + (imported.metadata.import.recognition === "none" ? "direct-only" : imported.metadata.import.recognition + " recognized") + " · " + (unitOverride === "auto" ? declaredUnit : unitOverride + " override"));
    } catch (error) {
      if (shape) disposeBrep(shape);
      if (canonicalShape) disposeBrep(canonicalShape);
      flash("STEP: " + String(error.message || error));
    }
  });
  input.click();
}

async function saveModel() {
  if (!E.def.parts.length && !ensureSketchDoc(E.def).some(function (s) { return s.entities.length; })) { flash(t("needParts")); return; }
  if (!standardsGate("Save")) return;
  E.def.name = root.querySelector("#mdName").value || E.def.name;
  E.def.price = +root.querySelector("#mdPrice").value || 0;
  // Canonical documents already own their feature history.  Reconstructing it
  // from render parts here would discard design intent; only legacy-adapter
  // documents pass through the compatibility projection.
  var recognizedHistory=E.def.metadata && E.def.metadata.import && E.def.metadata.import.recognition && E.def.metadata.import.recognition!=="none";
  var canonical=isCanonicalAuthoring();
  if (!canonical && !(E.def.metadata && E.def.metadata.adapter === "cabinet") && !recognizedHistory) rebuildFeatureTreeFromDocument();
  var def = JSON.parse(JSON.stringify(E.def));
  normalizeDef(def);
  if (def.metadata && def.metadata.adapter === "cabinet" && E.srcItem && E.srcItem.cab) def=finalizeCabinetAdvancedDefinition(def,E.srcItem);
  else if(!canonical && !recognizedHistory) rebuildFeatureTreeFromDocument(def);
  def.authoringMode=inferAuthoringMode(Object.assign({},def,{authoringMode:null}));
  def.definitionId = E.def.definitionId || E.def.id || def.key;
  def.id = def.definitionId;
  var validation = canonical ? rebuildParametricDocument(def,E.srcItem && E.srcItem.parameterOverrides || {}) : rebuildDefinition(def, E.srcItem && E.srcItem.parameterOverrides || {});
  E.coreRun = validation;
  if (!validation.ok) {
    var failures = validation.issues.filter(function (issue) { return issue.severity === "error"; });
    report("SAVE", "Rebuild failed", failures.slice(0, 6).map(function (issue) { return "• " + (issue.message || issue.code); }));
    refreshParts();
    return;
  }
  var reboundAudit = applyTopologyRebindings(canonical ? validation.core && validation.core.topologyBindings || [] : validation.topologyBindings);
  if (reboundAudit.length) {
    def.topologyBindings = (def.topologyBindings || []).concat(reboundAudit.map(function (entry) { return Object.assign({ savedAt: Date.now() }, entry); }));
    validation = canonical ? rebuildParametricDocument(def,E.srcItem && E.srcItem.parameterOverrides || {}) : rebuildDefinition(def, E.srcItem && E.srcItem.parameterOverrides || {});
    E.coreRun = validation;
  }
  try { def=await externalizeAttachments(def); }
  catch (error) {
    report("SAVE", "Exact attachment save failed", String(error.message || error));
    return;
  }
  var lib = loadLib().filter(function (m) { return m.key !== def.key; });
  lib.push(def);
  if (!await saveLib(lib)) {
    report("SAVE", "Model library save failed", "Browser storage is full or unavailable.");
    return;
  }
  registerCustomModel(def);
  var committed = commitDefinition(S, def);
  refreshCatalogSelect();
  refreshLib();
  var sel = document.getElementById("furnsel");
  if (sel) sel.value = def.key;
  // Every linked instance sees the new shared definition. Cabinet instances
  // keep their semantic spec, interactions and dynamic BOM/pricing adapter.
  committed.affected.forEach(function (item) {
    item.type = def.key;
    item.w = item.parameterOverrides && fin(item.parameterOverrides.width) ? item.parameterOverrides.width : def.w;
    item.d = item.parameterOverrides && fin(item.parameterOverrides.depth) ? item.parameterOverrides.depth : def.d;
    item.h = item.parameterOverrides && fin(item.parameterOverrides.height) ? item.parameterOverrides.height : def.h;
  });
  if (E.srcItem && committed.affected.indexOf(E.srcItem) === -1 && S.items.indexOf(E.srcItem) !== -1) {
    E.srcItem.definitionId = def.id;
    E.srcItem.type = def.key;
  }
  render2D();
  S.dirty3D = true; // placed instances of an edited model rebuild with new geometry
  flash("✓ " + t("saved"));
}

/* ================= open / close ================= */
function refreshAll() {
  syncFaceSupportedSketchFrames();
  if(isCanonicalAuthoring()){
    E.coreRun=rebuildParametricDocument(E.def,E.srcItem && E.srcItem.parameterOverrides || {},{lastGood:E.coreRun && E.coreRun.lastGood});
    publishRebuildStatus(E.def,E.coreRun);
  }
  refreshParts();
  fillInspector();
  updatePreview();
  drawSketch();
  // the history panel is scoped to the selection, so it follows it too
  if (histPanel) histPanel.refresh();
  // the status bar carries the sketch's definition state, which most edits
  // change without the pointer ever moving
  syncStatus();
  syncHint();
  syncExtrudeButton();
  syncActiveFeatureSelectionFeedback();
  syncAuthoringWorkflow();
  updateTourProgress();
}

export function openModeler(editKey, def, srcItem) {
  if (root && E.lang !== getLang()) destroyDOM();
  if (!root) buildDOM();
  E.open = true;
  root.style.display = "flex";
  E.docType = "part";
  root.classList.remove("md-assembly");
  root.querySelectorAll("#mdDocModes [data-doc]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-doc") === "part"); });
  var f = editKey && FURN[editKey] && FURN[editKey].custom;
  E.def = def ? ensureParametricDocument(def) : f ? ensureParametricDocument(f) : newDef();
  E.def.metadata ||= {};
  if(!E.def.metadata.authoringSystem){
    var parametricEvidence=(E.def.features || []).some(function(feature){return !!feature.references || !!feature.params && !!feature.params.sketchId;}) || (E.def.parts || []).some(function(part){return !!part.sketchDriven;});
    E.def.metadata.authoringSystem=parametricEvidence ? "parametric-v1" : "legacy-adapter";
  }
  E.def.definitionId = E.def.definitionId || E.def.id || E.def.key;
  E.def.id = E.def.definitionId;
  (E.def.parts || []).forEach(function (part) {
    part.id = part.id || uid();
    part.featureId = part.featureId || "feature:part:" + part.id;
  });
  // The FeatureManager's legacy reference rows mirror the canonical reference
  // table until that renderer is fully migrated.
  if (!Array.isArray(E.def.referenceGeometry) || !E.def.referenceGeometry.length) {
    E.def.referenceGeometry = (E.def.references || []).filter(function (ref) { return ref.id !== "origin"; }).map(function (ref) {
      if (ref.type === "plane") return Object.assign({}, cloneDomain(ref), { type:"reference_plane" });
      if (ref.type === "axis") return Object.assign({}, cloneDomain(ref), { type:"reference_axis" });
      return cloneDomain(ref);
    });
  }
  if (!Array.isArray(E.def.constraints)) E.def.constraints = [];
  ensureSketchDoc(E.def);
  E.srcItem = srcItem || null;
  E.sel = null;
  E.ssel = [];
  E.topologySelection = [];
  E.poly = null;
  E.arcPts = null;
  E.wallPts = null;
  E.componentSel = [];
  E.authoring={phase:"model",referenceId:null,sketchId:E.def.activeSketch || null,featureType:null,sketchSelection:E.def.activeSketch?[E.def.activeSketch]:[],featureSelection:[]};
  E._mouse = null;
  E.solveInfo = solveSketch(ensureSketch(E.def));
  E.coreRun = isCanonicalAuthoring() ? rebuildParametricDocument(E.def,E.srcItem && E.srcItem.parameterOverrides || {}) : rebuildDefinition(E.def, E.srcItem && E.srcItem.parameterOverrides || {});
  H.clear().seed();
  E._centered = false;
  // Every editor session starts in an opaque, shaded view.
  setModelDisplay("solid", false);
  setMode("3d");
  setCommandTab("features");
  setTab("parts");
  setTab("shape");
  syncHead();
  sizeSketch();
  syncTools();
  refreshLib();
  refreshAll();
  // The editor opens on the solid model; sketch and drawing remain one click away.
  fitPreview();
}
// Open the editor for a placed item: custom models open their own definition
// (saving updates every placed instance); built-ins open as an editable copy,
// and saving swaps this item over to the new custom model.
export function openModelerForItem(it) {
  if (!it || !FURN[it.type]) { openModeler(); return; }
  var canonical = it.cab
    ? syncCabinetDefinition(S, it)
    : ensureItemDefinition(S, it, FURN[it.type]);
  var def = cloneDomain(canonical);
  // Built-in procedural objects remain hybrid during migration: their
  // canonical sketches/features carry design intent, while a one-time mesh
  // decomposition supplies an editable derived preview. Cabinets already
  // publish exact semantic parts and never take this fallback.
  if (!def.parts || !def.parts.length) {
    var derived = defFromBuiltin(it.type, it);
    if (derived) def.parts = derived.parts;
  }
  def.definitionId = canonical.id;
  def.id = canonical.id;
  def.key = canonical.key;
  if (def.parts && def.parts.length) openModeler(null, def, it);
  else openModeler();
}

export function closeModeler() {
  closeTour();
  if(E.authoring && E.authoring.featureEdit)cancelFeatureParameterEdit(true);else clearFeaturePreview(false);
  E.open = false;
  if (root) root.style.display = "none";
}

export function initModeler() {
  // The editor is now a first-class workspace, not a feature hidden at the
  // bottom of the furniture library. Keep this listener here so opening the
  // modelling surface is always routed through the same initialization path.
  var topLaunch = document.getElementById("openModelerTop");
  if (topLaunch) topLaunch.addEventListener("click", function () { openModeler(); });
  window.addEventListener("keydown", function (e) {
    var active = document.activeElement;
    if (E.open || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "m") return;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return;
    e.preventDefault();
    openModeler();
  });
  // library-panel buttons under the furniture catalog (grid or legacy select)
  var wrap = document.querySelector(".furn-panel") || document.querySelector(".furn-wrap");
  if (wrap) {
    var open = btn('<i class="ph ph-cube"></i> ' + t("openModeler"), function () { openModeler(); }, "btn-accent");
    open.id = "openModelerBtn";
    open.style.width = "100%";
    open.style.marginTop = "5px";
    wrap.appendChild(open);
    var edit = btn('<i class="ph ph-pencil-simple"></i> ' + t("editModel"), function () {
      // priority: the item selected in the plan, then a custom type in the legacy select
      if (S.sel && S.sel.kind === "item" && S.sel.ref) { openModelerForItem(S.sel.ref); return; }
      var sel = document.getElementById("furnsel");
      if (sel && FURN[sel.value] && FURN[sel.value].custom) openModeler(sel.value);
      else openModeler();
    });
    edit.id = "editModelBtn";
    edit.style.width = "100%";
    edit.style.marginTop = "5px";
    wrap.appendChild(edit);
  }
  window.addEventListener("resize", function () {
    if (E.open) { sizeSketch(); drawSketch(); layout3DHost(); renderPreview(); }
  });
  refreshCatalogSelect(); // show ★ prefix on customs registered at load
}
