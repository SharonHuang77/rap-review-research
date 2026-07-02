/**
 * Public barrel for the Agentless review architecture (RFC-04).
 */
export { AgentlessArchitecture } from "./agentless-architecture.ts";
export type { AgentlessArchitectureDependencies } from "./agentless-architecture.ts";
export {
  mapToRawReviewResult,
  AGENTLESS_LLM_CALLS,
} from "./agentless-result-mapper.ts";
