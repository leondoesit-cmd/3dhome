import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { FEATURE_CATALOG } from "../js/core/feature_catalog.js";
import { featureField, readFeatureParameterForm } from "../js/modeler_feature_form.js";

const modeler = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");

function el(tag, className, html) {
  return {
    tag, className, innerHTML: html, children: [], dataset: {}, value: "", selected: false,
    appendChild(child) { this.children.push(child); return child; },
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, setCustomValidity() {},
    classList: { add() {}, remove() {} }, closest() { return null; },
  };
}

// G31: LENSCAP's one-sketch sweep bound itself to ThreadPath with no row saying so.
test("the Sweep form has a Path row, before the orientation it qualifies", () => {
  const group = FEATURE_CATALOG.sweep.editor.groups.find((g) => g.id === "path");
  assert.equal(group.fields[0].key, "helixId");
  assert.equal(group.fields[0].type, "helix-reference");
  assert.equal(group.fields[1].key, "orientation");
});

test("the Path row lists the helices by name and the second-sketch path, and reads back the choice", () => {
  const field = FEATURE_CATALOG.sweep.editor.groups.find((g) => g.id === "path").fields[0];
  const host = el("div");
  const options = [{ value: "", label: "Second selected sketch" }, { value: "helix_1", label: "ThreadPath" }];
  const input = featureField(host, field, "helix_1", { el, referenceOptions: (type) => (type === "helix-reference" ? options : []) });
  assert.equal(input.tag, "select");
  assert.deepEqual(input.children.map((o) => [o.value, o.innerHTML, o.selected]), [["", "Second selected sketch", false], ["helix_1", "ThreadPath", true]]);
  input.value = "";
  const read = readFeatureParameterForm([{ field, input }], { helixId: "helix_1" });
  assert.equal(read.params.helixId, "", "an explicit sketch path is kept, not replaced by the only helix");
});

test("the modeler lists document helices, opens the form on the bound one, and honours a sketch path", () => {
  assert.match(modeler, /if\(type==="helix-reference"\)\{[\s\S]*?return \[\{value:"",label:pathSketch\?\.name \|\| t\("sweepPathSketch"\)\}\]\.concat\(documentHelixRecords\(\)/);
  assert.match(modeler, /state\.params\.helixId=sweepHelix \? sweepHelix\.id : "";/);
  assert.match(modeler, /var sketchPath=type==="sweep" && inputParams\.helixId==="";/);
  assert.match(modeler, /if\(type==="sweep" && !sketchPath && ids\.length===1 && !helix\)\{/, "no silent fallback to the only helix once a sketch path was chosen");
});

test("editing a sweep's Path moves its sources, references and merge to the chosen helix", () => {
  const body = modeler.slice(modeler.indexOf("function retargetSweepHelix("), modeler.indexOf("function sweepHelixRecord("));
  assert.match(body, /params\.sketchSources=moved\(sources\)/);
  assert.match(body, /feature\.references\.references=/);
  assert.match(body, /entry\.sketchSources=moved\(entry\.sketchSources\)/);
  assert.equal((modeler.match(/retargetSweepHelix\(feature\)/g) || []).length, 3, "declared, and called from the live edit and from Update");
});
