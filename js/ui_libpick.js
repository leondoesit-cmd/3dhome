// A library browser in a modal, for anywhere a catalogue piece has to be
// PICKED rather than added straight to the plan (the placeholder-point panel is
// the first caller).
//
// Two things a <select> could not do, and the reason this exists:
//   - it shows the model, in the same category tree and search box as the side
//     library, so you choose by picture;
//   - it covers the WHOLE catalogue. CATALOG is a hand-kept tree, so a type
//     that is in FURN but was never filed under a subcategory — custom models
//     above all — is unreachable from the tree. Everything missing is collected
//     into a synthetic "other" category, and search runs over FURN itself, so
//     no buildable piece is hidden.
import { FURN, flabel, clabel, CATALOG } from "./furniture.js";
import { modelThumb, thumbAsync, hasThumb, loadThumbCache } from "./thumbs.js";
import { escapeHTML } from "./safe.js";
import { t } from "./i18n.js";
import { openModal } from "./ui.js";

// every type the category tree can reach
function filedTypes() {
  var seen = {};
  CATALOG.forEach(function (cat) {
    (cat.sub || []).forEach(function (sub) {
      (sub.items || []).forEach(function (ty) {
        seen[ty] = 1;
      });
    });
  });
  return seen;
}

// CATALOG plus a trailing category holding whatever the tree left out
function pickerTree() {
  var filed = filedTypes(),
    rest = [];
  for (var k in FURN) if (!filed[k]) rest.push(k);
  if (!rest.length) return CATALOG;
  return CATALOG.concat([
    {
      id: "__other",
      label: t("lib_other"),
      icon: "ph-dots-three-outline",
      sub: [{ id: "__other_all", label: t("lib_other"), icon: "ph-cube", items: rest }],
    },
  ]);
}

function matches(type, q) {
  if (!FURN[type]) return false;
  var lbl = (flabel(type) || "").toLowerCase(),
    base = (FURN[type].label || "").toLowerCase();
  return lbl.indexOf(q) !== -1 || base.indexOf(q) !== -1 || type.toLowerCase().indexOf(q) !== -1;
}

function thumbTag(type) {
  if (hasThumb(type)) {
    var url = modelThumb(type);
    return url
      ? '<img class="furn-thumb" src="' + escapeHTML(url) + '" alt="" />'
      : '<span class="furn-thumb" aria-hidden="true"></span>';
  }
  return '<span class="furn-thumb" data-thumb="' + escapeHTML(type) + '" aria-hidden="true"></span>';
}

/* Same deal as the side library: paint the labels first, render the models
   afterwards through thumbAsync, so a 60-hit search shows its 60 tiles on the
   keystroke instead of blocking on 60 WebGL renders. `run` is bumped by the
   next grid so a superseded grid's late pictures are dropped. */
var hydrateRun = 0;
async function hydrate(root) {
  var run = ++hydrateRun;
  await loadThumbCache();
  if (run !== hydrateRun || !root.isConnected) return;
  Array.prototype.forEach.call(root.querySelectorAll("[data-thumb]"), function (el) {
    thumbAsync(el.dataset.thumb).then(function (url) {
      if (run !== hydrateRun || !el.isConnected) return;
      if (url) {
        var img = document.createElement("img");
        img.className = "furn-thumb";
        img.src = url;
        img.alt = "";
        el.replaceWith(img);
      } else el.removeAttribute("data-thumb");
    });
  });
}

/* Open the browser. `onPick(type)` is called with the chosen catalogue type and
   the modal closes itself; `opts.current` pre-opens the category the given type
   lives in, so "replace what stands here" starts where you already are. */
export function openLibraryPicker(onPick, opts) {
  opts = opts || {};
  var dlg = openModal(opts.title || t("lib_pick_title"));
  var tree = pickerTree();
  var path = [];
  if (opts.current)
    tree.some(function (cat) {
      return (cat.sub || []).some(function (sub) {
        if ((sub.items || []).indexOf(opts.current) === -1) return false;
        path = [cat.id, sub.id];
        return true;
      });
    });

  var search = document.createElement("input");
  search.type = "search";
  search.className = "lib-pick-search";
  search.placeholder = t("lib_search_ph");
  var grid = document.createElement("div");
  grid.className = "lib-pick-body";
  dlg.body.appendChild(search);
  dlg.body.appendChild(grid);

  function tile(type) {
    return (
      '<div class="furn-item" data-type="' +
      escapeHTML(type) +
      '">' +
      thumbTag(type) +
      "<span>" +
      escapeHTML(flabel(type)) +
      "</span></div>"
    );
  }
  function navTile(node) {
    var icon = /^ph-[a-z0-9-]+$/.test(node.icon || "") ? node.icon : "ph-folder";
    return (
      '<div class="furn-item furn-nav" data-nav="' +
      escapeHTML(node.id) +
      '"><i class="ph ' +
      icon +
      ' furn-nav-icon"></i><span>' +
      escapeHTML(clabel(node)) +
      "</span></div>"
    );
  }

  function draw() {
    var q = search.value.trim().toLowerCase(),
      html = "";
    if (q) {
      var hits = [];
      for (var k in FURN) if (matches(k, q)) hits.push(k);
      if (!hits.length) html = '<div class="t lib-empty">' + t("lib_noresults") + "</div>";
      else
        html =
          '<div class="furn-grid">' +
          hits
            .slice(0, 120)
            .map(tile)
            .join("") +
          "</div>";
    } else {
      if (path.length)
        html +=
          '<div class="furn-cats"><button class="furn-cat" data-back="1">' +
          '<i class="ph ph-arrow-left"></i> ' +
          t("back") +
          "</button></div>";
      html += '<div class="furn-grid">';
      if (!path.length) html += tree.map(navTile).join("");
      else {
        var cat = tree.find(function (c) {
          return c.id === path[0];
        });
        if (path.length === 1) html += ((cat && cat.sub) || []).map(navTile).join("");
        else {
          var sub = ((cat && cat.sub) || []).find(function (s) {
            return s.id === path[1];
          });
          html += ((sub && sub.items) || [])
            .filter(function (ty) {
              return FURN[ty];
            })
            .map(tile)
            .join("");
        }
      }
      html += "</div>";
    }
    grid.innerHTML = html;
    hydrate(grid);
  }

  grid.addEventListener("click", function (e) {
    var back = e.target.closest("[data-back]"),
      nav = e.target.closest("[data-nav]"),
      it = e.target.closest("[data-type]");
    if (back) {
      path.pop();
      draw();
    } else if (nav) {
      path.push(nav.dataset.nav);
      draw();
    } else if (it) {
      dlg.close();
      hydrateRun++; // abandon any thumbs still queued for the closed grid
      onPick(it.dataset.type);
    }
  });
  var cancel = document.createElement("button");
  cancel.textContent = t("cancel");
  cancel.addEventListener("click", function () {
    hydrateRun++;
    dlg.close();
  });
  dlg.actions.appendChild(cancel);

  search.addEventListener("input", draw);
  draw();
  setTimeout(function () {
    search.focus();
  }, 0);
  return dlg;
}
