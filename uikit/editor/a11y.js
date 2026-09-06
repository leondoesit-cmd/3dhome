/* Keyboard equivalents for every gesture customize mode offers.
 *
 * Not an accessibility afterthought. A tool for rearranging a UI is used most
 * by the people least well served by a drag-only interface, and a layout
 * editor you cannot drive from the keyboard is one more thing they have to ask
 * someone else to do for them.
 *
 * It is also how the browser tests drive the editor. A synthetic pointer drag
 * asserts that a sequence of coordinates produced a document; a command
 * asserts that the EDIT produced the document. The first fails when a margin
 * changes, which is not what any of these tests are about.
 *
 * This file is a pure function of a keyboard event, so the whole mapping is
 * testable without a DOM: event in, command out, and the designer does not get
 * a say in what a key means.
 *
 * Letters are matched through runtime/keys.js on the PHYSICAL key, because on
 * macOS Option is a compose modifier and Option+letter never delivers the
 * letter. See that file — it is the reason a shortcut can work everywhere
 * except the machine the user is on.
 */

import { accel, matchesLetter } from "../runtime/keys.js";

const ARROWS = {
  ArrowLeft: -1,
  ArrowUp: -1,
  ArrowRight: 1,
  ArrowDown: 1,
};

export function commandForKey(e) {
  if (!e || !e.key) return null;

  if (e.key === "Escape") return { name: "exit" };

  if (e.key === "Tab") return { name: "selectNext", dir: e.shiftKey ? -1 : 1 };

  if (accel(e) && matchesLetter(e, "z")) {
    return { name: e.shiftKey ? "redo" : "undo" };
  }

  if (accel(e) && matchesLetter(e, "g")) {
    return { name: e.shiftKey ? "ungroup" : "group" };
  }

  if (e.key === "Delete" || e.key === "Backspace") return { name: "hide" };

  if (Object.prototype.hasOwnProperty.call(ARROWS, e.key)) {
    /* Alt lifts the node OUT of its container into the neighbouring one; a
       plain arrow reorders it where it already lives. Two gestures because
       they are two different intentions, and conflating them means every
       nudge at the end of a toolbar silently relocates the button. */
    return { name: e.altKey ? "moveOut" : "reorder", dir: ARROWS[e.key] };
  }

  return null;
}

/* Keys the editor consumes even when it does nothing with them, so they never
   reach the application underneath. Arrows and Tab would otherwise scroll the
   page and move focus out of the layout while the user is rearranging it. */
export function swallows(e) {
  if (!e || !e.key) return false;
  if (e.key === "Tab" || e.key === "Escape") return true;
  if (Object.prototype.hasOwnProperty.call(ARROWS, e.key)) return true;
  if (e.key === "Delete" || e.key === "Backspace") return true;
  if (accel(e) && matchesLetter(e, "z")) return true;
  return accel(e) && matchesLetter(e, "g");
}
