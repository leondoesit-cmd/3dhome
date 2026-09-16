/* Project display units. Geometry stays in centimetres; every planner readout
   and length field goes through here so a US sheet in feet does not require
   mental conversion on the HUD, the inspector, the project guide, or the plan. */
import { S } from "./state.js";
import { t, setDisplayUnitVars, applyStatic, onLangChange } from "./i18n.js";
import { planningDisplayUnit } from "./planning_guide.js";
import { parseLength, formatLength, formatArea, parseArea, toDisplayLength, fromDisplayLength, PLANNING_UNITS } from "./planning_units.js";
import { getDomainUnit, getDomainDigits, inferDomainFromElementId } from "./unit_settings.js";

export function displayUnit(domain) {
  if (domain) return getDomainUnit(domain);
  var gUnit = S && S.workspace && S.workspace.guidance && S.workspace.guidance.details && S.workspace.guidance.details.displayUnit;
  if (gUnit && gUnit !== "cm") return gUnit;
  return getDomainUnit("plan");
}

export function unitLabel(domain) {
  return t("guide_unit_" + displayUnit(domain));
}

export function areaUnitLabel(domain) {
  var u = getDomainUnit(domain || "area");
  return u === "ft" || u === "in" || u === "sqft" ? t("guide_unit_sqft") : t("sqm");
}

export function fmtLen(cm, options) {
  var opts = typeof options === "string" ? { domain: options } : (options || {});
  var dom = opts.domain || opts.part || null;
  var unit = opts.unit || (dom ? displayUnit(dom) : displayUnit());
  var digits = opts.digits != null ? opts.digits : (dom ? getDomainDigits(dom) : undefined);
  return formatLength(cm, unit, Object.assign({}, opts, { digits: digits }));
}

export function fmtAreaM2(m2, options) {
  if (m2 == null || !Number.isFinite(Number(m2))) return "";
  var opts = typeof options === "string" ? { domain: options } : (options || {});
  var dom = opts.domain || "area";
  var unit = opts.unit || displayUnit(dom);
  var digits = opts.digits != null ? opts.digits : getDomainDigits(dom);
  return formatArea(Number(m2) * 10000, unit, Object.assign({}, opts, { digits: digits }));
}

export function parseAreaM2(text, domainOrFallback) {
  var dom = domainOrFallback || "area";
  var fallback = (dom && PLANNING_UNITS[dom]) ? dom : displayUnit(dom);
  var n = parseArea(text, fallback);
  return Number.isFinite(n) ? n : NaN;
}

export function parseLen(text, domainOrFallback) {
  var dom = domainOrFallback;
  var fallback = (dom && PLANNING_UNITS[dom]) ? dom : displayUnit(dom);
  var n = parseLength(text, fallback);
  return Number.isFinite(n) ? n : NaN;
}

export function asLengthInput(input, cm, domain) {
  if (!input) return input;
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.spellcheck = false;
  var dom = domain || inferDomainFromElementId(input.id) || null;
  if (cm === "" || cm == null) input.value = "";
  else writeLen(input, cm, { domain: dom });
  return input;
}

export function formatXYList(points, domain) {
  var dom = domain || "plan";
  return (points || []).map(function (p) {
    return fmtLen(p.x, { suffix: false, domain: dom }) + "," + fmtLen(p.z, { suffix: false, domain: dom });
  }).join("\n");
}

export function parseXYList(text, domain) {
  var dom = domain || "plan";
  return String(text || "").trim().split(/\n+/).map(function (line) {
    var comma = line.indexOf(",");
    if (comma < 0) return null;
    var x = parseLen(line.slice(0, comma), dom);
    var z = parseLen(line.slice(comma + 1), dom);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return { x: x, z: z };
  }).filter(Boolean);
}

export function toDisp(cm, domain) {
  return toDisplayLength(cm, displayUnit(domain));
}

export function fromDisp(value, domain) {
  return fromDisplayLength(value, displayUnit(domain));
}

export function writeLen(el, cm, options) {
  if (!el) return;
  var opts = typeof options === "string" ? { domain: options } : (options || {});
  var dom = opts.domain || opts.part || inferDomainFromElementId(el.id) || null;
  var unit = opts.unit || (dom ? displayUnit(dom) : displayUnit());
  // Editable values retain precision independently of rounded drawing labels.
  var digits = opts.digits != null ? opts.digits : 6;
  el.value = formatLength(cm, unit, {
    suffix: false,
    digits: digits,
    feetInches: opts.feetInches,
  });
}

export function syncDisplayUnitLabels() {
  setDisplayUnitVars({ u: unitLabel(), au: areaUnitLabel() });
  applyStatic();
  if (typeof document === "undefined") return;
  var step = fmtLen(10, { domain: "rooms" });
  [["r_w_down", "-"], ["r_w_up", "+"], ["r_d_down", "-"], ["r_d_up", "+"]].forEach(function (pair) {
    var el = document.getElementById(pair[0]);
    if (el) el.title = pair[1] + step;
  });
  var oUnit = document.getElementById("o_unit");
  if (oUnit) {
    oUnit.textContent = unitLabel("openings");
    oUnit.title = t("settings_units_tab");
    oUnit.style.cursor = "pointer";
    oUnit.onclick = function () {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("unit-open-settings"));
      }
    };
  }
  [["w_len_unit", "rooms"], ["w_th_unit", "details"], ["w_h_unit", "rooms"],
   ["o_w_unit", "openings"], ["o_h_unit", "openings"], ["i_w_unit", "furniture"],
   ["r_w_unit", "rooms"], ["r_d_unit", "rooms"], ["mep_unit", "mep"]].forEach(function (pair) {
    var uEl = document.getElementById(pair[0]);
    if (uEl) uEl.textContent = unitLabel(pair[1]);
  });
  [["w_len", "rooms"], ["w_th", "details"], ["w_h", "rooms"],
   ["o_w", "openings"], ["o_h", "openings"], ["o_sill", "openings"],
   ["i_w", "furniture"], ["i_d", "furniture"], ["i_h", "furniture"],
   ["r_w", "rooms"], ["r_d", "rooms"], ["sv_w", "rooms"], ["sv_d", "rooms"]].forEach(function (pair) {
    var fEl = document.getElementById(pair[0]);
    if (fEl) fEl.placeholder = unitLabel(pair[1]);
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("planner-units", syncDisplayUnitLabels);
  onLangChange(syncDisplayUnitLabels);
}
