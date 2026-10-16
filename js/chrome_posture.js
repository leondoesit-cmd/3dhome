/* Compact / foldable posture — pure function so the eight-device matrix can
   be unit-tested without a window.

   Compact chrome (two bottom rows) is for fingers and for genuinely small
   windows. Roomy chrome (docked panels + 2D|3D in a row) is for screens that
   are tablet-sized on BOTH axes. The previous `width ≥ 700 && landscape` test
   treated an iPhone on its side as an unfolded Fold, and an unfolded Fold
   held portrait as a phone. */

export function chromePosture(w, h, opts) {
  w = Number(w) || 0;
  h = Number(h) || 0;
  var touch = !!(opts && opts.touch);
  var shortEdge = Math.min(w, h);
  var longEdge = Math.max(w, h);
  /* Height ≤ 500 is a phone on its side (iPhone 14 landscape is 844×390).
     Mouse-driven split-screen windows keep their desktop menus.
     Unfolded foldables and tablets in landscape (e.g. Galaxy Z Fold 1104×884)
     need touch chrome rather than tiny desktop menus. */
  var shortPhone = w <= 1024 && h <= 500;
  var tabletTouch = touch && shortEdge >= 520 && longEdge <= 1280;
  var compact = w <= 500 || (touch && (w <= 1024 || shortPhone)) || tabletTouch;
  /* Both axes tablet-sized. Pixel Fold inner (673×841) is roomy even though
     its CSS width sits under 700; a 390px-tall phone never is. */
  var roomy = compact && shortEdge >= 520 && longEdge >= 700;
  /* Cover screens and phones: the stacked split is too cramped. Tablets and
     unfolded inners are not phones, in either orientation. */
  var phone = shortEdge <= 500;
  /* A touch screen too big for the compact chrome (iPad Pro landscape
     1366×1024, a Surface) keeps the desktop layout — ribbon, panels — but
     a finger is not a cursor: its controls get touch-sized targets and its
     hints stop saying "right-click" (css/ui_system.css, body.touch-desk). */
  var touchDesk = touch && !compact;
  return {
    touchDesk: touchDesk,
    compact: compact,
    roomy: roomy,
    phone: phone,
    dockRail: compact && roomy,
    sheetDrawers: compact && !roomy,
    splitRow: compact && roomy,
  };
}

export function detectTouch() {
  var touch = false;
  try {
    touch = !!(globalThis.matchMedia && globalThis.matchMedia("(pointer: coarse)").matches);
  } catch (_) {}
  var nav = globalThis.navigator;
  return touch || !!(nav && (nav.maxTouchPoints || 0) > 0);
}

export function windowChromePosture() {
  return chromePosture(globalThis.innerWidth || 0, globalThis.innerHeight || 0, {
    touch: detectTouch(),
  });
}
