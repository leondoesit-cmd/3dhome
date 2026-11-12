import { stylesSource } from "./helpers/styles_source.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { S } from "../js/state.js";
import { ensureWallTypes } from "../js/wall_types.js";
import { wallOffset, wallNodeGeom } from "../js/geometry.js";
import {
  applyWallDrawDefaults,
  setWallDrawPreset,
  setWallDrawFrom,
  resolveWallDrawDefaults,
  drawFaceBack,
  previewCentreline,
  throughCrossings,
  joinProposal,
  offsetGhost,
  offsetSideFromCursor,
  paintWallWithDefaults,
  reverseWallStyle,
  extendToHit,
  applyDrawDirLock,
  resetDrawDirLock,
} from "../js/wall_draw.js";

function resetPlan() {
  S.nodes = [];
  S.walls = [];
  S.openings = [];
  S.items = [];
  S.wallTypes = [];
  S.tool = "wall";
  S.drawFrom = null;
  S.drawWalls = [];
  S.wallDrawDefaults = {
    typeId: "generic", kind: "normal", datum: "center", loc: "center",
    dimSide: 0, from: "center", phase: "new", offsetDist: 120,
  };
  ensureWallTypes(S);
}

test("exterior preset hangs new walls on the outer face", () => {
  resetPlan();
  setWallDrawPreset("exterior");
  const d = resolveWallDrawDefaults();
  assert.equal(d.typeId, "exterior");
  assert.equal(d.loc, "face");
  assert.equal(d.datum, "exterior");
  assert.equal(d.dimSide, -1);
  assert.ok(d.thickness > 20);

  const wall = applyWallDrawDefaults({ id: 1, a: 0, b: 1 });
  assert.equal(wall.loc, "face");
  assert.equal(wall.dimSide, -1);
  assert.equal(wall.wallTypeId, "exterior");
});

test("interior preset hangs new walls on the inner face", () => {
  resetPlan();
  setWallDrawPreset("interior");
  const wall = applyWallDrawDefaults({ id: 1, a: 0, b: 1 });
  assert.equal(wall.loc, "face");
  assert.equal(wall.dimSide, 1);
  assert.equal(wall.wallTypeId, "interior");
  assert.equal(wall.datum, "interior");
});

test("generic walls stay on the centreline", () => {
  resetPlan();
  setWallDrawPreset("generic");
  const wall = applyWallDrawDefaults({ id: 1, a: 0, b: 1, thickness: 10 });
  assert.equal(wall.loc, "center");
  assert.equal(drawFaceBack(), (wall.thickness || 10) / 2);
});

test("face-located drawing does not back the jamb snap off the location line", () => {
  resetPlan();
  setWallDrawPreset("exterior");
  S.tool = "wall";
  assert.equal(drawFaceBack(), 0);
});

test("a clockwise rectangle of face-located exterior walls grows thickness inward", () => {
  resetPlan();
  setWallDrawPreset("exterior");
  S.nodes = [
    { x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 },
  ];
  const wall = applyWallDrawDefaults({ id: 1, a: 0, b: 1, height: 270 });
  S.walls = [wall];
  const off = wallOffset(wall);
  const g = wallNodeGeom(wall);
  // +1 normal of +x is +z; dimSide -1 puts the centreline at +z (into the room)
  assert.ok(off > 0);
  const cx = (g.a.x + g.b.x) / 2 + (-g.uz) * off;
  const cz = (g.a.z + g.b.z) / 2 + g.ux * off;
  assert.equal(Math.round(cx), 200);
  assert.ok(cz > 0 && cz < 20);
});

test("draw-from strip can re-hang the same type on the centreline", () => {
  resetPlan();
  setWallDrawPreset("exterior");
  setWallDrawFrom("center");
  const wall = applyWallDrawDefaults({ id: 1, a: 0, b: 1 });
  assert.equal(wall.loc, "center");
});

test("preview centreline is offset from the location line the user is drawing", () => {
  resetPlan();
  setWallDrawPreset("exterior");
  const spec = resolveWallDrawDefaults();
  const cl = previewCentreline(0, 0, 200, 0, spec);
  assert.ok(cl.a.z > 0);
  assert.equal(Math.round(cl.a.x), 0);
  assert.equal(Math.round(cl.L), 200);
});

test("through-draw reports proper crossings far-to-near", () => {
  resetPlan();
  S.nodes = [
    { x: 0, z: 0 }, { x: 400, z: 0 },
    { x: 100, z: -50 }, { x: 100, z: 50 },
    { x: 300, z: -50 }, { x: 300, z: 50 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 3, a: 4, b: 5, thickness: 10, height: 270 },
  ];
  const hits = throughCrossings(S.walls[0]);
  assert.equal(hits.length, 2);
  assert.ok(hits[0].alongMade > hits[1].alongMade);
  assert.equal(hits[0].hostId, 3);
  assert.equal(hits[1].hostId, 2);
});

test("join proposal accepts collinear walls that share a node", () => {
  resetPlan();
  S.nodes = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 250, z: 0 }];
  const a = { id: 1, a: 0, b: 1, thickness: 10 };
  const b = { id: 2, a: 1, b: 2, thickness: 10 };
  S.walls = [a, b];
  const prop = joinProposal(a, b);
  assert.ok(prop);
  assert.equal(prop.shared, 1);
  assert.equal(prop.farKeep, 0);
  assert.equal(prop.farDrop, 2);
});

test("join proposal rejects an L corner", () => {
  resetPlan();
  S.nodes = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 80 }];
  const a = { id: 1, a: 0, b: 1, thickness: 10 };
  const b = { id: 2, a: 1, b: 2, thickness: 10 };
  S.walls = [a, b];
  assert.equal(joinProposal(a, b), null);
});

test("offset ghost is a parallel copy at the typed distance", () => {
  resetPlan();
  S.nodes = [{ x: 0, z: 0 }, { x: 200, z: 0 }];
  const host = { id: 1, a: 0, b: 1, thickness: 10 };
  S.walls = [host];
  const ghost = offsetGhost(host, 120, 1);
  assert.equal(Math.round(ghost.a.z), 120);
  assert.equal(Math.round(ghost.b.z), 120);
  assert.equal(Math.round(ghost.a.x), 0);
  assert.equal(offsetSideFromCursor(host, 50, -10), -1);
  assert.equal(offsetSideFromCursor(host, 50, 10), 1);
});

test("a locked turn keeps +90 when the cursor drifts into the opposite quadrant", () => {
  resetPlan();
  resetDrawDirLock();
  const from = { x: 0, z: 0 };
  const north = applyDrawDirLock(from, { x: 0, z: 80 });
  assert.ok(Math.abs(Math.atan2(north.z, north.x) - Math.PI / 2) < 1e-9);
  const drifted = applyDrawDirLock(from, { x: 4, z: -3 });
  const ang = Math.atan2(drifted.z, drifted.x);
  assert.ok(Math.abs(ang - Math.PI / 2) < 0.2, "kept +90°, got " + ((ang * 180) / Math.PI));
});

test("a locked turn yields when the cursor clearly enters the opposite half-plane", () => {
  resetPlan();
  resetDrawDirLock();
  const from = { x: 0, z: 0 };
  applyDrawDirLock(from, { x: 0, z: 80 });
  const south = applyDrawDirLock(from, { x: 0, z: -80 });
  assert.ok(Math.abs(Math.atan2(south.z, south.x) + Math.PI / 2) < 1e-6);
});

test("extend-to-hit snaps a ray that has already crossed a host wall", () => {
  resetPlan();
  S.nodes = [{ x: 0, z: 0 }, { x: 0, z: 200 }, { x: 80, z: 0 }];
  S.walls = [{ id: 1, a: 0, b: 1, thickness: 10, height: 270 }];
  S.drawFrom = 2;
  const hit = extendToHit({ x: 80, z: 100 }, { x: -40, z: 100 }, 30);
  assert.ok(hit);
  assert.equal(Math.round(hit.x), 0);
  assert.equal(Math.round(hit.z), 100);
  assert.equal(hit.kind, "hit");
});

test("paint applies the current drawing type without moving nodes", () => {
  resetPlan();
  S.nodes = [{ x: 0, z: 0 }, { x: 100, z: 0 }];
  const wall = { id: 1, a: 0, b: 1, thickness: 10, height: 270, wallTypeId: "generic" };
  S.walls = [wall];
  setWallDrawPreset("exterior");
  paintWallWithDefaults(wall);
  assert.equal(wall.wallTypeId, "exterior");
  assert.equal(wall.loc, "face");
  assert.equal(S.nodes[0].x, 0);
  reverseWallStyle(wall);
  assert.equal(wall.layersReversed, true);
});

const interaction = moduleSource("js/interaction.js");

test("wall commits split hosts they draw through and close a loop back to the start", () => {
  assert.match(interaction, /splitCrossedByNewWall\(made\)/);
  assert.match(interaction, /S\.drawStart = S\.drawFrom/);
  assert.match(interaction, /nb === S\.drawStart && \(S\.drawWalls \|\| \[\]\)\.length >= 3/);
  assert.match(interaction, /function snapWallPoint\(/);
  assert.match(interaction, /extendToHit\(/);
});

test("curved walls stay armed so the next arc continues from the last end", () => {
  assert.match(interaction, /S\.arcDraft = \{ startNode: endNode, through: null \}/);
  assert.doesNotMatch(
    sourceFunctionText(interaction, "arcWallPoint"),
    /select\(\{ kind: "wall"/,
  );
});

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = stylesSource();

test("wall palette docks beside the plan toolbar instead of overlapping it", () => {
  assert.match(html, /id="plan-tools"/);
  assert.match(html, /id="plan-toolbar"/);
  assert.match(html, /id="plan-wall-palette"/);
  assert.match(html, /class="wd-loc"/);
  assert.match(css, /#plan-tools \{/);
  assert.match(css, /#plan-wall-palette\[hidden\] \{ display: none !important; \}/);
  assert.doesNotMatch(css, /#plan-wall-palette \{[^}]*inset-inline-start:/);
});

test("draw-from choices are distinct wall-section icons with hover names", () => {
  assert.match(html, /class="wd-loc-btn"/);
  assert.match(html, /class="wd-loc-icon"/);
  assert.doesNotMatch(html, /wd-loc-tick/);
  assert.doesNotMatch(html, /data-wall-from-label/);
  assert.match(html, /data-wall-from="exterior"[^>]*data-i18n-aria="wd_from_outer"/);
  assert.match(html, /data-wall-from="interior"[^>]*data-i18n-aria="wd_from_inner"/);
  assert.match(css, /\.wd-loc-btn::before \{/);
  assert.match(css, /content: attr\(aria-label\)/);
  assert.match(css, /\.wd-loc-btn:hover::before/);
});

test("eraser tool deletes the object under the cursor, including a whole wall", () => {
  assert.match(html, /data-tool="erase"/);
  assert.match(html, /ph-eraser/);
  assert.match(interaction, /S\.tool === "erase"/);
  assert.match(interaction, /function pickErase\(/);
  assert.match(interaction, /function applyRemove\(/);
  assert.match(interaction, /sel\.kind === "wall"/);
  assert.match(interaction, /e\.key === "e" \|\| e\.key === "E"/);
});
