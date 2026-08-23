/* Real-layout tests for the desktop model editor.
 *
 * Exercises the desktop CAD shell: 3-column docked layout (tree, viewport, inspector),
 * ribbon command manager, workflow breadcrumbs, command search palette, shortcut bar,
 * confirmation corner / context actions, reference plane picker, assembly mode toggle,
 * interactive tutorial guide, and RTL mirroring across desktop resolutions.
 *
 * Skips itself when Chrome is absent — set CHROME_PATH to point at a binary.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

const NO_GL = /getSupportedExtensions|WebGL|WebGPU|GPUAdapter|three\.webgpu/i;

let shared = null;
async function freshDesktopCtx({ width = 1280, height = 800, lang = "en" } = {}) {
  if (!chrome) return null;
  if (!shared) {
    shared = await openPage({ width, height, lang, mobile: false, touch: false });
    shared.lang = lang;
  } else {
    await shared.resize(width, height, { mobile: false, touch: false });
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
  const page = await freshDesktopCtx(options);
  await openDesktopEditor(page);
  return page;
}

test.after(async () => {
  if (shared) await shared.close();
});

// Open the editor and dismiss the welcome layer if present
async function openDesktopEditor(page) {
  await page.eval(() => {
    // If already open, close cleanly first
    const existing = document.getElementById("modeler");
    if (existing && existing.style.display !== "none") {
      window.confirm = () => true;
      const closeBtn = document.getElementById("mdClose");
      if (closeBtn) closeBtn.click();
    }
    document.getElementById("openModelerTop").click();
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 400)));
  await page.eval(() => {
    const c = document.querySelector('#mdWelcome [data-welcome-start="continue"]') || document.querySelector(".md-welcome-close");
    if (c) c.click();
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));
}

/* ---- Test Suite --------------------------------------------------------- */

for (const lang of ["en", "he"]) {
  for (const [w, h] of [[1024, 768], [1280, 800], [1920, 1080]]) {
    test(`desktop model editor @ ${w}x${h} (${lang}): 3-column shell layout integrity`, opts, async () => {
      const page = await ctx({ width: w, height: h, lang });
      const layout = await page.eval(() => {
        const root = document.getElementById("modeler");
        const head = root.querySelector(".md-head");
        const wf = root.querySelector(".md-workflow");
        const cm = root.querySelector(".md-commandmanager");
        const body = root.querySelector(".md-body");
        const left = root.querySelector(".md-left");
        const mid = root.querySelector(".md-mid");
        const right = root.querySelector(".md-right");
        const hr = head.getBoundingClientRect();
        const wfr = wf.getBoundingClientRect();
        const cmr = cm.getBoundingClientRect();
        const br = body.getBoundingClientRect();
        const lr = left.getBoundingClientRect();
        const mr = mid.getBoundingClientRect();
        const rr = right.getBoundingClientRect();

        const isRTL = document.documentElement.dir === "rtl" || document.body.dir === "rtl";
        const sideBySide = isRTL
          ? (rr.right <= mr.left + 2 && mr.right <= lr.left + 2) || (lr.right <= mr.left + 2 && mr.right <= rr.left + 2)
          : (lr.right <= mr.left + 2 && mr.right <= rr.left + 2);

        return {
          isCompactNav: document.body.classList.contains("compact-nav"),
          headH: hr.height,
          headW: hr.width,
          wfH: wfr.height,
          cmH: cmr.height,
          leftW: lr.width,
          midW: mr.width,
          rightW: rr.width,
          bodyH: br.height,
          fullHeightFits: br.bottom <= window.innerHeight + 1,
          sideBySide,
          mobileNavExists: !!document.getElementById("md-nav"),
          mobileSheetOpen: !!document.getElementById("md-sheet")?.classList.contains("on"),
        };
      });

      assert.equal(layout.isCompactNav, false, "desktop should not have compact-nav");
      assert.equal(layout.mobileNavExists, false, "mobile nav should not exist on desktop");
      assert.equal(layout.mobileSheetOpen, false, "mobile bottom sheet should not be open");
      assert.ok(layout.leftW >= 220, `left panel too narrow: ${layout.leftW}px`);
      assert.ok(layout.rightW >= 260, `right panel too narrow: ${layout.rightW}px`);
      assert.ok(layout.midW >= 350, `viewport too narrow: ${layout.midW}px`);
      assert.equal(layout.sideBySide, true, "panels are not laid out side-by-side");
      assert.equal(layout.fullHeightFits, true, "body overflows window height");
    });

    test(`desktop model editor @ ${w}x${h} (${lang}): workflow breadcrumbs fit without overflow`, opts, async () => {
      const page = await ctx({ width: w, height: h, lang });
      const wf = await page.eval(() => {
        const bar = document.getElementById("mdWorkflow");
        const steps = [...bar.querySelectorAll("[data-workflow-step]")];
        return {
          count: steps.length,
          overflows: bar.scrollWidth > bar.clientWidth + 1,
          steps: steps.map((s) => ({
            name: s.dataset.workflowStep,
            w: Math.round(s.getBoundingClientRect().width),
            active: s.classList.contains("active"),
          })),
        };
      });

      assert.equal(wf.count, 5, "expected 5 workflow steps");
      assert.equal(wf.overflows, false, "workflow breadcrumbs overflow bar width");
      assert.ok(wf.steps.every((s) => s.w > 40), "every step has a visible clickable width");
    });
  }
}

test("desktop model editor: ribbon tabs switch panes with full command visibility", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  for (const tabKey of ["features", "sketch", "evaluate", "assembly"]) {
    await page.eval((k) => {
      document.querySelector(`.md-command-tabs [data-cmdtab="${k}"]`).click();
    }, tabKey);
    await page.eval(() => new Promise((r) => setTimeout(r, 150)));

    const tabState = await page.eval((k) => {
      const pane = document.querySelector(`.md-command-pane[data-command-pane="${k}"]`);
      const tabBtn = document.querySelector(`.md-command-tabs [data-cmdtab="${k}"]`);
      const isPaneOn = pane && pane.classList.contains("on") && getComputedStyle(pane).display === "flex";
      const isTabOn = tabBtn && tabBtn.classList.contains("on");
      const cmds = [...(pane?.querySelectorAll(".md-command") || [])];
      const visibleCmds = cmds.filter((c) => getComputedStyle(c).display !== "none");
      return { isPaneOn, isTabOn, cmdCount: visibleCmds.length };
    }, tabKey);

    assert.equal(tabState.isPaneOn, true, `pane ${tabKey} not visible`);
    assert.equal(tabState.isTabOn, true, `tab ${tabKey} not marked active`);
    assert.ok(tabState.cmdCount >= 8, `tab ${tabKey} has only ${tabState.cmdCount} commands`);
  }
});

test("desktop model editor: command search palette opens, filters, and closes via Escape", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  await page.eval(() => document.getElementById("mdCommandSearchBtn").click());
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));

  const searchOpen = await page.eval(() => {
    const modal = document.querySelector(".md-command-search");
    const input = modal?.querySelector("input");
    return {
      open: modal && !modal.hidden && getComputedStyle(modal).display !== "none",
      inputFocused: document.activeElement === input,
    };
  });
  assert.equal(searchOpen.open, true, "command search modal did not open");
  assert.equal(searchOpen.inputFocused, true, "command search input was not focused");

  await page.eval(() => {
    const input = document.querySelector(".md-command-search input");
    if (input) {
      input.value = "Extrude";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 150)));

  const searchFilter = await page.eval(() => {
    const results = [...document.querySelectorAll(".md-command-result")];
    return {
      count: results.length,
      hasExtrude: results.some((r) => /extrude/i.test(r.textContent)),
    };
  });
  assert.ok(searchFilter.count > 0, "search returned no results");
  assert.equal(searchFilter.hasExtrude, true, "search did not find Extrude command");

  await page.eval(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 150)));

  const searchClosed = await page.eval(() => {
    const modal = document.querySelector(".md-command-search");
    return !modal || modal.hidden || getComputedStyle(modal).display === "none";
  });
  assert.equal(searchClosed, true, "command search modal did not close on Escape");
});

test("desktop model editor: shortcut bar opens on 'S' key and closes on Escape", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  await page.eval(() => {
    const target = document.getElementById("mdCanvas") || document.querySelector(".md-mid");
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }));
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));

  const shortcutBar = await page.eval(() => {
    const bar = document.getElementById("mdShortcutBar");
    return bar && !bar.hidden && getComputedStyle(bar).display !== "none";
  });
  assert.equal(shortcutBar, true, "shortcut bar did not open on 'S' key");

  await page.eval(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 150)));

  const shortcutClosed = await page.eval(() => {
    const bar = document.getElementById("mdShortcutBar");
    return !bar || bar.hidden || getComputedStyle(bar).display === "none";
  });
  assert.equal(shortcutClosed, true, "shortcut bar did not close on Escape");
});

test("desktop model editor: parametric sketch workflow opens plane picker, enters sketch, and accepts", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  await page.eval(() => {
    const btn = document.querySelector('.md-command[data-md-action="newsketch"]') ||
                [...document.querySelectorAll(".md-command")].find((b) => /sketch/i.test(b.textContent));
    if (btn) btn.click();
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 250)));

  const planePicker = await page.eval(() => {
    const picker = document.querySelector(".md-reference-picker");
    const options = [...(picker?.querySelectorAll(".md-reference-option") || [])];
    return {
      open: picker && !picker.hidden && getComputedStyle(picker).display !== "none",
      optionsCount: options.length,
    };
  });
  assert.equal(planePicker.open, true, "reference plane picker modal did not open");
  assert.ok(planePicker.optionsCount >= 3, "expected at least 3 standard reference planes");

  // Select Top plane
  await page.eval(() => {
    const opts = [...document.querySelectorAll(".md-reference-option")];
    const topOpt = opts.find((o) => /top/i.test(o.textContent)) || opts[0];
    if (topOpt) topOpt.click();
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));

  const sketchMode = await page.eval(() => {
    const wf = document.getElementById("mdWorkflow");
    const activeStep = wf.querySelector("[data-workflow-step].active")?.getAttribute("data-workflow-step");
    const ribbonTab = document.querySelector(".md-command-tabs > button.on")?.getAttribute("data-cmdtab");
    const contextActions = document.getElementById("mdContextActions");
    const isContextActionsVisible = contextActions && !contextActions.hidden && getComputedStyle(contextActions).display !== "none";
    return { activeStep, ribbonTab, isContextActionsVisible };
  });

  assert.equal(sketchMode.activeStep, "sketch", "workflow did not transition to sketch step");
  assert.equal(sketchMode.ribbonTab, "sketch", "ribbon did not switch to sketch tab");
  assert.equal(sketchMode.isContextActionsVisible, true, "context actions (confirm corner) not visible");

  // Accept sketch
  await page.eval(() => {
    const okBtn = document.getElementById("mdAcceptCommand");
    if (okBtn) okBtn.click();
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 350)));

  const afterSketch = await page.eval(() => {
    const ribbonTab = document.querySelector(".md-command-tabs > button.on")?.getAttribute("data-cmdtab");
    return ribbonTab;
  });
  assert.equal(afterSketch, "features", "ribbon did not return to features after sketch");
});

test("desktop model editor: Document Mode switches to Assembly and back cleanly", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  await page.eval(() => document.querySelector('#mdDocModes [data-doc="assembly"]').click());
  await page.eval(() => new Promise((r) => setTimeout(r, 250)));

  const assemblyState = await page.eval(() => {
    const root = document.getElementById("modeler");
    const isAssemblyCls = root.classList.contains("md-assembly");
    const activeTab = document.querySelector(".md-command-tabs > button.on")?.getAttribute("data-cmdtab");
    const docBtn = document.querySelector('#mdDocModes [data-doc="assembly"]');
    return {
      isAssemblyCls,
      activeTab,
      docBtnOn: docBtn?.classList.contains("on"),
    };
  });
  assert.equal(assemblyState.isAssemblyCls, true, "root missing md-assembly class");
  assert.equal(assemblyState.activeTab, "assembly", "ribbon did not switch to assembly tab");
  assert.equal(assemblyState.docBtnOn, true, "assembly mode button not active");

  await page.eval(() => document.querySelector('#mdDocModes [data-doc="part"]').click());
  await page.eval(() => new Promise((r) => setTimeout(r, 250)));

  const partState = await page.eval(() => {
    const root = document.getElementById("modeler");
    const isAssemblyCls = root.classList.contains("md-assembly");
    const docBtn = document.querySelector('#mdDocModes [data-doc="part"]');
    return {
      isAssemblyCls,
      docBtnOn: docBtn?.classList.contains("on"),
    };
  });
  assert.equal(partState.isAssemblyCls, false, "root still has md-assembly class in part mode");
  assert.equal(partState.docBtnOn, true, "part mode button not active");
});

test("desktop model editor: section controls and collapsible side panels are operable", opts, async () => {
  const page = await ctx({ width: 1024, height: 768, lang: "en" });
  await page.eval(() => document.querySelector('[data-command="section"]').click());
  await page.eval(() => new Promise((r) => setTimeout(r, 100)));

  const sectionOpen = await page.eval(() => {
    const controls = document.getElementById("mdSectionControls");
    const y = controls?.querySelector('[data-section-axis="y"]');
    y?.click();
    const slider = document.getElementById("mdSectionOffset");
    if (slider) {
      slider.value = "25";
      slider.dispatchEvent(new Event("input", { bubbles:true }));
    }
    return {
      visible: !!controls && !controls.hidden && getComputedStyle(controls).display !== "none",
      yActive: !!y?.classList.contains("on"),
      value: document.getElementById("mdSectionValue")?.textContent,
    };
  });
  assert.equal(sectionOpen.visible, true, "section controls did not open");
  assert.equal(sectionOpen.yActive, true, "section axis did not switch to Y");
  assert.match(sectionOpen.value || "", /25/);

  await page.eval(() => {
    document.getElementById("mdToggleLeft").click();
    document.getElementById("mdToggleRight").click();
  });
  const collapsed = await page.eval(() => {
    const root = document.getElementById("modeler");
    return {
      left: root.classList.contains("md-left-collapsed"),
      right: root.classList.contains("md-right-collapsed"),
      viewport: Math.round(root.querySelector(".md-mid").getBoundingClientRect().width),
    };
  });
  assert.equal(collapsed.left, true);
  assert.equal(collapsed.right, true);
  assert.ok(collapsed.viewport > 900, `collapsed viewport is only ${collapsed.viewport}px wide`);

  const unnamed = await page.eval(() => [...document.querySelectorAll("#modeler button")]
    .filter((button) => {
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || rect.width < 1 || rect.height < 1) return false;
      const label = button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent.trim();
      return !label;
    }).length);
  assert.equal(unnamed, 0, `${unnamed} visible model-editor buttons have no accessible name`);

  await page.eval(() => document.getElementById("mdSectionClose").click());
  const sectionClosed = await page.eval(() => document.getElementById("mdSectionControls").hidden);
  assert.equal(sectionClosed, true, "section controls did not close");
});

test("desktop model editor: interactive tutorial opens SolidWorks CAD track and navigates steps", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  await page.eval(() => document.getElementById("mdGuide").click());
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));

  const tourState = await page.eval(() => {
    const tour = document.getElementById("mdTour");
    const tracks = [...document.querySelectorAll("#mdTourTracks [data-tour-track]")].map((b) => b.getAttribute("data-tour-track"));
    return {
      open: tour && !tour.hidden && getComputedStyle(tour).display !== "none",
      tracks,
    };
  });
  assert.equal(tourState.open, true, "tutorial layer did not open");
  assert.ok(tourState.tracks.includes("solidworks"), "SolidWorks CAD track missing from tutorial tracks");

  await page.eval(() => {
    const track = document.querySelector('[data-tour-track="solidworks"]');
    if (track) track.click();
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));

  await page.eval(() => {
    const modeBtn = document.querySelector('[data-tour-mode="interactive"]') || document.querySelector('[data-tour-mode]');
    if (modeBtn) modeBtn.click();
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));

  const step1 = await page.eval(() => ({
    count: document.getElementById("mdTourCount")?.textContent.trim(),
    hasNext: !document.getElementById("mdTourNext")?.disabled,
  }));
  assert.match(step1.count, /1\s*(?:\/|of|מתוך)\s*16/);
  assert.equal(step1.hasNext, true, "tutorial next button is disabled on step 1");

  await page.eval(() => document.getElementById("mdTourNext").click());
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));

  const step2 = await page.eval(() => ({
    count: document.getElementById("mdTourCount")?.textContent.trim(),
  }));
  assert.match(step2.count, /2\s*(?:\/|of|מתוך)\s*16/);

  await page.eval(() => document.getElementById("mdTourClose").click());
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));

  const tourClosed = await page.eval(() => {
    const tour = document.getElementById("mdTour");
    return !tour || tour.hidden || getComputedStyle(tour).display === "none";
  });
  assert.equal(tourClosed, true, "tutorial did not close cleanly");
});

test("desktop model editor: closing editor restores background and leaves no uncaught errors", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  await page.eval(() => {
    window.confirm = () => true;
    document.getElementById("mdClose").click();
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));

  const closed = await page.eval(() => {
    const root = document.getElementById("modeler");
    const app = document.getElementById("app");
    return {
      rootHidden: !root || root.style.display === "none",
      appInert: app ? app.inert : false,
    };
  });
  assert.equal(closed.rootHidden, true, "modeler root is still visible after close");
  assert.equal(closed.appInert, false, "planner app background is still inert after modeler close");

  const errors = page.consoleErrors.filter((e) => !NO_GL.test(e));
  assert.deepEqual(errors, [], "uncaught errors during desktop editor session");
});
