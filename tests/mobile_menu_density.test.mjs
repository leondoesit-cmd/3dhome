import { readI18nSource } from "./helpers/i18n_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripComments } from "./source.mjs";

const css = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");
const planner = await readFile(new URL("../js/mobile_shell.js", import.meta.url), "utf8");
const modeler = await readFile(new URL("../js/modeler_mobile.js", import.meta.url), "utf8");
const modelerCore = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
const cabinet = await readFile(new URL("../js/ui_cabinet_mobile.js", import.meta.url), "utf8");
const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
const props = await readFile(new URL("../js/ui_props.js", import.meta.url), "utf8");
const cadHud = await readFile(new URL("../js/cad_hud.js", import.meta.url), "utf8");
const pages = await readFile(new URL("../js/mobile_pages.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const i18n = await readI18nSource();
const interaction = await readFile(new URL("../js/interaction.js", import.meta.url), "utf8");
const openingCommand = await readFile(new URL("../js/commands/opening_place.js", import.meta.url), "utf8");
const chrome = await readFile(new URL("../js/planner_chrome.js", import.meta.url), "utf8");
const ui = await readFile(new URL("../js/ui.js", import.meta.url), "utf8");
const view3d = await readFile(new URL("../js/view3d.js", import.meta.url), "utf8");
const uiRooms = await readFile(new URL("../js/ui_rooms.js", import.meta.url), "utf8");

test("mobile shells reserve only one 48px nav and one 44px context row", () => {
  assert.match(css, /--mobile-nav-block:\s*calc\(48px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /--m-ctx-block:\s*44px/);
  assert.match(css, /--cbm-nav:\s*calc\(48px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /--cbm-ctx:\s*44px/);
});

test("fixed Planner destinations keep visible labels without expanding the Model Editor", () => {
  assert.match(css, /#mobile-nav button > span\s*\{[\s\S]*?display:\s*block/);
  assert.doesNotMatch(css, /#mobile-nav button > span,[\s\S]{0,180}?display:\s*none !important/);
  assert.match(css, /#md-nav button > span:not\(\.md-nav-glyph\),[\s\S]*?display:\s*none !important/);
  assert.match(css, /#cabdes \.cb-m-nav button span\s*\{\s*display:\s*none/);
  assert.match(planner, /b\.setAttribute\("aria-label", labelNode\.textContent\.trim\(\)\)/);
  assert.match(modeler, /b\.setAttribute\("aria-label", navLabel\)/);
  assert.match(cabinet, /aria-label="' \+ T\(n\.label\)/);
});

test("Planner icon menus use compact labelled task cards", () => {
  assert.match(planner, /grid\.className = "m-grid m-icon-grid"/);
  assert.match(planner, /m-grid m-grid-3 m-icon-grid/);
  assert.match(planner, /m-grid m-grid-4 m-icon-grid/);
  assert.match(css, /#m-sheet \.m-icon-grid \.m-grid-btn[\s\S]*?min-height:\s*62px/);
  assert.match(css, /#m-sheet \.m-icon-grid \.m-grid-btn span\s*\{[\s\S]*?display:\s*-webkit-box/);
});

test("modeler keeps CAD command names but compacts view and document actions", () => {
  assert.match(modeler, /m-grid-3 m-icon-grid/);
  assert.match(modeler, /m-grid-5 m-icon-grid/);
  assert.match(modeler, /ph-selection-all/);
  assert.match(modeler, /ph-line-segment/);
  assert.match(modeler, /icon\("normalTo"\), t\("normalTo"\)/);
  assert.match(modeler, /api\.runChrome\("normalTo"\)/);
  assert.doesNotMatch(modeler, /api\.setSketchNormalTo\(!st\.sketchNormalTo\)/);
  assert.match(css, /\.md-commandmanager\.md-borrowed \.md-command\s*\{[\s\S]*?min-height:\s*44px/);
  assert.doesNotMatch(css, /\.md-commandmanager\.md-borrowed \.md-command span\s*\{\s*display:\s*none/);
});

test("unfolded Model Editor tree tabs become reachable icon controls", () => {
  assert.match(modelerCore, /data-tab="' \+ id \+ '" aria-label="' \+ \(title \|\| label\)/);
  assert.match(css, /body\.dock-rail #modeler \.md-left:not\(\.md-borrowed\) \.md-strip > button[\s\S]*?min-height:\s*44px/);
  assert.match(css, /body\.dock-rail #modeler \.md-left:not\(\.md-borrowed\) \.md-strip > button > span\s*\{\s*display:\s*none/);
});

test("cabinet view, tools and extras share the compact icon grid", () => {
  assert.match(cabinet, /cbm-grid cbm-icon-grid/);
  assert.match(cabinet, /pad\.className = "cbm-view-pad cbm-icon-grid"/);
  assert.match(cabinet, /\["front", "back", "left", "right", "top"\]/);
  assert.match(cabinet, /acts\.className = "cbm-grid cbm-icon-grid"/);
  assert.match(cabinet, /class="cbm-glyph" aria-hidden="true"/);
  assert.match(css, /#cabdes \.cbm-icon-grid \.cbm-grid-btn[\s\S]*?width:\s*48px;[\s\S]*?height:\s*48px/);
});

test("sheet headers and phone panels no longer spend space on a separate grip", () => {
  assert.match(css, /\.m-sheet-grip\s*\{\s*display:\s*none/);
  assert.match(css, /\.m-sheet-head\s*\{[\s\S]*?height:\s*44px/);
  assert.match(css, /#cabdes \.cbm-grip\s*\{\s*display:\s*none/);
  assert.match(css, /#cabdes \.cbm-head\s*\{[\s\S]*?height:\s*44px/);
  assert.match(css, /body\.sheet-drawers #left-sidebar,[\s\S]*?height:\s*46dvh/);
});

test("Planner Add keeps visible tab and category names", () => {
  assert.match(html, /data-left-tab="library"[\s\S]*?ph-books[\s\S]*?data-i18n="left_tab_library"/);
  assert.match(html, /data-left-tab="structure"[\s\S]*?ph-building-office/);
  assert.match(html, /data-left-tab="tree"[\s\S]*?ph-tree-structure/);
  assert.match(main, /furn-grid\$\{navPath\.length < 2 \? " furn-grid-nav"/);
  assert.match(main, /role="button" tabindex="0" aria-label="\$\{label\}"/);
  assert.match(main, /e\.key !== "Enter" && e\.key !== " "/);
  assert.match(css, /body\.compact-nav \.left-tabs button > span\s*\{[\s\S]*?display:\s*block/);
  assert.match(css, /\.furn-grid-nav[\s\S]*?minmax\(76px, 1fr\)/);
  assert.match(css, /\.furn-grid-nav \.furn-nav > span\s*\{[\s\S]*?display:\s*-webkit-box/);
});

test("selection identity moves to the top row and wall Properties keeps named icon tabs", () => {
  assert.match(props, /props\.dataset\.wallTab = name/);
  assert.match(html, /data-wtab="dims"[^>]*data-i18n-aria="wtab_dims"/);
  assert.match(html, /id="w_lockQuick"[^>]*data-i18n-aria="cw_lockOn"/);
  assert.match(css, /body\.compact-nav #right-inspector > \.panel-section > h3\s*\{\s*display:\s*none/);
  assert.match(css, /#wallProps\[data-wall-tab="dims"\] \.wi-stats\s*\{\s*display:\s*none/);
  assert.match(css, /#wallProps \.wi-tabs > button > span:not\(\.wi-tab-badge\)\s*\{\s*display:\s*none/);
  assert.match(css, /#wallProps \.wi-tabs > button[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.wall-size-block > \.con-head,[\s\S]*?\.wi-lock\s*\{\s*display:\s*none/);
  assert.match(html, /class="wi-identity">\s*<span class="wi-phase" id="w_phasePill"><\/span>\s*<span class="wi-id" id="selname">/);
  assert.match(html, /id="m-top-selection"[\s\S]*?id="m-top-selection-phase"[\s\S]*?id="m-top-selection-name"/);
  assert.match(planner, /function syncTopSelection\(\)[\s\S]*?active\.querySelector\('\[id\^="selname"\]'\)/);
  assert.match(css, /body\.compact-nav #m-top-selection:not\(\[hidden\]\)[\s\S]*?flex-direction:\s*column/);
  assert.match(css, /body\.compact-nav \.m-top-selection-name[\s\S]*?font-size:\s*clamp\(15px, 4\.5vw, 19px\)/);
  assert.match(css, /body\.compact-nav #wallProps \.wi-identity\s*\{\s*display:\s*none/);
});

test("compact menus use a translucent glass layer with stronger controls", () => {
  assert.match(css, /--mobile-glass:\s*color-mix\(in srgb, var\(--bg-panel\) 88%, transparent\)/);
  assert.match(css, /#cabdes\.cb-compact \.cb-panel[\s\S]*?background:\s*var\(--mobile-glass\)[\s\S]*?backdrop-filter:\s*blur\(6px\) saturate\(1\.08\)/);
  assert.match(css, /--mobile-glass-control:\s*color-mix\(in srgb, var\(--input-bg\) 82%, var\(--bg-panel\) 18%\)/);
  assert.match(css, /#modeler #md-sheet input[\s\S]*?background:\s*var\(--mobile-glass-control\)/);
  assert.match(css, /#right-inspector > \.cost-section,[\s\S]*?#right-inspector > \.site-section[\s\S]*?display:\s*none !important/);
});

test("mobile selection card names the object and adds a second Properties entry point", () => {
  assert.match(cadHud, /cad-selection-props/);
  assert.match(cadHud, /selectionName = t\("wallId", \{ id: S\.sel\.ref\.id \}\)/);
  assert.match(cadHud, /selectionName = S\.sel\.ref\.name \|\| flabel\(S\.sel\.ref\.type\)/);
  assert.match(cadHud, /#mobile-nav \[data-mnav="props"\]/);
  assert.match(cadHud, /addEventListener\("planner-selection", updateCadHud\)/);
  assert.match(css, /#cad-status \.cad-main\.is-selection[\s\S]*?flex-direction:\s*column/);
  assert.match(css, /#cad-status \.cad-selection-props:not\(\[hidden\]\)[\s\S]*?min-width:\s*44px/);
});

test("long forms use labelled content-sized pages while browse sheets scroll", () => {
  assert.match(planner, /mountPagedMenu\(active/);
  assert.doesNotMatch(planner, /mountPagedMenu\(sheetBody\)/);
  assert.doesNotMatch(planner, /mountPagedMenu\(grid\)/);
  assert.match(modeler, /mountPagedMenu\(pageHost/);
  assert.match(cabinet, /mountPagedMenu\(pageHost/);
  assert.match(pages, /function pageLabel\(/);
  assert.match(pages, /mobile-page-tab/);
  assert.match(pages, /touchend/);
  assert.match(pages, /pages\.forEach[\s\S]*?page\.classList\.toggle\("on"/);
  // (the section comment this used to match is prose; the cap and the two
  // fit-content rules below are the rule itself)
  assert.match(css, /body\.compact-nav\.sheet-drawers #right-inspector[\s\S]*?top:\s*auto;[\s\S]*?height:\s*fit-content;[\s\S]*?max-height:\s*var\(--mobile-sheet-cap\)/);
  assert.match(css, /body\.compact-nav #m-sheet,[\s\S]*?height:\s*fit-content !important;[\s\S]*?max-height:\s*var\(--mobile-sheet-cap\)/);
  assert.match(css, /\.mobile-menu-page\.on[\s\S]*?display:\s*flex/);
});

test("compact inspectors keep 44px inputs but remove desktop whitespace", () => {
  assert.match(css, /#right-inspector input:not[\s\S]*?min-height:\s*44px/);
  assert.match(css, /#right-inspector \.con-block,[\s\S]*?padding:\s*7px/);
  assert.match(css, /#right-inspector \.con-add[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /#openProps > \[data-i18n="cm"\][\s\S]*?display:\s*none/);
});

test("mobile destinations switch above the backdrop and cannot keep a stale drawer state", () => {
  assert.match(css, /body\.compact-nav #mobile-nav[\s\S]*?z-index:\s*64/);
  assert.match(css, /#m-sheet-backdrop[\s\S]*?z-index:\s*61/);
  assert.match(planner, /if \(openSheet === "add" \|\| openSheet === "props"\) closeSheet\(\)/);
  assert.match(planner, /m_props_empty/);
});

test("mobile More promotes guidance and groups project work before collapsed extras", () => {
  assert.match(planner, /className = "m-guide-card"/);
  assert.match(planner, /run\("plannerTutorial"\)/);
  assert.match(planner, /appendMenuGroup\(t\("m_more_project"\)/);
  assert.match(planner, /exclude: \["reset", "save"\]/);
  assert.match(planner, /appendMenuGroup\(t\("m_more_extras"\)[\s\S]*?collapsed: true/);
  assert.match(planner, /exclude: \["rc", "zombies", "lava", "openModeler", "uikitCustomize", "friends", "agent"\]/);
  assert.doesNotMatch(planner, /"shortcutsBtn"/);
  assert.match(css, /body\.compact-nav #openModelerTop\.legacy-chrome\s*\{\s*display:\s*none !important/);
  assert.match(css, /body\.compact-nav #topbar \.tb-end\s*\{\s*display:\s*none !important/);
});

test("dismissed Planner sheets leave focus navigation and the accessibility tree", () => {
  assert.match(planner, /sheet\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(planner, /sheet\.inert = true/);
  assert.match(planner, /sheet\.setAttribute\("aria-hidden", "false"\)/);
  assert.match(planner, /sheet\.inert = false/);
  assert.match(planner, /sheetReturnFocus\.focus\(\{ preventScroll: true \}\)/);
});

test("mobile room presets preserve input focus and collapse for placement", () => {
  assert.match(uiRooms, /roomPaletteToggle/);
  assert.match(uiRooms, /event\.detail && event\.detail\.reason === "size"/);
  assert.match(uiRooms, /syncRoomSizeControls\(\)/);
  assert.match(uiRooms, /planner-room-created[\s\S]*?compact-nav[\s\S]*?auto-collapsed/);
  assert.match(interaction, /planner-room-stamp", \{ detail: \{ reason: "size" \} \}/);
  assert.match(css, /#plan-room-palette\.auto-collapsed[\s\S]*?width:\s*42px/);
  assert.match(i18n, /rp_collapse:\s*"Collapse room options"/);
});

test("phone planner chrome keeps readable nav labels and hides the 2D view cube", () => {
  assert.match(css, /body\.compact-nav #mobile-nav button > span[\s\S]*?font-size:\s*10px/);
  assert.match(css, /@media \(max-width:\s*360px\)[\s\S]*?body\.compact-nav #mobile-nav button > span\s*\{\s*font-size:\s*9px/);
  assert.match(css, /body\.compact-nav \.plan-gizmo\s*\{[\s\S]*?display:\s*none/);
  assert.match(planner, /m-elevation-grid/);
  ["front", "right", "back", "left"].forEach((axis) => {
    assert.match(planner, new RegExp('\\["' + axis + '",'));
  });
  assert.match(view3d, /compact \? 1\.05 : 0\.95/);
  assert.match(view3d, /clamp\(ceilingHeight\(\) \* 0\.78, 180, 230\)/);
  assert.match(view3d, /framedInterior = compact/);
  assert.match(view3d, /\(!!S\.edit3D \|\| framedInterior\)/);
  assert.match(view3d, /if \(changed\) needsRender = true/);
  assert.match(view3d, /compact && effective === "performance"\) effective = "balanced"/);
});

test("destructive reset confirms and beginner coaching follows completed milestones", () => {
  assert.match(ui, /act === "reset"[\s\S]*?window\.confirm\(t\("reset_confirm"\)\)/);
  assert.match(interaction, /planner-room-created/);
  assert.match(openingCommand, /planner-opening-created/);
  assert.match(ui, /planner-item-created/);
  assert.match(chrome, /if \(intention && intention !== "explore"\)[\s\S]*?openPlanningGuide\(\)/);
  assert.match(planner, /if \(S\.workspace\?\.guidance\?\.enabled\) return/);
  ["mcoach_room_done", "mcoach_opening_done", "mcoach_item_done", "mcoach_preview"].forEach((key) => {
    assert.match(planner, new RegExp(key));
  });
});

test("Just explore keeps its promise of an unguided blank canvas", () => {
  assert.match(chrome, /guidedStart = !!intention && intention !== "explore"/);
  assert.match(chrome, /setTool\(intention === "explore" \? "select" : "rect"\)/);
});

test("dismissing the coach ends it for good and only the first room arms it", () => {
  // Marking the flow done must be reachable from the X, not only from
  // finishing all five stages, or a dismissal replays every milestone forever.
  assert.match(planner, /function markFlowDone\(\)[\s\S]*?localStorage\.setItem\(MOBILE_FLOW_KEY, "1"\)/);
  assert.match(planner, /function dismissCoach\(\)\s*\{\s*markFlowDone\(\);\s*hideCoach\(\);\s*\}/);
  assert.match(planner, /close\.addEventListener\("click", dismissCoach\)/);
  assert.match(planner, /function finishOnboarding\(\)\s*\{\s*markFlowDone\(\);/);
  // A second room drawn mid-flow must not reset the user to step one.
  assert.match(
    planner,
    /planner-room-created[\s\S]*?if \(onboardingActive && onboardingStage !== "room"\) return;/,
  );
});

test("object snapping stays reachable while a phone draw tool is active", () => {
  // #cadToggles is hidden under .compact-nav, so the mid-draw context row is
  // the only surface that can turn OSNAP off.
  assert.match(
    planner,
    /if \(drawing\(\)\)[\s\S]*?aidChip\("osnap", "cad_osnap"\)[\s\S]*?aidChip\("ortho"[\s\S]*?aidChip\("gsnap"/,
  );
  // Six controls in one non-scrolling row: chips give back padding, never the
  // 44px thumb target.
  const narrow = css.match(/@media \(max-width: 344px\) \{[\s\S]*?\n\}\n/);
  assert.ok(narrow, "expected a narrow-phone context-row block");
  assert.match(narrow[0], /#m-ctx \.mctx-chip,[\s\S]*?min-width:\s*38px/);
  // Padding is the slack; the 44px thumb target is not.
  assert.doesNotMatch(narrow[0], /min-height/);
  assert.match(css, /#m-ctx \.mctx-chip,\n#md-ctx \.mctx-chip \{[\s\S]*?min-height:\s*44px/);
});

test("touch instructions use explicit translation variants", () => {
  assert.match(i18n, /export function tTouch\(/);
  assert.match(i18n, /hint_tool_rect_touch:\s*"Tap the first corner/);
  assert.match(chrome, /tTouch\("hint_tool_rect"\)/);
  assert.match(cadHud, /tTouch\("hint_tool_slabvoid"\)/);
  assert.match(cadHud, /S\.placeType[\s\S]*?tTouch\("hint_tool_place"\)/);
  assert.match(cadHud, /S\.tool === "door"[\s\S]*?tTouch\("hint_tool_opening"\)/);
  assert.match(cadHud, /planner-place", updateCadHud/);
});

test("furniture placement replaces stale selection actions with Cancel", () => {
  assert.match(planner, /function cancelPlacement\(\)[\s\S]*?S\.placeType = null;[\s\S]*?planner-place/);
  /* Read as code: the pattern used to require the block comment that happens to
     open this function, so reflowing that comment broke a passing test. */
  assert.match(stripComments(planner), /function ctxActions\(\)[\s\S]*?if \(S\.placeType\)[\s\S]*?t\("cancel"\)/);
  assert.match(planner, /planner-place[\s\S]*?sync\(true\)/);
  assert.match(planner, /S\.placeType \|\| ""/);
});

test("dynamic mobile close labels and coach copy follow language changes", () => {
  assert.match(planner, /var closeLabel = t\("close"\)/);
  assert.match(planner, /sheetClose\.setAttribute\("aria-label", closeLabel\)/);
  assert.match(planner, /coachClose\.setAttribute\("aria-label", closeLabel\)/);
  assert.match(planner, /coachCopyKey[\s\S]*?coachCopy\.textContent = t\(coachCopyKey\)/);
});
