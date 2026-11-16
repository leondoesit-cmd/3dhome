/* The Draw cabinet tool's family chooser (FURNITURE_PLACEMENT_PLAN.md 4c):
   which kind of cabinet a drawn box becomes. One <select> beside the tool's
   hint in the 3D pane (js/build3d_ui.js mounts it in its hint chip) and a
   matching chip in the 2D plan, kept in step. The last choice is remembered
   (localStorage, best effort). The decision itself is pure
   (js/fit_cabinet_area.js fitFamilyFor). */
import { S } from "../state.js";
import { FAM, defaultPreset, presetById } from "../cabinet.js";
import { getLang, onLangChange } from "../i18n.js";
import { FIT_AUTO, fitFamilyFor, fitFamilyIds } from "../fit_cabinet_area.js";
import { fitText } from "../fit_cabinet_strings.js";

var FAMILY_KEY = "home3d_fitcab_family";
var familyPickers = [];
var familyPlanChip = null;
var familyCurrent = null;
var familyTable = null;

/* The families that have a preset of their own (a family borrowing another's
   preset, like Free-form, would build as that other family). */
function fillFams() {
  if (familyTable) return familyTable;
  familyTable = {};
  Object.keys(FAM).forEach(function (k) {
    var p = presetById(defaultPreset(k));
    if (p && p.fam === k) familyTable[k] = FAM[k];
  });
  return familyTable;
}

export function fitFamilyChoice() {
  var v = null;
  try { v = localStorage.getItem(FAMILY_KEY); } catch (_) { v = null; }
  return v && (v === FIT_AUTO || fillFams()[v]) ? v : FIT_AUTO;
}
function setFamilyChoice(v) {
  try { localStorage.setItem(FAMILY_KEY, v); } catch (_) { /* private window: this session only */ }
  familyCurrent = v;
  familyPickers.forEach(function (sel) { if (sel.value !== v) sel.value = v; });
}

/** The family a box of this mount and size gets (js/fit_cabinet_area.js rules). */
export function fitCabinetFamily(mount, h, d) {
  if (familyCurrent == null) familyCurrent = fitFamilyChoice();
  return fitFamilyFor({ choice: familyCurrent, mount: mount, h: h, d: d }, fillFams());
}

function familyLabel(id) {
  if (id === FIT_AUTO) return fitText("auto");
  var f = FAM[id];
  return f ? (getLang() === "he" ? f.he : f.en) : id;
}
function fillFamilySelect(sel) {
  sel.innerHTML = "";
  fitFamilyIds(fillFams()).forEach(function (id) {
    var o = document.createElement("option");
    o.value = id;
    o.textContent = familyLabel(id);
    sel.appendChild(o);
  });
  sel.value = familyCurrent == null ? (familyCurrent = fitFamilyChoice()) : familyCurrent;
  sel.title = fitText("family");
  sel.setAttribute("aria-label", fitText("family"));
}

/** A labelled <select>; the caller places it. */
export function mountFitFamilyPicker(cls) {
  var wrap = document.createElement("label");
  wrap.className = "fitcab-family " + (cls || "");
  var icon = document.createElement("i");
  icon.className = "ph ph-lockers";
  icon.setAttribute("aria-hidden", "true");
  var sel = document.createElement("select");
  fillFamilySelect(sel);
  sel.addEventListener("change", function () { setFamilyChoice(sel.value); });
  // a tap on the chooser is never a press on the room under it
  wrap.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  wrap.append(icon, sel);
  familyPickers.push(sel);
  return wrap;
}

/* ---- the 2D plan's chip --------------------------------------------------- */

function syncFamily2D() {
  if (!familyPlanChip) return;
  var on = S.tool === "fitcab";
  if (familyPlanChip.hidden === on) familyPlanChip.hidden = !on;
  var text = familyPlanChip.querySelector(".fitcab-plan-hint");
  if (text && text.textContent !== fitText("hint2d")) text.textContent = fitText("hint2d");
}
function relabelFamily() {
  familyPickers.forEach(fillFamilySelect);
  syncFamily2D();
}
export function initFitFamily2D() {
  var pane = typeof document !== "undefined" && document.getElementById("view-2d");
  if (!pane || familyPlanChip) return;
  familyPlanChip = document.createElement("div");
  familyPlanChip.className = "fitcab-plan";
  familyPlanChip.hidden = true;
  var text = document.createElement("span");
  text.className = "fitcab-plan-hint";
  familyPlanChip.append(text, mountFitFamilyPicker("fitcab-family-2d"));
  pane.appendChild(familyPlanChip);
  syncFamily2D();
}

if (typeof window !== "undefined") {
  window.addEventListener("planner-tool", function () {
    if (S.tool === "fitcab") initFitFamily2D();
    syncFamily2D();
  });
  onLangChange(relabelFamily);
}
