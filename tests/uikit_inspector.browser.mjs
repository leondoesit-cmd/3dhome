/* The inspector, driven the way a person drives it.
 *
 * WHY THIS FILE EXISTS. Every other test of customize mode reaches the editor
 * through `editor.command(...)` or by dispatching `input`/`change` on a field.
 * Both are legitimate — the command API is the keyboard path, and it is what
 * makes an assertion about an EDIT rather than about a pixel. But between them
 * they never once sent a real `click` to a real button in the panel, and that
 * is precisely where customize mode is most fragile:
 *
 *   the editor holds the application's handlers off by listening on the
 *   DOCUMENT in the capture phase — and capture runs outermost first, so the
 *   same listener reaches the inspector's own buttons before the inspector
 *   does.
 *
 * A guard that fails leaves Export, Import, Group and Reset as dead controls,
 * Tab moving the selection while the caret sits in the Name field, and
 * Backspace hiding the panel being renamed — with every existing test still
 * green. So this file clicks and types, and nothing else.
 */
import test from "./helpers/customize_gate.mjs"; // skipped while UI Customize is off
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
    /* Buttons are found by the words on them, the way a person finds them. */
    window.__btn = (text) =>
      [...document.querySelectorAll(".uikit-ins button")]
        .find((b) => b.textContent.trim().toLowerCase() === text.toLowerCase());
    window.__field = (i) => document.querySelectorAll(".uikit-ins-node input[type=text]")[i || 0];
    window.__ids = (sel) => [...document.querySelector(sel).children]
      .map((e) => e.getAttribute("data-uikit-id") || e.id || e.className);
  });
  return shared;
}

test("a real click on Group reaches the button, not the capture filter", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    ed.command("select", { id: "panel:smarthome" });
    ed.command("select", { id: "panel:mep", additive: true });
    await window.__frame();

    const group = window.__btn("group");
    const before = window.__ids("#left-sidebar").length;
    /* Read BEFORE the click: grouping selects the group it made, which leaves
       one thing selected and correctly disables the button again. */
    const disabled = group.disabled;
    group.click(); // a real click, exactly as a person makes it
    await window.__frame();

    return {
      found: !!group,
      disabled,
      before,
      after: window.__ids("#left-sidebar").length,
      selection: ed.selection(),
    };
  });

  assert.ok(result.found, "the Group button is in the panel");
  assert.equal(result.disabled, false, "and enabled, with two siblings selected");
  assert.equal(result.after, result.before - 1, "the click grouped them");
  assert.match(result.selection[0], /^g:user/, "and selected the group it made");
});

test("a real click on the node actions does what the keyboard does", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const ui = window.__ui;
    ed.command("select", { id: "panel:tree" });
    await window.__frame();

    /* By its label, not by position: the first checkbox in the panel is
       "Rename everywhere". */
    const hidden = [...document.querySelectorAll(".uikit-ins input[type=checkbox]")]
      .find((c) => /hidden/i.test(c.closest("label").textContent));
    hidden.checked = true;
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
    await window.__frame();
    const wasHidden = !!ui.doc.nodes["panel:tree"].hidden;

    /* One thing is selected, so the button says what it will do to that one
       thing. It reads "Reset selected" only when there is more than one. */
    const oneLabel = window.__btn("reset to default") ? "reset to default" : null;
    window.__btn("reset to default").click();
    await window.__frame();
    const nowHidden = !!ui.doc.nodes["panel:tree"].hidden;

    ed.command("select", { id: "panel:tree" });
    ed.command("select", { id: "panel:library", additive: true });
    await window.__frame();
    const manyLabel = document.querySelector(".uikit-ins-node .uikit-ins-actions button:last-of-type").textContent;

    return { wasHidden, nowHidden, oneLabel, manyLabel };
  });

  assert.ok(result.wasHidden, "the checkbox hid it");
  assert.equal(result.oneLabel, "reset to default", "one item selected: the button names the item");
  assert.equal(result.nowHidden, false, "and a real click on it put the panel back");
  assert.match(result.manyLabel, /selected/i, "several selected: the button names the selection");
});

test("typing in the Name field does not drive the editor", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    ed.command("select", { id: "panel:tree" });
    await window.__frame();

    const field = window.__field(0);
    field.focus();
    field.value = "Plan tree";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await window.__frame();

    const order = () => window.__ids("#left-sidebar");
    const before = order();
    const selBefore = ed.selection().slice();

    const send = (key) => field.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    );
    /* Every one of these is an editor command outside the panel: Tab steps the
       selection, arrows reorder, Delete hides. Inside a text field they belong
       to the field. */
    send("Tab");
    const afterTab = ed.selection().slice();
    send("Backspace");
    send("Delete");
    send("ArrowUp");
    await window.__frame();

    return {
      before, after: order(),
      selBefore, afterTab, selAfter: ed.selection().slice(),
      hidden: !!window.__ui.doc.nodes["panel:tree"].hidden,
      focused: document.activeElement === field,
      label: window.__ui.doc.nodes["panel:tree"].label,
    };
  });

  assert.equal(result.label, "Plan tree", "the rename went through");
  assert.deepEqual(result.afterTab, result.selBefore, "Tab did not step the selection");
  assert.deepEqual(result.selAfter, result.selBefore);
  assert.deepEqual(result.after, result.before, "and the arrow key did not reorder anything");
  assert.equal(result.hidden, false, "Backspace and Delete did not hide the panel being renamed");
  assert.ok(result.focused, "the caret stayed where the user put it");
});

test("Restore default layout asks first, and can be backed out of", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const { ops } = await import("/uikit/index.js");
    const ui = window.__ui;
    ui.apply("Rename", ops.retitle(ui.doc, { id: "panel:tree", label: "Mine" }));
    ui.refreshNow();
    await window.__frame();

    window.__btn("restore default layout").click();
    await window.__frame();
    const armed = {
      visible: !document.querySelector(".uikit-ins-confirm").hidden,
      label: ui.doc.nodes["panel:tree"].label,
      hasBackup: !!window.__btn("export backup"),
    };

    window.__btn("cancel").click();
    await window.__frame();
    const cancelled = {
      visible: !document.querySelector(".uikit-ins-confirm").hidden,
      label: ui.doc.nodes["panel:tree"].label,
    };

    window.__btn("restore default layout").click();
    await window.__frame();
    window.__btn("restore").click();
    await window.__frame();

    return { armed, cancelled, label: ui.doc.nodes["panel:tree"].label };
  });

  assert.ok(result.armed.visible, "the first click only asks");
  assert.equal(result.armed.label, "Mine", "and changes nothing yet");
  assert.ok(result.armed.hasBackup, "with a way to keep a copy first");
  assert.equal(result.cancelled.visible, false, "Cancel backs out");
  assert.equal(result.cancelled.label, "Mine", "leaving the layout alone");
  assert.equal(result.label, undefined, "and confirming really does restore the default");
});

test("with nothing selected the panel says so, and offers nothing that would fail", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    window.__ed.command("select", { id: null });
    await window.__frame();
    const enabled = ["group", "ungroup", "reset selected"]
      .map((t) => ({ t, on: window.__btn(t) && !window.__btn(t).disabled }));
    return {
      enabled,
      empty: !document.querySelector(".uikit-ins-empty").hidden,
      nodeSection: document.querySelector(".uikit-ins-node").hidden,
      title: document.querySelector(".uikit-ins-title").textContent.trim(),
      done: !!window.__btn("done"),
    };
  });

  assert.ok(result.empty, "it explains that nothing is selected");
  assert.ok(result.nodeSection, "rather than showing fields for a node that is not there");
  assert.ok(result.title.length, "the panel is titled even before anything is picked");
  assert.ok(result.done, "and there is a visible way out");
  for (const { t, on } of result.enabled) {
    assert.equal(on, false, t + " must not be offered when it cannot work");
  }
});

test("Done leaves customize mode, and so does Escape from a field", opts, async () => {
  const page = await customizing();
  const viaButton = await page.eval(async () => {
    window.__btn("done").click();
    await window.__frame();
    return {
      overlay: document.querySelectorAll(".uikit-ed-overlay").length,
      panel: document.querySelectorAll(".uikit-ins").length,
      editing: window.__ui.editing,
    };
  });
  assert.equal(viaButton.overlay, 0, "Done closed the overlay");
  assert.equal(viaButton.panel, 0);
  assert.equal(viaButton.editing, false);

  const page2 = await customizing();
  const viaEscape = await page2.eval(async () => {
    window.__ed.command("select", { id: "panel:tree" });
    await window.__frame();
    const field = window.__field(0);
    field.focus();
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await window.__frame();
    return { editing: window.__ui.editing, panel: document.querySelectorAll(".uikit-ins").length };
  });
  assert.equal(viaEscape.editing, false, "Escape from a field finishes the session");
  assert.equal(viaEscape.panel, 0);
});

test("the panel fits a short landscape window instead of running off the top", opts, async () => {
  const page = await customizing({ width: 844, height: 390 });
  const result = await page.eval(async () => {
    window.__ed.command("select", { id: "panel:tree" });
    await window.__frame();
    const ins = document.querySelector(".uikit-ins");
    const r = ins.getBoundingClientRect();
    const scroller = ins.querySelector(".uikit-ins-scroll") || ins;
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      viewport: window.innerHeight,
      titleVisible: document.querySelector(".uikit-ins-title").getBoundingClientRect().top >= 0,
      scrolls: scroller.scrollHeight > scroller.clientHeight
        ? getComputedStyle(scroller).overflowY
        : "not-needed",
    };
  });

  assert.ok(result.top >= 0, "the panel starts on screen, not at y=" + result.top);
  assert.ok(result.bottom <= result.viewport + 1, "and ends on screen");
  assert.ok(result.titleVisible, "so its title and primary controls are reachable");
  assert.ok(["auto", "scroll", "not-needed"].includes(result.scrolls),
    "and anything that does not fit scrolls rather than being cut off: " + result.scrolls);
});

test("the preset selector reports what is actually loaded", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    const select = document.querySelector(".uikit-ins select");
    const initial = select.value;

    select.value = "compact";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await window.__frame();
    const applied = select.value;

    ui.undo();
    ui.refreshNow();
    await window.__frame();
    return { initial, applied, afterUndo: select.value };
  });

  assert.equal(result.initial, "default", "the shipped layout is the default preset");
  assert.equal(result.applied, "compact", "and the selector keeps up with what was applied");
  assert.equal(result.afterUndo, "default", "including after an undo");
});

test("every form control in the inspector has an accessible name", opts, async () => {
  const page = await customizing();
  const result = await page.eval(() => {
    const ed = window.__ed;
    ed.command("select", { id: "panel:tree" });
    const ins = document.querySelector(".uikit-ins");
    const controls = [...ins.querySelectorAll("input, select, textarea, button")];
    const missing = [];
    for (const el of controls) {
      if (el.type === "hidden") continue;
      const ariaLabel = el.getAttribute("aria-label");
      const ariaLabelledby = el.getAttribute("aria-labelledby");
      const title = el.getAttribute("title");
      const placeholder = el.getAttribute("placeholder");
      const text = el.textContent?.trim();
      const hasAssociatedLabel = el.id && document.querySelector(`label[for="${el.id}"]`);
      const isWrappedInLabel = !!el.closest("label");
      const hasName = !!(ariaLabel || ariaLabelledby || title || placeholder || text || hasAssociatedLabel || isWrappedInLabel);
      if (!hasName) {
        missing.push({ tag: el.tagName, className: el.className, id: el.id });
      }
    }
    return {
      totalControls: controls.length,
      missing,
    };
  });

  assert.ok(result.totalControls > 0, "found inspector controls");
  assert.deepEqual(result.missing, [], "all inspector controls have accessible names");
});

test("accent token pair satisfies WCAG AA contrast ratio (>= 4.5:1)", opts, async () => {
  const page = await customizing();
  const ratio = await page.eval(() => {
    const ins = document.querySelector(".uikit-ins");
    const style = getComputedStyle(ins);
    const bg = style.getPropertyValue("--uikit-ed-accent").trim() || "#2563eb";
    const fg = style.getPropertyValue("--uikit-ed-accent-fg").trim() || "#ffffff";

    function parseHex(hex) {
      const clean = hex.replace("#", "");
      return {
        r: parseInt(clean.slice(0, 2), 16),
        g: parseInt(clean.slice(2, 4), 16),
        b: parseInt(clean.slice(4, 6), 16),
      };
    }

    function lum({ r, g, b }) {
      const a = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    }

    const l1 = lum(parseHex(bg));
    const l2 = lum(parseHex(fg));
    const brightest = Math.max(l1, l2);
    const darkest = Math.min(l1, l2);
    return (brightest + 0.05) / (darkest + 0.05);
  });

  assert.ok(ratio >= 4.5, `contrast ratio ${ratio.toFixed(2)}:1 meets WCAG AA (>= 4.5:1)`);
});

test("preset cards apply a styled layout and Undo restores manual edits", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const { ops } = await import('/uikit/index.js');
    const ui = window.__ui;
    ui.apply('Manual width', ops.resize(ui.doc, { id: 'n:left', size: { w: 275 } }));
    ui.refreshNow();
    const before = ui.exportLayout();
    document.querySelector('[data-preset="focus"]').click();
    await window.__frame();
    const applied = {
      accent: ui.doc.overrides.tokens['--accent'],
      width: ui.doc.nodes['n:left'].size.w,
      pressed: document.querySelector('[data-preset="focus"]').getAttribute('aria-pressed'),
    };
    ui.undo();
    ui.refreshNow();
    return { applied, restored: ui.exportLayout() === before };
  });
  assert.deepEqual(result.applied, { accent: '#0f766e', width: 232, pressed: 'true' });
  assert.equal(result.restored, true);
});

test("named layouts persist separately and restore an editable snapshot", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ui = window.__ui;
    localStorage.removeItem('home3d_uikit:planner:saved');
    ui.applyPreset('focus');
    const original = ui.exportLayout();
    const name = document.querySelector('.uikit-ins-presets input');
    name.value = 'My focused layout';
    window.__btn('Save current layout').click();
    const saved = ui.savedLayouts();
    ui.applyPreset('studio');
    const studio = ui.exportLayout();
    const loaded = ui.loadNamedLayout(saved[0].id);
    const restored = ui.exportLayout() === original;
    ui.undo();
    ui.refreshNow();
    return { saved, loaded, restored, undo: ui.exportLayout() === studio,
      stored: JSON.parse(localStorage.getItem('home3d_uikit:planner:saved')).length };
  });
  assert.equal(result.saved[0].name, 'My focused layout');
  assert.equal(result.loaded, true);
  assert.equal(result.restored, true);
  assert.equal(result.undo, true);
  assert.equal(result.stored, 1);
  await page.goto('/');
  const persisted = await page.eval(async () => {
    const { activeUIKit } = await import('/js/uikit_host/index.js');
    return activeUIKit().savedLayouts().map(item => item.name);
  });
  assert.deepEqual(persisted, ['My focused layout']);
  await page.eval(() => localStorage.removeItem('home3d_uikit:planner:saved'));
});
