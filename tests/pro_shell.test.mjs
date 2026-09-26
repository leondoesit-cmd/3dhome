// The shared editor switcher (js/pro_shell.js): Planner · Model · Cabinet in the
// planner ribbon, the model editor header and the cabinet designer header.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerEditor, switchEditor, activeEditor, editorSwitchHTML } from "../js/pro_shell.js";
import { PRO_HE } from "../js/pro_catalog.js";

const src = (f) => readFileSync(new URL("../js/" + f, import.meta.url), "utf8");

// proToast needs just enough of a document to append its status line.
const toasts = [];
globalThis.document = {
  getElementById: () => null,
  createElement: () => {
    const el = { classList: { add() {}, remove() {} }, setAttribute() {} };
    Object.defineProperty(el, "textContent", { set: (v) => toasts.push(v) });
    return el;
  },
  body: { appendChild() {} },
};

/* A fresh set of hooks per test; `open` tracks which overlay is showing. */
function rig(opts) {
  const log = [];
  let showing = opts.showing || "plan";
  const hooks = (id) => ({
    open: () => { log.push("open " + id); showing = id; },
    isOpen: () => showing === id,
    leave: async () => {
      log.push("leave " + id);
      if (opts.refuse === id) return false;
      showing = "plan";
      return true;
    },
    canOpen: () => !(opts.blocked === id),
    why: () => id + " needs a selection",
  });
  registerEditor("model", hooks("model"));
  registerEditor("cab", hooks("cab"));
  return log;
}

test("the active editor is whichever overlay shows, else the planner", () => {
  rig({ showing: "cab" });
  assert.equal(activeEditor(), "cab");
  rig({ showing: "plan" });
  assert.equal(activeEditor(), "plan");
});

test("switching leaves the current editor before opening the next", async () => {
  const log = rig({ showing: "model" });
  assert.equal(await switchEditor("cab"), true);
  assert.deepEqual(log, ["leave model", "open cab"]);
  assert.equal(activeEditor(), "cab");
});

test("a refused leave (unsaved work kept) opens nothing", async () => {
  const log = rig({ showing: "model", refuse: "model" });
  assert.equal(await switchEditor("cab"), false);
  assert.deepEqual(log, ["leave model"]);
  assert.equal(activeEditor(), "model");
});

test("a target that cannot open says why and never closes the current editor", async () => {
  toasts.length = 0;
  const log = rig({ showing: "model", blocked: "cab" });
  assert.equal(await switchEditor("cab"), false);
  assert.deepEqual(log, []);
  assert.deepEqual(toasts, ["cab needs a selection"]);
});

test("the planner is reached by leaving, and pressing the current editor does nothing", async () => {
  let log = rig({ showing: "cab" });
  assert.equal(await switchEditor("plan"), true);
  assert.deepEqual(log, ["leave cab"]);
  log = rig({ showing: "cab" });
  assert.equal(await switchEditor("cab"), true);
  assert.deepEqual(log, []);
});

test("the switcher marks one editor current and every name has Hebrew", () => {
  const html = editorSwitchHTML("model", "md-editors");
  assert.equal((html.match(/data-pro-editor="/g) || []).length, 3);
  assert.match(html, /data-pro-editor="model" class="on" aria-current="page" aria-pressed="true"/);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(html, /class="pr-editors md-editors"/);
  for (const name of ["Planner", "Model editor", "Cabinet designer", "Plan", "Model", "Cabinet"]) assert.ok(PRO_HE[name], name);
});

test("all three editors mount the same switcher and register how they are left", () => {
  assert.match(src("pro_ribbon.js"), /editorSwitchHTML\("plan"\)/);
  const modeler = src("modeler.js");
  assert.match(modeler, /editorSwitchHTML\("model", "md-editors"\)/);
  assert.match(modeler, /registerEditor\("model", \{ leave: requestCloseModeler \}\)/);
  // Close and the switcher share the unsaved-changes question, so it must report the answer.
  assert.match(modeler, /async function requestCloseModeler\(\) \{\s*if \(!await confirmDiscardDocument\("unsavedClose"\)\) return false;/);
  assert.match(src("modeler_launch.js"), /registerEditor\("model", \{/);
  const cabinet = src("ui_cabinet.js");
  assert.match(cabinet, /editorSwitchHTML\("cab", "cb-editors"\)/);
  assert.match(cabinet, /registerEditor\("cab", \{/);
});

test("the workspace prints sheets through the shared helper, not its own copy", () => {
  const ws = src("workspace.js");
  assert.doesNotMatch(ws, /function printSheet\(/);
  assert.match(ws, /printSheetSVG\(toConstructionSVG\(\), t\("sheet_floor_plan"\)\)/);
});
