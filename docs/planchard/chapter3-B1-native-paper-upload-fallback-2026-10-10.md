# Chapter3 B1 — native-paper fallback

Supplied PDF152 / printed3-24 Exercise1; actual924×444 crop visually inspected. Read-only plan; ordinary browser Paper tools only, no authored CAD/JSON/import. Coordinates are source-estimated illustrative paper mm: X35+pixelX×180/924, Y45+pixelY×180/924. Figure envelope180×86.49. Preserve original R.625, Ø1.500 and inside2.00; no corrected manufacturing diameter inferred. Outline arrowheads and native fonts differ from the raster source.

## Source geometry

One Visible closed polyline:

```text
46.69,78.70; 104.94,78.70; 104.94,122.73; 46.69,122.73; 46.69,78.70
```

Two Visible circles: centre(171.75,100.71), radii22.11 and9.16. These **paper radii reproduce the picture**, not the conflicting literal source R.625 bore. Longitudinal Front rectangle plus circular Right end. Three Centerline lines:

```text
39.29,100.52 → 112.14,100.52
147.01,100.71 → 196.88,100.71
171.75,75.97 → 171.75,125.65
```

Two Hidden bore lines:

```text
46.69,91.56 → 104.94,91.56
46.69,109.87 → 104.94,109.87
```

Four Visible extension/dimension lines, retaining the inside length label:

```text
46.49,113.57 → 46.49,124.87
104.94,113.57 → 104.94,124.87
46.69,117.27 → 71.23,117.27
84.09,117.27 → 104.94,117.27
```

Two Visible leader polylines:

```text
R.625: 143.31,66.04; 150.32,66.04; 166.88,92.53
Ø1.500: 190.84,55.52; 184.22,55.52; 177.60,78.70
```

Four Visible closed triangular arrowhead polylines; repeat first vertex to close:

```text
46.69,117.27; 49.29,117.77; 49.29,116.77
104.94,117.27; 102.34,116.77; 102.34,117.77
166.88,92.53; 165.93,90.06; 165.08,90.59
177.60,78.70; 178.79,76.34; 177.83,76.06
```

## Original labels and error notes

Three one-line Notes at text origins: `R.625`(128.90,63.70), `Ø1.500`(193.77,53.18), `2.00`(72.60,114.74). Initial Note clicks X−6/Y+6, or ordinary Edit Note XY. Keep original values; source R.625 would literally equal Ø1.250, not Ø.625. Native paper circle dimensions do not resolve publisher intent.

Add existing two Visible error circles: (133.77,66.04,r7.60) around radius callout and (77.08,117.47,r8.18) around inside length. Add three explanatory Notes at text origins (240,60)/(240,85)/(240,155), using exact B1 header/eight-line answer/four-line qualification from `chapter3-earlier-dimension-errors-ready-paper-plan-2026-10-10.md`. Header line4 becomes `Native paper reconstruction; source-estimated strokes`.

Expected **20 primitives**:1 outline+2 figure circles+3 Centerline+2 Hidden+4 dimension lines+2 leaders+4 arrowheads+2 error circles; **6 Notes/20 LF rows**, zero images and zero CAD. Ordinary numerical primitive editing should supply exact listed paper values. Inspect glyph gaps/readability; disclose small font-placement adjustments if needed. Save/export and exact Saved cold acceptance remain pending; no physical/model accuracy claim.
