# CSWA Question 6A — coordinate-system audit

The accepted fresh Question 6 model was copied through the browser's Save copy and open command. The independent variant is named `Planchard CSWA Q6A - coordinate system fresh derivative 2026-09-30`.

Through Reference > Coordinate sys, the front-right-bottom vertex origin was entered as world (65, 0, 20) mm, with ordinary right-handed XYZ axes. Native mass properties relative to this frame are **(-80.39197, +15.93340, -22.65236) mm**. They round to the values in the book's embedded SOLIDWORKS mass-properties screenshot: **(-80.39, +15.93, -22.65) mm**.

## Printed sign discrepancy

PDF page 503 at 400 dpi (`scratch/planchard/cswa-p503-highres.png`) confirms the bold answer says Y **-15.93**, while its embedded report says Y **+15.93**. Reversing only Y would produce a left-handed frame and is not used to force agreement with the bold text. The model follows the illustrated vertex and the embedded report.

The variant retains the original exact 130 x 45 x 40 mm solid, nine editable history entries and four fully defined sketches. Exact volume 111060.4 mm³ and Steel 304 mass 888.4836 g remain unchanged. Save completed cleanly. Protected browser export: `artifacts/planchard/CSWA-Q6A-coordinate-fresh-browser-2026-09-30.mforge` (829171 bytes); screenshot `CSWA-Q6A-coordinate-native-browser-2026-09-30.png`.

Cold reopen and native STEP proof are pending.
`artifacts/planchard/CSWA-Q6A-coordinate-native-browser-2026-09-30.step` exported through Output > Export STEP (133525 bytes). Cold reopen remains pending.
Cold reload followed by visible saved-library reopen passed: nine entries, four fully defined sketches, one body, unchanged native mass/volume, and Coordinate System1 remains selectable. Its new native report repeats (-80.39197,+15.93340,-22.65236)mm. Proof: CSWA-Q6A-coordinate-cold-reopened-browser-2026-09-30.png. Question6A browser workflow is accepted against the embedded report, with the bold-text sign discrepancy retained.
# Post-repair compatibility acceptance

After the mixed-profile identity and trimmed-boundary tangent repair, Chrome724 was fully reloaded, the independent Q6A saved record reopened, and native mass properties recomputed. It retains one solid body and130×45×40mm. Native volume111060.4mm³ and mass888.4836g retain the source-rounded888.48g. Selecting CoordinateSystem1 givesX−80.39197,Y+15.9334,Z−22.65236mm, unchanged at the book's reporting precision. Proof: `artifacts/planchard/CSWA-Q6A-tangent-repair-cold-reopened-browser-2026-09-30.png`. The previously documented sourceY-sign discrepancy remains.
