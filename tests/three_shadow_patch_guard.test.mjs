// js/gpu.js keepShadowNodes patches three's AnalyticLightNode.setup, a private
// part of three. This pins the vendored three it was written against: when an
// upgrade changes the code below, re-verify the patch (does a light that stops
// casting still dispose its shadow node in setup()?) and update or drop it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const three = (await readFile(join(root, "vendor/three/three.webgpu.js"), "utf8")).replace(/\r\n/g, "\n");
const UPGRADE = "three changed under js/gpu.js keepShadowNodes — re-verify the patch against this version";

function classBody(name) {
  const i = three.indexOf("\nclass " + name + " ");
  assert.ok(i >= 0, UPGRADE + " (class " + name + " is gone)");
  const j = three.indexOf("\nclass ", i + 1);
  return three.slice(i, j < 0 ? undefined : j);
}

test("AnalyticLightNode.setup still disposes the shadow node of a light that stops casting", () => {
  const body = classBody("AnalyticLightNode");
  const at = body.indexOf("\tsetup( builder ) {");
  assert.ok(at >= 0, UPGRADE + " (setup( builder ) moved)");
  const setup = body.slice(at, body.indexOf("\n\t}\n", at));
  assert.match(setup, /if \( this\.light\.castShadow \) \{/, UPGRADE);
  assert.match(setup, /\} else if \( this\.shadowNode !== null \) \{\s*this\.shadowNode\.dispose\(\);\s*this\.shadowNode = null;/, UPGRADE);
  assert.match(body, /this\.shadowNode = null;/, UPGRADE + " (constructor no longer starts shadowNode at null)");
});

test("AnalyticLightNode is still exported for the patch to reach", () => {
  assert.ok(three.split("\nexport {").pop().includes(" AnalyticLightNode,"), UPGRADE);
});
