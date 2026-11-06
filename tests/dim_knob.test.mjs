import { stylesSource } from "./helpers/styles_source.mjs";
import { readI18nSource } from "./helpers/i18n_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  angleDelta,
  baseStepFor,
  createDimScrub,
  decimalsFor,
  gainFor,
  stepFor,
  stepLadder,
} from "../js/dim_knob.js";

const ui = await readFile(new URL("../js/ui_dim_knob.js", import.meta.url), "utf8");
const props = await readFile(new URL("../js/ui.js", import.meta.url), "utf8");
const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
const css = stylesSource();
const i18n = await readI18nSource();

/* ---- the scrub engine --------------------------------------------------- */

test("a slow turn moves one base step per 6 degrees and never overshoots it", () => {
  const s = createDimScrub({ value: 100, base: 1 });
  assert.equal(s.rotate(6, 100), true);
  assert.equal(s.value, 101);
  assert.equal(s.step, 1, "a deliberate turn stays on the field's own unit");
  s.rotate(6, 100);
  s.rotate(6, 100);
  assert.equal(s.value, 103);
});

test("travel smaller than a step accumulates instead of stalling", () => {
  const s = createDimScrub({ value: 0, base: 1 });
  // the accumulator, not the displayed value, carries the remainder: three 2°
  // ticks add up to one step even though no single tick is worth one
  assert.equal(s.rotate(2, 100), false);
  assert.equal(s.value, 0);
  s.rotate(2, 100);
  s.rotate(2, 100);
  assert.equal(s.value, 1);
});

test("a fast flick both accelerates and lands on round numbers", () => {
  const s = createDimScrub({ value: 0, base: 1 });
  s.rotate(60, 20); // 3 deg/ms
  assert.equal(s.step, 10, "at speed the quantum climbs the ladder");
  assert.equal(s.value % 10, 0, "a flick never leaves 347.3 in a dimension box");
  assert.ok(s.value >= 100, "one flick covers a useful range, got " + s.value);
});

test("gain is flat below the knee and capped above it", () => {
  assert.equal(gainFor(0), 1);
  assert.equal(gainFor(0.2), 1);
  assert.ok(gainFor(0.6) > 1 && gainFor(0.6) < 6);
  assert.equal(gainFor(50), 12);
  assert.deepEqual(stepLadder(1), [1, 5, 10]);
  assert.deepEqual(stepLadder(0.5), [0.5, 2.5, 5]);
  assert.equal(stepFor(1, 1), 1);
  assert.equal(stepFor(1, 4), 5);
  assert.equal(stepFor(1, 9), 10);
});

test("min and max bound the accumulator, not just the readout", () => {
  const s = createDimScrub({ value: 10, base: 1, min: 5, max: 30 });
  s.rotate(-600, 3000);
  assert.equal(s.value, 5);
  // wind-up would otherwise cost 600 degrees of turning to come back
  s.rotate(6, 100);
  assert.equal(s.value, 6);
  s.rotate(600, 3000);
  assert.equal(s.value, 30);
});

test("a fractional step keeps its own precision", () => {
  const s = createDimScrub({ value: 12, base: 0.5 });
  s.rotate(3, 100);
  assert.equal(String(s.value), "12.5", "no 12.500000000000002 in the field");
  assert.equal(decimalsFor(0.5), 1);
  assert.equal(decimalsFor(1), 0);
});

test("an external write re-seats the accumulator", () => {
  const s = createDimScrub({ value: 10, base: 1 });
  s.rotate(30, 500); // wind the accumulator away from the value
  s.set(200); // …a plan drag moved the wall while the dial was open
  s.rotate(6, 100);
  assert.equal(s.value, 201, "the next turn resumes from the new value");
});

test("the strip is the same engine driven by travel", () => {
  const dial = createDimScrub({ value: 0, base: 1 });
  const strip = createDimScrub({ value: 0, base: 1 });
  dial.rotate(60, 400);
  strip.slide(60 * 1.6, 400); // PX_PER_DEG
  assert.equal(strip.value, dial.value);
});

test("plus/minus move by the step now on show, and settling restores precision", () => {
  const s = createDimScrub({ value: 0, base: 1 });
  s.rotate(60, 20);
  const coarse = s.value;
  assert.equal(s.step, 10);
  s.nudge(1);
  assert.equal(s.value, coarse + 10, "the button does what the readout promises");
  s.settle();
  assert.equal(s.step, 1);
  s.nudge(-1);
  assert.equal(s.value, coarse + 9);
});

test("the shortest way round is taken across the +/-180 seam", () => {
  assert.equal(angleDelta(170, -170), 20);
  assert.equal(angleDelta(-170, 170), -20);
  assert.equal(angleDelta(0, 90), 90);
});

test("the base step comes from the field's own step, then its keypad", () => {
  assert.equal(baseStepFor("0.5", "numeric"), 0.5);
  assert.equal(baseStepFor(null, "decimal"), 0.5);
  assert.equal(baseStepFor(null, "numeric"), 1);
  assert.equal(baseStepFor("", null), 1);
});

/* ---- wiring ------------------------------------------------------------- */

test("the dial writes the field and fires every binding style the app uses", () => {
  assert.match(ui, /emit\(target, "input"\)/);
  assert.match(ui, /emit\(target, "change"\)/);
  assert.match(ui, /new CustomEvent\("mf-scrub"/);
  // the round trip must not feed our own event back into the accumulator
  assert.match(ui, /writing = true;[\s\S]*?writing = false;/);
  assert.match(ui, /if \(settled !== scrub\.value\) scrub\.set\(settled\)/);
});

test("the field keeps its real focus lifecycle so one scrub is one undo step", () => {
  assert.match(ui, /input\.readOnly = true/, "readOnly, not preventDefault, keeps the keyboard down");
  assert.match(ui, /input\.focus\(\{ preventScroll: true \}\)/);
  assert.match(ui, /if \(document\.activeElement === input\) input\.blur\(\)/);
  assert.match(ui, /input\.readOnly = restore\.readOnly/);
});

test("external writes to the field reach the dial", () => {
  assert.match(ui, /Object\.getOwnPropertyDescriptor\(HTMLInputElement\.prototype, "value"\)/);
  assert.match(ui, /delete input\.value/, "the shadowing accessor is removed on close");
});

test("smart dimensions apply live but keep their dialogs for the release", () => {
  assert.match(props, /input\.addEventListener\("mf-scrub", validateDimension\)/);
  assert.match(props, /var live = !!event && event\.type === "mf-scrub"/);
  assert.match(props, /else if \(live\) return;/);
});

test("the dial is a compact-layout feature, wired once at boot", () => {
  assert.match(ui, /document\.body\.classList\.contains\("compact-nav"\)/);
  assert.match(main, /import \{ initDimKnob \} from "\.\/ui_dim_knob\.js"/);
  assert.match(main, /^initDimKnob\(\);/m);
});

test("the panel clears whichever editor's bottom chrome is showing", () => {
  assert.match(ui, /#mobile-nav, #m-ctx, #md-nav, #md-ctx, \.cb-m-nav, \.cbm-ctx/);
  assert.match(css, /\.dim-knob \{[\s\S]*?bottom: calc\(var\(--dk-bottom, 0px\) \+ 8px\)/);
  assert.match(css, /\.dim-knob \.dk-dial \{[\s\S]*?touch-action: none/);
  assert.match(css, /@media \(max-height: 500px\)[\s\S]*?\.dim-knob \.dk-wheel \{\s*display: none/);
});

test("every dial string exists in both dictionaries", () => {
  const keys = ["dk_title", "dk_dial", "dk_wheel", "dk_value", "dk_inc", "dk_dec", "dk_type", "dk_done", "dk_close", "dk_hint"];
  for (const key of keys) {
    const hits = i18n.match(new RegExp("^\\s*" + key + ":", "gm")) || [];
    assert.equal(hits.length, 2, key + " must be in he and en");
  }
});
