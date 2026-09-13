/* The macOS dead-key trap, which is what made Ctrl+Alt+E do nothing on a
   MacBook while working perfectly on Windows. */
import test from "node:test";
import assert from "node:assert/strict";
import { accel, displayCombo, isMacLike, matchesLetter } from "../runtime/keys.js";
import { commandForKey } from "../editor/a11y.js";

test("Option+letter on macOS delivers an accent, and is still that letter", () => {
  // what a MacBook actually sends for Option+E: a dead key for the acute accent
  const macOptionE = { key: "´", code: "KeyE", altKey: true, metaKey: true };
  assert.ok(matchesLetter(macOptionE, "e"), "this is the bug: 'e' never arrives in e.key");
  assert.equal(String(macOptionE.key).toLowerCase() === "e", false, "and the naive test fails");

  const macOptionU = { key: "¨", code: "KeyU", altKey: true, ctrlKey: true };
  assert.ok(matchesLetter(macOptionU, "u"), "Option+U is the umlaut dead key");

  // Some layouts report "Dead" rather than the character
  assert.ok(matchesLetter({ key: "Dead", code: "KeyE" }, "e"));
});

test("a synthetic event carrying only a key still matches", () => {
  assert.ok(matchesLetter({ key: "e" }, "e"), "assistive tooling and tests set key alone");
  assert.ok(matchesLetter({ key: "Z" }, "z"));
  assert.equal(matchesLetter({ key: "e" }, "u"), false);
  assert.equal(matchesLetter(null, "e"), false);
});

test("letter shortcuts follow the typed Latin letter across keyboard layouts", () => {
  // Dvorak: the key engraved E sits where QWERTY has D
  assert.ok(matchesLetter({ key: "d", code: "KeyE" }, "d"));
  assert.equal(matchesLetter({ key: "d", code: "KeyE" }, "e"), false);
});

test("accel is Ctrl or Cmd, never one chosen by sniffing the machine", () => {
  assert.ok(accel({ ctrlKey: true }));
  assert.ok(accel({ metaKey: true }));
  assert.equal(accel({ shiftKey: true }), false);
  assert.equal(accel(null), false);
});

test("undo survives the same trap", () => {
  assert.deepEqual(commandForKey({ key: "z", code: "KeyZ", metaKey: true }), { name: "undo" });
  // a layout where the character differs from the engraved key
  assert.deepEqual(commandForKey({ key: ";", code: "KeyZ", ctrlKey: true }), { name: "undo" });
});

test("combos are captioned for the platform, and only the modifiers change", () => {
  assert.equal(displayCombo("Ctrl+Alt+E", true), "⌘⌥E");
  assert.equal(displayCombo("Ctrl+Alt+E", false), "Ctrl+Alt+E");
  assert.equal(displayCombo("Ctrl+Shift+G", true), "⌘⇧G");
  assert.equal(displayCombo("Del", true), "⌫");
  // the row that documents the + key itself must not be emptied by the swap
  assert.equal(displayCombo("+ −", true), "+ −");
  assert.equal(displayCombo("WASD", true), "WASD");
  assert.equal(displayCombo("", true), "");
});

test("platform detection prefers userAgentData and falls back to platform", () => {
  assert.ok(isMacLike({ userAgentData: { platform: "macOS" } }));
  assert.ok(isMacLike({ platform: "MacIntel" }));
  assert.ok(isMacLike({ platform: "iPhone" }));
  assert.equal(isMacLike({ platform: "Win32" }), false);
  assert.equal(isMacLike({}), false);
});
