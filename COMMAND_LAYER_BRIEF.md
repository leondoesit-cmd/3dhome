# Command layer for ModelForge — implementation brief (v2)

Repo: `/Users/leonkhey/Documents/3dhome` · Branch: `main`

> v2 folds in the implementer review. Changes from v1: commands no longer own
> history (a small executor does), plans carry a version for delayed
> confirmation, `preview()` returns a serializable spec instead of a render
> handle, `apply()` returns semantic effects, and the entity inventory is
> classified rather than listed. See **Changes from v1** at the end.

## Goal

Every object the app can create must be creatable programmatically through a
validated, previewable, serializable command. Pointer handlers become one client
of that layer, not its owner. The AI tutor, generator, importers, macros,
WebMCP and multiplayer become others — sharing one history and rendering
discipline instead of each inventing its own.

This is NOT a rewrite of `interaction.js` (190KB). It is one contract, one small
executor, four commands, and a rule that drains the imperative paths over time.

## Why — the cost already being paid

Seven user-facing code paths create entities by mutating `S` directly, each with
its own validation and history discipline:

| Entity | Files that push directly to `S` |
|---|---|
| `S.openings` | `interaction.js`, `generator.js`, `ui_room_scan.js` |
| `S.walls` | `interaction.js`, `ui_room_scan.js`, `ui_site.js` |
| `S.items` | `interaction.js`, `generator.js`, `ui.js`, `markers.js`, `ui_room_scan.js`, `ui_cabinet_mobile.js` |
| `S.nodes` | `interaction.js`, `ui_site.js` |

The tutor is a customer of this layer, not the reason for it.

## Verified facts — do not re-derive

1. `history.js:496` holds `const H = createHistory({...})` and never exports it.
   Exports are only: `onAfterRestore`, `mountHistoryPanel`,
   `refreshHistoryPanel`, `pushHistory`, `beginHistory`, `commitPending`,
   `cancelPending`, `undo`, `redo`, `canUndo`, `canRedo`.
   `H` already implements `tree()`, `targetsOf(id)`, `objects()`, `labelOf(id)`,
   `scope(id)`, `touches(nodeId, ids)`, `branches()`, `position()`, `jump(id)`,
   `matchesCurrent()`, `isRestoring()`.
   Do NOT import `edit_history.js` — that gives you the factory, not the live
   instance.

2. **The transaction primitives already exist.** `H.begin()` / `H.commit()` /
   `H.cancel()` / `H.discard()` — and because `createHistory` snapshots whole
   state, `cancel()` at `edit_history.js:405` restores the snapshot *and* drops
   the step. Rollback is free and already correct. The guarded wrapper below is
   ~20 lines over working primitives, not new machinery.

3. **`H.position()` returns the current history node id** (it is `pos`, the same
   value compared as `n.id === pos` at `edit_history.js:540`). That id *is* the
   document version: undo-then-redo returns to the same node, which means the
   same state. Use it. Do NOT add a parallel `S.version` counter — it can
   desync from history; the node id cannot.

4. `interaction.js:2932` `placeOpeningAt(tool, px, pz)` is private and fuses six
   operations: filters EVERY wall within `thickness/2 + tolCm(12)`,
   `pushHistory()`, pushes an opening onto EACH match, `select()`,
   `setTool("select")`, `render2D()`, `dispatchEvent`. At a corner, one click
   creates two doors.

5. `interaction.js:213` `updateWallProbe()` already resolves a SINGLE wall via
   `hitWall()` and stores it on `S.wallProbe`. The app decides on one wall for
   hover feedback, then discards that decision at commit time. This is the fix
   for (4) — but pass `w.id`, never the live object (see Interactive targeting).

6. `interaction.js:1887` `resolveLanding(p, autoJoin)` reads `S.drawing` and
   `S.drawFrom` directly — live gesture state inside the landing rule.
   Downstream of it, `getOrMakeNode` → `splitIntersectionWalls` →
   `splitWallAt` + `weldNodes` handle welding and mid-span splitting correctly;
   they just aren't reachable.

7. `js/core/diagnostic_help.js` already implements the reason-code pattern:
   code family → bilingual cause → bilingual repair → action verb, with a
   generic fallback (~line 138). Reuse this schema. The planner side has 37 bare
   `flash(t(...))` calls and no codes.

8. `H.objects()` returns a live `Map`, and `H.tree()` / `H.targetsOf()` return
   internal node shapes. See the cloned-JSON rule below.

9. `tool_search.js` mixes curated entries with DOM-scraped ones
   (`dynamicEntries()` :192, tagged `dynamic: true` :217, concat :271).
   Separable, but never add execution semantics to a search UI file.

10. `npm run check` = `module_check && link_check && comment_assertions`.
    `npm test` = `node --test tests/*.test.mjs`. Both must pass.

## The contract

```js
{
  id: "opening.place",

  // Pure validation + normalization. Never mutates. Resolves ids and values,
  // never live objects.
  prepare(params, env) -> { ok, reason, plan },

  // Serializable ghost description. No Three.js, no DOM, no cleanup handle.
  preview(plan, env)   -> previewSpec,

  // Mutates the document ONLY. No history, no rendering, no selection,
  // no tool switch, no events.
  apply(plan, env)     -> { created, changed, effects }
}
```

A prepared plan is JSON and nothing else:

```json
{
  "command": "opening.place",
  "expectedVersion": 47,
  "params": { "wallId": 81, "type": "door", "s": 230,
              "width": 90, "height": 205, "sill": 0 }
}
```

A preview spec is JSON and nothing else:

```json
{ "kind": "opening", "wallId": 81, "center": {"x": 230, "z": 0},
  "width": 90, "height": 205, "style": "ghost-valid" }
```

A separate browser-side preview renderer consumes that spec and owns the
disposable handle. The command core never sees it.

`apply()` returns semantic effects rather than performing them:

```json
{
  "created": [{ "kind": "opening", "id": 104 }],
  "changed": [{ "kind": "wall", "id": 81 }],
  "effects": {
    "dirty3D": true, "refreshTree": true, "refreshInspector": true,
    "events": [{ "type": "planner-opening-created", "entityId": 104 }]
  }
}
```

Non-negotiable:

- **Commands never touch history.** Only the executor does.
- `preview()` mutates nothing — no entities, no ids, no selection, no history.
- Failures return codes, never strings. Every code gets a `diagnostic_help`
  entry.
- Params are JSON-serializable: ids only, no live object refs, no DOM handles.
  This is what later makes command logs work as macros, collab ops, generative
  output and test fixtures. It costs nothing today.

## The executor

One function, not a command bus:

```js
executeTransaction({ commands, expectedVersion, label, presentation }, env)
```

Sequence: prepare all → open one history transaction → apply all → post-validate
→ commit once → coalesce effects → render once. On any failure, abort the
transaction (snapshot restored, step discarded) and return the failing code.

A pointer click calls it with one command. The generator calls it with a
hundred, and the user gets one undo step.

Guarded history wrapper in `history.js`, over the existing primitives:

```js
const tx = beginHistoryTransaction(label);
try { /* apply */ commitHistoryTransaction(tx); }
catch (e) { abortHistoryTransaction(tx); }
```

The token exists so an unrelated action cannot commit or cancel someone else's
transaction. Do not expose raw `begin`/`commit` to commands.

**Presentation is opt-in, requested by the caller, applied by the executor:**

```json
{ "presentation": { "selectCreated": true, "switchToolTo": "select" } }
```

The interactive path asks for it. Programmatic callers do not, and therefore
never silently move the user's selection or active tool — the exact bug
`placeOpeningAt` would otherwise propagate.

### Executor scope discipline

The executor ships with **exactly the surface `opening.place` needs**. Batch is
naturally the same code (prepare all → apply all → commit once), so keep it.
Retry policy, effect-coalescing rules and conflict resolution wait for a second
real caller. This is the line between a small coordinator and the generic
framework this brief exists to prevent.

## Delayed confirmation (preview → confirm)

The tutor previews a door, asks the user, and the user edits or undoes the wall
before pressing Confirm. So:

- Every plan carries `expectedVersion` = `H.position()` at prepare time.
- At execution, if the version matches, apply the plan.
- If it changed, **re-prepare** and compare the normalized params of the new
  plan to the old one. **Any difference invalidates** the preview and requires
  fresh confirmation. Mechanical comparison only — no "materially different"
  judgement calls in a hot path.

## Order of work

Ordered by how many existing clients each unifies, not by tutor need.

### 1. `opening.place` — lands end-to-end before anything else starts

Not the executor plus three stubs. One working command, through pointer input
and through one programmatic call, with the corner double-door bug dead and
pinned by a test.

Targeting rule — this is the whole design decision:

- Interactive caller resolves the wall with the **same single-wall resolver as
  hover** (`hitWall`, the one behind `S.wallProbe`) and passes `wall.id` plus
  the current version. Never the live object — it goes stale across undo, floor
  switches and touch input. Hover preview and commit then agree by construction
  (today the ghost highlights one wall and the click can produce two).
- Programmatic caller MUST pass `params.wallId`. Missing ⇒ `prepare` fails with
  `AMBIGUOUS_TARGET`. No nearest-wall guessing anywhere.
- `prepare()` verifies the wall still exists.
- Before deleting the multi-wall behaviour, check whether any fixture or
  imported plan relies on it (two parallel leaves at one doorway is a plausible
  intent). Then pin the decision in a test either way.

### 2. `wall.draw`

- First parameterize the landing rule:
  `resolveLanding(p, { autoJoin, exclude: [nodeIds] })` — pointer handler passes
  `S.drawFrom`, the command passes its own origin. Pure, testable.
- Then expose node materialization (`getOrMakeNode` / `splitIntersectionWalls`).
  Welding and mid-span splitting already work; do not reimplement them.
- Walls carry a location line (`w.loc`). A segment that ignores it looks joined
  on the plan and is offset in 3D. See `WALL_LOCATION_LINE.md`.

### 3. Registry schema — after two commands, not one and not four

`opening.place` is an outlier: the only one of the four dominated by a host
reference. `wall.draw` takes two points and no host. A schema derived from one
sample overfits to host-attached creation and gets reshaped immediately. With
two real commands, define `js/core/tool_registry.js` with capability classes
(`ui-tool` | `ui-action` | `model-command`) and project the curated
`tool_search` metadata into it. Expand incrementally thereafter.

(The Context Inspector does not need the registry — it reads projected state.
Don't let it drive this timing.)

### 4. `item.place` — unifies six files
### 5. `room.create` — generator and manual drawing

## History wrappers: cloned JSON only

Nothing from the live history instance crosses the boundary — not the `Map` from
`objects()`, not node shapes from `tree()`, not decorated targets. Every wrapper
exported from `history.js` returns cloned plain JSON. Start with:

```js
export function currentHistoryId()      // H.position() — the document version
export function historyTree()           // cloned
export function historyTargets(id)      // cloned
export function historyScope(id)        // cloned array, not a Set
```

## Entity inventory — required, and it is a table, not code

"Everything the app can create" is larger than the four commands. Enumerate
every creatable kind and classify each as exactly one of:

- `implemented command`
- `solver/internal-only`
- `document-level operation`
- `explicit temporary exception` (this is the shrinking allow-list)

At minimum the inventory must cover: walls, nodes, openings, items, rooms,
markers, slab openings, wall constraints, room constraints, plan variables, MEP
nodes and runs, floors, custom model definitions, cabinet presets. Without the
classification, inconvenient entity kinds get omitted instead of the list
shrinking.

Known `solver/internal-only` entries — do not command-ify:

- `constraint_engine.js:116` — solver materializing topology mid-solve
- `ui.js:1086` — snapshot/clone loop

Known `document-level operation` — know it exists, don't touch it now:

- `ui.js:4221` (GeoJSON/CAD import) wholesale-replaces `S.nodes`/`S.walls`/
  `S.openings` AND does `S.items = []; S.markers = []` — it destroys all
  furniture and markers behind a single `pushHistory()`. This is
  `document.import`, it is destructive, it probably needs a confirm when the
  plan is non-empty, and it is a separate later decision. Do not fold it into
  `wall.draw` because walls appear in it.

## Environment and workspace

Pass a domain-discriminated env from commit one — but no fake modeler/cabinet
implementations:

```js
{ domain: "planner", state, history, version, services }
```

Modeler and cabinet supply real adapters later. The discriminant prevents
signature churn without creating unused stubs today.

## Standing rules

- Every NEW creation feature is written command-first. Enforced in review.
- Migrate on touch, narrowly: when you change HOW something is created
  (defaults, placement rules, validity), it becomes a command first. Fixing an
  unrelated crash in the same file does not trigger this.

## Acceptance criteria

- `opening.place` is called by both the pointer handler and a direct
  programmatic call, identical results, exactly one undo step.
- A batch of three commands through `executeTransaction` produces **one** undo
  step and **one** render; a failure in the third leaves the document exactly as
  it was before the first.
- `prepare()` on empty space returns a code (e.g. `NO_HOST_WALL`) that resolves
  to cause + repair text through `diagnostic_help`.
- A plan prepared at version N and executed after an unrelated edit is
  re-prepared, and any normalized-param difference invalidates it.
- `preview()` returns a spec and leaves ALL of these unchanged, asserted:
  history position, selection, active tool, `S.openings.length`,
  `S.walls.length`, `S.items.length`, `S.nodes.length`, and `S.idc`.
  (An entity with no history entry is unreachable by undo; a minted id with no
  entity collides in the saved document months later.)
- A programmatic call without `presentation` leaves selection and active tool
  untouched.
- A conformance test walks the entity inventory, asserts every kind carries one
  of the four classifications, and asserts every command failure code has a
  diagnostic entry.
- **`prepare`, `apply` and the executor are tested in pure Node**
  (`tests/*.test.mjs`) — if those need a browser, the design is wrong. The
  preview renderer and pointer wiring are tested in the browser suite
  (`tests/*.browser.mjs`); that is expected, not a smell.
- `npm run check && npm test` green.

## Do not

- No general command bus or dispatcher — one `executeTransaction`, scoped to
  what `opening.place` needs.
- No broad `interaction.js` refactor.
- No registry or execution allowlist inside `tool_search.js`.
- No parallel guidance UI — `js/planner_tutorial.js` already owns spotlighting;
  read it before adding anything.
- No live objects, Maps, Sets or DOM handles crossing the command boundary.
- `preview()` never writes to history.

## Changes from v1

| v1 | v2 | Why |
|---|---|---|
| `execute()` calls `pushHistory()` | commands never touch history; `executeTransaction` owns it | per-command history makes a 100-command generator run 100 undo steps, and leaves partial state on failure |
| `validate` → `execute` | `prepare` → `preview` → `apply` | separates plan production from mutation, and makes the plan serializable |
| `preview() -> previewHandle` | `preview() -> previewSpec` | a handle drags Three.js and DOM lifetime into the command core |
| effects implicit | `apply()` returns `created`/`changed`/`effects`; presentation opt-in | stops every integration reinventing render/selection, and stops programmatic calls stealing the user's tool |
| targets resolved once | plans carry `expectedVersion`; re-prepare on mismatch | preview-then-confirm can span an undo |
| `params.wall` | `params.wallId` | live refs go stale across undo and floor switches |
| registry after four commands | registry after two | one command overfits the schema; zero is worse |
| "any browser test means the design is wrong" | core is pure-Node; renderer and pointer wiring are browser-tested | the original line was too absolute |
| creation paths listed | entity inventory classified four ways | a plain list lets inconvenient kinds be omitted rather than shrink |
