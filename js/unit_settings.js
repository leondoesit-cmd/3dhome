/* Advanced Display Units & Location Detection Engine
   Provides smart defaults based on location (site coordinates or locale)
   and per-domain unit/precision overrides across each part of ModelForge. */

import { S } from "./state.js";
import { t } from "./i18n.js";
import { formatLength, formatArea } from "./planning_units.js";

export const STORAGE_KEY = "home3d_unit_settings";

export const UNIT_DOMAINS = [
  { id: "rooms", icon: "ph-wall", key: "unit_domain_rooms", descKey: "unit_domain_rooms_desc", sampleCm: 380, allowed: ["auto", "m", "cm", "mm", "ft", "in"] },
  { id: "openings", icon: "ph-door", key: "unit_domain_openings", descKey: "unit_domain_openings_desc", sampleCm: 80, sampleExtraCm: 210, allowed: ["auto", "cm", "mm", "m", "in", "ft"] },
  { id: "furniture", icon: "ph-armchair", key: "unit_domain_furniture", descKey: "unit_domain_furniture_desc", sampleCm: 160, sampleExtraCm: 200, allowed: ["auto", "cm", "mm", "m", "in", "ft"] },
  { id: "mep", icon: "ph-pipe", key: "unit_domain_mep", descKey: "unit_domain_mep_desc", sampleCm: 5, allowed: ["auto", "mm", "cm", "m", "in"] },
  { id: "details", icon: "ph-ruler", key: "unit_domain_details", descKey: "unit_domain_details_desc", sampleCm: 10, allowed: ["auto", "mm", "cm", "m", "in"] },
  { id: "site", icon: "ph-map-pin", key: "unit_domain_site", descKey: "unit_domain_site_desc", sampleCm: 2500, allowed: ["auto", "m", "cm", "ft", "in"] },
  { id: "plan", icon: "ph-compass-tool", key: "unit_domain_plan", descKey: "unit_domain_plan_desc", sampleCm: 420, allowed: ["auto", "m", "cm", "mm", "ft", "in"] },
  { id: "area", icon: "ph-square-half", key: "unit_domain_area", descKey: "unit_domain_area_desc", sampleM2: 18.5, allowed: ["auto", "m2", "sqft"], isArea: true },
];

export const PRESET_DEFS = [
  { id: "auto", key: "unit_preset_auto", descKey: "unit_preset_auto_desc", icon: "ph-map-pin-line" },
  { id: "metric_arch", key: "unit_preset_metric_arch", descKey: "unit_preset_metric_arch_desc", icon: "ph-blueprint" },
  { id: "metric_mm", key: "unit_preset_metric_mm", descKey: "unit_preset_metric_mm_desc", icon: "ph-gear-fine" },
  { id: "metric_cm", key: "unit_preset_metric_cm", descKey: "unit_preset_metric_cm_desc", icon: "ph-ruler" },
  { id: "metric_m", key: "unit_preset_metric_m", descKey: "unit_preset_metric_m_desc", icon: "ph-buildings" },
  { id: "imperial", key: "unit_preset_imperial", descKey: "unit_preset_imperial_desc", icon: "ph-flag" },
  { id: "custom", key: "unit_preset_custom", descKey: "unit_preset_custom_desc", icon: "ph-sliders-horizontal" },
];

/**
 * Detects whether the user's location warrants a Metric or US Imperial unit system.
 * Checks project site coordinates first, then browser locale / Intl.Locale.
 */
export function detectLocationUnitSystem() {
  if (S.site && S.site.enabled && S.site.lat != null && S.site.lon != null) {
    var lat = Number(S.site.lat);
    var lon = Number(S.site.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      var isUS = (lat >= 18.0 && lat <= 72.0 && lon >= -170.0 && lon <= -65.0);
      var detail = S.site.label || (lat.toFixed(2) + "°, " + lon.toFixed(2) + "°");
      return {
        system: isUS ? "imperial" : "metric",
        reason: "site",
        detail: detail,
      };
    }
  }

  var nav = typeof navigator !== "undefined" ? navigator : null;
  var navLang = (nav && (nav.language || (nav.languages && nav.languages[0]))) || "en";
  try {
    if (typeof Intl !== "undefined" && Intl.Locale) {
      var loc = new Intl.Locale(navLang);
      var ms = loc.measurementSystem || (loc.getMeasurementSystem ? loc.getMeasurementSystem() : undefined);
      if (ms === "us") {
        return { system: "imperial", reason: "locale", detail: navLang };
      }
      var reg = loc.region || "";
      if (reg === "US" || reg === "LR" || reg === "MM") {
        return { system: "imperial", reason: "locale", detail: navLang };
      }
    }
  } catch (_) {}

  if (/-US\b/i.test(navLang) || /-LR\b/i.test(navLang) || /-MM\b/i.test(navLang)) {
    return { system: "imperial", reason: "locale", detail: navLang };
  }

  return {
    system: "metric",
    reason: "locale",
    detail: navLang || "default",
  };
}

/**
 * Smart defaults that best suit each menu/part of the app.
 * Metric:
 *   Rooms/Structure: meters (m, 2 decimals)
 *   Openings (doors/windows): centimeters (cm, 0 decimals)
 *   Furniture/Objects: centimeters (cm, 0 decimals)
 *   MEP (plumbing, conduits): millimeters (mm, 0 decimals)
 *   Details (wall thickness, profiles): millimeters (mm, 0 decimals)
 *   Site/Terrain: meters (m, 2 decimals)
 *   Plan 2D & HUD: meters (m, 2 decimals)
 *   Area: square meters (m²)
 * Imperial:
 *   Rooms/Site/Plan: feet (ft)
 *   Openings/Furniture/MEP/Details: inches (in)
 *   Area: square feet (sqft)
 */
export function getSmartDefaults(system) {
  if (system === "imperial") {
    return {
      rooms: { unit: "ft", digits: 1 },
      openings: { unit: "in", digits: 1 },
      furniture: { unit: "in", digits: 1 },
      mep: { unit: "in", digits: 2 },
      details: { unit: "in", digits: 2 },
      site: { unit: "ft", digits: 1 },
      plan: { unit: "ft", digits: 1 },
      area: { unit: "sqft", digits: 1 },
    };
  }
  return {
    rooms: { unit: "m", digits: 2 },
    openings: { unit: "cm", digits: 0 },
    furniture: { unit: "cm", digits: 0 },
    mep: { unit: "mm", digits: 0 },
    details: { unit: "mm", digits: 0 },
    site: { unit: "m", digits: 2 },
    plan: { unit: "m", digits: 2 },
    area: { unit: "m2", digits: 2 },
  };
}

function defaultUnitSettings() {
  return {
    preset: "auto",
    overrides: {
      rooms: { unit: "auto", digits: "auto" },
      openings: { unit: "auto", digits: "auto" },
      furniture: { unit: "auto", digits: "auto" },
      mep: { unit: "auto", digits: "auto" },
      details: { unit: "auto", digits: "auto" },
      site: { unit: "auto", digits: "auto" },
      plan: { unit: "auto", digits: "auto" },
      area: { unit: "auto", digits: "auto" },
    },
    showSuffix: true,
    feetInches: true,
  };
}

var activeSettings = null;

export function loadUnitSettings() {
  if (activeSettings) return activeSettings;
  var base = defaultUnitSettings();
  if (typeof localStorage !== "undefined") {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          if (parsed.preset) base.preset = parsed.preset;
          if (parsed.showSuffix != null) base.showSuffix = !!parsed.showSuffix;
          if (parsed.feetInches != null) base.feetInches = !!parsed.feetInches;
          if (parsed.overrides && typeof parsed.overrides === "object") {
            Object.keys(base.overrides).forEach(function (k) {
              if (parsed.overrides[k]) {
                base.overrides[k] = {
                  unit: parsed.overrides[k].unit || "auto",
                  digits: parsed.overrides[k].digits != null ? parsed.overrides[k].digits : "auto",
                };
              }
            });
          }
        }
      }
    } catch (_) {}
  }
  activeSettings = base;
  return activeSettings;
}

export function saveUnitSettings(newSettings) {
  var current = loadUnitSettings();
  activeSettings = Object.assign({}, current, newSettings || {});
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeSettings));
    } catch (_) {}
  }
  if (S && S.workspace && S.workspace.guidance && S.workspace.guidance.details) {
    S.workspace.guidance.details.unitSettings = activeSettings;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("planner-units", { detail: activeSettings }));
  }
  return activeSettings;
}

/**
 * Returns the effective unit and digits for a given domain under the active preset & overrides.
 */
export function getDomainConfig(domain) {
  var settings = loadUnitSettings();
  var detected = detectLocationUnitSystem();
  var smart = getSmartDefaults(detected.system);
  var dom = domain || "plan";

  var preset = settings.preset || "auto";
  var ov = (settings.overrides && settings.overrides[dom]) || { unit: "auto", digits: "auto" };

  var unit = "auto";
  var digits = "auto";

  if (preset === "auto") {
    var def = smart[dom] || { unit: "cm", digits: 0 };
    unit = ov.unit !== "auto" ? ov.unit : def.unit;
    digits = ov.digits !== "auto" ? ov.digits : def.digits;
  } else if (preset === "metric_arch") {
    var archDefaults = getSmartDefaults("metric");
    var aDef = archDefaults[dom] || { unit: "cm", digits: 0 };
    unit = ov.unit !== "auto" ? ov.unit : aDef.unit;
    digits = ov.digits !== "auto" ? ov.digits : aDef.digits;
  } else if (preset === "metric_mm") {
    unit = ov.unit !== "auto" ? ov.unit : (dom === "area" ? "m2" : dom === "site" ? "m" : "mm");
    digits = ov.digits !== "auto" ? ov.digits : (unit === "m" || unit === "m2" ? 2 : 0);
  } else if (preset === "metric_cm") {
    unit = ov.unit !== "auto" ? ov.unit : (dom === "area" ? "m2" : dom === "site" ? "m" : "cm");
    digits = ov.digits !== "auto" ? ov.digits : (unit === "m" || unit === "m2" ? 2 : 0);
  } else if (preset === "metric_m") {
    unit = ov.unit !== "auto" ? ov.unit : (dom === "area" ? "m2" : "m");
    digits = ov.digits !== "auto" ? ov.digits : 2;
  } else if (preset === "imperial") {
    var impDefaults = getSmartDefaults("imperial");
    var iDef = impDefaults[dom] || { unit: "in", digits: 1 };
    unit = ov.unit !== "auto" ? ov.unit : iDef.unit;
    digits = ov.digits !== "auto" ? ov.digits : iDef.digits;
  } else {
    // custom preset
    var fallback = smart[dom] || { unit: "cm", digits: 0 };
    unit = ov.unit !== "auto" ? ov.unit : fallback.unit;
    digits = ov.digits !== "auto" ? ov.digits : fallback.digits;
  }

  var numDigits = digits === "auto" ? (unit === "m" || unit === "m2" ? 2 : unit === "mm" ? 0 : unit === "cm" ? 0 : 1) : Number(digits);
  if (!Number.isFinite(numDigits)) numDigits = 0;

  return {
    domain: dom,
    unit: unit,
    digits: numDigits,
    showSuffix: settings.showSuffix !== false,
    feetInches: settings.feetInches !== false,
  };
}

export function getDomainUnit(domain) {
  return getDomainConfig(domain).unit;
}

export function getDomainDigits(domain) {
  return getDomainConfig(domain).digits;
}

/**
 * Infer domain from an input ID (e.g. w_len -> rooms, w_th -> details, o_w -> openings)
 */
export function inferDomainFromElementId(id) {
  if (!id || typeof id !== "string") return null;
  if (/^w_(?:th|bulge|corner_value)/.test(id)) return "details";
  if (/^w_(?:len|h|top_|base_)/.test(id)) return "rooms";
  if (/^r_(?:w|d)/.test(id)) return "rooms";
  if (/^sv_/.test(id)) return "rooms";
  if (/^o_(?:w|h|sill|pos)/.test(id)) return "openings";
  if (/^i_(?:w|d|h|elev)/.test(id)) return "furniture";
  if (/^mk_/.test(id)) return "furniture";
  if (/^mep_/.test(id)) return "mep";
  if (/^site_/.test(id)) return "site";
  if (/^inLen|^inOff/.test(id)) return "plan";
  return null;
}

function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/**
 * Builds the interactive Units settings pane for the Settings modal.
 */
export function buildUnitSettingsPane(onClose) {
  var container = el("div", "unit-settings-pane-content");

  var intro = el("div", "unit-settings-intro");
  intro.innerHTML = '<i class="ph ph-ruler"></i><div><strong>' + t("unit_settings_title") +
    '</strong><p>' + t("unit_settings_intro") + "</p></div>";
  container.appendChild(intro);

  var detected = detectLocationUnitSystem();
  var banner = el("div", "unit-location-banner");
  var reasonLabel = detected.reason === "site" ? t("unit_loc_reason_site") : t("unit_loc_reason_locale", { locale: detected.detail });
  var isMetric = detected.system === "metric";
  var sysText = isMetric ? t("unit_loc_metric", { reason: reasonLabel }) : t("unit_loc_imperial", { reason: reasonLabel });
  banner.innerHTML = '<span class="unit-loc-pill ' + (isMetric ? 'metric' : 'imperial') + '">' +
    (isMetric ? 'Metric (m/cm/mm)' : 'US Imperial (ft/in)') + '</span>' +
    '<span class="unit-loc-text"><i class="ph ph-map-pin"></i> ' + sysText + '</span>';
  container.appendChild(banner);

  var presetsSection = el("div", "unit-section");
  var presetsHead = el("h4", "unit-section-title", t("unit_presets_title"));
  presetsSection.appendChild(presetsHead);

  var currentSettings = loadUnitSettings();
  var presetsGrid = el("div", "unit-presets-grid");

  function renderPreview(domain, unit, digits) {
    var domObj = UNIT_DOMAINS.find(function (d) { return d.id === domain; });
    if (!domObj) return "";
    var numDigits = digits === "auto" ? (unit === "m" || unit === "m2" ? 2 : unit === "mm" ? 0 : unit === "cm" ? 0 : 1) : Number(digits);
    if (!Number.isFinite(numDigits)) numDigits = 0;

    if (domObj.isArea) {
      return formatArea(domObj.sampleM2 * 10000, unit, { digits: numDigits, suffix: true });
    }
    var baseText = formatLength(domObj.sampleCm, unit, { digits: numDigits, suffix: true, feetInches: currentSettings.feetInches !== false });
    if (domObj.sampleExtraCm) {
      var extra = formatLength(domObj.sampleExtraCm, unit, { digits: numDigits, suffix: true, feetInches: currentSettings.feetInches !== false });
      return baseText + " × " + extra;
    }
    return baseText;
  }

  var domainPreviewEls = {};

  function updateAllPreviews() {
    UNIT_DOMAINS.forEach(function (dom) {
      var cfg = getDomainConfig(dom.id);
      var previewEl = domainPreviewEls[dom.id];
      if (previewEl) {
        previewEl.textContent = renderPreview(dom.id, cfg.unit, cfg.digits);
      }
    });
  }

  PRESET_DEFS.forEach(function (p) {
    var card = el("label", "unit-preset-card" + (currentSettings.preset === p.id ? " active" : ""));
    var radio = el("input");
    radio.type = "radio";
    radio.name = "unit-preset";
    radio.value = p.id;
    radio.checked = currentSettings.preset === p.id;
    card.appendChild(radio);

    var iconBox = el("span", "unit-preset-icon");
    iconBox.innerHTML = '<i class="ph ' + p.icon + '"></i>';
    card.appendChild(iconBox);

    var copy = el("span", "unit-preset-copy");
    copy.innerHTML = "<strong>" + t(p.key) + "</strong><small>" + t(p.descKey) + "</small>";
    card.appendChild(copy);

    radio.onchange = function () {
      currentSettings.preset = p.id;
      saveUnitSettings(currentSettings);
      presetsGrid.querySelectorAll(".unit-preset-card").forEach(function (c) {
        c.classList.toggle("active", c.querySelector("input").checked);
      });
      syncDomainTableControls();
      updateAllPreviews();
    };

    presetsGrid.appendChild(card);
  });
  presetsSection.appendChild(presetsGrid);
  container.appendChild(presetsSection);

  var domainsSection = el("div", "unit-section");
  var domainsHead = el("h4", "unit-section-title", t("unit_domains_title"));
  var domainsDesc = el("p", "unit-section-desc", t("unit_domains_desc"));
  domainsSection.appendChild(domainsHead);
  domainsSection.appendChild(domainsDesc);

  var tableWrap = el("div", "unit-table-wrap");
  var table = el("div", "unit-domain-table");

  var headerRow = el("div", "unit-table-row header");
  headerRow.innerHTML = '<div class="col-part">' + t("unit_col_part") + '</div>' +
    '<div class="col-unit">' + t("unit_col_unit") + '</div>' +
    '<div class="col-precision">' + t("unit_col_precision") + '</div>' +
    '<div class="col-preview">' + t("unit_col_preview") + '</div>';
  table.appendChild(headerRow);

  var domainSelectControls = {};
  var domainDigitsControls = {};

  UNIT_DOMAINS.forEach(function (dom) {
    var row = el("div", "unit-table-row");

    var colPart = el("div", "col-part");
    colPart.innerHTML = '<i class="ph ' + dom.icon + '"></i><div><strong>' + t(dom.key) +
      '</strong><small>' + t(dom.descKey) + '</small></div>';
    row.appendChild(colPart);

    var colUnit = el("div", "col-unit");
    var unitSel = el("select", "unit-select");
    dom.allowed.forEach(function (u) {
      var opt = el("option", null, u === "auto" ? t("unit_precision_auto") : (dom.isArea ? (u === "m2" ? "m²" : "sq ft") : u));
      opt.value = u;
      unitSel.appendChild(opt);
    });
    colUnit.appendChild(unitSel);
    row.appendChild(colUnit);
    domainSelectControls[dom.id] = unitSel;

    var colPrec = el("div", "col-precision");
    var precSel = el("select", "unit-select");
    [
      ["auto", t("unit_precision_auto")],
      ["0", t("unit_precision_0")],
      ["1", t("unit_precision_1")],
      ["2", t("unit_precision_2")],
      ["3", t("unit_precision_3")],
    ].forEach(function (pair) {
      var opt = el("option", null, pair[1]);
      opt.value = pair[0];
      precSel.appendChild(opt);
    });
    colPrec.appendChild(precSel);
    row.appendChild(colPrec);
    domainDigitsControls[dom.id] = precSel;

    var colPrev = el("div", "col-preview");
    var prevBadge = el("span", "unit-preview-badge");
    domainPreviewEls[dom.id] = prevBadge;
    colPrev.appendChild(prevBadge);
    row.appendChild(colPrev);

    unitSel.onchange = function () {
      if (!currentSettings.overrides) currentSettings.overrides = {};
      if (!currentSettings.overrides[dom.id]) currentSettings.overrides[dom.id] = {};
      currentSettings.overrides[dom.id].unit = unitSel.value;
      currentSettings.preset = "custom";
      saveUnitSettings(currentSettings);
      updatePresetRadios();
      updateAllPreviews();
    };

    precSel.onchange = function () {
      if (!currentSettings.overrides) currentSettings.overrides = {};
      if (!currentSettings.overrides[dom.id]) currentSettings.overrides[dom.id] = {};
      currentSettings.overrides[dom.id].digits = precSel.value;
      currentSettings.preset = "custom";
      saveUnitSettings(currentSettings);
      updatePresetRadios();
      updateAllPreviews();
    };

    table.appendChild(row);
  });

  tableWrap.appendChild(table);
  domainsSection.appendChild(tableWrap);
  container.appendChild(domainsSection);

  function syncDomainTableControls() {
    UNIT_DOMAINS.forEach(function (dom) {
      var ov = (currentSettings.overrides && currentSettings.overrides[dom.id]) || { unit: "auto", digits: "auto" };
      if (domainSelectControls[dom.id]) {
        domainSelectControls[dom.id].value = ov.unit || "auto";
      }
      if (domainDigitsControls[dom.id]) {
        domainDigitsControls[dom.id].value = ov.digits != null ? String(ov.digits) : "auto";
      }
    });
  }

  function updatePresetRadios() {
    presetsGrid.querySelectorAll("input[name='unit-preset']").forEach(function (inp) {
      inp.checked = inp.value === currentSettings.preset;
      inp.closest(".unit-preset-card").classList.toggle("active", inp.checked);
    });
  }

  // Formatting Options
  var optionsSection = el("div", "unit-section unit-options-section");
  var suffixLabel = el("label", "unit-checkbox-label");
  var suffixInp = el("input");
  suffixInp.type = "checkbox";
  suffixInp.checked = currentSettings.showSuffix !== false;
  suffixInp.onchange = function () {
    currentSettings.showSuffix = suffixInp.checked;
    saveUnitSettings(currentSettings);
    updateAllPreviews();
  };
  suffixLabel.appendChild(suffixInp);
  suffixLabel.appendChild(el("span", null, t("unit_opt_show_suffix")));
  optionsSection.appendChild(suffixLabel);

  var ftLabel = el("label", "unit-checkbox-label");
  var ftInp = el("input");
  ftInp.type = "checkbox";
  ftInp.checked = currentSettings.feetInches !== false;
  ftInp.onchange = function () {
    currentSettings.feetInches = ftInp.checked;
    saveUnitSettings(currentSettings);
    updateAllPreviews();
  };
  ftLabel.appendChild(ftInp);
  ftLabel.appendChild(el("span", null, t("unit_opt_feet_inches")));
  optionsSection.appendChild(ftLabel);
  container.appendChild(optionsSection);

  // Bottom Actions
  var actionsRow = el("div", "unit-actions-row");
  var resetBtn = el("button", "btn-secondary", t("unit_btn_reset"));
  resetBtn.type = "button";
  resetBtn.onclick = function () {
    currentSettings = defaultUnitSettings();
    saveUnitSettings(currentSettings);
    updatePresetRadios();
    syncDomainTableControls();
    updateAllPreviews();
  };
  actionsRow.appendChild(resetBtn);
  container.appendChild(actionsRow);

  syncDomainTableControls();
  updateAllPreviews();

  return container;
}
