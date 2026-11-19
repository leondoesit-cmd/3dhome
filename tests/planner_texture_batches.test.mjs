import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { THREE } from "../js/three_lazy.js";
import { pbrTextures, pbrLoadsPending, pbrFailed, quietPbrLoads, pictureMaterialLoads } from "../js/pbr_material.js";

test("only a newly usable color, normal and ORM triplet invalidates scene and sprites", async t => {
  const changes = [];
  function replace(object, key, value) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, { configurable: true, writable: true, value });
    t.after(() => descriptor ? Object.defineProperty(object, key, descriptor) : delete object[key]);
  }
  replace(globalThis, "window", { dispatchEvent: e => changes.push(e.type) });
  replace(globalThis, "document", { createElement: () => ({ getContext: () => ({
    getExtension: () => null, getParameter: () => "Hardware"
  }) }) });
  replace(globalThis, "createImageBitmap", undefined);
  const pending = new Map();
  function channel(url) { return url.split("/").pop().split("_")[0]; }
  class Texture { constructor() { this.userData = {}; } }
  class Loader {
    load(url, success, progress, fail) {
      const tx = new Texture();
      pending.set(channel(url), { resolve() { tx.image = { url }; success(tx); }, reject: fail });
      return tx;
    }
  }
  replace(THREE, "TextureLoader", Loader);
  replace(THREE, "Texture", Texture);
  async function check(id, quietStart, failNormal) {
    pending.clear();
    changes.length = 0;
    const entry = { id };
    if (quietStart) quietPbrLoads(() => pbrTextures(entry));
    assert.equal(pbrTextures(entry), null);
    await nextTurn();
    assert.equal(pbrLoadsPending(), true);
    assert.equal(pending.size, 3, "one load per channel despite the second caller");
    pending.get("orm").resolve();
    await nextTurn();
    if (failNormal) pending.get("normal").reject(new Error("decode failed"));
    else pending.get("normal").resolve();
    await nextTurn();
    assert.equal(pbrTextures(entry), null);
    assert.equal(changes.length, 0);
    pending.get("color").resolve();
    await nextTurn();
    assert.equal(pbrLoadsPending(), false);
    assert.equal(pbrFailed(entry), failNormal);
    assert.equal(!!pbrTextures(entry), !failNormal);
    assert.deepEqual(changes, failNormal ? [] : ["customTextureLoaded"]);
  }
  await check("loader-test", true, false);
  await check("loader-error-test", false, true);
  pbrTextures({ id: "unrelated" });
  const unrelated = [...pending.values()];
  const model = { id: "picture" };
  const first = pictureMaterialLoads(() => pbrTextures(model));
  const shared = pictureMaterialLoads(() => pbrTextures(model));
  for (const request of pending.values()) request.resolve();
  await Promise.all([first, shared]);
  assert.ok(first && shared);
  assert.ok(pbrLoadsPending(), "the unrelated material is still decoding");
  assert.equal(pictureMaterialLoads(() => pbrTextures(model)), null);
  for (const request of unrelated) request.resolve();
  replace(globalThis, "fetch", async url => ({ ok: true, blob: async () => url }));
  replace(globalThis, "createImageBitmap", url => new Promise((resolve, reject) => {
    pending.set(channel(url), { resolve: () => resolve({ url }), reject });
  }));
  await check("bitmap-test", true, false);
  await check("bitmap-error-test", false, true);
});
