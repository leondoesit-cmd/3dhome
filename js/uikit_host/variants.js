/* Which layout variant belongs on this screen.
 *
 * uikit deliberately does not decide what a phone is; it asks the host. The
 * host already has that judgement written down and unit-tested across an
 * eight-device matrix in js/chrome_posture.js — the one that knows an iPhone
 * on its side is not an unfolded Fold, and an unfolded Fold held portrait is
 * not a phone. Deriving it again from a width would be a second, worse copy of
 * a decision this app has already made carefully.
 *
 * This is the seam the plan describes as chrome_posture becoming "the default
 * variant chooser instead of hard-coded chrome": today the posture drives body
 * classes and the CSS does the rest; once the layout document owns arrangement,
 * the same posture picks a variant and the document does the rest.
 */

import { chromePosture, detectTouch } from "../chrome_posture.js";

export const VARIANTS = Object.freeze(["base", "compact", "phone"]);

export function variantForPosture(posture) {
  if (posture.phone) return "phone";
  if (posture.compact) return "compact";
  return "base";
}

export function chooseVariant(size) {
  return variantForPosture(chromePosture(size.w, size.h, { touch: detectTouch() }));
}
