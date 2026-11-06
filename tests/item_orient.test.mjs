import { readI18nSource } from "./helpers/i18n_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { S } from "../js/state.js";
import {
  autoFaceRot, applyAutoFace, refaceItem, markManualRot,
  backToWallRot, runNeighbour, seatTarget, faceTargetRot,
  orientMode, rotStep, setRotStep, flushToWall,
} from "../js/item_orient.js";

/* A 600x400 room. Walls run: 1 along z=0 (top), 2 along x=600 (right),
   3 along z=400 (bottom), 4 along x=0 (left). */
function room() {
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = [];
  S.markers = [];
  S.wallCons = [];
  S.items = [];
  S.autoFace = true;
  S.orientHold = false;
  S.rotStep = 15;
}
function mk(type, x, z, w, d, rot) {
  return { id: type + ":" + x + "," + z, type: type, x: x, z: z, w: w, d: d, h: 90, rot: rot || 0 };
}

test("a piece dropped near a wall puts its back on it", () => {
  room();
  // sink against the top wall: front is local +Z, so it looks into the room
  const top = mk("sink", 200, 40, 80, 60);
  applyAutoFace(top, top.x, top.z);
  assert.equal(top.rot, 0, "top wall -> front +Z");

  // a 200-deep bed against the left wall stands with its centre 105 out
  const left = mk("bed", 112, 200, 160, 200);
  applyAutoFace(left, left.x, left.z);
  assert.equal(left.rot, 270, "left wall -> front +X (headboard on the wall)");

  const right = mk("wardrobe", 565, 200, 100, 60);
  applyAutoFace(right, right.x, right.z);
  assert.equal(right.rot, 90, "right wall -> front -X");

  const bottom = mk("sofa", 300, 355, 200, 90);
  applyAutoFace(bottom, bottom.x, bottom.z);
  assert.equal(bottom.rot, 180, "bottom wall -> front -Z");
});

test("a piece well clear of every wall keeps the angle it has", () => {
  room();
  const it = mk("sofa", 300, 200, 200, 90, 33);
  assert.equal(applyAutoFace(it, it.x, it.z), 0);
  assert.equal(it.rot, 33, "nothing near enough to have an opinion");
});

test("a rug, a table and a ceiling light are never turned", () => {
  room();
  ["rug", "table", "ceilingLight", "pendant"].forEach((type) => {
    assert.equal(orientMode(type), "free");
    const it = mk(type, 200, 30, 200, 140, 17);
    assert.equal(applyAutoFace(it, it.x, it.z), 0);
    assert.equal(it.rot, 17);
  });
});

test("an oblique wall gives an oblique angle, not a rounded-off one", () => {
  room();
  // a 45° wall from (0,0) to (400,400)
  S.nodes = [{ x: 0, z: 0 }, { x: 400, z: 400 }];
  S.walls = [{ id: 9, a: 0, b: 1, thickness: 10, height: 270 }];
  const it = mk("sofa", 240, 160, 200, 90); // on the +x/-z side of the wall
  applyAutoFace(it, it.x, it.z);
  // front (+Z local) ends up pointing (+x,-z), i.e. away from that wall face
  assert.equal(it.rot, 225, "square on the 45° wall, not rounded to an axis");
});

test("what a piece stands on decides which way it looks", () => {
  room();
  const counter = mk("base", 200, 300, 60, 60, 180);
  S.items = [counter];
  const sink = mk("sink", 200, 300, 80, 60);
  // the host wins over the wall that happens to be nearest
  applyAutoFace(sink, sink.x, sink.z, { host: counter });
  assert.equal(sink.rot, 180);
});

test("a piece joins the run it is dropped beside", () => {
  room();
  const cab = mk("base", 560, 200, 60, 60, 90); // installed on the right wall
  S.items = [cab];
  const dw = mk("dishwasher", 560, 265, 60, 60);
  assert.equal(runNeighbour(dw, dw.x, dw.z), cab);
  applyAutoFace(dw, dw.x, dw.z);
  assert.equal(dw.rot, 90, "matches the run, not the nearest wall");
});

test("a run only reaches ALONG itself, never across the room", () => {
  room();
  // the default kitchen shape: a fridge on the top wall, a sink dropped a
  // metre away against the RIGHT wall. They are not one run.
  const fridge = mk("fridge", 555, 55, 70, 70, 0);
  S.items = [fridge];
  const sink = mk("sink", 560, 150, 80, 60);
  assert.equal(runNeighbour(sink, sink.x, sink.z), null, "too far off the line");
  applyAutoFace(sink, sink.x, sink.z);
  assert.equal(sink.rot, 90, "so the wall decides, as it should");

  // ...but the piece pushed up against the fridge's side does join it
  const oven = mk("oven", 625, 55, 60, 60);
  assert.equal(runNeighbour(oven, oven.x, oven.z), fridge);
});

test("a seat faces the table it was pulled up to, square on", () => {
  room();
  const table = mk("table", 300, 200, 120, 80, 0);
  S.items = [table];
  const near = mk("chair", 300, 275, 45, 45); // in front (+Z) of the table
  assert.equal(seatTarget(near, near.x, near.z), table);
  applyAutoFace(near, near.x, near.z);
  assert.equal(near.rot, 180, "faces back toward the table");

  const side = mk("chair", 380, 205, 45, 45); // off the table's +X end
  applyAutoFace(side, side.x, side.z);
  assert.equal(side.rot, 90);
  // a chair not near any table falls back to the wall rule
  const lone = mk("chair", 300, 360, 45, 45);
  S.items = [];
  applyAutoFace(lone, lone.x, lone.z);
  assert.equal(lone.rot, 180);
});

test("a rotated table is faced in ITS frame, not the world's", () => {
  room();
  /* Turned 90°, the table's WIDTH now runs along world Z, so a chair at -Z is
     off its end and must look back along +Z (rot 0) — the world-frame answer
     would have been 0/180 the other way round. */
  const table = mk("table", 300, 200, 120, 80, 90);
  assert.equal(faceTargetRot(mk("chair", 300, 130, 45, 45), 300, 130, table), 0);
  assert.equal(faceTargetRot(mk("chair", 300, 270, 45, 45), 300, 270, table), 180);
});

test("an angle set by hand is never overruled", () => {
  room();
  const it = markManualRot(mk("sink", 200, 40, 80, 60, 45));
  assert.equal(applyAutoFace(it, it.x, it.z), 0);
  assert.equal(it.rot, 45);
  // ...until the piece is explicitly handed back to the automatic rule
  assert.ok(refaceItem(it));
  assert.equal(it.rot, 0);
  assert.equal(it.rotUser, undefined, "the hand-set flag is cleared with it");
});

test("the two escape hatches switch the whole thing off", () => {
  room();
  S.autoFace = false;
  const off = mk("sink", 200, 40, 80, 60, 12);
  assert.equal(applyAutoFace(off, off.x, off.z), 0);
  assert.equal(off.rot, 12);

  S.autoFace = true;
  S.orientHold = true; // Alt held for this drag
  const held = mk("sink", 200, 40, 80, 60, 12);
  assert.equal(applyAutoFace(held, held.x, held.z), 0);
  assert.equal(held.rot, 12);
  S.orientHold = false;
});

test("a locked piece is left where and how it is", () => {
  room();
  const it = mk("sink", 200, 40, 80, 60, 12);
  it.locked = true;
  assert.equal(applyAutoFace(it, it.x, it.z), 0);
  assert.equal(it.rot, 12);
});

test("applyAutoFace reports the angle it turned by, for the riders", () => {
  room();
  const it = mk("wardrobe", 565, 200, 100, 60, 0);
  assert.equal(applyAutoFace(it, it.x, it.z), 90);
  assert.equal(autoFaceRot(it, it.x, it.z), 90);
  assert.equal(applyAutoFace(it, it.x, it.z), 0, "already facing that way");
});

test("the rotation step accepts 15/45/90 and nothing else", () => {
  room();
  assert.equal(rotStep(), 15);
  assert.equal(setRotStep(90), 90);
  assert.equal(rotStep(), 90);
  setRotStep(7);
  assert.equal(rotStep(), 15, "a junk value falls back to the default");
});

test("backToWallRot ignores a wall the piece sits well past the end of", () => {
  room();
  S.walls = [{ id: 1, a: 0, b: 1, thickness: 10, height: 270 }]; // top wall only
  const past = mk("sofa", 900, 40, 200, 90);
  assert.equal(backToWallRot(past, past.x, past.z), null);
});

/* The wiring: the rules above are worth nothing if the flag is dropped on save
   or the buttons are missing from the panel. */
test("the hand-set flag survives a save and the panel offers 90°", async () => {
  const ui = await readFile(new URL("../js/ui.js", import.meta.url), "utf8");
  assert.match(ui, /rotUser: it\.rotUser \? 1 : undefined/, "serializer whitelist");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  ["rotStep15", "rotStep45", "rotStep90", "faceAuto", "face-toggle"].forEach((hook) => {
    assert.ok(html.includes(hook), hook + " is in the item panel");
  });
  const i18n = await readI18nSource();
  const he = i18n.slice(i18n.indexOf("  he: {"), i18n.indexOf("  en: {"));
  const en = i18n.slice(i18n.indexOf("  en: {"));
  ["auto_face", "rot_step", "face_auto", "f_faced", "f_faceSame"].forEach((key) => {
    assert.match(he, new RegExp("\\n    " + key + ":"), key + " in Hebrew");
    assert.match(en, new RegExp("\\n    " + key + ":"), key + " in English");
  });
});

test("a piece dropped near a wall stands with its back on the wall face", () => {
  room();
  // clicked 31 cm too far up: the headboard would be inside the top wall
  const bed = mk("bed", 200, 69, 160, 200);
  applyAutoFace(bed, bed.x, bed.z);
  assert.deepEqual(flushToWall(bed, bed.x, bed.z), { x: 200, z: 105 }, "5 cm half wall + 100 cm half bed");

  // clicked short of the right wall: the desk would float off it
  const desk = mk("desk", 520, 200, 120, 60);
  applyAutoFace(desk, desk.x, desk.z);
  assert.equal(desk.rot, 90);
  assert.deepEqual(flushToWall(desk, desk.x, desk.z), { x: 565, z: 200 });
});

test("only the back-to-wall rule moves a dropped piece", () => {
  room();
  assert.equal(flushToWall(mk("rug", 200, 30, 200, 140), 200, 30), null, "free pieces stay put");
  const turned = mk("sofa", 300, 330, 200, 90, 0);
  markManualRot(turned);
  assert.equal(flushToWall(turned, 300, 330), null, "a hand-set angle is not argued with");
  const facingAway = mk("sofa", 300, 330, 200, 90, 0); // not turned toward the bottom wall yet
  assert.equal(flushToWall(facingAway, 300, 330), null, "only when it faces the wall it would go to");
  const table = mk("table", 300, 200, 160, 90);
  S.items = [table];
  const chair = mk("chair", 300, 130, 45, 45);
  assert.equal(flushToWall(chair, chair.x, chair.z), null, "a chair at a table belongs to the table");
});
