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

/* The model library lives in IndexedDB and only adopts the localStorage list
   when that store is empty, so writing home3d_models is not enough on a browser
   profile a previous test has already seeded — the first fixture stays and the
   second silently never appears. Clear the store, then seed. */
async function seedModelLibrary(page, models) {
  await page.eval(async (list) => {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase("home3d_model_library");
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    localStorage.setItem("home3d_models", JSON.stringify(list));
    localStorage.removeItem("home3d_assemblies");
    localStorage.removeItem("home3d_modeler_draft");
  }, models);
  await page.goto("/");
  await openDesktopEditor(page);
}

/* Assembly mode inherited the part editor's chrome wholesale: a breadcrumb
   reading Part → Reference → Sketch → Feature → History, panes called Sketch /
   Shape / Finish, a Start-screen chip parked over a populated model, and a
   filter strip tucked under the Tree toggle with its first two buttons
   unreachable. Each of those is a thing that looks fine in a screenshot and is
   wrong the moment you try to use it. */
test("desktop model editor: assembly mode wears its own chrome", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  await seedModelLibrary(page, [
    { key: "tA", name: "Test A", w: 20, d: 10, h: 10, parts: [{ id: "tA-p", kind: "box", x0: -10, x1: 10, y0: 0, y1: 10, z0: -5, z1: 5 }] },
    { key: "tB", name: "Test B", w: 12, d: 10, h: 10, parts: [{ id: "tB-p", kind: "box", x0: -6, x1: 6, y0: 0, y1: 10, z0: -5, z1: 5 }] },
  ]);
  await page.eval(() => document.querySelector('#mdDocModes [data-doc="assembly"]').click());
  await page.eval(() => new Promise((r) => setTimeout(r, 350)));

  const chrome = await page.eval(() => ({
    steps: [...document.querySelectorAll("[data-workflow-step]")].map((b) => b.querySelector("b").textContent),
    tabs: [...document.querySelectorAll("#modeler [data-tab]")]
      .filter((b) => getComputedStyle(b).display !== "none")
      .map((b) => b.querySelector("span")?.textContent),
    sketchTabShown: getComputedStyle(document.querySelector('#modeler [data-tab="sketch"]')).display !== "none",
  }));
  assert.equal(chrome.steps.length, 5, "the breadcrumb keeps its five slots");
  assert.deepEqual(chrome.steps, ["Insert", "Ground", "Mate", "Check", "BOM"], "assembly steps, not part steps");
  assert.equal(chrome.sketchTabShown, false, "nothing is sketched in an assembly");
  for (const label of ["Placement", "Component", "Mates"]) {
    assert.ok(chrome.tabs.includes(label), "inspector is missing the " + label + " pane");
  }
  for (const label of ["Sketch", "Shape", "Finish"]) {
    assert.ok(!chrome.tabs.includes(label), "part pane " + label + " is still on show in an assembly");
  }

  // the selection filters must not sit under the Tree toggle, and context toolbar must not overlap filters or move-mode
  const overlap = await page.eval(() => {
    const toggle = document.getElementById("mdToggleLeft").getBoundingClientRect();
    const filters = document.getElementById("mdSelFilters").getBoundingClientRect();
    const first = document.querySelector("#mdSelFilters button").getBoundingClientRect();
    const hidden = first.left < toggle.right && first.right > toggle.left
      && first.top < toggle.bottom && first.bottom > toggle.top;

    const ctxToolbar = document.getElementById("mdContextToolbar");
    ctxToolbar.hidden = false;
    ctxToolbar.innerHTML = '<button type="button" aria-label="Isolate"></button>';
    const cRect = ctxToolbar.getBoundingClientRect();
    const moveMode = document.getElementById("mdAssemblyMoveMode").getBoundingClientRect();
    const overlapAny = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;

    return {
      hidden,
      filtersVisible: filters.width > 0,
      overlapFilters: overlapAny(cRect, filters),
      overlapMove: overlapAny(cRect, moveMode),
    };
  });
  assert.equal(overlap.filtersVisible, true, "the filter strip is not laid out");
  assert.equal(overlap.hidden, false, "the first filter is behind the Tree toggle");
  assert.equal(overlap.overlapFilters, false, "context toolbar overlaps selection filters in assembly");
  assert.equal(overlap.overlapMove, false, "context toolbar overlaps move direction toolbar in assembly");

  // and the Start screen chip steps aside once the assembly has content
  const chipEmpty = await page.eval(() => !document.getElementById("mdEmptyStart").hidden);
  const inserted = await page.eval(() => {
    const select = document.querySelector("#mdParts .md-insert-component select");
    const add = document.querySelector("#mdParts .md-insert-component button");
    if (!select || !add || !select.options.length) return false;
    select.value = select.options[0].value;
    add.click();
    return true;
  });
  assert.equal(inserted, true, "the seeded library never reached the insert dropdown");
  await page.eval(() => new Promise((r) => setTimeout(r, 500)));
  const after = await page.eval(() => ({
    chip: !document.getElementById("mdEmptyStart").hidden,
    steps: [...document.querySelectorAll("[data-workflow-step] small")].map((s) => s.textContent),
  }));
  assert.equal(chipEmpty, true, "the chip belongs on an empty assembly");
  assert.equal(after.chip, false, "the chip stayed over a populated assembly");
  assert.equal(after.steps[0], "1 component", "counts read as singular at one");
});

test("desktop model editor: assembly components drag with mouse and touch", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  await seedModelLibrary(page, [
    { key: "dragPart", name: "Drag part", w: 16, d: 12, h: 10,
      parts: [{ id: "drag-body", kind: "cyl", x: 0, y: 0, z: 0, r: 6, h: 10 }] },
  ]);
  await page.eval(() => document.querySelector('#mdDocModes [data-doc="assembly"]').click());
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));
  for (let i = 0; i < 2; i++) {
    const inserted = await page.eval(() => {
      const select = document.querySelector("#mdParts .md-insert-component select");
      const button = document.querySelector("#mdParts .md-insert-component button");
      if (!select || !button || ![...select.options].some((option) => option.value === "dragPart")) return false;
      select.value = "dragPart";
      button.click();
      return true;
    });
    assert.equal(inserted, true);
    await page.eval(() => new Promise((r) => setTimeout(r, 450)));
  }

  /* A stationary assembly click is completed from the drag recognizer's
     window-level pointerup listener. On a Mac, the second face is added with
     Cmd-click; both paths must feed canvas coordinates to the picker and leave
     the two component-specific face references selected. */
  const facePair = await page.eval(async () => {
    document.querySelector('[data-selfilter="face"]').click();
    document.querySelector('[data-view="top"]').click();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const view = window.cadPreviewView, canvas = document.getElementById("mdPrev");
    const groups = view.grp.children.filter((object) => object.userData?.cadComponent);
    const pointOf = (group) => {
      let mesh = null;
      group.traverse((object) => { if (!mesh && object.isMesh && object.geometry) mesh = object; });
      mesh.geometry.computeBoundingSphere();
      group.updateWorldMatrix(true, true);
      view.place(); view.cam.updateMatrixWorld();
      const point = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld).project(view.cam);
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
    };
    const click = (point, pointerId, metaKey) => {
      const init = { bubbles:true, cancelable:true, pointerId, pointerType:"mouse", isPrimary:true,
        button:0, clientX:point.x, clientY:point.y, metaKey };
      canvas.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons:1 }));
      canvas.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons:0 }));
    };
    const points = groups.slice(0, 2).map(pointOf);
    click(points[1], 31, false);
    await new Promise((resolve) => setTimeout(resolve, 250));
    click(points[0], 32, true);
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      activeComponents: document.querySelectorAll("#mdParts .md-tree-component.on").length,
      faceReferences: document.querySelectorAll("#mdOps .md-mate-pick").length,
    };
  });
  assert.equal(facePair.activeComponents, 2, "Cmd-click did not retain both component selections: " + JSON.stringify(facePair));
  assert.equal(facePair.faceReferences, 2, "Cmd-click did not retain both face references: " + JSON.stringify(facePair));
  assert.deepEqual(page.consoleErrors.filter((error) => !NO_GL.test(error)), [],
    "face selection raised an uncaught exception");
  await page.eval(() => document.querySelector('[data-selfilter="all"]').click());

  const drag = async (pointerType, pointerId) => page.eval(async ({ pointerType, pointerId }) => {
    const view = window.cadPreviewView, canvas = document.getElementById("mdPrev");
    const components = view.grp.children.filter((object) => object.userData && object.userData.cadComponent);
    const group = components[1];
    let mesh = null;
    group.traverse((object) => { if (!mesh && object.isMesh && object.geometry) mesh = object; });
    mesh.geometry.computeBoundingSphere();
    group.updateWorldMatrix(true, true);
    view.place();
    view.cam.updateMatrixWorld();
    const world = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld);
    const projected = world.clone().project(view.cam), rect = canvas.getBoundingClientRect();
    const x = rect.left + (projected.x + 1) * rect.width / 2;
    const y = rect.top + (1 - projected.y) * rect.height / 2;
    const before = group.position.toArray();
    const fire = (type, cx, cy, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId, pointerType, isPrimary: true,
      button: 0, buttons, clientX: cx, clientY: cy,
    }));
    fire("pointerdown", x, y, 1);
    fire("pointermove", x + 35, y + 3, 1);
    fire("pointermove", x + 80, y + 6, 1);
    fire("pointerup", x + 80, y + 6, 0);
    await new Promise((resolve) => setTimeout(resolve, 450));
    const moved = window.cadPreviewView.grp.children.find((object) => object.userData?.cadComponent === group.userData.cadComponent);
    return { before, after: moved.position.toArray(), selected: document.querySelectorAll("#mdParts .md-tree-component.on").length };
  }, { pointerType, pointerId });

  const mouse = await drag("mouse", 41);
  assert.ok(Math.hypot(...mouse.after.map((value, index) => value - mouse.before[index])) > 1,
    "mouse drag left the component in place");
  assert.equal(mouse.selected, 1, "dragging also selects exactly that component");

  await page.eval(() => document.querySelector('#mdUndo, [data-action="undo"]')?.click());
  await page.eval(() => new Promise((r) => setTimeout(r, 450)));
  await page.resize(390, 844, { mobile: true, touch: true });
  await page.eval(() => new Promise((r) => setTimeout(r, 500)));
  const axisControl = await page.eval(() => {
    const control = document.getElementById("mdAssemblyMoveMode");
    const button = control.querySelector('[data-assembly-move="x"]');
    button.click();
    const rect = control.getBoundingClientRect(), hit = button.getBoundingClientRect();
    return { visible: rect.width > 0 && rect.height > 0, targetWidth: hit.width, targetHeight: hit.height,
      pressed: button.getAttribute("aria-pressed") };
  });
  assert.equal(axisControl.visible, true, "move-direction control is hidden on touch layout");
  assert.ok(axisControl.targetWidth >= 44 && axisControl.targetHeight >= 44, "axis control misses the touch target floor");
  assert.equal(axisControl.pressed, "true", "X axis mode did not become active");
  const touch = await drag("touch", 42);
  const touchDelta = touch.after.map((value, index) => value - touch.before[index]);
  assert.ok(Math.abs(touchDelta[0]) > 1, "X-locked touch drag left the component in place");
  assert.ok(Math.abs(touchDelta[1]) < 1e-6 && Math.abs(touchDelta[2]) < 1e-6,
    `X-locked drag leaked into Y/Z (${touchDelta.join(", ")})`);
});

/* Components used to be drawn as a flat list of their own while every part
   document got the FeatureManager, so there was no nesting, no rename, no
   context menu and no way to reach a mate at all. The tree renderer is
   document-shape agnostic; this checks the assembly actually goes through it,
   and that the two things only a tree can offer — suppressing a mate and
   reordering one past another — do what they say. */
test("desktop model editor: an assembly is drawn by the FeatureManager tree", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  await seedModelLibrary(page, [
    { key: "treeA", name: "Tree A", w: 20, d: 10, h: 10, parts: [{ id: "treeA-p", kind: "box", name: "Body", x0: -10, x1: 10, y0: 0, y1: 10, z0: -5, z1: 5 }] },
    { key: "treeB", name: "Tree B", w: 12, d: 10, h: 10, parts: [
      { id: "treeB-p", kind: "box", name: "Body", x0: -6, x1: 6, y0: 0, y1: 10, z0: -5, z1: 5 },
      { id: "treeB-q", kind: "cyl", name: "Boss", x: 0, y: 10, z: 0, r: 2, h: 4 },
    ] },
  ]);
  await page.eval(() => document.querySelector('#mdDocModes [data-doc="assembly"]').click());
  await page.eval(() => new Promise((r) => setTimeout(r, 350)));
  const insert = async (key) => {
    const ok = await page.eval((k) => {
      const select = document.querySelector("#mdParts .md-insert-component select");
      if (![...select.options].some((option) => option.value === k)) return false;
      select.value = k;
      document.querySelector("#mdParts .md-insert-component button").click();
      return true;
    }, key);
    assert.equal(ok, true, "the library has no " + key + " to insert");
    await page.eval(() => new Promise((r) => setTimeout(r, 450)));
  };
  await insert("treeA");
  await insert("treeB");

  const shape = await page.eval(() => ({
    sections: [...document.querySelectorAll("#mdParts .md-tree-section")].map((r) => r.dataset.nodeId),
    components: [...document.querySelectorAll("#mdParts .md-tree-component")].map((r) => r.textContent.replace(/\s+/g, " ").trim()),
  }));
  assert.deepEqual(shape.sections, ["section:components", "section:mates"], "the assembly tree has both sections");
  assert.equal(shape.components.length, 2);
  assert.match(shape.components[0], /grounded/, "the anchor says so on its row");
  assert.match(shape.components[1], /2 solids/, "and a component reports what is inside it");

  // a component expands to its own solids
  const nested = await page.eval(async () => {
    const row = [...document.querySelectorAll("#mdParts .md-tree-component")][1];
    row.querySelector(".md-tree-caret").click();
    await new Promise((r) => setTimeout(r, 300));
    return [...document.querySelectorAll('#mdParts [data-node-id^="compbody:"]')].map((r) => r.textContent.trim());
  });
  assert.deepEqual(nested, ["Body", "Boss"], "the component's solids hang off it");

  // two mates on the same pair, so the second overrides the first
  const addMate = async (label) => {
    await page.eval((wanted) => {
      const rows = [...document.querySelectorAll("#mdParts .md-tree-component")];
      rows[0].click();
      rows[1].dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
      document.querySelector('#modeler [data-tab="ops"]').click();
      [...document.querySelectorAll("#mdOps .md-ops button")].find((b) => b.textContent.includes(wanted)).click();
      document.querySelector('#modeler [data-tab="parts"]').click();
    }, label);
    await page.eval(() => new Promise((r) => setTimeout(r, 600)));
  };
  await addMate("Coincident");
  await addMate("Concentric");
  const mateNames = await page.eval(() => [...document.querySelectorAll('#mdParts [data-node-id^="tmate:"] .md-tree-name')]
    .map((name) => name.textContent));
  assert.deepEqual(mateNames, ["Coincident faces", "Concentric axes"],
    "topology mate types are presented as user-facing names");
  const placed = () => page.eval(() => {
    const out = {};
    window.cadPreviewView.grp.traverse((o) => {
      if (o.userData && o.userData.cadComponent) out[o.userData.cadComponent] = Math.round(o.position.x * 10) / 10;
    });
    return out;
  });
  const mates = await page.eval(() => [...document.querySelectorAll('#mdParts [data-node-id^="tmate:"]')].map((r) => r.dataset.nodeId));
  assert.equal(mates.length, 2, "both mates reached the tree");
  const withConcentricLast = await placed();

  // dragging the first mate below the second changes which one wins
  const reordered = await page.eval(async () => {
    const rows = () => [...document.querySelectorAll('#mdParts [data-node-id^="tmate:"]')];
    const box = rows()[1].getBoundingClientRect();
    const dt = new DataTransfer();
    const drag = (el, type, y) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
    drag(rows()[0], "dragstart", box.top);
    drag(rows()[1], "dragover", box.bottom - 2);
    drag(rows()[1], "drop", box.bottom - 2);
    await new Promise((r) => setTimeout(r, 700));
    return rows().map((r) => r.dataset.nodeId);
  });
  assert.deepEqual(reordered, [mates[1], mates[0]], "the dragged mate moved past the other");

  /* What the mates have not pinned down. The solver reads it off the rank of
     the system it solved, and both the moved component's row and the status
     bar say so — "solved" and "solved, and this part can still spin" are not
     the same answer. */
  const freedom = await page.eval(() => ({
    row: [...document.querySelectorAll("#mdParts .md-tree-component")][1].textContent.replace(/\s+/g, " "),
    status: document.getElementById("mdStatus").textContent,
  }));
  assert.match(freedom.row, /degree of freedom|degrees of freedom|fully constrained/,
    "the moved component's row does not say what it has left");
  assert.match(freedom.status, /degree of freedom|degrees of freedom/,
    "the assembly status bar does not carry the freedom count");
  const withCoincidentLast = await placed();
  assert.notDeepEqual(withCoincidentLast, withConcentricLast, "solve order is what the drag changed, not just the list");

  /* mate.suppressed has always been honoured by the solver and had no way to be
     set; the eye on a mate row is it. */
  const freed = await page.eval(async () => {
    document.querySelector('#mdParts [data-node-id^="tmate:"] .md-part-x').click();
    await new Promise((r) => setTimeout(r, 400));
    return document.querySelector('#mdParts [data-node-id^="tmate:"]').className.includes("md-suppressed");
  });
  assert.equal(freed, true, "the mate row reads as suppressed");

  const checkDetail = () => page.eval(() => [...document.querySelectorAll("[data-workflow-step]")]
    .find((button) => button.querySelector("b")?.textContent === "Check")?.querySelector("small")?.textContent);
  await page.eval(() => document.querySelector('[data-command="interference"]').click());
  await page.eval(() => new Promise((r) => setTimeout(r, 500)));
  assert.notEqual(await checkDetail(), "Not checked yet", "the completed check never reached the workflow");
  await page.eval(() => document.querySelector("[data-report-close]")?.click());

  await page.eval(() => {
    const first = document.querySelector("#mdParts .md-tree-component");
    first.querySelector('[aria-label="Hide component"]').click();
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 350)));
  assert.equal(await checkDetail(), "Not checked yet", "hiding a component left a stale interference result");

  await page.eval(() => document.querySelector('[data-command="interference"]').click());
  await page.eval(() => new Promise((r) => setTimeout(r, 500)));
  assert.equal(await checkDetail(), "No interference detected",
    "a clean check describes interference instead of claiming mates were checked");
  await page.eval(() => document.querySelector("[data-report-close]")?.click());

  await page.eval(() => {
    const first = document.querySelector("#mdParts .md-tree-component");
    first.querySelector('[aria-label="Show component"]').click();
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 350)));
  assert.equal(await checkDetail(), "Not checked yet", "showing a component left a stale clean result");
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

test("desktop model editor: header labels, Save, and Close do not overlap", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  const chrome = await page.eval(() => {
    const name = document.querySelector("#modeler .md-field");
    const label = name?.querySelector("span");
    const input = name?.querySelector("input");
    const save = document.getElementById("mdSave");
    const close = document.getElementById("mdClose");
    const lr = label.getBoundingClientRect();
    const ir = input.getBoundingClientRect();
    const sr = save.getBoundingClientRect();
    const cr = close.getBoundingClientRect();
    const head = document.querySelector("#modeler .md-head").getBoundingClientRect();
    return {
      labelOverInput: lr.bottom > ir.top + 1 && lr.top < ir.bottom,
      labelGap: ir.top - lr.bottom,
      saveOverClose: sr.left < cr.right && sr.right > cr.left && sr.top < cr.bottom && sr.bottom > cr.top,
      saveClipped: sr.right > head.right + 1 || sr.left < head.left - 1,
      closeClipped: cr.right > head.right + 1 || cr.left < head.left - 1,
      saveTitle: save.getAttribute("title"),
      saveTip: save.getAttribute("data-tip"),
    };
  });
  assert.equal(chrome.labelOverInput, false, "MODEL NAME label overlaps its input");
  assert.ok(chrome.labelGap >= 3, `label/input gap is only ${chrome.labelGap}px`);
  assert.equal(chrome.saveOverClose, false, "Save overlaps Close");
  assert.equal(chrome.saveClipped, false, "Save is clipped by the header");
  assert.equal(chrome.closeClipped, false, "Close is clipped by the header");
  assert.equal(chrome.saveTitle, null, "Save still uses a native title tooltip");
  assert.ok(chrome.saveTip, "Save has no data-tip for the CSS tooltip");
});

test("desktop model editor: Tree toggle does not cover view or zoom controls", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  const hit = await page.eval(() => {
    const toggle = document.getElementById("mdToggleLeft").getBoundingClientRect();
    const views = document.getElementById("mdViews").getBoundingClientRect();
    const first = document.querySelector("#mdViews button").getBoundingClientRect();
    const overlap = toggle.left < views.right && toggle.right > views.left
      && toggle.top < views.bottom && toggle.bottom > views.top;
    const firstHidden = first.left < toggle.right && first.right > toggle.left
      && first.top < toggle.bottom && first.bottom > toggle.top;
    return {
      overlap, firstHidden,
      viewsVisible: views.height > 0 && views.width > 0,
    };
  });
  assert.equal(hit.viewsVisible, true, "view cube is not laid out");
  assert.equal(hit.overlap, false, "Tree toggle overlaps the view cube");
  assert.equal(hit.firstHidden, false, "the first view button is behind the Tree toggle");
});

test("desktop model editor: selection toolbar does not cover the view cube", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  const hit = await page.eval(() => {
    const bar = document.getElementById("mdContextToolbar");
    bar.hidden = false;
    bar.innerHTML = "<button type='button' aria-label='Create sketch'></button>".repeat(10);
    const br = bar.getBoundingClientRect();
    const views = document.getElementById("mdViews").getBoundingClientRect();
    const toggle = document.getElementById("mdToggleLeft").getBoundingClientRect();
    const modes = document.getElementById("mdModes").getBoundingClientRect();
    const overlap = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    return {
      overlapViews: overlap(br, views),
      overlapToggle: overlap(br, toggle),
      overlapModes: overlap(br, modes),
      barVisible: br.width > 0 && br.height > 0,
    };
  });
  assert.equal(hit.barVisible, true, "selection toolbar is not laid out");
  assert.equal(hit.overlapViews, false, "selection toolbar covers the view cube");
  assert.equal(hit.overlapToggle, false, "selection toolbar covers the Tree toggle");
  assert.equal(hit.overlapModes, false, "selection toolbar covers Model/Sketch/Drawing");
});

test("desktop model editor: Solid, Transparent, and Edges do not overlap", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  const hit = await page.eval(() => {
    const views = document.getElementById("mdViews");
    const solid = views.querySelector("[data-display='solid']");
    const ghost = views.querySelector("[data-display='transparent']");
    const edges = document.getElementById("mdShowEdges");
    const vr = views.getBoundingClientRect();
    const boxes = [solid, ghost, edges].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: el.textContent.trim(),
        l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height,
        clipped: r.left < vr.left - 1 || r.right > vr.right + 1,
      };
    });
    const overlap = (a, b) => a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1;
    return {
      boxes,
      overlapST: overlap(boxes[0], boxes[1]),
      overlapTE: overlap(boxes[1], boxes[2]),
      overlapSE: overlap(boxes[0], boxes[2]),
    };
  });
  assert.equal(hit.overlapST, false, "Solid overlaps Transparent: " + JSON.stringify(hit.boxes));
  assert.equal(hit.overlapTE, false, "Transparent overlaps Edges: " + JSON.stringify(hit.boxes));
  assert.equal(hit.overlapSE, false, "Solid overlaps Edges: " + JSON.stringify(hit.boxes));
  for (const box of hit.boxes) {
    assert.equal(box.clipped, false, box.label + " is clipped by the view stack");
    assert.ok(box.w >= 40, box.label + " is only " + box.w + "px wide");
  }
});

test("desktop model editor: Extrude Apply does not cover Cancel", opts, async () => {
  const page = await ctx({ width: 1280, height: 800, lang: "en" });
  // Extrude is gated on a closed sketch, but the overlap was a CSS track
  // problem: the long "Cancel command" caption spilled under Apply. Mount the
  // same two buttons the form uses, with that long caption, and measure.
  const form = await page.eval(() => {
    const host = document.getElementById("mdQuickSettings");
    const tools = document.getElementById("mdQuickTools");
    host.hidden = false;
    host.innerHTML =
      '<div class="md-feature-actions">' +
      '<button type="button" class="md-quick-cancel"><i class="ph ph-x"></i> Cancel command</button>' +
      '<button type="button" class="md-quick-apply"><i class="ph ph-check"></i> Apply</button>' +
      "</div>";
    const cancel = host.querySelector(".md-quick-cancel");
    const apply = host.querySelector(".md-quick-apply");
    const panel = document.querySelector("#modeler .md-left");
    const cr = cancel.getBoundingClientRect();
    const ar = apply.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    return {
      toolsShown: getComputedStyle(tools).display !== "none",
      overlap: cr.left < ar.right && cr.right > ar.left && cr.top < ar.bottom && cr.bottom > ar.top,
      cancelText: cancel.textContent.trim(),
      cancelW: Math.round(cr.width),
      applyW: Math.round(ar.width),
      cancelClipped: cr.left < pr.left - 1 || cr.right > pr.right + 1,
      applyClipped: ar.left < pr.left - 1 || ar.right > pr.right + 1,
    };
  });
  assert.equal(form.toolsShown, true, "feature property manager is not shown");
  assert.equal(form.overlap, false, "Apply covers Cancel");
  assert.equal(form.cancelClipped, false, "Cancel is clipped by the left panel");
  assert.equal(form.applyClipped, false, "Apply is clipped by the left panel");
  assert.match(form.cancelText, /cancel/i, "Cancel is missing its caption");
  assert.ok(form.cancelW >= 60, `Cancel is only ${form.cancelW}px wide`);
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
