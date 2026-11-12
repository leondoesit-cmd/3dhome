import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");

test("index.html shows a banner for file:// and pre-boot module errors", () => {
  const boot = html.slice(0, html.indexOf("</head>"));
  assert.match(boot, /location\.protocol === "file:"/);
  assert.match(boot, /npm start/);
  assert.match(boot, /http:\/\/localhost:8765/);
  assert.match(boot, /window\.__home3dBooted/);
  assert.match(boot, /addEventListener\("error"/);
  assert.ok(
    html.indexOf('location.protocol === "file:"') < html.indexOf('src="js/main.js'),
    "file:// guard must run before main.js",
  );
});

test("main.js signals readiness after installing persistence and finishing its final render", () => {
  assert.match(main, /chromeCustomizationReady\.then/);
  assert.ok(main.lastIndexOf("render2D();") < main.indexOf('detail: "main"'));
  assert.ok(main.indexOf("initPersistence") < main.indexOf('detail: "main"'));
});

function bootstrap(saved = {}) {
  const attributes = new Map();
  const listeners = new Map();
  const preloads = [];
  const root = {
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key),
    appendChild() {},
  };
  const document = {
    head: { appendChild: node => preloads.push(node) },
    documentElement: root,
    body: root,
    getElementById: () => null,
    createElement: () => ({ setAttribute() {} }),
  };
  const window = { addEventListener: (name, fn) => listeners.set(name, fn) };
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) runInNewContext(script[1], {
    document, window, localStorage: { getItem: key => saved[key] || null },
    location: { protocol: "http:" },
  });
  return { attributes, listeners, window, preloads };
}

test("boot preloads only the selected locale and normalized icon theme", () => {
  for (const [saved, expected] of [
    [{}, ["js/icon_themes/lucide.js", "js/i18n/en.js"]],
    [{home3d_lang:"he", home3d_icon_theme:"technical"}, ["js/icon_themes/tabler.js", "js/i18n/he.js"]],
    [{home3d_lang:"invalid", home3d_icon_theme:"invalid"}, ["js/icon_themes/lucide.js", "js/i18n/en.js"]],
  ]) {
    const {preloads} = bootstrap(saved);
    assert.deepEqual(preloads.map(node => node.href), expected);
    assert.ok(preloads.every(node => node.rel === "modulepreload"));
  }
});

test("optional preload failure preserves loading and leaves fallback to the actual import", () => {
  const {attributes, listeners} = bootstrap();
  listeners.get("error")({target:{tagName:"LINK",rel:"modulepreload"}});
  assert.equal(attributes.get("data-boot"), "loading");
  listeners.get("error")({target:{tagName:"SCRIPT"}});
  assert.equal(attributes.has("data-boot"), false);
});

test("startup withholds the editor until both layout entry points finish in either order", () => {
  for (const order of [["main", "chrome"], ["chrome", "main"]]) {
    const { attributes, listeners, window } = bootstrap();
    const ready = listeners.get("planner-boot-ready");
    assert.equal(attributes.get("data-boot"), "loading");
    ready({ detail: order[0] });
    assert.equal(attributes.get("data-boot"), "loading");
    assert.notEqual(window.__home3dBooted, true);
    ready({ detail: order[1] });
    assert.equal(attributes.has("data-boot"), false);
    assert.equal(window.__home3dBooted, true);
  }
});

test("a boot failure releases the loading screen so the error remains visible", () => {
  for (const [name, event] of [
    ["error", { message: "Module failed" }],
    ["unhandledrejection", { reason: new Error("Module failed") }],
  ]) {
    const { attributes, listeners } = bootstrap();
    listeners.get("planner-boot-ready")({ detail: "main" });
    listeners.get(name)(event);
    assert.equal(attributes.has("data-boot"), false);
  }
});
