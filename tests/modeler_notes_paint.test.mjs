import test from "node:test";
import assert from "node:assert/strict";
import {
  createNote,
  addNoteToDef,
  updateNoteInDef,
  deleteNoteFromDef,
  translateNotes,
  NOTE_CATEGORIES,
  CURATED_SWATCHES,
  applyFacePaint,
  applyBodyPaint,
  sampleFaceAppearance,
  clearFacePaint,
  createMarkupStroke,
  addMarkupToDef,
  deleteMarkupFromDef,
  clearMarkupsFromDef,
  translateMarkups,
} from "../js/modeler_notes_paint.js";

test("note creation and validation", () => {
  const note = createNote({
    point: { x: 10, y: 20, z: 30 },
    normal: { x: 0, y: 1, z: 0 },
    text: "Check clearance with lid",
    category: "tolerance",
    offset: { x: 50, y: -30 },
    author: "Alex",
  });

  assert.ok(note.id.startsWith("note_"));
  assert.equal(note.point.x, 10);
  assert.equal(note.point.y, 20);
  assert.equal(note.point.z, 30);
  assert.equal(note.normal.y, 1);
  assert.equal(note.text, "Check clearance with lid");
  assert.equal(note.category, "tolerance");
  assert.equal(note.color, NOTE_CATEGORIES.tolerance.color);
  assert.equal(note.offset.x, 50);
  assert.equal(note.offset.y, -30);
  assert.equal(note.author, "Alex");
  assert.ok(note.createdAt > 0);
});

test("add, update and delete notes in model def", () => {
  const def = { notes: [] };
  const n1 = addNoteToDef(def, {
    point: { x: 5, y: 15, z: 25 },
    text: "M6 thread hole",
    category: "spec",
  });

  assert.equal(def.notes.length, 1);
  assert.equal(def.notes[0].id, n1.id);
  assert.equal(def.notes[0].text, "M6 thread hole");
  assert.equal(def.notes[0].category, "spec");

  const updated = updateNoteInDef(def, n1.id, {
    text: "M8 thread hole",
    category: "issue",
  });
  assert.equal(updated.text, "M8 thread hole");
  assert.equal(updated.category, "issue");
  assert.equal(updated.color, NOTE_CATEGORIES.issue.color);

  const deleted = deleteNoteFromDef(def, n1.id);
  assert.equal(deleted, true);
  assert.equal(def.notes.length, 0);

  const deleteNonExistent = deleteNoteFromDef(def, "no_such_id");
  assert.equal(deleteNonExistent, false);
});

test("translateNotes updates all 3D points during normalization", () => {
  const notes = [
    { id: "1", point: { x: 10, y: 20, z: 30 } },
    { id: "2", point: { x: -5, y: 0, z: 15 } },
  ];
  translateNotes(notes, -5, 10, 2);

  assert.equal(notes[0].point.x, 5);
  assert.equal(notes[0].point.y, 30);
  assert.equal(notes[0].point.z, 32);

  assert.equal(notes[1].point.x, -10);
  assert.equal(notes[1].point.y, 10);
  assert.equal(notes[1].point.z, 17);
});

test("face painting and appearance override upserting", () => {
  const def = { appearances: [] };
  const faceRef = { persistentId: "body:part1:face:top", kind: "face" };

  const override = applyFacePaint(def, faceRef, {
    color: "#eab308",
    metal: 0.8,
    rough: 0.2,
    name: "Brass Coating",
  });

  assert.equal(def.appearances.length, 1);
  assert.equal(def.appearances[0].persistentId, "body:part1:face:top");
  assert.equal(def.appearances[0].color, "#eab308");
  assert.equal(def.appearances[0].metal, 0.8);
  assert.equal(def.appearances[0].rough, 0.2);

  // Re-painting the same face updates it rather than duplicating
  applyFacePaint(def, faceRef, {
    color: "#2563eb",
    metal: 0.1,
    rough: 0.4,
  });

  assert.equal(def.appearances.length, 1);
  assert.equal(def.appearances[0].color, "#2563eb");

  // Sample face appearance
  const sampled = sampleFaceAppearance(def, faceRef, null);
  assert.equal(sampled.color, "#2563eb");
  assert.equal(sampled.metal, 0.1);

  // Clear face paint
  const cleared = clearFacePaint(def, faceRef);
  assert.equal(cleared, true);
  assert.equal(def.appearances.length, 0);
});

test("body painting applies properties to part directly", () => {
  const part = { id: "p1", color: "#999999", metal: 0.1, rough: 0.5 };
  applyBodyPaint(part, {
    color: "#dc2626",
    metal: 0.6,
    rough: 0.3,
    name: "Anodized Red",
  });

  assert.equal(part.color, "#dc2626");
  assert.equal(part.metal, 0.6);
  assert.equal(part.rough, 0.3);
  assert.equal(part.materialName, "Anodized Red");

  const sampled = sampleFaceAppearance({ appearances: [] }, null, part);
  assert.equal(sampled.color, "#dc2626");
  assert.equal(sampled.metal, 0.6);
});

test("curated swatches are valid", () => {
  assert.ok(CURATED_SWATCHES.length >= 10);
  for (const swatch of CURATED_SWATCHES) {
    assert.ok(swatch.name);
    assert.match(swatch.color, /^#[0-9a-fA-F]{6}$/);
    assert.ok(swatch.metal >= 0 && swatch.metal <= 1);
    assert.ok(swatch.rough >= 0 && swatch.rough <= 1);
  }
});

test("markup stroke creation, deletion, clearing, and translation", () => {
  const def = { markups: [] };
  const stroke = addMarkupToDef(def, {
    color: "#ef4444",
    width: 4,
    points: [
      { x: 10, y: 15, z: 20 },
      { x: 20, y: 25, z: 30 },
      { x: 30, y: 35, z: 40 },
    ],
  });

  assert.ok(stroke);
  assert.equal(def.markups.length, 1);
  assert.equal(def.markups[0].points.length, 3);

  translateMarkups(def.markups, 5, -5, 10);
  assert.equal(def.markups[0].points[0].x, 15);
  assert.equal(def.markups[0].points[0].y, 10);
  assert.equal(def.markups[0].points[0].z, 30);

  deleteMarkupFromDef(def, stroke.id);
  assert.equal(def.markups.length, 0);

  addMarkupToDef(def, { points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
  assert.equal(def.markups.length, 1);
  clearMarkupsFromDef(def);
  assert.equal(def.markups.length, 0);
});

/* The schema half of the same feature. Notes, markups and per-face appearance
   are written onto the definition by the editor, so a definition that carries
   them has to survive the functions that build one. migrateDefinition() always
   worked, but only because of its unknown-key catch-all — the field list
   itself did not mention them, so every direct caller silently dropped them. */
test("notes, markups and appearances survive createDefinition", async () => {
  const { createDefinition, migrateDefinition } = await import("../js/core/schema.js");
  const authored = {
    notes: [{ id: "n1", text: "check clearance", point: { x: 1, y: 2, z: 3 } }],
    markups: [{ id: "m1", points: [{ x: 0, y: 0 }, { x: 4, y: 4 }], color: "#f00" }],
    appearances: [{ kind: "face", persistentId: "body:face:top", color: "#0f0" }],
  };

  const def = createDefinition({ name: "Annotated", ...authored });
  assert.deepEqual(def.notes, authored.notes, "notes are part of the document");
  assert.deepEqual(def.markups, authored.markups);
  assert.deepEqual(def.appearances, authored.appearances);

  // and they are cloned, not aliased, like every other domain field
  def.notes[0].text = "edited";
  assert.equal(authored.notes[0].text, "check clearance", "createDefinition deep-clones");

  // a definition with none of them still gets the empty arrays the editor expects
  const bare = createDefinition({ name: "Plain" });
  assert.deepEqual(bare.notes, []);
  assert.deepEqual(bare.markups, []);
  assert.deepEqual(bare.appearances, []);

  // and the load path keeps behaving the same way
  const migrated = migrateDefinition({ ...authored, key: "k", name: "Annotated" });
  assert.deepEqual(migrated.notes, authored.notes);
  assert.deepEqual(migrated.markups, authored.markups);
  assert.deepEqual(migrated.appearances, authored.appearances);
});
