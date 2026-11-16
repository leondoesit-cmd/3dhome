// js/furniture_api.js measureVSpanSoon before three.js has loaded: nothing can
// be measured, so it must not announce "vspan:ready" (whose repaint asks again,
// which announced again, once per idle slice for as long as three was missing).
// In Node three never loads (no "three" package), the case where it never did.
import test from "node:test";
import assert from "node:assert/strict";
import { knownVSpan, measureVSpanSoon } from "../js/furniture_api.js";
import { FURN } from "../js/furniture.js";
import { threeLoaded } from "../js/three_lazy.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("no vspan:ready, and no re-queue, while three is not there", async () => {
  assert.equal(threeLoaded(), false);
  const type = Object.keys(FURN)[0];
  const piece = { id: "p1", type, x: 0, z: 0, w: 61, d: 59, h: 87 };
  const hadWindow = "window" in globalThis, before = globalThis.window;
  const win = new EventTarget();
  globalThis.window = win;
  let ready = 0, asks = 0;
  // what the plan does on "vspan:ready": repaint, and the painter asks for the span again
  win.addEventListener("vspan:ready", () => { ready++; if (asks++ < 50) measureVSpanSoon(piece); });
  try {
    assert.equal(knownVSpan(piece), null);
    measureVSpanSoon(piece);
    await sleep(250);
    assert.equal(ready, 0, "an idle slice that measured nothing announced vspan:ready");
    // asked again (a repaint): already waiting for three, nothing new is queued
    measureVSpanSoon(piece);
    await sleep(100);
    assert.equal(ready, 0);
    assert.equal(knownVSpan(piece), null);
  } finally {
    if (hadWindow) globalThis.window = before;
    else delete globalThis.window;
  }
});
