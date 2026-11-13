import test from "node:test";
import assert from "node:assert/strict";
import {
  draftingStandard, draftingStandardIds, resolveDraftingStandard, formatDimension, formatLevel,
  formatArea, formatOpeningLabel, openingTags, IMPERIAL_SCALE_LABELS,
} from "../js/drafting_standards.js";
import { codeProfileIds } from "../js/code_profiles.js";
import { sheetLayout, titleBlockSVG, wrapPlanSVG, PAPER_SIZES } from "../js/sheet_print.js";
import { DRAFT_TEXT_KEYS } from "../js/drafting_strings.js";

const std = (id) => draftingStandard(id);

test("five standards, each frozen, unverified and sourced", () => {
  assert.deepEqual(draftingStandardIds(), ["il", "us", "uk", "de", "iso"]);
  for (const id of draftingStandardIds()) {
    const s = std(id);
    assert.equal(s.verified, false, id);
    assert.ok(s.sources.length >= 3 && s.sources.every((u) => /^https:\/\//.test(u)), id);
    assert.ok(Object.isFrozen(s) && Object.isFrozen(s.sources) && Object.isFrozen(s.scales), id);
    assert.ok(s.papers.every((p) => PAPER_SIZES[p]), id);
    assert.equal(s.terminator, "tick");
  }
  assert.equal(draftingStandard("mars"), null);
});

test("the standard follows the code jurisdiction, then the drafting unit and language", () => {
  const r = (a) => resolveDraftingStandard(a).id;
  assert.equal(r({ codeProfileId: "il" }), "il");
  for (const id of codeProfileIds()) {
    const want = id === "il" ? "il" : id.startsWith("us-") ? "us" : id.startsWith("uk-") ? "uk" : id.startsWith("de-") ? "de" : "iso";
    assert.equal(r({ codeProfileId: id }), want, id);
  }
  // no jurisdiction: a Hebrew project draws the Israeli way, anything else generic ISO
  assert.equal(r({ lang: "he" }), "il");
  assert.equal(r({ lang: "en", convention: "cm" }), "iso");
  assert.equal(r({ codeProfileId: "fr-xyz", lang: "he" }), "iso");
  // ISO takes the detected unit
  assert.equal(resolveDraftingStandard({ convention: "mm" }).units, "mm");
  assert.equal(resolveDraftingStandard({ convention: "cm" }).units, "cm");
  assert.equal(formatDimension(resolveDraftingStandard({ convention: "mm" }), 251.5), "2515");
  // the user's pick wins over the jurisdiction; an unknown pick is ignored
  assert.equal(r({ codeProfileId: "il", override: "de" }), "de");
  assert.equal(r({ codeProfileId: "il", override: "nope" }), "il");
});

test("dimension strings in each standard's own format", () => {
  assert.equal(formatDimension(std("de"), 251.5), "2,51⁵");
  assert.equal(formatDimension(std("de"), 250), "2,50");
  assert.equal(formatDimension(std("de"), 36.5), "36⁵");
  assert.equal(formatDimension(std("de"), 24), "24");
  assert.equal(formatDimension(std("us"), 381), `12'-6"`);
  assert.equal(formatDimension(std("us"), 6 * 2.54), `6"`);
  assert.equal(formatDimension(std("us"), 36.5 * 2.54), `3'-0 1/2"`);
  assert.equal(formatDimension(std("uk"), 251.5), "2515");
  assert.equal(formatDimension(std("il"), 251.5), "252");
  assert.equal(formatDimension(std("iso"), 251.5), "252");
});

test("levels, room areas and opening labels per standard", () => {
  assert.equal(formatLevel(std("il"), 0), "±0.00");
  assert.equal(formatLevel(std("il"), 300), "+3.00");
  assert.equal(formatLevel(std("de"), -45, "en"), "-0,45 OKFF");
  assert.equal(formatLevel(std("uk"), 0), "FFL 0.000");
  assert.equal(formatLevel(std("us"), 0), `FIN. FLR. 0'-0"`);
  assert.equal(formatLevel(std("iso"), 280), "+2.800");
  assert.equal(formatArea(std("de"), 12.5), "12,50 m²");
  assert.equal(formatArea(std("il"), 12.5, "he"), "⁧12.50 מ״ר⁩");
  assert.equal(formatArea(std("us"), 10), "108 sq ft");
  const win = { type: "window", width: 120, height: 140, sill: 90 }, door = { type: "door", width: 90, height: 210, sill: 0 };
  assert.equal(formatOpeningLabel(std("il"), door, "en"), "90/210");
  assert.equal(formatOpeningLabel(std("il"), win, "en"), "120/140  sill 90");
  assert.equal(formatOpeningLabel(std("uk"), win), "1200 × 1400");
  assert.deepEqual(formatOpeningLabel(std("de"), win), { over: "1,20", under: "1,40", sill: "BRH 90" });
  assert.equal(formatOpeningLabel(std("us"), win), "");
  assert.deepEqual(openingTags([door, win, door, win, win]), ["1", "A", "2", "B", "C"]);
});

test("a US sheet goes on Arch paper at an imperial scale with the title down the right edge", () => {
  const L = sheetLayout({ w: 1800, d: 1200 }, { standard: std("us") });
  assert.ok(L.paperName.startsWith("Arch"), L.paperName);
  assert.equal(L.label, IMPERIAL_SCALE_LABELS[L.denom]);
  assert.match(L.label, /^1\/\d+" = 1'-0"$/);
  assert.equal(L.titleBlock, "right");
  // the working scale first: 1:50 on A-series for a metric standard
  const M = sheetLayout({ w: 1800, d: 1200 }, { standard: std("de") });
  assert.equal(M.denom, 50);
  assert.ok(M.paperName.startsWith("A"));
  assert.equal(sheetLayout({ w: 1800, d: 1200 }, { standard: std("de"), scale: 100 }).denom, 100);
  // without a standard nothing changes
  assert.deepEqual(sheetLayout({ w: 1800, d: 1200 }), sheetLayout({ w: 1800, d: 1200 }, {}));
  assert.equal(sheetLayout({ w: 1800, d: 1200 }).label.slice(0, 2), "1:");
});

test("title blocks: bottom strip, right-edge strip and the mirrored Hebrew one", () => {
  const right = wrapPlanSVG("<line/>", { w: 1800, d: 1200 }, { standard: std("us"), name: "Villa", sheet: "A-101" });
  assert.match(right, /class="title-strip"/);
  assert.match(right, /1\/[48]&quot; = 1'-0&quot;/);
  assert.match(right, /data-standard="us"/);
  const rtl = titleBlockSVG({ name: "בית Villa", rtl: true, labels: { scale: "קנה מידה", date: "תאריך", sheet: "גיליון" } });
  assert.match(rtl, /class="title-rtl"/);
  assert.match(rtl, /direction="rtl" text-anchor="start"[^>]*>⁨בית Villa⁩</);
  assert.ok(rtl.includes(">קנה מידה"));
  // the default block is the old one
  assert.ok(titleBlockSVG({ name: "x" }).includes(">SCALE"));
  assert.ok(!titleBlockSVG({ name: "x" }).includes("title-rtl"));
});

test("the dialog's strings exist in both languages", () => {
  for (const k of ["pro_drawing", "pro_drawing_title", "sheet_tb_scale", "sheet_door_schedule", "drafting_unit_m_cm", "drafting_unit_ft_in"])
    assert.ok(DRAFT_TEXT_KEYS.includes(k), k);
});
