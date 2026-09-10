# ModelForge: Simple Floor Planning with Deeper Tools on Demand

## 1. Direction and verified starting point

Build one continuous experience for recreating a property, redesigning it, planning something new, or experimenting. Beginners can place rooms and furniture immediately; users who want more can reveal exact dimensions, constraints, shape editing, and design alternatives in the same interface.

**Correction to the earlier review:** the third plan already phased its larger features. Chamfers, fillets, editable corner treatments, room docking, rectangular resizing, and neighbor protection already exist. The 21 targeted corner-treatment and neighbor tests passed. The guided rectangular experience is primarily integration work; generalized shape stamping, reliable fit-to-contents, and global corridor routing remain substantial additions.

Preserve the existing local-first architecture, wall graph, command/history system, furniture catalog, imports, and synchronized 3D view. Do not replace the application or introduce a second geometry model.

## 2. User experience: start quickly, reveal detail gradually

### Starting a project

Keep existing Open, Import, and Resume actions. Offer three plain-language starting choices:

| Choice | Immediate next action | Default behavior |
|---|---|---|
| **Recreate my home** | Import a reference plan or draw from measurements | Capture existing geometry; assistance initially changes furniture only |
| **Design a new home** | Place the first room or request a draft | Use optional room requirements and boundaries |
| **Just explore** | Open a blank canvas, with an example available | No required targets or project questions |

Property type, room counts, area targets, units, and floor count live in an optional **Project details** panel. They remain editable later. Property type changes suggestions without hiding room types or tools.

For reference images, guide the user through setting scale from one known distance. Label the reference unscaled until calibrated; imported or estimated geometry remains editable.

### One panel, three levels of detail

Use a persistent side panel on desktop and a collapsible bottom sheet on mobile. Do not build a second modal questionnaire.

- **Default:** room name/type, visible dimensions, Add furniture, Explore layout.
- **More details:** openings, finishes, shape dimensions, clearance preferences, fixed items.
- **Advanced:** wall construction, reference lines, constraints, editable boundaries, and existing CAD tools.

Remember expanded sections locally. Opening advanced controls does not change the document or switch editing modes.

Keep Undo, Redo, selection, and navigation consistently available. Show one contextual hint at a time, dismissible and recoverable through Help. Use labels and symbols alongside colors.

### A room checklist, not a mandatory sequence

An optional **Rooms wanted** list shows unplaced and placed entries. Users can add, rename, retype, reorder, skip, or revisit any entry.

- Selecting an unplaced room arms its placement preview.
- Selecting a placed room focuses it.
- Existing rooms can be assigned to checklist entries without duplicating geometry.
- Counts use explicit room types; localized real-estate summaries are presentation only.
- A detached room is ordinary geometry marked unconnected. Distinguish it from a checklist entry that has not been drawn.

Keep suggested next actions contextual: **Add another room**, **Furnish this room**, or **Review plan**. None is a prerequisite for continuing.

### Direct editing versus generated changes

Direct actions commit when the user completes the gesture: dropping a room, placing a door, or entering a dimension. Do not ask for confirmation after an already visible placement preview.

Generated alternatives use **Preview → Apply / Discard**. Show one recommended option first, with **More options** available. Apply is one undo step.

Closing guidance preserves committed work. Pending previews disappear without changing the plan.

### Recreating and redesigning an existing property

During capture, allow measurement corrections without repeatedly asking to unlock elements.

**Start redesign** saves a named baseline and protects captured walls and openings from generated structural changes. Furniture remains editable. An advanced **Allow changes here** action lets users include selected walls or rooms in a proposal.

Preserve the baseline independently from subsequent edits and ordinary undo history. Comparing with it must not overwrite the working plan.

## 3. Planning and assistance behavior

### Rooms, walls, and openings

Keep wall-chain drawing, rectangular drag creation, preset placement, and docking as the foundation.

Add L/T/U presets and closed polygon drawing through one validated boundary-insertion operation. Do not assemble shapes by leaving internal seams between independent rectangle stamps.

- Show live interior dimensions and area.
- Allow exact numeric entry without requiring grid alignment.
- Keep the current 5 cm default grid; unit display changes do not change stored coordinates or existing snap settings.
- Separate grid snapping, magnetic attraction, and geometric welding tolerances.
- Use clear previews for adjoining, leaving a corridor, and inserting into an existing room. Merging rooms requires choosing the merge action.
- Preserve one shared wall between adjacent rooms. Sharing does not automatically alter thickness, material, or structural meaning.
- Wall type may be selected before drawing. Openings require an existing host wall.
- Validate opening width, station, end margins, height, and overlap before commit. Preserve valid hosted objects through wall edits; reject or preview changes that would invalidate them.

Room dimensions default to usable interior measurements. Advanced controls expose wall-axis measurements and reference-line settings explicitly.

Manual edits may exceed advisory room-size or clearance preferences—for example, while recording a small existing room. Invalid topology and contradictory hard locks cannot commit.

Reuse existing chamfer and rounded-corner tools under **Edit shape**. General polygon creation starts with straight edges; existing curved geometry remains supported by current tools.

### Area and project checks

Display separate measurements:

- **Usable indoor area:** enclosed interior floor area, excluding wall solids and voids.
- **Enclosed footprint:** indoor regions plus their enclosing wall solids, counted once.
- **Outdoor area:** separately identified balcony, terrace, or site regions.
- **Unconnected rooms:** reported separately when their inclusion in the property is unresolved.

Do not label these GFA/GIA or another formal measurement standard without implementing its definition.

Compare targets only with matching measurements. Default targets to advisory. Unknown boundaries or incomplete geometry produce **Not yet measurable**, not a misleading zero or passing result.

Show room-count progress and important issues in a compact project summary. Detailed checks open on demand. Saving and exporting remain available for incomplete plans.

### Explore layout: useful assistance without surprise edits

The room panel offers:

1. **Check fit** — furniture overlap, door swings, access zones, and usable routes.
2. **Suggest furniture** — furnish the current room using selected required and optional items.
3. **Rearrange my furniture** — reposition existing unlocked items.
4. **Suggest room size** — preview structural changes within the selected editable scope.

Use stable room-type IDs for furnishing behavior. Display names remain freely editable.

Treat physical footprints, operating zones, and access zones separately. Clearances use configurable item-specific design preferences, not one universal distance.

Suggestions must preserve required furniture, fixed items, protected geometry, and hard dimensions. Rank feasible results by access, usefulness, and amount of change. Do not silently shrink items, discard required pieces, or move walls to make a suggestion succeed.

Start resizing assistance with rectangular rooms and selected movable edges. A proposal affecting a shared wall must include all affected rooms. Irregular rooms initially receive fit checks and manual editing; later shape-aware proposals can extend this safely.

When no option fits, explain the specific reason and offer relevant actions such as choosing a smaller wardrobe or allowing a particular wall to move. Do not automatically relax the requirement.

### Generate a draft

Make this an optional action for new designs and experimentation.

Adapt the existing generator behind the same proposal system. Pass explicit room requirements, fixed dimensions, and any building boundary. Existing packing heuristics may produce candidates, but must not silently stretch locked dimensions or claim targets were met without validation.

Show the resulting rooms, areas, and unmet preferences before applying. Generating into a nonempty project creates an alternative preview; replacement of existing content must be explicit.

### Review access and suggest circulation

Separate **door connectivity** from **physical walkability**.

- Build a graph of rooms joined by doors or passages.
- Let users designate the actual entrance; in an apartment, it may lead to a shared hall.
- Check usable routes around furniture and through openings.
- Recognize open-plan circulation without requiring an enclosed corridor.
- Treat missing doors or incomplete connections as actionable findings, not automatic construction instructions.

Reuse local corridor docking for the existing gap-between-rooms case.

Global corridor suggestions require a defined permitted area. Route through unallocated space using deterministic orthogonal pathfinding, accounting for clear width and proposed wall thickness. Reuse existing circulation and prefer shorter routes with fewer turns.

Convert candidates into validated wall/opening commands. Check turns, junctions, and approaches against final geometry. One proposal may connect several rooms; some layouts may have no feasible solution.

Initial global routing does not carve through existing rooms. It explains when room changes would be needed.

Windows and new entrances are optional proposals. Known exposure, existing openings, and user decisions constrain suggestions. Never recreate an opening the user previously rejected without an explicit new request.

## 4. Architecture and document contracts

### One authoritative wall graph

Retain nodes, walls, hosted openings, and furniture as the model. Rooms remain derived faces.

Respect the existing distinction between stored wall reference lines and material centerlines. Reuse wall geometry services for offsets, openings, measurements, and 3D.

Generalize rectangle insertion into a closed-loop service with shared endpoint resolution, intersection splitting, and coincident-segment reuse. Validate the complete result before committing.

Every compound operation declares affected entities. Geometry and metadata outside that scope remain unchanged, allowing harmless edge subdivision that preserves the actual boundary.

### Thin guidance controller

Implement one UI-independent controller for:

- Project intention and room checklist.
- Current selection and suggested next action.
- Proposal requests and analysis results.
- Reconciliation after manual edits, undo/redo, imports, and floor changes.

The document remains authoritative. Guidance must not maintain an independent copy of placed rooms.

Run expensive candidate generation against immutable snapshots in a cancellable worker. Use the existing document-version mechanism; reject stale proposals before applying them.

All new mutations use existing command transactions with complete rollback. Extend older helpers through adapters or shared services rather than calling uncontrolled live-state mutations from previews.

### Identity, shape metadata, and persistence

Reuse existing stable room `hid` values. Reconcile requirements and checklist assignments through those identities rather than changing wall-list keys.

For geometry-preserving edits, preserve identity. For splits and merges, preserve the existing primary-room behavior and record the relationship to new or absorbed rooms; surface conflicting semantic assignments in the operation preview.

Add shape descriptors only for recognized authored shapes. They store parameters and references to corresponding boundaries, not a second authoritative polygon. Revalidate after edits; incompatible edits convert the room to custom geometry through the same undoable operation.

Persist project details, checklist assignments, baseline references, protection settings, and shape metadata through native JSON, autosave/recovery, floor snapshots, and synchronization. Keep selection, panel expansion, and proposal previews outside shared document state.

New fields require versioned loading and compatible defaults for older projects. New project intentions never silently lock an older document.

### Export and compatibility

- **JSON:** complete editable document and new metadata.
- **SVG:** scaled drawing with correct wall/opening appearance, labels, dimensions, and optional furniture.
- **DXF:** documented units and layers, including closed room boundaries and opening geometry.
- **IFC:** retain existing functionality without claiming complete BIM interoperability; a validated spatial/geometry exporter is a separate future deliverable.

Preserve existing multi-floor tools. New assistance initially operates on the active floor; project summaries can aggregate defined measurements across floors. Cross-floor circulation is outside the initial implementation.

## 5. Delivery and acceptance

### Delivery sequence

| Stage | Working outcome |
|---|---|
| **1 — Simple guided editing** | Three starting intentions, optional panel/checklist, capture calibration, redesign baseline, room-type furnishing integration, reliable rectangle/opening commands, correctly defined measurements |
| **2 — Room assistance** | Fit checks, furniture and rearrangement proposals, reviewed rectangular resizing, optional generated drafts |
| **3 — Richer shapes** | L/T/U and closed-loop stamps, typed shape parameters, integration of existing corner tools, safe fallback after manual edits |
| **4 — Property review** | Connectivity and walkability analysis, bounded corridor proposals, exposure-aware opening suggestions, expanded SVG/DXF export |

Ship each stage with functional controls only. Keep existing advanced tools reachable throughout. Freehand rectification, a second UI renderer, formal regulatory checks, challenge scoring, and full IFC are not prerequisites.

### Acceptance scenarios

- **Beginner:** create and furnish a room without completing project details or encountering duplicate naming dialogs; add another room and undo each action independently.
- **Existing property:** calibrate a plan, enter non-grid measurements, preserve a baseline, and rearrange furniture without changing captured walls or openings.
- **Advanced user:** enter exact dimensions, edit wall reference lines, use corner tools, and expand editable scope without leaving the current workflow.
- **Topology:** adjoining rooms, partial shared edges, T-junctions, concave boundaries, opening-bearing walls, rejected overlaps, and unchanged neighbors.
- **Assistance:** pinned items, inaccessible wardrobes, blocked door swings, impossible furniture requirements, locked boundaries, cancellation, and stale proposals.
- **Circulation:** shared-hall entrances, open-plan routes, detached rooms, narrow turns, multi-room fixes, and infeasible routing.
- **Persistence:** old files, checklist reconciliation, shape invalidation, room splits/merges, floor switching, autosave recovery, and synchronization.
- **Usability:** desktop, keyboard-only, touch, Hebrew/RTL, and a 390 px mobile viewport; no reliance on hover or color alone.
- **Performance:** keep pointer interaction responsive during analysis; cancel superseded work and apply only results matching the current document.
- **Verification:** run repository checks and relevant unit/browser suites, inspect SVG/DXF in independent viewers, and verify synchronized 3D in a real GPU-backed browser.

Success means a novice can make visible progress immediately, while precision and assistance remain available exactly where a more demanding user needs them.
