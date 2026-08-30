/* Diagnostic: which saved models lost their feature tree?  READ-ONLY.
 *
 * Paste into the browser console on the origin that serves the planner — the
 * library lives in that origin's IndexedDB, so it must run where your models
 * actually are.
 *
 * BACKGROUND. registerCustomModel() used to rebuild a document's feature tree
 * from its RENDER PARTS on every load, canonical (parametric-v1) documents
 * included. The rebuild can only describe steps that left geometry behind, so a
 * suppressed step, or one past the rollback bar, was erased. saveModel()
 * preserved the tree; the next load flattened it, and re-saving wrote the
 * flattened version back.
 *
 * THE TELL. The rebuild replaces `features` but leaves `history` alone, so a
 * damaged document has history rows pointing at things that no longer exist.
 *
 * A history row is {id, kind, targetId, name, suppressed, status}. The link is
 * targetId, and it addresses a FEATURE or a SKETCH depending on kind — an
 * earlier version of this script compared row.id against feature ids and called
 * every healthy model damaged. Resolve targetId against both tables.
 *
 * A bare count mismatch is not the signal either: a healthy document can hold
 * more features than history rows, because one authored step (a hole) expands
 * into cutter + cut features.
 */
(async function auditModelHistory() {
  const store = await import("/js/core/model_library_store.js");
  const lib = await store.loadModelLibrary([]);
  const rows = (lib || []).map((def) => {
    const features = Array.isArray(def.features) ? def.features : [];
    const sketches = Array.isArray(def.sketches) ? def.sketches : [];
    const history = Array.isArray(def.history) ? def.history : [];
    const known = new Set(
      features.map((f) => f && f.id).concat(sketches.map((s) => s && s.id)).filter(Boolean),
    );
    const orphans = history.filter((h) => {
      const target = h && (h.targetId || h.featureId);
      return target && !known.has(target);
    });
    const authoring = (def.metadata && def.metadata.authoringSystem) || "(unset)";
    return {
      key: def.key,
      name: def.name,
      authoring,
      features: features.length,
      sketches: sketches.length,
      history: history.length,
      lostSteps: orphans.length,
      lostNames: orphans.map((h) => h.name || h.targetId).slice(0, 6),
      parts: (def.parts || []).length,
      // Only canonical documents were meant to own an authored tree; a
      // legacy-adapter document is projected from parts BY DESIGN.
      suspect: authoring === "parametric-v1" && orphans.length > 0,
    };
  });
  const damaged = rows.filter((r) => r.suspect);
  console.table(rows);
  console.log(
    damaged.length
      ? "FLATTENED (" + damaged.length + " of " + rows.length + "): " +
        damaged.map((r) => r.key + " — lost: " + r.lostNames.join(", ")).join(" | ")
      : "No flattened canonical models found (" + rows.length + " checked).",
  );
  return { checked: rows.length, damaged: damaged.length, rows };
})();
