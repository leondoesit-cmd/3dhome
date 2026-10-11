# Drawing phone More fields touch repair

Parent's actual phone inspection found `pointer-events:none` on the Model name input, its label and `.md-head-inputs.md-borrowed`, despite the More fields wrapper accepting events. Source cause is the Drawing header-disable rule in `css/styles.css`, which also matches the real header fields after they are moved into More. `pro_compact.css` has no corresponding field-disable rule.

A higher-specificity rule restores `pointer-events:auto` and opacity 1 **only** for compact phone Drawing's `#md-sheet .md-sheet-fields > .md-head-inputs.md-borrowed`. Descendant labels/inputs inherit enabled pointer handling. The original Drawing header rule remains unchanged; normal hidden-header fields are not reenabled. No CSS outside this single presentation rule, authored data, event listeners or browser state changed.

Existing compact-editor, mobile drawing command and menu-density tests: **56/56 PASS**, zero skipped, exit 0. Log: `scratch/planchard/mobile-more-fields-tests-2026-10-11.log`. Owned diff check clean. These are regression checks; no new simulated stylesheet assertion is presented as actual computed-style proof.

`npm run check` exited 0: no free identifiers, **692 modules /1487 source assertions PASS**. Log: `scratch/planchard/mobile-more-fields-gates-2026-10-11.log`.

Parent owns actual phone validation and preserving the current unsaved second note before any page reload. Acceptance should verify borrowed field computed pointer handling and actual name/description touch editing, then More Save; returning fields to the header must retain the original Drawing disable behavior.
