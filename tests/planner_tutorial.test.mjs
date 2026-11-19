import { stylesSource } from "./helpers/styles_source.mjs";
import { readI18nSource } from "./helpers/i18n_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tutorial = await readFile(new URL("../js/planner_tutorial.js", import.meta.url), "utf8");
const i18n = await readI18nSource();
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = stylesSource();

const he = i18n.slice(i18n.indexOf("  he: {"), i18n.indexOf("  en: {"));
const en = i18n.slice(i18n.indexOf("  en: {"));

function keysIn(block) {
  return new Set([...block.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]));
}

test("the planner wall guide still launches from the top-bar cap button", () => {
  assert.match(html, /id="plannerTutorialBtn"/);
  assert.match(html, /js\/planner_tutorial\.js/);
  assert.match(tutorial, /export function showPlannerHub\(/);
  assert.match(tutorial, /export function showPlannerTutorial\(/);
  assert.match(tutorial, /export function startPlannerTour\(/);
  assert.match(tutorial, /showPlannerHub\(\)/);
});

test("the reference guide covers all topics including wall types, openings, and profiles", () => {
  ["basic", "wall_types", "precision", "angle", "opening", "profiles", "sym", "asym"].forEach((id) => {
    assert.match(tutorial, new RegExp(`id: "${id}"`));
  });
  assert.match(tutorial, /planner_guide_practice_this/);
  assert.match(tutorial, /planner-guide-dont/);
  assert.match(tutorial, /function diagram\(kind\)/);
});

test("an interactive canvas tour is a second mode, not a replacement", () => {
  assert.match(tutorial, /layer\.id = "plannerTour"/);
  assert.match(tutorial, /planner-tour-layer/);
  assert.match(tutorial, /function tourSteps\(track\)/);
  ["basic", "precision", "angle", "opening", "edit"].forEach((track) => {
    assert.match(tutorial, new RegExp(`id: "${track}"`));
  });
  assert.match(tutorial, /Waiting for your action|planner_tour_waiting/);
  assert.match(tutorial, /onAfterRender/);
  assert.match(css, /\.planner-tour-layer/);
  assert.match(css, /\.planner-tour-target/);
});

test("practice steps point at real planner controls", () => {
  [
    '[data-tool="wall"]',
    '[data-tool="door"]',
    '[data-tool="select"]',
    '[data-aid="ortho"]',
    "#plan",
    "#w_len",
    "#w_ang",
  ].forEach((sel) => {
    assert.ok(tutorial.includes(sel), sel);
  });
  assert.match(html, /data-tool="wall"/);
  assert.match(html, /id="w_len"/);
});

test("every planner guide/tour i18n key exists in Hebrew and English", () => {
  const used = new Set();
  for (const m of tutorial.matchAll(/"(planner_[a-z0-9_]+)"/g)) used.add(m[1]);
  for (const m of tutorial.matchAll(/\bt\("([a-z0-9_]+)"\)/g)) {
    if (m[1].startsWith("planner_")) used.add(m[1]);
  }

  const heKeys = keysIn(he);
  const enKeys = keysIn(en);
  const missingHe = [...used].filter((k) => k.startsWith("planner_") && !heKeys.has(k));
  const missingEn = [...used].filter((k) => k.startsWith("planner_") && !enKeys.has(k));
  assert.deepEqual(missingHe, [], `missing Hebrew keys: ${missingHe.join(", ")}`);
  assert.deepEqual(missingEn, [], `missing English keys: ${missingEn.join(", ")}`);
});

test("practice progress is remembered per browser, not per plan", () => {
  assert.match(tutorial, /PROGRESS_KEY = "bp_planner_practice_done"/);
  assert.match(tutorial, /function loadProgress\(/);
  assert.match(tutorial, /function markTrackDone\(/);
  assert.match(tutorial, /function resetProgress\(/);
  assert.match(tutorial, /localStorage\.getItem\(PROGRESS_KEY/);
  // finishing the last step is what records a track, not merely closing the card
  assert.match(tutorial, /function finishTour\(\)[\s\S]*?markTrackDone\(track\)/);
  assert.match(tutorial, /planner_tour_track_done/);
  assert.match(tutorial, /planner_tour_reset/);
  assert.match(css, /\.planner-tour-track-done/);
  assert.match(css, /\.planner-guide-badge/);
});

test("the hub points at the first unfinished track", () => {
  assert.match(tutorial, /function nextTrack\(/);
  assert.match(tutorial, /planner_tour_track_next/);
  assert.match(tutorial, /function progressCount\(/);
  assert.match(tutorial, /function renderTourProgressFooter\(/);
});

test("Esc leaves the planner's own Esc alone", () => {
  const esc = tutorial.slice(tutorial.indexOf('e.key === "Escape"'));
  assert.match(esc.slice(0, 200), /!entryOpen\(\)/);
  assert.match(esc.slice(0, 200), /!S\.drawing/);
  assert.match(esc.slice(0, 200), /bp-overlay/);
  assert.match(tutorial, /stopTour\(true\)/);
});

test("arrows steer the card only while it holds focus", () => {
  // the planner nudges the selection with arrows, so the listener is on the layer
  const handler = tutorial.slice(tutorial.indexOf("layer.addEventListener(\"keydown\""));
  assert.ok(handler.startsWith('layer.addEventListener("keydown"'));
  assert.match(handler.slice(0, 700), /ArrowRight/);
  assert.match(handler.slice(0, 700), /goTourStep\(/);
  assert.doesNotMatch(
    tutorial,
    /window\.addEventListener\("keydown"[\s\S]{0,400}ArrowRight/,
  );
});

test("the click marker follows its target and the card survives a resize", () => {
  assert.match(tutorial, /function positionTourMarker\(/);
  assert.match(tutorial, /requestAnimationFrame\(trackTourTarget\)/);
  assert.match(tutorial, /function stopTourTracking\(/);
  assert.match(tutorial, /window\.addEventListener\("resize"/);
  assert.match(tutorial, /if \(!tour\.moved\) tour\.position = null/);
});

test("the reference guide is reachable from the keyboard", () => {
  assert.match(tutorial, /panel\.setAttribute\("role", "tabpanel"\)/);
  assert.match(tutorial, /b\.setAttribute\("aria-controls", panel\.id\)/);
  assert.match(tutorial, /b\.tabIndex = on \? 0 : -1/);
  assert.match(tutorial, /tabs\.addEventListener\("keydown"/);
  assert.match(tutorial, /"Home"/);
  assert.match(tutorial, /"End"/);
  assert.match(tutorial, /function restoreLaunchFocus\(/);
});

test("the autoplay loop honours prefers-reduced-motion", () => {
  assert.match(tutorial, /function reducedMotion\(/);
  assert.match(tutorial, /prefers-reduced-motion: reduce/);
  assert.match(tutorial, /if \(reducedMotion\(\)\) return;\s*\n\s*playTimer = setInterval/);
});

test("the guide clears itself when Esc or the overlay closes the modal", () => {
  assert.match(tutorial, /function trackGuide\(m\)/);
  assert.match(tutorial, /m\.onClose\(function \(\) \{ if \(activeGuide === m\) activeGuide = null; \}\)/);
  // the old guess-from-click-target hack is gone
  assert.doesNotMatch(tutorial, /e\.target === m\.overlay/);
});

test("the planner wall guide and practice tour provide read-aloud buttons", () => {
  assert.match(tutorial, /planner-guide-speak-btn/);
  assert.match(tutorial, /id="plannerTourSpeak"/);
  assert.match(css, /\.planner-guide-speak-btn/);
  assert.match(css, /\.planner-tour-head-actions/);
});

