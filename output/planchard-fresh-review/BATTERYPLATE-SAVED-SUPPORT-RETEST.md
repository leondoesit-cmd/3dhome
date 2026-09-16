# Existing saved BATTERYPLATE still rebuilds with wrong holes

Browser retest after moved-face / collision prevention / save-status fix, 2026-09-16. No application code changed.

## Exact browser steps

1. Reloaded http://localhost:8765/ to load current app.
2. Opened Model editor > Saved models. The existing library records ARE available in this in-app browser, including `BATTERYPLATE - save reopen verification`.
3. Used that record's Save copy and open, naming the copy `BATTERYPLATE - support frame retest`.
4. Waited for CAD kernel initialization and selected Top view.
5. Ran Evaluate > Force Rebuild. UI reported Model force-rebuilt / Rebuild succeeded, one part, ten history steps, no red diagnostics.
6. Visually inspected Top view again. The geometry remained incorrect.

## Actual vs expected

Actual: pocket floor has no two circular holes. The lower/front outer rim has the same notch as the previous saved result.
Expected: two Ø12.7 mm Through All holes through the pocket floor, at the origin and the 25.4 mm / 45° location. No misplaced rim notch. Ebook PDF 247–248 (printed 5-29–5-30).

## Scope of this finding

This retest uses the real saved record produced before the latest face-remapping fix. It demonstrates that the existing incorrectly saved document is not repaired by reopening and Force Rebuild. It does NOT establish that a new 104.14 mm to 10.16 mm / 3° edit from a pristine BATTERY fails with current code; that separate path was not repeated in this turn.

Possibility to investigate: the previous save may have persisted the wrong support binding/frame or naming hints, and preventing new ID collisions alone may not repair that historical state. This is a hypothesis, not a proven diagnosis. Please either migrate/repair this record safely or provide an explicit supported recovery workflow that retains sketch dimensions and intended support orientation.

## Preserved state

Saved copy `BATTERYPLATE - support frame retest` exists. The retained in-app browser shows it in Top view after Force Rebuild. Source verification record and original BATTERY records were not edited. Stopped at this functional saved-document blocker per user instruction.

Acceptance: open the exact historical saved record through the UI, rebuild, visually and geometrically verify both floor holes and support frame, then save/reopen without losing correctness. Also keep the clean BATTERY-to-BATTERYPLATE edit regression passing.
