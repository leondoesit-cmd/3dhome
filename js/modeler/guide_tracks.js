/* The CAD tutorials' part tracks. Each step says what to do with real values,
   points at the control that does it (a ribbon binding, revealed on its tab by
   the guide), checks the document to see that it was done, and carries a
   demonstration that does the same thing through the editor's own commands —
   used by Demo mode and by "Show me" when someone is stuck.
   Text is { en, he }. Lengths in demos are centimetres (the document unit). */
import { E } from "../modeler.js";
import {
  guideSketch, applyOpenForm, closedSketchProfile, dimensionCircle, dimensionRectangle, drawCircle, drawPolyline,
  drawRectangle, fillForm, featureBuilt, finishSketch, fixPoint, liveFeatures, runEditorCommand, runFeature,
  sketchCircles, sketchDimensions, sketchFullyDefined, sketching, sketchLines, sketchOnPlane,
  showResult, sketchOnTopFace, sketchesWith, standardPartCount,
} from "./guide_ops.js";

function rectangleSketches() {
  return sketchesWith(function (sketch) { return sketchLines(sketch).length >= 4; });
}
function lastSketch() { return guideSketch(); }

/* ---- 1. first part: sketch, dimension, extrude ---------------------------- */
function firstPartSteps() {
  var rect = null;
  return [
    { id:"intro", manual:true,
      title:{ en:"Sketch first, then the solid", he:"קודם סקיצה, אחר כך גוף" },
      body:{ en:"In CAD you never draw a solid directly. You draw a flat sketch, give it exact sizes with dimensions, and a feature turns it into a solid. You will build a 60 × 40 × 20 mm block that way.",
        he:"ב-CAD לא מציירים גוף ישירות. מציירים סקיצה שטוחה, קובעים לה מידות מדויקות, ותכונה (Feature) הופכת אותה לגוף. כך תבנו בלוק בגודל 60 × 40 × 20 מ\"מ." },
      tip:{ en:"Every step waits for you to do it. Stuck? Show me does that step for you.", he:"כל שלב מחכה שתבצעו אותו. נתקעתם? \"הראה לי\" יבצע את השלב בשבילכם." } },
    { id:"sketch", target:{ bind:"mcmd:srect" },
      title:{ en:"Start a sketch", he:"פתחו סקיצה" },
      body:{ en:"On the Sketch tab click Rectangle. In an empty part the sketch opens on the Top plane by itself.",
        he:"בלשונית Sketch לחצו על Rectangle. בחלק ריק הסקיצה נפתחת מעצמה על מישור Top." },
      check:function () { return sketching(); },
      demo:function () { sketchOnPlane("plane:top", "srect"); } },
    { id:"draw", target:"canvas",
      title:{ en:"Draw a rectangle", he:"ציירו מלבן" },
      body:{ en:"Click one corner on the grid, then the opposite corner. The size does not matter yet — dimensions set it next.",
        he:"לחצו על פינה אחת ברשת ואז על הפינה הנגדית. הגודל עדיין לא משנה — המידות יקבעו אותו בשלב הבא." },
      check:function () { return rectangleSketches().length > 0; },
      demo:function () { rect = drawRectangle(-2.5, -1.5, 2.5, 1.5); } },
    { id:"dims", target:{ bind:"mcmd:dim" },
      title:{ en:"Dimension it: 60 × 40 mm", he:"קבעו מידות: 60 × 40 מ\"מ" },
      body:{ en:"Choose Smart dimension (D). Click the bottom edge, type 60mm and press Enter. Click a side edge, type 40mm, Enter.",
        he:"בחרו Smart dimension (D). לחצו על הצלע התחתונה, הקלידו 60mm ו-Enter. לחצו על צלע צד, הקלידו 40mm ו-Enter." },
      tip:{ en:"Typing the unit (mm) works whatever unit the document uses.", he:"הקלדת היחידה (mm) עובדת בכל יחידת מסמך." },
      check:function () { return rectangleSketches().some(function (s) { return sketchDimensions(s).length >= 2; }); },
      demo:function () { dimensionRectangle(rect && rect.length ? rect : sketchLines(lastSketch()), 6, 4); } },
    { id:"define", target:{ bind:"mcon:fixed" },
      title:{ en:"Make it fully defined", he:"הגדירו את הסקיצה במלואה" },
      body:{ en:"The rectangle can still slide around. Click its lower-left corner point, then choose Fix in the Relations group. The status bar then reads Fully defined.",
        he:"המלבן עדיין יכול לזוז. לחצו על נקודת הפינה השמאלית-תחתונה, ואז בחרו Fix בקבוצת Relations. שורת המצב תציג Fully defined." },
      tip:{ en:"Fully defined sketches rebuild predictably when you change a dimension later.", he:"סקיצה מוגדרת במלואה נבנית מחדש בצורה צפויה כשמשנים מידה." },
      check:function () { return rectangleSketches().some(sketchFullyDefined); },
      demo:function () {
        var lines = rect && rect.length ? rect : sketchLines(lastSketch());
        if (lines[0] && !sketchFullyDefined(lastSketch())) fixPoint(lines[0].a);
      } },
    { id:"finish", target:{ bind:"mcmd:finishsketch" },
      title:{ en:"Finish the sketch", he:"סיימו את הסקיצה" },
      body:{ en:"Click Finish sketch. The editor returns to the 3D model and offers features that use the sketch.",
        he:"לחצו Finish sketch. העורך חוזר למודל התלת-ממדי ומציע תכונות שמשתמשות בסקיצה." },
      check:function () { return !sketching() && rectangleSketches().length > 0; },
      demo:finishSketch },
    { id:"extrude", target:{ bind:"mcmd:extrude" },
      title:{ en:"Extrude 20 mm", he:"שליפה (Extrude) של 20 מ\"מ" },
      body:{ en:"Open the Features tab and click Extrude. Set Depth to 20mm — the preview updates live — and accept with ✓.",
        he:"פתחו את לשונית Features ולחצו Extrude. הגדירו Depth ל-20mm — התצוגה המקדימה מתעדכנת מיד — ואשרו עם ✓." },
      check:function () { return featureBuilt("extrude"); },
      demo:function () { return runFeature("extrude", { endCondition:"blind", depth:"20mm" }); } },
    { id:"done", manual:true, target:"#mdParts", prepare:showResult,
      title:{ en:"A parametric part", he:"חלק פרמטרי" },
      body:{ en:"Drag to orbit, Shift-drag to pan, scroll to zoom. The Feature tree lists the sketch and Extrude 1: double-click either one, change a value, and the block rebuilds.",
        he:"גררו כדי לסובב, Shift+גרירה להזזה, גלגלת לזום. עץ התכונות מציג את הסקיצה ואת Extrude 1: לחיצה כפולה על אחד מהם, שינוי ערך — והבלוק נבנה מחדש." } },
  ];
}

/* ---- 2. mounting plate: cut a hole, pattern it ---------------------------- */
function plateSteps() {
  var hole = null;
  return [
    { id:"intro", manual:true,
      title:{ en:"A plate with four holes", he:"פלטה עם ארבעה חורים" },
      body:{ en:"You will build a 70 × 70 × 10 mm mounting plate, cut one Ø8 mm hole, and copy it with a circular pattern instead of drawing four.",
        he:"תבנו פלטת הרכבה 70 × 70 × 10 מ\"מ, תחתכו חור אחד בקוטר 8 מ\"מ, ותשכפלו אותו בתבנית מעגלית במקום לצייר ארבעה." } },
    /* Center rectangle is a form, not a two-click tool: sizes and centre are
       typed, and the result comes out dimensioned. */
    { id:"base", target:{ bind:"mcmd:centerrectangle" },
      title:{ en:"Sketch a 70 mm square", he:"סקיצה של ריבוע 70 מ\"מ" },
      body:{ en:"Click Center rectangle. In its form type 70mm for Width and for Height, keep the centre at 0, 0, tick Fix center, and accept with ✓.",
        he:"לחצו Center rectangle. בטופס הקלידו 70mm ב-Width וב-Height, השאירו את המרכז ב-0, 0, סמנו Fix center ואשרו עם ✓." },
      check:function () { return rectangleSketches().some(function (s) { return sketchDimensions(s).length >= 2; }); },
      demo:async function () {
        await runEditorCommand("centerrectangle");
        var host = document.querySelector("#mdQuickSettings");
        if (host && !host.hidden) { fillForm(host, { width:"70mm", height:"70mm", x:0, y:0, fixCenter:true }); await applyOpenForm(); }
      } },
    { id:"plate", target:{ bind:"mcmd:extrude" },
      title:{ en:"Extrude the plate 10 mm", he:"שלפו את הפלטה 10 מ\"מ" },
      body:{ en:"Finish the sketch, then Features › Extrude with Depth 10mm and accept with ✓.",
        he:"סיימו את הסקיצה, ואז Features › Extrude עם Depth של 10mm ואשרו עם ✓." },
      check:function () { return featureBuilt("extrude"); },
      demo:async function () { await finishSketch(); return runFeature("extrude", { endCondition:"blind", depth:"10mm" }); } },
    { id:"hole", target:{ bind:"mcmd:scirc" },
      title:{ en:"Sketch a hole on the top face", he:"סקיצה של חור על הפאה העליונה" },
      body:{ en:"Click New sketch, then click the plate's top face. Choose Circle and draw a small circle near one corner.",
        he:"לחצו New sketch ואז על הפאה העליונה של הפלטה. בחרו Circle וציירו עיגול קטן ליד אחת הפינות." },
      check:function () { return sketchesWith(function (s) { return sketchCircles(s).length > 0; }).length > 0; },
      demo:function () { sketchOnTopFace("scirc"); hole = drawCircle(2.5, 2.5, 0.6); } },
    { id:"holeDims", target:{ bind:"mcmd:dim" },
      title:{ en:"Size the hole: Ø8 mm", he:"קבעו את החור: קוטר 8 מ\"מ" },
      body:{ en:"With Smart dimension click the circle and type 8mm. Then click the circle's centre and Fix it, or dimension it 10mm from two edges.",
        he:"בעזרת Smart dimension לחצו על העיגול והקלידו 8mm. אחר כך לחצו על מרכז העיגול וקבעו אותו עם Fix, או תנו לו מידה של 10mm משתי צלעות." },
      check:function () {
        return sketchesWith(function (s) {
          return sketchCircles(s).length > 0 && sketchDimensions(s).some(function (c) { return c.type === "diameter" || c.type === "radius"; });
        }).length > 0;
      },
      demo:function () { dimensionCircle(hole || sketchCircles(lastSketch())[0], 0.8); } },
    { id:"cut", target:{ bind:"mcmd:extrudecut" },
      title:{ en:"Cut it through", he:"חתכו לכל העובי" },
      body:{ en:"Finish the sketch, then Features › Extrude cut. Set End condition to Through all and accept with ✓.",
        he:"סיימו את הסקיצה, ואז Features › Extrude cut. הגדירו End condition ל-Through all ואשרו עם ✓." },
      tip:{ en:"Through all keeps the hole going through even if the plate gets thicker later.", he:"Through all שומר על חור עובר גם אם הפלטה תתעבה בהמשך." },
      check:function () { return featureBuilt("extrudeCut"); },
      demo:async function () { await finishSketch(); return runFeature("extrudeCut", { endCondition:"through-all" }); } },
    { id:"pattern", target:{ bind:"mcmd:patternfeature" },
      title:{ en:"Pattern it: 4 holes", he:"תבנית: 4 חורים" },
      body:{ en:"Click Cut-Extrude 1 in the Feature tree, then Features › Pattern. Pattern type Circular, axis Y, 4 instances over 360°, and accept with ✓.",
        he:"לחצו על Cut-Extrude 1 בעץ התכונות, ואז Features › Pattern. סוג Circular, ציר Y, ‏4 מופעים על פני 360°, ואשרו עם ✓." },
      check:function () { return featureBuilt("pattern"); },
      demo:function () {
        var cut = liveFeatures("extrudeCut").slice(-1)[0];
        if (cut) E.authoring.featureSelection = [cut.id];
        return runFeature("pattern", { scope:"feature", mode:"circular", count:4, angle:360, axis:"y", equalSpacing:true });
      } },
    { id:"done", manual:true, target:"#mdParts", prepare:showResult,
      title:{ en:"Change it once, it all follows", he:"משנים פעם אחת, הכול מתעדכן" },
      body:{ en:"Double-click Extrude 1 and make the plate 15mm thick: the holes still go through, and all four follow the first one.",
        he:"לחצו פעמיים על Extrude 1 ושנו את עובי הפלטה ל-15mm: החורים עדיין עוברים, וכל הארבעה עוקבים אחרי הראשון." } },
  ];
}

/* ---- 3. revolve a knob ---------------------------------------------------- */
/* Half the knob's outline, on the right of the vertical axis it spins about. */
var KNOB_PROFILE = [[0,0],[2,0],[2,0.4],[1.4,0.9],[1.4,2.6],[1.8,3.2],[0,3.2]];
function knobSteps() {
  var axis = null;
  return [
    { id:"intro", manual:true,
      title:{ en:"Round parts come from Revolve", he:"חלקים עגולים נוצרים ב-Revolve" },
      body:{ en:"Revolve spins a half profile around an axis — knobs, bottles, shafts, wheels. You will draw half of a 40 mm knob and revolve it 360°.",
        he:"Revolve מסובב חצי פרופיל סביב ציר — ידיות, בקבוקים, צירים וגלגלים. תציירו חצי מידית בקוטר 40 מ\"מ ותסובבו אותה 360°." } },
    { id:"plane", target:{ bind:"mcmd:newsketch" },
      title:{ en:"Sketch on the Front plane", he:"סקיצה על מישור Front" },
      body:{ en:"Click New sketch and choose Front plane. A profile you revolve is drawn on a plane that contains the axis.",
        he:"לחצו New sketch ובחרו Front plane. פרופיל לסיבוב מציירים על מישור שמכיל את הציר." },
      check:function () { var s = lastSketch(); return sketching() && !!s && s.plane === "front"; },
      demo:function () { sketchOnPlane("plane:front", "wall"); } },
    { id:"profile", target:{ bind:"mcmd:wall" },
      title:{ en:"Draw the half profile", he:"ציירו את חצי הפרופיל" },
      body:{ en:"Choose Line (L). Start on the origin, click your way around the outline on the right of the vertical axis — out 20 mm, up, a neck, a 32 mm tall top — come back down the axis and click the first point to close it.",
        he:"בחרו Line (L). התחילו בראשית והתקדמו בלחיצות סביב קו המתאר מימין לציר האנכי — 20 מ\"מ החוצה, למעלה, צוואר, וראש בגובה 32 מ\"מ — חזרו לאורך הציר ולחצו על הנקודה הראשונה כדי לסגור." },
      tip:{ en:"The edge on the axis must be one straight line — it becomes the axis of rotation.", he:"הצלע שעל הציר חייבת להיות קו ישר אחד — היא תהיה ציר הסיבוב." },
      check:function () { return !!closedSketchProfile(); },
      demo:function () { axis = drawPolyline(KNOB_PROFILE).slice(-1)[0]; } },
    { id:"finish", target:{ bind:"mcmd:finishsketch" },
      title:{ en:"Finish the sketch", he:"סיימו את הסקיצה" },
      body:{ en:"Click Finish sketch.", he:"לחצו Finish sketch." },
      check:function () { return !sketching() && sketchesWith(function (s) { return s.plane === "front" && sketchLines(s).length >= 3; }).length > 0; },
      demo:finishSketch },
    { id:"revolve", target:{ bind:"mcmd:revolvefeature" },
      title:{ en:"Revolve 360°", he:"סיבוב של 360°" },
      body:{ en:"Click the line on the vertical axis, then Features › Revolve. Check that Axis is that line and Angle is 360°, then accept with ✓.",
        he:"לחצו על הקו שעל הציר האנכי, ואז Features › Revolve. ודאו ש-Axis הוא הקו הזה ו-Angle הוא 360°, ואשרו עם ✓." },
      check:function () { return featureBuilt("revolve"); },
      demo:function () {
        if (axis) { E.ssel = [axis]; E.sel = axis; }
        return runFeature("revolve", { angle:360 });
      } },
    { id:"done", manual:true, target:"#mdParts", prepare:showResult,
      title:{ en:"Your knob", he:"הידית שלכם" },
      body:{ en:"Edit Revolve 1 and set the angle to 270° to see a cut-away of the profile — then put it back to 360°.",
        he:"ערכו את Revolve 1 וקבעו זווית של 270° כדי לראות חתך של הפרופיל — ואז החזירו ל-360°." } },
  ];
}

/* ---- 4. toolbox: a standard screw ----------------------------------------- */
function screwSteps() {
  return [
    { id:"intro", manual:true,
      title:{ en:"Don't model a screw by hand", he:"לא ממדלים בורג ביד" },
      body:{ en:"Standard hardware comes from the Toolbox: correct to the standard, with its specification attached. You will insert an ISO 4017 M8 × 30 hex screw and check it.",
        he:"חומרה סטנדרטית מגיעה מה-Toolbox: מדויקת לפי התקן, עם המפרט מצורף. תוסיפו בורג משושה ISO 4017 M8 × 30 ותבדקו אותו." } },
    { id:"insert", target:{ bind:"mcmd:stdscrew" },
      title:{ en:"Insert the screw", he:"הוסיפו את הבורג" },
      body:{ en:"Open the Toolbox tab and click Std screw.", he:"פתחו את לשונית Toolbox ולחצו Std screw." },
      check:function () { return standardPartCount("hex-screw") > 0; },
      demo:function () { return runEditorCommand("stdscrew"); } },
    /* Inserting already selects the screw, so this is a reading step. */
    { id:"inspect", target:"#mdParts", manual:true,
      title:{ en:"Read its specification", he:"קראו את המפרט" },
      body:{ en:"Click the screw in the Feature tree or the 3D view. Its properties show the standard, the 1.25 mm pitch and the 6g tolerance class.",
        he:"לחצו על הבורג בעץ התכונות או בתצוגה התלת-ממדית. המאפיינים מציגים את התקן, פסיעה של 1.25 מ\"מ ומחלקת סבולת 6g." },
    },
    { id:"audit", target:{ bind:"mcmd:standards" },
      title:{ en:"Check it against the standard", he:"בדקו מול התקן" },
      body:{ en:"Open the Reference tab and click Standards. The check compares every standard part's dimensions with its standard.",
        he:"פתחו את לשונית Reference ולחצו Standards. הבדיקה משווה את מידות כל חלק סטנדרטי לתקן שלו." },
      check:function () { return !!(E.def && E.def.lastStandardsAudit && E.def.lastStandardsAudit.ok); },
      demo:function () { return runEditorCommand("standards"); } },
    { id:"done", manual:true, target:{ bind:"mcmd:toolboxfastener" }, prepare:showResult,
      title:{ en:"More in the Toolbox", he:"עוד ב-Toolbox" },
      body:{ en:"Fastener adds nuts, washers and other screws by size; Std gear builds an involute gear from its module and tooth count.",
        he:"Fastener מוסיף אומים, דסקיות וברגים נוספים לפי מידה; Std gear בונה גלגל שיניים אינבולוטי לפי מודול ומספר שיניים." } },
  ];
}

export { firstPartSteps, knobSteps, plateSteps, screwSteps };
