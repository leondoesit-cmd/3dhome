# Offline and phone camera setup

Use `npm start` for HTTP development on localhost. For phone camera/WebXR, configure a certificate trusted by the phone:

```
HOME3D_TLS_CERT=/absolute/path/cert.pem HOME3D_TLS_KEY=/absolute/path/key.pem npm start
```

Both files are required. The server switches to HTTPS; same-origin WebSocket host checks remain in place. Use the HTTPS address directly on the phone. Certificate issuance/trust is an environment setup step; the app does not bypass certificate warnings. HTTP development is unchanged when neither variable is supplied.

Choose **As-Built Survey → Prepare for offline use** while online. This caches the static app inventory, including vendored libraries. A new cache is published only after every asset is stored. A failure or quota error leaves the previous complete cache available and does not report success. Offline reload and IndexedDB quota recovery have browser tests. API requests are never cached. Photo and practice recovery records use local IndexedDB separately from the HTTP cache. Save/export important work before clearing browser storage.

After adding browser assets, run `node tools/survey_assets.mjs` and include the updated `survey-assets.json`. Browser AR itself depends on hardware/browser support; offline caching does not make unsupported WebXR capabilities available.
