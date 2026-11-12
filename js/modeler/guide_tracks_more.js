/* The CAD tutorials' assembly track and the phone track. See guide_tracks.js
   for the step shape. The phone track keeps its texts in modeler_strings.js
   (keys, not { en, he }) because the phone hub has its own wording for them. */
import { E, refreshAll, root } from "../modeler.js";
import { closeModelerSheet, showModelerSheet } from "../modeler_mobile.js";
import { setMobileAddSelection } from "../modeler/command_manager.js";
import { resolveSketch } from "../modeler/sketch_entities.js";
import { setCommandTab, setTool } from "../modeler/sketch_workflow.js";
import { setMode } from "../modeler/library_io.js";
import { ensureSketch, sketchPoint } from "../sketch_solver.js";
import { uid } from "../state.js";
import {
  addCoincidentMate, assemblySaved, drawRectangle, ensurePracticeAssembly, featureBuilt,
  liveMates, pickMateFaces, practiceCap, runFeature, saveAssembly, selectTopFace, showResult, sketchLines,
  sketchOnPlane, sketching, transformSignature,
} from "./guide_ops.js";
import { assemblyPickedRefs } from "../modeler/viewport_input.js";

function compact() { return document.body.classList.contains("compact-nav"); }

/* ---- assembly: place, move, mate, save ------------------------------------ */
function assemblySteps() {
  return [
    { id:"intro", manual:true, target:{ bind:"mcmd:mates" },
      title:{ en:"Parts become an assembly", he:"מחלקים להרכבה" },
      body:{ en:"An assembly places saved parts — components — and holds them in position with mates. Two practice components are loaded: an orange base, fixed in place, and a blue cap floating above it.",
        he:"הרכבה ממקמת חלקים שמורים — רכיבים — ומחזיקה אותם במקום בעזרת אילוצי הרכבה (Mates). נטענו שני רכיבי תרגול: בסיס כתום מקובע במקומו, ומכסה כחול שמרחף מעליו." },
      prepare:ensurePracticeAssembly },
    { id:"pick", target:"#mdParts",
      title:{ en:"Select the cap", he:"בחרו את המכסה" },
      body:{ en:"Click the blue cap in the 3D view or in the tree.", he:"לחצו על המכסה הכחול בתצוגה או בעץ." },
      check:function () { var cap = practiceCap(); return !!cap && (E.componentSel || []).indexOf(cap) >= 0; },
      demo:function () { var cap = practiceCap(); if (cap) { E.componentSel = [cap]; E.sel = cap; refreshAll(); } } },
    { id:"move", target:"canvas", baseline:transformSignature,
      title:{ en:"Move it", he:"הזיזו אותו" },
      body:{ en:"Drag the cap with the move handles. It moves freely: nothing holds it yet. The base does not move — it is grounded.",
        he:"גררו את המכסה בעזרת ידיות ההזזה. הוא זז בחופשיות: עדיין שום דבר לא מחזיק אותו. הבסיס לא זז — הוא מקובע (Grounded)." },
      check:function () { return !!E.tour.baseline && transformSignature() !== E.tour.baseline; },
      // over the base, still floating: the mate then visibly sets it down
      demo:function () { var cap = practiceCap(); if (cap) { cap.transform.x = 1.5; cap.transform.z = 1; refreshAll(); } } },
    { id:"faces", target:"canvas",
      title:{ en:"Pick the two faces to join", he:"בחרו את שתי הפאות לחיבור" },
      body:{ en:"Click the top face of the base, then Ctrl-click the bottom face of the cap. Orbit if you need to see under it.",
        he:"לחצו על הפאה העליונה של הבסיס, ואז Ctrl+לחיצה על הפאה התחתונה של המכסה. סובבו את המבט אם צריך לראות מתחתיו." },
      bodyMobile:{ en:"Turn on Add to selection in the selection bar, tap the top face of the base, then the bottom face of the cap.",
        he:"הפעילו \"הוספה לבחירה\" בסרגל הבחירה, הקישו על הפאה העליונה של הבסיס ואז על הפאה התחתונה של המכסה." },
      check:function () { return !!assemblyPickedRefs() || liveMates("coincident").length > 0; },
      demo:pickMateFaces },
    { id:"mate", target:{ bind:"mcmd:mates" },
      title:{ en:"Mate them: Coincident", he:"אילוץ: Coincident" },
      body:{ en:"Open the Assembly tab and click Mates. Set Mate type to Coincident faces and accept with ✓. The cap drops onto the base.",
        he:"פתחו את לשונית Assembly ולחצו Mates. הגדירו Mate type ל-Coincident faces ואשרו עם ✓. המכסה נוחת על הבסיס." },
      tip:{ en:"A coincident mate still lets the cap slide on the face. Two more mates — on the side faces — would lock it completely.",
        he:"אילוץ Coincident עדיין מאפשר למכסה להחליק על הפאה. שני אילוצים נוספים על פאות הצד ינעלו אותו לגמרי." },
      check:function () { return liveMates("coincident").length > 0; },
      demo:addCoincidentMate },
    { id:"save", target:"#mdSave",
      title:{ en:"Save the assembly", he:"שמרו את ההרכבה" },
      body:{ en:"Click Save to library. The assembly — components and mates — is stored and can be inserted into other assemblies.",
        he:"לחצו Save to library. ההרכבה — רכיבים ואילוצים — נשמרת ואפשר להכניס אותה להרכבות אחרות." },
      check:assemblySaved,
      demo:async function () { await saveAssembly(); E.tour.demoAssemblyKey = E.assembly && E.assembly.key; } },
    { id:"done", manual:true, target:"#mdParts", prepare:showResult,
      title:{ en:"Assembly basics, done", he:"יסודות ההרכבה — הושלמו" },
      body:{ en:"In your own projects, save parts to the library and insert them here from the Library tab. Exploded view and Interference on the Assembly and Evaluate tabs check how they fit.",
        he:"בפרויקטים שלכם, שמרו חלקים לספרייה והכניסו אותם לכאן מלשונית Library. Exploded view ו-Interference בלשוניות Assembly ו-Evaluate בודקים איך הם מתאימים." } },
  ];
}

/* ---- phone: the touch layout ---------------------------------------------- */
function mobileTourSteps() {
  return [
    { id:"intro", title:"guideMobileIntroTitle", body:"guideMobileIntroBody", tip:"guideMobileIntroTip",
      target:["#modeler .ps-dock", "#md-nav"], manual:true, noAutoReveal:true, gestures:true,
      prepare:function () { setMode("3d"); if (compact()) closeModelerSheet(); } },
    { id:"nav", title:"guideMobileNavTitle", body:"guideMobileNavBody", tip:"guideMobileNavTip",
      target:["#modeler .ps-dock-grid", '[data-mdnav="cmd"]'], noAutoReveal:true,
      prepare:function () { setCommandTab("sketch"); if (compact()) closeModelerSheet(); },
      check:function () { return sketching() || E.tool === "srect"; },
      demo:function () { sketchOnPlane("plane:top", "srect"); } },
    { id:"sketch", title:"guideMobileSketchTitle", body:"guideMobileSketchBody", tip:"guideMobileSketchTip",
      target:"canvas", autoCollapseMobile: true,
      prepare:function () { if (compact()) closeModelerSheet(); if (!sketching()) sketchOnPlane("plane:top", "srect"); else if (E.tool !== "srect") setTool("srect"); },
      check:function () { return sketchLines(ensureSketch(E.def)).length >= 4; },
      demo:function () { drawRectangle(-2, -2, 2, 2); } },
    { id:"extrude", title:"guideMobileExtrudeTitle", body:"guideMobileExtrudeBody", tip:"guideMobileExtrudeTip",
      target: '[data-md-action="extrude"]', noAutoReveal:true, autoCollapseMobile: true,
      prepare:function () {
        setCommandTab("features");
        /* Leave sketch phase so the thumb row is Extrude, not Finish-sketch.
           finishSketchWorkflow() would open the feature form itself and the
           step would never get to ring the Extrude control. */
        if (!(E.authoring && E.authoring.featureType)) {
          setTool("select");
          if (sketching()) { E.authoring.phase = "model"; E.authoring.workflowFocus = "feature"; }
          if (compact()) closeModelerSheet();
        }
        /* A sketch with two sizes and a fixed corner extrudes without the
           "under-defined" detour; the phone track teaches the thumb row. */
        var sketch = ensureSketch(E.def), lines = sketchLines(sketch).slice(-4);
        if (lines.length) { E.ssel = lines; E.sel = lines[0]; }
        if (lines.length === 4 && !(sketch.constraints || []).some(function (c) { return c._mobileTour; })) {
          var a0 = sketchPoint(sketch, lines[0].a), b0 = sketchPoint(sketch, lines[0].b);
          var a1 = sketchPoint(sketch, lines[1].a), b1 = sketchPoint(sketch, lines[1].b);
          if (a0 && b0 && a1 && b1) {
            sketch.constraints.push({ id:uid(), type:"fixed", point:a0.id, x:a0.x, y:a0.y, _mobileTour:true });
            sketch.constraints.push({ id:uid(), type:"distance", entity:lines[0].id, value:Math.hypot(b0.x - a0.x, b0.y - a0.y), _mobileTour:true });
            sketch.constraints.push({ id:uid(), type:"distance", entity:lines[1].id, value:Math.hypot(b1.x - a1.x, b1.y - a1.y), _mobileTour:true });
            resolveSketch(false); refreshAll();
          }
        }
      },
      check:function () { return featureBuilt("extrude"); },
      demo:function () { return runFeature("extrude", { endCondition:"blind", depth:"40mm" }); } },
    { id:"select", title:"guideMobileSelectTitle", body:"guideMobileSelectBody", tip:"guideMobileSelectTip",
      /* Not the selection bar: it is hidden until something is selected, so
         the ring would land on a 0×0 box. The bar appears on the canvas. */
      target:"canvas", autoCollapseMobile: true,
      prepare:function () { if (compact()) closeModelerSheet(); setMode("3d"); setTool("select"); setMobileAddSelection(true); refreshAll(); },
      /* prepare() turns add-selection on, so that cannot be the proof. */
      check:function () { return (E.topologySelection || []).length >= 1; },
      demo:selectTopFace },
    { id:"tree", title:"guideMobileTreeTitle", body:"guideMobileTreeBody", tip:"guideMobileTreeTip",
      target:["#modeler .ps-dock-browse", '[data-mdnav="tree"]'], noAutoReveal:true,
      prepare:function () { if (compact()) closeModelerSheet(); },
      check:function () { return !!(root && (root.querySelector("#md-sheet.on .md-left") || root.classList.contains("md-tree-on"))); },
      demo:function () { showModelerSheet("tree"); } },
    { id:"done", title:"guideMobileFinishTitle", body:"guideMobileFinishBody", tip:"guideMobileFinishTip",
      target:["#mdModes", '[data-mdnav="view"]'], manual:true, noAutoReveal:true,
      prepare:function () { if (compact()) closeModelerSheet(); setMode("3d"); } },
  ];
}

export { assemblySteps, mobileTourSteps };
