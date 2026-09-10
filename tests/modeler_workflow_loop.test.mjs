/* The loop around a pick: staying in the model instead of being thrown into a
   flat 2D view, and answering a question without the page freezing behind a
   modal.
 *
 * Three things are pinned here. Select must not open the sketch sheet over the
 * 3D viewport — it did, for every tool change, which also silently re-mapped
 * the keyboard because the Paint and Note chords are gated on that same flag.
 * Editing a sketch must enter it the way creating one does. And no path may
 * reach window.prompt(), which freezes the canvas holding the very geometry
 * the number is being typed for. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
/* The editor's [he, en] table lives in js/modeler_strings.js. */
const strings = await readFile(new URL("../js/modeler_strings.js", import.meta.url), "utf8");
const instant3d = await readFile(new URL("../js/modeler_instant3d.js", import.meta.url), "utf8");

function body(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const braced = source.indexOf("\n}", start);
  return source.slice(start, braced + 2);
}

test("only a tool that draws opens the sketch sheet over the model", () => {
  assert.match(source, /var MODEL_PLANE_TOOLS = SKETCH_TOOLS\.concat/);
  const setTool = body("setTool");
  // The old rule armed the overlay for ANY tool change in 3D, Select included.
  assert.doesNotMatch(setTool, /if \(E\.mode === "3d" && !keepPlaneState\) E\.modelPlaneActive = true;/);
  assert.match(setTool, /if \(E\.mode === "3d" && !keepPlaneState && opensSketchPlane\) E\.modelPlaneActive = true/);
  // The same predicate gates the camera work, or Select would still fit-sketch.
  assert.match(setTool, /openingModelPlane = E\.mode === "3d" && !E\.modelPlaneActive && !keepPlaneState && opensSketchPlane/);
  // Select is not in the list; Paint and Note return before reaching it.
  assert.ok(!/"select"/.test(source.slice(source.indexOf("var MODEL_PLANE_TOOLS"), source.indexOf("var MODEL_PLANE_TOOLS") + 260)));
  assert.match(setTool, /if \(id === "paint" \|\| id === "note"\)[\s\S]{0,200}?E\.modelPlaneActive = false/);
  // It arms but never disarms: Select inside an open sketch stays in it.
  assert.doesNotMatch(setTool, /opensSketchPlane\) E\.modelPlaneActive = false/);
});

test("sketch tools that edit refuse an empty new sketch instead of opening one", () => {
  assert.match(source, /var SKETCH_DRAW_TOOLS = \["wall", "srect", "scirc", "sarc", "sslot", "spoly", "sell"\]/);
  const setTool = body("setTool");
  assert.match(setTool, /if\(!SKETCH_DRAW_TOOLS\.includes\(id\)\) \{ flash\(t\("needSketchForTool"\)\); return; \}/);
  assert.match(strings, /needSketchForTool: \["[^"]+", "[^"]+"\]/);
});

test("editing a sketch enters it the way creating one does", () => {
  const edit = body("editSketchFromHistory");
  // No unconditional trapdoor into flat 2D.
  assert.doesNotMatch(edit, /^\s*setMode\("2d"\);setCommandTab/m);
  assert.match(edit, /var stayIn3D = E\.mode === "3d"/);
  assert.match(edit, /if\(stayIn3D\)\{E\.modelPlaneActive=true;syncModelPlane\(\);\}else setMode\("2d"\)/);
  /* Finish and Escape both already called restoreSketchCameraPose(); this path
     never captured, so there was nothing for them to put back. */
  assert.match(edit, /captureSketchCameraPose\(\)/);
  assert.match(edit, /orientModelToView\(true\)/);
  // A sketch on a face snaps square whatever the preference says, as create does.
  assert.match(edit, /stayIn3D && \(E\.sketchNormalTo \|\| onFace\)/);
  assert.match(body("chooseSketchReference"), /stayIn3D && \(E\.sketchNormalTo \|\| topology\)/);
});

test("no editor path uses a blocking browser question", () => {
  /* Eleven of these froze the page: two on the sketch canvas, and chains of
     two and three across the pattern, shell, loft and sheet-metal ops. */
  const executable = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(executable, /\b(?:prompt|confirm)\s*\(/);
  for (const fn of ["cornerRoundForm", "segmentLengthForm"]) assert.match(source, new RegExp(`function ${fn}\\(`));
  // Each former chain is now one form with one field per number.
  for (const [action, fields] of [
    ["patlin", ["count", "stepX", "stepY", "stepZ"]],
    ["patcirc", ["count", "angle"]],
    ["quickshell", ["thickness"]],
    ["quickloft", ["scale", "offsetU", "offsetV"]],
    ["sheetmetal", ["thickness"]],
    ["sheetflange", ["length", "angle"]],
  ]) {
    const at = source.indexOf(`action: "${action}"`);
    assert.ok(at > 0, `${action} form not found`);
    const form = source.slice(at, at + 1400);
    for (const key of fields) assert.match(form, new RegExp(`key: "${key}"`), `${action} is missing ${key}`);
  }
  // A step typed as "20,0,0" was a parsing puzzle, not an input.
  assert.doesNotMatch(source, /split\(","\)\.map\(parseFloat\)/);
  // The forms that change the document still go through undo.
  for (const fn of ["cornerRoundForm", "segmentLengthForm"]) assert.match(body(fn), /pushUndo\(/);
});

test("a mate is built from picked faces or not at all", () => {
  /* The one place the editor stated a guess and then acted on it: with no
     picks it mated one component's +X bounding-box face to the other's -X,
     printed "using bounding boxes" in the reference rows, and wrote a real
     history node from an envelope. */
  assert.doesNotMatch(source, /mateUsingBounds/);
  assert.doesNotMatch(source, /function mateFallbackRefs/);
  const add = body("addTopologyMate");
  assert.match(add, /if \(!picked\) \{ flash\(t\("mateNeedTwoFaces"\)\); return false; \}/);
  assert.doesNotMatch(add, /fallback/);
  // Every mate type is unavailable until two faces on two components exist.
  assert.match(body("mateTypeFits"), /if \(!picked\) return \{ ok: false, reason: t\("mateNeedTwoFaces"\) \}/);
  // And the PropertyManager refuses rather than offering a live Apply.
  const pm = body("openMatePropertyManager");
  assert.match(pm, /if \(applyButton && !picked\)[\s\S]{0,140}?applyButton\.disabled = true/);
  assert.match(pm, /t\("matePmPickFace"\)/);

  /* The component-level align mates are NOT part of this: "Align X" is a
     statement about the components, so reading their pair is honest there. */
  assert.match(body("addMate"), /ungroundedComponentPair\(\)/);
});

test("a drag shows its numbers before a key is pressed", () => {
  const hud = body("dynDrawHud");
  // The gate was E.dynInput, which only the first keystroke creates.
  assert.doesNotMatch(hud, /if \(!fields \|\| !E\.dynInput/);
  assert.match(hud, /if \(!fields\) return;/);
  assert.match(hud, /var input = E\.dynInput && E\.dynInput\.tool === E\.tool \? E\.dynInput : null/);
  // Grey is measured, white is typed — the distinction already existed.
  assert.match(hud, /b\.typed \|\| b\.on \? "#fff" : "rgba\(255,255,255,\.62\)"/);
  // And it still says nothing when no drag is live: dynFields() gates on the anchor.
  assert.match(body("dynFields"), /DYN_TOOLS\[E\.tool\] && dynAnchor\(\)/);
});

test("a depth handle dragged through zero flips instead of clamping", () => {
  assert.match(instant3d, /function flipDepth/);
  assert.match(instant3d, /params\.direction = params\.direction === "reverse" \? "forward" : "reverse"/);
  assert.match(instant3d, /return flipDepth\(params, num\(params\.depth, 10\) \+ along\)/);
  /* Only the depth types, which have a direction to flip. A negative fillet
     radius or shell thickness is not a direction, and there the clamp is the
     honest answer — those keep it. */
  for (const clamped of [/params\.radius = Math\.max\(1e-6/, /params\.distance = Math\.max\(1e-6/, /params\.thickness = Math\.max\(1e-6/])
    assert.match(instant3d, clamped);
});

test("finishing a sketch offers rather than assumes, and is never refused", () => {
  const finish = body("finishSketchWorkflow");
  // No path returns early over the solve status any more.
  assert.doesNotMatch(finish, /resolveConflictsFirst/);
  assert.doesNotMatch(finish, /status==="conflicting"\|\|run\.status==="over-constrained"/);
  /* The two states are told apart: over-constrained solved fine and merely
     carries a redundant dimension; conflicting did not converge. */
  assert.match(finish, /if\(run\.status==="conflicting"\)/);
  assert.match(finish, /else if\(run\.status==="over-constrained"\)/);
  assert.match(strings, /sketchConflictWarn: \["[^"]+", "[^"]+"\]/);
  assert.match(strings, /sketchRedundantWarn: \["[^"]+", "[^"]+"\]/);
  // And it ends by offering the four features, not by opening one.
  assert.match(finish, /offerProfileFeatures\(\)/);
  const offer = body("offerProfileFeatures");
  assert.match(offer, /featuresForClosedProfile\(!!closedSketchProfile\(\)\)/);
  assert.match(offer, /index \? "" : "btn-accent"/);
  // Enter takes the leading offer; Escape drops it.
  assert.match(source, /e\.key === "Enter" && E\.profileOffer && E\.profileOffer\.length && !editingField/);
  assert.match(source, /hidePickCycle\(\);\s*dismissProfileOffer\(\);/);
});

test("a handle release updates the ghost; only Enter or Apply commits", () => {
  /* Already true, and pinned so it stays true: creating history on every
     handle release is how a model fills with junk nobody meant to make. */
  const drag = body("beginInstant3dDrag");
  const up = drag.slice(drag.indexOf("function up()"));
  assert.doesNotMatch(up, /pushUndo|refreshAll\(\)|createFeatureDefinition/);
  assert.match(up, /removeEventListener\("pointermove", move\)/);
  // A NEW feature moves the preview; an existing one writes its own params.
  const sync = body("syncFeatureFormValue");
  assert.match(sync, /if \(authoring\.preview\) queueNewFeaturePreview/);
  assert.match(sync, /else if \(authoring\.feature\) \{ syncProjectionFromFeature/);
});

test("the areas a feature will act on are drawn, and can be clicked out of it", () => {
  const hatch = body("drawFeatureAreaHatch");
  // UI over the set the solver already uses, never a second opinion about it.
  assert.match(hatch, /var areas = sketchFeatureAreas\(\)/);
  assert.match(hatch, /c\.clip\("evenodd"\)/, "a ring must read as a ring, not a disc");
  assert.match(source, /drawFeatureAreaHatch\(c\)/);
  /* The hatch draws every frame, so the area list is memoised on the same
     fingerprint as the analyses it composes — the two of those were already
     cached, but rebuilding on top of them per frame is not free. */
  assert.match(body("sketchFeatureAreas"), /featureAreaMemo\.sketch === sketch && featureAreaMemo\.key === areaKey/);

  // Inclusion stays expressed as the entity selection the solver reads.
  const toggle = body("toggleFeatureArea");
  assert.match(toggle, /area\.sourceEntityIds/);
  assert.match(toggle, /E\.sselAuto = false/, "a click is a selection the user made");
  // Holes are not part of their own area.
  assert.match(body("featureAreaAt"), /inHole/);
  // A stationary empty click is recoverable as a region pick, not a zero marquee.
  assert.match(body("finishBoxSelect"), /toggleFeatureArea\(featureAreaAt\(at\.u, at\.v\)\)/);
});

test("Measure answers while the pointer moves, and a finish amount repeats", () => {
  const live = body("liveMeasureReadout");
  assert.match(live, /E\.measure\.mode !== "points" \|\| !E\.hoverPoint/);
  // Faces mode needs two normals, so it stays silent until both are picked.
  assert.match(live, /if \(E\.measure\.picks\.length >= 2\) return null/);
  assert.match(source, /var live = liveMeasureReadout\(\)/);
  assert.match(source, /E\.hoverPoint = found && found\.pickPoint/);

  // Repeat-last seeds the next fillet from the last one that was applied.
  assert.match(source, /var REPEATABLE_AMOUNT = \{ fillet: "radius", chamfer: "distance", shell: "thickness" \}/);
  assert.match(body("rememberFinishAmount"), /E\.lastFinishAmount\[type\] = Number\(params\[key\]\)/);
  assert.match(source, /if\(REPEATABLE_AMOUNT\[type\] && fin\(E\.lastFinishAmount && E\.lastFinishAmount\[type\]\)\)/);
  // Remembered only on a successful apply, never on a refused one.
  assert.match(source, /if\(ok\)\{[\s\S]{0,600}?rememberFinishAmount\(type,params\)/);
});
