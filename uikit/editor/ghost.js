/* The drag preview: a picture of the thing you are actually dragging.
 *
 * WHY A SNAPSHOT AND NOT THE ELEMENT ITSELF. The obvious drag preview is the
 * node, moved. That is exactly what this module may not do: an adopted node is
 * the HOST's element in the HOST's tree, and lifting it out for the duration
 * of a gesture is the one thing the whole design refuses (see runtime/render.js).
 * Re-parenting it would also re-run its CSS, tear down iframes and reset
 * scroll positions — for a preview. So the element stays where it is and we
 * carry a copy.
 *
 * WHY THE COPY NEEDS ITS STYLES INLINED. A host's rules are written against
 * the host's tree: `#left-sidebar > .panel-section`, `.topbar .btn`. Lift a
 * clone into the editor overlay and not one of those selectors matches any
 * more, so a faithful clone renders as unstyled text — which is exactly the
 * "poor preview" this replaces. Computed style is the only thing that survives
 * the move, so we read it and write it back as inline style.
 *
 * The copy is bounded. A toolbar button is a handful of elements; a whole
 * sidebar can be thousands, and walking all of them at pointerdown would stall
 * the gesture it is meant to smooth. Past the budget we keep the outer shell —
 * still a real box, in the real colours, at the real size — and drop the
 * interior detail rather than dropping frames.
 */

/* Properties that decide what a box LOOKS like, as opposed to where its
   parent's layout puts it. Position and margin are deliberately absent: the
   overlay places the snapshot, and inheriting `position: absolute; left: 0`
   from a docked panel would fling the copy off its own preview. */
const COPIED = Object.freeze([
  "display", "box-sizing", "flex-direction", "flex-wrap", "align-items", "align-self",
  "justify-content", "gap", "row-gap", "column-gap", "grid-template-columns",
  "grid-template-rows", "grid-auto-flow", "flex-grow", "flex-shrink", "flex-basis",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-left-radius", "border-top-right-radius",
  "border-bottom-left-radius", "border-bottom-right-radius",
  "background-color", "background-image", "background-size", "background-position",
  "background-repeat", "color", "opacity", "box-shadow", "text-shadow",
  "font-family", "font-size", "font-weight", "font-style", "font-variant",
  "line-height", "letter-spacing", "text-transform", "text-align", "text-decoration-line",
  "white-space", "text-overflow", "vertical-align", "writing-mode", "direction",
  "fill", "stroke", "stroke-width", "object-fit", "list-style-type",
]);

/* How many elements are worth inlining. Chosen so a dense toolbar or a panel
   with a form inside it copies whole, and a full application sidebar does not. */
export const SNAPSHOT_BUDGET = 220;

/* Big things make useless previews: a 900px sidebar under the cursor hides the
   drop target it is aiming at. Past this the snapshot is scaled down, and the
   pointer keeps the same PROPORTIONAL grip on it so the gesture still feels
   like carrying the object rather than towing it. */
export const MAX_PREVIEW = Object.freeze({ w: 360, h: 280 });

export function previewScale(rect, max) {
  const cap = max || MAX_PREVIEW;
  if (!rect || !rect.w || !rect.h) return 1;
  return Math.min(1, cap.w / rect.w, cap.h / rect.h);
}

/* Where the preview's top-left goes, given where the pointer is now and where
 * inside the box it first went down.
 *
 * This is the fix for a preview that "isn't where my cursor is": centring the
 * ghost on the pointer moves the element out from under the exact spot the
 * user grabbed, so a button picked up by its right edge appears to jump left
 * the instant it lifts. Keeping the grip means the pixel under the cursor at
 * pointerdown is still under the cursor at every later point.
 */
export function ghostRect(point, grab, rect, scale) {
  const s = scale == null ? 1 : scale;
  return {
    x: Math.round(point.x - grab.dx * s),
    y: Math.round(point.y - grab.dy * s),
    w: Math.round(rect.w * s),
    h: Math.round(rect.h * s),
  };
}

function copyStyle(from, to, view) {
  const computed = view.getComputedStyle(from);
  let text = "";
  for (const prop of COPIED) {
    const value = computed.getPropertyValue(prop);
    if (value) text += prop + ":" + value + ";";
  }
  to.style.cssText = text;
}

/* An id is a promise of uniqueness, and a `for`/`aria-labelledby` pointing at
   a copy re-points the original's label at the ghost. Names have the same
   problem for radio groups. The snapshot is a picture; nothing should be able
   to address it. */
function sterilize(el) {
  el.removeAttribute("id");
  el.removeAttribute("name");
  el.removeAttribute("data-uikit-id");
  el.removeAttribute("data-uikit-target");
  el.removeAttribute("data-uikit-lifted");
  el.removeAttribute("data-uikit-slot");
  el.setAttribute("aria-hidden", "true");
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" ||
      el.tagName === "BUTTON") {
    el.setAttribute("disabled", "");
    el.setAttribute("tabindex", "-1");
  }
}

/* Elements that carry no picture and would only cost budget. */
function skip(el) {
  const tag = el.tagName;
  return tag === "SCRIPT" || tag === "STYLE" || tag === "TEMPLATE" || tag === "LINK";
}

/* A live-value copy for the form controls a clone would otherwise render
   empty: cloneNode copies the ATTRIBUTE, and a field the user typed into has a
   value that never became one. */
function carryValue(from, to) {
  const tag = from.tagName;
  if (tag === "INPUT") {
    if (from.type === "checkbox" || from.type === "radio") to.checked = from.checked;
    else to.setAttribute("value", from.value);
  } else if (tag === "TEXTAREA") {
    to.textContent = from.value;
  } else if (tag === "SELECT") {
    const at = from.selectedIndex;
    const options = to.querySelectorAll("option");
    if (at >= 0 && options[at]) options[at].setAttribute("selected", "");
  } else if (tag === "CANVAS") {
    /* A cloned canvas is blank — the bitmap is not markup. Paint the pixels
       across so a 3D viewport or a chart is still recognisable in the ghost. */
    try {
      to.width = from.width;
      to.height = from.height;
      const g = to.getContext("2d");
      if (g && from.width && from.height) g.drawImage(from, 0, 0);
    } catch (_) { /* a tainted or context-lost canvas simply stays blank */ }
  }
}

/* Build the preview. Returns an element positioned at 0,0 in its own box —
   the caller owns where it goes — or null when there is nothing to picture. */
export function snapshot(el, rect, options) {
  if (!el || !rect || !rect.w || !rect.h) return null;
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  if (!view || typeof view.getComputedStyle !== "function") return null;
  const budget = (options && options.budget) || SNAPSHOT_BUDGET;
  const scale = (options && options.scale != null) ? options.scale : 1;

  const holder = doc.createElement("div");
  holder.className = "uikit-ed-ghost-shot";
  holder.style.width = rect.w + "px";
  holder.style.height = rect.h + "px";
  if (scale !== 1) {
    holder.style.transform = "scale(" + scale + ")";
    holder.style.transformOrigin = "0 0";
  }

  const clone = el.cloneNode(true);
  sterilize(clone);
  copyStyle(el, clone, view);
  /* The overlay, not the host's layout, decides where this sits and how big it
     is. Everything above described the look; these five lines take back the
     placement the copied `display`/flex values would otherwise argue about. */
  clone.style.position = "static";
  /* getBoundingClientRect is a border-box measurement, so the copy has to be
     one too — a content-box element given the same numbers renders wider than
     the thing it is a picture of, by its own padding and border. */
  clone.style.boxSizing = "border-box";
  clone.style.margin = "0";
  clone.style.width = rect.w + "px";
  clone.style.height = rect.h + "px";
  clone.style.maxWidth = "none";
  clone.style.maxHeight = "none";
  clone.style.minWidth = "0";
  clone.style.minHeight = "0";
  clone.style.transform = "none";
  clone.style.overflow = "hidden";
  clone.removeAttribute("hidden");

  /* Walk both trees in lockstep. cloneNode already made the copy, so this pass
     only carries over what markup cannot: computed style, and live values. */
  const from = [el];
  const to = [clone];
  let used = 1;
  let truncated = false;
  while (from.length) {
    const a = from.pop();
    const b = to.pop();
    const kidsA = a.children;
    const kidsB = b.children;
    /* Backwards, because a child dropped here shortens the clone's list while
       the original's stays put: removing from the end keeps every index that
       is still to be visited pointing at the same pair. */
    for (let i = kidsA.length - 1; i >= 0; i--) {
      const childA = kidsA[i];
      const childB = kidsB[i];
      if (!childB) continue;
      if (skip(childA) || used >= budget) {
        if (!skip(childA)) truncated = true;
        childB.remove();
        continue;
      }
      used++;
      sterilize(childB);
      copyStyle(childA, childB, view);
      carryValue(childA, childB);
      from.push(childA);
      to.push(childB);
    }
  }

  holder.appendChild(clone);
  if (truncated) holder.setAttribute("data-uikit-ghost-partial", "");
  return holder;
}
