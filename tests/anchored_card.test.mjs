// The 3D view's Drawing overlay card opens by the button that opened it
// (js/anchored_card.js), clamped to the view.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { anchoredCardPosition } from "../js/anchored_card.js";

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const view = rect(300, 100, 900, 600); // the 3D pane in client pixels
const card = rect(0, 0, 236, 120);

test("the card opens above its button, end edges aligned", () => {
  const button = rect(1050, 600, 130, 30);
  assert.deepEqual(anchoredCardPosition(button, card, view), { left: 1180 - 236 - 300, top: 600 - 8 - 120 - 100 });
});

test("no room above: it opens below the button", () => {
  const button = rect(900, 110, 130, 30);
  assert.deepEqual(anchoredCardPosition(button, card, view), { left: 1030 - 236 - 300, top: 140 + 8 - 100 });
});

test("it stays inside the view", () => {
  // a button at the start edge: the card does not leave the view on the left
  assert.equal(anchoredCardPosition(rect(310, 600, 40, 30), card, view).left, 8);
  // a short view: clamped to the bottom margin
  const short = rect(300, 100, 900, 150);
  const at = anchoredCardPosition(rect(900, 120, 130, 30), card, short);
  assert.equal(at.top, 150 - 8 - 120);
  // a view narrower than the card keeps its start edge
  assert.equal(anchoredCardPosition(rect(320, 600, 40, 30), card, rect(300, 100, 200, 600)).left, 8);
});

test("the Drawing overlay action places the card by its button and follows a resize", () => {
  const actions = readFileSync(new URL("../js/ui/view_actions.js", import.meta.url), "utf8");
  assert.match(actions, /if \(on\) \{ placeCardBy\(panel, button\); followTrigger\(panel, button\); \}/);
});
