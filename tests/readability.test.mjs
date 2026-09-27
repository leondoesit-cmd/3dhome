/* The smallest text in the Round-6 layout (css/pro_skin.css --fs-floor: 11px
 * on a desktop, 12px on phones and folds). Every font size under 12px in css/
 * is written max(<size>, var(--fs-floor, 0px)), so the classic layout, which
 * sets no floor, keeps its own sizes while the new one lifts them. A bare
 * "font-size: 9px" added later would slip under the floor: these tests say so. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const cssDir = new URL("../css/", import.meta.url);
const sheets = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => [f, readFileSync(new URL(f, cssDir), "utf8")]);

test("no font size under 12px escapes the layout's text floor", () => {
  const bare = [];
  for (const [name, css] of sheets) {
    for (const m of css.matchAll(/font-size\s*:\s*([\d.]+)(px|rem)\b/g)) {
      // the root font is 14px: 0.78rem is 10.9px
      const px = m[2] === "rem" ? Number(m[1]) * 14 : Number(m[1]);
      if (px < 12) bare.push(name + ": " + m[0]);
    }
    // a relative size under 0.85em lands under 12px in most of the chrome's 13-14px text
    for (const m of css.matchAll(/font-size\s*:\s*([\d.]+)em\b/g)) {
      if (Number(m[1]) < 0.85) bare.push(name + ": " + m[0]);
    }
    // the size in a font shorthand: the first bare length after "font:"
    for (const m of css.matchAll(/\bfont\s*:\s*([^;{}"']*)/g)) {
      const size = m[1].match(/(?:^|\s)([\d.]+)px(?=\s*\/|\s)/);
      if (size && Number(size[1]) < 12) bare.push(name + ": font: " + m[1].trim());
    }
  }
  assert.deepEqual(bare, []);
});

test("the floor is set for the desktop and the compact layouts", () => {
  const skin = sheets.find(([n]) => n === "pro_skin.css")[1];
  assert.match(skin, /body\.pro-skin, body\.pro-compact \{[^}]*--fs-floor: 11px;/);
  assert.match(skin, /body\.pro-compact \{ --fs-floor: 12px; \}/);
});

test("quiet text uses the readable faint colour, not the stroke one", () => {
  for (const name of ["pro_skin.css", "pro_ribbon.css"]) {
    const css = sheets.find(([n]) => n === name)[1];
    assert.doesNotMatch(css, /(?<![-\w])color: var\(--pro-faint\)/, name);
  }
});
