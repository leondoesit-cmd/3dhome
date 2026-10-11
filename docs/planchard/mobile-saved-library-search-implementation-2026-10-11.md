# Mobile Saved-library search — 2026-10-11

The Saved models/assemblies pane now begins with a labelled native search input, before template/create/export actions. Live case-insensitive name filtering accepts multiple words, trims whitespace and normalizes Unicode. The last mobile study can be found directly by typing its name instead of scrolling approximately300 cards.

Filtering changes card visibility only; native card open, copy and delete handlers retain their original identity and behavior. Separate Part/Assembly queries survive a library refresh within the current editor session. Clearing the search restores all cards; an accessible live result count/no-match message reports the filter outcome. Explicit inline visibility also prevents existing card display CSS from overriding HTML hidden semantics. No source CAD, Saved records, automatic load or forced scroll is introduced.

Files: `js/modeler_library_search.js`, bounded `js/modeler.js::refreshLib`, and `tests/modeler_library_search.test.mjs`. Focused tests **3/3 PASS**, including a300-card library with the target last, native action identity, clear/no-match recovery, Unicode/multiword names and search-before-actions integration. Gates pass no free identifiers,692 linked modules and1487 source assertions. Tests preserve actual callbacks; source scanning checks only bounded integration wiring.

Actual mobile Chrome search/filter/load and cold reopening are pending parent verification. No browser authorship or mobile acceptance is claimed by this implementation report. No Git/ADVANCE/CSS/mobile dock edits performed here.
