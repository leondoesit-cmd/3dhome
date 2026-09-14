import { readI18nSource } from "./helpers/i18n_source.mjs";
/* Regressions found in a QA pass over the new planner surfaces: the wall-draw
   palette, the rebuilt wall inspector, and the walls/openings guide + practice
   tour. Each test pins the user-visible symptom, not the implementation. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { S } from "../js/state.js";
import { wallGeom, wallClearLength } from "../js/geometry.js";
import { captureLock, syncLocks } from "../js/constraint_engine.js";

const css = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");
const i18n = await readI18nSource();
const uiProps = await readFile(new URL("../js/ui_props.js", import.meta.url), "utf8");
const ui = await readFile(new URL("../js/ui.js", import.meta.url), "utf8");
const uiTree = await readFile(new URL("../js/ui_tree.js", import.meta.url), "utf8");

function oneWall() {
  S.interiorDims = true;
  // a 310 cm centreline that reads 300 cm along its faces once both ends are cut
  S.nodes = [{ x: 0, z: 0 }, { x: 310, z: 0 }, { x: 0, z: 200 }, { x: 310, z: 200 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 0, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 1, b: 3, thickness: 10, height: 270 },
  ];
  return S.walls[0];
}

test("the dimension lock records the same length basis the inspector shows", () => {
  const w = oneWall();
  captureLock(w);
  // the read-out used to quote the centreline while the length field above it
  // showed the face length — "Held at 310 cm" under a field reading 300
  assert.equal(w.lockClearL, wallClearLength(w), "the lock holds the face length");
  assert.equal(w.lockL, wallGeom(w).L, "the centreline is still recorded alongside");
  assert.notEqual(
    Math.round(w.lockClearL),
    Math.round(w.lockL),
    "this fixture is only meaningful while the two bases actually differ",
  );
});

test("older plans without a captured face length get one from syncLocks", () => {
  const w = oneWall();
  delete w.lockClearL;
  w.lockL = wallGeom(w).L;
  w.lockAng = 0;
  syncLocks();
  assert.equal(w.lockClearL, wallClearLength(w));
});

test("the lock read-out and the length field quote the same measurement", () => {
  assert.match(uiProps, /lockClearL != null \? w\.lockClearL : wallClearLength\(w\)/);
  assert.match(uiProps, /writeInspectorLen\("w_len", wallClearLength\(w\)\)/);
});

test("the captured face length survives save and undo like the rest of the lock", () => {
  // serializer, history snapshot, and history restore
  assert.match(ui, /lockClearL: fin\(w\.lockClearL\) \? w\.lockClearL : undefined/);
  assert.match(ui, /lockClearL: w\.lockClearL/);
  assert.match(ui, /r\.w\.lockClearL = r\.lockClearL/);
});

test("the plan toolbar is bounded by its pane instead of spilling out of it", () => {
  // Split view gives the 2D pane less than half the window; centring the full
  // tool column put the first tools over the 3D view and pushed the lock and
  // delete buttons off the bottom of the window entirely.
  // a DEFINITE height on the wrapper, or the children's `max-height: 100%`
  // has nothing to resolve against and the column keeps its full size
  assert.match(css, /#plan-tools \{[^}]*\n\s*height: calc\(100% - 20px\)/);
  assert.match(css, /#plan-toolbar \{[^}]*max-height: 100%[^}]*overflow-y: auto/);
  assert.match(css, /#plan-wall-palette \{[^}]*max-height: 100%[^}]*overflow-y: auto/);
});

test("a modal's max-height includes its own padding", () => {
  const modal = css.slice(css.indexOf(".bp-modal {"));
  assert.match(modal.slice(0, 400), /box-sizing: border-box/);
});

test("the confirming action in a modal is visually distinct", () => {
  // ui_tree (create room) and persist (restore a recovered plan) have always
  // asked for this class; nothing defined it, so confirm looked like cancel
  assert.match(css, /^\.btn-primary \{/m, ".btn-primary must exist in the stylesheet");
  assert.match(uiTree, /className = "btn-primary"/);
});

test("guide diagram labels stay left-to-right in Hebrew", () => {
  // "360 · 0°" is length-then-angle; inheriting RTL laid the two number runs
  // out backwards, so Hebrew readers saw the angle first
  assert.match(css, /\.planner-guide-visual text \{[^}]*direction: ltr[^}]*unicode-bidi: isolate/);
});

test("topic and inspector tab labels wrap rather than truncate", () => {
  assert.doesNotMatch(
    css,
    /\.planner-guide-tabs button span \{[^}]*text-overflow: ellipsis/,
    "guide topics must not be ellipsised",
  );
  assert.doesNotMatch(
    css,
    /\.wi-tabs > button span \{[^}]*text-overflow: ellipsis/,
    "'Constraints' must not render as 'Constrai…'",
  );
});

test("the wall palette meets the touch target size the rest of the toolbar does", () => {
  const coarse = css.slice(css.indexOf("@media (pointer: coarse)"));
  assert.match(coarse.slice(0, 500), /\.wd-btn,\s*\.wd-loc-btn \{[^}]*min-height: 44px[^}]*min-width: 44px/);
  // it must sit AFTER the base heights it overrides, or the cascade ignores it
  assert.ok(
    css.indexOf("@media (pointer: coarse)") > css.indexOf(".wd-loc-btn {"),
    "the touch override must come after the base .wd-loc-btn height",
  );
});

test("the palette's icon-only toggles report their state", () => {
  // their only label is a `title`, which touch and screen readers never surface
  assert.match(ui, /data-wall-preset[\s\S]{0,400}?setAttribute\("aria-pressed"/);
  assert.match(ui, /data-wall-from[\s\S]{0,400}?setAttribute\("aria-pressed"/);
});

test("the room naming dialog puts the caret in its name field", () => {
  assert.match(uiTree, /input\.focus\(\);\s*input\.select\(\)/);
});

test("the English tour names the tabs the English inspector actually shows", () => {
  const en = i18n.slice(i18n.indexOf("\n  en: {"));
  const tabName = (key) => en.match(new RegExp(key + ': "([^"]+)"'))[1];
  const dims = tabName("wtab_dims");
  const joints = tabName("wtab_joints");
  assert.equal(dims, "Size");
  assert.equal(joints, "Constraints");
  assert.match(en, new RegExp(`planner_tour_edit_len_b: "On the ${dims} tab`));
  assert.match(en, new RegExp(`planner_tour_edit_ang_tip: "The ${joints} tab`));
});

test("new English planner copy is grammatical and internally consistent", () => {
  const en = i18n.slice(i18n.indexOf("\n  en: {"));
  assert.doesNotMatch(en, /"A intersecting/, "'A intersecting' → 'An intersecting'");
  assert.doesNotMatch(
    en,
    /Which face of this wall's layers thickness/,
    "the wall datum hint was a broken literal translation",
  );
  // one angle convention, and one spelling of the wall datum
  assert.doesNotMatch(en, /0° east/, "the angle convention is stated one way");
  assert.doesNotMatch(
    en,
    /: "Wall center"/,
    "'Wall centre' is the spelling used by the surrounding wall UI",
  );
});

test("both dictionaries define the default floor name", () => {
  assert.equal((i18n.match(/floor_ground_name:/g) || []).length, 2);
});
