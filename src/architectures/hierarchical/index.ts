/**
 * Public barrel for the Hierarchical Authority review architecture (RFC-08).
 */
export {
  HierarchicalArchitecture,
  createHierarchicalArchitecture,
} from "./hierarchical-architecture.ts";
export type { HierarchicalArchitectureDependencies } from "./hierarchical-architecture.ts";

export { ManagerAgent } from "./manager-agent.ts";
export type {
  ManagerState,
  ManagerAgentDependencies,
  ManagerRunResult,
} from "./manager-agent.ts";

export { Synthesizer } from "./synthesizer.ts";
export { ConversationHistory } from "./conversation-history.ts";
export { DefaultReviewPlanner } from "./review-plan.ts";
export type { ReviewPlan, IReviewPlanner } from "./review-plan.ts";

export {
  LlmReviewSpecialist,
  parseSpecialistReview,
} from "./specialists/review-specialist.ts";
export type {
  IReviewSpecialist,
  ReviewSpecialistDependencies,
} from "./specialists/review-specialist.ts";
export { BackendReviewer } from "./specialists/backend-reviewer.ts";
export { FrontendReviewer } from "./specialists/frontend-reviewer.ts";
export { DatabaseReviewer } from "./specialists/database-reviewer.ts";

export type { AgentRole, AgentMessageType, AgentMessage } from "./messages.ts";
export type { SpecialistReviewResult } from "./models/specialist-review-result.ts";
export type { HierarchicalReviewResult } from "./models/hierarchical-review-result.ts";
export type { HierarchicalMetrics } from "./models/hierarchical-metrics.ts";
