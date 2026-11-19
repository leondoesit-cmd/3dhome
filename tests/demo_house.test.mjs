// The showcase house (js/demo_house.js): generated from the "showcase"
// layout, opened in the presentation plan and dollhouse view, fully furnished
// with pieces that exist and do not stand in one another.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("showcase house: nine furnished rooms, presentation view, no collisions", () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const three = pathToFileURL(join(root, "vendor/three/three.module.js")).href;
  const addons = pathToFileURL(join(root, "vendor/three/addons/")).href;
  const loader = `data:text/javascript,export async function resolve(s,c,n){if(s==="three")return{url:${JSON.stringify(three)},format:"module",shortCircuit:true};if(s.startsWith("three/addons/"))return{url:${JSON.stringify(addons)}+s.slice(13),format:"module",shortCircuit:true};return n(s,c)}`;
  const script = String.raw`
    import assert from "node:assert/strict";
    import { S } from "./js/state.js";
    import { showcaseHouse } from "./js/demo_house.js";
    import { FURN } from "./js/furniture.js";
    import { detectRooms, pointInPoly } from "./js/geometry.js";
    import { roomTypeOf } from "./js/room_types.js";
    import { openingHasSwingConflict } from "./js/swing_clearance.js";

    const result = showcaseHouse();
    assert.notEqual(result && result.ok, false, JSON.stringify(result));
    assert.equal(S.planStyle, "presentation");
    assert.deepEqual(S.cutaway, { on: true, height: 150, cap: "white" });
    assert.ok(!S.mep || !(S.mep.runs || []).length, "a showroom plan carries no service runs");

    const rooms = detectRooms();
    assert.equal(rooms.length, 9);
    const types = rooms.map((r) => roomTypeOf(S.roomMeta[r.key])).sort();
    assert.deepEqual(types, ["bathroom", "bedroom", "corridor", "dining", "ensuite", "kitchen", "living", "masterBedroom", "office"]);

    for (const it of S.items) assert.ok(FURN[it.type], "unknown type " + it.type);
    for (const o of S.openings) assert.ok(!openingHasSwingConflict(o), "door swing conflict at " + o.id);
    const inRoom = (type, t) => S.items.some((it) => it.type === t && rooms.some((r) => roomTypeOf(S.roomMeta[r.key]) === type && pointInPoly(it.x, it.z, r.pts)));
    for (const [room, piece] of [["living", "sofa"], ["dining", "table"], ["kitchen", "island"], ["masterBedroom", "bed"], ["bedroom", "bed"], ["office", "desk"], ["bathroom", "toilet"]])
      assert.ok(inRoom(room, piece), room + " needs a " + piece);

    // floor-standing pieces never stand in one another
    const overlay = new Set(["rug", "ceilingLight", "pendant", "trackLight", "lightStrip", "art", "mirror", "wallMirror", "tableLamp", "laptop", "hood", "upper"]);
    const half = (it) => { const r = ((it.rot || 0) % 180 + 180) % 180; return r >= 45 && r < 135 ? [it.d / 2, it.w / 2] : [it.w / 2, it.d / 2]; };
    const box = (it) => { const h = half(it); return { x0: it.x - h[0], x1: it.x + h[0], z0: it.z - h[1], z1: it.z + h[1] }; };
    const floor = S.items.filter((it) => !overlay.has(it.type) && !it.on);
    for (let i = 0; i < floor.length; i++)
      for (let j = i + 1; j < floor.length; j++) {
        const a = box(floor[i]), b = box(floor[j]);
        const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1;
        const stool = [floor[i].type, floor[j].type].some((t) => t === "barstool" || t === "chair" || t === "officeChair");
        assert.ok(!overlap || stool, floor[i].type + " overlaps " + floor[j].type);
      }
  `;
  const result = spawnSync(process.execPath, ["--experimental-loader", loader, "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("default apartment: the large furnished two-bedroom plan, not a single room", () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const three = pathToFileURL(join(root, "vendor/three/three.module.js")).href;
  const addons = pathToFileURL(join(root, "vendor/three/addons/")).href;
  const loader = `data:text/javascript,export async function resolve(s,c,n){if(s==="three")return{url:${JSON.stringify(three)},format:"module",shortCircuit:true};if(s.startsWith("three/addons/"))return{url:${JSON.stringify(addons)}+s.slice(13),format:"module",shortCircuit:true};return n(s,c)}`;
  const script = String.raw`
    import assert from "node:assert/strict";
    import { S } from "./js/state.js";
    import { defaultApartment } from "./js/demo_house.js";
    import { detectRooms, pointInPoly } from "./js/geometry.js";
    import { roomTypeOf } from "./js/room_types.js";
    import { openingHasSwingConflict } from "./js/swing_clearance.js";

    const result = defaultApartment();
    assert.notEqual(result && result.ok, false, JSON.stringify(result));
    const rooms = detectRooms();
    assert.equal(rooms.length, 6);
    const types = rooms.map((r) => roomTypeOf(S.roomMeta[r.key]));
    assert.ok(types.includes("bathroom"), "the default apartment has a bathroom: " + types);
    assert.ok(S.items.some((it) => it.type === "toilet" && rooms.some((r) => roomTypeOf(S.roomMeta[r.key]) === "bathroom" && pointInPoly(it.x, it.z, r.pts))), "bathroom has a toilet");
    assert.ok(S.openings.some((o) => o.type === "door"), "has doors");
    for (const o of S.openings) assert.ok(!openingHasSwingConflict(o), "door swing conflict at " + o.id);
    assert.ok(!S.mep || !(S.mep.runs || []).length, "no service runs on the default plan");
  `;
  const result = spawnSync(process.execPath, ["--experimental-loader", loader, "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
