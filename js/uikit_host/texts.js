/* Every translated string on the page, as something the user may rewrite.
 *
 * The app tags its static markup with data-i18n / -title / -aria / -ph /
 * -label and js/i18n.js applies them in one pass. That is 586 attributes over
 * five kinds, and it means a user-facing "rename anything" feature hooks ONE
 * place rather than 586 call sites: whenever the app has just written its own
 * strings into the DOM, uikit writes the user's over the top.
 *
 * OVERRIDES ARE PER LANGUAGE. This app ships English and Hebrew, and renaming
 * a button while the UI is in Hebrew must not blank the English wording the
 * user was never shown. model/ops.js stores them keyed by language with an
 * explicit "*" bucket for "the same everywhere"; this file is only the part
 * that puts them on screen.
 *
 * Re-applying after the app's own pass, rather than replacing it, is what
 * keeps this reversible: drop the overrides and the next applyStatic() puts
 * the shipped wording back with no bookkeeping at all.
 */

import { getLang, t } from "../i18n.js";

const KINDS = [
  { attr: "data-i18n", apply: (el, v) => { el.textContent = v; } },
  { attr: "data-i18n-title", apply: (el, v) => { el.title = v; } },
  { attr: "data-i18n-aria", apply: (el, v) => { el.setAttribute("aria-label", v); } },
  { attr: "data-i18n-ph", apply: (el, v) => { el.placeholder = v; } },
  { attr: "data-i18n-label", apply: (el, v) => { el.label = v; } },
];

/* The distinct string keys the page uses, each with the words currently on
   screen — which is what an editor needs to show a list worth searching. */
export function textEntries(doc) {
  const byKey = new Map();
  for (const kind of KINDS) {
    doc.querySelectorAll("[" + kind.attr + "]").forEach((el) => {
      const key = el.getAttribute(kind.attr);
      if (!key) return;
      if (!byKey.has(key)) {
        byKey.set(key, {
          id: "text:" + key,
          key,
          kind: "text",
          titleFallback: (el.textContent || "").replace(/\s+/g, " ").trim() || key,
          count: 0,
        });
      }
      byKey.get(key).count++;
    });
  }
  return [...byKey.values()];
}

function lookup(overrides, key, lang) {
  if (!overrides) return null;
  if (lang && overrides[lang] && Object.prototype.hasOwnProperty.call(overrides[lang], key)) {
    return overrides[lang][key];
  }
  if (overrides["*"] && Object.prototype.hasOwnProperty.call(overrides["*"], key)) {
    return overrides["*"][key];
  }
  return null;
}

/* Write the user's wording over the app's, for every element carrying a key
   the user has overridden. Returns how many elements were rewritten, which is
   the only thing a caller can usefully assert on. */
export function applyTextOverrides(doc, overrides, lang) {
  if (!overrides) return 0;
  let touched = 0;
  for (const kind of KINDS) {
    doc.querySelectorAll("[" + kind.attr + "]").forEach((el) => {
      const key = el.getAttribute(kind.attr);
      const value = key ? lookup(overrides, key, lang) : null;
      if (value == null) return;
      kind.apply(el, value);
      touched++;
    });
  }
  return touched;
}

/* Renaming ONE element, as a contract uikit can call without knowing anything
 * about this app's markup.
 *
 * uikit knows which element a node is — it stamped data-uikit-id on it — and
 * that is all it should know. Which child of that element carries the words is
 * a fact about index.html, and it is the same fact KINDS above already
 * encodes, so this is a second reader of one table rather than a second guess.
 *
 * RESTORE RECOMPUTES, IT DOES NOT REPLAY. Snapshotting the words at rename
 * time and putting them back later gets the language wrong the moment anyone
 * switches: rename "Structure" in English, switch to Hebrew, clear the
 * rename, and a snapshot hands back the English word in a Hebrew UI. Asking
 * t() for the key instead always answers in the language on screen — and
 * checking the app-wide overrides first means clearing a per-node rename
 * uncovers an everywhere-rename rather than deleting it.
 *
 * An element with no data-i18n* attribute of its own has no host words to
 * change: a .dropdown wrapper, a pill, a panel section. apply() does nothing
 * there, which is the honest answer rather than a guessed one.
 */
export function createLabelContract(doc, overridesOf) {
  const root = doc || (typeof document !== "undefined" ? document : null);

  /* WHOSE words are these?
   *
     An element's own data-i18n* attributes, plus at most ONE labelled child —
     because a button is usually `<button data-i18n-title><i/><span
     data-i18n>Save</span><kbd/></button>` and the words a user means are on
     that span, not on the button.
   *
     At most one, and that is the whole rule. An earlier version rewrote every
     [data-i18n] descendant, which is right for a button and catastrophic for a
     container: renaming the toolbar's centre column to "Middle" set the title
     of every control in it to "Middle", and renaming the view pill made both
     Plan and 3D say the same thing. More than one candidate means this element
     has no words of its own, and the honest answer is to change nothing. */
  function each(el, fn) {
    if (!el || !el.hasAttribute) return;
    for (const kind of KINDS) {
      if (el.hasAttribute(kind.attr)) fn(el, kind);
    }
    if (el.hasAttribute("data-i18n") || !el.querySelectorAll) return;
    const inner = el.querySelectorAll("[data-i18n]");
    if (inner.length === 1) fn(inner[0], KINDS[0]);
  }

  return {
    apply(el, text) {
      if (text == null) return;
      each(el, (target, kind) => kind.apply(target, String(text)));
    },
    restore(el) {
      const overrides = typeof overridesOf === "function" ? overridesOf() : null;
      each(el, (target, kind) => {
        const key = target.getAttribute(kind.attr);
        if (!key) return;
        const override = overrides ? lookup(overrides, key, getLang()) : null;
        kind.apply(target, override == null ? t(key) : override);
      });
    },
    /* The document this contract reads from, so a host that mounts uikit over
       a detached tree can still be given one. */
    root,
  };
}
