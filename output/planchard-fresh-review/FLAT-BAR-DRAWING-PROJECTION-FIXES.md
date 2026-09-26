# Flat-bar drawing verification

The retained browser connection was recovered by opening a fresh tab on the same localhost app. Saved models remained available. The saved-part startup guidance now correctly shows History and five editable steps.

## Fixed

- Small circular outlines disappeared because line consolidation removed their tessellation chords before circular-rim recognition. Complete rims are now recognized first. Angular coverage is measured as a union, preventing overlapping partial rims from being mistaken for a complete circle.
- Overall drawing dimensions used mesh extrema, reporting 4.499 inches for the 4.500-inch bar. Kernel meshing now carries exact bounds into standard orthographic drawing views. General rotations, isometric views, and sectioned geometry retain the existing projection behavior rather than claiming exact directional bounds.
- Exact bounds are preserved with copied meshes and updated for translations and reflections.

## Browser result

Saved `FLAT BAR - 9 HOLE - exercise 5.9` now has an ANSI preset drawing with inches and secondary millimetres, Aluminum 1060 identification, and mass 5.151 g. No unspecified general tolerance was invented.

After reload, all nine circular hole outlines were visible and the overall dimension read 4.500 [114.30]. Added and saved the associative hole diameter 0.190 [4.83], first hole pitch 0.500 [12.70], and thickness 0.060 [1.52].

The repeated-hole and end-radius annotations remain to be completed. The three-hole drawing remains outstanding. This is not a claim that the drawing is ready for manufacture.

## Checks

69 focused projection, kernel-mesh and drawing tests passed. Module/link checks passed for 506 modules; 1,452 source assertions passed. The broader test suite was not run.
