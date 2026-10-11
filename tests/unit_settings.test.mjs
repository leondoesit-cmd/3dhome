import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import {
  isLocationInUS,
  detectLocationUnitSystem,
  getSmartDefaults,
  getDomainConfig,
  getDomainUnit,
  getDomainDigits,
  inferDomainFromElementId,
  inferDomainFromTool,
  saveUnitSettings,
  loadUnitSettings,
  defaultUnitSettings,
  resetDomainOverride,
  resetAllDomainOverrides,
  resetAllUnitSettings,
  UNIT_DOMAINS,
  PRESET_DEFS,
} from "../js/unit_settings.js";
import {
  displayUnit,
  unitLabel,
  areaUnitLabel,
  fmtLen,
  parseLen,
  writeLen,
  fmtAreaM2,
  parseAreaM2,
} from "../js/display_units.js";

test("detectLocationUnitSystem identifies metric and US imperial locations accurately", () => {
  // Test site coordinates in the US (e.g. San Francisco)
  S.site = { enabled: true, lat: 37.7749, lon: -122.4194, label: "San Francisco, CA" };
  const usLoc = detectLocationUnitSystem();
  assert.equal(usLoc.system, "imperial");
  assert.equal(usLoc.reason, "site");

  // Test Alaska, Hawaii, and Puerto Rico
  S.site = { enabled: true, lat: 21.3069, lon: -157.8583, label: "Honolulu, Hawaii" };
  assert.equal(detectLocationUnitSystem().system, "imperial", "Hawaii is US imperial");

  S.site = { enabled: true, lat: 61.2181, lon: -149.9003, label: "Anchorage, Alaska" };
  assert.equal(detectLocationUnitSystem().system, "imperial", "Alaska is US imperial");

  S.site = { enabled: true, lat: 18.4655, lon: -66.1057, label: "San Juan, Puerto Rico" };
  assert.equal(detectLocationUnitSystem().system, "imperial", "Puerto Rico is US imperial");

  // Canada must NOT be imperial even though it is in North America
  S.site = { enabled: true, lat: 43.6532, lon: -79.3832, label: "Toronto, Ontario, Canada" };
  assert.equal(detectLocationUnitSystem().system, "metric", "Toronto is Canada -> metric");
  assert.equal(isLocationInUS(43.6532, -79.3832, null), false, "Toronto coordinates are not the US");
  assert.equal(isLocationInUS(32.5149, -117.0382, null), false, "Tijuana is not the US");
  assert.equal(isLocationInUS(51.883, -176.658, null), true, "Adak is Alaska");
  assert.equal(isLocationInUS(34.06, -117.65, "Ontario, CA"), true, "Ontario, California is the US");

  S.site = { enabled: true, lat: 49.2827, lon: -123.1207, label: "Vancouver, BC, Canada" };
  assert.equal(detectLocationUnitSystem().system, "metric", "Vancouver is Canada -> metric");

  // Canada high latitude without label
  S.site = { enabled: true, lat: 53.5461, lon: -113.4938, label: "" };
  assert.equal(detectLocationUnitSystem().system, "metric", "lat > 49.05 -> metric Canada");

  // Mexico must NOT be imperial
  S.site = { enabled: true, lat: 19.4326, lon: -99.1332, label: "Mexico City, Mexico" };
  assert.equal(detectLocationUnitSystem().system, "metric", "Mexico City is Mexico -> metric");

  S.site = { enabled: true, lat: 25.6866, lon: -100.3161, label: "Monterrey, Mexico" };
  assert.equal(detectLocationUnitSystem().system, "metric", "Monterrey is Mexico -> metric");

  // Test site coordinates outside the Americas (e.g. Tel Aviv, Paris)
  S.site = { enabled: true, lat: 32.0853, lon: 34.7818, label: "Tel Aviv, Israel" };
  const ilLoc = detectLocationUnitSystem();
  assert.equal(ilLoc.system, "metric");
  assert.equal(ilLoc.reason, "site");

  S.site = { enabled: true, lat: 48.8566, lon: 2.3522, label: "Paris, France" };
  const frLoc = detectLocationUnitSystem();
  assert.equal(frLoc.system, "metric");
  assert.equal(frLoc.reason, "site");

  // Reset site
  S.site = { enabled: false, lat: null, lon: null };
});

test("manual locationMode override overrides geographic and locale detection", () => {
  // Even with a US site, setting locationMode to 'metric' forces metric
  S.site = { enabled: true, lat: 37.7749, lon: -122.4194, label: "San Francisco, CA" };
  saveUnitSettings({ locationMode: "metric" });
  let loc = detectLocationUnitSystem();
  assert.equal(loc.system, "metric");
  assert.equal(loc.reason, "manual");

  // Even with an EU site, setting locationMode to 'imperial' forces imperial
  S.site = { enabled: true, lat: 48.8566, lon: 2.3522, label: "Paris, France" };
  saveUnitSettings({ locationMode: "imperial" });
  loc = detectLocationUnitSystem();
  assert.equal(loc.system, "imperial");
  assert.equal(loc.reason, "manual");

  // Restoring auto returns to site detection
  saveUnitSettings({ locationMode: "auto" });
  loc = detectLocationUnitSystem();
  assert.equal(loc.system, "metric");
  assert.equal(loc.reason, "site");

  S.site = { enabled: false, lat: null, lon: null };
});

test("smart defaults match professional CAD standards (m for rooms/site, mm for plan/openings/furniture/MEP/details)", () => {
  const metric = getSmartDefaults("metric");
  assert.equal(metric.rooms.unit, "m", "rooms suited to meters");
  assert.equal(metric.openings.unit, "mm", "doors/windows suited to mm");
  assert.equal(metric.furniture.unit, "mm", "furniture suited to mm");
  assert.equal(metric.mep.unit, "mm", "MEP pipes/conduits suited to mm");
  assert.equal(metric.details.unit, "mm", "thicknesses/profiles suited to mm");
  assert.equal(metric.site.unit, "m", "site boundaries suited to meters");
  assert.equal(metric.plan.unit, "mm", "plan CAD annotations suited to millimeters");
  assert.equal(metric.area.unit, "m2", "area suited to square meters");

  const imperial = getSmartDefaults("imperial");
  assert.equal(imperial.rooms.unit, "ft");
  assert.equal(imperial.openings.unit, "in");
  assert.equal(imperial.furniture.unit, "in");
  assert.equal(imperial.mep.unit, "in");
  assert.equal(imperial.details.unit, "in");
  assert.equal(imperial.site.unit, "ft");
  assert.equal(imperial.plan.unit, "ft");
  assert.equal(imperial.area.unit, "sqft");
});

test("presets configure expected domain units across the application", () => {
  // 1. Architectural Metric Preset
  saveUnitSettings({ preset: "metric_arch", overrides: {} });
  assert.equal(getDomainUnit("rooms"), "m");
  assert.equal(getDomainUnit("openings"), "mm");
  assert.equal(getDomainUnit("furniture"), "mm");
  assert.equal(getDomainUnit("mep"), "mm");
  assert.equal(getDomainUnit("details"), "mm");
  assert.equal(getDomainUnit("site"), "m");

  // 2. Engineering (all mm) Preset
  saveUnitSettings({ preset: "metric_mm", overrides: {} });
  assert.equal(getDomainUnit("rooms"), "mm");
  assert.equal(getDomainUnit("openings"), "mm");
  assert.equal(getDomainUnit("furniture"), "mm");
  assert.equal(getDomainUnit("mep"), "mm");
  assert.equal(getDomainUnit("details"), "mm");

  // 3. Centimeters Preset
  saveUnitSettings({ preset: "metric_cm", overrides: {} });
  assert.equal(getDomainUnit("rooms"), "cm");
  assert.equal(getDomainUnit("openings"), "cm");
  assert.equal(getDomainUnit("furniture"), "cm");
  assert.equal(getDomainUnit("mep"), "cm");
  assert.equal(getDomainUnit("details"), "cm");

  // 4. US Imperial Preset
  saveUnitSettings({ preset: "imperial", overrides: {} });
  assert.equal(getDomainUnit("rooms"), "ft");
  assert.equal(getDomainUnit("openings"), "in");
  assert.equal(getDomainUnit("furniture"), "in");
  assert.equal(getDomainUnit("mep"), "in");
  assert.equal(getDomainUnit("details"), "in");

  // 5. Custom overrides
  saveUnitSettings({
    preset: "custom",
    overrides: {
      rooms: { unit: "m", digits: 2 },
      openings: { unit: "mm", digits: 0 },
      furniture: { unit: "cm", digits: 0 },
      mep: { unit: "mm", digits: 0 },
      details: { unit: "mm", digits: 0 },
    },
  });
  assert.equal(getDomainUnit("rooms"), "m");
  assert.equal(getDomainUnit("openings"), "mm");
  assert.equal(getDomainUnit("furniture"), "cm");
  assert.equal(getDomainUnit("mep"), "mm");
});

test("inferDomainFromElementId and inferDomainFromTool accurately map drafting tools and elements", () => {
  assert.equal(inferDomainFromElementId("w_len"), "rooms");
  assert.equal(inferDomainFromElementId("w_h"), "rooms");
  assert.equal(inferDomainFromElementId("r_w"), "rooms");
  assert.equal(inferDomainFromElementId("r_d"), "rooms");
  assert.equal(inferDomainFromElementId("sv_w"), "rooms");
  assert.equal(inferDomainFromElementId("w_th"), "details");
  assert.equal(inferDomainFromElementId("w_bulge"), "details");
  assert.equal(inferDomainFromElementId("w_corner_value"), "details");
  assert.equal(inferDomainFromElementId("o_w"), "openings");
  assert.equal(inferDomainFromElementId("o_h"), "openings");
  assert.equal(inferDomainFromElementId("o_sill"), "openings");
  assert.equal(inferDomainFromElementId("o_m_l"), "openings");
  assert.equal(inferDomainFromElementId("ow_w"), "openings");
  assert.equal(inferDomainFromElementId("workflow-opening-width"), "openings");
  assert.equal(inferDomainFromElementId("i_w"), "furniture");
  assert.equal(inferDomainFromElementId("i_d"), "furniture");
  assert.equal(inferDomainFromElementId("i_h"), "furniture");
  assert.equal(inferDomainFromElementId("mk_x"), "furniture");
  assert.equal(inferDomainFromElementId("mep_run"), "mep");
  assert.equal(inferDomainFromElementId("site_offX"), "site");
  assert.equal(inferDomainFromElementId("cbW"), "furniture");
  assert.equal(inferDomainFromElementId("cbH"), "furniture");
  assert.equal(inferDomainFromElementId("mdDimValue"), "details");
  assert.equal(inferDomainFromElementId("mdDepth"), "details");
  assert.equal(inferDomainFromElementId("inLen"), "plan");
  assert.equal(inferDomainFromElementId("cadLen"), "plan");
  assert.equal(inferDomainFromElementId("con_value"), "plan");
  assert.equal(inferDomainFromElementId("nd_x"), "plan");
  assert.equal(inferDomainFromElementId("unknown_el"), null);

  assert.equal(inferDomainFromTool("wall"), "rooms");
  assert.equal(inferDomainFromTool("arcwall"), "rooms");
  assert.equal(inferDomainFromTool("rect"), "rooms");
  assert.equal(inferDomainFromTool("roomstamp"), "rooms");
  assert.equal(inferDomainFromTool("door"), "openings");
  assert.equal(inferDomainFromTool("window"), "openings");
  assert.equal(inferDomainFromTool("passage"), "openings");
  assert.equal(inferDomainFromTool("mep_pipe"), "mep");
  assert.equal(inferDomainFromTool("item"), "furniture");
  assert.equal(inferDomainFromTool("site"), "site");
  assert.equal(inferDomainFromTool("select"), "plan");
});

test("domain-aware fmtLen formats numbers using each menu's active unit", () => {
  saveUnitSettings({ preset: "metric_arch", overrides: {} });

  // 350 cm wall length in rooms domain -> 3.5 m
  assert.equal(fmtLen(350, { domain: "rooms" }), "3.5 m");

  // 80 cm door in openings domain -> 800 mm
  assert.equal(fmtLen(80, { domain: "openings" }), "800 mm");

  // 160 cm bed in furniture domain -> 1600 mm
  assert.equal(fmtLen(160, { domain: "furniture" }), "1600 mm");

  // 10 cm wall thickness in details domain -> 100 mm
  assert.equal(fmtLen(10, { domain: "details" }), "100 mm");

  // 5 cm pipe in mep domain -> 50 mm
  assert.equal(fmtLen(5, { domain: "mep" }), "50 mm");

  // 2500 cm lot in site domain -> 25 m
  assert.equal(fmtLen(2500, { domain: "site" }), "25 m");
});

test("domain-aware parseLen interprets bare numbers according to the menu unit, while honoring typed suffixes", () => {
  saveUnitSettings({ preset: "metric_arch", overrides: {} });

  // In rooms domain (unit is 'm'):
  assert.equal(parseLen("4.2", "rooms"), 420, "4.2 without suffix in rooms is 4.2m = 420cm");
  // Explicit suffixes work anywhere
  assert.equal(parseLen("420cm", "rooms"), 420);
  assert.equal(parseLen("4200mm", "rooms"), 420);
  assert.equal(parseLen("10ft", "rooms"), 10 * 30.48);

  // In openings domain (unit is 'mm'):
  assert.equal(parseLen("800", "openings"), 80, "800 without suffix in openings is 800mm = 80cm");
  assert.equal(parseLen("0.8m", "openings"), 80);
  assert.equal(parseLen("80cm", "openings"), 80);
  assert.equal(parseLen("800mm", "openings"), 80);

  // In details domain (unit is 'mm'):
  assert.equal(parseLen("150", "details"), 15, "150 without suffix in details is 150mm = 15cm");
  assert.equal(parseLen("15cm", "details"), 15);
  assert.equal(parseLen("0.15m", "details"), 15);

  // In mep domain (unit is 'mm'):
  assert.equal(parseLen("50", "mep"), 5, "50 without suffix in mep is 50mm = 5cm");
});

test("writeLen writes correct domain values and digits into elements", () => {
  saveUnitSettings({ preset: "metric_arch", overrides: {} });

  const dummyWLen = { id: "w_len", value: "" };
  writeLen(dummyWLen, 350);
  assert.equal(dummyWLen.value, "3.5", "350 cm wall is written as 3.5 in w_len");

  const dummyWTh = { id: "w_th", value: "" };
  writeLen(dummyWTh, 10);
  assert.equal(dummyWTh.value, "100", "10 cm thickness is written as 100 in w_th");

  const dummyOW = { id: "o_w", value: "" };
  writeLen(dummyOW, 80);
  assert.equal(dummyOW.value, "800", "80 cm opening is written as 800 in o_w");

  const dummyIW = { id: "i_w", value: "" };
  writeLen(dummyIW, 160);
  assert.equal(dummyIW.value, "1600", "160 cm furniture is written as 1600 in i_w");
});

test("area formatting supports metric m² and imperial sqft", () => {
  saveUnitSettings({ preset: "metric_arch", overrides: {} });
  assert.equal(fmtAreaM2(24.5), "24.5 m²");
  assert.equal(parseAreaM2("24.5"), 24.5);

  saveUnitSettings({ preset: "imperial", overrides: {} });
  assert.equal(fmtAreaM2(24.5), (24.5 * 10.7639).toFixed(1) + " sq ft");

  // Restore defaults so other test suites run with clean state
  saveUnitSettings({ preset: "auto", overrides: {} });
});

test("resetDomainOverride resets a specific line to auto and reverts custom preset when clean", () => {
  saveUnitSettings({
    preset: "custom",
    basePreset: "metric_arch",
    overrides: {
      furniture: { unit: "cm", digits: 1 },
      openings: { unit: "in", digits: 2 },
    },
  });

  assert.equal(getDomainUnit("furniture"), "cm");
  assert.equal(getDomainUnit("openings"), "in");

  // Reset only furniture
  const s1 = resetDomainOverride("furniture");
  assert.equal(s1.overrides.furniture.unit, "auto");
  assert.equal(s1.overrides.openings.unit, "in");
  assert.equal(s1.preset, "custom", "still custom because openings is overridden");

  // Reset openings
  const s2 = resetDomainOverride("openings");
  assert.equal(s2.overrides.openings.unit, "auto");
  assert.equal(s2.preset, "metric_arch", "reverted to basePreset metric_arch once all overrides are cleared");
});

test("resetAllDomainOverrides resets all lines to auto and restores base preset", () => {
  saveUnitSettings({
    preset: "custom",
    basePreset: "imperial",
    overrides: {
      rooms: { unit: "m", digits: 2 },
      furniture: { unit: "mm", digits: 0 },
      details: { unit: "cm", digits: 1 },
    },
  });

  const s = resetAllDomainOverrides();
  UNIT_DOMAINS.forEach((dom) => {
    assert.equal(s.overrides[dom.id].unit, "auto");
    assert.equal(s.overrides[dom.id].digits, "auto");
  });
  assert.equal(s.preset, "imperial", "preset reverted to basePreset imperial");
});

test("resetAllUnitSettings restores complete factory defaults", () => {
  saveUnitSettings({
    preset: "custom",
    basePreset: "imperial",
    locationMode: "imperial",
    showSuffix: false,
    feetInches: false,
    overrides: {
      rooms: { unit: "in", digits: 0 },
    },
  });

  const def = resetAllUnitSettings();
  assert.equal(def.preset, "auto");
  assert.equal(def.basePreset, "auto");
  assert.equal(def.locationMode, "auto");
  assert.equal(def.showSuffix, true);
  assert.equal(def.feetInches, true);
  UNIT_DOMAINS.forEach((dom) => {
    assert.equal(def.overrides[dom.id].unit, "auto");
    assert.equal(def.overrides[dom.id].digits, "auto");
  });
});

test("custom preset retains basePreset so unedited auto lines resolve against the base system", () => {
  // Start with metric_cm base
  saveUnitSettings({
    preset: "custom",
    basePreset: "metric_cm",
    overrides: {
      openings: { unit: "mm", digits: 0 }, // only openings customized
    },
  });

  // Customized opening uses mm
  assert.equal(getDomainUnit("openings"), "mm");
  // Unedited furniture domain resolves against metric_cm base (cm), NOT default mm!
  assert.equal(getDomainUnit("furniture"), "cm");
  // Unedited rooms domain resolves against metric_cm base (cm)
  assert.equal(getDomainUnit("rooms"), "cm");

  // Restore clean default
  resetAllUnitSettings();
});
