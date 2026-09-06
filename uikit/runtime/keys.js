/* Identifying a keystroke that involves Alt, on a Mac.
 *
 * THE BUG THIS FILE EXISTS FOR. On macOS, Option is a compose modifier before
 * it is anything else: Option+E does not produce "e", it produces a DEAD KEY
 * for the acute accent, and `event.key` arrives as "´" or "Dead". Option+U is
 * the umlaut. So a shortcut written as
 *
 *     if (e.altKey && e.key.toLowerCase() === "e")
 *
 * works on Windows and Linux and silently does nothing on a Mac — no error, no
 * warning, the key just never matches. Every Alt combination has to be matched
 * on `event.code`, the PHYSICAL key, which is "KeyE" whatever the layout does
 * with it.
 *
 * `key` is kept as a fallback because synthetic events — the ones tests build,
 * and some assistive tooling — often set only `key`.
 *
 * ACCEL is Ctrl or Cmd, whichever the machine has. Both are accepted rather
 * than one being chosen by sniffing the platform: a Mac user with an external
 * PC keyboard, and a person following a Windows tutorial on a Mac, both get
 * what they pressed.
 */

export function accel(e) {
  return !!(e && (e.metaKey || e.ctrlKey));
}

/* Does this event mean that letter? `letter` is a single a-z character. */
export function matchesLetter(e, letter) {
  if (!e) return false;
  const want = String(letter).toLowerCase();
  if (e.code && /^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase() === want;
  return String(e.key || "").toLowerCase() === want;
}

export function isMacLike(nav) {
  const n = nav || (typeof navigator !== "undefined" ? navigator : null);
  if (!n) return false;
  const id = String(n.userAgentData ? n.userAgentData.platform || "" : "") || String(n.platform || "");
  return /Mac|iPhone|iPad|iPod/i.test(id);
}

/* "Ctrl+Alt+E" -> "⌘⌥E" on a Mac, unchanged elsewhere.
 *
 * The plus signs go only when something was actually substituted, so a row
 * that documents the "+" key itself is not silently emptied. */
export function displayCombo(combo, mac) {
  const text = String(combo == null ? "" : combo);
  if (!mac) return text;
  const swapped = text
    .replace(/\bCtrl\b/g, "⌘")
    .replace(/\bCmd\b/g, "⌘")
    .replace(/\bAlt\b/g, "⌥")
    .replace(/\bShift\b/g, "⇧")
    .replace(/\bDel\b/g, "⌫")
    .replace(/\bEnter\b/g, "↩");
  if (swapped === text) return text;
  return swapped.replace(/\+/g, "");
}
