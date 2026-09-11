/* Phase-6 gate: one tree, several presentations — plus the things that act on
 * the whole document rather than on one node.
 *
 * The variant claim is the one worth testing in a browser, because it is about
 * what a resize does: an edit made at phone width must apply at phone width
 * and nowhere else, and the wide layout has to be waiting untouched when the
 * window grows back. Nothing but a real viewport can say whether that holds.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

let shared = null;

test.after(async () => {
  if (shared) await shared.close();
});

async function customizing({ width = 1440, height = 900 } = {}) {
  if (!shared) shared = await openPage({ width, height });
  else await shared.resize(width, height);
  /* Two loads: opening customize mode sets mf_uikit and localStorage survives
     a reload, so without clearing it every test after the first would boot
     with a layout the previous one left behind. */
  await shared.goto("/");
  await shared.eval(() => {
    localStorage.removeItem("mf_uikit");
    localStorage.removeItem("home3d_uikit:planner");
  });
  await shared.goto("/");
  await shared.eval(async () => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
    window.__runAction("uikitCustomize");
    for (let i = 0; i < 400 && !document.querySelector(".uikit-ins"); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const host = await import("/js/uikit_host/index.js");
    window.__ui = host.activeUIKit();
    window.__ed = window.__ui.editor;
    window.__frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    window.__ins = (sel) => document.querySelector(".uikit-ins " + sel);
  });
  return shared;
}

test("the posture picks the variant, and the app says which one is being edited", opts, async () => {
  const page = await customizing();
  const wide = await page.eval(() => ({
    variant: window.__ui.variant,
    shown: window.__ins(".uikit-ins-variant-name").textContent,
    base: window.__ins(".uikit-ins-variant-name").getAttribute("data-base"),
  }));
  assert.equal(wide.variant, "base", "a 1440x900 window is the base layout");
  assert.equal(wide.shown, "Desktop");
  assert.equal(wide.base, "1");

  await page.resize(390, 844);
  const phone = await page.eval(async () => {
    for (let i = 0; i < 40; i++) await window.__frame();
    return {
      variant: window.__ui.variant,
      shown: window.__ins(".uikit-ins-variant-name").textContent,
      base: window.__ins(".uikit-ins-variant-name").getAttribute("data-base"),
    };
  });
  assert.equal(phone.variant, "phone", "chrome_posture chose it, not a width uikit invented");
  assert.equal(phone.shown, "Phone");
  assert.equal(phone.base, "0", "and it is marked as applying to this size only");
});

test("an edit made at phone width applies there and nowhere else", opts, async () => {
  const page = await customizing({ width: 390, height: 844 });
  const phone = await page.eval(async () => {
    for (let i = 0; i < 40; i++) await window.__frame();
    const ed = window.__ed;
    ed.command("select", { id: "panel:tree" });
    ed.command("hide");
    return {
      variant: window.__ui.variant,
      patch: JSON.parse(JSON.stringify(window.__ui.doc.variants.phone.patch)),
      base: JSON.parse(JSON.stringify(window.__ui.doc.variants.base.patch)),
      nodeHidden: !!window.__ui.doc.nodes["panel:tree"].hidden,
    };
  });

  assert.equal(phone.variant, "phone");
  assert.deepEqual(phone.patch["panel:tree"], { hidden: true },
    "the phone variant carries a sparse patch, and only that");
  assert.deepEqual(phone.base, {}, "base was not touched");
  assert.equal(phone.nodeHidden, false, "and neither was the shared node");

  await page.resize(1440, 900);
  const wide = await page.eval(async () => {
    for (let i = 0; i < 40; i++) await window.__frame();
    const el = document.querySelector('[data-uikit-id="panel:tree"]');
    return {
      variant: window.__ui.variant,
      marked: el.getAttribute("data-uikit-hidden"),
      stillPatched: !!window.__ui.doc.variants.phone.patch["panel:tree"],
    };
  });
  assert.equal(wide.variant, "base");
  assert.equal(wide.marked, null, "the wide layout was waiting untouched");
  assert.ok(wide.stillPatched, "and the phone edit is still there for when it comes back");
});

test("a preset replaces the document, and is undoable", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const { ops } = await import("/uikit/index.js");
    const size = (id) => ops.readField(window.__ui.doc, id, "size", window.__ui.variant);
    const before = {
      width: size("n:left"),
      mep: !!window.__ui.doc.nodes["panel:mep"].hidden,
      nodes: Object.keys(window.__ui.doc.nodes).length,
    };
    const select = window.__ins(".uikit-ins-preset");
    const options = [...select.options].map((o) => o.value).filter(Boolean);

    select.value = "compact";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await window.__frame();
    const after = {
      width: size("n:left"),
      mep: !!window.__ui.doc.nodes["panel:mep"].hidden,
      nodes: Object.keys(window.__ui.doc.nodes).length,
      gap: window.__ui.doc.overrides.tokens["--uikit-gap"],
      domWidth: getComputedStyle(document.getElementById("left-sidebar")).width,
    };

    window.__ui.undo();
    window.__ui.refreshNow();
    return { before, after, options, backWidth: size("n:left") };
  });

  assert.deepEqual(result.options, ["default", "compact", "touch", "drafting", "focus", "studio"]);
  assert.equal(result.before.width, null, "the shipped layout sets no width");
  assert.deepEqual(result.after.width, { w: 232 }, "the preset does");
  assert.equal(result.after.domWidth, "232px", "and it reached the real sidebar");
  assert.ok(result.after.mep, "and hid the panes it means to hide");
  assert.equal(result.after.nodes, result.before.nodes,
    "a preset is a difference, not a smaller document — every node survives");
  assert.equal(result.after.gap, "3px");
  assert.equal(result.backWidth, null, "and picking one can be undone");
});

test("a declared theme variable retints the app; an undeclared one is refused", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const { ops } = await import("/uikit/index.js");
    const ui = window.__ui;
    const app = document.getElementById("app");
    const before = getComputedStyle(app).getPropertyValue("--accent").trim();

    /* Calibrate exactly, rather than guessing an element or matching a colour.
       Matching on the shipped accent's rgb also catches elements that happen
       to be hard-coded to the same value and were never going to follow. So:
       set the variable to a sentinel nothing else could be, collect the
       elements that turn that colour — those are painted THROUGH the variable,
       by definition — and require all of them to follow the real change. */
    const SENTINEL = "rgb(1, 2, 3)";
    ui.apply("Calibrate", ops.setToken(ui.doc, { id: null, name: "--accent", value: "#010203" }));
    ui.refreshNow();
    await window.__frame();
    const wore = [...app.querySelectorAll("button, i, span, h3, a")]
      .filter((e) => getComputedStyle(e).color === SENTINEL);
    const wasRgb = before;

    const swatch = window.__ins('[data-token="--accent"]');
    swatch.value = "#ff0000";
    swatch.dispatchEvent(new Event("input", { bubbles: true }));
    await window.__frame();
    const after = getComputedStyle(app).getPropertyValue("--accent").trim();
    const followed = wore.filter((e) => getComputedStyle(e).color === "rgb(255, 0, 0)").length;

    // and it reaches the leaves, not just the element uikit wrote it on
    const deep = document.querySelector("#leftTabs button");
    const inherited = getComputedStyle(deep).getPropertyValue("--accent").trim();

    // a variable the host never opened up
    ui.apply("Sneak", ops.setToken(ui.doc, { id: null, name: "--bg-app", value: "#00ff00" }));
    ui.refreshNow();
    const sneaked = app.style.getPropertyValue("--bg-app");

    return { before, after, wasRgb, wore: wore.length, followed, inherited, sneaked,
             tokens: window.__ins(".uikit-ins-tokens").children.length };
  });

  assert.ok(result.tokens >= 4, "the host's declared knobs are offered");
  assert.notEqual(result.before, "#ff0000");
  assert.equal(result.after, "#ff0000", "the app's own variable was rewritten on the layout root");
  assert.equal(result.inherited, "#ff0000", "it cascades all the way down the app");
  assert.equal(result.wasRgb, "#4f46e5", "the shipped accent");
  assert.ok(result.wore > 0, "real elements are painted through the variable");
  assert.equal(result.followed, result.wore,
    "and every one of them followed — the app was retinted, not just the root");
  assert.equal(result.sneaked, "", "a variable the host did not declare is refused, not written");
});

test("export produces the document, and importing it back restores the layout", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const { ops } = await import("/uikit/index.js");
    const ui = window.__ui;
    ui.apply("Edit", ops.retitle(ui.doc, { id: "panel:tree", label: "Mine" }));
    ui.apply("Edit", ops.resize(ui.doc, { id: "n:left", size: { w: 401 } }));
    ui.refreshNow();
    const text = ui.exportLayout();

    ui.resetAll();
    const wiped = {
      label: ops.readField(ui.doc, "panel:tree", "label", ui.variant),
      width: getComputedStyle(document.getElementById("left-sidebar")).width,
    };

    const back = ui.importLayout(text);
    ui.refreshNow();
    return {
      text, wiped, back,
      label: ops.readField(ui.doc, "panel:tree", "label", ui.variant),
      width: getComputedStyle(document.getElementById("left-sidebar")).width,
      bad: ui.importLayout("{not json"),
    };
  });

  assert.match(result.text, /"v": 1/, "a readable document, not a blob");
  assert.equal(result.wiped.label, null, "reset cleared it");
  assert.equal(result.wiped.width, "300px");
  assert.deepEqual(result.back, { ok: true, problems: [] });
  assert.equal(result.label, "Mine", "and the import brought it back");
  assert.equal(result.width, "401px");
  assert.equal(result.bad.ok, false, "a file that is not a layout is reported, not thrown");
});

test("resetting the breakpoint clears only that breakpoint's patch", opts, async () => {
  const page = await customizing({ width: 390, height: 844 });
  const result = await page.eval(async () => {
    for (let i = 0; i < 40; i++) await window.__frame();
    const { ops } = await import("/uikit/index.js");
    const ui = window.__ui;
    ui.apply("Base", ops.retitle(ui.doc, { id: "panel:tree", label: "Everywhere" }));
    ui.apply("Phone", ops.hide(ui.doc, { id: "panel:tree", hidden: true, variant: "phone" }));
    ui.refreshNow();

    window.__ed.command("select", { id: "panel:tree" });
    window.__ed.command("resetNode");
    return {
      patch: ui.doc.variants.phone.patch["panel:tree"],
      label: ui.doc.nodes["panel:tree"].label,
    };
  });

  assert.equal(result.patch, undefined, "the phone patch is gone");
  assert.equal(result.label, "Everywhere",
    "and the base edit, which applies at every size, is untouched");
});

test('phone and folded/tablet presets and named saves stay separate across resize', opts, async () => {
  const page = await customizing({width:390,height:844});
  const phone = await page.eval(async () => {
    localStorage.removeItem('home3d_uikit:planner:saved:phone');
    localStorage.removeItem('home3d_uikit:planner:saved:compact');
    const ui = window.__ui;
    const ids = ui.presets().map(p=>p.id);
    ui.applyPreset('phone-model');
    ui.saveNamedLayout('Phone workspace');
    await window.__frame();
    return { ids, cards: [...document.querySelectorAll('.uikit-ins-preset-card')].map(b=>b.dataset.preset), saved:ui.savedLayouts() };
  });
  assert.deepEqual(phone.cards,phone.ids);
  assert.ok(phone.ids.every(id=>id.startsWith('phone-')));
  await page.resize(673,841);
  const fold = await page.eval(async () => {
    for(let i=0;i<20;i++) await window.__frame();
    const ui=window.__ui;
    const before=ui.savedLayouts();
    ui.applyPreset('compact-draw');
    ui.saveNamedLayout('Fold workspace');
    return {variant:ui.variant,before,ids:ui.presets().map(p=>p.id),phone:ui.doc.variants.phone.tokens['--accent'],saved:ui.savedLayouts()};
  });
  assert.equal(fold.variant,'compact');
  assert.deepEqual(fold.before,[]);
  assert.ok(fold.ids.every(id=>id.startsWith('compact-')));
  assert.equal(fold.phone,'#0f766e');
  await page.resize(390,844);
  const returned=await page.eval(async()=>{
    for(let i=0;i<20;i++) await window.__frame();
    const ui=window.__ui;
    return {saved:ui.savedLayouts().map(p=>p.name), matched:ui.matchingPreset(), wrong:ui.loadNamedLayout('not-a-phone-id')};
  });
  assert.deepEqual(returned.saved,['Phone workspace']);
  assert.equal(returned.matched,'phone-model');
  assert.equal(returned.wrong,false);
  await page.eval(()=>{
    localStorage.removeItem('home3d_uikit:planner:saved:phone');
    localStorage.removeItem('home3d_uikit:planner:saved:compact');
  });
});
