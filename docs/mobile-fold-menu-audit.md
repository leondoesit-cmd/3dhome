# Mobile and fold menu audit — 11 September 2026

## Layout presets and saved edits

Customize interface now presents a separate collection for Phone and Fold / tablet: Everyday, Floor planning, and Model & cabinet. Desktop retains its six presets. Named saves are stored separately for each screen category; the gallery updates when the screen changes. Preset and saved-layout application isolates presentation and theme, supports undo, and preserves the other screen presentations. The underlying layout tree remains shared, following the existing editor contract.

Legacy desktop named saves retain their original storage key. Phone and fold saves use separate suffixes. No saved layouts are deleted during migration.

## Visual inspection

Inspected rendered screenshots in the real in-app browser at 390×844 and 673×841, navigating through the actual menus. Findings were checked against visible controls and DOM geometry. This was a desktop browser resized to phone/fold dimensions, not a physical folding device.

| Area | Inspected paths and depth | Corrections |
| --- | --- | --- |
| Planner | More → guidance, project, edit, export, expanded advanced actions; Build; room preset categories and connection controls; Add → Furniture → Living room | Put Model editor, Customize interface, Save, and Cabinet designer first. Wrap guidance descriptions. Remove the duplicate status strip over room choices. Increase room choice, connection, and rotation targets. |
| UI editor | Preset cards; named save input and button; screen change while open | Distinct screen collections and storage; visible screen badge; theme controls respect current screen. |
| Cabinet | Tools; View → More views; Design → types and presets; Properties → compartment options, front style, hardware, history, checks, BOM; More → dimensions, levels, second action page; Cut plan & quote | Show tool and tab names; larger swatches and controls; full-width hardware/material selectors; visible reasons for unavailable options. Technical level opens Properties directly. Remove the secondary preview from the narrow fold inspector in elevation mode. Keep cutting-plan Close fully inside the header. |
| CAD | View; Tree → feature tree, library, settings; Commands → Features, Sketch, Evaluate, Assembly and expanded command groups; Properties → shape, finish, operations; More → document/actions; command search | Label touch tools and navigation. Remove artificial pagination from borrowed panels, which produced empty first pages. Reset command scroll when switching tabs. Wrap settings labels and stack the density selector. Add a touch Close button to command search. |

Temporary cabinets used for inspection were undone. No test design was saved to the user's project or model library.

## Automated validation

- `npm test`: 2,210 tests passed.
- `npm run check`: no free identifiers, no link errors across 425 modules, source assertions passed.
- Browser suites: UI editor variants, inspector, mobile menu pages, CAD responsive feature flow, and the new mobile design reachability checks. These cover English/Hebrew phones, fold/tablet widths, preset/save isolation, nested cabinet Technical routing, cutting-plan Close hit testing, and CAD feature forms.
- The broad existing overlap audit inspected 90 stages at six viewport/language configurations. It reported 104 collisions, all under its desktop 1440px planner stages, including repeated floating toolbar/grip intersections. It reported no collisions in the phone/fold configurations. The broad audit is therefore **not an overall clean bill of health** and does not substitute for the visual inspection above.

## Limits

This records the inspected menu families and representative nested paths; it does not certify every selection-dependent CAD feature form, every furniture item, every external import/export workflow, or every possible saved layout. Physical hinge behavior, OS keyboards, safe-area changes, and touch accuracy still require physical-device testing. The responsive feature-flow tests simulate a keyboard inset rather than opening an OS keyboard.
