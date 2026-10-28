# ModelForge desktop (Tauri 2) — first C2 slice

The web app, unchanged, inside the operating system's webview. The reasons are in
[docs/rust-webgpu-assessment-2026-10-26.md](../docs/rust-webgpu-assessment-2026-10-26.md).
Rust serves the app from disk and handles machine-local model backups. The web
app and its backup client are unchanged.

**How it serves the app.**
- One custom scheme, `mf`, serves both the app's files and `/api/*`.
- So the app stays same-origin, and its relative `fetch("/api/...")` calls work
  unchanged.
- No TCP port is opened, and the app gets no Tauri IPC (`capabilities/default.json`
  grants nothing).

**What it serves.**
- The rules mirror the relay: private names are refused before and after the path is
  canonicalized.
- Only the top-level entries in `server/public_paths.json` are served (the same file
  the relay reads).

**The desktop origin.**
- Windows (WebView2): `http://mf.localhost`
- macOS / Linux (WebKit): `mf://localhost`
- It keys IndexedDB and localStorage, so **never change the scheme name once a build
  has shipped**.

## This slice

- Every `/api` request checks the scheme authority and any Host header. An Origin
  header must exactly match the platform's desktop origin above; every method
  other than GET requires one. Rejections return 403 JSON. Static GETs still work
  without Origin. Wry restores WebView2 request URIs to `mf://localhost` internally.
- The main webview's navigation hook allows only `mf://localhost` and
  `http://mf.localhost`, with no credentials or nondefault port. New windows are
  refused. External HTTP(S) links do not open at all; a later slice can add the
  Tauri opener plugin with an explicit HTTP(S) policy.
- Eight std worker threads handle scheme requests, with a 256-request queue and
  a 192 MiB budget for bodies retained across queued/running requests. Overload
  returns 503 JSON. POST bodies are capped at 96 MiB for `/api/model-backup` and
  1 MiB for other APIs (413 JSON); other API methods also have a 1 MiB body cap.
  Tauri/Wry supplies an already buffered body, so these bounds apply at handler
  admission, after the webview has read it.
- `/api/model-backup` supports list, latest-record read with attachments, and
  batches of 1–500 records. `/api/ping` advertises `model-backup`.
- Backups live in `app.path().app_data_dir()/model-backups/<key>/`: `latest.json`,
  timestamp/revision versions, `attachments.json`, and `meta.json`. Metadata has
  key, name, revision, savedAt, bytes, SHA-256, version count and attachment count.
  Saves use temporary files plus rename, retain the newest 20 versions, skip
  duplicate content, and refuse to replace a higher revision with a stale one.
  Store operations are serialized to keep records and attachments consistent.
- The spike echo route is removed. A handler unit test checks a 20 MiB model POST
  and restores the entire payload without a test-only HTTP endpoint.

**Compatibility with `server/model_backup.mjs`.** The storage location is app data
instead of the relay's configurable folder. The JSON shapes, key regex, attachment
rules, stale/duplicate results and version retention follow the relay. Differences:

- Authorization is stricter, oversize requests return 413 instead of the relay's
  400, and bounded admission can return 503, as required for desktop isolation.
- Symlinked backup entries and directories escaping the store are refused to
  prevent local filesystem indirection from bypassing key validation.
- `serde_json` preserves object order, but number formatting can differ from
  `JSON.stringify`; bytes and SHA-256 always describe the actual stored JSON.
  Its numeric range, Unicode and default nesting limits apply. Name truncation
  keeps whole Unicode scalars within 200 UTF-16 units, avoiding JS's possible
  split surrogate (the Rust parser rejects unpaired surrogates).
  These differences keep the Rust JSON representation valid without a JS engine.
- Temporary files are exclusively created, synced, and cleaned up on failure;
  atomicity is per file, as in the relay, rather than a transaction across files.

`sha2` supplies SHA-256. HTTPS material downloads use blocking `reqwest` with
`rustls`, the ring crypto provider and `rustls-platform-verifier` for OS trust-store
certificate verification. No native-tls or aws-lc provider is enabled. Dates,
worker queues and atomic file writes use std. `serde_json` enables its existing
`preserve_order` feature.

## Rust tests and build

```bash
cd desktop/src-tauri
cargo test --offline
cargo build --offline
```

Tests use disposable directories under `desktop/src-tauri/target/test-data`, never
the real app data. They cover origins/authority, navigation, exact body-cap
boundaries, large POST integrity, key/traversal validation, two-revision backup
restore, newest-first listing, hashes, duplicate/stale saves, attachments, batch
limits and keep-N pruning. No Node server or GPU is needed for these tests.
HTTPS tests cover origin enablement, URL encoding, response policy, bounded
streaming and failed handshakes against plain local TCP listeners without leaving
cache objects. The optional online smoke test checks OS-trusted TLS, HTML and the
body cap (Cargo stays offline; the test itself needs internet):

```bash
cargo test --offline https_online_example_html_and_cap -- --ignored
```

## Run

```bash
cargo run --manifest-path desktop/src-tauri/Cargo.toml
```

**Debug builds** serve this checkout, so a reload picks up edits. **Release builds**
serve `app.path().resource_dir()/web`. The bundle resource map
`"../web/": "web/"` preserves the contents under that directory, so
`desktop/web/index.html` becomes `resource_dir()/web/index.html`.

## Release build

Run from the repository root with real Git LFS objects fetched. The zero-dependency
`tools/desktop_bundle.mjs` regenerates `desktop/material-manifest.json` and replaces
the generated, ignored `desktop/web/` directory with the entries in
`server/public_paths.json`. It skips dot entries, private/8.3 names and
`assets/materials`, refuses symlinks and Git LFS pointers, and reports sorted file
counts and byte sizes. Materials download on first use from the configured origin
and must match the compiled manifest's sizes and SHA-256 hashes.

Set both release endpoints **before compiling**: `MF_RELAY_URL` and
`MF_MATERIAL_ORIGIN` are baked in through Rust's `option_env!`. The relay URL also
allows a startup environment override; the material origin is build-time only.
Changing either baked-in value requires rebuilding. The relay must allow the two
desktop origins in `HOME3D_ALLOWED_ORIGINS`, and the material origin must serve the
real LFS bytes described by the manifest.

Windows Command Prompt (`cmd.exe`):

```bat
set MF_RELAY_URL=wss://modelforge-3dhome.onrender.com
set MF_MATERIAL_ORIGIN=https://modelforge-3dhome.onrender.com
node tools/desktop_bundle.mjs --stage-release
cd desktop\src-tauri
cargo build --release --offline
```

POSIX shell:

```sh
export MF_RELAY_URL=wss://modelforge-3dhome.onrender.com
export MF_MATERIAL_ORIGIN=https://modelforge-3dhome.onrender.com
node tools/desktop_bundle.mjs --stage-release
cd desktop/src-tauri
cargo build --release --offline
```

For a quick local run of the non-bundled release executable, its resource directory
is the executable directory: `--stage-release` additionally replaces
`desktop/src-tauri/target/release/web` with the generated bundle. Run
`desktop/src-tauri/target/release/modelforge-desktop.exe` on Windows (omit `.exe`
on POSIX). The flag assumes Cargo's default target directory and native target;
custom target directories/triples need `web/` staged beside their executable.
Tauri's build helper also copies the configured resources at build time.

When `tauri-cli` is already available, use `cargo tauri build` from
`desktop/src-tauri` after the same environment settings and bundle command, in
place of `cargo build --release --offline`, to produce the configured NSIS
installer on Windows under `target/release/bundle/nsis/`. Plain `cargo build`
produces an executable, not an installer. This checkout does not install
`tauri-cli`; other platforms need their own bundle targets and release validation.

`npm run desktop:bundle` is an alias for the bundle command; append
`-- --stage-release` to stage the local release copy too. Re-run it whenever web
files or materials change, before compiling. A clean-machine install and an
offline save/open/export round trip remain the release gates below.

**Multiplayer** needs the relay's address. The app's own origin serves files, not
WebSockets.
- Set it with `MF_RELAY_URL` (read at startup, or baked in at build time).
- `js/net.js` reads it from `window.__MF_DESKTOP__.relayUrl`.
- The relay must accept the desktop origin, for example
  `HOME3D_ALLOWED_ORIGINS=http://mf.localhost,mf://localhost`.

## Check it

WebView2 exposes DevTools when the debug build is started with the variable below.
Never ship a build that sets it.

```bash
set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333
cargo run --manifest-path desktop/src-tauri/Cargo.toml
```

The historical `tools/desktop_check.mjs` still probes the removed spike echo
endpoint; its `post20MB` check needs a separate update before that whole harness
can pass. Use the Rust tests above for body integrity and backup behavior, and
the manual checklist below for the webview.

**Performance against Chrome.**
1. Start the app with the same flags `tools/gpu_bench.mjs` gives Chrome: `--disable-gpu-vsync`,
   `--disable-frame-rate-limit`, and the occlusion and backgrounding switches.
2. Then run:

   ```bash
   node tools/gpu_bench.mjs --attach=http://127.0.0.1:9333 --url=http://mf.localhost/ --backends=webgpu
   ```

## Spike results (Windows 11, RTX 5070 Ti, WebView2 156, 2026-10-27)

| Exit criterion | Result |
|---|---|
| Boots with no errors; WebGPU adapter | Boots with zero console errors. Origin `http://mf.localhost`, secure context. Backend **WebGPU** (nvidia / blackwell). |
| CAD kernel, Rapier, Tesseract load | OpenCascade on the main thread (3.2 s, 10×20×30 box = 6000) and in a module worker (2.6 s). Rapier 0.20.0. Tesseract reads "42". |
| Large POST bodies reach Rust intact | 20 MB in 0.74 s, every byte verified. |
| IndexedDB survives a restart | A marker written before a graceful close reads back after relaunch. |
| WebSocket to a relay | Connects through the injected `relayUrl` (local relay with the desktop origin allowed). |
| Planner orbit within ±15% of Chrome | Two alternating rounds each, median fps: **day** Chrome 165.3 vs WebView2 148.4 (−10%); **night** 161.3 vs 151.1 (−6%). Render CPU p50 4.3 vs 4.5 ms. |
| Size and cold start | Release executable 3.0 MB. Launch → page 349–486 ms; launch → app booted 871–1,040 ms (3 runs). |

**Estimated installer size** (gzip; NSIS LZMA would be a little smaller):

| Contents | Size |
|---|---|
| With the PBR materials | ~316 MB |
| Without the materials | ~76 MB |

The difference is `assets/materials`: 240 MB of already-compressed WebP.

**Not yet covered**
- **The pixel-exact GPU suites against WebView2.** They depend on the test harness's
  own server instrumentation, so running them needs an attach mode in
  `tools/browser_harness.mjs` that serves that instrumentation through this scheme.
  This is part of the port.
- **macOS.** It needs the manual checklist below on a Mac.

## macOS checklist (manual: WKWebView has no DevTools protocol)

Run `cargo run --manifest-path desktop/src-tauri/Cargo.toml` and check each item.
Safari's Web Inspector attaches to debug builds.

- [ ] `navigator.gpu` present? (macOS 26+ expected.) If not, the planner and modeler
  must still render on the WebGL2 fallback.
- [ ] The app boots with no console errors.
- [ ] The CAD kernel loads in a worker: open the modeler and build a box.
- [ ] Tesseract and Rapier load.
- [ ] Save a model to the library, then restore it and its exact-CAD attachments
  from the disk backups panel after clearing browser storage.
- [ ] IndexedDB survives quitting and relaunching.
- [ ] The microphone and camera prompts appear (survey and voice features).

## Next (Revision 2 release slice)

1. **Package boot, save/open/export and offline use.** The release gate is a
   clean-machine install and an offline project round trip. The pixel-exact GPU
   suites, production relay connection and macOS check remain open C1 gates.
   Agent, vision and agent-bridge routes are deferred. CSP is still a hardening
   follow-up before release; this slice does not change the web app's policy.
2. **Material cache, HTTPS and web resource staging implemented.** Generate the
   compiled version-1 size/SHA-256 manifest with `node tools/material_manifest.mjs`
   after fetching real LFS objects (pointers and symlinks are refused). Missing
   materials must match an exact manifest key after the scheme's existing private
   path and public-directory checks. The cache lives in app data under
   `material-cache/<sha256>.<ext>`. It verifies size and hash, commits with a synced
   temporary file plus rename, shares concurrent downloads, and verifies persisted
   objects on first use in each process. A corrupt object is deleted and fetched
   again. Its default 1 GiB quota evicts by in-memory LRU order, restored from an
   advisory index at startup. Downloads and evictions persist the index; cache
   hits update memory and flush on activity at most once per five seconds.
   A crash can lose recent hit-only order updates. Responses own their bytes
   before eviction can remove an object. First-use hashing runs outside the
   cache lock; size/mtime is rechecked before marking or deleting the disk object.

   `MF_MATERIAL_ORIGIN` is **build-time only**. An unset origin keeps the feature
   off, including in release builds: there is no implicit production origin, and
   missing materials stay 404. The intended production origin is
   `https://modelforge-3dhome.onrender.com`, the Render service in `render.yaml`.
   It currently serves no materials: `main` does not contain `assets/materials`
   yet. Render must deploy the real Git LFS bytes; pointer files fail size/hash
   verification safely as 502 responses. Set the variable explicitly when
   building a production binary.

   Debug builds can use `MF_MATERIAL_ORIGIN=http://127.0.0.1:8765` with the
   local `npm start` relay (PowerShell: set `$env:MF_MATERIAL_ORIGIN` before
   building). The std-only HTTP client accepts only `127.0.0.1` / `localhost` with
   an explicit port, bounds headers and bodies, refuses redirects and unsupported
   transfer encodings, and uses a 10 s connect / 60 s total timeout with two retries
   for network and 5xx failures. Exhausted network failures return 503 JSON; other
   download failures return 502 JSON. Release builds never allow plain HTTP.

   HTTPS uses one lazily built, reused `reqwest::blocking::Client`, initialized
   on a std material/prefetch worker, outside the webview thread and Tokio
   runtimes. The explicit ring provider and OS verifier validate certificates
   and hostnames. The client is HTTPS-only, refuses redirects and bypasses all
   system/environment proxies (`no_proxy`) for deterministic access to the fixed
   origin. It sends `Accept-Encoding: identity` and
   `User-Agent: ModelForge-Desktop/<version>`, refuses non-identity content
   encodings, checks Content-Length before reading, and streams at most the
   manifest size plus one sentinel byte. Each request uses the remaining 60 s
   total deadline, including retries, with a 10 s connect timeout. A 404 is not
   retried; 5xx failures are retried, and connect/DNS/timeout failures are retried
   and reported as offline. Other failures are fatal. A configured HTTPS origin
   now enables the feature; `GET /api/material-cache` reports origin and enabled
   state as before.

   That GET also reports origin, cached file count/bytes, quota and `pending`
   prefetch paths (including the active prefetch). Authorized
   `POST /api/material-cache/prefetch` accepts `{ "paths": [...] }` with at most
   1000 exact keys per call and returns 202 immediately with `{ "queued": <newly
   added>, "pending": <outstanding> }`. Its deduplicated backlog accumulates across
   calls, including paths already being prefetched; invalid lists queue nothing.
   `/api/ping` advertises `material-cache` only when enabled. Three of the existing
   eight workers handle page material requests (64 queued jobs); five handle other
   requests (192 queued jobs), preserving the 256-job / 192 MiB admission limits
   and backup availability during stalled downloads. One additional worker drains
   prefetch paths without occupying page queue slots, starting another download
   only when no page material requests are queued or running. An active prefetch
   finishes normally; a page requesting that same object joins its single flight.
   Tests use a local TCP server, including 500-path prefetch/page priority coverage
   and an explicitly run three-file real-LFS round trip.

   The release bundle now stages web resources under `web/`, generated from
   `server/public_paths.json`, **except `assets/materials`** (installer estimate
   ~76 MB instead of ~316 MB); see Release build above. Still to do: validate the
   installer on a clean machine, deploy the real material objects and explicitly
   configure the production origin at build time. The bundle tool refreshes the
   manifest whenever it runs.
3. Add the release relay URL and desktop origins to the public relay's
   `HOME3D_ALLOWED_ORIGINS`. Add the opener plugin for external links separately.
