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
      const hiddenClassBefore = !!panel.querySelector(".mep-chip.is-hidden");
      const wide = measure(280);
      const narrow = measure(220);
      const { S } = await import("/js/state.js");
      const { addNode, addRun } = await import("/js/mep.js");
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
      addRun("water", "cold", [{ x: 40, z: 40 }, { x: 200, z: 40 }], null, null, "floor");
      addRun("hvac", "flex", [{ x: 40, z: 40 }, { x: 200, z: 40 }], null, null, "ceiling");
      addRun("power", "circuit", [{ x: 40, z: 40 }, { x: 200, z: 40 }], null, null, "ceiling");
      S.mep.vis.power = true;
      const { renderPanel } = await import("/js/ui_mep.js");
      renderPanel();
      const allClashText = panel.querySelector("[data-mep-clash-text]")?.textContent;
      const review = panel.querySelector(".mep-review");
      if (review) review.open = true;
      const clashFinding = [...(review?.querySelectorAll("button") || [])].find((b) => b.textContent.includes("Air conditioning") && b.textContent.includes("Electrical"));
      const reviewFinding = clashFinding?.textContent || "";
      if (clashFinding) clashFinding.click();
      const reviewedRun = S.sel?.kind === "mepRun" && S.sel.ref.sys === "hvac";
      const heightRow = [...(document.querySelectorAll("#mepProps .mep-row") || [])].find((row) => row.textContent.includes("Run centre height"));
      const heightInput = heightRow?.querySelector("input");
      if (heightInput) {
        heightInput.value = "220";
        heightInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const { getMEPState } = await import("/js/mep.js");
      const adjustedHeight = S.sel?.ref.elev;
      const adjustedClashes = getMEPState().clashes.length;
      const inspect = panel.querySelector(".mep-inspect-floor");
      if (inspect) inspect.click();
      const floorFocus = {
        count: inspect ? inspect.textContent : "",
        plane: { ...S.mep.layerVis },
        xray: !!S.mep.xray.floor,
        view: document.getElementById("center-canvas")?.classList.contains("max-view-2d"),
        workSet: S.workSet,
        buttonPressed: panel.querySelector(".mep-inspect-floor")?.getAttribute("aria-pressed"),
        clashHidden: panel.querySelector(".mep-clashes")?.hidden,
      };
      panel.querySelector(".mep-inspect-floor")?.click();
      const allPlanes = { ...S.mep.layerVis };
      return {
        auto: !!(auto && auto.type === "button" && auto.querySelector("[aria-hidden='true']")),
        chip: main && main.tagName === "BUTTON" ? main.getAttribute("aria-pressed") : null,
        eyeBefore: before,
        eyeAfter: eye2 ? eye2.getAttribute("aria-pressed") : null,
        eyeText: eye2 ? eye2.textContent : "",
        eyeLabel: eye2 ? eye2.getAttribute("aria-label") : "",
        hiddenClass: hiddenClassBefore,
        health: health ? health.getAttribute("aria-live") : null,
        healthStable,
        healthWords,
        layer: layer ? layer.getAttribute("aria-pressed") : null,
        floorFocus,
        allClashText,
        reviewFinding,
        reviewedRun,
        adjustedHeight,
        adjustedClashes,
        allPlanes,
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
    assert.match(report.floorFocus.count, /1/);
    assert.deepEqual(report.floorFocus.plane, { wall: false, ceiling: false, floor: true });
    assert.equal(report.floorFocus.xray, true);
    assert.equal(report.floorFocus.view, true);
    assert.equal(report.floorFocus.workSet, "mep");
    assert.equal(report.floorFocus.buttonPressed, "true");
    assert.match(report.allClashText, /1/);
    assert.match(report.reviewFinding, /ceiling/);
    assert.equal(report.reviewedRun, true);
    assert.equal(report.adjustedHeight, 220);
    assert.equal(report.adjustedClashes, 0);
    assert.equal(report.floorFocus.clashHidden, true, "hidden wall clashes must not clutter floor-only inspection");
    assert.deepEqual(report.allPlanes, { wall: true, ceiling: true, floor: true });
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
