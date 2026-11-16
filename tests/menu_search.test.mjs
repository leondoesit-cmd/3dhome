// js/pro_catalog.js matchTools: the one ranking behind the Every command panel
// (Ctrl+K), the phone/fold tool search and the More sheet's "Find a tool".
import test from "node:test";
import assert from "node:assert/strict";
import { matchTools, proTools, PRO_CATALOG, groupOnRibbon, ribbonTabForPreset, ribbonTabForWorkSet } from "../js/pro_catalog.js";

const names = (q, eds) => matchTools(q, eds).map((t) => t.editor + ":" + t.label);

test("an exact name comes first", () => {
  assert.equal(names("wall")[0], "plan:Wall");
  assert.equal(names("Door")[0], "plan:Door");
});

test("names that start with the query outrank names that only contain it", () => {
  const hits = names("wall");
  const startsAt = hits.indexOf("plan:Wall types");
  const containsAt = hits.indexOf("plan:Arc wall");
  assert.ok(startsAt > 0 && containsAt > 0, "both found");
  assert.ok(startsAt < containsAt, "Wall types (starts) before Arc wall (word inside)");
});

test("a word inside a name is found: dim → Smart dimension, in the model editor", () => {
  assert.ok(names("dim").includes("model:Smart dimension"));
  assert.ok(names("smart dim").includes("model:Smart dimension"), "several words, all in the name");
});

test("aliases and Hebrew names match", () => {
  assert.ok(names("centre rect").includes("model:Center rectangle"), "British alias");
  assert.equal(names("קיר")[0], "plan:Wall", "Hebrew label");
});

test("words may name the editor or the tab: door plan → the planner's Door", () => {
  assert.equal(names("door plan")[0], "plan:Door");
});

test("the editor filter is respected and empty queries find nothing", () => {
  assert.ok(matchTools("dim", ["plan"]).every((t) => t.editor === "plan"));
  assert.deepEqual(matchTools("   "), []);
  assert.deepEqual(matchTools(null), []);
});

test("only tools that can run are offered, each once", () => {
  for (const q of ["a", "e", "wall", "sketch"]) {
    const hits = matchTools(q);
    assert.ok(hits.every((t) => t.bind), q + ": every hit has a binding");
    const keys = hits.map((t) => t.editor + "|" + t.tab + "|" + t.group + "|" + t.label);
    assert.equal(new Set(keys).size, keys.length, q + ": no duplicates");
  }
});

test("every bound tool can be found by its own name", () => {
  const missed = proTools().filter((t) => t.bind).filter((t) => !matchTools(t.label).some((h) => h.label === t.label && h.editor === t.editor));
  assert.deepEqual(missed.map((t) => t.editor + ":" + t.label), []);
});

/* Two different actions under one Hebrew name cannot be told apart in a
   menu or a search (Erase and Delete were both "מחק"). The same action under
   two English names may share one (Cutaway / Dollhouse). */
test("within an editor, different actions never share a Hebrew name", async () => {
  const { proLabel } = await import("../js/pro_catalog.js");
  const clashes = [];
  for (const ed of ["plan", "model", "cab"]) {
    const byName = new Map();
    for (const t of proTools(ed)) {
      if (!t.bind) continue;
      const he = proLabel(t.label, "he");
      const prev = byName.get(he);
      if (prev && prev.bind !== t.bind && prev.label !== t.label) clashes.push(ed + ": " + he + " = " + prev.label + " / " + t.label);
      else if (!prev) byName.set(he, t);
    }
  }
  assert.deepEqual(clashes, []);
});

test("the cabinet's partition delete has one name, and the old one still finds it", () => {
  const cab = proTools("cab").filter((t) => t.bind === "cab:tool:erase");
  assert.deepEqual(cab.map((t) => t.label), ["Remove partition"]);
  assert.equal(names("erase partition", ["cab"])[0], "cab:Remove partition");
  assert.equal(names("remove partition", ["cab"])[0], "cab:Remove partition");
});

test("the cabinet's View › Mode stays searchable but is not drawn on the ribbon", async () => {
  const view = PRO_CATALOG.cab.tabs.find((t) => t[0] === "View");
  const mode = view[1].find((g) => g[0] === "Mode");
  assert.equal(groupOnRibbon(mode), false);
  assert.ok(view[1].filter(groupOnRibbon).length > 0, "the tab keeps its other groups");
  for (const q of ["2D", "3D", "Split"]) assert.ok(names(q, ["cab"]).includes("cab:" + q), q);
  // every other group is on the ribbon as before
  const hidden = PRO_EDITORS_ALL().filter((g) => !groupOnRibbon(g)).map((g) => g[0]);
  assert.deepEqual(hidden, ["Mode"]);
  // the desktop ribbon draws only the groups that are on it
  const { readFileSync } = await import("node:fs");
  const ribbon = readFileSync(new URL("../js/pro_ribbon.js", import.meta.url), "utf8");
  assert.match(ribbon, /tabs\[i\]\[1\]\.filter\(groupOnRibbon\)\.forEach\(function \(group\)/);
});

test("the model ribbon's sheet tab and the Drawing view do not share an English name", () => {
  const tabs = PRO_CATALOG.model.tabs.map((t) => t[0]);
  assert.ok(!tabs.includes("Drawing"));
  assert.ok(tabs.includes("Detailing"));
});

function PRO_EDITORS_ALL() {
  return Object.values(PRO_CATALOG).flatMap((ed) => ed.tabs.flatMap((t) => t[1]));
}

test("a layer preset selects its planner tab, only from Build / Interior / MEP", async () => {
  assert.equal(ribbonTabForPreset("build", "Interior"), "Build");
  assert.equal(ribbonTabForPreset("furnish", "Build"), "Interior");
  assert.equal(ribbonTabForPreset("services", "Interior"), "MEP");
  assert.equal(ribbonTabForPreset("services", "MEP"), null, "already there");
  for (const tab of ["Annotate", "Output", "Analyze", "Constrain", "View & render", undefined])
    assert.equal(ribbonTabForPreset("build", tab), null, "never pulled out of " + tab);
  assert.equal(ribbonTabForPreset("present", "Build"), null, "Present selects nothing");
  assert.equal(ribbonTabForPreset("toString", "Build"), null);
  const planTabs = PRO_CATALOG.plan.tabs.map((t) => t[0]);
  for (const t of ["Build", "Interior", "MEP"]) assert.ok(planTabs.includes(t), t);
  // wired by an event, so ui_layers.js does not import the ribbon
  const { readFileSync } = await import("node:fs");
  const read = (f) => readFileSync(new URL("../js/" + f, import.meta.url), "utf8");
  assert.match(read("ui_layers.js"), /window\.dispatchEvent\(new CustomEvent\("layers:preset", \{ detail: \{ id: id \} \}\)\);/);
  assert.doesNotMatch(read("ui_layers.js"), /from "\.\/pro_ribbon\.js"/);
  assert.match(read("pro_ribbon.js"), /window\.addEventListener\("layers:preset", function \(e\) \{[\s\S]*?ribbonTabForPreset\(e\.detail && e\.detail\.id, cur && cur\[0\]\)/);
});

test("the work set that follows the tool selects its planner tab, only among the work tabs", async () => {
  assert.equal(ribbonTabForWorkSet("furniture", "Build"), "Interior", "Furniture work set leaves Build for Interior");
  assert.equal(ribbonTabForWorkSet("structure", "Interior"), "Build");
  assert.equal(ribbonTabForWorkSet("mep", "Build"), "MEP");
  assert.equal(ribbonTabForWorkSet("annotations", "Interior"), "Annotate");
  assert.equal(ribbonTabForWorkSet("structure", "Annotate"), "Build");
  assert.equal(ribbonTabForWorkSet("furniture", "Interior"), null, "already there");
  for (const tab of ["Output", "Analyze", "Constrain", "View & render", "Site & scan", undefined])
    assert.equal(ribbonTabForWorkSet("structure", tab), null, "never pulled out of " + tab);
  assert.equal(ribbonTabForWorkSet("all", "Build"), null, "All layers selects nothing");
  assert.equal(ribbonTabForWorkSet("toString", "Build"), null);
  const planTabs = PRO_CATALOG.plan.tabs.map((t) => t[0]);
  for (const t of ["Build", "Interior", "MEP", "Annotate"]) assert.ok(planTabs.includes(t), t);
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../js/pro_ribbon.js", import.meta.url), "utf8");
  assert.match(src, /window\.addEventListener\("layers:changed", followWorkSet\)/);
  assert.match(src, /S\.workSet === seenWorkSet\) return;[\s\S]*?ribbonTabForWorkSet\(S\.workSet, cur && cur\[0\]\)/);
});
