# QuickForm delayed focus — independent review

Read-only frozen-source review of `js/modeler.js::openQuickForm`, new `tests/quick_form_focus_intent.test.mjs` and owner report `quick-form-focus-intent-guard-2026-10-11.md`. No source edits, browser/CAD, ADVANCE or Git actions.

**No confirmed defect found in the bounded correction.** The deferred animation-frame callback now requires the same current form instance/action, unchanged opening active element and no field pointer/focus/input interaction. User-selected Y focus therefore cannot be stolen by delayed first-field autofocus; an untouched new form still focuses/selects its first field once. The interaction flag remains set after blur, appropriately preserving an already established user choice. These are focus guards only: no coordinate parser, live value handler, saved primitive or CAD data changed.

The existing asynchronous Apply/Cancel exact-instance guard is preserved before and after awaited callbacks, so chained same-action editors remain independent. Replacement-form frames are rejected before touching focus; deliberately moved outside focus also suppresses the default. Every rendered input receives listeners; native controls support those events. No broad command-routing or mutation change is introduced.

Independent rerun **24/24 PASS**:

```text
node --test tests/quick_form_focus_intent.test.mjs tests/quick_form_instance_lifecycle.test.mjs tests/drawing_primitives.test.mjs tests/drawing_paper_arc.test.mjs
```

Three new tests execute the actual extracted `openQuickForm` with the real `featureField` renderer and explicitly queued frames. They require Point1X176.76 to survive typing Point1Y114.08 before the delayed frame and subsequent input to the actual active element; they also cover untouched focus, pointer/input intent, outside focus and stale-instance frames. The neighbouring actual-controller normalization/persistence/Undo/Redo/cold SVG tests and arc semantics remain green.

Owner independently reports related32/32 plus full gates **685 linked modules /1487 assertions PASS** and owned diff clean; this review did not repeat the full gates. Meaningful limit: this source hazard and regression do not prove that every earlier browser field misfill had the same cause. Parent actual fresh-code browser editing remains a separate witness; source/CAD correctness cannot be inferred merely from a successful focus test.
