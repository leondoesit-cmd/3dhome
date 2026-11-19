/* Icons that tell commands apart, and icons that draw something.

   Within one editor's pro ribbon two different commands must not show the
   same picture. "The same picture" is judged as drawn: the default icon
   language (lucide) maps several Phosphor names onto one artwork, so Window
   (ph-frame-corners) and Slab void (ph-selection) both showed a "scan" frame
   until this test. Entries that share a label or a binding are the same
   command and may share an icon.

   And every model-editor command must resolve to a drawing: cadIcon(id) used
   to emit "ph-<id>" for ids with no glyph, which Phosphor does not have —
   an empty box. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRO_CATALOG, PRO_EDITORS } from "../js/pro_catalog.js";
import { CAD_ICONS, ICON_ALIASES, cadIcon } from "../js/modeler_icons.js";
import lucide from "../js/icon_themes/lucide.js";

const PHOSPHOR = new Set(
  readFileSync(new URL("../vendor/phosphor/style.css", import.meta.url), "utf8")
    .match(/\.ph-[a-z0-9-]+:before/g).map((s) => s.slice(1, -7)),
);
const drawnAs = (name) => (lucide.map[name] ? "lucide:" + lucide.map[name] : "phosphor:" + name);

test("every pro ribbon icon exists in Phosphor", () => {
  const missing = [];
  for (const ed of PRO_EDITORS)
    for (const [, groups] of PRO_CATALOG[ed].tabs)
      for (const [, tools] of groups)
        for (const t of tools) if (!PHOSPHOR.has(t.icon)) missing.push(`${ed}: ${t.label} ${t.icon}`);
  assert.deepEqual(missing, []);
});

test("no two different commands of one editor share a drawn icon", () => {
  const clashes = [];
  for (const ed of PRO_EDITORS) {
    const byArt = new Map();
    for (const [tab, groups] of PRO_CATALOG[ed].tabs)
      for (const [, tools] of groups)
        for (const t of tools) {
          const art = drawnAs(t.icon);
          if (!byArt.has(art)) byArt.set(art, []);
          byArt.get(art).push({ label: t.label.toLowerCase(), bind: t.bind || t.label, text: `${t.label} (${tab})` });
        }
    for (const [art, list] of byArt) {
      // union entries that are the same command: same label or same binding
      const root = list.map((_, i) => i);
      const find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++)
          if (list[i].label === list[j].label || list[i].bind === list[j].bind) root[find(i)] = find(j);
      const commands = new Set(list.map((_, i) => find(i)));
      if (commands.size > 1) clashes.push(`${ed} ${art}: ` + [...new Set(list.map((e) => e.text))].join(" | "));
    }
  }
  assert.deepEqual(clashes, []);
});

test("every model-editor command id draws a glyph through cadIcon", () => {
  const source = readFileSync(new URL("../js/modeler_commands.js", import.meta.url), "utf8");
  const ids = [...source.matchAll(/\{ id:"([a-z0-9]+)", icon:/g)].map((m) => m[1]);
  assert.ok(ids.length > 80, "found the command catalog");
  const empty = ids.filter((id) => {
    let key = id;
    if (!CAD_ICONS[key] && ICON_ALIASES[key]) key = ICON_ALIASES[key];
    if (CAD_ICONS[key]) return false;
    return !PHOSPHOR.has(key.startsWith("ph-") ? key : "ph-" + key);
  });
  assert.deepEqual(empty, []);
});

test("the six standard views have six different pictures", () => {
  const views = ["view_top", "view_bottom", "view_front", "view_back", "view_right", "view_left"];
  const drawn = views.map((v) => cadIcon(v));
  for (const svg of drawn) assert.match(svg, /<svg class="md-cad-icon"/);
  assert.equal(new Set(drawn).size, views.length);
});
