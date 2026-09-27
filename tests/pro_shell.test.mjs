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

test("each bar offers AI only where that editor has a helper, and says why otherwise", () => {
  const shellSrc = src("pro_shell.js");
  assert.match(shellSrc, /if \(!aiOn\(\)\) return false;\s*return editor === "plan" \? !!shell\.ask : !!\(shell\.canAskEditor && shell\.canAskEditor\(editor\)\);/);
  assert.match(shellSrc, /aiPlanOnly: \["The AI helper is not available here/);
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
  for (const piece of [/projectChipHTML\(\) \+\s*editorSwitchHTML\("model"/, /shellActionsHTML\(\) \+\s*'<button id="mdUndo"/, /commandBarHTML\("model"\)/, /st\.insertAdjacentHTML\("beforeend", aiStatusHTML\(\)\)/, /wireShell\(root, "model"\)/]) assert.match(modeler, piece);
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

/* ---- fold rail: tabs beside the plan, the tab's tools above the inspector ---- */
test("the fold rail lists every planner tab and docks its tools above the inspector", async () => {
  const shell = src("mobile_shell.js");
  // A column of #workspace before the canvas, so the plan narrows instead of being covered.
  assert.match(shell, /ws\.insertBefore\(foldRail, canvas\)/);
  // The panel heads the docked inspector column and is opened through the props dock.
  assert.match(shell, /host\.insertBefore\(foldPanel, host\.firstChild\)/);
  assert.match(shell, /if \(openSheet !== "props"\) showSheet\("props"\);/);
  // Closing the dock retires the panel; the state class is not the panel's class.
  assert.match(shell, /if \(closingKey === "props" && foldTab != null\)/);
  assert.doesNotMatch(shell, /body\.classList\.(add|remove)\("m-fold-tools"\)/);
  const css = readFileSync(new URL("../css/pro_ribbon.css", import.meta.url), "utf8");
  assert.match(css, /body\.compact-nav\.dock-rail \.m-fold-rail \{/);
  assert.match(css, /body\.dock-rail\.m-fold-open #m-fold-tools \{/);
  // The grid is the pro catalog's own tab, so the rail can never disagree with the ribbon.
  const ribbon = src("pro_ribbon.js");
  assert.match(ribbon, /window\.__proToolTabs = \{ tabs: proToolTabs, render: renderToolTab, sync: syncActive \};/);
  const { PRO_CATALOG } = await import("../js/pro_catalog.js");
  const icons = (ribbon.match(/var TAB_ICON = \{([\s\S]*?)\};/) || ["", ""])[1];
  for (const [name] of PRO_CATALOG.plan.tabs) assert.ok(icons.includes('"' + name + '"'), "rail icon for " + name);
  const phosphor = readFileSync(new URL("../vendor/phosphor/style.css", import.meta.url), "utf8");
  for (const m of icons.matchAll(/"(ph-[a-z-]+)"/g)) assert.ok(phosphor.includes("." + m[1] + ":before"), m[1]);
  for (const f of ["en", "he"]) for (const key of ["m_fold_rail", "m_fold_all"]) assert.match(src("i18n/" + f + ".js"), new RegExp("\n  " + key + ": "), f + " " + key);
});

test("a tool run through the hidden rail is a command, not a tap that closes the dock", () => {
  for (const f of ["ui.js", "mobile_shell.js"])
    assert.match(src(f), /if \(e\.target && e\.target\.closest && e\.target\.closest\("#plan-toolbar"\)\) return;/, f);
});

/* ---- pro inspector: the phone / fold inspector's identity card ---- */
test("the inspector card names the part, where it is and its part code, and the wall tabs read as words", () => {
  const shell = src("mobile_shell.js");
  // Refreshed wherever the top-bar identity is, and hidden with no selection.
  assert.equal((shell.match(/\n\s+syncInspectorCard\(\);/g) || []).length, 2);
  assert.match(shell, /if \(!compact\(\) \|\| !sel \|\| !KIND_ICON\[sel\.kind\] \|\| !name\) \{/);
  // The same part code (W12, F13) the AI tags use; a room's wall-list key is never shown.
  assert.match(shell, /id = ref && ref\.id != null \? partCode\(sel\.kind, ref\.id, ref\) : ""/);
  assert.match(shell, /id = ""; \/\/ a room's key is its wall list/);
  // Only real room names, never a guessed one.
  assert.match(shell, /function roomLabelOf\(room\) \{ return room \? roomName\(room\.key\) : ""; \}/);
  const css = readFileSync(new URL("../css/pro_ribbon.css", import.meta.url), "utf8");
  assert.match(css, /body\.compact-nav #right-inspector #wallProps \.wi-tabs > button > span:not\(\.wi-tab-badge\) \{\s*display: block;/);
  for (const f of ["en", "he"]) for (const key of ["m_card_wall", "m_card_door", "m_card_window", "m_card_on_wall", "m_card_id_tip"])
    assert.match(src("i18n/" + f + ".js"), new RegExp("\n  " + key + ": "), f + " " + key);
});

/* ---- fold rails in the model editor and the cabinet designer ---- */
test("the model editor and cabinet designer get the same fold rail from the same catalog", async () => {
  const { PRO_CATALOG } = await import("../js/pro_catalog.js");
  const model = src("modeler_mobile.js"), cab = src("ui_cabinet_mobile.js");
  assert.match(model, /window\.__proToolTabs\.tabs\("model"\)/);
  assert.match(cab, /window\.__proToolTabs\.tabs\("cab"\)/);
  // Columns of their own bodies, before everything else, so the drawing narrows.
  assert.match(model, /body\.insertBefore\(foldRail, body\.firstChild\)/);
  assert.match(cab, /body\.insertBefore\(foldRail, body\.firstChild\)/);
  // The tools head each editor's Properties column.
  assert.match(model, /if \(openKey !== "props"\) showSheet\("props", false\);/);
  assert.match(cab, /if \(openSheet !== "props"\) showSheet\("props"\);/);
  // Model: the tree steps aside while tools show, a feature form closes them,
  // and freeing the canvas keeps a side pane that covers nothing.
  assert.match(model, /api\.root\.dataset\.mdTreePref !== "off" && foldTab == null;/);
  assert.match(model, /if \(foldTab != null\) closeFoldTools\(\);\s*setTreeDock\(true\);/);
  assert.match(model, /export function closeModelerSheet\(\) \{\s*if \(dockRail\(\) && foldTab != null && openKey === "props"\) return;/);
  // Cabinet: the pager never swallows the tools pane.
  assert.match(cab, /pinSelector: "\.cb-tabs, \.cb-strip, \.cb-icons, #cb-fold-tools"/);
  // Every tab of both editors has a rail icon, and the grid shows each editor's armed tool.
  const ribbon = src("pro_ribbon.js");
  const icons = (ribbon.match(/var TAB_ICON = \{([\s\S]*?)\};/) || ["", ""])[1];
  for (const ed of ["model", "cab"]) for (const [name, groups] of PRO_CATALOG[ed].tabs)
    assert.ok(icons.includes('"' + name + '"') || (groups[0] && groups[0][1][0] && groups[0][1][0].icon), ed + " " + name);
  assert.match(ribbon, /if \(p\.kind === "mcmd"\) return !!document\.querySelector\('#modeler \[data-command="' \+ p\.value \+ '"\]\.on'\);/);
  for (const [f, keys] of [["modeler_strings.js", ["foldRail", "foldAll"]], ["ui_cabinet_ctx.js", ["foldRail", "foldAll", "foldClose"]]])
    for (const k of keys) assert.ok(src(f).includes(String.fromCharCode(10) + "  " + k + ": ["), f + " " + k);
  // The fold layouts both editors had wrong before: the model sheet as a side
  // column (a later phone @media re-laid it full width) and the cabinet panels
  // bounded to the body (they overflowed and clipped).
  const css = readFileSync(new URL("../css/pro_ribbon.css", import.meta.url), "utf8");
  assert.match(css, /body\.compact-nav\.dock-rail #modeler #md-sheet \{[^}]*inset-inline: auto 0;/);
  assert.match(css, /body\.dock-rail #cabdes\.cb-compact \.cb-panel \{ min-height: 0; max-height: 100%; \}/);
});

/* ---- the bar finds free room in its row ---- */
function rect(l, t, r, b) { return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }; }
function fakeBar(r) {
  const style = {};
  return { isConnected: true, style, contains: () => false, getBoundingClientRect: () => r };
}
function fakeHost(r, boxes) {
  const els = boxes.map((b) => ({ getBoundingClientRect: () => b, contains: () => false }));
  return { getBoundingClientRect: () => r, querySelectorAll: () => ({ forEach: (fn) => els.forEach(fn) }) };
}
test("the bar slides beside a side panel, climbs over a full-width strip, and stays put when clear", () => {
  globalThis.getComputedStyle = () => ({ display: "block", visibility: "visible", opacity: "1" });
  try {
    const host = rect(300, 200, 1120, 900);
    // Clear row: nothing is touched.
    let bar = fakeBar(rect(390, 814, 1030, 858));
    shellMod.fitCommandBar(bar, fakeHost(host, [rect(300, 200, 500, 400)]), "*");
    assert.equal(bar.style.left, "");
    assert.equal(bar.style.bottom, "");
    // A Layers panel on the start side reaching into the row: the bar moves right of it.
    bar = fakeBar(rect(390, 814, 1030, 858));
    shellMod.fitCommandBar(bar, fakeHost(host, [rect(300, 606, 499, 830)]), "*");
    assert.ok(parseInt(bar.style.left, 10) + 300 >= 509, "starts past the panel: " + bar.style.left);
    assert.equal(bar.style.bottom, "");
    // A strip across the whole width at the bottom: the bar stands above it, and
    // then still passes the side panel beside instead of climbing over it.
    bar = fakeBar(rect(390, 814, 1030, 858));
    shellMod.fitCommandBar(bar, fakeHost(host, [rect(300, 854, 1120, 900), rect(300, 606, 499, 830)]), "*");
    assert.equal(bar.style.bottom, (900 - 844) + "px");
    assert.ok(parseInt(bar.style.left, 10) + 300 >= 509);
  } finally { delete globalThis.getComputedStyle; }
  assert.match(src("pro_ribbon.js"), /canvas\.style\.setProperty\("--ps-bar-clear"/);
});

test("the cabinet designer's status bar reports real production numbers and nothing invented", () => {
  const cab = src("ui_cabinet.js");
  // Refreshed by every edit, and placed under the body, not inside its columns.
  assert.match(cab, /if \(sub\) sub\.textContent = cabSummary\(E\.it\);\s*fillIdCard\(\);\s*fillStatusBar\(\);/);
  assert.match(cab, /if \(statusBar && bodyEl\) bodyEl\.after\(statusBar\);/);
  // Sheets, yield and parts come from the real nesting run over the real parts.
  assert.match(cab, /var panels = panelsOf\(\[E\.it\]\), q = nest\(panels\);/);
  assert.match(cab, /Math\.round\(used \/ area \* 100\)/);
  // The recorded shop convention, or an honest "none"; no revision without a job.
  assert.match(cab, /cabinetProductionPreset\(s\.productionConvention && s\.productionConvention\.presetId\)/);
  assert.doesNotMatch(cab, /Rev [A-Z]/);
  for (const k of ["statusNoConvention", "statusStock", "statusSheets", "statusYield", "statusParts", "statusNestFailed"])
    assert.ok(src("ui_cabinet_ctx.js").includes(String.fromCharCode(10) + "  " + k + ": ["), k);
});

test("the cabinet designer's split view keeps the drawing editable beside the live model", () => {
  const view = src("ui_cabinet_view.js");
  // Split is the drawing (E.mode stays 2D) with the borrowed renderer beside it.
  assert.match(view, /var split = m === "split";\s*m = m === "3d" \? "3d" : "2d";/);
  assert.match(view, /E\.swapView\(m === "3d" \|\| split, E\.pv\);/);
  // The drawing takes the left half and keeps clear of the view picker there.
  assert.match(view, /w = E\.split \? Math\.floor\(r\.width \/ 2\) : r\.width;/);
  assert.match(view, /ox = gut \+ \(W - gut\) \/ 2 \+ viewPanX,/);
  // Picking a direction keeps the split; the PNG is always the whole drawing.
  assert.match(view, /setMode\(E\.split \? "split" : "2d"\);/);
  assert.match(view, /if \(restoreMode === "split"\) setMode\("2d"\);/);
  // A new home is a new size for the renderer, in every editor that swaps it.
  assert.match(src("editor_view.js"), /if \(view\.invalidateSize\) view\.invalidateSize\(\);\s*view\.setBig\(big\);/);
  // Phones have no room for two views: no button, and a split falls back to the drawing.
  assert.match(src("ui_cabinet_mobile.js"), /if \(on && E\.split\) setMode\("2d"\);/);
  assert.match(src("ui_cabinet.js"), /<button data-mode="split" title="' \+ T\("vSplitTip"\)/);
  for (const k of ["vSplit", "vSplitTip"]) assert.ok(src("ui_cabinet_ctx.js").includes(String.fromCharCode(10) + "  " + k + ": ["), k);
});

test("the model editor's split view: the sketch beside a model that draws the sketches too", () => {
  const md = src("modeler.js");
  // A fourth mode button, and Split starts a sketch the way Sketch does.
  assert.match(md, /<button data-mode="split" id="mdModeSplit" role="tab"/);
  assert.match(md, /if\(mode==="split"\)\{if\(isCanonicalAuthoring\(\)&&E\.authoring\.phase!=="sketch"\)beginSketchWorkflow\(\);setMode\("split"\);\}/);
  // E.mode stays 2D; leaving for the model, the sheet, an assembly or a phone drops it.
  assert.match(md, /if \(m !== "2d" \|\| E\.docType !== "part" \|\| document\.body\.classList\.contains\("compact-nav"\)\) E\.split = false;/);
  assert.match(md, /swapView\(m === "3d" \|\| split, E\.pv\);/);
  assert.match(md, /if \(E\.split && document\.body\.classList\.contains\("compact-nav"\)\) \{ setMode\("2d"\); return; \}/);
  // The model half draws every sketch on its own plane, rebuilt only when it changed.
  assert.match(md, /function drawSketch\(\) \{\s*if \(!E\.open\) return;\s*syncSplitSketch3D\(\);/);
  assert.match(md, /framePoint\(frame, q\.u, q\.v, 0\)/);
  assert.match(md, /if \(old && old\.parent === host && key === E\._splitSketchKey\) return;/);
  // With no solid yet the model half frames the sketches, not the stock box.
  assert.match(md, /E\.pv\.target\.set\(c\.x, c\.y - \(db\.y0 \+ db\.y1\) \/ 2, c\.z\);/);
  // Halving the sketch pane keeps the user's zoom and centre.
  assert.match(md, /E\.ox \+= \(E\.cw - oldW\) \/ 2;/);
  const css = src("../css/pro_ribbon.css");
  assert.match(css, /#modeler\.md-split #mdCanvas \{ left: 0; right: 50%; width: 50%; \}/);
  assert.match(css, /#modeler\.md-assembly #mdModeSplit, body\.compact-nav #modeler #mdModeSplit \{ display: none; \}/);
  for (const k of ["modeSplit", "modeSplitTip"]) assert.ok(src("modeler_strings.js").includes(String.fromCharCode(10) + "  " + k + ": ["), k);
  // Both editors' splits are in the catalog, so the command bar and the fold rails reach them.
  const cat = src("pro_catalog.js");
  assert.match(cat, /T\("Split", "ph-columns", "mclick:#mdModeSplit"\)/);
  assert.match(cat, /T\("Split", "ph-columns", "cab:mode:split"\)/);
});

test("the cabinet designer's right column: the other view, what is edited, the production strip", () => {
  const cab = src("ui_cabinet.js"), view = src("ui_cabinet_view.js");
  // the elevation thumbnail while the middle is the model — the real draw(), view state put back
  assert.match(view, /var show = E\.open && !!E\.it && E\.mode === "3d" && !E\.split && !E\.host\.classList\.contains\("cb-compact"\);/);
  assert.match(view, /E\.thumbPass = true;\s*try \{ draw\(\); \}\s*finally \{\s*E\.thumbPass = false;/);
  assert.match(view, /if \(!E\.thumbPass\) E\.view = \{ k: k, ox: ox, oy: oy, L: L \};/);
  assert.match(cab, /E\.host\.querySelector\("#cbElevThumb"\)\.addEventListener\("click", function \(\) \{ setMode\("2d"\); \}\);/);
  // the identity carries the plan's part code; the strip reuses the status bar's nesting run
  assert.match(cab, /var s = sp\(\), code = partCode\("item", E\.it\.id\);/);
  assert.match(cab, /stats = \{ parts: panels\.length, sheets: q\.sheetCount \};/);
  assert.match(cab, /"₪" \+ cabPrice\(E\.it\)\.toLocaleString\("en-US"\)/);
  assert.match(cab, /\], "cb-seg"\) \+/);
  const css = src("../css/pro_ribbon.css");
  assert.match(css, /#cabdes\.cb-compact \.cb-idcard, #cabdes\.cb-compact \.cb-prodstats, #cabdes\.cb-compact \.cb-elev-thumb \{ display: none; \}/);
  assert.match(css, /#cabdes \.cb-prodstats \{ position: sticky; bottom: 0;/);
  for (const k of ["thumb3d", "thumbElev", "thumbElevTip", "idCodeTip", "prodParts", "prodSheets", "prodCost"])
    assert.ok(src("ui_cabinet_ctx.js").includes(String.fromCharCode(10) + "  " + k + ": ["), k);
});

test("the model editor's right column shows the sketch while the middle shows the model", () => {
  const md = src("modeler.js");
  assert.match(md, /var show = !!sketch && E\.mode === "3d" && !E\.modelPlaneActive && !E\.split && !document\.body\.classList\.contains\("compact-nav"\);/);
  // redrawn only when the sketch or the slot changed; solved only then
  assert.match(md, /if \(key === E\._sketchThumbKey\) return;\s*E\._sketchThumbKey = key;\s*var info = solveSketch\(sketch\);/);
  assert.match(md, /if \(this\._sketch\) editSketchFromHistory\(this\._sketch\);/);
  assert.match(md, /syncSplitSketch3D\(\);\s*syncSketchThumb\(\);/);
  for (const k of ["sketchThumbChip", "sketchThumbTip"]) assert.ok(src("modeler_strings.js").includes(String.fromCharCode(10) + "  " + k + ": ["), k);
});

test("the Round-6 desktop layout: one header, the catalog ribbon in every editor, phones untouched", () => {
  const ribbon = src("pro_ribbon.js");
  // only on a desktop window, never in the compact layouts, and it can be turned off
  assert.match(ribbon, /return !!\(DESK && DESK\.matches\) && !document\.body\.classList\.contains\("compact-nav"\) && store\("mf\.proSkin"\) !== "0";/);
  assert.match(ribbon, /var DESK = typeof matchMedia === "function" \? matchMedia\("\(min-width: 1024px\)"\) : null;/);
  // what moves keeps its node and goes home when the layout does
  assert.match(ribbon, /relocate\(document\.getElementById\("toolSearch"\), on && bar \? bar : null\);/);
  assert.match(ribbon, /relocate\(document\.getElementById\("toolSearch"\), null\);\s*ribbon\.remove\(\);/);
  // Split: the 3D over the inspector, redrawn after the move
  assert.match(ribbon, /insp\.insertBefore\(v3, insp\.firstChild\);/);
  assert.match(ribbon, /import\("\.\/view3d\.js"\)\.then\(function \(m\) \{ if \(m\.requestRender\) m\.requestRender\(\); \}\);/);
  // the editors' ribbons are their catalog tabs, mounted through the shell
  assert.match(ribbon, /var EDITOR_RIBBON_AFTER = \{ model: "\.md-head", cab: "\.cb-head-main" \};/);
  assert.match(src("pro_shell.js"), /if \(editor && editor !== "plan" && shell\.mountEditorRibbon\) shell\.mountEditorRibbon\(editor, root\);/);
  assert.match(ribbon, /document\.querySelectorAll\("\.pro-rail-grid \[data-pro-bind\], \.pr-editor-ribbon \[data-pro-bind\]"\)/);
  // the cabinet's view buttons are found by their own class, wherever they sit
  assert.match(src("ui_cabinet_view.js"), /E\.host\.querySelectorAll\("\.cb-vmodes button\[data-mode\]"\)/);
  assert.match(src("pro_catalog.js"), /\["Level", \[T\("Compose", "ph-layout", "cab:level:composition"\)/);
  const skin = src("../css/pro_skin.css");
  assert.match(skin, /body:not\(\.pro-skin\) #topbar \[data-ps-moved\] \{ display: none !important; \}/);
  assert.match(skin, /body:not\(\.pro-skin\) \.pr-editor-ribbon \{ display: none; \}/);
  assert.match(skin, /body\.pro-skin #modeler \.md-commandmanager \{ display: none; \}/);
  assert.match(src("../index.html"), /<link rel="stylesheet" href="css\/pro_skin\.css" \/>/);
});

test("UI Customize mode is switched off: nothing mounts, no entry offers it", () => {
  const host = src("uikit_host/index.js");
  assert.match(host, /export const CUSTOMIZE_DISABLED = true;/);
  assert.match(host, /export function initUIKit\(options\) \{\s*const opts = options \|\| \{\};\s*if \(CUSTOMIZE_DISABLED\) return null;/);
  assert.match(host, /export function openCustomize\(\) \{\s*if \(CUSTOMIZE_DISABLED\) return false;/);
  assert.match(src("../index.html"), /<button data-act="uikitCustomize" hidden role="menuitemcheckbox"/);
  assert.doesNotMatch(src("mobile_shell.js"), /\["uikitCustomize", "uikit_ins_title", "ph-layout"\]/);
  // its tests are skipped with the reason, and run again once the flag is cleared
  assert.match(readFileSync(new URL("./helpers/customize_gate.mjs", import.meta.url), "utf8"), /CUSTOMIZE_DISABLED = true;/);
});
