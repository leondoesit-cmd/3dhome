/* ==========================================================================
   TEXTURE GALLERY & AUTO SEARCH UI (ui_textures.js)
   --------------------------------------------------------------------------
   - Interactive Modal Dialog for texture searching and selection
   - Dynamic target selection (Selected Room, All Rooms, Wall, Item, Cabinet)
   - Real-time debounced online + offline search
   - Context-aware category auto-selection
   - Texture scale & color tint controls
   ========================================================================== */

import { S } from "./state.js";
import { pushHistory } from "./history.js";
import { roomMetaFor, fillProps } from "./ui_props.js";
import { render2D } from "./plan2d.js";
import { t, getLang } from "./i18n.js";
import { TEXTURE_CATEGORIES, PRESET_TEXTURES, getTexturePresetDataUrl, searchOnlineFreeTextures, SEARCH_SOURCES, translateSearchQuery } from "./textures.js";
import { materialById, materialRef, materialThumbUrl, materialUrl } from "./material_library.js";
import { materialLibraryEnabled } from "./material_tier.js";
import { detectRooms } from "./geometry.js";

/* Built-in presets that have a baked library set are saved as "mat:<id>"
   (a few bytes, full PBR in 3D) instead of the generated canvas's data URL. */
function libraryRef(tex) {
  return tex && !tex.isOnline && materialById(tex.id) ? materialRef(tex.id) : null;
}
/* The ball is shown only where 3D will render the baked set (not on a
   software rasteriser, which keeps the procedural textures). */
function showsBakedThumb(tex) {
  return !!libraryRef(tex) && materialLibraryEnabled();
}
/* Card / swatch background: the baked material ball over the procedural
   swatch, so a card still shows something offline or before the bake. */
function previewBackground(tex, fallbackUrl) {
  var layers = [];
  if (showsBakedThumb(tex)) {
    layers.push("url('" + materialThumbUrl(tex.id) + "') center / 82% no-repeat");
    // a soft studio backdrop for the rendered ball; the procedural swatch
    // underneath only shows through faintly (and fully if the ball is missing
    // its card still reads as that material)
    layers.push("radial-gradient(circle at 50% 42%, rgba(92,96,104,.84), rgba(36,39,46,.9))");
  }
  if (fallbackUrl) layers.push("url('" + fallbackUrl + "') center / cover");
  return layers.join(", ");
}

var modalEl = null;
var activeTarget = "floor"; // "floor", "all_floors", "wall", "all_walls", "item", "cab_doors", "cab_body", "cab_top"
var activeCat = "all";
var currentScale = 200;
var currentBumpScale = 0.20;
var currentTint = "#ffffff";
var currentQuery = "";
var searchTimeout = null;
var currentView = "grid";
var activeSourceFilter = "all";
var hoverPreviewEl = null;
var selectedTexture = null;
var searchRequestId = 0;
var searchStatusHideTimeout = null;

// --- FAVORITES STORE ---
function getFavoritesMap() {
  try {
    var raw = localStorage.getItem("3dhome_tex_favs");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveFavoritesMap(map) {
  try {
    localStorage.setItem("3dhome_tex_favs", JSON.stringify(map));
  } catch (e) {}
}

function isFavorite(texId) {
  var map = getFavoritesMap();
  return !!map[texId];
}

function toggleFavorite(tex) {
  var map = getFavoritesMap();
  if (map[tex.id]) {
    delete map[tex.id];
  } else {
    var nameObj = typeof tex.name === "object" ? tex.name : { he: tex.name, en: tex.name };
    map[tex.id] = {
      id: tex.id,
      cat: tex.cat || "fav",
      name: nameObj,
      source: tex.source || "Built-in",
      sourceColor: tex.sourceColor || "#8b5cf6",
      thumbUrl: tex.thumbUrl || getTexturePresetDataUrl(tex),
      textureUrl: libraryRef(tex) || tex.textureUrl || (tex.generate ? getTexturePresetDataUrl(tex) : tex.thumbUrl),
      scale: tex.scale || 200,
      isOnline: !!tex.isOnline
    };
  }
  saveFavoritesMap(map);
}

// Track current results to avoid re-fetching on filter
var currentLocalResults = [];
var currentOnlineResults = [];
var onTextureSelectCallback = null;

export function openTextureGallery(targetHint, onSelectCallback) {
  if (!modalEl) createTextureGalleryModal();
  
  onTextureSelectCallback = onSelectCallback || null;

  // Auto-detect target based on current selection if not specified
  if (!targetHint) {
    if (S.sel) {
      if (S.sel.kind === "room") activeTarget = "floor";
      else if (S.sel.kind === "wall") activeTarget = "wall";
      else if (S.sel.kind === "item") activeTarget = "item";
    } else {
      activeTarget = "all_floors";
    }
  } else {
    activeTarget = targetHint;
  }

  // Set default category based on target
  if (activeTarget.includes("floor")) activeCat = "wood";
  else if (activeTarget.includes("wall")) activeCat = "concrete";
  else if (activeTarget === "item") activeCat = "fabric";
  else activeCat = "all";

  currentQuery = "";
  currentOnlineResults = [];
  activeSourceFilter = "all";
  selectedTexture = null;
  updateTargetSelector();
  updateTargetControls();
  updateSelectionPanel();
  renderCategoryTabs();
  renderTexturesGrid();

  modalEl.classList.add("open");
  modalEl.setAttribute("aria-hidden", "false");
  var searchInput = document.getElementById("texGallerySearch");
  if (searchInput) {
    searchInput.value = "";
    searchInput.focus();
  }
  document.querySelectorAll(".tex-source-chip").forEach(function(chip) {
    chip.classList.toggle("active", chip.getAttribute("data-source") === "all");
  });
}

export function closeTextureGallery() {
  if (modalEl) {
    modalEl.classList.remove("open");
    modalEl.setAttribute("aria-hidden", "true");
  }
  hideHoverPreview();
}

function createTextureGalleryModal() {
  modalEl = document.createElement("div");
  modalEl.id = "textureGalleryModal";
  modalEl.className = "tex-modal-backdrop";
  modalEl.setAttribute("aria-hidden", "true");

  var lang = getLang();
  var isHe = lang === "he";

  // dynamically populated from SEARCH_SOURCES
  var sourceChips = '<button class="tex-source-chip active" data-source="all">' + (isHe ? "הכל / All" : "All") + '</button>' +
                    '<button class="tex-source-chip" data-source="builtin">' + (isHe ? "מובנים / Built-in" : "Built-in") + '</button>';
  
  if (typeof SEARCH_SOURCES !== "undefined" && SEARCH_SOURCES) {
    SEARCH_SOURCES.forEach(function(src) {
      sourceChips += '<button class="tex-source-chip" data-source="' + src.id + '">' + src.name + '</button>';
    });
  }

  modalEl.innerHTML = `
    <div class="tex-modal-container" role="dialog" aria-modal="true" aria-labelledby="texGalleryTitle">
      <header class="tex-modal-header">
        <div class="tex-modal-title">
          <span class="tex-title-icon"><i class="ph ph-paint-brush-broad"></i></span>
          <div>
            <span id="texGalleryTitle">${isHe ? "ספריית חומרים" : "Material Library"}</span>
            <small>${isHe ? "בחרו חומר, כוונו אותו והחילו על המודל" : "Choose, fine-tune and apply to your model"}</small>
          </div>
        </div>
        <button class="tex-modal-close" id="texCloseBtn" aria-label="${isHe ? "סגירת הגלריה" : "Close gallery"}"><i class="ph ph-x"></i></button>
      </header>

      <div class="tex-modal-toolbar">
        <div class="tex-search-box">
          <i class="ph ph-magnifying-glass"></i>
          <input type="search" id="texGallerySearch" aria-label="${isHe ? "חיפוש חומרים" : "Search materials"}" placeholder="${isHe ? "חיפוש לפי חומר, צבע או סגנון..." : "Search by material, color or style..."}" autocomplete="off" />
          <button class="tex-search-clear" id="texSearchClear" aria-label="${isHe ? "ניקוי החיפוש" : "Clear search"}" hidden><i class="ph ph-x"></i></button>
          <span id="texResultCount" class="tex-result-count" style="display:none"></span>
        </div>

        <div class="tex-target-box">
          <div class="tex-view-toggle">
            <button class="tex-view-btn active" data-view="grid" title="${isHe ? "תצוגת רשת" : "Grid view"}" aria-label="${isHe ? "תצוגת רשת" : "Grid view"}"><i class="ph ph-grid-four"></i></button>
            <button class="tex-view-btn" data-view="list" title="${isHe ? "תצוגת רשימה" : "List view"}" aria-label="${isHe ? "תצוגת רשימה" : "List view"}"><i class="ph ph-list"></i></button>
          </div>
          <label><i class="ph ph-target"></i> ${isHe ? "החל עלי:" : "Apply to:"}</label>
          <select id="texTargetSelect">
            <option value="floor">${isHe ? "רצפת החדר הנבחר" : "Selected Room Floor"}</option>
            <option value="all_floors">${isHe ? "כל הרצפות בבית" : "All Room Floors"}</option>
            <option value="wall">${isHe ? "הקיר הנבחר" : "Selected Wall"}</option>
            <option value="all_walls">${isHe ? "כל הקירות בבית" : "All Walls"}</option>
            <option value="item">${isHe ? "הרהיט הנבחר" : "Selected Furniture"}</option>
            <option value="cab_doors">${isHe ? "ארון - דלתות וחזיתות" : "Cabinet - Doors & Fronts"}</option>
            <option value="cab_body">${isHe ? "ארון - גוף ומדפים" : "Cabinet - Carcass & Shelves"}</option>
            <option value="cab_top">${isHe ? "ארון - משטח עבודה" : "Cabinet - Countertop"}</option>
          </select>
        </div>
      </div>

      <div class="tex-categories-bar" id="texCategoriesBar"></div>
      
      <div class="tex-source-filters" id="texSourceFilters">
        ${sourceChips}
      </div>

      <div class="tex-modal-body">
        <div class="tex-search-status" id="texSearchStatus" style="display:none">
          <div class="tex-progress-bar"><div class="tex-progress-fill" id="texProgressFill"></div></div>
          <span id="texSearchStatusText"></span>
        </div>
        <div class="tex-grid" id="texGrid"></div>
      </div>

      <footer class="tex-modal-footer">
        <div class="tex-selection" id="texSelectionPanel">
          <div class="tex-selection-swatch" id="texSelectionSwatch"><i class="ph ph-cursor-click"></i></div>
          <div class="tex-selection-copy">
            <strong id="texSelectionName">${isHe ? "בחרו חומר מהגלריה" : "Choose a material"}</strong>
            <span id="texSelectionMeta">${isHe ? "לאחר הבחירה תוכלו לכוון ולהחיל" : "Fine-tune it before applying"}</span>
          </div>
        </div>
        <div class="tex-controls" id="texControls">
          <div class="tex-control-group">
            <label>${isHe ? "גודל טקסטורה (ס\"מ):" : "Tile Size (cm):"}</label>
            <input type="range" id="texScaleRange" min="50" max="600" step="10" value="${currentScale}" />
            <span id="texScaleVal">${currentScale} ${isHe ? 'ס"מ' : 'cm'}</span>
          </div>

          <div class="tex-control-group">
            <label>${isHe ? "עומק תלת-ממדי (Bump):" : "3D Depth (Bump):"}</label>
            <input type="range" id="texBumpRange" min="0" max="60" step="5" value="${Math.round(currentBumpScale * 100)}" />
            <span id="texBumpVal">${Math.round(currentBumpScale * 100)}%</span>
          </div>

          <div class="tex-control-group" id="texTintGroup">
            <label>${isHe ? "גוון צבע:" : "Color Tint:"}</label>
            <input type="color" id="texTintColor" value="${currentTint}" />
          </div>
        </div>

        <div class="tex-footer-actions">
          <button class="btn-secondary" id="texUploadCustomBtn"><i class="ph ph-upload-simple"></i> ${isHe ? "העלה תמונה אישית" : "Upload File"}</button>
          <button class="btn-danger" id="texRemoveBtn"><i class="ph ph-trash"></i> ${isHe ? "הסר טקסטורה" : "Remove Texture"}</button>
          <button class="btn-secondary tex-adjust-btn" id="texAdjustBtn" aria-expanded="false" aria-controls="texControls" aria-label="${isHe ? "כוונון גודל, עומק וגוון" : "Adjust size, depth and tint"}"><i class="ph ph-sliders-horizontal"></i></button>
          <button class="tex-apply-btn" id="texApplyBtn" disabled><i class="ph ph-check"></i> ${isHe ? "החל חומר" : "Apply material"}</button>
        </div>
      </footer>
    </div>
  `;

  document.body.appendChild(modalEl);

  // Event Listeners
  document.getElementById("texCloseBtn").onclick = closeTextureGallery;
  modalEl.onclick = function (e) {
    if (e.target === modalEl) closeTextureGallery();
  };

  document.getElementById("texTargetSelect").onchange = function () {
    activeTarget = this.value;
    updateTargetControls();
  };

  document.getElementById("texScaleRange").oninput = function () {
    currentScale = parseInt(this.value, 10);
    document.getElementById("texScaleVal").textContent = currentScale + (getLang() === "he" ? ' ס"מ' : " cm");
    updateSelectionMeta();
  };

  document.getElementById("texBumpRange").oninput = function () {
    currentBumpScale = parseInt(this.value, 10) / 100;
    document.getElementById("texBumpVal").textContent = Math.round(currentBumpScale * 100) + '%';
  };

  document.getElementById("texTintColor").onchange = function () {
    currentTint = this.value;
  };

  var searchInput = document.getElementById("texGallerySearch");
  searchInput.oninput = function () {
    currentQuery = this.value.trim();
    document.getElementById("texSearchClear").hidden = !currentQuery;
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function () {
      renderTexturesGrid(true); // force fetch
    }, 400);
  };

  document.getElementById("texSearchClear").onclick = function () {
    searchInput.value = "";
    currentQuery = "";
    this.hidden = true;
    renderTexturesGrid();
    searchInput.focus();
  };

  document.getElementById("texApplyBtn").onclick = applySelectedTexture;
  // phones fold the sliders away (css: .tex-adjust-open); this unfolds them
  document.getElementById("texAdjustBtn").onclick = function () {
    var box = modalEl.querySelector(".tex-modal-container");
    var open = box.classList.toggle("tex-adjust-open");
    this.setAttribute("aria-expanded", String(open));
  };

  document.getElementById("texRemoveBtn").onclick = function () {
    if (onTextureSelectCallback) {
      onTextureSelectCallback(null, 200);
    } else {
      applyTextureToTarget(null);
    }
    closeTextureGallery();
  };

  document.getElementById("texUploadCustomBtn").onclick = function () {
    var texInput = document.getElementById("texInput");
    if (texInput) texInput.click();
    closeTextureGallery();
  };

  modalEl.addEventListener("keydown", function(e) {
    if (e.key === "Escape") closeTextureGallery();
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && selectedTexture) applySelectedTexture();
  });

  // View toggle
  var viewBtns = document.querySelectorAll(".tex-view-btn");
  viewBtns.forEach(function(btn) {
    btn.onclick = function() {
      viewBtns.forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");
      currentView = btn.getAttribute("data-view");
      var grid = document.getElementById("texGrid");
      if (currentView === "list") {
        grid.classList.add("tex-grid-list");
      } else {
        grid.classList.remove("tex-grid-list");
      }
    };
  });

  // Source filters
  var sourceChipsEl = document.querySelectorAll(".tex-source-chip");
  sourceChipsEl.forEach(function(chip) {
    chip.onclick = function() {
      sourceChipsEl.forEach(function(c) { c.classList.remove("active"); });
      chip.classList.add("active");
      activeSourceFilter = chip.getAttribute("data-source");
      renderCurrentResults();
    };
  });
}

function updateTargetSelector() {
  var sel = document.getElementById("texTargetSelect");
  if (sel) sel.value = activeTarget;
}

function updateTargetControls() {
  var tintGroup = document.getElementById("texTintGroup");
  if (tintGroup) tintGroup.hidden = activeTarget !== "item";
}

function matchesTextureQuery(tex, query) {
  if (!query) return true;
  var translated = translateSearchQuery(query.toLowerCase());
  var terms = (query.toLowerCase() + " " + translated).split(/\s+/).filter(Boolean);
  var nameHe = tex.name && tex.name.he ? tex.name.he : "";
  var nameEn = tex.name && tex.name.en ? tex.name.en : "";
  var haystack = (nameHe + " " + nameEn + " " + (tex.tags || []).join(" ")).toLowerCase();
  return terms.every(function(term) { return haystack.includes(term); });
}

function renderCategoryTabs() {
  var bar = document.getElementById("texCategoriesBar");
  if (!bar) return;

  var isHe = getLang() === "he";
  bar.innerHTML = "";

  TEXTURE_CATEGORIES.forEach(function (cat) {
    var btn = document.createElement("button");
    btn.className = "tex-cat-btn" + (activeCat === cat.id ? " active" : "");
    btn.innerHTML = `<i class="ph ${cat.icon}"></i> <span>${isHe ? cat.name.he : cat.name.en}</span>`;
    btn.onclick = function () {
      activeCat = cat.id;
      activeSourceFilter = "all";
      document.querySelectorAll(".tex-source-chip").forEach(function(c) {
        c.classList.toggle("active", c.getAttribute("data-source") === "all");
      });
      renderCategoryTabs();
      renderTexturesGrid(true); // fetch on cat change
    };
    bar.appendChild(btn);
  });
}

function createSkeletonCards(count) {
  var frag = document.createDocumentFragment();
  for (var i = 0; i < count; i++) {
    var card = document.createElement("div");
    card.className = "tex-card tex-skeleton";
    card.innerHTML = '<div class="tex-preview tex-shimmer"></div><div class="tex-card-title tex-shimmer" style="height:16px;margin:8px;border-radius:4px"></div>';
    frag.appendChild(card);
  }
  return frag;
}

function createTextureCard(tex, index, isOnline) {
  var isHe = getLang() === "he";
  var onlineCard = !!(isOnline || tex.isOnline);
  var card = document.createElement("div");
  card.className = "tex-card" + (onlineCard ? " online" : "") + " tex-card-enter";
  card.style.animationDelay = (index * 35) + "ms";
  card.dataset.textureId = tex.id;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  
  var previewUrl = tex.thumbUrl || getTexturePresetDataUrl(tex);
  var texName = isHe ? tex.name.he : tex.name.en;
  card.setAttribute("aria-label", (isHe ? "בחירת " : "Select ") + texName);
  card.setAttribute("aria-pressed", selectedTexture && selectedTexture.tex.id === tex.id ? "true" : "false");
  if (selectedTexture && selectedTexture.tex.id === tex.id) card.classList.add("selected");
  
  var badgeHtml = "";
  if (onlineCard && tex.source) {
    badgeHtml = '<div class="tex-card-badge" style="background:' + (tex.sourceColor || '#8b5cf6') + '">' + tex.source + '</div>';
  }
  
  card.innerHTML =
    '<div class="tex-preview" style="background:' + previewBackground(tex, previewUrl).replace(/"/g, "&quot;") + '">' + badgeHtml + '<span class="tex-selected-mark"><i class="ph ph-check"></i></span></div>' +
    '<div class="tex-card-copy"><div class="tex-card-title" title="' + texName.replace(/"/g, '&quot;') + '">' + texName + '</div><div class="tex-card-meta">' + (tex.scale || 200) + ' cm</div></div>';
  
  var fav = isFavorite(tex.id);
  var starBtn = document.createElement("button");
  starBtn.className = "tex-card-star" + (fav ? " active" : "");
  starBtn.title = isHe ? "מועדפים" : "Favorite";
  starBtn.setAttribute("aria-label", isHe ? "הוספה למועדפים" : "Add to favorites");
  starBtn.innerHTML = '<i class="ph ' + (fav ? "ph-star-fill" : "ph-star") + '"></i>';
  starBtn.onclick = function(e) {
    e.stopPropagation();
    toggleFavorite(tex);
    var nowFav = isFavorite(tex.id);
    starBtn.className = "tex-card-star" + (nowFav ? " active" : "");
    starBtn.innerHTML = '<i class="ph ' + (nowFav ? "ph-star-fill" : "ph-star") + '"></i>';
    if (activeCat === "fav") {
      renderTexturesGrid();
    }
  };
  card.appendChild(starBtn);
  
  card.onclick = function() {
    selectTexture(tex, onlineCard, previewUrl);
  };
  card.ondblclick = applySelectedTexture;
  card.onkeydown = function(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectTexture(tex, isOnline, previewUrl);
    }
  };
  
  card.onmouseenter = function(e) {
    showHoverPreview(showsBakedThumb(tex) ? materialUrl(tex.id, "color", "1k") : previewUrl, e, texName);
  };
  card.onmouseleave = function() {
    hideHoverPreview();
  };
  
  return card;
}

function selectTexture(tex, isOnline, previewUrl) {
  selectedTexture = {
    tex: tex,
    previewUrl: previewUrl,
    textureUrl: isOnline ? (tex.textureUrl || previewUrl) : (libraryRef(tex) || previewUrl),
    isOnline: isOnline
  };
  currentScale = tex.scale || 200;
  var scaleRange = document.getElementById("texScaleRange");
  if (scaleRange) scaleRange.value = currentScale;
  var scaleVal = document.getElementById("texScaleVal");
  if (scaleVal) scaleVal.textContent = currentScale + (getLang() === "he" ? ' ס"מ' : " cm");
  updateSelectionPanel();
  document.querySelectorAll("#texGrid .tex-card").forEach(function(card) {
    var isSelected = card.dataset.textureId === tex.id;
    card.classList.toggle("selected", isSelected);
    card.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });
}

function updateSelectionPanel() {
  var isHe = getLang() === "he";
  var panel = document.getElementById("texSelectionPanel");
  var swatch = document.getElementById("texSelectionSwatch");
  var name = document.getElementById("texSelectionName");
  var meta = document.getElementById("texSelectionMeta");
  var applyBtn = document.getElementById("texApplyBtn");
  if (!panel || !swatch || !name || !meta || !applyBtn) return;
  panel.classList.toggle("has-selection", !!selectedTexture);
  applyBtn.disabled = !selectedTexture;
  if (!selectedTexture) {
    swatch.style.backgroundImage = "";
    swatch.innerHTML = '<i class="ph ph-cursor-click"></i>';
    name.textContent = isHe ? "בחרו חומר מהגלריה" : "Choose a material";
    meta.textContent = isHe ? "לאחר הבחירה תוכלו לכוון ולהחיל" : "Fine-tune it before applying";
    return;
  }
  var tex = selectedTexture.tex;
  swatch.innerHTML = "";
  swatch.style.background = previewBackground(tex, selectedTexture.previewUrl);
  name.textContent = isHe ? tex.name.he : tex.name.en;
  updateSelectionMeta();
}

function updateSelectionMeta() {
  if (!selectedTexture) return;
  var meta = document.getElementById("texSelectionMeta");
  if (!meta) return;
  var isHe = getLang() === "he";
  meta.textContent = (selectedTexture.tex.source || (isHe ? "חומר מובנה" : "Built-in")) + " · " + currentScale + " cm";
}

function applySelectedTexture() {
  if (!selectedTexture) return;
  var url = selectedTexture.textureUrl;
  if (onTextureSelectCallback) onTextureSelectCallback(url, currentScale);
  else applyTextureToTarget(url, currentScale);
  closeTextureGallery();
}

function showHoverPreview(url, event, name) {
  if (!hoverPreviewEl) {
    hoverPreviewEl = document.createElement("div");
    hoverPreviewEl.className = "tex-hover-preview";
    document.body.appendChild(hoverPreviewEl);
  }
  hoverPreviewEl.style.backgroundImage = "url('" + url + "')";
  if (name) {
    hoverPreviewEl.setAttribute("data-name", name);
  }
  hoverPreviewEl.classList.add("visible");
  positionHoverPreview(event);
}

function positionHoverPreview(event) {
  if (!hoverPreviewEl) return;
  var x = event.clientX + 20;
  var y = event.clientY - 100;
  if (x + 240 > window.innerWidth) x = event.clientX - 260;
  if (y < 10) y = 10;
  hoverPreviewEl.style.left = x + "px";
  hoverPreviewEl.style.top = y + "px";
}

function hideHoverPreview() {
  if (hoverPreviewEl) hoverPreviewEl.classList.remove("visible");
}

function renderTexturesGrid(forceFetch) {
  var grid = document.getElementById("texGrid");
  if (!grid) return;

  var isHe = getLang() === "he";
  currentLocalResults = [];

  if (activeCat === "fav") {
    var favMap = getFavoritesMap();
    var favList = Object.values(favMap);
    favList.forEach(function(tex) {
      var queryMatch = matchesTextureQuery(tex, currentQuery);
      if (queryMatch) currentLocalResults.push(tex);
    });
  } else {
    // Filter preset textures
    PRESET_TEXTURES.forEach(function (tex) {
      var catMatch = activeCat === "all" || tex.cat === activeCat;
      var queryMatch = matchesTextureQuery(tex, currentQuery);

      if (catMatch && queryMatch) {
        currentLocalResults.push(tex);
      }
    });
  }

  if (forceFetch || !currentQuery) {
    currentOnlineResults = [];
  }

  // Display what we have so far
  renderCurrentResults();

  // Perform online API search if user typed a search query and we forced a fetch
  if (forceFetch && currentQuery.length >= 2) {
    var fetchQuery = currentQuery;
    var requestId = ++searchRequestId;
    
    var searchStatus = document.getElementById("texSearchStatus");
    var searchStatusText = document.getElementById("texSearchStatusText");
    var progressFill = document.getElementById("texProgressFill");
    
    if (searchStatus) {
      if (searchStatusHideTimeout) clearTimeout(searchStatusHideTimeout);
      searchStatus.style.display = "block";
      searchStatusText.textContent = isHe ? "מחפש במאגרי CC0..." : "Searching CC0 databases...";
      progressFill.style.width = "30%";
    }
    
    // Add skeletons to grid
    grid.appendChild(createSkeletonCards(8));

    searchOnlineFreeTextures(fetchQuery).then(function (onlineResults) {
      // Prevent stale results from overwriting newer ones
      if (currentQuery !== fetchQuery || requestId !== searchRequestId) return;
      
      if (searchStatus) {
        progressFill.style.width = "100%";
        searchStatusHideTimeout = setTimeout(function() {
          if (requestId === searchRequestId) searchStatus.style.display = "none";
        }, 500);
      }

      currentOnlineResults = onlineResults || [];
      renderCurrentResults();

    }).catch(function(err) {
      console.warn("Online search failed:", err);
      if (currentQuery !== fetchQuery || requestId !== searchRequestId) return;
      if (searchStatus) searchStatus.style.display = "none";
      renderCurrentResults();
    });
  }
}

function renderCurrentResults() {
  var grid = document.getElementById("texGrid");
  if (!grid) return;
  var isHe = getLang() === "he";
  grid.innerHTML = "";

  var displayedLocal = [];
  var displayedOnline = [];

  if (activeSourceFilter === "all" || activeSourceFilter === "builtin") {
    displayedLocal = currentLocalResults;
  }
  
  if (activeSourceFilter === "all") {
    displayedOnline = currentOnlineResults;
  } else if (activeSourceFilter !== "builtin") {
    displayedOnline = currentOnlineResults.filter(r => r.source === activeSourceFilter);
  }

  var total = displayedLocal.length + displayedOnline.length;

  var countEl = document.getElementById("texResultCount");
  if (countEl) {
    countEl.textContent = total + (isHe ? " תוצאות" : " results");
    countEl.style.display = total > 0 ? "" : "none";
  }

  if (total === 0 && !currentQuery && activeSourceFilter === "all") {
    grid.innerHTML = `<div class="tex-empty"><i class="ph ph-image-broken"></i><span>${isHe ? "לא נמצאו טקסטורות בקטגוריה זו" : "No textures found in this category"}</span></div>`;
    return;
  } else if (total === 0) {
    grid.innerHTML = `<div class="tex-empty"><i class="ph ph-magnifying-glass"></i><span>${isHe ? "לא נמצאו תוצאות" : "No results found"}</span></div>`;
    return;
  }

  var index = 0;
  
  if (displayedLocal.length > 0) {
    if (currentQuery && activeSourceFilter === "all") {
       var title = document.createElement("div");
       title.className = "tex-section-title";
       title.textContent = isHe ? "מובנים / Built-in" : "Built-in";
       grid.appendChild(title);
    }
    displayedLocal.forEach(function(tex) {
      grid.appendChild(createTextureCard(tex, index++, false));
    });
  }

  if (displayedOnline.length > 0) {
    if (activeSourceFilter === "all") {
      var sectionTitle = document.createElement("div");
      sectionTitle.className = "tex-section-title";
      sectionTitle.textContent = isHe ? "🌐 מקורות רשת CC0 / Online Sources" : "🌐 Online CC0 Sources";
      grid.appendChild(sectionTitle);
    }
    displayedOnline.forEach(function(tex) {
      grid.appendChild(createTextureCard(tex, index++, true));
    });
  }
}

function applyTextureToTarget(texUrl, defaultScale) {
  pushHistory();
  var scale = currentScale || defaultScale || 200;
  var bump = currentBumpScale;

  if (activeTarget === "floor") {
    var m = roomMetaFor();
    if (m) {
      m.floorTex = texUrl;
      m.floorScale = scale;
      m.floorBump = bump;
    }
  } else if (activeTarget === "all_floors") {
    // S.floorTex is the default floor TYPE (a painter key read by roomFloor),
    // not an image: writing a URL there turned every floor into concrete.
    // Put the finish on each room instead.
    if (!S.roomMeta) S.roomMeta = {};
    detectRooms().forEach(function (r) {
      var meta = S.roomMeta[r.key] || (S.roomMeta[r.key] = {});
      meta.floorTex = texUrl;
      meta.floorScale = texUrl ? scale : null;
      meta.floorBump = texUrl ? bump : null;
    });
    S.floorBump = bump;
  } else if (activeTarget === "wall") {
    if (S.sel && S.sel.kind === "wall") {
      S.sel.ref.tex = texUrl;
      S.sel.ref.texScale = scale;
      S.sel.ref.texBump = bump;
    }
  } else if (activeTarget === "all_walls") {
    S.walls.forEach(function (w) {
      w.tex = texUrl;
      w.texScale = scale;
      w.texBump = bump;
    });
  } else if (activeTarget === "item") {
    if (S.sel && S.sel.kind === "item") {
      var it = S.sel.ref;
      it.tex = texUrl;
      it.texScale = scale;
      it.texBump = bump;
      it.texTint = currentTint !== "#ffffff" ? currentTint : null;
    }
  } else if (activeTarget.startsWith("cab_")) {
    if (S.sel && S.sel.kind === "item") {
      var cab = S.sel.ref;
      cab.texParts = cab.texParts || {};
      cab.texBumps = cab.texBumps || {};
      if (activeTarget === "cab_doors") { cab.texParts.doors = texUrl; cab.texBumps.doors = bump; }
      else if (activeTarget === "cab_body") { cab.texParts.body = texUrl; cab.texBumps.body = bump; }
      else if (activeTarget === "cab_top") { cab.texParts.top = texUrl; cab.texBumps.top = bump; }
    }
  }

  S.dirty3D = true;
  fillProps();
  render2D();
}
