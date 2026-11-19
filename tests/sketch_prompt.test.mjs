import test from "node:test";
import assert from "node:assert/strict";
import { sketchPromptOwner } from "../js/modeler/sketch_prompt.js";
import { modelerSource } from "./helpers/modeler_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import { stylesSource } from "./helpers/styles_source.mjs";

test("outside a sketch the coach and the hint do not compete", () => {
  assert.equal(sketchPromptOwner({ sketchStep: false, tool: "srect", coachShown: true }), "both");
  assert.equal(sketchPromptOwner({ sketchStep: false, tool: "select", coachShown: true }), "both");
  assert.equal(sketchPromptOwner(), "both");
});

test("in a sketch an armed tool's instruction is the one prompt", () => {
  for (const tool of ["srect", "scirc", "wall", "sarc", "trim", "dim", "spoly"])
    assert.equal(sketchPromptOwner({ sketchStep: true, tool, coachShown: true }), "hint", tool);
});

test("in a sketch with no tool armed the coach's next step speaks, unless the coach is off", () => {
  assert.equal(sketchPromptOwner({ sketchStep: true, tool: "select", coachShown: true }), "coach");
  assert.equal(sketchPromptOwner({ sketchStep: true, tool: null, coachShown: true }), "coach");
  assert.equal(sketchPromptOwner({ sketchStep: true, tool: "select", coachShown: false }), "hint");
});

test("syncCoach and syncHint both follow the one owner", () => {
  const source = modelerSource();
  const coach = sourceFunctionText(source, "syncCoach");
  assert.match(coach, /var speaker = sketchPromptSpeaker\(\);/);
  assert.match(coach, /var show = coachAvailable\(\) && speaker !== "hint";/);
  const speaker = sourceFunctionText(source, "sketchPromptSpeaker");
  assert.match(speaker, /currentWorkflowStep\(\) === "sketch"/);
  assert.match(speaker, /!E\.facePick/);
  const hint = sourceFunctionText(source, "syncHint");
  assert.match(hint, /hint\.classList\.toggle\("md-hint-yield", speaker === "coach"\);/);
  assert.match(hint, /if \(speaker !== E\._sketchPromptSpeaker\) syncCoach\(\);/);
  // the yield comes after the flash check, so a flash keeps the element
  assert.ok(hint.indexOf("flashHolding()") < hint.indexOf("md-hint-yield"));
  assert.match(stylesSource(), /#modeler \.md-hint\.md-hint-yield:not\(\.flash\) \{ opacity: 0; visibility: hidden; \}/);
});
