import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/* topologyItem() in js/core/topology.js hands out its descriptor by reference
   instead of cloning it, because descriptors are read-only everywhere and
   sibling descriptors deliberately share nested point objects. That is a real
   invariant, not a style preference: a single `entry.descriptor.origin = ...`
   would silently corrupt every entry sharing that point. This is the guard.
   Replacing a whole descriptor (`x.descriptor = clone(...)`) stays legal. */
async function jsFiles(dir) {
  const out = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) out.push(...await jsFiles(path));
    else if (item.name.endsWith(".js")) out.push(path);
  }
  return out;
}

test("no code mutates a field inside a topology descriptor", async () => {
  const offenders = [];
  for (const file of await jsFiles("js")) {
    const source = await readFile(file, "utf8");
    source.split("\n").forEach((line, index) => {
      const flag = (why) => offenders.push(`${file}:${index + 1}: ${why} — ${line.trim()}`);
      // .descriptor.<field> = something  (but not ==, ===, >=, <=, !=)
      if (/\.descriptor(\.[A-Za-z_$][\w$]*)+\s*=(?![=>])/.test(line)
        && !/\.descriptor(\.[A-Za-z_$][\w$]*)+\s*[!<>=]=/.test(line)) flag("field assignment");
      // Object.assign(x.descriptor, ...) writes into the shared object too
      if (/Object\.assign\(\s*[A-Za-z_$][\w$.[\]'"]*\.descriptor\b/.test(line)) flag("Object.assign target");
      // delete x.descriptor.field
      if (/delete\s+[A-Za-z_$][\w$.[\]'"]*\.descriptor\./.test(line)) flag("delete on a field");
    });
  }
  assert.deepEqual(offenders, [],
    "descriptors are shared by reference from topologyItem() — mutating a field inside one corrupts every entry sharing it. " +
    "Replace the whole descriptor instead, or restore the clone in topologyItem().");
});
