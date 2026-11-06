// Real-world site panel + Leaflet map picker. Mirrors js/ui_blueprint.js:
// the geo logic lives in js/site.js; this file owns the DOM. Lets the user
// pick a location (search or map), overlays real aerial/street imagery onto the
// 2D/3D views, and auto-imports the real building footprint as walls.
import { S, uid, WALL_T, WALL_H } from "./state.js";
import { t, getLang } from "./i18n.js";
import { pushHistory } from "./history.js";
import { render2D, fitView } from "./plan2d.js";
import { flash, openModal } from "./ui.js";
import { buildIconSettingsPane, initIconSettings } from "./icon_settings.js";
import { buildTouchPrecisionSettings } from "./touch_precision_ui.js";
import { buildUnitSettingsPane } from "./unit_settings.js";
import { updateCost } from "./ui_tree.js";
import { applySite, setStreetViewCube } from "./view3d.js";
import {
  geocode,
  geocodeSuggest,
  reverseGeocode,
  fetchAerial,
  fetchFootprint,
  fetchStreetViewCube,
  llToLocalCm,
  gkey,
  setGkey,
  clearAerialCache,
  googleTileSession,
  googleTileUrl,
} from "./site.js";

function $(id) {
  return document.getElementById(id);
}
function status(msg, isErr) {
  var s = $("site_status");
  if (!s) return;
  s.textContent = msg || "";
  s.style.color = isErr ? "#d32f2f" : "";
}

// Keep the design's north (compass + sun, S.northAngle) locked to the site
// rotation so the 2D compass, the sun and the street-view backdrop all agree
// on one real-world orientation. Aerial north is -Z rotated by groundRot
// (three Y-CCW) => equivalent compass north angle is -groundRot.
function syncNorthToSite() {
  // #north slider range is [0,359] — normalize into it
  var a = ((-(S.site.groundRot || 0) % 360) + 360) % 360;
  S.northAngle = a;
  var n = $("north");
  if (n) {
    n.value = a;
    // reuse ui.js's handler: updates the compass label + applyEnv + render2D
    n.dispatchEvent(new Event("input"));
  }
}

// Refresh imagery + both views for the current site params.
function rerender() {
  // overlay params only — applySite() repositions/repaints the existing
  // meshes itself; S.dirty3D would trigger a full scene rebuild for nothing
  applySite();
  render2D();
}

// Fetch the aerial tile for the current pin, then repaint.
var aerialBusy = false;
async function refreshAerial() {
  var st = S.site;
  if (!st.enabled || st.lat == null) return;
  if (aerialBusy) return;
  aerialBusy = true;
  status(t("site_loading"));
  try {
    await fetchAerial(st.lat, st.lon, st.zoom, 1280);
    status("");
  } catch (e) {
    status(t("site_err_aerial"), true);
  } finally {
    aerialBusy = false;
    rerender();
  }
}

async function setLocation(lat, lon, label, zoom) {
  var st = S.site;
  st.lat = lat;
  st.lon = lon;
  if (label != null) st.label = label;
  if (zoom) st.zoom = Math.max(16, Math.min(20, Math.round(zoom)));
  st.enabled = true;
  st.footprint = null;
  clearAerialCache();
  syncPanel();
  // map picks arrive without an address — resolve one so the panel shows a
  // real label instead of raw coordinates (best effort, keeps coords on fail)
  if (!label) {
    reverseGeocode(lat, lon)
      .then(function (l) {
        if (S.site.lat === lat && S.site.lon === lon) {
          S.site.label = l;
          syncPanel();
        }
      })
      .catch(function () {});
  }
  await refreshAerial();
  // if a street-view backdrop is active, refresh it for the new spot
  if (st.streetView) refreshStreetView();
}

async function refreshStreetView() {
  var st = S.site;
  if (!st.enabled || !st.streetView || st.lat == null) {
    setStreetViewCube(null);
    return;
  }
  if (!gkey()) {
    status(t("site_sv_needkey"), true);
    st.streetView = false;
    syncPanel();
    setStreetViewCube(null);
    return;
  }
  status(t("site_loading"));
  try {
    var faces = await fetchStreetViewCube(st.lat, st.lon, 0);
    if (!faces) {
      status(t("site_sv_none"), true);
      st.streetView = false;
      syncPanel();
      setStreetViewCube(null);
      return;
    }
    setStreetViewCube(faces);
    status("");
  } catch (e) {
    if (e.message === "invalid_key") {
      // key exists but Google rejected it (restricted / API not enabled)
      status(t("site_key_invalid"), true);
    } else {
      status(t("site_sv_none"), true);
    }
    st.streetView = false;
    syncPanel();
    setStreetViewCube(null);
  }
  S.repaint3D = true;
}

// ---- footprint -> walls ----------------------------------------------------
async function grabFootprint() {
  var st = S.site;
  if (st.lat == null) {
    status(t("site_need_loc"), true);
    return;
  }
  status(t("site_loading"));
  try {
    var fp = await fetchFootprint(st.lat, st.lon, st.provider);
    st.footprint = fp;
    var m = [];
    if (fp.levels) m.push(fp.levels + " " + t("site_levels"));
    if (fp.heightM) m.push(fp.heightM + "m");
    status(t("site_fp_ok") + (m.length ? " (" + m.join(", ") + ")" : ""));
    rerender();
  } catch (e) {
    status(t("site_fp_none"), true);
  }
}

// Convert the fetched lat/lon polygon into scene nodes+walls, anchored at the
// pin (= content center + offset) and rotated by the site's ground rotation.
function importFootprintWalls() {
  var st = S.site;
  if (!st.footprint || !st.footprint.polygonLL) {
    status(t("site_fp_first"), true);
    return;
  }
  pushHistory();
  var ll = st.footprint.polygonLL.slice();
  // drop the closing vertex if the ring repeats its start
  if (ll.length > 1) {
    var a = ll[0],
      b = ll[ll.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) ll.pop();
  }
  if (ll.length < 3) {
    status(t("site_fp_none"), true);
    return;
  }
  // wall height from real data: explicit height, else levels*280cm, else default
  var h = st.footprint.heightM
    ? Math.round(st.footprint.heightM * 100)
    : st.footprint.levels
      ? Math.round(st.footprint.levels * 280)
      : WALL_H;
  var rot = ((st.groundRot || 0) * Math.PI) / 180;
  var cosR = Math.cos(rot),
    sinR = Math.sin(rot);
  var base = S.nodes.length;
  ll.forEach(function (p) {
    var l = llToLocalCm(p[0], p[1], st.lat, st.lon);
    // rotate about origin (three Y-rotation convention) then offset to pin
    var x = l.x * cosR - l.z * sinR + (st.offX || 0);
    var z = l.x * sinR + l.z * cosR + (st.offZ || 0);
    S.nodes.push({ x: Math.round(x), z: Math.round(z) });
  });
  var n = ll.length;
  for (var i = 0; i < n; i++) {
    S.walls.push({
      id: uid(),
      a: base + i,
      b: base + ((i + 1) % n),
      thickness: WALL_T,
      height: h,
    });
  }
  S.sel = null;
  S.dirty3D = true;
  render2D();
  fitView();
  if (typeof updateCost === "function") updateCost();
  flash(t("site_imported"));
  status("");
}

// ---- Settings modal (Google key + map imagery source) ---------------------
// Both settings that touch the user's Google key live here, opened from the
// topbar gear. The key drives search, Street View, and the aerial overlay; the
// map-source select controls the interactive picker's base imagery.
export function openSettings(initialPane) {
  initialPane = typeof initialPane === "string" ? initialPane : "general";
  var m = openModal(t("settings_title"));
  m.modal.classList.add("settings-modal");
  m.body.classList.add("settings-modal-body");

  var tabs = el("div", "settings-tabs");
  tabs.setAttribute("role", "tablist");
  var generalTab = el("button", "active");
  generalTab.type = "button";
  generalTab.setAttribute("role", "tab");
  generalTab.setAttribute("aria-selected", "true");
  generalTab.innerHTML = '<i class="ph ph-sliders-horizontal"></i><span>' + t("settings_general_tab") + "</span>";
  var unitsTab = el("button");
  unitsTab.type = "button";
  unitsTab.setAttribute("role", "tab");
  unitsTab.setAttribute("aria-selected", "false");
  unitsTab.innerHTML = '<i class="ph ph-ruler"></i><span>' + t("settings_units_tab") + "</span>";
  var iconsTab = el("button");
  iconsTab.type = "button";
  iconsTab.setAttribute("role", "tab");
  iconsTab.setAttribute("aria-selected", "false");
  iconsTab.innerHTML = '<i class="ph ph-shapes"></i><span>' + t("settings_icons_tab") + "</span>";
  var touchTab = el("button");
  touchTab.type = "button";
  touchTab.setAttribute("role", "tab");
  touchTab.setAttribute("aria-selected", "false");
  touchTab.innerHTML = '<i class="ph ph-hand-tap"></i><span>' + t("settings_touch_tab") + "</span>";
  var agentTab = el("button");
  agentTab.type = "button";
  agentTab.setAttribute("role", "tab");
  agentTab.setAttribute("aria-selected", "false");
  agentTab.innerHTML = '<i class="ph ph-robot"></i><span>' + t("settings_agent_tab") + "</span>";
  tabs.appendChild(generalTab);
  tabs.appendChild(unitsTab);
  tabs.appendChild(agentTab);
  tabs.appendChild(touchTab);
  tabs.appendChild(iconsTab);

  var panes = el("div", "settings-panes");
  var generalPane = el("section", "settings-pane settings-general-pane");
  generalPane.setAttribute("role", "tabpanel");
  var unitsPane = el("section", "settings-pane settings-units-pane");
  unitsPane.setAttribute("role", "tabpanel");
  unitsPane.hidden = true;
  unitsPane.appendChild(buildUnitSettingsPane(m.close));
  var iconsPane = el("section", "settings-pane settings-icons-pane");
  iconsPane.setAttribute("role", "tabpanel");
  iconsPane.hidden = true;
  iconsPane.appendChild(buildIconSettingsPane(m.close));
  var touchPane = el("section", "settings-pane settings-touch-pane");
  touchPane.setAttribute("role", "tabpanel");
  touchPane.hidden = true;
  touchPane.appendChild(buildTouchPrecisionSettings());
  var agentPane = el("section", "settings-pane settings-agent-pane");
  agentPane.setAttribute("role", "tabpanel");
  agentPane.hidden = true;
  var agentSettingsLoading = null;
  panes.appendChild(generalPane);
  panes.appendChild(unitsPane);
  panes.appendChild(agentPane);
  panes.appendChild(touchPane);
  panes.appendChild(iconsPane);
  m.body.appendChild(tabs);
  m.body.appendChild(panes);

  function showPane(which) {
    var showIcons = which === "icons";
    var showTouch = which === "touch";
    var showAgent = which === "agent";
    if (showAgent && !agentSettingsLoading) {
      agentSettingsLoading = import('./ui_agent.js').then(function (module) {
        agentPane.appendChild(module.buildAgentSettingsPane());
      }).catch(function (error) { agentSettingsLoading = null; console.error('Agent settings failed to load', error); });
    }
    var showUnits = which === "units";
    generalPane.hidden = showIcons || showTouch || showAgent || showUnits;
    unitsPane.hidden = !showUnits;
    agentPane.hidden = !showAgent;
    touchPane.hidden = !showTouch;
    iconsPane.hidden = !showIcons;
    generalTab.classList.toggle("active", !showIcons && !showTouch && !showAgent && !showUnits);
    unitsTab.classList.toggle("active", showUnits);
    agentTab.classList.toggle("active", showAgent);
    touchTab.classList.toggle("active", showTouch);
    iconsTab.classList.toggle("active", showIcons);
    generalTab.setAttribute("aria-selected", showIcons || showTouch || showAgent || showUnits ? "false" : "true");
    unitsTab.setAttribute("aria-selected", showUnits ? "true" : "false");
    agentTab.setAttribute("aria-selected", showAgent ? "true" : "false");
    touchTab.setAttribute("aria-selected", showTouch ? "true" : "false");
    iconsTab.setAttribute("aria-selected", showIcons ? "true" : "false");
    m.modal.classList.toggle("showing-icon-settings", showIcons);
    var activeTab = showUnits ? unitsTab : (showAgent ? agentTab : (showTouch ? touchTab : (showIcons ? iconsTab : generalTab)));
    if (activeTab && typeof activeTab.scrollIntoView === "function") {
      activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }
  generalTab.onclick = function () { showPane("general"); };
  unitsTab.onclick = function () { showPane("units"); };
  agentTab.onclick = function () { showPane("agent"); };
  touchTab.onclick = function () { showPane("touch"); };
  iconsTab.onclick = function () { showPane("icons"); };
  showPane(initialPane);

  // -- Google API key -------------------------------------------------------
  var keyLbl = el("span", "t", t("site_gkey_l"));
  var keyRow = el("div");
  keyRow.style.cssText = "display:flex; gap:4px; width:100%;";
  var keyIn = el("input");
  keyIn.type = "password";
  keyIn.placeholder = t("site_gkey_ph");
  keyIn.autocomplete = "off";
  keyIn.style.flex = "1";
  keyIn.style.minWidth = "0";
  keyIn.style.fontSize = "13px";
  keyIn.value = gkey();
  var eye = el("button");
  eye.type = "button";
  eye.style.padding = "0 10px";
  eye.innerHTML = '<i class="ph ph-eye"></i>';
  keyRow.appendChild(keyIn);
  keyRow.appendChild(eye);
  var keyHint = el("span", "t", t("site_gkey_hint"));
  keyHint.style.cssText = "font-size:max(10px, var(--fs-floor, 0px)); opacity:0.75;";

  var keyT = null;
  keyIn.oninput = function () {
    var v = keyIn.value;
    clearTimeout(keyT);
    keyT = setTimeout(function () {
      setGkey(v);
      status(v.trim() ? t("site_key_saved") : t("site_key_cleared"));
    }, 250);
  };
  keyIn.onchange = function () {
    clearTimeout(keyT);
    setGkey(keyIn.value);
    status(keyIn.value.trim() ? t("site_key_saved") : t("site_key_cleared"));
    if (S.site.enabled && S.site.lat != null) {
      clearAerialCache();
      refreshAerial();
    }
    if (S.site.streetView) refreshStreetView();
  };
  eye.onclick = function () {
    var i = eye.querySelector("i");
    if (keyIn.type === "password") {
      keyIn.type = "text";
      i.className = "ph ph-eye-slash";
    } else {
      keyIn.type = "password";
      i.className = "ph ph-eye";
    }
  };

  // -- Map imagery source ---------------------------------------------------
  var mapLbl = el("span", "t", t("settings_map_l"));
  mapLbl.style.marginTop = "6px";
  var mapSel = el("select");
  [
    ["esri", t("settings_map_esri")],
    ["google", t("settings_map_google")],
  ].forEach(function (o) {
    var opt = el("option", null, o[1]);
    opt.value = o[0];
    mapSel.appendChild(opt);
  });
  mapSel.value = S.site.mapProvider || "esri";
  mapSel.onchange = function () {
    S.site.mapProvider = mapSel.value;
    if (mapSel.value === "google" && !gkey())
      status(t("settings_map_needkey"), true);
  };
  var mapHint = el("span", "t", t("settings_map_hint"));
  mapHint.style.cssText = "font-size:max(10px, var(--fs-floor, 0px)); opacity:0.75;";

  [keyLbl, keyRow, keyHint, mapLbl, mapSel, mapHint].forEach(function (n) {
    generalPane.appendChild(n);
  });

  var done = el("button", "btn-accent", t("close"));
  done.onclick = m.close;
  m.actions.appendChild(done);
}

// ---- Leaflet map picker modal ---------------------------------------------
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

// Attach a debounced address-autocomplete dropdown to a text input.
//   anchor : positioned (relative) element the dropdown is appended to.
//   onPick : fn({lat,lon,label}) called when a suggestion is chosen.
// Returns a detach() to clean up the outside-click listener.
function attachAutocomplete(input, anchor, onPick) {
  var box = el("div", "site-ac");
  box.style.display = "none";
  anchor.appendChild(box);

  var items = []; // current [{lat,lon,label}]
  var active = -1; // highlighted index
  var timer = null;
  var reqSeq = 0; // guard against out-of-order async responses

  function hide() {
    box.style.display = "none";
    box.innerHTML = "";
    items = [];
    active = -1;
  }
  function highlight(i) {
    active = i;
    var rows = box.children;
    for (var r = 0; r < rows.length; r++)
      rows[r].classList.toggle("active", r === i);
  }
  function choose(i) {
    if (i < 0 || i >= items.length) return;
    var it = items[i];
    input.value = it.label;
    hide();
    onPick(it);
  }
  function render() {
    box.innerHTML = "";
    if (!items.length) {
      hide();
      return;
    }
    items.forEach(function (it, i) {
      var row = el("div", "site-ac-item", it.label);
      row.onmousedown = function (e) {
        // mousedown (not click) so it fires before the input's blur hides us
        e.preventDefault();
        choose(i);
      };
      box.appendChild(row);
    });
    box.style.display = "block";
    highlight(-1);
  }
  function query() {
    var q = input.value.trim();
    if (q.length < 3) {
      hide();
      return;
    }
    var seq = ++reqSeq;
    geocodeSuggest(q, 6, getLang())
      .then(function (list) {
        if (seq !== reqSeq) return; // a newer query superseded this one
        items = list || [];
        render();
      })
      .catch(function () {
        if (seq === reqSeq) hide();
      });
  }

  input.addEventListener("input", function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(query, 250);
  });
  input.addEventListener("keydown", function (e) {
    if (box.style.display === "none") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlight(Math.min(active + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlight(Math.max(active - 1, 0));
    } else if (e.key === "Enter") {
      if (active >= 0) {
        e.preventDefault();
        e.stopPropagation();
        choose(active);
      }
    } else if (e.key === "Escape") {
      hide();
    }
  });
  input.addEventListener("blur", function () {
    // delay so a suggestion mousedown can complete first
    setTimeout(hide, 150);
  });
  return hide;
}

function openMapModal() {
  if (typeof L === "undefined") {
    status(t("site_no_leaflet"), true);
    return;
  }
  var st = S.site;
  var overlay = el("div", "bp-overlay");
  var modal = el("div", "bp-modal site-map-modal");
  overlay.appendChild(modal);
  modal.appendChild(el("h3", null, t("site_pick_title")));

  var searchRow = el("div", "bp-row");
  searchRow.style.position = "relative"; // anchor for the autocomplete dropdown
  var searchIn = el("input");
  searchIn.type = "text";
  searchIn.placeholder = t("site_search_ph");
  searchIn.style.flex = "1";
  searchIn.setAttribute("autocomplete", "off");

  var searchBtn = el("button", "btn-accent", t("site_go"));
  searchRow.appendChild(searchIn);
  searchRow.appendChild(searchBtn);
  modal.appendChild(searchRow);

  // Live suggestions: picking one moves the map + marker straight to it.
  attachAutocomplete(searchIn, searchRow, function (r) {
    if (map) {
      map.setView([r.lat, r.lon], 18);
      marker.setLatLng([r.lat, r.lon]);
    }
    searchIn.style.borderColor = "";
  });

  var mapDiv = el("div", "site-map");
  modal.appendChild(mapDiv);

  var btnRow = el("div", "bp-btnrow");
  var btnCancel = el("button", null, t("cancel"));
  var btnOk = el("button", "btn-accent", t("site_use_here"));
  btnRow.appendChild(btnCancel);
  btnRow.appendChild(btnOk);
  modal.appendChild(btnRow);
  document.body.appendChild(overlay);

  var startLat = st.lat != null ? st.lat : 32.0853,
    startLon = st.lon != null ? st.lon : 34.7818; // Tel Aviv default
  var startZoom = st.lat != null ? st.zoom : 18;

  // Esri World Imagery + faint OSM street overlay (the free default base).
  function addEsriBase(map) {
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 20, attribution: "Esri World Imagery" },
    ).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      opacity: 0.28,
      attribution: "© OpenStreetMap",
    }).addTo(map);
  }

  // Leaflet needs a laid-out container; defer init to next frame.
  var map, marker;
  var markerMoved = false;
  requestAnimationFrame(function () {
    map = L.map(mapDiv).setView([startLat, startLon], startZoom);
    // Google imagery only when the user chose it AND has a key; the Map Tiles
    // session is async, so add Esri first and swap on success (fall back to it
    // on any failure so the picker is never left blank).
    if (st.mapProvider === "google" && gkey()) {
      googleTileSession()
        .then(function (session) {
          if (!map) return; // modal closed before the token arrived
          L.tileLayer(googleTileUrl(session), {
            maxZoom: 22,
            attribution: "Google",
          }).addTo(map);
        })
        .catch(function () {
          if (!map) return; // modal closed before the token failed
          status(t("site_gmap_failed"), true);
          addEsriBase(map);
        });
    } else {
      addEsriBase(map);
    }
    marker = L.marker([startLat, startLon], { draggable: true }).addTo(map);
    marker.on("dragend", function() {
      markerMoved = true;
    });
    map.on("click", function (e) {
      marker.setLatLng(e.latlng);
      markerMoved = true;
    });
  });

  function close() {
    if (map) {
      map.remove();
      map = null; // so a late Google-tiles callback becomes a no-op
    }
    document.body.removeChild(overlay);
  }
  btnCancel.onclick = close;
  overlay.onclick = function (e) {
    if (e.target === overlay) close();
  };

  function doSearch() {
    var q = searchIn.value.trim();
    if (!q) return;
    searchBtn.disabled = true;
    searchBtn.textContent = "…";
    geocode(q)
      .then(function (r) {
        if (map) {
          map.setView([r.lat, r.lon], 18);
          marker.setLatLng([r.lat, r.lon]);
          markerMoved = false; // reset because this was an automated move
          searchIn.value = r.label; // update input to the clean geocoded label
        }
      })
      .catch(function () {
        searchIn.style.borderColor = "#d32f2f";
      })
      .finally(function () {
        searchBtn.disabled = false;
        searchBtn.textContent = t("site_go");
      });
  }
  searchBtn.onclick = doSearch;
  searchIn.onkeydown = function (e) {
    if (e.key === "Enter") doSearch();
  };

  attachAutocomplete(searchIn, searchRow, function (r) {
    if (map) {
      map.setView([r.lat, r.lon], 18);
      marker.setLatLng([r.lat, r.lon]);
      markerMoved = false;
    }
    searchIn.style.borderColor = "";
  });

  btnOk.onclick = function () {
    if (!marker) return;
    var ll = marker.getLatLng();
    var z = map ? map.getZoom() : startZoom;
    close();
    var lbl = markerMoved ? "" : searchIn.value.trim();
    setLocation(ll.lat, ll.lng, lbl, z);
  };
}

// ---- panel <-> state sync --------------------------------------------------
function syncPanel() {
  var st = S.site;
  if ($("site_enable")) $("site_enable").checked = !!st.enabled;
  if ($("site_2d")) $("site_2d").checked = !!st.show2D;
  if ($("site_3d")) $("site_3d").checked = !!st.show3D;
  if ($("site_sv")) $("site_sv").checked = !!st.streetView;
  if ($("site_opacity")) $("site_opacity").value = st.opacity;
  if ($("site_rot")) $("site_rot").value = st.groundRot;
  if ($("site_floor")) $("site_floor").value = st.floor || 0;
  if ($("site_provider")) $("site_provider").value = st.provider;
  var lbl = $("site_label");
  if (lbl)
    lbl.textContent = st.label
      ? st.label
      : st.lat != null
        ? st.lat.toFixed(5) + ", " + st.lon.toFixed(5)
        : t("site_none");
}
// exported so ui.js applyData() can refresh the panel after a load
export { syncPanel as syncSiteUI };

export function initSite() {
  initIconSettings();
  var pick = $("site_pick");
  if (pick) pick.onclick = openMapModal;

  var locate = $("site_locate");
  if (locate)
    locate.onclick = function () {
      // structured fields (city/street/number); a legacy single #site_search
      // field is also honored if a plan/page still has one
      var city = (($("site_city") && $("site_city").value) || "").trim();
      var street = (($("site_street") && $("site_street").value) || "").trim();
      var num = (($("site_number") && $("site_number").value) || "").trim();
      var free = (($("site_search") && $("site_search").value) || "").trim();
      if (!city && !street && !free) return;
      var q = free || { city: city, street: street, number: num };
      status(t("site_loading"));
      geocode(q, getLang())
        .then(function (r) {
          return setLocation(r.lat, r.lon, r.label, 18);
        })
        .catch(function () {
          status(t("site_err_geo"), true);
        });
    };

  ["site_search", "site_city", "site_street", "site_number"].forEach(
    function (id) {
      if ($(id))
        $(id).onkeydown = function (e) {
          if (e.key === "Enter" && locate) locate.onclick();
        };
    },
  );

  if ($("site_enable"))
    $("site_enable").onchange = function () {
      S.site.enabled = this.checked;
      if (this.checked && S.site.lat != null && !S.site.footprint) refreshAerial();
      else rerender();
    };
  if ($("site_2d"))
    $("site_2d").onchange = function () {
      S.site.show2D = this.checked;
      render2D();
    };
  if ($("site_3d"))
    $("site_3d").onchange = function () {
      S.site.show3D = this.checked;
      applySite();
    };
  if ($("site_sv"))
    $("site_sv").onchange = function () {
      S.site.streetView = this.checked;
      refreshStreetView();
    };
  if ($("site_opacity"))
    $("site_opacity").oninput = function () {
      S.site.opacity = parseFloat(this.value);
      rerender();
    };
  if ($("site_rot"))
    $("site_rot").oninput = function () {
      S.site.groundRot = parseFloat(this.value);
      syncNorthToSite();
      rerender();
    };
  if ($("site_floor"))
    $("site_floor").onchange = function () {
      S.site.floor = Math.max(0, Math.round(parseFloat(this.value) || 0));
      this.value = S.site.floor;
      rerender();
    };
  // offset nudge buttons (data-nudge="x|z" data-sign="1|-1")
  document.querySelectorAll("[data-site-nudge]").forEach(function (b) {
    b.onclick = function () {
      var axis = b.getAttribute("data-site-nudge");
      var sign = parseFloat(b.getAttribute("data-sign")) || 1;
      var stepEl = $("site_step");
      var step = (stepEl && parseFloat(stepEl.value)) || 50;
      if (axis === "x") S.site.offX = (S.site.offX || 0) + sign * step;
      else S.site.offZ = (S.site.offZ || 0) + sign * step;
      rerender();
    };
  });
  if ($("site_provider"))
    $("site_provider").onchange = function () {
      S.site.provider = this.value;
    };
  if ($("site_footprint")) $("site_footprint").onclick = grabFootprint;
  if ($("site_import")) $("site_import").onclick = importFootprintWalls;
  // Google key + map-source now live in the Settings modal (topbar gear).
  if ($("btn_settings")) $("btn_settings").onclick = openSettings;
  window.addEventListener("agent-open-settings", function () { openSettings("agent"); });
  window.addEventListener("unit-open-settings", function () { openSettings("units"); });

  // a plan load (ui.js applyData) fires this after replacing S.site
  window.addEventListener("site:reload", function () {
    syncPanel();
    if (S.site.enabled && S.site.lat != null) refreshAerial();
    if (S.site.streetView) refreshStreetView();
  });

  syncPanel();
  // if a plan loaded with a site already enabled, fetch its imagery now
  if (S.site.enabled && S.site.lat != null) refreshAerial();
}
