/* Real-layout tests for the mobile model editor.
 *
 * Everything here is an assertion the source-matching suite in
 * compact_editors.test.mjs structurally cannot make: whether a rule that
 * demonstrably EXISTS actually produces a laid-out box that fits, is tappable,
 * and goes home clean. Each case below maps to a bug that shipped green
 * through the string tests.
 *
 * Skips itself when Chrome is absent — set CHROME_PATH to point at a binary.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const TAP = 44; // the touch-target floor every control in this chrome shares

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

/* One browser for the whole file. Launching Chrome costs ~4s and every test
   here only needs a fresh document, which a reload gives for ~0.6s. `lang`
   lives in localStorage and is read at boot, so switching it means one reload,
   not one browser. */
let shared = null;
// These tests are about the classic compact chrome — the five-slot navigation
// and the sheets measured against it. The Round-6 phone chrome replaces it by
// default (tests/pro_compact.browser.mjs covers that), so they ask for the
// classic one with localStorage mf.proSkin = "0".
async function freshCtx({ width = 375, height = 812, lang = "en" } = {}) {
  if (!chrome) return null;
  if (!shared) {
    shared = await openPage({ width, height, lang });
    shared.lang = lang;
    await shared.eval(() => localStorage.setItem("mf.proSkin", "0"));
    await shared.goto("/");
  } else {
    await shared.resize(width, height);
    if (shared.lang !== lang) {
      await shared.setLang(lang);
      shared.lang = lang;
    }
    await shared.goto("/");
  }
  shared.consoleErrors.length = 0;
  return shared;
}
async function ctx(options = {}) {
  const page = await freshCtx(options);
  await openEditor(page);
  return page;
}
test.after(async () => {
  if (shared) await shared.close();
});

/* ---- page helpers ------------------------------------------------------- */

// Open the editor and dismiss the welcome layer, leaving the phone chrome up.
async function openEditor(page) {
  await page.eval(() => {
    document.getElementById("openModelerTop").click();
  });
  // The editor is fetched on demand now, so wait for it rather than guessing.
  await page.waitUntil(() => {
    const el = document.getElementById("modeler");
    return !!el && getComputedStyle(el).display !== "none";
  }, { what: "the model editor to open" });
  await page.eval(() => {
    const c = document.querySelector('#mdWelcome [data-welcome-start="continue"]');
    if (c) c.click();
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));
}

async function openSheet(page, key) {
  await page.eval((k) => {
    document.querySelector('[data-mdnav="' + k + '"]').click();
  }, key);
  await page.eval(() => new Promise((r) => setTimeout(r, 250)));
}

/* Anything whose box escapes the sheet on either side. overflow-x is hidden on
   the panes, so an escaped command is not scrolled-to, it is GONE. */
const clippedCommands = () => {
  const sheet = document.getElementById("md-sheet");
  const pane = sheet.querySelector(".md-command-pane.on");
  const sr = sheet.getBoundingClientRect();
  return [...pane.querySelectorAll(".md-command")]
    .filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && (r.right > sr.right + 1 || r.left < sr.left - 1);
    })
    .map((b) => b.textContent.trim());
};

/* ---- the suite ---------------------------------------------------------- */

for (const lang of ["en", "he"]) {
  for (const [w, h] of [[375, 812], [390, 844]]) {
    test(`model editor @ ${w}px (${lang}): ribbon fits the sheet`, opts, async () => {
      const page = await ctx({ width: w, height: h, lang });
      {
        await openSheet(page, "cmd");

        // the bug: minmax(96px,1fr) sized against max-content and resolved five
        // 97px tracks in a 375px sheet, clipping six commands with no scroll
        const clipped = await page.eval(clippedCommands);
        assert.deepEqual(clipped, [], "commands escaped the sheet");

        const fit = await page.eval(() => {
          const s = document.getElementById("md-sheet");
          const cm = s.querySelector(".md-commandmanager");
          const tabs = cm.querySelector(".md-command-tabs");
          return {
            managerW: cm.getBoundingClientRect().width,
            sheetW: s.clientWidth,
            tabsOverflow: tabs.scrollWidth > tabs.clientWidth + 1,
            searches: s.querySelectorAll(".md-sheet-search, .md-command-search-btn")
              .length,
            visibleSearches: [
              ...s.querySelectorAll(".md-sheet-search, .md-command-search-btn"),
            ].filter((b) => getComputedStyle(b).display !== "none").length,
          };
        });
        assert.ok(fit.managerW <= fit.sheetW, `ribbon ${fit.managerW} > sheet ${fit.sheetW}`);
        assert.equal(fit.tabsOverflow, false, "tab row overflows the sheet");
        assert.equal(fit.visibleSearches, 1, "expected exactly one search control");
      }
    });

    test(`model editor @ ${w}px (${lang}): contextual verbs are labelled and fit the thumb row`, opts, async () => {
      const page = await ctx({ width: w, height: h, lang });
      {
        // Changing modelling verbs need visible names; stable undo/redo icons
        // keep their accessible labels and the same full-size touch targets.
        const bar = await page.eval(() => {
          const ctx = document.getElementById("md-ctx");
          return {
            overflows: ctx.scrollWidth > ctx.clientWidth + 1,
            buttons: [...ctx.querySelectorAll(".mctx-btn")].map((b) => {
              const r = b.getBoundingClientRect();
              const sp = b.querySelector("span");
              return {
                chip: b.classList.contains("mctx-chip"),
                iconOnly: b.classList.contains("mctx-icon-only"),
                w: Math.round(r.width),
                h: Math.round(r.height),
                labelShown: !!sp && getComputedStyle(sp).display !== "none" &&
                  sp.textContent.trim().length > 0,
                aria: b.getAttribute("aria-label"),
              };
            }),
          };
        });
        assert.equal(bar.overflows, false, "context row overflows");
        for (const b of bar.buttons) {
          assert.ok(b.aria && b.aria.length, "every control is named for AT");
          assert.ok(b.h >= TAP, `control ${b.aria} is ${b.h}px tall`);
          assert.ok(b.w >= TAP, `control ${b.aria} is ${b.w}px wide`);
          if (!b.chip && !b.iconOnly) assert.equal(b.labelShown, true, `verb "${b.aria}" needs a visible caption`);
        }
      }
    });

    test(`model editor @ ${w}px (${lang}): View pages need no scrolling`, opts, async () => {
      const page = await ctx({ width: w, height: h, lang });
      {
        await openSheet(page, "view");
        const pages = await page.eval(() => {
          const body = document.getElementById("md-sheet-body"), sheet=document.getElementById("md-sheet");
          const tabs=[...body.querySelectorAll(".mobile-page-tab,.mobile-page-dot")];
          return (tabs.length?tabs:[null]).map(tab=>{
            tab?.click();
            const btns=[...body.querySelectorAll(".m-grid-btn")].filter(b=>b.getBoundingClientRect().height>0);
            const sr=sheet.getBoundingClientRect();
            return {count:btns.length,scrollH:body.scrollHeight,clientH:body.clientHeight,
              shortest:Math.min(...btns.map(b=>Math.round(b.getBoundingClientRect().height))),
              escaped:btns.filter(b=>{const r=b.getBoundingClientRect();return r.right>sr.right+1||r.left<sr.left-1;}).length};
          });
        });
        assert.ok(pages.reduce((n,p)=>n+p.count,0)>10,"all View controls remain reachable through the pages");
        for(const v of pages){
          assert.ok(v.scrollH<=v.clientH+1,`view page scrolls: ${v.scrollH} of content in ${v.clientH}`);
          assert.ok(v.shortest>=TAP,`a view control is only ${v.shortest}px tall`);
          assert.equal(v.escaped,0,"a view control escaped the sheet");
        }
      }
    });
  }
}

test("borrowed panels go home exactly as they left", opts, async () => {
  const page = await ctx();
  {
    // remember where the ribbon lives before the sheet ever touches it
    await page.eval(() => {
      const cm = document.querySelector("#modeler .md-commandmanager");
      window.__home = { parent: cm.parentNode, next: cm.nextSibling, cls: cm.className };
    });
    await openSheet(page, "cmd");
    // open a drawer so there IS phone-only state to leave behind
    await page.eval(() => {
      const h = document.querySelector('#md-sheet [data-cmdgroup="secondary"] .md-command-group-label');
      if (h) h.click();
    });
    await openSheet(page, "tree"); // switch sheets: forces a release mid-flight
    await page.eval(() => new Promise((r) => setTimeout(r, 200)));

    const back = await page.eval(() => {
      const cm = document.querySelector("#modeler .md-commandmanager");
      return {
        sameParent: cm.parentNode === window.__home.parent,
        sameNext: cm.nextSibling === window.__home.next,
        sameClass: cm.className === window.__home.cls,
        inSheet: !!cm.closest("#md-sheet"),
        strayOpen: document.querySelectorAll("#modeler .md-group-open").length,
        strayAria: document.querySelectorAll("#modeler .md-command-group-label[aria-expanded]").length,
        strayRole: document.querySelectorAll("#modeler .md-command-group-label[role]").length,
      };
    });
    assert.equal(back.inSheet, false, "the ribbon is still inside the sheet");
    assert.equal(back.sameParent, true, "the ribbon came back to a different parent");
    assert.equal(back.sameNext, true, "the ribbon came back in a different position");
    assert.equal(back.sameClass, true, `class drifted (md-borrowed left behind?)`);
    assert.equal(back.strayOpen, 0, "phone drawer state rode home with the ribbon");
    assert.equal(back.strayAria, 0, "phone aria-expanded rode home with the ribbon");
    assert.equal(back.strayRole, 0, "phone role=button rode home with the ribbon");
  }
});

test("closing the editor leaves the desktop layout whole", opts, async () => {
  const page = await ctx();
  {
    await openSheet(page, "tree"); // borrow the left panel, then tear down on top of it
    const after = await page.eval(async () => {
      document.getElementById("mdClose").click();
      await new Promise(requestAnimationFrame);
      const root = document.getElementById("modeler");
      return {
        left: !!root.querySelector(".md-left"),
        ribbon: !!root.querySelector(".md-commandmanager"),
        right: !!root.querySelector(".md-right"),
        orphaned: document.querySelectorAll(".md-borrowed").length,
        chromeGone: !document.getElementById("md-ctx") && !document.getElementById("md-nav"),
      };
    });
    // the editor closes by removing its own root — a panel still held by the
    // sheet would be deleted along with it
    assert.equal(after.left, true, "the tree panel was lost on close");
    assert.equal(after.ribbon, true, "the ribbon was lost on close");
    assert.equal(after.right, true, "the property panel was lost on close");
    assert.equal(after.orphaned, 0, "a panel is still flagged as borrowed");
    assert.equal(after.chromeGone, true, "the phone chrome outlived the editor");
  }
});

test("secondary command groups are drawers, and they open", opts, async () => {
  const page = await ctx();
  {
    await openSheet(page, "cmd");
    const state = await page.eval(() => {
      // a blank part opens on Sketch, which has one drawer; the drawers this
      // test is about (References / Standards) are on Features. Direct is a
      // secondary group too, but a parametric part hides it outright — it has
      // no handle to measure there.
      const tab = document.querySelector('#md-sheet [data-cmdtab="features"]');
      if (tab) tab.click();
      const pane = document.querySelector("#md-sheet .md-command-pane.on");
      const groups = [...pane.querySelectorAll('[data-cmdgroup="secondary"]')].filter((g) => !g.hidden);
      const shown = (g) => getComputedStyle(g.querySelector(".md-command-items")).display !== "none";
      const before = groups.map(shown);
      const heads = groups.map((g) => g.querySelector(".md-command-group-label"));
      const headH = heads.map((h) => Math.round(h.getBoundingClientRect().height));
      heads[0].click();
      const after = groups.map(shown);
      heads[0].click();
      return {
        count: groups.length,
        before, after, headH,
        reclosed: groups.map(shown),
        expanded: heads[0].getAttribute("aria-expanded"),
        primaryGroupsOpen: [...pane.querySelectorAll('[data-cmdgroup="primary"]')].every(shown),
      };
    });
    assert.ok(state.count >= 2, "expected collapsible secondary groups");
    assert.deepEqual(state.before, state.before.map(() => false), "drawers start open");
    assert.equal(state.after[0], true, "the drawer did not open");
    assert.equal(state.reclosed[0], false, "the drawer did not close again");
    assert.equal(state.expanded, "false");
    assert.equal(state.primaryGroupsOpen, true, "a primary group got collapsed");
    for (const hh of state.headH) assert.ok(hh >= TAP, `a drawer handle is ${hh}px tall`);
  }
});

test("the Commands sheet opens on the tab that matches the mode", opts, async () => {
  const page = await ctx();
  {
    await openSheet(page, "cmd");
    /* A part with nothing in it: Features is six disabled buttons and one live
       one, so the sheet opens on Sketch — the tab that can actually start the
       model. Features is the answer once there is geometry to operate on. */
    const empty3d = await page.eval(
      () => document.querySelector("#md-sheet .md-command-pane.on").dataset.commandPane,
    );
    assert.equal(empty3d, "sketch", "an empty part should open on the Sketch tab");

    await openSheet(page, "view");
    await page.eval(() => {
      const body = document.getElementById("md-sheet-body");
      [...body.querySelectorAll(".m-grid-btn")][1].click(); // 2nd doc mode = sketch
    });
    await page.eval(() => new Promise((r) => setTimeout(r, 300)));
    await openSheet(page, "cmd");
    const inSketch = await page.eval(() => ({
      tab: document.querySelector("#md-sheet .md-command-pane.on").dataset.commandPane,
      // the View slot announces the mode: querySelector("span") used to return
      // the inserted glyph and froze this label on whatever it first rendered
      navLabel: document
        .querySelector('[data-mdnav="view"] span:not(.md-nav-glyph)')
        .textContent.trim(),
    }));
    assert.equal(inSketch.tab, "sketch", "sketch mode did not select the Sketch tab");
    assert.notEqual(inSketch.navLabel, "", "the View nav slot lost its label");
    assert.notEqual(inSketch.navLabel, "Model", "the View nav slot is stuck on the old mode");
  }
});

/* Headless has no GPU, so the editor's three.js preview throws building its
   renderer. That is the harness's environment, not the app's chrome — and
   giving Chrome a software GL to silence it costs minutes per run. Everything
   else must be clean. */
const NO_GL = /getSupportedExtensions|WebGL|WebGPU|GPUAdapter|three\.webgpu/i;

test("the phone chrome boots and drives without throwing", opts, async () => {
  const page = await ctx();
  {
    for (const k of ["view", "tree", "cmd", "props", "more"]) await openSheet(page, k);
    // exercise the parts that MOVE live DOM around, which is where this
    // architecture breaks: a drawer, a borrow, a release, a teardown
    await page.eval(() => {
      const h = document.querySelector('#md-sheet [data-cmdgroup="secondary"] .md-command-group-label');
      if (h) h.click();
      document.getElementById("mdClose").click();
    });
    await page.eval(() => new Promise((r) => setTimeout(r, 300)));
    const real = page.consoleErrors.filter((e) => !NO_GL.test(e));
    assert.deepEqual(real, [], "uncaught exceptions while driving the phone chrome");
  }
});

test("model editor @ 375px: status banner does not overlap hint or header", opts, async () => {
  const page = await ctx({ width: 375, height: 812 });
  {
    const collision = await page.eval(() => {
      const banner = document.querySelector(".md-mobile-status");
      const hint = document.getElementById("mdHint");
      const head = document.querySelector("#modeler .md-head");
      if (!banner || !hint || !head) return { missing: true };
      banner.hidden = false;
      banner.textContent = "Rebuild errors · 1";
      const br = banner.getBoundingClientRect();
      const hr = hint.getBoundingClientRect();
      const hdr = head.getBoundingClientRect();
      const overlapsHint = !(br.bottom <= hr.top || br.top >= hr.bottom);
      const overlapsHead = !(br.bottom <= hdr.top || br.top >= hdr.bottom);
      return { overlapsHint, overlapsHead, br, hr, hdr };
    });
    assert.equal(collision.missing, undefined, "elements missing");
    assert.equal(collision.overlapsHint, false, "status banner overlaps the hint strip");
    assert.equal(collision.overlapsHead, false, "status banner overlaps the header");
  }
});

test("model editor @ 375px: mobile tutorial card docks above bottom chrome and lists touch track", opts, async () => {
  const page = await ctx({ width: 375, height: 812 });
  {
    const res = await page.eval(() => {
      const guideBtn = document.getElementById("mdGuide");
      if (guideBtn) guideBtn.click();
      const tourLayer = document.getElementById("mdTour");
      const tourCard = document.querySelector("#modeler .md-tour-card");
      const nav = document.getElementById("md-nav");
      if (!tourLayer || !tourCard || !nav) return { missing: true };
      const cr = tourCard.getBoundingClientRect();
      const nr = nav.getBoundingClientRect();
      const overlapsNav = !(cr.bottom <= nr.top || cr.top >= nr.bottom);
      const isVisible = cr.width > 0 && cr.height > 0 && !tourLayer.hidden;
      const primary = [...document.querySelectorAll("#mdTourTracks > [data-tour-track]")].map((b) =>
        b.getAttribute("data-tour-track"),
      );
      const more = document.querySelector("#mdTourTracks .md-tour-more");
      const moreTracks = more
        ? [...more.querySelectorAll("[data-tour-track]")].map((b) => b.getAttribute("data-tour-track"))
        : [];
      return {
        isVisible, overlapsNav, cr, nr,
        primary, moreTracks,
        hasMore: !!more,
        hasMobileTrack: primary.includes("mobile"),
      };
    });
    assert.equal(res.missing, undefined, "elements missing");
    assert.equal(res.isVisible, true, "tour card is visible");
    assert.equal(res.overlapsNav, false, "tour card does not overlap bottom navigation");
    assert.deepEqual(res.primary, ["mobile", "sketch"], "phone hub leads with touch + sketch");
    assert.equal(res.hasMore, true, "desktop projects sit behind More projects");
    assert.ok(res.moreTracks.includes("solidworks"), "CAD cube is in More projects");
  }
});

test("model editor @ 375px: welcome primary is Touch CAD, Blank part, Blank assembly", opts, async () => {
  const page = await ctx({ width: 375, height: 812 });
  {
    await page.eval(() => document.querySelector('[data-mdnav="more"]').click());
    await page.eval(() => new Promise((r) => setTimeout(r, 200)));
    await page.eval(() => {
      const btns = [...document.querySelectorAll("#md-sheet-body .m-grid-btn")];
      const start = btns.find((b) => /start screen|מסך הפתיחה/i.test(b.textContent));
      if (start) start.click();
    });
    await page.eval(() => new Promise((r) => setTimeout(r, 250)));
    const welcome = await page.eval(() => {
      const tiles = [...document.querySelectorAll("#mdWelcomeStart > .md-welcome-tile")].map((b) =>
        (b.innerText || "").replace(/\s+/g, " ").trim(),
      );
      return {
        tiles,
        extraHasAssembly: !![...document.querySelectorAll(".md-welcome-extra [data-welcome-start]")].find(
          (b) => b.getAttribute("data-welcome-start") === "assembly",
        ),
        extraHasContinue: !![...document.querySelectorAll(".md-welcome-extra [data-welcome-start]")].find(
          (b) => b.getAttribute("data-welcome-start") === "continue",
        ),
      };
    });
    assert.equal(welcome.tiles.length, 3, "three primary welcome tiles");
    assert.match(welcome.tiles[0], /Touch CAD|מחוות/);
    assert.match(welcome.tiles[1], /Blank part|חלק ריק/);
    assert.match(welcome.tiles[2], /Blank assembly|הרכבה ריקה/);
    assert.equal(welcome.extraHasAssembly, false, "blank assembly stays on the primary list");
    assert.equal(welcome.extraHasContinue, true, "Open editor sits in More starting points");
  }
});

/* The compact welcome layout borrows the guides heading and the guides grid
   into a <details> it builds. It used to drop that wrapper with them still
   inside, so the first open in a wider window silently lost every guided track
   and the one after that threw on a grid that no longer existed — taking the
   editor down on the way in. */
test("the welcome guides survive a compact layout being torn down", opts, async () => {
  const page = await ctx({ width: 375, height: 812 });
  const reopenWelcome = async () => {
    await page.eval(() => { const pref=document.getElementById("mdPrefWelcome"); pref.checked=true; pref.dispatchEvent(new Event("change",{bubbles:true})); window.confirm = () => true; document.getElementById("mdClose")?.click(); });
    await page.eval(() => new Promise((r) => setTimeout(r, 400)));
    await page.eval(() => { document.getElementById("openModelerTop").click(); });
    await page.waitUntil(() => {
      const el = document.getElementById("modeler");
      return !!el && getComputedStyle(el).display !== "none";
    }, { what: "the model editor to open" });
  };
  const cards = () => page.eval(() => ({
    guides: !!document.querySelector("#mdWelcomeGuides"),
    guideTiles: document.querySelectorAll("#mdWelcomeGuides [data-welcome-guide]").length,
    startTiles: document.querySelectorAll("#mdWelcomeStart [data-welcome-start]").length,
  }));

  await reopenWelcome();
  await page.waitUntil(() => {
    const el = document.getElementById("modeler");
    return !!el && getComputedStyle(el).display !== "none";
  }, { what: "the model editor to open" });
  const compact = await cards();
  assert.equal(compact.guides, true, "the guides grid is present on a phone");
  assert.ok(compact.guideTiles > 0, "and it has guided tracks in it");

  // widen to desktop and come back in: this is the transition that lost them
  await page.eval(() => { document.querySelector(".md-welcome-close")?.click(); });
  await page.eval(() => new Promise((r) => setTimeout(r, 250)));
  await shared.resize(1280, 800, { mobile: false, touch: false });
  await page.eval(() => new Promise((r) => setTimeout(r, 400)));
  await reopenWelcome();
  const wide = await cards();
  assert.equal(wide.guides, true, "the guides grid survived the wrapper being removed");
  assert.ok(wide.guideTiles > 0, "with its guided tracks intact");
  assert.ok(wide.startTiles >= 3, "and the full start list is back on desktop");

  // and once more, which is where it used to throw
  await reopenWelcome();
  const again = await cards();
  assert.equal(again.guides, true);
  assert.ok(again.guideTiles > 0);
  const fatal = page.consoleErrors.filter((error) => !NO_GL.test(error));
  assert.deepEqual(fatal, [], "opening the editor threw");
  // hand the shared page back as a phone, which is what every case here expects
  await shared.resize(375, 812, { mobile: true, touch: true });
});

test("mobile Add sheet launches an interactive editor without inerting unknown integrations", opts, async () => {
  const page = await freshCtx({ width: 390, height: 844 });
  {
    const add = await page.eval(() => {
      const sentinel = document.createElement("div");
      sentinel.id = "browser-integration-sentinel";
      document.body.appendChild(sentinel);
      document.querySelector('[data-mnav="add"]').click();
      const launch = document.getElementById("openModelerBtn");
      const r = launch && launch.getBoundingClientRect();
      return { visible: !!(r && r.width > 0 && r.height > 0), label: launch?.innerText || "" };
    });
    assert.equal(add.visible, true, "Model editor launch is not visible in Add");
    assert.match(add.label, /Model editor|עורך מודלים/);

    await page.eval(() => document.getElementById("openModelerBtn").click());
    /* js/modeler.js loads on first open, so a fixed sleep lost the race on a
       busy machine. Wait for the editor and its nav, then for the open to settle. */
    await page.waitUntil(() => {
      const editor = document.getElementById("modeler"), nav = document.getElementById("md-nav");
      return !!(editor && getComputedStyle(editor).display !== "none" && nav && nav.getBoundingClientRect().width > 0);
    }, { ms: 20000, what: "the model editor to open from Add" }).catch(() => {});
    await page.eval(() => new Promise((r) => setTimeout(r, 300)));
    const opened = await page.eval(() => {
      const editor = document.getElementById("modeler");
      const nav = document.getElementById("md-nav");
      const sentinel = document.getElementById("browser-integration-sentinel");
      const nr = nav && nav.getBoundingClientRect();
      return {
        editorVisible: !!(editor && getComputedStyle(editor).display !== "none"),
        navVisible: !!(nr && nr.width > 0 && nr.height > 0),
        plannerInert: document.getElementById("app").inert,
        integrationInert: sentinel.inert,
        integrationHidden: sentinel.getAttribute("aria-hidden"),
      };
    });
    assert.equal(opened.editorVisible, true, "editor did not open from Add");
    assert.equal(opened.navVisible, true, "mobile editor navigation did not initialize");
    assert.equal(opened.plannerInert, true, "planner remains exposed behind modal editor");
    assert.equal(opened.integrationInert, false, "unknown body child was made inert");
    assert.equal(opened.integrationHidden, null, "unknown body child was hidden from accessibility");

    await page.eval(() => {
      document.querySelector('[data-mdnav="cmd"]').click();
    });
    await page.eval(() => new Promise((r) => setTimeout(r, 250)));
    const responsive = await page.eval(() => document.getElementById("md-sheet").classList.contains("on"));
    assert.equal(responsive, true, "editor navigation stopped responding after launch");
  }
});

test("model editor @ 344px: all nav destinations retain visible names and icons", opts, async () => {
  const page = await ctx({ width: 344, height: 882 });
  {
    const nav = await page.eval(() => {
      const g = document.querySelector('[data-mdnav="view"] .md-nav-glyph');
      const buttons = [...document.querySelectorAll('#md-nav button')].map((button) => {
        const r = button.getBoundingClientRect();
        const label = button.querySelector('span:not(.md-nav-glyph)');
        const icon = button.querySelector('i, .md-nav-glyph');
        const ir = icon && icon.getBoundingClientRect();
        return {
          aria: button.getAttribute("aria-label"),
          w: Math.round(r.width),
          h: Math.round(r.height),
          labelShown: !!label && getComputedStyle(label).display !== "none",
          iconShown: !!(ir && getComputedStyle(icon).display !== "none" && ir.width > 0 && ir.height > 0),
        };
      });
      const gr = g && g.getBoundingClientRect();
      return {
        glyphShown: !!(gr && getComputedStyle(g).display !== "none" && gr.width > 0 && gr.height > 0),
        buttons,
        overflows: document.getElementById("md-nav").scrollWidth > document.getElementById("md-nav").clientWidth + 1,
      };
    });
    assert.equal(nav.glyphShown, true, "Fold cover hid the View mode glyph");
    assert.equal(nav.buttons.length, 5, "expected every navigation destination");
    assert.ok(nav.buttons.every((button) => button.aria && button.iconShown), "a destination lost its icon or accessible name");
    assert.ok(nav.buttons.every((button) => button.w >= TAP && button.h >= TAP), "a destination fell below the touch floor");
    assert.ok(nav.buttons.every((button) => button.labelShown), "Fold cover hid a navigation caption");
    assert.equal(nav.overflows, false, "icon navigation overflows the viewport");
  }
});

test("model editor @ 375px: Commands tabs meet the 44px floor", opts, async () => {
  const page = await ctx({ width: 375, height: 812 });
  {
    await page.eval(() => document.querySelector('[data-mdnav="cmd"]').click());
    await page.eval(() => new Promise((r) => setTimeout(r, 250)));
    const tabs = await page.eval(() => {
      const sheet = document.getElementById("md-sheet");
      const tabBtns = [...sheet.querySelectorAll(".md-command-tabs > [data-cmdtab]")];
      const cmds = [...sheet.querySelectorAll(".md-command")].filter((b) => b.getBoundingClientRect().height > 0);
      return {
        shortestTab: Math.min(...tabBtns.map((b) => Math.round(b.getBoundingClientRect().height))),
        shortestCmd: Math.min(...cmds.map((b) => Math.round(b.getBoundingClientRect().height))),
      };
    });
    assert.ok(tabs.shortestTab >= 44, `command tab is ${tabs.shortestTab}px`);
    assert.ok(tabs.shortestCmd >= 44, `command button is ${tabs.shortestCmd}px`);
  }
});

test("model editor @ 375px: auto Extrude opens the feature form in Tree", opts, async () => {
  const page = await ctx({ width: 375, height: 812 });
  {
    await page.eval(() => document.getElementById("mdGuide").click());
    await page.eval(() => new Promise((r) => setTimeout(r, 300)));
    await page.eval(() => document.querySelector('[data-tour-track="mobile"]').click());
    await page.eval(() => new Promise((r) => setTimeout(r, 200)));
    await page.eval(() => document.querySelector('[data-tour-mode="auto"]').click());
    await page.eval(() => new Promise((r) => setTimeout(r, 400)));
    for (let i = 0; i < 3; i++) {
      await page.eval(() => document.getElementById("mdTourNext").click());
      await page.eval(() => new Promise((r) => setTimeout(r, 350)));
    }
    const form = await page.eval(() => {
      const host = document.querySelector("#mdQuickSettings");
      const sheet = document.getElementById("md-sheet");
      const r = host && !host.hidden ? host.getBoundingClientRect() : null;
      return {
        title: document.getElementById("mdTourTitle")?.textContent || "",
        sheetOn: sheet?.classList.contains("on") || false,
        inTree: !!(host && sheet && sheet.contains(host)),
        formH: r ? Math.round(r.height) : 0,
        formDisplay: host ? getComputedStyle(host).display : "none",
      };
    });
    assert.match(form.title, /Extrude|אקסטרוד/);
    assert.equal(form.sheetOn, true, "Tree sheet should be open around the form");
    assert.equal(form.inTree, true, "feature form is not inside the sheet");
    assert.ok(form.formH > 40 && form.formDisplay !== "none", "feature form is not visible");
  }
});

test("model editor @ 375px: Touch CAD automatic tutorial completes every card", opts, async () => {
  const page = await ctx({ width: 375, height: 812 });
  {
    await page.eval(() => document.getElementById("mdGuide").click());
    await page.eval(() => document.querySelector('[data-tour-track="mobile"]').click());
    await page.eval(() => document.querySelector('[data-tour-mode="auto"]').click());
    for (let i = 0; i < 6; i++) {
      await page.eval(() => document.getElementById("mdTourNext").click());
      await page.eval(() => new Promise((r) => setTimeout(r, 220)));
    }
    const last = await page.eval(() => ({
      count: document.getElementById("mdTourCount")?.textContent || "",
      title: document.getElementById("mdTourTitle")?.textContent || "",
      enabled: !document.getElementById("mdTourNext")?.disabled,
      editorVisible: getComputedStyle(document.getElementById("modeler")).display !== "none",
    }));
    assert.match(last.count, /7\s*(?:\/|of|מתוך)\s*7|Done|הושלם/);
    assert.match(last.title, /Ready for touch CAD|מוכנים לעבודה במובייל/);
    assert.equal(last.enabled, true, "final Continue editing action is disabled");
    assert.equal(last.editorVisible, true, "tutorial completion closed the editor");
  }
});

test("model editor @ 844x390: View sheet fits landscape", opts, async () => {
  const page = await ctx({ width: 844, height: 390 });
  {
    await page.eval(() => document.querySelector('[data-mdnav="view"]').click());
    await page.eval(() => new Promise((r) => setTimeout(r, 250)));
    const v = await page.eval(() => {
      const body = document.getElementById("md-sheet-body");
      return {
        scrollH: body.scrollHeight,
        clientH: body.clientHeight,
        sections: body.querySelectorAll(".m-sheet-sec").length,
      };
    });
    assert.equal(v.sections, 0, "landscape View still shows section headers");
    assert.ok(v.scrollH <= v.clientH + 1, `landscape View scrolls: ${v.scrollH} in ${v.clientH}`);
  }
});
