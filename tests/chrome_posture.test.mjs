import { moduleSource } from "./helpers/module_source.mjs";
import { stylesSource } from "./helpers/styles_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromePosture } from "../js/chrome_posture.js";

function classes(p) {
  var out = [];
  if (p.compact) out.push("compact-nav");
  if (p.dockRail) out.push("dock-rail");
  if (p.sheetDrawers) out.push("sheet-drawers");
  if (p.splitRow) out.push("split-row");
  if (p.sideInspector) out.push("side-inspector");
  return out.join(" ");
}

const CASES = [
  {
    name: "iPhone 14 portrait",
    w: 390, h: 844, touch: true,
    compact: true, roomy: false, phone: true, classes: "compact-nav sheet-drawers",
  },
  {
    name: "iPhone 14 landscape",
    w: 844, h: 390, touch: true,
    compact: true, roomy: false, phone: true, classes: "compact-nav sheet-drawers side-inspector",
  },
  {
    name: "Galaxy Fold cover",
    w: 344, h: 882, touch: true,
    compact: true, roomy: false, phone: true, classes: "compact-nav sheet-drawers",
  },
  {
    name: "Fold inner portrait",
    w: 717, h: 829, touch: true,
    compact: true, roomy: true, phone: false, classes: "compact-nav dock-rail split-row",
  },
  {
    name: "Fold inner landscape",
    w: 829, h: 717, touch: true,
    compact: true, roomy: true, phone: false, classes: "compact-nav dock-rail split-row",
  },
  {
    name: "Pixel Fold inner portrait",
    w: 673, h: 841, touch: true,
    compact: true, roomy: true, phone: false, classes: "compact-nav dock-rail split-row",
  },
  {
    name: "iPad portrait",
    w: 768, h: 1024, touch: true,
    compact: true, roomy: true, phone: false, classes: "compact-nav dock-rail split-row",
  },
  {
    name: "iPad landscape",
    w: 1024, h: 768, touch: true,
    compact: true, roomy: true, phone: false, classes: "compact-nav dock-rail split-row",
  },
  {
    name: "Galaxy Fold unfolded landscape",
    w: 1104, h: 884, touch: true,
    compact: true, roomy: true, phone: false, classes: "compact-nav dock-rail split-row",
  },
  {
    name: "narrow desktop window (no touch)",
    w: 700, h: 800, touch: false,
    compact: false, roomy: false, phone: false, classes: "",
  },
  {
    name: "laptop (no touch)",
    w: 1440, h: 900, touch: false,
    compact: false, roomy: false, phone: false, classes: "",
  },
];

for (const c of CASES) {
  test("posture: " + c.name, () => {
    const p = chromePosture(c.w, c.h, { touch: c.touch });
    assert.equal(p.compact, c.compact, "compact");
    assert.equal(p.roomy, c.roomy, "roomy");
    assert.equal(p.phone, c.phone, "phone");
    assert.equal(classes(p), c.classes, "body classes");
  });
}

test("hebrew docked modeler sheet can open (specificity vs parked off-screen)", async () => {
  const css = stylesSource();
  assert.match(css, /html\[lang="he"\] body\.dock-rail #md-sheet\.on/);
  assert.match(css, /body\.dock-rail #cabdes\.cb-compact \.cb-panel/);
});

test("ui.js and main.js drive chrome from chromePosture", async () => {
  const ui = moduleSource("js/ui.js");
  const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  // initUI (a piece of ui.js) imports it; moduleSource drops pieces' imports
  const initUi = await readFile(new URL("../js/ui/init_ui.js", import.meta.url), "utf8");
  assert.match(initUi, /from "\.\.\/chrome_posture\.js"/);
  assert.match(ui, /windowChromePosture\(\)/);
  assert.match(main, /from "\.\/chrome_posture\.js"/);
  assert.match(main, /windowChromePosture\(\)/);
  assert.doesNotMatch(ui, /w >= 700 && landscape/);
  assert.doesNotMatch(main, /innerWidth <= 768 \|\| \(window\.innerWidth <= 1024/);
});

/* Big touch screens keep the desktop layout but take touch sizing
   (body.touch-desk); every compact posture and every mouse window does not. */
test("touchDesk: only a touch screen too big for the compact chrome", () => {
  const td = (w, h, touch) => chromePosture(w, h, { touch }).touchDesk;
  assert.equal(td(1366, 1024, true), true, "iPad Pro landscape");
  assert.equal(td(1024, 1366, true), false, "iPad Pro portrait is compact (dock rail)");
  assert.equal(td(1920, 1080, true), true, "touch laptop / Surface");
  assert.equal(td(1366, 1024, false), false, "same size with a mouse");
  assert.equal(td(1440, 900, false), false, "laptop");
  assert.equal(td(1104, 884, true), false, "unfolded Fold is compact, not touchDesk");
  assert.equal(td(1024, 768, true), false, "tablet landscape is compact");
  assert.equal(td(390, 844, true), false, "phone");
  for (const c of CASES) assert.equal(chromePosture(c.w, c.h, { touch: c.touch }).touchDesk && chromePosture(c.w, c.h, { touch: c.touch }).compact, false, c.name + ": never both");
});

/* Only a phone on its side docks Properties as a column: portrait phones and
   small landscape phones keep the bottom sheet, folds and tablets dock-rail. */
test("sideInspector: a phone held landscape, nothing else", () => {
  const side = (w, h, touch = true) => chromePosture(w, h, { touch }).sideInspector;
  assert.equal(side(844, 390), true, "iPhone 14 landscape");
  assert.equal(side(932, 430), true, "iPhone Pro Max landscape");
  assert.equal(side(390, 844), false, "portrait phone");
  assert.equal(side(568, 320), false, "too narrow for a column beside the plan");
  assert.equal(side(1024, 768), false, "tablet landscape is dock-rail");
  assert.equal(side(1440, 900, false), false, "desktop");
  for (const c of CASES) {
    const p = chromePosture(c.w, c.h, { touch: c.touch });
    assert.ok(!p.sideInspector || p.sheetDrawers, c.name + ": a side inspector is a sheet-drawers variant");
  }
});
