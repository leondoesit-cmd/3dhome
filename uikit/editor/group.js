/* Grouping a selection, and taking a group apart again.
 *
 * model/ops.js does the document arithmetic and refuses anything incoherent —
 * a selection spanning two parents has no single place to live. What is left
 * here is the part that needs the EDITOR's knowledge rather than the
 * document's: minting an id that will not collide, and explaining why a
 * selection cannot be grouped so the answer is a sentence rather than nothing
 * happening.
 */

/* Group ids are minted, not derived from the contents. Deriving them would
   make "group these two, ungroup, group them again" produce the same id as a
   group that still exists somewhere in an undone branch of the history — and
   ops.insert refuses an id that is already taken, so the second group would
   silently do nothing. */
export function nextGroupId(doc, prefix) {
  const base = prefix || "g:user";
  let n = 1;
  while (doc.nodes[base + n]) n++;
  return base + n;
}

/* Why this selection cannot become a group, or null if it can. The editor
   shows this; it is not an error, it is an explanation. */
export function groupProblem(doc, ids, parentOf) {
  const present = (ids || []).filter((id) => doc.nodes[id]);
  if (present.length < 2) return "pick-two";
  const root = doc.variants && doc.variants.base && doc.variants.base.root;
  if (present.indexOf(root) >= 0) return "not-the-root";
  const parents = new Set(present.map((id) => parentOf(id)));
  if (parents.has(undefined) || parents.has(null)) return "not-the-root";
  if (parents.size > 1) return "same-parent-only";
  return null;
}

export function ungroupProblem(doc, id) {
  const node = id ? doc.nodes[id] : null;
  if (!node) return "pick-one";
  if (node.type === "item" || node.type === "separator") return "not-a-group";
  const root = doc.variants && doc.variants.base && doc.variants.base.root;
  if (id === root) return "not-the-root";
  /* A container BOUND to a slot is the host's own region — #topbar, the
     sidebar. Dissolving it would splice the toolbar's contents into the app
     shell, which is not what "ungroup" means to anyone. */
  if (node.constraints && node.constraints.ungroup === false) return "not-a-group";
  if (node.slot) return "not-a-group";
  return null;
}

export const PROBLEM_TEXT = Object.freeze({
  "pick-two": "Select two or more things in the same group.",
  "same-parent-only": "Those are in different groups.",
  "not-the-root": "That one cannot be grouped.",
  "pick-one": "Select a group.",
  "not-a-group": "That is not a group you can take apart.",
  "escapes": "Moving this item out of its container may alter its responsive visibility or appearance.",
  "already-placed": "This item is already in the layout.",
  "position-base-only": "Where an item sits is shared by every screen size. Switch to the base layout to put it back.",
  "no-container": "Drop this onto a bar, menu, or panel that can hold it.",
  "rejects": "That container does not accept this item.",
});
