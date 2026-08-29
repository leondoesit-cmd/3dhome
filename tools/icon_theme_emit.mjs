// Shared emit/load for the generated icon-theme modules.
//
// Both generators (build_icon_theme_assets.mjs, which maps the Iconify
// collections, and generate_icon_themes.mjs, which derives the stylised
// languages from them) write the same shape, and the second one reads what the
// first produced. That shape lives here so it is described once.
//
// The ten themes are ~117 KB of SVG each. Emitting them as one module made the
// browser download all ten to draw one, so each theme is its own module under
// js/icon_themes/ and js/icon_theme_assets.js is only the index: the semantic
// name list, the theme ids, and a literal-specifier loader per theme (literal
// so tools/link_check.mjs can still follow the dynamic import).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const THEMES_DIR = ["js", "icon_themes"];

function themeFile(repo, id) {
  return path.join(repo, ...THEMES_DIR, id + ".js");
}

export async function writeIconThemes(repo, semantic, themes, banner) {
  const ids = Object.keys(themes);
  await mkdir(path.join(repo, ...THEMES_DIR), { recursive: true });
  for (const id of ids) {
    await writeFile(
      themeFile(repo, id),
      banner +
        `// The "${id}" icon language. Loaded on demand by js/icon_theme_assets.js.\n` +
        `export default ${JSON.stringify(themes[id])};\n`,
    );
  }
  const loaders = ids
    .map((id) => `  ${JSON.stringify(id)}: function () { return import("./icon_themes/${id}.js"); },`)
    .join("\n");
  await writeFile(
    path.join(repo, "js", "icon_theme_assets.js"),
    banner +
      `// Index only — every theme's artwork lives in js/icon_themes/<id>.js and is\n` +
      `// fetched on demand. ICON_THEME_ASSETS holds the themes loaded so far, so\n` +
      `// reads of a loaded theme stay synchronous; loadIconTheme() fills it.\n` +
      `export const ICON_SEMANTIC_NAMES = ${JSON.stringify(semantic)};\n` +
      `export const ICON_THEME_IDS = ${JSON.stringify(ids)};\n` +
      `export const ICON_THEME_ASSETS = {};\n` +
      `const LOADERS = {\n${loaders}\n};\n` +
      `const pending = {};\n` +
      `export function isIconThemeLoaded(id) {\n` +
      `  return !!ICON_THEME_ASSETS[id];\n` +
      `}\n` +
      `export function loadIconTheme(id) {\n` +
      `  if (ICON_THEME_ASSETS[id]) return Promise.resolve(ICON_THEME_ASSETS[id]);\n` +
      `  if (!LOADERS[id]) return Promise.reject(new Error("unknown icon theme: " + id));\n` +
      `  if (!pending[id])\n` +
      `    pending[id] = LOADERS[id]().then(function (mod) {\n` +
      `      ICON_THEME_ASSETS[id] = mod.default;\n` +
      `      return mod.default;\n` +
      `    }, function (err) {\n` +
      `      delete pending[id];\n` +
      `      throw err;\n` +
      `    });\n` +
      `  return pending[id];\n` +
      `}\n`,
  );
}

// The inverse: what generate_icon_themes.mjs needs to build on top of what
// build_icon_theme_assets.mjs produced.
export async function readIconThemes(repo) {
  const index = await readFile(path.join(repo, "js", "icon_theme_assets.js"), "utf8");
  const semanticMatch = index.match(/export const ICON_SEMANTIC_NAMES = (\[[\s\S]*?\]);/);
  const idsMatch = index.match(/export const ICON_THEME_IDS = (\[[\s\S]*?\]);/);
  if (!semanticMatch || !idsMatch) throw new Error("Could not parse js/icon_theme_assets.js");
  const semantic = JSON.parse(semanticMatch[1]);
  const themes = {};
  for (const id of JSON.parse(idsMatch[1])) {
    const src = await readFile(themeFile(repo, id), "utf8");
    const body = src.match(/export default ([\s\S]*);\n$/);
    if (!body) throw new Error("Could not parse js/icon_themes/" + id + ".js");
    themes[id] = JSON.parse(body[1]);
  }
  return { semantic, themes };
}
