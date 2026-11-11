# Gaps: market conventions, Hebrew localization, Israeli regulations

Audit of 2026-11-09 (branch `planner-mobile-pbr`). It compares the planner, the
drawing output and the Hebrew UI against (a) what professional tools
(Revit, ArchiCAD, Vectorworks, Chief Architect, SketchUp + LayOut) treat as
basic, (b) Hebrew/Israeli localization norms, and (c) Israeli building and
software regulations.

**Legal caveat.** The regulatory figures below come from secondary sources
(professional sites, law-firm summaries), not from the official text in Nevo /
Reshumot. Each one marked *verify* must be checked against the current
official version before it goes into a rule. The permit regulations were
amended on 19.10.2025, so older summaries may be stale.

---

## 0. Status: what has been done (2026-11-09, England and Germany 2026-11-10)

A building-code check now exists: **Analyze → Check → Code check**, also
reachable from command search ("code check", "IRC", "mamad", "safe room").
- `js/code_profiles.js`: jurisdiction profiles, each with an edition, a clause
  per rule, sources, and `verified: false` on every value. A state inherits the
  model code it adopted and overrides only its amendments.
  - Israel (`il`).
  - The US model code: IRC 2021 and IRC 2024.
  - US states: California (CRC 2025), Florida (FBC-R), New York (RCNYS),
    Texas (local adoption), Michigan, Pennsylvania and Connecticut. The last
    three override stair dimensions (8¼" riser / 9" tread).
  - England (added 2026-11-10), three layers:
    - `uk-eng`: the Building Regulations (Approved Documents B and K). They set
      no room sizes or ceiling heights.
    - `uk-eng-ndss`: adds the space standard, which binds only where the local
      plan adopts it.
    - `uk-london`: adds the London Plan's 2.5 m ceiling.
    - Lengths print in millimetres (`metric-mm`), as UK drawings do.
  - Germany (added 2026-11-10): the model code `de-mbo` (with DIN 18065 stairs)
    and the states Bavaria, North Rhine-Westphalia, Baden-Württemberg and
    Berlin, which override ceiling height, the daylight fraction and (Bavaria)
    the rescue-window size. Germany sets no minimum room area.
  - A rule can be `conditional`, with the condition in both languages: it binds
    only in circumstances the plan does not record (the storey, the building
    class, a fire-brigade ladder as the second escape route). A shortfall is
    flagged as "Check" with that condition shown, never failed.
- `js/code_check.js` (pure) and `js/code_check_plan.js` (reads the plan):
  - Habitable room area and width; one room at the larger minimum (IL); studio (IL); half room (IL).
  - Ceiling height; hallway width (US); window-to-floor ratio.
  - Emergency escape window in sleeping rooms (US), in every habitable room except kitchens (England, Germany).
  - Stair riser and tread; railing height; stair pitch and 2R + G (England).
  - Space standard (England): single, double and main bedroom area and width;
    dwelling area against NDSS Table 1 by bedrooms and bedspaces (one-storey
    figures, sum of indoor rooms, so a shortfall is flagged, not failed).
  - Safe room: presence, area, width, height, wall thickness (IL).
- The legal rules are separate from the design rules in `apartment_rules.js`. Those design rules (bedroom 7 m²) remain the generator's design advice.
- New room types: `safeRoom` (ממ״ד), `halfRoom` (חדרון), `serviceBalcony` (מרפסת שירות). The Hebrew label for `terrace` is now "מרפסת גג".
- The jurisdiction is saved with the project (`S.workspace.codeProfile`, with undo). The default is `il` in Hebrew and `us-irc-2024` otherwise.
- Tests: `tests/code_check.test.mjs`.

Still open: checking every value against the official text (then
`verified: true`); the 2024 IRC section numbers (shown as 2021 numbers); more
US states (states with their own codes, such as Wisconsin's UDC, and New York
City); the other German states (12 more, among them Hesse, Saxony, Lower
Saxony and Hamburg) and their own section numbers for stairs, guards and
rescue windows (state profiles show the MBO/DIN clause, marked as such);
Scotland, Wales and Northern Ireland; the NDSS two- and three-storey figures
and storage; France; Canada (NBC + provinces); Australia (NCC). Every other
gap below is still open.

### UK and German gaps found along the way
- **Sources disagree**: Berlin's ceiling height is 2.40 m in the law text but 2.50 m in a widely copied table; the UK escape-window sill has a disputed 800 mm lower bound; Approved Document K's 42° pitch makes the real minimum going about 244 mm at a 220 mm rise.
- **Building class (Gebäudeklasse)** decides several German rules (the 2.40 m ceiling, stair limits, fire resistance). The project does not record it; a project setting would turn several "Check" lines into real results.
- **Smoke alarms (Rauchwarnmelder)** are mandatory in German bedrooms, children's rooms and the hallways leading to them; England requires them in circulation spaces. Not checked.
- **Accessibility**: DIN 18040-2 (Germany) and Approved Document M4(2)/M4(3) (England, where the plan requires them).
- **Energy**: the German Building Energy Act (GEG) and England's Part L. No U-values exist in the model.
- **Drawing conventions**: German plans dimension in cm with superscript mm (2,40⁵) and follow DIN 1356; UK sheets use mm and A-series sizes with RIBA stages in the title block. Neither is supported.

### US-specific gaps found along the way
- **Imperial units on drawings**: the profile prints ft-in, but the drawing sheets and the title block are not adapted to ANSI sheets or architectural scales (1/4" = 1'-0").
- **Fair Housing Act / ANSI A117.1** (accessibility in multifamily housing) and the ADA: the ADA exists only in cabinets; there is no dwelling-level check.
- **Energy (IECC / California Title 24)**: no U-values for walls or windows, and no thermal envelope check. This is central to permits in the US.
- **Smoke and CO alarms** (IRC R314/R315) and **egress doors** (32" clear): not checked, because the plan does not record device types or which door is the main egress door.
- **Fire separation between a garage and the dwelling** (R302.5/R302.6): there is no garage room type.

---

## 1. Priority summary

| # | Gap | Area | Severity |
|---|---|---|---|
| 1 | No safe room (ממ"ד) room type or checks | Regulation / content | High |
| 2 | Room minimums in `apartment_rules.js` are below the Israeli legal minimum for a habitable room | Regulation | High |
| 3 | No area rules for Israel: Sale Law area (apartment area), primary/service area | Regulation / market | High |
| 4 | IFC export is a stub (proxies, no geometry, no building hierarchy) | Market | High |
| 5 | Phasing (existing / demolition / new) applies to walls only, and colours do not follow the Israeli permit convention | Market + localization | Medium-high |
| 6 | Title block in English only, without Israeli permit fields or a revision table | Localization / market | Medium-high |
| 7 | Accessibility rules follow US ADA; there is no SI 1918 profile | Regulation | Medium |
| 8 | Inconsistent Hebrew: acronyms, units, imperative voice | Localization | Medium |
| 9 | No absolute levels (±0.00 = +XX.XX) and no ITM (Israel TM Grid) coordinates | Localization / market | Medium |
| 10 | Rules are not versioned by jurisdiction, date or clause | Market / compliance | Medium |
| 11 | The app's own compliance: no privacy notice (Amendment 13) and no accessibility statement (SI 5568) | Regulation (software) | Medium (high if offered publicly) |
| 12 | Prices in ₪ without saying whether VAT is included | Regulation (consumer) | Low-medium |
| 13 | MEP has a generic profile only, with no Israeli electrical profile | Regulation | Low-medium |

---

## 2. Israeli building regulations: where the app diverges

### 2.1 Safe room (ממ"ד): missing entirely
`js/room_presets.js` has no `mamad` / safe-room preset, and no module checks
for one. In Israel, a safe room is a basic part of almost every new apartment
plan. A professional user will look for it first.

What is needed, as a separate room type with its own checks (*verify* against the
current Home Front Command specification; sources say a May 2026 edition
replaced the October 2024 one):
- Net area about 9 m² (smaller only with approval, at least 5 m²); net height 2.50 m; width at least 1.60 m.
- Reinforced-concrete walls of a set thickness (sources disagree: 20-25 cm inner, 30-35 cm outer, depending on region and spec).
- Blast door (opening about 80/200, sources disagree) and a blast window with a steel shutter, plus clearances around both.
- It must not be a passage room, with rules on its position relative to the stair core and on what may be built into its walls.
- Areas: in practice the safe room is counted as service area in the permit table (see 2.3).

Recommendation: a `safeRoom` preset in a new category, a wall `kind` of
"reinforced concrete" with locked minimum thickness, door and window types
"blast door" / "blast window", and a rule in `apartment_rules.js` that refers to
the spec edition.

### 2.2 Minimum room sizes and ceiling height
`apartment_rules.js` `MIN_ROOM`: bedroom 7 m² with a 2.40 m short side. Per the
Planning and Building (Permit Application) Regulations, as summarised in the
sources (*verify*):

| Requirement | Regulation (per sources) | App today |
|---|---|---|
| Habitable room: minimum net area | 8 m² | bedroom / child's room 7 m² |
| Habitable room: minimum width | 2.60 m | 2.40 m |
| One room of at least 12 m² in an apartment with 2+ rooms | Yes | Only `living` 12 m², and only if a living room exists |
| One-room apartment | at least 14 m² | No check |
| Half room (חדרון) | 6 m², 2.00 m width | No such type |
| Ceiling height, habitable room | 2.50 m (amended 19.10.2025) | No check |
| Window: about 10% of floor area | Yes (some sources say 8-10%) | Exists (10%), good |
| Toilet / bathroom window | 10% of the room, at least 0.3 m², or mechanical ventilation | No check |

Recommendation: split the rules into two classes, as professional tools do. One
class is legal minimums (per jurisdiction, with a clause reference). The other is
design advice ("comfort", what the generator holds itself to). Today
`MIN_ROOM` mixes the two and falls below the legal minimum.

### 2.3 Area calculations
`js/project_area.js` reports clear area: indoor, balconies, footprint. In the
Israeli market there are three different "areas", and a professional user
expects all three:
1. **Room net area**: exists.
2. **Apartment area per the Sale Law specification form (2008 amendment)**, often called door-to-door area: measured to the outer face of exterior walls, the full thickness of walls bordering common property, and half of walls shared with a neighbouring unit. External cladding is excluded (*verify* the exact wording, including the safe room, in the official form on gov.il). This is the number buyers and appraisers check.
3. **Permit area table**: primary area vs service area (safe room, storage, stair core, technical spaces), per the Calculation of Areas regulations of 1992. Note the December 2023 amendment, which removed the duty to split them in *plans*, and the planned move to a volumetric method. Permits and committees still use this table.

Market equivalent: Revit Area Schemes (Gross / Rentable), and ArchiCAD Zones
with calculation rules per country (for example DIN 277). Recommendation: an
"area scheme" concept with an `il-sale-law` scheme and an `il-permit` scheme,
and an area table exported to the sheet and to CSV.

### 2.4 Stairs and railings
`js/core/product_rules.js` (circulation): risers 15-19 cm. Israeli sources
cite (*verify* against the second schedule of the regulations and SI 1142):
riser up to 17.5 cm, tread at least 26 cm, railing at least 105 cm on landings
and balconies (90 cm along the stair pitch), gaps that a 10 cm ball cannot pass
through. 19 cm is above the Israeli maximum. A professional tool would check
`2R+T` and railing height as named rules.

### 2.5 Accessibility
`js/cabinet_standards.js` holds a US `ada` profile (2010 ADA, 804.3).
`js/access_review.js` checks reachability with a 60 cm body width. In Israel the
relevant sources are SI 1918 (part 5.2 covers accessible dwellings) and Part 8 of
the permit regulations. Recommendation: an `il-1918` profile next to ADA, and a
wheelchair mode in `reviewAccess` (clear passage, turning circle, door clear
widths). Take the values from the standard itself; the search did not find
reliable figures.

### 2.6 MEP / electrical
`js/mep_profile.js` has only `generic-residential` (correctly marked
`certified: false`). There is no Israeli profile covering 230 V / 16 A, bathroom
zones under the electricity regulations, RCDs, or the number of points the sale
specification form lists per room. This is low priority, but an
`il-residential` profile would make the rough-in credible to an Israeli
electrician.

---

## 3. Market conventions: concepts and workflows

### 3.1 IFC (high)
`toIFC()` in `js/exports_pro.js` writes only `IFCBUILDINGELEMENTPROXY` and
`IFCFURNISHINGELEMENT` with no geometry, no placement, and no
`IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey` hierarchy. Most viewers
will open an empty file or reject it. What the market expects from a tool that
says "IFC": IFC4 Reference View with `IfcWall`, `IfcSlab`, `IfcDoor`,
`IfcWindow`, `IfcSpace` (with area and name), storeys, and units.
Recommendation: either build a minimal valid export (walls as extrusions,
spaces, storeys) or hide the button until it exists. A "working" export that
yields an empty file damages trust more than a missing feature.

### 3.2 Phasing / renovation
There is a `phase` on walls (`new` / `demolition`), drawn red and dashed
(`js/plan2d/overlays.js`). In Revit and ArchiCAD, phase or renovation status
applies to **every** element (walls, openings, furniture, MEP), with an
existing / demolished / new filter per view. In Israeli permit drawings the
common convention is **demolition in yellow and new work in red** (or hatched).
The app currently uses red for *demolition*, the opposite of what an Israeli
architect expects (*verify* against the local committee's guidelines). The DXF
has no layer split by phase, and every layer is colour 7.

### 3.3 Drawing sheets
- `titleBlockSVG` (`js/sheet_print.js`) has hard-coded English labels (`SCALE`, `DATE`, `SHEET`) and an English default note, even when the UI is in Hebrew.
- There are no fields that are standard on Israeli sheets: parcel numbers (גוש / חלקה / מגרש), the governing zoning plan (תב"ע), address, client, the applicant and engineer with their registration numbers, signatures, and request/permit number.
- There is no revision table or issue status (preliminary / for permit / for construction). Both are standard in every professional tool.
- Default sheet numbering is `A-101` (US NCS). That is fine as an option, but should not be forced.

### 3.4 Levels and coordinates
- No absolute level (±0.00 = +XX.XX above sea level), which appears on every Israeli section and plan. `±0.00` appears only as a display label.
- `js/site.js` works in WGS84 / OSM. Israeli survey maps are in ITM (Israel TM Grid, EPSG:2039). A professional user imports the survey and expects ITM coordinates and a base point.

### 3.5 What is already on par with the market (no gap)
Wall location line (exterior face / core), clear interior dimensions,
door/window schedule (CSV), plan scales 1:50/1:100, north arrow, a 10% daylight
check, a geometric reachability check, parametric opening dimensions.

---

## 4. Hebrew localization

Measured with a script over `js/i18n/he.js`, `js/modeler_strings.js` and
`js/survey_strings.js`:

| Issue | Measurement | Recommendation |
|---|---|---|
| Acronyms: ASCII `"` vs gershayim `״` | he.js: 33 vs 25; modeler: 9 vs 19 (`ס"מ` 11 times and `ס״מ` 19 times in the same file) | Pick one. The Academy of the Hebrew Language form is `״` (U+05F4); add a test |
| Geresh: `'` vs `׳` | he.js: 23 vs 31 (`מ'` 7, `מ׳` 4) | Same |
| `׳…׳` used as quotation marks (`׳על קיר׳`) | Dozens in the tutorial | Acceptable for a nested quote; for a UI term, `"…"` / `״…״` is more common |
| Imperative voice | he.js: 181 plural (`לחצו`) vs 124 masculine singular (`הזן`, `בחר`, `שמור`); modeler: 203 vs 32 | The current Israeli convention is gender-neutral plural or infinitive. Unify; masculine singular reads as dated and non-inclusive |
| Unit labels | `מטר` written out in full alongside `מ'` / `מ׳` | One table of short units; Israeli plans show dimensions in cm with no unit |
| Room terms | `טרסה` (common in Israel: מרפסת גג / מרפסת שמש); missing מרפסת שירות, מסתור כביסה, מחסן דירתי, חניה, ממ"ד, חדרון | Add as types, not just as names |
| English CAD terms in Hebrew text | `Extrude`, `Fillet`, `Loft` next to the Hebrew | Fine: Israeli engineers work with the English terms. Keep the English in brackets, consistently |
| Dates | `toLocaleString()` without a locale (`js/persist.js`, `js/modeler/library_io.js`) follows the browser, not the app language | Pass `he-IL` / `en-GB` by the app language (as `ui_nest.js` already does) |
| Currency | `"₪" + n.toLocaleString("en-US")` | `Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS"})`, plus "incl. VAT" |
| Title block / sheet note | English only | Translate, and set the sheet direction to RTL for Hebrew text |

---

## 5. Regulations for the software itself

These apply if the app is offered to Israeli users (a public deployment:
`HOME3D_PUBLIC=1` in `render.yaml`).

1. **Web accessibility**: Equal Rights for Persons with Disabilities regulations (accessibility adjustments to service), 2013, regulation 35, with SI 5568 (based on WCAG 2.0/2.1 AA). An accessibility statement is required. There is none in the app today (no matching text in `js/` or `index.html`).
2. **Privacy**: the Privacy Protection Law, Amendment 13 (in force since 14.08.2025). The app sends plan data to AI providers (the agent: OpenAI / Gemini / Ollama), runs a multiplayer relay, and proxies product pages. It needs a privacy notice saying what goes where, user consent before sending to an external provider, and a check of whether a database notification or a DPO is required.
3. **Consumer protection**: a price offered to a consumer in Israel must include VAT (18% since 1.1.2025). Cabinet price estimates (`ui_cabinet*.js`, `nest.js`) show ₪ without saying so.
4. **Disclaimers on checks**: a sentence such as "the rulebook says what a correct apartment is" invites a reading of permit compliance. Every check shown to the user needs: source, version or date, clause, and "advisory, not a substitute for the permitting authority". `mep_profile.js` already does this; extend it to the rest.

---

## 6. Suggested order of work

1. Separate legal rules from design rules, with a `jurisdiction` + `edition` + `clause` field per rule (foundation for everything below).
2. An `il` profile: room minimums, ceiling height, stairs/railings, ventilation, safe room. Values only after checking the official text.
3. Area schemes: Sale Law area and permit table.
4. Phasing on all elements, with Israeli colours and DXF layers per phase.
5. A Hebrew, localized title block with permit fields and a revision table.
6. Clean up Hebrew strings, with a test that blocks mixing `"` / `״` and `'` / `׳`.
7. A valid IFC export, or hide the button.
8. Privacy notice, accessibility statement, VAT label.

---

## Sources (secondary; verify against the official text)

- Minimum room sizes and the October 2025 amendment: [massad-group](https://massad-group.com/%D7%AA%D7%99%D7%A7%D7%95%D7%9F-%D7%92%D7%95%D7%91%D7%94-%D7%9E%D7%99%D7%A0%D7%99%D7%9E%D7%9C%D7%99-%D7%AA%D7%A7%D7%A0%D7%95%D7%AA-%D7%94%D7%91%D7%A0%D7%99%D7%94-2025/), [sh-lawyer](https://www.sh-lawyer.co.il/single-post/%D7%A9%D7%98%D7%97%D7%9D-%D7%94%D7%9E%D7%99%D7%A0%D7%99%D7%9E%D7%9C%D7%99-%D7%A9%D7%9C-%D7%97%D7%93%D7%A8%D7%99-%D7%94%D7%91%D7%99%D7%AA), [broker-re](https://www.broker-re.co.il/%D7%9C%D7%9E%D7%94-%D7%A0%D7%99%D7%AA%D7%9F-%D7%9C%D7%A7%D7%A8%D7%95%D7%90-%D7%97%D7%93%D7%A8-%D7%9E%D7%92%D7%95%D7%A8%D7%99%D7%9D/)
- Windows and ventilation: [klil](https://www.klil.co.il/%D7%9E%D7%A8%D7%9B%D7%96-%D7%9E%D7%99%D7%93%D7%A2/%D7%97%D7%9C%D7%95%D7%A0%D7%95%D7%AA-%D7%95%D7%97%D7%93%D7%A8%D7%99%D7%9D-%D7%9E%D7%99%D7%93%D7%95%D7%AA-%D7%95%D7%A9%D7%98%D7%97%D7%99%D7%9D-%D7%9E%D7%99%D7%93%D7%95%D7%AA-%D7%97%D7%9C%D7%95%D7%A0%D7%95%D7%AA-%D7%A1%D7%98%D7%A0%D7%93%D7%A8%D7%98%D7%99%D7%99%D7%9D/)
- Sale Law specification form (2008 amendment): [gov.il, official form](https://www.gov.il/BlobFolder/legalinfo/mecher_law/he/law_34_moch.pdf), [kehilot](https://www.kehilot.co.il/%D7%A9%D7%A7%D7%99%D7%A4%D7%95%D7%AA-%D7%95%D7%90%D7%97%D7%99%D7%93%D7%95%D7%AA-%D7%91%D7%97%D7%99%D7%A9%D7%95%D7%91-%D7%A9%D7%98%D7%97-%D7%94%D7%93%D7%99%D7%A8%D7%94/), [noamneer](https://www.noamneer.com/2018/02/26/%D7%A9%D7%98%D7%97-%D7%93%D7%99%D7%A8%D7%94-%D7%9C%D7%A4%D7%99-%D7%97%D7%95%D7%A7-%D7%9E%D7%9B%D7%A8-%D7%A9%D7%98%D7%97-%D7%A4%D7%9C%D7%93%D7%9C%D7%AA/)
- Safe room: [adrk](https://adrk.co.il/mamad-takni), [ogen-eng](https://ogen-eng.co.il/standard-mamad-planning-home-front-command/), [doconstruction 2026](https://doconstruction.co.il/mamad-construction-guide-israel-2026/)
- Stairs and railings: [bedekb (SI 1142)](https://www.bedekb.co.il/2022/08/%D7%AA%D7%A7%D7%9F-%D7%9E%D7%A2%D7%A7%D7%94-%D7%9E%D7%93%D7%A8%D7%92%D7%95%D7%AA/), [orprojects](https://www.orprojects.org/guides/stairs-railing-rules/)
- Area calculations / primary vs service: [nadlancenter, volumetric method](https://www.nadlancenter.co.il/article/8457), [goldfarb](https://www.goldfarb.com/he/%d7%aa%d7%a7%d7%a0%d7%95%d7%aa-%d7%94%d7%aa%d7%9b%d7%a0%d7%95%d7%9f-%d7%95%d7%94%d7%91%d7%a0%d7%99%d7%94-%d7%97%d7%99%d7%a9%d7%95%d7%91-%d7%a9%d7%98%d7%97%d7%99%d7%9d-%d7%95%d7%90%d7%97%d7%95%d7%96/)
- SI 1918: [Standards Institution](https://www.sii.org.il/he/lobby/standardization/standard-page?id=5491)
- Web accessibility / SI 5568: [Kol Zchut accessibility statement](https://www.kolzchut.org.il/he/כל_שירות:נגישות), [Open University](https://www.openu.ac.il/Lists/MediaServer_Documents/מייטלגרייבר.pdf)
- Privacy, Amendment 13: [Pearl Cohen](https://www.pearlcohen.com/israel-significant-amendment-to-the-privacy-law-takes-effect/), [Meitar](https://meitar.com/wp-content/uploads/2025/07/Amendment-13-to-the-Privacy-Protection-Law-Is-on-the-Horizon-–-Is-Your-Organization-Ready-for-the-New-Era-in-the-World-of-Privacy.pdf)
- VAT 18%: [Chamber of Commerce](https://www.chamber.org.il/serviceslobby/finance/1427/154341/), [Kol Zchut, Consumer Protection Law](https://www.kolzchut.org.il/he/חוק_הגנת_הצרכן)
- The yellow-demolition / red-new permit convention: industry practice. The search did not find an official source, so check the local committee's guidelines.
