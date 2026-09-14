import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import {
  detectLocationUnitSystem,
  getSmartDefaults,
  getDomainConfig,
  getDomainUnit,
  getDomainDigits,
  inferDomainFromElementId,
  saveUnitSettings,
  loadUnitSettings,
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

  // Test site coordinates outside the US (e.g. Tel Aviv)
  S.site = { enabled: true, lat: 32.0853, lon: 34.7818, label: "Tel Aviv, Israel" };
  const ilLoc = detectLocationUnitSystem();
  assert.equal(ilLoc.system, "metric");
  assert.equal(ilLoc.reason, "site");

  // Test site coordinates outside the US (e.g. Paris)
  S.site = { enabled: true, lat: 48.8566, lon: 2.3522, label: "Paris, France" };
  const frLoc = detectLocationUnitSystem();
  assert.equal(frLoc.system, "metric");
  assert.equal(frLoc.reason, "site");

  // Reset site
  S.site = { enabled: false, lat: null, lon: null };
});

test("smart defaults match what best suits each menu (m for rooms/site, cm for openings/furniture, mm for MEP/details)", () => {
  const metric = getSmartDefaults("metric");
  assert.equal(metric.rooms.unit, "m", "rooms suited to meters");
  assert.equal(metric.openings.unit, "cm", "doors/windows suited to cm");
  assert.equal(metric.furniture.unit, "cm", "furniture suited to cm");
  assert.equal(metric.mep.unit, "mm", "MEP pipes/conduits suited to mm");
  assert.equal(metric.details.unit, "mm", "thicknesses/profiles suited to mm");
  assert.equal(metric.site.unit, "m", "site boundaries suited to meters");
  assert.equal(metric.plan.unit, "m", "plan CAD annotations suited to meters");
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
  assert.equal(getDomainUnit("openings"), "cm");
  assert.equal(getDomainUnit("furniture"), "cm");
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

test("inferDomainFromElementId accurately maps inspector and input elements", () => {
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
  assert.equal(inferDomainFromElementId("i_w"), "furniture");
  assert.equal(inferDomainFromElementId("i_d"), "furniture");
  assert.equal(inferDomainFromElementId("i_h"), "furniture");
  assert.equal(inferDomainFromElementId("mk_x"), "furniture");
  assert.equal(inferDomainFromElementId("mep_run"), "mep");
  assert.equal(inferDomainFromElementId("site_offX"), "site");
  assert.equal(inferDomainFromElementId("inLen"), "plan");
  assert.equal(inferDomainFromElementId("unknown_el"), null);
});

test("domain-aware fmtLen formats numbers using each menu's active unit", () => {
  saveUnitSettings({ preset: "metric_arch", overrides: {} });

  // 350 cm wall length in rooms domain -> 3.5 m
  assert.equal(fmtLen(350, { domain: "rooms" }), "3.5 m");

  // 80 cm door in openings domain -> 80 cm
  assert.equal(fmtLen(80, { domain: "openings" }), "80 cm");

  // 160 cm bed in furniture domain -> 160 cm
  assert.equal(fmtLen(160, { domain: "furniture" }), "160 cm");

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

  // In openings domain (unit is 'cm'):
  assert.equal(parseLen("80", "openings"), 80, "80 without suffix in openings is 80cm");
  assert.equal(parseLen("0.8m", "openings"), 80);
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
  assert.equal(dummyOW.value, "80", "80 cm opening is written as 80 in o_w");

  const dummyIW = { id: "i_w", value: "" };
  writeLen(dummyIW, 160);
  assert.equal(dummyIW.value, "160", "160 cm furniture is written as 160 in i_w");
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
