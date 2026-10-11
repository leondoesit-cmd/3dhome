# Planchard mobile-only restart

Updated: 2026-10-11. This is the active restart record. Desktop evidence is preserved separately and does not count as mobile completion.

User direction: skip damaged Exercise3.9, stop the old desktop run, redo the book from the beginning using Chrome on the computer in phone emulation, interacting as a mobile user.

## Current boundary

- Old desktop goal explicitly paused at the user's stop request.
- Fresh Chrome tab opened at http://localhost:8765/ with390×844 CSS-pixel phone viewport, mobile device metrics and five-point touch emulation. Dark theme is visible.
- Accepted mobile activity: Alphabet of Lines 1 (printed1-25 / PDF53), independently authored as one drawing note through phone touch and form entry, renamed MOBILE Ch1 Alphabet Lines 1, and saved. After cold reload, phone Feature tree / Saved models / Search saved models found one result out of337. Expanded sheet and ordinary touch on that card reopened the answer. Drawing / All tools / page5 / Fit and Export SVG invoked original native handlers. The exported alphabet1.svg contains the five expected answer lines at2.8mm font /3.78mm row pitch, inside the sheet and clear of its title block. Undo removed the note and Redo restored it before reload; the saved export verifies the restored answer. Named Saved card is verified; internal UUID has not been extracted.
- Mobile counts: one of21 Chapter1 in-chapter prompts accepted; zero of117 numbered homework exercises accepted. This is not a percent of book pages or all activities. Desktop results remain outside this mobile numerator.
- Current Chrome phone tab:710862488. Use actual120ms finger contact between touchStart/touchEnd, with monotonically increasing real timestamps. Zero-duration/future-dated contacts caused misleading non-responses; this was automation timing, not an app mode-tab defect. Read-only DOM checks establish targets; Page.captureScreenshot captures the actual390x844 framebuffer (the higher-level screenshot was incorrectly scaled).
- First real mobile gap fixed and browser verified: Drawing / All tools opened Sketch commands. Native drawing shortcuts now include all toolbar actions, with five navigable pages of atomic four-command groups. Actual touch on page5 / Fit and SVG export closed the sheet and ran native actions. Screenshot drawing-commands-verified.png supersedes the intermediate failed drawing-commands-after.png.
- Second real gap fixed and browser verified: Saved models had roughly39837px of cards in a275px phone pane without search. Labelled search now appears first, filters names live and preserves native handlers; typing MOBILE Ch1 Alphabet gave1/337, and ordinary card touch reopened the independently Saved worksheet. screenshot saved-search-verified.png. Recovered New model draft was preserved using Start fresh and keep draft; it is not the accepted worksheet.
- Verification: drawing/mobile-menu focused31/31 tests; Saved filtering3/3 tests; final global gates no free identifiers,692 modules linked,1487 source assertions PASS. Full CI has not been rerun or claimed green.
- Actual two-finger gesture after export moved/scaled the sheet and left text near the viewport's left edge (alphabet1-pinch.png). Do not claim physical-phone fidelity or precise pinch zoom acceptance from this attempt. Return through All tools/page5/Fit to reset the sheet before next authorship. Text input used visible browser form entry; a physical phone keyboard has not been tested.
- Next: independently author Alphabet of Lines2 on printed1-25/PDF53, then3 on printed1-26/PDF54; follow their source answers in the existing source-only inventory. Keep390x844 Chrome tab710862488 and use actual120ms touch duration. Update this record after each accepted activity, not only after a chapter.
- First source activities: Chapter1 line conventions and Alphabet of Lines exercises, PDF53–54 /printed1-25–26; then Orthographic and Plane activities before numbered homework1.1–1.11. Reuse source inventory only, not previously authored CAD.
- Exercise3.9 will be explicitly skipped when reached; do not let its damaged source stop this new run.

## Execution rules

Author through visible phone UI using touch taps, drags/swipes and accessible form entry. Do not rely on hover, right-click, desktop modifier shortcuts, forced hidden controls, app-state geometry injection or scripted model import. Read-only source extraction/audits and implementation/tests for confirmed app gaps remain allowed. Record any interaction the browser tool cannot actually emulate rather than claim device fidelity.

Each accepted mobile task needs its source page, independent Saved identity, actual screenshot/export, driving edit and Undo where applicable, save/reload/reopen proof, and relevant drawing/assembly/export consumer. Track handset emulation separately from real physical phone/GPU/keyboard testing. Keep the user's requested phone viewport while this run continues.

Commit/push coherent completed tasks to origin/planchard, update this file and the leading desktop ADVANCE pointer, and preserve all older accepted artifacts.
