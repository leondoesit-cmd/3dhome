import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { sourceFunctionText } from "./helpers/source_function.mjs";

// Model the DOM operations used by the panel. Removing/reinserting a focused
// subtree drops focus, just as insertBefore does in browsers without moveBefore.
function layerDocument() {
  const document = { activeElement: null, createElement: tag => new Element(tag) };
  class Element {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.attributes = {};
      this.classes = new Set();
      this.classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };
    }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children.at(-1) || null; }
    get nextElementSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
    append(...els) { els.forEach(el => this.appendChild(el)); }
    appendChild(el) { this.insertBefore(el, null); }
    insertBefore(el, before) {
      el.remove();
      const i = before ? this.children.indexOf(before) : this.children.length;
      assert.notEqual(i, -1);
      this.children.splice(i, 0, el);
      el.parentNode = this;
    }
    remove() {
      if (!this.parentNode) return;
      if (this.contains(document.activeElement)) document.activeElement = null;
      const siblings = this.parentNode.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentNode = null;
    }
    contains(el) { return this === el || this.children.some(child => child.contains(el)); }
    focus() { document.activeElement = this; }
    addEventListener(type, fn) { this[type] = fn; }
    setAttribute(key, value) { this.attributes[key] = value; }
    querySelector(selector) {
      for (const el of this.children) {
        if (el.tag === selector || "." + el.className === selector) return el;
        const nested = el.querySelector(selector);
        if (nested) return nested;
      }
      return null;
    }
    set innerHTML(html) {
      for (const match of html.matchAll(/<(i|span)\b([^>]*)>/g)) {
        const el = new Element(match[1]);
        el.className = /class="([^"]*)"/.exec(match[2])?.[1] || "";
        this.appendChild(el);
      }
    }
    get textContent() { return this.text || ""; }
    set textContent(value) {
      this.children.slice().forEach(el => el.remove());
      this.text = value;
    }
  }
  return document;
}

test("custom layer rows retain focus, order and current-object handlers through a load", () => {
  const document = layerDocument(), box = document.createElement("div");
  const original = { id: "a", name: "First", vis: "show", locked: false };
  const b = { ...original, id: "b", name: "Second" };
  let layers = [original, b], lang = "en";
  const ctx = vm.createContext({ document, userBox: box, rows: {}, getLang: () => lang,
    t: key => lang + "-" + key, userLayerById: id => layers.find(L => L.id === id),
    userLayers: () => layers, userLayerCounts: () => new Map([["a", 3]]),
    layerTagKind: (work, set, vis) => vis, userChanged() {} });
  const src = readFileSync(new URL("../js/ui_layers.js", import.meta.url), "utf8");
  for (const name of ["renderUserRows", "setLayerText", "userRowButton", "makeUserRow", "updateUserRow"])
    vm.runInContext(sourceFunctionText(src, name), ctx);
  ctx.renderUserRows();
  const head = box.firstElementChild, row = ctx.rows["ul:b"].row;
  const eye = row.querySelector(".lchip-eye"), lock = row.querySelector(".lchip-lock");
  eye.focus();
  const replacement = { ...b, name: "Renamed", vis: "ghost" };
  layers = [replacement, original];
  ctx.renderUserRows();
  assert.equal(document.activeElement, eye);
  assert.deepEqual(box.children, [head, row, ctx.rows["ul:a"].row]);
  assert.equal(ctx.rows["ul:a"].count.textContent, "3");
  assert.equal(row.querySelector(".lchip-t").textContent, "Renamed");
  assert.equal(row.querySelector(".lchip-tag").attributes["data-kind"], "ghost");
  assert.ok(row.classes.has("ghosted"));
  eye.click();
  lock.click();
  assert.deepEqual([replacement.vis, replacement.locked, b.vis, b.locked], ["show", true, "show", false]);
  lang = "he";
  ctx.renderUserRows();
  assert.equal(lock.title, "he-lay_unlock");
  assert.equal(lock.attributes["aria-label"], "Renamed · he-lay_unlock");
  assert.ok(!row.classes.has("ghosted") && row.classes.has("locked"));
  layers = [];
  ctx.renderUserRows();
  const hint = box.querySelector(".lchip-user-empty");
  assert.deepEqual(box.children, [head, hint]);
  assert.ok(hint && !ctx.rows["ul:b"]);
});
