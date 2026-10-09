# Unmated assembly Save mobility status — 2026-10-09

## Confirmed cause and repair

The native mate solver reports freedom for mate-connected clusters. With zero mates, its successful result contains an empty cluster list and a zero sum even when components are ungrounded. `saveAssemblyDocument` calls `applyAssemblyMates`; the prior UI report accepted this as a checked whole-assembly zero.

`js/core/assembly_mobility_status.js` now requires every active ungrounded top-level occurrence to appear in the returned cluster coverage before publishing a whole-assembly mobility count. An unmated or partially covered assembly therefore shows **Mobility not checked**. Fully grounded assemblies retain valid checked zero, and complete native cluster coverage retains the reported count. Suppressed occurrences do not require coverage. Nested rigid subassemblies are counted as their top-level occurrences, matching the solver's scope.

The solver, component poses, mate data, save format and modeler handlers are unchanged. This repair does not invent an analytical 48-DOF result; the solver's empty-cluster total remains insufficient evidence for whole-assembly mobility.

## Regression evidence

```powershell
node --test tests/assembly_mobility_status.test.mjs tests/mate_value_keyboard.test.mjs tests/mate_mechanics.test.mjs
```

**12/12 passed**, including two new tests. The actual Save-handler regression uses nine occurrences, one grounded and eight free, and no mates. It invokes the real native solver and actual `saveAssemblyDocument`/`applyAssemblyMates`/status functions, checks unknown mobility before and after Save, preserves the normalized occurrence poses and mate arrays in the saved clone, and repeats the report after JSON cold reopen. Grounding all nine produces a legitimate checked zero. The second test distinguishes partial coverage, complete coverage, missing coverage and suppressed occurrences.

```powershell
npm run check
git diff --check -- js/core/assembly_mobility_status.js tests/assembly_mobility_status.test.mjs
```

Both commands passed: no free identifiers; no link errors across **650 modules**; **1489 source assertions** checked, with none satisfied only by comments. Whitespace validation reported only normal LF-to-CRLF warnings. No full-suite rerun was performed. Cold Chrome acceptance remains parent-owned; no browser storage or authored geometry was changed by this agent.
