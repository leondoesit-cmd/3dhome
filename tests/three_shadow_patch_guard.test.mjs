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

/* js/gpu.js sizeShadowMapsAtOnce: a shadow map's render target is created at
   its own size when three makes it, so its first draw never destroys a depth
   texture a material has already bound. */
const SIZE_UPGRADE = "three changed under js/gpu.js sizeShadowMapsAtOnce — re-verify the patch against this version";

test("both shadow node kinds still make their render target in setupRenderTarget", () => {
  for (const name of ["ShadowNode", "PointShadowNode"]) {
    const body = classBody(name);
    const at = body.indexOf("\tsetupRenderTarget( shadow, builder ) {");
    assert.ok(at >= 0, SIZE_UPGRADE + " (" + name + ".setupRenderTarget moved)");
    assert.match(body.slice(at, body.indexOf("\n\t}\n", at)), /return \{ shadowMap, depthTexture \};/, SIZE_UPGRADE);
    assert.ok(three.split("\nexport {").pop().includes(" " + name + ","), SIZE_UPGRADE + " (" + name + " export)");
  }
  assert.match(classBody("PointShadowNode"), /^\nclass PointShadowNode extends ShadowNode /, SIZE_UPGRADE);
});

test("a render target first sized on its first draw still replaces a depth texture already bound", () => {
  // the failure the patch prevents: an unsized target re-creates its depth texture
  const textures = classBody("Textures");
  assert.match(textures, /\tupdateRenderTarget\( renderTarget, activeMipmapLevel = 0 \) \{/, SIZE_UPGRADE);
  assert.match(textures, /if \( renderTargetData\.width !== size\.width \|\| size\.height !== renderTargetData\.height \) \{\s*textureNeedsUpdate = true;/, SIZE_UPGRADE);
  assert.match(textures, /if \( isRenderTarget && textureData\.initialized === true \) \{\s*(?:\/\/[^\n]*\s*)?backend\.destroyTexture\( texture \);/, SIZE_UPGRADE);
});

test("sizeShadowMapsAtOnce sizes every new target, in the subclass too", async () => {
  const { sizeShadowMapsAtOnce } = await import("../js/gpu.js");
  class FakeShadowNode { setupRenderTarget() { return { shadowMap: { kind: "2d" }, depthTexture: {} }; } }
  class FakePointShadowNode extends FakeShadowNode { setupRenderTarget() { return { shadowMap: { kind: "cube" }, depthTexture: {} }; } }
  sizeShadowMapsAtOnce([FakeShadowNode, FakePointShadowNode]);
  sizeShadowMapsAtOnce([FakeShadowNode, FakePointShadowNode]); // once is enough
  const sized = [];
  const builder = { renderer: { _textures: { updateRenderTarget: (rt) => sized.push(rt.kind) } } };
  const a = new FakeShadowNode().setupRenderTarget({}, builder);
  const b = new FakePointShadowNode().setupRenderTarget({}, builder);
  assert.deepEqual(sized, ["2d", "cube"], "each target sized exactly once, the subclass's own method included");
  assert.equal(a.shadowMap.kind, "2d");
  assert.equal(b.shadowMap.kind, "cube");
});
