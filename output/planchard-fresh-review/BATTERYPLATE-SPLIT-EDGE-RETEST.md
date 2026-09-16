# BATTERYPLATE retest: saves and reopens, but geometry is wrong

2026-09-16 browser retest after split-descendant circle-name remapping fix. No app code changed. Stopped before later ebook steps.

## Reproduction

1. Reloaded http://localhost:8765/ in retained in-app browser tab 2.
2. Opened Model editor; Restore draft WAS offered here for `BATTERYPLATE - ebook browser review` (timestamp 8:16:17 PM). Restored it. After kernel initialization the pre-edit body rebuilt successfully. Base depth was 10.414 cm, draft 0.
3. Selected Extrude / Boss 1 > Edit feature in history. Entered `10.16mm` (1.016 cm) and draft `3`, inward, Along normal.
4. Live preview said **Downstream features followed the change**.
5. Finished command. UI then reported 16 rebuild errors with the earlier outer circle reference.
6. Evaluate > Force Rebuild changed the persistent diagnostics to **12 errors**. First reference was now `feature_mu495t59_4:tool:edge:generated:line:7`, grouped as Fillet 2 lost selected face or edge ×8. Both terminal cuts also reported unavailable tool/result inputs.
7. Clicked Save to library. Unlike previous retests, this succeeded: unsaved indicator disappeared and footer said Rebuild succeeded. The left diagnostic panel still showed 12 errors, so UI states contradicted each other.
8. Saved models > `BATTERYPLATE - ebook browser review` > Save copy and open, named `BATTERYPLATE - save reopen verification`.
9. Reopened copy reported BREP geometry regenerated / Rebuild succeeded, one solid, ten steps, no red diagnostics. Selected Top view to inspect actual shape.

## Blocking geometry result

The reopened shallow rounded plate has NO two circular terminal holes in its pocket floor. A notch/cut is visible in the lower/front outer rim instead. The same misplaced side cut was visible in the oblique pre-save viewport. This does not match the book's two Through All holes through the plate floor from the inherited terminal sketch.

Expected: two Ø12.7 mm vertical holes, one centred at the sketch origin and one offset 25.4 mm at 45°, retained after shrinking the base to 10.16 mm and adding 3° draft. Source: ebook PDF 247–248, printed 5-29–5-30.

Do not treat a passing rebuild flag or saving successfully as sufficient validation. Inspect the attached sketch support frame and each cut's world direction after topology remapping. Wrong support-face rebinding is a hypothesis, not a proven root cause.

## Additional observed inconsistency

Live preview succeeds, commit shows 16 errors, Force Rebuild shows 12, Save changes footer to success while stale red diagnostics remain, reopen clears diagnostics but preserves visibly wrong geometry. Include preview/commit/rebuild/save consistency in regression coverage.

## Preserved deliverables

- Saved original work record: `BATTERYPLATE - ebook browser review`.
- Saved reopened verification copy: `BATTERYPLATE - save reopen verification`.
- Retained in-app browser displays the verification copy in Top view, showing absent floor holes and the misplaced rim cut.
- Original BATTERY records were not edited.

Acceptance: repeat this exact browser-authored model edit, verify hole axes and centres, floor/rim geometry, base dimensions and draft, then save/reopen and visually verify again. No new modeling work was attempted after identifying the blocker.
