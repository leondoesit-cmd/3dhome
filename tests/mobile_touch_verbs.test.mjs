import { stylesSource } from "./helpers/styles_source.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import { readI18nSource } from "./helpers/i18n_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (name) => readFile(new URL("../" + name, import.meta.url), "utf8");
const [shell, interaction, ui, i18n, pick, primitives, html, css] = await Promise.all([
  read("js/mobile_shell.js"),
  moduleSource("js/interaction.js"),
  moduleSource("js/ui.js"),
  readI18nSource(),
  read("js/ui_floorpick.js"),
  read("js/primitives.js"),
  read("index.html"),
  stylesSource(),
]);

/* The i18n table is one object literal per language, so the block between
   `he: {` and `en: {` is Hebrew and everything after `en: {` is English.
   Checking both halves is what catches the failure mode this file exists for:
   a new mobile control shipped with an English label and a raw key in Hebrew. */
function langBlocks() {
  const he = i18n.indexOf("\n  he: {");
  const en = i18n.indexOf("\n  en: {");
  assert.ok(he >= 0 && en > he, "i18n still has a he block followed by an en block");
  return { he: i18n.slice(he, en), en: i18n.slice(en) };
}

test("selection verbs follow the KIND, so no row offers an action that kind cannot do", () => {
  // dupSel() implements item and items only; every other kind used to get a
  // Copy button that did nothing at all when pressed.
  assert.match(interaction, /export function dupSel\(\)\s*\{\s*if \(S\.sel && S\.sel\.kind === "item"\)/);
  assert.match(shell, /function selActions\(\)/);
  assert.match(shell, /if \(kind === "item"\)[\s\S]*?rotSel90[\s\S]*?finishBtn[\s\S]*?dupBtn/);
  assert.match(shell, /if \(kind === "items"\)[\s\S]*?rotSel90[\s\S]*?dupBtn/);
  assert.match(shell, /if \(kind === "wall"\)[\s\S]*?addWallDoor[\s\S]*?reverseWallLayers/);
  assert.match(shell, /if \(kind === "node"\)[\s\S]*?ndSquare/);
  assert.match(shell, /if \(kind === "marker"\)[\s\S]*?mkPlace/);
  assert.match(shell, /if \(kind === "room"\)[\s\S]*?roomFloor/);
  // autoArrange tidies EVERY room, so it must not sit on one room's row.
  assert.doesNotMatch(shell, /run\("autoArrange"\)/);
  // dupBtn is declared once and only reached from the two kinds that can copy
  // (a single piece and a multi-selection).
  const dupUses = shell.match(/dupBtn/g) || [];
  assert.equal(dupUses.length, 3, "Copy is declared once and used by item and items only");
});

test("the context row never holds more than four verbs; the rest go behind More", () => {
  assert.match(shell, /export var CTX_MAX = 4;/);
  // the labelled Round-6 toolbar shares its row with tools/library/ask
  assert.match(shell, /export var CTX_MAX_LABELLED = 3;/);
  assert.match(shell, /max = max \|\| \(proCompact\(\) && !document\.body\.classList\.contains\("dock-rail"\) \? CTX_MAX_LABELLED : CTX_MAX\)/);
  assert.match(shell, /function selActions\(\) \{\s*return capActions\(selActionList\(\), moreBtn\);/);
  // 3D gets the same cap (its navigation buttons plus Frame and Photo)
  assert.match(shell, /viewMode\(\) === "3d"[\s\S]*?capActions\(navActions\(\)/);
  assert.match(shell, /key === "overflow"\) buildOverflowSheet\(\)/);
});

test("Finish opens the material library on rooms, walls and pieces", () => {
  assert.match(shell, /finishBtn = \{[^}]*run\("openTextureGallery"\)/);
  for (const kind of ["item", "wall", "room"])
    assert.match(shell, new RegExp('if \\(kind === "' + kind + '"\\)[\\s\\S]*?finishBtn'), kind);
});

test("a hinged door offers Flip swing and a sliding one does not", () => {
  assert.match(shell, /op\.type === "door" && !op\.isSliding && !op\.isPocket/);
  assert.match(shell, /hinged[\s\S]*?flipSwing[\s\S]*?:\s*\[propsBtn, delBtn\]/);
  // The action itself refuses the kinds that have no swing rather than writing
  // a swingDir onto a pocket door nothing will ever read.
  assert.match(ui, /act === "flipSwing"[\s\S]*?swOp\.type !== "door" \|\| swOp\.isSliding \|\| swOp\.isPocket[\s\S]*?f_swingNA/);
  assert.match(ui, /SWING_CYCLE = \["R_IN", "L_IN", "L_OUT", "R_OUT"\]/);
});

test("the quarter turn ignores the 15/45/90 step control the phone cannot see", () => {
  assert.match(ui, /act === "rotSel90"/);
  assert.match(ui, /turnItem\(it, \(\(\(it\.rot \|\| 0\) \+ 90\) % 360 \+ 360\) % 360\)/);
  const actions = sourceFunctionText(ui, "runAction");
  assert.doesNotMatch(
    actions.slice(actions.indexOf('act === "rotSel90"'), actions.indexOf('act === "flipSwing"')),
    /rotStep\(\)/,
    "the one-tap rotate must not obey a step the user cannot see while pressing it",
  );
  // Locked pieces are skipped rather than silently turned.
  assert.match(ui, /rotPicks\.filter\(function \(it\) \{ return it && !it\.locked; \}\)/);
});

test("View is a switcher on tap and a menu on hold", () => {
  assert.match(shell, /VIEW_HOLD_MS = 420/);
  assert.match(shell, /viewHold = setTimeout\([\s\S]*?viewHeld = true;[\s\S]*?showSheet\("view"\)/);
  assert.match(shell, /if \(viewHeld\) \{\s*viewHeld = false;\s*return;/);
  assert.match(shell, /setView\(viewMode\(\) === "3d" \? "plan" : "3d"\)/);
  // A tap that switches the pane must not leave another sheet covering it.
  assert.match(shell, /if \(openSheet\) closeSheet\(\);\s*toggleView\(\)/);
  // The hold is announced once, because an unannounced gesture is no feature.
  assert.match(shell, /showCoach\("m_view_hold"/);
});

test("two fingers undo and three redo through one detector", () => {
  assert.match(interaction, /if \(twoTap\) \{[\s\S]*?twoTap\.n = Math\.max\(twoTap\.n, ids\.length\);\s*return;/);
  assert.match(interaction, /var fingers = twoTap\.n;[\s\S]*?if \(fingers >= 3\) redo\(\);\s*else undo\(\);/);
});

test("double-click acts on what it landed on, not on the standing selection", () => {
  const block = sourceFunctionText(interaction, 'initInteraction').slice(sourceFunctionText(interaction, 'initInteraction').indexOf('function doubleClick('));
  assert.match(block, /var op = hitOpening\(px, pz\);[\s\S]*?flipSwing/);
  assert.match(block, /var it = hitItem\(px, pz\);[\s\S]*?rotSel90/);
  assert.match(block, /if \(S\.tool && S\.tool !== "select"\) return;/);
  assert.match(block, /role === "viewer"/, "a read-only viewer cannot edit by double-clicking");
  assert.match(block, /isElevation\(\)/, "the elevation pane is a side view, not a plan");
});

test("closing your own loop gets the touch reach that picking already had", () => {
  // Snap radii stay mouse-sized on purpose (they decide what the design
  // becomes). The one exception is documented and scoped to the close snap.
  assert.match(interaction, /var REACH = \{ close: thr \* PICK_SLOP \};/);
  assert.match(interaction, /if \(d > \(REACH\[kind\] \|\| thr\)\) return;/);
  assert.match(interaction, /PICK_SLOP = pointerType === "touch" \? 1\.9 : 1;/);
});

test("the tool finder gets a door in the thumb zone", () => {
  // More → Find a tool opens the tools sheet on its search, the same ranked
  // search of all three editors as the sheet's own field and Ctrl+K
  assert.match(shell, /m_more_find[\s\S]*?setTimeout\(findTool/);
  assert.match(shell, /function findTool\(\) \{[\s\S]*?showSheet\("tools"\)[\s\S]*?\.pro-sheet-search input[\s\S]*?input\.focus\(\)/);
});

test("every new mobile label is translated in both languages", () => {
  const { he, en } = langBlocks();
  [
    "m_a_rot90", "m_a_swing", "m_a_adddoor", "m_a_flipwall", "m_a_square",
    "m_a_place", "m_view_hold", "m_more_find", "m_more_find_desc",
    "f_swingNA", "f_swingNow", "m_a_floor", "floor_pick_title", "floor_custom_dropped",
  ].forEach((key) => {
    assert.match(he, new RegExp("\\n    " + key + ': "'), key + " has Hebrew copy");
    assert.match(en, new RegExp("\\n    " + key + ': "'), key + " has English copy");
  });
  // The swing flash names the direction with the inspector's own option labels.
  ["d_r_in", "d_l_in", "d_r_out", "d_l_out"].forEach((key) => {
    assert.match(he, new RegExp("\\n    " + key + ': "'), key + " is available to f_swingNow");
    assert.match(en, new RegExp("\\n    " + key + ': "'), key + " is available to f_swingNow");
  });
});

test("the floor swatch is painted from the table the 3D floor uses", () => {
  // A separate set of preview images would drift the first time a pattern is
  // retuned, and a swatch that lies is worse than no swatch.
  assert.match(primitives, /export function floorSwatch\(type, size\)/);
  assert.match(primitives, /\(PAINT\[type\] \|\| PAINT\.concrete\)\(x\)/);
  assert.match(primitives, /x\.scale\(px \/ 256, px \/ 256\)/);
  assert.match(pick, /import \{ floorSwatch \} from "\.\/primitives\.js"/);
});

test("the floor picker reads the live select, so a new material needs one edit", () => {
  assert.match(pick, /document\.getElementById\("r_floor"\)/);
  assert.match(pick, /node\.tagName === "OPTGROUP"/);
  // An <option> outside any optgroup is still offered rather than dropped.
  assert.match(pick, /node\.tagName === "OPTION"/);
  assert.match(pick, /class="floor-tile' \+ \(on \? " on" : ""\)/);
  assert.match(pick, /onPick\(hit\.dataset\.floor\)/);
  assert.match(pick, /aria-current="true"/);
  // Labels and material ids both reach innerHTML.
  assert.match(pick, /escapeHTML\(entry\.value\)/);
  assert.match(pick, /escapeHTML\(entry\.label\)/);
});

test("every route to a floor goes through one setter that drops the custom image", () => {
  // view3d's fmatFor prefers an uploaded texture over the material, so a pick
  // made on top of one used to change a value nothing renders.
  assert.match(ui, /function applyRoomFloor\(key, type\)/);
  assert.match(ui, /var hadTex = !!meta\.floorTex;[\s\S]*?if \(hadTex\) delete meta\.floorTex;/);
  assert.match(ui, /if \(hadTex\) flash\(t\("floor_custom_dropped"\)\)/);
  // A no-op pick must not leave an undo entry that swallows the next Ctrl+Z.
  assert.match(ui, /if \(meta\.floor === type && !hadTex\) return false;/);
  // The select, the action and the ctx button all land on it.
  assert.match(ui, /getElementById\("r_floor"\)\.addEventListener\("change"[\s\S]{0,160}applyRoomFloor\(S\.sel\.ref, this\.value\)/);
  assert.match(ui, /act === "roomFloor"[\s\S]*?openFloorPicker\(roomFloor\(rfKey\)[\s\S]*?applyRoomFloor\(rfKey, type\)/);
});

test("the plan's biggest target is double-tapped last", () => {
  const block = sourceFunctionText(interaction, 'initInteraction').slice(sourceFunctionText(interaction, 'initInteraction').indexOf('function doubleClick('));
  const opening = block.indexOf("hitOpening");
  const item = block.indexOf("hitItem");
  const room = block.indexOf("hitRoom");
  assert.ok(opening > 0 && item > opening && room > item,
    "a door, then a piece, then the floor they both stand on");
  assert.match(block, /hitRoom\(px, pz\);\s*if \(rk != null/, "room 0 is a real key, not a miss");
});

test("the floor row keeps a real target for the swatch button", () => {
  assert.match(html, /id="r_floor_pick"[\s\S]*?data-i18n-title="floor_pick_title"/);
  assert.match(html, /id="r_floor_pick"[\s\S]*?data-i18n-aria="floor_pick_title"/);
  assert.match(css, /\.r-floor-pick \{[\s\S]*?flex: 0 0 auto;/);
  assert.match(css, /@media \(pointer: coarse\) \{\s*\.r-floor-pick \{ width: 44px; height: 44px; \}/);
  assert.match(css, /#r_floor \{ min-width: 0; \}/, "the select has to give the button its width back");
});
