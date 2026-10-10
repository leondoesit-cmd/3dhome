# BATTERY actual source-tolerance live driver audit

Read-only comparison against `BATTERY-front-detail-native-three-dims-browser-2026-10-10.mforge`. Parent authored the actual Smart Dimension change, Finish plane, Native1 rebuild, then Undo and native restoration. Protected exports remain untouched.

| Actual export | Bytes | SHA256 |
|---|---:|---|
| BATTERY-source-tolerance-driver-minus003-browser-2026-10-10.mforge |1836898|`0fe9475694979cacac0312ce6e256d4547d6b65b7f4bf53e7ccb772008f7bf02`|
| BATTERY-source-tolerance-driver-restored-browser-2026-10-10.mforge |1836908|`f64f2fd8fc896dcfbb0bf6a69abf11052267e2b68aaafe20d48cfc65987551f7`|

The changed export has one source-authoring difference: sketch `sk_2h7bg`, diameter constraint `dim_ojqqrap`, tolerance lower bound −.00508cm to −.007620000000000001cm, exactly −.002in to −.003in. Its nominal diameter remains1.27cm (.500in), upper deviation0, source tolerance unit inches and tolerance precision3. Source features/history and native part geometry are exact; only rebuild token, signature and audit/rebuild timestamps differ. The four changed topology-cache signatures are derived cache keys; the native geometry itself is unchanged.

**Whole drawing is exact in both exports, with ten dimensions.** Diameter `dnvcndvw` retains native Top rim `feature_muk70mqo_8:tool:edge:profile:61:start`, radius.635cm and live Model Item source `sketch:sk_2h7bg:constraint:dim_ojqqrap`. It has no literal text or tolerance override. Actual changed SVG displays `⌀0.50 [12.70] +0.000/−0.003`; actual restored SVG displays `⌀0.50 [12.70] +0.000/−0.002`. Thus the source metadata drives the drawing without changing drawing authoring or geometry.

Undo restores all sketches, features, history, drawing and topology signatures exactly. Remaining baseline/restored differences are native build token22→23, rebuild/audit timestamps and an added redundant `meshData.bounds` object matching the existing native bounds. Native mesh positions/normals/indices and all other native part data are exact after excluding those two derived part fields.

Limited acceptance: actual metadata-only tolerance edit, associated drawing update and Undo restoration pass. Native1 is the parent's actual browser witness; this audit independently checks stored native geometry equality and persistent association. No raw SVG byte-equality or complete Chapter9 tutorial acceptance is claimed; active selection can alter SVG styling. Per-dimension nominal precision and native cone angle are separate forthcoming browser proofs.
