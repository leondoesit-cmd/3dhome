/* The naming half of the Blender export (js/blender_names.js).
 *
 * These rules only ever fail in someone else's software: a name with a newline
 * in it, or a room called "מטבח, סלון", is perfectly valid inside this app and
 * becomes an object nobody can select in Blender's outliner or address from
 * bpy.data.objects. So the assertions here are about what SURVIVES the trip,
 * not about what the strings look like on this side. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_NAME,
  COLLECTIONS,
  sanitizeBlenderName,
  uniqueNamer,
  classify,
  labelFor,
  materialName,
} from "../js/blender_names.js";

test("a name is stripped of everything Blender cannot hold", () => {
  assert.equal(sanitizeBlenderName("Living room\n\tkitchen"), "Living room kitchen");
  // a room key is a comma-joined list of wall ids — commas are not selectors
  assert.equal(sanitizeBlenderName("w1,w2,w3"), "w1_w2_w3");
  assert.ok(!/[,\n\t]/.test(sanitizeBlenderName('bad"name",<x>')));
  // Hebrew is a first-class UI language here and must not be mangled to "____"
  assert.equal(sanitizeBlenderName("מטבח"), "מטבח");
});

test("an empty or fully stripped name falls back rather than becoming blank", () => {
  assert.equal(sanitizeBlenderName("", "Wall"), "Wall");
  assert.equal(sanitizeBlenderName("   ", "Wall"), "Wall");
  assert.equal(sanitizeBlenderName("<<<", "Wall"), "Wall");
  assert.equal(sanitizeBlenderName(null), "Object");
});

test("a long label is truncated to Blender's 63-byte id limit", () => {
  const long = "Sofa".repeat(40);
  assert.equal(sanitizeBlenderName(long).length, MAX_NAME);
});

test("collisions get Blender's own .001 suffix, and the suffix stays inside the limit", () => {
  const name = uniqueNamer();
  assert.deepEqual([name("Chair"), name("Chair"), name("Chair")], ["Chair", "Chair.001", "Chair.002"]);
  // a name already at the limit must lose characters to make room for ".001",
  // or the truncated result collides all over again
  const long = "x".repeat(MAX_NAME);
  assert.equal(name(long), long);
  const second = name(long);
  assert.equal(second.length, MAX_NAME);
  assert.ok(second.endsWith(".001"));
  assert.notEqual(second, long);
});

test("a name that is only made unique by its suffix is never handed out twice", () => {
  const name = uniqueNamer();
  assert.equal(name("Chair"), "Chair");
  assert.equal(name("Chair.001"), "Chair.001"); // taken by hand first
  assert.equal(name("Chair"), "Chair.002"); // so the generated one skips past it
});

test("furniture, walls and openings each land in a collection with their planner id", () => {
  const chair = classify({ item: { type: "diningChair", id: 12, w: 45, d: 48, h: 90, rot: 90 } });
  assert.equal(chair.collection, "furniture");
  assert.equal(chair.name, "DiningChair_12");
  assert.equal(chair.extras.home3d_id, "12");
  assert.equal(chair.extras.width_cm, 45);

  const wall = classify({ wall: { id: "w3", thickness: 12, height: 270 } });
  assert.equal(wall.collection, "walls");
  assert.equal(wall.name, "Wall_w3");
  assert.equal(wall.extras.thickness_cm, 12);

  // an opening belongs to the wall it is cut into, so it shares that collection
  assert.equal(classify({ opening: { type: "door", id: 4 } }).collection, "walls");
  assert.equal(classify({ opening: { type: "door", id: 4 } }).name, "Door_4");
});

test("a floor carries the room it belongs to, and every classification names a real collection", () => {
  const floor = classify({ role: "floor", roomLabel: "Kitchen", finish: "tiles" });
  assert.equal(floor.collection, "floors");
  assert.equal(floor.name, "Floor_Kitchen");
  assert.equal(floor.extras.home3d_finish, "tiles");
  // an unnamed room must not produce "Floor_" with a dangling underscore
  assert.equal(classify({ role: "floor" }).name, "Floor");

  const ids = new Set(COLLECTIONS.map((c) => c.id));
  [{}, { role: "ceiling" }, { role: "ground" }, { role: "curb" }, { mep: true }, { item: { type: "x" } }].forEach(
    (ud) => assert.ok(ids.has(classify(ud).collection), JSON.stringify(ud)),
  );
});

test("a catalogue type becomes one searchable word however it was spelled", () => {
  assert.equal(labelFor("diningTable"), "DiningTable");
  assert.equal(labelFor("dining_table"), "DiningTable");
  assert.equal(labelFor("dining table"), "DiningTable");
  assert.equal(labelFor(""), "Object");
});

test("two finishes of the same role get two material names, not one merged one", () => {
  assert.notEqual(materialName("wood", "#8a5a2b"), materialName("wood", "#e0d0b0"));
  assert.ok(materialName("glass", "#ffffff", { transparent: true }).includes("Glass"));
});
