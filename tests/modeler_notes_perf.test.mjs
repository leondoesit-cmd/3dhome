/* Invariants for the 3D notes, paint and eraser tools that a unit test cannot
 * reach — they are about how often work happens, not about what it computes.
 *
 * Source assertions rather than behaviour tests, for the same reason
 * tests/compact_editors.test.mjs uses them: the cheapest reliable way to state
 * "this must not happen on every frame" is to check that the call is not
 * written there. Each one below records a defect that shipped.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const md = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
const layers = await readFile(new URL("../js/ui_layers.js", import.meta.url), "utf8");

function body(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, "could not find " + start);
  const to = source.indexOf(end, from);
  assert.ok(to > from, "could not find " + end);
  return source.slice(from, to);
}

test("note cards are built once, not rebuilt on every rendered frame", () => {
  /* syncNotesCards runs from the view's afterRender hook, so anything it
     writes runs at frame rate while the camera moves. Assigning innerHTML
     there re-parsed markup 60 times a second AND destroyed the card's own
     subtree mid-gesture, so its delete button lost hover and any in-flight
     pointer press — a correctness bug wearing a performance costume. */
  const fn = body(md, "function syncNotesCards(", "\nfunction bindNoteCardEvents(");
  assert.doesNotMatch(fn, /card\.innerHTML\s*=/, "card content must not be rebuilt per frame");
  assert.doesNotMatch(fn, /svg\.innerHTML\s*=\s*linesHtml/, "the connectors must not be re-parsed per frame");
  assert.doesNotMatch(fn, /new THREE\./, "and nothing may be allocated per frame");
  // what it should do instead
  assert.match(fn, /setAttrIfChanged\(/, "connector geometry is updated attribute by attribute");
  assert.match(fn, /card\._noteText/, "card text is written only when the note changed");
});

test("the afterRender path allocates nothing", () => {
  /* Both callbacks on that hook — syncNotesCards and syncInstant3dValue — run
     per frame, so a `new` in either is a per-frame allocation. */
  const chip = body(md, "function syncInstant3dValue(", "\nfunction addInstant3dHandles(");
  assert.doesNotMatch(chip, /new THREE\./, "syncInstant3dValue must reuse scratch vectors");
  assert.match(chip, /instantScratch\(\)/);
});

test("erasing a swipe of markup is one undo step, not one per stroke", () => {
  /* eraseMarkupAt runs from a pointermove handler. Committing there meant
     wiping five strokes cost five undo entries — and five presses to undo. */
  const fn = body(md, "function eraseMarkupAt(", "\nfunction pickNoteAction(");
  assert.doesNotMatch(fn, /pushUndo\(/, "the gesture commits, not each hit");
  assert.match(fn, /return true;/, "it reports what it removed so the caller can count");

  const drag = body(md, "function beginMarkupDrag(", "\nfunction eraseMarkupAt(");
  assert.match(drag, /if \(!erased\) pushUndo\(/, "one undo step, before the first removal");
  assert.ok(fn.indexOf("beforeErase();") < fn.indexOf("E.def.markups.splice("), "capture history before mutating the stroke list");
});

test("dragging the paint tool coalesces its rebuilds to one per frame", () => {
  /* docs/plans/MODEL_EDITOR_PERF_PLAN.md forbids uncoalesced rebuild work on
     pointermove. Painting called updatePreview() and refreshParts()
     synchronously for every newly touched face. */
  const fn = body(md, "  var paintedCount = 0;", "\n  paintTarget(hit);");
  assert.match(fn, /requestAnimationFrame\(/, "paint hits are batched into a frame");
  assert.doesNotMatch(
    fn.slice(fn.indexOf("function paintTarget(")),
    /updatePreview\(\);/,
    "paintTarget marks dirty; it does not rebuild inline"
  );
});

test("a click on the model does not mint a raycaster", () => {
  const fn = body(md, "function pickNoteAction(", "\n  if (hit && hit.point)");
  assert.doesNotMatch(fn, /new THREE\./);
  assert.match(fn, /pickScratch\(\)/, "the file's existing lazy-scratch pattern");
});

test("each planner event is listened for once", () => {
  /* Two handlers wanted the same two events and were registered separately,
     so every tool change ran four listeners and twice the DOM queries. */
  for (const event of ["planner-tool", "planner-place"]) {
    const pattern = new RegExp('addEventListener\\("' + event + '"', "g");
    const found = (layers.match(pattern) || []).length;
    assert.equal(found, 1, event + " must have exactly one registration, found " + found);
  }
  assert.match(layers, /function onPlannerToolEvent\(/, "with the order stated rather than incidental");
});
