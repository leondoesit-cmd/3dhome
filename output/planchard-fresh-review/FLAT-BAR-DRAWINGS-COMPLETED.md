# Exercises 5.8 and 5.9 — drawing annotations completed

Both saved flat-bar models now include drawings with overall length, width, stock thickness, hole diameter, centre pitch, and an associative end-radius dimension. Notes specify three or nine equal through-holes and that end holes are concentric with equal-radius ends. Both use the ANSI preset with inch dimensions and millimetre equivalents. Both were visually checked after reopening from the saved library.

The three-hole record retains its ferritic stainless material description without inventing a grade; its drawing mass is left blank. The nine-hole drawing retains Aluminum 1060 and its previously measured 5.151 g mass. General tolerances remain unspecified because the exercise supplies none. Completing the exercise geometry does not constitute a manufacturing-release approval.

Gaps fixed during annotation:

- Radius picking now uses exact circular-arc topology, binds the dimension to its persistent edge, and rejects the absent side of a partial circle. Arc midpoints survive translation and reflection.
- Drawing note and dimension-entry forms now reveal their sidebar. Previously the forms were built in a parent hidden by Drawing mode.
- Rotated dimension-label picking now uses the label's displayed rotation.

Next exercise: 5.10, the three-step 1060-alloy part on PDF page 261, with A = 3.50 in and B = 0.70 in.
