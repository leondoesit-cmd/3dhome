import {replayComponentPatterns} from "./core/assembly_component_pattern.js";
// Topology-aware assembly mates: the public face of the mate system.
//
// A topology reference stores both a persistent feature/topology key and a
// geometric frame fallback. Regeneration first resolves the key; if topology
// naming changes, the frame signature can be used to rebind instead of
// silently mating the wrong face.
//
// The parts live in two modules behind this one: cad_mate_model.js says what
// each kind of mate references and how far it is from being honoured, and
// cad_mate_solver.js solves the whole assembly at once. Editor and tests import
// from here, so neither has to know which of the two a given piece lives in.

import { solveAssemblyMates } from "./cad_mate_solver.js";

export {
  MATE_REQUIREMENT, captureLockPose, frameSignature, mateFrameSupports, mateFramesSupport, mateRequirementFor, planarDirection, topologyReference,
} from "./cad_mate_model.js";
export {rackPinionMateSpec,captureRackPinionZero,rackPinionMeasure} from './cad_rack_pinion_mate.js';
export {rotationLimitMateSpec,captureRotationLimitZero,rotationLimitMeasure} from './cad_rotation_limit_mate.js';

/* Places every component the mates can move, and reports what it could not do.
 *
 *   issues      — mates that could not be applied at all: a component that is
 *                 gone, a reference whose topology no longer resolves, a frame
 *                 that is the wrong shape for the mate asked of it.
 *   rebindings  — references that were found again by their geometry after a
 *                 rebuild renamed the face they named.
 *   unsatisfied — mates that contradict others and lost. The solver re-solves
 *                 without them rather than splitting the difference, so the
 *                 assembly lands where its remaining mates ask.
 *   clusters    — the independently solvable groups, each with the degrees of
 *                 freedom it and its components have left.
 *
 * `options.beforePass` runs once before the solve, for callers that place
 * components of their own first. */
export function solveTopologyMates(assembly, options = {}) {
  const before=replayComponentPatterns(assembly);
  const result=solveAssemblyMates(assembly, options);
  const after=replayComponentPatterns(assembly);
  const issues=before.concat(after).filter((issue,index,list)=>list.findIndex(other=>other.patternId===issue.patternId && other.message===issue.message)===index);
  result.issues.push(...issues);
  if(issues.length)result.ok=false;
  return result;
}
