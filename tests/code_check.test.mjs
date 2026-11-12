// Building-code profiles and the code check (js/code_profiles.js,
// js/code_check.js, js/code_check_plan.js): legal minimums per jurisdiction,
// kept apart from the generator's design rulebook.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { codeProfile, codeProfileIds, defaultCodeProfileId, formatCodeValue } from "../js/code_profiles.js";
import { checkCode } from "../js/code_check.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const IN = 2.54, FT = 30.48, SQFT = 0.09290304;

const room = (over) => ({ key: "r1", type: "bedroom", area: 12, width: 300, ceiling: 270, glazing: 2, windows: [], exteriorDoor: false, wallThickness: 10, ...over });
const rules = (result) => result.findings.map((f) => f.rule + ":" + f.severity).sort();

test("every profile resolves, carries an edition and only unverified, sourced values", () => {
  for (const id of codeProfileIds()) {
    const p = codeProfile(id);
    assert.ok(p, id);
    assert.ok(p.name.en && p.name.he && p.edition.en && p.edition.he, id + " needs both languages");
    assert.ok(["metric", "metric-mm", "imperial"].includes(p.units), id);
    for (const [key, r] of Object.entries(p.rules))
      if (r.conditional) assert.ok(r.condition && r.condition.en && r.condition.he, `${id}.${key}: a conditional rule says when it applies, in both languages`);
    assert.ok(p.sources.length > 0, id + " must name its sources");
    for (const [key, r] of Object.entries(p.rules)) {
      assert.equal(r.verified, false, `${id}.${key}: nothing here was checked against the official text`);
      assert.ok(r.clause, `${id}.${key} needs a clause`);
    }
  }
  for (const [key, r] of Object.entries(codeProfile("il").rules))
    assert.ok(r.clause.he && r.clause.en, `il.${key}: an Israeli citation reads in Hebrew and English`);
  assert.equal(codeProfile("nowhere"), null);
  assert.equal(defaultCodeProfileId("he"), "il");
  assert.equal(defaultCodeProfileId("en"), "us-irc-2024");
});

test("state profiles inherit the model code and override only their amendments", () => {
  const irc = codeProfile("us-irc-2021"), mi = codeProfile("us-mi"), ca = codeProfile("us-ca");
  assert.equal(mi.rules.habitableMinArea.value, irc.rules.habitableMinArea.value);
  assert.ok(Math.abs(mi.rules.stairMaxRiser.value - 8.25 * IN) < 1e-9);
  assert.ok(Math.abs(mi.rules.stairMinTread.value - 9 * IN) < 1e-9);
  assert.match(mi.rules.stairMaxRiser.clause, /Mich/);
  // California sits on IRC 2024, whose renumbered sections are labelled as 2021 numbers
  assert.match(ca.rules.habitableMinArea.clause, /R304\.1 \(2021 numbering\)/);
  assert.ok(Math.abs(irc.rules.habitableMinArea.value - 70 * SQFT) < 1e-9);
  assert.ok(Math.abs(irc.rules.ceilingHabitable.value - 7 * FT) < 1e-9);
});

test("Israel: habitable rooms below 8 m² or 2.60 m fail; the US model code allows them", () => {
  const plan = { rooms: [room({ area: 7.5, width: 245 }), room({ key: "r2", type: "living", area: 16, width: 380 })] };
  const il = checkCode(plan, "il");
  assert.ok(rules(il).includes("habitableMinArea:error"));
  assert.ok(rules(il).includes("habitableMinWidth:error"));
  const us = checkCode(plan, "us-irc-2021");
  assert.ok(!rules(us).some((r) => r.startsWith("habitableMin")), rules(us).join());
});

test("kitchens are exempt from room-size minimums but not from ceiling height", () => {
  const result = checkCode({ rooms: [room({ type: "kitchen", area: 4, width: 150, ceiling: 240 })] }, "il");
  assert.deepEqual(rules(result).filter((r) => !r.startsWith("safeRoom")), ["ceilingHabitable:error"]);
});

test("Israel: one room must reach 12 m², a studio 14 m², and a missing safe room is flagged", () => {
  const two = checkCode({ rooms: [room({ area: 10 }), room({ key: "r2", area: 11 })] }, "il");
  assert.ok(rules(two).includes("largeRoomMinArea:error"));
  assert.ok(rules(two).includes("safeRoomRequired:warn"));
  const studio = checkCode({ rooms: [room({ type: "living", area: 13 })] }, "il");
  assert.ok(rules(studio).includes("studioMinArea:error"));
  const ok = checkCode({ rooms: [room({ area: 12 }), room({ key: "r2", type: "living", area: 20, width: 400 }),
    room({ key: "r3", type: "safeRoom", area: 9.2, width: 280, ceiling: 260, wallThickness: 25 })] }, "il");
  assert.deepEqual(ok.findings, []);
});

test("Israel: safe room size, height and walls", () => {
  const small = checkCode({ rooms: [room({ type: "safeRoom", area: 4, width: 150, ceiling: 240, wallThickness: 10 })] }, "il");
  assert.deepEqual(rules(small), ["safeRoomAbsoluteMinArea:error", "safeRoomCeiling:error", "safeRoomMinWidth:error", "safeRoomWallThickness:warn"]);
  const approval = checkCode({ rooms: [room({ type: "safeRoom", area: 7, width: 250, ceiling: 260, wallThickness: 30 })] }, "il");
  assert.deepEqual(rules(approval), ["safeRoomArea:warn"]);
});

test("US: a sleeping room needs an emergency escape opening", () => {
  const none = checkCode({ rooms: [room({ windows: [] })] }, "us-irc-2021");
  assert.ok(rules(none).includes("escapeMinArea:error"));
  const highSill = checkCode({ rooms: [room({ windows: [{ id: "w", width: 90, height: 120, sill: 120 }] })] }, "us-irc-2021");
  assert.deepEqual(rules(highSill).filter((r) => r.startsWith("escape")), ["escapeMaxSill:error"]);
  const fine = checkCode({ rooms: [room({ windows: [{ id: "w", width: 90, height: 120, sill: 90 }] })] }, "us-irc-2021");
  assert.deepEqual(rules(fine).filter((r) => r.startsWith("escape")), ["escapeMinArea:info"]);
  const door = checkCode({ rooms: [room({ exteriorDoor: true })] }, "us-irc-2021");
  assert.ok(!rules(door).some((r) => r.startsWith("escape")));
  // Israel has no escape-window rule in the profile
  assert.ok(!rules(checkCode({ rooms: [room()] }, "il")).some((r) => r.startsWith("escape")));
});

test("stairs: an 8-inch riser fails the model IRC and passes Michigan", () => {
  const plan = { rooms: [], stairs: [{ id: "s", riser: 8 * IN, tread: 9.5 * IN }] };
  assert.deepEqual(rules(checkCode(plan, "us-irc-2021")), ["stairMaxRiser:error", "stairMinTread:error"]);
  assert.deepEqual(rules(checkCode(plan, "us-mi")), []);
  // Israeli stair values are disputed between sources: warn, never fail
  assert.deepEqual(rules(checkCode({ rooms: [], stairs: [{ id: "s", riser: 19, tread: 24 }] }, "il")), ["stairMaxRiser:warn", "stairMinTread:warn"]);
});

test("glazing ratio: 8% in the IRC, 10% in Israel", () => {
  const plan = { rooms: [room({ area: 20, glazing: 1.8, windows: [{ id: "w", width: 150, height: 120, sill: 40 }] })] };
  assert.ok(!rules(checkCode(plan, "us-irc-2021")).includes("glazingRatio:error"));
  assert.ok(rules(checkCode(plan, "il")).includes("glazingRatio:warn"));
});

test("values print in the profile's own units", () => {
  assert.equal(formatCodeValue("length", 7 * FT, "imperial"), "7'-0\"");
  assert.equal(formatCodeValue("length", 7.75 * IN, "imperial"), "7.75\"");
  assert.equal(formatCodeValue("area", 70 * SQFT, "imperial"), "70 sq ft");
  assert.equal(formatCodeValue("length", 260, "metric"), "2.60 m");
  assert.equal(formatCodeValue("length", 17.5, "metric"), "17.5 cm");
  assert.equal(formatCodeValue("area", 8, "metric"), "8 m²");
  assert.equal(formatCodeValue("ratio", 0.08, "metric"), "8%");
  assert.equal(formatCodeValue("length", 250, "metric", "he"), "2.50 מ׳");
  assert.equal(formatCodeValue("area", 9, "metric", "he"), "9 מ״ר");
  // UK practice: millimetres below a metre
  assert.equal(formatCodeValue("length", 22, "metric-mm"), "220 mm");
  assert.equal(formatCodeValue("length", 230, "metric-mm"), "2.30 m");
  assert.equal(formatCodeValue("angle", 42.27, "metric-mm"), "42.3°");
});

test("England: room sizes come from the space standard (NDSS), not the Building Regulations", () => {
  const plan = { rooms: [
    room({ key: "single", area: 7, width: 240 }),
    room({ key: "narrow", area: 8, width: 200 }),
    room({ key: "main", type: "masterBedroom", area: 12, width: 260 }),
    room({ key: "second", area: 11.6, width: 250 }),
  ] };
  const ndss = checkCode(plan, "uk-eng-ndss");
  const at = (key) => ndss.findings.filter((f) => f.roomKey === key && f.rule !== "escapeMinArea").map((f) => f.rule + ":" + f.severity);
  assert.deepEqual(at("single"), ["singleBedroomMinArea:error"]);
  assert.deepEqual(at("narrow"), ["singleBedroomMinWidth:error"]);
  assert.deepEqual(at("main"), ["mainBedroomMinWidth:error"]);
  assert.deepEqual(at("second"), ["doubleBedroomMinWidth:error"]);
  assert.ok(!rules(checkCode(plan, "uk-eng")).some((r) => /Bedroom|ceiling|dwelling/.test(r)), "the Building Regulations set no room sizes");
  // a master bedroom is a double by definition
  assert.ok(rules(checkCode({ rooms: [room({ type: "masterBedroom", area: 10, width: 300 })] }, "uk-eng-ndss")).includes("doubleBedroomMinArea:error"));
});

test("England NDSS: dwelling area by bedrooms and bedspaces, flagged for checking", async () => {
  const { dwellingRequirement } = await import("../js/code_check.js");
  const table = codeProfile("uk-eng-ndss").rules.dwellingMinArea.value;
  assert.equal(dwellingRequirement(table, 2, 3).key, "2b3p");
  assert.equal(dwellingRequirement(table, 0, 0).key, "1b1p");
  assert.equal(dwellingRequirement(table, 2, 2).key, "2b3p", "a mix the table lacks takes the next row up");
  assert.equal(dwellingRequirement(table, 4, 9).key, "4b8p");
  assert.equal(dwellingRequirement(table, 7, 8), null);
  const plan = { rooms: [room({ key: "a", type: "masterBedroom", area: 12, width: 300 }), room({ key: "b", area: 8, width: 240 }),
    room({ key: "c", type: "living", area: 25, width: 400 }), room({ key: "d", type: "balcony", area: 10 })] };
  const f = checkCode(plan, "uk-eng-ndss").findings.find((x) => x.rule === "dwellingMinArea");
  assert.equal(f.severity, "warn");
  assert.equal(f.detail, "2b3p");
  assert.equal(f.required, 61);
  assert.ok(Math.abs(f.actual - 45) < 1e-9, "balconies are not internal area");
});

test("England: London's 2.5 m ceiling over the national 2.3 m; stairs by pitch and 2R + G", () => {
  const low = { rooms: [room({ type: "living", area: 30, width: 400, ceiling: 240 })] };
  assert.ok(!rules(checkCode(low, "uk-eng-ndss")).includes("ceilingHabitable:error"));
  assert.ok(rules(checkCode(low, "uk-london")).includes("ceilingHabitable:error"));
  // 200 rise on 220 going is 42.3° — inside both 220 mm limits, too steep
  assert.deepEqual(rules(checkCode({ rooms: [], stairs: [{ id: "s", riser: 20, tread: 22 }] }, "uk-eng")), ["stairMaxPitch:error"]);
  assert.deepEqual(rules(checkCode({ rooms: [], stairs: [{ id: "s", riser: 15, tread: 22 }] }, "uk-eng")), ["stairStrideMin:error"]);
  assert.deepEqual(rules(checkCode({ rooms: [], stairs: [{ id: "s", riser: 18, tread: 25 }] }, "uk-eng")), []);
});

test("England and Germany: escape windows serve every habitable room and depend on the storey", () => {
  const living = { rooms: [room({ type: "living", area: 20, width: 400, windows: [] })] };
  for (const id of ["uk-eng", "de-mbo"]) {
    const f = checkCode(living, id).findings.find((x) => x.rule === "escapeMinArea");
    assert.equal(f.severity, "warn", id + ": conditional, so flagged not failed");
    assert.ok(f.conditional && f.condition.en && f.condition.he, id);
  }
  const small = { rooms: [room({ windows: [{ id: "w", width: 70, height: 110, sill: 90 }] })] };
  assert.deepEqual(rules(checkCode(small, "de-mbo")).filter((r) => r.startsWith("escape")), ["escapeMinArea:warn", "escapeMinHeight:warn", "escapeMinWidth:warn"]);
  assert.deepEqual(rules(checkCode(small, "de-by")).filter((r) => r.startsWith("escape")), ["escapeMinArea:info"]);
  assert.deepEqual(rules(checkCode(small, "uk-eng")).filter((r) => r.startsWith("escape")), ["escapeMinArea:info"]);
});

test("Germany: the states set their own heights and daylight fractions", () => {
  const plan = { rooms: [room({ type: "living", area: 20, width: 400, ceiling: 235, glazing: 2.2 })] };
  const at = (id) => rules(checkCode(plan, id)).filter((r) => !r.startsWith("escape"));
  assert.deepEqual(at("de-mbo"), ["ceilingHabitable:warn", "glazingRatio:error"], "MBO exempts building classes 1 and 2 from 2.40 m");
  assert.deepEqual(at("de-by"), ["ceilingHabitable:warn", "glazingRatio:error"]);
  assert.deepEqual(at("de-be"), ["ceilingHabitable:error", "glazingRatio:error"]);
  assert.deepEqual(at("de-bw"), [], "2.30 m and 1/10 in Baden-Württemberg");
  // no minimum room area anywhere in Germany
  assert.ok(!rules(checkCode({ rooms: [room({ area: 5, width: 180 })] }, "de-mbo")).some((r) => r.startsWith("habitableMin")));
  // inherited MBO/DIN clauses are marked in a state profile
  assert.match(codeProfile("de-by").rules.stairMaxRiser.clause, /DIN 18065.*MBO\/DIN text/);
  assert.equal(codeProfile("de-mbo").rules.stairMaxRiser.clause, "DIN 18065 Table 1 — residential, ≤ 2 dwellings");
});

test("every rule has a label in both languages, and the new room types are translated", async () => {
  const strings = readFileSync(join(root, "js/code_check_strings.js"), "utf8");
  const keys = new Set(codeProfileIds().flatMap((id) => Object.keys(codeProfile(id).rules)));
  for (const key of keys) assert.match(strings, new RegExp(`\\n  ${key}: \\["[^"]+", "[^"]+"\\]`), key);
  for (const lang of ["en", "he"]) {
    const table = readFileSync(join(root, `js/i18n/${lang}.js`), "utf8");
    for (const key of ["rp_safeRoom", "rp_halfRoom", "rp_serviceBalcony"]) assert.match(table, new RegExp(`\\b${key}: "`), lang + ":" + key);
  }
});

const three = pathToFileURL(join(root, "vendor/three/three.module.js")).href;
const addons = pathToFileURL(join(root, "vendor/three/addons/")).href;
const loader = `data:text/javascript,export async function resolve(s,c,n){if(s==="three")return{url:${JSON.stringify(three)},format:"module",shortCircuit:true};if(s.startsWith("three/addons/"))return{url:${JSON.stringify(addons)}+s.slice(13),format:"module",shortCircuit:true};return n(s,c)}`;

test("a generated apartment reads into the check with typed, measured rooms", () => {
  const script = String.raw`
    import assert from "node:assert/strict";
    import { S } from "./js/state.js";
    import { apartmentGenerateCommand } from "./js/generator.js";
    import { executeCommand } from "./js/commands/executor.js";
    import { planForCodeCheck } from "./js/code_check_plan.js";
    import { checkCode } from "./js/code_check.js";
    const result = executeCommand(apartmentGenerateCommand, { size: "large", replace: true, replaceInfrastructure: true, infrastructure: false, seed: 1 },
      { domain: "planner", state: S }, { history: false });
    assert.ok(result.ok, result.reason);
    const plan = planForCodeCheck(S);
    assert.ok(plan.rooms.length >= 4);
    for (const r of plan.rooms) {
      assert.ok(Number.isFinite(r.area) && r.area > 0, r.key + " area");
      assert.ok(r.width > 0 && r.ceiling > 0, r.key + " size");
    }
    assert.ok(plan.rooms.some(r => r.type === "bedroom" || r.type === "masterBedroom"), "typed bedrooms");
    assert.ok(plan.rooms.some(r => r.windows.length), "windows attributed to rooms");
    for (const id of ["il", "us-irc-2021", "us-mi"]) {
      const out = checkCode(plan, id);
      assert.ok(out.profile && Array.isArray(out.findings), id);
    }
    // the generator builds no safe room, so the Israeli profile asks for one
    assert.ok(checkCode(plan, "il").findings.some(f => f.rule === "safeRoomRequired"));
  `;
  const run = spawnSync(process.execPath, ["--experimental-loader", loader, "--input-type=module", "-e", script], {
    cwd: root, encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
});
