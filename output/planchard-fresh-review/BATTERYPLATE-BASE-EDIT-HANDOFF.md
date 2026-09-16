# BATTERYPLATE base edit breaks downstream topology

Browser reproduction, 2026-09-16. No application code changed. Stopped at this functional blocker per user instruction.

## Verified preceding fix

The saved BATTERY opens with the corrected rounded pocket and terminals. Front now shows the world X/Y view with Measure active. Browser measurement from terminal top (Y 11.43 cm) to a snapped bottom edge centre (Y 0.00 cm) reports ΔY -11.43 cm: the expected overall height is 114.3 mm. Saved as `BATTERY - height verification`.

## Book reference

David Planchard, Engineering Graphics with SOLIDWORKS 2021, PDF pages 247–248 (printed 5-29–5-30), activities 180–203. Copy BATTERY, remove terminal bosses while retaining their sketch, create Through All holes, then change the base depth to 10.16 mm and add 3° draft. Downstream geometry should rebuild as a shallow BATTERYPLATE.

## Reproduction through the browser

1. In Saved models, choose Save copy and open for `BATTERY - height verification`; name it `BATTERYPLATE - ebook browser review`.
2. Delete `Extrude / Boss 3`, then `Extrude / Boss 2`. The shared terminal face sketch survives; rebuild succeeds.
3. Open the retained fully defined terminal sketch: two Ø12.7 mm circles, 25.4 mm centre spacing, 45° construction relation. Finish sketch.
4. Choose Extrude cut, Through all, Reverse normal, zero draft and zero start offset. Commit. App creates `Extrude Cut 2` and `Extrude Cut 3`; status reports Rebuild succeeded, one part.
5. Select `Extrude / Boss 1`, Shape & size, Edit feature in history.
6. Enter `10.16mm` in Depth cm (UI resolves to 1.016 cm). Enter `3` in Draft angle deg; retain inward draft and Along normal. Finish command.

## Actual result

- Live edit reports a downstream topology failure; after finish, UI shows **Rebuild errors · 16**.
- Earliest reported failure is **Fillet 2 lost a selected face or edge · ×12**.
- Exact first error: `Fillet 2 has an missing topology reference: feature_mu494nhz_3:edge:generated:circle:3`.
- `Extrude Cut 2` tool/result cannot rebuild because `feature_mu4b8bji_2` is unavailable.
- `Extrude Cut 3` tool/result cannot rebuild because `feature_mu4bz5zm_1` is unavailable.
- Top viewport shows a plain square instead of the rounded, recessed plate with two holes.
- Save to library is blocked by a Rebuild failed dialog with the same missing reference.

The height edit is confirmed committed in the inspector as 1.016 cm. The failure first appeared during live parameter editing; this run did not isolate whether depth alone or draft caused the first topology change. Root cause is not proven; the observed failure is downstream reference survival across the base edit.

## Preserved state

- `BATTERY - height verification` is saved and valid.
- `BATTERYPLATE - ebook browser review` was created as an independent copy before edits. Its final failing edits could not be saved because the app rejects saving a failed rebuild.
- Current localhost browser tab is retained with the failing model and save-error dialog open. Do not reload before inspecting/exporting if the in-memory state is needed.
- The copied source includes an existing empty Front-plane sketch. No new geometry was added to that sketch in this reproduction.

## Acceptance checks

1. Repeat the actual saved-model browser workflow above, without reconstructing the model programmatically.
2. Base 10.16 mm / 3° draft rebuilds with intended outer corner fillets, offset pocket, 1.27 mm rim fillet, and two Ø12.7 mm Through All holes.
3. Face-attached terminal sketch follows the changed pocket floor; hole extent remains Through All.
4. No missing-reference or unavailable-input diagnostics; save and reopen reproduce the same correct geometry.
5. Keep the original BATTERY geometry and 114.3 mm overall height intact.
