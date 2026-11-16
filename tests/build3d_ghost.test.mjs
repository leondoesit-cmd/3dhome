/* The 3D pane's build previews (js/build3d_ghost.js): one case per tool of
   BUILD_3D_PLAN.md's A1 table, state in → primitives out. Each preview has
   to match what the tool's commit would build, so the expectations below
   come from the commands themselves (wall defaults, room.create's and
   opening.place's prepare, placeFurnAt's pose). */
import test from "node:test";
import assert from "node:assert/strict";
import { ghostSpecs, ghostLabels, ghostSignature, rotYOfItem } from "../js/build3d_ghost.js";
import { placementPose } from "../js/build3d_pose.js";
import { S } from "../js/state.js";
import { FURN } from "../js/furniture.js";

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const boxes = (specs) => specs.filter((s) => s.shape === "box");

/* A 600 × 400 room: walls along z=0, x=600, z=400, x=0. */
function room(extra) {
  const nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
  const walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  return { tool: "select", nodes, walls, openings: [], items: [], workspace: { role: "owner" }, layers: {}, ...extra };
}

test("wall: a box along the segment at the thickness and height the wall command is given", () => {
  const st = room({ tool: "wall", drawing: true, drawFrom: 0, previewPt: { x: 0, z: 300 } });
  const [b] = ghostSpecs(st, { wallDefaults: { thickness: 25, height: 240 } });
  assert.equal(b.shape, "box");
  assert.deepEqual([b.w, b.d, b.h, b.cy], [300, 25, 240, 120]);
  assert.ok(near(b.cx, 0) && near(b.cz, 150));
  assert.ok(near(Math.abs(b.rotY), Math.PI / 2), "local X runs down the segment");
  // a face-located wall stands beside its location line, like geometry.wallAxisNodes
  const [f] = ghostSpecs(st, { wallDefaults: { thickness: 20, height: 240, loc: "face", dimSide: 1 } });
  assert.ok(near(Math.abs(f.cx), 10), "offset by half the thickness");
  // no defaults handed in: the wall command's own (10 thick, 270 high), not a hardcoded HUD height
  const [d] = ghostSpecs(st, {});
  assert.deepEqual([d.d, d.h], [10, 270]);
});

test("arcwall: a prism swept along the three-point arc at wall thickness", () => {
  const st = room({ tool: "arcwall", arcDraft: { startPoint: { x: 0, z: 0 }, through: { x: 100, z: 60 } }, previewPt: { x: 200, z: 0 } });
  const [p] = ghostSpecs(st, { wallDefaults: { thickness: 12, height: 250 } });
  assert.equal(p.shape, "prism");
  assert.deepEqual([p.y0, p.y1], [0, 250]);
  const n = p.pts.length / 2, a = p.pts[0], b = p.pts[p.pts.length - 1];
  assert.ok(n >= 13);
  assert.ok(near(Math.hypot(a.x - b.x, a.z - b.z), 12, 1e-6), "the band is one wall thickness wide");
  // before the through point there is no arc yet: a straight wall box
  const straight = ghostSpecs(room({ tool: "arcwall", arcDraft: { startPoint: { x: 0, z: 0 }, through: null }, previewPt: { x: 200, z: 0 } }), {});
  assert.equal(straight[0].shape, "box");
});

test("rect: four wall boxes and a thin floor, refused like room.create below 20 cm", () => {
  const st = room({ tool: "rect", rectDraft: { x: 1000, z: 0 }, previewPt: { x: 1400, z: 300 } });
  const specs = ghostSpecs(st, { wallDefaults: { thickness: 15, height: 260 } });
  assert.equal(boxes(specs).length, 4);
  assert.ok(boxes(specs).every((b) => b.d === 15 && b.h === 260 && b.tone === "ok"));
  const floor = specs.find((s) => s.shape === "prism");
  assert.ok(floor && floor.y1 - floor.y0 <= 3);
  assert.deepEqual(ghostLabels(st, {}).map((l) => l.lens), [[400, 300]], "width × depth label");
  const small = ghostSpecs(room({ tool: "rect", rectDraft: { x: 0, z: 0 }, previewPt: { x: 300, z: 10 } }), {});
  assert.ok(small.length && small.every((s) => s.tone === "blocked"));
});

test("roomstamp: walls round the ghost rectangle, blocked tone when the stamp is refused", () => {
  const ghost = { rect: { x0: 700, z0: 0, x1: 1000, z1: 300 }, size: { w: 290, d: 290 }, blocked: null, corridor: { x0: 600, z0: 0, x1: 700, z1: 120 } };
  const ok = ghostSpecs(room({ tool: "roomstamp", roomGhost: ghost }), {});
  assert.equal(boxes(ok).length, 4);
  assert.ok(ok.some((s) => s.shape === "prism" && s.tone === "edit"), "the corridor it would build");
  const bad = ghostSpecs(room({ tool: "roomstamp", roomGhost: { ...ghost, blocked: true } }), {});
  assert.ok(bad.length && bad.every((s) => s.tone === "blocked"));
  assert.ok(!bad.some((s) => s.tone === "edit"), "no corridor for a refused stamp");
  assert.deepEqual(ghostLabels(room({ tool: "roomstamp", roomGhost: ghost }), {})[0].lens, [290, 290]);
});

test("slabvoid: a thin prism through the slab, erase tone, blocked under 40 cm", () => {
  const [v] = ghostSpecs(room({ tool: "slabvoid", rectDraft: { x: 100, z: 100 }, previewPt: { x: 200, z: 220 } }), {});
  assert.equal(v.shape, "prism");
  assert.equal(v.tone, "erase");
  assert.ok(v.y0 < 0 && v.y1 > 0, "it cuts through the floor slab");
  const [s] = ghostSpecs(room({ tool: "slabvoid", rectDraft: { x: 100, z: 100 }, previewPt: { x: 130, z: 220 } }), {});
  assert.equal(s.tone, "blocked");
});

test("walloffset: a new wall box on the host's line moved to the chosen side", () => {
  const st = room({ tool: "walloffset", offsetDraft: { hostId: 1, dist: 150, side: 1 } });
  const [b] = ghostSpecs(st, { wallDefaults: { thickness: 10, height: 270 } });
  assert.ok(near(b.cx, 300) && near(b.cz, 150), "wall 1 (z=0) moved 150 along its left normal");
  assert.equal(b.w, 600);
  const [o] = ghostSpecs(room({ tool: "walloffset", offsetDraft: { hostId: 1, dist: 150, side: -1 } }), {});
  assert.ok(near(o.cz, -150));
});

test("door / window / passage: the opening.place plan — size, sill, clamp and overlap refusal", () => {
  const probe = (st, x, z) => ({ ...st, wallProbe: { wall: st.walls[0], x, z } });
  const base = room({ tool: "window" });
  const [w] = ghostSpecs(probe(base, 300, 0), { openingDefaults: () => ({ width: 120, height: 120, sill: 90 }) });
  assert.deepEqual([w.w, w.h, w.d, w.cy, w.tone], [120, 120, 12, 150, "ok"]);
  assert.ok(near(w.cx, 300) && near(w.cz, 0));
  // near the end the command clamps the station; the preview stands where the click will put it
  const door = room({ tool: "door" });
  const [c] = ghostSpecs(probe(door, 590, 0), {});
  assert.ok(near(c.cx, 600 - 45 - 5), "clamped to width/2 + half the wall thickness from the end");
  const label = ghostLabels(probe(door, 590, 0), {})[0];
  assert.deepEqual([label.lens[0], label.gap], [90, 5]);
  // over an existing opening the command refuses: blocked tone
  const taken = { ...door, openings: [{ id: 9, wall: 1, s: 300, width: 90, height: 205, sill: 0 }] };
  const [x] = ghostSpecs(probe(taken, 320, 0), {});
  assert.equal(x.tone, "blocked");
  // a passage on a locked wall: blocked as well
  const locked = room({ tool: "passage" });
  locked.walls[0].locked = true;
  assert.equal(ghostSpecs(probe(locked, 300, 0), {})[0].tone, "blocked");
  // no wall under the pointer: nothing to preview (the plan shows nothing either)
  assert.deepEqual(ghostSpecs(door, {}), []);
});

test("furniture placement: the real w × d × h at the pose the click gives, wall-snapped rotation included", () => {
  Object.assign(S, room());
  S.autoFace = true; S.orientHold = false; S.markers = []; S.wallCons = [];
  const sofa = FURN.sofa;
  // dropped a little short of the bottom wall (z = 400): backs onto it, front toward -Z
  const pose = placementPose("sofa", 300, 400 - 5 - sofa.d / 2 - 6);
  assert.equal(pose.rot, 180);
  assert.ok(near(pose.z, 400 - 5 - sofa.d / 2, 0.11), "flush against the wall face");
  const st = { ...room(), placeType: "sofa", tool: "select", previewPt: { x: 300, z: 340 } };
  const specs = ghostSpecs(st, { catalog: FURN, placePose: placementPose, cursor: { x: 300, z: 400 - 5 - sofa.d / 2 - 6 } });
  const [b, front] = specs;
  assert.deepEqual([b.w, b.d, b.h], [sofa.w, sofa.d, pose.y1 - pose.y0]);
  assert.ok(near(b.rotY, rotYOfItem(180)), "rotation is the snapped one, not 0");
  assert.ok(front.cz < b.cz, "the front marker sits on the side the piece faces (-Z)");
  // without a pose service: the command's 2 cm snap, unrotated
  const [plain] = ghostSpecs({ ...st, previewPt: { x: 301, z: 199 } }, { catalog: FURN });
  assert.deepEqual([plain.cx, plain.cz, plain.rotY], [302, 200, -0]);
});

test("fitcab: the fit-cabinet draft's box, as tall as the unit", () => {
  const draft = { box: { x: 300, z: 35, w: 180, d: 60, h: 240, rot: 0 } };
  const [b, front] = ghostSpecs(room({ tool: "fitcab" }), { fitCabDraft: () => draft });
  assert.deepEqual([b.cx, b.cz, b.w, b.d, b.h, b.cy], [300, 35, 180, 60, 240, 120]);
  assert.equal(front.tone, "edit");
  assert.deepEqual(ghostSpecs(room({ tool: "fitcab" }), { fitCabDraft: () => null }), []);
});

test("wallbite: the bitten span in the erase tone, blocked when shorter than 20 cm", () => {
  const [b] = ghostSpecs(room({ tool: "wallbite", biteDraft: { wall: 1, s0: 100, s1: 250 } }), {});
  assert.equal(b.tone, "erase");
  assert.ok(near(b.cx, 175) && b.w >= 150 && b.h > 270);
  const [s] = ghostSpecs(room({ tool: "wallbite", biteDraft: { wall: 1, s0: 100, s1: 110 } }), {});
  assert.equal(s.tone, "blocked");
});

test("mepRoute / mepNode: a tube through the route and its preview; a small box at the node", () => {
  const route = { sys: "power", layer: "wall", pts: [{ x: 0, z: 0 }, { x: 100, z: 0 }], preview: { x: 100, z: 80 } };
  const [t] = ghostSpecs(room({ tool: "mepRoute", mep: { route } }), { mepRunY: () => 30 });
  assert.equal(t.shape, "tube");
  assert.deepEqual(t.pts.map((p) => [p.x, p.y, p.z]), [[0, 30, 0], [100, 30, 0], [100, 30, 80]]);
  const [b] = ghostSpecs(room({ tool: "mepNode" }), { cursor: { x: 50, z: 3 }, mepNodeAt: (x) => ({ x, y: 110, z: 0 }) });
  assert.deepEqual([b.shape, b.cx, b.cy, b.cz], ["box", 50, 110, 0]);
  const blocked = ghostSpecs(room({ tool: "mepRoute", mep: { route: { ...route, previewBlocked: true } } }), {});
  assert.equal(blocked[0].tone, "blocked");
});

test("point: a small pin at the marker preview, at its height", () => {
  const specs = ghostSpecs(room({ tool: "point", markerPreview: { x: 40, y: 100, z: 60 } }), {});
  assert.equal(specs.length, 2);
  assert.ok(specs.every((s) => s.cx === 40 && s.cz === 60 && s.cy > 100));
});

test("erase / wallbreak / walljoin / wallreverse / wallpaint: the hovered wall or piece, inflated", () => {
  const st = room();
  const wall = st.walls[1];
  const [e] = ghostSpecs({ ...st, tool: "erase", eraseHover: { kind: "wall", ref: wall } }, {});
  assert.equal(e.tone, "erase");
  assert.ok(e.d > 10 && e.h > 270 && e.w > 400, "proud of the wall on every face");
  const sofa = { id: 5, type: "sofa", x: 100, z: 100, w: 200, d: 90, h: 80, rot: 90 };
  const [i] = ghostSpecs({ ...st, tool: "erase", eraseHover: { kind: "item", ref: sofa } }, {});
  assert.ok(i.w > 200 && i.d > 90 && near(i.rotY, rotYOfItem(90)));
  for (const tool of ["walljoin", "wallreverse", "wallpaint"]) {
    const specs = ghostSpecs({ ...st, tool, wallProbe: { wall, x: 600, z: 200 } }, {});
    assert.equal(specs.length, 1, tool);
    assert.equal(specs[0].tone, "edit", tool);
  }
  // wallbreak adds the cut slab at the break point; at the very end it is refused
  const brk = ghostSpecs({ ...st, tool: "wallbreak", wallProbe: { wall, x: 600, z: 200 } }, { cursor: { x: 600, z: 200 } });
  assert.equal(brk.length, 2);
  assert.ok(near(brk[1].cz, 200) && brk[1].w < 5 && brk[1].tone === "edit");
  const end = ghostSpecs({ ...st, tool: "wallbreak", wallProbe: { wall, x: 600, z: 3 } }, { cursor: { x: 600, z: 3 } });
  assert.equal(end[1].tone, "blocked");
});

test("idle tools and unchanged drafts cost nothing", () => {
  assert.deepEqual(ghostSpecs(room({ tool: "select" }), {}), []);
  const st = room({ tool: "wall", drawing: true, drawFrom: 0, previewPt: { x: 0, z: 300 } });
  assert.equal(ghostSignature(ghostSpecs(st, {})), ghostSignature(ghostSpecs(st, {})));
  assert.notEqual(ghostSignature(ghostSpecs(st, {})), ghostSignature(ghostSpecs({ ...st, previewPt: { x: 0, z: 310 } }, {})));
});
