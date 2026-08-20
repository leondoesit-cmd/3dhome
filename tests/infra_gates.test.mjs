import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFiles, defaultFiles, formatReport } from "../tools/module_check.mjs";
import {
  checkGraph,
  checkRepo,
  inspectModule,
  parseHtmlModuleEntries,
  parseImportMap,
  remoteBootUrls,
  resolveSpecifier,
} from "../tools/link_check.mjs";

test("module check scans js/core and js/physics by default and is clean", () => {
  const files = defaultFiles();
  assert.ok(files.some((f) => /js\/core\/topology\.js$/.test(f.replace(/\\/g, "/"))));
  assert.ok(files.some((f) => /js\/physics\/world\.js$/.test(f.replace(/\\/g, "/"))));
  assert.ok(files.some((f) => /server\/relay\.mjs$/.test(f.replace(/\\/g, "/"))));
  const result = checkFiles(files);
  assert.equal(result.total, 0, formatReport(result));
});

test("module check reports an unresolved identifier", () => {
  const dir = mkdtempSync(join(tmpdir(), "home3d-modules-"));
  const file = join(dir, "broken.js");
  try {
    writeFileSync(file, "export function run() { missingExport(); }\n");
    const result = checkFiles([file], dir);
    assert.equal(result.total, 1);
    assert.equal(result.hits[0].name, "missingExport");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("link check follows the real boot graph without missing exports", () => {
  const result = checkRepo();
  assert.equal(result.errors.length, 0, result.errors.map((e) => `${e.file}: ${e.message}`).join("\n"));
  assert.ok(result.modules > 50);
});

test("link check reports a named import the target does not export", () => {
  const dir = mkdtempSync(join(tmpdir(), "home3d-link-"));
  try {
    writeFileSync(join(dir, "a.js"), 'import { missing } from "./b.js";\n');
    writeFileSync(join(dir, "b.js"), "export function present() {}\n");
    const result = checkGraph({
      root: dir,
      entries: ["a.js"],
      importMap: { imports: {} },
    });
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /\{ missing \}/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("link check follows re-exports and rejects a missing re-export", () => {
  const dir = mkdtempSync(join(tmpdir(), "home3d-reexport-"));
  try {
    writeFileSync(join(dir, "entry.js"), 'export { real, ghost } from "./lib.js";\n');
    writeFileSync(join(dir, "lib.js"), "export const real = 1;\n");
    const result = checkGraph({
      root: dir,
      entries: ["entry.js"],
      importMap: { imports: {} },
    });
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /\{ ghost \}/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("import map, HTML entries, and CDN leaks parse as expected", () => {
  const html = `<script type="importmap">{ "imports": { "three": "./vendor/three/three.webgpu.js" } }</script>
<script type="module" src="js/main.js?v=1"></script>`;
  assert.equal(parseImportMap(html).imports.three, "./vendor/three/three.webgpu.js");
  assert.deepEqual(parseHtmlModuleEntries(html), ["js/main.js"]);
  assert.deepEqual(remoteBootUrls('<script src="https://cdn.example/three.js"></script>'), [
    "https://cdn.example/three.js",
  ]);
  assert.deepEqual(remoteBootUrls("url(https://www.w3.org/2000/svg)"), []);
  const info = inspectModule('import { foo as bar } from "./x.js"; export function foo() {}');
  assert.deepEqual(info.imports[0].names, ["foo"]);
  assert.ok(info.exportNames.has("foo"));
  const resolved = resolveSpecifier("/app/js/main.js", "three", {
    root: "/app",
    importMap: { imports: { three: "./vendor/three/three.webgpu.js" } },
  });
  assert.equal(resolved.file.replace(/\\/g, "/"), "/app/vendor/three/three.webgpu.js");
});

test("opaque vendor files are existence-checked without parsing exports", () => {
  const dir = mkdtempSync(join(tmpdir(), "home3d-vendor-"));
  try {
    mkdirSync(join(dir, "vendor"), { recursive: true });
    mkdirSync(join(dir, "js"), { recursive: true });
    writeFileSync(join(dir, "vendor", "lib.js"), "not even javascript {{{");
    writeFileSync(join(dir, "js", "app.js"), 'import { anything } from "../vendor/lib.js";\n');
    const result = checkGraph({
      root: dir,
      entries: ["js/app.js"],
      importMap: { imports: {} },
    });
    assert.equal(result.errors.length, 0, result.errors.map((e) => e.message).join("\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
