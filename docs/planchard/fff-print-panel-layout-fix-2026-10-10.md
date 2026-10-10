# Print preview panel layout

The actual browser proof `artifacts/planchard/CH11-FFF-default15-middle-browser-2026-10-10.png` showed a narrow left panel, a small deposition preview, and overlapping/clipped export labels. The functional FFF outputs were separately accepted by the parent; this fix concerns their ordinary UI presentation.

CSS now widens a desktop panel only while its visible QuickModel form contains a print preview, stacks its numeric field labels, fits the SVG to the available panel width, and puts descriptive preview export actions in one wrapping column. The existing Cancel/Apply footer retains its layout and sticky behavior. Compact/mobile panels retain their existing width while receiving the same readable field/export arrangement. Closing the form removes the width condition.

No slicing settings, toolpaths, model state, output files, or source CAD are changed. Source gates and whitespace checks are used; a CSS-mirroring unit test would not establish visual acceptance. Parent browser reload/screenshot verification remains pending.
