// js/ribbon_fit.js: how a ribbon tab fits its window — full, dense, then the
// last groups folded into drop-down buttons; the first group never folds.
import test from "node:test";
import assert from "node:assert/strict";
import { planRibbonFit } from "../js/ribbon_fit.js";

const g = (full, dense, folded) => ({ full, dense, folded });
// a Build-like tab: Select, Walls, Openings, Levels, Rooms
const BUILD = [g(190, 170, 70), g(540, 500, 70), g(310, 285, 80), g(370, 340, 70), g(300, 280, 70)];

test("a tab that fits stays full size", () => {
  assert.deepEqual(planRibbonFit(BUILD, 1800), { dense: false, fold: 0, overflow: false });
  assert.deepEqual(planRibbonFit(BUILD, 1710), { dense: false, fold: 0, overflow: false }, "exact fit");
});

test("dense comes before any group folds", () => {
  assert.deepEqual(planRibbonFit(BUILD, 1600), { dense: true, fold: 0, overflow: false });
});

test("the last groups fold first, one at a time, only as many as needed", () => {
  // dense 1575; folding Rooms saves 210 -> 1365
  assert.deepEqual(planRibbonFit(BUILD, 1400), { dense: true, fold: 1, overflow: false });
  // + Levels: 1095
  assert.deepEqual(planRibbonFit(BUILD, 1100), { dense: true, fold: 2, overflow: false });
  // + Openings: 890
  assert.deepEqual(planRibbonFit(BUILD, 900), { dense: true, fold: 3, overflow: false });
  // + Walls: 460
  assert.deepEqual(planRibbonFit(BUILD, 500), { dense: true, fold: 4, overflow: false });
});

test("the first group never folds; a window too narrow even then says so", () => {
  const p = planRibbonFit(BUILD, 300);
  assert.equal(p.fold, BUILD.length - 1, "every group but the first folds");
  assert.equal(p.overflow, true);
});

test("fractional measurements get half a pixel of slack", () => {
  assert.equal(planRibbonFit([g(100.4, 90, 40), g(100.4, 90, 40)], 200.5).dense, false);
});

test("a single-group tab can only go dense, then overflow", () => {
  assert.deepEqual(planRibbonFit([g(800, 700, 80)], 750), { dense: true, fold: 0, overflow: false });
  assert.deepEqual(planRibbonFit([g(800, 700, 80)], 600), { dense: true, fold: 0, overflow: true });
});

test("no groups, or junk input, is a tab that fits", () => {
  assert.deepEqual(planRibbonFit([], 0), { dense: false, fold: 0, overflow: false });
  assert.deepEqual(planRibbonFit(null, 500), { dense: false, fold: 0, overflow: false });
  assert.deepEqual(planRibbonFit([{}], 10), { dense: false, fold: 0, overflow: false });
});
