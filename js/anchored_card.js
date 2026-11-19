/* Where a small settings card opens beside the button that opened it (the 3D
   view's Drawing overlay card, js/ui.js initDrawingPanel). Pure geometry, so
   Node tests it: every rect is { left, top, right, bottom, width, height } in
   one coordinate space (client pixels). The card sits above its trigger, its
   end edge on the trigger's end edge; where there is no room above it opens
   below; either way it stays `margin` inside `box`. Returns the card's
   left/top relative to `box`. */
export function anchoredCardPosition(trigger, card, box, gap = 8, margin = 8) {
  var left = trigger.right - card.width;
  var top = trigger.top - gap - card.height;
  if (top < box.top + margin) top = trigger.bottom + gap;
  left = Math.min(Math.max(left, box.left + margin), box.right - margin - card.width);
  top = Math.min(Math.max(top, box.top + margin), box.bottom - margin - card.height);
  // a box narrower than the card: its start edge wins
  left = Math.max(left, box.left + margin);
  top = Math.max(top, box.top + margin);
  return { left: Math.round(left - box.left), top: Math.round(top - box.top) };
}

/* Put an open `card` (absolutely positioned) by its `trigger`, inside the
   card's positioned parent. A trigger that is not on screen (the ribbon opened
   the card) leaves the card in its css corner. */
export function placeCardBy(card, trigger) {
  var box = card && !card.hidden && (card.offsetParent || card.parentElement);
  if (!box || !trigger) return;
  var t = trigger.getBoundingClientRect();
  if (!(t.width > 0 && t.height > 0)) {
    ["left", "top", "bottom", "inset-inline-end"].forEach(function (p) { card.style.removeProperty(p); });
    return;
  }
  var b = box.getBoundingClientRect();
  var at = anchoredCardPosition(t, card.getBoundingClientRect(), b);
  card.style.setProperty("left", at.left - box.clientLeft + "px");
  card.style.setProperty("top", at.top - box.clientTop + "px");
  card.style.setProperty("bottom", "auto");
  card.style.setProperty("inset-inline-end", "auto");
}

/* While the card is open, a window resize places it again (one listener per card). */
export function followTrigger(card, trigger) {
  if (!card || card._followsTrigger) return;
  card._followsTrigger = true;
  window.addEventListener("resize", function () { if (!card.hidden) placeCardBy(card, trigger); });
}
