# Vendored dependencies

Everything the app loads is served from this origin. **Nothing here may be
replaced with a CDN link** — the app has to boot with the network unplugged
(demo venues have unreliable wifi, and a failed `three` import is a blank page,
not a degraded one).

| Path | Package | Version | Source |
|---|---|---|---|
| `three/three.module.js` | three | 0.128.0 | `cdn.jsdelivr.net/npm/three@0.128.0/build/` |
| `three/addons/**` | three examples/jsm | 0.128.0 | `cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/` |
| `cannon-es.js` | cannon-es | 0.20.0 | `cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/` |
| `rapier/` | @dimforge/rapier3d-compat | 0.20.0 | npm `@dimforge/rapier3d-compat` (inlined WASM) |
| `leaflet/` | leaflet | 1.9.4 | `unpkg.com/leaflet@1.9.4/dist/` |
| `pdfjs/` | pdfjs-dist | 6.2.108 | npm `pdfjs-dist` build + worker |
| `phosphor/` | @phosphor-icons/web | 2.1.2 | npm package (`regular` first-paint fallback) |
| `../js/icon_theme_assets.js` | Lucide, Material Symbols, MDI, Tabler, Hugeicons | pinned in `icon-themes/LICENSES.md` | generated local SVG subset |
| `fonts/` | Inter, Rubik (400/500/600) | — | Google Fonts css2 |

`three` and `cannon-es` resolve through the import map at the bottom of
`index.html`. Rapier is imported by relative path from `js/physics/native.js`
(`vendor/rapier/rapier.mjs`, WASM inlined). The rest are plain `<link>`/`<script>`
tags in `<head>`.

## Notes per package

**three addons** — only the six the app imports, plus their transitive deps
(`Pass`, `MaskPass`, `CopyShader`, `SSAOShader`, `SimplexNoise`). They import
the bare specifier `three`, which the import map resolves to the local build.
Adding a new addon means fetching its transitive imports too; check with:

```bash
grep -rho "from ['\"][^'\"]*['\"]" vendor/three/addons | sort -u
```

**Rapier** — `@dimforge/rapier3d-compat` 0.20.0, single `rapier.mjs` with the
WASM binary inlined as base64. Call `init()` once before `new World`. Do not
replace this with the CDN/skypack build; destruction mode must work offline.

**icons** — Phosphor regular provides a local first-paint fallback and the
stable semantic `ph-*` class names used by the app. At startup those semantic
names are rendered as SVG from five independent design systems bundled in
`js/icon_theme_assets.js`. The generated subset contains only icons used by
ModelForge; its source versions and licenses are recorded in
`icon-themes/LICENSES.md`. No icon is fetched at runtime.

**fonts** — `fonts.css` was fetched with a desktop Chrome UA so Google served
woff2, then every `fonts.gstatic.com` URL was rewritten to `./files/`. All
subsets are included (latin, latin-ext, hebrew, cyrillic, greek, …) because the
UI ships Hebrew and English and users type arbitrary room names.

**leaflet** — `leaflet.css` references `images/` for the layers and marker
icons; those are vendored alongside it. Leaflet also derives marker icon paths
at runtime from the stylesheet location, so keep `images/` next to the css.

**PDF.js** — the minified display build and worker are loaded lazily by the
manual blueprint tracer. Both files and the upstream license are kept together
under `pdfjs/`; no viewer UI or network-loaded fonts are required to rasterize
the selected page into the local plan underlay.

## Refreshing

Re-download from the source column above, keep the same relative layout, then
verify nothing points outward:

```bash
grep -rn "https://\|http://" index.html css/styles.css vendor/fonts/fonts.css vendor/phosphor/style.css
```

That must print nothing. Then load the app with devtools offline to confirm.
