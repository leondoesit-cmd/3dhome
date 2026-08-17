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
| `phosphor/` | @phosphor-icons/web | 2.1.2 | `cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/` |
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

**phosphor** — the app only uses the `regular` weight, so only that stylesheet
and its `woff2`/`woff` are here. The upstream `src/index.js` entry point is
deliberately **not** vendored: it injects all six weight stylesheets from a CDN
at runtime, which is exactly what this directory exists to avoid. The `ttf` and
`svg` fallbacks were dropped from `style.css` (woff2+woff covers every target
browser, and the svg was a 404 waiting to happen).

**fonts** — `fonts.css` was fetched with a desktop Chrome UA so Google served
woff2, then every `fonts.gstatic.com` URL was rewritten to `./files/`. All
subsets are included (latin, latin-ext, hebrew, cyrillic, greek, …) because the
UI ships Hebrew and English and users type arbitrary room names.

**leaflet** — `leaflet.css` references `images/` for the layers and marker
icons; those are vendored alongside it. Leaflet also derives marker icon paths
at runtime from the stylesheet location, so keep `images/` next to the css.

## Refreshing

Re-download from the source column above, keep the same relative layout, then
verify nothing points outward:

```bash
grep -rn "https://\|http://" index.html css/styles.css vendor/fonts/fonts.css vendor/phosphor/style.css
```

That must print nothing. Then load the app with devtools offline to confirm.
