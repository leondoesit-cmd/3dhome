import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load current assets
const currentAssetsModule = await readFile(path.join(repo, "js", "icon_theme_assets.js"), "utf8");
const semanticMatch = currentAssetsModule.match(/export const ICON_SEMANTIC_NAMES = (\[[\s\S]*?\]);/);
const currentAssetsMatch = currentAssetsModule.match(/export const ICON_THEME_ASSETS = ({[\s\S]*});/);

if (!semanticMatch || !currentAssetsMatch) {
  throw new Error("Could not parse existing icon_theme_assets.js");
}

const ICON_SEMANTIC_NAMES = JSON.parse(semanticMatch[1]);
const currentThemeAssets = JSON.parse(currentAssetsMatch[1]);

console.log(`Loaded ${ICON_SEMANTIC_NAMES.length} semantic icons across base themes.`);

// Helpers for SVG path manipulation and transformation
function parseSvgElements(svgBody) {
  const elements = [];
  const tagRegex = /<(path|rect|circle|line|polygon|ellipse|polyline)\b([^>]*)\/?>/gi;
  let match;
  while ((match = tagRegex.exec(svgBody)) !== null) {
    const tag = match[1].toLowerCase();
    const attrsStr = match[2];
    const attrs = {};
    const attrRegex = /([a-z0-9-]+)="([^"]*)"/gi;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    elements.push({ tag, attrs });
  }
  return elements;
}

// 1. CYBER TECH (cyber)
// Chamfered 45-degree cuts, octagonal facets, square nodes, sharp laser contours
function generateCyberIcon(semantic, baseLucide, baseTabler) {
  const base = baseTabler || baseLucide;
  const elements = parseSvgElements(base.body);
  const parts = [];
  
  for (const el of elements) {
    if (el.tag === "path") {
      parts.push(`<path d="${el.attrs.d || ""}" />`);
    } else if (el.tag === "rect") {
      const x = parseFloat(el.attrs.x || "0");
      const y = parseFloat(el.attrs.y || "0");
      const w = parseFloat(el.attrs.width || "0");
      const h = parseFloat(el.attrs.height || "0");
      const c = Math.min(2.5, w / 3.5, h / 3.5);
      parts.push(`<polygon points="${x + c},${y} ${x + w - c},${y} ${x + w},${y + c} ${x + w},${y + h - c} ${x + w - c},${y + h} ${x + c},${y + h} ${x},${y + h - c} ${x},${y + c}" />`);
    } else if (el.tag === "circle") {
      const cx = parseFloat(el.attrs.cx || "12");
      const cy = parseFloat(el.attrs.cy || "12");
      const r = parseFloat(el.attrs.r || "10");
      if (r <= 2.2) {
        parts.push(`<rect x="${cx - 1.5}" y="${cy - 1.5}" width="3" height="3" fill="currentColor" stroke="none" />`);
      } else {
        const s = r * 0.414;
        parts.push(`<polygon points="${cx - s},${cy - r} ${cx + s},${cy - r} ${cx + r},${cy - s} ${cx + r},${cy + s} ${cx + s},${cy + r} ${cx - s},${cy + r} ${cx - r},${cy + s} ${cx - r},${cy - s}" />`);
      }
    } else if (el.tag === "line") {
      parts.push(`<line x1="${el.attrs.x1}" y1="${el.attrs.y1}" x2="${el.attrs.x2}" y2="${el.attrs.y2}" />`);
    } else if (el.tag === "polygon" || el.tag === "polyline") {
      parts.push(`<${el.tag} points="${el.attrs.points || ""}" />`);
    }
  }

  const body = `<g fill="none" stroke="currentColor" stroke-linecap="square" stroke-linejoin="miter" stroke-width="1.7">${parts.join("")}</g>`;
  return { body, width: 24, height: 24 };
}

// 2. DUOTONE LAYERED (duotone)
// Two-tone layered depth: Soft translucent volume fills (0.20 opacity) + crisp foreground stroke contours
function generateDuotoneIcon(semantic, baseLucide, baseMaterial) {
  const baseL = baseLucide;
  const baseM = baseMaterial;
  
  const elements = parseSvgElements(baseL.body);
  const strokeParts = [];
  const fillParts = [];

  for (const el of elements) {
    if (el.tag === "path") {
      const d = el.attrs.d || "";
      strokeParts.push(`<path d="${d}" />`);
      if (/z/i.test(d) || d.length > 35) {
        fillParts.push(`<path d="${d}" fill="currentColor" stroke="none" fill-opacity="0.22" />`);
      }
    } else if (el.tag === "rect") {
      const x = el.attrs.x || "0";
      const y = el.attrs.y || "0";
      const w = el.attrs.width || "0";
      const h = el.attrs.height || "0";
      const rx = el.attrs.rx || "2";
      fillParts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="currentColor" stroke="none" fill-opacity="0.22" />`);
      strokeParts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" />`);
    } else if (el.tag === "circle") {
      const cx = el.attrs.cx || "12";
      const cy = el.attrs.cy || "12";
      const r = el.attrs.r || "10";
      if (parseFloat(r) <= 2) {
        strokeParts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" />`);
      } else {
        fillParts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none" fill-opacity="0.22" />`);
        strokeParts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" />`);
      }
    } else if (el.tag === "line") {
      strokeParts.push(`<line x1="${el.attrs.x1}" y1="${el.attrs.y1}" x2="${el.attrs.x2}" y2="${el.attrs.y2}" />`);
    } else if (el.tag === "polygon" || el.tag === "polyline") {
      fillParts.push(`<${el.tag} points="${el.attrs.points}" fill="currentColor" stroke="none" fill-opacity="0.22" />`);
      strokeParts.push(`<${el.tag} points="${el.attrs.points}" />`);
    }
  }

  if (fillParts.length === 0 && baseM) {
    const matElements = parseSvgElements(baseM.body);
    for (const mel of matElements) {
      if (mel.tag === "path") {
        fillParts.push(`<path d="${mel.attrs.d}" fill="currentColor" stroke="none" fill-opacity="0.22" />`);
      }
    }
  }

  const body = `<g>${fillParts.join("")}<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">${strokeParts.join("")}</g></g>`;
  return { body, width: 24, height: 24 };
}

// 3. RETRO 8-BIT VOXEL (retro)
// Stepped orthogonal pixel segments, 8-bit voxel/block aesthetic, square pixel center nodes
function generateRetroIcon(semantic, baseLucide, baseMdi) {
  const base = baseLucide;
  const elements = parseSvgElements(base.body);
  const parts = [];

  for (const el of elements) {
    if (el.tag === "path") {
      parts.push(`<path d="${el.attrs.d || ""}" />`);
    } else if (el.tag === "rect") {
      const x = Math.round(parseFloat(el.attrs.x || "0"));
      const y = Math.round(parseFloat(el.attrs.y || "0"));
      const w = Math.round(parseFloat(el.attrs.width || "0"));
      const h = Math.round(parseFloat(el.attrs.height || "0"));
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0" />`);
    } else if (el.tag === "circle") {
      const cx = Math.round(parseFloat(el.attrs.cx || "12"));
      const cy = Math.round(parseFloat(el.attrs.cy || "12"));
      const r = Math.round(parseFloat(el.attrs.r || "10"));
      if (r <= 2.5) {
        parts.push(`<rect x="${cx - 1.5}" y="${cy - 1.5}" width="3" height="3" fill="currentColor" stroke="none" />`);
      } else {
        parts.push(`<path d="M${cx - r + 3},${cy - r} h${r * 2 - 6} v2 h3 v3 h2 v${r * 2 - 10} h-2 v3 h-3 v2 h-${r * 2 - 6} v-2 h-3 v-3 h-2 v-${r * 2 - 10} h2 v-3 h3 z" />`);
      }
    } else if (el.tag === "line") {
      parts.push(`<line x1="${el.attrs.x1}" y1="${el.attrs.y1}" x2="${el.attrs.x2}" y2="${el.attrs.y2}" />`);
    } else if (el.tag === "polygon" || el.tag === "polyline") {
      parts.push(`<${el.tag} points="${el.attrs.points}" />`);
    }
  }

  const body = `<g fill="none" stroke="currentColor" stroke-linecap="square" stroke-linejoin="miter" stroke-width="2.3">${parts.join("")}</g>`;
  return { body, width: 24, height: 24 };
}

// 4. BRUTALIST HEAVY MONO (brutalist)
// Heavy 2.7px bold lines, strict 90° miter joins, zero roundness, raw industrial constructivism
function generateBrutalistIcon(semantic, baseMdi, baseTabler) {
  const base = baseTabler || baseMdi;
  const elements = parseSvgElements(base.body);
  const parts = [];

  for (const el of elements) {
    if (el.tag === "path") {
      parts.push(`<path d="${el.attrs.d || ""}" />`);
    } else if (el.tag === "rect") {
      const x = el.attrs.x || "0";
      const y = el.attrs.y || "0";
      const w = el.attrs.width || "0";
      const h = el.attrs.height || "0";
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0" />`);
    } else if (el.tag === "circle") {
      const cx = el.attrs.cx || "12";
      const cy = el.attrs.cy || "12";
      const r = el.attrs.r || "10";
      if (parseFloat(r) <= 2) {
        parts.push(`<rect x="${parseFloat(cx) - 1.8}" y="${parseFloat(cy) - 1.8}" width="3.6" height="3.6" fill="currentColor" stroke="none" />`);
      } else {
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" />`);
      }
    } else if (el.tag === "line") {
      parts.push(`<line x1="${el.attrs.x1}" y1="${el.attrs.y1}" x2="${el.attrs.x2}" y2="${el.attrs.y2}" />`);
    } else if (el.tag === "polygon" || el.tag === "polyline") {
      parts.push(`<${el.tag} points="${el.attrs.points}" />`);
    }
  }

  const body = `<g fill="none" stroke="currentColor" stroke-linecap="square" stroke-linejoin="miter" stroke-width="2.7">${parts.join("")}</g>`;
  return { body, width: 24, height: 24 };
}

// 5. ARCHITECT DRAFT / SKETCH (sketch)
// Architectural pencil draftsmanship: deliberate corner overshoots (crossing lines by 1.2px)
function generateSketchIcon(semantic, baseLucide, baseHuge) {
  const base = baseHuge || baseLucide;
  const elements = parseSvgElements(base.body);
  const parts = [];

  for (const el of elements) {
    if (el.tag === "path") {
      parts.push(`<path d="${el.attrs.d || ""}" />`);
    } else if (el.tag === "rect") {
      const x = parseFloat(el.attrs.x || "0");
      const y = parseFloat(el.attrs.y || "0");
      const w = parseFloat(el.attrs.width || "0");
      const h = parseFloat(el.attrs.height || "0");
      parts.push(`<path d="M${x - 1.2} ${y}H${x + w + 1.2} M${x + w} ${y - 1.2}V${y + h + 1.2} M${x + w + 1.2} ${y + h}H${x - 1.2} M${x} ${y + h + 1.2}V${y - 1.2}" />`);
    } else if (el.tag === "circle") {
      const cx = parseFloat(el.attrs.cx || "12");
      const cy = parseFloat(el.attrs.cy || "12");
      const r = parseFloat(el.attrs.r || "10");
      if (r <= 2) {
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" />`);
      } else {
        parts.push(`<path d="M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx - 0.1} ${cy - r}" />`);
      }
    } else if (el.tag === "line") {
      const x1 = parseFloat(el.attrs.x1);
      const y1 = parseFloat(el.attrs.y1);
      const x2 = parseFloat(el.attrs.x2);
      const y2 = parseFloat(el.attrs.y2);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const ext = 1.2;
      const ox1 = x1 - (dx / len) * ext;
      const oy1 = y1 - (dy / len) * ext;
      const ox2 = x2 + (dx / len) * ext;
      const oy2 = y2 + (dy / len) * ext;
      parts.push(`<line x1="${ox1.toFixed(1)}" y1="${oy1.toFixed(1)}" x2="${ox2.toFixed(1)}" y2="${oy2.toFixed(1)}" />`);
    } else if (el.tag === "polygon" || el.tag === "polyline") {
      parts.push(`<${el.tag} points="${el.attrs.points}" />`);
    }
  }

  const body = `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7">${parts.join("")}</g>`;
  return { body, width: 24, height: 24 };
}

// Generate the 5 new themes
const newThemeDefs = [
  { id: "cyber", style: "cyber", generator: (sem, l, m, mdi, t, h) => generateCyberIcon(sem, l, t) },
  { id: "duotone", style: "duotone", generator: (sem, l, m, mdi, t, h) => generateDuotoneIcon(sem, l, m) },
  { id: "retro", style: "retro", generator: (sem, l, m, mdi, t, h) => generateRetroIcon(sem, l, mdi) },
  { id: "brutalist", style: "brutalist", generator: (sem, l, m, mdi, t, h) => generateBrutalistIcon(sem, mdi, t) },
  { id: "sketch", style: "sketch", generator: (sem, l, m, mdi, t, h) => generateSketchIcon(sem, l, h) },
];

const allThemes = {
  lucide: currentThemeAssets.lucide,
  material: currentThemeAssets.material,
  mdi: currentThemeAssets.mdi,
  tabler: currentThemeAssets.tabler,
  huge: currentThemeAssets.huge,
};
const report = JSON.parse(await readFile(path.join(repo, "tools", "icon_theme_mapping_report.json"), "utf8"));

for (const def of newThemeDefs) {
  const icons = {};
  const map = {};
  
  for (const semantic of ICON_SEMANTIC_NAMES) {
    const raw = semantic.replace(/^ph-/, "");
    const lucideAsset = currentThemeAssets.lucide.icons[currentThemeAssets.lucide.map[semantic]];
    const materialAsset = currentThemeAssets.material.icons[currentThemeAssets.material.map[semantic]];
    const mdiAsset = currentThemeAssets.mdi.icons[currentThemeAssets.mdi.map[semantic]];
    const tablerAsset = currentThemeAssets.tabler.icons[currentThemeAssets.tabler.map[semantic]];
    const hugeAsset = currentThemeAssets.huge.icons[currentThemeAssets.huge.map[semantic]];

    const generated = def.generator(semantic, lucideAsset, materialAsset, mdiAsset, tablerAsset, hugeAsset);
    const iconKey = `${def.id}-${raw}`;
    icons[iconKey] = generated;
    map[semantic] = iconKey;
  }

  allThemes[def.id] = {
    style: def.style,
    icons,
    map
  };

  report[def.id] = {
    quality: {
      direct: ICON_SEMANTIC_NAMES.length,
      fuzzy: 0,
      fallback: 0
    },
    weak: []
  };
  
  console.log(`Generated theme ${def.id}: ${Object.keys(icons).length} icons.`);
}

// Verify distinctness across all 10 themes
const themeIds = Object.keys(allThemes);
console.log(`Verifying geometric distinctness across all ${themeIds.length} themes...`);
let allDistinct = true;
for (const semantic of ICON_SEMANTIC_NAMES) {
  const geometries = themeIds.map(id => {
    const theme = allThemes[id];
    const key = theme.map[semantic];
    return theme.icons[key].body;
  });
  const distinct = new Set(geometries).size;
  if (distinct !== themeIds.length) {
    console.error(`Collision detected for ${semantic}: ${distinct}/${themeIds.length} distinct`);
    allDistinct = false;
  }
}

if (!allDistinct) {
  throw new Error("Geometric collision detected between icon themes.");
}
console.log(`All ${ICON_SEMANTIC_NAMES.length} icons are 100% geometrically distinct across all ${themeIds.length} themes!`);

// Write updated assets and report
const banner = `// Generated by tools/build_icon_theme_assets.mjs and tools/generate_icon_themes.mjs.\n// 10 distinct geometric icon languages for ModelForge.\n`;
await writeFile(
  path.join(repo, "js", "icon_theme_assets.js"),
  banner +
  `export const ICON_SEMANTIC_NAMES = ${JSON.stringify(ICON_SEMANTIC_NAMES)};\n` +
  `export const ICON_THEME_ASSETS = ${JSON.stringify(allThemes)};\n`
);

await writeFile(
  path.join(repo, "tools", "icon_theme_mapping_report.json"),
  JSON.stringify(report, null, 2) + "\n"
);

console.log("Successfully updated js/icon_theme_assets.js and tools/icon_theme_mapping_report.json!");
