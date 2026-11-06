import { stylesSource } from "./helpers/styles_source.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import { readI18nSource } from "./helpers/i18n_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripComments } from "./source.mjs";
import { S } from "../js/state.js";
import { detectRooms, roomsTopologyKey } from "../js/geometry.js";
import {
  dropPoint,
  wx,
  wz,
  sx,
  sz,
  toBasePx,
  rotatePx,
  isOnScreen,
  centerOn,
  ensurePointsVisible,
  niceScaleCm,
} from "../js/plan_view.js";
import { saveUnitSettings, resetAllUnitSettings } from "../js/unit_settings.js";

const planSource = await readFile(new URL("../js/plan2d.js", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
const elevSource = await readFile(new URL("../js/elevation.js", import.meta.url), "utf8");
const interactionSource = moduleSource("js/interaction.js");
const cssSource = stylesSource();
const i18nSource = await readI18nSource();

function resetView() {
  S.nodes = [];
  S.walls = [];
  S.items = [];
  S.openings = [];
  S.planRot = 0;
  S.SC = 1;
  S.CW = 400;
  S.CH = 300;
  S.OX = 40;
  S.OY = 20;
}

test("a hidden pane does not wipe the live canvas size", () => {
  const sizing = stripComments(planSource).slice(planSource.indexOf("export function sizeCanvas"));
  assert.match(sizing, /if \(!\(W > 0\) \|\| !\(H > 0\)\) return/);
  // the guard is only worth anything ahead of the write it protects
  assert.ok(sizing.indexOf("(H > 0)) return") < sizing.indexOf("S.CW = W"),
    "a 0x0 pane returns before the live size is overwritten");
});

test("render2D refuses to grid-loop when the view transform is unusable", () => {
  assert.match(planSource, /function planViewReady\(\)/);
  assert.match(planSource, /if \(!planViewReady\(\)/);
  assert.match(planSource, /gridSpan \/ step > 240/);
});

test("site underlay is clipped in screen space before the plan rotation", () => {
  const drawing = stripComments(planSource).slice(planSource.indexOf("export function render2D"));
  assert.ok(drawing.indexOf("pc.clip()") < drawing.indexOf("pushPlan()"),
    "the clip is taken in screen space, before the plan rotation");
  const underlay = planSource.slice(
    planSource.indexOf("function drawSiteUnderlay"),
    planSource.indexOf("export function render2D"),
  );
  assert.doesNotMatch(underlay, /pc\.clip\(\)/);
});

test("constraint labels record screen-space hit boxes so rotation still picks", () => {
  assert.match(planSource, /var scr = rotatePx\(sx\(wxc\), sz\(wzc\)\)/);
  assert.match(planSource, /conHits\.push\(\{ con: conForLabel, x: scr\.x, y: scr\.y, w: wpx \}\)/);
});

test("a malformed constraint cannot blank the whole plan", () => {
  assert.match(planSource, /list\.forEach\(function \(c\) \{\s*try \{/);
  assert.match(planSource, /\} catch \(err\) \{/);
});

test("arc walls are traced, not chorded, in constraint and warning overlays", () => {
  assert.match(planSource, /traceWallCentre\(w\);\s*pc\.stroke\(\);/);
});

test("resize keeps the current pan instead of snapping to the model centre", () => {
  const resize = mainSource.slice(
    mainSource.indexOf("const resizeAll"),
    mainSource.indexOf("window.addEventListener(\"resize\""),
  );
  const sync = mainSource.slice(
    mainSource.indexOf("function syncSurfaces()"),
    mainSource.indexOf("function setSplit("),
  );
  assert.doesNotMatch(resize, /centerContent\(\)/);
  assert.doesNotMatch(sync, /centerContent\(\)/);
  assert.match(resize, /sizeCanvas\(\)/);
  assert.match(sync, /sizeCanvas\(\)/);
});

test("cabinets with a spec draw their real plan symbol, not a generic front stroke", () => {
  assert.match(planSource, /var glyphFn = it\.cab \? GLYPH\.cabsys : GLYPH\[it\.type\]/);
  assert.match(planSource, /it\.type !== "rug" && it\.type !== "cabsys" && !it\.cab/);
});

test("dropPoint stays finite when the canvas transform is unusable", () => {
  resetView();
  S.SC = 0;
  S.CW = 0;
  S.CH = 0;
  assert.deepEqual(dropPoint(), { x: 0, z: 0 });

  S.nodes = [
    { x: 10, z: 20 },
    { x: 90, z: 80 },
    { x: NaN, z: 1 },
  ];
  const p = dropPoint();
  assert.equal(p.x, 50);
  assert.equal(p.z, 50);
});

test("dropPoint uses the visible canvas centre when the view is live", () => {
  resetView();
  const p = dropPoint();
  assert.equal(p.x, wx(S.CW / 2, S.CH / 2));
  assert.equal(p.z, wz(S.CW / 2, S.CH / 2));
});

test("wx/wz invert the plan rotation around the canvas centre", () => {
  resetView();
  assert.equal(wx(40, 20), 0);
  assert.equal(wz(40, 20), 0);
  assert.equal(wx(140, 120), 100);
  assert.equal(wz(140, 120), 100);
  assert.equal(sx(100), 140);
  assert.equal(sz(100), 120);

  S.planRot = 90;
  const screen = { x: S.CW / 2, y: 0 };
  const base = toBasePx(screen.x, screen.y);
  assert.ok(Math.abs(wx(screen.x, screen.y) - (base.x - S.OX) / S.SC) < 1e-9);
  assert.ok(Math.abs(wz(screen.x, screen.y) - (base.y - S.OY) / S.SC) < 1e-9);
  const roundTrip = toBasePx(rotatePx(200, 50).x, rotatePx(200, 50).y);
  assert.ok(Math.abs(roundTrip.x - 200) < 1e-9);
  assert.ok(Math.abs(roundTrip.y - 50) < 1e-9);
});

test("centerOn and isOnScreen agree about the canvas middle", () => {
  resetView();
  centerOn(100, 80);
  assert.equal(wx(S.CW / 2, S.CH / 2), 100);
  assert.equal(wz(S.CW / 2, S.CH / 2), 80);
  assert.equal(isOnScreen(100, 80), true);
  assert.equal(isOnScreen(10000, 80), false);
});

test("the scale bar picks a length that stays readable at extreme zoom", (t) => {
  // Units auto-detect from the locale and timezone (an en-US/UTC CI runner
  // picks feet); this checks the metric ladder, so pin it.
  saveUnitSettings({ preset: "metric_cm" });
  t.after(resetAllUnitSettings);
  assert.equal(niceScaleCm(0), 5);
  assert.equal(niceScaleCm(NaN), 5);
  const zoomedIn = niceScaleCm(80);
  assert.ok(zoomedIn * 80 <= 200, "zoomed-in bar must not overflow the pane");
  const zoomedOut = niceScaleCm(0.01);
  assert.ok(zoomedOut * 0.01 >= 40, "zoomed-out bar must remain visible");
  const mid = niceScaleCm(1);
  assert.ok(mid * 1 >= 55 && mid * 1 <= 170);
});

test("isOnScreen tests the pixel after plan rotation, not the unrotated AABB", () => {
  resetView();
  S.CW = 400;
  S.CH = 300;
  S.OX = 200;
  S.OY = 150;
  S.SC = 1;
  S.planRot = 0;
  assert.equal(isOnScreen(120, 0), true, "inside the unrotated pane");
  S.planRot = 90;
  assert.equal(isOnScreen(120, 0), false, "rotates off the bottom edge");
  S.planRot = 0;
  assert.equal(isOnScreen(0, 100), false, "below the unrotated pane");
  S.planRot = 90;
  assert.equal(isOnScreen(0, 100), true, "rotates onto the visible face");
  const scr = rotatePx(sx(0), sz(100));
  assert.ok(scr.x > 60 && scr.x < S.CW - 60);
  assert.ok(scr.y > 60 && scr.y < S.CH - 60);
});

test("ensurePointsVisible frames an 884 cm typed run without changing heading", () => {
  resetView();
  S.SC = 1;
  S.CW = 400;
  S.CH = 300;
  S.OX = 40;
  S.OY = 20;
  assert.equal(isOnScreen(884, 0, 56), false);
  assert.equal(ensurePointsVisible([{ x: 0, z: 0 }, { x: 884, z: 0 }], 56), true);
  assert.equal(isOnScreen(0, 0, 40), true);
  assert.equal(isOnScreen(884, 0, 40), true);
  assert.ok(S.SC < 1, "must zoom out to keep both ends on screen");
});

function closedRoom() {
  S.nodes = [
    { x: 0, z: 0 },
    { x: 400, z: 0 },
    { x: 400, z: 300 },
    { x: 0, z: 300 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.items = [];
  S.openings = [];
  S.roomMeta = {};
}

test("detectRooms reuses the same list when topology is unchanged", () => {
  closedRoom();
  const a = detectRooms();
  const b = detectRooms();
  assert.ok(a.length >= 1);
  assert.strictEqual(a, b);
  assert.equal(roomsTopologyKey(), roomsTopologyKey());
  S.walls[0].height = 280;
  const c = detectRooms();
  assert.notStrictEqual(a, c);
  assert.ok(c.length >= 1);
});

test("detectRooms survives a missing roomMeta map", () => {
  closedRoom();
  S.roomMeta = undefined;
  const rooms = detectRooms();
  assert.ok(Array.isArray(rooms));
  assert.ok(rooms.length >= 1);
  S.roomMeta = {};
});

test("overlapping constraint labels are nudged or hidden", () => {
  assert.match(planSource, /function conLabelOverlaps/);
  assert.match(planSource, /RELATION_CONS/);
  assert.match(planSource, /if \(!placed && relation && !conHot\)/);
  assert.match(planSource, /conLabelOcc = \[\]/);
});

test("the fixed-constraint pin tag stays square after plan rotation", () => {
  assert.match(planSource, /pc\.translate\(fx, fy\); pc\.rotate\(-aFix\)/);
  assert.match(planSource, /conHits\.push\(\{ con: c, x: corner\.x \+ 11, y: corner\.y - 11/);
});

test("room fills blit from a topology-keyed offscreen layer", () => {
  assert.match(planSource, /function drawCachedRooms\(\)/);
  assert.match(planSource, /roomsTopologyKey\(\)/);
  assert.match(planSource, /pc\.drawImage\(roomLayer\.canvas, 0, 0, S\.CW, S\.CH\)/);
});

test("elevation views refuse wall drawing and edit items, openings, and points", () => {
  assert.match(i18nSource, /tool_plan_only:/);
  assert.match(cssSource, /#plan-toolbar \.tool:disabled/);
  assert.match(cssSource, /\.elev-blocked/);
  assert.match(interactionSource, /flash\(t\("tool_plan_only"\)\)/);
  assert.match(interactionSource, /syncElevationTools\(\)/);
  assert.match(interactionSource, /S\.action = "itemElev"/);
  assert.match(interactionSource, /S\.action = "openingElev"/);
  assert.match(interactionSource, /elevNudgeOpening/);
  assert.match(elevSource, /throughOpenings/);
  assert.match(elevSource, /export function elevWallAt/);
  assert.match(elevSource, /export function elevDragItemTo/);
  assert.match(elevSource, /export function elevDragOpeningTo/);
  assert.match(planSource, /plan:view-axis/);
});
