/* The only styling uikit is allowed to emit: CSS custom properties.
 *
 * Never a colour, never a font, never a `background` — those belong to the
 * host's stylesheet, and the first time this module writes one it stops being
 * portable and starts fighting the app it was dropped into. What it writes is
 * `--uikit-*` variables that uikit.css consumes through :where(), at
 * specificity zero, so any host rule wins by default.
 *
 * WHICH NAMES ARE ALLOWED IS THE HOST'S CALL. uikit's own `--uikit-*` are
 * always writable — they are its to define. Beyond that, a host may DECLARE
 * variables of its own as user-editable, which is what makes a theme editor
 * possible at all: 3dhome's `--accent` is read by 620 rules, and writing it on
 * the layout root retints the entire application without uikit knowing a
 * single one of them. What uikit still refuses to do is INVENT a colour — it
 * only ever edits a variable the host said it could.
 *
 * An undeclared name is refused rather than ignored. A property nothing reads
 * would be harmless, but silently accepting it means an imported layout can
 * accumulate junk that looks like it should be doing something.
 *
 * VALUES ARE FILTERED because a layout document can be IMPORTED. The user
 * editing their own chrome is not a threat, but "here is a nice layout, load
 * this file" is a real way for a value to arrive, and a custom property that
 * reaches `background: var(--accent)` can fetch a URL. Anything that could
 * close a declaration, open a block, or name a resource is refused — and
 * refused loudly enough to show up in the returned report rather than being
 * silently dropped.
 */

const OWN = /^--uikit-[a-z0-9-]{1,60}$/i;
const ANY = /^--[a-z0-9-]{1,60}$/i;
const UNSAFE = /url\s*\(|expression\s*\(|@import|[;{}<>\\]/i;

export function isSafeTokenName(name, allowed) {
  if (typeof name !== "string" || !ANY.test(name)) return false;
  if (OWN.test(name)) return true;
  return !!(allowed && allowed.has && allowed.has(name));
}

export function isSafeTokenValue(value) {
  if (value == null) return true;
  const text = String(value);
  return text.length <= 120 && !UNSAFE.test(text);
}

/* Writes the given tokens onto `el` and removes any this module previously set
   on it that are no longer wanted. Returns the names it refused, so a caller
   can tell the user why their imported layout looks wrong. */
export function applyTokens(el, tokens, state, allowed) {
  const previous = state && state.get(el);
  const applied = new Set();
  const refused = [];

  if (tokens) {
    for (const name of Object.keys(tokens)) {
      const value = tokens[name];
      if (!isSafeTokenName(name, allowed)) {
        refused.push({ name, reason: "name" });
        continue;
      }
      if (!isSafeTokenValue(value)) {
        refused.push({ name, reason: "value" });
        continue;
      }
      if (value == null) continue;
      el.style.setProperty(name, String(value));
      applied.add(name);
    }
  }

  if (previous) {
    for (const name of previous) if (!applied.has(name)) el.style.removeProperty(name);
  }
  if (state) {
    if (applied.size) state.set(el, applied);
    else state.delete(el);
  }
  return refused;
}

/* Remove every property this module ever set, everywhere it set one. */
export function clearTokens(state) {
  if (!state) return;
  for (const [el, names] of state) {
    for (const name of names) el.style.removeProperty(name);
  }
  state.clear();
}
