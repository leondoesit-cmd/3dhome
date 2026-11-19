# Local floor-plan import

Run `npm run setup:blueprint` once, then `npm start`. The setup verifies pinned
model and runtime checksums. Windows automatic import prefers Qwen3.5-9B when
installed; older installations remain supported. `--light` installs Qwen3.5-4B,
and `--legacy-8b` / `--legacy-4b` install the older Qwen3-VL models. Prompt RAM
caching is disabled because each image crop differs, avoiding an unnecessary
8 GB cache allocation.

Optional local model comparisons: `npm run setup:blueprint -- --gemma-e4b` or
`npm run setup:blueprint -- --gemma-12b` install pinned Gemma 4 weights and
their image projection. Set `HOME3D_BLUEPRINT_MODEL` to `gemma-e4b` or
`gemma-12b` before starting the server to select one explicitly. Stop the
previous local inference runtime before switching; an already running engine
continues serving its loaded model. These options do not send images online.

An existing GGUF server can also provide automatic recognition on the fixed
loopback endpoint. On this workstation, the Desktop VRAM Maximizer now selects
the installed Qwen3.8-27B IQ3_S file and its matching image projection, uses
port 8078 with the app's API-key file, and requests all GPU layers with automatic
CPU fitting disabled. Start that utility's server, wait for **RUNNING**, then
use **Automatic** in Import Blueprint. The app reuses the ready local engine.
Runtime logs, rather than the GPU-layer setting alone, confirm actual placement.
CPU memory is still used for model loading, tokenization and mapped embeddings.

Choose **File → Import Blueprint**, then select a JPG, PNG or WebP. Automatic
analysis starts immediately. Review the preview and warnings, then choose
**Create 3D plan**. On a phone, Import Blueprint is under the top **More** menu.
The created walls, openings and furniture remain editable, and creation can be
undone. Printed dimensions calibrate the image when readable; otherwise the
entered plan width is used.

Image decoding, wall and symbol measurement, and OCR run in the browser. The
same-origin `/api/blueprint` bridge sends images only to the authenticated local
runtime at `127.0.0.1:8078`. No external inference service is used by automatic
import. The runtime key and models stay in ignored `.local/blueprint-vision`.

The model classifies pixel-measured symbol crops; it cannot replace their
positions with guessed coordinates. Geometry survives individual crop failures.
Long inference jobs have a bounded budget and report omitted crops for review.
Recognition is a draft: faint boundaries, merged symbols, tiny fixtures and
unreadable labels can still be missed or misclassified. Heights and furniture
depths are estimates. No general floor-plan importer can recover invisible
details from an image.

The original-image oracle in `plans/images.reviewed.json` is used only by tests
and evaluation. Automatic import does not look up filenames, image hashes or
that plan's coordinates.

Verification: `node --test tests/blueprint*.test.mjs` and `npm run check`.
Real-browser checks should include the original image and an independent plan,
desktop, 390 px phone, 344 px folded and 720 px unfolded viewports. Responsive
emulation does not establish physical-device compatibility.
