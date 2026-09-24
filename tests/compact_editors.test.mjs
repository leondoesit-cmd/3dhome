import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");
const mdMobile = await readFile(new URL("../js/modeler_mobile.js", import.meta.url), "utf8");
const md = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
/* The editor's [he, en] table, split out of js/modeler.js. */
const mdStrings = await readFile(new URL("../js/modeler_strings.js", import.meta.url), "utf8");
const mdTopologyPick = await readFile(new URL("../js/modeler_topology_pick.js", import.meta.url), "utf8");
const editorView = await readFile(new URL("../js/editor_view.js", import.meta.url), "utf8");
const plannerTut = await readFile(new URL("../js/planner_tutorial.js", import.meta.url), "utf8");
const cbMobile = await readFile(new URL("../js/ui_cabinet_mobile.js", import.meta.url), "utf8");
const cbCtx = await readFile(new URL("../js/ui_cabinet_ctx.js", import.meta.url), "utf8");

test("modeler: dock-rail keeps Tree as a column, Commands as a sheet", () => {
  assert.match(css, /body\.dock-rail\.compact-nav #modeler\.md-tree-on \.md-left:not\(\.md-borrowed\)/);
  assert.match(mdMobile, /function dockRail\(/);
  assert.match(mdMobile, /function setTreeDock\(/);
  assert.match(mdMobile, /key === "tree" && dockRail\(\)/);
  assert.match(mdMobile, /borrowPanel\("\.md-commandmanager"\)/);
});

test("modeler: feature form on dock-rail does not cover the preview", () => {
  assert.match(mdMobile, /if \(dockRail\(\)\) \{\s*closeSheet\(\);\s*setTreeDock\(true\);/s);
  assert.match(mdMobile, /else showSheet\("tree"\)/);
});

test("modeler: command search is on the Commands sheet header", () => {
  assert.match(mdMobile, /function setSheetSearch\(/);
  assert.match(mdMobile, /setSheetSearch\(true\)/);
  assert.match(css, /#modeler #md-sheet \.md-sheet-search/);
  // one search per sheet: the header keeps it, the ribbon's own pill is hidden
  // because it sat inside the tab row and pushed the tabs off a phone's edge
  assert.match(css, /#modeler \.md-commandmanager\.md-borrowed \.md-command-search-btn \{\s*display: none;/);
});

test("modeler: compact welcome has Touch CAD, blank part/assembly, and a disclosure", () => {
  assert.match(md, /welcomeContinue/);
  assert.match(md, /welcomeMoreStarts/);
  assert.match(md, /function layoutWelcomeCompact\(/);
  assert.match(md, /md-welcome-extra/);
  assert.match(css, /body\.compact-nav #modeler #mdWelcomeStart/);
  // Touch CAD + Blank part + Blank assembly are primary; shapes and Open editor go in More
  assert.match(md, /if \(id === "blank" \|\| id === "assembly"\) return;/);
});

test("cabinet: W/D/H live on the dock-rail size bar and phone ctx chips", () => {
  assert.match(cbMobile, /function placeSizeChrome\(/);
  assert.match(cbMobile, /function dimChip\(/);
  assert.match(cbMobile, /dimChip\("#cbW", "W"\)/);
  assert.match(css, /#cabdes\.cb-compact \.cb-m-sizebar/);
  assert.match(css, /body\.dock-rail #cabdes\.cb-compact \.cb-m-sizebar \.cb-context-bar/);
});

test("cabinet: Duplicate cabinet is a More action", () => {
  assert.match(cbCtx, /dupCab:/);
  assert.match(cbMobile, /function duplicateCabinet\(/);
  assert.match(cbMobile, /T\("dupCab"\)/);
  assert.match(cbMobile, /executeCommand\(itemDuplicateCommand/);
  assert.match(cbMobile, /sourceId:\s*src\.id/);
});

test("cabinet: Properties tabs stay in the sheet header", () => {
  assert.match(css, /#cabdes\.cb-compact \.cb-right > \.cb-grp \.cb-icons/);
  assert.match(css, /#cabdes\.cb-compact \.cb-right > \.cb-grp \.cb-icons button\[data-act\]/);
});

test("cabinet: View sheet is a 5-way pad with 45° under a disclosure", () => {
  assert.match(cbMobile, /cbm-view-pad/);
  assert.match(cbMobile, /axisBtn\("bottom"\)/);
  assert.match(cbMobile, /cbm-iso/);
  assert.match(cbCtx, /mIsoMore:/);
  assert.doesNotMatch(
    cbMobile,
    /function buildViewSheet\(\) \{\s*sheetBody\.appendChild\(proxyGrid\("#cbAxes button\[data-ax\]"/,
  );
});

/* The borrow architecture's real failure mode: the sheet MOVES the live desktop
   panel rather than copying it, so anything the phone adds while it is a guest
   has to be gone before it goes home. String-matching the source is all these
   tests can do, but these are the invariants a rendered check would assert. */
test("modeler: borrowed panels go home clean", () => {
  // release() restores position AND strips the phone-only drawer state
  assert.match(mdMobile, /borrowed\.parent\.insertBefore\(borrowed\.node, borrowed\.next\)/);
  assert.match(mdMobile, /borrowed\.node\.classList\.remove\("md-borrowed"\)/);
  assert.match(mdMobile, /md-group-open[\s\S]{0,160}classList\.remove\("md-group-open"\)/);
  assert.match(mdMobile, /removeAttribute\("aria-expanded"\)/);
  // teardown and every sheet switch release before doing anything else
  assert.match(mdMobile, /export function teardownModelerMobile\(\) \{\s*release\(\);/);
  assert.match(mdMobile, /function closeSheet\(\)[\s\S]{0,80}release\(\);/);
});

test("modeler: drawer listeners live on the sheet, never on the borrowed ribbon", () => {
  // a handler bound to the ribbon itself would ride home to the desktop layout
  assert.match(mdMobile, /sheet\.addEventListener\("click", function \(e\) \{\s*var head = e\.target\.closest\("\.md-command-group-label"\)/);
  assert.match(mdMobile, /data-cmdgroup="secondary"/);
  /* commandGroup takes the group's i18n KEY, not the words it produces: the
     key is what stays put when the wording is edited or the language changes,
     which is what makes data-mdgroup an identity a saved layout can resolve
     after a release. */
  assert.match(md, /function commandGroup\(key, commands, rank\)/);
  assert.match(md, /data-mdgroup="' \+ key \+/);
  assert.match(css, /\[data-cmdgroup="secondary"\]:not\(\.md-group-open\) > \.md-command-items \{\s*display: none;/);
});

test("modeler: the sheet is the ribbon's width budget", () => {
  // minmax(96px,1fr) sized against max-content and clipped Hole wizard off the end
  assert.match(css, /\.md-command-items \{[\s\S]{0,400}grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  /* Scoped to the ribbon it is about. A bare file-wide search for the track
     expression also fired on unrelated grids that legitimately auto-fill
     (the floor swatch picker), which is a guard failing on the wrong thing. */
  (css.match(/[^}]*\.md-command-items[^{]*\{[^}]*\}/g) || []).forEach((rule) =>
    assert.doesNotMatch(rule, /auto-fill/, "the ribbon is sized by its sheet, not by its content"));
  assert.match(css, /\.md-commandmanager\.md-borrowed \{[\s\S]{0,400}min-width: 0;/);
});

test("modeler: icon-only contextual actions retain accessible names", () => {
  // Visible captions are intentionally retired, but every generated action is
  // still named for assistive technology and the DOM-accessible tool surface.
  assert.match(mdMobile, /b\.setAttribute\("aria-label", spec\.label\)/);
  assert.match(cbMobile, /b\.setAttribute\("aria-label", spec\.label\)/);
  // The modeler's contextual row no longer builds its own Undo/Redo pair: the
  // compact head keeps the editor's real #mdUndo/#mdRedo on screen instead, so
  // there is exactly one of each and one history to name.
  assert.doesNotMatch(mdMobile, /className = "mctx-undo"/);
  assert.match(css, /body\.compact-nav #modeler \.md-head-actions > button:not\(#mdClose\):not\(#mdUndo\):not\(#mdRedo\),/);
  assert.match(cbMobile.length ? css : css, /#m-ctx \.mctx-btn\.mctx-icon-only/);
  assert.match(css, /#md-ctx\.mctx-empty/);
});

test("modeler: the View nav slot reads the live document mode", () => {
  // querySelector("span") returned the inserted glyph and froze the label
  assert.match(mdMobile, /querySelector\("span:not\(\.md-nav-glyph\)"\)/);
});

test("modeler: posture resync is coalesced, not once per resize event", () => {
  assert.match(md, /function queueModelerChrome\(/);
  assert.match(md, /requestAnimationFrame\(function \(\) \{\s*chromeFrame = 0;\s*syncModelerChrome\(\);/);
  assert.match(md, /syncModelerChrome\(\);\s*syncHint\(\);/);
  assert.match(md, /addEventListener\("resize", queueModelerChrome\)/);
  assert.doesNotMatch(md, /addEventListener\("resize", syncModelerChrome\)/);
});

test("modeler: touch selection has modifier-free parity", () => {
  assert.match(md, /event\.ctrlKey \|\| event\.metaKey \|\| E\.mobileAddSelection/);
  assert.match(md, /function showSelectThrough\(/);
  assert.match(md, /longPress: showSelectThrough/);
  assert.match(mdTopologyPick, /if \(prefer === "edge"\) return touch \? 14 : 8/);
  assert.match(mdTopologyPick, /return touch \? 10 : 5/);
  assert.match(md, /worldPerPixelAtDistance\(hit\.distance\)/);
  assert.match(md, /pointerType === "touch" \? 14 : 7/);
  assert.match(editorView, /e\.button === 0 \|\| e\.pointerType === "touch"/);
  assert.match(mdMobile, /touchAddSelection/);
  assert.match(mdMobile, /api\.clearSelection/);
  assert.match(mdMobile, /api\.setSelFilter\(filters\[\(at \+ 1\)/);
});

test("modeler: selected geometry keeps CAD verbs separate from selection management", () => {
  assert.match(mdMobile, /function renderSelectionBar\(/);
  assert.match(mdMobile, /selectionBar\.appendChild\(btn\(/);
  assert.match(mdMobile, /var sug = selected \|\| st\.closedSketch \? null : api\.coach\(\)/);
  assert.match(mdMobile, /api\.contextItems\(\)\.forEach\(function \(item\) \{/);
  assert.match(mdMobile, /function push\(item\)/);
  assert.doesNotMatch(mdMobile, /if \(selected\) \{[\s\S]{0,800}return \[/);
  assert.match(css, /body\.compact-nav #md-selection-bar:not\(\[hidden\]\)/);
});

test("modeler: touch-specific selection guidance and assembly select-through are wired", () => {
  assert.match(md, /compact \? "selCountTipTouch" : "selCountTip"/);
  assert.match(md, /if \(E\.docType === "assembly"\)/);
  assert.match(md, /ray\.intersectObjects\(view\.grp\.children, true\)/);
  assert.match(md, /function positionContextMenu\(/);
  assert.match(editorView, /e\.pointerType === "touch" \? 10 : 4/);
  assert.match(editorView, /travel <= moveThreshold\) return/);
});

test("modeler: compact chrome exposes truthful navigation and rebuild feedback", () => {
  assert.match(mdMobile, /lab\.textContent = t\("msheet_view"\)/);
  assert.match(mdMobile, /className = "md-nav-badge"/);
  assert.match(mdMobile, /className = "md-mobile-status"/);
  assert.match(css, /body\.compact-nav #modeler \.md-mobile-status/);
});

test("modeler: feature form on a phone borrows Tree, Extrude stays on the thumb row", () => {
  assert.match(mdMobile, /export function revealModelerFeatureForm/);
  assert.match(md, /revealModelerFeatureForm\(\)/);
  assert.match(mdMobile, /st\.closedSketch/);
  assert.match(mdMobile, /action: "extrude"/);
  assert.match(mdMobile, /title = t\("mnav_commands"\)/);
  assert.match(css, /#md-nav button > span:not\(\.md-nav-glyph\)/);
  assert.match(css, /md-commandmanager\.md-borrowed \.md-command-tabs > \[data-cmdtab\][\s\S]{0,80}min-height: 44px/);
});

test("modeler: mobile command sheets expose height and remember disclosures", () => {
  assert.match(mdMobile, /class="m-sheet-x md-sheet-expand"/);
  assert.match(mdMobile, /openCommandGroups\[head\.textContent\.trim\(\)\]/);
  assert.match(mdMobile, /md-group-summary/);
  assert.match(css, /#modeler #md-sheet\.tall \.md-sheet-expand/);
});

test("modeler: mobile tutorial track teaches touch CAD layout and bottom sheet workflow", () => {
  assert.match(md, /guideMobileTrack/);
  assert.match(md, /function mobileTourSteps\(\)/);
  assert.match(md, /phonePrimary:true/);
  assert.match(mdMobile, /export function showModelerSheet/);
  assert.match(mdMobile, /export function closeModelerSheet/);
  assert.match(mdMobile, /grp\.classList\.add\("md-group-open"\)/);
  assert.match(mdStrings, /guideSelectTipMobile/);
  assert.match(mdStrings, /guidePairBodyMobile/);
  assert.match(mdStrings, /assemblyPairBodyMobile/);
  assert.match(css, /body\.compact-nav #modeler \.md-tour-card/);
  assert.match(md, /target: '\[data-mdnav="cmd"\]'/);
  assert.match(md, /target: '\[data-md-action="extrude"\]'/);
  assert.match(md, /autoCollapseMobile: true/);
  assert.match(mdStrings, /guideContinueEditing/);
  assert.match(md, /id="mdTourRestart"/);
  assert.match(mdMobile, /b\.dataset\.mdAction = spec\.action/);
  assert.match(css, /body\.compact-nav #modeler \.md-command kbd/);
  const mobileTrack = md.slice(md.indexOf("function mobileTourSteps"), md.indexOf("function sketchTourSteps"));
  assert.doesNotMatch(mobileTrack, /#md-ctx|#md-selection-bar|touch slop|Sketch drawer/);
  assert.match(md, /guideMoreProjects/);
  assert.match(md, /class="md-tour-more"/);
  assert.match(md, /guideMoveCard/);
  assert.match(md, /coachActSketchMobile/);
});

test("modeler: editor isolates the planner accessibility tree while open", () => {
  assert.match(md, /function setModelerBackgroundIsolation\(on\)/);
  assert.match(md, /node\.inert = true/);
  assert.match(md, /#app, #start-screen, #drawer-backdrop/);
  assert.doesNotMatch(md, /Array\.from\(document\.body\.children\)/);
  assert.match(md, /root\.setAttribute\("aria-modal", "true"\)/);
  assert.match(md, /modelerReturnFocus/);
});

test("planner: mobile tour card preserves responsive CSS docking above mobile bottom bars", () => {
  assert.match(plannerTut, /document\.body\.classList\.contains\("compact-nav"\) && !tour\.moved/);
  assert.match(md, /document\.body\.classList\.contains\("compact-nav"\) && !E\.tour\.moved/);
  assert.match(css, /body\.compact-nav \.planner-tour-card/);
});

/* A phone has no Ctrl key, so the selection bar's Add to selection toggle is
   the only way to hold two sketch entities — and every two-pick relation
   (Symmetric, Point on entity, Coincident…) and Mirror needs two. The bar
   used to count only faces, edges and bodies, so in a sketch it never
   appeared and HOUSING Sketchsquare could not be fully defined by touch. */
test("modeler: a phone can build a multi-entity sketch selection", () => {
  // the shell is told how many sketch entities are picked, only while a sketch is open
  assert.match(md, /sketchCount: \(E\.authoring && E\.authoring\.phase === "sketch"\) \|\| E\.mode === "2d" \? \(E\.ssel \|\| \[\]\)\.length : 0,/);
  // the bar counts them, so it shows with its Add to selection toggle
  assert.match(mdMobile, /var selected = modelPicks \+ \(st\.sketchCount \|\| 0\);/);
  // the face/edge/body filter is only offered when something it filters is picked
  assert.match(mdMobile, /if \(modelPicks\) selectionBar\.appendChild\(btn\(\{\s*ph: "ph-funnel"/);
  // a change in the sketch selection re-renders the shell
  assert.match(mdMobile, /st\.componentCount \|\| 0,\s*st\.sketchCount \|\| 0,/);
  // both pick paths already honour the toggle — canvas taps and the geometry list
  assert.match(md, /selectSketch\(p, e\.ctrlKey \|\| e\.metaKey \|\| E\.mobileAddSelection\)/);
  assert.match(md, /selectSketch\(object,event\.ctrlKey\|\|event\.metaKey\|\|event\.shiftKey\|\|E\.mobileAddSelection\)/);
});

/* The feature-tree filter is sticky, so the tree scrolls under it. --input-bg
   and --bg-panel are translucent in the dark themes; without an opaque base
   the rows read through the field on the phone sheet and on desktop alike. */
test("modeler: the sticky feature-tree filter paints an opaque base", () => {
  assert.match(css, /#modeler \.md-feature-filter \{[^}]*position: sticky;[^}]*background: linear-gradient\(var\(--input-bg\), var\(--input-bg\)\), linear-gradient\(var\(--bg-panel\), var\(--bg-panel\)\) var\(--bg-app\);/);
});
