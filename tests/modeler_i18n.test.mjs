/* The modeler is bilingual, but the parametric feature form is built from
   js/core/feature_catalog.js — a shared module that cannot import the editor's
   t() without making the module graph circular.  The catalogue therefore
   carries a stable `labelKey` beside every English string, and js/modeler.js
   resolves it against its own TXT table at render time.
   A key with no TXT entry silently falls back to English: the Hebrew user sees
   an English field label and nothing anywhere reports it.  These tests make
   that a red suite instead. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FEATURE_CATALOG, featureEditorGroups, featureLabel, setFeatureLabelResolver } from "../js/core/feature_catalog.js";

const modelerSource = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
/* The TXT table itself lives in js/modeler_strings.js; modeler.js keeps the
   setFeatureLabelResolver wiring that reads it. */
const stringsSource = await readFile(new URL("../js/modeler_strings.js", import.meta.url), "utf8");

/* js/modeler_strings.js cannot be imported under Node (it reaches i18n.js, and
   the editor family uses bare `three` specifiers), so read TXT out of the
   source the same way the other modeler tests do. */
function modelerTable() {
  const start = stringsSource.indexOf("export var TXT = {");
  assert.ok(start >= 0, "TXT table not found in js/modeler_strings.js");
  const end = stringsSource.indexOf("\n};", start);
  assert.ok(end > start, "TXT table has no terminator");
  const body = stringsSource.slice(start, end);
  const entries = new Map();
  const row = /^\s{2}([A-Za-z_$][\w$]*):\s*\[\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\]\s*,\s*$/gm;
  let match;
  while ((match = row.exec(body))) entries.set(match[1], { he: match[2], en: match[3] });
  return entries;
}

function catalogLabelKeys() {
  const keys = new Map(); // key -> English string it stands for
  const note = (entry, where) => {
    if (!entry || !entry.labelKey) return;
    keys.set(entry.labelKey, { english: entry.label, where });
  };
  Object.entries(FEATURE_CATALOG).forEach(([type, spec]) => {
    note(spec, type);
    (spec.editor?.groups || []).forEach((group) => {
      note(group, `${type}/${group.id}`);
      (group.fields || []).forEach((field) => {
        note(field, `${type}/${group.id}/${field.key}`);
        (field.choices || []).forEach((choice) => note(choice, `${type}/${group.id}/${field.key}/${choice.value}`));
      });
    });
  });
  return keys;
}

test("every feature_catalog labelKey resolves to a real modeler TXT entry", () => {
  const table = modelerTable();
  const missing = [];
  catalogLabelKeys().forEach((info, key) => {
    if (!table.has(key)) missing.push(`${key} (${info.english}) at ${info.where}`);
  });
  assert.deepEqual(missing, [], "feature catalogue keys with no bilingual entry:\n" + missing.join("\n"));
});

test("the Hebrew side of every feature label is actually Hebrew", () => {
  const table = modelerTable();
  const untranslated = [];
  catalogLabelKeys().forEach((info, key) => {
    const entry = table.get(key);
    if (!entry) return;
    // Designations (Sweep, Loft, G0/C1, DIN codes) legitimately stay Latin, so
    // only flag an entry whose Hebrew column is character-for-character the
    // English one AND is a plain multi-word English phrase.
    if (entry.he === entry.en && /^[A-Za-z][A-Za-z' /]*[A-Za-z]$/.test(entry.en) && entry.en.includes(" ")) {
      untranslated.push(`${key}: ${entry.en}`);
    }
  });
  assert.deepEqual(untranslated, [], "feature labels left in English on the Hebrew side:\n" + untranslated.join("\n"));
});

test("the English column of every feature label matches the catalogue string", () => {
  const table = modelerTable();
  const drifted = [];
  catalogLabelKeys().forEach((info, key) => {
    const entry = table.get(key);
    if (entry && entry.en !== info.english) drifted.push(`${key}: catalogue "${info.english}" vs table "${entry.en}"`);
  });
  assert.deepEqual(drifted, [], "the English fallback and the table have drifted apart:\n" + drifted.join("\n"));
});

/* The resolver is the whole mechanism: with none registered the catalogue must
   read exactly as it did before this became bilingual, and a key the table has
   never heard of must fall back to English rather than leak an identifier. */
test("featureEditorGroups stays English until a resolver is registered", () => {
  setFeatureLabelResolver(null);
  const groups = featureEditorGroups("extrude");
  assert.equal(groups[0].label, "Extent");
  assert.equal(groups[0].fields[0].label, "End condition");
  assert.equal(groups[0].fields[0].choices[0].label, "Blind");
  assert.equal(featureLabel(FEATURE_CATALOG.extrude), "Extrude / Boss");
});

test("a registered resolver localizes group, field and choice labels", () => {
  const table = new Map([
    ["fcGrpExtent", "מידת האקסטרוד"],
    ["fcFldEndCondition", "תנאי סיום"],
    ["fcOptBlind", "עומק קבוע"],
  ]);
  setFeatureLabelResolver((key, fallback) => (table.has(key) ? table.get(key) : fallback));
  try {
    const groups = featureEditorGroups("extrude");
    assert.equal(groups[0].label, "מידת האקסטרוד");
    assert.equal(groups[0].fields[0].label, "תנאי סיום");
    assert.equal(groups[0].fields[0].choices[0].label, "עומק קבוע");
    // Untranslated key: English, never the raw key.
    assert.equal(groups[0].fields[1].label, "Depth");
    assert.equal(featureLabel(FEATURE_CATALOG.extrude), "Extrude / Boss");
  } finally {
    setFeatureLabelResolver(null);
  }
});

test("localizing one render does not mutate the shared catalogue", () => {
  setFeatureLabelResolver(() => "translated");
  try { featureEditorGroups("extrude"); } finally { setFeatureLabelResolver(null); }
  assert.equal(FEATURE_CATALOG.extrude.editor.groups[0].label, "Extent");
  assert.equal(FEATURE_CATALOG.extrude.editor.groups[0].fields[0].choices[0].label, "Blind");
});

/* The two reasons this pass replaced: sweep/loft used to answer a sentence
   fragment about history selection, and Boolean answered an instruction about
   the history tree rather than about bodies. */
test("the new Features gate reasons exist in both languages", () => {
  const table = modelerTable();
  ["cmdNeedTwoSketches", "cmdNeedTwoBodies"].forEach((key) => {
    const entry = table.get(key);
    assert.ok(entry, key + " is missing from the modeler table");
    assert.match(entry.he, /[֐-׿]/, key + " has no Hebrew");
    assert.notEqual(entry.he, entry.en);
  });
});

/* Report and flash sentences that carry a number, a file name or an error are
   one key with a placeholder — never translated fragments glued together, which
   reorders Hebrew into nonsense. */
test("interpolated report sentences keep their placeholder in both languages", () => {
  const table = modelerTable();
  [
    ["auditPassedBody", "n"],
    ["auditBlocked", "x"],
    ["interferenceFound", "n"],
  ].forEach(([key, placeholder]) => {
    const entry = table.get(key);
    assert.ok(entry, key + " is missing from the modeler table");
    assert.ok(entry.he.includes("{" + placeholder + "}"), key + " lost its placeholder in Hebrew");
    assert.ok(entry.en.includes("{" + placeholder + "}"), key + " lost its placeholder in English");
  });
  assert.match(stringsSource, /export function tf\(k, values\)/);
});

test("the Evaluate, Assembly and Save reports no longer hardcode English", () => {
  // The editor's code only. The TXT table (js/modeler_strings.js) legitimately
  // holds the English column of every one of these strings, so it is not read
  // here — since the split, modeler.js is code all the way down.
  const code = modelerSource;
  [
    /report\("DIN \/ ISO"/,
    /report\("EVALUATE"/,
    /report\("SAVE"/,
    /"Browser storage is full or unavailable\."/,
    /"No interference detected"/,
    /flash\("BREP: "/,
    /flash\("Convert the selected plate to sheet metal first"\)/,
  ].forEach((pattern) => assert.doesNotMatch(code, pattern, "still hardcoded: " + pattern));
});
