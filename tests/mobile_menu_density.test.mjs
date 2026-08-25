import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

test("mobile shells reserve only one 48px nav and one 44px context row", () => {
  assert.match(css, /--mobile-nav-block:\s*calc\(48px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /--m-ctx-block:\s*44px/);
  assert.match(css, /--cbm-nav:\s*calc\(48px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /--cbm-ctx:\s*44px/);
});

test("fixed mobile destinations are icon-only but keep accessible names", () => {
  assert.match(css, /#mobile-nav button > span,[\s\S]*?#md-nav button > span:not\(\.md-nav-glyph\)[\s\S]*?display:\s*none !important/);
  assert.match(css, /#cabdes \.cb-m-nav button span\s*\{\s*display:\s*none/);
  assert.match(planner, /b\.setAttribute\("aria-label", labelNode\.textContent\.trim\(\)\)/);
  assert.match(modeler, /b\.setAttribute\("aria-label", navLabel\)/);
  assert.match(cabinet, /aria-label="' \+ T\(n\.label\)/);
});

test("planner icon menus use 48px wrapping pads instead of 66px cards", () => {
  assert.match(planner, /grid\.className = "m-grid m-icon-grid"/);
  assert.match(planner, /m-grid m-grid-3 m-icon-grid/);
  assert.match(planner, /m-grid m-grid-4 m-icon-grid/);
  assert.match(css, /\.m-icon-grid \.m-grid-btn[\s\S]*?width:\s*48px;[\s\S]*?height:\s*48px/);
  assert.match(css, /\.m-icon-grid \.m-grid-btn span\s*\{\s*display:\s*none/);
});

test("modeler keeps CAD command names but compacts view and document actions", () => {
  assert.match(modeler, /m-grid-3 m-icon-grid/);
  assert.match(modeler, /m-grid-5 m-icon-grid/);
  assert.match(modeler, /ph-selection-all/);
  assert.match(modeler, /ph-line-segment/);
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

test("Planner Add uses icon tabs and a dense accessible category grid", () => {
  assert.match(html, /data-left-tab="library"[\s\S]*?ph-books[\s\S]*?data-i18n="left_tab_library"/);
  assert.match(html, /data-left-tab="structure"[\s\S]*?ph-building-office/);
  assert.match(html, /data-left-tab="tree"[\s\S]*?ph-tree-structure/);
  assert.match(main, /furn-grid\$\{navPath\.length < 2 \? " furn-grid-nav"/);
  assert.match(main, /role="button" tabindex="0" aria-label="\$\{label\}"/);
  assert.match(main, /e\.key !== "Enter" && e\.key !== " "/);
  assert.match(css, /\.furn-grid-nav[\s\S]*?minmax\(44px, 1fr\)/);
  assert.match(css, /\.furn-grid-nav \.furn-nav > span\s*\{\s*display:\s*none/);
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
  assert.match(css, /--mobile-glass:\s*color-mix\(in srgb, var\(--bg-panel\) 52%, transparent\)/);
  assert.match(css, /#cabdes\.cb-compact \.cb-panel[\s\S]*?background:\s*var\(--mobile-glass\)[\s\S]*?backdrop-filter:\s*blur\(6px\) saturate\(1\.08\)/);
  assert.match(css, /--mobile-glass-control:\s*color-mix\(in srgb, var\(--input-bg\) 50%, var\(--bg-panel\) 50%\)/);
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

test("all three mobile editors use discrete content-sized bottom pages", () => {
  assert.match(planner, /mountPagedMenu\(active/);
  assert.match(planner, /mountPagedMenu\(sheetBody\)/);
  assert.match(planner, /mountPagedMenu\(grid\)/);
  assert.match(modeler, /mountPagedMenu\(pageHost/);
  assert.match(cabinet, /mountPagedMenu\(pageHost/);
  assert.match(pages, /mobile-page-dot/);
  assert.match(pages, /touchend/);
  assert.match(pages, /pages\.forEach[\s\S]*?page\.classList\.toggle\("on"/);
  assert.match(css, /Content-sized bottom menus/);
  assert.match(css, /--mobile-sheet-cap:\s*min\(/);
  assert.match(css, /body\.compact-nav\.sheet-drawers #right-inspector,[\s\S]*?top:\s*auto;[\s\S]*?height:\s*fit-content;[\s\S]*?max-height:\s*var\(--mobile-sheet-cap\)/);
  assert.match(css, /body\.compact-nav #m-sheet,[\s\S]*?height:\s*fit-content !important;[\s\S]*?max-height:\s*var\(--mobile-sheet-cap\)/);
  assert.match(css, /\.mobile-menu-page\.on[\s\S]*?display:\s*flex/);
});

test("compact inspectors keep 44px inputs but remove desktop whitespace", () => {
  assert.match(css, /#right-inspector input:not[\s\S]*?min-height:\s*44px/);
  assert.match(css, /#right-inspector \.con-block,[\s\S]*?padding:\s*7px/);
  assert.match(css, /#right-inspector \.con-add[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /#openProps > \[data-i18n="cm"\][\s\S]*?display:\s*none/);
});
