// js/hidden_refresh.js: the planning guide (js/ui_planning_guide.js) skips its
// after-paint rebuild while its tab is hidden and catches up, once, the
// moment it shows again.
import test from "node:test";
import assert from "node:assert/strict";
import { hiddenRefreshGate } from "../js/hidden_refresh.js";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";

function fakes() {
  const observers = [];
  class Observer {
    constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); }
    observe(el) { this.targets.push(el); }
    disconnect() { this.targets = []; }
    fire() { if (this.targets.length) this.cb([]); }
  }
  const host = { shown: true, getClientRects() { return this.shown ? [{}] : []; } };
  return { observers, Observer, host, fireAll: () => observers.forEach((o) => o.fire()) };
}

test("hidden: the refresh is skipped; shown again: one render, before nothing else asks", () => {
  const f = fakes();
  let renders = 0;
  const skip = hiddenRefreshGate(() => { renders++; assert.equal(skip(f.host), false, "the catch-up render is not skipped"); }, f.Observer);
  assert.equal(skip(f.host), false, "visible: refresh");
  assert.equal(f.observers.length, 0, "nothing watched while visible");
  f.host.shown = false;
  for (let i = 0; i < 50; i++) assert.equal(skip(f.host), true, "hidden: skipped");
  assert.equal(f.observers.length, 1, "one observer for any number of skips");
  f.fireAll(); // a notification while still hidden
  assert.equal(renders, 0);
  f.host.shown = true;
  f.fireAll();
  assert.equal(renders, 1, "shown again: the panel is brought up to date");
  f.fireAll();
  assert.equal(renders, 1, "once: the observer is dropped after it");
  assert.equal(f.observers[0].targets.length, 0);
  // hidden again: watched again
  f.host.shown = false; skip(f.host); f.host.shown = true; f.fireAll();
  assert.equal(renders, 2);
});

test("a panel shown and refreshed by the plan before the observer fires renders once", () => {
  const f = fakes();
  let renders = 0;
  const skip = hiddenRefreshGate(() => renders++, f.Observer);
  f.host.shown = false; skip(f.host);
  f.host.shown = true;
  assert.equal(skip(f.host), false); // an after-paint refresh got there first
  f.fireAll();
  assert.equal(renders, 0, "the observer has nothing left to catch up");
});

test("without a ResizeObserver nothing is skipped", () => {
  const f = fakes();
  const skip = hiddenRefreshGate(() => {}, null);
  f.host.shown = false;
  assert.equal(skip(f.host), false);
});

test("the planning guide's after-paint render is gated on it (wiring)", () => {
  const src = moduleSource("js/ui_planning_guide.js");
  assert.match(src, /const skipWhileHidden = hiddenRefreshGate\(\(\) => renderPlanningGuide\(\)\)/);
  const fn = sourceFunctionText(src, "renderPlanningGuide");
  const gate = fn.indexOf("skipWhileHidden(host)"), area = fn.indexOf("activeFloorArea()");
  assert.ok(gate > 0 && gate < area, "checked before any area work");
});
