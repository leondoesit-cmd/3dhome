# Handoff — pro UI overhaul (planner, model editor, cabinet designer)

Status as of 2026-09-26. Read this first if you are picking the redesign up.

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

## What is NOT done (next steps)

1. **The model editor and cabinet designer keep their own chrome.** The model editor ribbon was deliberately not restructured (saved uikit layouts and browser tests key on its groups — `grpDirect/grpReferences/grpStandards`). Everything is reachable through the planner ribbon, ⌘K and the phone sheet, but the Round-6 look (one shared shell with an editor switcher inside each editor) is not built.
2. **Round-5 AI grounding UI** (name tags on the parts the AI picked, A/B candidates, preview with checks, AI-vs-you history) is design-only. The Ask box currently hands text to the existing AI helper.
3. Phone/fold layouts from the mockups beyond the Tools sheet (tool rail on folds, pro inspector sheet) are not implemented.
4. `workspace.js` keeps its own copy of the sheet-print helper; use `printSheetSVG` from `sheet_print.js`.
5. Verify in a real browser after any change: `npm start`, then desktop + phone viewport; `npm run check` must stay green (a broken import silently kills the UI).
