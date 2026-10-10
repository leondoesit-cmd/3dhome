# Chapter 3 paper dimension capability audit

Read-only code/test audit for source PDF 175 / printed 3-47 exercises 3.1/3.2.
No code, CAD, browser, ADVANCE or commit changes. Companion coordinates and
chosen estimate qualifications remain in
`chapter3-graphics-browser-plan-2026-10-10.md`.

## Finding

The native **Dimension** tool binds projected CAD view points/topology, not
independent paper primitives. `snapAt` enumerates `scene().views`; a worksheet
with zero model views has no eligible dimension picks. Neither editing its
text nor entering a literal override changes this picking restriction.
Paper primitives remain explicitly independent of model units and view scale.
An associative paper dimension module would be a future generic enhancement,
not required to finish these hand-drawing worksheet exercises.

Existing manual extension lines, dimension lines, closed arrowheads and text
are authorable, editable, saved and exported through ordinary UI. This matches
the qualified fallback in the source worksheet plan. No new scale conversion or
invented publisher units are needed.

## Exact ordinary UI recipe

1. In Drawing, choose **Paper polyline**, click the profile vertices, and finish
   with **Enter** (or return to the first point). **Escape** cancels unfinished
   geometry. **Paper circle** uses center then radius point for exercise 3.2.
2. For each horizontal/vertical dimension, use **Paper line** for both extension
   lines and the dimension line. Leave a central text gap using two line
   segments when needed. Begin extensions 1 paper-mm clear of the feature and
   end 2 paper-mm beyond the dimension line, per the companion plan.
3. Use **Paper polyline** for each small closed triangular arrowhead, ending at
   its first point. These are outline triangles, not filled arrow glyphs; source
   figure scale and manual annotation must be identified honestly.
4. Choose **Note**, click the value position and enter the estimated number.
   Multiline note text is supported. Use a note plus paper leader line for
   exercise 3.2's **Ø2** callout; paper circles are not native diameter picks.
5. To correct an element precisely, choose **Select**, double-click its stroke,
   and edit **Point 1 X (paper mm)** / **Point 1 Y (paper mm)** and subsequent
   point fields. **Line style** choices are **Visible**, **Hidden**,
   **Centerline**. This is also the ordinary route for hole centerlines.
6. Keep the explicit scale note: 3.1 uses chosen one interval = one illustrative
   mm, paper graphic 4:1; 3.2 uses the corresponding 6:1 graphic. Thus an 84
   paper-mm span may be labelled chosen estimate **21**, not a measured native
   model size. Label the dimension groups **manual paper dimensions**.
7. Save/export the ordinary authored sheet and cold reopen; count four required
   3.1 dimensions and seven 3.2 size/location dimensions/callouts. A value table
   alone does not supply the requested arrow/extension-line graphic.

## Validation

20 existing focused tests PASS across `drawing_primitives.test.mjs`,
`drawing_paper_arc.test.mjs`, and `drawing_multiline_notes.test.mjs`: actual
pointer creation, numeric edit, deletion/Undo, close/cancel handling, blank
zero-view sheets, analytic geometry, library bundle/cold reopen, native empty
document save, multiline text and selectable exported rows. No actual browser
worksheet acceptance is claimed by this read-only audit.
