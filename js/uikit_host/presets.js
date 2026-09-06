/* Layouts 3dhome ships as starting points.
 *
 * Built by applying ops to the shipped layout rather than written out by hand.
 * A preset kept as a literal document is a copy of the default that silently
 * stops being one: add a panel to the app and every hand-written preset is
 * missing it, with nothing to say so. Deriving them means a preset is a
 * DIFFERENCE from the shipped chrome — which is what it actually is — and a
 * new panel appears in all of them for free.
 *
 * They are presets, not modes: picking one replaces the document and is
 * undoable, and nothing in the app branches on which one is active.
 */

import { ops } from "../../uikit/index.js";
import { defaultLayout } from "./layout.js";

/* Sidebar panes the user is least likely to want on a first run. Hidden, not
   removed: hiding is reversible from the palette and from the inspector's
   own checkbox, and a preset that deleted them would be a preset that loses
   the user's ability to get them back. */
const SECONDARY = ["panel:smarthome", "panel:mep", "panel:params"];

function compact() {
  let doc = defaultLayout();
  for (const id of SECONDARY) doc = ops.hide(doc, { id, hidden: true });
  doc = ops.resize(doc, { id: "n:left", size: { w: 232 }, min: { w: 180 } });
  doc = ops.setToken(doc, { id: null, name: "--uikit-gap", value: "3px" });
  return doc;
}

function touch() {
  let doc = defaultLayout();
  /* Bigger targets and more air. The sidebar gets wider rather than narrower:
     a finger needs the room a cursor does not. */
  doc = ops.resize(doc, { id: "n:left", size: { w: 360 }, min: { w: 180 } });
  doc = ops.setToken(doc, { id: null, name: "--uikit-gap", value: "10px" });
  doc = ops.setToken(doc, { id: null, name: "--uikit-pad", value: "4px" });
  return doc;
}

function drafting() {
  /* Everything that is about the model, nothing that is about the room. The
     tree and the warnings are what you watch while drawing. */
  let doc = defaultLayout();
  for (const id of ["panel:library", "panel:smarthome", "panel:mep"]) {
    doc = ops.hide(doc, { id, hidden: true });
  }
  doc = ops.reorder(doc, { id: "panel:warnings", index: 1 });
  return doc;
}

export const PRESETS = [
  { id: "default", key: "uikit_preset_default", en: "Default", doc: defaultLayout },
  { id: "compact", key: "uikit_preset_compact", en: "Compact", doc: compact },
  { id: "touch", key: "uikit_preset_touch", en: "Touch", doc: touch },
  { id: "drafting", key: "uikit_preset_drafting", en: "Drafting", doc: drafting },
];

export function presetList(label) {
  return PRESETS.map((preset) => ({
    id: preset.id,
    key: preset.key,
    label: label ? label(preset.key, preset.en) : preset.en,
    doc: preset.doc,
  }));
}

/* Variables of the APP's own that a user may retint.
 *
 * uikit writes these on the layout root (#app), where they cascade over the
 * :root declarations in css/styles.css without a single rule having to change
 * — `--accent` alone is read by 620 of them. The list is deliberately short
 * and deliberately the host's: uikit never invents a colour, it only edits one
 * this file has opened up. Adding a knob is adding a line here. */
export const TOKENS = [
  { name: "--accent", key: "uikit_tok_accent", en: "Accent", type: "color", fallback: "#4f46e5" },
  { name: "--accent-hover", key: "uikit_tok_accent_hover", en: "Accent (hover)", type: "color", fallback: "#4338ca" },
  { name: "--uikit-gap", key: "uikit_tok_gap", en: "Group spacing", type: "length",
    min: 0, max: 16, unit: "px", fallback: "6px" },
  { name: "--uikit-pad", key: "uikit_tok_pad", en: "Group padding", type: "length",
    min: 0, max: 12, unit: "px", fallback: "0px" },
];

export function tokenList(label) {
  return TOKENS.map((token) =>
    Object.assign({}, token, { label: label ? label(token.key, token.en) : token.en })
  );
}
