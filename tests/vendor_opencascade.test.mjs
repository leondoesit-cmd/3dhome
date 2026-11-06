import { moduleSource } from "./helpers/module_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

// The browser loads the vendored glue (the relay never serves node_modules);
// Node tests load the npm package. Both must be the same build, or the browser
// kernel silently differs from the one the tests prove.
test("the vendored OpenCascade glue is the installed npm build", async (t) => {
  let installed;
  try {
    installed = await readFile(new URL("node_modules/opencascade.js/dist/opencascade.full.js", root));
  } catch (_) {
    t.skip("node_modules/opencascade.js is not installed");
    return;
  }
  const vendored = await readFile(new URL("vendor/opencascade/opencascade.full.js", root));
  assert.ok(vendored.equals(installed), "copy node_modules/opencascade.js/dist/opencascade.full.js to vendor/opencascade/");
  const pkg = (path) => readFile(new URL(path, root), "utf8").then(JSON.parse);
  assert.equal(
    (await pkg("vendor/opencascade/package.json")).version,
    (await pkg("node_modules/opencascade.js/package.json")).version,
  );
});

test("the browser kernel loads the vendored glue and the streamed gzip binary", async () => {
  const source = moduleSource("js/cad_kernel.js");
  assert.match(source, /new URL\("\.\.\/vendor\/opencascade\/opencascade\.full\.js", import\.meta\.url\)/);
  assert.doesNotMatch(source, /\.\.\/node_modules\//, "nothing in the browser path may point into node_modules");
});
