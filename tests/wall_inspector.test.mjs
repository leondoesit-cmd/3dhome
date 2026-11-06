import { sourceFunctionText } from "./helpers/source_function.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import { readI18nSource } from "./helpers/i18n_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const props = await readFile(new URL("../js/ui_props.js", import.meta.url), "utf8");
const ui = moduleSource("js/ui.js");
const i18n = await readI18nSource();

const panel = html.slice(html.indexOf('id="wallProps"'), html.indexOf('id="wallMultiProps"'));

const TABS = ["dims", "assembly", "openings", "joints", "finish"];

test("the wall inspector is five tabs, each with exactly one pane", () => {
  TABS.forEach((tab) => {
    assert.equal(
      (panel.match(new RegExp(`data-wtab="${tab}"`, "g")) || []).length, 1,
      `one tab button for ${tab}`,
    );
    assert.equal(
      (panel.match(new RegExp(`data-wpane="${tab}"`, "g")) || []).length, 1,
      `one pane for ${tab}`,
    );
  });
  // the panes are what the tabs switch between: no stray sixth pane
  assert.equal((panel.match(/class="wi-pane"/g) || []).length, TABS.length);
});

test("every control the wall panel drives is present exactly once", () => {
  const ids = [
    "selname", "w_meta", "w_phasePill", "w_stats", "w_tabs",
    "w_len", "w_ang", "w_th", "w_h", "w_lockBtn", "w_lockLabel", "w_lockState", "w_lockQuick",
    "w_type", "w_kind", "w_phase", "w_upper_type", "w_split_h", "w_pony_options",
    "w_section", "w_secRead", "w_datum", "w_reverse", "w_flipQuick", "w_copy_style",
    "w_bulge", "w_top_a", "w_top_b", "w_base_a", "w_base_b", "w_corner_editor",
    "w_elev", "w_openList", "w_openEmpty", "w_cntDoor", "w_cntWin", "w_cntPass",
    "w_join_a", "w_join_b", "w_end", "w_side", "w_loc", "w_conList", "w_conBadge", "w_conHint",
    "w_tabBadgeOpen", "w_tabBadgeCon", "w_swatches", "w_clearTex", "w_takeoff",
    "ow_pos", "ow_posval", "ow_w", "ow_h",
  ];
  ids.forEach((id) => {
    assert.equal(
      (html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1,
      `#${id} appears once in index.html`,
    );
  });
});

test("end joins are a segmented picker, not a select", () => {
  ["a", "b"].forEach((end) => {
    const box = panel.slice(panel.indexOf(`id="w_join_${end}"`));
    ["auto", "miter", "butt", "through"].forEach((mode) => {
      assert.ok(box.includes(`data-join="${mode}"`), `end ${end} offers ${mode}`);
    });
  });
  assert.ok(!/<select id="w_join_/.test(panel), "the join selects are gone");
  assert.match(ui, /joinBox\.addEventListener\("click"/);
});

test("the section sets the datum and the elevation dimensions an opening", () => {
  // clicking a face in the cross-section is the same edit as the dropdown
  ["exterior", "main-exterior", "center", "main-interior", "interior"].forEach((datum) => {
    assert.ok(props.includes(`datum: "${datum}"`), `${datum} is a clickable face`);
  });
  assert.match(props, /S\.sel\.ref\.datum = el\.getAttribute\("data-datum"\)/);
  // an opening focuses in place first and only opens its own panel on request
  assert.match(props, /function focusOpening/);
  assert.match(props, /S\.wallOpenFocus/);
  assert.match(props, /el\.addEventListener\("dblclick"/);
});

test("the wall panel's strings are translated in both languages", () => {
  const he = i18n.slice(i18n.indexOf("  he: {"), i18n.indexOf("  en: {"));
  const en = i18n.slice(i18n.indexOf("  en: {"));
  const keys = new Set(
    [...panel.matchAll(/data-i18n(?:-title|-aria|-ph)?="([\w]+)"/g)].map((m) => m[1]),
  );
  [
    "wtab_dims", "wtab_assembly", "wtab_openings", "wtab_joints", "wtab_finish",
    "wi_netArea", "wi_netOf", "wi_netOf1", "wi_assemblyOne", "wi_assemblyTotal",
    "wi_setDatum", "wi_faceOut", "wi_faceIn", "wi_toGross", "wi_toNet", "cbm",
    "wallReverseNA", "wallReverseWhat",
  ].forEach((k) => keys.add(k));
  keys.forEach((key) => {
    const re = new RegExp(`^    "?${key}"?:`, "m");
    assert.match(he, re, `he is missing ${key}`);
    assert.match(en, re, `en is missing ${key}`);
  });
});

test("a phase reads as a pill and the four metric chips are rendered from the model", () => {
  assert.match(props, /pill\.className = "wi-phase ph-" \+ phase/);
  assert.match(props, /function fillWallStats/);
  // net area is gross minus the openings actually cut into the wall
  assert.match(props, /net = Math\.max\(0, L \* H - wallOpeningArea\(w, L, H\)\)/);
});

test("flipping a symmetric assembly is refused rather than accepted as a no-op", () => {
  // a one-layer (or palindromic) stack has nothing to mirror: the old button
  // took the click, pushed an undo entry, and changed nothing at all
  assert.match(props, /export function wallFlipSymmetric/);
  assert.match(props, /if \(layers\.length < 2\) return true/);
  assert.match(props, /btn\.disabled = symmetric/);
  assert.ok(panel.includes('id="w_reverseHint"'), "the panel says why it is disabled");
  // the action guards too — the button is not the only way to reach it
  const actions = sourceFunctionText(ui, "runAction");
  const guard = actions.slice(actions.indexOf('act === "reverseWallLayers"'));
  const bail = guard.indexOf("wallFlipSymmetric");
  assert.ok(bail !== -1 && bail < guard.indexOf("flipWall("), "refuse before flipping");
  assert.ok(bail < guard.indexOf("pushHistory()"), "refuse before touching history");
  // near-white finishes make a real flip almost invisible, so name the faces
  assert.match(ui, /wallReverseWhat/);
  assert.match(props, /export function wallFaceMaterials/);
});

test("the per-wall take-off is exportable on its own", () => {
  assert.match(props, /export function wallTakeoffRows/);
  assert.match(ui, /act === "exportWallTakeoff"/);
  assert.match(ui, /wall-" \+ toWall\.id \+ "-takeoff\.csv/);
  assert.match(ui, /act === "clearWallTex"/);
});
