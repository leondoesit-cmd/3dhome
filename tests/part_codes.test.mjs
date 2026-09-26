// Short part codes (js/part_codes.js): a letter for the kind plus the real id —
// the owner's decision of 2026-09-26, never a per-floor renumbering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { partCode, parsePartCode, findPartByCode, PART_LETTERS } from "../js/part_codes.js";
import { spatialDigest, AGENT_WORKFLOW } from "../js/agent_prompt.js";

const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

const plan = {
  walls: [{ id: 1 }, { id: 2 }],
  openings: [{ id: 5, type: "door", wall: 1 }, { id: 6, type: "window", wall: 2 }, { id: 9, type: "passage", wall: 2 }],
  items: [{ id: 13, type: "armchair" }, { id: 21, type: "cabsys", cab: {} }],
};

test("a code is the kind's letter and the object's own id", () => {
  assert.equal(partCode("wall", 12), "W12");
  assert.equal(partCode("opening", 5, { type: "door" }), "D5");
  assert.equal(partCode("opening", 6, { type: "window" }), "WN6");
  assert.equal(partCode("opening", 9, { type: "passage" }), "O9");
  assert.equal(partCode("item", 13), "F13");
  // A cabinet is furniture: converting a piece in the designer never renames it.
  assert.equal(partCode("item", 21, { type: "cabsys", cab: {} }), "F21");
  // Rooms are named by their walls, and nothing without an id gets a code.
  assert.equal(partCode("room", "1,2,3,4"), "");
  assert.equal(partCode("wall", null), "");
  assert.deepEqual(Object.values(PART_LETTERS), ["W", "D", "WN", "O", "F"]);
});

test("typed codes parse in any case and spacing; WN is a window, not wall N", () => {
  assert.deepEqual(parsePartCode("W12"), { kind: "wall", id: 12 });
  assert.deepEqual(parsePartCode(" wn 6 "), { kind: "window", id: 6 });
  assert.deepEqual(parsePartCode("f13"), { kind: "item", id: 13 });
  assert.deepEqual(parsePartCode("#13"), { kind: null, id: 13 });
  assert.deepEqual(parsePartCode("13"), { kind: null, id: 13 });
  for (const text of ["", "W", "sofa", "W12 north", "add a window", "X4"]) assert.equal(parsePartCode(text), null, text);
});

test("a code finds its part, and a wrong letter finds nothing rather than the wrong thing", () => {
  assert.equal(findPartByCode(plan, "W2").ref, plan.walls[1]);
  assert.equal(findPartByCode(plan, "F13").kind, "item");
  assert.equal(findPartByCode(plan, "13").ref.type, "armchair");
  assert.equal(findPartByCode(plan, "D13"), null); // 13 is an armchair
  assert.equal(findPartByCode(plan, "F99"), null);
  // A door that became a window still answers to D: only its letter moved.
  assert.equal(findPartByCode(plan, "D6").ref.type, "window");
});

test("the AI reads the same codes the user sees, and still sends plain ids", () => {
  const nodes = [{ x: 0, z: 0 }, { x: 400, z: 0 }];
  const digest = spatialDigest({ nodes, walls: [{ id: 3, a: 0, b: 1 }], items: [{ id: 13, type: "sofa", x: 1, z: 1, w: 10, d: 10 }] });
  assert.equal(digest.walls[0].code, "W3");
  assert.equal(digest.items[0].code, "F13");
  assert.match(AGENT_WORKFLOW, /W wall, D door, WN window, O other opening, F furniture/);
  assert.match(AGENT_WORKFLOW, /Command params still take the plain numeric id/);
  const ctx = src("js/agent_context.js");
  assert.match(ctx, /code: partCode\("wall", w\.id\),/);
  assert.match(ctx, /\{ code: partCode\("opening", o\.id, o\) \}/);
  assert.match(ctx, /p\.code = partCode\("item", it\.id\);/);
});

test("the AI card, its tags and the inspector card name parts by code", () => {
  const ui = src("js/ui_agent.js");
  assert.doesNotMatch(ui, /" #" \+ part\.id|"#" \+ part\.hostWallId/);
  assert.match(ui, /\{ wall: partCode\("wall", part\.hostWallId\) \}/);
  const shell = src("js/mobile_shell.js");
  assert.match(shell, /id = ref && ref\.id != null \? partCode\(sel\.kind, ref\.id, ref\) : "";/);
  for (const f of ["en", "he"]) assert.doesNotMatch(src("js/i18n/" + f + ".js"), /m_card_on_wall: "[^"]*#\{id\}/);
});

test("codes on the plan are a remembered toggle, and typing one selects it", () => {
  const labels = src("js/part_code_labels.js");
  assert.match(labels, /onAfterRender\(paint\);/);
  assert.match(labels, /localStorage\.getItem\(KEY\) === "1"/);
  // The bar answers a code before any tool name, and in AI mode before the AI.
  const ribbon = src("js/pro_ribbon.js");
  assert.match(ribbon, /var said = partCodeAnswer\(text\);\s*if \(said\) \{ toast\(said\); return true; \}\s*var tool = toolNamed\(text\);/);
  assert.match(ribbon, /var said = editor === "plan" && partCodeAnswer\(text\);/);
  assert.match(src("js/pro_catalog.js"), /T\("Part codes", "ph-hash", "pro:partCodes"\)/);
  assert.match(src("js/pro_actions.js"), /partCodes: \(\) => togglePartCodes\(\),/);
  for (const f of ["en", "he"]) for (const k of ["pc_shown", "pc_hidden", "pc_selected", "pc_missing"])
    assert.ok(src("js/i18n/" + f + ".js").includes(String.fromCharCode(10) + "  " + k + ": "), f + " " + k);
});
