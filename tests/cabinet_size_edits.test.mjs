import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "../vendor/acorn/acorn.mjs";
import { STD, SEC } from "../js/cabinet.js";
import { setExactSize, sizeEntryChanged, mirrorLayout } from "../js/cabinet_layout_ops.js";
import { displayUnit, fmtLen, parseLen } from "../js/display_units.js";
import { loadUnitSettings, saveUnitSettings } from "../js/unit_settings.js";

// Run the real UI functions with controlled DOM/dependencies, avoiding their
// GPU module graph. Acorn preserves the event callbacks and nested functions.
function uiFunctions(file, names, bindings) {
  const source = readFileSync(new URL(`../js/${file}.js`, import.meta.url), "utf8");
  const declarations = new Map();
  for (const entry of parse(source, { ecmaVersion: "latest", sourceType: "module" }).body) {
    const node = entry.declaration || entry;
    if (node.type === "FunctionDeclaration") declarations.set(node.id.name, source.slice(node.start, node.end));
  }
  return new Function(...Object.keys(bindings), names.map(name => {
    assert.ok(declarations.has(name), `${file}: ${name}`);
    return declarations.get(name);
  }).join("\n") + `\nreturn {${names.join(",")}};`)(...Object.values(bindings));
}

class Element {
  constructor() {
    this.children = [];
    this.events = {};
    this.style = {};
    this.attributes = {};
    this.offsetWidth = 100;
    this.offsetHeight = 30;
    this.classList = { add() {}, remove() {} };
  }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { this.children.push(node); node.parent = this; }
  remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(type, fn) { this.events[type] = fn; }
  emit(type, event = {}) { this.events[type]?.({ stopPropagation() {}, preventDefault() {}, ...event }); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 500, height: 400 }; }
  focus() {}
  select() {}
}

function popup() {
  const host = new Element(), applied = [], E = { cv: { parentElement: host, focus() {} } };
  const ui = uiFunctions("ui_cabinet_view", ["dimLen", "parseSizeEntry", "openSizeEdit", "closeSizeEdit"], {
    E, displayUnit, fmtLen, parseLen, sizeEntryChanged, T: key => key,
    document: { createElement: () => new Element() },
  });
  ui.openSizeEdit({ cm: 59.3, min: 0, label: "Width" }, null, cm => applied.push(cm));
  return { ...ui, E, host, applied, input: host.children[0].children[1] };
}

test("inch popup leaves rounded text unchanged on Enter and blur, with whitespace ignored", () => {
  const settings = structuredClone(loadUnitSettings());
  saveUnitSettings({ overrides: { furniture: { unit: "in", digits: 1 } } });
  try {
    for (const event of ["blur", "Enter"]) {
      for (const whitespace of [false, true]) {
        const p = popup();
        assert.equal(p.input.value, "23.3");
        assert.ok(Math.abs(p.parseSizeEntry(p.input.value) - 59.3) > 0.01, "real formatting loses precision");
        if (whitespace) p.input.value = ` ${p.input.value} `;
        p.input.emit(event === "Enter" ? "keydown" : event, { key: event });
        assert.deepEqual(p.applied, []);
        assert.equal(p.E.sizeEdit, null);
        assert.equal(p.host.children.length, 0);
      }
    }
  } finally { saveUnitSettings(settings); }
});

test("inch popup parses changed entries, keeps the numeric threshold, and Escape cancels", () => {
  const settings = structuredClone(loadUnitSettings());
  saveUnitSettings({ overrides: { furniture: { unit: "in", digits: 1 } } });
  try {
    for (const [text, expected] of [["24", [60.96]], ["23.30", [59.182]], ["59.3cm", []], ["59.305cm", []]]) {
      const p = popup();
      p.input.value = text;
      p.input.emit("keydown", { key: "Enter" });
      assert.equal(p.applied.length, expected.length, text);
      if (expected.length) assert.ok(Math.abs(p.applied[0] - expected[0]) < 1e-9);
      assert.equal(p.E.sizeEdit, null);
      p.input.emit("blur");
      assert.equal(p.applied.length, expected.length, "Enter followed by blur commits only once");
    }
    const p = popup();
    p.input.value = "24";
    p.input.emit("keydown", { key: "Escape" });
    p.input.emit("blur");
    assert.deepEqual(p.applied, []);
    assert.equal(p.E.sizeEdit, null);
    const invalid = popup();
    invalid.input.value = "bad";
    invalid.input.emit("keydown", { key: "Enter" });
    assert.ok(invalid.E.sizeEdit, "invalid Enter keeps the editor open");
    assert.equal(invalid.input.attributes["aria-invalid"], "true");
    invalid.input.emit("blur");
    assert.equal(invalid.E.sizeEdit, null);
    assert.deepEqual(invalid.applied, []);
  } finally { saveUnitSettings(settings); }
});

function inspector(cols) {
  const spec = { auto: true, cols }, calls = [], snapshots = [];
  const api = {
    act(label) { calls.push(["act", label]); snapshots.push(structuredClone(spec)); },
    touch() { calls.push(["touch"]); spec.auto = false; },
    changed() { calls.push(["changed"]); },
  };
  return { spec, calls, snapshots, ...uiFunctions("ui_cabinet_inspect", [
    "secMin", "applyExactSize", "setColumnWidth", "setSectionHeight", "mirrorCabinet",
  ], { sp: () => spec, api, STD, SEC, setExactSize, mirrorLayout, T: key => key,
    isCorner: () => false, E: {} }) };
}

test("column edits with only strips for neighbours record nothing and never pin", () => {
  for (const cm of [25, 60, 80]) {
    const f = inspector([{ w: 60 }, { w: 5, kind: "filler" }, { w: 20, kind: "blind" }]);
    const before = structuredClone(f.spec);
    f.setColumnWidth(0, cm);
    assert.deepEqual(f.spec, before);
    assert.deepEqual(f.calls, []);
  }
});

test("successful column edits capture undo before mutation and skip an unpinned filler", () => {
  const f = inspector([{ w: 60 }, { w: 5, kind: "filler" }, { w: 60 }]);
  const before = structuredClone(f.spec);
  f.setColumnWidth(0, 25);
  assert.deepEqual(f.spec.cols.map(c => c.w), [25, 5, 95]);
  assert.equal(f.spec.auto, false);
  assert.deepEqual(f.snapshots, [before]);
  assert.deepEqual(f.calls, [["act", "colW"], ["touch"], ["changed"]]);
});

test("section edits preserve redistribution to rigid sections and avoid no-op history", () => {
  const f = inspector([{ w: 60, secs: [{ t: "shelves", h: 60 }, { t: "drawers", h: 40, fixed: true }] }]);
  f.setSectionHeight(0, 0, 25);
  assert.deepEqual(f.spec.cols[0].secs.map(s => s.h), [25, 75]);
  assert.deepEqual(f.calls, [["act", "secH"], ["touch"], ["changed"]]);
  const one = inspector([{ w: 60, secs: [{ t: "shelves", h: 60 }] }]);
  one.setSectionHeight(0, 0, 25);
  assert.deepEqual(one.calls, []);
  assert.equal(one.spec.auto, true);
  assert.equal(one.spec.cols[0].secs[0].fixed, undefined);
});

test("single unhanded doors do not record a Mirror edit", () => {
  for (const [t, w, leaves] of [["sliding", 60], ["lift", 60], ["hinged", 100], ["hinged", 60, 2]]) {
    const f = inspector([{ w, door: { t, leaves, hinge: "R" } }]);
    const before = structuredClone(f.spec);
    assert.equal(f.mirrorCabinet(), false);
    assert.deepEqual(f.spec, before);
    assert.deepEqual(f.calls, []);
  }
});
