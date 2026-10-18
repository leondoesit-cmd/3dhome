// The planner's lit shaders are keyed on things that must not churn per
// rebuild. three's LightsNode hashes every light OBJECT's id (and sorts the
// lights by it), and a TSL literal is part of the shader text. Rebuilt lights
// or size-dependent literals made every rebuild regenerate the node graph of
// every lit material, and often recompile all ~16 big planner programs, at
// 1-3 s apiece on the WebGL2 fallback.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// A core.autocrlf checkout has CRLF on disk; the patterns below match LF.
const view3d = readFileSync(join(root, "js/view3d.js"), "utf8").replace(/\r\n/g, "\n");
const pbr = readFileSync(join(root, "js/pbr_material.js"), "utf8").replace(/\r\n/g, "\n");

function fnBody(src, name) {
  const m = src.match(new RegExp("\\nfunction " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n"));
  assert.ok(m, name + " exists");
  return m[0];
}

test("planner point and spot lights come from the reuse pool, not fresh objects", () => {
  const take = fnBody(view3d, "takeLight");
  const outside = view3d.replace(take, "");
  assert.doesNotMatch(outside, /new THREE\.(?:Point|Spot)Light\(/, "a planner light built outside takeLight gets a new id every rebuild");
  assert.match(take, /spare\.sort\(function \(a, b\) \{ return a\.id - b\.id; \}\)/, "lowest id first keeps the light order stable");
  assert.match(take, /l\.castShadow = false;/, "a reused light starts without a shadow, like a new one");
});

test("lights go back to the pool when their build is thrown away", () => {
  const drop = fnBody(view3d, "dropItem");
  assert.ok(drop.indexOf("releaseItemLights(c.g)") >= 0 && drop.indexOf("releaseItemLights(c.g)") < drop.indexOf("disposeSubtree(c.g)"),
    "a dropped lamp hands its light back before the group is disposed");
  assert.match(view3d, /windowLights\.forEach\(releaseLight\);[^\n]*\n\s*windowLights = \[\];\n\s*S\.openings\.forEach/,
    "window daylight returns its lights before the windows are lit again");
  assert.match(view3d, /takeLight\("SpotLight", 0xcfe2f2[^\n]*\n[^\n]*takeLight\("PointLight", 0xcfe2f2[^\n]*\n\s*windowLights\.push\(pl\);/);
  assert.match(fnBody(view3d, "releaseLight"), /drawnShadows\.delete\(l\.shadow\);/, "a reused caster redraws its shadow");
});

test("library surface materials take repeat and tint as uniforms, not shader literals", () => {
  const m = pbr.match(/export function pbrSurfaceMaterial[\s\S]*?\n}\n/);
  assert.ok(m, "pbrSurfaceMaterial exists");
  const body = m[0];
  assert.match(body, /T\.uv\(\)\.mul\(T\.uniform\(new THREE\.Vector2\(rep\[0\], rep\[1\]\)\)\)/);
  assert.match(body, /var tint = T\.uniform\(new THREE\.Color\(/);
  assert.doesNotMatch(body, /T\.vec2\(rep\[0\]|T\.color\(o\.tint/, "a literal repeat or tint compiles one program per surface size or colour");
});
