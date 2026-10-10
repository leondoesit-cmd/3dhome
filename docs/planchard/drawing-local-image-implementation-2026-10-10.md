# Local drawing logo/image implementation — 2026-10-10

Supplied book PDF445/printed9-11, steps57–63, explicitly inserts local `LOGO/Logo.jpg`, disables the scale toolbox/aspect lock, sizes the picture beside the title block and confirms it. PDF446 continues sheet format saving. The official companion ZIP inventory contains the original LOGO and Chapter9 duplicate JPEG; original asset was extracted without modification to `scratch/planchard/original-logo-assets/Logo.jpg` (12,144bytes), with a test fixture at `tests/fixtures/planchard-logo.jpg`, SHA256 `dd03568be7f19e6437eee1583a0f7027439e6311ff38acdd0ba0faa7e68636f7`. Source assets are available; no companion-unavailable claim applies.

## Ordinary browser controls

Drawing toolbar **Insert image** → click the desired paper location → ordinary browser local file chooser (PNG/JPEG) → **Insert drawing image** form. Fields: **Left position (paper mm)**, **Top position (paper mm)**, **Image width (paper mm)**, **Image height (paper mm)**. Apply creates the embedded image. Width/height are independently editable, matching the source's disabled aspect lock. **Edit image** → click the existing image opens those fields; **Remove image** → click removes it. Each accepted operation has one undo step; canceled/invalid/stale forms have no authoring mutation. File chooser cancel preserves drawing/history.

Suggested original source asset for actual parent browser proof: `C:/Users/liron/Desktop/3dhome/scratch/planchard/original-logo-assets/Logo.jpg`. A blank A3 landscape sheet has420×297mm paper; choose a position/size appropriate to the visible title block rather than treating source screenshots as dimensional measurements. Actual browser source/logo placement, Save, cold reopen and SVG remain parent-owned acceptance.

## Persisted and rendered behavior

Optional `drawing.images` array stores stable ID/name, embedded raster data URL and paper-mm x/y/w/h. It survives generic canonical sheet normalization/history/cold JSON. Shared scene emits an image primitive after sheet/title graphics. Canvas decodes the embedded local pixels and draws the requested rectangle; ordinary SVG embeds the same data URL in an `<image>` with explicit paper position/size and `preserveAspectRatio="none"`. Export has no external asset dependency. Paper-image-only documents are saveable and classified as Drawing annotations.

Import accepts PNG/JPEG only, with file/content/header validation, real browser decode, valid dimensions up to4096×4096 and at most2MiB each; ordinary insertion permits at most32 images. Image rectangle must remain within paper with finite positive dimensions. External URLs, SVG payloads, wrong MIME/header, oversized pixels/files and malformed/off-paper records are rejected/diagnosed. Browser decode failure is rejected before insertion. Image cache is bounded to32 entries. No remote fetch or CAD model modification occurs. Reusable template/independent sheet-format Save/New remains a separate workflow; proprietary SolidWorks template import is not claimed.

## Validation and limits

**13/13 focused tests PASS** across four new image cases, five existing Drawing-library cases and four neighboring export cases. Meaningful new proofs cover original supplied JPEG plus real PNG pixels, embedded/cold SVG equality, independent size, invalid inputs, image-only Save classification, actual controller Insert/Edit/Remove with a history callback replacing normalized document records, Undo/cancel/invalid/stale guards and browser decoder failure before authoring. Full `npm run check` PASS: no free identifiers, no link errors (677 modules), all1487 source assertions checked. Actual Canvas/file-chooser/browser cold proof is not substituted by Node tests.

During integration, parent observed a transient live reload between host-hook and chooser-definition patches. The missing chooser definition was completed; final graph/gates are stable. That intermediate failed Break reload remains diagnostic, not accepted evidence. No actual browser/CAD/model-state/ADVANCE/ledger/Git writes by this agent.
