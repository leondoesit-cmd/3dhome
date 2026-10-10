# Dependency highlight presentation for the unified tree

The production FeatureManager creates `.md-tree-row` records with `data-history-target`. Its real hover/focus handler already assigns focus, upstream, downstream and unrelated/dim classes. The four existing CSS rules only matched the older `.md-parametric-node` renderer, so genuine dependency roles could be present without their intended visible colors or dimming.

The four selector groups now also match `.md-tree-row`. Existing legacy selectors, warning focus color, blue upstream color, purple downstream color and unrelated opacity are retained. No history, source references, CAD, hover logic or native geometry is changed.

Two focused regressions PASS. They execute production row class generation and dependency-class application against unified rows, match the shipped CSS selectors to those resulting classes, verify distinct focus/upstream/downstream styles and unrelated dimming, clear all roles, and compare legacy role declarations. Owned diff check is clean. Full gates PASS: no free identifiers, 686 linked modules and 1487 source assertions; log `scratch/dependency-tree-presentation-check-2026-10-11.log`.

Actual Chrome hover/focus acceptance is pending. Parent will use Saved `cm_mv2xaz0p`, hover Boss2, inspect genuine source-derived roles and visible presentation, then move away and verify clearing. The exact source/PID plan is `ch4-dependency-hover-browser-ready-plan-2026-10-11.md`. Scope is part-history role visualization, not SOLIDWORKS reference arrows or assembly/mate visualization.
