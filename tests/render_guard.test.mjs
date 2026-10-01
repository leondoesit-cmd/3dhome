import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { guardRenderReentry } from "../js/core/render_guard.js";

test("a render requested from inside a render does not nest; it runs once afterwards", () => {
  const queue = [];
  let depth = 0, maxDepth = 0, draws = 0, asked = 0;
  const render = guardRenderReentry(function () {
    depth++; maxDepth = Math.max(maxDepth, depth); draws++;
    // an overlay hook that repaints, and asks for a render every time it does
    if (asked++ < 1000) render();
    depth--;
  }, (fn) => queue.push(fn));
  render();
  assert.equal(maxDepth, 1, "the second request never nested inside the first");
  assert.equal(draws, 1);
  assert.equal(queue.length, 1, "and exactly one follow-up is queued, however many were asked for");
  queue.shift()();
  assert.equal(maxDepth, 1);
  assert.equal(draws, 2, "the follow-up painted the requested state");
});

test("an unbroken chain of re-entrant renders ends instead of overflowing the stack", () => {
  const queue = [];
  let frames = 0;
  const render = guardRenderReentry(function () { frames++; if (frames < 50) render(); }, (fn) => queue.push(fn));
  render();
  while (queue.length) queue.shift()();
  assert.equal(frames, 50, "one paint per frame, no recursion");
});

test("a throwing render releases the guard so the next frame still draws", () => {
  let n = 0;
  const render = guardRenderReentry(function () { if (n++ === 0) throw new Error("boom"); return "ok"; }, () => {});
  assert.throws(() => render(), /boom/);
  assert.equal(render(), "ok");
  assert.equal(render.isRendering(), false);
});

test("the editor view's render is wrapped by the guard", () => {
  const src = readFileSync(new URL("../js/editor_view.js", import.meta.url), "utf8");
  assert.match(src, /view\.render = guardRenderReentry\(view\.render, function \(fn\) \{ requestAnimationFrame\(fn\); \}\);/);
});
