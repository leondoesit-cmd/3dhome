import { runAgentTurn } from "../agent_runtime.js";
import { deterministicTutorDecision } from "./policy.js";

export function createModelTutorProvider(config, options = {}) {
  return Object.freeze({
    id: "model:" + String(config && config.provider || "unknown"),
    async decide(request = {}) {
      return runAgentTurn(config, request.conversation || [], options);
    },
  });
}

export function createDeterministicTutorProvider(stateProvider) {
  return Object.freeze({
    id: "deterministic",
    async decide(request = {}) {
      var state = typeof stateProvider === "function" ? stateProvider() : request.state || {};
      return { decision: deterministicTutorDecision(request.attention || {}, state), proposal: null };
    },
  });
}

