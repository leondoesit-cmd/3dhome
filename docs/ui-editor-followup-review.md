# UI editor audit: findings 26–75

Reviewed September 12, 2026 against the working tree. The first attachment's local findings 1–25 are numbered 26–50 here; the second attachment already uses 51–75.

38 findings received fixes or defensive improvements. Twelve describe intentional behavior or behavior already present. “Hardened” does not mean the precise failure alleged by the audit was reproduced.

| Finding | Disposition | Result |
| --- | --- | --- |
| 26 Root drag snapshot | Fixed | Copy canvas/form state on the snapshot root as well as descendants. |
| 27 Duplicate tree double-click | Fixed | Use a single double-click tracking path. |
| 28 Rename Enter/Escape | Fixed | Prevent defaults; editor capture yields to the inline field. Enter commits, Escape cancels. |
| 29 Reselection expansion | Fixed | Record empty selection so selecting the same node again expands its ancestors. |
| 30 Hover expansion during drag | Fixed | Reconnect the active drag row and its styling after rebuilding the tree. |
| 31 RTL drop previews | Fixed | Indicator and placeholder edges follow descending visual order, including reversed columns. |
| 32 Missing drop rectangle | Hardened | Return null for an unmeasured container. |
| 33 Ungroup structural containers | Intentional | Unbound bars/stacks/docks may be dissolved. Root, slot-bound and explicitly protected containers remain blocked; limiting this to groups would remove supported behavior. |
| 34 Missing variants during ungroup | Hardened | Tolerate absent variants in the operation. |
| 35 Submenu schema type | No change | Menus use a schema group and a registry entry of kind menu. A schema type named menu is unsupported. |
| 36 User menu detection | Already supported | Host surfaces register dynamic menu entries; detection by entry kind works. |
| 37 Menu inspector controls | Already supported | Dynamic menus expose entry kind menu; browser coverage verifies divider insertion. |
| 38 Insert-menu type | No change | A group with a menu reference is the correct representation. |
| 39 Reset shipped properties | Fixed | Base resets restore shipped defaults; responsive resets remove the patch and inherit base values. |
| 40 False override indicators | Fixed | Compare base fields with shipped values before enabling reset controls. |
| 41 Variant theme tokens | Intentional | Variant tokens are complete isolated snapshots. Merging base tokens would alter a screen size after it was customized independently. |
| 42 Negative sizes | Hardened | Use a minimum of one when no explicit lower bound is provided. |
| 43 Anchorless icon picker | Fixed | Center it in the viewport. |
| 44 Shorthand hex | Fixed | Expand three-digit colors before deriving hover colors. |
| 45 Saved snapshot aliasing | Hardened | Clone the document before handing it to storage, including adapters that retain references. |
| 46 Delete saved layouts | Added | Scoped deletion API and a localized, accessible delete control beside each saved layout. |
| 47 Import migration | Fixed | Invoke host migration before normalization; report migration errors without applying a document. |
| 48 Adopted icons | Fixed | An optional host icon contract applies custom glyphs and restores the original on reset/release. Restrict changes to the command's own glyph. |
| 49 AZERTY shortcuts | Fixed | Prefer typed Latin letters; retain physical-key fallback for Option composition and non-Latin layouts. |
| 50 Wall angle reference | Hardened | Capture the reference used when displaying the angle and reuse it at commit. The exact disconnected-wall mismatch was not reproduced: existing previous-angle checks already agree. |
| 51 Schema menu type | No change | Same schema/registry distinction as 35–38; adding menu to the schema is not the appropriate repair. |
| 52 Parent indexing | Hardened | Handle missing, null, or array-shaped node maps. |
| 53 Array-shaped variants | Fixed | Reject/repair arrays in variant maps, variants, base variants, and patches. |
| 54 Reset with limited storage adapters | Improved | Track saved scopes in a manifest and clear retired scopes plus current/default scopes. An adapter without enumeration cannot discover opaque orphan keys written before this manifest existed. |
| 55 Borrowed slot coordinates | Fixed | Find slots by their data attribute without adding host classes. Browser testing additionally found floating nodes were becoming the overlay itself: floating nodes now receive their own box inside it. |
| 56 Long-press stale drag | Fixed | Clear the old drag state when long press drills into a container. |
| 57 Context menus in customize mode | Fixed | Suppress conflicting host/native menus while preserving native behavior for editor text inputs/handles. |
| 58 Resize observer retention | Fixed | Unobserve elements removed or replaced during editing. |
| 59 Masked registry constraints | Fixed | Merge registry constraints with node constraints so unrelated node settings do not erase protection. |
| 60 Multi-selection hide | Fixed | Apply one consistent visibility change to all selected eligible nodes in one undo step; skip protected nodes with feedback. |
| 61 Insertion position | Fixed | Insert beside the selected child by default. Determine containers by schema type rather than resolved children arrays, which also exist on leaves. |
| 62 File read errors | Fixed | Handle read errors, aborts, and synchronous read exceptions with feedback. |
| 63 Export URL lifetime | Hardened | Delay object-URL revocation for 30 seconds rather than revoking immediately. Slow-browser download completion was not reproduced directly. |
| 64 Escape in confirmation | Fixed | Dismiss confirmation before handling editor exit. |
| 65 Language switch state | Fixed | Repaint inspector text without ending the customization session. Preserve selection, tree focus/search/expansion, inline rename draft/caret, open sections, and relevant form values. Icon popovers close during repaint. |
| 66 Stale language document | Fixed | Read the current instance's mount document when handling language changes. |
| 67 Untagged adopted labels | Fixed | Update an unambiguous direct text node or leaf span, preserving glyphs and host children; restore the original label on release. Ambiguous host markup remains untouched. |
| 68 Existing slot children | Intentional | Preserve unclaimed host content. Clearing borrowed slots would destroy host-owned UI. |
| 69 Insert aliases/defaults | Fixed | Deep-clone supplied nodes and apply schema defaults before insertion. |
| 70 Already-placed palette items | Intentional | Commands support multiple placements, including replicas that still execute the original command. |
| 71 Menu titleFallback | Already supported | The host registry resolves titleFallback into title. Covered with a real dynamic menu. |
| 72 Dock orientation fallback | Not reproduced | Dock seeds are deterministic and the existing default-axis fallback provides a value. |
| 73 Escape-warning lifecycle | Fixed | Track the source parent, clear suppression on return/undo/removal, and warn on a subsequent departure. Returning home does not itself warn. |
| 74 Customize checkmark | Already correct | The current implementation sets aria-checked. Browser coverage checks the menu-item state. |
| 75 Scoped text and patches | Partially accepted, fixed | Preserve app-wide text overrides when applying a base layout. Keep dense presentation snapshots: their explicit values/nulls intentionally preserve the other screen sizes' appearance. |

## Validation

- Full project test run: 2,445 passed.
- UIKit unit suite: 157 passed, including 13 new follow-up tests.
- Focused browser suite: 34 passed (22 follow-up, 2 host integration, 10 earlier regression tests).
- Existing designer, inspector, tree, touch and adoption suites: initial run 97/99. The two failures identified warning-return behavior and seven untranslated CAD command names. The warning implementation/test and missing English/Hebrew dictionary entries were corrected; both cases passed on rerun.
- Project checks validate free identifiers, the 458-module import graph, and source assertions.
- Live browser smoke check opened customization and saved a demo layout; the named layout and accessible delete control appeared correctly.

New coverage lives in `uikit/tests/audit_followup.test.mjs`, `tests/uikit_audit_followup.browser.mjs`, and `tests/uikit_host_audit.browser.mjs`. Existing reset expectations now check shipped geometry, and the warning regression checks renewed warnings after returning home.

The workspace also contains unrelated in-progress CAD, cabinet, and survey changes. They were not reset or committed by this review.
