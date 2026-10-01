# UI and drawing CI repairs

The helix region table now respects the existing layout text floor. This fixes the new bare 11 px declaration without changing the application's desktop/compact floor policy.

The dimension exterior placement, section projection arrows, angle branch-cut, and review regression failures were test extraction defects. Regexes required LF line endings and accidentally consumed later exported declarations in CRLF files. Test fixtures now use vendored Acorn to extract the exact function declaration, including nested declarations and default object parameters. The original geometry, keyboard, SVG, mirror, and undo assertions remain intact. Eight focused drawing/readability/extraction tests and all fourteen review regressions pass, including native framed mirrors.

The mobile dial had a production regression: length inputs became text fields to accept fractions and unit suffixes, while dial eligibility still required `type=number`. Known dimension fields with decimal input mode now qualify. Non-dimensions, protected controls, and explicit opt-outs remain excluded. Twenty arithmetic, wiring, and eligibility tests pass.

Browser dial fixtures now select centimetres explicitly and request one-unit steps for their existing ten-step and five-step gesture checks. Regional defaults previously interpreted a height of 255 as metres and correctly clamped it to a displayed 6 metres, invalidating the fixture's assumption. The kitchen screenshot fixture now uses `fileURLToPath`; URL.pathname produced the invalid Windows path `C:\C:\Users\...`.

An isolated Chrome run after these repairs passed the opener, fast flick, two-way binding, desktop exclusion, and item live/release cases. After the full browser runner finished, kitchen passed in isolation with its geometry and furniture assertions unchanged (approximately 63 seconds).

The wall gesture still exceeded one 30-second `Runtime.evaluate` command after the other runner ended. A bounded trace processed all twelve visible frames from 390 to 400 without a browser exception, then completed release/undo. Dividing the fixture into per-frame evaluations fixed the command timeout: the exact ten-step arithmetic, continuously changing values, live wall length, one-step Undo, closed dial, and restored field all pass (approximately 30 seconds total). Each frame retains its 40 ms deliberate-travel delay; no assertion or timeout was relaxed. This trace establishes a completed UI operation rather than an app deadlock, and does not establish desktop rendering performance. All six dial cases and the kitchen case have now passed isolated browser checks.

`npm run check` passes: no free identifiers, no link errors across 587 modules, and all 1489 source assertions checked without comment-only matches. Browser harness checks here verify layout and UI behavior; they do not replace the requested desktop Chrome model authoring or claim new book-model acceptance.
