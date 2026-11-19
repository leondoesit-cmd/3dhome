import test from "node:test";
import assert from "node:assert/strict";
import { findChrome, openPage } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
test("four measured component pairs stay readable and actionable in the report", {
  skip: !chrome && "Chrome unavailable", timeout: 120000,
}, async () => {
  const page = await openPage({ width: 1280, height: 800, lang: "en" });
  try {
    await page.eval(async () => {
      const { modelerDraftOwner, writeModelerDraft } = await import("/js/modeler_draft.js");
      const { createPartDocument, createFeatureDefinition } = await import("/js/core/parametric_document.js");
      const def = createPartDocument({ name: "Block", metadata: { authoringSystem: "parametric-v1" } });
      createFeatureDefinition(def, "box", { id: "box", params: { x: 0, y: 0, z: 0, w: 2, h: 2, d: 2 } });
      def.parts = [{ id: "body", featureId: "box", kind: "box", x0: 0, x1: 2, y0: 0, y1: 2, z0: 0, z1: 2 }];
      const components = Array.from({ length: 5 }, (_, i) => ({
        id: "block-" + i, name: "מסגרת " + "MachinedHousing".repeat(6) + " " + i,
        grounded: true, transform: { x: i * 1.5, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }, def,
      }));
      writeModelerDraft(localStorage, { docType: "assembly", assembly: {
        id: "chain", name: "Interference fixture", components, mates: [],
      } }, undefined, modelerDraftOwner(sessionStorage));
    });
    await page.goto("/");
    await page.eval(async () => (await import("/js/modeler.js")).openModeler());
    await page.waitUntil(() => !!document.querySelector('#mdDecision [data-decision="accept"]'));
    await page.eval(() => document.querySelector('#mdDecision [data-decision="accept"]').click());
    await page.waitUntil(() => document.querySelector("#modeler")?.classList.contains("md-assembly"));
    await page.resize(1920, 1080);
    const opener = '#modeler .pr-editor-ribbon [data-pro-bind="mcmd:interference"]';
    await page.eval(() => [...document.querySelectorAll("#modeler .pr-editor-ribbon .pr-tab")]
      .find(tab => tab.textContent === "Assembly").click());
    const point = await page.eval(selector => {
      const button = document.querySelector(selector);
      button.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = button.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!button.contains(hit)) throw new Error("Ribbon Interference command is unreachable");
      return { x, y };
    }, opener);
    for (const type of ["mousePressed", "mouseReleased"])
      await page.send("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 });
    const waitForReport = () => page.waitUntil(() => !document.querySelector("#mdReport").hidden && document.querySelectorAll("#mdExpectedContacts button").length === 4,
      { ms: 45000, what: "four exact interference results" });
    await waitForReport();

    async function tabTo(selector, backwards = false) {
      for (const type of ["keyDown", "keyUp"]) {
        await page.send("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: backwards ? 8 : 0 });
      }
      const state = await page.eval(expected => {
        const active = document.activeElement;
        const rect = active.getBoundingClientRect();
        const center = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        const style = getComputedStyle(active);
        return {
          matches: active === document.querySelector(expected),
          reachable: active.contains(center),
          outlined: active.matches(":focus-visible") && style.outlineStyle === "solid" && parseFloat(style.outlineWidth) >= 2,
        };
      }, selector);
      assert.deepEqual(state, { matches: true, reachable: true, outlined: true }, (backwards ? "Shift+Tab" : "Tab") + " to " + selector);
    }
    const close = "#mdReport [data-report-close]";
    const pairs = Array.from({ length: 4 }, (_, i) =>
      ["input", "button"].map(tag => `#mdExpectedContacts .md-contact-row:nth-of-type(${i + 1}) ${tag}`)).flat();
    for (const [width, height, dir] of [[1280, 800, "ltr"], [360, 640, "ltr"], [640, 360, "rtl"]]) {
      await page.resize(width, height);
      const issues = await page.eval(direction => {
        document.querySelector("#modeler").dir = direction;
        const dialog = document.querySelector("#mdReport section");
        const box = dialog.getBoundingClientRect();
        const issues = [];
        if (box.top < 0 || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth) issues.push("dialog outside viewport");
        if (dialog.scrollWidth > dialog.clientWidth + 1) issues.push("horizontal scroll");
        let previousBottom = -Infinity;
        for (const button of dialog.querySelectorAll("#mdExpectedContacts button")) {
          const row = button.parentElement.getBoundingClientRect();
          if (row.top + dialog.scrollTop < previousBottom - 1) issues.push("overlapping rows");
          previousBottom = row.bottom + dialog.scrollTop;
          for (const control of button.parentElement.children) {
            const r = control.getBoundingClientRect();
            if (r.left < row.left - 1 || r.right > row.right + 1 || control.scrollWidth > control.clientWidth + 1) issues.push("overflowing " + control.tagName);
          }
        }
        return issues;
      }, dir);
      assert.deepEqual(issues, [], width + "px " + dir);
      assert.equal(await page.eval(() => document.activeElement.hasAttribute("data-report-close")), true);
      const order = ["#mdReportBody", ...pairs];
      for (const selector of [...order, close]) await tabTo(selector);
      for (const selector of [...order.reverse(), close]) await tabTo(selector, true);
    }
    await tabTo(pairs.at(-1), true);
    await tabTo(pairs.at(-2), true);
    await page.send("Input.insertText", { text: "Intentional overlap" });
    await tabTo(pairs.at(-1));
    const activate = async () => {
      for (const type of ["keyDown", "keyUp"])
        await page.send("Input.dispatchKeyEvent", { type, key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    };
    await activate();
    assert.match(await page.eval(() => document.querySelector("#mdReportBody").textContent), /Declared contacts: 1/);
    assert.match(await page.eval(() => document.activeElement.getAttribute("aria-label")), /^Remove declared contact.*MachinedHousing/);
    await activate();
    assert.match(await page.eval(() => document.querySelector("#mdReportBody").textContent), /Declared contacts: 0/);
    await page.resize(1920, 1080);
    await page.eval(() => { document.querySelector("#modeler").dir = "ltr"; });
    async function assertRestored() {
      assert.equal(await page.eval(selector => document.querySelector("#mdReport").hidden &&
        document.activeElement === document.querySelector(selector), opener), true, "dismissal restores the Interference command");
    }
    for (const type of ["keyDown", "keyUp"])
      await page.send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await assertRestored();

    // Activate the restored command, then dismiss using its focused Close button.
    for (const type of ["keyDown", "keyUp"])
      await page.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13,
        ...(type === "keyDown" ? { text: "\r" } : {}) });
    await waitForReport();
    assert.equal(await page.eval(() => document.activeElement.hasAttribute("data-report-close")), true);
    await activate();
    await assertRestored();

    for (const state of ["compact", "hidden", "disabled", "inert", "removed"]) {
      await page.resize(1920, 1080);
      await page.eval(selector => {
        const button = document.querySelector(selector);
        button.focus();
        button.click();
      }, opener);
      await waitForReport();
      if (state === "compact") {
        await page.resize(360, 640);
        await page.waitUntil(() => !document.querySelector('#modeler .pr-editor-ribbon [data-pro-bind="mcmd:interference"]').getClientRects().length);
      } else {
        await page.eval(({ selector, state }) => {
          const button = document.querySelector(selector);
          if (state === "removed") button.remove();
          if (state === "hidden") button.style.visibility = "hidden";
          if (state === "disabled") button.disabled = true;
          if (state === "inert") button.parentElement.inert = true;
        }, { selector: opener, state });
      }
      await activate();
      const focusState = await page.eval(() => {
        const active = document.activeElement;
        const r = active.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { hidden: document.querySelector("#mdReport").hidden, active: active.id || active.className,
          reachable: active.contains(hit) };
      });
      assert.deepEqual(focusState, { hidden: true, active: state === "compact" ? "ps-title" : "mdClose",
        reachable: true }, state + " opener should return focus to a reachable editor control");
      if (state !== "removed") await page.eval(selector => {
        const button = document.querySelector(selector);
        button.style.removeProperty("visibility");
        button.disabled = false;
        button.parentElement.inert = false;
      }, opener);
    }
  } finally {
    await page.close();
  }
});
