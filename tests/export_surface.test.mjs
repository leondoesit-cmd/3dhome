// The public surface of the modules that were split into js/<name>/ pieces.
// A split moves code verbatim, but it can silently drop an `export { x }` that
// only a dynamic import(), another tab or a test used — link_check only sees
// the static graph. Removing an export on purpose means editing
// tests/export_surface.json in the same change.
//   node tests/export_surface.test.mjs --write   regenerates the snapshot
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import * as acorn from "../vendor/acorn/acorn.mjs";

const ROOT = new URL("../", import.meta.url);
const SNAPSHOT = new URL("export_surface.json", import.meta.url);

function exportedNames(rel) {
  const ast = acorn.parse(readFileSync(new URL(rel, ROOT), "utf8"), { ecmaVersion: "latest", sourceType: "module" });
  const out = new Set();
  for (const n of ast.body) {
    if (n.type === "ExportNamedDeclaration") {
      if (n.declaration?.id) out.add(n.declaration.id.name);
      for (const v of n.declaration?.declarations || []) if (v.id.type === "Identifier") out.add(v.id.name);
      for (const s of n.specifiers || []) out.add(s.exported.name ?? s.exported.value);
    } else if (n.type === "ExportDefaultDeclaration") out.add("default");
  }
  return [...out].sort();
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));

if (process.argv.includes("--write")) {
  const next = Object.fromEntries(Object.keys(snapshot).sort().map((rel) => [rel, exportedNames(rel)]));
  writeFileSync(SNAPSHOT, JSON.stringify(next, null, 1) + "\n");
}

for (const [rel, names] of Object.entries(snapshot)) {
  test(`${rel} still exports everything it did`, () => {
    const now = new Set(exportedNames(rel));
    const lost = names.filter((n) => !now.has(n));
    assert.deepEqual(lost, [], `${rel} stopped exporting: ${lost.join(", ")}`);
  });
}
