// Grounding for AI proposals: name what the AI picked, check it against the
// live plan, and compare lettered candidates (js/agent_grounding.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groundProposal, groundCandidates, proposalParts, checksLevel } from "../js/agent_grounding.js";

const src = (f) => readFileSync(new URL("../js/" + f, import.meta.url), "utf8");

// A 5 m × 4 m living room, one wall along its north edge, a door swing in the
// south-east corner, a sofa, an armchair and a ceiling light over the middle.
const scene = () => ({
  items: [
    { id: 12, type: "sofa", x: 100, z: 100, w: 200, d: 90, rot: 0, elev: 0, h: 80 },
    { id: 13, type: "armchair", x: 300, z: 100, w: 80, d: 80, rot: 0, elev: 0, h: 80 },
    { id: 16, type: "ceilingLight", x: 250, z: 200, w: 46, d: 46, rot: 0, elev: 239, h: 9 },
    { id: 20, type: "rug", x: 250, z: 300, w: 150, d: 100, rot: 0, elev: 0, h: 1, blocksPlacement: false },
  ],
  walls: [{ id: 3, thickness: 10, physical: true, points: [{ x: 0, z: 0 }, { x: 500, z: 0 }] }],
  rooms: [{ key: "1,2,3,4", pts: [{ x: 0, z: 0 }, { x: 500, z: 0 }, { x: 500, z: 400 }, { x: 0, z: 400 }] }],
  roomNames: { "1,2,3,4": "Living room" },
  names: { types: { sofa: "Sofa", armchair: "Armchair", ceilingLight: "Ceiling light", rug: "Rug", tv: "TV" }, items: {} },
  swings: [{ openingId: 7, band: { lo: 4, hi: 209 }, poly: [{ x: 400, z: 300 }, { x: 490, z: 300 }, { x: 490, z: 390 }, { x: 400, z: 390 }] }],
});
const move = (x, z, extra) => ({
  ok: true, commandId: "item.move",
  plan: { params: Object.assign({ itemId: 12, from: { x: 100, z: 100 }, to: { x, z } }, extra) },
  preview: { kind: "item-move", center: { x, z }, width: 200, depth: 90, rotation: 0 },
});
const codes = (checks) => checks.map((c) => c.level + ":" + c.code);

test("a move names the item by name and id, and the room it lands in", () => {
  const { parts } = groundProposal(move(250, 250), scene());
  assert.equal(parts.length, 1);
  assert.equal(parts[0].name, "Sofa");
  assert.equal(parts[0].id, 12);
  assert.equal(parts[0].action, "move");
  assert.equal(parts[0].room, "Living room");
});

test("overlaps name what they hit; the item's own old place never counts", () => {
  const onChair = groundProposal(move(300, 120), scene());
  const overlap = onChair.checks.find((c) => c.code === "overlap");
  assert.equal(overlap.level, "warn");
  assert.equal(overlap.with, "Armchair F13");
  // Nudging the sofa 10 cm overlaps only where it stood, which is not a clash.
  const nudge = groundProposal(move(110, 100), scene());
  assert.equal(nudge.checks.find((c) => c.code === "clear").level, "ok");
});

test("height bands: a ceiling light above never blocks, a rug that does not block is ignored", () => {
  const under = groundProposal(move(250, 250), scene()); // under the light and over the rug
  assert.ok(codes(under.checks).includes("ok:clear"), codes(under.checks).join(" "));
});

test("crossing a wall, a door swing and leaving every room are each reported", () => {
  const { checks } = groundProposal(move(445, 330), scene());
  assert.ok(codes(checks).includes("warn:swing"));
  assert.equal(checks.find((c) => c.code === "swing").door, "D7");
  const out = groundProposal(move(250, 20), scene()).checks; // straddles the north wall
  assert.ok(codes(out).includes("warn:wall"));
  const outside = groundProposal(move(700, 200), scene()).checks;
  assert.ok(codes(outside).includes("warn:outside"));
  assert.equal(checksLevel(outside), "warn");
});

test("candidates are lettered A–D and each carries its own checks", () => {
  const choice = { commandId: "choices", choices: [move(300, 120), move(445, 330), move(250, 250)] };
  const cands = groundCandidates(choice, scene());
  assert.deepEqual(cands.map((c) => c.letter), ["A", "B", "C"]);
  assert.deepEqual(cands.map((c) => checksLevel(c.checks)), ["warn", "warn", "ok"]);
  assert.ok(cands.every((c) => c.parts.every((p) => p.letter === c.letter)));
  // A single proposal is one unlettered candidate.
  const single = groundCandidates(move(250, 250), scene());
  assert.equal(single.length, 1);
  assert.equal(single[0].letter, null);
});

test("a batch checks its own pieces against each other", () => {
  const place = (x, z) => ({ commandId: "item.place", plan: { params: { type: "tv", x, z, w: 120, d: 40, h: 60, rot: 0 } },
    preview: { kind: "item", type: "tv", center: { x, z }, width: 120, depth: 40, rotation: 0 } });
  const batch = { commandId: "batch", commands: [place(250, 300), place(260, 305)] };
  const { parts, checks } = groundProposal(batch, scene());
  assert.deepEqual(parts.map((p) => p.action + ":" + p.name), ["new:TV", "new:TV"]);
  assert.equal(checks.find((c) => c.code === "overlap" && c.part === 0).with, "TV");
});

test("walls, openings and rooms are named by what they are and sized", () => {
  const wall = { commandId: "wall.draw", plan: { params: { from: { x: 0, z: 200 }, to: { x: 320, z: 200 } } }, preview: { kind: "wall", from: { x: 0, z: 200 }, to: { x: 320, z: 200 } } };
  const door = { commandId: "opening.place", plan: { params: { wallId: 3, type: "door", width: 90 } }, preview: { kind: "opening", wallId: 3, center: { x: 250, z: 0 } } };
  const room = { commandId: "room.create", plan: { params: { bounds: { x0: 0, z0: 0, x1: 300, z1: 400 } } }, preview: { kind: "room", outline: [{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 300, z: 400 }, { x: 0, z: 400 }] } };
  const g = groundProposal({ commandId: "batch", commands: [wall, door, room] }, scene());
  assert.deepEqual(g.parts.map((p) => p.kind), ["wall", "door", "room"]);
  assert.equal(Math.round(g.parts[0].length), 320);
  assert.equal(g.parts[1].hostWallId, 3);
  assert.equal(g.parts[2].area, 12);
  assert.deepEqual(codes(g.checks), ["ok:wallLength", "ok:fitsWall", "ok:roomArea"]);
});

test("nothing checked means no checks at all — the card never claims all clear", () => {
  const g = groundProposal({ commandId: "nothing" }, scene());
  assert.deepEqual(g.parts, []);
  assert.deepEqual(g.checks, []);
  assert.equal(checksLevel(g.checks), "ok");
  assert.match(src("ui_agent.js"), /function checksSummary\(checks\) \{\s*if \(!checks\.length\) return "";/);
});

test("the proposal card grounds, compares and offers undo and a hand correction", () => {
  const ui = src("ui_agent.js");
  assert.match(ui, /var candidates = groundCandidates\(proposal, scene\);/);
  // All candidates on the plan at once — no auto-cycling carousel.
  assert.match(ui, /renderAgentCandidates\(candidates\.map/);
  assert.doesNotMatch(ui, /setInterval\(function \(\) \{\s*if \(!choiceCard\.isConnected\)/);
  // Undo only while the AI's step is still the latest one.
  assert.match(ui, /currentHistoryId\(\) !== result\.historyId/);
  assert.match(ui, /t\("ag_adjust"\)/);
  // AI steps are badged in the history.
  assert.match(src("ui_history.js"), /var byAi = \/\^AI:\/\.test/);
  assert.match(src("interaction.js"), /label: proposals\.length > 1 \? "AI: batch change" : "AI: " \+ requests\[0\]\.command\.id/);
  for (const f of ["en", "he"]) for (const key of ["ag_parts", "ag_chk_overlap", "ag_apply_option", "ag_undo_later", "ag_adjust"])
    assert.match(src("i18n/" + f + ".js"), new RegExp("\\n  " + key + ": "), f + " " + key);
});

test("parts ignore commands they do not understand instead of guessing", () => {
  assert.deepEqual(proposalParts({ commandId: "document.generate_apartment", plan: { params: {} } }, scene()), []);
});

test("a pending card is grounded again once real heights are known, and refusals are worded", () => {
  const ui = src("ui_agent.js");
  assert.match(ui, /window\.addEventListener\("vspan:ready", again\);/);
  assert.match(ui, /if \(!card\.isConnected \|\| pendingProposalCard !== card\) return;/);
  // Both cards — the single proposal and the lettered choices — register it.
  assert.equal((ui.match(/^\s+regroundWhenHeightsKnown\((choiceCard|card), proposal, function/gm) || []).length, 2);
  // The layer rule an AI move most often hits, in words both languages carry.
  for (const f of ["en", "he"]) assert.match(src("i18n/" + f + ".js"), /\n  ag_why_PERMISSION_DENIED: "/);
  assert.match(ui, /t\("agent_failed"\) \+ ": " \+ failureText\(result\.reason\)/);
});

/* ---- the owner's decision: the AI is exempt from the work-set rule ---- */
import { aiCanMove, canDrag } from "../js/layers.js";
import { S } from "../js/state.js";

test("the AI may move furniture on a layer that is only auto-locked, never past a hand-set lock", () => {
  const savedSet = S.workSet, saved = JSON.stringify(S.layers.furniture);
  const sofa = { kind: "item", ref: { id: 1, type: "sofa" } };
  try {
    // Structure is being edited, so furniture is auto-locked: a hand drag is refused, the AI is not.
    S.workSet = "structure";
    Object.assign(S.layers.furniture, { vis: "show", locked: true, autoLock: true, pickOverride: null });
    assert.equal(canDrag(sofa), false);
    assert.equal(aiCanMove(sofa), true);
    // A padlock set by hand clears autoLock — that one the AI respects.
    Object.assign(S.layers.furniture, { locked: true, autoLock: false });
    assert.equal(aiCanMove(sofa), false);
    // So is a pinned piece, whatever the layer.
    Object.assign(S.layers.furniture, { locked: false, autoLock: true });
    assert.equal(aiCanMove({ kind: "item", ref: { id: 2, type: "sofa", locked: true } }), false);
  } finally {
    S.workSet = savedSet;
    S.layers.furniture = JSON.parse(saved);
  }
  // Only the AI's own paths carry the exemption; the layout tools keep the rule.
  const runtime = src("agent_runtime.js");
  assert.equal((runtime.match(/previewPlannerCommand\([^)]*, AI\)/g) || []).length, 5);
  assert.doesNotMatch(src("ui_layout_tools.js"), /ai: true/);
  assert.match(src("interaction.js"), /\(ai \? aiCanMove : canDrag\)\(\{ kind: "item", ref: item \}\)/);
});

test("the candidates and their tags are drawn in 3D too, on the overlay, never in the scene", () => {
  const preview = src("agent_preview.js");
  // Painted on the planner's 3D overlay after every frame, with its projector.
  assert.match(preview, /window\.addEventListener\("planner-overlay-3d", paint3D\);/);
  assert.match(src("planner_3d.js"), /new CustomEvent\('planner-overlay-3d',\{detail:\{context:c,project,path,label/);
  // Same set as the plan, repainted when it changes and cleared with it.
  assert.match(preview, /shown3D = list && list\.length \? lastSet : null;\s*requestRender\(\);/);
  assert.match(preview, /if \(shown3D\) \{ shown3D = null; requestRender\(\); \}/);
  // Boxes at the item's real height; openings in the plane of their wall.
  assert.match(preview, /var lo = itemElev\(spec\), hi = lo \+ itemHeight\(spec\);/);
  assert.match(preview, /tx = \(g\.b\.x - g\.a\.x\) \/ g\.L; tz = \(g\.b\.z - g\.a\.z\) \/ g\.L;/);
  // Nothing is added to the THREE scene.
  assert.doesNotMatch(preview, /getMainScene|scene\.add\(/);
});
