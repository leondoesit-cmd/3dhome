// Buttons ease paint, never size. With `transition: all`, a button that
// changed size (a denser ribbon, the touch sizing, a layout switch) kept
// reporting the size it was leaving until the ease ended, and forever in a
// page that is not painting, so the ribbon and dock fitting, which measure
// right after such a change, read stale widths.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = (await readFile(new URL("../css/styles.css", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

/* The body of a top-level rule whose selector is exactly `selector`. */
function block(selector) {
  const head = "\n" + selector + " {\n";
  const at = css.indexOf(head);
  assert.ok(at >= 0, "found the global " + selector + " rule");
  const start = at + head.length;
  return css.slice(start, css.indexOf("\n}", start));
}

const SIZE = /^(all|width|height|min-width|min-height|max-width|max-height|padding.*|margin.*|font-size|gap|inset.*|top|left|right|bottom|flex.*)$/;

test("no stylesheet eases `all`", async () => {
  const { readdir } = await import("node:fs/promises");
  const hits = [];
  for (const dir of ["css", "uikit"]) {
    const files = (await readdir(new URL("../" + dir + "/", import.meta.url), { recursive: true })).filter((f) => String(f).endsWith(".css"));
    for (const f of files) {
      const text = (await readFile(new URL("../" + dir + "/" + String(f).replace(/\\/g, "/"), import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of text.matchAll(/transition\s*:\s*([^;}]+)/g)) {
        if (m[1].split(",").some((part) => part.trim().split(/\s+/)[0] === "all")) hits.push(dir + "/" + f + ": transition: " + m[1].trim());
      }
    }
  }
  assert.deepEqual(hits, []);
});

test("the shared --ease-paint list names paint properties only", () => {
  const m = css.match(/--ease-paint:\s*([^;]+);/);
  assert.ok(m, "styles.css defines --ease-paint");
  for (const name of m[1].split(",").map((p) => p.trim())) assert.doesNotMatch(name, SIZE, "--ease-paint must not list " + name);
});

for (const selector of ["button", "button i"]) {
  test(`the global ${selector} rule transitions paint properties only`, () => {
    const body = block(selector);
    const decls = [...body.matchAll(/transition(?:-property)?\s*:\s*([^;]+);/g)].map((m) => m[1]);
    assert.ok(decls.length, "it has a transition");
    for (const decl of decls) {
      // each comma part starts with the property name (durations follow it)
      for (const name of decl.split(",").map((part) => part.trim().split(/\s+/)[0])) {
        assert.doesNotMatch(name, SIZE, selector + " must not ease " + name);
      }
    }
  });
}
