/* Advanced Display Units & Location Detection Engine
   Provides smart defaults based on location (site coordinates or locale)
   and per-domain unit/precision overrides across each part of ModelForge. */

import { S } from "./state.js";
import { t } from "./i18n.js";
import { formatLength, formatArea } from "./planning_units.js";

export const STORAGE_KEY = "home3d_unit_settings";

export const UNIT_DOMAINS = [
  { id: "rooms", icon: "ph-wall", key: "unit_domain_rooms", descKey: "unit_domain_rooms_desc", sampleCm: 380, allowed: ["auto", "m", "cm", "mm", "ft", "in"] },
  { id: "openings", icon: "ph-door", key: "unit_domain_openings", descKey: "unit_domain_openings_desc", sampleCm: 80, sampleExtraCm: 210, allowed: ["auto", "mm", "cm", "m", "in", "ft"] },
  { id: "furniture", icon: "ph-armchair", key: "unit_domain_furniture", descKey: "unit_domain_furniture_desc", sampleCm: 160, sampleExtraCm: 200, allowed: ["auto", "mm", "cm", "m", "in", "ft"] },
  { id: "mep", icon: "ph-pipe", key: "unit_domain_mep", descKey: "unit_domain_mep_desc", sampleCm: 5, allowed: ["auto", "mm", "cm", "m", "in"] },
  { id: "details", icon: "ph-ruler", key: "unit_domain_details", descKey: "unit_domain_details_desc", sampleCm: 10, allowed: ["auto", "mm", "cm", "m", "in"] },
  { id: "site", icon: "ph-map-pin", key: "unit_domain_site", descKey: "unit_domain_site_desc", sampleCm: 2500, allowed: ["auto", "m", "cm", "ft", "in"] },
  { id: "plan", icon: "ph-compass-tool", key: "unit_domain_plan", descKey: "unit_domain_plan_desc", sampleCm: 420, allowed: ["auto", "mm", "m", "cm", "ft", "in"] },
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
 * Tests whether a given latitude/longitude coordinate or place label is within the United States
 * (including contiguous 48 states, Alaska, Hawaii, Puerto Rico, US Virgin Islands).
 * Accurately prevents Canadian (e.g. Toronto, Vancouver) and Mexican locations from falsely triggering US Imperial.
 */
export function isLocationInUS(lat, lon, label) {
  if (label && typeof label === "string") {
    var lbl = label.toLowerCase();
    // Exclude foreign countries and Canadian provinces / Mexican states
    if (/\b(?:canada|ontario|quebec|qu[eé]bec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|toronto|vancouver|montreal|montr[eé]al|ottawa|calgary|edmonton|winnipeg|mexico|m[eé]xico|cdmx|jalisco|nuevo le[oó]n|guadalajara|monterrey|tijuana|cancun|canc[uú]n|united kingdom|uk|england|scotland|wales|australia|germany|france|israel|japan|china|india|brazil|argentina)\b/i.test(lbl)) {
      return false;
    }
    // Explicit US country or US state abbreviations
    if (/\b(?:united states|usa|u\.s\.a\.|u\.s\.|puerto rico)\b/i.test(lbl) || /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|PR|VI|GU)\b/.test(label)) {
      return true;
    }
  }

  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return false;
  }

  // Puerto Rico & US Virgin Islands
  if (lat >= 17.5 && lat <= 18.6 && lon >= -67.5 && lon <= -64.5) return true;
  // Hawaii
  if (lat >= 18.5 && lat <= 22.5 && lon >= -161.0 && lon <= -154.0) return true;
  // Alaska
  if (lat >= 51.0 && lat <= 71.5 && lon >= -175.0 && lon <= -130.0) return true;

  // North American continental checks:
  // Canadian border: latitude > 49.05 is Canada (49th parallel)
  if (lat > 49.05) return false;
  // Below latitude 24.5 is Mexico/Caribbean
  if (lat < 24.5) return false;
  // Ocean bounds for contiguous 48 states
  if (lon < -125.0 || lon > -66.9) return false;

  // Northern Mexico border approximations:
  // Baja California, Sonora, Chihuahua
  if (lon >= -117.3 && lon <= -106.0 && lat < 31.33) return false;
  // Coahuila, Nuevo León, Tamaulipas
  if (lon > -106.0 && lon <= -97.5 && lat < 25.85) return false;

  // Contiguous US
  return true;
}

/**
 * Detects unit system from system timezone (e.g. America/New_York vs America/Toronto vs Europe/London).
 */
export function detectTimezoneUnitSystem() {
  try {
    if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        // Specific US timezones
        var isUSTZ = /^(?:America\/(?:New_York|Detroit|Kentucky\/\w+|Indiana\/\w+|Chicago|Menominee|North_Dakota\/\w+|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak)|Pacific\/Honolulu)$/.test(tz);
        return {
          system: isUSTZ ? "imperial" : "metric",
          reason: "timezone",
          detail: tz,
        };
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Detects whether the user's location warrants a Metric or US Imperial unit system.
 * Checks user manual override mode first, then project site coordinates/label,
 * browser locale / Intl.Locale, and timezone fallback.
 */
export function detectLocationUnitSystem(settings) {
  var s = settings || (activeSettings || loadUnitSettings());
  var locMode = s && s.locationMode ? s.locationMode : "auto";
  if (locMode === "metric") {
    return { system: "metric", reason: "manual", detail: "metric" };
  }
  if (locMode === "imperial") {
    return { system: "imperial", reason: "manual", detail: "imperial" };
  }

  // 1. Site coordinates / label
  if (S.site && S.site.enabled && S.site.lat != null && S.site.lon != null) {
    var lat = Number(S.site.lat);
    var lon = Number(S.site.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      var isUS = isLocationInUS(lat, lon, S.site.label);
      var detail = S.site.label || (lat.toFixed(2) + "°, " + lon.toFixed(2) + "°");
      return {
        system: isUS ? "imperial" : "metric",
        reason: "site",
        detail: detail,
      };
    }
  }

  // 2. System Timezone (accurate physical location: e.g. America/New_York vs Asia/Jerusalem or Europe/Paris)
  var tzResult = detectTimezoneUnitSystem();
  if (tzResult && tzResult.detail && tzResult.detail !== "UTC" && tzResult.detail !== "Etc/UTC") {
    return tzResult;
  }

  // 3. Browser locale / Intl.Locale fallback
  var nav = typeof navigator !== "undefined" ? navigator : null;
  var navLang = (nav && (nav.language || (nav.languages && nav.languages[0]))) || "";
  if (navLang) {
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
        if (reg && reg !== "US") {
          return { system: "metric", reason: "locale", detail: navLang };
        }
      }
    } catch (_) {}

    if (/-US\b/i.test(navLang) || /-LR\b/i.test(navLang) || /-MM\b/i.test(navLang)) {
      return { system: "imperial", reason: "locale", detail: navLang };
    }
  }

  return {
    system: "metric",
    reason: "default",
    detail: navLang || "default",
  };
}

/**
 * Smart defaults that best suit each menu/part of the app.
 * Metric:
 *   Rooms/Structure: meters (m, 2 decimals)
 *   Openings (doors/windows): millimeters (mm, 0 decimals)
 *   Furniture/Objects: millimeters (mm, 0 decimals)
 *   MEP (plumbing, conduits): millimeters (mm, 0 decimals)
 *   Details (wall thickness, profiles): millimeters (mm, 0 decimals)
 *   Site/Terrain: meters (m, 2 decimals)
 *   Plan 2D & HUD: millimeters (mm, 0 decimals)
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
    openings: { unit: "mm", digits: 0 },
    furniture: { unit: "mm", digits: 0 },
    mep: { unit: "mm", digits: 0 },
    details: { unit: "mm", digits: 0 },
    site: { unit: "m", digits: 2 },
    plan: { unit: "mm", digits: 0 },
    area: { unit: "m2", digits: 2 },
  };
}

export function defaultUnitSettings() {
  return {
    /* Auto preset dynamically detects locale / site location and applies
       professional CAD/BIM standards (m / mm or ft / in) for each tool. */
    preset: "auto",
    basePreset: "auto",
    locationMode: "auto",
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
          if (parsed.basePreset) base.basePreset = parsed.basePreset;
          if (parsed.locationMode) base.locationMode = parsed.locationMode;
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
 * Resets a single domain row override back to auto.
 * If all domains return to auto, the active preset reverts to basePreset or "auto".
 */
export function resetDomainOverride(domainId) {
  var current = loadUnitSettings();
  if (!current.overrides) current.overrides = {};
  current.overrides[domainId] = { unit: "auto", digits: "auto" };

  var anyOverridden = false;
  UNIT_DOMAINS.forEach(function (d) {
    var ov = current.overrides[d.id];
    if (ov && (ov.unit !== "auto" || (ov.digits !== "auto" && ov.digits != null))) {
      anyOverridden = true;
    }
  });

  if (!anyOverridden && current.preset === "custom") {
    current.preset = current.basePreset || "auto";
  }

  return saveUnitSettings(current);
}

/**
 * Resets all domain row overrides back to auto.
 * If the preset was "custom", it reverts to basePreset or "auto".
 */
export function resetAllDomainOverrides() {
  var current = loadUnitSettings();
  if (!current.overrides) current.overrides = {};
  UNIT_DOMAINS.forEach(function (d) {
    current.overrides[d.id] = { unit: "auto", digits: "auto" };
  });

  if (current.preset === "custom") {
    current.preset = current.basePreset || "auto";
  }

  return saveUnitSettings(current);
}

/**
 * Completely resets unit settings back to factory defaults.
 */
export function resetAllUnitSettings() {
  var fresh = defaultUnitSettings();
  return saveUnitSettings(fresh);
}

/**
 * Returns the effective unit and digits for a given domain under the active preset & overrides.
 */
export function getDomainConfig(domain) {
  var settings = loadUnitSettings();
  var detected = detectLocationUnitSystem(settings);
  var smart = getSmartDefaults(detected.system);
  var dom = domain || "plan";

  var preset = settings.preset || "auto";
  var effectivePreset = preset;
  if (preset === "custom") {
    effectivePreset = settings.basePreset || "auto";
  }

  var ov = (settings.overrides && settings.overrides[dom]) || { unit: "auto", digits: "auto" };

  var unit = "auto";
  var digits = "auto";

  if (effectivePreset === "auto") {
    var def = smart[dom] || { unit: "cm", digits: 0 };
    unit = ov.unit !== "auto" ? ov.unit : def.unit;
    digits = ov.digits !== "auto" ? ov.digits : def.digits;
  } else if (effectivePreset === "metric_arch") {
    var archDefaults = getSmartDefaults("metric");
    var aDef = archDefaults[dom] || { unit: "cm", digits: 0 };
    unit = ov.unit !== "auto" ? ov.unit : aDef.unit;
    digits = ov.digits !== "auto" ? ov.digits : aDef.digits;
  } else if (effectivePreset === "metric_mm") {
    unit = ov.unit !== "auto" ? ov.unit : (dom === "area" ? "m2" : dom === "site" ? "m" : "mm");
    digits = ov.digits !== "auto" ? ov.digits : (unit === "m" || unit === "m2" ? 2 : 0);
  } else if (effectivePreset === "metric_cm") {
    unit = ov.unit !== "auto" ? ov.unit : (dom === "area" ? "m2" : dom === "site" ? "m" : "cm");
    digits = ov.digits !== "auto" ? ov.digits : (unit === "m" || unit === "m2" ? 2 : 0);
  } else if (effectivePreset === "metric_m") {
    unit = ov.unit !== "auto" ? ov.unit : (dom === "area" ? "m2" : "m");
    digits = ov.digits !== "auto" ? ov.digits : 2;
  } else if (effectivePreset === "imperial") {
    var impDefaults = getSmartDefaults("imperial");
    var iDef = impDefaults[dom] || { unit: "in", digits: 1 };
    unit = ov.unit !== "auto" ? ov.unit : iDef.unit;
    digits = ov.digits !== "auto" ? ov.digits : iDef.digits;
  } else {
    // fallback
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
  if (/^(?:o_|ow_|workflow-opening-)/.test(id)) return "openings";
  if (/^w_(?:th|bulge|corner_value)/.test(id)) return "details";
  if (/^(?:mdDim|mdGrid|mdDepth|mdBase|mdWallWidth)/.test(id)) return "details";
  if (/^(?:w_(?:len|h|top_|base_)|r_(?:w|d)|sv_)/.test(id)) return "rooms";
  if (/^(?:i_(?:w|d|h|elev)|mk_|cb[WDH]|cb_)/.test(id)) return "furniture";
  if (/^mep_/.test(id)) return "mep";
  if (/^site_/.test(id)) return "site";
  if (/^(?:inLen|inOff|cadLen|cadOff|cadAng|nd_|dim_|measure_|con_value)/.test(id)) return "plan";
  return null;
}

/**
 * Infer domain from an active planner drafting tool (e.g. wall -> rooms, door -> openings)
 */
export function inferDomainFromTool(tool) {
  if (!tool || typeof tool !== "string") return "plan";
  if (tool === "door" || tool === "window" || tool === "passage") return "openings";
  if (/^(?:wall|arcwall|rect|roomstamp|slab|slabvoid|walloffset|wallbite|wallbreak|walljoin|wallreverse|wallsplit)$/.test(tool)) return "rooms";
  if (tool.startsWith("mep")) return "mep";
  if (tool === "item" || tool === "furniture") return "furniture";
  if (tool === "site") return "site";
  return "plan";
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

  var currentSettings = loadUnitSettings();

  var banner = el("div", "unit-location-banner");
  var locInfo = el("div", "unit-location-info");
  var locControls = el("div", "unit-location-controls");

  var pillEl = el("span", "unit-loc-pill");
  var textEl = el("span", "unit-loc-text");
  locInfo.appendChild(pillEl);
  locInfo.appendChild(textEl);

  var locSelect = el("select", "unit-location-select");
  var optAuto = el("option", null, t("unit_loc_mode_auto", { system: "" }));
  optAuto.value = "auto";
  locSelect.appendChild(optAuto);

  var optMetric = el("option", null, t("unit_loc_mode_metric"));
  optMetric.value = "metric";
  locSelect.appendChild(optMetric);

  var optImp = el("option", null, t("unit_loc_mode_imperial"));
  optImp.value = "imperial";
  locSelect.appendChild(optImp);

  locControls.appendChild(locSelect);
  banner.appendChild(locInfo);
  banner.appendChild(locControls);
  container.appendChild(banner);

  function updateBanner() {
    var detected = detectLocationUnitSystem(currentSettings);
    var isMetric = detected.system === "metric";
    pillEl.className = "unit-loc-pill " + (isMetric ? "metric" : "imperial");
    pillEl.textContent = isMetric ? t("unit_loc_pill_metric") : t("unit_loc_pill_imperial");

    var reasonLabel = detected.reason === "site" ? t("unit_loc_reason_site") :
      detected.reason === "locale" ? t("unit_loc_reason_locale", { locale: detected.detail }) :
      detected.reason === "timezone" ? t("unit_loc_reason_timezone", { tz: detected.detail }) :
      detected.reason === "manual" ? t("unit_loc_reason_manual") :
      t("unit_loc_reason_default");

    var sysText = isMetric ? t("unit_loc_metric", { reason: reasonLabel }) : t("unit_loc_imperial", { reason: reasonLabel });
    textEl.innerHTML = '<i class="ph ph-map-pin"></i> ' + sysText;

    locSelect.value = currentSettings.locationMode || "auto";
    var autoSystemLabel = isMetric ? "Metric" : "US Imperial";
    optAuto.textContent = t("unit_loc_mode_auto", { system: autoSystemLabel });
  }

  locSelect.onchange = function () {
    currentSettings.locationMode = locSelect.value;
    saveUnitSettings(currentSettings);
    updateBanner();
    updateAllPreviews();
  };

  var presetsSection = el("div", "unit-section");
  var presetsHead = el("h4", "unit-section-title", t("unit_presets_title"));
  presetsSection.appendChild(presetsHead);

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
      if (p.id !== "custom") {
        currentSettings.basePreset = p.id;
      }
      saveUnitSettings(currentSettings);
      presetsGrid.querySelectorAll(".unit-preset-card").forEach(function (c) {
        c.classList.toggle("active", c.querySelector("input").checked);
      });
      syncDomainTableControls();
      updateAllPreviews();
      updateResetButtonStates();
    };

    presetsGrid.appendChild(card);
  });
  presetsSection.appendChild(presetsGrid);
  container.appendChild(presetsSection);

  var domainsSection = el("div", "unit-section");
  var headerRowSec = el("div", "unit-section-header-row");
  var titleCol = el("div");
  var domainsHead = el("h4", "unit-section-title", t("unit_domains_title"));
  var domainsDesc = el("p", "unit-section-desc", t("unit_domains_desc"));
  titleCol.appendChild(domainsHead);
  titleCol.appendChild(domainsDesc);
  headerRowSec.appendChild(titleCol);

  var resetAllDomainsBtn = el("button", "unit-reset-all-domains-btn");
  resetAllDomainsBtn.type = "button";
  resetAllDomainsBtn.innerHTML = '<i class="ph ph-arrow-counter-clockwise"></i> ' + t("unit_btn_reset_all_domains");
  headerRowSec.appendChild(resetAllDomainsBtn);
  domainsSection.appendChild(headerRowSec);

  var tableWrap = el("div", "unit-table-wrap");
  var table = el("div", "unit-domain-table");

  var headerRow = el("div", "unit-table-row header");
  headerRow.innerHTML = '<div class="col-part">' + t("unit_col_part") + '</div>' +
    '<div class="col-unit">' + t("unit_col_unit") + '</div>' +
    '<div class="col-precision">' + t("unit_col_precision") + '</div>' +
    '<div class="col-preview">' + t("unit_col_preview") + '</div>' +
    '<div class="col-action">' + t("unit_col_action") + '</div>';
  table.appendChild(headerRow);

  var domainSelectControls = {};
  var domainDigitsControls = {};
  var domainRowEls = {};
  var domainResetBtnEls = {};

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

    var colAction = el("div", "col-action");
    var rowResetBtn = el("button", "unit-row-reset-btn");
    rowResetBtn.type = "button";
    rowResetBtn.title = t("unit_btn_reset_row");
    rowResetBtn.innerHTML = '<i class="ph ph-arrow-counter-clockwise"></i>';
    colAction.appendChild(rowResetBtn);
    row.appendChild(colAction);

    domainRowEls[dom.id] = row;
    domainResetBtnEls[dom.id] = rowResetBtn;

    unitSel.onchange = function () {
      if (!currentSettings.overrides) currentSettings.overrides = {};
      if (!currentSettings.overrides[dom.id]) currentSettings.overrides[dom.id] = {};
      currentSettings.overrides[dom.id].unit = unitSel.value;
      if (currentSettings.preset !== "custom") {
        currentSettings.basePreset = currentSettings.preset;
      }
      currentSettings.preset = "custom";
      saveUnitSettings(currentSettings);
      updatePresetRadios();
      updateAllPreviews();
      updateResetButtonStates();
    };

    precSel.onchange = function () {
      if (!currentSettings.overrides) currentSettings.overrides = {};
      if (!currentSettings.overrides[dom.id]) currentSettings.overrides[dom.id] = {};
      currentSettings.overrides[dom.id].digits = precSel.value;
      if (currentSettings.preset !== "custom") {
        currentSettings.basePreset = currentSettings.preset;
      }
      currentSettings.preset = "custom";
      saveUnitSettings(currentSettings);
      updatePresetRadios();
      updateAllPreviews();
      updateResetButtonStates();
    };

    rowResetBtn.onclick = function () {
      resetDomainOverride(dom.id);
      currentSettings = loadUnitSettings();
      syncDomainTableControls();
      updatePresetRadios();
      updateAllPreviews();
      updateResetButtonStates();
    };

    table.appendChild(row);
  });

  resetAllDomainsBtn.onclick = function () {
    resetAllDomainOverrides();
    currentSettings = loadUnitSettings();
    syncDomainTableControls();
    updatePresetRadios();
    updateAllPreviews();
    updateResetButtonStates();
  };

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

  function updateResetButtonStates() {
    var hasAny = false;
    UNIT_DOMAINS.forEach(function (dom) {
      var ov = (currentSettings.overrides && currentSettings.overrides[dom.id]) || { unit: "auto", digits: "auto" };
      var isOverridden = ov.unit !== "auto" || (ov.digits !== "auto" && ov.digits != null);
      if (isOverridden) hasAny = true;
      if (domainRowEls[dom.id]) {
        domainRowEls[dom.id].classList.toggle("is-overridden", isOverridden);
      }
      if (domainResetBtnEls[dom.id]) {
        domainResetBtnEls[dom.id].disabled = !isOverridden;
      }
    });
    resetAllDomainsBtn.disabled = !hasAny;
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
  var resetAllBtn = el("button", "btn-secondary", t("unit_btn_reset_all"));
  resetAllBtn.type = "button";
  resetAllBtn.onclick = function () {
    resetAllUnitSettings();
    currentSettings = loadUnitSettings();
    updateBanner();
    updatePresetRadios();
    syncDomainTableControls();
    suffixInp.checked = currentSettings.showSuffix !== false;
    ftInp.checked = currentSettings.feetInches !== false;
    updateAllPreviews();
    updateResetButtonStates();
  };
  actionsRow.appendChild(resetAllBtn);
  container.appendChild(actionsRow);

  updateBanner();
  syncDomainTableControls();
  updateResetButtonStates();
  updateAllPreviews();

  return container;
}
