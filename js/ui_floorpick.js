/* A visual picker for a room's floor material.
 *
 * The floor lives in `#r_floor`, a native <select> of 23 named materials in
 * four optgroups. Choosing "Terrazzo" over "Granite" from that list means
 * knowing what both words look like, and on a phone it means: select the room,
 * open Edit, swipe to the right page, tap the select, and read 23 lines off an
 * OS wheel that shows no floor at all. The material is the one property in the
 * whole inspector nobody can name from memory and everybody can recognise on
 * sight, so it is the one that should never have been a list of words.
 *
 * The <select> stays the source of truth for WHICH materials exist, what they
 * are called and how they are grouped — this module reads the live element, so
 * adding an <option> or a translation lights up here with no second edit. Only
 * the pixels come from elsewhere: floorSwatch() paints the same table the 3D
 * floor does (js/primitives.js), so a tile cannot show something the room will
 * not become.
 */
import { floorSwatch } from "./primitives.js";
import { materialById, materialThumbUrl } from "./material_library.js";
import { materialLibraryEnabled } from "./material_tier.js";
import { escapeHTML } from "./safe.js";
import { t } from "./i18n.js";
import { openModal } from "./ui.js";

/* The groups exactly as the inspector shows them. An <option> outside any
   <optgroup> is still offered, under no heading, rather than silently dropped:
   a material the picker cannot reach is worse than an unlabelled row. */
function floorGroups() {
  var select = document.getElementById("r_floor");
  if (!select) return [];
  var groups = [],
    loose = null;
  Array.prototype.forEach.call(select.children, function (node) {
    if (node.tagName === "OPTGROUP") {
      var items = Array.prototype.map.call(node.querySelectorAll("option"), option);
      if (items.length) groups.push({ label: node.label || "", items: items });
    } else if (node.tagName === "OPTION") {
      if (!loose) groups.push((loose = { label: "", items: [] }));
      loose.items.push(option(node));
    }
  });
  return groups;
}

function option(node) {
  return { value: node.value, label: (node.textContent || node.value).trim() };
}

/* The baked material ball when the library has this floor AND the 3D view
   will render it (materialLibraryEnabled), the painted swatch otherwise — a
   swatch must show what the floor will look like — and the painted one as
   the fallback when the ball cannot load. */
function tile(entry, current) {
  var baked = materialLibraryEnabled() && materialById("floor_" + entry.value);
  var url = baked ? materialThumbUrl("floor_" + entry.value) : floorSwatch(entry.value, 128);
  var on = entry.value === current;
  return (
    '<button type="button" class="floor-tile' + (on ? " on" : "") +
    '" data-floor="' + escapeHTML(entry.value) + '"' +
    (on ? ' aria-current="true"' : "") + ">" +
    (url
      ? '<img class="floor-tile-swatch" src="' + escapeHTML(url) + '" alt="" />'
      : '<span class="floor-tile-swatch" aria-hidden="true"></span>') +
    "<span>" + escapeHTML(entry.label) + "</span></button>"
  );
}

/* `current` marks the material the room already has; `onPick` receives the new
   one. The dialog closes on a pick, because the whole point is one tap. */
export function openFloorPicker(current, onPick, opts) {
  opts = opts || {};
  var groups = floorGroups();
  var dlg = openModal(opts.title || t("floor_pick_title"));
  var body = document.createElement("div");
  body.className = "floor-pick-body";
  body.innerHTML = groups
    .map(function (group) {
      return (
        (group.label ? '<h4 class="floor-pick-sec">' + escapeHTML(group.label) + "</h4>" : "") +
        '<div class="floor-grid">' +
        group.items
          .map(function (entry) {
            return tile(entry, current);
          })
          .join("") +
        "</div>"
      );
    })
    .join("");
  dlg.body.appendChild(body);
  body.addEventListener("error", function (e) {
    var img = e.target;
    if (!img || img.tagName !== "IMG" || img.dataset.fallback) return;
    var hit = img.closest("[data-floor]");
    img.dataset.fallback = "1";
    if (hit) img.src = floorSwatch(hit.dataset.floor, 128);
  }, true);

  body.addEventListener("click", function (e) {
    var hit = e.target.closest("[data-floor]");
    if (!hit) return;
    dlg.close();
    if (onPick) onPick(hit.dataset.floor);
  });

  var cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = t("cancel");
  cancel.addEventListener("click", dlg.close);
  dlg.actions.appendChild(cancel);

  // Scroll the material the room already has into view, so a picker opened on
  // a concrete floor does not start at the top of the wood group.
  var marked = body.querySelector(".floor-tile.on");
  if (marked) marked.scrollIntoView({ block: "center" });
  return dlg;
}
