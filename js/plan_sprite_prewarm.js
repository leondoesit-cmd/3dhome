/* Presentation-plan pictures made AHEAD of time, while the technical plan is
   on screen, so switching to the presentation plan shows them at once.

   After the plan has been painted and then left alone for a moment (boot
   settling, an item added, resized or re-finished), every piece the
   presentation plan would picture is asked for at the current zoom through
   itemSprite(): a picture already cached costs a lookup, one kept on disk is
   decoded, anything else is queued. Pieces in view are asked first. The
   queue itself (js/plan_sprites.js) bakes these in quiet moments only and
   stops for input; the height of each piece comes from the same build.

   How much is done ahead of time comes from js/device_budget.js (nothing on a
   software GPU). It changes no pixel: the presentation plan draws exactly the
   pictures it would have baked itself, just earlier. */
import { FURN, isLamp, knownVSpan, measureVSpanSoon } from "./furniture.js";
import { SPRITE_BUCKETS, spriteBucket, spriteMode } from "./plan_sprite_key.js";
import { itemSprite, prebakeSprite } from "./plan_sprites.js";
import { isPresentation } from "./plan_style.js";
import { wx, wz } from "./plan_view.js";
import { onAfterRender } from "./plan2d/overlays.js";
import { canvasDpr } from "./plan2d/walls.js";
import { deviceBudget } from "./device_budget.js";
import { S } from "./state.js";

const SETTLE_MS = 800; // after the last paint
const IN_VIEW = 1e6; // priority bonus: above any bucket size

/* The pieces the presentation plan draws as pictures, in-view first.
   `view` is {x0, z0, x1, z1} in cm. Pure but for measuring a lamp's height
   in the background (a ceiling fitting is never pictured). */
export function prewarmOrder(items, view) {
  const out = [];
  (items || []).forEach(function (it) {
    if (!it || !FURN[it.type] || !(it.w > 0) || !(it.d > 0)) return;
    if (spriteMode(it, { lamp: false }) !== "sprite") return;
    // a light is pictured only when it stands below the plan cut (a floor or
    // table lamp); until its height is known it is measured, not baked
    if (isLamp(it)) {
      let vs = null;
      try { vs = knownVSpan(it); } catch (e) { vs = null; }
      if (!vs) {
        measureVSpanSoon(it);
        // a picture kept on disk is decoded now, nothing is baked
        itemSprite(it, S.SC, canvasDpr(), { noQueue: true });
        return;
      }
      if (vs.lo >= 150) return;
    }
    const r = Math.max(it.w, it.d) / 2;
    const inView = !view || (it.x + r >= view.x0 && it.x - r <= view.x1 && it.z + r >= view.z0 && it.z - r <= view.z1);
    out.push({ it: it, boost: inView ? IN_VIEW : 0 });
  });
  return out.sort(function (a, b) { return b.boost - a.boost; });
}

function viewRect() {
  const W = S.CW || 0, H = S.CH || 0;
  if (!(W > 0) || !(H > 0)) return null;
  const xs = [], zs = [];
  [[0, 0], [W, 0], [0, H], [W, H]].forEach(function (p) {
    xs.push(wx(p[0], p[1]));
    zs.push(wz(p[0], p[1]));
  });
  return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) };
}

/* `ahead`: only the next zoom step's pictures (the presentation plan asks
   for the current ones itself while it is shown). */
export function prewarmPlanSprites(ahead) {
  const budget = deviceBudget();
  if (!budget.prewarmSprites) return 0;
  const SC = S.SC, dpr = canvasDpr();
  if (!(SC > 0)) return 0;
  const list = prewarmOrder(S.items, viewRect());
  if (!ahead) list.forEach(function (e) { itemSprite(e.it, SC, dpr, { boost: e.boost }); });
  if (budget.prebakeNextBucket) {
    list.forEach(function (e) {
      const b = spriteBucket(Math.max(e.it.w, e.it.d) * SC * dpr), i = SPRITE_BUCKETS.indexOf(b);
      if (i >= 0 && i < SPRITE_BUCKETS.length - 1) prebakeSprite(e.it, SPRITE_BUCKETS[i + 1]);
    });
  }
  return list.length;
}

/* Every plan frame ends here, HUD-only animation frames too (the MEP flow
   runs at 30 Hz), so this throttles rather than debounces: at most one pass
   per SETTLE_MS, in an idle period. A pass over cached pieces is lookups. */
let timer = 0;
function afterPaint() {
  if (timer) return;
  timer = setTimeout(function () {
    timer = 0;
    const run = function () { try { prewarmPlanSprites(isPresentation()); } catch (e) { /* pictures are a nicety */ } };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 2000 });
    else run();
  }, SETTLE_MS);
}

// plan2d.js imports this module's importer, so its hook list does not exist
// yet while this module evaluates: register once the module graph has run
if (typeof window !== "undefined") setTimeout(function () { onAfterRender(afterPaint); }, 0);
