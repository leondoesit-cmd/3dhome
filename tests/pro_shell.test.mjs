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

test("the phone planner carries the switcher and the panes in a strip under the top bar", () => {
  const shell = src("mobile_shell.js");
  assert.match(shell, /editorSwitchHTML\("plan", "m-editors"\)/);
  // Panes go through setView, which also drops a half-armed drawing tool and resets elevations.
  assert.match(shell, /setView\(b\.dataset\.mPane\)/);
  assert.match(shell, /top\.parentNode\.insertBefore\(strip, top\.nextSibling\)/);
  const css = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
  // Fixed drawers read the block, so it must include the strip; the bar itself keeps one row.
  assert.match(css, /--mobile-topbar-block: calc\(var\(--mobile-topbar-row\) \+ var\(--m-editor-strip\)\)/);
  assert.match(css, /body\.compact-nav #topbar \{[^}]*height: var\(--mobile-topbar-row\)/);
  for (const f of ["en", "he"]) {
    const table = src("i18n/" + f + ".js");
    assert.match(table, /m_strip_aria:/, f);
    assert.match(table, /m_panes_aria:/, f);
  }
});

/* ---- Round-6 shell: project, AI switch, Share, the AI | Cmd bar ---- */
import * as shellMod from "../js/pro_shell.js";
import { proTools } from "../js/pro_catalog.js";

test("every tool a Cmd example names is a real tool of that editor, in both languages", () => {
  const shellSrc = src("pro_shell.js");
  for (const editor of ["plan", "model", "cab"]) {
    const at = shellSrc.indexOf("\n  " + editor + ": {", shellSrc.indexOf("var PLACEHOLDER"));
    const cmdAt = shellSrc.indexOf("cmd: [", at);
    assert.ok(at > 0 && cmdAt > at, editor + " has a Cmd example");
    const line = shellSrc.slice(cmdAt + "cmd: ".length, shellSrc.indexOf("\n", cmdAt)).replace(/,\s*$/, "");
    const [en, heText] = JSON.parse(line);
    const names = (s) => [...s.matchAll(/[“„]([^”]+)”/g)].map((m) => m[1]);
    const labels = new Set(proTools(editor).map((t) => t.label));
    const heLabels = new Set(proTools(editor).map((t) => PRO_HE[t.label] || t.label));
    assert.ok(names(en).length >= 2, editor);
    for (const n of names(en)) assert.ok(labels.has(n), editor + ": no tool “" + n + "”");
    for (const n of names(heText)) assert.ok(heLabels.has(n), editor + ": no Hebrew tool „" + n + "”");
  }
});

test("the AI switch defaults on, is remembered, and off never reaches the AI helper", () => {
  const mem = {};
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  assert.equal(shellMod.aiOn(), true);
  shellMod.setAiOn(false);
  assert.equal(shellMod.aiOn(), false);
  shellMod.setAiOn(true);
  assert.equal(shellMod.aiOn(), true);
  delete globalThis.localStorage;
  // The planner's ask path checks the switch before the helper, after exact tool names.
  assert.match(src("pro_ribbon.js"), /if \(tool\) return runProBinding\(tool\.bind\);\s*\/\/[^\n]*\n\s*if \(!aiOn\(\)\) \{ toast\(M\("aiOff"\)\); return false; \}\s*if \(!askAgent\(text\)\)/);
});

test("only the planner's bar offers AI; the model and cabinet bars say why", () => {
  const shellSrc = src("pro_shell.js");
  assert.match(shellSrc, /function aiModeAvailable\(editor\) \{ return aiOn\(\) && editor === "plan" && !!shell\.ask; \}/);
  const bar = shellMod.commandBarHTML("model");
  assert.match(bar, /data-ps-bar="model"/);
  assert.match(bar, /data-ps-mode="ai"/);
  assert.match(bar, /data-ps-mode="cmd"/);
  assert.match(bar, /role="combobox"/);
});

test("the shell mounts in all three editors and Share opens the Collaborate tab", () => {
  const ribbon = src("pro_ribbon.js");
  assert.match(ribbon, /editorsRow\.insertAdjacentHTML\("beforebegin", projectChipHTML\(\)\)/);
  assert.match(ribbon, /every\.insertAdjacentHTML\("beforebegin", shellActionsHTML\(\)\)/);
  assert.match(ribbon, /commandBarHTML\("plan"\)/);
  assert.match(ribbon, /openWorkspace\("collaborate"\)/);
  const modeler = src("modeler.js");
  for (const piece of [/projectChipHTML\(\) \+\s*editorSwitchHTML\("model"/, /shellActionsHTML\(\) \+\s*'<button id="mdUndo"/, /commandBarHTML\("model"\)/, /aiStatusHTML\(\)/, /wireShell\(root, "model"\)/]) assert.match(modeler, piece);
  const cabinet = src("ui_cabinet.js");
  for (const piece of [/projectChipHTML\(\)/, /shellActionsHTML\(\)/, /commandBarHTML\("cab"\)/, /wireShell\(E\.host, "cab"\)/]) assert.match(cabinet, piece);
  const ws = src("workspace.js");
  assert.match(ws, /export async function openWorkspace\(tab\)/);
  assert.match(ws, /if \(tab && names\[tab\]\) activeTab = tab;/);
});

test("typing in the bar or the project name never fires editor shortcuts", () => {
  const shellSrc = src("pro_shell.js");
  assert.equal((shellSrc.match(/e\.stopPropagation\(\); \/\/ typing/g) || []).length, 2);
});
