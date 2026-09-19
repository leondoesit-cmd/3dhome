# BATTERYPLATE Full Round preview fix — 2026-09-16

## Fixed and verified in the real browser

The saved `BATTERYPLATE - repaired support` was rolled back immediately after Extrude Cut 1 (Top Cut), before the shared Face sketch at step 6. Selecting the inner negative-X wall, top rim and outer negative-X wall previously failed with “Both side faces must border the center face.”

The topology extractor received exact historical naming hints followed by analytic topology. Repeated persistent names could consume different raw subshapes; the final subshape map then overwrote the earlier, correct binding. Extraction now permits only one successful binding for each persistent name, preserving exact-hint priority.

Full Round preview also matches the selected face geometry against the rebuilt body, and its UI now exposes three explicit face-role selectors and the actual preview error.

Browser result: “Live · exact preview updates as you edit,” Finish enabled, and the rounded rim is visible. This is a preview success, not a saved feature claim.

## Next functional blocker — stopped for coder handoff

Clicking Finish while rolled back fails with “The finish feature could not be rebuilt.” The history stays at 11 steps; no new feature is committed and the saved baseline is unchanged.

Reproduction:
1. Open `BATTERYPLATE - repaired support`.
2. Roll back before step 6 Face sketch (after step 5 Extrude Cut 1).
3. Fillet → Full round.
4. Side 1: center (-2.995, 0.762, 0) cm, normal (+1, 0, 0).
5. Center: center (0, 1.016, 0) cm, normal (0, +1, 0).
6. Side 2: center (-3.402, 0.506, 0) cm, normal approximately (-0.999, 0.052, 0).
7. Wait for exact preview, then click Finish.

Code path: `quickRoundPart` creates a trial feature using `createFeatureDefinition`. That function always appends to history, while the existing rollback index remains before step 6. Trial compilation therefore excludes the appended fillet; validation finds no result for its ID and refuses commit.

Required follow-up: insert finishing features at the active rollback position, advance the bar over the new feature, and reconnect downstream body operations so rolling forward retains the fillet. Validate restored holes and Holder, then save/reopen. Do not simply clear rollback or append at the end: that changes the ebook's feature order.

The active browser test is retained with the valid preview and three selected faces. The library baseline has not been overwritten.
