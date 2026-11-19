import { sha256 } from "./sha256.js";
import { replayComponentPatterns } from "./assembly_component_pattern.js";
import { containsAssembly, isSubassembly, subassemblyComponent } from "./assembly_structure.js";
import { compactAssemblyTopologySnapshots, compactDocumentTopologySnapshots } from "./project_topology_budget.js";

// Source records and occurrences are JSON documents. Hash the entire projected
// document, including derived geometry. A false conflict costs a manual refresh;
// ignoring a field here could discard authored data. No mesh is duplicated in
// the persisted baseline, including when an assembly is nested repeatedly.
function revision(document) {
  return Array.from(sha256(JSON.stringify(document)), byte => byte.toString(16).padStart(2, "0")).join("");
}
// Traversal replays pattern copies from the seed. Do the same on disposable
// occurrence wrappers so both sides hash the same geometry. The replay keeps
// per-copy presentation. Invalid patterns drop their generated rows, exactly
// as traversal does, while other valid patterns can still produce theirs.
function replayedPatternCopies(document, failures) {
  if (!Array.isArray(document.components) ||
      (!document.componentPatterns?.length && !document.components.some(c=>c.componentPattern))) return document;
  const copy = {...document, components:document.components.map(c => c.componentPattern ? {...c} : c)};
  const issues = replayComponentPatterns(copy);
  if (failures) for (const issue of issues) failures.add(issue.patternId);
  return copy;
}
function baselineDocument(document, replayed = replayedPatternCopies(document)) {
  if (!Array.isArray(document.components)) return document;
  let result = replayed;
  for (const [index,component] of result.components.entries()) {
    if (!isSubassembly(component)) continue;
    const asm = baselineDocument(component.asm);
    if (asm === component.asm) continue;
    if (result === replayed) result = {...replayed,components:replayed.components.slice()};
    result.components[index] = {...component,asm};
  }
  return result;
}
// Version 1 could fingerprint an updated seed beside a generated row that
// still contained its previous def and link. Traversal then replaced those
// two fields. If the library still holds that row, try reconstructing the
// exact signed snapshot. Keep the local pose, presentation and all other data.
function priorPatternGeometry(document, stored, version) {
  if (!stored?.components) return document;
  const previous = new Map(stored.components.map(c => [c.id,c]));
  const failures = new Set();
  const replayed = replayedPatternCopies(document,failures);
  let components = document.components;
  for (const [index,c] of document.components.entries()) {
    const old = previous.get(c.id);
    let replacement;
    if (isSubassembly(c) && isSubassembly(old) && c.assemblyKey === old.assemblyKey) {
      const asm = priorPatternGeometry(c.asm,old.asm,version);
      if (asm !== c.asm) replacement = {...c,asm};
    } else if (version === 1 && replayed !== document && c.componentPattern && old?.componentPattern &&
        old.componentPattern.patternId === c.componentPattern.patternId && old.componentPattern.seedId === c.componentPattern.seedId) {
      replacement = {...c,def:old.def,libraryLink:old.libraryLink};
    }
    if (replacement) {
      if (components === document.components) components = components.slice();
      components[index] = replacement;
    }
  }
  // Version 2 kept the pre-replay rows when any pattern failed. If traversal
  // already removed them, try just the missing rows of the failing patterns.
  // The caller requires the complete candidate to match the saved fingerprint.
  if (version === 2 && failures.size) {
    const present = new Set(components.map(c=>c.id));
    for (const [index,old] of stored.components.entries()) {
      if (!old.componentPattern || !failures.has(old.componentPattern.patternId) || present.has(old.id)) continue;
      if (components === document.components) components = components.slice();
      components.splice(index,0,old);
      present.add(old.id);
    }
  }
  return components === document.components ? document : {...document,components};
}
function reference(component) {
  return isSubassembly(component) ? {kind:"assembly", key:component.assemblyKey, field:"asm"}
    : {kind:"part", key:component.modelKey, field:"def"};
}
function projection(kind, record) {
  return kind === "assembly" ? subassemblyComponent(compactAssemblyTopologySnapshots(record)).asm
    : compactDocumentTopologySnapshots(record);
}
function occurrenceBaseline(kind, document) {
  return kind === "assembly" ? baselineDocument(document) : document;
}
export function trackLibraryOccurrence(component, record) {
  const {kind,key,field} = reference(component);
  if (!record || record.key !== key || !component[field]) return;
  component.libraryLink = {version:3, kind, key, source:revision(occurrenceBaseline(kind,projection(kind,record))),
    embedded:revision(occurrenceBaseline(kind,component[field]))};
}

// Resolve copies on demand. The raw library record remains the optimistic-save
// baseline. Only an explicit parent Save materializes resolved snapshots on disk.
export function createReferenceResolver(lookup) {
  const sources = new Map();
  function source(kind,key,ancestors) {
    if (kind === "assembly" && ancestors.includes(key)) return {issue:"cycle"};
    const id = kind + ":" + key;
    if (!sources.has(id)) {
      const record = lookup(kind,key);
      if (!record) return {issue:"missing"};
      let document = projection(kind,record);
      let nestedIssue;
      if (kind === "assembly") {
        const result = resolve(document,[...ancestors,key]);
        if (result.issue === "cycle" || document.components.some(child => isSubassembly(child) && containsAssembly(child.asm,key))) return {issue:"cycle"};
        document = replayedPatternCopies(result.document);
        nestedIssue = result.issue;
      }
      const baseline = kind === "assembly" ? baselineDocument(document,document) : document;
      sources.set(id,{document, digest:revision(baseline), nestedIssue});
    }
    const result = sources.get(id);
    if (kind === "assembly" && ancestors.some(parent => containsAssembly(result.document,parent))) return {issue:"cycle"};
    return result;
  }
  function occurrence(component,ancestors,inspectOnly=false) {
    const {kind,key,field} = reference(component);
    if (!key) return {};
    const link = component.libraryLink;
    if (![1,2,3].includes(link?.version) || link.key !== key || link.kind !== kind) {
      return {issue:lookup(kind,key) ? "untracked" : "missing"};
    }
    const latest = source(kind,key,ancestors);
    if (latest.issue) return {issue:latest.issue};
    if (latest.digest === link.source) return {issue:latest.nestedIssue};
    // A configured or flexible instance can require its own exact rebuild.
    // Retain it rather than publishing the source's default geometry for it.
    if (component.configurationId || component.flexibleSpring || component.componentPattern || component.inContext ||
        Object.keys(component.parameterOverrides || {}).length) return {issue:"configured"};
    if (!component[field]) return {issue:"diverged"};
    const baseline = occurrenceBaseline(kind,component[field]);
    // Older links fingerprinted the literal snapshot. Accept that exact match
    // too, then use the normalized fingerprint on the next successful update.
    const normalized = revision(baseline);
    if (normalized !== link.embedded) {
      if (link.version === 3 || baseline === component[field]) return {issue:"diverged"};
      const literal = revision(component[field]);
      if (literal !== link.embedded) {
        // Only reconstruct copies that already agree with replay. Never use
        // an old library row to explain an independently edited live copy.
        if (literal !== normalized || kind !== "assembly") return {issue:"diverged"};
        const prior = priorPatternGeometry(component[field],lookup(kind,key),link.version);
        if (prior === component[field] || revision(prior) !== link.embedded) return {issue:"diverged"};
      }
    }
    if (inspectOnly) return {available:true,issue:latest.nestedIssue};
    return {component:{...component,[field]:structuredClone(latest.document),
      libraryLink:{...link,version:3,source:latest.digest,embedded:latest.digest}},issue:latest.nestedIssue};
  }
  function resolve(document,ancestors = [document.key]) {
    let issue, changed = false;
    const components = (document.components || []).map(component => {
      if (component.componentPattern) return component;
      const result = occurrence(component,ancestors);
      if (result.issue && (!issue || result.issue === "cycle")) issue = result.issue;
      if (!result.component) return component;
      changed = true;
      return result.component;
    });
    return {document:changed ? {...document,components} : document, issue};
  }
  return {resolve,occurrence};
}
