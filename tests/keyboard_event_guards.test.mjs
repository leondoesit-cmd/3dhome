import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (name) => readFileSync(new URL("../js/" + name, import.meta.url), "utf8");

test("planner ignores keydown-like events without a key before shortcut handling", () => {
  const planner = source("interaction.js");
  const handler = planner.slice(planner.lastIndexOf('window.addEventListener("keydown", function (e) {'));
  const guard = handler.indexOf('if (typeof e.key !== "string" || !e.key) return;');
  assert.ok(guard >= 0, "malformed keyboard events are ignored");
  assert.ok(guard < handler.indexOf("hudKeydown(e)"), "the HUD never sees a missing key");
  assert.ok(guard < handler.indexOf('e.key.indexOf("Arrow")'), "arrow shortcuts never read a missing key");
});

test("model editor launch ignores keydown-like events without a key", () => {
  const launcher = source("modeler_launch.js");
  assert.match(launcher, /typeof e\.key !== "string"\s*\|\| e\.key\.toLowerCase\(\) !== "m"/);
});
