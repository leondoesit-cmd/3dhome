/* Infrastructure panel: real layout, keyboard controls, and a narrow sidebar.
   The arithmetic lives in mep_infrastructure.test.mjs. This checks the things
   only a browser can: that the controls are buttons with names, that hiding a
   system is a toggle, and that a routing-rule row does not spill out of the
   panel when the sidebar is phone-narrow. */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? { timeout: 180000 } : { skip: "no Chrome found (set CHROME_PATH)" };

test("infrastructure panel is operable and stays inside a narrow column", opts, async () => {
  const page = await openPage({ width: 1280, height: 800, lang: "en" });
  assert.ok(page, "Chrome launched");
  try {
    await page.goto("/");
    const report = await page.eval(async () => {
      const start = document.getElementById("start-screen");
      if (start) start.hidden = true;
      const side = document.getElementById("left-sidebar");
      if (side) side.dataset.left = "structure";
      const section = document.querySelector(".mep-section");
      if (section) section.classList.remove("collapsed");
      const panel = document.getElementById("mepPanel");
      for (let i = 0; i < 80 && !panel.querySelector("button.mep-auto-btn"); i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      function measure(width) {
        panel.style.width = width + "px";
        const row = panel.querySelector(".mep-policy-row");
        const chip = panel.querySelector(".mep-chip");
        const panelBox = panel.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        const chipBox = chip.getBoundingClientRect();
        return {
          fits: rowBox.right <= panelBox.right + 1 && rowBox.left >= panelBox.left - 1,
          chipH: chipBox.height,
          rowW: rowBox.width,
          panelW: panelBox.width,
        };
      }
      const eye = panel.querySelector("button.mep-eye");
      const before = eye ? eye.getAttribute("aria-pressed") : null;
      const healthNode = panel.querySelector(".mep-health");
      const healthText = panel.querySelector("[data-mep-health-text]");
      const healthWords = healthText ? healthText.textContent : "";
      if (eye) eye.click();
      const healthStable = healthNode === panel.querySelector(".mep-health")
        && healthText === panel.querySelector("[data-mep-health-text]")
        && healthText.textContent === healthWords;
      const eye2 = panel.querySelector("button.mep-eye");
      const wide = measure(280);
      const narrow = measure(220);
      const { S } = await import("/js/state.js");
      const { addNode } = await import("/js/mep.js");
      const { select } = await import("/js/ui_props.js");
      S.nodes = [{ x: 0, z: 0 }, { x: 400, z: 0 }];
      S.walls = [{ id: 1, a: 0, b: 1, thickness: 10, height: 270 }];
      const outlet = addNode("power", "outlet", 0, 0, 1, 120, "wall");
      select({ kind: "mepNode", ref: outlet });
      const props = document.getElementById("mepProps");
      const kind = props && props.querySelector("select");
      const del = props && props.querySelector("button.mep-del-btn");
      if (kind) {
        kind.value = "light";
        kind.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const info = props ? props.querySelector(".mep-info") : null;
      const auto = panel.querySelector("button.mep-auto-btn");
      const main = panel.querySelector("button.mep-chip-main");
      const health = panel.querySelector(".mep-health");
      const layer = panel.querySelector("button.mep-layer-btn");
      return {
        auto: !!(auto && auto.type === "button" && auto.querySelector("[aria-hidden='true']")),
        chip: main && main.tagName === "BUTTON" ? main.getAttribute("aria-pressed") : null,
        eyeBefore: before,
        eyeAfter: eye2 ? eye2.getAttribute("aria-pressed") : null,
        eyeText: eye2 ? eye2.textContent : "",
        eyeLabel: eye2 ? eye2.getAttribute("aria-label") : "",
        hiddenClass: !!panel.querySelector(".mep-chip.is-hidden"),
        health: health ? health.getAttribute("aria-live") : null,
        healthStable,
        healthWords,
        layer: layer ? layer.getAttribute("aria-pressed") : null,
        wide,
        narrow,
        inspector: {
          deleteType: del ? del.type : null,
          kind: outlet.k,
          layer: outlet.layer,
          wall: outlet.wall,
          x: outlet.x,
          info: info ? info.textContent : "",
        },
      };
    });
    assert.equal(report.auto, true);
    assert.equal(report.chip, "true", "the first system chip is the active one");
    assert.equal(report.eyeBefore, "true");
    assert.equal(report.eyeAfter, "false");
    assert.equal(report.eyeText.includes("👁"), false);
    assert.match(report.eyeLabel, /Electrical/);
    assert.equal(report.hiddenClass, true);
    assert.equal(report.health, "polite");
    assert.equal(report.healthStable, true, "hiding a system must not rebuild the health line");
    assert.ok(report.healthWords.length > 0);
    assert.equal(report.layer, "true");
    assert.equal(report.wide.fits, true, "policy row overflows at 280px: " + JSON.stringify(report.wide));
    assert.equal(report.narrow.fits, true, "policy row overflows at 220px: " + JSON.stringify(report.narrow));
    assert.ok(report.wide.chipH >= 40, "system chip is smaller than a comfortable target: " + report.wide.chipH);
    assert.equal(report.inspector.deleteType, "button");
    assert.equal(report.inspector.kind, "light");
    assert.equal(report.inspector.layer, "ceiling");
    assert.equal(report.inspector.wall, null);
    assert.equal(report.inspector.x, 120);
    assert.match(report.inspector.info, /Free-standing/);
  } finally {
    await page.close();
  }
});
