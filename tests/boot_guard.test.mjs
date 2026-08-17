import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

test("main.js marks boot complete so later errors use persist.js instead", () => {
  assert.match(main, /window\.__home3dBooted = true/);
  assert.ok(main.indexOf("initPersistence") < main.indexOf("__home3dBooted = true"));
});
