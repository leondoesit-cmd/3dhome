import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { countWord, pluralKey, isBareUnit, statusSegments, hintReserve, DIM_CLEAR } from "../js/cabinet_chrome_logic.js";

const RAIL = ["מוט", "מוטות", "rail", "rails"];

test("countWord: singular for one, plural otherwise, in English and Hebrew", () => {
  assert.equal(countWord(1, RAIL, true), "1 rail");
  assert.equal(countWord(2, RAIL, true), "2 rails");
  assert.equal(countWord(0, RAIL, true), "0 rails");
  assert.equal(countWord(1, RAIL, false), "1 מוט");
  assert.equal(countWord(3, RAIL, false), "3 מוטות");
  assert.equal(pluralKey(1, "statusSheet", "statusSheets"), "statusSheet");
  assert.equal(pluralKey(4, "statusSheet", "statusSheets"), "statusSheets");
});

test("the status bar has singular strings for one sheet and one part", () => {
  const ctx = readFileSync(new URL("../js/ui_cabinet_ctx.js", import.meta.url), "utf8");
  assert.ok(ctx.includes('statusSheet: ["{n} לוח", "{n} sheet"]'));
  assert.ok(ctx.includes('statusPart: ["{n} חלק", "{n} part"]'));
  assert.ok(ctx.includes('editScopeShort: ["החל על:", "Apply to:"]'), "the scope dropdown reads 'Apply to: …'");
});

test("a unit with no number before it is a bare unit", () => {
  for (const s of ["mm", " mm ", "Units: mm", "יחידות: cm", "cm"]) assert.ok(isBareUnit(s), s);
  for (const s of ["18 mm stock", "1200 mm", "3 sheets", "No production convention", "23 parts", "Summary", ""]) assert.ok(!isBareUnit(s), s);
});

test("statusSegments drops bare units and empties, and ranks the core metrics first", () => {
  const out = statusSegments([
    { key: "conv", text: "No production convention" },
    { key: "units", text: "Units: mm" },
    { key: "stock", text: "18 mm stock" },
    { key: "sheets", text: "1 sheet" },
    { key: "yield", text: "58% yield" },
    { key: "parts", text: "" },
  ]);
  assert.deepEqual(out.map((s) => s.key), ["conv", "stock", "sheets", "yield"]);
  const prio = Object.fromEntries(out.map((s) => [s.key, s.prio]));
  assert.equal(prio.stock, 1);
  assert.equal(prio.sheets, 1);
  assert.ok(prio.yield > prio.sheets);
  assert.ok(prio.conv > prio.yield, "the convention drops first");
});

test("hintReserve keeps the drawing's bottom margin clear of the hint pill", () => {
  const canvas = { left: 0, right: 600, top: 0, bottom: 400, height: 400 };
  // a pill floating 14px over the bottom, 30px tall: 44px of the canvas + the dimension
  assert.equal(hintReserve(canvas, { left: 100, right: 400, top: 356, bottom: 386, height: 30 }, 84), 44 + DIM_CLEAR);
  // higher up (the classic layout's command bar under it): more room
  assert.equal(hintReserve(canvas, { left: 100, right: 400, top: 304, bottom: 334, height: 30 }, 84), 96 + DIM_CLEAR);
  // hidden, beside the canvas, or below it: the base margin
  assert.equal(hintReserve(canvas, { left: 0, right: 0, top: 0, bottom: 0, height: 0 }, 84), 84);
  assert.equal(hintReserve(canvas, { left: 620, right: 900, top: 300, bottom: 330, height: 30 }, 84), 84);
  assert.equal(hintReserve(canvas, { left: 100, right: 400, top: 410, bottom: 440, height: 30 }, 84), 84);
  assert.equal(hintReserve(null, null, 84), 84);
});

test("the designer wires the helpers: status segments, hint margin, plural summary", () => {
  const ui = readFileSync(new URL("../js/ui_cabinet.js", import.meta.url), "utf8");
  assert.match(ui, /statusSegments\(parts\)\.forEach/);
  assert.match(ui, /span\.dataset\.prio = seg\.prio;/);
  assert.match(ui, /T\(pluralKey\(q\.sheetCount, "statusSheet", "statusSheets"\)\)/);
  assert.match(ui, /T\(pluralKey\(panels\.length, "statusPart", "statusParts"\)\)/);
  const view = readFileSync(new URL("../js/ui_cabinet_view.js", import.meta.url), "utf8");
  assert.match(view, /padB = E\.thumbPass \? 30 : cmp \? 46 \+ dockClearance\(\) : hintPad\(84\)/);
  const labels = readFileSync(new URL("../js/cabinet/labels_plan.js", import.meta.url), "utf8");
  assert.match(labels, /return countWord\(n, w, en\);/);
  const css = readFileSync(new URL("../css/pro_ribbon.css", import.meta.url), "utf8");
  assert.match(css, /@container cb-status \(max-width: 560px\) \{\s*#cabdes \.cb-statusbar > \[data-prio="3"\] \{ display: none; \}/);
  assert.match(css, /@container cb-status \(max-width: 420px\) \{\s*#cabdes \.cb-statusbar > \[data-prio="2"\] \{ display: none; \}/);
  // one home for the partition tools in the ribbon layout
  assert.match(css, /#cabdes \.cb-context-bar > #cbTools > button\[data-tool\]:not\(\[data-tool=""\]\) \{ display: none; \}/);
});
