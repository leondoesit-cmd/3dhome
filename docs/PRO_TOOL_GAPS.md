# Pro tool gaps

All tools in the pro ribbon, phone All tools sheet, and command search now have
working bindings. There are no `planned:` entries in `js/pro_catalog.js`.

The original 30 gaps have been implemented or connected to existing features:
12 planner tools, 14 model editor tools, and 4 cabinet designer tools. Run
`npm run check` and `npm test` after changing a binding. The catalog test checks
that no tool has a `planned:` binding.

| Editor | Completed tools |
| --- | --- |
| Planner | Stairs, Roof, Reference dim, Stack, Angle snap, Fixtures, Dimension, Note, Symbols, Section, Area summary, Layout check |
| Model editor | Sketch point, Text, Equations, Variables, Cone, Ref point, Custom props, Smart mates, Sheet metal, Stock size, To walls, Finish preview, Branch, Export GLB |
| Cabinet designer | Kitchen run, Worktop, Part labels, Send to shop |

Cabinet shop delivery creates a revision-bound **review package**. The system
share sheet can hand the JSON file to a recipient where supported; otherwise the
file is downloaded for the user to attach. The package is not machine-ready or
a production release. Worktop cutouts are included as design geometry and
flagged for workshop review of appliance templates and machining instructions.
