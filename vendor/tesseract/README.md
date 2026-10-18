Local OCR assets for blueprint import; nothing is fetched from a CDN at runtime.

- Tesseract.js 6.0.1: https://github.com/naptha/tesseract.js (Apache-2.0; see LICENSE.js.md)
- tesseract.js-core 6.0.0: https://github.com/naptha/tesseract.js-core (Apache-2.0; see LICENSE.core)
- English/Hebrew tessdata_fast, revision 87416418657359cb625c412a48b6e1d6d41c29bd: https://github.com/tesseract-ocr/tessdata_fast (Apache-2.0; see LICENSE.lang)

Language SHA-256:

eng.traineddata: 7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2
heb.traineddata: 11f9e43ab227f786352a50f75c94c2e9906f1baba86d93276da19da7ce0904db

The browser chooses the appropriate SIMD/LSTM core; keep all four .wasm/.wasm.js pairs.
