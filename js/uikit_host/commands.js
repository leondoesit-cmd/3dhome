/* Every named action in the app, as something a layout may place.
 *
 * This costs almost nothing to build because the app already funnels every
 * menu item, toolbar button and keyboard shortcut through ONE dispatcher:
 * runAction() in js/ui.js, exposed as window.__runAction so js/mobile_shell.js
 * could build its rows at runtime. A command entry here is that global plus an
 * action name — no handler anywhere is touched, and a button placed by uikit
 * runs exactly what the original button ran, including its viewer-role guard.
 *
 * IDS COME FROM data-act. There are 179 of those attributes over 151 distinct
 * actions, they are already meaningful, and they are the app's own name for
 * the thing — so `act:save` is stable across releases in a way a DOM path
 * never is. Duplicates are expected: the same action appears in a menu and on
 * a toolbar, and both are the same placeable.
 *
 * TITLE AND ICON ARE READ FROM THE PAGE, not invented. Whatever the button
 * says now is what the placed command should say, so the label is taken from
 * the data-i18n key on the button (resolved at read time, so it follows the
 * language) and the icon from its <i class="ph ph-*">. Where js/tool_search.js
 * has already curated a better label or icon for an action, that wins — it was
 * written for exactly this purpose.
 */

import { t } from "../i18n.js";
import { TOOL_SEARCH_ENTRIES } from "../tool_search.js";

/* action name -> the curated entry that drives it, from the tool-search list.
   Built once: it is a static table in the source, not an observation. */
const CURATED = new Map();
for (const entry of TOOL_SEARCH_ENTRIES) {
  if (entry && entry.action && !CURATED.has(entry.action)) CURATED.set(entry.action, entry);
}

function iconOf(el) {
  const i = el.querySelector("i.ph, i[class*='ph-']");
  if (!i) return null;
  const hit = /(?:^|\s)(ph-[a-z0-9-]+)/.exec(i.className || "");
  return hit ? hit[1] : null;
}

/* The i18n key behind the button's visible words, so the label follows the
   language instead of freezing whatever was on screen at scan time. */
function labelKeyOf(el) {
  const span = el.querySelector("[data-i18n]");
  if (span) return span.getAttribute("data-i18n");
  if (el.hasAttribute("data-i18n")) return el.getAttribute("data-i18n");
  if (el.hasAttribute("data-i18n-title")) return el.getAttribute("data-i18n-title");
  if (el.hasAttribute("data-i18n-aria")) return el.getAttribute("data-i18n-aria");
  return null;
}

function textOf(el) {
  const copy = el.cloneNode(true);
  copy.querySelectorAll("kbd, .tb-badge").forEach((n) => n.remove());
  return (copy.textContent || "").replace(/\s+/g, " ").trim();
}

/* One entry per distinct data-act. The first element carrying an action wins:
   it is the one in the primary chrome, since index.html declares the toolbar
   before the overflow menus that repeat it. */
export function scanCommands(doc, run) {
  const runner = run || ((act) => {
    if (typeof window !== "undefined" && window.__runAction) window.__runAction(act);
  });
  const out = [];
  const seen = new Set();

  doc.querySelectorAll("[data-act]").forEach((el) => {
    const act = el.getAttribute("data-act");
    if (!act || seen.has(act)) return;
    seen.add(act);

    const curated = CURATED.get(act) || null;
    out.push({
      id: "act:" + act,
      act,
      kind: "command",
      textKey: labelKeyOf(el),
      titleFallback: textOf(el) || el.getAttribute("title") || act,
      curatedLabel: curated ? curated.label : null,
      icon: (curated && curated.icon) || iconOf(el) || null,
      run: () => runner(act),
      constraints: { resize: "none" },
    });
  });

  return out;
}

/* Curated entries whose action has no button in the DOM at all. They are still
   real capabilities — the app can run them — so the palette should offer them;
   a layout is allowed to surface something the shipped chrome buried. */
export function curatedOnlyCommands(doc, run) {
  const runner = run || ((act) => {
    if (typeof window !== "undefined" && window.__runAction) window.__runAction(act);
  });
  const present = new Set();
  doc.querySelectorAll("[data-act]").forEach((el) => present.add(el.getAttribute("data-act")));

  const out = [];
  for (const [act, entry] of CURATED) {
    if (present.has(act)) continue;
    out.push({
      id: "act:" + act,
      act,
      kind: "command",
      textKey: null,
      titleFallback: (entry.label && (entry.label.en || entry.label.he)) || act,
      curatedLabel: entry.label || null,
      icon: entry.icon || null,
      run: () => runner(act),
      constraints: { resize: "none" },
    });
  }
  return out;
}

/* A placement aliases a capability. One hop only: more:walk sources act:walk,
   never another placement. Missing or chained sources are refused so a bad
   alias cannot silently invent a command. */
export function applySource(entry, lookup) {
  if (!entry || !entry.source) return { ok: true, entry: entry || null };
  const cap = typeof lookup === "function" ? lookup(entry.source) : null;
  if (!cap) return { ok: false, reason: "missing-source" };
  if (cap.source) return { ok: false, reason: "source-is-placement" };
  return {
    ok: true,
    entry: Object.assign({}, cap, entry, {
      run: cap.run,
      act: cap.act,
      textKey: entry.textKey || cap.textKey,
      titleFallback: entry.titleFallback || cap.titleFallback,
      curatedLabel: entry.curatedLabel || cap.curatedLabel,
      icon: entry.icon || cap.icon,
    }),
  };
}

/* The label to show right now. A curated bilingual label beats a key, a key
   beats whatever the button happened to read at scan time — and t() returning
   the key unchanged is how it says a key is missing, which is not a label. */
export function titleFor(entry, lang) {
  if (entry.curatedLabel && entry.curatedLabel[lang]) return entry.curatedLabel[lang];
  if (entry.textKey) {
    const translated = t(entry.textKey);
    if (translated && translated !== entry.textKey) return translated;
  }
  if (entry.titleFallback) return entry.titleFallback;
  return entry.id;
}
