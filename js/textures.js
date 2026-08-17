/* ==========================================================================
   TEXTURES & AUTO SEARCH ENGINE (textures.js)
   --------------------------------------------------------------------------
   - Rich built-in texture presets (Wood, Marble, Tiles, Concrete, Fabric, etc.)
   - Real-time procedural Canvas texture generator (tilable seamless patterns)
   - Online API integrations: 5 sources in parallel (PolyHaven, ambientCG, cgbookcase, ShareTextures, TextureCan)
   - Bilingual search parser (Hebrew / English)
   ========================================================================== */

import { S } from "./state.js";

// --- HEBREW TO ENGLISH DICTIONARY ---
const HEBREW_TO_ENGLISH = {
  "שיש": "marble", "עץ": "wood", "בטון": "concrete", "אריחים": "tiles", "פרקט": "parquet", "לבנים": "brick",
  "עור": "leather", "בד": "fabric", "קרמיקה": "ceramic", "גרניט": "granite", "טרצו": "terrazzo",
  "דשא": "grass", "אבן": "stone", "מתכת": "metal", "זכוכית": "glass", "טיח": "plaster",
  "ונציאני": "venetian", "מוברש": "brushed", "נירוסטה": "steel", "פליז": "brass",
  "שחור": "black", "לבן": "white", "אפור": "grey", "חום": "brown", "כחול": "blue", "ירוק": "green", "אדום": "red", "בז'": "beige", "קרם": "cream",
  "מחורץ": "fluted", "דק": "decking", "במבוק": "bamboo", "אלון": "oak", "אגוז": "walnut",
  "מוזאיקה": "mosaic", "טפט": "wallpaper", "חיפוי": "cladding", "סרגלי": "slat"
};

export function translateSearchQuery(query) {
  if (!query) return query;
  let translated = query;
  for (const [he, en] of Object.entries(HEBREW_TO_ENGLISH)) {
    translated = translated.split(he).join(en);
  }
  return translated;
}

// --- PROCEDURAL SEAMLESS CANVAS TEXTURE GENERATOR ---
export function generateProceduralTexture(type, param) {
  var canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  var p = param || {};
  var bg = p.bg || "#ffffff";
  var fg = p.fg || "#333333";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 512);

  if (type === "wood") {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.08;
    for (var i = 0; i < 500; i++) {
      var y = Math.random() * 512;
      var h = 1 + Math.random() * 3;
      ctx.fillRect(0, y, 512, h);
    }
    ctx.globalAlpha = 0.05;
    for (var k = 0; k < 6; k++) {
      var kx = Math.random() * 512;
      var ky = Math.random() * 512;
      var kr = 20 + Math.random() * 40;
      var grad = ctx.createRadialGradient(kx, ky, 2, kx, ky, kr);
      grad.addColorStop(0, fg);
      grad.addColorStop(1, bg);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(kx, ky, kr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  } else if (type === "marble") {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.25;
    for (var v = 0; v < 7; v++) {
      ctx.beginPath();
      var x = Math.random() * 512;
      var y = 0;
      ctx.moveTo(x, y);
      while (y < 512) {
        y += 15 + Math.random() * 25;
        x += (Math.random() - 0.5) * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  } else if (type === "subway_tiles") {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.3;
    var rh = 64, rw = 128;
    for (var r = 0; r <= 512; r += rh) {
      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.lineTo(512, r);
      ctx.stroke();
      var offset = ((r / rh) % 2) * (rw / 2);
      for (var c = offset; c <= 512; c += rw) {
        ctx.beginPath();
        ctx.moveTo(c, r);
        ctx.lineTo(c, r + rh);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1.0;
  } else if (type === "hexagon_tiles") {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.25;
    var rad = 32;
    var h = rad * Math.sqrt(3);
    for (var y = -rad; y < 512 + rad; y += h) {
      for (var x = -rad; x < 512 + rad; x += rad * 3) {
        drawHex(ctx, x, y, rad);
        drawHex(ctx, x + rad * 1.5, y + h / 2, rad);
      }
    }
    ctx.globalAlpha = 1.0;
  } else if (type === "concrete" || type === "stucco") {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);
    var imgData = ctx.getImageData(0, 0, 512, 512);
    var data = imgData.data;
    for (var idx = 0; idx < data.length; idx += 4) {
      var n = (Math.random() - 0.5) * 24;
      data[idx] = Math.min(255, Math.max(0, data[idx] + n));
      data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] + n));
      data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === "fabric") {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.08;
    for (var fx = 0; fx < 512; fx += 4) {
      ctx.fillRect(fx, 0, 2, 512);
    }
    for (var fy = 0; fy < 512; fy += 4) {
      ctx.fillRect(0, fy, 512, 2);
    }
    ctx.globalAlpha = 1.0;
  } else if (type === "terrazzo") {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);
    var colors = [fg, "#884422", "#226688", "#555555", "#aa8866"];
    for (var tc = 0; tc < 150; tc++) {
      ctx.fillStyle = colors[tc % colors.length];
      ctx.globalAlpha = 0.5 + Math.random() * 0.4;
      ctx.beginPath();
      var tx0 = Math.random() * 512;
      var ty0 = Math.random() * 512;
      var tr0 = 4 + Math.random() * 12;
      ctx.arc(tx0, ty0, tr0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  } else if (type === "herringbone") {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.35;
    var pw = 40, pl = 120;
    for (var hx = -100; hx < 600; hx += pw * 2) {
      for (var hy = -100; hy < 600; hy += pl) {
        ctx.save();
        ctx.translate(hx, hy);
        ctx.strokeRect(0, 0, pw, pl);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1.0;
  }

  return canvas.toDataURL("image/jpeg", 0.85);
}

// --- PROCEDURAL BUMP MAP (HEIGHTMAP) GENERATOR ---
var bumpDataUrlCache = {};

export function generateProceduralBumpMap(type, param) {
  var canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  var p = param || {};
  // Grayscale heightmap: #000000 = deep groove/recess, #ffffff = raised surface, #808080 = neutral
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 512, 512);

  if (type === "wood") {
    // Base wood face height
    ctx.fillStyle = "#a0a0a0";
    ctx.fillRect(0, 0, 512, 512);
    // Wood grain grooves (recessed height)
    ctx.fillStyle = "#303030";
    ctx.globalAlpha = 0.25;
    for (var i = 0; i < 600; i++) {
      var y = Math.random() * 512;
      var h = 1 + Math.random() * 3.5;
      ctx.fillRect(0, y, 512, h);
    }
    // Knots depth
    ctx.globalAlpha = 0.35;
    for (var k = 0; k < 6; k++) {
      var kx = Math.random() * 512;
      var ky = Math.random() * 512;
      var kr = 20 + Math.random() * 40;
      var grad = ctx.createRadialGradient(kx, ky, 2, kx, ky, kr);
      grad.addColorStop(0, "#101010");
      grad.addColorStop(0.6, "#606060");
      grad.addColorStop(1, "#a0a0a0");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(kx, ky, kr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  } else if (type === "subway_tiles") {
    // Tile face = white (raised), Grout lines = black (recessed)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 512, 512);
    var rh = 64, rw = 128;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 6;
    for (var r = 0; r <= 512; r += rh) {
      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.lineTo(512, r);
      ctx.stroke();
      var offset = ((r / rh) % 2) * (rw / 2);
      for (var c = offset; c <= 512; c += rw) {
        ctx.beginPath();
        ctx.moveTo(c, r);
        ctx.lineTo(c, r + rh);
        ctx.stroke();
      }
    }
    // Add subtle bevel shadow inner border on tiles
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#808080";
    for (var r2 = 0; r2 <= 512; r2 += rh) {
      var offset2 = ((r2 / rh) % 2) * (rw / 2);
      for (var c2 = offset2; c2 <= 512; c2 += rw) {
        ctx.strokeRect(c2 + 3, r2 + 3, rw - 6, rh - 6);
      }
    }
  } else if (type === "hexagon_tiles") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 5;
    var rad = 32;
    var h = rad * Math.sqrt(3);
    for (var y = -rad; y < 512 + rad; y += h) {
      for (var x = -rad; x < 512 + rad; x += rad * 3) {
        drawHex(ctx, x, y, rad);
        drawHex(ctx, x + rad * 1.5, y + h / 2, rad);
      }
    }
  } else if (type === "concrete" || type === "stucco") {
    // Pitted height noise
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 512, 512);
    var imgData = ctx.getImageData(0, 0, 512, 512);
    var data = imgData.data;
    for (var idx = 0; idx < data.length; idx += 4) {
      var n = (Math.random() - 0.5) * 70;
      var val = Math.min(255, Math.max(0, 128 + n));
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === "fabric") {
    // Woven thread height grid
    ctx.fillStyle = "#707070";
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = "#e0e0e0";
    for (var fx = 0; fx < 512; fx += 4) {
      ctx.fillRect(fx, 0, 2, 512);
    }
    ctx.fillStyle = "#303030";
    for (var fy = 0; fy < 512; fy += 4) {
      ctx.fillRect(0, fy, 512, 2);
    }
  } else if (type === "terrazzo") {
    ctx.fillStyle = "#909090";
    ctx.fillRect(0, 0, 512, 512);
    for (var tc = 0; tc < 160; tc++) {
      var isRaised = tc % 2 === 0;
      ctx.fillStyle = isRaised ? "#e0e0e0" : "#202020";
      ctx.beginPath();
      var tx0 = Math.random() * 512;
      var ty0 = Math.random() * 512;
      var tr0 = 4 + Math.random() * 12;
      ctx.arc(tx0, ty0, tr0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === "herringbone") {
    ctx.fillStyle = "#c0c0c0";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 4;
    var pw = 40, pl = 120;
    for (var hx = -100; hx < 600; hx += pw * 2) {
      for (var hy = -100; hy < 600; hy += pl) {
        ctx.save();
        ctx.translate(hx, hy);
        ctx.strokeRect(0, 0, pw, pl);
        ctx.restore();
      }
    }
  } else if (type === "marble") {
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "#404040";
    ctx.lineWidth = 3;
    for (var v = 0; v < 7; v++) {
      ctx.beginPath();
      var vx = Math.random() * 512;
      var vy = 0;
      ctx.moveTo(vx, vy);
      while (vy < 512) {
        vy += 15 + Math.random() * 25;
        vx += (Math.random() - 0.5) * 40;
        ctx.lineTo(vx, vy);
      }
      ctx.stroke();
    }
  }

  return canvas.toDataURL("image/jpeg", 0.85);
}

export function createBumpMapFromImage(imgUrl, callback) {
  if (!imgUrl) {
    if (callback) callback(null);
    return null;
  }

  if (bumpDataUrlCache[imgUrl]) {
    if (callback) callback(bumpDataUrlCache[imgUrl]);
    return bumpDataUrlCache[imgUrl];
  }

  var img = new Image();
  img.crossOrigin = "Anonymous";
  img.onload = function () {
    try {
      var canvas = document.createElement("canvas");
      var size = 256;
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, size, size);

      var imgData = ctx.getImageData(0, 0, size, size);
      var data = imgData.data;
      var width = size;
      var height = size;

      var gray = new Float32Array(width * height);
      for (var i = 0; i < data.length; i += 4) {
        gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }

      var outData = ctx.createImageData(width, height);
      var outPixels = outData.data;

      for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
          var idx = y * width + x;
          var center = gray[idx];

          var right = gray[y * width + Math.min(width - 1, x + 1)];
          var bottom = gray[Math.min(height - 1, y + 1) * width + x];

          var dx = center - right;
          var dy = center - bottom;
          var grad = Math.sqrt(dx * dx + dy * dy) * 2.5;

          var h = Math.min(255, Math.max(0, center * 0.65 + grad * 0.75));

          var pIdx = idx * 4;
          outPixels[pIdx] = h;
          outPixels[pIdx + 1] = h;
          outPixels[pIdx + 2] = h;
          outPixels[pIdx + 3] = 255;
        }
      }

      ctx.putImageData(outData, 0, 0);
      var dataUrl = canvas.toDataURL("image/png");
      bumpDataUrlCache[imgUrl] = dataUrl;
      if (callback) callback(dataUrl);
    } catch (e) {
      if (callback) callback(null);
    }
  };
  img.onerror = function () {
    if (callback) callback(null);
  };
  img.src = imgUrl;

  return null;
}

export function getTexturePresetBumpUrl(presetOrUrl) {
  if (!presetOrUrl) return null;
  try {
    if (typeof presetOrUrl === "string") {
      if (bumpDataUrlCache[presetOrUrl]) return bumpDataUrlCache[presetOrUrl];

      // Check if preset ID or URL match
      var preset = PRESET_TEXTURES.find(p => p && (p.id === presetOrUrl || p.url === presetOrUrl));
      if (preset) {
        if (preset.bumpUrl) return preset.bumpUrl;
        if (bumpDataUrlCache[preset.id]) return bumpDataUrlCache[preset.id];
        if (preset.generate) {
          var bUrl = generateProceduralBumpMap(preset.cat || "concrete", preset.param);
          bumpDataUrlCache[preset.id] = bUrl;
          return bUrl;
        }
      }

      // Check if standard floor type (wood, concrete, tiles, balcony, marble, etc.)
      var typeMap = {
        wood: "wood",
        parquet: "herringbone",
        laminate: "wood",
        tiles: "subway_tiles",
        tilesGrey: "subway_tiles",
        balcony: "subway_tiles",
        concrete: "concrete",
        marble: "marble",
        stone: "marble",
        terrazzo: "terrazzo",
        fabric: "fabric",
        stucco: "stucco"
      };

      var mappedType = typeMap[presetOrUrl] || (presetOrUrl.includes("wood") ? "wood" : presetOrUrl.includes("tile") ? "subway_tiles" : null);
      if (mappedType) {
        var bUrl2 = generateProceduralBumpMap(mappedType);
        bumpDataUrlCache[presetOrUrl] = bUrl2;
        return bUrl2;
      }

      // Only attempt image loader if it's actually a valid URL
      if (presetOrUrl.startsWith("http://") || presetOrUrl.startsWith("https://") || presetOrUrl.startsWith("data:")) {
        createBumpMapFromImage(presetOrUrl);
        return bumpDataUrlCache[presetOrUrl] || null;
      }

      return null;
    }

    if (presetOrUrl.bumpUrl) return presetOrUrl.bumpUrl;
    if (bumpDataUrlCache[presetOrUrl.id]) return bumpDataUrlCache[presetOrUrl.id];
    if (presetOrUrl.generate) {
      var bUrl3 = generateProceduralBumpMap(presetOrUrl.cat || "concrete", presetOrUrl.param);
      bumpDataUrlCache[presetOrUrl.id] = bUrl3;
      return bUrl3;
    }
  } catch (e) {
    console.warn("getTexturePresetBumpUrl error:", e);
  }
  return null;
}

function drawHex(ctx, x, y, r) {
  ctx.beginPath();
  for (var i = 0; i < 6; i++) {
    var angle = (Math.PI / 3) * i;
    var hx = x + r * Math.cos(angle);
    var hy = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.stroke();
}

// --- RICH BUILT-IN TEXTURE PRESETS ---
export const TEXTURE_CATEGORIES = [
  { id: "all", name: { he: "הכל", en: "All" }, icon: "ph-squares-four" },
  { id: "fav", name: { he: "⭐ מועדפים", en: "⭐ Favorites" }, icon: "ph-star" },
  { id: "wood", name: { he: "עץ ופרקט", en: "Wood & Parquet" }, icon: "ph-tree-structure" },
  { id: "stone", name: { he: "שיש ואבן", en: "Marble & Stone" }, icon: "ph-mountains" },
  { id: "tiles", name: { he: "אריחים וקרמיקה", en: "Tiles & Ceramics" }, icon: "ph-grid-nine" },
  { id: "concrete", name: { he: "בטון וטיח", en: "Concrete & Plaster" }, icon: "ph-wall" },
  { id: "fabric", name: { he: "בד ועור", en: "Fabric & Leather" }, icon: "ph-armchair" },
  { id: "brick", name: { he: "לבנים וטפטים", en: "Bricks & Wallpapers" }, icon: "ph-paint-brush-household" },
  { id: "metal", name: { he: "מתכת וזכוכית", en: "Metals & Special" }, icon: "ph-sparkle" },
  { id: "outdoor", name: { he: "חוץ וגינה", en: "Outdoor & Garden" }, icon: "ph-sun" },
];

export const PRESET_TEXTURES = [
  // WOOD
  { id: "oak_natural", cat: "wood", name: { he: "אלון טבעי", en: "Natural Oak" }, tags: ["wood", "oak", "parquet", "עץ", "אלון", "פרקט"], generate: () => generateProceduralTexture("wood", { bg: "#d9b382", fg: "#5c4018" }), scale: 200 },
  { id: "walnut_dark", cat: "wood", name: { he: "אגוז אמריקאי כהה", en: "Dark Walnut" }, tags: ["wood", "walnut", "dark", "עץ", "אגוז"], generate: () => generateProceduralTexture("wood", { bg: "#4a3222", fg: "#1f120a" }), scale: 200 },
  { id: "herringbone_parquet", cat: "wood", name: { he: "פרקט אדרה (Herringbone)", en: "Herringbone Parquet" }, tags: ["parquet", "herringbone", "wood", "פרקט", "אדרה"], generate: () => generateProceduralTexture("herringbone", { bg: "#cfa670", fg: "#4a3215" }), scale: 240 },
  { id: "white_ash", cat: "wood", name: { he: "עץ מולבן / אש", en: "White Ash Wood" }, tags: ["wood", "white", "ash", "עץ", "לבן"], generate: () => generateProceduralTexture("wood", { bg: "#e8e1d5", fg: "#a39988" }), scale: 200 },
  { id: "ebony_black", cat: "wood", name: { he: "עץ הובנה שחור", en: "Black Ebony Wood" }, tags: ["wood", "black", "ebony", "עץ", "שחור"], generate: () => generateProceduralTexture("wood", { bg: "#242424", fg: "#0d0d0d" }), scale: 200 },
  { id: "bamboo_light", cat: "wood", name: { he: "במבוק בהיר", en: "Light Bamboo" }, tags: ["bamboo", "wood", "במבוק", "עץ"], generate: () => generateProceduralTexture("wood", { bg: "#e0ca9b", fg: "#8c7649" }), scale: 180 },
  { id: "teak_rustic", cat: "wood", name: { he: "עץ טיק כפרי", en: "Rustic Teak" }, tags: ["teak", "wood", "rustic", "טיק", "עץ"], generate: () => generateProceduralTexture("wood", { bg: "#8a572b", fg: "#3d220c" }), scale: 220 },
  { id: "maple_honey", cat: "wood", name: { he: "מייפל דבש", en: "Honey Maple" }, tags: ["wood", "maple", "honey", "עץ", "מייפל"], generate: () => generateProceduralTexture("wood", { bg: "#d4a25a", fg: "#6b4e1c" }), scale: 200 },
  { id: "chevron_parquet", cat: "wood", name: { he: "פרקט שברון", en: "Chevron Parquet" }, tags: ["wood", "parquet", "chevron", "פרקט"], generate: () => generateProceduralTexture("herringbone", { bg: "#b8854e", fg: "#4a3012" }), scale: 240 },
  { id: "reclaimed_wood", cat: "wood", name: { he: "עץ ממוחזר", en: "Reclaimed Wood" }, tags: ["wood", "reclaimed", "rustic", "עץ", "ממוחזר"], generate: () => generateProceduralTexture("wood", { bg: "#7a6548", fg: "#3a2d1e" }), scale: 220 },

  // MARBLE & STONE
  { id: "calacatta_gold", cat: "stone", name: { he: "שיש קלאקטה זהב", en: "Calacatta Gold Marble" }, tags: ["marble", "calacatta", "white", "gold", "שיש", "לבן"], generate: () => generateProceduralTexture("marble", { bg: "#f7f7f5", fg: "#8c7d6b" }), scale: 300 },
  { id: "nero_marquina", cat: "stone", name: { he: "שיש מרקינה שחור", en: "Nero Marquina Marble" }, tags: ["marble", "black", "nero", "שיש", "שחור"], generate: () => generateProceduralTexture("marble", { bg: "#1a1a1a", fg: "#e6e6e6" }), scale: 300 },
  { id: "terrazzo_speckled", cat: "stone", name: { he: "טרצו בהיר", en: "Light Terrazzo" }, tags: ["terrazzo", "stone", "טרצו", "אבן"], generate: () => generateProceduralTexture("terrazzo", { bg: "#eae5dd", fg: "#443322" }), scale: 250 },
  { id: "granite_grey", cat: "stone", name: { he: "גרניט אפור", en: "Grey Granite" }, tags: ["granite", "stone", "grey", "גרניט", "אבן"], generate: () => generateProceduralTexture("concrete", { bg: "#888888", fg: "#333333" }), scale: 200 },
  { id: "travertine_beige", cat: "stone", name: { he: "טראוורטין בז'", en: "Beige Travertine" }, tags: ["travertine", "stone", "beige", "שיש", "טראוורטין"], generate: () => generateProceduralTexture("marble", { bg: "#dfcfb7", fg: "#a39178" }), scale: 280 },
  { id: "emerald_marble", cat: "stone", name: { he: "שיש ירוק אמראלד", en: "Emerald Green Marble" }, tags: ["marble", "green", "emerald", "שיש", "ירוק"], generate: () => generateProceduralTexture("marble", { bg: "#123b2c", fg: "#3a7a62" }), scale: 300 },
  { id: "slate_dark", cat: "stone", name: { he: "צפחה כהה", en: "Dark Slate" }, tags: ["stone", "slate", "dark", "אבן", "צפחה"], generate: () => generateProceduralTexture("concrete", { bg: "#3a3d42", fg: "#1d1f22" }), scale: 200 },
  { id: "limestone_cream", cat: "stone", name: { he: "אבן גיר קרם", en: "Cream Limestone" }, tags: ["stone", "limestone", "cream", "אבן", "קרם"], generate: () => generateProceduralTexture("marble", { bg: "#e8dcc8", fg: "#b5a78e" }), scale: 200 },
  { id: "onyx_gold", cat: "stone", name: { he: "אוניקס זהב", en: "Gold Onyx" }, tags: ["stone", "onyx", "gold", "אבן", "זהב"], generate: () => generateProceduralTexture("marble", { bg: "#c9a94e", fg: "#7d6420" }), scale: 250 },

  // TILES & CERAMIC
  { id: "subway_white", cat: "tiles", name: { he: "אריחי מטרו לבנים", en: "White Subway Tiles" }, tags: ["subway", "tiles", "white", "ceramic", "אריחים", "מטרו"], generate: () => generateProceduralTexture("subway_tiles", { bg: "#fcfcfc", fg: "#888888" }), scale: 180 },
  { id: "hexagon_teal", cat: "tiles", name: { he: "אריחים משושים טורקיז", en: "Teal Hexagon Tiles" }, tags: ["hexagon", "tiles", "teal", "משושים", "אריחים"], generate: () => generateProceduralTexture("hexagon_tiles", { bg: "#1e5359", fg: "#0e292d" }), scale: 200 },
  { id: "checkerboard_bw", cat: "tiles", name: { he: "אריחי שחמט שחור-לבן", en: "Black & White Checker" }, tags: ["checker", "tiles", "black", "white", "שחמט", "אריחים"], generate: () => generateProceduralTexture("subway_tiles", { bg: "#111111", fg: "#eeeeee" }), scale: 240 },
  { id: "terracotta_rustic", cat: "tiles", name: { he: "טרקוטה כפרית", en: "Rustic Terracotta" }, tags: ["terracotta", "tiles", "clay", "טרקוטה", "אריחים"], generate: () => generateProceduralTexture("subway_tiles", { bg: "#bd5332", fg: "#782d17" }), scale: 200 },
  { id: "mosaic_blue", cat: "tiles", name: { he: "מוזאיקה כחולה לבריכה", en: "Blue Mosaic Tiles" }, tags: ["mosaic", "tiles", "blue", "מוזאיקה", "כחול"], generate: () => generateProceduralTexture("subway_tiles", { bg: "#0d5c9e", fg: "#73b7ed" }), scale: 150 },
  { id: "moroccan_zellige", cat: "tiles", name: { he: "זליג' מרוקאי", en: "Moroccan Zellige" }, tags: ["tiles", "moroccan", "zellige", "אריחים", "מרוקאי"], generate: () => generateProceduralTexture("hexagon_tiles", { bg: "#1a6b5a", fg: "#0d3a2f" }), scale: 150 },
  { id: "fish_scale_tiles", cat: "tiles", name: { he: "אריחי קשקשי דג", en: "Fish Scale Tiles" }, tags: ["tiles", "fish scale", "אריחים", "דג"], generate: () => generateProceduralTexture("hexagon_tiles", { bg: "#2c5f7c", fg: "#14303e" }), scale: 150 },
  { id: "large_format_white", cat: "tiles", name: { he: "אריחים גדולים לבנים", en: "Large Format White" }, tags: ["tiles", "white", "large", "אריחים", "לבן"], generate: () => generateProceduralTexture("subway_tiles", { bg: "#f5f5f3", fg: "#ccccc8" }), scale: 300 },

  // CONCRETE & PLASTER
  { id: "polished_microcement", cat: "concrete", name: { he: "מיקרו-סמנט מוחלק", en: "Polished Microcement" }, tags: ["concrete", "microcement", "grey", "בטון", "מיקרוסמנט"], generate: () => generateProceduralTexture("concrete", { bg: "#aaaaaa", fg: "#666666" }), scale: 250 },
  { id: "venetian_plaster_white", cat: "concrete", name: { he: "טיח ונציאני בהיר", en: "White Venetian Plaster" }, tags: ["plaster", "venetian", "white", "טיח", "ונציאני"], generate: () => generateProceduralTexture("stucco", { bg: "#f0ede6", fg: "#d6d0c4" }), scale: 300 },
  { id: "raw_board_concrete", cat: "concrete", name: { he: "בטון אדריכלי חשוף", en: "Exposed Board Concrete" }, tags: ["concrete", "raw", "industrial", "בטון"], generate: () => generateProceduralTexture("wood", { bg: "#7a7e85", fg: "#4a4d52" }), scale: 220 },
  { id: "dark_microcement", cat: "concrete", name: { he: "מיקרוסמנט כהה", en: "Dark Microcement" }, tags: ["concrete", "microcement", "dark", "בטון", "מיקרוסמנט"], generate: () => generateProceduralTexture("concrete", { bg: "#4a4a4a", fg: "#222222" }), scale: 250 },
  { id: "lime_wash", cat: "concrete", name: { he: "שטיח סיד (Lime Wash)", en: "Lime Wash" }, tags: ["concrete", "lime wash", "plaster", "טיח", "סיד"], generate: () => generateProceduralTexture("stucco", { bg: "#f5f0e8", fg: "#e0d8ca" }), scale: 200 },

  // FABRIC & LEATHER
  { id: "natural_linen", cat: "fabric", name: { he: "פשתן טבעי", en: "Natural Linen" }, tags: ["fabric", "linen", "natural", "בד", "פשתן"], generate: () => generateProceduralTexture("fabric", { bg: "#ded5c5", fg: "#998f7c" }), scale: 150 },
  { id: "caramel_leather", cat: "fabric", name: { he: "עור קרמל יוקרתי", en: "Caramel Leather" }, tags: ["leather", "caramel", "brown", "עור", "קרמל"], generate: () => generateProceduralTexture("stucco", { bg: "#9e5828", fg: "#572d11" }), scale: 180 },
  { id: "tufted_velvet_navy", cat: "fabric", name: { he: "קטיפה כחול נייבי", en: "Navy Velvet" }, tags: ["velvet", "fabric", "navy", "blue", "קטיפה", "כחול"], generate: () => generateProceduralTexture("fabric", { bg: "#162840", fg: "#0a1421" }), scale: 150 },
  { id: "boucle_cream", cat: "fabric", name: { he: "בד בוקלה שמנת", en: "Cream Bouclé Fabric" }, tags: ["fabric", "boucle", "cream", "בד", "בוקלה"], generate: () => generateProceduralTexture("stucco", { bg: "#f7f4ed", fg: "#dbd5c5" }), scale: 140 },
  { id: "grey_wool", cat: "fabric", name: { he: "צמר אפור", en: "Grey Wool" }, tags: ["fabric", "wool", "grey", "בד", "צמר"], generate: () => generateProceduralTexture("fabric", { bg: "#888888", fg: "#555555" }), scale: 150 },
  { id: "cognac_leather", cat: "fabric", name: { he: "עור קוניאק", en: "Cognac Leather" }, tags: ["leather", "cognac", "brown", "עור", "קוניאק"], generate: () => generateProceduralTexture("stucco", { bg: "#8b4513", fg: "#4a2208" }), scale: 180 },

  // BRICKS & WALLPAPERS
  { id: "red_heritage_brick", cat: "brick", name: { he: "לבנים אדומות קלאסיות", en: "Red Heritage Brick" }, tags: ["brick", "red", "wall", "לבנים", "אדום"], generate: () => generateProceduralTexture("subway_tiles", { bg: "#9e3828", fg: "#d6c9be" }), scale: 200 },
  { id: "whitewashed_brick", cat: "brick", name: { he: "לבנים מולבנות", en: "Whitewashed Brick" }, tags: ["brick", "white", "loft", "לבנים", "לבן"], generate: () => generateProceduralTexture("subway_tiles", { bg: "#e6e1da", fg: "#a8a298" }), scale: 200 },
  { id: "botanical_wallpaper", cat: "brick", name: { he: "טפט צמחי עדין", en: "Botanical Wallpaper" }, tags: ["wallpaper", "botanical", "green", "טפט", "ירוק"], generate: () => generateProceduralTexture("marble", { bg: "#e4ece6", fg: "#355e3b" }), scale: 250 },
  { id: "slatwall_oak", cat: "brick", name: { he: "חיפוי סרגלי עץ (Slatwall)", en: "Wood Slatwall Cladding" }, tags: ["slatwall", "wood", "wall", "סרגלי עץ", "חיפוי"], generate: () => generateProceduralTexture("wood", { bg: "#bf9865", fg: "#2e1e0a" }), scale: 180 },

  // METALS & SPECIAL
  { id: "brushed_steel", cat: "metal", name: { he: "נירוסטה מוברשת", en: "Brushed Steel" }, tags: ["metal", "steel", "brushed", "נירוסטה", "מתכת"], generate: () => generateProceduralTexture("wood", { bg: "#c4c8cc", fg: "#888e94" }), scale: 150 },
  { id: "polished_brass", cat: "metal", name: { he: "פליז מוזהב", en: "Polished Brass" }, tags: ["metal", "brass", "gold", "פליז", "זהב"], generate: () => generateProceduralTexture("concrete", { bg: "#d4af37", fg: "#997d20" }), scale: 150 },
  { id: "reeded_glass", cat: "metal", name: { he: "זכוכית סבתא / מחורצת", en: "Reeded Glass" }, tags: ["glass", "reeded", "fluted", "זכוכית"], generate: () => generateProceduralTexture("wood", { bg: "#e3f2fd", fg: "#90caf9" }), scale: 120 },

  // OUTDOOR & GARDEN
  { id: "green_grass", cat: "outdoor", name: { he: "דשא ירוק רענן", en: "Lush Green Grass" }, tags: ["grass", "outdoor", "green", "דשא", "גינה"], generate: () => generateProceduralTexture("concrete", { bg: "#3a7d2c", fg: "#1f4a17" }), scale: 300 },
  { id: "composite_decking", cat: "outdoor", name: { he: "דק סינתטי מודרני", en: "Composite Decking" }, tags: ["deck", "outdoor", "wood", "דק"], generate: () => generateProceduralTexture("wood", { bg: "#524338", fg: "#2e241c" }), scale: 220 },
  { id: "sandstone_paving", cat: "outdoor", name: { he: "אבן חול לריצוף", en: "Sandstone Paving" }, tags: ["outdoor", "sandstone", "paving", "ריצוף", "אבן חול"], generate: () => generateProceduralTexture("concrete", { bg: "#c4a77d", fg: "#8b7355" }), scale: 250 },
  { id: "pebble_grey", cat: "outdoor", name: { he: "חלוקי נחל אפורים", en: "Grey Pebbles" }, tags: ["outdoor", "pebbles", "grey", "חלוקי נחל", "אפור"], generate: () => generateProceduralTexture("terrazzo", { bg: "#9a9a9a", fg: "#4d4d4d" }), scale: 150 },
  { id: "cork_natural", cat: "outdoor", name: { he: "שעם טבעי", en: "Natural Cork" }, tags: ["outdoor", "cork", "natural", "שעם"], generate: () => generateProceduralTexture("stucco", { bg: "#c4a46a", fg: "#7d6532" }), scale: 150 },
];

var generatedCache = {};

export function getTexturePresetDataUrl(preset) {
  if (generatedCache[preset.id]) return generatedCache[preset.id];
  if (preset.url) return preset.url;
  if (preset.generate) {
    var url = preset.generate();
    generatedCache[preset.id] = url;
    return url;
  }
  return null;
}

// --- SEARCH CACHE & SOURCES ---
export const searchCache = new Map();
const CACHE_TTL = 300000; // 5 minutes

// Cache for PolyHaven full asset list (large, ~2MB, reused across searches)
var phAssetCache = null;
var phAssetCacheTime = 0;

export const SEARCH_SOURCES = [
  { id: "PolyHaven", name: "PolyHaven (CC0)", color: "#8b5cf6" },
  { id: "ambientCG", name: "ambientCG (CC0)", color: "#10b981" }
];

// --- ONLINE FREE TEXTURE APIS (PolyHaven + ambientCG, parallel) ---
export async function searchOnlineFreeTextures(query) {
  if (!query || query.trim().length < 2) return [];

  const originalQuery = query.toLowerCase().trim();
  const transQuery = translateSearchQuery(originalQuery).toLowerCase().trim();
  const cacheKey = originalQuery;

  if (searchCache.has(cacheKey)) {
    const cached = searchCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.results;
    }
  }

  // Build search terms — combine original + translated
  const searchTerms = [originalQuery];
  if (originalQuery !== transQuery) {
    searchTerms.push(transQuery);
  }

  const results = [];
  const fetchPromises = [];

  // ---- 1. PolyHaven ----
  // Fetches the full texture list (cached), filters client-side,
  // then fetches the files API for each match to get the correct diffuse map URL
  fetchPromises.push(
    (async () => {
      // Reuse cached asset list if still fresh (10 min)
      if (!phAssetCache || Date.now() - phAssetCacheTime > 600000) {
        const res = await fetch("https://api.polyhaven.com/assets?t=textures");
        if (!res.ok) throw new Error("PolyHaven error " + res.status);
        phAssetCache = await res.json();
        phAssetCacheTime = Date.now();
      }

      const data = phAssetCache;
      const keys = Object.keys(data);
      const matches = keys.filter(k => {
        const item = data[k];
        return searchTerms.some(q =>
          k.toLowerCase().includes(q) ||
          (item.name && item.name.toLowerCase().includes(q)) ||
          (item.tags && item.tags.some(tag => tag.toLowerCase().includes(q))) ||
          (item.categories && item.categories.some(cat => cat.toLowerCase().includes(q)))
        );
      }).slice(0, 24);

      // Fetch the files API for each match to get the actual diffuse map URL
      const fileResults = await Promise.allSettled(
        matches.map(async k => {
          const fRes = await fetch(`https://api.polyhaven.com/files/${k}`);
          if (!fRes.ok) return null;
          const fData = await fRes.json();
          // Find the Diffuse map (or Color fallback)
          const diffMap = fData["Diffuse"] || fData["Color"] || null;
          let thumbUrl = "";
          let textureUrl = "";
          if (diffMap) {
            const res1k = diffMap["1k"];
            const res2k = diffMap["2k"] || diffMap["1k"];
            if (res1k && res1k.jpg) thumbUrl = res1k.jpg.url;
            else if (res1k && res1k.png) thumbUrl = res1k.png.url;
            if (res2k && res2k.jpg) textureUrl = res2k.jpg.url;
            else if (res2k && res2k.png) textureUrl = res2k.png.url;
          }
          if (!thumbUrl) return null;
          return {
            id: "ph_" + k,
            name: { he: data[k].name || k.replace(/_/g, " "), en: data[k].name || k.replace(/_/g, " ") },
            cat: "online",
            source: "PolyHaven",
            sourceColor: "#8b5cf6",
            thumbUrl: thumbUrl,
            textureUrl: textureUrl || thumbUrl,
            scale: 200,
            isOnline: true
          };
        })
      );

      return fileResults
        .filter(r => r.status === "fulfilled" && r.value)
        .map(r => r.value);
    })()
  );

  // ---- 2. ambientCG ----
  // Search API with real previewImage data for flat color thumbnails
  for (const q of searchTerms) {
    fetchPromises.push(
      (async () => {
        const encQ = encodeURIComponent(q);
        const res = await fetch(`https://ambientcg.com/api/v2/full_json?type=Material&limit=24&sort=Popular&q=${encQ}&include=previewData`);
        if (!res.ok) throw new Error("ambientCG error " + res.status);
        const data = await res.json();
        if (!data.foundAssets || !data.foundAssets.length) return [];

        return data.foundAssets.map(item => {
          const id = item.assetId;
          const displayName = item.displayName || id.replace(/([A-Z])/g, " $1").replace(/(\d+)/g, " $1").trim();

          // Use flat color preview from previewImage, not sphere
          const thumb = (item.previewImage && item.previewImage["256-PNG"])
            ? item.previewImage["256-PNG"]
            : `https://acg-media.struffelproductions.com/file/ambientCG-Web/media/thumbnail/256-PNG/${id}.png`;

          // For applying: use the surface-preview color map (flat, high quality)
          const textureUrl = `https://acg-media.struffelproductions.com/file/ambientCG-Web/media/surface-preview/${id}/${id}_SQ_Color.jpg`;

          return {
            id: "acg_" + id,
            name: { he: displayName, en: displayName },
            cat: "online",
            source: "ambientCG",
            sourceColor: "#10b981",
            thumbUrl: thumb,
            textureUrl: textureUrl,
            scale: 200,
            isOnline: true
          };
        });
      })()
    );
  }

  const settled = await Promise.allSettled(fetchPromises);
  
  settled.forEach(result => {
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      results.push(...result.value);
    } else if (result.status === "rejected") {
      console.warn("API search failed:", result.reason);
    }
  });

  const uniqueResults = [];
  const seenIds = new Set();
  for (const item of results) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      uniqueResults.push(item);
    }
  }

  searchCache.set(cacheKey, { results: uniqueResults, timestamp: Date.now() });

  return uniqueResults;
}

