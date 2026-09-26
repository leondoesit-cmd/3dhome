# Handoff — pro UI overhaul (planner, model editor, cabinet designer)

Status as of 2026-09-26 (second pass: shared editor switcher). Read this first if you are picking the redesign up.

## Where the design is

Mockup canvases (Claude Design artifacts, owner's account; ask the owner for access):

| Canvas | What it holds |
|---|---|
| https://claude.ai/artifact/SAcWieBTurhNqMMcDcNFvM | **Round 6 — the target.** "ModelForge · Pro overhaul": planner, model editor and cabinet designer in one pro shell, every tool packed. 7 screens per editor: desktop workspace, desktop "every tool" (⌘K), phone tool shelf, phone inspector, wide-fold cover, Fold7, wide fold open. |
| https://claude.ai/artifact/7JVb6yp5kNbtqnGR5YCF7M | Round 5 — AI flow: say it → the app names/outlines the parts it picked (plan + 3D) → confirm or choose (A/B) → preview with checks → correct by hand; fully manual with AI off; names/IDs on every part. 7 steps × phone, cover, Fold7, wide fold, desktop. |
| https://claude.ai/artifact/Hb2y1RBjjY6sNBznogFyHd | Round 5 alternative from another session ("Talk, Point, Fix", dark, planner + model editor). |
| https://claude.ai/artifact/XbieioHQMdBMWqSZoWGWVk | Rounds 1–4 history (too many boards to render the Round 5 pages there). |

Design rules that came out of the rounds (user feedback):
- AI-first by chat and voice, **but fully manual too**; pro-level, still easy.
- When the AI acts it must **name/show on the plan or model the parts it picked**, so the user can confirm or choose (lettered candidates when unsure).
- Show the whole flat, not one room; layers; a clear screen to judge the AI and fix it by hand.
- Devices: desktop, phone 390×844, Fold7 open 832×750, wide fold open 890×626 CSS (2670×1878) and its cover 466×678 (1398×2034).
- Never fake a tool: a button either runs a real feature or says it is not built.

## What is implemented

The "all pro tools" layer — built on top of the existing editors, not a rewrite:

- `js/pro_catalog.js` — every tool of all three editors (editor → tab → group → tool), each with one binding to a real feature (`tool:`, `act:`, `run:`, `click:`, `reveal:`, `left:`, `lib:`, `pro:`, `mcmd:`, `mrel:`, `mcon:`, `meng:`, `mclick:`, `cab:`, `mep:`, `nest:`/`nestgo:`). Hebrew for every string (`PRO_HE`, `proLabel`).
- `js/pro_ribbon.js` + `css/pro_ribbon.css` — desktop planner ribbon (editor switch, 9 tabs, Ask box with voice → exact tool name runs it, else `askAgent()` in `ui_agent.js`), the "All tools" section of the phone Tools sheet, and model-editor/cabinet commands in ⌘K.
- `js/pro_actions.js` — commands for features that had no entry (sheet print/SVG, DXF, IFC, schedules, clearances …).
- `tests/pro_catalog.test.mjs` — every binding must resolve to real code, every icon must exist, every model-editor ribbon command must be in the catalog, every string needs Hebrew, and **no `planned:` tool may remain**.
- `docs/PRO_TOOL_GAPS.md` — all 30 former gaps are closed (see that file for notes, e.g. "Send to shop" is a review package, not a machine release).
- `js/pro_shell.js` — **one editor switcher (Planner · Model · Cabinet) in all three editors**: the planner ribbon, the model editor header and the cabinet designer header mount the same `editorSwitchHTML()`. No editor is imported there: each registers `open / isOpen / leave / canOpen / why` (`modeler_launch.js` opens the model editor lazily, `modeler.js` adds `leave` = the Close path with its unsaved-changes question, `ui_cabinet.js` registers the cabinet designer; leaving it is Done, not Revert). A target that cannot open (Cabinet with nothing selected) says why and does not close the current editor. Short labels (Plan · Model · Cabinet) at ≤1100px, 40px pills on touch layouts, and the editor's own title is screen-reader-only because the active pill names it (as in the mockups). `tests/pro_shell.test.mjs` covers the order, refusals and the three mounts.
- **Phone / fold planner strip** (`#m-editor-strip`, built in `js/mobile_shell.js`): a 44px row under the compact top bar with the same switcher (Plan · Model · Cabinet) and 2D · 3D · Split. Panes go through the shell's own `setView()` (drops a half-armed draw tool, returns an elevation to the top-down plan), and the nav's View slot and the strip stay in sync. `--mobile-topbar-block` is now `--mobile-topbar-row + --m-editor-strip`, so every fixed drawer/sheet below the chrome moved down with it; the top bar keeps `--mobile-topbar-row`. The strip sits at the top bar's z-index (100), above the sheet backdrop. It is dropped (and the block shrinks) at `max-height: 500px` (a phone on its side) and in the full-screen game modes. A narrow desktop window (768–1023px, no touch) — where the ribbon is hidden — shows the strip with the switcher only.

- **Round-6 shell** (`js/pro_shell.js`, desktop ≥1024px; phones keep their sheets). Each piece is markup + wiring; what it acts on comes from `registerShell()`, which `js/pro_ribbon.js` fills from the planner (project name, AI helper, pro catalog):
  - **Project name** — inline rename of `S.workspace.name` (Enter saves and marks the plan dirty, Esc cancels; read-only for the `viewer` role). Planner: on the ribbon's first row before the switcher (the planner top bar's centre has no room). Model editor / cabinet designer: in their headers.
  - **AI switch** (`aiOn()`, localStorage `mf.proShell.ai`, default on). Off = fully manual: the bottom bar and the phone Ask box only run tools by name and never reach the AI helper; the status chip says "AI off · fully manual". The helper's own button still opens it on request.
  - **Share** — opens the project dialog on its Collaborate tab (`openWorkspace("collaborate")`).
  - **Bottom "AI | › Cmd" bar** in all three editors. Cmd: suggestions from that editor's pro catalog as you type (↑/↓, Enter runs), an exact name runs directly, anything else says "No tool called …". AI (planner only): same as the old ribbon Ask box — a tool name runs it, other text goes to `askAgent()`. In the model editor and cabinet designer the AI segment is disabled and says why (the helper acts on the plan only). Voice input is shared (`wireVoice`). Typing never fires editor shortcuts.
  - **AI status chip** at the end of the planner status bar and the model editor status line; **"Every command ⌘K"** on the ribbon (focuses the top bar's tool search) replaces the ribbon Ask box.
  - Tests: `tests/pro_shell.test.mjs` — every tool a Cmd example names exists in that editor's catalog (en + he), the AI switch, the mounts, Share's tab.

- **Round-5 AI grounding** (`js/agent_grounding.js`, pure; UI in `js/ui_agent.js`, plan drawing in `js/agent_preview.js`). Every AI proposal card now:
  - **names what the AI picked** — "Move Sofa #8 → Living room", "New door on wall #3", "New wall · 3.20 m" — with the same ids the AI uses (`wall:42` → "#42"; the plan has no short part codes, see below), and pins the same **name tags on the plan**;
  - **checks it against the live plan before Apply**: overlaps (with height bands, so a ceiling light over the sofa is not a clash; non-blocking rugs ignored; a batch checks its pieces against each other), crossing a wall, standing in a door's swing, which room it lands in / outside every room, wall length, room area. Checks are advisory — the command layer still refuses anything invalid. A card waiting for an answer is re-checked on `vspan:ready` (before three.js loads every item reads as floor-standing);
  - **shows every lettered candidate at once** (A–D) instead of the old 1-second carousel: the focused one solid, the others dimmed, each with its tags and an "All checks pass / n to review" summary; a letter only focuses, **Apply A** applies; ←/→ move between them; the plan pans (zooming out only if needed) so every candidate is in view and not under the helper;
  - after Apply offers **Undo** (only while the AI's step is still the latest history step — otherwise it says to use the history) and **Adjust by hand** (selects exactly what the AI created or changed, Select tool, helper closed);
  - words the common refusals (`PERMISSION_DENIED`, `ITEM_LOCKED`, stale preview) instead of showing the code.
  - **AI vs you in the history**: steps labelled `AI: …` by `executePlannerProposal` wear an **AI** badge and read like your own steps ("Changed · Sofa").
  - Tests: `tests/agent_grounding.test.mjs` (geometry + wiring); `tests/agent_helper.browser.mjs` updated for the new card (letters focus, Apply applies, no carousel, Undo/Adjust after Apply).

- **Fold tool rail** (unfolded foldables / touch tablets, `body.dock-rail`): a 64px rail of the planner's nine catalog tabs is a column of `#workspace` before the canvas (`js/mobile_shell.js`), so the plan narrows instead of being covered. A tab docks "<Tab> · all tools · n" — the tab's grid from the pro catalog (`window.__proToolTabs`, `js/pro_ribbon.js`) — at the head of the docked inspector column, which widens toward half the screen; the inspector keeps the rest. Tapping the tab again or ✕ closes the tools (and the column, if it was opened only for them); the armed tool is highlighted in the grid. Running a tool through the hidden `#plan-toolbar` no longer counts as a tap on the plan that closes docked panels (`ui.js`, `mobile_shell.js`). Test posture in a desktop browser by overriding `navigator.maxTouchPoints` and firing `resize`.

## What is NOT done (next steps)

1. **The model editor and cabinet designer keep their own ribbons.** The editor switcher is shared now (see `js/pro_shell.js` above), but the model editor ribbon was deliberately not restructured (saved uikit layouts and browser tests key on its groups — `grpDirect/grpReferences/grpStandards`), and parts of the Round-6 shell are still missing: the three-way view toggles in the editor headers (Sketch/Model/**Split**, Elevation/3D/**Split** — neither editor has a split view to bind to; their existing Model/Sketch/Drawing and 2D/3D controls stay where they are), a cabinet designer status bar, the AI in the model/cabinet bars (needs an AI helper that understands those editors), and the right-hand preview + tabbed inspector layout of the mockups.
2. **AI grounding — what is left.** Name tags and candidates are drawn on the **plan only**, not in the 3D view. The mockups' short part codes (W3, D1, B1…) do not exist; tags use the real ids. **Decided (owner, 2026-09-26): the AI is exempt from the work-set rule.** `aiCanMove()` in `js/layers.js` ignores which layer is being edited and its automatic lock (`autoLock`), but still stops at a padlock set by hand and at a pinned object. Only the AI's paths pass `{ ai: true }` (`agent_runtime.js` previews, the WebMCP bridge, `ui_agent.js` apply); the layout tools and your own drags keep the rule.
3. Phone/fold layouts from the mockups beyond the Tools sheet (tool rail on folds, pro inspector sheet) are not implemented.
4. ~~`workspace.js` keeps its own copy of the sheet-print helper~~ — done: it calls `printSheetSVG` from `sheet_print.js`.
5. **`npm test` is not green on this branch, and on Windows it looks worse than it is.** Many source-contract tests read `js/*.js` with regexes that expect LF; a Windows checkout (`core.autocrlf=true`) has CRLF, so they fail or crash whole files (`review_second_batch` fails at load). With LF copies of the files they read, failures drop from ≈33 to ≈13 of 3,235 — the repo stores LF, so Linux CI sees the lower number. What remains is real: kernel-body/pattern contracts (`kernel_body_finish`, `cad_pattern_merge`, `cad_body_ops`, `review_second_batch` "axis cuts follow framed and primitive hosts") and a few planner files. `material_density_assignment` can time out under a loaded full run but passes alone. None of this is from the pro shell; `npm run check` is green.
6. Verify in a real browser after any change: `npm start`, then desktop + phone viewport; `npm run check` must stay green (a broken import silently kills the UI).
