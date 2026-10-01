# Housing cold support-plane repair

The actual browser-authored checkpoint `FLASHLIGHT-rib-contact-placement-browser-2026-09-30.mforge` reproduced a native failure through Rib2 when replayed using the stripped authoring document used by assembly interference. Both cold and warm runs failed at sketch coordinate `(0.351138, -4.494817)`, thickness offset `-0.095250 cm`.

An unstripped canonical replay succeeded. Its topology naming hints preserved the expected generated edge identities. The stripped replay extracted different ordinal names; the old native support lookup accepted those names without checking their physical descriptors. LongRibPlane follows two edges meeting at a retained vertex, so an unrelated edge junction could move the plane.

## Repair

- `core/support_reference_lookup.js` resolves generated ordinal support references from retained geometric descriptors. Stable semantic references continue to follow upstream edits.
- `cad_feature_tree.js` uses the same lookup for attached sketch execution and final datum display.
- Compiled consumers of generated support-plane ancestry receive `descriptor-support-1`. Unaffected upstream Shell and Pattern prefixes retain their cache keys.
- Native Rib reach qualification remains enforced. Its failure now identifies the actual sketch coordinate and thickness offset.

## Native qualification

Read-only replay script: `scratch/planchard/housing-rib2-cold-native-audit.mjs`. It regenerates the existing browser-authored model without changing its recipe.

| Path through Rib2 | Result | Volume cm³ |
| --- | --- | ---: |
| Original unstripped canonical | Pass | 216.73581748469144 |
| Original stripped cold | Fail at arc contact | — |
| Original stripped warm | Same failure | — |
| Repaired stripped cold | Pass, no issues | 216.73581748469144 |
| Repaired stripped warm, serialized native prefixes | Pass, no issues | 216.73581748467305 |

This qualification is through Rib2, not a final whole-assembly clearance result. Actual Chrome final Housing acceptance remains with the parent agent.

13 focused support/offset tests passed. Full source gates passed: 614 linked modules and 1490 source assertions.
