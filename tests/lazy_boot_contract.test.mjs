/* What must stay OFF the boot graph.
 *
 * Four separate pieces of weight were moved off startup: three.js (3.5 MB),
 * the CAD model editor (830 KB), every locale but one, and every icon theme but
 * one. Each was removed by DEFERRING a module, and every one of them regresses
 * the same silent way — somebody adds a plain `import` for a symbol they need,
 * the module returns to the eager graph, and nothing fails. No test breaks, no
 * error appears; the app is simply slow again.
 *
 * Measured at the time of the split: 189 -> 137 requests, 8404 -> 7004 KB of
 * decoded JS, 632 -> 262 ms to DomContentLoaded. That last number is not about
 * bytes: js/modeler.js ends its module body with a top-level
 * `await initializeModelLibrary()`, an IndexedDB round-trip that blocked the
 * whole eager graph on every boot, including boots that never touch a model.
 *
 * These assertions are the only thing standing between that and a quiet
 * reversal, so they are deliberately about SHAPE, not behaviour.
 */
import { moduleSource } from "./helpers/module_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
const main = await read("js/main.js");
const ui = moduleSource("js/ui.js");
const relay = await read("server/relay.mjs");
const i18n = await read("js/i18n.js");
const iconIndex = await read("js/icon_theme_assets.js");

/* Games are dynamically imported already, so a plain `import * as THREE` inside
   one is a module-cache hit or a correct blocking fetch — never boot weight. */
const GAME = /^(drive|lava|kart|rc|zombies|track|race|players|weapons|fracture)/;

test("the CAD editor is not on the boot graph", async () => {
  // main.js and ui.js reach the editor through the launcher, never directly
  assert.doesNotMatch(main, /^import [^;]*from "\.\/modeler\.js"/m);
  assert.doesNotMatch(ui, /^import [^;]*from "\.\/modeler\.js"/m);
  assert.match(main, /from "\.\/modeler_launch\.js"/);
  // the registry half that boot genuinely needs lives in its own small module
  assert.match(ui, /from "\.\/model_catalog\.js"/);
  // and the editor itself is reached by dynamic import only
  const launch = await read("js/modeler_launch.js");
  assert.match(launch, /import\("\.\/modeler\.js"\)/);
  assert.doesNotMatch(launch, /^import [^;]*from "\.\/modeler\.js"/m);
});

test("three.js is not statically imported outside game modules", async () => {
  // recursive: split modules keep their pieces in js/<name>/; a game module's
  // pieces are game code too, so GAME tests the first path segment. js/physics/
  // is reached only through physics_facade.js's dynamic import("./physics.js").
  const files = (await readdir(new URL("../js", import.meta.url), { recursive: true }))
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => f.endsWith(".js") && !GAME.test(f.split("/")[0]) && !f.startsWith("physics/") && f !== "three_lazy.js");
  const offenders = [];
  for (const f of files) {
    const src = await read("js/" + f);
    if (/^import [^;]*from "three(\/[^"]*)?";/m.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], "these put 3.5 MB of three back on boot: " + offenders.join(", "));
});

test("only the active locale and icon theme load at boot", () => {
  // one module per locale, reached by literal specifier so link_check follows it
  assert.match(i18n, /import\("\.\/i18n\/he\.js"\)/);
  assert.match(i18n, /import\("\.\/i18n\/en\.js"\)/);
  // the synchronous t() contract rests on this single line
  assert.match(i18n, /^await loadLang\(lang\);$/m);
  // themes are an index plus one module each, not one 1.2 MB table
  assert.match(iconIndex, /export function loadIconTheme/);
  assert.match(iconIndex, /import\("\.\/icon_themes\//);
  assert.ok(iconIndex.length < 40000, "icon_theme_assets.js should be an index, not the artwork");
});

test("the dev server compresses off the request thread, once per file", () => {
  // brotli at default quality cost 6.3 s of synchronous CPU for seven files
  assert.match(relay, /BROTLI_PARAM_QUALITY\]: 5/);
  // async zlib, so compression runs on the libuv pool
  assert.match(relay, /promisify\(brotliCompress\)/);
  // and N concurrent requests for one cold file share a single compression
  assert.match(relay, /const pendingStatic = new Map\(\)/);
  assert.doesNotMatch(relay, /brotliCompressSync|gzipSync/);
});
