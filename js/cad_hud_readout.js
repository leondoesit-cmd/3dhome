/* The selection half of the planner status readout (#cadName / #cadDetail):
   what the selected thing is called and its size, as text. Pure, so Node can
   test it; js/cad_hud.js passes its own length formatter and wall-length rule.

   The detail stays width × depth (no height) on purpose for now. */
import { t } from "./i18n.js";
import { flabel } from "./furniture_meta.js";
import { roomName } from "./geometry.js";
import { voidDisplayName } from "./stair_strings.js";

/* `fmt(cm, domain)` formats one length; `wallLen(wall)` is the wall length the
   plan shows. Returns { name, detail }; both empty for no selection. */
export function selectionReadout(sel, fmt, wallLen) {
  var name = "",
    detail = "";
  if (!sel) return { name: name, detail: detail };
  var ref = sel.ref;
  if (sel.kind === "slabvoid" && ref) {
    name = voidDisplayName(ref) || t("sv_title");
    detail = fmt(ref.w, "rooms") + " × " + fmt(ref.d, "rooms");
  } else if (sel.kind === "wall" && ref) {
    name = t("wallId", { id: ref.id });
    detail = fmt(wallLen(ref), "rooms");
  } else if (sel.kind === "item" && ref) {
    name = ref.name || flabel(ref.type);
    detail = fmt(ref.w, "furniture") + " × " + fmt(ref.d, "furniture");
  } else if (sel.kind === "opening" && ref) {
    name = ref.name || t(ref.type === "door" ? "door" : ref.type === "passage" ? "passage" : "window");
    detail = fmt(ref.w || ref.width || 0, "openings") + " × " + fmt(ref.h || ref.height || 0, "openings");
  } else if (sel.kind === "room") {
    name = roomName(ref) || t("room");
  } else if (sel.kind === "marker" && ref) {
    name = ref.name || t("mk_points");
  } else if (sel.kind === "node") {
    name = t("nd_title");
  } else if (sel.kind === "items") {
    name = t("cad_nsel", { n: sel.refs.length });
  }
  return { name: name, detail: detail };
}
