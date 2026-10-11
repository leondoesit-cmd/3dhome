import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

test("Planner mobile destinations stay labelled and switch sheets in one tap", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await page.eval(() => {
      const start = document.getElementById("start-screen");
      if (start) start.hidden = true;
      document.querySelector('[data-mnav="tools"]').click();
    });
    await page.eval(() => new Promise((resolve) => setTimeout(resolve, 120)));
    await page.eval(() => document.querySelector('[data-mnav="add"]').click());
    await page.eval(() => new Promise((resolve) => setTimeout(resolve, 120)));
    const switched = await page.eval(() => ({
      labels: [...document.querySelectorAll("#mobile-nav button > span")].map((node) => ({
        text: node.textContent.trim(),
        display: getComputedStyle(node).display,
      })),
      addActive: document.querySelector('[data-mnav="add"]').classList.contains("active"),
      toolsActive: document.querySelector('[data-mnav="tools"]').classList.contains("active"),
      libraryOpen: document.body.classList.contains("show-left"),
      generatedSheetOpen: document.getElementById("m-sheet").classList.contains("on"),
      generatedSheetHidden: document.getElementById("m-sheet").getAttribute("aria-hidden"),
      generatedSheetInert: document.getElementById("m-sheet").inert,
    }));
    assert.ok(switched.labels.every((label) => label.text && label.display !== "none"), "all five destinations have visible names");
    assert.equal(switched.addActive, true, "Add becomes active on the first tap");
    assert.equal(switched.toolsActive, false, "Tools clears immediately");
    assert.equal(switched.libraryOpen, true, "the Add library opens immediately");
    assert.equal(switched.generatedSheetOpen, false, "the previous generated sheet closes");
    assert.equal(switched.generatedSheetHidden, "true", "the dismissed generated sheet leaves the accessibility tree");
    assert.equal(switched.generatedSheetInert, true, "dismissed sheet controls cannot intercept later input");

    await page.eval(() => document.querySelector('[data-mnav="more"]').click());
    await page.eval(() => new Promise((resolve) => setTimeout(resolve, 120)));
    const more = await page.eval(() => ({
      guide: !!document.querySelector("#m-sheet .m-guide-card"),
      groups: [...document.querySelectorAll("#m-sheet .m-sheet-sec, #m-sheet .m-more-group > summary")]
        .map((node) => node.textContent.trim()),
      extrasCollapsed: !document.querySelector("#m-sheet .m-more-group")?.open,
      paged: !!document.querySelector("#m-sheet .mobile-page-shell"),
      topModeler: getComputedStyle(document.getElementById("openModelerTop")).display,
      topMoreRects: document.getElementById("moreMenu").getClientRects().length,
      sheetHidden: document.getElementById("m-sheet").getAttribute("aria-hidden"),
      sheetInert: document.getElementById("m-sheet").inert,
      saveCount: [...document.querySelectorAll("#m-sheet-body button")]
        .filter((button) => button.textContent.trim() === "Save").length,
    }));
    assert.equal(more.guide, true, "Guide is promoted at the top of More");
    assert.ok(more.groups.includes("Project") && more.groups.includes("Export"), "More has named task groups");
    assert.equal(more.extrasCollapsed, true, "advanced extras start collapsed");
    assert.equal(more.paged, false, "More scrolls instead of hiding groups behind anonymous pages");
    assert.equal(more.topModeler, "none", "Model Editor is demoted from the permanent topbar");
    assert.equal(more.topMoreRects, 0, "there is only one mobile More destination");
    assert.equal(more.sheetHidden, "false", "the open sheet is exposed to assistive technology");
    assert.equal(more.sheetInert, false, "the open sheet accepts interaction");
    assert.equal(more.saveCount, 1, "More contains one unambiguous Save action");

    // The View slot is a switcher: one tap flips Plan <-> 3D rather than
    // spending a tap opening a list to say which pane you want.
    const toggled = await page.eval(async () => {
      const before = document.getElementById("center-canvas").className;
      document.querySelector('[data-mnav="view"]').click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      return {
        before,
        after: document.getElementById("center-canvas").className,
        sheetOpen: document.getElementById("m-sheet").classList.contains("on"),
        label: document.querySelector('[data-mnav="view"] span').textContent.trim(),
      };
    });
    assert.ok(toggled.before.includes("max-view-2d"), "a phone starts on the plan");
    assert.ok(toggled.after.includes("max-view-3d"), "one tap on View switches the pane");
    assert.equal(toggled.sheetOpen, false, "the switcher does not spend a sheet on the common case");
    assert.equal(toggled.label, "3D", "the slot names the pane you are now in");

    // Split and the four elevations stay reachable behind a press-and-hold.
    await page.eval(async () => {
      const view = document.querySelector('[data-mnav="view"]');
      view.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 560));
      view.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      view.click();
    });
    await page.eval(() => new Promise((resolve) => setTimeout(resolve, 120)));
    const views = await page.eval(() => [...document.querySelectorAll("#m-sheet .m-elevation-grid button")]
      .map((button) => button.getAttribute("aria-label")));
    assert.deepEqual(views, ["Front", "Right", "Back", "Left"], "hiding the canvas gizmo does not remove elevations");
    await page.eval(() => document.querySelector('#m-sheet .m-elevation-grid button[aria-label="Front"]').click());
    const elevation = await page.eval(async () => ({
      axis: (await import("./js/state.js")).S.viewAxis,
      sheetOpen: document.getElementById("m-sheet").classList.contains("on"),
    }));
    assert.equal(elevation.axis, "front", "the mobile elevation command changes the 2D projection");
    assert.equal(elevation.sheetOpen, false, "the plan is visible immediately after choosing an elevation");

    /* The hold is a pointer gesture, so without a keyboard equivalent the same
       menu is unreachable without a touchscreen: Enter on the slot only ever
       toggles the pane. Up and the context-menu key both stand in for it. */
    const byKey = await page.eval(async () => {
      const view = document.querySelector('[data-mnav="view"]');
      const open = async (event) => {
        view.dispatchEvent(event);
        await new Promise((resolve) => setTimeout(resolve, 120));
        const on = document.getElementById("m-sheet").classList.contains("on");
        const grid = !!document.querySelector("#m-sheet .m-elevation-grid");
        document.querySelector("#m-sheet .m-sheet-x")?.click();
        await new Promise((resolve) => setTimeout(resolve, 120));
        return on && grid;
      };
      return {
        arrowUp: await open(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true })),
        contextMenu: await open(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
      };
    });
    assert.equal(byKey.arrowUp, true, "Up opens the full View menu from the keyboard");
    assert.equal(byKey.contextMenu, true, "the context-menu key opens it too");
  } finally {
    await page.close();
  }
});

test("Planner placement guidance and dynamic labels stay visible and localized", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "he", mobile: true, touch: true });
  try {
    await page.eval(() => {
      const start = document.getElementById("start-screen");
      if (start) start.hidden = true;
      window.dispatchEvent(new CustomEvent("planner-mobile-onboarding-start"));
      window.dispatchEvent(new CustomEvent("planner-room-created"));
      document.querySelector('[data-mnav="more"]').click();
      document.getElementById("langBtn").click();
    });
    await page.eval(() => new Promise((resolve) => setTimeout(resolve, 160)));
    const localized = await page.eval(() => ({
      lang: document.documentElement.lang,
      sheetClose: document.querySelector("#m-sheet .m-sheet-x")?.getAttribute("aria-label"),
      coachClose: document.querySelector("#m-coach .m-coach-close")?.getAttribute("aria-label"),
      coachCopy: document.querySelector("#m-coach .m-coach-copy")?.textContent.trim(),
      coachAction: document.querySelector("#m-coach .m-coach-action")?.textContent.trim(),
    }));
    assert.equal(localized.lang, "en");
    assert.equal(localized.sheetClose, "Close");
    assert.equal(localized.coachClose, "Close");
    assert.match(localized.coachCopy, /Room created/);
    assert.equal(localized.coachAction, "Add a door");

    const guidance = await page.eval(async () => {
      document.querySelector('[data-mnav="more"]').click();
      const { S } = await import("./js/state.js");
      const { setTool } = await import("./js/interaction.js");
      setTool("door");
      const opening = document.getElementById("cadName").textContent.trim();
      setTool("select");
      S.sel = { kind: "item", ref: { id: "qa-item", name: "Existing item", w: 80, d: 40 } };
      S.placeType = "sofa";
      window.dispatchEvent(new CustomEvent("planner-place"));
      return {
        opening,
        placement: document.getElementById("cadName").textContent.trim(),
        actions: [...document.querySelectorAll("#m-ctx button")].map((button) => button.getAttribute("aria-label")),
        overflow: document.getElementById("m-ctx").scrollWidth > document.getElementById("m-ctx").clientWidth + 1,
      };
    });
    assert.equal(guidance.opening, "Tap a wall to place");
    assert.match(guidance.placement, /Tap the plan to place/);
    assert.deepEqual(guidance.actions.slice(-1), ["Cancel"]);
    assert.equal(guidance.actions.includes("Edit"), false, "placement kept stale selection actions");
    assert.equal(guidance.overflow, false, "placement context row overflows");

    const cancelled = await page.eval(async () => {
      document.querySelector('#m-ctx button[aria-label="Cancel"]').click();
      const { S } = await import("./js/state.js");
      return {
        placeType: S.placeType,
        actions: [...document.querySelectorAll("#m-ctx button")].map((button) => button.getAttribute("aria-label")),
      };
    });
    assert.equal(cancelled.placeType, null, "Cancel left furniture placement armed");
    assert.equal(cancelled.actions.includes("Edit"), true, "selection actions did not return after cancelling placement");
  } finally {
    await page.close();
  }
});

// These tests are about the classic compact chrome — the five-slot navigation
// and the sheets measured against it. The Round-6 phone chrome replaces it by
// default (tests/pro_compact.browser.mjs covers that), so they ask for the
// classic one with localStorage mf.proSkin = "0".
async function classicChrome(page) { await page.eval(() => localStorage.setItem("mf.proSkin", "0")); }
async function proChrome(page) { await page.eval(() => localStorage.removeItem("mf.proSkin")); }

test("short Planner menus hug the bottom and use only their content height", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  await classicChrome(page);
  try {
    for (const [width, height, name] of [
      [390, 844, "phone"],
      [344, 882, "Fold cover"],
      [844, 390, "landscape"],
      [717, 829, "Fold inner"],
    ]) {
      await page.resize(width, height, { mobile: true, touch: true });
      await page.goto("/?bottom-sheet=" + width + "x" + height);
      await page.eval(() => {
        const start = document.getElementById("start-screen");
        if (start) start.hidden = true;
        // Tools now includes wall presets and the complete product catalog;
        // it is intentionally a long menu. View remains the short destination
        // whose natural height this test verifies (modes plus elevations).
        document.querySelector('[data-mnav="view"]').dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
      });
      await page.eval(() => new Promise((resolve) => setTimeout(resolve, 420)));
      await page.waitUntil(() => document.getElementById("m-sheet").getAnimations().every((animation) => animation.playState !== "running"), { what: "the short View sheet slide to settle" });
      const layout = await page.eval(() => {
        const sheet = document.getElementById("m-sheet");
        const body = document.getElementById("m-sheet-body");
        const head = sheet.querySelector(".m-sheet-head");
        const ctx = document.getElementById("m-ctx");
        const sr = sheet.getBoundingClientRect(), cr = ctx.getBoundingClientRect();
        const expected = head.getBoundingClientRect().height + body.scrollHeight
          + parseFloat(getComputedStyle(sheet).paddingBottom || 0)
          + parseFloat(getComputedStyle(sheet).borderTopWidth || 0);
        return {
          top: sr.top,
          bottom: sr.bottom,
          height: sr.height,
          expected,
          ctxTop: cr.top,
          viewport: innerHeight,
          posture: document.body.className,
        };
      });
      assert.ok(Math.abs(layout.bottom - layout.ctxTop) <= 1, name + ": sheet is attached to the thumb rows " + JSON.stringify(layout));
      assert.ok(Math.abs(layout.height - layout.expected) <= 4, name + ": no unused vertical menu space " + JSON.stringify(layout));
      assert.ok(layout.top > 0, name + ": a short menu never reaches the top edge");
      assert.ok(layout.height < layout.viewport * 0.55, name + ": canvas stays visible above the menu");
    }
  } finally {
    await proChrome(page).catch(() => {}); await page.close();
  }
});

test("Planner Properties is a clipped-free page deck across common phone and Fold sizes", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  await classicChrome(page);
  const sizes = [
    [390, 844, "phone portrait"],
    [344, 882, "Fold cover"],
    [844, 390, "phone landscape"],
    [717, 829, "Fold inner"],
  ];
  let sawMultiPage = false;
  try {
    for (const [width, height, name] of sizes) {
      await page.resize(width, height, { mobile: true, touch: true });
      await page.goto("/?menu-pages-test=" + width + "x" + height);
      await page.eval(async () => {
        const start = document.getElementById("start-screen");
        if (start) start.hidden = true;
        const { S } = await import("./js/state.js");
        S.sel = { kind: "opening", ref: { id: "menu-test-opening" } };
        document.querySelectorAll("#right-inspector .props").forEach((node) => node.classList.remove("on"));
        document.getElementById("openProps").classList.add("on");
        document.getElementById("doorSpecific").style.display = "none";
        document.getElementById("o_frame_box").style.display = "flex";
        const props = document.querySelector('[data-mnav="props"]');
        props.disabled = false;
        props.click();
      });
      await page.eval(() => new Promise((resolve) => setTimeout(resolve, 420)));

      const layout = await page.eval(() => {
        const panel = document.getElementById("right-inspector");
        const nav = document.getElementById("mobile-nav");
        const ctx = document.getElementById("m-ctx");
        const pages = [...document.querySelectorAll("#openProps .mobile-menu-page")];
        const active = pages.filter((node) => node.classList.contains("on"));
        const input = document.getElementById("o_w");
        const pr = panel.getBoundingClientRect();
        const nr = nav.getBoundingClientRect();
        const cr = ctx.getBoundingClientRect();
        return {
          body: document.body.className,
          pageCount: pages.length,
          activeCount: active.length,
          panelTop: pr.top,
          panelBottom: pr.bottom,
          controlsTop: Math.min(nr.top, cr.top),
          inputHeight: input.getBoundingClientRect().height,
          panelOverflow: getComputedStyle(panel).overflowY,
          panelBottomCss: getComputedStyle(panel).bottom,
          navBlock: getComputedStyle(document.body).getPropertyValue("--mobile-nav-block"),
          ctxReserve: getComputedStyle(document.body).getPropertyValue("--m-ctx-reserve"),
          activeFits: active.length === 1 && active[0].scrollHeight <= active[0].clientHeight + 2,
          firstCount: document.querySelector("#openProps .mobile-page-count")?.textContent,
        };
      });

      assert.match(layout.body, /compact-nav/, name + ": compact posture");
      assert.ok(layout.pageCount >= 1, name + ": inspector has a page deck " + JSON.stringify(layout));
      sawMultiPage ||= layout.pageCount > 1;
      assert.equal(layout.activeCount, 1, name + ": exactly one page participates in layout");
      assert.ok(layout.panelTop >= 0, name + ": panel starts on-screen");
      if (name === "Fold inner") {
        assert.match(layout.body, /dock-rail/, name + ": dock-rail posture");
        assert.equal(layout.panelOverflow, "auto", name + ": dock-rail panel is a docked scrollable column");
      } else {
        assert.ok(layout.panelBottom <= layout.controlsTop + 1, name + ": panel ends above thumb controls " + JSON.stringify(layout));
        assert.equal(layout.panelOverflow, "hidden", name + ": panel is not a continuous scroll");
      }
      assert.equal(Math.round(layout.inputHeight), 44, name + ": compact fields retain touch height");
      assert.ok(layout.activeFits, name + ": active card is not clipped");
      assert.match(layout.firstCount || "", /^1 \/ /, name + ": page counter starts at one");

      const after = await page.eval(() => {
        const next = document.querySelector("#openProps .mobile-page-arrow:last-child");
        if (!next.disabled) next.click();
        return {
          count: document.querySelector("#openProps .mobile-page-count").textContent,
          active: [...document.querySelectorAll("#openProps .mobile-menu-page")]
            .findIndex((node) => node.classList.contains("on")),
        };
      });
      if (layout.pageCount > 1) {
        assert.equal(after.active, 1, name + ": next arrow switches whole pages");
        assert.match(after.count, /^2 \/ /, name + ": counter follows the page");
      } else {
        assert.equal(after.active, 0, name + ": a fitting card stays on its only page");
        assert.equal(after.count, "1 / 1", name + ": fitting content adds no empty page");
      }
    }
    assert.ok(sawMultiPage, "the short/common postures exercise real multi-page navigation");
  } finally {
    await proChrome(page).catch(() => {}); await page.close();
  }
});

test("Model Editor and Cabinet sheets use the same one-card-at-a-time contract", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  await classicChrome(page);
  await page.goto("/");
  try {
    await page.eval(() => {
      const start = document.getElementById("start-screen");
      if (start) start.hidden = true;
      document.getElementById("openModelerTop").click();
    });
    await page.waitUntil(() => {
      const el = document.getElementById("modeler");
      return !!el && getComputedStyle(el).display !== "none";
    }, { what: "the model editor to open" });
    await page.eval(() => {
      const start = document.querySelector('#mdWelcome [data-welcome-start="continue"]');
      if (start) start.click();
    });
    await page.eval(() => new Promise((resolve) => setTimeout(resolve, 300)));
    await page.eval(() => document.querySelector('[data-mdnav="more"]').click());
    await page.eval(() => new Promise((resolve) => setTimeout(resolve, 250)));
    const modeler = await page.eval(() => {
      const sheet = document.getElementById("md-sheet");
      const nav = document.getElementById("md-nav");
      const sr = sheet.getBoundingClientRect(), nr = nav.getBoundingClientRect();
      return {
        paged: !!sheet.querySelector(".mobile-page-shell"),
        active: sheet.querySelectorAll(".mobile-menu-page.on").length,
        bottom: sr.bottom,
        controlsTop: nr.top,
        overflow: getComputedStyle(sheet.querySelector("#md-sheet-body")).overflowY,
        scrollH: sheet.querySelector("#md-sheet-body").scrollHeight,
        clientH: sheet.querySelector("#md-sheet-body").clientHeight,
        bodyClass: document.body.className,
        hostClass: sheet.querySelector("#md-sheet-body").className,
        shellParent: sheet.querySelector(".mobile-page-shell")?.parentElement?.className,
      };
    });
    /* "One card at a time" is about what the user SEES, not about whether a
       pager object exists. A sheet whose content already fits is one card, and
       mobile_pages.js refuses to page it ("the pager appears only when it
       removes scrolling rather than adding navigation") — when it did page one
       anyway, the controls stranded on page two laid out at 0x0 and could not
       be tapped. So: page only when needed, one active card when paged, and
       never a continuously scrolling sheet either way. */
    if (modeler.paged) assert.equal(modeler.active, 1, "Model Editor lays out one card");
    assert.ok(modeler.bottom <= modeler.controlsTop + 1, "Model Editor ends above navigation");
    assert.ok(
      modeler.scrollH <= modeler.clientH + 1,
      "Model Editor sheet scrolls continuously " + JSON.stringify(modeler),
    );

    await page.goto("/?cabinet-pages-test=1");
    await page.eval(async () => {
      const start = document.getElementById("start-screen");
      if (start) start.hidden = true;
      const [{ openCabinet }, { S }] = await Promise.all([
        import("./js/ui_cabinet.js"),
        import("./js/state.js"),
      ]);
      const item = { id: "menu-page-cab", type: "cabsys", x: 0, y: 0, z: 0, w: 100, h: 210, d: 60, rot: 0 };
      S.items.push(item);
      openCabinet(item);
    });
    await page.eval(() => new Promise((resolve) => {
      const until = performance.now() + 2500;
      const poll = () => document.querySelector('[data-cbnav="more"]') || performance.now() > until
        ? resolve()
        : setTimeout(poll, 40);
      poll();
    }));
    await page.eval(() => {
      const more = document.querySelector('[data-cbnav="more"]');
      if (!more) throw new Error("Cabinet mobile navigation did not mount");
      more.click();
    });
    await page.eval(() => new Promise((resolve) => setTimeout(resolve, 250)));
    await page.waitUntil(() => document.querySelector("#cabdes .cb-m-sheet").getAnimations().every((animation) => animation.playState !== "running"), { what: "the Cabinet More sheet slide to settle" });
    const cabinet = await page.eval(() => {
      const sheet = document.querySelector("#cabdes .cb-m-sheet");
      const nav = document.querySelector("#cabdes .cb-m-nav");
      const sr = sheet.getBoundingClientRect(), nr = nav.getBoundingClientRect();
      return {
        paged: !!sheet.querySelector(".mobile-page-shell"),
        active: sheet.querySelectorAll(".mobile-menu-page.on").length,
        bottom: sr.bottom,
        controlsTop: nr.top,
        overflow: getComputedStyle(sheet.querySelector(".cbm-body")).overflowY,
        scrollH: sheet.querySelector(".cbm-body").scrollHeight,
        clientH: sheet.querySelector(".cbm-body").clientHeight,
      };
    });
    if (cabinet.paged) assert.equal(cabinet.active, 1, "Cabinet lays out one card");
    assert.ok(cabinet.bottom <= cabinet.controlsTop + 1, "Cabinet ends above navigation " + JSON.stringify(cabinet));
    assert.ok(
      cabinet.scrollH <= cabinet.clientH + 1,
      "Cabinet sheet scrolls continuously " + JSON.stringify(cabinet),
    );
  } finally {
    await proChrome(page).catch(() => {}); await page.close();
  }
});

test("mobile selection identity lives in the top row above translucent Properties", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    // the classic chrome's top row and glass Properties (the Round-6 layout names
    // the selection in its one-row header, js/pro_compact.js, and its sheets are solid)
    await classicChrome(page);
    for (const [width, height, name] of [[390, 844, "phone"], [344, 882, "Fold cover"], [717, 829, "Fold inner"]]) {
      await page.resize(width, height, { mobile: true, touch: true });
      await page.goto("/?wall-identity=" + width);
      await page.eval(async () => {
        const start = document.getElementById("start-screen");
        if (start) start.hidden = true;
        const { S } = await import("./js/state.js");
        S.sel = { kind: "wall", ref: { id: 1 } };
        document.querySelectorAll("#right-inspector .props").forEach((node) => node.classList.remove("on"));
        document.getElementById("wallProps").classList.add("on");
        document.getElementById("selname").textContent = "Wall 1";
        const phase = document.getElementById("w_phasePill");
        phase.hidden = false;
        phase.className = "wi-phase ph-new";
        phase.textContent = "New";
        const props = document.querySelector('[data-mnav="props"]');
        props.disabled = false;
        props.click();
        window.dispatchEvent(new CustomEvent("planner-selection"));
      });
      await page.eval(() => new Promise((resolve) => setTimeout(resolve, 420)));
      const layout = await page.eval(() => {
        const alphaOf = (color) => {
          const slash = color.match(/\/\s*([\d.]+)\s*\)/);
          if (slash) return Number(slash[1]);
          const rgba = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);
          return rgba ? Number(rgba[1]) : 1;
        };
        const topbar = document.getElementById("topbar");
        const identity = document.getElementById("m-top-selection");
        const phase = document.getElementById("m-top-selection-phase");
        const wall = document.getElementById("m-top-selection-name");
        const start = topbar.querySelector(".tb-start");
        const end = topbar.querySelector(".tb-end");
        const localIdentity = document.querySelector("#wallProps .wi-identity");
        const panel = document.getElementById("right-inspector");
        const input = document.getElementById("w_len");
        const tr = topbar.getBoundingClientRect(), ir = identity.getBoundingClientRect();
        const pr = phase.getBoundingClientRect(), wr = wall.getBoundingClientRect();
        const sr = start.getBoundingClientRect(), er = end.getBoundingClientRect();
        return {
          hidden: identity.hidden,
          name: wall.textContent,
          phase: phase.textContent,
          topbarHeight: tr.height,
          centreDelta: Math.abs((wr.left + wr.width / 2) - (ir.left + ir.width / 2)),
          phaseAbove: pr.bottom <= wr.top + 1,
          noOverlap: ir.left >= sr.right - 1 &&
            (getComputedStyle(end).display === "none" || ir.right <= er.left + 1),
          phaseSize: parseFloat(getComputedStyle(phase).fontSize),
          nameSize: parseFloat(getComputedStyle(wall).fontSize),
          textAlign: getComputedStyle(wall).textAlign,
          localDisplay: getComputedStyle(localIdentity).display,
          panelBackground: getComputedStyle(panel).backgroundColor,
          panelAlpha: alphaOf(getComputedStyle(panel).backgroundColor),
          panelBlur: getComputedStyle(panel).backdropFilter,
          inputBackground: getComputedStyle(input).backgroundColor,
          auxiliaryDisplays: [".cost-section", ".env-section", ".friends-section", ".site-section"]
            .map((selector) => getComputedStyle(document.querySelector("#right-inspector > " + selector)).display),
        };
      });
      assert.equal(layout.hidden, false, name + ": selection title is visible");
      assert.equal(layout.name, "Wall 1", name + ": live selection name is mirrored");
      assert.equal(layout.phase, "New", name + ": wall phase is mirrored");
      assert.equal(Math.round(layout.topbarHeight), 48, name + ": title does not enlarge the top row");
      assert.ok(layout.centreDelta <= 1, name + ": name is centred in its column");
      assert.ok(layout.phaseAbove, name + ": phase sits above the name");
      assert.ok(layout.noOverlap, name + ": title does not collide with global actions " + JSON.stringify(layout));
      assert.ok(layout.nameSize >= 15 && layout.phaseSize <= 8, name + ": name/phase hierarchy");
      assert.equal(layout.textAlign, "center", name + ": name alignment");
      assert.equal(layout.localDisplay, "none", name + ": Properties does not repeat the title");
      assert.notEqual(layout.panelBlur, "none", name + ": Properties has a real glass blur");
      assert.ok(layout.panelAlpha >= 0.75 && layout.panelAlpha <= 0.95, name + ": Properties has a readable translucent layer " + JSON.stringify(layout));
      assert.notEqual(layout.panelBackground, layout.inputBackground, name + ": fields retain a distinct readable backing");
      assert.deepEqual(layout.auxiliaryDisplays, ["none", "none", "none", "none"], name + ": no empty accordion stripes remain");
    }
  } finally {
    await proChrome(page).catch(() => {});
    await page.close();
  }
});
