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
    compact: true, roomy: false, phone: true, classes: "compact-nav sheet-drawers",
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
  const css = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");
  assert.match(css, /html\[lang="he"\] body\.dock-rail #md-sheet\.on/);
  assert.match(css, /body\.dock-rail #cabdes\.cb-compact \.cb-panel/);
});

test("ui.js and main.js drive chrome from chromePosture", async () => {
  const ui = await readFile(new URL("../js/ui.js", import.meta.url), "utf8");
  const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  assert.match(ui, /from "\.\/chrome_posture\.js"/);
  assert.match(ui, /windowChromePosture\(\)/);
  assert.match(main, /from "\.\/chrome_posture\.js"/);
  assert.match(main, /windowChromePosture\(\)/);
  assert.doesNotMatch(ui, /w >= 700 && landscape/);
  assert.doesNotMatch(main, /innerWidth <= 768 \|\| \(window\.innerWidth <= 1024/);
});
