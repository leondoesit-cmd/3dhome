// Every tool in the pro ribbon must bind to something that already exists:
// a planner action or tool in index.html, a panel id, a model-editor command
// from the real catalog, a cabinet-designer control, and a real Phosphor icon.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRO_CATALOG, PRO_EDITORS, proTools, parseBinding } from "../js/pro_catalog.js";
import { buildCommandCatalog } from "../js/modeler_commands.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const cabinetSrc = ["ui_cabinet.js", "ui_cabinet_view.js", "ui_cabinet_inspect.js"].map((f) => readFileSync(new URL("../js/" + f, import.meta.url), "utf8")).join("\n");
const mepUi = readFileSync(new URL("../js/ui_mep.js", import.meta.url), "utf8");
const mepCore = readFileSync(new URL("../js/mep.js", import.meta.url), "utf8");
const modelerSrc = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
const ribbonIds = new Set([...modelerSrc.matchAll(/commandButton\("([a-z0-9]+)"/g)].map((m) => m[1]));
const relationIds = (modelerSrc.match(/var RIBBON_RELATIONS = \[([^\]]*)\]/) || ["", ""])[1].match(/[a-z]+/g) || [];
const nestSrc = readFileSync(new URL("../js/ui_nest.js", import.meta.url), "utf8") + readFileSync(new URL("../js/ui_cabinet_production.js", import.meta.url), "utf8");
const uiSrc = readFileSync(new URL("../js/ui.js", import.meta.url), "utf8");
const gapsDoc = readFileSync(new URL("../docs/PRO_TOOL_GAPS.md", import.meta.url), "utf8");
const jsIds = (id) => html.includes('id="' + id + '"') || [..."ui_survey.js ui_mep.js planner_3d.js".split(" ")].some((f) => { const src = readFileSync(new URL("../js/" + f, import.meta.url), "utf8"); return src.includes("id='" + id + "'") || src.includes('id="' + id + '"') || src.includes(".id = '" + id + "'") || src.includes('.id = "' + id + '"'); });
const constraintIds = [...(modelerSrc.match(/CONSTRAINT_DEFS = \[([\s\S]*?)\];/) || ["", ""])[1].matchAll(/id: "([a-z]+)"/g)].map((m) => m[1]);
const proActionsSrc = readFileSync(new URL("../js/pro_actions.js", import.meta.url), "utf8");
const furnMetaSrc = readFileSync(new URL("../js/furniture_meta.js", import.meta.url), "utf8");
const phosphor = readFileSync(new URL("../vendor/phosphor/style.css", import.meta.url), "utf8");
const modelIds = new Set(buildCommandCatalog({ t: (k) => k, editor: {}, closedSketchProfile: () => null, activeParts: () => [] }).map((c) => c.id));

test("every editor has tabs, groups and tools", () => {
  for (const ed of PRO_EDITORS) {
    assert.ok(PRO_CATALOG[ed].tabs.length > 0, ed);
    for (const [tab, groups] of PRO_CATALOG[ed].tabs) {
      assert.ok(groups.length > 0, ed + " " + tab);
      for (const [group, tools] of groups) assert.ok(tools.length > 0, ed + " " + tab + " " + group);
    }
  }
});

test("every binding resolves to a real control, action or command", () => {
  const missing = [];
  for (const tool of proTools()) {
    const b = parseBinding(tool.bind);
    if (!b) continue;
    let ok = false;
    if (b.kind === "tool") ok = html.includes('data-tool="' + b.value + '"');
    else if (b.kind === "act") ok = html.includes('data-act="' + b.value + '"');
    else if (b.kind === "click" || b.kind === "reveal") ok = /^#[\w-]+$/.test(b.value) && jsIds(b.value.slice(1));
    else if (b.kind === "pro") ok = new RegExp("^  " + b.value + "(?:\\s*[:,])", "m").test(proActionsSrc);
    else if (b.kind === "lib") ok = furnMetaSrc.includes('id: "' + b.value + '"');
    else if (b.kind === "meng") ok = modelerSrc.includes('engineeringButton("' + b.value + '"');
    else if (b.kind === "run") ok = uiSrc.includes('act === "' + b.value + '"');
    else if (b.kind === "mclick") ok = /^#[\w-]+$/.test(b.value) && modelerSrc.includes('id="' + b.value.slice(1) + '"');
    else if (b.kind === "mcon") ok = constraintIds.includes(b.value);
    else if (b.kind === "planned") ok = /^[a-z0-9-]+$/.test(b.value);
    else if (b.kind === "left") ok = html.includes('data-left-tab="' + b.value + '"');
    else if (b.kind === "mcmd") ok = modelIds.has(b.value) || ribbonIds.has(b.value);
    else if (b.kind === "nest" || b.kind === "nestgo") ok = /^#[\w-]+$/.test(b.value) && (nestSrc.includes('id="' + b.value.slice(1) + '"') || nestSrc.includes("'" + b.value.slice(1) + "'") || nestSrc.includes("'" + b.value.slice(1) + "')"));
    else if (b.kind === "mrel") ok = relationIds.includes(b.value);
    else if (b.kind === "mep") {
      const [k, v] = b.value.split(":");
      ok = mepUi.includes('"data-mep", "' + (v ? k + ":" : k)) && (!v || mepCore.includes('"' + v + '"'));
    }
    else if (b.kind === "cab") ok = cabinetSrc.includes('ico("' + b.attr + '", "' + b.value + '"') || cabinetSrc.includes("data-" + b.attr + '="' + b.value + '"');
    if (!ok) missing.push(tool.editor + " · " + tool.label + " → " + tool.bind);
  }
  assert.deepEqual(missing, []);
});

test("every icon is a Phosphor icon the app ships", () => {
  const missing = proTools().filter((t) => !phosphor.includes("." + t.icon + ":before") && !phosphor.includes("." + t.icon + "::before")).map((t) => t.icon);
  assert.deepEqual([...new Set(missing)], []);
});

test("labels are unique inside each group", () => {
  for (const ed of PRO_EDITORS) for (const [, groups] of PRO_CATALOG[ed].tabs) for (const [g, tools] of groups) {
    const labels = tools.map((t) => t.label);
    assert.equal(new Set(labels).size, labels.length, ed + " " + g);
  }
});

test("every model-editor ribbon command and relation is in the catalog", () => {
  const bound = new Set(proTools("model").map((t) => t.bind));
  const missing = [...ribbonIds].filter((id) => !bound.has("mcmd:" + id)).concat(relationIds.filter((id) => !bound.has("mrel:" + id)));
  assert.deepEqual(missing, []);
});

test("every editor, tab, group and tool name has Hebrew", async () => {
  const { PRO_HE } = await import("../js/pro_catalog.js");
  const all = new Set();
  for (const ed of PRO_EDITORS) {
    all.add(PRO_CATALOG[ed].name);
    for (const [tab, groups] of PRO_CATALOG[ed].tabs) { all.add(tab); for (const [g, tools] of groups) { all.add(g); tools.forEach((t) => all.add(t.label)); } }
  }
  assert.deepEqual([...all].filter((s) => !PRO_HE[s]), []);
});

test("all pro tool gaps are implemented", () => {
  const planned = proTools().filter((t) => t.bind && t.bind.startsWith("planned:")).map((t) => t.bind.slice(8));
  assert.deepEqual(planned, []);
  assert.match(gapsDoc, /no `planned:` entries/);
});
