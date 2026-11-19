import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import { adaptBatch, pickBudget } from "../js/device_budget.js";
import * as materials from "../js/pbr_material.js";
import { THREE } from "../js/three_lazy.js";

test("a cold plan finishes while unrelated planner bitmaps are still decoding", async t => {
  const src = readFileSync(new URL("../js/plan_sprites.js", import.meta.url), "utf8");
  let clock = 0, builds = 0;
  // Keep one real material triplet pending throughout the simulated dwell.
  // Its loader uses a manual completion callback in place of a decoder.
  const decodes = [];
  globalThis.document = {};
  THREE.TextureLoader = class {
    load(url, done) {
      const texture = { userData: {} };
      decodes.push(() => { texture.image = { url }; done(texture); });
      return texture;
    }
  };
  t.after(() => {
    decodes.forEach(finish => finish());
    delete THREE.TextureLoader;
    delete globalThis.document;
  });
  materials.pbrTextures({ id: "slow-hidden-wall" });
  assert.equal(decodes.length, 3);
  assert.ok(materials.pbrLoadsPending());
  const prepared = [];
  class Group {
    children = [];
    updateMatrixWorld() {}
  }
  const box = { min: { x: 0 }, max: { x: 10 }, isEmpty: () => false };
  const deps = {
    THREE: { Group, Box3: class { setFromObject() { return box; } } },
    now: () => clock, texPx: () => 256, LOAD_WAIT_MS: 3000,
    buildItem(model) { builds++; clock += 3; model.children.push({}); },
    clearGroup(model) { model.children.length = 0; },
    pbrLoading: materials.pbrLoading,
    wait(ms) { clock += ms; return Promise.resolve(); },
    pictureMaterialLoads: materials.pictureMaterialLoads,
    texturesPending: () => false, shrinkAll: async () => {},
    spriteRect: () => ({ x0: 0, x1: 10, z0: 0, z1: 10 }),
    rememberVSpan() {}, vSpanKeyOf() {}, spanOfBox() {}, release: () => null,
  };
  const prepare = Function(...Object.keys(deps), "return " + sourceFunctionText(src, "prepare"))(...Object.values(deps));
  let batch = 4;
  while (prepared.length < 34 && clock < 3000) {
    let longest = 0;
    for (let i = 0; i < batch && prepared.length < 34 && clock < 3000; i++) {
      const p = await prepare({ w: 10, d: 10 }, 64);
      if (clock >= 3000) break;
      assert.equal(p.prov, false);
      prepared.push(p);
      longest = Math.max(longest, p.syncMs);
    }
    clock += 80; // shared compile and GPU drain
    batch = adaptBatch(batch, { longTaskMs: longest }, pickBudget({ cores: 16, bakeMs: longest }).bakesPerSlice);
  }
  assert.equal(prepared.length, 34, "every exact picture fits in the 3 s technical-plan wait");
  assert.equal(builds, 34);
  assert.ok(clock < 3000);
});

test("cold technical prewarm drains shared pictures during short idle slots before the switch", async t => {
  // Use the real enqueue, key, scheduler, ready listener, pump and cache.
  // Substitute the asynchronous GPU backend and pixel readback in Node.
  const jobs = [], baked = [];
  let ready = false, requested = false;
  const hooks = registerHooks({
    resolve(name, context, next) {
      if (name === "three" || name.startsWith("three/")) {
        const path = name === "three" ? "three.webgpu.js" : name.slice(6);
        return { url: new URL("../vendor/three/" + path, import.meta.url).href, shortCircuit: true };
      }
      return next(name, context);
    },
    load(url, context, next) {
      const result = next(url, context);
      if (!url.endsWith("/plan_sprites.js?cold")) return result;
      const source = Buffer.from(result.source).toString();
      return { ...result, source: source.replace("offscreenGL, offscreenDead", "offscreenGL as originalGL, offscreenDead")
        .replace(sourceFunctionText(source, "bakeBatch"), "async function bakeBatch(reqs) { return globalThis.bake(reqs); }") +
        "\nfunction offscreenGL() { return globalThis.getGL(); }\nexport { queue, cache };" };
    },
  });
  t.after(() => hooks.deregister());
  // Load the catalogue and other app dependencies before installing the mock DOM.
  await import("../js/plan_sprites.js");
  const { S } = await import("../js/state.js");
  S.planStyle = "technical";
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  globalThis.getGL = () => { requested = true; return ready; };
  globalThis.requestIdleCallback = fn => jobs.push(fn);
  globalThis.bake = reqs => reqs.map(req => {
    baked.push(req.key);
    return { img: {}, px: 64, bucket: req.bucket };
  });
  t.after(() => {
    for (const k of ["window", "document", "getGL", "requestIdleCallback", "bake"]) delete globalThis[k];
  });
  const sprites = await import("../js/plan_sprites.js?cold");
  await new Promise(resolve => setImmediate(resolve)); // empty disk index
  const a = { id: 1, type: "chair", w: 42, d: 45, h: 92 }, b = { ...a, id: 2 };
  for (const it of [a, b]) {
    sprites.itemSprite(it, 1, 1);
    sprites.prebakeSprite(it, 128);
  }
  const queuedKeys = sprites.queue.size, startedBeforeIdle = requested;
  ready = true;
  window.dispatchEvent(new Event("thumbsReady"));
  for (let turn = 0; turn < 32 && jobs.length; turn++) {
    jobs.shift()({ timeRemaining: () => 2, didTimeout: false });
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.deepEqual({ queuedKeys, startedBeforeIdle, readyBeforeSwitch: sprites.cache.size, bakes: baked.length },
    { queuedKeys: 2, startedBeforeIdle: true, readyBeforeSwitch: 2, bakes: 2 });
  S.planStyle = "presentation";
  assert.equal(sprites.itemSprite(a, 1, 1)?.bucket, 64);
  assert.equal(sprites.itemSprite(a, 1, 1), sprites.itemSprite(b, 1, 1));
  assert.equal(sprites.queue.size, 0);
});
