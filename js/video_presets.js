// Ultra High-Fidelity Bilingual UI Simulation & Fast Video Reel Generator for ModelForge.
// Strictly reproduces the EXACT page structure, CSS layout, and DOM components of ModelForge:
// - Top Header (#topbar) with brand, menus, view mode pill (#viewModePill), snaps, and tools.
// - Left Sidebar (#left-sidebar) with library tabs (#leftTabs), search (#furnSearch), and item catalog.
// - Central Canvas (#view-2d / #view-3d) with plan toolbar (#plan-toolbar), CAD entry (#cad-entry), and hint bar.
// - Right Inspector (#right-inspector) with wall properties (#wallProps), tabs (#w_tabs), inputs (#w_len, #w_ang, #w_th, #w_h), and lock switch (#w_lockRow).
import { t, getLang, onLangChange } from "./i18n.js";

var cachedTopicFrames = {};

// Invalidate cached frames on language switch
if (typeof onLangChange === "function") {
  onLangChange(function () {
    cachedTopicFrames = {};
  });
}

/**
 * Creates an offscreen 16:9 canvas (960x540) and renders the exact ModelForge application layout.
 */
function createUIFrame(drawFn) {
  var width = 960;
  var height = 540;
  var canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (!canvas) return "";
  canvas.width = width;
  canvas.height = height;
  var ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // App background
  ctx.fillStyle = "#0c0e14";
  ctx.fillRect(0, 0, width, height);

  // Execute full interface rendering
  drawFn(ctx, width, height);

  return canvas.toDataURL("image/png");
}

/**
 * Draws the EXACT ModelForge #topbar header component.
 */
function drawTopBar(ctx, width, options, lang) {
  options = options || {};
  lang = lang || getLang() || "he";
  var isHe = lang === "he";
  var viewMode = options.viewMode || "2d"; // "2d" | "3d" | "split"

  // #topbar container
  ctx.fillStyle = "#141720";
  ctx.fillRect(0, 0, width, 38);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 38);
  ctx.lineTo(width, 38);
  ctx.stroke();

  // .tb-start: Brand Logo + Menus + Undo/Redo
  var bx = 12;
  // Brand Logo (<i class="ph ph-cube-focus"></i>)
  ctx.fillStyle = "#3b82f6";
  ctx.beginPath();
  ctx.arc(bx + 8, 19, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 10px monospace";
  ctx.fillText("3D", bx + 3, 22);

  ctx.fillStyle = "#eef2f7";
  ctx.font = "bold 12px Inter, system-ui, sans-serif";
  ctx.fillText("ModelForge", bx + 22, 23);

  // Separator
  ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
  ctx.beginPath();
  ctx.moveTo(bx + 105, 10);
  ctx.lineTo(bx + 105, 28);
  ctx.stroke();

  // Dropdown menus: File, Edit, Export
  var mx = bx + 115;
  ctx.fillStyle = "#9aa8b8";
  ctx.font = "11px Inter, system-ui, sans-serif";

  // File menu
  ctx.fillText(isHe ? "קובץ ▾" : "File ▾", mx, 23);
  // Edit menu
  ctx.fillText(isHe ? "עריכה ▾" : "Edit ▾", mx + 50, 23);
  // Export menu
  ctx.fillText(isHe ? "ייצוא ▾" : "Export ▾", mx + 105, 23);

  // Undo / Redo buttons
  ctx.fillStyle = "#64748b";
  ctx.font = "13px system-ui";
  ctx.fillText("↶", mx + 160, 23);
  ctx.fillText("↷", mx + 180, 23);

  // .tb-center: #viewModePill [ 2D תוכנית / Plan ] [ 3D תלת-ממד / 3D ] [ מפוצל / Split ]
  var px = 410;
  var py = 6;
  var pw = 200;
  var ph = 26;

  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(px, py, pw, ph, 8) : ctx.rect(px, py, pw, ph);
  ctx.fill();
  ctx.stroke();

  // 2D Button
  var is2D = viewMode === "2d";
  if (is2D) {
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(px + 2, py + 2, 62, ph - 4, 6) : ctx.rect(px + 2, py + 2, 62, ph - 4);
    ctx.fill();
  }
  ctx.fillStyle = is2D ? "#ffffff" : "#9aa8b8";
  ctx.font = "bold 10px Inter, system-ui, sans-serif";
  ctx.fillText(isHe ? "תוכנית" : "Plan", px + 14, py + 17);

  // 3D Button
  var is3D = viewMode === "3d";
  if (is3D) {
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(px + 66, py + 2, 66, ph - 4, 6) : ctx.rect(px + 66, py + 2, 66, ph - 4);
    ctx.fill();
  }
  ctx.fillStyle = is3D ? "#ffffff" : "#9aa8b8";
  ctx.fillText(isHe ? "תלת-ממד" : "3D View", px + 76, py + 17);

  // Split Button
  var isSplit = viewMode === "split";
  if (isSplit) {
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(px + 134, py + 2, 62, ph - 4, 6) : ctx.rect(px + 134, py + 2, 62, ph - 4);
    ctx.fill();
  }
  ctx.fillStyle = isSplit ? "#ffffff" : "#9aa8b8";
  ctx.fillText(isHe ? "מפוצל" : "Split", px + 148, py + 17);

  // .tb-end: Texture Gallery + Shortcuts + Guide + Studio + Settings + Lang
  var rx = width - 260;
  // Texture Gallery button
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(rx, py, 95, ph, 6) : ctx.rect(rx, py, 95, ph);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#eef2f7";
  ctx.font = "10px Inter, system-ui, sans-serif";
  ctx.fillText(isHe ? "🎨 טקסטורות" : "🎨 Textures", rx + 10, py + 17);

  // Action icons: Shortcuts, Guide, Studio, Settings, Theme, Lang
  var icons = ["⌨", "🎓", "🎬", "⚙", "☀", isHe ? "עב" : "EN"];
  icons.forEach(function (ico, idx) {
    var ix = rx + 105 + idx * 24;
    var isStudio = idx === 2;
    ctx.fillStyle = isStudio ? "rgba(59, 130, 246, 0.25)" : "rgba(255, 255, 255, 0.05)";
    ctx.strokeStyle = isStudio ? "#3b82f6" : "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(ix, py, 20, ph, 5) : ctx.rect(ix, py, 20, ph);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isStudio ? "#3b82f6" : "#9aa8b8";
    ctx.font = "10.5px system-ui";
    ctx.fillText(ico, ix + 4, py + 17);
  });
}

/**
 * Draws the EXACT ModelForge #left-sidebar component.
 */
function drawLeftSidebar(ctx, height, lang) {
  lang = lang || getLang() || "he";
  var isHe = lang === "he";
  var w = 175;
  var startY = 38;
  var h = height - startY;

  // Sidebar container
  ctx.fillStyle = "#141720";
  ctx.fillRect(0, startY, w, h);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w, startY);
  ctx.lineTo(w, height);
  ctx.stroke();

  // #leftTabs (.left-tabs): [ ספרייה / Library ] [ בית / Home ] [ מבנה / Structure ] [ עץ / Tree ]
  var tabH = 28;
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(0, startY, w, tabH);

  // Active 'Library' tab
  ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
  ctx.fillRect(4, startY + 3, 40, tabH - 6);
  ctx.strokeStyle = "#3b82f6";
  ctx.strokeRect(4, startY + 3, 40, tabH - 6);
  ctx.fillStyle = "#3b82f6";
  ctx.font = "bold 9px Inter, system-ui";
  ctx.fillText(isHe ? "ספרייה" : "Library", 8, startY + 17);

  // Other tabs
  ctx.fillStyle = "#9aa8b8";
  ctx.font = "9px Inter, system-ui";
  ctx.fillText(isHe ? "בית" : "Home", 52, startY + 17);
  ctx.fillText(isHe ? "מבנה" : "Struct", 85, startY + 17);
  ctx.fillText(isHe ? "עץ" : "Tree", 130, startY + 17);

  // Library Section Title
  var sy = startY + tabH + 12;
  ctx.fillStyle = "#eef2f7";
  ctx.font = "bold 11px Inter, system-ui";
  ctx.fillText(isHe ? "ספריית פריטים" : "Item Library", 10, sy);

  // Search input (#furnSearch)
  var searchY = sy + 8;
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(8, searchY, w - 16, 22, 5) : ctx.rect(8, searchY, w - 16, 22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#64748b";
  ctx.font = "9.5px Inter, system-ui";
  ctx.fillText(isHe ? "🔍 חיפוש בספרייה…" : "🔍 Search library…", 14, searchY + 15);

  // Category Pills
  var catY = searchY + 28;
  var cats = isHe ? ["הכל", "סלון", "מטבח", "שינה"] : ["All", "Living", "Kitchen", "Bed"];
  cats.forEach(function (cName, idx) {
    var cx = 8 + idx * 39;
    var isSel = idx === 1;
    ctx.fillStyle = isSel ? "rgba(59, 130, 246, 0.2)" : "rgba(255, 255, 255, 0.04)";
    ctx.strokeStyle = isSel ? "#3b82f6" : "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(cx, catY, 36, 16, 4) : ctx.rect(cx, catY, 36, 16);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isSel ? "#3b82f6" : "#9aa8b8";
    ctx.font = "8.5px Inter, system-ui";
    ctx.fillText(cName, cx + 5, catY + 12);
  });

  // Catalog Item Tiles
  var itemY = catY + 24;
  var items = isHe
    ? [
        { name: "ספה פינתית", icon: "🛋️", dim: "240×90" },
        { name: "שולחן אוכל", icon: "🪑", dim: "180×90" },
        { name: "מיטה זוגית", icon: "🛏️", dim: "200×160" },
        { name: "ארון קיר", icon: "🚪", dim: "180×60" },
      ]
    : [
        { name: "Corner Sofa", icon: "🛋️", dim: "240×90" },
        { name: "Dining Table", icon: "🪑", dim: "180×90" },
        { name: "Queen Bed", icon: "🛏️", dim: "200×160" },
        { name: "Wardrobe", icon: "🚪", dim: "180×60" },
      ];

  items.forEach(function (it, idx) {
    var ix = 8 + (idx % 2) * 78;
    var iy = itemY + Math.floor(idx / 2) * 65;

    ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(ix, iy, 74, 58, 6) : ctx.rect(ix, iy, 74, 58);
    ctx.fill();
    ctx.stroke();

    ctx.font = "18px system-ui";
    ctx.fillText(it.icon, ix + 26, iy + 25);

    ctx.fillStyle = "#eef2f7";
    ctx.font = "bold 8.5px Inter, system-ui";
    ctx.fillText(it.name, ix + 6, iy + 40);

    ctx.fillStyle = "#64748b";
    ctx.font = "8px monospace";
    ctx.fillText(it.dim, ix + 6, iy + 52);
  });
}

/**
 * Draws the EXACT ModelForge #right-inspector component.
 */
function drawRightInspector(ctx, width, height, data, lang) {
  data = data || {};
  lang = lang || getLang() || "he";
  var isHe = lang === "he";

  var panelW = 205;
  var panelX = width - panelW;
  var startY = 38;
  var panelH = height - startY;

  // Inspector container
  ctx.fillStyle = "#141720";
  ctx.fillRect(panelX, startY, panelW, panelH);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(panelX, startY);
  ctx.lineTo(panelX, height);
  ctx.stroke();

  // Section Header (<h3> מאפיינים / Properties </h3>)
  ctx.fillStyle = "#eef2f7";
  ctx.font = "bold 11px Inter, system-ui";
  ctx.fillText(isHe ? "מאפיינים" : "Properties", panelX + 12, startY + 18);

  // Wall identity header (.wi-head)
  var headY = startY + 28;
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(panelX, headY, panelW, 26);

  ctx.fillStyle = "#3b82f6";
  ctx.font = "bold 10.5px Inter, system-ui";
  ctx.fillText(data.title || (isHe ? "קיר (W-1)" : "Wall (W-1)"), panelX + 10, headY + 17);

  // Action buttons: [ 🔒 Lock ] [ ⇄ Flip ] [ 🗑 Delete ]
  var bx = panelX + panelW - 65;
  ctx.fillStyle = "#9aa8b8";
  ctx.font = "11px system-ui";
  ctx.fillText("🔒", bx, headY + 17);
  ctx.fillText("⇄", bx + 20, headY + 17);
  ctx.fillText("🗑", bx + 40, headY + 17);

  // Wall tabs (.wi-tabs): [ מידות / Dims ] [ מבנה / Assembly ] [ פתחים / Openings ] [ אילוצים / Joints ]
  var tabY = headY + 28;
  var wTabs = isHe
    ? [
        { name: "מידות", sel: true },
        { name: "מבנה", sel: false },
        { name: "פתחים", sel: false },
        { name: "אילוצים", sel: false },
      ]
    : [
        { name: "Dims", sel: true },
        { name: "Assembly", sel: false },
        { name: "Openings", sel: false },
        { name: "Joints", sel: false },
      ];

  wTabs.forEach(function (wt, idx) {
    var tx = panelX + 6 + idx * 48;
    ctx.fillStyle = wt.sel ? "rgba(59, 130, 246, 0.18)" : "transparent";
    ctx.strokeStyle = wt.sel ? "#3b82f6" : "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(tx, tabY, 44, 20, 4) : ctx.rect(tx, tabY, 44, 20);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = wt.sel ? "#3b82f6" : "#9aa8b8";
    ctx.font = "bold 8.5px Inter, system-ui";
    ctx.fillText(wt.name, tx + 6, tabY + 14);
  });

  // Dimension Pane (.wi-pane)
  var paneY = tabY + 30;

  // Row 1: Length (#w_len) & Angle (#w_ang)
  ctx.fillStyle = "#9aa8b8";
  ctx.font = "9px Inter, system-ui";
  ctx.fillText(isHe ? "אורך (ס\"מ):" : "Length (cm):", panelX + 10, paneY);
  ctx.fillText(isHe ? "זווית (°):" : "Angle (°):", panelX + 105, paneY);

  var inpY1 = paneY + 4;
  // #w_len
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.strokeStyle = data.highlightProp === "length" ? "#3b82f6" : "rgba(255, 255, 255, 0.14)";
  ctx.fillRect(panelX + 10, inpY1, 85, 22);
  ctx.strokeRect(panelX + 10, inpY1, 85, 22);
  ctx.fillStyle = data.highlightProp === "length" ? "#3b82f6" : "#eef2f7";
  ctx.font = "bold 10.5px monospace";
  ctx.fillText(data.length || "360.0", panelX + 16, inpY1 + 15);

  // #w_ang
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.strokeStyle = data.highlightProp === "angle" ? "#3b82f6" : "rgba(255, 255, 255, 0.14)";
  ctx.fillRect(panelX + 105, inpY1, 85, 22);
  ctx.strokeRect(panelX + 105, inpY1, 85, 22);
  ctx.fillStyle = data.highlightProp === "angle" ? "#3b82f6" : "#eef2f7";
  ctx.fillText(data.angle || "0.0°", panelX + 112, inpY1 + 15);

  // Row 2: Thickness (#w_th) & Height (#w_h)
  var row2Y = inpY1 + 32;
  ctx.fillStyle = "#9aa8b8";
  ctx.font = "9px Inter, system-ui";
  ctx.fillText(isHe ? "עובי (ס\"מ):" : "Thickness (cm):", panelX + 10, row2Y);
  ctx.fillText(isHe ? "גובה (ס\"מ):" : "Height (cm):", panelX + 105, row2Y);

  var inpY2 = row2Y + 4;
  // #w_th
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.strokeStyle = data.highlightProp === "thickness" ? "#3b82f6" : "rgba(255, 255, 255, 0.14)";
  ctx.fillRect(panelX + 10, inpY2, 85, 22);
  ctx.strokeRect(panelX + 10, inpY2, 85, 22);
  ctx.fillStyle = "#eef2f7";
  ctx.fillText(data.thickness || "20.0", panelX + 16, inpY2 + 15);

  // #w_h
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.fillRect(panelX + 105, inpY2, 85, 22);
  ctx.strokeRect(panelX + 105, inpY2, 85, 22);
  ctx.fillStyle = "#eef2f7";
  ctx.fillText("280.0", panelX + 112, inpY2 + 15);

  // Wall Type Select (#w_type)
  var typeY = inpY2 + 34;
  ctx.fillStyle = "#9aa8b8";
  ctx.font = "9px Inter, system-ui";
  ctx.fillText(isHe ? "טיפוס קיר (Wall Type):" : "Wall Type Assembly:", panelX + 10, typeY);

  var typeBoxY = typeY + 4;
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.fillRect(panelX + 10, typeBoxY, panelW - 20, 22);
  ctx.strokeRect(panelX + 10, typeBoxY, panelW - 20, 22);
  ctx.fillStyle = "#eef2f7";
  ctx.font = "9.5px Inter, system-ui";
  ctx.fillText(data.assembly || (isHe ? "בלוק 20cm + בידוד 8cm" : "Concrete 20cm + EPS 8cm"), panelX + 16, typeBoxY + 15);

  // Lock Switch Row (#w_lockRow)
  var lockY = typeBoxY + 34;
  ctx.fillStyle = data.locked ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.05)";
  ctx.strokeStyle = data.locked ? "#10b981" : "rgba(255, 255, 255, 0.14)";
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(panelX + 10, lockY, panelW - 20, 26, 6) : ctx.rect(panelX + 10, lockY, panelW - 20, 26);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = data.locked ? "#10b981" : "#9aa8b8";
  ctx.font = "bold 9.5px Inter, system-ui";
  ctx.fillText(
    data.locked
      ? (isHe ? "🔒 מידות נעולות (Locked)" : "🔒 Dimension Locked")
      : (isHe ? "🔓 נעילת מידות" : "🔓 Lock Dimension"),
    panelX + 22,
    lockY + 17
  );
}

/**
 * Draws the EXACT ModelForge #plan-toolbar floating tool component.
 */
function drawPlanToolbar(ctx, x, y, activeTool, lang) {
  var tools = [
    { id: "select", icon: "↖", key: "1" },
    { id: "wall", icon: "▤", key: "2" },
    { id: "rect", icon: "▭", key: "8" },
    { id: "arcwall", icon: "◜", key: "7" },
    { id: "door", icon: "🚪", key: "3" },
    { id: "window", icon: "🪟", key: "4" },
    { id: "passage", icon: "⫿", key: "5" },
    { id: "point", icon: "✚", key: "6" },
    { id: "erase", icon: "⌫", key: "E" },
    { id: "lock", icon: "🔒", key: "L" },
    { id: "delete", icon: "🗑", key: "Del" },
  ];

  var tw = tools.length * 36 + 10;
  var th = 36;

  // Toolbar outer pill
  ctx.fillStyle = "rgba(20, 23, 32, 0.94)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, tw, th, 8) : ctx.rect(x, y, tw, th);
  ctx.fill();
  ctx.stroke();

  tools.forEach(function (tItem, i) {
    var bx = x + 5 + i * 36;
    var by = y + 4;
    var isActive = activeTool === tItem.id;

    if (isActive) {
      ctx.fillStyle = "rgba(59, 130, 246, 0.28)";
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx, by, 32, 28, 6) : ctx.rect(bx, by, 32, 28);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = isActive ? "#3b82f6" : "#9aa8b8";
    ctx.font = "13px system-ui";
    ctx.fillText(tItem.icon, bx + 9, by + 18);

    // Kbd badge
    ctx.fillStyle = isActive ? "#2563eb" : "rgba(255, 255, 255, 0.12)";
    ctx.fillRect(bx + 20, by + 16, 9, 9);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 7px monospace";
    ctx.fillText(tItem.key, bx + 22, by + 23);
  });
}

/**
 * Draws the CAD Canvas Blueprint Grid and bottom .hint text.
 */
function drawCADCanvas(ctx, leftW, rightW, width, height, lang) {
  lang = lang || getLang() || "he";
  var isHe = lang === "he";
  var canvasX = leftW;
  var canvasY = 38;
  var canvasW = width - leftW - rightW;
  var canvasH = height - canvasY;

  // Canvas background (#141820)
  ctx.fillStyle = "#141820";
  ctx.fillRect(canvasX, canvasY, canvasW, canvasH);

  // Precision 20px CAD Grid lines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var x = canvasX; x <= canvasX + canvasW; x += 25) {
    ctx.moveTo(x, canvasY);
    ctx.lineTo(x, height);
  }
  for (var y = canvasY; y <= height; y += 25) {
    ctx.moveTo(canvasX, y);
    ctx.lineTo(canvasX + canvasW, y);
  }
  ctx.stroke();

  // 100cm Major grid axes
  ctx.strokeStyle = "rgba(59, 130, 246, 0.18)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (var mx = canvasX; mx <= canvasX + canvasW; mx += 100) {
    ctx.moveTo(mx, canvasY);
    ctx.lineTo(mx, height);
  }
  for (var my = canvasY; my <= height; my += 100) {
    ctx.moveTo(canvasX, my);
    ctx.lineTo(canvasX + canvasW, my);
  }
  ctx.stroke();

  // Bottom Hint Bar (.hint)
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(canvasX, height - 20, canvasW, 20);
  ctx.fillStyle = "#9aa8b8";
  ctx.font = "9px Inter, system-ui";
  ctx.fillText(
    isHe
      ? "גרור פריט/חדר/קיר/פינה · גלגלת=זום · קליק-ימני=הזזת תצוגה · קיר: לחץ, גרור ושחרר"
      : "Drag item/room/wall/corner · Wheel=zoom · Right-click=pan · Wall: click, drag and release",
    canvasX + 12,
    height - 7
  );
}

/**
 * Draws floating CAD entry box (#cad-entry).
 */
function drawFloatingCADEntry(ctx, x, y, lenText, angText) {
  var bw = 180;
  var bh = 28;
  ctx.fillStyle = "rgba(15, 23, 42, 0.96)";
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, bw, bh, 6) : ctx.rect(x, y, bw, bh);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#3b82f6";
  ctx.font = "bold 11px monospace";
  ctx.fillText("L: " + lenText + "  Tab  ∠: " + angText, x + 12, y + 18);
}

/**
 * Draws vector mouse pointer with click ripples and action tooltips.
 */
function drawMouseCursor(ctx, x, y, options) {
  options = options || {};
  var isClicking = options.isClicking;
  var isCrosshair = options.isCrosshair;
  var label = options.label;

  // Expanding click ripple wave
  if (isClicking) {
    ctx.strokeStyle = "rgba(59, 130, 246, 0.85)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(59, 130, 246, 0.4)";
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  if (isCrosshair) {
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y);
    ctx.moveTo(x, y - 14); ctx.lineTo(x + 14, y);
    ctx.stroke();
    ctx.strokeRect(x - 5, y - 5, 10, 10);
  } else {
    // Sharp vector mouse arrow
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 17);
    ctx.lineTo(x + 5, y + 13);
    ctx.lineTo(x + 9, y + 19);
    ctx.lineTo(x + 13, y + 16);
    ctx.lineTo(x + 8, y + 10);
    ctx.lineTo(x + 14, y + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Rich action tooltip badge
  if (label) {
    ctx.font = "bold 10.5px Inter, system-ui, sans-serif";
    var tw = ctx.measureText(label).width + 16;
    var lx = Math.min(x + 16, 940 - tw);
    var ly = y + 12;

    ctx.fillStyle = "rgba(15, 23, 42, 0.96)";
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(lx, ly, tw, 22, 6) : ctx.rect(lx, ly, tw, 22);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#f8fafc";
    ctx.fillText(label, lx + 8, ly + 15);
  }
}

/**
 * Draws architectural dimension with witness lines and tick marks.
 */
function drawDimension(ctx, x1, y1, x2, y2, text, offset) {
  offset = offset || 22;
  var dx = x2 - x1;
  var dy = y2 - y1;
  var len = Math.hypot(dx, dy);
  if (len < 1) return;
  var nx = -dy / len * offset;
  var ny = dx / len * offset;

  var px1 = x1 + nx;
  var py1 = y1 + ny;
  var px2 = x2 + nx;
  var py2 = y2 + ny;

  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 1.4;

  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(px1 + nx * 0.2, py1 + ny * 0.2);
  ctx.moveTo(x2, y2); ctx.lineTo(px2 + nx * 0.2, py2 + ny * 0.2);
  ctx.moveTo(px1, py1); ctx.lineTo(px2, py2);
  ctx.stroke();

  // Tick marks
  var tick = 5;
  ctx.beginPath();
  ctx.moveTo(px1 - ny * 0.2 - tick, py1 + nx * 0.2 - tick);
  ctx.lineTo(px1 + ny * 0.2 + tick, py1 - nx * 0.2 + tick);
  ctx.moveTo(px2 - ny * 0.2 - tick, py2 + nx * 0.2 - tick);
  ctx.lineTo(px2 + ny * 0.2 + tick, py2 - nx * 0.2 - tick);
  ctx.stroke();

  // Value Pill
  var midX = (px1 + px2) / 2;
  var midY = (py1 + py2) / 2;
  ctx.fillStyle = "#0f172a";
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(midX - 35, midY - 10, 70, 20, 5) : ctx.rect(midX - 35, midY - 10, 70, 20);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#3b82f6";
  ctx.font = "bold 10.5px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, midX, midY);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

/**
 * Draws living room & kitchen furniture silhouettes inside the plan.
 */
function drawPlanFurniture(ctx, x, y) {
  // Sofa
  ctx.fillStyle = "rgba(51, 65, 85, 0.85)";
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1.2;
  ctx.fillRect(x + 20, y + 20, 70, 30);
  ctx.strokeRect(x + 20, y + 20, 70, 30);
  // Sofa armrests & cushions
  ctx.fillStyle = "#475569";
  ctx.fillRect(x + 20, y + 20, 10, 30);
  ctx.fillRect(x + 80, y + 20, 10, 30);
  ctx.strokeRect(x + 30, y + 20, 25, 26);
  ctx.strokeRect(x + 55, y + 20, 25, 26);

  // Coffee table
  ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
  ctx.fillRect(x + 30, y + 60, 50, 22);
  ctx.strokeRect(x + 30, y + 60, 50, 22);

  // Area Rug
  ctx.strokeStyle = "rgba(59, 130, 246, 0.3)";
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x + 10, y + 10, 90, 85);
  ctx.setLineDash([]);
}

/**
 * Generates full-fidelity UI procedural video frames for each topic in the active language (Hebrew/English).
 */
export function getTopicVideoFrames(topicId, overrideLang) {
  var lang = overrideLang || getLang() || "he";
  var isHe = lang === "he";
  var cacheKey = topicId + "_" + lang;

  if (cachedTopicFrames[cacheKey]) {
    return cachedTopicFrames[cacheKey];
  }

  var frames = [];

  if (topicId === "basic") {
    // 1. Cursor moves to #plan-toolbar and clicks Wall tool [2]
    frames.push({
      id: "basic_1",
      src: createUIFrame(function (ctx, w, h) {
        drawTopBar(ctx, w, { viewMode: "2d" }, lang);
        drawLeftSidebar(ctx, h, lang);
        drawCADCanvas(ctx, 175, 205, w, h, lang);
        drawRightInspector(ctx, w, h, { title: isHe ? "תוכנית ריקה" : "Empty Plan", length: "-", thickness: "20.0", angle: "-" }, lang);
        drawPlanToolbar(ctx, 220, h - 55, "wall", lang);
        drawMouseCursor(ctx, 262, h - 38, { isClicking: true, label: isHe ? "1. בחירת כלי קיר (Wall 2) בסרגל הכלים" : "1. Click: Select Wall Tool (Wall 2)" });
      }),
      label: isHe ? "בחירת כלי קיר" : "Select Wall Tool",
      durationMs: 500,
      stepIndex: 0,
    });

    // 2. Cursor (crosshair) clicks start point on blueprint grid
    frames.push({
      id: "basic_2",
      src: createUIFrame(function (ctx, w, h) {
        drawTopBar(ctx, w, { viewMode: "2d" }, lang);
        drawLeftSidebar(ctx, h, lang);
        drawCADCanvas(ctx, 175, 205, w, h, lang);
        drawRightInspector(ctx, w, h, { title: isHe ? "שרטוט קיר 1" : "Drafting Wall 1", length: "0.0", thickness: "20.0", angle: "0.0°" }, lang);
        drawPlanToolbar(ctx, 220, h - 55, "wall", lang);

        // Start node snap
        ctx.fillStyle = "#3b82f6";
        ctx.beginPath(); ctx.arc(320, 260, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.strokeRect(313, 253, 14, 14);

        drawMouseCursor(ctx, 320, 260, { isCrosshair: true, isClicking: true, label: isHe ? "2. לחיצה בקנבס: נקודת התחלה (0, 0)" : "2. Click Canvas: Origin Node (0, 0)" });
      }),
      label: isHe ? "הנחת נקודת התחלה" : "Place Origin Node",
      durationMs: 500,
      stepIndex: 1,
    });

    // 3. Dragging Wall 1 horizontally with live #cad-entry box and dimensions
    frames.push({
      id: "basic_3",
      src: createUIFrame(function (ctx, w, h) {
        drawTopBar(ctx, w, { viewMode: "2d" }, lang);
        drawLeftSidebar(ctx, h, lang);
        drawCADCanvas(ctx, 175, 205, w, h, lang);
        drawRightInspector(ctx, w, h, { title: isHe ? "שרטוט קיר 1" : "Drafting Wall 1", length: "360.0", thickness: "20.0", angle: "0.0°", highlightProp: "length" }, lang);
        drawPlanToolbar(ctx, 220, h - 55, "wall", lang);

        // Wall 1 body
        ctx.fillStyle = "rgba(59, 130, 246, 0.35)";
        ctx.fillRect(320, 250, 300, 20);
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2.2;
        ctx.strokeRect(320, 250, 300, 20);

        drawDimension(ctx, 320, 250, 620, 250, "360.0 cm", -24);
        drawFloatingCADEntry(ctx, 380, 180, "360.0 cm", "0.0°");

        drawMouseCursor(ctx, 620, 260, { isCrosshair: true, isClicking: true, label: isHe ? "3. שחרור: קיר ראשון באורך 360 ס\"מ" : "3. Release: 360 cm First Wall" });
      }),
      label: isHe ? "גרירת קיר 360 ס\"מ" : "Drag 360 cm Wall",
      durationMs: 500,
      stepIndex: 1,
    });

    // 4. Extending Wall 2 upwards from corner node
    frames.push({
      id: "basic_4",
      src: createUIFrame(function (ctx, w, h) {
        drawTopBar(ctx, w, { viewMode: "2d" }, lang);
        drawLeftSidebar(ctx, h, lang);
        drawCADCanvas(ctx, 175, 205, w, h, lang);
        drawRightInspector(ctx, w, h, { title: isHe ? "המשך פינה (קיר 2)" : "Corner Run (Wall 2)", length: "240.0", thickness: "20.0", angle: "90.0°" }, lang);
        drawPlanToolbar(ctx, 220, h - 55, "wall", lang);

        // Wall 1
        ctx.fillStyle = "rgba(59, 130, 246, 0.35)";
        ctx.fillRect(320, 250, 300, 20);
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2.2;
        ctx.strokeRect(320, 250, 300, 20);

        // Wall 2 going up
        ctx.fillStyle = "rgba(59, 130, 246, 0.35)";
        ctx.fillRect(600, 110, 20, 160);
        ctx.strokeRect(600, 110, 20, 160);

        drawDimension(ctx, 620, 270, 620, 110, "240.0 cm", 24);

        drawMouseCursor(ctx, 610, 110, { isCrosshair: true, isClicking: true, label: isHe ? "4. המשך רצף פינתי 240 ס\"מ (90°)" : "4. Corner Run: 240 cm Vertical Wall (90°)" });
      }),
      label: isHe ? "המשך פינה ב-90°" : "Corner Run (90°)",
      durationMs: 500,
      stepIndex: 2,
    });

    // 5. Adding T-Junction interior wall and furniture
    frames.push({
      id: "basic_5",
      src: createUIFrame(function (ctx, w, h) {
        drawTopBar(ctx, w, { viewMode: "2d" }, lang);
        drawLeftSidebar(ctx, h, lang);
        drawCADCanvas(ctx, 175, 205, w, h, lang);
        drawRightInspector(ctx, w, h, { title: isHe ? "חיבור T לקיר קיים" : "T-Junction Join", length: "130.0", thickness: "10.0", angle: "90.0°" }, lang);
        drawPlanToolbar(ctx, 220, h - 55, "wall", lang);

        // Outer loop
        ctx.fillStyle = "rgba(59, 130, 246, 0.35)";
        ctx.fillRect(320, 250, 300, 20);
        ctx.fillRect(600, 110, 20, 160);
        ctx.fillRect(320, 110, 300, 20);
        ctx.fillRect(320, 110, 20, 160);
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2.2;
        ctx.strokeRect(320, 250, 300, 20);
        ctx.strokeRect(600, 110, 20, 160);
        ctx.strokeRect(320, 110, 300, 20);
        ctx.strokeRect(320, 110, 20, 160);

        // Living room furniture
        drawPlanFurniture(ctx, 350, 135);

        // T Partition
        ctx.fillStyle = "rgba(16, 185, 129, 0.4)";
        ctx.fillRect(470, 130, 14, 120);
        ctx.strokeStyle = "#10b981";
        ctx.strokeRect(470, 130, 14, 120);

        // Snap indicator
        ctx.fillStyle = "#10b981";
        ctx.beginPath(); ctx.arc(477, 250, 6, 0, Math.PI * 2); ctx.fill();

        drawMouseCursor(ctx, 477, 250, { isCrosshair: true, isClicking: true, label: isHe ? "5. הצמדה ב-T: פיצול וחיבור מושלם" : "5. Snap to T-Junction: Clean Split & Join" });
      }),
      label: isHe ? "חיבור T מפוצל" : "T-Junction Split",
      durationMs: 500,
      stepIndex: 3,
    });

    // 6. User clicks #view3dBtn in #viewModePill -> Full 3D WebGL Photorealistic View
    frames.push({
      id: "basic_6",
      src: createUIFrame(function (ctx, w, h) {
        drawTopBar(ctx, w, { viewMode: "3d" }, lang);
        drawLeftSidebar(ctx, h, lang);

        var canvasX = 175;
        var canvasW = w - 175 - 205;
        var canvasH = h - 38;

        // 3D Viewport background (#07080c)
        ctx.fillStyle = "#07080c";
        ctx.fillRect(canvasX, 38, canvasW, canvasH);

        // 3D Sun gradient sky
        var grad = ctx.createLinearGradient(0, 38, 0, h);
        grad.addColorStop(0, "#0f172a");
        grad.addColorStop(1, "#020617");
        ctx.fillStyle = grad;
        ctx.fillRect(canvasX, 38, canvasW, canvasH);

        // 3D Ground floor grid
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var gx = canvasX + 20; gx < canvasX + canvasW; gx += 40) {
          ctx.moveTo(gx, 150);
          ctx.lineTo(gx - 50, h - 20);
        }
        ctx.stroke();

        // 3D Parquet Floor
        ctx.fillStyle = "#78350f";
        ctx.beginPath();
        ctx.moveTo(460, 150);
        ctx.lineTo(640, 240);
        ctx.lineTo(460, 340);
        ctx.lineTo(280, 240);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#92400e";
        ctx.stroke();

        // 3D Walls Extrusion with lighting
        var hH = 90;
        // Left Wall
        ctx.fillStyle = "rgba(59, 130, 246, 0.5)";
        ctx.beginPath();
        ctx.moveTo(280, 240);
        ctx.lineTo(280, 240 - hH);
        ctx.lineTo(460, 150 - hH);
        ctx.lineTo(460, 150);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Right Wall (Shadowed)
        ctx.fillStyle = "rgba(37, 99, 235, 0.75)";
        ctx.beginPath();
        ctx.moveTo(460, 150);
        ctx.lineTo(460, 150 - hH);
        ctx.lineTo(640, 240 - hH);
        ctx.lineTo(640, 240);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // T Partition 3D
        ctx.fillStyle = "rgba(16, 185, 129, 0.6)";
        ctx.beginPath();
        ctx.moveTo(370, 195);
        ctx.lineTo(370, 195 - hH);
        ctx.lineTo(460, 240 - hH);
        ctx.lineTo(460, 240);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        drawRightInspector(ctx, w, h, { title: isHe ? "תצוגת 3D תלת־ממדית" : "3D Isometric View", length: "360.0", thickness: "20.0", angle: "0.0°", locked: true }, lang);
        drawMouseCursor(ctx, 490, 18, { isClicking: true, label: isHe ? "6. לחיצה על כפתור 3D במרכז הסרגל העליון" : "6. Click: #view3dBtn in #viewModePill" });
      }),
      label: isHe ? "תצוגת 3D סופית" : "3D Final View",
      durationMs: 650,
      stepIndex: 3,
    });
  } else if (topicId === "wall_types") {
    // Wall Types sequence
    var typeSteps = isHe
      ? [
          { name: "בלוק בטון 20cm", thick: "20.0", label: "1. בחירת קיר בטון בסיסי (20 ס\"מ)" },
          { name: "בידוד תרמי 8cm + טיח", thick: "28.0", label: "2. הוספת שכבת בידוד תרמי וטיח (28 ס\"מ)" },
          { name: "מחיצת גבס 10cm", thick: "10.0", label: "3. מחיצת פנים גבס וניצבים (10 ס\"מ)" },
          { name: "קיר מסך זכוכית 15cm", thick: "15.0", label: "4. קיר מסך שקוף זיגוג כפול (15 ס\"מ)" },
          { name: "היפוך שכבות (Flip ⇄)", thick: "28.0", label: "5. לחיצה על Flip במפקח להיפוך שכבות" },
          { name: "אימות חתך תלת־ממדי", thick: "28.0", label: "6. אימות חתך תלת־ממדי מלא ב-3D", view: "3d" },
        ]
      : [
          { name: "Concrete Core 20cm", thick: "20.0", label: "1. Select Basic Concrete Core (20 cm)" },
          { name: "EPS Insulation & Stucco", thick: "28.0", label: "2. Add Thermal Insulation & Stucco (28 cm)" },
          { name: "Drywall Partition 10cm", thick: "10.0", label: "3. Interior Drywall Stud Partition (10 cm)" },
          { name: "Curtain Glass Wall 15cm", thick: "15.0", label: "4. Double-Glazed Curtain Wall (15 cm)" },
          { name: "Flip Layers (Flip ⇄)", thick: "28.0", label: "5. Click Flip in Inspector to Reverse Direction" },
          { name: "Verify 3D Assembly", thick: "28.0", label: "6. Verify 3D Multi-Layer Assembly", view: "3d" },
        ];

    typeSteps.forEach(function (ts, idx) {
      frames.push({
        id: "wall_types_" + (idx + 1),
        src: createUIFrame(function (ctx, w, h) {
          drawTopBar(ctx, w, { viewMode: ts.view || "2d" }, lang);
          drawLeftSidebar(ctx, h, lang);

          if (ts.view === "3d") {
            var canvasX = 175;
            var canvasW = w - 175 - 205;
            var canvasH = h - 38;
            ctx.fillStyle = "#07080c";
            ctx.fillRect(canvasX, 38, canvasW, canvasH);
            ctx.fillStyle = "#334155";
            ctx.fillRect(320, 170, 260, 130);
            ctx.fillStyle = "#f59e0b";
            ctx.fillRect(320, 140, 260, 30);
            ctx.fillStyle = "#3b82f6";
            ctx.fillRect(320, 115, 260, 25);
            ctx.strokeStyle = "#ffffff";
            ctx.strokeRect(320, 115, 260, 185);
          } else {
            drawCADCanvas(ctx, 175, 205, w, h, lang);
            drawPlanToolbar(ctx, 220, h - 55, "wall", lang);

            ctx.fillStyle = idx === 1 || idx === 4 ? "#f59e0b" : "#3b82f6";
            ctx.fillRect(300, 230, 320, idx === 2 ? 14 : 26);
            ctx.strokeStyle = "#ffffff";
            ctx.strokeRect(300, 230, 320, idx === 2 ? 14 : 26);
          }

          drawRightInspector(ctx, w, h, { title: ts.name, thickness: ts.thick, highlightProp: "thickness" }, lang);
          drawMouseCursor(ctx, w - 105, 140, { isClicking: true, label: ts.label });
        }),
        label: ts.name,
        durationMs: 500,
        stepIndex: Math.min(idx, 3),
      });
    });
  } else if (topicId === "precision") {
    // Precision sequence
    var precSteps = isHe
      ? [
          { len: "360.0", ang: "0.0°", label: "1. הזזת עכבר להנחת קיר" },
          { len: "360.0", ang: "0.0°", label: "2. הקלדת מידה 360 בתיבת ה-CAD" },
          { len: "360.0", ang: "0.0°", label: "3. לחיצה על Tab למעבר לזווית 0°" },
          { len: "360.0", ang: "0.0°", label: "4. לחיצה על Enter לנעילת המידה" },
          { len: "360.0", ang: "0.0°", label: "5. נעילת מידה במפקח הימני", lock: true },
          { len: "360.0", ang: "0.0°", label: "6. אימות מידה מדויקת ב-3D", view: "3d", lock: true },
        ]
      : [
          { len: "360.0", ang: "0.0°", label: "1. Move Cursor to Start Placement" },
          { len: "360.0", ang: "0.0°", label: "2. Type 360 in CAD Floating Entry" },
          { len: "360.0", ang: "0.0°", label: "3. Press Tab to Switch to Angle (0°)" },
          { len: "360.0", ang: "0.0°", label: "4. Press Enter to Lock Dimension" },
          { len: "360.0", ang: "0.0°", label: "5. Toggle Lock Dimension in Inspector", lock: true },
          { len: "360.0", ang: "0.0°", label: "6. Inspect Exact Constraint in 3D", view: "3d", lock: true },
        ];

    precSteps.forEach(function (ps, idx) {
      frames.push({
        id: "prec_" + (idx + 1),
        src: createUIFrame(function (ctx, w, h) {
          drawTopBar(ctx, w, { viewMode: ps.view || "2d" }, lang);
          drawLeftSidebar(ctx, h, lang);
          drawCADCanvas(ctx, 175, 205, w, h, lang);
          drawRightInspector(ctx, w, h, { title: isHe ? "מידות מדויקות" : "Precision Dimensions", length: ps.len, angle: ps.ang, locked: ps.lock, highlightProp: "length" }, lang);
          drawPlanToolbar(ctx, 220, h - 55, "wall", lang);

          ctx.fillStyle = "rgba(59, 130, 246, 0.35)";
          ctx.fillRect(300, 240, 320, 22);
          ctx.strokeStyle = "#3b82f6";
          ctx.strokeRect(300, 240, 320, 22);

          drawDimension(ctx, 300, 240, 620, 240, "360.0 cm ±0.0", -26);
          drawFloatingCADEntry(ctx, 380, 170, ps.len, ps.ang);

          drawMouseCursor(ctx, idx === 4 ? w - 105 : 620, idx === 4 ? 260 : 250, { isClicking: true, label: ps.label });
        }),
        label: ps.label,
        durationMs: 500,
        stepIndex: Math.min(idx, 3),
      });
    });
  } else if (topicId === "angle") {
    // Angle sequence
    for (var a = 1; a <= 6; a++) {
      (function (stepIdx) {
        var ang = 30 + stepIdx * 5;
        frames.push({
          id: "angle_" + stepIdx,
          src: createUIFrame(function (ctx, w, h) {
            drawTopBar(ctx, w, { viewMode: stepIdx === 6 ? "3d" : "2d", orthoOn: stepIdx > 1 ? false : true }, lang);
            drawLeftSidebar(ctx, h, lang);
            drawCADCanvas(ctx, 175, 205, w, h, lang);
            drawRightInspector(ctx, w, h, { title: isHe ? "קיר אלכסוני" : "Angled Wall", angle: ang + ".0°", highlightProp: "angle" }, lang);
            drawPlanToolbar(ctx, 220, h - 55, "wall", lang);

            ctx.strokeStyle = "#3b82f6";
            ctx.lineWidth = 22;
            ctx.lineJoin = "miter";
            ctx.beginPath();
            ctx.moveTo(280, 280);
            ctx.lineTo(460, 140 + stepIdx * 10);
            ctx.lineTo(620, 280);
            ctx.stroke();

            // Mitre label
            ctx.fillStyle = "#f59e0b";
            ctx.font = "bold 11px monospace";
            ctx.fillText(isHe ? "חיבור Mitre נקי (" + ang + "°)" : "Clean Mitre Joint (" + ang + "°)", 380, 330);

            drawMouseCursor(ctx, stepIdx === 1 ? 550 : 460, stepIdx === 1 ? 20 : 140 + stepIdx * 10, {
              isClicking: true,
              label: stepIdx === 1
                ? (isHe ? "1. כיבוי מצב ORTHO בסרגל העליון (F8)" : "1. Toggle ORTHO Off in Topbar (F8)")
                : (isHe ? "ציור זווית אלכסונית " + ang + "°" : "Draw Diagonal Angle " + ang + "°"),
            });
          }),
          label: isHe ? "זווית " + ang + "°" : "Angle " + ang + "°",
          durationMs: 500,
          stepIndex: Math.min(stepIdx - 1, 3),
        });
      })(a);
    }
  } else if (topicId === "opening") {
    // Openings sequence
    var openSteps = isHe
      ? [
          { tool: "door", label: "1. לחיצה על כלי דלת [3] בסרגל הצף" },
          { tool: "door", label: "2. מיקום דלת על הקיר והגדרת כיוון פתיחה" },
          { tool: "window", label: "3. לחיצה על כלי חלון [4]" },
          { tool: "window", label: "4. הנחת חלון 120 ס\"מ על הקיר" },
          { tool: "window", label: "5. שינוי גובה סף ל-90 ס\"מ במפקח", prop: "thickness" },
          { tool: "select", label: "6. בדיקת חדירת אור בתלת־ממד 3D", view: "3d" },
        ]
      : [
          { tool: "door", label: "1. Click Door Tool [3] in Floating Toolbar" },
          { tool: "door", label: "2. Place Door on Wall & Set Swing Arc" },
          { tool: "window", label: "3. Click Window Tool [4]" },
          { tool: "window", label: "4. Place 120 cm Window on Wall" },
          { tool: "window", label: "5. Set Sill Height to 90 cm in Inspector", prop: "thickness" },
          { tool: "select", label: "6. Verify Daylight Penetration in 3D", view: "3d" },
        ];

    openSteps.forEach(function (os, idx) {
      frames.push({
        id: "open_" + (idx + 1),
        src: createUIFrame(function (ctx, w, h) {
          drawTopBar(ctx, w, { viewMode: os.view || "2d" }, lang);
          drawLeftSidebar(ctx, h, lang);
          drawCADCanvas(ctx, 175, 205, w, h, lang);
          drawRightInspector(ctx, w, h, {
            title: idx < 2
              ? (isHe ? "דלת פנים 80cm" : "Interior Door 80cm")
              : (isHe ? "חלון 120cm (סף 90cm)" : "Window 120cm (Sill 90cm)"),
            thickness: idx < 2
              ? (isHe ? "פתח 80 ס\"מ" : "80 cm Clear Span")
              : (isHe ? "סף 90 ס\"מ" : "90 cm Sill Height"),
            highlightProp: os.prop
          }, lang);
          drawPlanToolbar(ctx, 220, h - 55, os.tool, lang);

          // Wall with door and window
          ctx.fillStyle = "rgba(59, 130, 246, 0.35)";
          ctx.fillRect(260, 230, 420, 24);
          ctx.strokeStyle = "#3b82f6";
          ctx.strokeRect(260, 230, 420, 24);

          if (idx >= 1) {
            // Door cutout & swing arc
            ctx.clearRect(360, 228, 70, 28);
            ctx.strokeStyle = "#10b981";
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(360, 230, 70, 0, Math.PI / 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(360, 230);
            ctx.lineTo(360, 300);
            ctx.stroke();
          }

          if (idx >= 3) {
            // Window cutout & mullions
            ctx.clearRect(490, 228, 100, 28);
            ctx.fillStyle = "rgba(6, 182, 212, 0.4)";
            ctx.fillRect(490, 235, 100, 14);
            ctx.strokeStyle = "#06b6d4";
            ctx.strokeRect(490, 235, 100, 14);
          }

          drawMouseCursor(ctx, idx === 0 ? 370 : idx === 4 ? w - 105 : 540, idx === 0 ? h - 38 : idx === 4 ? 150 : 240, {
            isClicking: true,
            label: os.label,
          });
        }),
        label: os.label,
        durationMs: 500,
        stepIndex: Math.min(idx, 3),
      });
    });
  } else {
    // 360 Turntable Orbit Sequence inside Full 3D ModelForge UI
    var orbitSteps = 16;
    for (var k = 0; k < orbitSteps; k++) {
      (function (stepIdx) {
        var angleDeg = Math.round(stepIdx * (360 / orbitSteps));
        var rad = stepIdx * (Math.PI * 2 / orbitSteps);
        var cx = 460 + Math.cos(rad) * 160;
        var cy = 250 + Math.sin(rad) * 55;

        frames.push({
          id: topicId + "_" + stepIdx,
          src: createUIFrame(function (ctx, w, h) {
            drawTopBar(ctx, w, { viewMode: "3d" }, lang);
            drawLeftSidebar(ctx, h, lang);

            var canvasX = 175;
            var canvasW = w - 175 - 205;
            var canvasH = h - 38;

            // 3D Viewport background (#07080c)
            ctx.fillStyle = "#07080c";
            ctx.fillRect(canvasX, 38, canvasW, canvasH);

            // Ground grid
            ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (var gx = canvasX + 20; gx < canvasX + canvasW; gx += 40) {
              ctx.moveTo(gx, 150);
              ctx.lineTo(gx - 50, h - 10);
            }
            ctx.stroke();

            // Villa Base & Walls
            ctx.fillStyle = "#1e293b";
            ctx.beginPath();
            ctx.moveTo(460, 160);
            ctx.lineTo(620, 240);
            ctx.lineTo(460, 320);
            ctx.lineTo(300, 240);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#475569";
            ctx.stroke();

            var houseH = 80;
            ctx.fillStyle = "rgba(59, 130, 246, 0.45)";
            ctx.beginPath();
            ctx.moveTo(300, 240);
            ctx.lineTo(300, 240 - houseH);
            ctx.lineTo(460, 160 - houseH);
            ctx.lineTo(460, 160);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "rgba(37, 99, 235, 0.7)";
            ctx.beginPath();
            ctx.moveTo(460, 160);
            ctx.lineTo(460, 160 - houseH);
            ctx.lineTo(620, 240 - houseH);
            ctx.lineTo(620, 240);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Orbit Path & Camera indicator
            ctx.strokeStyle = "rgba(59, 130, 246, 0.35)";
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.ellipse(460, 240, 160, 55, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = "#3b82f6";
            ctx.beginPath();
            ctx.arc(cx, cy, 7, 0, Math.PI * 2);
            ctx.fill();

            // Camera sight line
            ctx.strokeStyle = "rgba(59, 130, 246, 0.7)";
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(460, 230);
            ctx.stroke();

            drawRightInspector(ctx, w, h, {
              title: isHe ? "סיבוב 360° (" + angleDeg + "°)" : "360° Orbit (" + angleDeg + "°)",
              length: (isHe ? "זווית: " : "Angle: ") + angleDeg + "°",
              thickness: isHe ? "16 פריימים" : "16 Frames",
              locked: true
            }, lang);
            drawMouseCursor(ctx, cx, cy, { label: (isHe ? "מצלמה: " : "Camera: ") + angleDeg + "°" });
          }),
          label: (isHe ? "סיבוב " : "Orbit ") + angleDeg + "°",
          durationMs: 250,
          stepIndex: Math.floor(stepIdx / 4),
        });
      })(k);
    }
  }

  cachedTopicFrames[cacheKey] = frames;
  return frames;
}

/**
 * Pre-configured ready-made video reels ready for instant preview and presentation.
 */
export function getReadyMadeReels(overrideLang) {
  var lang = overrideLang || getLang() || "he";
  return [
    {
      id: "orbit_villa_360",
      icon: "ph-cube",
      title: t("video_reel_orbit_title") || (lang === "he" ? "סיבוב 360° מהיר של וילה יוקרתית" : "360° Luxury Villa Turntable"),
      desc: t("video_reel_orbit_desc") || (lang === "he" ? "סיבוב מצלמה קולנועי רציף של מודל וילה תלת־ממדית." : "Continuous cinematic camera turntable around a 3D villa."),
      fps: 12,
      transition: "crossfade",
      frames: getTopicVideoFrames("quick_videos", lang),
    },
    {
      id: "walls_and_joins",
      icon: "ph-wall",
      title: t("video_reel_walls_title") || (lang === "he" ? "שרטוט מדויק וחיבורי קירות" : "Precision Wall Layout & T-Junctions"),
      desc: t("video_reel_walls_desc") || (lang === "he" ? "רצף שרטוט מהיר המדגים חיבורי T, פינות ומדידות." : "Fast sequential drafting demonstration with T-joins and precision snaps."),
      fps: 6,
      transition: "crossfade",
      frames: getTopicVideoFrames("basic", lang),
    },
    {
      id: "wall_assemblies",
      icon: "ph-stack",
      title: t("video_reel_types_title") || (lang === "he" ? "שכבות קיר, בידוד ופרופילים" : "Wall Assemblies & Multi-Layer Construction"),
      desc: t("video_reel_types_desc") || (lang === "he" ? "אנימציית שכבות הכוללת בלוקים, בידוד וניצבים." : "Layer stack animation showing concrete core, insulation, and studs."),
      fps: 6,
      transition: "wipe_left",
      frames: getTopicVideoFrames("wall_types", lang),
    },
    {
      id: "doors_and_windows",
      icon: "ph-door-open",
      title: t("video_reel_openings_title") || (lang === "he" ? "פתחים, דלתות ומחיצות זכוכית" : "Window Sills, Door Swings & Mullions"),
      desc: t("video_reel_openings_desc") || (lang === "he" ? "מיקום פתחים עם הגדרת גובה סף וחלוקת זכוכית." : "Placing doors and windows with sill elevation adjustments in 3D."),
      fps: 6,
      transition: "crossfade",
      frames: getTopicVideoFrames("opening", lang),
    },
  ];
}
