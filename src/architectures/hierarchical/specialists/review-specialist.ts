/**
 * Re-export of the shared specialist abstractions (extracted in RFC-09).
 * Hierarchical keeps importing from this path for backward compatibility.
 */
export {
  LlmReviewSpecialist,
  parseSpecialistReview,
  toReviewFinding,
} from "../../shared/review-specialist.ts";
export type {
  IReviewSpecialist,
  ReviewSpecialistDependencies,
  SpecialistConfig,
} from "../../shared/review-specialist.ts";
