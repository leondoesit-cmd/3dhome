import { modelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  beginTouchPrecision,
  directionalSegmentDistances,
  formatTouchDistance,
  modelerPrecisionTrialAllowed,
  modelerTouchPrecisionKind,
  planTouchPrecisionKind,
  touchLensCenter,
  touchPrecisionPoint,
} from "../js/touch_precision.js";

test("precision policy: navigation stays direct without a loupe", () => {
  assert.equal(planTouchPrecisionKind("select", null), null);
  assert.equal(planTouchPrecisionKind("erase", null), null);
  assert.equal(planTouchPrecisionKind("walloffset", null), null);
  // The free 3D view: a one-finger drag is an orbit, so picking stays direct.
  assert.equal(modelerTouchPrecisionKind("select", "3d", false), null);
  assert.equal(modelerTouchPrecisionKind("select", "2d", false), null);
});

test("precision policy: picking inside a live sketch gets the loupe", () => {
  /* A sketch pick aims at a 2px vertex, an arc centre under its own radius
     leader, or the Origin, and the fingertip covering it is ~44px wide. Unlike
     a mis-pick in the 3D view this one is silent: the dimension attaches to the
     wrong entity instead of failing. */
  ["select", "dim", "trim", "extend", "offset", "sketchfillet"].forEach((tool) => {
    assert.equal(modelerTouchPrecisionKind(tool, "2d", true), "lens", tool);
  });
  // A sketch projected onto a face inside the 3D view counts as live too.
  assert.equal(modelerTouchPrecisionKind("select", "3d", true), "lens");
  // Navigation-only verbs stay direct even with a sketch open.
  assert.equal(modelerTouchPrecisionKind("pan", "2d", true), null);
});

test("precision policy: experimental modes stay on creation, picking keeps the loupe", () => {
  /* rough/portal replace a tap with place-lift-refine-commit. That is worth it
     when the tap commits a coordinate, and intolerable when it is a plain
     selection — so a pick carrying the loupe must not also inherit them. The
     settings card states this promise to the user; this is the promise. */
  ["scirc", "srect", "sarc", "wall", "poly"].forEach((tool) => {
    assert.equal(modelerPrecisionTrialAllowed(tool), true, tool);
  });
  ["select", "dim", "trim", "extend", "offset", "sketchfillet"].forEach((tool) => {
    assert.equal(modelerPrecisionTrialAllowed(tool), false, tool);
    // ...but they still get the visual loupe inside a sketch.
    assert.equal(modelerTouchPrecisionKind(tool, "2d", true), "lens", tool);
  });
});

test("precision policy: all plan creation tools use a visual-only loupe", () => {
  ["wall", "arcwall", "rect", "slabvoid", "roomDivider", "point", "mepNode", "mepRoute",
    "door", "window", "passage"].forEach((tool) => {
    assert.equal(planTouchPrecisionKind(tool, null), "lens", tool);
  });
  assert.equal(planTouchPrecisionKind("select", "chair"), "lens");
});

test("precision policy: all model-editor creation tools use a visual-only loupe", () => {
  ["wall", "poly", "cut", "rev", "rect", "circle", "sph", "cutc",
    "srect", "scirc", "spoly", "sslot", "sell", "sarc"].forEach((tool) => {
    assert.equal(modelerTouchPrecisionKind(tool, "2d"), "lens", tool);
  });
  assert.equal(modelerTouchPrecisionKind("dim", "drawing"), "lens");
});

test("touch precision never changes the authored coordinate", () => {
  const event = { pointerType: "touch", pointerId: 7, width: 28, height: 30 };
  const bounds = { width: 390, height: 700 };
  const contact = beginTouchPrecision(event, 200, 300, bounds, "lens");
  assert.ok(contact);
  assert.deepEqual({ x: contact.vectorX, y: contact.vectorY }, { x: 0, y: 0 });
  assert.deepEqual(touchPrecisionPoint(contact, 235, 340), { x: 235, y: 340 });
  assert.equal(beginTouchPrecision({ ...event, pointerType: "pen" }, 10, 10, bounds, "lens"), null);
});

test("loupe stays opposite the dominant hand and mirrors for left-handed use", () => {
  const contact = { ox:200, oy:220, width:390, height:700 };
  const right = touchLensCenter(contact, { handedness:"right", distances:{} });
  const left = touchLensCenter(contact, { handedness:"left", distances:{} });
  assert.ok(right.x < contact.ox, "right-hand loupe should be left of the thumb");
  assert.ok(left.x > contact.ox, "left-hand loupe should be right of the thumb");
  assert.equal(right.x + left.x, contact.ox * 2);
  assert.equal(right.y, left.y);
});

test("lens distance formatting stays compact and explicit", () => {
  assert.equal(formatTouchDistance(null, "cm"), "∞");
  assert.equal(formatTouchDistance(42.4, "cm"), "42 cm");
  assert.equal(formatTouchDistance(999.6, "cm"), "1000 cm");
  assert.equal(formatTouchDistance(1250, "cm"), "12.5 m");
});

test("four screen rays find the nearest visible object edge", () => {
  const segments = [
    { a: { x: -100, y: -80 }, b: { x: -100, y: 80 } },
    { a: { x: 100, y: -80 }, b: { x: 100, y: 80 } },
    { a: { x: -120, y: -50 }, b: { x: 120, y: -50 } },
    { a: { x: -120, y: 50 }, b: { x: 120, y: 50 } },
  ];
  assert.deepEqual(directionalSegmentDistances(0, 0, segments, 2, 5), {
    up: 25, down: 25, left: 50, right: 50,
  });
});

test("legacy lifted-coordinate code is absent", async () => {
  const [precision, walls, interaction, modeler] = await Promise.all([
    readFile(new URL("../js/touch_precision.js", import.meta.url), "utf8"),
    readFile(new URL("../js/wall_draw.js", import.meta.url), "utf8"),
    readFile(new URL("../js/interaction.js", import.meta.url), "utf8"),
    modelerSource(),
  ]);
  assert.doesNotMatch(precision, /return "lift"|adaptiveTouchVector|TOUCH_PRECISION_MIN_PX/);
  assert.doesNotMatch(walls, /touchEffectiveOffsetY|TOUCH_DRAW_OFFSET_PX/);
  assert.doesNotMatch(interaction, /touchEffectiveOffsetY|TOUCH_DRAW_OFFSET_PX/);
  assert.doesNotMatch(modeler, /var lifted = Math\.hypot\(dx, dy\)|stable adaptive offset while authoring/);
});

test("both canvases render the shared lens and modeler clears it on cancel", async () => {
  const [plan, modeler] = await Promise.all([
    readFile(new URL("../js/plan2d.js", import.meta.url), "utf8"),
    modelerSource(),
  ]);
  assert.match(plan, /drawTouchPrecisionLens\(pc, plan, tc,/);
  assert.match(plan, /distances: touchLensDistances\(tc\)/);
  assert.match(modeler, /drawTouchPrecisionLens\(c, E\.cv, tc,/);
  assert.match(modeler, /distances: modelerTouchDistances\(tc\)/);
  assert.match(modeler, /directionalSegmentDistances\(tc\.ox, tc\.oy, segments, E\.scl, 6\)/);
  assert.match(modeler, /addEventListener\("pointercancel"/);
  assert.match(modeler, /E\.touchPrecision = null;/);
});
