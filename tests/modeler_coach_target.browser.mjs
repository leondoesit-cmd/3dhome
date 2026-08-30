import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? { timeout: 30_000 } : { skip: "no Chrome found (set CHROME_PATH)" };

test("coach target resolver skips hidden and disabled duplicate controls", opts, async () => {
  const page = await openPage({ width: 1280, height: 800, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const { findVisibleEnabledCoachTarget } = await import("/js/modeler.js");
      const fixture = document.createElement("div");
      fixture.style.cssText = "position:fixed;left:10px;top:10px;z-index:99999";
      fixture.innerHTML =
        '<button data-coach-fixture hidden>hidden duplicate</button>' +
        '<button data-coach-fixture disabled>disabled duplicate</button>' +
        '<button data-coach-fixture style="width:120px;height:32px">visible control</button>';
      document.body.appendChild(fixture);
      const matches = [...fixture.querySelectorAll("[data-coach-fixture]")];
      const target = findVisibleEnabledCoachTarget(fixture, "[data-coach-fixture]");
      const state = {
        index: matches.indexOf(target),
        text: target && target.textContent,
        width: target && target.getBoundingClientRect().width,
      };
      fixture.remove();
      return state;
    });

    assert.equal(result.index, 2, "the first actionable duplicate should be selected");
    assert.equal(result.text, "visible control");
    assert.ok(result.width > 0, "selected coach target should have a real layout box");
  } finally {
    await page.close();
  }
});
