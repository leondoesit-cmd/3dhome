import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found" };
let page;
test.after(async () => { if (page) await page.close(); });

async function openEditor(width, height, lang) {
  if (!page) page = await openPage({ width, height, lang, mobile: width < 1000, touch: width < 1000 });
  await page.resize(width, height, { mobile: width < 1000, touch: width < 1000 });
  await page.setLang(lang);
  await page.goto("/");
  await page.waitForBoot();
  await page.eval(() => document.getElementById("openModelerTop").click());
  await page.waitUntil(() => !!document.getElementById("mdWelcomeClose"));
  await page.eval(() => document.getElementById("mdWelcomeClose").click());
}

async function closedProfile() {
  await page.eval(() => document.querySelector('#modeler [data-command="newsketch"]').click());
  await page.waitUntil(() => window.cadSketchSnapshot?.().phase === "sketch");
  await page.eval(async () => {
    const canvas = document.getElementById("mdCanvas");
    const r = canvas.getBoundingClientRect();
    const x = r.left + r.width * .35, y = r.top + r.height * .35;
    for (const [type, dx, dy] of [["pointerdown", 0, 0], ["pointermove", 90, 80], ["pointerup", 90, 80]]) {
      canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
        pointerId: 31, pointerType: "touch", isPrimary: true, button: 0,
        buttons: type === "pointerup" ? 0 : 1, clientX: x + dx, clientY: y + dy }));
      await new Promise(requestAnimationFrame);
    }
    document.getElementById("mdAcceptCommand").click();
  });
  await page.waitUntil(() => !document.getElementById("mdProfileOffer").hidden);
}

for (const [width, height, lang] of [[344, 812, "en"], [390, 844, "he"], [717, 829, "en"], [1280, 800, "en"]]) {
  test(`feature flow keeps readable controls and unobstructed forms at ${width}px (${lang})`, opts, async () => {
    await openEditor(width, height, lang);
    if (width < 1000) {
      assert.equal(await page.eval(() => {
        const label = document.querySelector("#md-ctx > .mctx-btn span");
        return !!label && getComputedStyle(label).display !== "none" && label.getBoundingClientRect().width > 0;
      }), true, "the changing next action needs visible text");
    }
    await closedProfile();
    assert.equal(await page.eval(() => document.getElementById("mdProfileOffer").textContent.includes("revolvefeature")), false);
    // Use a different entry point from the offer: every launcher must retire it.
    await page.eval(() => {
      const thumb = document.querySelector('#md-ctx [data-md-action="extrude"]');
      (thumb || document.querySelector('#modeler [data-command="extrude"]')).click();
    });
    await page.waitUntil(() => !document.getElementById("mdQuickSettings").hidden);
    await page.eval(() => new Promise(r => setTimeout(r, 300)));
    assert.equal(await page.eval(() => document.getElementById("mdProfileOffer").hidden), true);
    assert.equal(await page.eval(() => window.cadLoopSnapshot().formActionsHidden), true, "the visible confirmation controls own the commit");
    if (width < 600) {
      const layout = await page.eval(() => {
        const sheet = document.getElementById("md-sheet").getBoundingClientRect();
        const head = document.querySelector("#md-sheet .m-sheet-head").getBoundingClientRect();
        const form = document.getElementById("mdQuickSettings").getBoundingClientRect();
        const ctx = document.getElementById("md-ctx").getBoundingClientRect();
        const hit = document.elementFromPoint(form.left + form.width / 2, form.top + 16);
        return { gap: form.top - head.bottom, height: form.height, right: form.right,
          sheetRight: sheet.right, bottomGap: ctx.top - sheet.bottom,
          hitForm: !!hit?.closest("#mdQuickSettings") };
      });
      assert.ok(layout.gap < 35, JSON.stringify(layout));
      assert.ok(layout.height > 230, JSON.stringify(layout));
      assert.ok(layout.right <= layout.sheetRight, JSON.stringify(layout));
      assert.ok(Math.abs(layout.bottomGap) < 3, JSON.stringify(layout));
      assert.ok(layout.hitForm, "canvas overlays intercepted the form");
      // Simulate the inset supplied by visualViewport. This tests layout, not
      // an actual OS keyboard, which still needs physical-device verification.
      await page.eval(() => document.documentElement.style.setProperty("--kb", "280px"));
      const keyboard = await page.eval(() => {
        const ctx = document.getElementById("md-ctx").getBoundingClientRect();
        const nav = document.getElementById("md-nav").getBoundingClientRect();
        const sheet = document.getElementById("md-sheet").getBoundingClientRect();
        return { bottom: nav.bottom, boundary: innerHeight - 280, ctxBottom: ctx.bottom, navTop: nav.top, sheetBottom: sheet.bottom, ctxTop: ctx.top };
      });
      assert.ok(keyboard.bottom <= keyboard.boundary + 1, JSON.stringify(keyboard));
      assert.ok(Math.abs(keyboard.ctxBottom - keyboard.navTop) < 2, JSON.stringify(keyboard));
      assert.ok(Math.abs(keyboard.sheetBottom - keyboard.ctxTop) < 3, JSON.stringify(keyboard));
      await page.eval(() => document.documentElement.style.setProperty("--kb", "0px"));
    }
    await page.eval(() => {
      const input = document.querySelector('#mdQuickSettings input[data-parameter="depth"]');
      if (!input) throw new Error("missing depth input");
      input.value = "25";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    if (width < 600) {
      await page.resize(717, 829, { mobile: true, touch: true });
      assert.ok(await page.eval(() => document.getElementById("mdQuickSettings").getBoundingClientRect().height > 500), "the unfolded form must use the full dock height");
      await page.resize(width, height, { mobile: true, touch: true });
      assert.equal(await page.eval(() => document.querySelector('#mdQuickSettings input[data-parameter="depth"]').value), "25");
      assert.equal(await page.eval(() => document.getElementById("md-sheet").classList.contains("on")), true, "folding must keep the active form reachable");
    }
    await page.eval(() => document.getElementById("mdCancelCommand").click());
    assert.equal(await page.eval(() => window.cadLoopSnapshot().authoring), null);
    if (width < 600) assert.equal(await page.eval(() => document.getElementById("md-sheet").classList.contains("on")), false, "Cancel must return to the canvas");
    const before = await page.eval(() => window.cadLoopSnapshot());
    await page.eval(() => {
      document.querySelector('#modeler [data-command="extrude"]').click();
      const input = document.querySelector('#mdQuickSettings input[data-parameter="depth"]');
      input.value = "25";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.eval(() => document.getElementById("mdAcceptCommand").click());
    await page.waitUntil(() => window.cadLoopSnapshot().authoring === null);
    const committed = await page.eval(() => window.cadLoopSnapshot());
    assert.equal(Number(committed.lastFeature.params.depth), 25);
    assert.equal(committed.undoDepth - before.undoDepth, 1);
    assert.ok(committed.parts > before.parts);
    if (width < 600) assert.equal(await page.eval(() => document.getElementById("md-sheet").classList.contains("on")), false, "Apply must return to the canvas");
    await page.eval(() => document.getElementById("mdUndo").click());
    assert.equal(await page.eval(() => window.cadLoopSnapshot().parts), before.parts);
  });
}
