/* The presentation-plan picture queue's pure parts (js/plan_sprite_batch.js):
   docs/perf_review_fixes.md 1.1, 1.2, 3.1 and the input-stop rule. */
import test from "node:test";
import assert from "node:assert/strict";
import { pickBatch, storeCounted, quietStep, INPUT_QUIET_MS, fingerprint } from "../js/plan_sprite_batch.js";

const req = (key, pri, id) => ({ key, pri, it: { id } });

test("N requests for one picture produce one bake, and every item gets it", () => {
  const q = new Map();
  for (let i = 1; i <= 6; i++) q.set("chair" + i, req("K-chair", 100 + i, "chair" + i));
  q.set("sofa", req("K-sofa", 50, "sofa"));
  const batch = pickBatch(q, 4, () => false);
  assert.deepEqual(batch.map((b) => b.req.key), ["K-chair", "K-sofa"], "one entry per key, priority order");
  assert.equal(batch[0].also.length, 5, "the other five chairs ride along");
  assert.deepEqual(new Set([batch[0].req, ...batch[0].also].map((r) => r.it.id)),
    new Set(["chair1", "chair2", "chair3", "chair4", "chair5", "chair6"]));
  assert.equal(q.size, 0);
});

test("a batch takes the highest priorities, leaves the rest, and pulls queued duplicates of its keys", () => {
  const q = new Map([["a", req("A", 9, "a")], ["b", req("B", 8, "b")], ["c", req("C", 7, "c")], ["a2", req("A", 1, "a2")]]);
  const batch = pickBatch(q, 2, () => false);
  assert.deepEqual(batch.map((b) => b.id), ["a", "b"]);
  assert.deepEqual(batch[0].also.map((r) => r.it.id), ["a2"], "the low-priority duplicate would only bake A again");
  assert.deepEqual([...q.keys()], ["c"]);
});

test("a key already cached is dropped, not baked", () => {
  const q = new Map([["a", req("A", 9, "a")], ["b", req("B", 8, "b")]]);
  const batch = pickBatch(q, 3, (k) => k === "A");
  assert.deepEqual(batch.map((b) => b.req.key), ["B"]);
  assert.equal(q.size, 0);
});

test("storing one key twice counts its pixels once", () => {
  const cache = new Map();
  let px = storeCounted(cache, "k", { px: 100 }, 0, 1e9);
  px = storeCounted(cache, "k", { px: 100 }, px, 1e9);
  assert.equal(px, 100);
  px = storeCounted(cache, "k", { px: 40 }, px, 1e9);
  assert.equal(px, 40, "a replacement of another size");
  assert.equal(cache.size, 1);
});

test("the cache evicts the oldest past the budget, keeps the newest, and the count matches", () => {
  const cache = new Map();
  let px = 0;
  for (const k of ["a", "b", "c"]) px = storeCounted(cache, k, { px: 100 }, px, 250);
  assert.deepEqual([...cache.keys()], ["b", "c"]);
  assert.equal(px, 200);
  px = storeCounted(cache, "b", { px: 100 }, px, 250); // b used again: now newest
  px = storeCounted(cache, "d", { px: 100 }, px, 250);
  assert.deepEqual([...cache.keys()], ["b", "d"]);
  assert.equal(px, [...cache.values()].reduce((s, v) => s + v.px, 0));
  px = storeCounted(cache, "huge", { px: 1000 }, px, 250);
  assert.deepEqual([...cache.keys()], ["huge"], "the newest stays even over budget");
  assert.equal(px, 1000);
});

test("background bakes wait for quiet input, urgent ones go at once", () => {
  assert.deepEqual(quietStep({ urgent: true, now: 100, lastInput: 99 }), { go: true });
  assert.deepEqual(quietStep({ urgent: false, now: 1000, lastInput: 800 }), { waitMs: INPUT_QUIET_MS - 200 });
  assert.deepEqual(quietStep({ urgent: false, now: 5000, lastInput: 800 }), { idle: true });
  assert.deepEqual(quietStep({ urgent: false, now: 5, lastInput: -Infinity }), { idle: true });
});

test("the prewarm fingerprint moves with any item field and is stable otherwise", () => {
  const items = [{ id: 1, type: "sofa", x: 10.5, z: -3, w: 200, d: 90, finish: { color: "#aabbcc", parts: [1, 2] } },
    { id: 2, type: "chair", x: 0, z: 0, w: 50, d: 50 }];
  const base = fingerprint([items, 1.25, 2]);
  assert.equal(fingerprint([JSON.parse(JSON.stringify(items)), 1.25, 2]), base, "same content, other objects");
  const edits = [
    (a) => { a[0].x = 10.25; }, (a) => { a[0].finish.color = "#aabbcd"; }, (a) => { a[0].finish.parts.push(3); },
    (a) => { a[1].variant = "arm"; }, (a) => { a.pop(); }, (a) => { a[1].type = "stool"; }, (a) => { a[0].finish.parts[0] = 1.0000001; },
  ];
  for (const edit of edits) {
    const copy = JSON.parse(JSON.stringify(items));
    edit(copy);
    assert.notEqual(fingerprint([copy, 1.25, 2]), base, String(edit));
  }
  assert.notEqual(fingerprint([items, 1.3, 2]), base, "zoom");
  assert.notEqual(fingerprint([items, 1.25, 1]), base, "pixel ratio");
});

test("a height kept on disk is known at boot, before three has loaded (review 4.2)", async () => {
  const { knownVSpan, seedVSpan, vSpanKeyOf } = await import("../js/furniture_api.js");
  const { threeLoaded } = await import("../js/three_lazy.js");
  assert.equal(threeLoaded(), false);
  const sofa = { type: "sofa", w: 211, d: 93, h: 79 };
  assert.equal(knownVSpan(sofa), null);
  assert.equal(seedVSpan(vSpanKeyOf(sofa), { lo: 0, hi: 79.5 }), true);
  assert.deepEqual(knownVSpan(sofa), { lo: 0, hi: 79.5 });
});

test("the pump holds the renderer for pictures only while a batch bakes (review 4.1)", async () => {
  const { readFileSync } = await import("node:fs");
  const { stripComments } = await import("./source.mjs");
  const { sourceFunctionText } = await import("./helpers/source_function.mjs");
  const pump = sourceFunctionText(stripComments(readFileSync(new URL("../js/plan_sprites.js", import.meta.url), "utf8")), "pump");
  assert.match(pump, /if \(!urgent\) \{\s*setSpritesUrgent\(false\);\s*await quietSlot\(\);/);
  assert.match(pump, /setSpritesUrgent\(true\);[\s\S]*pickBatch\(queue, batchSize,/);
  assert.ok(pump.indexOf("await quietSlot()") < pump.indexOf("setSpritesUrgent(true)"), "parked waiting for quiet means the tiles may run");
  assert.match(pump, /batchSize = adaptBatch\(batchSize, \{ longTaskMs: sliceLongMs \}, top\);/);
});

test("the tile warm-up re-checks for a bake after its GPU drain, right before its readback", async () => {
  const { readFileSync } = await import("node:fs");
  const { stripComments } = await import("./source.mjs");
  const { sourceFunctionText } = await import("./helpers/source_function.mjs");
  const warm = sourceFunctionText(stripComments(readFileSync(new URL("../js/thumbs.js", import.meta.url), "utf8")), "warmOne");
  assert.match(warm, /await spritesFirst\(\);\s*const drained = gl\(\);\s*if \(drained\) await offscreenIdle\(drained\);\s*if \(!spritesBusy\(\)\) break;/);
  // no await between that last check and the snap
  const after = warm.slice(warm.indexOf("if (!spritesBusy()) break;"), warm.indexOf("url = snap(g, box)"));
  assert.doesNotMatch(after, /await /);
});
