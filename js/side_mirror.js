/* Left-handed layout for tablets and foldables (Settings → Touch).
 *
 * On a tablet or an open foldable (body.dock-rail) the panels sit either side
 * of the drawing: the tool rail on one side, the tools and the inspector on the
 * other. Held in the left hand, the right-hand column is a reach; this setting
 * mirrors the sides — rail on the right, tools and inspector on the left — in
 * the planner, the model editor and the cabinet designer. Off by default, so
 * nothing changes for anyone who does not ask. Phones and desktop windows are
 * not affected (they have no side columns to swap). The choice is kept per
 * browser (localStorage mf.leftHanded).
 *
 * It is one body class, side-mirror, set only while the tablet/fold posture is
 * on; css/pro_skin.css reverses the three row containers with it. */
var KEY = "mf.leftHanded";

export function leftHanded() {
  try { return localStorage.getItem(KEY) === "1"; } catch (_) { return false; }
}

export function setLeftHanded(on) {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (_) {}
  syncSideMirror();
}

export function syncSideMirror() {
  if (typeof document === "undefined" || !document.body) return;
  var want = leftHanded() && document.body.classList.contains("dock-rail");
  if (document.body.classList.contains("side-mirror") === want) return;
  document.body.classList.toggle("side-mirror", want);
  // the canvases keep their size but not their place: let everything re-measure
  window.dispatchEvent(new Event("resize"));
}

if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
  var start = function () {
    syncSideMirror();
    // the posture (dock-rail) comes and goes with folding and rotating
    new MutationObserver(syncSideMirror).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
}
