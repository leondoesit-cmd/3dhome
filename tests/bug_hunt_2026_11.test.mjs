/* Behaviour pins for the November 2026 bug hunt: each test names the bug it
   guards, as an input that used to give the wrong answer. */
import test from "node:test";
import assert from "node:assert/strict";
import { convertGeoJsonToWalls } from "../js/geojson_to_walls.js";
import { isPublicAddress, isLanAddress } from "../server/security.mjs";
import { validBackupKey } from "../server/model_backup.mjs";
import { S } from "../js/state.js";
import { measure4 } from "../js/measure.js";
import { attach, orphanChildren } from "../js/stack.js";
import { holdToWall, reseatHeldItems } from "../js/item_align.js";
import { cleanRemoteComment } from "../js/collaboration.js";
import { bomCsv } from "../js/modeler_commands.js";
import { fitPlanTransform, rotatePx, sx, sz } from "../js/plan_view.js";
import { today } from "../js/sheet_print.js";

const width = (a, b, options) => convertGeoJsonToWalls({ type: "LineString", coordinates: [a, b] }, options || {}).bounds.widthCm;

test("GeoJSON without a unit: a local metre plan is not read as degrees, wherever it starts", () => {
  assert.equal(width([0, 0], [12, 3]), 1200);
  assert.equal(width([200, 100], [212, 103]), 1200);
  assert.equal(width([0, 0], [0.8, 0]), 80);
  assert.equal(width([200, 100], [600, 100]), 400); // a centimetre plan stays centimetres
  assert.equal(width([0, 0], [4, 0], { unit: "m" }), 400);
  const geo = convertGeoJsonToWalls({ type: "Polygon", coordinates: [[[34.78, 32.08], [34.7801, 32.08], [34.7801, 32.0801], [34.78, 32.0801], [34.78, 32.08]]] });
  assert.ok(geo.bounds.widthCm > 900 && geo.bounds.widthCm < 1000, "real lon/lat still converts");
});

test("GeoJSON y points north: a local plan is not mirrored", () => {
  const out = convertGeoJsonToWalls({ type: "LineString", coordinates: [[0, 0], [0, 5]] }, { unit: "m" });
  assert.deepEqual(out.nodes, [{ x: 0, z: 500 }, { x: 0, z: 0 }]);
});

test("public-address filter: 192.0.0.0/16 is mostly public; tunnelled private IPv4 is not", () => {
  assert.equal(isPublicAddress("192.0.32.10"), true);
  assert.equal(isPublicAddress("192.0.0.8"), false);
  assert.equal(isPublicAddress("192.0.2.1"), false);
  for (const a of ["64:ff9b::7f00:1", "::ffff:0:a00:1", "2002:c0a8:101::1", "64:ff9b:1:a00:0:100:808:808"])
    assert.equal(isPublicAddress(a), false, a);
  assert.equal(isPublicAddress("64:ff9b::808:808"), true);
  assert.equal(isPublicAddress("2002:808:808::1"), true);
  assert.equal(isLanAddress("64:ff9b::c0a8:101"), false, "the LAN allow-list does not widen");
});

test("backup keys refuse Windows device names and trailing dots", () => {
  for (const k of ["nul", "CON", "com1.json", "abc."]) assert.equal(validBackupKey(k), false, k);
  for (const k of ["cm_mu32mylp", "nullable", "console-1", "a.b"]) assert.equal(validBackupKey(k), true, k);
});

test("clearance to a wall uses its thick footprint: end faces and angled faces", () => {
  S.nodes = [{ x: 100, z: 5 }, { x: 200, z: 5 }];
  S.walls = [{ id: 1, a: 0, b: 1, thickness: 20 }];
  S.items = [];
  const east = measure4(0, 0, null, null).find((r) => r.dir.key === "e");
  assert.ok(east, "the ray meets the wall's end, not its line");
  assert.equal(Math.round(east.gap), 100);
  S.nodes = [{ x: 100, z: -100 }, { x: 300, z: 100 }]; // 45°: centreline at x=200 on the ray
  const angled = measure4(0, 0, null, null).find((r) => r.dir.key === "e");
  assert.equal(Math.round((200 - angled.gap) * 100) / 100, Math.round(10 * Math.SQRT2 * 100) / 100);
});

test("deleting a host brings its whole stack down, not just the first level", () => {
  S.items = [
    { id: 1, type: "table", x: 0, z: 0, w: 120, d: 80, h: 75 },
    { id: 2, type: "box", x: 0, z: 0, w: 40, d: 40, h: 30 },
    { id: 3, type: "box", x: 0, z: 0, w: 20, d: 20, h: 5 },
  ];
  attach(S.items[1], S.items[0]);
  attach(S.items[2], S.items[1]);
  S.items = S.items.slice(1);
  orphanChildren(null);
  assert.equal(S.items[0].elev, undefined);
  assert.equal(S.items[1].elev, 30);
});

test("a piece held to a diagonal wall sits its own depth from the face", () => {
  S.nodes = [{ x: 0, z: 0 }, { x: 1000, z: 1000 }];
  S.walls = [{ id: 1, a: 0, b: 1, thickness: 20 }];
  const sofa = { id: 5, type: "sofa", x: 400, z: 300, w: 200, d: 90, rot: 45 };
  S.items = [sofa];
  holdToWall(sofa, S.walls[0], 0);
  reseatHeldItems();
  const fromLine = Math.abs((sofa.x - 0) * -Math.SQRT1_2 + (sofa.z - 0) * Math.SQRT1_2);
  assert.equal(Math.round(fromLine * 100) / 100, 55); // 10 (half the wall) + 45 (half the depth)
});

test("a peer's comment is reduced to the fields the panel reads", () => {
  assert.equal(cleanRemoteComment({ id: "x" }), null);
  assert.equal(cleanRemoteComment(null), null);
  const c = cleanRemoteComment({ id: "x", text: " hi ", target: 7, extra: "<b>" });
  assert.deepEqual(Object.keys(c).sort(), ["at", "author", "id", "resolved", "target", "text"]);
  assert.deepEqual(c.target, { kind: "project", id: null });
  assert.equal(c.text, "hi");
});

test("the assembly BOM does not let a part name run as a spreadsheet formula", () => {
  const csv = bomCsv([{ item: 1, quantity: 2, name: "=HYPERLINK(\"x\")" }, { item: 2, quantity: -1, name: "@sum" }], ["Item", "Qty", "Name"], false);
  assert.match(csv, /\n1,2,"'=HYPERLINK\(""x""\)"\n/);
  assert.match(csv, /\n2,-1,'@sum$/);
});

test("Fit above the dock holds at every plan rotation", () => {
  const bb = { minx: 0, minz: 0, maxx: 1000, maxz: 400 };
  for (const rot of [0, 30, 90, 180, 270]) {
    S.planRot = rot; S.CW = 1000; S.CH = 800;
    const tx = fitPlanTransform(bb, 1000, 800, 100, { worldPad: 0, minSpan: 0 });
    S.SC = tx.sc; S.OX = tx.ox; S.OY = tx.oy;
    for (const [x, z] of [[0, 0], [1000, 0], [1000, 400], [0, 400]]) {
      const p = rotatePx(sx(x), sz(z));
      assert.ok(p.x >= -0.5 && p.x <= 1000.5 && p.y >= -0.5 && p.y <= 700.5, `rot ${rot}: corner (${x},${z}) at ${p.x},${p.y}`);
    }
  }
  S.planRot = 0;
});

test("sheet dates are the local calendar date", () => {
  assert.equal(today(new Date(2026, 0, 2, 0, 30)), "2026-01-02");
});
