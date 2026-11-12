// js/gpu.js compileSidesAsDrawn: compileAsync builds a transparent DoubleSide
// material's two passes at the sides the frame draws them (BackSide, then
// FrontSide), not at DoubleSide. Without it the idle shadow-set warm-up missed
// a table lamp's shade, and dusk built it on the spot (~0.8 s).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileSidesAsDrawn } from "../js/gpu.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const three = (await readFile(join(root, "vendor/three/three.webgpu.js"), "utf8")).replace(/\r\n/g, "\n");
const UPGRADE = "three changed under js/gpu.js compileSidesAsDrawn — re-verify the patch against this version";
const FrontSide = 0, BackSide = 1, DoubleSide = 2;

/* three r185's renderObject and compile queue, reduced to what the patch meets:
   the double pass flips material.side around two queued calls, and the queue is
   built only after renderObject has put DoubleSide back. */
function fakeRenderer() {
  class R {
    constructor() { this._compilationPromises = null; }
    _createObjectPipeline(object, material, scene, camera, lightsNode, group, clippingContext, passId) {
      if (this._compilationPromises !== null) {
        this._compilationPromises.push({ object, material, scene, camera, lightsNode, group, clippingContext, passId });
        return;
      }
      this.drawn = (this.drawn || []).concat({ material, side: material.side });
    }
    renderObject(object, material) {
      if (material.transparent === true && material.side === DoubleSide && material.forceSinglePass === false) {
        material.side = BackSide;
        this._createObjectPipeline(object, material, null, null, null, null, null, "backSide");
        material.side = FrontSide;
        this._createObjectPipeline(object, material, null, null, null, null, null, undefined);
        material.side = DoubleSide;
      } else this._createObjectPipeline(object, material, null, null, null, null, null, undefined);
    }
    compile(objects) {
      const queue = this._compilationPromises = [];
      for (const [object, material] of objects) this.renderObject(object, material);
      this._compilationPromises = null;
      // what the queue loop hands to _objects.get / the pipeline key
      return queue.map((item) => ({ material: item.material, side: item.material.side, passId: item.passId }));
    }
  }
  compileSidesAsDrawn(R);
  return new R();
}
const material = (props) => ({ id: 7, transparent: false, side: FrontSide, forceSinglePass: false, opacity: 1, ...props });

test("a transparent DoubleSide material compiles as its back pass and its front pass", () => {
  const shade = material({ transparent: true, side: DoubleSide, opacity: 0.9 });
  const built = fakeRenderer().compile([[{}, shade]]);
  assert.deepEqual(built.map((b) => [b.side, b.passId]), [[BackSide, "backSide"], [FrontSide, undefined]]);
  assert.equal(shade.side, DoubleSide, "the material itself is untouched");
  // a stand-in differs only in side: same id, opacity and every other key input
  for (const b of built) {
    assert.notEqual(b.material, shade);
    assert.equal(Object.getPrototypeOf(b.material), shade);
    assert.equal(b.material.id, shade.id);
    assert.equal(b.material.opacity, 0.9);
  }
  // later changes to the material reach the stand-in (it is a view, not a copy)
  shade.opacity = 0.5;
  assert.equal(built[0].material.opacity, 0.5);
});

test("the stand-ins are reused across warm-ups", () => {
  const shade = material({ transparent: true, side: DoubleSide });
  const r = fakeRenderer();
  const a = r.compile([[{}, shade]]), b = r.compile([[{}, shade]]);
  assert.equal(a[0].material, b[0].material);
  assert.equal(a[1].material, b[1].material);
});

test("everything else compiles with the material itself, at its own side", () => {
  const r = fakeRenderer();
  const opaque = material({ side: DoubleSide });
  const front = material({ transparent: true, side: FrontSide });
  const single = material({ transparent: true, side: DoubleSide, forceSinglePass: true });
  const built = r.compile([[{}, opaque], [{}, front], [{}, single]]);
  assert.equal(built[0].material, opaque); assert.equal(built[0].side, DoubleSide);
  assert.equal(built[1].material, front); assert.equal(built[1].side, FrontSide);
  assert.equal(built[2].material, single); assert.equal(built[2].side, DoubleSide);
});

test("a frame (no compile queue) is drawn with the material, at the side of each pass", () => {
  const shade = material({ transparent: true, side: DoubleSide });
  const r = fakeRenderer();
  r.renderObject({}, shade);
  assert.deepEqual(r.drawn.map((d) => [d.material === shade, d.side]), [[true, BackSide], [true, FrontSide]]);
});

test("the patch installs once", () => {
  class R { _createObjectPipeline() { this._compilationPromises.push({}); } }
  compileSidesAsDrawn(R);
  const once = R.prototype._createObjectPipeline;
  compileSidesAsDrawn(R);
  assert.equal(R.prototype._createObjectPipeline, once);
});

/* The vendored three still has the shape the patch relies on. */
test("three r185 still queues the double pass with the material and builds it later", () => {
  assert.match(three, /material\.side = BackSide;\s*this\._handleObjectFunction\( object, material, scene, camera, lightsNode, group, clippingContext, 'backSide' \);[^\n]*\s*material\.side = FrontSide;\s*this\._handleObjectFunction\( object, material, scene, camera, lightsNode, group, clippingContext, passId \);[^\n]*\s*material\.side = DoubleSide;/, UPGRADE);
  assert.match(three, /this\._compilationPromises\.push\( \{\s*object,\s*material,/, UPGRADE);
  assert.match(three, /for \( const item of compilationPromises \) \{\s*const renderObject = this\._objects\.get\( item\.object, item\.material,/, UPGRADE);
  assert.match(three, /descriptor\.cullMode = \( material\.side === DoubleSide \) \? GPUCullMode\.None : GPUCullMode\.Back;/, UPGRADE);
});
